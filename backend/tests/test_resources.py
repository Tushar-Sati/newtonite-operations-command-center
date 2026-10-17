from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import ActivityRecord, Priority, Team, TeamMembership, TeamRole, User, WorkItem, WorkItemStatus
from app.security import create_access_token, hash_password


def make_user(db_session, email, memberships=()):
    user = User(email=email, full_name=email.split("@")[0].title(), password_hash=hash_password("local test password"))
    db_session.add(user)
    db_session.flush()
    for team, role in memberships:
        db_session.add(TeamMembership(user_id=user.id, team_id=team.id, role=role))
    db_session.commit()
    return user


def bearer(user):
    token, _ = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


def test_teams_and_members_are_membership_scoped_and_safe(client, db_session):
    visible, hidden = Team(name="Visible resource team"), Team(name="Hidden resource team")
    db_session.add_all([visible, hidden])
    db_session.flush()
    member = make_user(db_session, "team-member@example.com", [(visible, TeamRole.MEMBER)])
    make_user(db_session, "team-manager@example.com", [(visible, TeamRole.MANAGER)])
    make_user(db_session, "hidden-member@example.com", [(hidden, TeamRole.MANAGER)])

    assert client.get("/teams").status_code == 401
    teams = client.get("/teams", headers=bearer(member))
    assert teams.status_code == 200
    assert [row["name"] for row in teams.json()] == ["Visible resource team"]
    assert teams.json()[0]["role"] == "member" and teams.json()[0]["member_count"] == 2
    people = client.get(f"/teams/{visible.id}/members", headers=bearer(member))
    assert people.status_code == 200
    assert {person["full_name"] for person in people.json()} == {member.full_name, "Team-Manager"}
    assert next(person for person in people.json() if person["user_id"] == member.id)["role"] == "member"
    assert "email" not in people.json()[0] and "password_hash" not in people.json()[0]
    assert client.get(f"/teams/{hidden.id}/members", headers=bearer(member)).status_code == 404


def test_activity_is_stably_paginated_and_team_scoped(client, db_session):
    first_team, other_team = Team(name="Activity team A"), Team(name="Activity team B")
    db_session.add_all([first_team, other_team])
    db_session.flush()
    user = make_user(db_session, "activity-member@example.com", [(first_team, TeamRole.MEMBER)])
    instant = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for suffix in ("one", "two", "three"):
        db_session.add(ActivityRecord(team_id=first_team.id, actor_id=user.id, action=f"did {suffix}", target=suffix, kind="updated", occurred_at=instant))
    db_session.add(ActivityRecord(team_id=other_team.id, action="private event", target="hidden", kind="updated", occurred_at=instant))
    db_session.commit()

    url = f"/teams/{first_team.id}/activity"
    assert client.get(url).status_code == 401
    page_one = client.get(url, headers=bearer(user), params={"limit": 2, "offset": 0})
    page_two = client.get(url, headers=bearer(user), params={"limit": 2, "offset": 2})
    assert page_one.status_code == page_two.status_code == 200
    assert len(page_one.json()) == 2 and len(page_two.json()) == 1
    assert set(event["action"] for event in page_one.json() + page_two.json()) == {"did one", "did two", "did three"}
    assert page_one.json()[0]["id"] > page_one.json()[1]["id"]  # id breaks timestamp ties deterministically
    assert page_one.json()[0]["actor"] == user.full_name
    assert page_one.json()[0]["work_item"] is None
    assert client.get(f"/teams/{other_team.id}/activity", headers=bearer(user)).status_code == 404


def test_successful_work_item_create_and_claim_appear_in_activity(client, db_session):
    team = Team(name="Mutation activity team")
    db_session.add(team)
    db_session.flush()
    user = make_user(db_session, "mutation-activity@example.com", [(team, TeamRole.MEMBER)])
    created = client.post(
        f"/teams/{team.id}/work-items",
        headers={**bearer(user), "Idempotency-Key": "activity-create-01"},
        json={"key": "ACT-1", "title": "Activity target"},
    )
    assert created.status_code == 201
    claim = client.post(f"/teams/{team.id}/work-items/{created.json()['id']}/claim", headers=bearer(user))
    assert claim.status_code == 200
    events = client.get(f"/teams/{team.id}/activity", headers=bearer(user)).json()
    assert {event["kind"] for event in events} == {"claimed", "created"}
    assert all(event["work_item"]["key"] == "ACT-1" for event in events)


def test_approval_requires_role_and_in_review_state_and_is_repeat_safe(client, db_session):
    team = Team(name="Approval resource team")
    db_session.add(team)
    db_session.flush()
    member = make_user(db_session, "approval-member@example.com", [(team, TeamRole.MEMBER)])
    manager = make_user(db_session, "approval-manager@example.com", [(team, TeamRole.MANAGER)])
    item = WorkItem(key="APR-READY", title="Ready to approve", team_id=team.id, status=WorkItemStatus.IN_REVIEW, priority=Priority.HIGH)
    open_item = WorkItem(key="APR-OPEN", title="Not ready", team_id=team.id, status=WorkItemStatus.OPEN, priority=Priority.MEDIUM)
    db_session.add_all([item, open_item])
    db_session.commit()

    queue = client.get(f"/teams/{team.id}/approvals", headers=bearer(member))
    assert queue.status_code == 200 and [row["id"] for row in queue.json()] == [item.id]
    url = f"/teams/{team.id}/approvals/{item.id}/approve"
    assert client.post(url, headers=bearer(member), json={"expected_version": 1}).status_code == 403
    not_ready = client.post(f"/teams/{team.id}/approvals/{open_item.id}/approve", headers=bearer(manager), json={"expected_version": 1})
    assert not_ready.status_code == 409 and not_ready.json()["error"]["code"] == "approval_not_pending"
    approved = client.post(url, headers=bearer(manager), json={"expected_version": 1})
    assert approved.status_code == 200 and approved.json()["status"] == "done" and approved.json()["version"] == 2
    repeated = client.post(url, headers=bearer(manager), json={"expected_version": 1})
    assert repeated.status_code == 409 and repeated.json()["error"]["code"] == "stale_version"
    events = db_session.scalars(select(ActivityRecord).where(ActivityRecord.work_item_id == item.id)).all()
    assert len(events) == 1 and events[0].kind == "approved"
    assert client.get(f"/teams/{team.id}/approvals", headers=bearer(manager)).json() == []


def test_approval_mutation_and_activity_roll_back_together(client, db_session, monkeypatch):
    import app.routers.approvals as approval_api

    team = Team(name="Approval rollback team")
    db_session.add(team)
    db_session.flush()
    manager = make_user(db_session, "approval-rollback@example.com", [(team, TeamRole.ADMIN)])
    item = WorkItem(key="APR-ROLL", title="Rollback approval", team_id=team.id, status=WorkItemStatus.IN_REVIEW, priority=Priority.MEDIUM)
    db_session.add(item)
    db_session.commit()

    def fail_commit(_db):
        raise RuntimeError("simulated activity transaction failure")

    monkeypatch.setattr(approval_api, "commit_or_rollback", fail_commit)
    with pytest.raises(RuntimeError):
        client.post(f"/teams/{team.id}/approvals/{item.id}/approve", headers=bearer(manager), json={"expected_version": 1})
    db_session.rollback()
    db_session.refresh(item)
    assert item.status == WorkItemStatus.IN_REVIEW and item.version == 1
    assert db_session.scalar(select(func.count()).select_from(ActivityRecord).where(ActivityRecord.work_item_id == item.id)) == 0


def test_competing_approvals_only_apply_once(tmp_path):
    """Two independent SQLite sessions exercise approval compare-and-set behavior."""
    db_path = tmp_path / "approvals.sqlite"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False, "timeout": 10})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with factory() as setup:
        team = Team(name="Concurrent approval team")
        manager = User(email="concurrent-approver@example.com", full_name="Concurrent Approver", password_hash=hash_password("long test password"))
        setup.add_all([team, manager])
        setup.flush()
        setup.add(TeamMembership(team_id=team.id, user_id=manager.id, role=TeamRole.MANAGER))
        item = WorkItem(key="APR-CONCURRENT", title="Concurrent approval", team_id=team.id, status=WorkItemStatus.IN_REVIEW, priority=Priority.HIGH)
        setup.add(item)
        setup.commit()
        team_id, item_id = team.id, item.id

    def override_db():
        with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    barrier = Barrier(2)

    def attempt():
        with TestClient(app) as test_client:
            barrier.wait()
            return test_client.post(
                f"/teams/{team_id}/approvals/{item_id}/approve",
                headers=bearer(manager),
                json={"expected_version": 1},
            )

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _index: attempt(), range(2)))
    finally:
        app.dependency_overrides.clear()
    assert sorted(response.status_code for response in responses) == [200, 409]
    with factory() as verify:
        stored = verify.get(WorkItem, item_id)
        assert stored.status == WorkItemStatus.DONE and stored.version == 2
        assert verify.scalar(select(func.count()).select_from(ActivityRecord).where(ActivityRecord.work_item_id == item_id)) == 1
