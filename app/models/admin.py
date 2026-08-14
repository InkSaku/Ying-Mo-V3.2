from datetime import datetime, timezone

from app.extensions import db
from app.common.time import isoformat_utc


def utcnow():
    return datetime.now(timezone.utc)


class FeaturedContent(db.Model):
    __tablename__ = "featured_content"
    __table_args__ = (
        db.CheckConstraint("content_type IN ('article', 'collection')", name="ck_featured_content_type"),
        db.CheckConstraint(
            "(content_type = 'article' AND post_id IS NOT NULL AND collection_id IS NULL) OR "
            "(content_type = 'collection' AND collection_id IS NOT NULL AND post_id IS NULL)",
            name="ck_featured_content_target",
        ),
        db.UniqueConstraint("post_id", name="uq_featured_content_post"),
        db.UniqueConstraint("collection_id", name="uq_featured_content_collection"),
    )

    id = db.Column(db.Integer, primary_key=True)
    content_type = db.Column(db.String(20), nullable=False)
    post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=True)
    collection_id = db.Column(db.Integer, db.ForeignKey("collections.id", ondelete="CASCADE"), nullable=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    post = db.relationship("Post")
    collection = db.relationship("Collection")


class SiteSetting(db.Model):
    __tablename__ = "site_settings"

    key = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.JSON, nullable=False)
    updated_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class AdminLog(db.Model):
    __tablename__ = "admin_logs"
    __table_args__ = (
        db.UniqueConstraint("idempotency_key", name="uq_admin_logs_idempotency_key"),
        db.Index("ix_admin_logs_operator_created", "operator_id", "created_at"),
        db.Index("ix_admin_logs_target", "target_type", "target_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    operator_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    request_id = db.Column(db.String(64), nullable=False)
    action = db.Column(db.String(80), nullable=False)
    target_type = db.Column(db.String(40), nullable=False)
    target_id = db.Column(db.String(100), nullable=False)
    before_data = db.Column(db.JSON, nullable=True)
    after_data = db.Column(db.JSON, nullable=True)
    reason = db.Column(db.String(500), nullable=True)
    idempotency_key = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    operator = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "operator": self.operator.public_dict() if self.operator else None,
            "request_id": self.request_id,
            "action": self.action,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "before": self.before_data,
            "after": self.after_data,
            "reason": self.reason,
            "idempotency_key": self.idempotency_key,
            "created_at": isoformat_utc(self.created_at),
        }
