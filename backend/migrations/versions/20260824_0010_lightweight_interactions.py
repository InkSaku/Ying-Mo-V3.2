"""add V3.7 lightweight interactions

Revision ID: 20260824_0010
Revises: 20260823_0009

MySQL commits many DDL statements immediately. Keep this migration resumable so
an interrupted deployment can safely continue from the last completed change.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260824_0010"
down_revision = "20260823_0009"
branch_labels = None
depends_on = None


REACTION_CHECK_SQL = "kind IN ('heart', 'like', 'laugh', 'celebrate', 'wow', 'support')"


def _inspector():
    # Inspectors cache reflected metadata, so create a new one after each DDL.
    return sa.inspect(op.get_bind())


def _table_exists(table_name):
    return table_name in _inspector().get_table_names()


def _column_names(table_name):
    return {column["name"] for column in _inspector().get_columns(table_name)}


def _unique_names(table_name):
    return {
        constraint["name"]
        for constraint in _inspector().get_unique_constraints(table_name)
        if constraint.get("name")
    }


def _index_names(table_name):
    return {
        index["name"]
        for index in _inspector().get_indexes(table_name)
        if index.get("name")
    }


def _check_names(table_name):
    return {
        constraint["name"]
        for constraint in _inspector().get_check_constraints(table_name)
        if constraint.get("name")
    }


def _create_post_reactions():
    op.create_table(
        "post_reactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "post_id",
            sa.Integer(),
            sa.ForeignKey("posts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=20), server_default="heart", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "post_id", name="uq_post_reaction_user_post"),
        sa.CheckConstraint(REACTION_CHECK_SQL, name="ck_post_reactions_kind"),
    )


def _upgrade_post_reactions():
    if not _table_exists("post_reactions"):
        if _table_exists("content_likes"):
            op.rename_table("content_likes", "post_reactions")
        else:
            # Some legacy installations were initialized without the optional
            # likes table. There is no data to migrate in that state.
            _create_post_reactions()
            return

    if "kind" not in _column_names("post_reactions"):
        with op.batch_alter_table("post_reactions") as batch:
            batch.add_column(
                sa.Column("kind", sa.String(length=20), server_default="heart", nullable=False)
            )

    unique_names = _unique_names("post_reactions")
    check_names = _check_names("post_reactions")
    with op.batch_alter_table("post_reactions") as batch:
        if "uq_post_reaction_user_post" not in unique_names:
            batch.create_unique_constraint("uq_post_reaction_user_post", ["user_id", "post_id"])
        # On MySQL the legacy unique index may also support the user_id foreign
        # key. Create its replacement before dropping it.
        if "uq_like_user_post" in unique_names:
            batch.drop_constraint("uq_like_user_post", type_="unique")
        if "ck_post_reactions_kind" not in check_names:
            batch.create_check_constraint("ck_post_reactions_kind", REACTION_CHECK_SQL)


def _upgrade_comments():
    if "client_request_id" not in _column_names("comments"):
        with op.batch_alter_table("comments") as batch:
            batch.add_column(sa.Column("client_request_id", sa.String(length=36), nullable=True))

    unique_names = _unique_names("comments")
    index_names = _index_names("comments")
    with op.batch_alter_table("comments") as batch:
        if "uq_comments_author_client_request" not in unique_names:
            batch.create_unique_constraint(
                "uq_comments_author_client_request", ["author_id", "client_request_id"]
            )
        if "ix_comments_parent_id" not in index_names:
            batch.create_index("ix_comments_parent_id", ["parent_id"], unique=False)
        if "ix_comments_reply_to_comment_id" not in index_names:
            batch.create_index(
                "ix_comments_reply_to_comment_id", ["reply_to_comment_id"], unique=False
            )


def _upgrade_comment_reactions():
    if not _table_exists("comment_reactions"):
        op.create_table(
            "comment_reactions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "comment_id",
                sa.Integer(),
                sa.ForeignKey("comments.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("kind", sa.String(length=20), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint(
                "user_id", "comment_id", name="uq_comment_reaction_user_comment"
            ),
            sa.CheckConstraint(REACTION_CHECK_SQL, name="ck_comment_reactions_kind"),
        )
    if "ix_comment_reactions_comment_id" not in _index_names("comment_reactions"):
        op.create_index(
            "ix_comment_reactions_comment_id", "comment_reactions", ["comment_id"]
        )


def _upgrade_comment_mentions():
    if not _table_exists("comment_mentions"):
        op.create_table(
            "comment_mentions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "comment_id",
                sa.Integer(),
                sa.ForeignKey("comments.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint(
                "comment_id", "user_id", name="uq_comment_mentions_comment_user"
            ),
        )
    index_names = _index_names("comment_mentions")
    if "ix_comment_mentions_comment_id" not in index_names:
        op.create_index("ix_comment_mentions_comment_id", "comment_mentions", ["comment_id"])
    if "ix_comment_mentions_user_id" not in index_names:
        op.create_index("ix_comment_mentions_user_id", "comment_mentions", ["user_id"])


def upgrade():
    _upgrade_post_reactions()
    _upgrade_comments()
    _upgrade_comment_reactions()
    _upgrade_comment_mentions()


def downgrade():
    if _table_exists("comment_mentions"):
        index_names = _index_names("comment_mentions")
        if "ix_comment_mentions_user_id" in index_names:
            op.drop_index("ix_comment_mentions_user_id", table_name="comment_mentions")
        if "ix_comment_mentions_comment_id" in index_names:
            op.drop_index("ix_comment_mentions_comment_id", table_name="comment_mentions")
        op.drop_table("comment_mentions")

    if _table_exists("comment_reactions"):
        if "ix_comment_reactions_comment_id" in _index_names("comment_reactions"):
            op.drop_index("ix_comment_reactions_comment_id", table_name="comment_reactions")
        op.drop_table("comment_reactions")

    if _table_exists("comments"):
        index_names = _index_names("comments")
        unique_names = _unique_names("comments")
        columns = _column_names("comments")
        with op.batch_alter_table("comments") as batch:
            if "ix_comments_reply_to_comment_id" in index_names:
                batch.drop_index("ix_comments_reply_to_comment_id")
            if "ix_comments_parent_id" in index_names:
                batch.drop_index("ix_comments_parent_id")
            if "uq_comments_author_client_request" in unique_names:
                batch.drop_constraint("uq_comments_author_client_request", type_="unique")
            if "client_request_id" in columns:
                batch.drop_column("client_request_id")

    if _table_exists("post_reactions"):
        if "kind" in _column_names("post_reactions"):
            op.execute("DELETE FROM post_reactions WHERE kind != 'heart'")
        unique_names = _unique_names("post_reactions")
        check_names = _check_names("post_reactions")
        columns = _column_names("post_reactions")
        with op.batch_alter_table("post_reactions") as batch:
            if "ck_post_reactions_kind" in check_names:
                batch.drop_constraint("ck_post_reactions_kind", type_="check")
            if "uq_post_reaction_user_post" in unique_names:
                batch.drop_constraint("uq_post_reaction_user_post", type_="unique")
            if "kind" in columns:
                batch.drop_column("kind")
            if "uq_like_user_post" not in unique_names:
                batch.create_unique_constraint("uq_like_user_post", ["user_id", "post_id"])
        if not _table_exists("content_likes"):
            op.rename_table("post_reactions", "content_likes")
