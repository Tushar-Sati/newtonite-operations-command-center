"""Explicit local-only seed command: `python -m app.dev_seed`."""

from datetime import date, datetime, timezone

from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import ActivityRecord, Priority, Team, TeamMembership, TeamRole, User, WorkItem, WorkItemStatus
from app.security import hash_password

DEMO_EMAIL = "newtonite-demo@example.com"
DEMO_PASSWORD = "DemoNewtonite2026!"


def seed() -> None:
    settings = get_settings()
    if settings.app_env.lower() != "development":
        raise SystemExit("Refusing to seed: APP_ENV must be development")
    if not settings.database_url.startswith("sqlite:"):
        raise SystemExit("Refusing to seed: the development seed only supports SQLite")

    with SessionLocal.begin() as db:
        user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if user is None:
            user = User(email=DEMO_EMAIL, full_name="Newtonite Demo", password_hash=hash_password(DEMO_PASSWORD))
            db.add(user)
            db.flush()
        else:
            user.full_name = "Newtonite Demo"
            user.password_hash = hash_password(DEMO_PASSWORD)
            user.is_active = True

        team = db.scalar(select(Team).where(Team.name == "Newtonite Demo Team"))
        if team is None:
            team = Team(name="Newtonite Demo Team", capacity=12)
            db.add(team)
            db.flush()
        membership = db.scalar(select(TeamMembership).where(TeamMembership.user_id == user.id, TeamMembership.team_id == team.id))
        if membership is None:
            db.add(TeamMembership(user_id=user.id, team_id=team.id, role=TeamRole.MANAGER))
        else:
            membership.role = TeamRole.MANAGER

        private_team = db.scalar(select(Team).where(Team.name == "Newtonite Private Demo Team"))
        if private_team is None:
            private_team = Team(name="Newtonite Private Demo Team", capacity=4)
            db.add(private_team)
            db.flush()

        examples = [
            ("DEMO-001", "Unclaimed sample work item", team, None, WorkItemStatus.OPEN, Priority.HIGH),
            ("DEMO-002", "In progress sample work item", team, user, WorkItemStatus.IN_PROGRESS, Priority.MEDIUM),
            ("PRIV-001", "Private team sample item", private_team, None, WorkItemStatus.OPEN, Priority.LOW),
        ]
        for key, title, owning_team, assignee, item_status, priority in examples:
            item = db.scalar(select(WorkItem).where(WorkItem.key == key))
            if item is None:
                item = WorkItem(
                    key=key, title=title, team_id=owning_team.id,
                    assignee_id=assignee.id if assignee else None,
                    status=item_status, priority=priority, due_date=date.today(),
                )
                db.add(item)
                db.flush()
                db.add(ActivityRecord(
                    team_id=owning_team.id, actor_id=user.id, work_item_id=item.id,
                    action="seeded development sample", target=f"{key} {title}", kind="created",
                    occurred_at=datetime.now(timezone.utc),
                ))

    print("Development data ready.")
    print(f"Login email: {DEMO_EMAIL}")
    print(f"Login password: {DEMO_PASSWORD}")
    print("Demo team: Newtonite Demo Team")
    print("Private isolation test team is intentionally not linked to this account.")


if __name__ == "__main__":
    seed()
