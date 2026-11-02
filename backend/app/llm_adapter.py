"""
GhostLoad AI Unified LLM Adapter
Supports Google Gemini (default via official google-genai SDK),
SAP Generative AI Hub (adapter ready), and local deterministic regex/canned fallback.
"""

import os
import re
import json
import time
import logging
from typing import Dict, Any, Optional, Tuple, List
from pydantic import BaseModel, Field, ValidationError
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("ghostload.ai")

# ---------------- CONFIGURATION (ENV VARS ONLY) ----------------
# Model name is NOT hardcoded in business logic; configurable via GEMINI_MODEL
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
LLM_TIMEOUT_SECONDS = int(os.getenv("LLM_TIMEOUT_SECONDS", "15"))

# In-memory Request Cache (10 minutes TTL)
# Key: hash/input string -> Value: (timestamp, result_dict)
_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 600

# Per-User Rate Limiter (20 AI calls per minute)
# Key: user_id -> Value: List of call timestamps
_USER_RATE_LIMITS: Dict[str, List[float]] = {}
MAX_CALLS_PER_MINUTE = 20

# ---------------- STRUCTURED OUTPUT SCHEMAS ----------------
class DisruptionExtraction(BaseModel):
    item: str = Field(description="Component or part category needed, e.g. Ceramic Composite Brake Pads")
    quantity: int = Field(description="Total units required as an integer")
    deadline_days: int = Field(description="Delivery SLA required in days as an integer")
    reason: str = Field(description="Brief summary of the root disruption cause")
    severity: str = Field(default="CRITICAL", description="Severity level: CRITICAL, HIGH, or MEDIUM")

class RankedItem(BaseModel):
    product_id: str = Field(description="Product ID")
    rank_reason: str = Field(description="1-line reason for this product's placement")

class SmartSortRanking(BaseModel):
    criteria_detected: str = Field(description="Summary of criteria detected from user query, e.g. Lowest price within 2 days delivery")
    ranked_items: List[RankedItem] = Field(description="Ordered list of products from best match to lowest match")

# Canned Baseline Scenario
CANNED_EXTRACTION = {
    "item": "Ceramic Composite Brake Pads",
    "quantity": 1000,
    "deadline_days": 3,
    "reason": "Primary assembly line supplier plant shut down due to boiler breakdown; critical OE delivery at risk.",
    "severity": "CRITICAL"
}

# ---------------- PRIVACY & SANITIZATION ----------------
def sanitize_prompt_text(text: str) -> str:
    """
    Strips personal data (emails, phone numbers, GST numbers) before sending to LLM.
    Sends only text needed for the supply chain recovery task.
    """
    if not text:
        return ""
    # Strip emails
    sanitized = re.sub(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", "[REDACTED_EMAIL]", text)
    # Strip GST numbers (15 alphanumeric characters: 2 state + 10 PAN + 1 entity + Z + 1 check)
    sanitized = re.sub(r"\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}\b", "[REDACTED_GST]", sanitized)
    # Strip 10-digit phone numbers
    sanitized = re.sub(r"\b(?:\+91[-\s]?)?[6-9]\d{9}\b", "[REDACTED_PHONE]", sanitized)
    return sanitized

# ---------------- RATE LIMITING & CACHE HELPERS ----------------
def check_user_rate_limit(user_id: str) -> bool:
    """Returns True if within rate limit, False if exceeded (20 calls/min)."""
    now = time.time()
    calls = _USER_RATE_LIMITS.get(user_id, [])
    # Keep only timestamps within last 60 seconds
    valid_calls = [t for t in calls if now - t < 60.0]
    _USER_RATE_LIMITS[user_id] = valid_calls
    if len(valid_calls) >= MAX_CALLS_PER_MINUTE:
        return False
    _USER_RATE_LIMITS[user_id].append(now)
    return True

def get_cached_result(cache_key: str) -> Optional[Dict[str, Any]]:
    now = time.time()
    if cache_key in _CACHE:
        ts, data = _CACHE[cache_key]
        if now - ts < CACHE_TTL_SECONDS:
            return data
    return None

def set_cached_result(cache_key: str, data: Dict[str, Any]) -> None:
    _CACHE[cache_key] = (time.time(), data)

# ---------------- GEMINI PROVIDER ----------------
def call_gemini_structured_extraction(clean_text: str) -> Optional[Dict[str, Any]]:
    """
    Calls Google Gemini using the official google-genai SDK.
    Requests structured JSON output adhering to DisruptionExtraction schema.
    Includes short retry with backoff for rate limits and schema validation.
    """
    api_key = os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)
    if not api_key:
        return None

    try:
        from google import genai
        from google.genai import types
        from google.genai.errors import APIError
    except ImportError:
        logger.warning("google-genai SDK not installed; falling back")
        return None

    client = genai.Client(api_key=api_key)
    model_name = os.getenv("GEMINI_MODEL", GEMINI_MODEL)

    prompt = (
        "Extract the supply chain disruption details from this incident report. "
        "Return valid JSON matching the schema.\n\n"
        f"Incident Report: {clean_text}"
    )

    # Retry loop with backoff for rate limits / transient errors
    max_attempts = 2
    for attempt in range(max_attempts):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=DisruptionExtraction,
                ),
            )
            raw_text = response.text
            if not raw_text:
                continue

            # Validate with Pydantic
            validated = DisruptionExtraction.model_validate_json(raw_text)
            return validated.model_dump()
        except ValidationError:
            # Pydantic validation failed: retry once
            logger.warning("Gemini JSON validation failed; retrying once")
            time.sleep(0.5)
            continue
        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "resource_exhausted" in err_str:
                # Rate limit: short backoff
                logger.warning(f"Gemini 429 rate limit hit (attempt {attempt+1}); backing off")
                time.sleep(1.0)
                continue
            logger.warning(f"Gemini call failed: {e}")
            return None

    return None

# ---------------- SAP GENERATIVE AI HUB PROVIDER ----------------
def call_sap_genai_hub(clean_text: str) -> Optional[Dict[str, Any]]:
    """
    Adapter ready for SAP Generative AI Hub via AICORE environment variables.
    Calls if credentials exist, falls back gracefully if unconfigured.
    """
    aicore_auth_url = os.getenv("AICORE_AUTH_URL")
    aicore_client_id = os.getenv("AICORE_CLIENT_ID")
    aicore_client_secret = os.getenv("AICORE_CLIENT_SECRET")

    if not (aicore_auth_url and aicore_client_id and aicore_client_secret):
        return None

    try:
        from gen_ai_hub.proxy.native.openai import chat
        response = chat.completions.create(
            model_name="gpt-4o",
            messages=[
                {"role": "system", "content": "Extract item, quantity (int), deadline_days (int), reason as JSON."},
                {"role": "user", "content": clean_text}
            ],
            timeout=LLM_TIMEOUT_SECONDS
        )
        raw = response.choices[0].message.content
        data = json.loads(raw)
        validated = DisruptionExtraction.model_validate(data)
        return validated.model_dump()
    except Exception as e:
        logger.info(f"SAP Generative AI Hub unavailable or call failed: {e}")
        return None

# ---------------- REGEX & CANNED FALLBACK ----------------
def regex_canned_fallback(text: str) -> Dict[str, Any]:
    """
    Local deterministic regex extraction with canned benchmark default.
    Zero network dependency, always succeeds.
    """
    extracted = dict(CANNED_EXTRACTION)
    
    # Extract quantity (e.g. "1000 units", "1000 brake pads")
    qty_match = re.search(r"(\d+)\s*(?:units|brake\s*pads|parts|pieces|sets|items)?", text, re.IGNORECASE)
    if qty_match:
        val = int(qty_match.group(1))
        if val > 10:
            extracted["quantity"] = val

    # Extract deadline in days / hours
    days_match = re.search(r"(?:in|within|before)\s*(\d+)\s*(?:days|day)", text, re.IGNORECASE)
    if days_match:
        extracted["deadline_days"] = int(days_match.group(1))
    else:
        hours_match = re.search(r"(\d+)\s*hours?", text, re.IGNORECASE)
        if hours_match:
            hrs = int(hours_match.group(1))
            extracted["deadline_days"] = max(1, round(hrs / 24.0))

    # Identify component
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

# ---------------- MAIN DISRUPTION PARSER ----------------
def parse_disruption_text(text: str, user_id: str = "default_user") -> Dict[str, Any]:
    """
    Executes the Fallback Chain:
    1. Google Gemini (default provider)
    2. SAP Generative AI Hub (if configured)
    3. Deterministic Regex / Canned Fallback
    Includes privacy sanitization, rate limiting, and 10-minute caching.
    """
    clean_text = sanitize_prompt_text(text)
    cache_key = f"disruption:{clean_text.strip().lower()}"

    # Check cache first
    cached = get_cached_result(cache_key)
    if cached:
        return cached

    # Check user rate limit
    if not check_user_rate_limit(user_id):
        fallback_data = regex_canned_fallback(clean_text)
        res = {
            "data": fallback_data,
            "provider_used": "fallback",
            "is_fallback": True,
            "fallback_reason": "Rate limit exceeded (20 calls/min per user)",
            "fallback_note": "AI is offline, using basic mode",
        }
        return res

    provider_setting = os.getenv("LLM_PROVIDER", LLM_PROVIDER).lower()

    # Step 1: Gemini Provider (Default)
    if provider_setting in ["gemini", "default"]:
        gemini_result = call_gemini_structured_extraction(clean_text)
        if gemini_result:
            res = {
                "data": gemini_result,
                "provider_used": "gemini",
                "is_fallback": False,
                "fallback_reason": "",
                "fallback_note": "",
            }
            set_cached_result(cache_key, res)
            return res

    # Step 2: SAP Generative AI Hub
    sap_result = call_sap_genai_hub(clean_text)
    if sap_result:
        res = {
            "data": sap_result,
            "provider_used": "sap_genai_hub",
            "is_fallback": False,
            "fallback_reason": "",
            "fallback_note": "",
        }
        set_cached_result(cache_key, res)
        return res

    # Step 3: Regex & Canned Fallback
    fallback_data = regex_canned_fallback(clean_text)
    res = {
        "data": fallback_data,
        "provider_used": "fallback",
        "is_fallback": True,
        "fallback_reason": "Gemini API key unset or network offline",
        "fallback_note": "AI is offline, using basic mode",
    }
    set_cached_result(cache_key, res)
    return res

# ---------------- PLAN EXPLANATION GENERATOR ----------------
def generate_plan_explanation(plan_type: str, plan_summary: Dict[str, Any]) -> str:
    """
    Produces plain-language executive explanation.
    Never crashes on failure.
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

# ---------------- TEST CONNECTION CHECK ----------------
def test_ai_connection() -> Dict[str, Any]:
    """
    Tests live connection to configured LLM provider with timeout.
    Returns status: 'connected' or 'offline', with active provider and model.
    """
    provider = os.getenv("LLM_PROVIDER", LLM_PROVIDER).lower()
    model = os.getenv("GEMINI_MODEL", GEMINI_MODEL)
    api_key = os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)

    if provider in ["gemini", "default"]:
        if not api_key:
            return {
                "provider": "Google Gemini",
                "model": model,
                "status": "offline",
                "message": "AI is offline, using basic mode (GEMINI_API_KEY not configured)",
                "active_fallback": "Local Regex & Canned Fallback"
            }
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=model,
                contents="Ping. Respond with 'PONG'."
            )
            if response.text:
                return {
                    "provider": "Google Gemini",
                    "model": model,
                    "status": "connected",
                    "message": f"Connected to Google Gemini ({model})",
                    "active_fallback": "Local Regex & Canned Fallback"
                }
        except Exception as e:
            return {
                "provider": "Google Gemini",
                "model": model,
                "status": "offline",
                "message": f"AI is offline, using basic mode ({str(e)[:80]})",
                "active_fallback": "Local Regex & Canned Fallback"
            }

    elif provider == "sap":
        return {
            "provider": "SAP Generative AI Hub",
            "model": "gpt-4o",
            "status": "offline",
            "message": "AI is offline, using basic mode (AICORE credentials not verified)",
            "active_fallback": "Local Regex & Canned Fallback"
        }

    return {
        "provider": "Local Fallback Engine",
        "model": "Deterministic Regex / Canned",
        "status": "connected",
        "message": "Operating in local offline deterministic mode",
        "active_fallback": "None (Active)"
    }


# ---------------- CONVERSATIONAL AI COPILOT ----------------
SYSTEM_CHAT_PROMPT = """You are GhostLoad AI Copilot, the intelligent procurement and supply chain assistant for GhostLoad AI.
GhostLoad AI is a high-reliability B2B marketplace for mission-critical automotive and industrial components.

Key platform knowledge:
1. Marketplace: High-spec components with transparent price/unit, SLA lead days, city routes, and seller Trust Scores (0-100).
2. Emergency Recovery: When suppliers fail, the multi-agent system uses Google OR-Tools linear programming solver to discover idle factory & warehouse capacity ("ghost loads") and generate optimal multi-vendor recovery plans.
3. Strict Governance: The linear solver allocates units; LLMs provide explanations and conversational support; human managers must approve plans; every action is logged to an immutable audit trail.
4. 24-Hour Holds: Approved emergency plans automatically place 24-hour capacity holds on sellers to prevent double-booking.
5. Trust Score & Ratings: 0-100 trust score composed of on-time delivery (25%), quality rating (15%), SLA adherence (20%), cert validity (20%), and incident penalties (20%). Delivered orders have two-factor ratings (Product Quality 1-5★ and Delivery Experience 1-5★). Ratings ≤2 are flagged for QC inspector audit.

Provide direct, actionable, professional answers. Keep answers crisp and concise. Avoid fluff."""

def generate_chat_reply(
    messages: List[Dict[str, str]],
    user_context: Optional[Dict[str, Any]] = None,
    user_id: str = "default_user"
) -> Dict[str, Any]:
    """
    Generates a conversational response using Google Gemini.
    Falls back gracefully if offline or rate limited.
    """
    check_user_rate_limit(user_id)

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    model = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview").strip()

    if not api_key:
        return {
            "reply": "I am operating in offline basic mode because the Gemini API key is not configured. GhostLoad AI is ready to optimize your supply chain using Google OR-Tools and pre-seeded supplier capacity.",
            "provider": "Local Fallback",
            "model": "rule-based",
            "is_fallback": True
        }

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        # Build contents from history
        contents = []
        for msg in messages:
            role = "user" if msg.get("role") in ["user", "human"] else "model"
            text = sanitize_prompt_text(msg.get("content", ""))
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=text)]))

        # Add context if available
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_CHAT_PROMPT,
            temperature=0.3,
            max_output_tokens=800,
        )

        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )

        reply_text = response.text.strip() if response.text else "I am here to assist with GhostLoad AI procurement and emergency recovery."
        return {
            "reply": reply_text,
            "provider": "Google Gemini",
            "model": model,
            "is_fallback": False
        }
    except Exception as e:
        logger.warning(f"Gemini chat failed: {e}. Using conversational fallback.")
        last_user_query = messages[-1].get("content", "").lower() if messages else ""
        if "emergency" in last_user_query or "disruption" in last_user_query:
            fallback = "GhostLoad Emergency Recovery uses Google OR-Tools to solve multi-supplier capacity constraints in real-time. Head to the Emergency tab to input your disruption requirements."
        elif "trust" in last_user_query or "score" in last_user_query:
            fallback = "Seller Trust Scores range from 0 to 100 based on on-time delivery (25%), quality rating (15%), SLA adherence (20%), cert validity (20%), and incident penalties (20%)."
        elif "price" in last_user_query or "order" in last_user_query:
            fallback = "You can browse verified components in the Marketplace, sort by price or delivery SLA, and place orders directly with verified suppliers."
        else:
            fallback = f"GhostLoad AI Copilot is online. How can I assist with your automotive parts procurement or emergency capacity recovery?"
        return {
            "reply": fallback,
            "provider": "Local Fallback Engine",
            "model": "rule-based",
            "is_fallback": True
        }


# ---------------- AI SMART SORT ----------------
def smart_sort_products(
    query: str,
    products: List[Dict[str, Any]],
    user_id: str = "default_user"
) -> Dict[str, Any]:
    """
    Reranks a list of products using Google Gemini structured output based on natural language intent.
    Example queries:
    - 'fastest delivery within 2 days with high trust'
    - 'cheapest braking parts under 500 rupees'
    - 'highest rated supplier near Bengaluru'
    """
    if not query.strip() or not products:
        return {
            "ranked_products": products,
            "criteria_detected": "Default relevance",
            "provider": "Default Sort",
            "is_fallback": True
        }

    check_user_rate_limit(user_id)
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    model = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview").strip()

    # Fallback deterministic sorter
    def fallback_sort() -> Dict[str, Any]:
        q = query.lower()
        sorted_list = list(products)
        criteria = "Standard matching"
        if "cheap" in q or "price" in q or "low cost" in q:
            sorted_list.sort(key=lambda p: p.get("price_per_unit", 0))
            criteria = "Price: Lowest first"
        elif "fast" in q or "urgent" in q or "quick" in q or "speed" in q or "day" in q:
            sorted_list.sort(key=lambda p: p.get("total_lead_days", p.get("lead_days", 0) + p.get("transit_days", 0)))
            criteria = "Speed: Fastest delivery SLA"
        elif "trust" in q or "rating" in q or "quality" in q or "reliable" in q:
            sorted_list.sort(key=lambda p: (p.get("trust_score", 0), p.get("avg_quality_rating", 0)), reverse=True)
            criteria = "Trust & Quality: Highest first"

        for p in sorted_list:
            p["ai_rank_reason"] = f"Matched '{criteria}'"
        return {
            "ranked_products": sorted_list,
            "criteria_detected": criteria,
            "provider": "Deterministic NLP Sorter",
            "is_fallback": True
        }

    if not api_key:
        return fallback_sort()

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        # Build candidate summaries for token efficiency
        candidates_summary = []
        for p in products[:15]:  # limit to top 15 candidates for fast response
            candidates_summary.append({
                "id": str(p.get("id")),
                "title": str(p.get("title")),
                "price": float(p.get("price_per_unit", 0)),
                "total_days": int(p.get("total_lead_days", p.get("lead_days", 1) + p.get("transit_days", 1))),
                "seller": str(p.get("seller_name")),
                "city": str(p.get("city")),
                "trust": int(p.get("trust_score", 0)),
                "quality_stars": float(p.get("avg_quality_rating", 0) or 0)
            })

        prompt = f"""User query for ordering/ranking products: "{sanitize_prompt_text(query)}"

Candidate Products:
{json.dumps(candidates_summary, indent=2)}

Task:
Analyze the buyer's query intent. Rank ALL candidate product IDs from best match to worst match.
Provide a clear criteria summary and a 1-sentence reason for each product ID explaining why it placed where it did."""

        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SmartSortRanking,
                temperature=0.1
            )
        )

        if not response.text:
            return fallback_sort()

        parsed = SmartSortRanking.model_validate_json(response.text)
        ranked_id_map = {item.product_id: idx for idx, item in enumerate(parsed.ranked_items)}
        reasons_map = {item.product_id: item.rank_reason for item in parsed.ranked_items}

        # Sort products based on ranked_id_map (unranked items go to the end)
        sorted_products = sorted(
            products,
            key=lambda p: ranked_id_map.get(str(p.get("id")), 9999)
        )

        for p in sorted_products:
            p["ai_rank_reason"] = reasons_map.get(str(p.get("id")), f"Ranked for {parsed.criteria_detected}")

        return {
            "ranked_products": sorted_products,
            "criteria_detected": parsed.criteria_detected,
            "provider": "Google Gemini",
            "model": model,
            "is_fallback": False
        }
    except Exception as e:
        logger.warning(f"Smart sort Gemini call failed: {e}. Using fallback.")
        return fallback_sort()

