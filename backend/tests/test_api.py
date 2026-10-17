from datetime import date, datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.models import ActivityRecord, IdempotencyRecord, Priority, Team, TeamMembership, TeamRole, User, WorkItem, WorkItemStatus
from app.security import create_access_token, hash_password


def create_user(db: Session, email: str, team: Team | None = None):
    user = User(email=email, full_name=email.split("@")[0].title(), password_hash=hash_password("correct horse battery staple"))
    db.add(user)
    db.flush()
    if team:
        db.add(TeamMembership(user_id=user.id, team_id=team.id, role=TeamRole.MEMBER))
    db.commit()
    return user


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_frontend_cors_preflight(client):
    response = client.options(
        "/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


@pytest.mark.parametrize("payload", [{"email": "missing@example.com", "password": "x"}, {"email": "bad", "password": "x"}])
def test_authentication_failures(client, payload):
    response = client.post("/auth/login", json=payload)
    assert response.status_code in (401, 422)
    assert "error" in response.json()


def test_auth_me_rejects_missing_and_invalid_token(client):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer invalid"}).status_code == 401


def test_login_returns_token_without_exposing_password_hash(client, db_session):
    user = create_user(db_session, "person@example.com")
    response = client.post("/auth/login", json={"email": user.email, "password": "correct horse battery staple"})
    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {response.json()['access_token']}"})
    assert me.status_code == 200
    assert "password_hash" not in me.json()


def test_dashboard_only_returns_teams_user_belongs_to(client, db_session):
    visible = Team(name="Visible", capacity=12)
    hidden = Team(name="Hidden", capacity=8)
    db_session.add_all([visible, hidden])
    db_session.flush()
    user = create_user(db_session, "member@example.com", visible)
    db_session.add_all([
        WorkItem(key="VIS-1", title="Scoped item", team_id=visible.id, status=WorkItemStatus.OPEN, priority=Priority.HIGH, due_date=date.today(), updated_at=datetime.now(timezone.utc)),
        WorkItem(key="HID-1", title="Private item", team_id=hidden.id, status=WorkItemStatus.OPEN, priority=Priority.LOW),
        ActivityRecord(team_id=visible.id, actor_id=user.id, action="created", target="VIS-1", kind="created"),
        ActivityRecord(team_id=hidden.id, action="created", target="HID-1", kind="created"),
    ])
    db_session.commit()
    token, _ = create_access_token(user.id)
    response = client.get("/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert [team["team"] for team in body["teams"]] == ["Visible"]
    assert body["teams"][0]["team_id"] == visible.id
    assert [item["id"] for item in body["work_items"]] == ["VIS-1"]
    assert [event["target"] for event in body["activity"]] == ["VIS-1"]
    assert body["kpis"]["open_items"] == 1
    assert len(body["weekly"]) == 7
    assert set(body) == {"kpis", "weekly", "teams", "activity", "work_items"}


def auth(user):
    token, _ = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


def add_team_user(db, email, team, role=TeamRole.MEMBER):
    user = User(email=email, full_name=email, password_hash=hash_password("a sufficiently long test password"))
    db.add(user)
    db.flush()
    db.add(TeamMembership(user_id=user.id, team_id=team.id, role=role))
    db.commit()
    return user


def test_work_item_crud_is_team_scoped(client, db_session):
    team = Team(name="CRUD team")
    other_team = Team(name="Other team")
    db_session.add_all([team, other_team])
    db_session.flush()
    user = add_team_user(db_session, "crud@example.com", team)
    outsider = add_team_user(db_session, "outsider@example.com", other_team)
    headers = {**auth(user), "Idempotency-Key": "create-crud-0001"}
    created = client.post(f"/teams/{team.id}/work-items", headers=headers, json={"key": "CRUD-1", "title": "A task"})
    assert created.status_code == 201, created.text
    item = created.json()
    assert item["version"] == 1
    assert client.get(f"/teams/{team.id}/work-items", headers=auth(user)).json()[0]["id"] == item["id"]
    assert client.get(f"/teams/{team.id}/work-items/{item['id']}", headers=auth(user)).status_code == 200
    denied = client.get(f"/teams/{team.id}/work-items/{item['id']}", headers=auth(outsider))
    assert denied.status_code == 404


def test_idempotency_replays_same_create_and_rejects_different_body(client, db_session):
    team = Team(name="Idempotency team")
    db_session.add(team)
    db_session.flush()
    user = add_team_user(db_session, "idem@example.com", team)
    headers = {**auth(user), "Idempotency-Key": "stable-key-00001"}
    payload = {"key": "IDEM-1", "title": "One task"}
    first = client.post(f"/teams/{team.id}/work-items", headers=headers, json=payload)
    second = client.post(f"/teams/{team.id}/work-items", headers=headers, json=payload)
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    assert db_session.scalar(select(func.count()).select_from(WorkItem)) == 1
    mismatch = client.post(f"/teams/{team.id}/work-items", headers=headers, json={"key": "IDEM-2", "title": "Different"})
    assert mismatch.status_code == 409
    assert mismatch.json()["error"]["code"] == "idempotency_key_reused"


def test_stale_version_update_conflicts(client, db_session):
    team = Team(name="Version team")
    db_session.add(team)
    db_session.flush()
    user = add_team_user(db_session, "version@example.com", team)
    made = client.post(f"/teams/{team.id}/work-items", headers={**auth(user), "Idempotency-Key": "version-key-01"}, json={"key": "VER-1", "title": "Original"}).json()
    url = f"/teams/{team.id}/work-items/{made['id']}"
    first = client.patch(url, headers=auth(user), json={"expected_version": 1, "title": "Updated"})
    stale = client.patch(url, headers=auth(user), json={"expected_version": 1, "title": "Stale overwrite"})
    assert first.status_code == 200 and first.json()["version"] == 2
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "stale_version"


def test_workflow_rejects_invalid_transition_and_blocks_member_approval(client, db_session):
    team = Team(name="Workflow team")
    db_session.add(team)
    db_session.flush()
    member = add_team_user(db_session, "workflow-member@example.com", team)
    made = client.post(f"/teams/{team.id}/work-items", headers={**auth(member), "Idempotency-Key": "workflow-key-01"}, json={"key": "FLOW-1", "title": "Approval task"}).json()
    url = f"/teams/{team.id}/work-items/{made['id']}"
    invalid = client.patch(url, headers=auth(member), json={"expected_version": 1, "status": "done"})
    assert invalid.status_code == 409
    assert invalid.json()["error"]["code"] == "invalid_workflow_transition"
    review = client.patch(url, headers=auth(member), json={"expected_version": 1, "status": "in_progress"})
    assert review.status_code == 200
    review = client.patch(url, headers=auth(member), json={"expected_version": 2, "status": "in_review"})
    assert review.status_code == 200
    denied_approval = client.patch(url, headers=auth(member), json={"expected_version": 3, "status": "done"})
    assert denied_approval.status_code == 403
    assert denied_approval.json()["error"]["code"] == "approval_forbidden"


def test_manager_can_approve_item_in_review(client, db_session):
    team = Team(name="Approver team")
    db_session.add(team)
    db_session.flush()
    manager = add_team_user(db_session, "manager@example.com", team, TeamRole.MANAGER)
    item = WorkItem(key="APP-1", title="Ready for approval", team_id=team.id, status=WorkItemStatus.IN_REVIEW, priority=Priority.MEDIUM)
    db_session.add(item)
    db_session.commit()
    approved = client.patch(f"/teams/{team.id}/work-items/{item.id}", headers=auth(manager), json={"expected_version": 1, "status": "done"})
    assert approved.status_code == 200
    assert approved.json()["status"] == "done"
    events = db_session.scalars(select(ActivityRecord).where(ActivityRecord.work_item_id == item.id)).all()
    assert len(events) == 1 and events[0].kind == "approved"


def test_activity_failure_rolls_back_item_and_idempotency(client, db_session, monkeypatch):
    import app.main as api

    team = Team(name="Rollback team")
    db_session.add(team)
    db_session.flush()
    user = add_team_user(db_session, "rollback@example.com", team)

    def fail_activity(*args, **kwargs):
        raise RuntimeError("simulated activity write failure")

    monkeypatch.setattr(api, "add_activity", fail_activity)
    with pytest.raises(RuntimeError):
        client.post(f"/teams/{team.id}/work-items", headers={**auth(user), "Idempotency-Key": "rollback-key-01"}, json={"key": "ROLL-1", "title": "Should roll back"})
    db_session.rollback()
    assert db_session.scalar(select(func.count()).select_from(WorkItem)) == 0
    assert db_session.scalar(select(func.count()).select_from(ActivityRecord)) == 0
    assert db_session.scalar(select(func.count()).select_from(IdempotencyRecord)) == 0


def test_two_claims_cannot_both_succeed(tmp_path):
    """Independent SQLite sessions exercise the compare-and-set claim operation."""
    from fastapi.testclient import TestClient
    from app.database import Base, get_db
    from app.main import app

    db_path = tmp_path / "claims.sqlite"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False, "timeout": 10})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with factory() as setup:
        team = Team(name="Claim team")
        setup.add(team)
        setup.flush()
        alice = add_team_user(setup, "alice-claim@example.com", team)
        bob = add_team_user(setup, "bob-claim@example.com", team)
        item = WorkItem(key="CLAIM-1", title="First claim wins", team_id=team.id, status=WorkItemStatus.OPEN, priority=Priority.MEDIUM)
        setup.add(item)
        setup.commit()
        team_id, item_id = team.id, item.id

    def override_db():
        with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    barrier = Barrier(2)

    def attempt(user):
        with TestClient(app) as test_client:
            barrier.wait()
            return test_client.post(f"/teams/{team_id}/work-items/{item_id}/claim", headers=auth(user))

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, [alice, bob]))
    finally:
        app.dependency_overrides.clear()
    assert sorted(result.status_code for result in results) == [200, 409]
    with factory() as verify:
        stored = verify.get(WorkItem, item_id)
        assert stored.assignee_id in {alice.id, bob.id}
        assert stored.version == 2
        assert verify.scalar(select(func.count()).select_from(ActivityRecord).where(ActivityRecord.work_item_id == item_id)) == 1
