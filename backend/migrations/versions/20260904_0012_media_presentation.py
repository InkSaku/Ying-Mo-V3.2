"""add media presentation fields

Revision ID: 20260904_0012
Revises: 20260825_0011
"""

from alembic import op
import sqlalchemy as sa


revision = "20260904_0012"
down_revision = "20260825_0011"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("media") as batch:
        batch.add_column(sa.Column("caption", sa.String(length=500), nullable=True))
        batch.add_column(
            sa.Column("display_size", sa.String(length=20), nullable=False, server_default="medium")
        )
        batch.add_column(
            sa.Column("alignment", sa.String(length=20), nullable=False, server_default="center")
        )
        batch.create_check_constraint(
            "ck_media_display_size",
            "display_size IN ('small', 'medium', 'large', 'full')",
        )
        batch.create_check_constraint(
            "ck_media_alignment",
            "alignment IN ('left', 'center', 'right')",
        )


def downgrade():
    with op.batch_alter_table("media") as batch:
        batch.drop_constraint("ck_media_alignment", type_="check")
        batch.drop_constraint("ck_media_display_size", type_="check")
        batch.drop_column("alignment")
        batch.drop_column("display_size")
        batch.drop_column("caption")
