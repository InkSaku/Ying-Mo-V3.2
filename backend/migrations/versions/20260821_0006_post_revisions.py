"""add immutable Post revision snapshots

Revision ID: 20260821_0006
Revises: 20260817_0005
"""

from alembic import op
import sqlalchemy as sa


revision = "20260821_0006"
down_revision = "20260817_0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "post_revisions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("post_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("source_edit_version", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=32), server_default="manual_edit", nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("changed_fields", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("source_edit_version >= 1", name="ck_post_revisions_source_version"),
        sa.CheckConstraint(
            "reason IN ('manual_edit', 'restore', 'collection_change')",
            name="ck_post_revisions_reason",
        ),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("post_id", "source_edit_version", name="uq_post_revisions_post_source_version"),
    )
    op.create_index("ix_post_revisions_post_created", "post_revisions", ["post_id", "created_at"], unique=False)


def downgrade():
    op.drop_index("ix_post_revisions_post_created", table_name="post_revisions")
    op.drop_table("post_revisions")
