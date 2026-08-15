import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from flask import current_app

from app.extensions import db
from app.mail import send_mail
from app.models import AccountToken, AccountTokenPurpose, User


def utcnow():
    return datetime.now(timezone.utc)


def token_digest(raw_token, purpose):
    secret = str(current_app.config["SECRET_KEY"]).encode("utf-8")
    payload = f"{purpose}:{raw_token}".encode("utf-8")
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


def _token_lifetime(purpose):
    if purpose == AccountTokenPurpose.EMAIL_VERIFICATION:
        return timedelta(hours=current_app.config["EMAIL_VERIFICATION_TOKEN_EXPIRES_HOURS"])
    if purpose == AccountTokenPurpose.PASSWORD_RESET:
        return timedelta(minutes=current_app.config["PASSWORD_RESET_TOKEN_EXPIRES_MINUTES"])
    raise ValueError("unsupported account token purpose")


def revoke_active_tokens(user_id, purpose, *, now=None, exclude_id=None):
    now = now or utcnow()
    conditions = [
        AccountToken.user_id == user_id,
        AccountToken.purpose == purpose,
        AccountToken.consumed_at.is_(None),
        AccountToken.revoked_at.is_(None),
    ]
    if exclude_id is not None:
        conditions.append(AccountToken.id != exclude_id)
    db.session.execute(
        db.update(AccountToken)
        .where(*conditions)
        .values(revoked_at=now)
        .execution_options(synchronize_session=False)
    )


def issue_account_token(user, purpose, *, enforce_cooldown=False):
    now = utcnow()
    # Serialize issuance per account in production so two concurrent resend
    # requests cannot both leave active tokens behind. SQLite ignores this
    # clause in tests; MySQL applies the row lock until commit/rollback.
    db.session.scalar(
        db.select(User.id).where(User.id == user.id).with_for_update()
    )
    if enforce_cooldown:
        cooldown = current_app.config["ACCOUNT_TOKEN_REQUEST_COOLDOWN_SECONDS"]
        recent = db.session.scalar(
            db.select(AccountToken.id).where(
                AccountToken.user_id == user.id,
                AccountToken.purpose == purpose,
                AccountToken.consumed_at.is_(None),
                AccountToken.revoked_at.is_(None),
                AccountToken.expires_at > now,
                AccountToken.created_at > now - timedelta(seconds=cooldown),
            ).order_by(AccountToken.created_at.desc()).limit(1)
        )
        if recent is not None:
            return None, None
    revoke_active_tokens(user.id, purpose, now=now)
    for _attempt in range(3):
        raw_token = secrets.token_urlsafe(32)
        digest = token_digest(raw_token, purpose)
        occupied = db.session.scalar(
            db.select(AccountToken.id).where(AccountToken.token_hash == digest)
        )
        if occupied is None:
            break
    else:  # pragma: no cover - cryptographically infeasible defensive branch
        raise RuntimeError("unable to allocate unique account token")
    token = AccountToken(
        user_id=user.id,
        purpose=purpose,
        target_email_normalized=user.email_normalized,
        token_hash=digest,
        expires_at=now + _token_lifetime(purpose),
    )
    db.session.add(token)
    return token, raw_token


def find_active_token(raw_token, purpose):
    if not isinstance(raw_token, str) or not 32 <= len(raw_token) <= 256:
        return None
    token = db.session.scalar(
        db.select(AccountToken).where(
            AccountToken.token_hash == token_digest(raw_token, purpose),
            AccountToken.purpose == purpose,
        )
    )
    if token is None or not token.is_active or token.user is None:
        return None
    if token.target_email_normalized != token.user.email_normalized:
        return None
    return token


def consume_token_once(token, *, now=None):
    now = now or utcnow()
    result = db.session.execute(
        db.update(AccountToken)
        .where(
            AccountToken.id == token.id,
            AccountToken.consumed_at.is_(None),
            AccountToken.revoked_at.is_(None),
            AccountToken.expires_at > now,
        )
        .values(consumed_at=now)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


def send_verification_email(user, raw_token):
    url = f"{current_app.config['SITE_URL'].rstrip('/')}/verify-email#token={raw_token}"
    send_mail(
        user.email,
        "验证你的 Ying-Mo 邮箱",
        (
            f"{user.nickname}，你好：\n\n"
            "请打开下面的链接完成邮箱验证。该链接只能使用一次，并会自动过期：\n"
            f"{url}\n\n"
            "如果这不是你的操作，可以忽略这封邮件。"
        ),
    )


def send_password_reset_email(user, raw_token):
    url = f"{current_app.config['SITE_URL'].rstrip('/')}/reset-password#token={raw_token}"
    send_mail(
        user.email,
        "重置你的 Ying-Mo 密码",
        (
            f"{user.nickname}，你好：\n\n"
            "请打开下面的链接重置密码。该链接只能使用一次，并会自动过期：\n"
            f"{url}\n\n"
            "如果你没有请求重置密码，可以忽略这封邮件。"
        ),
    )


def send_password_changed_email(user):
    send_mail(
        user.email,
        "你的 Ying-Mo 密码已更新",
        (
            f"{user.nickname}，你好：\n\n"
            "你的 Ying-Mo 登录密码刚刚已更新，现有登录会话也已全部退出。\n"
            "如果这不是你的操作，请立即联系站点管理员。"
        ),
    )
