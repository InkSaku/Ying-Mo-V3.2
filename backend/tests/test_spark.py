from copy import deepcopy
from datetime import timedelta
from io import BytesIO
import json
import uuid

from cryptography.fernet import Fernet
import pytest

from app.extensions import db
from app.models import SparkAccount, SparkContact, SparkDelivery, SparkJob, User
from app.models.spark import now_utc
from app.spark.context import execution_state
from app.spark.credentials import decrypt_state
from app.spark.executor import execute_job, merge_consumer
from app.spark.service import config_for, get_account, local_now, next_daily, next_weekly, schedule_due, reset_schedule
from app.spark.worker import recover_interrupted, worker_lock
from .conftest import auth, register, token_from


@pytest.fixture(autouse=True)
def spark_key(app):
    app.config["SPARK_CREDENTIAL_KEY"] = Fernet.generate_key().decode()


def member(client, name):
    response = register(client, name)
    return response.get_json()["data"]["user"]["id"], token_from(response)


def state_for(value="private-session", uid="member-1"):
    return {"cookies": [{"name": "sessionid", "value": value, "domain": ".douyin.com", "path": "/",
                         "expires": -1, "httpOnly": True, "secure": True, "sameSite": "Lax"},
                        {"name": "uid_tt", "value": uid, "domain": ".douyin.com", "path": "/"}], "origins": []}


def bind(client, token, state=None):
    response = client.post("/api/v1/spark/credentials", headers=auth(token),
                           data={"file": (BytesIO(json.dumps(state or state_for()).encode()), "state.json")})
    # Phase-one executor regressions model existing, migration-grandfathered plans.
    # New-member onboarding and activation gates are tested in test_spark_phase_two.
    if response.status_code == 200:
        from flask_jwt_extended import decode_token
        account = get_account(int(decode_token(token)["sub"]))
        account.onboarding_required = False
        account.config = {**config_for(account), "auto_run_enabled": True}
        reset_schedule(account)
        db.session.commit()
    return response


def add_friend(user_id, name="好友", selected=True, creator=False):
    account = get_account(user_id)
    contact = SparkContact(account_id=account.user_id, display_name=name, selected=selected,
                           profile={"has_conversation": not creator, "channel": "creator" if creator else "consumer"})
    db.session.add(contact)
    db.session.commit()
    return contact


def queue(client, token, kind="send", request_id=None):
    return client.post("/api/v1/spark/jobs", headers=auth(token),
                       json={"kind": kind, "request_id": request_id or str(uuid.uuid4())})


class Driver:
    outcomes = {}
    calls = []
    during_send = None

    def __init__(self, cfg):
        self.cfg = cfg

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def sync(self):
        return "succeeded", [{"name": "好友", "streak": "🔥 81"}]

    def harvest(self):
        return "succeeded", {"douyin-id": {"nickname": "好友", "user_id": "platform-id"}}

    def send(self, contact, message, dry, before_send):
        type(self).calls.append((contact["display_name"], message, dry, deepcopy(execution_state())))
        if type(self).during_send:
            type(self).during_send()
        outcome = type(self).outcomes.get(contact["display_name"], "succeeded")
        if not dry and outcome in ("succeeded", "unknown", "crash"):
            before_send()
        if outcome == "crash":
            raise RuntimeError("secret URL sessionid=should-never-leak")
        return outcome, {"succeeded": "检查通过" if dry else "页面已确认发送", "failed": "未定位，未发送",
                         "unknown": "结果未确认", "expired": "登录态失效", "blocked": "平台要求验证"}[outcome]


@pytest.fixture(autouse=True)
def reset_driver():
    Driver.outcomes, Driver.calls, Driver.during_send = {}, [], None


def run(response):
    assert response.status_code == 202, response.get_json()
    job_id = response.get_json()["data"]["id"]
    execute_job(job_id, Driver, sleep=lambda _: None)
    return db.session.get(SparkJob, job_id)


def test_dry_run_publishes_current_recipient_before_browser_check(client):
    user_id, token = member(client, "sparkprogress")
    bind(client, token)
    add_friend(user_id, "好友甲")
    add_friend(user_id, "好友乙")
    response = queue(client, token, "dry_run")
    job_id = response.get_json()["data"]["id"]
    progress = []
    def observe_progress():
        job = db.session.get(SparkJob, job_id)
        progress.append(deepcopy(job.result))
    Driver.during_send = observe_progress
    job = run(response)
    assert [result["progress"] for result in progress] == [
        {"total": 2, "completed": 0, "current_name": "好友甲"},
        {"total": 2, "completed": 1, "current_name": "好友乙"},
    ]
    assert progress[0]["events"] == []
    assert progress[1]["events"][0]["name"] == "好友甲"
    assert job.status == "succeeded"
    assert db.session.scalar(db.select(db.func.count()).select_from(SparkDelivery)) == 0


def test_two_members_complete_independent_chains_and_credentials_never_leave_backend(client):
    alice, a = member(client, "sparkalice")
    bob, b = member(client, "sparkbob")
    assert bind(client, a, state_for("alice-secret", "alice-uid")).status_code == 200
    assert bind(client, b, state_for("bob-secret", "bob-uid")).status_code == 200
    alice_account = db.session.get(SparkAccount, alice)
    assert "alice-secret" not in alice_account.credential_ciphertext
    assert decrypt_state(alice_account.credential_ciphertext)["cookies"][0]["value"] == "alice-secret"
    assert run(queue(client, a, "sync")).status == "succeeded"
    assert run(queue(client, b, "sync")).status == "succeeded"
    for owner, token, message in ((alice, a, "Alice 的问候"), (bob, b, "Bob 的问候")):
        contacts = client.get("/api/v1/spark", headers=auth(token)).get_json()["data"]["contacts"]
        assert client.put("/api/v1/spark/contacts", headers=auth(token), json={"entries": [{"id": contacts[0]["id"], "selected": True}]}).status_code == 200
        assert client.put("/api/v1/spark/config", headers=auth(token), json={"messages": [message], "jitter_minutes": 0}).status_code == 200
        dry = run(queue(client, token, "dry_run"))
        assert dry.status == "succeeded"
        assert db.session.scalar(db.select(db.func.count()).select_from(SparkDelivery).where(SparkDelivery.account_id == owner)) == 0
        real = run(queue(client, token))
        assert real.status == "succeeded"
        assert real.result["events"][0]["name"] == "好友"
        response_text = client.get("/api/v1/spark", headers=auth(token)).get_data(as_text=True)
        assert "secret" not in response_text and "ciphertext" not in response_text and "cookies" not in response_text
    assert {call[3]["cookies"][0]["value"] for call in Driver.calls} == {"alice-secret", "bob-secret"}
    assert [call[1] for call in Driver.calls if not call[2]] == ["Alice 的问候", "Bob 的问候"]


def test_cross_member_contacts_jobs_config_and_credentials_are_private(client):
    alice, a = member(client, "sparkowner")
    _, b = member(client, "sparkoutsider")
    bind(client, a)
    contact = add_friend(alice)
    response = queue(client, a)
    job_id = response.get_json()["data"]["id"]
    assert client.post(f"/api/v1/spark/jobs/{job_id}/cancel", headers=auth(b)).status_code == 404
    assert client.put("/api/v1/spark/contacts", headers=auth(b), json={"entries": [{"id": contact.id, "selected": True}]}).status_code == 404
    assert client.put("/api/v1/spark/config", headers=auth(b), json={"user_id": alice}).status_code == 422
    assert not client.get("/api/v1/spark", headers=auth(b)).get_json()["data"]["bound"]
    assert db.session.get(SparkAccount, alice).credential_ciphertext


@pytest.mark.parametrize("method,path", [("get", ""), ("put", "/config"), ("post", "/credentials"),
    ("delete", "/credentials"), ("put", "/contacts"), ("post", "/jobs"), ("post", "/jobs/other/cancel"), ("get", "/login-helper")])
def test_all_routes_require_an_active_member(client, method, path):
    assert getattr(client, method)(f"/api/v1/spark{path}").status_code == 401
    user_id, token = member(client, f"restricted{method}{len(path)}")
    db.session.get(User, user_id).status = "banned"
    db.session.commit()
    assert getattr(client, method)(f"/api/v1/spark{path}", headers=auth(token)).status_code == 403


@pytest.mark.parametrize("patch", [{"auto_run_enabled": "false"}, {"jitter_minutes": True}, {"jitter_minutes": -1},
    {"messages": []}, {"messages": ["a" * 501]}, {"schedule_time": "25:30"}, {"schedule_time": "9:00"},
    {"schedule_harvest_day": "invalid"}, {"creator_user_detail_path": "https://attacker.test"}, {"send_gap_min": 20, "send_gap_max": 6}])
def test_configuration_rejects_invalid_types_and_bounds(client, patch):
    _, token = member(client, "validatespark")
    response = client.put("/api/v1/spark/config", headers=auth(token), json=patch)
    assert response.status_code == 422


def test_invalid_credentials_missing_key_and_foreign_origins(client, app):
    _, token = member(client, "credentialspark")
    assert bind(client, token, {"cookies": []}).status_code == 422
    assert bind(client, token, {"cookies": [{"name": "sessionid", "value": "fake", "domain": ".evil.test", "path": "/"}]}).status_code == 422
    app.config["SPARK_CREDENTIAL_KEY"] = ""
    assert bind(client, token).status_code == 422
    assert not client.get("/api/v1/spark", headers=auth(token)).get_json()["data"]["bound"]


def test_request_id_is_idempotent_and_other_request_cannot_start_parallel_job(client):
    user, token = member(client, "idempotentspark")
    bind(client, token)
    add_friend(user)
    request_id = str(uuid.uuid4())
    first = queue(client, token, request_id=request_id)
    second = queue(client, token, request_id=request_id)
    assert first.status_code == second.status_code == 202
    assert first.get_json()["data"]["id"] == second.get_json()["data"]["id"]
    assert queue(client, token).status_code == 409


@pytest.mark.parametrize("first_status", ["succeeded", "unknown", "crash"])
def test_same_day_success_or_uncertainty_never_resends(client, first_status):
    user, token = member(client, "dedupespark")
    bind(client, token)
    add_friend(user)
    Driver.outcomes = {"好友": first_status}
    first = run(queue(client, token))
    expected = "unknown" if first_status == "crash" else first_status
    assert first.status == expected
    assert "should-never-leak" not in json.dumps(first.result)
    second = run(queue(client, token))
    assert second.result["events"][0]["status"] == "skipped"
    assert len(Driver.calls) == 1
    assert not db.session.scalar(db.select(SparkJob.id).where(SparkJob.source == "retry"))


def test_failure_before_send_retries_only_failed_friend_once(client):
    user, token = member(client, "retryspark")
    bind(client, token)
    add_friend(user, "成功好友")
    add_friend(user, "失败好友")
    Driver.outcomes = {"失败好友": "failed"}
    first = run(queue(client, token))
    assert first.status == "partial"
    retry = db.session.scalar(db.select(SparkJob).where(SparkJob.source == "retry"))
    assert retry.payload["only_names"] == ["失败好友"]
    Driver.outcomes = {}
    execute_job(retry.id, Driver, sleep=lambda _: None)
    assert [call[0] for call in Driver.calls] == ["成功好友", "失败好友", "失败好友"]
    assert db.session.scalar(db.select(db.func.count()).select_from(SparkJob).where(SparkJob.source == "retry")) == 1


def test_failed_simulation_cannot_schedule_real_messages(client):
    user, token = member(client, "dryspark")
    bind(client, token)
    add_friend(user)
    Driver.outcomes = {"好友": "failed"}
    assert run(queue(client, token, "dry_run")).status == "failed"
    assert not db.session.scalar(db.select(SparkJob.id).where(SparkJob.source == "retry"))
    assert not db.session.scalar(db.select(SparkDelivery.id))


def test_cancel_at_send_boundary_and_unbind_invalidate_old_jobs(client):
    user, token = member(client, "cancelspark")
    bind(client, token)
    add_friend(user)
    response = queue(client, token)
    job_id = response.get_json()["data"]["id"]
    def cancel():
        db.session.get(SparkJob, job_id).cancel_requested = True
        db.session.commit()
    Driver.during_send = cancel
    run(response)
    assert db.session.get(SparkJob, job_id).status == "cancelled"
    assert db.session.scalar(db.select(SparkDelivery)).status == "failed"
    Driver.during_send = None
    old = queue(client, token, "sync").get_json()["data"]["id"]
    assert client.delete("/api/v1/spark/credentials", headers=auth(token)).status_code == 200
    assert db.session.get(SparkJob, old).status == "cancelled"
    assert not db.session.get(SparkAccount, user).credential_ciphertext
    assert not db.session.scalar(db.select(SparkContact.id).where(SparkContact.account_id == user))


def test_restart_journal_marks_enter_unknown_without_replay(client):
    user, token = member(client, "restartspark")
    bind(client, token)
    add_friend(user)
    job = db.session.get(SparkJob, queue(client, token).get_json()["data"]["id"])
    job.status = "running"
    db.session.add(SparkDelivery(account_id=user, job_id=job.id, local_day=job.local_day,
        recipient_key="test", display_name="好友", channel="consumer", status="sending"))
    db.session.commit()
    recover_interrupted()
    assert db.session.get(SparkJob, job.id).status == "unknown"
    assert db.session.scalar(db.select(SparkDelivery)).status == "unknown"
    execute_job(job.id, Driver)
    assert not Driver.calls


def test_parent_stale_job_snapshot_cannot_overwrite_child_completion(client):
    from sqlalchemy.orm import Session
    from app.spark.executor import interrupted
    user, token = member(client, "completedchild")
    bind(client, token)
    job_id = queue(client, token, "sync").get_json()["data"]["id"]
    job = db.session.get(SparkJob, job_id)
    job.status = "running"
    db.session.commit()
    assert job.status == "running"
    with Session(db.engine) as child:
        completed = child.get(SparkJob, job_id)
        completed.status = "succeeded"
        completed.result = {"message": "同步完成", "count": 31}
        completed.finished_at = now_utc()
        child.commit()
    assert job.status == "running"  # Parent cached state predates child commit.
    interrupted(job_id, "执行进程中断，请检查结果后重试")
    db.session.expire_all()
    assert db.session.get(SparkJob, job_id).status == "succeeded"
    assert db.session.get(SparkJob, job_id).result == {"message": "同步完成", "count": 31}


def test_daily_schedule_is_persistent_deduplicated_and_pause_cancels_automatic_jobs(client):
    user, token = member(client, "schedulespark")
    bind(client, token)
    add_friend(user)
    account = db.session.get(SparkAccount, user)
    account.config = {**config_for(account), "jitter_minutes": 0}
    account.next_run_at = now_utc() - timedelta(seconds=1)
    db.session.commit()
    due = now_utc()
    schedule_due(due)
    schedule_due(due)
    jobs = db.session.scalars(db.select(SparkJob)).all()
    assert len(jobs) == 1
    assert jobs[0].source == "daily"
    assert account.next_run_at > due
    response = client.put("/api/v1/spark/config", headers=auth(token), json={"auto_run_enabled": False})
    assert response.status_code == 200
    assert db.session.get(SparkJob, jobs[0].id).status == "cancelled"
    assert account.next_run_at is None and account.next_harvest_at is not None


@pytest.mark.parametrize("status", ["expired", "blocked"])
def test_login_failure_suspends_schedules_and_never_retries(client, status):
    user, token = member(client, "expiredspark")
    bind(client, token)
    add_friend(user)
    Driver.outcomes = {"好友": status}
    assert run(queue(client, token)).status == status
    account = db.session.get(SparkAccount, user)
    assert account.session_status == status and account.next_run_at is None
    assert not db.session.scalar(db.select(SparkJob.id).where(SparkJob.source == "retry"))
    assert queue(client, token).status_code == 409
    assert run(queue(client, token, "sync")).status == "succeeded"
    assert account.session_status == "ready" and account.next_run_at


def test_creator_channel_daily_and_per_run_limits_survive_new_jobs(client):
    user, token = member(client, "creatorspark")
    bind(client, token)
    add_friend(user, "新朋友一", creator=True)
    add_friend(user, "新朋友二", creator=True)
    client.put("/api/v1/spark/config", headers=auth(token), json={"allow_first_message": True, "auto_run_enabled": False})
    run(queue(client, token, "dry_run"))
    Driver.calls = []
    first = run(queue(client, token))
    assert [e["status"] for e in first.result["events"]] == ["succeeded", "skipped"]
    second = run(queue(client, token))
    assert second.status == "succeeded"
    assert all(e["status"] == "skipped" for e in second.result["events"])
    assert any("上限" in e["reason"] for e in second.result["events"])
    assert len([c for c in Driver.calls if c[0] == "新朋友一"]) == 1
    assert db.session.scalar(db.select(db.func.count()).select_from(SparkDelivery).where(SparkDelivery.status == "succeeded")) == 1


def test_credentials_refresh_retains_verified_same_account_but_switch_clears_friends(client):
    user, token = member(client, "refreshspark")
    bind(client, token)
    friend = add_friend(user)
    bind(client, token, state_for("new-session", "member-1"))
    assert db.session.get(SparkContact, friend.id).selected
    bind(client, token, state_for("other-session", "other-member"))
    assert not db.session.scalar(db.select(SparkContact.id).where(SparkContact.account_id == user))


def test_banned_user_queued_job_never_executes(client):
    user, token = member(client, "bannedspark")
    bind(client, token)
    add_friend(user)
    response = queue(client, token)
    db.session.get(User, user).status = "banned"
    db.session.commit()
    assert run(response).status == "cancelled"
    assert not Driver.calls


def test_worker_lock_prevents_second_process(tmp_path):
    path = tmp_path / "worker.lock"
    with worker_lock(path):
        with pytest.raises(RuntimeError, match="第二个实例"):
            with worker_lock(path):
                pass


def test_beijing_schedule_does_not_depend_on_host_timezone():
    from datetime import datetime
    cfg = {"schedule_time": "21:00", "schedule_harvest_day": "wed"}
    now = datetime(2026, 10, 14, 12, 59)
    assert next_daily(cfg, now) == datetime(2026, 10, 14, 13)
    assert next_daily(cfg, datetime(2026, 10, 14, 13)) == datetime(2026, 10, 15, 13)
    assert next_weekly(cfg, now) == datetime(2026, 10, 20, 19)


def test_delayed_schedules_do_not_backfill_prior_days(client):
    user, token = member(client, "outagespark")
    bind(client, token)
    add_friend(user)
    account = db.session.get(SparkAccount, user)
    account.next_run_at = now_utc() - timedelta(days=3)
    account.next_harvest_at = None
    db.session.commit()
    schedule_due()
    assert account.next_run_at > now_utc()
    assert not db.session.scalar(db.select(SparkJob.id))


def test_contact_selection_order_is_preserved(client):
    user, token = member(client, "orderspark")
    bind(client, token)
    one = add_friend(user, "第一位", selected=False)
    two = add_friend(user, "第二位", selected=False)
    response = client.put("/api/v1/spark/contacts", headers=auth(token), json={
        "entries": [{"id": two.id, "selected": True}, {"id": one.id, "selected": True}]})
    assert [c["display_name"] for c in response.get_json()["data"]["contacts"]] == ["第二位", "第一位"]
    client.put("/api/v1/spark/config", headers=auth(token), json={"schedule_time": "22:00"})
    run(queue(client, token, "dry_run"))
    Driver.calls = []
    run(queue(client, token))
    assert [c[0] for c in Driver.calls] == ["第二位", "第一位"]


def test_worker_lock_remains_held_by_child_after_parent_closes_handle(tmp_path):
    import subprocess
    import sys
    path = tmp_path / "inherited.lock"
    with worker_lock(path) as fd:
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(0.5)"], pass_fds=(fd,))
    try:
        with pytest.raises(RuntimeError):
            with worker_lock(path):
                pass
    finally:
        child.wait()
    with worker_lock(path):
        pass


def test_file_database_survives_app_restart_with_schedule_and_job(tmp_path):
    from app import create_app
    from app.spark.credentials import encrypt_state
    from app.spark.service import enqueue, reset_schedule
    options = {"SQLALCHEMY_DATABASE_URI": f"sqlite+pysqlite:///{tmp_path / 'restart.db'}",
               "SPARK_CREDENTIAL_KEY": Fernet.generate_key().decode(), "RATELIMIT_ENABLED": False}
    first_app = create_app("testing", options)
    with first_app.app_context():
        db.create_all()
        owner = User(username="persistent", username_normalized="persistent", email="persistent@example.com",
                     email_normalized="persistent@example.com", nickname="持久化", password_hash="test")
        db.session.add(owner)
        db.session.commit()
        owner_id = owner.id
        account = get_account(owner_id)
        account.credential_ciphertext = encrypt_state(state_for())
        account.credential_revision = 1
        account.session_status = "ready"
        account.onboarding_required = False
        account.config = {**config_for(account), "auto_run_enabled": True}
        reset_schedule(account)
        planned = account.next_run_at
        assert planned is not None
        job_id = enqueue(account, "sync", "manual", str(uuid.uuid4())).id
        db.session.commit()
        db.session.remove()
    second_app = create_app("testing", options)
    with second_app.app_context():
        assert db.session.get(SparkAccount, owner_id).next_run_at == planned
        assert decrypt_state(db.session.get(SparkAccount, owner_id).credential_ciphertext)["cookies"]
        assert db.session.get(SparkJob, job_id).status == "queued"
        execute_job(job_id, Driver, sleep=lambda _: None)
        assert db.session.get(SparkJob, job_id).status == "succeeded"


def test_saved_plan_replaces_cancelled_same_day_job_instead_of_losing_new_schedule(client):
    user, token = member(client, "replanspark")
    bind(client, token)
    add_friend(user)
    account = db.session.get(SparkAccount, user)
    for messages in (["初次计划"], ["修改计划"], ["初次计划"]):
        response = client.put("/api/v1/spark/config", headers=auth(token), json={"messages": messages, "jitter_minutes": 0, "auto_run_enabled": False})
        assert response.status_code == 200
        run(queue(client, token, "dry_run"))
        Driver.calls = []
        assert client.put("/api/v1/spark/config", headers=auth(token), json={"auto_run_enabled": True}).status_code == 200
        account.next_run_at = now_utc() - timedelta(seconds=1)
        db.session.commit()
        schedule_due()
    jobs = db.session.scalars(db.select(SparkJob).where(SparkJob.source == "daily").order_by(SparkJob.created_at)).all()
    assert [job.status for job in jobs] == ["cancelled", "cancelled", "queued"]
    execute_job(jobs[-1].id, Driver, sleep=lambda _: None)
    assert len(Driver.calls) == 1


def test_queue_overview_explains_shared_serial_work_without_other_member_details(client):
    alice, a = member(client, "queuealice")
    bob, b = member(client, "queuebob")
    bind(client, a, state_for("alice-secret", "alice-uid"))
    bind(client, b, state_for("bob-secret", "bob-uid"))
    other_id = queue(client, b, "sync").get_json()["data"]["id"]
    other = db.session.get(SparkJob, other_id)
    other.status = "running"
    other.result = {"message": "private-member-task", "events": [{"name": "private-contact"}]}
    db.session.commit()
    own_id = queue(client, a, "sync").get_json()["data"]["id"]
    response = client.get("/api/v1/spark", headers=auth(a))
    data = response.get_json()["data"]
    assert data["queue"] == {"mode": "serial", "busy": True, "ready_count": 1}
    assert [job["id"] for job in data["jobs"]] == [own_id]
    serialized = response.get_data(as_text=True)
    assert all(value not in serialized for value in (other_id, "private-member-task", "private-contact", "bob-secret"))


def test_queue_snapshot_excludes_future_cancelled_and_expired_work(client):
    from app.models import SparkLoginSession
    from app.spark.service import queue_snapshot
    user_id, token = member(client, "queuestates")
    bind(client, token)
    job_id = queue(client, token, "sync").get_json()["data"]["id"]
    now = now_utc()
    job = db.session.get(SparkJob, job_id)
    job.scheduled_at = now + timedelta(minutes=45)
    login = SparkLoginSession(id=str(uuid.uuid4()), account_id=user_id, generation=1,
                              base_credential_revision=1, status="awaiting_confirmation",
                              expires_at=now + timedelta(minutes=2))
    db.session.add(login)
    db.session.commit()
    assert queue_snapshot(now) == {"mode": "serial", "busy": False, "ready_count": 0}
    login.status = "waiting_scan"
    db.session.commit()
    assert queue_snapshot(now)["busy"] is True
    login.status = "queued"
    db.session.commit()
    assert queue_snapshot(now) == {"mode": "serial", "busy": False, "ready_count": 1}
    login.expires_at = now - timedelta(seconds=1)
    job.scheduled_at = now - timedelta(seconds=1)
    db.session.commit()
    assert queue_snapshot(now)["ready_count"] == 1
    job.cancel_requested = True
    db.session.commit()
    assert queue_snapshot(now)["ready_count"] == 0
