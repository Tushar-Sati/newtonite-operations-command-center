from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.access import require_team_role
from app.database import get_db
from app.deps import get_current_user
from app.models import Team, TeamMembership, User
from app.schemas import TeamMemberResponse, TeamResponse

router = APIRouter(tags=["teams"])


@router.get("/teams", response_model=list[TeamResponse])
def list_teams(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    my_membership = aliased(TeamMembership)
    rows = db.execute(
        select(Team, my_membership.role)
        .join(my_membership, my_membership.team_id == Team.id)
        .where(my_membership.user_id == user.id)
        .order_by(Team.name, Team.id)
    ).all()
    team_ids = [team.id for team, _role in rows]
    counts = dict(db.execute(
        select(TeamMembership.team_id, func.count(TeamMembership.user_id))
        .join(User, User.id == TeamMembership.user_id)
        .where(TeamMembership.team_id.in_(team_ids), User.is_active.is_(True))
        .group_by(TeamMembership.team_id)
    ).all()) if team_ids else {}
    return [
        TeamResponse(id=team.id, name=team.name, capacity=team.capacity, role=role.value, member_count=counts.get(team.id, 0))
        for team, role in rows
    ]


@router.get("/teams/{team_id}/members", response_model=list[TeamMemberResponse])
def list_team_members(team_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_team_role(db, user.id, team_id)
    rows = db.execute(
        select(TeamMembership.user_id, User.full_name, TeamMembership.role)
        .join(User, User.id == TeamMembership.user_id)
        .where(TeamMembership.team_id == team_id, User.is_active.is_(True))
        .order_by(User.full_name, TeamMembership.user_id)
    ).all()
    return [TeamMemberResponse(user_id=user_id, full_name=name, role=role.value) for user_id, name, role in rows]
