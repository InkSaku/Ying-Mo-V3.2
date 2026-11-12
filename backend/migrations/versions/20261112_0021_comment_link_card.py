"""Let a comment opt out of showing its in-site post link as a card.

Revision ID: 20261112_0021
Revises: 20261110_0020
"""
from alembic import op
import sqlalchemy as sa

revision = "20261112_0021"
down_revision = "20261110_0020"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("comments") as batch_op:
        batch_op.add_column(sa.Column("link_card_hidden", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table("comments") as batch_op:
        batch_op.drop_column("link_card_hidden")
