from datetime import datetime, timezone

from app.extensions import db


def utcnow():
    return datetime.now(timezone.utc)


REACTION_KINDS = ("heart", "like", "laugh", "celebrate", "wow", "support")
REACTION_CHECK_SQL = "kind IN ('heart', 'like', 'laugh', 'celebrate', 'wow', 'support')"


class PostReaction(db.Model):
    __tablename__ = "post_reactions"
    __table_args__ = (
        db.UniqueConstraint("user_id", "post_id", name="uq_post_reaction_user_post"),
        db.CheckConstraint(REACTION_CHECK_SQL, name="ck_post_reactions_kind"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    kind = db.Column(db.String(20), nullable=False, default="heart", server_default="heart")
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
        db.UniqueConstraint("author_id", "client_request_id", name="uq_comments_author_client_request"),
    )

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    body = db.Column(db.String(500), nullable=True)
    parent_id = db.Column(db.Integer, db.ForeignKey("comments.id", ondelete="SET NULL"), nullable=True, index=True)
    reply_to_comment_id = db.Column(db.Integer, db.ForeignKey("comments.id", ondelete="SET NULL"), nullable=True, index=True)
    reply_to_user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    client_request_id = db.Column(db.String(36), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="active", server_default="active")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    deleted_at = db.Column(db.DateTime(timezone=True), nullable=True)

    author = db.relationship("User", foreign_keys=[author_id])
    reply_to_user = db.relationship("User", foreign_keys=[reply_to_user_id])


class CommentReaction(db.Model):
    __tablename__ = "comment_reactions"
    __table_args__ = (
        db.UniqueConstraint("user_id", "comment_id", name="uq_comment_reaction_user_comment"),
        db.CheckConstraint(REACTION_CHECK_SQL, name="ck_comment_reactions_kind"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    comment_id = db.Column(db.Integer, db.ForeignKey("comments.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class CommentMention(db.Model):
    __tablename__ = "comment_mentions"
    __table_args__ = (
        db.UniqueConstraint("comment_id", "user_id", name="uq_comment_mentions_comment_user"),
    )

    id = db.Column(db.Integer, primary_key=True)
    comment_id = db.Column(db.Integer, db.ForeignKey("comments.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    user = db.relationship("User")


# Import compatibility for older internal callers while the public Like endpoint
# is retained as a heart-reaction adapter during V3.7.
ContentLike = PostReaction
