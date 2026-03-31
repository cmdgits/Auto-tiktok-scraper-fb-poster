"""Add display name fields for comment and inbox contacts.

Revision ID: 20260331_04
Revises: 20260331_03
Create Date: 2026-03-31 20:45:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260331_04"
down_revision = "20260331_03"
branch_labels = None
depends_on = None


def _inspector(bind):
    return sa.inspect(bind)


def _has_table(bind, table_name: str) -> bool:
    return _inspector(bind).has_table(table_name)


def _has_column(bind, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in _inspector(bind).get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "interactions_log") and not _has_column(bind, "interactions_log", "user_name"):
        op.add_column("interactions_log", sa.Column("user_name", sa.String(), nullable=True))
    if _has_table(bind, "inbox_conversations") and not _has_column(bind, "inbox_conversations", "sender_name"):
        op.add_column("inbox_conversations", sa.Column("sender_name", sa.String(), nullable=True))
    if _has_table(bind, "inbox_message_logs") and not _has_column(bind, "inbox_message_logs", "sender_name"):
        op.add_column("inbox_message_logs", sa.Column("sender_name", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "inbox_message_logs") and _has_column(bind, "inbox_message_logs", "sender_name"):
        op.drop_column("inbox_message_logs", "sender_name")
    if _has_table(bind, "inbox_conversations") and _has_column(bind, "inbox_conversations", "sender_name"):
        op.drop_column("inbox_conversations", "sender_name")
    if _has_table(bind, "interactions_log") and _has_column(bind, "interactions_log", "user_name"):
        op.drop_column("interactions_log", "user_name")
