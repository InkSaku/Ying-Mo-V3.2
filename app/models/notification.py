from datetime import datetime, timezone

from app.extensions import db
from app.common.time import isoformat_utc


def utcnow():
    return datetime.now(timezone.utc)


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    kind = db.Column(db.String(50), nullable=False)
    target_type = db.Column(db.String(30), nullable=False, default="system", server_default="system")
    post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="SET NULL"), nullable=True)
    collection_id = db.Column(db.Integer, db.ForeignKey("collections.id", ondelete="SET NULL"), nullable=True)
    comment_id = db.Column(db.Integer, db.ForeignKey("comments.id", ondelete="SET NULL"), nullable=True)
    message = db.Column(db.String(500), nullable=False)
    is_read = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    actor = db.relationship("User", foreign_keys=[actor_id])

    def to_dict(self):
        return {
            "id": self.id,
            "kind": self.kind,
            "target_type": self.target_type,
            "actor": self.actor.public_dict() if self.actor else None,
            "post_id": self.post_id,
            "collection_id": self.collection_id,
            "comment_id": self.comment_id,
            "message": self.message,
            "is_read": self.is_read,
            "created_at": isoformat_utc(self.created_at),
        }
