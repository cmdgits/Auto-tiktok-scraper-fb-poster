"""Add campaign schedule start datetime.

Revision ID: 20260331_01
Revises: 20260329_07
Create Date: 2026-03-31 14:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260331_01"
down_revision = "20260329_07"
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
    if _has_table(bind, "campaigns") and not _has_column(bind, "campaigns", "schedule_start_at"):
        op.add_column("campaigns", sa.Column("schedule_start_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "campaigns") and _has_column(bind, "campaigns", "schedule_start_at"):
        op.drop_column("campaigns", "schedule_start_at")
