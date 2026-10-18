"""Deterministic, explicit, SQLite-only development fixtures.

Run with ``python -m app.dev_seed`` after applying Alembic migrations. The
command refuses non-development environments and never changes an existing
account password unless NEWTONITE_DEMO_PASSWORD is explicitly configured.
"""

import os
import secrets
from datetime import date, datetime, time, timedelta, timezone
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import ActivityRecord, Priority, Team, TeamMembership, TeamRole, User, WorkItem, WorkItemStatus
from app.security import hash_password

DEMO_EMAIL = "newtonite-demo@example.com"
MEMBER_EMAIL = "member-demo@example.com"
VIEWER_EMAIL = "viewer-demo@example.com"
ADMIN_EMAIL = "admin-demo@example.com"

TEAM_SPECS = (
    ("Incident Response", 14, "IR"),
    ("Logistics Control", 32, "LOG"),
    ("Customer Escalations", 13, "CUS"),
    ("Platform Reliability", 16, "PLT"),
    ("Compliance", 11, "CMP"),
    ("Payments Operations", 22, "PAY"),
    ("Workforce Planning", 28, "WFP"),
)

STATUS_COUNTS = (
    (10, 12, 8, 9, 11), (18, 15, 3, 2, 12), (10, 12, 5, 11, 12),
    (10, 14, 12, 5, 9), (12, 9, 5, 13, 11), (11, 11, 7, 8, 13), (17, 16, 3, 2, 12),
)
STATUSES = (WorkItemStatus.OPEN, WorkItemStatus.IN_PROGRESS, WorkItemStatus.BLOCKED, WorkItemStatus.IN_REVIEW, WorkItemStatus.DONE)
PRIORITIES = (Priority.MEDIUM, Priority.HIGH, Priority.LOW, Priority.CRITICAL, Priority.HIGH, Priority.MEDIUM)

FOCUS = (
    ("Containment review", "Incident follow-up", "Service recovery", "On-call handoff", "Capacity safeguard"),
    ("Shipment exception", "Route capacity review", "Warehouse handoff", "Fleet maintenance", "Delivery recovery"),
    ("Customer escalation", "Service credit review", "Support handoff", "Response-time recovery", "Account follow-up"),
    ("Infrastructure maintenance", "Availability review", "Release safeguard", "Queue recovery", "Capacity expansion"),
    ("Compliance review", "Evidence collection", "Control validation", "Policy exception", "Audit follow-up"),
    ("Payment investigation", "Settlement reconciliation", "Dispute review", "Ledger verification", "Payout recovery"),
    ("Shift coverage", "Workforce forecast", "On-call rotation", "Training capacity", "Regional handoff"),
)
CONTEXT = (
    "Coordinate the response window, record the operational owner, and confirm the recovery checkpoint before closing the loop.",
    "Review the exception queue, confirm the next handoff, and record a safe fallback plan for the operating team.",
    "Capture the impact assessment, identify the next customer-facing update, and keep the response timeline auditable.",
    "Validate the maintenance window, document the rollback checkpoint, and coordinate the reliability handoff.",
    "Collect the required evidence, record the control owner, and prepare the review packet for an authorized decision.",
    "Reconcile the affected processing window, document the investigation trail, and confirm the next settlement checkpoint.",
    "Compare forecast demand with available coverage, record the staffing gap, and confirm the next shift handoff.",
)


def stable_id(value: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"newtonite-dev-seed:{value}"))


def _upsert_membership(db, user: User, team: Team, role: TeamRole) -> None:
    membership = db.scalar(select(TeamMembership).where(
        TeamMembership.user_id == user.id, TeamMembership.team_id == team.id,
    ))
    if membership is None:
        db.add(TeamMembership(id=stable_id(f"membership:{user.email}:{team.name}"), user_id=user.id, team_id=team.id, role=role))
    else:
        membership.role = role


def seed() -> None:
    settings = get_settings()
    if settings.app_env.lower() != "development":
        raise SystemExit("Refusing to seed: APP_ENV must be development")
    if not settings.database_url.startswith("sqlite:"):
        raise SystemExit("Refusing to seed: the development seed only supports SQLite")

    configured_password = os.environ.get("NEWTONITE_DEMO_PASSWORD")
    if configured_password and len(configured_password) < 12:
        raise SystemExit("NEWTONITE_DEMO_PASSWORD must be at least 12 characters")
    generated_password: str | None = None
    created_user_count = 0
    today = date.today()
    anchor = datetime.combine(today, time(12), tzinfo=timezone.utc)

    with SessionLocal.begin() as db:
        teams: list[Team] = []
        for team_index, (name, capacity, _) in enumerate(TEAM_SPECS):
            team = db.scalar(select(Team).where(Team.name == name))
            # Upgrade the original local demo tenant in place so its IDs, memberships,
            # and sample work remain intact.
            if team is None and name == "Incident Response":
                team = db.scalar(select(Team).where(Team.name == "Newtonite Demo Team"))
                if team is not None:
                    team.name = name
            if team is None:
                team = Team(id=stable_id(f"team:{name}"), name=name, capacity=capacity, created_at=anchor - timedelta(days=120 + team_index))
                db.add(team)
                db.flush()
            team.capacity = capacity
            teams.append(team)

        private_team = db.scalar(select(Team).where(Team.name == "Newtonite Private Demo Team"))
        if private_team is None:
            private_team = Team(id=stable_id("team:Newtonite Private Demo Team"), name="Newtonite Private Demo Team", capacity=4)
            db.add(private_team)

        # (email, display name, role, team indexes); 78 synthetic demo accounts.
        profiles: list[tuple[str, str, TeamRole, tuple[int, ...]]] = [
            (DEMO_EMAIL, "Newtonite Demo Manager", TeamRole.MANAGER, tuple(range(7))),
            ("logistics-lead@example.com", "Logistics Shift Lead", TeamRole.MANAGER, (1,)),
            ("customer-lead@example.com", "Escalations Lead", TeamRole.MANAGER, (2,)),
            ("platform-lead@example.com", "Reliability Lead", TeamRole.MANAGER, (3,)),
            ("compliance-lead@example.com", "Controls Lead", TeamRole.MANAGER, (4,)),
            ("payments-lead@example.com", "Payments Lead", TeamRole.MANAGER, (5,)),
            ("workforce-lead@example.com", "Workforce Lead", TeamRole.MANAGER, (6,)),
            (ADMIN_EMAIL, "Operations Admin", TeamRole.ADMIN, (3,)),
        ]
        member_names = (
            "Demo Member", "Avery Chen", "Jordan Patel", "Morgan Rivera", "Riley Brooks", "Casey Nguyen",
            "Taylor Kim", "Quinn Foster", "Cameron Ellis", "Drew Morgan", "Reese Parker", "Skyler James",
            "Rowan Bell", "Emerson Lane",
        ) + tuple(f"Operations Specialist {index:02d}" for index in range(15, 57))
        for index, name in enumerate(member_names):
            email = MEMBER_EMAIL if index == 0 else f"ops-member-{index:02d}@example.com"
            profiles.append((email, name, TeamRole.MEMBER, ((index + 1) % 7,)))
        viewer_names = ("Demo Viewer", "Harper Quinn", "Finley Ross", "Dakota Lee", "Sage Turner", "Alex Wynn", "Robin Hale",
                        "Viewpoint Analyst 08", "Viewpoint Analyst 09", "Viewpoint Analyst 10", "Viewpoint Analyst 11",
                        "Viewpoint Analyst 12", "Viewpoint Analyst 13", "Viewpoint Analyst 14")
        for index, name in enumerate(viewer_names):
            email = VIEWER_EMAIL if index == 0 else f"ops-viewer-{index:02d}@example.com"
            profiles.append((email, name, TeamRole.VIEWER, ((index + 4) % 7,)))

        users: dict[str, User] = {}
        for profile_index, (email, full_name, role, team_indexes) in enumerate(profiles):
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                password = configured_password
                if password is None:
                    generated_password = generated_password or secrets.token_urlsafe(24)
                    password = generated_password
                user = User(id=stable_id(f"user:{email}"), email=email, full_name=full_name, password_hash=hash_password(password),
                            is_active=True, created_at=anchor - timedelta(days=90 + profile_index))
                db.add(user)
                db.flush()
                created_user_count += 1
            else:
                user.full_name = full_name
                user.is_active = True
                if configured_password:
                    user.password_hash = hash_password(configured_password)
            users[email] = user
            allowed_team_ids = {teams[index].id for index in team_indexes}
            existing_memberships = db.scalars(select(TeamMembership).where(
                TeamMembership.user_id == user.id,
                TeamMembership.team_id.in_([team.id for team in teams]),
            )).all()
            for membership in existing_memberships:
                if membership.team_id not in allowed_team_ids:
                    db.delete(membership)
            for team_index in team_indexes:
                _upsert_membership(db, user, teams[team_index], role)

        # Keep team-local member pools useful for assignment and activity attribution.
        members_by_team: list[list[User]] = [[] for _ in teams]
        for index, name in enumerate(member_names):
            members_by_team[(index + 1) % 7].append(users[MEMBER_EMAIL if index == 0 else f"ops-member-{index:02d}@example.com"])
        managers_by_team = [users[DEMO_EMAIL]] + [users[f"{('logistics','customer','platform','compliance','payments','workforce')[i-1]}-lead@example.com"] for i in range(1, 7)]

        item_count = 0
        for team_index, ((team_name, _, prefix), team) in enumerate(zip(TEAM_SPECS, teams)):
            generated = 0
            for status, count in zip(STATUSES, STATUS_COUNTS[team_index]):
                for _ in range(count):
                    generated += 1
                    item_number = generated
                    key = f"DEMO-{item_number:03d}" if team_index == 0 and item_number <= 3 else f"OPS-{prefix}-{item_number:03d}"
                    focus = FOCUS[team_index][(item_number + team_index) % len(FOCUS[team_index])]
                    title = f"{focus} · operating window {item_number:03d}"
                    description = f"{CONTEXT[team_index]} Synthetic training scenario {prefix}-{item_number:03d}; no customer or production data is included."
                    pool = members_by_team[team_index]
                    assignee = None if item_number % 5 == 0 or (status == WorkItemStatus.OPEN and item_number % 4 == 0) else pool[(item_number + team_index) % len(pool)]
                    priority = PRIORITIES[(item_number + 2 * team_index) % len(PRIORITIES)]
                    if status == WorkItemStatus.BLOCKED and item_number % 2 == 0:
                        priority = Priority.HIGH
                    if status == WorkItemStatus.IN_REVIEW and item_number % 3 == 0:
                        priority = Priority.CRITICAL
                    critical_overdue = ((team_index == 0 and item_number in (1, 2, 7))
                                        or (team_index == 2 and item_number in (3, 10))
                                        or (team_index == 5 and item_number in (2, 8)))
                    if status == WorkItemStatus.DONE:
                        due_date = today - timedelta(days=2 + item_number % 12)
                    elif critical_overdue:
                        due_date = today - timedelta(days=1 + item_number % 8)
                    elif item_number % 9 == 0:
                        due_date = today
                    else:
                        due_date = today + timedelta(days=2 + (item_number * 3 + team_index) % 25)

                    # Three deterministic audit events per item yield 1,050 records.
                    item_created = anchor - timedelta(days=5 + (item_number * 3 + team_index * 5) % 35, hours=(item_number * 2) % 12)
                    item_updated = item_created + timedelta(hours=2 + item_number % 30)
                    item = db.scalar(select(WorkItem).where(WorkItem.key == key))
                    if item is None:
                        item = WorkItem(id=stable_id(f"work-item:{key}"), key=key, title=title, description=description, team_id=team.id,
                                        assignee_id=assignee.id if assignee else None, status=status, priority=priority, due_date=due_date,
                                        created_at=item_created, updated_at=item_updated, version=1)
                        db.add(item)
                        db.flush()
                    else:
                        item.title, item.description, item.team_id = title, description, team.id
                        item.assignee_id = assignee.id if assignee else None
                        item.status, item.priority, item.due_date = status, priority, due_date
                        item.created_at, item.updated_at, item.version = item_created, item_updated, 1
                    item_count += 1

                    # Remove the original seed's one generic event for these three
                    # legacy keys; the detailed stable events below replace it.
                    for legacy_event in db.scalars(select(ActivityRecord).where(
                        ActivityRecord.work_item_id == item.id,
                        ActivityRecord.action == "seeded development sample",
                    )).all():
                        db.delete(legacy_event)

                    actor = pool[(item_number + 1) % len(pool)]
                    if item_number % 4 == 0:
                        change_action, change_target = "changed priority", f"Priority set to {priority.value}"
                    elif assignee:
                        change_action, change_target = "changed assignment", f"Assigned to {assignee.full_name}"
                    else:
                        change_action, change_target = "added operations note", "Owner handoff is still required"
                    event_specs = [
                        ("created work item", f"{key} · {title}", "created", actor, item_created),
                        (change_action, change_target,
                         "updated", managers_by_team[team_index], item_created + timedelta(hours=1)),
                    ]
                    if status == WorkItemStatus.DONE:
                        final_action, final_kind, final_actor = "approved work item", "approved", managers_by_team[team_index]
                    elif status == WorkItemStatus.IN_REVIEW:
                        final_action, final_kind, final_actor = "moved work item to in review; decision required", "updated", actor
                    elif status == WorkItemStatus.BLOCKED:
                        final_action, final_kind, final_actor = "marked work item blocked; dependency pending", "updated", actor
                    else:
                        final_action, final_kind, final_actor = f"set status to {status.value}", "updated", actor
                    event_specs.append((final_action, key, final_kind, final_actor, item_updated))
                    for event_index, (action, target, kind, event_actor, occurred_at) in enumerate(event_specs):
                        event_id = stable_id(f"activity:{key}:{event_index}")
                        event = db.get(ActivityRecord, event_id)
                        values = dict(team_id=team.id, actor_id=event_actor.id, work_item_id=item.id, action=action,
                                      target=target[:240], kind=kind, occurred_at=occurred_at)
                        if event is None:
                            db.add(ActivityRecord(id=event_id, **values))
                        else:
                            for field, value in values.items():
                                setattr(event, field, value)

        # Retain the old private fixture solely for isolation checks; never link it
        # to a demo login or include it in the seven operational team nodes.
        private = db.scalar(select(WorkItem).where(WorkItem.key == "PRIV-001"))
        if private is None:
            private = WorkItem(id=stable_id("work-item:PRIV-001"), key="PRIV-001", title="Private isolation fixture", description="Hidden development-only access-boundary check.",
                               team_id=private_team.id, assignee_id=None, status=WorkItemStatus.OPEN, priority=Priority.LOW, due_date=today + timedelta(days=14))
            db.add(private)

    print(f"Development fixtures ready: {len(teams)} operational teams, {len(profiles)} demo accounts, {item_count} operational work items, {item_count * 3} deterministic activity events.")
    print(f"Manager: {DEMO_EMAIL}; Member: {MEMBER_EMAIL}; Viewer: {VIEWER_EMAIL}; Admin: {ADMIN_EMAIL}")
    if configured_password:
        print("Configured demo password was applied; its value is not displayed.")
    elif generated_password and created_user_count:
        print("One-time generated password for newly created demo accounts (store securely):")
        print(generated_password)
    else:
        print("Existing account passwords were preserved. Set NEWTONITE_DEMO_PASSWORD to rotate them explicitly.")


if __name__ == "__main__":
    seed()
