from datetime import datetime, timezone

from app.extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class PostLink(db.Model):
    """正文里的站内链接：source 的正文链接到了 target。只记关系，不授予任何权限。"""

    __tablename__ = "post_links"
    __table_args__ = (
        db.UniqueConstraint("source_post_id", "target_post_id", name="uq_post_links_pair"),
        db.CheckConstraint("source_post_id <> target_post_id", name="ck_post_links_distinct_posts"),
        db.Index("ix_post_links_target", "target_post_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    source_post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    target_post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    source_post = db.relationship("Post", foreign_keys=[source_post_id])
    target_post = db.relationship("Post", foreign_keys=[target_post_id])
