"""Add attachment metadata to inbox message logs

Revision ID: 20260401_02
Revises: 20260401_01
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260401_02"
down_revision = "20260401_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inbox_message_logs", sa.Column("attachment_type", sa.String(), nullable=True))
    op.add_column("inbox_message_logs", sa.Column("attachment_name", sa.String(), nullable=True))
    op.add_column("inbox_message_logs", sa.Column("attachment_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("inbox_message_logs", "attachment_url")
    op.drop_column("inbox_message_logs", "attachment_name")
    op.drop_column("inbox_message_logs", "attachment_type")
