from functools import wraps
from pathlib import Path
import uuid

from flask import Blueprint, request, send_file
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.common.auth import current_user
from app.common.responses import error_response, success_response
from app.extensions import db, limiter
from app.models import SparkContact, SparkJob
from app.models.spark import now_utc
from .credentials import CredentialError, decrypt_state, encrypt_state, validate_state
from .service import SparkError, cancel_jobs, config_for, enqueue, get_account, overview, reset_schedule, validate_config

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
    data = request.get_json(silent=True)
    account.config = validate_config(data, config_for(account))
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
    ciphertext = encrypt_state(state)
    account = get_account(actor.id, lock=True)
    # Retain selections only when the stable uid cookie proves this is the same account.
    def subject(value):
        return next((c["value"] for c in value["cookies"] if c["name"] == "uid_tt"), None)
    same_account = False
    if account.credential_ciphertext:
        try:
            old = decrypt_state(account.credential_ciphertext)
            same_account = bool(subject(state) and subject(old) == subject(state)) or old == state
        except CredentialError:
            pass
    cancel_jobs(account)
    if not same_account:
        db.session.execute(db.delete(SparkContact).where(SparkContact.account_id == actor.id))
        account.contacts_updated_at = None
    account.credential_ciphertext = ciphertext
    account.credential_revision += 1
    account.credential_updated_at = now_utc()
    account.session_status = "unverified"
    reset_schedule(account)
    db.session.commit()
    return success_response(overview(account))


@bp.delete("/credentials")
@member_endpoint
def unbind(actor):
    account = get_account(actor.id, lock=True)
    cancel_jobs(account)
    account.credential_ciphertext = None
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
    job = enqueue(get_account(actor.id, lock=True), data["kind"], "manual", request_id)
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
    db.session.commit()
    return success_response(job.to_dict())


@bp.get("/login-helper")
@member_endpoint
def login_helper(actor):
    return send_file(Path(__file__).parent / "extract_cookie.py", mimetype="text/plain", as_attachment=True, download_name="yingmo_extract_cookie.py")
