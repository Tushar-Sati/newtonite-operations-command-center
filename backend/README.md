# Newtonite Operations API

FastAPI backend using SQLAlchemy 2, Alembic, Pydantic, and PostgreSQL-compatible configuration. The frontend connects through `VITE_API_BASE_URL`. Runtime configuration comes from environment variables or `backend/.env` (see `.env.example`). A file-backed SQLite URL is the local fallback; deploy with PostgreSQL and a strong `JWT_SECRET_KEY`.

## Structure

```text
backend/
  app/             settings, database, ORM models, schemas, security, access control, API
    routers/       team, activity, and approval resource routers
  migrations/      Alembic environment and versioned schema migrations
  tests/           API and isolation tests (SQLite)
  .env.example     placeholders only
  pyproject.toml   dependencies and pytest configuration
```

## Setup

### Backend (Windows PowerShell)

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[test]"
Copy-Item .env.example .env
$env:APP_ENV = "development"
$env:DATABASE_URL = "sqlite:///./newtonite.db"
$env:JWT_SECRET_KEY = (py -c "import secrets; print(secrets.token_urlsafe(48))")
$env:CORS_ORIGINS = "http://localhost:5173"
$seedPassword = Read-Host "Set a local demo password (12+ characters)" -AsSecureString
$env:NEWTONITE_DEMO_PASSWORD = [System.Net.NetworkCredential]::new("", $seedPassword).Password
alembic upgrade head
python -m app.dev_seed
uvicorn app.main:app --reload
```

The explicit seed command is development-only, refuses non-development or non-SQLite configuration, and is safe to rerun. It creates seven operational teams, 78 synthetic accounts, 350 operational work items (50 per team), and 1,050 generated activity events (three per item), plus the pre-existing private isolation fixture. Logistics Control and Workforce Planning model steadier, lower-risk queues; Incident Response, Customer Escalations, and Payments Operations have overdue work; Platform Reliability and Compliance surface blocked or approval queues. Demo accounts: Manager `newtonite-demo@example.com` (all seven teams), Member `member-demo@example.com` (Logistics Control), Viewer `viewer-demo@example.com` (Compliance), and Admin `admin-demo@example.com` (Platform Reliability). Set `$env:NEWTONITE_DEMO_PASSWORD` to a local password of at least 12 characters before the first seed; the value is not printed or committed. If omitted on an empty database, one randomly generated password is printed once for newly created accounts. Existing passwords are preserved unless the environment variable is explicitly set. Use disposable local data only. For PostgreSQL, use `postgresql+psycopg://user:password@host:5432/database`; never commit `.env` or any real secret. The JWT secret above is randomly generated for this shell session.

### Frontend (separate PowerShell window)

Install Bun if needed (`winget install --id Oven-sh.Bun -e`), reopen PowerShell, then from the repository root:

```powershell
Copy-Item .env.example .env.local
bun install --frozen-lockfile
bun run dev -- --host localhost --port 5173
```

The root `.env.example` points to the local API at `http://localhost:8000`. Run the frontend and backend in separate windows. Sign in with the local demo credentials printed by `python -m app.dev_seed`.

The frontend reads `VITE_API_BASE_URL` (copy the repository `.env.example` to `.env.local`). Configure `CORS_ORIGINS` as a comma-separated list of exact browser origins, including the frontend development origin. The default allows `http://localhost:5173` without cookies; bearer authorization is sent in the `Authorization` header.

The frontend stores its short-lived bearer token in `sessionStorage`. This limits persistence to the browser tab session, but any JavaScript running on the origin can read it; an XSS flaw could steal the token. The backend remains the authorization boundary and rechecks the active user and team role on every request. Production hardening should add a strict Content Security Policy and consider an HttpOnly, Secure, SameSite cookie or a backend-for-frontend session design. This milestone keeps the existing bearer-token contract to avoid changing the frontend/backend authentication behavior during integration.

## API and authorization

- `GET /health`: checks application and database connectivity.
- `POST /auth/login`: accepts email/password and returns a short-lived HS256 bearer token.
- `GET /auth/me`: returns the authenticated user.
- `GET /teams`: returns the caller's teams, own role, capacity, and active member count.
- `GET /teams/{team_id}/members`: returns active member IDs, display names, and team roles. Email addresses and authentication fields are omitted.
- `GET /teams/{team_id}/activity?limit=50&offset=0`: returns team activity (`limit` 1–100, `offset` ≥0) ordered by `occurred_at` descending, then record ID descending. Each row includes `id`, actor display name, action, kind, `occurred_at`, and a nullable work-item reference (`id`, `key`, `title`). The current activity schema has no additional metadata field.
- `GET /teams/{team_id}/approvals`: returns work items in `in_review` for a team member.
- `POST /teams/{team_id}/approvals/{item_id}/approve`: accepts `{ "expected_version": 1 }`; manager/admin membership is required. It moves an in-review item to `done`, increments its version, and records approval activity atomically.
- `GET /dashboard`: returns the dashboard aggregate for teams in the authenticated user's memberships. Team workload entries include `team_id` so clients can use the team-scoped work item routes.
- `POST /teams/{team_id}/work-items`: creates an item. Requires `Idempotency-Key` (8–200 chars). Body fields: `key`, `title`, optional `description`, `assignee_id`, `priority`, and `due_date`.
- `GET /teams/{team_id}/work-items`: paginated team list (`limit` 1–100, `offset` ≥0), optionally filtered by `status`.
- `GET /teams/{team_id}/work-items/{item_id}`: reads one item in the named team.
- `PATCH /teams/{team_id}/work-items/{item_id}`: updates supplied fields and requires `expected_version` (integer ≥1). Successful changes increment `version`.
- `POST /teams/{team_id}/work-items/{item_id}/claim`: atomically claims an open, unassigned item for the authenticated user and changes it to `in_progress`.

Work item responses include `id`, `key`, title/description, `team_id`, `assignee_id`, status, priority, due date, `version`, and timestamps. All routes require a bearer token. Team members can read; `admin`, `manager`, and `member` can write; viewers are read-only. A user can assign only a user who belongs to that team.

Workflow transitions are `open → in_progress|blocked`, `in_progress → blocked|in_review`, `blocked → in_progress`, and `in_review → in_progress|done`. `in_review → done` is the approval transition and requires team `manager` or `admin`, through either the guarded work-item update contract or the explicit approvals endpoint. `done` is terminal. Invalid transitions return 409. The approvals queue reuses `in_review`; no separate approval table is needed. Approval uses an atomic status-and-version conditional update, so only one concurrent request can advance a version. Successful approval and its activity event commit together.

Errors use `{ "error": { "code": "...", "message": "..." } }`. Missing/invalid authentication returns 401; membership/resource isolation returns 404; insufficient role returns 403; invalid fields return 422; invalid transitions, stale `expected_version`, unavailable claims, duplicate keys, idempotency-key payload mismatches, and approvals not in the pending state return 409. Reusing a create idempotency key with the same canonical request returns the original 201 response; reusing it with a different request returns `idempotency_key_reused`.

Create writes the work item, its activity row, and its idempotency response in one transaction. Update and claim each write the conditional item change and activity row in one transaction. Claims use a single conditional SQL `UPDATE` requiring open status, no assignee, and the observed version; a row count of zero is a conflict. Updates use `WHERE version = expected_version`, then increment the version. Idempotency uniqueness is enforced by a database constraint on actor, operation, and key.

Passwords use Argon2 through pwdlib. The token subject is the user ID; the server loads the active user from the database on every protected request. Roles are `admin`, `manager`, `member`, and `viewer`, assigned per team in `team_memberships`. Never accept a client-supplied identity or role as authorization evidence. `require_team_role` and `accessible_team_ids` are the server-side access-control primitives. Unlinked team IDs resolve as not found to avoid revealing their existence.

Dashboard output uses snake_case (`work_items`, `due_date`, `in_progress_items`). The pending approvals KPI counts `in_review` work items in the caller's teams; historical comparison deltas remain zero because no comparison history is stored. The frontend validates this response and maps it to component-facing types.

## Migrations and tests

```powershell
alembic upgrade head
pytest
```

Tests use in-memory SQLite for regular API behavior and a temporary file-backed SQLite database with independent sessions for simultaneous claims. Run `pytest` from `backend/`. The simultaneous claim check passed on SQLite only; PostgreSQL behavior has not been run or verified. PostgreSQL URL support is configured through psycopg 3.

## PostgreSQL integration verification

Install/start PostgreSQL and create a disposable test database. In PowerShell from `backend/`:

```powershell
createdb -U postgres newtonite_test
$env:TEST_DATABASE_URL = "postgresql+psycopg://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/newtonite_test"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
alembic upgrade head
pytest -v tests/test_postgres_concurrency.py
pytest
```

The PostgreSQL concurrency test uses two independent sessions and removes its own inserted records afterward. It is skipped unless `TEST_DATABASE_URL` is set. The full regular suite continues to use SQLite fixtures. Do not point the integration test at a production database. PostgreSQL-specific behavior is not verified until this marked test actually runs successfully against PostgreSQL.
