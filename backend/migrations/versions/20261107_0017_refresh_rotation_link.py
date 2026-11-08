"""Link rotated refresh sessions to their successor.

Revision ID: 20261107_0017
Revises: 20261014_0016
"""
from alembic import op
import sqlalchemy as sa

revision = "20261107_0017"
down_revision = "20261014_0016"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("refresh_sessions") as batch:
        batch.add_column(sa.Column("replaced_by_jti", sa.String(64), nullable=True))


def downgrade():
    with op.batch_alter_table("refresh_sessions") as batch:
        batch.drop_column("replaced_by_jti")
