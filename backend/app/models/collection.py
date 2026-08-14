from datetime import datetime, timezone
from enum import StrEnum

from app.extensions import db
from app.common.time import isoformat_utc


def utcnow():
    return datetime.now(timezone.utc)


class CollectionStatus(StrEnum):
    ACTIVE = "active"
    HIDDEN = "hidden"


class Collection(db.Model):
    __tablename__ = "collections"
    __table_args__ = (
        db.UniqueConstraint("slug", name="uq_collections_slug"),
        db.Index("ix_collections_creator_created", "creator_id", "created_at"),
        db.CheckConstraint("status IN ('active', 'hidden')", name="ck_collections_status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    creator_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    slug = db.Column(db.String(180), nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    cover_media_id = db.Column(db.Integer, db.ForeignKey("media.id", ondelete="SET NULL"), nullable=True)
    status = db.Column(db.String(20), nullable=False, default=CollectionStatus.ACTIVE.value, server_default=CollectionStatus.ACTIVE.value)
    first_shared_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    deleted_at = db.Column(db.DateTime(timezone=True), nullable=True)

    creator = db.relationship("User", foreign_keys=[creator_id])
    cover_media = db.relationship("Media", foreign_keys=[cover_media_id])
    member_links = db.relationship("CollectionMember", back_populates="collection", cascade="all, delete-orphan")
    posts = db.relationship("Post", back_populates="collection")

    def to_dict(self, *, include_members=False):
        data = {
            "id": self.id,
            "creator": self.creator.public_dict() if self.creator else None,
            "name": self.name,
            "slug": self.slug,
            "description": self.description,
            "cover_media_id": self.cover_media_id,
            "cover_media": (
                self.cover_media.to_dict()
                if self.cover_media
                and self.cover_media.status == "active"
                and self.cover_media.deleted_at is None
                else None
            ),
            "status": self.status,
            "first_shared_at": isoformat_utc(self.first_shared_at),
            "created_at": isoformat_utc(self.created_at),
            "updated_at": isoformat_utc(self.updated_at),
        }
        if include_members:
            data["members"] = [link.user.public_dict() for link in self.member_links if link.user]
        return data


class CollectionMember(db.Model):
    __tablename__ = "collection_members"
    __table_args__ = (
        db.UniqueConstraint("collection_id", "user_id", name="uq_collection_members_collection_user"),
        db.Index("ix_collection_members_user_collection", "user_id", "collection_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    collection_id = db.Column(db.Integer, db.ForeignKey("collections.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    added_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    collection = db.relationship("Collection", back_populates="member_links")
    user = db.relationship("User")
