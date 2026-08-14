from datetime import datetime, timezone

from app.extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class ContentLike(db.Model):
    __tablename__ = "content_likes"
    __table_args__ = (db.UniqueConstraint("user_id", "post_id", name="uq_like_user_post"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class ContentFavorite(db.Model):
    __tablename__ = "content_favorites"
    __table_args__ = (db.UniqueConstraint("user_id", "post_id", name="uq_favorite_user_post"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class Comment(db.Model):
    __tablename__ = "comments"
    __table_args__ = (
        db.CheckConstraint("status IN ('active', 'deleted', 'hidden')", name="ck_comments_status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    body = db.Column(db.String(500), nullable=True)
    parent_id = db.Column(db.Integer, db.ForeignKey("comments.id", ondelete="SET NULL"), nullable=True)
    reply_to_comment_id = db.Column(db.Integer, db.ForeignKey("comments.id", ondelete="SET NULL"), nullable=True)
    reply_to_user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="active", server_default="active")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    deleted_at = db.Column(db.DateTime(timezone=True), nullable=True)

    author = db.relationship("User", foreign_keys=[author_id])
    reply_to_user = db.relationship("User", foreign_keys=[reply_to_user_id])
