import logging
import re
from datetime import datetime, timedelta, timezone

import pytest
from flask import Flask

from app.config import ProductionConfig
from app.extensions import db
from app.mail import ConsoleMailer, Mail, SMTPMailer
from app.models import AccountToken, AccountTokenPurpose, RefreshSession, User

from .conftest import auth, register, token_from


TOKEN_RE = re.compile(r"#token=([A-Za-z0-9_-]+)")


def utcnow():
    return datetime.now(timezone.utc)


def mail_token(message):
    match = TOKEN_RE.search(message.text)
    assert match is not None
    assert "?token=" not in message.text
    return match.group(1)


def test_console_mailer_never_logs_token_link_or_full_address(app, caplog):
    raw_token = "console-secret-token-that-must-not-reach-logs"
    recipient = "private-member@example.com"
    message = Mail(
        to=recipient,
        subject="验证你的 Ying-Mo 邮箱",
        text=f"https://yingmo.example/verify-email#token={raw_token}",
    )
    with app.app_context(), caplog.at_level(logging.INFO, logger=app.logger.name):
        ConsoleMailer().send(message)
    rendered = "\n".join(record.getMessage() for record in caplog.records)
    assert "Development email accepted recipient_id=" in rendered
    assert recipient not in rendered
    assert raw_token not in rendered
    assert "#token=" not in rendered


def test_delivery_exception_details_never_reach_logs(client, app, caplog):
    class ExplodingMailer:
        def send(self, message):
            raise RuntimeError(f"provider rejected {message.to}: {message.text}")

    app.extensions["yingmo_mailer"] = ExplodingMailer()
    with caplog.at_level(logging.WARNING, logger=app.logger.name):
        response = register(client, "log-redaction")
    assert response.status_code == 201
    assert response.get_json()["data"]["verification_email_sent"] is False
    rendered = "\n".join(record.getMessage() for record in caplog.records)
    assert "verification email delivery failed user_id=" in rendered
    assert "log-redaction@example.com" not in rendered
    assert "#token=" not in rendered
    assert "trusted.yingmo.test" not in rendered


def test_smtp_mailer_uses_tls_timeout_and_configured_sender(app, monkeypatch):
    calls = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            calls.append(("connect", host, port, timeout))

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            calls.append(("close",))

        def ehlo(self):
            calls.append(("ehlo",))

        def starttls(self, *, context):
            assert context is not None
            calls.append(("starttls",))

        def login(self, username, password):
            calls.append(("login", username, password))

        def send_message(self, message):
            calls.append((
                "send",
                message["From"],
                message["To"],
                message["Subject"],
                message.get_content().strip(),
            ))

    monkeypatch.setattr("app.mail.smtplib.SMTP", FakeSMTP)
    app.config.update(
        SMTP_HOST="smtp.yingmo.test",
        SMTP_PORT=2525,
        SMTP_USERNAME="mailer-user",
        SMTP_PASSWORD="mailer-password",
        SMTP_USE_TLS=True,
        SMTP_TIMEOUT_SECONDS=7,
        MAIL_FROM="no-reply@yingmo.test",
    )
    SMTPMailer(app).send(Mail(
        to="friend@example.com",
        subject="账户安全通知",
        text="你的密码已更新。",
    ))
    assert calls == [
        ("connect", "smtp.yingmo.test", 2525, 7),
        ("ehlo",),
        ("starttls",),
        ("ehlo",),
        ("login", "mailer-user", "mailer-password"),
        ("send", "no-reply@yingmo.test", "friend@example.com", "账户安全通知", "你的密码已更新。"),
        ("close",),
    ]


def confirm_latest_verification(client, app):
    message = next(
        item for item in reversed(app.extensions["mail_outbox"])
        if item.subject == "验证你的 Ying-Mo 邮箱"
    )
    response = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": mail_token(message)},
    )
    assert response.status_code == 200
    return response


def test_registration_verification_is_hashed_rotated_single_use_and_reflected_in_me(client, app):
    registration = register(client, "verify-owner")
    assert registration.status_code == 201
    payload = registration.get_json()["data"]
    assert payload["user"]["email_verified"] is False
    assert payload["user"]["email_verified_at"] is None
    assert payload["verification_email_sent"] is True
    access = token_from(registration)

    first_message = app.extensions["mail_outbox"][-1]
    first_raw = mail_token(first_message)
    assert "/verify-email#token=" in first_message.text
    with app.app_context():
        first = db.session.scalar(
            db.select(AccountToken).where(
                AccountToken.purpose == AccountTokenPurpose.EMAIL_VERIFICATION
            )
        )
        assert first is not None
        assert first.token_hash != first_raw
        assert first_raw not in first.token_hash
        assert first.target_email_normalized == "verify-owner@example.com"
        first.created_at = utcnow() - timedelta(seconds=61)
        first_id = first.id
        db.session.commit()

    resend = client.post(
        "/api/v1/auth/email-verification/request",
        headers=auth(access),
        json={},
    )
    assert resend.status_code == 200
    assert resend.get_json()["data"] == {"accepted": True, "email_verified": False}
    second_raw = mail_token(app.extensions["mail_outbox"][-1])
    assert second_raw != first_raw
    with app.app_context():
        assert db.session.get(AccountToken, first_id).revoked_at is not None

    old_link = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": first_raw},
    )
    assert old_link.status_code == 400
    assert old_link.get_json()["error"]["code"] == "INVALID_OR_EXPIRED_TOKEN"

    confirmed = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": second_raw},
    )
    assert confirmed.status_code == 200
    assert confirmed.get_json()["data"] == {"email_verified": True}
    me = client.get("/api/v1/auth/me", headers=auth(access))
    assert me.status_code == 200
    assert me.get_json()["data"]["email_verified"] is True
    assert me.get_json()["data"]["email_verified_at"].endswith("Z")

    replay = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": second_raw},
    )
    assert replay.status_code == 400
    before = len(app.extensions["mail_outbox"])
    already_verified = client.post(
        "/api/v1/auth/email-verification/request",
        headers=auth(access),
        json={},
    )
    assert already_verified.status_code == 200
    assert already_verified.get_json()["data"]["email_verified"] is True
    assert len(app.extensions["mail_outbox"]) == before


def test_verification_rejects_expired_token_and_email_snapshot_mismatch(client, app):
    register(client, "verify-expired")
    expired_raw = mail_token(app.extensions["mail_outbox"][-1])
    with app.app_context():
        token = db.session.scalar(db.select(AccountToken))
        token.expires_at = utcnow() - timedelta(seconds=1)
        db.session.commit()
    expired = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": expired_raw},
    )
    assert expired.status_code == 400

    app.extensions["mail_outbox"].clear()
    register(client, "verify-snapshot")
    mismatch_raw = mail_token(app.extensions["mail_outbox"][-1])
    with app.app_context():
        user = db.session.scalar(
            db.select(User).where(User.username_normalized == "verify-snapshot")
        )
        user.email = "changed@example.com"
        user.email_normalized = "changed@example.com"
        db.session.commit()
    mismatch = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": mismatch_raw},
    )
    assert mismatch.status_code == 400
    assert mismatch.get_json()["error"]["code"] == "INVALID_OR_EXPIRED_TOKEN"


def test_account_tokens_are_purpose_bound_and_links_ignore_request_host(client, app):
    registration = client.post(
        "/api/v1/auth/register",
        base_url="https://attacker.invalid",
        json={
            "username": "purpose-bound",
            "nickname": "Purpose Bound",
            "email": "purpose-bound@example.com",
            "password": "password123",
            "invite_code": "lyx0811",
        },
    )
    assert registration.status_code == 201
    verification_mail = app.extensions["mail_outbox"][-1]
    verification_raw = mail_token(verification_mail)
    assert "https://trusted.yingmo.test/verify-email#token=" in verification_mail.text
    assert "attacker.invalid" not in verification_mail.text

    wrong_purpose = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": verification_raw, "password": "DifferentPassword123"},
    )
    assert wrong_purpose.status_code == 400
    assert wrong_purpose.get_json()["error"]["code"] == "INVALID_OR_EXPIRED_TOKEN"

    confirmed = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": verification_raw},
    )
    assert confirmed.status_code == 200
    app.extensions["mail_outbox"].clear()
    requested = client.post(
        "/api/v1/auth/password-reset/request",
        base_url="https://attacker.invalid",
        json={"email": "purpose-bound@example.com"},
    )
    assert requested.status_code == 202
    reset_mail = app.extensions["mail_outbox"][-1]
    reset_raw = mail_token(reset_mail)
    assert "https://trusted.yingmo.test/reset-password#token=" in reset_mail.text
    assert "attacker.invalid" not in reset_mail.text
    wrong_purpose = client.post(
        "/api/v1/auth/email-verification/confirm",
        json={"token": reset_raw},
    )
    assert wrong_purpose.status_code == 400
    assert wrong_purpose.get_json()["error"]["code"] == "INVALID_OR_EXPIRED_TOKEN"


def test_password_reset_request_is_non_enumerating_verified_only_and_cooled_down(client, app):
    verified_registration = register(client, "reset-known")
    confirm_latest_verification(client, app)
    register(client, "reset-unverified")
    restricted_registration = register(client, "reset-restricted")
    confirm_latest_verification(client, app)
    with app.app_context():
        restricted = db.session.scalar(
            db.select(User).where(User.username_normalized == "reset-restricted")
        )
        restricted.status = "banned"
        db.session.commit()
    app.extensions["mail_outbox"].clear()

    bodies = []
    for email in (
        "reset-known@example.com",
        "missing@example.com",
        "reset-unverified@example.com",
        "reset-restricted@example.com",
        "not-an-email",
    ):
        response = client.post("/api/v1/auth/password-reset/request", json={"email": email})
        assert response.status_code == 202
        bodies.append(response.get_json()["data"])
    assert bodies == [{"accepted": True}] * len(bodies)
    assert [mail.to for mail in app.extensions["mail_outbox"]] == ["reset-known@example.com"]
    assert "/reset-password#token=" in app.extensions["mail_outbox"][0].text

    with app.app_context():
        tokens_before = db.session.scalar(
            db.select(db.func.count(AccountToken.id)).where(
                AccountToken.purpose == AccountTokenPurpose.PASSWORD_RESET
            )
        )
    repeated = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "reset-known@example.com"},
    )
    assert repeated.status_code == 202
    assert repeated.get_json()["data"] == {"accepted": True}
    with app.app_context():
        tokens_after = db.session.scalar(
            db.select(db.func.count(AccountToken.id)).where(
                AccountToken.purpose == AccountTokenPurpose.PASSWORD_RESET
            )
        )
    assert tokens_after == tokens_before
    assert len(app.extensions["mail_outbox"]) == 1
    assert verified_registration.status_code == 201
    assert restricted_registration.status_code == 201


def test_password_reset_rotates_tokens_enforces_strength_and_revokes_every_session(client, app):
    registration = register(client, "reset-owner")
    first_access = token_from(registration)
    confirm_latest_verification(client, app)
    second_login = client.post(
        "/api/v1/auth/login",
        json={"identifier": "reset-owner", "password": "password123"},
    )
    second_access = token_from(second_login)
    app.extensions["mail_outbox"].clear()

    first_request = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "reset-owner@example.com"},
    )
    assert first_request.status_code == 202
    first_raw = mail_token(app.extensions["mail_outbox"][-1])
    with app.app_context():
        first_token = db.session.scalar(
            db.select(AccountToken).where(
                AccountToken.purpose == AccountTokenPurpose.PASSWORD_RESET
            )
        )
        first_token.created_at = utcnow() - timedelta(seconds=61)
        db.session.commit()

    second_request = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "reset-owner@example.com"},
    )
    assert second_request.status_code == 202
    second_raw = mail_token(app.extensions["mail_outbox"][-1])
    assert second_raw != first_raw
    revoked = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": first_raw, "password": "NewSecurePassword123"},
    )
    assert revoked.status_code == 400

    weak = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": second_raw, "password": "short"},
    )
    assert weak.status_code == 422
    reset = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": second_raw, "password": "NewSecurePassword123"},
    )
    assert reset.status_code == 200
    assert reset.get_json()["data"] == {"password_reset": True}
    assert any(
        "yingmo_refresh_token=;" in header
        for header in reset.headers.getlist("Set-Cookie")
    )
    with app.app_context():
        sessions = db.session.scalars(
            db.select(RefreshSession).where(
                RefreshSession.user_id == db.session.scalar(
                    db.select(User.id).where(User.username_normalized == "reset-owner")
                )
            )
        ).all()
        assert len(sessions) == 2
        assert all(session.revoked_at is not None for session in sessions)

    for access in (first_access, second_access):
        denied = client.get("/api/v1/auth/me", headers=auth(access))
        assert denied.status_code == 401
        assert denied.get_json()["error"]["code"] == "TOKEN_REVOKED"
    replay = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": second_raw, "password": "AnotherSecurePassword456"},
    )
    assert replay.status_code == 400
    old_login = client.post(
        "/api/v1/auth/login",
        json={"identifier": "reset-owner", "password": "password123"},
    )
    assert old_login.status_code == 401
    new_login = client.post(
        "/api/v1/auth/login",
        json={"identifier": "reset-owner", "password": "NewSecurePassword123"},
    )
    assert new_login.status_code == 200
    security_mail = app.extensions["mail_outbox"][-1]
    assert security_mail.subject == "你的 Ying-Mo 密码已更新"
    assert "#token=" not in security_mail.text


def test_delivery_failures_never_roll_back_account_or_password_transactions(client, app):
    mailer = app.extensions["yingmo_mailer"]
    mailer.fail_sending = True
    registration = register(client, "mail-failure")
    assert registration.status_code == 201
    assert registration.get_json()["data"]["verification_email_sent"] is False
    access = token_from(registration)
    with app.app_context():
        user = db.session.scalar(
            db.select(User).where(User.username_normalized == "mail-failure")
        )
        assert user is not None
        failed_token = db.session.scalar(
            db.select(AccountToken).where(AccountToken.user_id == user.id)
        )
        assert failed_token.revoked_at is not None

    mailer.fail_sending = False
    resend = client.post(
        "/api/v1/auth/email-verification/request",
        headers=auth(access),
        json={},
    )
    assert resend.status_code == 200
    assert len(app.extensions["mail_outbox"]) == 1
    confirm_latest_verification(client, app)
    app.extensions["mail_outbox"].clear()
    mailer.fail_sending = True
    failed_request = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "mail-failure@example.com"},
    )
    assert failed_request.status_code == 202
    assert app.extensions["mail_outbox"] == []
    with app.app_context():
        failed_reset_token = db.session.scalar(
            db.select(AccountToken).where(
                AccountToken.purpose == AccountTokenPurpose.PASSWORD_RESET
            )
        )
        assert failed_reset_token.revoked_at is not None

    mailer.fail_sending = False
    request_reset = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "mail-failure@example.com"},
    )
    assert request_reset.status_code == 202
    raw = mail_token(app.extensions["mail_outbox"][-1])

    mailer.fail_sending = True
    reset = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": raw, "password": "FailureSafePassword123"},
    )
    assert reset.status_code == 200
    assert reset.get_json()["data"] == {"password_reset": True}
    login = client.post(
        "/api/v1/auth/login",
        json={"identifier": "mail-failure", "password": "FailureSafePassword123"},
    )
    assert login.status_code == 200


def test_account_endpoint_contracts_and_expired_password_reset(client, app):
    registration = register(client, "contract-owner")
    access = token_from(registration)
    confirm_latest_verification(client, app)
    app.extensions["mail_outbox"].clear()

    cases = (
        (
            "/api/v1/auth/email-verification/request",
            {"email": "unexpected@example.com"},
            auth(access),
        ),
        (
            "/api/v1/auth/email-verification/confirm",
            {"token": "x" * 43, "password": "unexpected"},
            {},
        ),
        (
            "/api/v1/auth/password-reset/request",
            {"email": "contract-owner@example.com", "username": "unexpected"},
            {},
        ),
        (
            "/api/v1/auth/password-reset/confirm",
            {"token": "x" * 43, "password": "password123", "email": "unexpected@example.com"},
            {},
        ),
    )
    for path, payload, headers in cases:
        response = client.post(path, headers=headers, json=payload)
        assert response.status_code == 422
        assert response.get_json()["error"]["code"] == "VALIDATION_ERROR"

    anonymous_request = client.post(
        "/api/v1/auth/email-verification/request",
        json={},
    )
    assert anonymous_request.status_code == 401
    reset_request = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "contract-owner@example.com"},
    )
    assert reset_request.status_code == 202
    raw = mail_token(app.extensions["mail_outbox"][-1])
    with app.app_context():
        token = db.session.scalar(
            db.select(AccountToken).where(
                AccountToken.purpose == AccountTokenPurpose.PASSWORD_RESET
            )
        )
        token.expires_at = utcnow() - timedelta(seconds=1)
        db.session.commit()
    expired = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": raw, "password": "password123"},
    )
    assert expired.status_code == 400
    assert expired.get_json()["error"]["code"] == "INVALID_OR_EXPIRED_TOKEN"


def test_production_requires_https_smtp_configuration():
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY="s" * 32,
        JWT_SECRET_KEY="j" * 32,
        REGISTRATION_INVITE_CODE="lyx0811",
        CORS_ORIGINS=("https://yingmo.example",),
        RATELIMIT_STORAGE_URI="redis://redis:6379/0",
        MEDIA_STORAGE_BACKEND="s3",
        S3_BUCKET="yingmo-private",
        MAIL_BACKEND="console",
        MAIL_FROM="",
        SMTP_HOST="",
        SMTP_PORT=587,
        SMTP_USERNAME="",
        SMTP_PASSWORD="",
        SMTP_USE_TLS=True,
        SMTP_TIMEOUT_SECONDS=10,
        SITE_URL="http://yingmo.example",
        EMAIL_VERIFICATION_TOKEN_EXPIRES_HOURS=24,
        PASSWORD_RESET_TOKEN_EXPIRES_MINUTES=30,
        ACCOUNT_TOKEN_REQUEST_COOLDOWN_SECONDS=60,
    )
    with pytest.raises(RuntimeError) as error:
        ProductionConfig.validate(app)
    assert "MAIL_BACKEND must be smtp" in str(error.value)
    assert "SITE_URL must be an absolute https URL" in str(error.value)

    app.config.update(
        MAIL_BACKEND="smtp",
        MAIL_FROM="no-reply@yingmo.example",
        SMTP_HOST="smtp.example.com",
        SITE_URL="https://user:secret@yingmo.example/private?source=bad#fragment",
    )
    with pytest.raises(RuntimeError) as error:
        ProductionConfig.validate(app)
    assert "SITE_URL must be a credential-free https origin" in str(error.value)

    app.config["SITE_URL"] = "https://yingmo.example"
    ProductionConfig.validate(app)
