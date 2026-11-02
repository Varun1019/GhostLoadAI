import os
import uuid
import datetime
import json
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from app.database import get_db, Base, engine
from app.models import User, Product, SellerProfile, Certificate, Order, Reservation, Review, AuditLog
from app.repository import Repository
from app.optimizer import (
    SellerCandidate,
    solve_recovery_plan,
)
from app.llm_adapter import parse_disruption_text, generate_plan_explanation
from app.seed import run_seed

Base.metadata.create_all(bind=engine)

app = FastAPI(title="GhostLoad AI Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- SCHEMAS -----------------
class LoginRequest(BaseModel):
    token: Optional[str] = None
    demo_user_id: Optional[str] = None
    role: Optional[str] = None

class ProfileUpdateRequest(BaseModel):
    role: Optional[str] = None
    company_name: Optional[str] = None
    city: Optional[str] = None
    industry: Optional[str] = None
    gst_number: Optional[str] = None

class ListingCreateRequest(BaseModel):
    title: str
    category: str
    listing_type: str = "PRODUCT_STOCK" # PRODUCT_STOCK, PRODUCTION_CAPACITY, WAREHOUSE_SPACE, TRANSPORT
    specs: Dict[str, Any] = {}
    units_available: int
    price_per_unit: float
    lead_days: int
    min_order: int = 1
    city: str
    cert_name: Optional[str] = "ISO 9001:2015"
    cert_expiry_days: Optional[int] = 180

class OrderResponseRequest(BaseModel):
    action: str # ACCEPT, DECLINE, SHIP, DELIVER

class ReservationResponseRequest(BaseModel):
    action: str # ACCEPT, DECLINE

class OrderCreateRequest(BaseModel):
    product_id: str
    quantity: int

class DeliveryInspectionRequest(BaseModel):
    received_qty: int
    defect_qty: int
    notes: Optional[str] = ""

class ReviewCreateRequest(BaseModel):
    rating: Optional[int] = 5
    quality_rating: Optional[int] = None
    delivery_rating: Optional[int] = None
    tags: Optional[List[str]] = []
    comment: Optional[str] = ""

class ReviewResponseRequest(BaseModel):
    response: str

class DisruptionRecoveryRequest(BaseModel):
    item_category: str
    required_units: int
    deadline_days: int
    buyer_city: str
    min_trust_score: float = 70.0
    zero_transit: bool = False
    scenario_cost_multiplier: Optional[Dict[str, float]] = None
    scenario_transit_delay: Optional[Dict[str, int]] = None
    excluded_seller_ids: Optional[List[str]] = None

class DisruptionTextRequest(BaseModel):
    text: str

class PlanApprovalRequest(BaseModel):
    plan_type: str
    allocations: List[Dict[str, Any]]
    reason: str
    approved: bool

# Auth Helper
def get_current_user(
    authorization: Optional[str] = Header(None),
    x_demo_user: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    repo = Repository(db)
    user_id = None

    if x_demo_user:
        user_id = x_demo_user
    elif authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        if token.startswith("demo:"):
            user_id = token.replace("demo:", "")
        else:
            user_id = token

    if user_id:
        user = repo.get_user_by_id(user_id)
        if user:
            return user

    demo_mode = os.getenv("DEMO_MODE", "true").lower() == "true"
    if demo_mode:
        return repo.get_user_by_id("buyer-1")
    return None

# ----------------- BASE ROUTES -----------------
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "GhostLoad AI Engine",
        "demo_mode": os.getenv("DEMO_MODE", "true").lower() == "true",
        "sap_genai_hub": "adapter ready, not connected" if not os.getenv("AICORE_CLIENT_ID") else "connected",
        "database": "sqlite_repository_active"
    }

@app.get("/api/auth/demo-users")
def get_demo_users(db: Session = Depends(get_db)):
    return [
        {
            "id": "buyer-1",
            "name": "Apex Mobility Tech",
            "email": "apex.mobility@demo.in",
            "role": "BUYER",
            "city": "Bengaluru",
            "company_name": "Apex Mobility Tech Ltd",
            "badge": "Demo Buyer"
        },
        {
            "id": "seller-factory-a",
            "name": "Factory A (Precision Dynamics)",
            "email": "factory.a@demo.in",
            "role": "SELLER",
            "city": "Bengaluru",
            "company_name": "Precision Dynamics Foundry",
            "badge": "Demo Seller"
        },
        {
            "id": "qc-inspector-1",
            "name": "Sunil Sharma",
            "email": "qc.inspector@demo.in",
            "role": "QC_INSPECTOR",
            "city": "Bengaluru",
            "company_name": "Automotive Standards Bureau",
            "badge": "QC Inspector"
        }
    ]

@app.post("/api/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    repo = Repository(db)
    user_id = req.demo_user_id or "buyer-1"
    user = repo.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if req.role and req.role != user.role:
        user = repo.create_or_update_user(user.id, user.email, user.name, role=req.role)

    return {
        "token": f"demo:{user.id}",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "company_name": user.company_name,
            "city": user.city,
            "industry": user.industry,
            "gst_number": user.gst_number,
            "is_onboarded": user.is_onboarded,
        }
    }

@app.get("/api/auth/me")
def get_me(current_user: Optional[User] = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "company_name": current_user.company_name,
        "city": current_user.city,
        "industry": current_user.industry,
        "gst_number": current_user.gst_number,
        "is_onboarded": current_user.is_onboarded,
    }

@app.put("/api/auth/profile")
def update_profile(
    req: ProfileUpdateRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    repo = Repository(db)
    updated = repo.create_or_update_user(
        user_id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=req.role or current_user.role,
        company_name=req.company_name if req.company_name is not None else current_user.company_name,
        city=req.city if req.city is not None else current_user.city,
        industry=req.industry if req.industry is not None else current_user.industry,
        gst_number=req.gst_number if req.gst_number is not None else current_user.gst_number,
        is_onboarded=True,
    )
    repo.log_action(
        actor=updated.name,
        action="PROFILE_UPDATED",
        input_summary=f"Role: {updated.role}, City: {updated.city}, Company: {updated.company_name}",
        decision="SUCCESS",
        reason="User updated settings profile",
    )
    return {
        "id": updated.id,
        "email": updated.email,
        "name": updated.name,
        "role": updated.role,
        "company_name": updated.company_name,
        "city": updated.city,
        "industry": updated.industry,
        "gst_number": updated.gst_number,
        "is_onboarded": updated.is_onboarded,
    }

@app.post("/api/seed/reset")
def reset_seed():
    run_seed()
    return {"status": "success", "message": "Database reset to hypothetical baseline state."}

# ----------------- PHASE 2: SELLER SIDE -----------------
@app.get("/api/seller/dashboard")
def get_seller_dashboard(
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # If not a seller, allow view if demo fallback
    seller_id = current_user.id if current_user.role == "SELLER" else "seller-factory-a"
    repo = Repository(db)
    repo.cleanup_expired_reservations()

    seller = repo.get_user_by_id(seller_id)
    prof = repo.ensure_seller_profile(seller_id)
    certs = repo.get_seller_certificates(seller_id)
    listings = repo.get_products(seller_id=seller_id)
    
    orders = db.query(Order).filter(Order.seller_id == seller_id).order_by(Order.placed_at.desc()).all()
    reservations = db.query(Reservation).filter(Reservation.seller_id == seller_id).order_by(Reservation.created_at.desc()).all()

    # Tips to improve score based on breakdown
    tips = []
    if prof.cert_verified_rate < 1.0:
        tips.append("Upload accredited ISO 9001 or IATF 16949 certification to boost cert score (+30%).")
    if prof.defect_rate > 0.01:
        tips.append("Implement pre-shipment quality batch checks to decrease defect rate below 1.0% (+20%).")
    if prof.on_time_rate < 0.95:
        tips.append("Buffer dispatch times by +12 hours to maintain ≥98% on-time delivery metric (+25%).")
    if prof.response_time_hours > 2.0:
        tips.append("Enable instant SMS/Webhook notifications to respond within 2 hours (+10%).")
    if not tips:
        tips.append("Outstanding performance: Seller qualifies for Top-Tier QC Verified Gold status.")

    # Badges calculation
    now = datetime.datetime.utcnow()
    expiring_certs = [c for c in certs if 0 < (c.expiry_date - now).days <= 30]
    approved_certs = [c for c in certs if c.status == "APPROVED" and c.expiry_date > now]

    badges = []
    if len(approved_certs) > 0 and prof.trust_score >= 80.0:
        badges.append({"name": "QC Verified", "type": "qc_verified", "color": "emerald"})
    if prof.total_orders < 5:
        badges.append({"name": "New Seller", "type": "new_seller", "color": "blue"})
    if len(expiring_certs) > 0:
        badges.append({"name": "Certificate Expiring (<30d)", "type": "expiring", "color": "amber"})

    return {
        "seller_name": seller.name,
        "company_name": seller.company_name,
        "city": seller.city,
        "trust_score": prof.trust_score,
        "avg_quality_rating": round(getattr(prof, "avg_quality_rating", 4.8), 2),
        "avg_delivery_rating": round(getattr(prof, "avg_delivery_rating", 4.7), 2),
        "ratings_count": getattr(prof, "ratings_count", 1),
        "breakdown": {
            "cert_verified_rate": round(prof.cert_verified_rate * 100, 1),
            "on_time_rate": round(prof.on_time_rate * 100, 1),
            "raw_on_time_rate": round(getattr(prof, "raw_on_time_rate", 0.95) * 100, 1),
            "defect_rate": round(prof.defect_rate * 100, 2),
            "avg_rating": round(prof.avg_rating, 2),
            "avg_quality_rating": round(getattr(prof, "avg_quality_rating", 4.8), 2),
            "avg_delivery_rating": round(getattr(prof, "avg_delivery_rating", 4.7), 2),
            "response_time_hours": prof.response_time_hours,
        },
        "formula": "Trust Score = (30% Certs) + (25% On-Time: 70% dates + 30% delivery rating) + (20% Defect) + (15% Quality Rating) + (10% Response)",
        "badges": badges,
        "tips": tips,
        "counts": {
            "active_listings": len(listings),
            "incoming_orders": len([o for o in orders if o.status == "PLACED"]),
            "pending_reservations": len([r for r in reservations if r.status == "PENDING"]),
            "total_orders": prof.total_orders,
        }
    }

@app.get("/api/seller/listings")
def get_seller_listings(
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    seller_id = current_user.id if current_user and current_user.role == "SELLER" else "seller-factory-a"
    repo = Repository(db)
    products = repo.get_products(seller_id=seller_id)
    
    res = []
    for p in products:
        specs = json.loads(p.specs_json) if p.specs_json else {}
        res.append({
            "id": p.id,
            "title": p.title,
            "category": p.category,
            "listing_type": p.listing_type,
            "specs": specs,
            "units_available": p.units_available,
            "reserved_units": p.reserved_units,
            "net_available": max(0, p.units_available - p.reserved_units),
            "price_per_unit": p.price_per_unit,
            "lead_days": p.lead_days,
            "min_order": p.min_order,
            "city": p.city,
            "created_at": p.created_at.isoformat(),
        })
    return res

@app.post("/api/seller/listings")
def create_listing(
    req: ListingCreateRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    seller_id = current_user.id if current_user and current_user.role == "SELLER" else "seller-factory-a"
    repo = Repository(db)
    
    prod_id = f"prod-{uuid.uuid4().hex[:8]}"
    product = Product(
        id=prod_id,
        seller_id=seller_id,
        title=req.title,
        category=req.category,
        specs_json=json.dumps(req.specs),
        listing_type=req.listing_type,
        units_available=req.units_available,
        reserved_units=0,
        price_per_unit=req.price_per_unit,
        lead_days=req.lead_days,
        min_order=req.min_order,
        city=req.city,
        image_url=f"/parts/{req.category.lower().replace(' ', '_')}.svg",
    )
    repo.save_product(product)

    # If certificate attached, add it
    if req.cert_name:
        now = datetime.datetime.utcnow()
        cert = Certificate(
            id=f"cert-{uuid.uuid4().hex[:8]}",
            seller_id=seller_id,
            cert_name=req.cert_name,
            issuer="TUV Rheinland / BIS",
            cert_number=f"CERT-{req.city[:3].upper()}-{uuid.uuid4().hex[:4].upper()}",
            issue_date=now,
            expiry_date=now + datetime.timedelta(days=req.cert_expiry_days or 180),
            status="APPROVED",
        )
        db.add(cert)
        db.commit()

    repo.log_action(
        actor=current_user.name if current_user else "Seller",
        action="LISTING_CREATED",
        input_summary=f"Title: {req.title}, Qty: {req.units_available}, Price: ₹{req.price_per_unit}",
        output_summary=f"Product ID: {prod_id} published successfully",
        decision="PUBLISHED",
        reason="Seller catalog updated",
    )

    return {"status": "success", "product_id": prod_id}

@app.put("/api/seller/listings/{product_id}")
def update_listing(
    product_id: str,
    req: ListingCreateRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    repo = Repository(db)
    product = repo.get_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.title = req.title
    product.category = req.category
    product.listing_type = req.listing_type
    product.specs_json = json.dumps(req.specs)
    product.units_available = req.units_available
    product.price_per_unit = req.price_per_unit
    product.lead_days = req.lead_days
    product.min_order = req.min_order
    product.city = req.city
    db.commit()

    return {"status": "success", "message": "Listing updated"}

@app.get("/api/seller/orders")
def get_seller_orders(
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    seller_id = current_user.id if current_user and current_user.role == "SELLER" else "seller-factory-a"
    orders = db.query(Order).filter(Order.seller_id == seller_id).order_by(Order.placed_at.desc()).all()
    
    out = []
    for o in orders:
        product = db.query(Product).filter(Product.id == o.product_id).first()
        buyer = db.query(User).filter(User.id == o.buyer_id).first()
        out.append({
            "id": o.id,
            "po_number": o.po_number,
            "buyer_name": buyer.name if buyer else "Buyer",
            "buyer_company": buyer.company_name if buyer else "",
            "product_title": product.title if product else "Part",
            "quantity": o.quantity,
            "unit_price": o.unit_price,
            "total_price": o.total_price,
            "status": o.status,
            "placed_at": o.placed_at.isoformat(),
            "expected_delivery_date": o.expected_delivery_date.isoformat() if o.expected_delivery_date else None,
            "received_qty": o.received_qty,
            "defect_qty": o.defect_qty,
        })
    return out

@app.post("/api/seller/orders/{order_id}/status")
def update_seller_order_status(
    order_id: str,
    req: OrderResponseRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    repo = Repository(db)
    status_map = {
        "ACCEPT": "ACCEPTED",
        "DECLINE": "DECLINED",
        "SHIP": "SHIPPED",
        "DELIVER": "DELIVERED",
    }
    new_status = status_map.get(req.action.upper(), req.action.upper())
    order = repo.update_order_status(order_id, new_status)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    repo.log_action(
        actor=current_user.name if current_user else "Seller",
        action="ORDER_STATUS_CHANGE",
        input_summary=f"PO: {order.po_number}, Action: {req.action}",
        output_summary=f"Order status transitioned to {new_status}",
        decision=new_status,
        reason=f"Seller executed {req.action} on order",
    )
    return {"status": "success", "order_id": order.id, "new_status": new_status}

@app.get("/api/seller/reservations")
def get_seller_reservations(
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    seller_id = current_user.id if current_user and current_user.role == "SELLER" else "seller-factory-a"
    repo = Repository(db)
    repo.cleanup_expired_reservations()

    reservations = db.query(Reservation).filter(Reservation.seller_id == seller_id).order_by(Reservation.created_at.desc()).all()
    out = []
    now = datetime.datetime.utcnow()
    for r in reservations:
        prod = repo.get_product_by_id(r.product_id)
        buyer = repo.get_user_by_id(r.buyer_id)
        hours_remaining = max(0.0, round((r.expires_at - now).total_seconds() / 3600.0, 1))
        out.append({
            "id": r.id,
            "plan_id": r.plan_id,
            "buyer_name": buyer.name if buyer else "Emergency Buyer",
            "buyer_city": buyer.city if buyer else "Bengaluru",
            "product_title": prod.title if prod else "Emergency Supply Allocation",
            "quantity": r.quantity,
            "status": r.status,
            "hours_remaining": hours_remaining,
            "expires_at": r.expires_at.isoformat(),
            "created_at": r.created_at.isoformat(),
        })
    return out

@app.post("/api/seller/reservations/{res_id}/respond")
def respond_reservation(
    res_id: str,
    req: ReservationResponseRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    repo = Repository(db)
    accept = (req.action.upper() == "ACCEPT")
    res = repo.respond_to_reservation(res_id, accept=accept)
    if not res:
        raise HTTPException(status_code=404, detail="Reservation not found")

    decision = "ACCEPTED" if accept else "DECLINED"
    repo.log_action(
        actor=current_user.name if current_user else "Seller",
        action="RESERVATION_RESPONSE",
        input_summary=f"Reservation ID: {res.id}, Plan: {res.plan_id}, Qty: {res.quantity}",
        output_summary=f"Status: {decision}. Capacity {'permanently allocated' if accept else 'released back to inventory'}.",
        decision=decision,
        reason=f"Seller manually responded {decision} to 24h capacity lock.",
    )

    return {
        "status": "success",
        "reservation_id": res.id,
        "decision": decision,
        "recalculation_triggered": not accept, # Declining triggers recalculation
    }

# ----------------- PHASE 3: BUYER MARKETPLACE -----------------
@app.get("/api/products")
def list_products(
    category: Optional[str] = None,
    city: Optional[str] = None,
    query: Optional[str] = None,
    sort_by: Optional[str] = "best_match", # best_match, price, fastest, trust
    buyer_city: Optional[str] = "Bengaluru",
    min_trust: Optional[float] = None,
    cert_verified_only: Optional[bool] = False,
    db: Session = Depends(get_db)
):
    repo = Repository(db)
    raw_products = repo.get_products(
        category=category,
        city=city,
        query=query,
        min_trust=min_trust
    )

    now = datetime.datetime.utcnow()
    results = []
    for p in raw_products:
        seller = repo.get_user_by_id(p.seller_id)
        prof = repo.ensure_seller_profile(p.seller_id)
        certs = repo.get_seller_certificates(p.seller_id)
        valid_certs = [c for c in certs if c.status == "APPROVED" and c.expiry_date > now]
        expiring_certs = [c for c in certs if 0 < (c.expiry_date - now).days <= 30]

        if cert_verified_only and len(valid_certs) == 0:
            continue

        # Transit calculator to buyer city
        from app.optimizer import get_transit_info
        transit_days, transit_cost = get_transit_info(p.city, buyer_city or "Bengaluru")
        total_lead_days = p.lead_days + transit_days
        total_delivered_cost = p.price_per_unit + transit_cost

        # Badges
        badges = []
        if len(valid_certs) > 0 and prof.trust_score >= 80.0:
            badges.append("QC Verified")
        if prof.total_orders < 5:
            badges.append("New Seller")
        if len(expiring_certs) > 0:
            badges.append("Certificate Expiring")

        # Best Match Scoring: Weighted formula
        # Lower price is better, lower lead is better, higher trust is better, higher stock is better
        # Normalize roughly:
        norm_price = max(0.1, 1000.0 / (p.price_per_unit + 10.0))
        norm_speed = max(0.1, 10.0 / (total_lead_days + 1.0))
        norm_trust = prof.trust_score / 100.0
        norm_stock = min(1.0, p.units_available / 500.0)
        best_match_score = (0.35 * norm_trust) + (0.30 * norm_speed) + (0.25 * norm_price) + (0.10 * norm_stock)

        specs = json.loads(p.specs_json) if p.specs_json else {}

        results.append({
            "id": p.id,
            "title": p.title,
            "category": p.category,
            "listing_type": p.listing_type,
            "specs": specs,
            "units_available": p.units_available,
            "price_per_unit": p.price_per_unit,
            "lead_days": p.lead_days,
            "transit_days": transit_days,
            "total_lead_days": total_lead_days,
            "transit_cost_per_unit": transit_cost,
            "total_delivered_cost": total_delivered_cost,
            "min_order": p.min_order,
            "city": p.city,
            "image_url": p.image_url,
            "seller_id": p.seller_id,
            "seller_name": seller.name if seller else "Seller",
            "trust_score": prof.trust_score,
            "avg_rating": prof.avg_rating,
            "avg_quality_rating": round(getattr(prof, "avg_quality_rating", 4.8), 1),
            "avg_delivery_rating": round(getattr(prof, "avg_delivery_rating", 4.7), 1),
            "ratings_count": getattr(prof, "ratings_count", 1),
            "total_orders": prof.total_orders,
            "badges": badges,
            "best_match_score": round(best_match_score, 3),
        })

    # Sorting
    if sort_by == "price":
        results.sort(key=lambda x: x["total_delivered_cost"])
    elif sort_by == "fastest":
        results.sort(key=lambda x: x["total_lead_days"])
    elif sort_by == "trust":
        results.sort(key=lambda x: -x["trust_score"])
    else:  # best_match
        results.sort(key=lambda x: -x["best_match_score"])

    # Add tags to top results
    if results:
        results[0]["is_top_match"] = True
        results[0]["recommendation_tag"] = "Best Match"
        results[0]["why_recommended"] = f"Top-ranked combination of {results[0]['trust_score']}% Trust Score, {results[0]['total_lead_days']}d delivery to {buyer_city}, and verified stock."

    return results

@app.get("/api/products/{product_id}")
def get_product_details(
    product_id: str,
    buyer_city: Optional[str] = "Bengaluru",
    db: Session = Depends(get_db)
):
    repo = Repository(db)
    p = repo.get_product_by_id(product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    seller = repo.get_user_by_id(p.seller_id)
    prof = repo.ensure_seller_profile(p.seller_id)
    certs = repo.get_seller_certificates(p.seller_id)
    reviews = db.query(Review).filter(Review.seller_id == p.seller_id).order_by(Review.created_at.desc()).all()

    now = datetime.datetime.utcnow()
    from app.optimizer import get_transit_info
    transit_days, transit_cost = get_transit_info(p.city, buyer_city or "Bengaluru")

    rev_list = []
    for r in reviews:
        buyer = repo.get_user_by_id(r.buyer_id)
        tag_list = [t.strip() for t in r.tags.split(",") if t.strip()] if getattr(r, "tags", None) else []
        rev_list.append({
            "id": r.id,
            "buyer_name": buyer.name if buyer else "Verified Enterprise Buyer",
            "rating": r.rating,
            "quality_rating": getattr(r, "quality_rating", r.rating) or r.rating,
            "delivery_rating": getattr(r, "delivery_rating", 5) or 5,
            "tags": tag_list,
            "is_verified_purchase": getattr(r, "is_verified_purchase", True),
            "qc_flagged": getattr(r, "qc_flagged", False),
            "comment": r.comment,
            "seller_response": r.seller_response,
            "responded_at": r.responded_at.isoformat() if r.responded_at else None,
            "created_at": r.created_at.isoformat(),
        })

    cert_list = []
    for c in certs:
        cert_list.append({
            "name": c.cert_name,
            "issuer": c.issuer,
            "number": c.cert_number,
            "status": c.status,
            "expires_in_days": (c.expiry_date - now).days,
            "is_valid": c.status == "APPROVED" and c.expiry_date > now,
        })

    specs = json.loads(p.specs_json) if p.specs_json else {}

    return {
        "id": p.id,
        "title": p.title,
        "category": p.category,
        "listing_type": p.listing_type,
        "specs": specs,
        "units_available": p.units_available,
        "price_per_unit": p.price_per_unit,
        "lead_days": p.lead_days,
        "transit_days": transit_days,
        "total_lead_days": p.lead_days + transit_days,
        "transit_cost": transit_cost,
        "min_order": p.min_order,
        "city": p.city,
        "avg_quality_rating": round(getattr(prof, "avg_quality_rating", 4.8), 1),
        "avg_delivery_rating": round(getattr(prof, "avg_delivery_rating", 4.7), 1),
        "ratings_count": getattr(prof, "ratings_count", len(reviews) or 1),
        "seller": {
            "id": seller.id,
            "name": seller.name,
            "company_name": seller.company_name,
            "city": seller.city,
            "trust_score": prof.trust_score,
            "avg_quality_rating": round(getattr(prof, "avg_quality_rating", 4.8), 1),
            "avg_delivery_rating": round(getattr(prof, "avg_delivery_rating", 4.7), 1),
            "ratings_count": getattr(prof, "ratings_count", len(reviews) or 1),
            "breakdown": {
                "cert_verified_rate": round(prof.cert_verified_rate * 100, 1),
                "on_time_rate": round(prof.on_time_rate * 100, 1),
                "raw_on_time_rate": round(getattr(prof, "raw_on_time_rate", 0.95) * 100, 1),
                "defect_rate": round(prof.defect_rate * 100, 2),
                "avg_rating": round(prof.avg_rating, 2),
                "avg_quality_rating": round(getattr(prof, "avg_quality_rating", 4.8), 2),
                "avg_delivery_rating": round(getattr(prof, "avg_delivery_rating", 4.7), 2),
                "response_time_hours": prof.response_time_hours,
            },
            "formula": "Trust Score = (30% Certs) + (25% On-Time: 70% dates + 30% delivery rating) + (20% Low Defect) + (15% Quality Rating) + (10% Response)",
        },
        "certificates": cert_list,
        "reviews": rev_list,
    }

@app.post("/api/orders/place")
def place_order(
    req: OrderCreateRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    buyer_id = current_user.id if current_user else "buyer-1"
    repo = Repository(db)
    product = repo.get_product_by_id(req.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    order = repo.create_order(
        buyer_id=buyer_id,
        seller_id=product.seller_id,
        product_id=product.id,
        quantity=req.quantity
    )

    repo.log_action(
        actor=current_user.name if current_user else "Buyer",
        action="ORDER_PLACED",
        input_summary=f"PO: {order.po_number}, Product: {product.title}, Qty: {order.quantity}",
        output_summary=f"Total: ₹{order.total_price:,.2f}, Status: PLACED",
        decision="PLACED",
        reason="Purchase order initiated via B2B marketplace",
    )

    return {
        "status": "success",
        "po_number": order.po_number,
        "order_id": order.id,
        "total_price": order.total_price,
    }

@app.get("/api/buyer/orders")
def get_buyer_orders(
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    buyer_id = current_user.id if current_user else "buyer-1"
    orders = db.query(Order).filter(Order.buyer_id == buyer_id).order_by(Order.placed_at.desc()).all()
    repo = Repository(db)
    
    out = []
    for o in orders:
        product = repo.get_product_by_id(o.product_id)
        seller = repo.get_user_by_id(o.seller_id)
        has_review = db.query(Review).filter(Review.order_id == o.id).first() is not None
        out.append({
            "id": o.id,
            "po_number": o.po_number,
            "product_id": o.product_id,
            "product_title": product.title if product else "Parts Order",
            "seller_name": seller.name if seller else "Seller",
            "seller_city": seller.city if seller else "",
            "quantity": o.quantity,
            "unit_price": o.unit_price,
            "total_price": o.total_price,
            "status": o.status,
            "placed_at": o.placed_at.isoformat(),
            "expected_delivery_date": o.expected_delivery_date.isoformat() if o.expected_delivery_date else None,
            "received_qty": o.received_qty,
            "defect_qty": o.defect_qty,
            "inspection_notes": o.inspection_notes,
            "has_review": has_review,
        })
    return out

@app.post("/api/orders/{order_id}/inspect")
def inspect_order(
    order_id: str,
    req: DeliveryInspectionRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    repo = Repository(db)
    order = repo.inspect_order_delivery(
        order_id=order_id,
        received_qty=req.received_qty,
        defect_qty=req.defect_qty,
        inspection_notes=req.notes or "",
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    repo.log_action(
        actor=current_user.name if current_user else "Buyer QC Receiving",
        action="GOODS_RECEIPT_INSPECTION",
        input_summary=f"PO: {order.po_number}, Received: {req.received_qty}, Defective: {req.defect_qty}",
        output_summary=f"Order marked DELIVERED. Seller defect & on-time scores automatically updated.",
        decision="ACCEPTED_WITH_INSPECTION",
        reason=req.notes or "Goods-receipt inspection completed",
    )

    return {"status": "success", "order_id": order.id, "status_text": order.status}

@app.post("/api/orders/{order_id}/review")
def add_order_review(
    order_id: str,
    req: ReviewCreateRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    repo = Repository(db)
    buyer_id = current_user.id if current_user else "buyer-1"
    
    q_rating = req.quality_rating if req.quality_rating is not None else (req.rating or 5)
    d_rating = req.delivery_rating if req.delivery_rating is not None else 5
    tag_str = ", ".join(req.tags) if req.tags else ""

    try:
        rev = repo.create_review(
            order_id=order_id,
            buyer_id=buyer_id,
            quality_rating=q_rating,
            delivery_rating=d_rating,
            tags=tag_str,
            comment=req.comment or ""
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Audit log entry for rating submission
    repo.log_action(
        actor=current_user.name if current_user else "Buyer",
        action="ORDER_RATING_SUBMITTED",
        input_summary=f"PO: {order_id}, Quality: {q_rating}★, Delivery: {d_rating}★, Tags: [{tag_str}]",
        output_summary=f"Seller Trust Score recalculated. Quality (15%) and Delivery (blended 25%) updated.",
        decision="RATING_RECORDED",
        reason=req.comment or "Post-delivery verified purchase rating",
    )

    # QC Flag if rating <= 2
    if q_rating <= 2 or d_rating <= 2:
        repo.log_action(
            actor="GhostLoad QC Guardian",
            action="LOW_RATING_QC_FLAG",
            input_summary=f"Order: {order_id}, Seller: {rev.seller_id}, Quality: {q_rating}★, Delivery: {d_rating}★",
            output_summary="Flagged order added to QC Inspector review queue due to low score (<= 2 stars)",
            decision="FLAGGED_FOR_INSPECTION",
            reason=f"Buyer submitted low score: Quality={q_rating}★, Delivery={d_rating}★. Requires inspector review.",
        )

    return {"status": "success", "review_id": rev.id, "qc_flagged": rev.qc_flagged}

@app.post("/api/reviews/{review_id}/respond")
def respond_review_dispute(
    review_id: str,
    req: ReviewResponseRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    repo = Repository(db)
    seller_id = current_user.id if current_user and current_user.role == "SELLER" else "seller-factory-a"
    rev = repo.add_seller_review_response(review_id, seller_id, req.response)
    if not rev:
        raise HTTPException(status_code=404, detail="Review not found or unauthorized")

    repo.log_action(
        actor=current_user.name if current_user else "Seller",
        action="SELLER_RATING_REPLY",
        input_summary=f"Review ID: {review_id}",
        output_summary="Seller response published to verified rating thread",
        decision="RESPONSE_RECORDED",
        reason=req.response,
    )
    return {"status": "success", "review_id": rev.id}

# ----------------- PHASE 4: QC INSPECTOR -----------------
@app.get("/api/qc/flagged-orders")
def get_qc_flagged_orders(db: Session = Depends(get_db)):
    repo = Repository(db)
    flagged = repo.get_flagged_reviews()
    out = []
    for r in flagged:
        order = db.query(Order).filter(Order.id == r.order_id).first()
        seller = repo.get_user_by_id(r.seller_id)
        buyer = repo.get_user_by_id(r.buyer_id)
        tag_list = [t.strip() for t in r.tags.split(",") if t.strip()] if getattr(r, "tags", None) else []
        out.append({
            "id": r.id,
            "order_id": r.order_id,
            "po_number": order.po_number if order else r.order_id,
            "seller_id": r.seller_id,
            "seller_name": seller.name if seller else "Seller",
            "seller_city": seller.city if seller else "",
            "buyer_id": r.buyer_id,
            "buyer_name": buyer.name if buyer else "Buyer",
            "quality_rating": getattr(r, "quality_rating", r.rating) or r.rating,
            "delivery_rating": getattr(r, "delivery_rating", 5) or 5,
            "tags": tag_list,
            "comment": r.comment,
            "seller_response": r.seller_response,
            "qc_status": getattr(r, "qc_status", "PENDING_REVIEW"),
            "qc_notes": getattr(r, "qc_notes", ""),
            "created_at": r.created_at.isoformat() if r.created_at else "",
        })
    return out

@app.post("/api/qc/flagged-orders/{review_id}/resolve")
def resolve_qc_flagged_order(
    review_id: str,
    action: Optional[str] = "RESOLVED",
    notes: Optional[str] = "",
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    repo = Repository(db)
    rev = repo.resolve_qc_flag(review_id, notes=notes or "", status=action or "RESOLVED")
    if not rev:
        raise HTTPException(status_code=404, detail="Flagged review not found")

    repo.log_action(
        actor=current_user.name if current_user else "QC Inspector",
        action="QC_FLAGGED_ORDER_REVIEWED",
        input_summary=f"Review ID: {review_id}, Order: {rev.order_id}, Action: {action}",
        output_summary=f"Inspector resolved flagged quality alert. Status: {action}",
        decision=action or "RESOLVED",
        reason=notes or "Inspector investigation completed",
    )
    return {"status": "success", "review_id": rev.id, "qc_status": rev.qc_status}
@app.get("/api/qc/certificates")
def get_qc_certificates(db: Session = Depends(get_db)):
    certs = db.query(Certificate).order_by(Certificate.created_at.desc()).all()
    repo = Repository(db)
    out = []
    for c in certs:
        seller = repo.get_user_by_id(c.seller_id)
        prof = repo.ensure_seller_profile(c.seller_id)
        out.append({
            "id": c.id,
            "seller_id": c.seller_id,
            "seller_name": seller.name if seller else "Seller",
            "seller_city": seller.city if seller else "",
            "cert_name": c.cert_name,
            "issuer": c.issuer,
            "cert_number": c.cert_number,
            "issue_date": c.issue_date.isoformat(),
            "expiry_date": c.expiry_date.isoformat(),
            "status": c.status,
            "rejection_reason": c.rejection_reason,
            "seller_trust_score": prof.trust_score,
        })
    return out

@app.post("/api/qc/certificates/{cert_id}/verify")
def verify_certificate(
    cert_id: str,
    action: str, # APPROVE or REJECT
    reason: Optional[str] = "",
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    repo = Repository(db)
    status = "APPROVED" if action.upper() == "APPROVE" else "REJECTED"
    cert = repo.update_certificate_status(cert_id, status, reason or "")
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")

    repo.log_action(
        actor=current_user.name if current_user else "QC Inspector",
        action="CERTIFICATE_VERIFICATION",
        input_summary=f"Cert ID: {cert_id}, Seller: {cert.seller_id}, Action: {status}",
        output_summary=f"Status set to {status}. Seller trust score recalculated.",
        decision=status,
        reason=reason or f"Inspector manual review completed: {status}",
    )
    return {"status": "success", "cert_id": cert.id, "status": status}

# ----------------- PHASE 5: GHOSTLOAD EMERGENCY RECOVERY -----------------
@app.post("/api/emergency/parse")
def parse_disruption(req: DisruptionTextRequest):
    """Sensing Agent: uses LLM adapter with regex/canned fallback."""
    extracted = parse_disruption_text(req.text)
    return {
        "status": "success",
        "agent": "Sensing Agent",
        "data": extracted,
        "llm_provider": "SAP Generative AI Hub (fallback canned ready)",
    }

@app.post("/api/emergency/solve")
def solve_emergency_recovery(
    req: DisruptionRecoveryRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    repo = Repository(db)
    repo.cleanup_expired_reservations()

    # Step 1: Discovery Agent filters candidate products & sellers
    raw_products = repo.get_products()
    candidates: List[SellerCandidate] = []
    
    now = datetime.datetime.utcnow()
    excluded = set(req.excluded_seller_ids or [])

    for p in raw_products:
        if p.seller_id in excluded:
            continue
        # Available units net of pending reservations
        net_units = max(0, p.units_available - p.reserved_units)
        if net_units <= 0:
            continue

        seller = repo.get_user_by_id(p.seller_id)
        prof = repo.ensure_seller_profile(p.seller_id)
        certs = repo.get_seller_certificates(p.seller_id)
        valid_certs = [c for c in certs if c.status == "APPROVED" and c.expiry_date > now]
        has_cert = len(valid_certs) > 0

        # Check spec match
        category_match = (
            req.item_category.lower() in p.category.lower() or 
            req.item_category.lower() in p.title.lower() or
            "brake" in p.category.lower() # Default demo category
        )

        candidates.append(
            SellerCandidate(
                id=p.seller_id,
                name=seller.company_name or seller.name if seller else p.title,
                available_units=net_units,
                unit_price=p.price_per_unit,
                lead_days=p.lead_days,
                city=p.city,
                trust_score=prof.trust_score,
                has_valid_cert=has_cert,
                spec_match=category_match,
            )
        )

    # Step 2: OR-Tools solver
    plans = solve_recovery_plan(
        demand=req.required_units,
        deadline_days=req.deadline_days,
        buyer_city=req.buyer_city,
        candidates=candidates,
        min_trust=req.min_trust_score,
        zero_transit=req.zero_transit,
        scenario_cost_multiplier=req.scenario_cost_multiplier or {},
        scenario_transit_delay=req.scenario_transit_delay or {},
    )

    # Step 3: LLM Explanations for each plan
    result_plans = {}
    for p_type, plan in plans.items():
        summary_dict = {
            "total_units_allocated": plan.total_units_allocated,
            "shortfall": plan.shortfall,
            "total_cost": plan.total_cost,
            "max_arrival_day": plan.max_arrival_day,
            "allocations": [
                {
                    "seller_id": a.seller_id,
                    "seller_name": a.seller_name,
                    "city": a.city,
                    "units_allocated": a.units_allocated,
                    "unit_price": a.unit_price,
                    "transit_cost_per_unit": a.transit_cost_per_unit,
                    "lead_days": a.lead_days,
                    "transit_days": a.transit_days,
                    "arrival_day": a.arrival_day,
                    "total_cost": a.total_cost,
                    "trust_score": a.trust_score,
                }
                for a in plan.allocations
            ]
        }
        explanation = generate_plan_explanation(p_type, summary_dict)
        result_plans[p_type] = {
            "plan_type": p_type,
            "is_feasible": plan.is_feasible,
            "total_units_allocated": plan.total_units_allocated,
            "shortfall": plan.shortfall,
            "total_cost": plan.total_cost,
            "max_arrival_day": plan.max_arrival_day,
            "avg_trust_score": plan.avg_trust_score,
            "allocations": summary_dict["allocations"],
            "explanation": explanation,
        }

    # Step 4: Compliance flags for each candidate
    compliance_report = []
    for c in candidates:
        flags = []
        if not c.has_valid_cert:
            flags.append("Expired / Missing Certificate")
        if c.trust_score < req.min_trust_score:
            flags.append(f"Trust Score {c.trust_score} below cutoff {req.min_trust_score}")
        if not c.spec_match:
            flags.append("Spec mismatch")
        compliance_report.append({
            "seller_id": c.id,
            "seller_name": c.name,
            "city": c.city,
            "status": "PASS" if not flags else "FLAGGED",
            "flags": flags,
            "trust_score": c.trust_score,
        })

    repo.log_action(
        actor="OR-Tools Solver Agent",
        action="EMERGENCY_SOLVE_RUN",
        input_summary=f"Demand: {req.required_units}, Deadline: {req.deadline_days}d, City: {req.buyer_city}",
        output_summary=f"Solved 3 plans. Balanced cost: ₹{result_plans['Balanced']['total_cost']:,.2f}, Shortfall: {result_plans['Balanced']['shortfall']}",
        decision="FEASIBLE" if result_plans['Balanced']['is_feasible'] else "SHORTFALL_REPORTED",
        reason="Multi-agent capacity synthesis executed",
    )

    return {
        "status": "success",
        "plans": result_plans,
        "compliance": compliance_report,
        "recommended_plan": "Balanced",
        "baseline_comparison": {
            "single_supplier_cost": (req.required_units * 140.0), # Hypothetical single supplier premium
            "single_supplier_days": req.deadline_days + 4,
            "days_saved": 4,
            "cost_avoided": round((req.required_units * 140.0) - result_plans["Balanced"]["total_cost"], 2),
            "label": "Estimated from hypothetical benchmark data",
        }
    }

@app.post("/api/emergency/approve")
def approve_emergency_plan(
    req: PlanApprovalRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    repo = Repository(db)
    buyer_id = current_user.id if current_user else "buyer-1"

    if not req.approved:
        repo.log_action(
            actor=current_user.name if current_user else "Human Operator",
            action="EMERGENCY_PLAN_REJECTED",
            input_summary=f"Plan: {req.plan_type}",
            output_summary="Plan rejected by operator. No reservations created.",
            decision="REJECTED",
            reason=req.reason,
        )
        return {"status": "success", "message": "Plan rejected"}

    # Human approved: create 24-hour reservation requests
    plan_id = f"plan-{uuid.uuid4().hex[:6]}"
    created_reservations = []

    for alloc in req.allocations:
        seller_id = alloc.get("seller_id")
        qty = alloc.get("units_allocated", 0)
        if qty <= 0:
            continue
        
        # Find matching product for this seller
        prod = db.query(Product).filter(Product.seller_id == seller_id).first()
        if prod:
            res = repo.create_reservation(
                buyer_id=buyer_id,
                seller_id=seller_id,
                product_id=prod.id,
                quantity=qty,
                hold_hours=24,
                plan_id=plan_id
            )
            if res:
                created_reservations.append(res.id)

    repo.log_action(
        actor=current_user.name if current_user else "Human Operator",
        action="EMERGENCY_PLAN_APPROVED",
        input_summary=f"Plan: {req.plan_type}, Allocations: {len(req.allocations)} sellers",
        output_summary=f"Plan ID: {plan_id}. Created {len(created_reservations)} reservation requests holding capacity for 24h.",
        decision="APPROVED",
        reason=req.reason,
    )

    return {
        "status": "success",
        "plan_id": plan_id,
        "reservation_ids": created_reservations,
        "message": "Human approval verified. 24-hour capacity reservation requests dispatched to sellers."
    }

# ----------------- PHASE 6: AUDIT LOGS -----------------
@app.get("/api/audit/logs")
def get_audit_logs(limit: int = 100, db: Session = Depends(get_db)):
    repo = Repository(db)
    logs = repo.get_audit_logs(limit=limit)
    out = []
    for l in logs:
        out.append({
            "id": l.id,
            "timestamp": l.timestamp.isoformat(),
            "actor": l.actor,
            "action": l.action,
            "input_summary": l.input_summary,
            "output_summary": l.output_summary,
            "decision": l.decision,
            "reason": l.reason,
        })
    return out

@app.get("/api/audit/export-csv")
def export_audit_csv(db: Session = Depends(get_db)):
    from fastapi.responses import PlainTextResponse
    repo = Repository(db)
    logs = repo.get_audit_logs(limit=500)
    
    rows = ["ID,Timestamp,Actor,Action,Decision,Input,Output,Reason"]
    for l in logs:
        # Escape quotes
        esc = lambda x: f'"{str(x).replace(chr(34), chr(34)+chr(34))}"' if x else '""'
        rows.append(f"{l.id},{l.timestamp.isoformat()},{esc(l.actor)},{esc(l.action)},{esc(l.decision)},{esc(l.input_summary)},{esc(l.output_summary)},{esc(l.reason)}")

    csv_data = "\n".join(rows)
    return PlainTextResponse(content=csv_data, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=ghostload_audit_log.csv"})
