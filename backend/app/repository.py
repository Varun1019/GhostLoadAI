import datetime
import uuid
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc
from app.models import (
    User,
    SellerProfile,
    Certificate,
    Product,
    Order,
    Review,
    Reservation,
    AuditLog,
)

class Repository:
    def __init__(self, db: Session):
        self.db = db

    # ------------------ USERS ------------------
    def get_user_by_id(self, user_id: str) -> Optional[User]:
        return self.db.query(User).filter(User.id == user_id).first()

    def get_user_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()

    def create_or_update_user(
        self,
        user_id: str,
        email: str,
        name: str,
        role: str = "BUYER",
        company_name: str = "",
        city: str = "Bengaluru",
        industry: str = "Automotive Parts & Assemblies",
        gst_number: str = "",
        is_onboarded: bool = True
    ) -> User:
        user = self.get_user_by_id(user_id)
        if not user:
            user = User(
                id=user_id,
                email=email,
                name=name,
                role=role,
                company_name=company_name,
                city=city,
                industry=industry,
                gst_number=gst_number,
                is_onboarded=is_onboarded,
            )
            self.db.add(user)
        else:
            if role:
                user.role = role
            if name:
                user.name = name
            if company_name is not None:
                user.company_name = company_name
            if city is not None:
                user.city = city
            if industry is not None:
                user.industry = industry
            if gst_number is not None:
                user.gst_number = gst_number
            user.is_onboarded = is_onboarded

        self.db.commit()
        self.db.refresh(user)

        # Ensure seller profile exists if seller
        if user.role == "SELLER":
            self.ensure_seller_profile(user.id)

        return user

    def ensure_seller_profile(self, seller_id: str) -> SellerProfile:
        prof = self.db.query(SellerProfile).filter(SellerProfile.seller_id == seller_id).first()
        if not prof:
            prof = SellerProfile(
                seller_id=seller_id,
                trust_score=85.0,
                cert_verified_rate=1.0,
                on_time_rate=0.96,
                defect_rate=0.015,
                avg_rating=4.7,
                response_time_hours=2.0,
                total_orders=15,
                response_count=15,
            )
            self.db.add(prof)
            self.db.commit()
            self.db.refresh(prof)
        return prof

    # ------------------ CERTIFICATES & TRUST ------------------
    def recalculate_seller_trust_score(self, seller_id: str) -> float:
        """
        Trust score components (0 to 100):
        30% certificates verified (valid, non-expired approved cert)
        25% on-time delivery rate (blended: 70% actual delivery dates + 30% buyer delivery experience rating)
        20% defect rate (lower is better: 1.0 - (defect_rate * 5))
        15% verified quality rating (avg_quality_rating / 5)
        10% response time (max 24h: 1.0 - (response_hours / 24))
        Score = 100 * (0.30*cert + 0.25*blended_ontime + 0.20*(1-defect) + 0.15*(quality/5) + 0.10*resp)
        """
        prof = self.ensure_seller_profile(seller_id)
        
        # Check active certificates
        now = datetime.datetime.utcnow()
        certs = self.db.query(Certificate).filter(
            Certificate.seller_id == seller_id,
            Certificate.status == "APPROVED"
        ).all()
        
        valid_certs = [c for c in certs if c.expiry_date > now]
        cert_score = 1.0 if len(valid_certs) > 0 else 0.0
        prof.cert_verified_rate = cert_score

        # Delivery component (25%):
        # 70% actual on-time rate from dates, 30% average buyer delivery rating (normalized from 1-5 to 0-1)
        delivery_rating = getattr(prof, "avg_delivery_rating", 4.7) or 4.7
        delivery_rating_norm = max(0.0, min(1.0, delivery_rating / 5.0))
        raw_ontime = getattr(prof, "raw_on_time_rate", 0.95) or 0.95
        blended_ontime = round((0.70 * raw_ontime) + (0.30 * delivery_rating_norm), 4)
        prof.on_time_rate = blended_ontime

        # Defect component: capped between 0 and 1
        defect_comp = max(0.0, min(1.0, 1.0 - (prof.defect_rate * 5.0))) # scaled sensitivity
        
        # Quality rating component (15%):
        quality_rating = getattr(prof, "avg_quality_rating", prof.avg_rating) or 4.5
        prof.avg_rating = quality_rating
        rating_comp = min(1.0, max(0.0, quality_rating / 5.0))
        
        # Response time component (10%):
        resp_comp = max(0.0, min(1.0, 1.0 - (prof.response_time_hours / 24.0)))

        score = (
            0.30 * prof.cert_verified_rate +
            0.25 * prof.on_time_rate +
            0.20 * defect_comp +
            0.15 * rating_comp +
            0.10 * resp_comp
        ) * 100.0

        prof.trust_score = round(max(0.0, min(100.0, score)), 1)
        self.db.commit()
        self.db.refresh(prof)
        return prof.trust_score

    def get_seller_certificates(self, seller_id: str) -> List[Certificate]:
        return self.db.query(Certificate).filter(Certificate.seller_id == seller_id).all()

    def get_pending_certificates(self) -> List[Certificate]:
        return self.db.query(Certificate).filter(Certificate.status == "PENDING").all()

    def update_certificate_status(self, cert_id: str, status: str, reason: str = "") -> Optional[Certificate]:
        cert = self.db.query(Certificate).filter(Certificate.id == cert_id).first()
        if cert:
            cert.status = status
            cert.rejection_reason = reason
            self.db.commit()
            self.db.refresh(cert)
            self.recalculate_seller_trust_score(cert.seller_id)
        return cert

    # ------------------ PRODUCTS / LISTINGS ------------------
    def get_products(
        self,
        category: Optional[str] = None,
        city: Optional[str] = None,
        query: Optional[str] = None,
        seller_id: Optional[str] = None,
        min_trust: Optional[float] = None,
        max_lead_days: Optional[int] = None,
        max_price: Optional[float] = None
    ) -> List[Product]:
        # Release expired reservations first so available units are accurate
        self.cleanup_expired_reservations()

        q = self.db.query(Product).join(User, Product.seller_id == User.id)
        if seller_id:
            q = q.filter(Product.seller_id == seller_id)
        if category:
            q = q.filter(Product.category == category)
        if city:
            q = q.filter(Product.city == city)
        if query:
            like_pat = f"%{query}%"
            q = q.filter(or_(Product.title.ilike(like_pat), Product.category.ilike(like_pat)))
        if max_lead_days is not None:
            q = q.filter(Product.lead_days <= max_lead_days)
        if max_price is not None:
            q = q.filter(Product.price_per_unit <= max_price)

        products = q.all()

        if min_trust is not None:
            filtered = []
            for p in products:
                prof = self.ensure_seller_profile(p.seller_id)
                if prof.trust_score >= min_trust:
                    filtered.append(p)
            return filtered

        return products

    def get_product_by_id(self, product_id: str) -> Optional[Product]:
        self.cleanup_expired_reservations()
        return self.db.query(Product).filter(Product.id == product_id).first()

    def save_product(self, product: Product) -> Product:
        self.db.add(product)
        self.db.commit()
        self.db.refresh(product)
        return product

    # ------------------ RESERVATIONS (24h Lock) ------------------
    def cleanup_expired_reservations(self):
        """Release expired reservations back to available stock."""
        now = datetime.datetime.utcnow()
        expired = self.db.query(Reservation).filter(
            Reservation.status == "PENDING",
            Reservation.expires_at <= now
        ).all()
        for res in expired:
            res.status = "EXPIRED"
            product = self.db.query(Product).filter(Product.id == res.product_id).first()
            if product:
                product.reserved_units = max(0, product.reserved_units - res.quantity)
        if expired:
            self.db.commit()

    def create_reservation(
        self,
        buyer_id: str,
        seller_id: str,
        product_id: str,
        quantity: int,
        hold_hours: int = 24,
        plan_id: Optional[str] = None
    ) -> Optional[Reservation]:
        self.cleanup_expired_reservations()
        product = self.get_product_by_id(product_id)
        if not product:
            return None

        # Check effective available capacity
        net_available = product.units_available - product.reserved_units
        if net_available < quantity:
            return None  # Cannot double-book

        # Hold capacity
        product.reserved_units += quantity
        res = Reservation(
            id=f"res-{uuid.uuid4().hex[:8]}",
            plan_id=plan_id,
            seller_id=seller_id,
            product_id=product_id,
            buyer_id=buyer_id,
            quantity=quantity,
            status="PENDING",
            expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=hold_hours),
        )
        self.db.add(res)
        self.db.commit()
        self.db.refresh(res)
        return res

    def respond_to_reservation(self, res_id: str, accept: bool) -> Optional[Reservation]:
        res = self.db.query(Reservation).filter(Reservation.id == res_id).first()
        if not res:
            return None

        product = self.get_product_by_id(res.product_id)
        if accept:
            res.status = "ACCEPTED"
            # Permanently consume stock
            if product:
                product.units_available = max(0, product.units_available - res.quantity)
                product.reserved_units = max(0, product.reserved_units - res.quantity)
        else:
            res.status = "DECLINED"
            # Release hold
            if product:
                product.reserved_units = max(0, product.reserved_units - res.quantity)

        self.db.commit()
        self.db.refresh(res)
        return res

    # ------------------ ORDERS & INSPECTIONS ------------------
    def create_order(
        self,
        buyer_id: str,
        seller_id: str,
        product_id: str,
        quantity: int
    ) -> Order:
        product = self.get_product_by_id(product_id)
        if not product:
            raise ValueError("Product not found")

        total_price = quantity * product.price_per_unit
        po_num = f"PO-{datetime.datetime.utcnow().strftime('%y%m%d')}-{uuid.uuid4().hex[:4].upper()}"

        order = Order(
            id=f"ord-{uuid.uuid4().hex[:8]}",
            po_number=po_num,
            buyer_id=buyer_id,
            seller_id=seller_id,
            product_id=product_id,
            quantity=quantity,
            unit_price=product.price_per_unit,
            total_price=total_price,
            status="PLACED",
            expected_delivery_date=datetime.datetime.utcnow() + datetime.timedelta(days=product.lead_days),
        )
        # Deduct immediate available stock
        product.units_available = max(0, product.units_available - quantity)

        self.db.add(order)
        self.db.commit()
        self.db.refresh(order)
        return order

    def update_order_status(self, order_id: str, status: str) -> Optional[Order]:
        order = self.db.query(Order).filter(Order.id == order_id).first()
        if not order:
            return None
        order.status = status
        if status == "DELIVERED" and not order.actual_delivery_date:
            order.actual_delivery_date = datetime.datetime.utcnow()
        self.db.commit()
        self.db.refresh(order)
        return order

    def inspect_order_delivery(
        self,
        order_id: str,
        received_qty: int,
        defect_qty: int,
        inspection_notes: str = ""
    ) -> Optional[Order]:
        """
        Goods-receipt inspection:
        Updates order, marks DELIVERED, and updates seller's defect rate and on-time rate.
        """
        order = self.db.query(Order).filter(Order.id == order_id).first()
        if not order:
            return None

        order.status = "DELIVERED"
        order.received_qty = received_qty
        order.defect_qty = defect_qty
        order.inspection_notes = inspection_notes
        order.inspected_at = datetime.datetime.utcnow()
        if not order.actual_delivery_date:
            order.actual_delivery_date = datetime.datetime.utcnow()

        self.db.commit()

        # Update seller stats
        prof = self.ensure_seller_profile(order.seller_id)
        prof.total_orders += 1
        
        # Calculate new defect rate
        if received_qty > 0:
            order_defect_ratio = defect_qty / float(received_qty)
            # Exponential moving average / cumulative update
            prof.defect_rate = round((prof.defect_rate * 0.7) + (order_defect_ratio * 0.3), 4)

        # Calculate on-time
        if order.expected_delivery_date:
            is_on_time = order.actual_delivery_date <= (order.expected_delivery_date + datetime.timedelta(hours=12))
            ontime_val = 1.0 if is_on_time else 0.0
            raw_ot = getattr(prof, "raw_on_time_rate", 0.95) or 0.95
            prof.raw_on_time_rate = round((raw_ot * 0.8) + (ontime_val * 0.2), 3)

        self.recalculate_seller_trust_score(order.seller_id)
        self.db.refresh(order)
        return order

    # ------------------ REVIEWS & DISPUTES ------------------
    def create_review(
        self,
        order_id: str,
        buyer_id: str,
        quality_rating: int = 5,
        delivery_rating: int = 5,
        tags: str = "",
        comment: str = ""
    ) -> Review:
        order = self.db.query(Order).filter(Order.id == order_id).first()
        if not order or order.status != "DELIVERED":
            raise ValueError("Reviews can only be written for delivered orders")

        existing = self.db.query(Review).filter(Review.order_id == order_id).first()
        if existing:
            raise ValueError("Review already exists for this order")

        # Rating <= 2 flags review for QC Inspector review
        is_low_rating = (quality_rating <= 2) or (delivery_rating <= 2)

        rev = Review(
            id=f"rev-{uuid.uuid4().hex[:8]}",
            order_id=order_id,
            buyer_id=buyer_id,
            seller_id=order.seller_id,
            rating=quality_rating,
            quality_rating=quality_rating,
            delivery_rating=delivery_rating,
            tags=tags,
            is_verified_purchase=True,
            qc_flagged=is_low_rating,
            qc_status="PENDING_REVIEW" if is_low_rating else "NONE",
            comment=comment,
        )
        self.db.add(rev)
        self.db.commit()

        # Update seller stats
        prof = self.ensure_seller_profile(order.seller_id)
        all_revs = self.db.query(Review).filter(Review.seller_id == order.seller_id).all()
        if all_revs:
            q_sum = sum(getattr(r, "quality_rating", r.rating) or 5 for r in all_revs)
            d_sum = sum(getattr(r, "delivery_rating", 5) or 5 for r in all_revs)
            prof.avg_quality_rating = round(q_sum / float(len(all_revs)), 2)
            prof.avg_delivery_rating = round(d_sum / float(len(all_revs)), 2)
            prof.avg_rating = prof.avg_quality_rating
            prof.ratings_count = len(all_revs)

        self.recalculate_seller_trust_score(order.seller_id)
        self.db.refresh(rev)
        return rev

    def add_seller_review_response(self, review_id: str, seller_id: str, response: str) -> Optional[Review]:
        rev = self.db.query(Review).filter(Review.id == review_id, Review.seller_id == seller_id).first()
        if rev:
            rev.seller_response = response
            rev.responded_at = datetime.datetime.utcnow()
            self.db.commit()
            self.db.refresh(rev)
        return rev

    def get_flagged_reviews(self) -> List[Review]:
        return self.db.query(Review).filter(Review.qc_flagged == True).order_by(Review.created_at.desc()).all()

    def resolve_qc_flag(self, review_id: str, notes: str = "", status: str = "RESOLVED") -> Optional[Review]:
        rev = self.db.query(Review).filter(Review.id == review_id).first()
        if rev:
            rev.qc_status = status
            rev.qc_notes = notes
            self.db.commit()
            self.db.refresh(rev)
        return rev

    # ------------------ AUDIT LOG ------------------
    def log_action(
        self,
        actor: str,
        action: str,
        input_summary: str = "",
        output_summary: str = "",
        decision: str = "",
        reason: str = ""
    ) -> AuditLog:
        entry = AuditLog(
            id=f"aud-{uuid.uuid4().hex[:8]}",
            timestamp=datetime.datetime.utcnow(),
            actor=actor,
            action=action,
            input_summary=input_summary,
            output_summary=output_summary,
            decision=decision,
            reason=reason,
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)
        return entry

    def get_audit_logs(self, limit: int = 100) -> List[AuditLog]:
        return self.db.query(AuditLog).order_by(desc(AuditLog.timestamp)).limit(limit).all()
