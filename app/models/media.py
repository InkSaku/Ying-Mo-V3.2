from datetime import datetime, timezone
import uuid

from app.extensions import db
from app.common.time import isoformat_utc


def utcnow():
    return datetime.now(timezone.utc)


class MediaKind:
    IMAGE = "image"
    LIVE_PHOTO_IMAGE = "live_photo_image"
    LIVE_PHOTO_VIDEO = "live_photo_video"


class Media(db.Model):
    __tablename__ = "media"
    __table_args__ = (
        db.CheckConstraint(
            "kind IN ('image', 'live_photo_image', 'live_photo_video')",
            name="ck_media_kind",
        ),
        db.CheckConstraint(
            "bound_type IS NULL OR bound_type IN ('post', 'collection', 'avatar')",
            name="ck_media_bound_type",
        ),
        db.CheckConstraint("status IN ('active', 'hidden')", name="ck_media_status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    public_id = db.Column(db.String(36), nullable=False, unique=True, default=lambda: str(uuid.uuid4()), index=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = db.Column(db.String(40), nullable=False, default=MediaKind.IMAGE)
    mime_type = db.Column(db.String(100), nullable=False)
    byte_size = db.Column(db.Integer, nullable=False)
    width = db.Column(db.Integer, nullable=True)
    height = db.Column(db.Integer, nullable=True)
    storage_key = db.Column(db.String(500), nullable=False, unique=True)
    thumbnail_key = db.Column(db.String(500), nullable=True)
    live_photo_pair_id = db.Column(db.String(36), nullable=True, index=True)
    bound_type = db.Column(db.String(30), nullable=True)
    bound_id = db.Column(db.Integer, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="active", server_default="active")
    deleted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    owner = db.relationship("User", foreign_keys=[owner_id])

    def to_dict(self):
        return {
            "id": self.id,
            "public_id": self.public_id,
            "kind": self.kind,
            "mime_type": self.mime_type,
            "byte_size": self.byte_size,
            "width": self.width,
            "height": self.height,
            "live_photo_pair_id": self.live_photo_pair_id,
            "bound_type": self.bound_type,
            "bound_id": self.bound_id,
            "status": self.status,
            "deleted_at": isoformat_utc(self.deleted_at),
            "created_at": isoformat_utc(self.created_at),
        }
