from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import TeamMembership, TeamRole


def accessible_team_ids(db: Session, user_id: str) -> list[str]:
    return list(db.scalars(select(TeamMembership.team_id).where(TeamMembership.user_id == user_id)))


def require_team_role(db: Session, user_id: str, team_id: str, allowed: set[TeamRole] | None = None) -> TeamMembership:
    membership = db.scalar(select(TeamMembership).where(
        TeamMembership.user_id == user_id, TeamMembership.team_id == team_id
    ))
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "team_not_found", "message": "Team not found"})
    if allowed is not None and membership.role not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "insufficient_role", "message": "This role cannot perform the requested action"})
    return membership
