"""add Collection memory highlights

Revision ID: 20260822_0007
Revises: 20260821_0006
"""

from alembic import op
import sqlalchemy as sa


revision = "20260822_0007"
down_revision = "20260821_0006"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("posts") as batch:
        batch.add_column(sa.Column("collection_highlight_order", sa.Integer(), nullable=True))
        batch.create_check_constraint(
            "ck_posts_collection_highlight_order",
            "collection_highlight_order IS NULL OR collection_highlight_order >= 0",
        )
        batch.create_index(
            "ix_posts_collection_highlight",
            ["collection_id", "collection_highlight_order"],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table("posts") as batch:
        batch.drop_index("ix_posts_collection_highlight")
        batch.drop_constraint("ck_posts_collection_highlight_order", type_="check")
        batch.drop_column("collection_highlight_order")
