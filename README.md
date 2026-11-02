# GhostLoad AI: B2B Marketplace with Autonomous Emergency Recovery Layer

GhostLoad AI is a resilient B2B marketplace platform for mission-critical industrial manufacturing and automotive supply chains.

- **Normal Mode**: Browse, search, filter, compare, order, and review automotive parts with verified QC trust scores in a dedicated B2B marketplace.
- **GhostLoad Emergency Mode**: When primary suppliers fail, the multi-agent system uses Google OR-Tools linear programming to discover idle ("ghost") capacity across verified suppliers and synthesizes an optimal, SLA-compliant multi-supplier recovery plan with 24-hour capacity reservation locks.
- **Hard Governance**: The optimizer decides quantities and allocations; LLMs explain and summarize; human operators must confirm every plan; every decision is stored in an immutable audit ledger.

---

## Architecture & Technology Stack

- **Frontend**: Next.js 14 (App Router, TypeScript, Tailwind CSS, Lucide icons).
- **Backend**: Python FastAPI with SQLite accessed through an abstracted SQLAlchemy Repository pattern (portable schema to SAP HANA Cloud).
- **Optimization Solver**: Google OR-Tools (`pywraplp` GLOP / CBC).
- **LLM Adapter**: Google Gemini is the default active LLM provider using the official `google-genai` Python SDK (`gemini-2.5-flash`). Fallback chain seamlessly transitions to SAP Generative AI Hub (adapter implemented and ready, inactive unless configured) and deterministic regex/canned rules when offline.
- **Feature Flag System**: Centralized flags (`backend/app/features.py` and `frontend/src/config/features.ts`) partition live production modules from features marked "Coming soon" with disabled tooltips and preview screens.
- **Authentication**: Firebase Authentication verification with zero-network `DEMO_MODE=true` one-click persona switching (`Demo Buyer`, `Demo Seller`, `Demo QC Inspector`).

---

## Quick Start (Single Command per Server)

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Backend Server
```bash
# In one terminal:
cd backend && ./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Backend API will be accessible at: `http://localhost:8000`
Interactive Swagger API docs: `http://localhost:8000/docs`

### 2. Frontend Web App
```bash
# In a second terminal:
cd frontend && npm run start -- -p 3000
```
Web application will be accessible at: `http://localhost:3000`

---

## Running the Automated Test Suite

### 1. Pytest Test Suites (Optimizer & Ratings)
Verifies the exact slide scenario: Factory A (400), Warehouse B (300), Supplier C (300) totaling Rs 89,000, and verifies that verified delivery and quality ratings calibrate the seller Trust Score:
```bash
cd backend && PYTHONPATH=. ./venv/bin/pytest -v tests/
```

### 2. End-to-End Browser Click-Through
Runs the complete browser automation and regenerates screenshots into `docs/screens/`:
```bash
./backend/venv/bin/python run_full_demo_browser.py
```

---

## Seed Data & Demo Personas

The system comes pre-seeded with **12 hypothetical sellers** across Bengaluru, Chennai, Pune, and Hyderabad, 25 automotive products, and 3 enterprise buyers.

| Persona | Name | Role | City | Pre-Configured Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Buyer** | Apex Mobility Tech | `BUYER` | Bengaluru | Disruption reporting, search, compare, mock POs |
| **Seller** | Factory A (Precision Dynamics) | `SELLER` | Bengaluru | 400 units @ ₹80, 24h capacity lock response |
| **Seller** | Warehouse B (Chennai Hub) | `SELLER` | Chennai | 300 units @ ₹90, logistics hub |
| **Seller** | Supplier C (Pune Foundry) | `SELLER` | Pune | 300 units @ ₹100, heavy castings |
| **QC Inspector** | Sunil Sharma | `QC_INSPECTOR` | Bengaluru | Certificate approval/rejection queue |

---

## Environment Variables (.env)

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `LLM_PROVIDER` | `gemini` | Active LLM engine (`gemini`, `sap_genai`, or `canned`) |
| `GEMINI_API_KEY` | *(empty)* | Google GenAI API key (backend only, never leaked to UI/logs) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Configurable Gemini model name (e.g. `gemini-2.5-flash`, `gemini-2.5-pro`) |
| `LLM_TIMEOUT_SECONDS` | `15` | Request timeout before triggering fallback |
| `DEMO_MODE` | `true` | Enables 1-click persona switching with zero network dependency |
| `DATABASE_URL` | `sqlite:///./ghostload.db` | SQLAlchemy connection string (SAP HANA Cloud ready) |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | Backend API URL for frontend fetch |
| `AICORE_AUTH_URL` | *(optional)* | SAP AI Core OAuth endpoint (adapter ready, inactive unless configured) |
| `AICORE_CLIENT_ID` | *(optional)* | SAP AI Core Client ID |
| `AICORE_CLIENT_SECRET` | *(optional)* | SAP AI Core Secret |
| `AICORE_BASE_URL` | *(optional)* | SAP AI Core deployment base URL |

---

## Feature Flag Status

| Feature ID | Feature Name | Status | Browser Verification & Reason |
| :--- | :--- | :--- | :--- |
| `compare` | Side-by-Side Comparison | **Live** | Verified: Modal compares 3 items on price, lead time, trust score. |
| `reviews_and_ratings` | Verified Ratings & Reviews | **Live** | Verified: Quality/delivery stars submitted, tested via pytest. |
| `seller_replies` | Seller Dispute Replies | **Live** | Verified: 1-reply quota enforced and persisted to DB & audit log. |
| `qc_inspector_queue` | QC Inspector Queue | **Live** | Verified: Auto-flags ≤2 ratings, approves/rejects certifications. |
| `csv_export` | Audit Log CSV Export | **Live** | Verified: Generates RFC-compliant CSV stream from SQLite repository. |
| `google_signin` | Production Google Sign-in | *Coming soon* | Offline demo auth works; production Firebase tenant OAuth requires keys. |
| `ai_chat_assistant` | Interactive AI Copilot | **Live** | Verified: Interactive chat bot on `/chat` powered by Google Gemini (`gemini-3-flash-preview`). |
| `smart_sort` | Smart Sort (NLP) | **Live** | Verified: Natural language query reranking on marketplace with Gemini intent extraction and reasons. |
| `warehouse_transport_listings` | Warehouse & Fleet Transport | *Coming soon* | Dedicated freight reservation portal in development. |
| `route_map` | Live Route Map | *Coming soon* | Centered preview screen active; interactive GIS map canvas in development. |
| `learning_hub_panel` | Learning Hub LMS Sync | *Coming soon* | Reference modal built; full enterprise LMS sync integration in development. |
| `impact_panel` | ESG & Scope-3 Emissions | *Coming soon* | Centered preview screen active; carbon calculator in development. |
