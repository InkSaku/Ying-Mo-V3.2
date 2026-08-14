import re
import hashlib
import hmac
from datetime import datetime, timezone

from flask import Blueprint, current_app, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
    set_refresh_cookies,
    unset_jwt_cookies,
)
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from app.common.auth import current_user
from app.common.responses import error_response, success_response
from app.common.validation import USERNAME_RE, normalize_email, normalize_username
from app.extensions import db, limiter
from app.models import RefreshSession, User, UserStatus

bp = Blueprint("auth", __name__)
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def utcnow():
    return datetime.now(timezone.utc)


def _issue_session(user):
    refresh = create_refresh_token(identity=str(user.id))
    payload = decode_token(refresh)
    access = create_access_token(identity=str(user.id), additional_claims={"sid": payload["jti"]})
    expires_at = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    remote = request.remote_addr or ""
    ip_hash = hmac.new(
        current_app.config["SECRET_KEY"].encode("utf-8"),
        remote.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest() if remote else None
    db.session.add(RefreshSession(
        user_id=user.id,
        jti=payload["jti"],
        expires_at=expires_at,
        last_used_at=utcnow(),
        user_agent=(request.user_agent.string or "")[:255] or None,
        ip_hash=ip_hash,
    ))
    return access, refresh


def _session_response(user, access, refresh, status=200):
    response, actual = success_response({"access_token": access, "user": user.self_dict()}, status)
    set_refresh_cookies(response, refresh)
    return response, actual


@bp.post("/register")
@limiter.limit(lambda: current_app.config["RATE_LIMIT_REGISTER"])
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("VALIDATION_ERROR", "请求体必须是 JSON 对象。", 422)

    username = normalize_username(data.get("username"))
    nickname = data.get("nickname")
    email = normalize_email(data.get("email"))
    password = data.get("password")
    invite_code = data.get("invite_code")

    details = []
    if not USERNAME_RE.fullmatch(username):
        details.append({"field": "username", "message": "用户名仅允许小写字母、数字、-、_，长度 3–32。"})
    if not isinstance(nickname, str) or not nickname.strip() or len(nickname.strip()) > 50:
        details.append({"field": "nickname", "message": "昵称长度需为 1–50 个字符。"})
    if not EMAIL_RE.fullmatch(email):
        details.append({"field": "email", "message": "邮箱格式不正确。"})
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        details.append({"field": "password", "message": "密码长度需为 8–128 个字符。"})
    configured_code = current_app.config["REGISTRATION_INVITE_CODE"]
    invite_valid = isinstance(invite_code, str) and bool(configured_code) and hmac.compare_digest(
        invite_code.encode("utf-8"), configured_code.encode("utf-8")
    )
    if not invite_valid:
        details.append({"field": "invite_code", "message": "邀请码无效。"})
    if details:
        return error_response("VALIDATION_ERROR", "注册信息不合法。", 422, details=details)

    if db.session.scalar(db.select(User.id).where(User.username_normalized == username)):
        return error_response("DUPLICATE_RESOURCE", "用户名或邮箱不可用。", 409)
    if db.session.scalar(db.select(User.id).where(User.email_normalized == email)):
        return error_response("DUPLICATE_RESOURCE", "用户名或邮箱不可用。", 409)

    user = User(
        username=username,
        username_normalized=username,
        nickname=nickname.strip(),
        email=email,
        email_normalized=email,
    )
    user.set_password(password)
    try:
        db.session.add(user)
        db.session.flush()
        access, refresh = _issue_session(user)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error_response("DUPLICATE_RESOURCE", "用户名或邮箱不可用。", 409)
    return _session_response(user, access, refresh, 201)


@bp.post("/login")
@limiter.limit(lambda: current_app.config["RATE_LIMIT_LOGIN"])
def login():
    data = request.get_json(silent=True) or {}
    identifier = normalize_email(data.get("identifier"))
    password = data.get("password")
    if not identifier or not isinstance(password, str):
        return error_response("VALIDATION_ERROR", "请输入用户名/邮箱和密码。", 422)

    user = db.session.scalar(
        db.select(User).where(
            or_(User.username_normalized == identifier, User.email_normalized == identifier)
        )
    )
    if user is None or not user.check_password(password):
        return error_response("INVALID_CREDENTIALS", "用户名、邮箱或密码错误。", 401)
    if user.status != UserStatus.ACTIVE.value:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法登录。", 403)

    user.last_login_at = utcnow()
    access, refresh = _issue_session(user)
    db.session.commit()
    return _session_response(user, access, refresh)


@bp.post("/refresh")
@jwt_required(refresh=True, locations=["cookies"])
@limiter.limit(lambda: current_app.config["RATE_LIMIT_REFRESH"])
def refresh():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    old_jti = get_jwt()["jti"]
    session = db.session.scalar(
        db.select(RefreshSession).where(
            RefreshSession.jti == old_jti,
            RefreshSession.user_id == actor.id,
            RefreshSession.revoked_at.is_(None),
        )
    )
    if session is None:
        return error_response("TOKEN_REVOKED", "当前会话已失效。", 401)
    session.revoked_at = utcnow()
    session.last_used_at = utcnow()
    access, refresh_token = _issue_session(actor)
    db.session.commit()
    return _session_response(actor, access, refresh_token)


@bp.post("/logout")
@jwt_required(refresh=True, locations=["cookies"], optional=True)
def logout():
    identity = get_jwt_identity()
    if identity:
        jti = get_jwt().get("jti")
        session = db.session.scalar(db.select(RefreshSession).where(RefreshSession.jti == jti))
        if session and session.revoked_at is None:
            session.revoked_at = utcnow()
            db.session.commit()
    response, status = success_response(None, 200)
    unset_jwt_cookies(response)
    return response, status


@bp.get("/me")
@jwt_required(locations=["headers"])
def me():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    return success_response(actor.self_dict())


@bp.get("/sessions")
@jwt_required(locations=["headers"])
def sessions():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    current_jti = get_jwt().get("sid")
    rows = db.session.scalars(
        db.select(RefreshSession).where(
            RefreshSession.user_id == actor.id,
            RefreshSession.revoked_at.is_(None),
            RefreshSession.expires_at > utcnow(),
        ).order_by(RefreshSession.last_used_at.desc(), RefreshSession.id.desc())
    ).all()
    return success_response([row.to_dict(current_jti=current_jti) for row in rows])


@bp.delete("/sessions/<int:session_id>")
@jwt_required(locations=["headers"])
def revoke_session(session_id):
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    session = db.session.scalar(db.select(RefreshSession).where(
        RefreshSession.id == session_id,
        RefreshSession.user_id == actor.id,
        RefreshSession.revoked_at.is_(None),
    ))
    if session is None:
        return error_response("RESOURCE_NOT_FOUND", "会话不存在。", 404)
    session.revoked_at = utcnow()
    db.session.commit()
    return success_response({"revoked": True, "current": session.jti == get_jwt().get("sid")})


@bp.post("/logout-all")
@jwt_required(locations=["headers"])
def logout_all():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    now = utcnow()
    sessions = db.session.scalars(db.select(RefreshSession).where(
        RefreshSession.user_id == actor.id,
        RefreshSession.revoked_at.is_(None),
    )).all()
    for session in sessions:
        session.revoked_at = now
    db.session.commit()
    response, status = success_response({"revoked_sessions": len(sessions)})
    unset_jwt_cookies(response)
    return response, status
