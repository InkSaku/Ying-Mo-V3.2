from datetime import datetime, timezone

from app.common.time import isoformat_utc
from app.extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class PostRevision(db.Model):
    __tablename__ = "post_revisions"
    __table_args__ = (
        db.UniqueConstraint("post_id", "source_edit_version", name="uq_post_revisions_post_source_version"),
        db.CheckConstraint("source_edit_version >= 1", name="ck_post_revisions_source_version"),
        db.CheckConstraint("reason IN ('manual_edit', 'restore', 'collection_change')", name="ck_post_revisions_reason"),
        db.Index("ix_post_revisions_post_created", "post_id", "created_at"),
    )

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    source_edit_version = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.String(32), nullable=False, default="manual_edit", server_default="manual_edit")
    snapshot = db.Column(db.JSON, nullable=False)
    changed_fields = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    post = db.relationship("Post", back_populates="revisions")
    author = db.relationship("User")

    def summary_dict(self):
        snapshot = self.snapshot or {}
        return {
            "id": self.id,
            "post_id": self.post_id,
            "source_edit_version": self.source_edit_version,
            "reason": self.reason,
            "changed_fields": list(self.changed_fields or []),
            "title": snapshot.get("title"),
            "post_type": snapshot.get("post_type"),
            "created_at": isoformat_utc(self.created_at),
        }
