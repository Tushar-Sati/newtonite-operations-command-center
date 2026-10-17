"""Optional integration coverage; set TEST_DATABASE_URL to a disposable PostgreSQL DB."""

import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import ActivityRecord, Team, TeamMembership, TeamRole, User, WorkItem, WorkItemStatus
from app.security import create_access_token, hash_password

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not configured")


def test_postgres_competing_claims_are_serialized():
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    suffix = uuid4().hex
    with factory.begin() as db:
        team = Team(name=f"pg-claims-{suffix}")
        db.add(team)
        db.flush()
        users = [
            User(email=f"pg-a-{suffix}@example.test", full_name="PG A", password_hash=hash_password("test only password")),
            User(email=f"pg-b-{suffix}@example.test", full_name="PG B", password_hash=hash_password("test only password")),
        ]
        db.add_all(users)
        db.flush()
        db.add_all([TeamMembership(user_id=user.id, team_id=team.id, role=TeamRole.MEMBER) for user in users])
        item = WorkItem(key=f"PG-{suffix[:20]}", title="Concurrent claim", team_id=team.id, status=WorkItemStatus.OPEN)
        db.add(item)
        db.flush()
        team_id, item_id, user_ids = team.id, item.id, [user.id for user in users]

    def override_db():
        with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    barrier = Barrier(2)

    def attempt(user_id):
        token, _ = create_access_token(user_id)
        with TestClient(app) as client:
            barrier.wait()
            return client.post(
                f"/teams/{team_id}/work-items/{item_id}/claim",
                headers={"Authorization": f"Bearer {token}"},
            )

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, user_ids))
        assert sorted(response.status_code for response in results) == [200, 409]
        with factory() as db:
            saved = db.get(WorkItem, item_id)
            assert saved is not None and saved.assignee_id in user_ids and saved.version == 2
            assert db.scalar(select(func.count()).select_from(ActivityRecord).where(ActivityRecord.work_item_id == item_id)) == 1
    finally:
        app.dependency_overrides.clear()
        with factory.begin() as db:
            db.query(ActivityRecord).filter(ActivityRecord.work_item_id == item_id).delete(synchronize_session=False)
            db.query(WorkItem).filter(WorkItem.id == item_id).delete(synchronize_session=False)
            db.query(TeamMembership).filter(TeamMembership.team_id == team_id).delete(synchronize_session=False)
            db.query(Team).filter(Team.id == team_id).delete(synchronize_session=False)
            db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
    engine.dispose()


def test_postgres_competing_approvals_are_serialized():
    """Verifies conditional approval updates against independent PostgreSQL transactions."""
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    suffix = uuid4().hex
    with factory.begin() as db:
        team = Team(name=f"pg-approvals-{suffix}")
        manager = User(email=f"pg-manager-{suffix}@example.test", full_name="PG Manager", password_hash=hash_password("test only password"))
        db.add_all([team, manager])
        db.flush()
        db.add(TeamMembership(user_id=manager.id, team_id=team.id, role=TeamRole.MANAGER))
        item = WorkItem(key=f"PA-{suffix[:20]}", title="Concurrent approval", team_id=team.id, status=WorkItemStatus.IN_REVIEW)
        db.add(item)
        db.flush()
        team_id, item_id, manager_id = team.id, item.id, manager.id

    def override_db():
        with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    barrier = Barrier(2)

    def attempt():
        token, _ = create_access_token(manager_id)
        with TestClient(app) as client:
            barrier.wait()
            return client.post(
                f"/teams/{team_id}/approvals/{item_id}/approve",
                headers={"Authorization": f"Bearer {token}"},
                json={"expected_version": 1},
            )

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _index: attempt(), range(2)))
        assert sorted(response.status_code for response in results) == [200, 409]
        with factory() as db:
            saved = db.get(WorkItem, item_id)
            assert saved is not None and saved.status == WorkItemStatus.DONE and saved.version == 2
            assert db.scalar(select(func.count()).select_from(ActivityRecord).where(ActivityRecord.work_item_id == item_id)) == 1
    finally:
        app.dependency_overrides.clear()
        with factory.begin() as db:
            db.query(ActivityRecord).filter(ActivityRecord.work_item_id == item_id).delete(synchronize_session=False)
            db.query(WorkItem).filter(WorkItem.id == item_id).delete(synchronize_session=False)
            db.query(TeamMembership).filter(TeamMembership.team_id == team_id).delete(synchronize_session=False)
            db.query(Team).filter(Team.id == team_id).delete(synchronize_session=False)
            db.query(User).filter(User.id == manager_id).delete(synchronize_session=False)
    engine.dispose()
