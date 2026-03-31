"""Add Facebook reply comment id to interaction logs.

Revision ID: 20260331_03
Revises: 20260331_02
Create Date: 2026-03-31 20:10:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260331_03"
down_revision = "20260331_02"
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
    if _has_table(bind, "interactions_log") and not _has_column(bind, "interactions_log", "facebook_reply_comment_id"):
        op.add_column("interactions_log", sa.Column("facebook_reply_comment_id", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "interactions_log") and _has_column(bind, "interactions_log", "facebook_reply_comment_id"):
        op.drop_column("interactions_log", "facebook_reply_comment_id")
