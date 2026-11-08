from datetime import datetime, timezone

from app.extensions import db
from app.common.time import isoformat_utc


def utcnow():
    return datetime.now(timezone.utc)


def _aware(value):
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


# 同一次登录在 15 分钟访问令牌期内被轮换的次数通常很少；超过上限时按失效处理，前端会自行刷新。
ROTATION_CHAIN_LIMIT = 8


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
    # 仅由刷新轮换写入；退出、撤销和密码重置只写 revoked_at，因此该链随之立即失效。
    replaced_by_jti = db.Column(db.String(64), nullable=True)

    user = db.relationship("User")

    @property
    def rotated(self):
        return self.revoked_at is not None and bool(self.replaced_by_jti)

    def live_head(self, now=None):
        """沿刷新轮换链找到当前承载这次登录的会话；链被主动撤销或已过期时返回 None。"""
        now = now or utcnow()
        current = self
        for _ in range(ROTATION_CHAIN_LIMIT + 1):
            if current is None:
                return None
            if current.revoked_at is None:
                return current if _aware(current.expires_at) > now else None
            if not current.replaced_by_jti:
                return None
            current = db.session.scalar(
                db.select(RefreshSession).where(RefreshSession.jti == current.replaced_by_jti)
            )
        return None

    def within_rotation_grace(self, grace_seconds, now=None):
        if not self.rotated or grace_seconds <= 0:
            return False
        now = now or utcnow()
        return (now - _aware(self.revoked_at)).total_seconds() <= grace_seconds

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
