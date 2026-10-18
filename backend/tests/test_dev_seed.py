from contextlib import AbstractContextManager
from datetime import datetime, timezone
from types import SimpleNamespace

from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app import dev_seed
from app.models import ActivityRecord, Priority, Team, TeamMembership, TeamRole, User, WorkItem, WorkItemStatus
from app.security import verify_password


class _SeedTransaction(AbstractContextManager):
    def __init__(self, session):
        self.session = session

    def __enter__(self):
        return self.session

    def __exit__(self, exc_type, exc_value, traceback):
        if exc_type:
            self.session.rollback()
        else:
            self.session.commit()
        return False


class _SeedSessionFactory:
    def __init__(self, session):
        self.session = session

    def begin(self):
        return _SeedTransaction(self.session)


def test_seed_is_deterministic_and_scopes_demo_accounts(client, db_session, monkeypatch, capsys):
    password = "LocalSeedPassword2026!"
    monkeypatch.setenv("NEWTONITE_DEMO_PASSWORD", password)
    monkeypatch.setattr(dev_seed, "get_settings", lambda: SimpleNamespace(app_env="development", database_url="sqlite:///test.db"))
    monkeypatch.setattr(dev_seed, "SessionLocal", _SeedSessionFactory(db_session))

    # Exercise the upgrade path from the original three-account, one-team seed.
    legacy_team = Team(name="Newtonite Demo Team", capacity=12)
    db_session.add(legacy_team)
    db_session.flush()
    legacy_manager = None
    for email, name, role in (
        (dev_seed.DEMO_EMAIL, "Newtonite Demo", TeamRole.MANAGER),
        (dev_seed.MEMBER_EMAIL, "Demo Member", TeamRole.MEMBER),
        (dev_seed.VIEWER_EMAIL, "Demo Viewer", TeamRole.VIEWER),
    ):
        legacy_user = User(email=email, full_name=name, password_hash="legacy-test-hash", is_active=True)
        db_session.add(legacy_user)
        db_session.flush()
        db_session.add(TeamMembership(user_id=legacy_user.id, team_id=legacy_team.id, role=role))
        if email == dev_seed.DEMO_EMAIL:
            legacy_manager = legacy_user
    for index in range(1, 4):
        item = WorkItem(key=f"DEMO-{index:03d}", title="Legacy sample", team_id=legacy_team.id,
                        status=WorkItemStatus.OPEN, priority=Priority.MEDIUM)
        db_session.add(item)
        db_session.flush()
        db_session.add(ActivityRecord(team_id=legacy_team.id, actor_id=legacy_manager.id, work_item_id=item.id,
                                      action="seeded development sample", target=item.key, kind="created",
                                      occurred_at=datetime.now(timezone.utc)))
    db_session.commit()

    dev_seed.seed()
    dev_seed.seed()

    assert db_session.scalar(select(func.count(Team.id)).where(Team.name != "Newtonite Private Demo Team")) == 7
    assert db_session.scalar(select(func.count(User.id))) == 78
    assert db_session.scalar(select(func.count(WorkItem.id)).where(WorkItem.key != "PRIV-001")) == 350
    assert db_session.scalar(select(func.count(ActivityRecord.id))) == 1050
    assert db_session.scalar(select(func.count(TeamMembership.id))) >= 35
    valid_assignment = select(TeamMembership.id).where(
        TeamMembership.user_id == WorkItem.assignee_id,
        TeamMembership.team_id == WorkItem.team_id,
    ).exists()
    invalid_assignments = db_session.scalar(select(func.count(WorkItem.id)).where(
        WorkItem.key != "PRIV-001", WorkItem.assignee_id.is_not(None), ~valid_assignment,
    ))
    assert invalid_assignments == 0
    for (team_name, _, _), counts in zip(dev_seed.TEAM_SPECS, dev_seed.STATUS_COUNTS):
        team = db_session.scalar(select(Team).where(Team.name == team_name))
        for status, expected_count in zip(dev_seed.STATUSES, counts):
            actual_count = db_session.scalar(select(func.count(WorkItem.id)).where(
                WorkItem.team_id == team.id, WorkItem.status == status,
            ))
            assert actual_count == expected_count
    event_times = db_session.scalars(select(ActivityRecord.occurred_at)).all()
    assert (max(event_times) - min(event_times)).days >= 21
    member = db_session.scalar(select(User).where(User.email == dev_seed.MEMBER_EMAIL))
    assert verify_password(password, member.password_hash)

    expected_team = {
        dev_seed.DEMO_EMAIL: "Incident Response",
        dev_seed.MEMBER_EMAIL: "Logistics Control",
        dev_seed.VIEWER_EMAIL: "Compliance",
        dev_seed.ADMIN_EMAIL: "Platform Reliability",
    }
    access_tokens = {}
    team_lists = {}
    for email, team_name in expected_team.items():
        response = client.post("/auth/login", json={"email": email, "password": password})
        assert response.status_code == 200
        token = response.json()["access_token"]
        access_tokens[email] = token
        teams_response = client.get("/teams", headers={"Authorization": f"Bearer {token}"})
        assert teams_response.status_code == 200
        accessible_names = {team["name"] for team in teams_response.json()}
        assert team_name in accessible_names
        team_lists[email] = teams_response.json()
        authorized_team = next(team for team in teams_response.json() if team["name"] == team_name)
        own_work = client.get(f"/teams/{authorized_team['id']}/work-items?limit=100", headers={"Authorization": f"Bearer {token}"})
        assert own_work.status_code == 200
        assert all(item["team_id"] == authorized_team["id"] for item in own_work.json())
        if email in (dev_seed.MEMBER_EMAIL, dev_seed.VIEWER_EMAIL, dev_seed.ADMIN_EMAIL):
            assert len(accessible_names) == 1
        else:
            assert len(accessible_names) == 7

    manager_headers = {"Authorization": f"Bearer {access_tokens[dev_seed.DEMO_EMAIL]}"}
    incident_id = next(team["id"] for team in team_lists[dev_seed.DEMO_EMAIL] if team["name"] == "Incident Response")
    first_page = client.get(f"/teams/{incident_id}/work-items?limit=5&offset=0", headers=manager_headers)
    second_page = client.get(f"/teams/{incident_id}/work-items?limit=5&offset=5", headers=manager_headers)
    assert first_page.status_code == second_page.status_code == 200
    assert len(first_page.json()) == len(second_page.json()) == 5
    assert {item["id"] for item in first_page.json()}.isdisjoint({item["id"] for item in second_page.json()})
    blocked = client.get(f"/teams/{incident_id}/work-items?status=blocked", headers=manager_headers)
    assert blocked.status_code == 200
    assert blocked.json() and all(item["status"] == "blocked" for item in blocked.json())
    activity = client.get(f"/teams/{incident_id}/activity?limit=5&offset=0", headers=manager_headers)
    assert activity.status_code == 200 and len(activity.json()) == 5
    event_times = [event["occurred_at"] for event in activity.json()]
    assert event_times == sorted(event_times, reverse=True)
    approvals = client.get(f"/teams/{incident_id}/approvals", headers=manager_headers)
    assert approvals.status_code == 200
    assert approvals.json() and all(item["status"] == "in_review" for item in approvals.json())
    dashboard = client.get("/dashboard", headers=manager_headers)
    assert dashboard.status_code == 200
    dashboard_body = dashboard.json()
    assert len(dashboard_body["teams"]) == 7
    assert dashboard_body["kpis"]["open_items"] == sum(team["open"] for team in dashboard_body["teams"])
    assert dashboard_body["kpis"]["in_progress_items"] == sum(team["in_progress"] for team in dashboard_body["teams"])
    assert dashboard_body["kpis"]["pending_approvals"] == sum(counts[3] for counts in dev_seed.STATUS_COUNTS)
    assert len(dashboard_body["activity"]) == 10

    member_headers = {"Authorization": f"Bearer {access_tokens[dev_seed.MEMBER_EMAIL]}"}
    incident_members = client.get(f"/teams/{incident_id}/members", headers=member_headers)
    incident_work = client.get(f"/teams/{incident_id}/work-items", headers=member_headers)
    assert incident_members.status_code == incident_work.status_code == 404

    assert "LocalSeedPassword2026!" not in capsys.readouterr().out
