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
    content_sha256 = db.Column(db.String(64), nullable=True, index=True)
    original_filename = db.Column(db.String(255), nullable=True)
    alt_text = db.Column(db.String(300), nullable=True)
    width = db.Column(db.Integer, nullable=True)
    height = db.Column(db.Integer, nullable=True)
    storage_key = db.Column(db.String(500), nullable=False, unique=True)
    display_key = db.Column(db.String(500), nullable=True, unique=True)
    thumbnail_key = db.Column(db.String(500), nullable=True)
    live_photo_pair_id = db.Column(db.String(36), nullable=True, index=True)
    bound_type = db.Column(db.String(30), nullable=True)
    bound_id = db.Column(db.Integer, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="active", server_default="active")
    deleted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    owner = db.relationship("User", foreign_keys=[owner_id])

    def to_dict(self, *, include_manage_paths=False):
        data = {
            "id": self.id,
            "public_id": self.public_id,
            "kind": self.kind,
            "mime_type": self.mime_type,
            "byte_size": self.byte_size,
            "alt_text": self.alt_text,
            "width": self.width,
            "height": self.height,
            "display_key_ready": bool(self.display_key),
            "live_photo_pair_id": self.live_photo_pair_id,
            "bound_type": self.bound_type,
            "bound_id": self.bound_id,
            "status": self.status,
            "deleted_at": isoformat_utc(self.deleted_at),
            "created_at": isoformat_utc(self.created_at),
        }
        data["read_path"] = f"/api/v1/uploads/images/{self.public_id}"
        data["display_path"] = data["read_path"]
        data["thumbnail_path"] = (
            None
            if self.kind == MediaKind.LIVE_PHOTO_VIDEO
            else f"/api/v1/uploads/images/{self.public_id}/thumbnail"
        )
        data["live_photo_manifest_path"] = (
            f"/api/v1/uploads/live-photos/{self.live_photo_pair_id}"
            if self.live_photo_pair_id
            else None
        )
        if include_manage_paths:
            data["content_sha256"] = self.content_sha256
            data["original_filename"] = self.original_filename
            data["manage_path"] = f"/api/v1/uploads/manage/images/{self.public_id}"
            data["manage_thumbnail_path"] = (
                None
                if self.kind == MediaKind.LIVE_PHOTO_VIDEO
                else f"/api/v1/uploads/manage/images/{self.public_id}/thumbnail"
            )
            data["original_download_path"] = f"/api/v1/uploads/manage/images/{self.public_id}/original"
        return data
