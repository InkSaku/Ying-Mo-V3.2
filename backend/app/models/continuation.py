from datetime import datetime, timezone

from app.extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class PostContinuation(db.Model):
    """一篇帖子接着另一篇写：新帖最多接一篇，一篇帖子可以被接多次。"""

    __tablename__ = "post_continuations"
    __table_args__ = (
        db.UniqueConstraint("post_id", name="uq_post_continuations_post"),
        db.CheckConstraint("post_id <> source_post_id", name="ck_post_continuations_distinct_posts"),
        db.Index("ix_post_continuations_source", "source_post_id", "broken_at"),
    )

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    source_post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    # 帖子换了合集后两边读者不再一致，关系永久断开；原帖被删除不算断开，仍显示“原记录已不在”。
    broken_at = db.Column(db.DateTime(timezone=True), nullable=True)
    broken_reason = db.Column(db.String(40), nullable=True)

    post = db.relationship("Post", foreign_keys=[post_id])
    source_post = db.relationship("Post", foreign_keys=[source_post_id])
    author = db.relationship("User")
