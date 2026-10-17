from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.access import require_team_role
from app.database import get_db
from app.deps import get_current_user
from app.models import ActivityKind, ActivityRecord, TeamRole, User, WorkItem, WorkItemStatus
from app.schemas import ApprovalRequest, WorkItemResponse
from app.work_items import APPROVAL_ROLES, add_activity, commit_or_rollback

router = APIRouter(tags=["approvals"])


@router.get("/teams/{team_id}/approvals", response_model=list[WorkItemResponse])
def list_pending_approvals(team_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_team_role(db, user.id, team_id)
    return db.scalars(
        select(WorkItem)
        .where(WorkItem.team_id == team_id, WorkItem.status == WorkItemStatus.IN_REVIEW)
        .order_by(WorkItem.updated_at.desc(), WorkItem.id.desc())
    ).all()


@router.post("/teams/{team_id}/approvals/{item_id}/approve", response_model=WorkItemResponse)
def approve_work_item(
    team_id: str,
    item_id: str,
    payload: ApprovalRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_team_role(db, user.id, team_id, APPROVAL_ROLES)
    item = db.scalar(select(WorkItem).where(WorkItem.id == item_id, WorkItem.team_id == team_id))
    if item is None:
        raise HTTPException(404, detail={"code": "work_item_not_found", "message": "Work item not found"})
    if item.version != payload.expected_version:
        raise HTTPException(409, detail={"code": "stale_version", "message": "Work item has changed; reload it and retry with the current version"})
    if item.status != WorkItemStatus.IN_REVIEW:
        raise HTTPException(409, detail={"code": "approval_not_pending", "message": "Only work items in review can be approved"})

    result = db.execute(
        update(WorkItem)
        .where(
            WorkItem.id == item_id,
            WorkItem.team_id == team_id,
            WorkItem.status == WorkItemStatus.IN_REVIEW,
            WorkItem.version == payload.expected_version,
        )
        .values(
            status=WorkItemStatus.DONE,
            version=WorkItem.version + 1,
            updated_at=datetime.now(timezone.utc),
        )
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, detail={"code": "stale_version", "message": "Work item has changed; reload it and retry with the current version"})
    try:
        db.add(ActivityRecord(
            team_id=team_id,
            actor_id=user.id,
            work_item_id=item.id,
            action="approved work item",
            target=f"{item.key} {item.title}",
            kind=ActivityKind.APPROVED.value,
        ))
        commit_or_rollback(db)
    except Exception:
        db.rollback()
        raise
    db.refresh(item)
    return item
