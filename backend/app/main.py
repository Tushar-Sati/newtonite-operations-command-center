from datetime import date, datetime, time, timedelta, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.access import accessible_team_ids
from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models import ActivityKind, ActivityRecord, IdempotencyRecord, Team, TeamMembership, TeamRole, User, WorkItem, WorkItemStatus
from app.schemas import DashboardResponse, ErrorResponse, LoginRequest, TokenResponse, UserResponse, WorkItemCreate, WorkItemResponse, WorkItemUpdate
from app.security import create_access_token, verify_password
from app.work_items import (
    WRITE_ROLES, add_activity, check_assignee_membership, commit_or_rollback,
    make_response, next_version_values, payload_hash, record_create_idempotency,
    replay_idempotent_create, require_item, transition_item,
)
from app.routers import activity as activity_router
from app.routers import approvals as approvals_router
from app.routers import teams as teams_router

app = FastAPI(title="Newtonite Operations API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in get_settings().cors_origins.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)
app.include_router(teams_router.router)
app.include_router(activity_router.router)
app.include_router(approvals_router.router)


def error_payload(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message}})


@app.exception_handler(HTTPException)
async def http_error_handler(_request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail and "message" in detail:
        return JSONResponse(status_code=exc.status_code, content={"error": detail}, headers=exc.headers)
    return error_payload("http_error", str(detail), exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request, _exc: RequestValidationError):
    return error_payload("validation_error", "Request validation failed", status.HTTP_422_UNPROCESSABLE_ENTITY)


@app.get("/health", response_model=dict[str, str], tags=["system"])
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unavailable", "database": "unavailable"})
    return {"status": "ok", "database": "ok"}


@app.post("/auth/login", response_model=TokenResponse, responses={401: {"model": ErrorResponse}})
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail={"code": "invalid_credentials", "message": "Email or password is incorrect"}, headers={"WWW-Authenticate": "Bearer"})
    token, expires = create_access_token(user.id)
    return TokenResponse(access_token=token, expires_in=expires)


@app.get("/auth/me", response_model=UserResponse, responses={401: {"model": ErrorResponse}})
def who_am_i(user: User = Depends(get_current_user)):
    return user


@app.post("/teams/{team_id}/work-items", response_model=WorkItemResponse, status_code=201,
          responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}})
def create_work_item(team_id: str, payload: WorkItemCreate,
                     idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=200),
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.access import require_team_role

    membership = require_team_role(db, user.id, team_id, WRITE_ROLES)
    request_hash = payload_hash(payload, team_id)
    replay = replay_idempotent_create(db, user.id, idempotency_key, request_hash)
    if replay is not None:
        return JSONResponse(status_code=201, content=replay)
    check_assignee_membership(db, team_id, payload.assignee_id)
    item = WorkItem(team_id=team_id, **payload.model_dump())
    db.add(item)
    try:
        db.flush()
        add_activity(db, team_id=team_id, actor_id=user.id, item=item, action="created work item", kind=ActivityKind.CREATED)
        body = make_response(item)
        record_create_idempotency(db, user.id, idempotency_key, request_hash, body)
        commit_or_rollback(db)
    except IntegrityError as exc:
        db.rollback()
        replay = replay_idempotent_create(db, user.id, idempotency_key, request_hash)
        if replay is not None:
            return JSONResponse(status_code=201, content=replay)
        if "work_items.key" in str(exc).lower() or "work_items_key" in str(exc).lower() or "uq_work" in str(exc).lower():
            raise HTTPException(409, detail={"code": "duplicate_work_item_key", "message": "Work item key already exists"}) from None
        raise
    except Exception:
        db.rollback()
        raise
    return body


@app.get("/teams/{team_id}/work-items", response_model=list[WorkItemResponse],
         responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})
def list_work_items(team_id: str, status_filter: WorkItemStatus | None = Query(default=None, alias="status"),
                    limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0),
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.access import require_team_role

    require_team_role(db, user.id, team_id)
    query = select(WorkItem).where(WorkItem.team_id == team_id)
    if status_filter is not None:
        query = query.where(WorkItem.status == status_filter)
    return db.scalars(query.order_by(WorkItem.updated_at.desc(), WorkItem.id).limit(limit).offset(offset)).all()


@app.get("/teams/{team_id}/work-items/{item_id}", response_model=WorkItemResponse,
         responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})
def get_work_item(team_id: str, item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return require_item(db, user, team_id, item_id)


@app.patch("/teams/{team_id}/work-items/{item_id}", response_model=WorkItemResponse,
           responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}})
def update_work_item(team_id: str, item_id: str, payload: WorkItemUpdate,
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.access import require_team_role

    membership = require_team_role(db, user.id, team_id, WRITE_ROLES)
    item = require_item(db, user, team_id, item_id, write=True)
    if item.version != payload.expected_version:
        raise HTTPException(409, detail={"code": "stale_version", "message": "Work item has changed; reload it and retry with the current version"})
    changes = payload.model_dump(exclude_unset=True, exclude={"expected_version"})
    if any(field in changes and changes[field] is None for field in ("title", "status", "priority")):
        raise HTTPException(422, detail={"code": "invalid_work_item_field", "message": "title, status, and priority cannot be null"})
    if "assignee_id" in changes:
        check_assignee_membership(db, team_id, changes["assignee_id"])
    kind, action = ActivityKind.UPDATED, "updated work item"
    if "status" in changes and changes["status"] is not None:
        requested = changes["status"]
        _new_status, kind, action = transition_item(item, requested, membership.role)
    if not changes:
        return item
    values = next_version_values(item, changes)
    result = db.execute(update(WorkItem).where(
        WorkItem.id == item_id, WorkItem.team_id == team_id, WorkItem.version == payload.expected_version
    ).values(**values).execution_options(synchronize_session=False))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, detail={"code": "stale_version", "message": "Work item has changed; reload it and retry with the current version"})
    try:
        add_activity(db, team_id=team_id, actor_id=user.id, item=item, action=action, kind=kind)
        commit_or_rollback(db)
    except Exception:
        db.rollback()
        raise
    db.refresh(item)
    return item


@app.post("/teams/{team_id}/work-items/{item_id}/claim", response_model=WorkItemResponse,
          responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}})
def claim_work_item(team_id: str, item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.access import require_team_role

    require_team_role(db, user.id, team_id, WRITE_ROLES)
    item = require_item(db, user, team_id, item_id, write=True)
    result = db.execute(update(WorkItem).where(
        WorkItem.id == item_id, WorkItem.team_id == team_id,
        WorkItem.status == WorkItemStatus.OPEN, WorkItem.assignee_id.is_(None),
        WorkItem.version == item.version,
    ).values(assignee_id=user.id, status=WorkItemStatus.IN_PROGRESS,
             version=WorkItem.version + 1, updated_at=datetime.now(timezone.utc)).execution_options(synchronize_session=False))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, detail={"code": "work_item_already_claimed", "message": "Work item is no longer available to claim"})
    try:
        add_activity(db, team_id=team_id, actor_id=user.id, item=item, action="claimed work item", kind=ActivityKind.CLAIMED)
        commit_or_rollback(db)
    except Exception:
        db.rollback()
        raise
    db.refresh(item)
    return item


@app.get("/dashboard", response_model=DashboardResponse, responses={401: {"model": ErrorResponse}})
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    team_ids = accessible_team_ids(db, user.id)
    scoped_items = select(WorkItem).where(WorkItem.team_id.in_(team_ids))
    now = datetime.now(timezone.utc)
    today = date.today()
    open_count = db.scalar(select(func.count()).select_from(WorkItem).where(WorkItem.team_id.in_(team_ids), WorkItem.status == WorkItemStatus.OPEN)) or 0
    in_progress_count = db.scalar(select(func.count()).select_from(WorkItem).where(WorkItem.team_id.in_(team_ids), WorkItem.status == WorkItemStatus.IN_PROGRESS)) or 0
    overdue_count = db.scalar(select(func.count()).select_from(WorkItem).where(WorkItem.team_id.in_(team_ids), WorkItem.due_date < today, WorkItem.status != WorkItemStatus.DONE)) or 0
    pending_approvals = db.scalar(select(func.count()).select_from(WorkItem).where(WorkItem.team_id.in_(team_ids), WorkItem.status == WorkItemStatus.IN_REVIEW)) or 0

    team_rows = db.execute(
        select(Team, func.count(func.distinct(TeamMembership.user_id)))
        .join(TeamMembership, TeamMembership.team_id == Team.id)
        .where(Team.id.in_(team_ids)).group_by(Team.id).order_by(Team.name)
    ).all()
    teams = []
    for team, members in team_rows:
        counts = db.execute(select(WorkItem.status, func.count()).where(WorkItem.team_id == team.id).group_by(WorkItem.status)).all()
        by_status = {row[0]: row[1] for row in counts}
        teams.append({"team_id": team.id, "team": team.name, "members": members, "open": by_status.get(WorkItemStatus.OPEN, 0), "in_progress": by_status.get(WorkItemStatus.IN_PROGRESS, 0), "capacity": team.capacity})

    week_start = (today - timedelta(days=today.weekday()))
    weekly = []
    for offset in range(6, -1, -1):
        start_date = week_start - timedelta(weeks=offset)
        start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        end = start + timedelta(days=7)
        created = db.scalar(select(func.count()).select_from(WorkItem).where(WorkItem.team_id.in_(team_ids), WorkItem.created_at >= start, WorkItem.created_at < end)) or 0
        completed = db.scalar(select(func.count()).select_from(WorkItem).where(WorkItem.team_id.in_(team_ids), WorkItem.status == WorkItemStatus.DONE, WorkItem.updated_at >= start, WorkItem.updated_at < end)) or 0
        weekly.append({"label": f"W{start_date.isocalendar().week:02d}", "created": created, "completed": completed})

    events = db.scalars(select(ActivityRecord).where(ActivityRecord.team_id.in_(team_ids)).order_by(ActivityRecord.occurred_at.desc()).limit(10)).all()
    actor_ids = {event.actor_id for event in events if event.actor_id}
    actors = {u.id: u.full_name for u in db.scalars(select(User).where(User.id.in_(actor_ids))).all()} if actor_ids else {}
    activity = [{"id": e.id, "actor": actors.get(e.actor_id, "Former user"), "action": e.action, "target": e.target, "timestamp": e.occurred_at, "kind": e.kind} for e in events]

    items = db.scalars(scoped_items.order_by(WorkItem.updated_at.desc()).limit(10)).all()
    assignee_ids = {item.assignee_id for item in items if item.assignee_id}
    assignees = {u.id: u.full_name for u in db.scalars(select(User).where(User.id.in_(assignee_ids))).all()} if assignee_ids else {}
    names = {team.id: team.name for team, _members in team_rows}
    work_items = [{"id": item.key, "title": item.title, "team": names.get(item.team_id, ""), "assignee": assignees.get(item.assignee_id, "Unassigned"), "status": item.status, "priority": item.priority, "due_date": item.due_date, "overdue": bool(item.due_date and item.due_date < today and item.status != WorkItemStatus.DONE)} for item in items]

    return {"kpis": {"open_items": open_count, "in_progress_items": in_progress_count, "overdue_items": overdue_count, "pending_approvals": pending_approvals, "deltas": {"open": 0, "in_progress": 0, "overdue": 0, "approvals": 0}}, "weekly": weekly, "teams": teams, "activity": activity, "work_items": work_items}
