from datetime import datetime, timezone

from app.common.time import isoformat_utc
from app.extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class AccountTokenPurpose:
    EMAIL_VERIFICATION = "email_verification"
    PASSWORD_RESET = "password_reset"


class AccountToken(db.Model):
    __tablename__ = "account_tokens"
    __table_args__ = (
        db.CheckConstraint(
            "purpose IN ('email_verification', 'password_reset')",
            name="ck_account_tokens_purpose",
        ),
        db.UniqueConstraint("token_hash", name="uq_account_tokens_token_hash"),
        db.Index(
            "ix_account_tokens_user_purpose_created",
            "user_id",
            "purpose",
            "created_at",
        ),
        db.Index("ix_account_tokens_expires_at", "expires_at"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    purpose = db.Column(db.String(32), nullable=False)
    target_email_normalized = db.Column(db.String(254), nullable=False)
    token_hash = db.Column(db.String(64), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    consumed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    user = db.relationship("User")

    @property
    def is_active(self):
        now = utcnow()
        expires_at = self.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return self.consumed_at is None and self.revoked_at is None and expires_at > now

    def to_dict(self):
        """Token lifecycle metadata without raw tokens or full email addresses."""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "purpose": self.purpose,
            "expires_at": isoformat_utc(self.expires_at),
            "consumed_at": isoformat_utc(self.consumed_at),
            "revoked_at": isoformat_utc(self.revoked_at),
            "created_at": isoformat_utc(self.created_at),
        }
