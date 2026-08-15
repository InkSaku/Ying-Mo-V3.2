import hashlib
import hmac
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

from flask import current_app


class MailDeliveryError(RuntimeError):
    pass


@dataclass(frozen=True)
class Mail:
    to: str
    subject: str
    text: str


class MemoryMailer:
    def __init__(self, outbox, *, fail_sending=False):
        self.outbox = outbox
        self.fail_sending = fail_sending

    def send(self, message):
        if self.fail_sending:
            raise MailDeliveryError("memory mail delivery failed")
        self.outbox.append(message)


class ConsoleMailer:
    def send(self, message):
        recipient_id = hmac.new(
            current_app.config["SECRET_KEY"].encode("utf-8"),
            message.to.strip().lower().encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()[:12]
        current_app.logger.info(
            "Development email accepted recipient_id=%s",
            recipient_id,
        )


class SMTPMailer:
    def __init__(self, app):
        self.host = app.config["SMTP_HOST"]
        self.port = app.config["SMTP_PORT"]
        self.username = app.config.get("SMTP_USERNAME")
        self.password = app.config.get("SMTP_PASSWORD")
        self.use_tls = app.config["SMTP_USE_TLS"]
        self.timeout = app.config["SMTP_TIMEOUT_SECONDS"]
        self.from_address = app.config["MAIL_FROM"]

    def send(self, message):
        email = EmailMessage()
        email["From"] = self.from_address
        email["To"] = message.to
        email["Subject"] = message.subject
        email.set_content(message.text)
        try:
            with smtplib.SMTP(self.host, self.port, timeout=self.timeout) as client:
                client.ehlo()
                if self.use_tls:
                    client.starttls(context=ssl.create_default_context())
                    client.ehlo()
                if self.username:
                    client.login(self.username, self.password or "")
                client.send_message(email)
        except (OSError, smtplib.SMTPException):
            raise MailDeliveryError("SMTP delivery failed") from None


def init_mailer(app):
    backend = str(app.config.get("MAIL_BACKEND", "console")).strip().lower()
    outbox = []
    app.extensions["mail_outbox"] = outbox
    if backend == "memory":
        mailer = MemoryMailer(outbox, fail_sending=bool(app.config.get("MAIL_MEMORY_FAIL")))
    elif backend == "console":
        mailer = ConsoleMailer()
    elif backend == "smtp":
        mailer = SMTPMailer(app)
    else:
        raise RuntimeError(f"Unsupported MAIL_BACKEND: {backend}")
    app.extensions["yingmo_mailer"] = mailer


def get_mailer():
    return current_app.extensions["yingmo_mailer"]


def send_mail(to, subject, text):
    get_mailer().send(Mail(to=to, subject=subject, text=text))
