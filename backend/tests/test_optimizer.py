import pytest
from app.optimizer import (
    SellerCandidate,
    solve_recovery_plan,
)

def test_recovery_plan_factory_a_warehouse_b_supplier_c():
    """
    Demo slide reproduction test:
    Factory A (400 units, 1 day, Rs 80 per unit)
    Warehouse B (300 units, 1 day, Rs 90)
    Supplier C (300 units, 2 days, Rs 100)
    Demand: 1000 units, deadline 3 days, zero transit.
    Asserts: Factory A 400, Warehouse B 300, Supplier C 300.
    Total: Rs 89,000.
    """
    candidates = [
        SellerCandidate(
            id="seller-a",
            name="Factory A",
            available_units=400,
            unit_price=80.0,
            lead_days=1,
            city="Bengaluru",
            trust_score=92.0,
            has_valid_cert=True,
            spec_match=True,
        ),
        SellerCandidate(
            id="seller-b",
            name="Warehouse B",
            available_units=300,
            unit_price=90.0,
            lead_days=1,
            city="Chennai",
            trust_score=88.0,
            has_valid_cert=True,
            spec_match=True,
        ),
        SellerCandidate(
            id="seller-c",
            name="Supplier C",
            available_units=300,
            unit_price=100.0,
            lead_days=2,
            city="Pune",
            trust_score=85.0,
            has_valid_cert=True,
            spec_match=True,
        ),
    ]

    plans = solve_recovery_plan(
        demand=1000,
        deadline_days=3,
        buyer_city="Bengaluru",
        candidates=candidates,
        min_trust=70.0,
        zero_transit=True,
    )

    cheapest = plans["Cheapest"]

    # Verify allocations
    alloc_map = {a.seller_name: a.units_allocated for a in cheapest.allocations}
    assert alloc_map.get("Factory A") == 400
    assert alloc_map.get("Warehouse B") == 300
    assert alloc_map.get("Supplier C") == 300

    # Verify totals
    assert cheapest.total_units_allocated == 1000
    assert cheapest.shortfall == 0
    assert cheapest.is_feasible is True
    # 400*80 + 300*90 + 300*100 = 32000 + 27000 + 30000 = 89000
    assert cheapest.total_cost == 89000.0


def test_infeasible_case_reports_shortfall():
    """
    Test when total capacity is less than demand:
    Must report shortfall and never invent supply.
    """
    candidates = [
        SellerCandidate(
            id="seller-a",
            name="Factory A",
            available_units=400,
            unit_price=80.0,
            lead_days=1,
            city="Bengaluru",
            trust_score=90.0,
        ),
        SellerCandidate(
            id="seller-b",
            name="Warehouse B",
            available_units=300,
            unit_price=90.0,
            lead_days=1,
            city="Chennai",
            trust_score=85.0,
        ),
    ]

    # Need 1000 units, but only 700 available
    plans = solve_recovery_plan(
        demand=1000,
        deadline_days=3,
        buyer_city="Bengaluru",
        candidates=candidates,
        min_trust=70.0,
        zero_transit=True,
    )

    plan = plans["Cheapest"]
    assert plan.total_units_allocated == 700
    assert plan.shortfall == 300
    assert plan.is_feasible is False
    assert plan.total_cost == (400 * 80.0) + (300 * 90.0)


def test_trust_threshold_constraint():
    """
    Sellers below trust threshold must be excluded.
    """
    candidates = [
        SellerCandidate(
            id="seller-a",
            name="Factory A",
            available_units=400,
            unit_price=80.0,
            lead_days=1,
            city="Bengaluru",
            trust_score=65.0,  # Below threshold of 70
        ),
        SellerCandidate(
            id="seller-b",
            name="Warehouse B",
            available_units=300,
            unit_price=90.0,
            lead_days=1,
            city="Chennai",
            trust_score=85.0,
        ),
    ]

    plans = solve_recovery_plan(
        demand=500,
        deadline_days=3,
        buyer_city="Bengaluru",
        candidates=candidates,
        min_trust=70.0,
        zero_transit=True,
    )

    plan = plans["Cheapest"]
    # Seller A excluded due to trust score 65 < 70
    alloc_ids = [a.seller_id for a in plan.allocations]
    assert "seller-a" not in alloc_ids
    assert "seller-b" in alloc_ids
    assert plan.total_units_allocated == 300
    assert plan.shortfall == 200


def test_deadline_constraint():
    """
    Sellers whose arrival day exceeds deadline must be excluded.
    """
    candidates = [
        SellerCandidate(
            id="seller-fast",
            name="Quick Supplier",
            available_units=500,
            unit_price=100.0,
            lead_days=1,
            city="Bengaluru",
        ),
        SellerCandidate(
            id="seller-slow",
            name="Slow Supplier",
            available_units=500,
            unit_price=70.0,
            lead_days=5,  # Exceeds 2 day deadline
            city="Bengaluru",
        ),
    ]

    plans = solve_recovery_plan(
        demand=500,
        deadline_days=2,
        buyer_city="Bengaluru",
        candidates=candidates,
        min_trust=70.0,
        zero_transit=True,
    )

    plan = plans["Cheapest"]
    alloc_ids = [a.seller_id for a in plan.allocations]
    assert "seller-slow" not in alloc_ids
    assert "seller-fast" in alloc_ids
    assert plan.total_units_allocated == 500
    assert plan.shortfall == 0
