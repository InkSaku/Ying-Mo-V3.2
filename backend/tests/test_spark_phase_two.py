from datetime import timedelta
from io import BytesIO
import json
import uuid

from cryptography.fernet import Fernet
import pytest

from app.extensions import db
from app.models import SparkAccount, SparkContact, SparkJob, SparkLoginSession
from app.models.spark import now_utc
from app.spark.credentials import credential_cipher, decrypt_state
from app.spark.login_browser import identity_profile
from app.spark.login_session import claim_login, run_login, sweep_sessions
from app.spark.executor import execute_job, merge_consumer
from app.spark.service import get_account, config_for, validation_ready
from .conftest import auth, register, token_from
from .test_spark import state_for, Driver


@pytest.fixture(autouse=True)
def key(app):
    app.config["SPARK_CREDENTIAL_KEY"] = Fernet.generate_key().decode()


def member(client, name="qrmember"):
    response = register(client, name)
    return response.get_json()["data"]["user"]["id"], token_from(response)


def start(client, token, force=False):
    return client.post("/api/v1/spark/login-sessions", headers=auth(token), json={"force_new": force})


def candidate(client, token, uid="test-uid"):
    response = start(client, token)
    session_id = response.get_json()["data"]["id"]
    claimed = claim_login()
    assert claimed.id == session_id
    def observer(on_qr, on_status, check):
        check()
        on_qr(b"test-qr-png-secret")
        on_status("verifying")
        state = state_for(uid=uid)
        return state, identity_profile(state, {"nickname": "扫码账号", "unique_id": "display-id"})
    run_login(session_id, observer)
    return db.session.get(SparkLoginSession, session_id)


def confirm(client, token, session):
    return client.post(f"/api/v1/spark/login-sessions/{session.id}/confirm", headers=auth(token), json={})


def run_sync(account):
    job = db.session.scalar(db.select(SparkJob).where(SparkJob.account_id == account.user_id, SparkJob.status == "queued", SparkJob.kind == "sync"))
    execute_job(job.id, Driver, sleep=lambda _: None)


def test_qr_confirm_is_atomic_private_idempotent_and_syncs_without_enabling(client):
    user, token = member(client)
    session = candidate(client, token)
    assert session.status == "awaiting_confirmation"
    assert session.qr_ciphertext is None
    assert "private-session" not in session.candidate_ciphertext
    assert get_account(user).credential_ciphertext is None
    assert confirm(client, token, session).status_code == 200
    account = get_account(user)
    assert decrypt_state(account.credential_ciphertext)["cookies"][0]["value"] == "private-session"
    assert config_for(account)["auto_run_enabled"] is False
    assert account.session_status == "unverified"
    assert session.candidate_ciphertext is None
    assert confirm(client, token, session).status_code == 200
    assert account.credential_revision == 1
    assert db.session.scalar(db.select(db.func.count()).select_from(SparkJob)) == 1
    run_sync(account)
    assert account.session_status == "ready"
    assert not config_for(account)["auto_run_enabled"]


def test_pending_official_window_is_visible_and_success_keeps_safe_diagnostics(client):
    _, token = member(client, "handoffmember")
    session_id = start(client, token).get_json()["data"]["id"]
    claim_login()
    def observer(on_qr, on_status, check):
        check()
        on_status("diagnostic", {"cookie_names": ["sessionid"], "scan_signal": {"data_error_code": 0}})
        on_status("verifying", {"browser_visible": True})
        data = client.get("/api/v1/spark", headers=auth(token)).get_json()["data"]["login_session"]
        assert data["status"] == "verifying"
        assert "已打开的抖音官方浏览器窗口" in data["reason"]
        assert "短信" not in data["reason"]
        assert "diagnostics" not in data["detected_account"]
        state = state_for()
        return state, identity_profile(state)
    run_login(session_id, observer)
    session = db.session.get(SparkLoginSession, session_id)
    assert session.status == "awaiting_confirmation"
    assert session.reason == ""
    assert session.detected_account["diagnostics"]["cookie_names"] == ["sessionid"]


def test_repeated_start_and_second_tab_share_same_session(client):
    _, token = member(client)
    first = start(client, token).get_json()["data"]["id"]
    assert start(client, token).get_json()["data"]["id"] == first
    data = client.get("/api/v1/spark", headers=auth(token)).get_json()["data"]
    assert data["login_session"]["id"] == first
    assert db.session.scalar(db.select(db.func.count()).select_from(SparkLoginSession)) == 1


@pytest.mark.parametrize("path,method", [("qr", "get"), ("confirm", "post"), ("cancel", "post")])
def test_cross_user_cannot_read_or_destroy_pending_credentials(client, path, method):
    _, token = member(client)
    _, other = member(client, "otherqrmember")
    session = candidate(client, token)
    before = session.candidate_ciphertext
    response = getattr(client, method)(f"/api/v1/spark/login-sessions/{session.id}/{path}", headers=auth(other))
    assert response.status_code == 404
    db.session.refresh(session)
    assert session.candidate_ciphertext == before and session.status == "awaiting_confirmation"


def test_qr_requires_header_auth_and_is_not_cached(client):
    _, token = member(client)
    session_id = start(client, token).get_json()["data"]["id"]
    session = claim_login()
    session.status = "waiting_scan"
    session.qr_ciphertext = credential_cipher().encrypt(b"private-png").decode()
    db.session.commit()
    url = f"/api/v1/spark/login-sessions/{session_id}/qr"
    assert client.get(url).status_code == 401
    response = client.get(url, headers=auth(token))
    assert response.data == b"private-png" and response.mimetype == "image/png"
    assert "no-store" in response.headers["Cache-Control"]
    public = client.get("/api/v1/spark", headers=auth(token)).get_json()["data"]
    assert "private-png" not in json.dumps(public) and "ciphertext" not in json.dumps(public)


@pytest.mark.parametrize("mutation", ["cancel", "new", "upload", "unbind", "ban", "expire"])
def test_late_worker_result_never_overwrites_after_mutation(client, mutation):
    user, token = member(client)
    session_id = start(client, token).get_json()["data"]["id"]
    claim_login()
    def observer(on_qr, on_status, check):
        on_qr(b"qr-secret")
        if mutation == "cancel":
            client.post(f"/api/v1/spark/login-sessions/{session_id}/cancel", headers=auth(token))
        elif mutation == "new":
            start(client, token, True)
        elif mutation == "upload":
            client.post("/api/v1/spark/credentials", headers=auth(token), data={"file": (BytesIO(json.dumps(state_for(uid="newer")).encode()), "state.json")})
        elif mutation == "unbind":
            client.delete("/api/v1/spark/credentials", headers=auth(token))
        elif mutation == "ban":
            from app.models import User
            db.session.get(User, user).status = "banned"
            db.session.commit()
        else:
            db.session.get(SparkLoginSession, session_id).expires_at = now_utc() - timedelta(seconds=1)
            db.session.commit()
        state = state_for(uid="old-result")
        return state, identity_profile(state)
    run_login(session_id, observer)
    session = db.session.get(SparkLoginSession, session_id)
    assert session.candidate_ciphertext is None and session.qr_ciphertext is None
    account = get_account(user)
    if mutation == "upload":
        assert identity_profile(decrypt_state(account.credential_ciphertext))["identity_hash"] == identity_profile(state_for(uid="newer"))["identity_hash"]
    else:
        assert account.credential_ciphertext is None


def test_old_candidate_cannot_confirm_after_new_credentials(client):
    _, token = member(client)
    session = candidate(client, token)
    client.post("/api/v1/spark/credentials", headers=auth(token), data={"file": (BytesIO(json.dumps(state_for(uid="new")).encode()), "state.json")})
    assert confirm(client, token, session).status_code == 409
    assert session.candidate_ciphertext is None


def test_confirmation_expiry_commits_cleanup(client):
    _, token = member(client)
    session = candidate(client, token)
    session.expires_at = now_utc() - timedelta(seconds=1)
    db.session.commit()
    assert confirm(client, token, session).status_code == 409
    db.session.refresh(session)
    assert session.status == "expired" and session.candidate_ciphertext is None


def test_restart_interrupts_browser_but_keeps_unexpired_confirmation(client):
    _, a = member(client)
    _, b = member(client, "secondqr")
    saved = candidate(client, a)
    queued = start(client, b).get_json()["data"]["id"]
    active = claim_login()
    assert active.id == queued
    sweep_sessions(recover=True)
    assert active.status == "interrupted"
    assert saved.status == "awaiting_confirmation" and saved.candidate_ciphertext


@pytest.mark.parametrize("same", [True, False])
def test_reconnect_preserves_only_verified_same_account_and_always_pauses(client, same):
    user, token = member(client)
    first = candidate(client, token, "one")
    confirm(client, token, first)
    account = get_account(user)
    run_sync(account)
    contact = db.session.scalar(db.select(SparkContact).where(SparkContact.account_id == user))
    contact.selected = True
    account.config = {**config_for(account), "auto_run_enabled": True}
    db.session.commit()
    second = candidate(client, token, "one" if same else "two")
    assert second.detected_account["same_account"] is same
    confirm(client, token, second)
    assert not config_for(account)["auto_run_enabled"]
    assert bool(db.session.scalar(db.select(SparkContact.id).where(SparkContact.account_id == user, SparkContact.selected.is_(True)))) is same


@pytest.mark.parametrize("legacy", [False, True])
def test_activation_requires_current_full_check_and_saved_plan(client, legacy):
    user, token = member(client)
    session = candidate(client, token)
    confirm(client, token, session)
    account = get_account(user)
    run_sync(account)
    if legacy:
        account.onboarding_required = False
        db.session.commit()
    contact = db.session.scalar(db.select(SparkContact).where(SparkContact.account_id == user))
    client.put("/api/v1/spark/contacts", headers=auth(token), json={"entries": [{"id": contact.id, "selected": True}]})
    assert client.put("/api/v1/spark/config", headers=auth(token), json={"auto_run_enabled": True}).status_code == 409
    response = client.post("/api/v1/spark/jobs", headers=auth(token), json={"kind": "dry_run", "request_id": str(uuid.uuid4())})
    execute_job(response.get_json()["data"]["id"], Driver, sleep=lambda _: None)
    assert validation_ready(account)
    # Dry-run alone does not mark the plan saved.
    assert account.config_saved_at is None
    assert client.post("/api/v1/spark/jobs", headers=auth(token), json={"kind": "send", "request_id": str(uuid.uuid4())}).status_code == 409
    assert client.put("/api/v1/spark/config", headers=auth(token), json={"schedule_time": "22:00"}).status_code == 200
    assert client.put("/api/v1/spark/config", headers=auth(token), json={"auto_run_enabled": True}).status_code == 200
    assert account.next_run_at
    client.put("/api/v1/spark/contacts", headers=auth(token), json={"entries": [{"id": contact.id, "selected": False}]})
    assert not config_for(account)["auto_run_enabled"] and not validation_ready(account)


def test_missing_friend_is_retained_for_review_but_cannot_pass_check(client):
    user, token = member(client)
    account = get_account(user)
    contact = SparkContact(account_id=user, display_name="旧好友", selected=True, profile={"has_conversation": True})
    db.session.add(contact)
    db.session.commit()
    merge_consumer(account, [{"name": "新好友"}])
    assert contact.profile["missing_in_sync"] is True and contact.selected


def test_queue_timeout_is_separate_from_scan_timeout(client):
    _, token = member(client)
    session_id = start(client, token).get_json()["data"]["id"]
    session = db.session.get(SparkLoginSession, session_id)
    assert session.expires_at > now_utc() + timedelta(minutes=29)
    claim_login()
    assert session.expires_at < now_utc() + timedelta(minutes=4)
