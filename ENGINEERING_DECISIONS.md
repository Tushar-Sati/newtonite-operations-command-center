# Newtonite Operations — Engineering Decisions

This document details the core architectural decisions, concurrency models, security controls, and testing trade-offs implemented in Newtonite Operations Under Pressure.

---

## 1. Role-Based Authorization and Multi-Tenant Team Isolation

### Context
Newtonite Operations requires fine-grained access control across teams with varying levels of trust: `admin`, `manager`, `member`, and `viewer`. Team members must never view, mutate, or enumerate resources belonging to teams in which they hold no membership.

### Implementation
- **Data Model:** Team memberships are modeled via `TeamMembership` associating a `User` and `Team` with an explicit `TeamRole` enum (`admin`, `manager`, `member`, `viewer`).
- **Enforcement Boundary:** Server-side primitives in `backend/app/access.py` (`require_team_role` and `accessible_team_ids`) govern all protected endpoints. Identity or role assertions sent by client payloads are never trusted.
- **Resource Masking:** If a user requests a work item, activity stream, or approval queue for a team they do not belong to, `require_team_role` raises HTTP `404 Not Found` rather than `403 Forbidden`. This deliberate design eliminates resource enumeration and prevents leaking the existence of private teams.
- **Role Hierarchy:**
  - `WRITE_ROLES = {admin, manager, member}`: Permitted to create, claim, and update work items.
  - `APPROVAL_ROLES = {admin, manager}`: Strictly required to approve work items in review (`in_review → done`).
  - `viewer`: Read-only access across all team-scoped queries.
- **Frontend Alignment:** The UI adapts conditionally (e.g., displaying "Manager or admin required" in `/approvals` and disabling claim buttons for viewers), while the backend enforces strict authorization on every transaction.

---

## 2. Optimistic Concurrency Control and Conflict Handling

### Context
Multiple team members frequently collaborate on shared work items (e.g., claiming unassigned tasks, modifying priorities, or submitting approvals). Pessimistic locking creates database contention, connection pool exhaustion, and deadlock risks under high load.

### Implementation
- **Version Tracking:** Every `WorkItem` record maintains a monotonically increasing integer `version` field (initialized to `1`).
- **Conditional Mutations:**
  - Updates (`PATCH /teams/{team_id}/work-items/{item_id}`) require `expected_version` in the request payload. The database execute query uses atomic conditional filtering:
    ```sql
    UPDATE work_items
    SET ..., version = version + 1, updated_at = :now
    WHERE id = :item_id AND team_id = :team_id AND version = :expected_version
    ```
  - If `result.rowcount != 1`, another actor has mutated the item. The backend immediately rolls back the transaction and returns HTTP `409 Conflict` with `{"error": {"code": "stale_version", "message": "Work item has changed; reload it and retry with the current version"}}`.
- **Atomic Claims:** Claiming an open item (`POST /teams/{team_id}/work-items/{item_id}/claim`) uses compare-and-set semantics:
  ```sql
  UPDATE work_items
  SET assignee_id = :user_id, status = 'in_progress', version = version + 1, updated_at = :now
  WHERE id = :item_id AND team_id = :team_id AND status = 'open' AND assignee_id IS NULL AND version = :version
  ```
  If already claimed or status changed, row count is `0`, triggering HTTP `409 Conflict` (`work_item_already_claimed`).
- **Client Conflict Recovery:** In `src/routes/work-items.tsx` and `src/routes/approvals.tsx`, TanStack Query mutation hooks trap 409 responses, display targeted conflict alerts to the user, and automatically invalidate the query cache to reload the newest server state without crashing.

---

## 3. Idempotent Creation and Transactional Activity History

### Context
Network retries, double form submissions, or client timeouts can result in duplicate work items. Furthermore, auditability requires that work item state changes and their corresponding activity records are always synchronized.

### Implementation
- **Idempotency Keys:** Work item creation (`POST /teams/{team_id}/work-items`) mandates an `Idempotency-Key` header (8–200 characters).
- **Payload Verification:** The server hashes the canonical request payload and team ID (`SHA-256`). If the key already exists:
  - Identical hash: The server replays the original HTTP 201 response body without re-inserting records (`replay_idempotent_create`).
  - Differing hash: The server rejects the request with HTTP `409 Conflict` (`idempotency_key_reused`).
  - Database constraint `uq_idempotency_actor_operation_key` on `(actor_id, operation, key)` guarantees uniqueness at the storage layer.
- **Transactional Atomicity:** When creating, updating, claiming, or approving a work item, the item change, its corresponding `ActivityRecord`, and any idempotency response are written inside a single database transaction (`commit_or_rollback`). If activity creation fails, the entire transaction is rolled back, guaranteeing zero orphaned work items or phantom events.

---

## 4. Authentication Architecture and Token Storage Trade-offs

### Context
Stateless REST APIs require token-based authentication. Client-side token storage involves trade-offs between cross-site scripting (XSS), cross-site request forgery (CSRF), and operational simplicity.

### Implementation & Trade-off Analysis
- **Credential Hashing & JWTs:** Passwords are hashed with Argon2 via `pwdlib`. Authentication returns short-lived HMAC-SHA256 JSON Web Tokens (30-minute expiry) with the user ID in the subject (`sub`) claim.
- **Client Storage (`sessionStorage`):** The frontend stores the access token in browser `sessionStorage` (`newtonite.access-token`).
  - *Benefits:* Scoped strictly to the browser tab session. Automatically cleared on tab close. Prevents CSRF vulnerabilities because credentials are not automatically dispatched via ambient cookie storage and must be explicitly set in the `Authorization: Bearer <token>` header.
  - *Trade-off:* Vulnerable to exfiltration if a cross-site scripting (XSS) vulnerability exists on the origin.
- **Session Lifecycle & Error Boundaries:**
  - The API client (`src/lib/api/client.ts`) attaches the bearer token to outgoing requests.
  - Upon receiving an HTTP 401 response, `clearAccessToken()` wipes storage and dispatches a global `newtonite:unauthorized` window event.
  - `AuthProvider` catches this event, clears the TanStack Query cache, nullifies user state, and cleanly redirects to `/login`.
- **Production Recommendation:** For production deployments outside this evaluation milestone, implement HttpOnly, Secure, SameSite cookies backed by a Backend-for-Frontend (BFF) session proxy with strict Content Security Policy (CSP) headers.

---

## 5. Database Configuration, Testing Strategy, and Limitations

### Context
Newtonite Operations is designed for production deployment on PostgreSQL while offering frictionless, zero-dependency local development via SQLite.

### Implementation
- **SQLAlchemy 2 & Alembic:** All models use declarative mapped columns (`Mapped[...]`). Schema versions are managed via Alembic migrations (`backend/migrations/versions/`).
- **PostgreSQL Compatibility:** Connection strings use `postgresql+psycopg://...`. Model definitions avoid SQLite-specific constructs and use standard SQL types.
- **Development Safeguards:** The demo seed command (`backend/app/dev_seed.py`) enforces strict environment checks:
  ```python
  if settings.app_env.lower() != "development":
      raise SystemExit("Refusing to seed: APP_ENV must be development")
  if not settings.database_url.startswith("sqlite:"):
      raise SystemExit("Refusing to seed: the development seed only supports SQLite")
  ```
  This prevents accidental seeding or data loss on staging or production PostgreSQL databases.

### Verification Strategy & Known Limitations
- **Unit & Integration Suite:**
  - Backend: 20 pytest tests covering authentication, team isolation, CRUD scoping, idempotency replays, rollback consistency, and SQLite multi-thread claim races.
  - Frontend: 18 Vitest tests covering API clients, query options, routing guards, and UI interactions.
- **End-to-End Verification:** 9 complete browser flows verified live using real browser subagents against local frontend and backend services.
- **Known Limitation — PostgreSQL Concurrency:**
  - **Explicit Status:** **UNVERIFIED.**
  - The PostgreSQL concurrency test (`tests/test_postgres_concurrency.py`) verifies row-level conditional locking across independent PostgreSQL sessions, but requires a live PostgreSQL instance and `TEST_DATABASE_URL`.
  - In environments without an active PostgreSQL service, this test is marked as skipped. SQLite file-locking tests cannot and do not prove PostgreSQL row-level concurrency behavior under high parallel load. PostgreSQL concurrency must be verified in a dedicated staging environment prior to production deployment.
