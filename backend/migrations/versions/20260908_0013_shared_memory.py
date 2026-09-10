"""add shared memory contribution links

Revision ID: 20260908_0013
Revises: 20260904_0012
"""

from alembic import op
import sqlalchemy as sa


revision = "20260908_0013"
down_revision = "20260904_0012"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "post_memory_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contribution_post_id", sa.Integer(), nullable=False),
        sa.Column("root_post_id", sa.Integer(), nullable=False),
        sa.Column("collection_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("client_request_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invalidation_reason", sa.String(length=40), nullable=True),
        sa.Column("detached_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "root_post_id <> contribution_post_id",
            name="ck_post_memory_links_distinct_posts",
        ),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["collection_id"], ["collections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contribution_post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["root_post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "author_id", "client_request_id",
            name="uq_post_memory_links_author_request",
        ),
        sa.UniqueConstraint(
            "contribution_post_id",
            name="uq_post_memory_links_contribution",
        ),
    )
    op.create_index(
        "ix_post_memory_links_root_scope",
        "post_memory_links",
        ["root_post_id", "collection_id", "invalidated_at", "detached_at"],
        unique=False,
    )
    op.create_index(
        "ix_post_memory_links_collection",
        "post_memory_links",
        ["collection_id"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_post_memory_links_collection", table_name="post_memory_links")
    op.drop_index("ix_post_memory_links_root_scope", table_name="post_memory_links")
    op.drop_table("post_memory_links")
