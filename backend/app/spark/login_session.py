"""Owned, versioned and expiring QR sessions sharing the serial browser worker."""
from datetime import timedelta
import uuid

from app.extensions import db
from app.models import SparkAccount, SparkLoginSession, User
from app.models.spark import now_utc
from .credentials import CredentialError, credential_cipher, decrypt_state, encrypt_state
from .login_browser import identity_profile, LoginBrowserError, observe_login, login_handoff_prompt, login_browser_headless
from .service import SparkError, cancel_jobs, config_for, enqueue, get_account, reset_schedule

LIVE = ("queued", "preparing", "waiting_scan", "verifying", "awaiting_confirmation")
BROWSER = ("preparing", "waiting_scan", "verifying")


def finish(session, status, reason=""):
    session.status, session.reason, session.finished_at = status, reason, now_utc()
    session.qr_ciphertext = session.candidate_ciphertext = None


def invalidate_sessions(account, reason="账号连接已更新，请重新扫码。"):
    account.login_generation += 1
    for session in db.session.scalars(db.select(SparkLoginSession).where(
        SparkLoginSession.account_id == account.user_id, SparkLoginSession.status.in_(LIVE)).with_for_update()):
        session.cancel_requested = True
        finish(session, "cancelled", reason)


def latest_session(account):
    return db.session.scalar(db.select(SparkLoginSession).where(
        SparkLoginSession.account_id == account.user_id, SparkLoginSession.generation == account.login_generation))


def sweep_sessions(now=None, *, recover=False):
    now = now or now_utc()
    ids = db.session.execute(db.select(SparkLoginSession.account_id, SparkLoginSession.id).where(
        SparkLoginSession.status.in_(LIVE)).order_by(SparkLoginSession.account_id)).all()
    for account_id, session_id in ids:
        account = get_account(account_id, lock=True)
        session = db.session.scalar(db.select(SparkLoginSession).where(SparkLoginSession.id == session_id).with_for_update())
        if not session or session.status not in LIVE:
            continue
        actor = db.session.get(User, account_id)
        if not actor or actor.status != "active" or session.cancel_requested or session.generation != account.login_generation or session.base_credential_revision != account.credential_revision:
            finish(session, "cancelled", "账号或连接已更新，本次连接已结束。")
        elif session.expires_at <= now:
            finish(session, "expired", "连接等待已超时，请重新连接。")
        elif recover and session.status in BROWSER:
            finish(session, "interrupted", "后台已重启，请重新扫码连接。")
    db.session.commit()


def start_session(account, force_new=False):
    credential_cipher()
    old = latest_session(account)
    if old and old.status in LIVE and old.expires_at > now_utc() and not force_new:
        return old
    invalidate_sessions(account)
    pending = db.session.scalar(db.select(db.func.count()).select_from(SparkLoginSession).where(SparkLoginSession.status.in_(LIVE)))
    if pending >= 10:
        raise SparkError("当前连接请求较多，请稍后重试。", 409, "SPARK_LOGIN_BUSY")
    session = SparkLoginSession(id=str(uuid.uuid4()), account_id=account.user_id,
        generation=account.login_generation, base_credential_revision=account.credential_revision,
        status="queued", expires_at=now_utc() + timedelta(minutes=30), detected_account={})
    db.session.add(session)
    db.session.commit()
    return session


def owned_session(account, session_id):
    session = db.session.scalar(db.select(SparkLoginSession).where(
        SparkLoginSession.id == session_id, SparkLoginSession.account_id == account.user_id).with_for_update())
    if not session:
        raise SparkError("未找到连接会话。", 404, "NOT_FOUND")
    return session


def valid_session(account, session):
    actor = db.session.get(User, account.user_id)
    return bool(actor and actor.status == "active" and not session.cancel_requested
        and session.generation == account.login_generation
        and session.base_credential_revision == account.credential_revision
        and session.expires_at > now_utc() and session.status in LIVE)


def claim_login(now=None):
    now = now or now_utc()
    pending = db.session.execute(db.select(SparkLoginSession.account_id, SparkLoginSession.id).where(
        SparkLoginSession.status == "queued", SparkLoginSession.expires_at > now)
        .order_by(SparkLoginSession.created_at).limit(1)).first()
    if not pending:
        return None
    account = get_account(pending.account_id, lock=True)
    session = owned_session(account, pending.id)
    if session.status != "queued" or not valid_session(account, session):
        db.session.rollback()
        return None
    session.status, session.started_at = "preparing", now
    session.expires_at = now + timedelta(seconds=180)
    db.session.commit()
    return session


def assert_login_active(session_id):
    db.session.expire_all()
    owner = db.session.scalar(db.select(SparkLoginSession.account_id).where(SparkLoginSession.id == session_id))
    if owner is None:
        raise LoginBrowserError("cancelled", "连接已结束。")
    account = get_account(owner, lock=True)
    session = owned_session(account, session_id)
    if not valid_session(account, session) or session.status not in BROWSER:
        db.session.rollback()
        raise LoginBrowserError("cancelled", "连接已取消或过期。")
    return account, session


def run_login(session_id, observer=observe_login):
    try:
        def check():
            assert_login_active(session_id)
            db.session.commit()  # Never hold row locks while waiting for the phone.
        def status(value, diagnostics=None):
            _, session = assert_login_active(session_id)
            if value == "diagnostic":
                session.detected_account = {**(session.detected_account or {}), "diagnostics": diagnostics}
            else:
                session.status = value
                session.reason = login_handoff_prompt(browser_visible=diagnostics.get("browser_visible", False), visible_challenge=diagnostics.get("visible_challenge", False)) if value == "verifying" and diagnostics else ""
            if value == "verifying":
                session.qr_ciphertext = None
            db.session.commit()
        def qr(image):
            if len(image) > 512 * 1024:
                raise LoginBrowserError("interrupted", "二维码图片异常，请重新连接。")
            _, session = assert_login_active(session_id)
            session.qr_ciphertext = credential_cipher().encrypt(image).decode()
            session.qr_updated_at, session.status = now_utc(), "waiting_scan"
            session.reason = "" if login_browser_headless() else "请用手机扫描本页或已打开的抖音官方窗口中的二维码，并确认登录。请保持官方窗口打开，完成后本页会自动更新。"
            db.session.commit()
        state, profile = observer(qr, status, check)
        account, session = assert_login_active(session_id)
        session.candidate_ciphertext = encrypt_state(state)
        old = None
        if account.credential_ciphertext:
            try:
                old = identity_profile(decrypt_state(account.credential_ciphertext))
            except ValueError:
                pass
        profile["same_account"] = bool(old and profile.get("identity_hash") and old.get("identity_hash") == profile["identity_hash"])
        # Preserve structural success diagnostics for comparison with failures.
        session.detected_account = {**profile, "diagnostics": (session.detected_account or {}).get("diagnostics")}
        session.reason = ""
        session.qr_ciphertext = None
        session.status, session.expires_at = "awaiting_confirmation", now_utc() + timedelta(minutes=5)
        db.session.commit()
    except LoginBrowserError as error:
        db.session.rollback()
        terminate_login(session_id, error.status, error.reason)
    except CredentialError as error:
        db.session.rollback()
        terminate_login(session_id, "interrupted", f"登录态校验未通过：{error}")
    except Exception:
        db.session.rollback()
        terminate_login(session_id, "interrupted", "后台未能完成连接，请稍后重试。")


def terminate_login(session_id, status="interrupted", reason="后台连接中断，请重新扫码。"):
    owner = db.session.scalar(db.select(SparkLoginSession.account_id).where(SparkLoginSession.id == session_id))
    if owner is None:
        return
    account = get_account(owner, lock=True)
    session = owned_session(account, session_id)
    if session.status in BROWSER:
        if session.expires_at <= now_utc():
            status, reason = "expired", "等待扫码超时，请重新连接。"
        finish(session, status, reason)
    db.session.commit()


def bind_state(account, state, profile=None, *, via="file"):
    from app.models import SparkContact
    profile = profile or identity_profile(state)
    same = False
    if account.credential_ciphertext:
        try:
            old = identity_profile(decrypt_state(account.credential_ciphertext))
            same = bool(profile.get("identity_hash") and old.get("identity_hash") == profile["identity_hash"])
        except ValueError:
            pass
    previous_enabled = config_for(account)["auto_run_enabled"]
    cancel_jobs(account)
    if not same:
        db.session.execute(db.delete(SparkContact).where(SparkContact.account_id == account.user_id))
        account.contacts_updated_at = None
    account.credential_ciphertext = encrypt_state(state)
    account.credential_revision += 1
    account.credential_updated_at = now_utc()
    account.account_profile = {**profile, "bound_via": via, "plan_was_enabled": previous_enabled if same else False}
    account.config = {**config_for(account), "auto_run_enabled": False}
    account.onboarding_required = True
    account.validation_fingerprint = account.validated_at = None
    account.session_status = "unverified"
    reset_schedule(account)
    return same


def confirm_session(account, session):
    if session.status == "succeeded" and session.generation == account.login_generation and account.credential_revision == session.base_credential_revision + 1:
        return  # Network retries cannot bind or sync twice.
    if not valid_session(account, session) or session.status != "awaiting_confirmation" or not session.candidate_ciphertext:
        if session.status in LIVE:
            finish(session, "expired" if session.expires_at <= now_utc() else "cancelled", "连接已失效，请重新扫码。")
            db.session.commit()
        raise SparkError("连接已失效，请重新扫码。", 409, "SPARK_LOGIN_STALE")
    state = decrypt_state(session.candidate_ciphertext)
    bind_state(account, state, dict(session.detected_account), via="qr")
    enqueue(account, "sync", "auto_bind", f"login:{session.id}")
    finish(session, "succeeded", "账号已连接，已安排联系人同步。")
    db.session.commit()
