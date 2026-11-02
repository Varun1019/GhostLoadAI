"""
Central Feature Flags Configuration for GhostLoad AI.
Features are marked 'live' only if verified by tests and browser automation.
"""
from typing import Dict, Any, Optional
from fastapi import HTTPException

FEATURES: Dict[str, Dict[str, Any]] = {
    "google_signin": {
        "status": "coming_soon",
        "name": "Production Google Sign-in",
        "description": "Direct Firebase OAuth requires configured cloud tenant keys. Use Demo Mode.",
    },
    "ai_chat_assistant": {
        "status": "live",
        "name": "Interactive AI Procurement Copilot",
        "description": "Conversational assistant powered by Google Gemini for querying supplier constraints and logistics.",
    },
    "smart_sort": {
        "status": "live",
        "name": "Smart Sort (NLP Query Ranking)",
        "description": "Natural language query semantics reranker powered by Google Gemini structured outputs.",
    },
    "compare": {
        "status": "live",
        "name": "Side-by-Side Comparison",
        "description": "Compare up to 3 candidate components side-by-side on price, SLA, and trust.",
    },
    "reviews_and_ratings": {
        "status": "live",
        "name": "Verified Ratings & Reviews",
        "description": "Two-factor quality and delivery rating after goods-receipt inspection.",
    },
    "seller_replies": {
        "status": "live",
        "name": "Seller Dispute Replies",
        "description": "Single-reply seller response to verified buyer ratings.",
    },
    "qc_inspector_queue": {
        "status": "live",
        "name": "QC Inspector Queue",
        "description": "Audit ISO/IATF certificate filings and investigate low-rating alerts.",
    },
    "warehouse_transport_listings": {
        "status": "coming_soon",
        "name": "Warehouse Space & Fleet Transport",
        "description": "Dedicated bay allocation and telematics-connected transport reservations.",
    },
    "csv_export": {
        "status": "live",
        "name": "Audit Log CSV Export",
        "description": "Download immutable chronological ledger of all decisions as CSV.",
    },
    "route_map": {
        "status": "coming_soon",
        "name": "Live Supply Chain Route Map",
        "description": "Interactive geographical transit routing and multi-hub freight tracking.",
    },
    "learning_hub_panel": {
        "status": "coming_soon",
        "name": "Enterprise Learning Hub LMS",
        "description": "Procurement team training sync with SAP SuccessFactors / LMS.",
    },
    "impact_panel": {
        "status": "coming_soon",
        "name": "ESG & Scope-3 Emissions Analytics",
        "description": "Calculates carbon and freight emissions delta for multi-supplier routing.",
    },
}

def is_feature_live(feature_key: str) -> bool:
    feat = FEATURES.get(feature_key)
    if not feat:
        return False
    return feat.get("status") == "live"

def require_feature(feature_key: str):
    """
    FastAPI dependency / guard to reject requests to unreleased features.
    """
    feat = FEATURES.get(feature_key)
    if not feat or feat.get("status") != "live":
        desc = feat.get("description", "This capability is currently in development.") if feat else "Feature not found."
        raise HTTPException(
            status_code=403,
            detail=f"Feature '{feature_key}' is Coming Soon: {desc}"
        )
