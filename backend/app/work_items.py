import hashlib
import json
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.access import require_team_role
from app.models import ActivityKind, ActivityRecord, IdempotencyRecord, TeamRole, User, WorkItem, WorkItemStatus
from app.schemas import WorkItemCreate, WorkItemResponse

ALLOWED_TRANSITIONS = {
    WorkItemStatus.OPEN: {WorkItemStatus.IN_PROGRESS, WorkItemStatus.BLOCKED},
    WorkItemStatus.IN_PROGRESS: {WorkItemStatus.BLOCKED, WorkItemStatus.IN_REVIEW},
    WorkItemStatus.BLOCKED: {WorkItemStatus.IN_PROGRESS},
    WorkItemStatus.IN_REVIEW: {WorkItemStatus.IN_PROGRESS, WorkItemStatus.DONE},
    WorkItemStatus.DONE: set(),
}
APPROVAL_ROLES = {TeamRole.ADMIN, TeamRole.MANAGER}
WRITE_ROLES = {TeamRole.ADMIN, TeamRole.MANAGER, TeamRole.MEMBER}


def require_item(db: Session, user: User, team_id: str, item_id: str, write: bool = False) -> WorkItem:
    require_team_role(db, user.id, team_id, WRITE_ROLES if write else None)
    item = db.scalar(select(WorkItem).where(WorkItem.id == item_id, WorkItem.team_id == team_id))
    if item is None:
        raise HTTPException(404, detail={"code": "work_item_not_found", "message": "Work item not found"})
    return item


def check_assignee_membership(db: Session, team_id: str, assignee_id: str | None) -> None:
    if assignee_id is None:
        return
    from app.models import TeamMembership

    membership = db.scalar(select(TeamMembership).where(TeamMembership.team_id == team_id, TeamMembership.user_id == assignee_id))
    if membership is None:
        raise HTTPException(422, detail={"code": "invalid_assignee", "message": "Assignee must belong to this team"})


def add_activity(db: Session, *, team_id: str, actor_id: str, item: WorkItem, action: str, kind: ActivityKind) -> None:
    db.add(ActivityRecord(team_id=team_id, actor_id=actor_id, work_item_id=item.id, action=action, target=f"{item.key} {item.title}", kind=kind.value))


def payload_hash(payload: WorkItemCreate, team_id: str) -> str:
    serialized = json.dumps({"team_id": team_id, **payload.model_dump(mode="json")}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode()).hexdigest()


def replay_idempotent_create(db: Session, actor_id: str, key: str, request_hash: str) -> dict | None:
    prior = db.scalar(select(IdempotencyRecord).where(
        IdempotencyRecord.actor_id == actor_id,
        IdempotencyRecord.operation == "create_work_item",
        IdempotencyRecord.key == key,
    ))
    if prior is None:
        return None
    if prior.request_hash != request_hash:
        raise HTTPException(409, detail={"code": "idempotency_key_reused", "message": "Idempotency-Key was already used with a different request"})
    return prior.response_body


def record_create_idempotency(db: Session, actor_id: str, key: str, request_hash: str, body: dict) -> None:
    db.add(IdempotencyRecord(actor_id=actor_id, operation="create_work_item", key=key, request_hash=request_hash, response_status=201, response_body=body))


def make_response(item: WorkItem) -> dict:
    return WorkItemResponse.model_validate(item).model_dump(mode="json")


def commit_or_rollback(db: Session) -> None:
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def transition_item(item: WorkItem, requested: WorkItemStatus, role: TeamRole) -> tuple[WorkItemStatus, ActivityKind, str]:
    if requested == item.status:
        return requested, ActivityKind.UPDATED, "updated work item"
    if requested not in ALLOWED_TRANSITIONS[item.status]:
        raise HTTPException(409, detail={"code": "invalid_workflow_transition", "message": f"Transition from {item.status.value} to {requested.value} is not allowed"})
    if item.status == WorkItemStatus.IN_REVIEW and requested == WorkItemStatus.DONE:
        if role not in APPROVAL_ROLES:
            raise HTTPException(403, detail={"code": "approval_forbidden", "message": "Only team managers or admins may approve work items"})
        return requested, ActivityKind.APPROVED, "approved work item"
    return requested, ActivityKind.UPDATED, f"moved work item to {requested.value}"


def next_version_values(item: WorkItem, changes: dict) -> dict:
    changes["version"] = item.version + 1
    changes["updated_at"] = datetime.now(timezone.utc)
    return changes
