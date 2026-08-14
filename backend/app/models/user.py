from datetime import datetime, timezone
from enum import StrEnum

from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db
from app.common.time import isoformat_utc


def utcnow():
    return datetime.now(timezone.utc)


class UserRole(StrEnum):
    USER = "user"
    SYSTEM_ADMIN = "system_admin"


class UserStatus(StrEnum):
    ACTIVE = "active"
    BANNED = "banned"
    DEACTIVATED = "deactivated"


class User(db.Model):
    __tablename__ = "users"
    __table_args__ = (
        db.UniqueConstraint("username_normalized", name="uq_users_username_normalized"),
        db.UniqueConstraint("email_normalized", name="uq_users_email_normalized"),
        db.CheckConstraint("role IN ('user', 'system_admin')", name="ck_users_role"),
        db.CheckConstraint("status IN ('active', 'banned', 'deactivated')", name="ck_users_status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(32), nullable=False)
    username_normalized = db.Column(db.String(32), nullable=False, index=True)
    email = db.Column(db.String(254), nullable=False)
    email_normalized = db.Column(db.String(254), nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    nickname = db.Column(db.String(50), nullable=False)
    avatar_media_id = db.Column(
        db.Integer,
        db.ForeignKey("media.id", ondelete="SET NULL", use_alter=True, name="fk_users_avatar_media_id_media"),
        nullable=True,
    )
    bio = db.Column(db.String(500), nullable=True)
    region = db.Column(db.String(100), nullable=True)
    role = db.Column(db.String(32), nullable=False, default=UserRole.USER.value, server_default=UserRole.USER.value)
    status = db.Column(db.String(32), nullable=False, default=UserStatus.ACTIVE.value, server_default=UserStatus.ACTIVE.value)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)

    avatar_media = db.relationship("Media", foreign_keys=[avatar_media_id])

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        return check_password_hash(self.password_hash, raw_password)

    @property
    def is_active(self):
        return self.status == UserStatus.ACTIVE.value

    def public_dict(self):
        return {
            "id": self.id,
            "username": self.username_normalized,
            "nickname": self.nickname,
            "bio": self.bio,
            "region": self.region,
            "avatar_media_id": self.avatar_media_id,
            "avatar_media": (
                self.avatar_media.to_dict()
                if self.avatar_media
                and self.avatar_media.status == "active"
                and self.avatar_media.deleted_at is None
                else None
            ),
        }

    def self_dict(self):
        data = self.public_dict()
        data.update({
            "email": self.email,
            "role": self.role,
            "status": self.status,
            "created_at": isoformat_utc(self.created_at),
            "updated_at": isoformat_utc(self.updated_at),
            "last_login_at": isoformat_utc(self.last_login_at),
        })
        return data
