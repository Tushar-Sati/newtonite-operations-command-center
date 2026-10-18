# Newtonite Operations Under Pressure

An enterprise operations platform integrating a React / TanStack frontend with a FastAPI / SQLAlchemy backend, featuring team-scoped access control, optimistic concurrency, idempotent workflows, and audited activity streams.

Architectural details, security boundaries, and concurrency decisions are documented in [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md).

---

## Prerequisites

- **Python:** 3.11+
- **Node.js:** 18+ (tested on Node 20 / Node 26) with `npm`

---

## Quickstart

Run the backend and frontend in separate terminal windows.

### 1. Backend Service (FastAPI)

From the `backend/` directory in PowerShell or Bash:

```powershell
cd backend

# Create and activate virtual environment (optional but recommended)
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install package and test dependencies in editable mode
python -m pip install -e ".[test]"

# Configure local development environment
Copy-Item .env.example .env
$env:APP_ENV = "development"
$env:DATABASE_URL = "sqlite:///./newtonite.db"
$env:JWT_SECRET_KEY = "test-secret-key-that-is-at-least-32-bytes-long-for-jwt"
$env:CORS_ORIGINS = "http://localhost:5173"

# Run database migrations and seed local demo data
alembic upgrade head
python -m app.dev_seed

# Start the backend server on port 8000
python -m uvicorn app.main:app --port 8000
```

> **Local Demo Credentials (Development Only):**
> - **Manager Account:** `newtonite-demo@example.com` / `DemoNewtonite2026!`
> - **Member Account:** `member-demo@example.com` / `DemoNewtonite2026!` (if seeded)
>
> *Note:* The seed command strictly refuses execution if `APP_ENV != "development"` or if `DATABASE_URL` is not SQLite.

---

### 2. Frontend Application (TanStack Start / Vite)

From the repository root in a separate terminal window:

```powershell
# Copy environment template to .env.local (ignored by Git)
Copy-Item .env.example .env.local

# Install dependencies
npm install

# Start the frontend dev server on port 5173
npm run dev -- --host localhost --port 5173
```

Open [http://localhost:5173](http://localhost:5173) in your browser and sign in using the demo credentials above.

---

## Verification & Testing

### Backend Test Suite
```powershell
cd backend
python -m pytest -v
```
- Runs 20 unit and isolation tests covering authentication, team isolation, idempotency replay, workflow transitions, rollback atomicity, and simultaneous SQLite claim races.
- *PostgreSQL Concurrency:* The marked test `tests/test_postgres_concurrency.py` requires a live PostgreSQL instance and is automatically skipped unless `TEST_DATABASE_URL` is set (see [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md)).

### Frontend Test Suite
```powershell
npm test
```
- Runs 18 Vitest unit and component tests covering API client requests, TanStack Query options, route protection, and work item interactions.

### Type Check & Production Build
```powershell
npx tsc --noEmit
npm run build
```
- Validates strict TypeScript compilation and builds the client and SSR bundles.

### Git Diff Check
```powershell
git diff --check
```
- Verifies that no whitespace errors, conflict markers, or malformed diffs exist.

---

## Repository Structure

```text
├── backend/
│   ├── app/             # FastAPI routers, models, schemas, access control, security
│   ├── migrations/      # Alembic migration scripts
│   ├── tests/           # Pytest suite (API, resource isolation, concurrency)
│   ├── alembic.ini      # Alembic migration configuration
│   ├── pyproject.toml   # Python package & dependency definitions
│   └── README.md        # Dedicated backend documentation
├── src/
│   ├── components/      # UI components (dashboard widgets, common primitives)
│   ├── lib/api/         # API client, TanStack Query options, response types
│   ├── lib/auth/        # React AuthProvider and session lifecycle
│   ├── routes/          # TanStack Router pages (dashboard, teams, work items, approvals, activity, login)
│   └── test/            # Vitest component and interaction tests
├── ENGINEERING_DECISIONS.md # Architectural decisions and concurrency analysis
├── .env.example         # Root environment template
└── package.json         # Frontend dependencies and scripts
```
