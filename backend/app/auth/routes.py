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
from app.models import (
    AccountTokenPurpose, Collection, CollectionMember, CollectionStatus,
    Notification, RefreshSession, User, UserStatus,
)
from app.auth.service import (
    consume_token_once,
    find_active_token,
    issue_account_token,
    revoke_active_tokens,
    send_password_changed_email,
    send_password_reset_email,
    send_verification_email,
)

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


def _session_response(user, access, refresh, status=200, *, extra=None):
    data = {"access_token": access, "user": user.self_dict()}
    if extra:
        data.update(extra)
    response, actual = success_response(data, status)
    set_refresh_cookies(response, refresh)
    return response, actual


def _deliver_safely(kind, user, sender, *args):
    try:
        sender(user, *args)
        return True
    except Exception:
        # Delivery is an external side effect. Account/token transactions are
        # deliberately committed first and must never be rolled back here.
        # Do not log the exception: SMTP/provider errors can echo recipients or
        # message bodies containing one-time account tokens.
        current_app.logger.warning("%s email delivery failed user_id=%s", kind, user.id)
        return False


def _strong_password_error(password):
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        return "新密码长度需为 8–128 个字符。"
    return None


def _revoke_undelivered_token(token):
    if token is not None and token.consumed_at is None and token.revoked_at is None:
        token.revoked_at = utcnow()
        db.session.commit()


def _unknown_field_error(data, allowed):
    unknown = sorted(set(data) - set(allowed))
    if not unknown:
        return None
    return error_response(
        "VALIDATION_ERROR",
        "包含不支持的字段。",
        422,
        details={"fields": unknown},
    )


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
        auto_collections = db.session.scalars(
            db.select(Collection)
            .join(User, User.id == Collection.creator_id)
            .where(
                Collection.auto_add_future_members.is_(True),
                Collection.status == CollectionStatus.ACTIVE.value,
                Collection.deleted_at.is_(None),
                User.status == UserStatus.ACTIVE.value,
            )
            .order_by(Collection.id.asc())
        ).all()
        for collection in auto_collections:
            db.session.add(CollectionMember(
                collection_id=collection.id,
                user_id=user.id,
                join_source="future_member_auto",
            ))
            db.session.add(Notification(
                user_id=user.id,
                actor_id=collection.creator_id,
                kind="collection_member_added",
                target_type="collection",
                collection_id=collection.id,
                message=f"你已自动加入 Collection「{collection.name}」，现在可以阅读并投稿。",
            ))
        access, refresh = _issue_session(user)
        _verification_token, raw_verification_token = issue_account_token(
            user, AccountTokenPurpose.EMAIL_VERIFICATION
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error_response("DUPLICATE_RESOURCE", "用户名或邮箱不可用。", 409)
    email_sent = _deliver_safely(
        "verification", user, send_verification_email, raw_verification_token
    )
    if not email_sent:
        _revoke_undelivered_token(_verification_token)
    return _session_response(
        user,
        access,
        refresh,
        201,
        extra={"verification_email_sent": email_sent},
    )


@bp.post("/email-verification/request")
@bp.post("/email-verification/resend")
@jwt_required(locations=["headers"])
@limiter.limit(lambda: current_app.config["RATE_LIMIT_EMAIL_VERIFICATION"])
def resend_email_verification():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("VALIDATION_ERROR", "请求体必须是 JSON 对象。", 422)
    unknown = _unknown_field_error(data, set())
    if unknown:
        return unknown
    if actor.email_verified_at is not None:
        return success_response({"accepted": True, "email_verified": True})

    token, raw_token = issue_account_token(
        actor,
        AccountTokenPurpose.EMAIL_VERIFICATION,
        enforce_cooldown=True,
    )
    if raw_token is not None:
        db.session.commit()
        if not _deliver_safely("verification", actor, send_verification_email, raw_token):
            _revoke_undelivered_token(token)
    else:
        db.session.rollback()
    return success_response({"accepted": True, "email_verified": False})


@bp.post("/email-verification/confirm")
@limiter.limit(lambda: current_app.config["RATE_LIMIT_EMAIL_CONFIRM"])
def confirm_email_verification():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("VALIDATION_ERROR", "请求体必须是 JSON 对象。", 422)
    unknown = _unknown_field_error(data, {"token"})
    if unknown:
        return unknown
    token = find_active_token(data.get("token"), AccountTokenPurpose.EMAIL_VERIFICATION)
    if token is None or token.user is None or token.user.status != UserStatus.ACTIVE.value:
        return error_response("INVALID_OR_EXPIRED_TOKEN", "验证链接无效或已过期。", 400)

    now = utcnow()
    if not consume_token_once(token, now=now):
        db.session.rollback()
        return error_response("INVALID_OR_EXPIRED_TOKEN", "验证链接无效或已过期。", 400)
    if token.user.email_verified_at is None:
        token.user.email_verified_at = now
    revoke_active_tokens(
        token.user_id,
        AccountTokenPurpose.EMAIL_VERIFICATION,
        now=now,
        exclude_id=token.id,
    )
    db.session.commit()
    return success_response({"email_verified": True})


@bp.post("/password-reset/request")
@limiter.limit(lambda: current_app.config["RATE_LIMIT_PASSWORD_RESET"])
def request_password_reset():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("VALIDATION_ERROR", "请求体必须是 JSON 对象。", 422)
    unknown = _unknown_field_error(data, {"email"})
    if unknown:
        return unknown
    email = normalize_email(data.get("email"))
    user = None
    if EMAIL_RE.fullmatch(email):
        user = db.session.scalar(
            db.select(User).where(
                User.email_normalized == email,
                User.email_verified_at.is_not(None),
                User.status == UserStatus.ACTIVE.value,
            )
        )
    if user is not None:
        token, raw_token = issue_account_token(
            user,
            AccountTokenPurpose.PASSWORD_RESET,
            enforce_cooldown=True,
        )
        if raw_token is not None:
            db.session.commit()
            if not _deliver_safely("password_reset", user, send_password_reset_email, raw_token):
                _revoke_undelivered_token(token)
        else:
            db.session.rollback()
    # Known, unknown, unverified, restricted and cooldown paths intentionally
    # share the exact same status and body to prevent account enumeration.
    return success_response({"accepted": True}, 202)


@bp.post("/password-reset/confirm")
@limiter.limit(lambda: current_app.config["RATE_LIMIT_PASSWORD_RESET_CONFIRM"])
def confirm_password_reset():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("VALIDATION_ERROR", "请求体必须是 JSON 对象。", 422)
    unknown = _unknown_field_error(data, {"token", "password"})
    if unknown:
        return unknown
    password = data.get("password")
    password_error = _strong_password_error(password)
    if password_error:
        return error_response("VALIDATION_ERROR", password_error, 422)

    token = find_active_token(data.get("token"), AccountTokenPurpose.PASSWORD_RESET)
    if token is None or token.user is None or token.user.status != UserStatus.ACTIVE.value:
        return error_response("INVALID_OR_EXPIRED_TOKEN", "重置链接无效或已过期。", 400)

    now = utcnow()
    if not consume_token_once(token, now=now):
        db.session.rollback()
        return error_response("INVALID_OR_EXPIRED_TOKEN", "重置链接无效或已过期。", 400)
    user = token.user
    user.set_password(password)
    revoke_active_tokens(
        user.id,
        AccountTokenPurpose.PASSWORD_RESET,
        now=now,
        exclude_id=token.id,
    )
    db.session.execute(
        db.update(RefreshSession)
        .where(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
        )
        .values(revoked_at=now)
        .execution_options(synchronize_session=False)
    )
    db.session.commit()

    _deliver_safely("password_changed", user, send_password_changed_email)
    response, status = success_response({"password_reset": True})
    unset_jwt_cookies(response)
    return response, status


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
