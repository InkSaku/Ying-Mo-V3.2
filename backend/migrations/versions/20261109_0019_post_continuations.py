"""Let a post continue an earlier post.

Revision ID: 20261109_0019
Revises: 20261108_0018
"""
from alembic import op
import sqlalchemy as sa

revision = "20261109_0019"
down_revision = "20261108_0018"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "post_continuations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("post_id", sa.Integer(), nullable=False),
        sa.Column("source_post_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("broken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("broken_reason", sa.String(40), nullable=True),
        sa.ForeignKeyConstraint(
            ["post_id"], ["posts.id"], name="fk_post_continuations_post", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_post_id"], ["posts.id"], name="fk_post_continuations_source", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name="fk_post_continuations_author", ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("post_id", name="uq_post_continuations_post"),
        sa.CheckConstraint("post_id <> source_post_id", name="ck_post_continuations_distinct_posts"),
    )
    op.create_index(
        "ix_post_continuations_source",
        "post_continuations",
        ["source_post_id", "broken_at"],
    )


def downgrade():
    op.drop_index("ix_post_continuations_source", table_name="post_continuations")
    op.drop_table("post_continuations")
