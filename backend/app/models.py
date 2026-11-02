import datetime
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    Text,
    ForeignKey,
)
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    role = Column(String(32), default="BUYER")  # BUYER, SELLER, QC_INSPECTOR
    company_name = Column(String(255), default="")
    city = Column(String(64), default="Bengaluru")
    industry = Column(String(128), default="Automotive Parts & Assemblies")
    gst_number = Column(String(64), default="")
    is_onboarded = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    seller_profile = relationship("SellerProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    products = relationship("Product", back_populates="seller")
    orders_as_buyer = relationship("Order", foreign_keys="[Order.buyer_id]", back_populates="buyer")
    orders_as_seller = relationship("Order", foreign_keys="[Order.seller_id]", back_populates="seller")

class SellerProfile(Base):
    __tablename__ = "seller_profiles"

    seller_id = Column(String(64), ForeignKey("users.id"), primary_key=True)
    trust_score = Column(Float, default=80.0)
    cert_verified_rate = Column(Float, default=1.0)  # 0 to 1
    on_time_rate = Column(Float, default=0.95)       # 0 to 1 (blended: 70% dates + 30% delivery rating)
    raw_on_time_rate = Column(Float, default=0.95)   # 0 to 1 (actual dates on-time rate)
    defect_rate = Column(Float, default=0.02)        # 0 to 1 (lower is better)
    avg_rating = Column(Float, default=4.5)          # Quality rating alias (1 to 5)
    avg_quality_rating = Column(Float, default=4.8)  # 1 to 5
    avg_delivery_rating = Column(Float, default=4.7) # 1 to 5
    ratings_count = Column(Integer, default=1)
    response_time_hours = Column(Float, default=3.5) # hours
    total_orders = Column(Integer, default=12)
    response_count = Column(Integer, default=12)
    dispute_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="seller_profile")
    certificates = relationship(
        "Certificate",
        primaryjoin="SellerProfile.seller_id == Certificate.seller_id",
        foreign_keys="[Certificate.seller_id]",
        cascade="all, delete-orphan",
    )

class Certificate(Base):
    __tablename__ = "certificates"

    id = Column(String(64), primary_key=True, index=True)
    seller_id = Column(String(64), ForeignKey("users.id"), nullable=False, index=True)
    cert_name = Column(String(128), nullable=False) # e.g. "ISO 9001:2015", "IATF 16949"
    issuer = Column(String(128), default="TUV SUD")
    cert_number = Column(String(128), default="CERT-98234")
    issue_date = Column(DateTime, default=datetime.datetime.utcnow)
    expiry_date = Column(DateTime, nullable=False)
    status = Column(String(32), default="APPROVED")  # PENDING, APPROVED, REJECTED
    rejection_reason = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    seller = relationship("User", overlaps="certificates")

class Product(Base):
    __tablename__ = "products"

    id = Column(String(64), primary_key=True, index=True)
    seller_id = Column(String(64), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(128), default="Braking Systems")
    specs_json = Column(Text, default="{}") # specs key-values
    listing_type = Column(String(64), default="PRODUCT_STOCK") # PRODUCT_STOCK, PRODUCTION_CAPACITY, WAREHOUSE_SPACE, TRANSPORT
    units_available = Column(Integer, default=100)
    reserved_units = Column(Integer, default=0)
    price_per_unit = Column(Float, nullable=False)
    lead_days = Column(Integer, default=1)
    min_order = Column(Integer, default=10)
    city = Column(String(64), default="Bengaluru")
    image_url = Column(String(512), default="/placeholder_part.svg")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    seller = relationship("User", back_populates="products")
    orders = relationship("Order", back_populates="product")
    reservations = relationship("Reservation", back_populates="product")

class Order(Base):
    __tablename__ = "orders"

    id = Column(String(64), primary_key=True, index=True)
    po_number = Column(String(64), unique=True, index=True)
    buyer_id = Column(String(64), ForeignKey("users.id"), nullable=False)
    seller_id = Column(String(64), ForeignKey("users.id"), nullable=False)
    product_id = Column(String(64), ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)
    status = Column(String(32), default="PLACED")  # PLACED, ACCEPTED, SHIPPED, DELIVERED, DECLINED
    placed_at = Column(DateTime, default=datetime.datetime.utcnow)
    expected_delivery_date = Column(DateTime, nullable=True)
    actual_delivery_date = Column(DateTime, nullable=True)
    
    # Inspection on delivery
    received_qty = Column(Integer, nullable=True)
    defect_qty = Column(Integer, nullable=True)
    inspection_notes = Column(Text, default="")
    inspected_at = Column(DateTime, nullable=True)

    buyer = relationship("User", foreign_keys=[buyer_id], back_populates="orders_as_buyer")
    seller = relationship("User", foreign_keys=[seller_id], back_populates="orders_as_seller")
    product = relationship("Product", back_populates="orders")
    review = relationship("Review", back_populates="order", uselist=False)

class Review(Base):
    __tablename__ = "reviews"

    id = Column(String(64), primary_key=True, index=True)
    order_id = Column(String(64), ForeignKey("orders.id"), unique=True, nullable=False)
    buyer_id = Column(String(64), ForeignKey("users.id"), nullable=False)
    seller_id = Column(String(64), ForeignKey("users.id"), nullable=False)
    rating = Column(Integer, default=5)  # Quality rating default
    quality_rating = Column(Integer, default=5)
    delivery_rating = Column(Integer, default=5)
    tags = Column(Text, default="")
    is_verified_purchase = Column(Boolean, default=True)
    qc_flagged = Column(Boolean, default=False)
    qc_status = Column(String(32), default="NONE")  # NONE, PENDING_REVIEW, RESOLVED
    qc_notes = Column(Text, default="")
    comment = Column(Text, default="")
    seller_response = Column(Text, default="")
    responded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    order = relationship("Order", back_populates="review")
    buyer = relationship("User", foreign_keys=[buyer_id])
    seller = relationship("User", foreign_keys=[seller_id])

class Reservation(Base):
    __tablename__ = "reservations"

    id = Column(String(64), primary_key=True, index=True)
    plan_id = Column(String(64), index=True, nullable=True)
    seller_id = Column(String(64), ForeignKey("users.id"), nullable=False)
    product_id = Column(String(64), ForeignKey("products.id"), nullable=False)
    buyer_id = Column(String(64), ForeignKey("users.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    status = Column(String(32), default="PENDING")  # PENDING, ACCEPTED, DECLINED, EXPIRED, RELEASED
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    product = relationship("Product", back_populates="reservations")
    seller = relationship("User", foreign_keys=[seller_id])
    buyer = relationship("User", foreign_keys=[buyer_id])

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(64), primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    actor = Column(String(128), nullable=False) # Agent name or user name
    action = Column(String(128), nullable=False) # e.g. "OPTIMIZATION_RUN", "PLAN_APPROVED", "RESERVATION_REQUESTED"
    input_summary = Column(Text, default="")
    output_summary = Column(Text, default="")
    decision = Column(String(128), default="")
    reason = Column(Text, default="")
