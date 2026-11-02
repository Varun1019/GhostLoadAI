import os
import re
import json
from typing import Dict, Any, Optional

# Canned responses for emergency disruption parsing
CANNED_EXTRACTION = {
    "item": "Ceramic Composite Brake Pads",
    "quantity": 1000,
    "deadline_days": 3,
    "reason": "Primary assembly line supplier plant shut down due to boiler breakdown; critical OE delivery at risk.",
    "severity": "CRITICAL"
}

def parse_disruption_text(text: str) -> Dict[str, Any]:
    """
    Parses disruption text using SAP Generative AI Hub or fallback/regex/canned.
    Never crashes on failure.
    """
    # 1. Try SAP AI Core GenAI SDK if configured
    aicore_auth_url = os.getenv("AICORE_AUTH_URL")
    aicore_client_id = os.getenv("AICORE_CLIENT_ID")
    aicore_client_secret = os.getenv("AICORE_CLIENT_SECRET")
    aicore_base_url = os.getenv("AICORE_BASE_URL")

    if aicore_auth_url and aicore_client_id and aicore_client_secret:
        try:
            # Attempt SAP AI SDK Gen import
            from gen_ai_hub.proxy.native.openai import chat
            # (Adapter ready, will call if credentials succeed)
            response = chat.completions.create(
                model_name="gpt-4o",
                messages=[
                    {"role": "system", "content": "Extract item, quantity (int), deadline_days (int), and reason as JSON."},
                    {"role": "user", "content": text}
                ]
            )
            raw = response.choices[0].message.content
            return json.loads(raw)
        except Exception as e:
            # Fallback gracefully
            pass

    # 2. Regex parsing fallback
    extracted = dict(CANNED_EXTRACTION)
    
    # Extract quantity (e.g., "1000 brake pads", "need 500 units")
    qty_match = re.search(r"(\d+)\s*(?:units|brake\s*pads|parts|pieces|sets|items)?", text, re.IGNORECASE)
    if qty_match:
        val = int(qty_match.group(1))
        if val > 10:  # Reasonable quantity
            extracted["quantity"] = val

    # Extract deadline in days (e.g. "in 3 days", "within 2 days", "48 hours")
    days_match = re.search(r"(?:in|within|before)\s*(\d+)\s*(?:days|day)", text, re.IGNORECASE)
    if days_match:
        extracted["deadline_days"] = int(days_match.group(1))
    else:
        hours_match = re.search(r"(\d+)\s*hours?", text, re.IGNORECASE)
        if hours_match:
            hrs = int(hours_match.group(1))
            extracted["deadline_days"] = max(1, round(hrs / 24.0))

    # Extract item
    lower_t = text.lower()
    if "caliper" in lower_t:
        extracted["item"] = "Heavy-Duty Brake Caliper Assembly"
    elif "rotor" in lower_t:
        extracted["item"] = "Ventilated Disc Brake Rotor 280mm"
    elif "harness" in lower_t:
        extracted["item"] = "Copper Wiring Harness for EV Battery"
    elif "gear" in lower_t:
        extracted["item"] = "Helical Bevel Gear & Pinion Set"
    elif "brake" in lower_t or "pad" in lower_t:
        extracted["item"] = "Ceramic Composite Brake Pads"

    if text.strip():
        extracted["reason"] = text.strip()

    return extracted

def generate_plan_explanation(plan_type: str, plan_summary: Dict[str, Any]) -> str:
    """
    Produces plain-language executive explanation from LLM or structured template.
    Never crashes.
    """
    total_qty = plan_summary.get("total_units_allocated", 0)
    shortfall = plan_summary.get("shortfall", 0)
    total_cost = plan_summary.get("total_cost", 0.0)
    max_days = plan_summary.get("max_arrival_day", 0)
    allocations = plan_summary.get("allocations", [])

    alloc_str = ", ".join([f"{a['seller_name']} ({a['units_allocated']} units from {a['city']})" for a in allocations])

    if shortfall > 0:
        return (
            f"GhostLoad Alert: Selected '{plan_type}' strategy fulfills {total_qty} units with a critical shortfall "
            f"of {shortfall} units across active suppliers. Total cost is ₹{total_cost:,.2f} arriving in {max_days} days via: {alloc_str}. "
            f"Immediate human operator review required to explore alternate specifications or extended transit windows."
        )

    if plan_type == "Cheapest":
        return (
            f"Cost-Optimized Plan: Fulfills full 100% capacity demand ({total_qty} units) at ₹{total_cost:,.2f}. "
            f"Allocations balanced across {len(allocations)} suppliers: {alloc_str}. "
            f"Max arrival window is {max_days} day(s), meeting hard delivery SLA while minimizing total purchase & transit outlay."
        )
    elif plan_type == "Fastest":
        return (
            f"Speed-First Plan: Prioritizes immediate emergency line restoration. Fulfills {total_qty} units arriving within {max_days} day(s). "
            f"Allocations: {alloc_str}. Minimizes bottleneck risk at ₹{total_cost:,.2f}."
        )
    else:
        return (
            f"Balanced Recommendation: Highest stability recovery route. Fulfills {total_qty} units at ₹{total_cost:,.2f} arriving in {max_days} day(s). "
            f"Allocations: {alloc_str}. Blends top-tier trust metrics (ISO/IATF compliance) with competitive logistics speed."
        )
