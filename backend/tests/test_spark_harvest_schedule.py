"""Weekly metadata refresh must not disable an unchanged, checked daily plan."""
from datetime import datetime, timedelta

import pytest

from app.extensions import db
from app.models import SparkAccount, SparkContact, SparkDelivery, SparkJob
from app.spark.executor import execute_job
from app.spark.service import config_for, enqueue, get_account, schedule_due, validation_ready
from .conftest import auth
from .test_spark import Driver, add_friend, bind, member, queue, run


@pytest.fixture(autouse=True)
def spark_setup(app):
    from cryptography.fernet import Fernet
    app.config["SPARK_CREDENTIAL_KEY"] = Fernet.generate_key().decode()
    Driver.outcomes, Driver.calls, Driver.during_send = {}, [], None


def checked_plan(client, name="weeklyplan", creator=False, profile=None):
    owner, token = member(client, name)
    bind(client, token)
    contact = add_friend(owner, creator=creator)
    if profile:
        contact.profile = {**contact.profile, **profile}
    account = get_account(owner)
    account.onboarding_required = True
    account.config = {**config_for(account), "auto_run_enabled": False, "allow_first_message": creator,
                      "jitter_minutes": 0, "schedule_time": "09:00"}
    from app.models.spark import now_utc
    account.config_saved_at = now_utc()
    db.session.commit()
    assert run(queue(client, token, "dry_run")).status == "succeeded"
    assert client.put("/api/v1/spark/config", headers=auth(token), json={"auto_run_enabled": True}).status_code == 200
    return account, contact, token


def test_weekly_harvest_keeps_checked_plan_enabled_and_daily_job_runs(client, monkeypatch):
    import app.spark.executor as executor
    account, contact, _ = checked_plan(client)
    checked_at = account.validated_at
    morning = datetime(2026, 10, 18, 19)  # Monday 03:00 Asia/Shanghai.
    daily_due = datetime(2026, 10, 19, 1)
    account.next_harvest_at, account.next_run_at = morning, daily_due
    db.session.commit()
    schedule_due(morning)
    harvest = db.session.scalar(db.select(SparkJob).where(SparkJob.source == "weekly"))
    assert harvest and harvest.status == "queued"
    execute_job(harvest.id, Driver, sleep=lambda _: None)
    assert contact.profile["short_id"] == "douyin-id"
    assert validation_ready(account)
    assert account.validated_at == checked_at  # Refreshing metadata is not a new check.
    assert account.next_run_at == daily_due
    schedule_due(morning + timedelta(minutes=2))
    assert config_for(account)["auto_run_enabled"]
    schedule_due(daily_due)
    schedule_due(daily_due)
    send = db.session.scalar(db.select(SparkJob).where(SparkJob.source == "daily"))
    assert send and send.status == "queued"
    from app.spark.service import local_now
    monkeypatch.setattr(executor, "local_now", lambda: local_now(daily_due))
    execute_job(send.id, Driver, sleep=lambda _: None)
    assert send.status == "succeeded"
    assert sum(not call[2] for call in Driver.calls) == 1
    assert db.session.scalar(db.select(db.func.count()).select_from(SparkDelivery)) == 1


@pytest.mark.parametrize("kind", ["sync", "harvest"])
def test_refresh_does_not_roll_an_overdue_same_day_send_into_tomorrow(client, monkeypatch, kind):
    import app.spark.executor as executor
    account, _, token = checked_plan(client)
    due = datetime(2026, 10, 19, 1)
    finished = due + timedelta(minutes=1)
    account.next_run_at = due
    future_weekly = datetime(2026, 10, 25, 19)
    account.next_harvest_at = future_weekly
    db.session.commit()
    monkeypatch.setattr(executor, "now_utc", lambda: finished)
    assert run(queue(client, token, kind)).status == "succeeded"
    assert account.next_run_at == due
    assert account.next_harvest_at == future_weekly
    schedule_due(finished)
    assert db.session.scalar(db.select(SparkJob.id).where(SparkJob.source == "daily"))


@pytest.mark.parametrize("change", ["ambiguity", "missing", "channel", "creator_identity"])
def test_refresh_that_changes_recipient_safety_still_invalidates_the_check(client, change):
    account, contact, token = checked_plan(client, creator=change == "creator_identity")
    if change == "ambiguity":
        contact.profile = {**contact.profile, "short_id": "previous-id"}
    if change in ("ambiguity", "channel"):
        from app.spark.service import validation_fingerprint
        if change == "channel":
            contact.profile = {**contact.profile, "has_conversation": False}
        account.validation_fingerprint = validation_fingerprint(account)
    db.session.commit()

    class RefreshDriver(Driver):
        def sync(self):
            return "succeeded", [] if change == "missing" else [{"name": "好友"}]

    kind = "sync" if change in ("missing", "channel") else "harvest"
    job = queue(client, token, kind).get_json()["data"]
    execute_job(job["id"], RefreshDriver, sleep=lambda _: None)
    assert not validation_ready(account)
    schedule_due()
    assert not config_for(account)["auto_run_enabled"]


def test_refresh_never_revalidates_a_changed_message_or_a_never_checked_plan(client):
    account, _, token = checked_plan(client)
    account.config = {**config_for(account), "messages": ["changed after check"]}
    db.session.commit()
    assert run(queue(client, token, "harvest")).status == "succeeded"
    assert not validation_ready(account)
    schedule_due()
    assert not config_for(account)["auto_run_enabled"]


def test_pause_during_collection_stays_paused(client):
    account, _, token = checked_plan(client)

    class PausingDriver(Driver):
        def harvest(self):
            result = client.put("/api/v1/spark/config", headers=auth(token), json={"auto_run_enabled": False})
            assert result.status_code == 200
            return super().harvest()

    job = queue(client, token, "harvest").get_json()["data"]
    execute_job(job["id"], PausingDriver, sleep=lambda _: None)
    assert not config_for(account)["auto_run_enabled"]
    assert account.next_run_at is None


def reproduce_old_harvest_pause(client):
    """Seed the original bug without running the now-fixed executor refresh."""
    from app.models.spark import now_utc
    from app.spark.executor import merge_creator
    from app.spark.service import local_now
    account, contact, token = checked_plan(client, "repairplan")
    previous = enqueue(account, "send", "daily", local_now().date().isoformat())
    previous.status = "succeeded"
    previous.finished_at = now_utc()
    harvest = enqueue(account, "harvest", "weekly", "first-harvest")
    harvest.status = "succeeded"
    harvest.started_at = now_utc() + timedelta(seconds=10)
    harvest.finished_at = harvest.started_at + timedelta(seconds=20)
    merge_creator(account, {"douyin-id": {"nickname": contact.display_name, "user_id": "platform-id"}})
    account.harvest_updated_at = harvest.finished_at
    db.session.commit()
    schedule_due(harvest.finished_at + timedelta(seconds=2))
    account.updated_at = harvest.finished_at + timedelta(seconds=2)
    db.session.commit()
    assert not config_for(account)["auto_run_enabled"] and not validation_ready(account)
    return account, contact, token, harvest


def test_repair_previews_then_restores_only_a_proven_unchanged_plan_without_sending(client):
    from app.spark.repair import repair_harvest_pauses
    account, _, _, harvest = reproduce_old_harvest_pause(client)
    validated_at = account.validated_at
    moment = harvest.finished_at + timedelta(hours=24)
    jobs_before = db.session.scalar(db.select(db.func.count()).select_from(SparkJob))
    deliveries_before = db.session.scalar(db.select(db.func.count()).select_from(SparkDelivery))
    result = repair_harvest_pauses(now=moment)
    assert result["recovered_count"] == 1 and not result["accounts"][0]["applied"]
    assert not config_for(account)["auto_run_enabled"]
    result = repair_harvest_pauses(apply=True, now=moment)
    assert result["recovered_count"] == 1 and result["accounts"][0]["applied"]
    assert config_for(account)["auto_run_enabled"] and validation_ready(account)
    assert account.validated_at == validated_at
    assert account.next_run_at > moment
    assert db.session.scalar(db.select(db.func.count()).select_from(SparkJob)) == jobs_before
    assert db.session.scalar(db.select(db.func.count()).select_from(SparkDelivery)) == deliveries_before
    assert repair_harvest_pauses(apply=True, now=moment)["recovered_count"] == 0


@pytest.mark.parametrize("change", ["explicit_pause", "message", "credential", "selection", "missing", "ambiguous",
                                    "creator", "expired", "not_active", "failed_check", "later_edit", "no_daily_proof"])
def test_repair_never_enables_unproven_or_intentionally_paused_plans(client, change):
    from app.models import User
    from app.spark.repair import repair_harvest_pauses
    account, contact, _, harvest = reproduce_old_harvest_pause(client)
    if change == "explicit_pause":
        account.plan_revision += 1
    elif change == "message":
        account.config = {**config_for(account), "messages": ["new message"]}
    elif change == "credential":
        account.credential_revision += 1
    elif change == "selection":
        contact.selected = False
    elif change in ("missing", "ambiguous", "creator"):
        key = {"missing": "missing_in_sync", "ambiguous": "ambiguous", "creator": "has_conversation"}[change]
        contact.profile = {**contact.profile, key: change != "creator"}
    elif change == "expired":
        account.session_status = "expired"
    elif change == "not_active":
        db.session.get(User, account.user_id).status = "banned"
    elif change == "failed_check":
        check = db.session.scalar(db.select(SparkJob).where(SparkJob.kind == "dry_run"))
        check.status = "failed"
    elif change == "later_edit":
        account.updated_at = harvest.finished_at + timedelta(hours=3)
    elif change == "no_daily_proof":
        daily = db.session.scalar(db.select(SparkJob).where(SparkJob.source == "daily"))
        daily.dedupe_key = "0" * 64
    # Preserve the bug's original pause timestamp unless the scenario changes it.
    if change != "later_edit":
        account.updated_at = harvest.finished_at + timedelta(seconds=2)
    db.session.commit()
    assert repair_harvest_pauses(apply=True)["recovered_count"] == 0
    assert not config_for(account)["auto_run_enabled"]


def test_repair_cli_is_read_only_by_default(client, app):
    import json
    account, _, _, _ = reproduce_old_harvest_pause(client)
    runner = app.test_cli_runner()
    result = runner.invoke(args=["spark-repair-harvest-pauses"])
    assert result.exit_code == 0
    assert json.loads(result.output)["recovered_count"] == 1
    assert not config_for(account)["auto_run_enabled"]


def test_creator_nickname_change_requires_a_new_check_even_when_ids_stay_the_same(client):
    account, _, token = checked_plan(client, creator=True, profile={
        "short_id": "same-id", "user_id": "same-user", "nickname": "previous-nickname", "ambiguous": False,
    })
    class RenamingDriver(Driver):
        def harvest(self):
            return "succeeded", {"same-id": {"nickname": "new-nickname", "user_id": "same-user"}}
    job = queue(client, token, "harvest").get_json()["data"]
    execute_job(job["id"], RenamingDriver, sleep=lambda _: None)
    assert not validation_ready(account)
    schedule_due()
    assert not config_for(account)["auto_run_enabled"]


def test_credential_replacement_during_harvest_cannot_bless_old_results(client):
    import json
    from io import BytesIO
    from .test_spark import state_for
    account, _, token = checked_plan(client)
    old_revision = account.credential_revision
    class RebindingDriver(Driver):
        def harvest(self):
            response = client.post("/api/v1/spark/credentials", headers=auth(token), data={
                "file": (BytesIO(json.dumps(state_for("new-state")).encode()), "state.json"),
            })
            assert response.status_code == 200
            return super().harvest()
    job = queue(client, token, "harvest").get_json()["data"]
    execute_job(job["id"], RebindingDriver, sleep=lambda _: None)
    assert account.credential_revision > old_revision
    assert not validation_ready(account) and not config_for(account)["auto_run_enabled"]
    assert db.session.get(SparkJob, job["id"]).status == "cancelled"
