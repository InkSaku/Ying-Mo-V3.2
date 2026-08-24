"""add protected media display derivatives

Revision ID: 20260825_0011
Revises: 20260824_0010
"""

from alembic import op
import sqlalchemy as sa


revision = "20260825_0011"
down_revision = "20260824_0010"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("media") as batch:
        batch.add_column(sa.Column("display_key", sa.String(length=500), nullable=True))
        batch.create_unique_constraint("uq_media_display_key", ["display_key"])


def downgrade():
    with op.batch_alter_table("media") as batch:
        batch.drop_constraint("uq_media_display_key", type_="unique")
        batch.drop_column("display_key")
