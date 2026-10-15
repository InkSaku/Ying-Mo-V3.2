"""Owner-only interactive official login preview.

Revision ID: 20261014_0016
Revises: 20261014_0015
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import MEDIUMTEXT

revision = "20261014_0016"
down_revision = "20261014_0015"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("spark_login_sessions") as batch:
        batch.add_column(sa.Column("verification_ciphertext", sa.Text().with_variant(MEDIUMTEXT(), "mysql"), nullable=True))
        batch.add_column(sa.Column("verification_revision", sa.String(36), nullable=True))
        batch.add_column(sa.Column("verification_updated_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("interaction_ciphertext", sa.Text(), nullable=True))
        batch.add_column(sa.Column("interaction_sequence", sa.Integer(), nullable=False, server_default="0"))


def downgrade():
    with op.batch_alter_table("spark_login_sessions") as batch:
        for field in ("interaction_sequence", "interaction_ciphertext", "verification_updated_at", "verification_revision", "verification_ciphertext"):
            batch.drop_column(field)
