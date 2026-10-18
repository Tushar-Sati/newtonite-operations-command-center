# Newtonite Operations Command Center

Newtonite Operations is an operations command center for teams coordinating work, approvals, capacity, and risk. The dashboard surfaces current workload and decisions that need attention; team-scoped views let operators act on work and review an auditable history.

Architectural details, security boundaries, and concurrency decisions are documented in [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md).

## Product experience

- **Operations dashboard:** API-backed workload metrics, weekly throughput, team capacity, and recent activity.
- **Global Operations Network:** a lazy-loaded 3D topology of authorized teams, with workload signals and team details. Positions are illustrative because the API does not supply site coordinates. A 2D fallback is provided when WebGL is unavailable.
- **Work-item command board:** status lanes, priority and due-date risk, filtering, sorting, claims, detail history, and version-aware edits.
- **Approval decision queue:** manager/admin approval actions for eligible `in_review` items, prioritized by priority and age.
- **Team coverage:** membership, capacity, workload, bottleneck and overdue indicators.
- **Activity audit view:** team-scoped events with actor, category, timestamp, and event ID filters.
- **Authentication and access:** bearer-token login with server-side role and team-membership checks.

> **Data boundaries:** workload and event information comes from the configured API. Team throughput is only available as a global series in the current API. Network positions are not geographic locations, and the approval resource only returns in-review items.

## Screenshots and recordings

Add captures from a locally running, authenticated session here. No deployment URL or sample capture is implied.

- Dashboard screenshot placeholder
- Work-item board screenshot placeholder
- Operator workflow recording placeholder (GIF/video)

## Local development (Windows PowerShell)

Run the backend and frontend in separate PowerShell windows. Python 3.11+ and Node.js `^20.19.0` or `>=22.12.0` are required by the current toolchain.

### Backend

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[test]"
if (!(Test-Path .env)) { Copy-Item .env.example .env }
$env:APP_ENV = "development"
$env:DATABASE_URL = "sqlite:///./newtonite.db"
$env:JWT_SECRET_KEY = (py -c "import secrets; print(secrets.token_urlsafe(48))")
$env:CORS_ORIGINS = "http://localhost:5173"
$seedPassword = Read-Host "Set a local demo password (12+ characters)" -AsSecureString
$env:NEWTONITE_DEMO_PASSWORD = [System.Net.NetworkCredential]::new("", $seedPassword).Password
alembic upgrade head
python -m app.dev_seed
python -m uvicorn app.main:app --reload --port 8000
```

The seed is a deliberate, deterministic, development-only command. It refuses non-development and non-SQLite configuration and is safe to rerun. It creates seven operational teams, 78 synthetic accounts, 350 operational work items (50 per team), and 1,050 generated activity events. Demo logins are `newtonite-demo@example.com` (manager, all seven teams), `member-demo@example.com` (member, Logistics Control), `viewer-demo@example.com` (viewer, Compliance), and `admin-demo@example.com` (admin, Platform Reliability). Before the first seed, set `$env:NEWTONITE_DEMO_PASSWORD` to a local password of at least 12 characters; it is never printed or committed. If unset on a fresh database, the seed generates and prints a one-time password. Existing account passwords are preserved unless the variable is explicitly set. Use disposable local data only. The database file is ignored by Git.

### Frontend

In another PowerShell window, from the repository root:

```powershell
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm install
npm run dev -- --host localhost --port 5173
```

Open `http://localhost:5173` and use the development credentials printed by the seed command. The frontend reads `VITE_API_BASE_URL` from `.env.local`; the example points to the local API. Keep real secrets out of both environment templates and source control.

## Validation

Run from the repository root unless noted:

```powershell
npx tsc --noEmit
npm test
npm run lint
npm run build
git diff --check
```

Backend tests:

```powershell
cd backend
python -m pytest -v
```
The regular backend suite uses SQLite. PostgreSQL concurrency is not verified unless the PostgreSQL integration test is configured and actually runs against PostgreSQL; see [backend/README.md](backend/README.md#postgresql-integration-verification) for the exact setup.

## Repository structure

```text
backend/                  FastAPI app, SQLAlchemy models, Alembic migrations, pytest suite
src/components/           Shared UI, dashboard widgets, and operations network scene
src/lib/api/              Validated API client, response schemas, and TanStack Query options
src/lib/auth/             Login, session restoration, expiry handling, and route authorization
src/lib/ops/              Workflow filtering, sorting, risk, and transition helpers
src/routes/               Dashboard, work items, approvals, teams, activity, and login
src/test/                 Frontend API and route interaction tests
```

## Security and current limitations

The browser keeps the short-lived bearer token in `sessionStorage`; scripts on the same origin can access it, so an XSS vulnerability could expose the token. Backend endpoints remain the authorization boundary and recheck user, team membership, and role. A production deployment should use a reviewed CSP and consider an HttpOnly, Secure, SameSite cookie or backend-for-frontend session architecture.

No geographic coordinates, team-attributed throughput series, or blocked-approval endpoint are currently available. The interface labels those boundaries rather than inferring missing data.
