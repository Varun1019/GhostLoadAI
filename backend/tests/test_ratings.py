import pytest
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import User, SellerProfile, Certificate, Product, Order, Review, AuditLog
from app.repository import Repository

@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_low_quality_rating_lowers_seller_trust_score(test_db):
    """
    Proves that a buyer submitting a low quality rating reduces the seller's
    Trust Score, and flags the order for QC inspection if score <= 2.
    """
    repo = Repository(test_db)
    now = datetime.datetime.utcnow()

    # 1. Setup seller with approved certificate
    seller = User(
        id="seller-test-1",
        email="seller.test@demo.in",
        name="Test Auto Components",
        role="SELLER",
        company_name="Test Auto Components Ltd",
        city="Bengaluru",
        is_onboarded=True,
    )
    buyer = User(
        id="buyer-test-1",
        email="buyer.test@demo.in",
        name="Test Buyer OEM",
        role="BUYER",
        company_name="Test Buyer OEM",
        city="Bengaluru",
        is_onboarded=True,
    )
    test_db.add_all([seller, buyer])
    test_db.commit()

    # Add active certificate
    cert = Certificate(
        id="cert-1",
        seller_id="seller-test-1",
        cert_name="ISO 9001:2015",
        status="APPROVED",
        issue_date=now - datetime.timedelta(days=30),
        expiry_date=now + datetime.timedelta(days=300),
    )
    test_db.add(cert)

    # Initial high-performing seller profile
    prof = SellerProfile(
        seller_id="seller-test-1",
        trust_score=95.0,
        cert_verified_rate=1.0,
        on_time_rate=1.0,
        raw_on_time_rate=1.0,
        defect_rate=0.0,
        avg_rating=5.0,
        avg_quality_rating=5.0,
        avg_delivery_rating=5.0,
        ratings_count=1,
        response_time_hours=1.0,
        total_orders=10,
    )
    test_db.add(prof)
    test_db.commit()

    # Compute baseline trust score
    baseline_score = repo.recalculate_seller_trust_score("seller-test-1")
    assert baseline_score >= 90.0, f"Expected high baseline score, got {baseline_score}"

    # 2. Create and deliver an order
    prod = Product(
        id="prod-test-1",
        seller_id="seller-test-1",
        title="Test Brake Disc",
        price_per_unit=100.0,
        lead_days=1,
        units_available=500,
        city="Bengaluru",
    )
    test_db.add(prod)
    test_db.commit()

    order = Order(
        id="ord-test-1",
        po_number="PO-TEST-001",
        buyer_id="buyer-test-1",
        seller_id="seller-test-1",
        product_id="prod-test-1",
        quantity=100,
        unit_price=100.0,
        total_price=10000.0,
        status="DELIVERED",
        placed_at=now - datetime.timedelta(days=3),
        expected_delivery_date=now - datetime.timedelta(days=2),
        actual_delivery_date=now - datetime.timedelta(days=2),
        received_qty=100,
        defect_qty=0,
    )
    test_db.add(order)
    test_db.commit()

    # 3. Buyer submits a 1-star low quality rating
    review = repo.create_review(
        order_id="ord-test-1",
        buyer_id="buyer-test-1",
        quality_rating=1,
        delivery_rating=2,
        tags="Late, Damaged packaging",
        comment="Surface warping detected on inspection. Poor packaging.",
    )

    # 4. Verify seller trust score decreased
    test_db.refresh(prof)
    new_score = prof.trust_score

    assert new_score < baseline_score, f"Expected trust score to drop from {baseline_score}, but got {new_score}"
    assert prof.avg_quality_rating == 1.0
    assert prof.avg_delivery_rating == 2.0

    # 5. Verify QC flag triggered for ratings <= 2
    assert review.qc_flagged is True
    assert review.qc_status == "PENDING_REVIEW"

    # Verify flagged reviews queue
    flagged = repo.get_flagged_reviews()
    assert len(flagged) == 1
    assert flagged[0].id == review.id
