from datetime import datetime, timezone

from app.extensions import db
from app.common.time import isoformat_utc


def utcnow():
    return datetime.now(timezone.utc)


class RefreshSession(db.Model):
    __tablename__ = "refresh_sessions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    jti = db.Column(db.String(64), nullable=False, unique=True, index=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_used_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    user_agent = db.Column(db.String(255), nullable=True)
    ip_hash = db.Column(db.String(64), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    user = db.relationship("User")

    def to_dict(self, *, current_jti=None):
        return {
            "id": self.id,
            "current": self.jti == current_jti,
            "created_at": isoformat_utc(self.created_at),
            "last_used_at": isoformat_utc(self.last_used_at),
            "expires_at": isoformat_utc(self.expires_at),
            "revoked_at": isoformat_utc(self.revoked_at),
            "user_agent": self.user_agent,
        }
