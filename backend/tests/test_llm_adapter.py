import pytest
import os
import json
from unittest.mock import MagicMock, patch
from app.llm_adapter import (
    parse_disruption_text,
    test_ai_connection as check_ai_conn,
    sanitize_prompt_text,
    generate_chat_reply,
    smart_sort_products,
    DisruptionExtraction,
    _CACHE,
    _USER_RATE_LIMITS,
)

@pytest.fixture(autouse=True)
def clear_caches_and_env():
    """Clear in-memory cache and user rate limits between tests."""
    _CACHE.clear()
    _USER_RATE_LIMITS.clear()
    # Save original env
    orig_provider = os.environ.get("LLM_PROVIDER")
    orig_key = os.environ.get("GEMINI_API_KEY")
    orig_model = os.environ.get("GEMINI_MODEL")
    yield
    # Restore env
    if orig_provider is not None:
        os.environ["LLM_PROVIDER"] = orig_provider
    elif "LLM_PROVIDER" in os.environ:
        del os.environ["LLM_PROVIDER"]
        
    if orig_key is not None:
        os.environ["GEMINI_API_KEY"] = orig_key
    elif "GEMINI_API_KEY" in os.environ:
        del os.environ["GEMINI_API_KEY"]

    if orig_model is not None:
        os.environ["GEMINI_MODEL"] = orig_model
    elif "GEMINI_MODEL" in os.environ:
        del os.environ["GEMINI_MODEL"]

def test_privacy_sanitizer_removes_personal_data():
    """Ensures emails, GST numbers, and phone numbers are stripped before LLM prompt."""
    raw = "Supplier John at john@foundry.in (GST: 29AABCU9603R1Z7, ph +91 9876543210) reported 500 brake discs needed."
    clean = sanitize_prompt_text(raw)
    assert "john@foundry.in" not in clean
    assert "29AABCU9603R1Z7" not in clean
    assert "9876543210" not in clean
    assert "[REDACTED_EMAIL]" in clean
    assert "[REDACTED_GST]" in clean
    assert "500 brake discs" in clean

def test_gemini_success_structured_output():
    """Mock Gemini client success returning valid structured JSON."""
    os.environ["LLM_PROVIDER"] = "gemini"
    os.environ["GEMINI_API_KEY"] = "mock-valid-key"
    os.environ["GEMINI_MODEL"] = "gemini-2.5-flash"

    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "item": "Ceramic Composite Brake Pads",
        "quantity": 1000,
        "deadline_days": 3,
        "reason": "Foundry furnace downtime",
        "severity": "CRITICAL"
    })

    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response
        mock_client_cls.return_value = mock_client

        result = parse_disruption_text("Main plant shut down, need 1000 brake pads in 3 days", user_id="user_test_1")

        assert result["provider_used"] == "gemini"
        assert result["is_fallback"] is False
        assert result["data"]["quantity"] == 1000
        assert result["data"]["deadline_days"] == 3

def test_gemini_timeout_falls_back():
    """Mock Gemini timeout exception; should move down fallback chain gracefully."""
    os.environ["LLM_PROVIDER"] = "gemini"
    os.environ["GEMINI_API_KEY"] = "mock-key"

    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = TimeoutError("Deadline exceeded (15s)")
        mock_client_cls.return_value = mock_client

        result = parse_disruption_text("Need 500 brake pads in 2 days", user_id="user_test_2")

        assert result["provider_used"] == "fallback"
        assert result["is_fallback"] is True
        assert "AI is offline, using basic mode" in result["fallback_note"]
        assert result["data"]["quantity"] == 500
        assert result["data"]["deadline_days"] == 2

def test_gemini_invalid_json_retries_and_falls_back():
    """Mock Gemini returning invalid JSON schema; retries once and falls back gracefully."""
    os.environ["LLM_PROVIDER"] = "gemini"
    os.environ["GEMINI_API_KEY"] = "mock-key"

    mock_bad_response = MagicMock()
    mock_bad_response.text = json.dumps({"unknown_field": "corrupted text"})

    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_bad_response
        mock_client_cls.return_value = mock_client

        result = parse_disruption_text("Need 1000 brake pads in 3 days", user_id="user_test_3")

        # Must have retried (called generate_content twice) and fallen back safely
        assert mock_client.models.generate_content.call_count == 2
        assert result["provider_used"] == "fallback"
        assert result["is_fallback"] is True
        assert result["data"]["quantity"] == 1000

def test_gemini_rate_limit_backoff_and_fallback():
    """Mock Gemini 429 rate limit; tests backoff retry and graceful fallback."""
    os.environ["LLM_PROVIDER"] = "gemini"
    os.environ["GEMINI_API_KEY"] = "mock-key"

    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("429 Resource Exhausted: Rate limit reached")
        mock_client_cls.return_value = mock_client

        result = parse_disruption_text("Need 1000 brake pads in 3 days", user_id="user_test_4")

        assert mock_client.models.generate_content.call_count == 2
        assert result["provider_used"] == "fallback"
        assert result["is_fallback"] is True

def test_user_rate_limiter_20_per_minute():
    """Ensures user is capped at 20 AI calls per minute, falling back on 21st."""
    os.environ["LLM_PROVIDER"] = "gemini"
    os.environ["GEMINI_API_KEY"] = "mock-key"

    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "item": "Ceramic Composite Brake Pads",
        "quantity": 1000,
        "deadline_days": 3,
        "reason": "Test",
        "severity": "CRITICAL"
    })

    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response
        mock_client_cls.return_value = mock_client

        # Call 20 times with slightly different strings to bypass prompt cache
        for i in range(20):
            res = parse_disruption_text(f"Incident report #{i} need 1000 brake pads in 3 days", user_id="spam_user")
            assert res["provider_used"] == "gemini"

        # 21st call should be rate limited
        limited = parse_disruption_text("Incident report #21 need 1000 brake pads in 3 days", user_id="spam_user")
        assert limited["provider_used"] == "fallback"
        assert limited["is_fallback"] is True
        assert "Rate limit exceeded" in limited["fallback_reason"]

def test_unconfigured_llm_provider_works_offline():
    """Confirm app operates seamlessly when LLM_PROVIDER is unset and no keys exist."""
    if "LLM_PROVIDER" in os.environ:
        del os.environ["LLM_PROVIDER"]
    os.environ["GEMINI_API_KEY"] = ""

    result = parse_disruption_text("Main supplier plant shut down, need 1000 brake pads in 3 days")
    assert result["provider_used"] == "fallback"
    assert result["is_fallback"] is True
    assert result["data"]["quantity"] == 1000
    assert result["data"]["deadline_days"] == 3
    assert result["data"]["item"] == "Ceramic Composite Brake Pads"

    # Connection check returns offline message with fallback active
    conn = check_ai_conn()
    assert conn["status"] == "offline"
    assert "Local Regex" in conn["active_fallback"]

def test_generate_chat_reply_mock():
    """Test AI chat assistant generation with mocked Gemini response."""
    os.environ["LLM_PROVIDER"] = "gemini"
    os.environ["GEMINI_API_KEY"] = "mock-key"

    mock_resp = MagicMock()
    mock_resp.text = "GhostLoad AI optimizes multi-supplier recovery plans using OR-Tools."

    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        res = generate_chat_reply([{"role": "user", "content": "What is GhostLoad AI?"}], user_id="test_user")
        assert res["provider"] == "Google Gemini"
        assert res["is_fallback"] is False
        assert "OR-Tools" in res["reply"]

def test_smart_sort_products_mock():
    """Test AI smart sort ranking with mocked Gemini structured response."""
    os.environ["LLM_PROVIDER"] = "gemini"
    os.environ["GEMINI_API_KEY"] = "mock-key"

    mock_resp = MagicMock()
    mock_resp.text = json.dumps({
        "criteria_detected": "Fastest delivery under 2 days",
        "ranked_items": [
            {"product_id": "p3", "rank_reason": "Fastest 1-day delivery"},
            {"product_id": "p1", "rank_reason": "Meets 2-day SLA"},
            {"product_id": "p2", "rank_reason": "4 days lead time exceeds deadline"}
        ]
    })

    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        sample_products = [
            {"id": "p1", "title": "Brake A", "price_per_unit": 400, "total_lead_days": 2},
            {"id": "p2", "title": "Brake B", "price_per_unit": 200, "total_lead_days": 4},
            {"id": "p3", "title": "Brake C", "price_per_unit": 500, "total_lead_days": 1},
        ]
        res = smart_sort_products("fastest delivery within 2 days", sample_products, user_id="test_user")
        assert res["provider"] == "Google Gemini"
        assert res["is_fallback"] is False
        assert res["criteria_detected"] == "Fastest delivery under 2 days"
        assert res["ranked_products"][0]["id"] == "p3"
        assert res["ranked_products"][0]["ai_rank_reason"] == "Fastest 1-day delivery"

