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
- **LLM Adapter**: Unified interface supporting SAP Generative AI Hub (`gen_ai_hub`), regex fallback parser, and canned demo responses.
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
| `DEMO_MODE` | `true` | Enables 1-click persona switching with zero network dependency |
| `DATABASE_URL` | `sqlite:///./ghostload.db` | SQLAlchemy connection string (SAP HANA Cloud ready) |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | Backend API URL for frontend fetch |
| `AICORE_AUTH_URL` | *(optional)* | SAP AI Core OAuth endpoint |
| `AICORE_CLIENT_ID` | *(optional)* | SAP AI Core Client ID |
| `AICORE_CLIENT_SECRET` | *(optional)* | SAP AI Core Secret |
| `AICORE_BASE_URL` | *(optional)* | SAP AI Core deployment base URL |
