from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import require_team_role
from app.database import get_db
from app.deps import get_current_user
from app.models import ActivityRecord, TeamMembership, User, WorkItem
from app.schemas import ActivityRecordResponse, ActivityWorkItemReference

router = APIRouter(tags=["activity"])


@router.get("/teams/{team_id}/activity", response_model=list[ActivityRecordResponse])
def list_activity(
    team_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_team_role(db, user.id, team_id)
    rows = db.execute(
        select(ActivityRecord, User.full_name, WorkItem.id, WorkItem.key, WorkItem.title)
        .outerjoin(User, User.id == ActivityRecord.actor_id)
        .outerjoin(WorkItem, WorkItem.id == ActivityRecord.work_item_id)
        .where(ActivityRecord.team_id == team_id)
        .order_by(ActivityRecord.occurred_at.desc(), ActivityRecord.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return [
        ActivityRecordResponse(
            id=record.id,
            actor=actor_name or "Former user",
            action=record.action,
            kind=record.kind,
            occurred_at=record.occurred_at,
            work_item=(ActivityWorkItemReference(id=item_id, key=item_key, title=item_title) if item_id else None),
        )
        for record, actor_name, item_id, item_key, item_title in rows
    ]
