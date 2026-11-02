from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from ortools.linear_solver import pywraplp

# City-to-city transit matrix (days, cost_per_unit_rs)
CITY_TRANSIT_TABLE: Dict[Tuple[str, str], Tuple[int, float]] = {
    ("Bengaluru", "Bengaluru"): (0, 0.0),
    ("Bengaluru", "Chennai"): (1, 5.0),
    ("Bengaluru", "Hyderabad"): (1, 6.0),
    ("Bengaluru", "Pune"): (2, 10.0),
    ("Chennai", "Chennai"): (0, 0.0),
    ("Chennai", "Bengaluru"): (1, 5.0),
    ("Chennai", "Hyderabad"): (1, 7.0),
    ("Chennai", "Pune"): (2, 12.0),
    ("Pune", "Pune"): (0, 0.0),
    ("Pune", "Bengaluru"): (2, 10.0),
    ("Pune", "Hyderabad"): (1, 6.0),
    ("Pune", "Chennai"): (2, 12.0),
    ("Hyderabad", "Hyderabad"): (0, 0.0),
    ("Hyderabad", "Bengaluru"): (1, 6.0),
    ("Hyderabad", "Chennai"): (1, 7.0),
    ("Hyderabad", "Pune"): (1, 6.0),
}

def get_transit_info(origin: str, destination: str, zero_transit: bool = False) -> Tuple[int, float]:
    if zero_transit or origin == destination:
        return (0, 0.0)
    return CITY_TRANSIT_TABLE.get((origin, destination), (2, 10.0))

@dataclass
class SellerCandidate:
    id: str
    name: str
    available_units: int
    unit_price: float
    lead_days: int
    city: str
    trust_score: float = 80.0
    has_valid_cert: bool = True
    spec_match: bool = True

@dataclass
class SellerAllocation:
    seller_id: str
    seller_name: str
    city: str
    units_allocated: int
    unit_price: float
    transit_cost_per_unit: float
    lead_days: int
    transit_days: int
    arrival_day: int
    total_cost: float
    trust_score: float

@dataclass
class OptimizationPlan:
    plan_type: str  # "Cheapest", "Balanced", "Fastest"
    allocations: List[SellerAllocation]
    total_units_allocated: int
    shortfall: int
    total_cost: float
    max_arrival_day: int
    avg_trust_score: float
    is_feasible: bool

def solve_recovery_plan(
    demand: int,
    deadline_days: int,
    buyer_city: str,
    candidates: List[SellerCandidate],
    min_trust: float = 70.0,
    zero_transit: bool = False,
    scenario_cost_multiplier: Dict[str, float] = None, # seller_id -> multiplier
    scenario_transit_delay: Dict[str, int] = None # city -> extra transit days
) -> Dict[str, OptimizationPlan]:
    """
    Decides supplier allocations using OR-Tools linear optimization.
    Never invents supply. Reports shortfall if infeasible.
    Generates three plans: Cheapest, Balanced, Fastest.
    """
    if scenario_cost_multiplier is None:
        scenario_cost_multiplier = {}
    if scenario_transit_delay is None:
        scenario_transit_delay = {}

    # Filter compliant candidates
    eligible: List[Tuple[SellerCandidate, int, float, float]] = []
    for c in candidates:
        if not c.has_valid_cert or not c.spec_match:
            continue
        if c.trust_score < min_trust:
            continue
        
        transit_days, transit_cost = get_transit_info(c.city, buyer_city, zero_transit)
        extra_days = scenario_transit_delay.get(c.city, 0)
        total_transit_days = transit_days + extra_days
        arrival_day = c.lead_days + total_transit_days
        
        if arrival_day > deadline_days:
            continue
        
        price_multiplier = scenario_cost_multiplier.get(c.id, 1.0)
        effective_price = (c.unit_price * price_multiplier) + transit_cost
        eligible.append((c, arrival_day, transit_cost, effective_price))

    plans = {}
    for plan_type in ["Cheapest", "Balanced", "Fastest"]:
        plans[plan_type] = _solve_single_objective(
            plan_type=plan_type,
            demand=demand,
            eligible=eligible,
            zero_transit=zero_transit
        )
    return plans

def _solve_single_objective(
    plan_type: str,
    demand: int,
    eligible: List[Tuple[SellerCandidate, int, float, float]],
    zero_transit: bool
) -> OptimizationPlan:
    solver = pywraplp.Solver.CreateSolver("GLOP")
    if not solver:
        # Fallback to integer solver if GLOP not available
        solver = pywraplp.Solver.CreateSolver("CBC")

    # Variables: x_i is units from seller i
    x_vars = {}
    for c, arrival_day, transit_cost, effective_price in eligible:
        x_vars[c.id] = solver.NumVar(0.0, float(c.available_units), f"x_{c.id}")

    # Demand constraint: sum(x_i) <= demand
    total_supply = solver.Sum([x_vars[c.id] for c, _, _, _ in eligible])
    solver.Add(total_supply <= float(demand))

    # Objective functions:
    # We want to maximize total units allocated (penalty for unsupplied units),
    # then apply objective criteria.
    # Shortfall penalty is high to ensure we meet maximum feasible demand.
    shortfall_weight = 100000.0

    if plan_type == "Cheapest":
        # Minimize effective cost while fulfilling max demand
        cost_expr = solver.Sum([x_vars[c.id] * effective_price for c, _, _, effective_price in eligible])
        objective = solver.Objective()
        # Maximize: shortfall_weight * total_units - cost
        for c, _, _, effective_price in eligible:
            objective.SetCoefficient(x_vars[c.id], shortfall_weight - effective_price)
        objective.SetMaximization()

    elif plan_type == "Fastest":
        # Heavily penalize arrival days
        objective = solver.Objective()
        for c, arrival_day, _, effective_price in eligible:
            # arrival_day penalty: earlier is much better
            speed_penalty = (arrival_day * 50.0) + (effective_price * 0.05)
            objective.SetCoefficient(x_vars[c.id], shortfall_weight - speed_penalty)
        objective.SetMaximization()

    else:  # Balanced
        # Balance cost, speed, and trust
        objective = solver.Objective()
        for c, arrival_day, _, effective_price in eligible:
            # Normalize price and arrival, reward trust
            trust_bonus = c.trust_score * 2.0
            penalty = effective_price + (arrival_day * 15.0) - trust_bonus
            objective.SetCoefficient(x_vars[c.id], shortfall_weight - penalty)
        objective.SetMaximization()

    status = solver.Solve()

    allocations: List[SellerAllocation] = []
    total_allocated = 0
    total_cost = 0.0
    max_arrival = 0
    weighted_trust_sum = 0.0

    if status in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        for c, arrival_day, transit_cost, effective_price in eligible:
            val = round(x_vars[c.id].solution_value())
            if val > 0:
                cost = val * effective_price
                allocations.append(
                    SellerAllocation(
                        seller_id=c.id,
                        seller_name=c.name,
                        city=c.city,
                        units_allocated=int(val),
                        unit_price=c.unit_price,
                        transit_cost_per_unit=transit_cost,
                        lead_days=c.lead_days,
                        transit_days=arrival_day - c.lead_days,
                        arrival_day=arrival_day,
                        total_cost=cost,
                        trust_score=c.trust_score,
                    )
                )
                total_allocated += int(val)
                total_cost += cost
                if arrival_day > max_arrival:
                    max_arrival = arrival_day
                weighted_trust_sum += c.trust_score * val

    shortfall = demand - total_allocated
    avg_trust = (weighted_trust_sum / total_allocated) if total_allocated > 0 else 0.0
    is_feasible = (shortfall == 0)

    # Sort allocations by arrival day then cost
    allocations.sort(key=lambda a: (a.arrival_day, a.unit_price))

    return OptimizationPlan(
        plan_type=plan_type,
        allocations=allocations,
        total_units_allocated=total_allocated,
        shortfall=shortfall,
        total_cost=round(total_cost, 2),
        max_arrival_day=max_arrival,
        avg_trust_score=round(avg_trust, 1),
        is_feasible=is_feasible,
    )
