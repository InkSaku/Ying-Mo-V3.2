from functools import wraps
from pathlib import Path
import uuid

from flask import Blueprint, request, send_file, Response
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.common.auth import current_user
from app.common.responses import error_response, success_response
from app.extensions import db, limiter
from app.models import SparkContact, SparkJob
from app.models.spark import now_utc
from .login_interaction import require_preview, queue_interaction
from .notifications import notify_send_result
from .credentials import CredentialError, credential_cipher, validate_state
from .service import SparkError, cancel_jobs, config_for, enqueue, get_account, overview, reset_schedule, validate_config, require_plan_validation, validation_fingerprint
from .login_session import bind_state, invalidate_sessions, start_session, owned_session, valid_session, confirm_session, finish

bp = Blueprint("spark", __name__)


def member_endpoint(function):
    @wraps(function)
    @jwt_required(locations=["headers"])
    def wrapped(*args, **kwargs):
        actor = current_user()
        if actor is None:
            return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
        try:
            return function(actor, *args, **kwargs)
        except SparkError as exc:
            db.session.rollback()
            return error_response(exc.code, str(exc), exc.status)
        except CredentialError as exc:
            db.session.rollback()
            return error_response("SPARK_CREDENTIAL_ERROR", str(exc), 422)
    return wrapped


@bp.get("")
@member_endpoint
def status(actor):
    return success_response(overview(get_account(actor.id)))


@bp.put("/config")
@member_endpoint
def save_config(actor):
    account = get_account(actor.id, lock=True)
    previous_fingerprint = validation_fingerprint(account)
    data = request.get_json(silent=True)
    account.config = validate_config(data, config_for(account))
    if validation_fingerprint(account) != previous_fingerprint:
        account.onboarding_required = True
    if any(key != "auto_run_enabled" for key in data):
        account.config_saved_at = now_utc()
    if account.config["auto_run_enabled"]:
        require_plan_validation(account)
    account.plan_revision += 1
    cancel_jobs(account, automatic_only=True)
    reset_schedule(account)
    db.session.commit()
    return success_response(overview(account))


@bp.post("/credentials")
@member_endpoint
@limiter.limit("10 per hour", key_func=lambda: f"spark-credentials:{get_jwt_identity()}")
def upload_credentials(actor):
    file = request.files.get("file")
    if file is None:
        raise SparkError("请选择登录态文件。")
    state = validate_state(file.read(5 * 1024 * 1024 + 1))
    account = get_account(actor.id, lock=True)
    bind_state(account, state)
    invalidate_sessions(account)
    db.session.commit()
    return success_response(overview(account))


@bp.delete("/credentials")
@member_endpoint
def unbind(actor):
    account = get_account(actor.id, lock=True)
    invalidate_sessions(account, "账号已解绑，本次连接已结束。")
    cancel_jobs(account)
    account.credential_ciphertext = None
    account.account_profile = {}
    account.validation_fingerprint = account.validated_at = None
    account.credential_revision += 1
    account.session_status = "unbound"
    account.credential_updated_at = None
    account.next_run_at = account.next_harvest_at = account.contacts_updated_at = None
    account.config = {**config_for(account), "auto_run_enabled": False}
    db.session.execute(db.delete(SparkContact).where(SparkContact.account_id == actor.id))
    db.session.commit()
    return success_response(overview(account))


@bp.put("/contacts")
@member_endpoint
def save_contacts(actor):
    account = get_account(actor.id, lock=True)
    previous_fingerprint = validation_fingerprint(account)
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or set(data) != {"entries"} or not isinstance(data["entries"], list) or len(data["entries"]) > 500:
        raise SparkError("好友选择格式不正确。")
    seen = set()
    for index, entry in enumerate(data["entries"]):
        if not isinstance(entry, dict) or set(entry) - {"id", "display_name", "selected"} or type(entry.get("selected")) is not bool:
            raise SparkError("好友选择格式不正确。")
        if "id" in entry:
            contact = db.session.scalar(db.select(SparkContact).where(SparkContact.id == entry["id"], SparkContact.account_id == actor.id))
            if contact is None:
                raise SparkError("好友不存在。", 404, "RESOURCE_NOT_FOUND")
        else:
            name = entry.get("display_name")
            if not isinstance(name, str) or not name.strip() or len(name.strip()) > 191:
                raise SparkError("好友名字须为 1–191 字。")
            name = name.strip()
            contact = db.session.scalar(db.select(SparkContact).where(SparkContact.account_id == actor.id, SparkContact.display_name == name))
            if contact is None:
                contact = SparkContact(account_id=actor.id, display_name=name, profile={"has_conversation": False, "channel": "none", "streak_days": 0})
                db.session.add(contact)
        if contact.display_name in seen:
            raise SparkError("好友不能重复选择。")
        seen.add(contact.display_name)
        contact.selected = entry["selected"]
        contact.selected_order = index if entry["selected"] else None
    db.session.flush()
    if validation_fingerprint(account) != previous_fingerprint:
        account.onboarding_required = True
        account.validation_fingerprint = account.validated_at = None
        account.config = {**config_for(account), "auto_run_enabled": False}
        cancel_jobs(account, automatic_only=True)
        reset_schedule(account)
    db.session.commit()
    return success_response(overview(account))


@bp.post("/jobs")
@member_endpoint
@limiter.limit("30 per hour", key_func=lambda: f"spark-jobs:{get_jwt_identity()}")
def create_job(actor):
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or set(data) - {"kind", "request_id"} or data.get("kind") not in ("send", "dry_run", "sync", "harvest"):
        raise SparkError("请选择有效的任务类型。")
    try:
        request_id = str(uuid.UUID(data.get("request_id", "")))
    except (ValueError, TypeError, AttributeError):
        raise SparkError("任务缺少有效的请求标识。") from None
    account = get_account(actor.id, lock=True)
    if data["kind"] == "send":
        require_plan_validation(account)
    job = enqueue(account, data["kind"], "manual", request_id)
    db.session.commit()
    return success_response(job.to_dict(), 202)


@bp.post("/jobs/<job_id>/cancel")
@member_endpoint
def cancel_job(actor, job_id):
    job = db.session.scalar(db.select(SparkJob).where(SparkJob.id == job_id, SparkJob.account_id == actor.id).with_for_update())
    if job is None:
        raise SparkError("任务不存在。", 404, "RESOURCE_NOT_FOUND")
    job.cancel_requested = True
    if job.status == "queued":
        job.status, job.finished_at = "cancelled", now_utc()
        notify_send_result(job)
    db.session.commit()
    return success_response(job.to_dict())


@bp.get("/login-helper")
@member_endpoint
def login_helper(actor):
    return send_file(Path(__file__).parent / "extract_cookie.py", mimetype="text/plain", as_attachment=True, download_name="yingmo_extract_cookie.py")


@bp.post("/login-sessions")
@member_endpoint
@limiter.limit("20 per hour", key_func=lambda: f"spark-login:{get_jwt_identity()}")
def create_login(actor):
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or set(data) - {"force_new"} or type(data.get("force_new", False)) is not bool:
        raise SparkError("连接请求格式不正确。")
    session = start_session(get_account(actor.id, lock=True), data.get("force_new", False))
    return success_response(session.to_dict(), 202)


@bp.get("/login-sessions/<session_id>/qr")
@member_endpoint
def login_qr(actor, session_id):
    account = get_account(actor.id, lock=True)
    session = owned_session(account, session_id)
    if not valid_session(account, session) or session.status != "waiting_scan" or not session.qr_ciphertext:
        raise SparkError("二维码已失效或尚未准备好。", 409, "SPARK_QR_UNAVAILABLE")
    image = credential_cipher().decrypt(session.qr_ciphertext.encode())
    db.session.commit()
    response = Response(image, mimetype="image/png")
    response.headers.update({"Cache-Control": "no-store, private, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff"})
    return response


@bp.get("/login-sessions/<session_id>/verification")
@member_endpoint
def login_verification(actor, session_id):
    account = get_account(actor.id, lock=True)
    session = owned_session(account, session_id)
    require_preview(account, session)
    image = credential_cipher().decrypt(session.verification_ciphertext.encode())
    response = Response(image, mimetype="image/png")
    response.headers.update({"Cache-Control": "no-store, private, max-age=0", "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff", "X-Spark-Revision": session.verification_revision,
        "X-Spark-Input-Sequence": str(session.interaction_sequence),
        "X-Spark-Input-Pending": "1" if session.interaction_ciphertext else "0",
        "Access-Control-Expose-Headers": "X-Spark-Revision, X-Spark-Input-Sequence, X-Spark-Input-Pending"})
    db.session.commit()
    return response


@bp.post("/login-sessions/<session_id>/interaction")
@member_endpoint
@limiter.limit("90 per minute", key_func=lambda: f"spark-login-input:{get_jwt_identity()}")
def login_interaction(actor, session_id):
    account = get_account(actor.id, lock=True)
    session = owned_session(account, session_id)
    queue_interaction(account, session, request.get_json(silent=True))
    db.session.commit()
    return success_response({"sequence": session.interaction_sequence}, 202)


@bp.post("/login-sessions/<session_id>/confirm")
@member_endpoint
def confirm_login(actor, session_id):
    account = get_account(actor.id, lock=True)
    confirm_session(account, owned_session(account, session_id))
    return success_response(overview(account))


@bp.post("/login-sessions/<session_id>/cancel")
@member_endpoint
def cancel_login(actor, session_id):
    account = get_account(actor.id, lock=True)
    session = owned_session(account, session_id)
    if session.status in ("queued", "preparing", "waiting_scan", "verifying", "awaiting_confirmation"):
        session.cancel_requested = True
        finish(session, "cancelled", "你已取消本次连接。")
    db.session.commit()
    return success_response(overview(account))
