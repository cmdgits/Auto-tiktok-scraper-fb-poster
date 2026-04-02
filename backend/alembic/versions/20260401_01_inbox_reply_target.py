"""Add reply target to inbox message logs

Revision ID: 20260401_01
Revises: 20260331_04
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260401_01"
down_revision = "20260331_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "inbox_message_logs",
        sa.Column("reply_to_message_log_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_inbox_message_logs_reply_to_message_log_id",
        "inbox_message_logs",
        ["reply_to_message_log_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_inbox_message_logs_reply_to_message_log_id",
        "inbox_message_logs",
        "inbox_message_logs",
        ["reply_to_message_log_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_inbox_message_logs_reply_to_message_log_id", "inbox_message_logs", type_="foreignkey")
    op.drop_index("ix_inbox_message_logs_reply_to_message_log_id", table_name="inbox_message_logs")
    op.drop_column("inbox_message_logs", "reply_to_message_log_id")
