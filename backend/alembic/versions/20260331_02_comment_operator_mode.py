"""Add operator mode fields for comment interactions.

Revision ID: 20260331_02
Revises: 20260331_01
Create Date: 2026-03-31 16:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260331_02"
down_revision = "20260331_01"
branch_labels = None
depends_on = None


def _inspector(bind):
    return sa.inspect(bind)


def _has_table(bind, table_name: str) -> bool:
    return _inspector(bind).has_table(table_name)


def _has_column(bind, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in _inspector(bind).get_columns(table_name))


def _has_index(bind, table_name: str, index_name: str) -> bool:
    return any(item["name"] == index_name for item in _inspector(bind).get_indexes(table_name))


def _uuid_type(bind):
    return postgresql.UUID(as_uuid=True) if bind.dialect.name == "postgresql" else sa.Uuid()


def upgrade() -> None:
    bind = op.get_bind()
    uuid_type = _uuid_type(bind)

    if _has_table(bind, "interactions_log"):
        if not _has_column(bind, "interactions_log", "reply_mode"):
            op.add_column("interactions_log", sa.Column("reply_mode", sa.String(), nullable=False, server_default="ai"))
        if not _has_column(bind, "interactions_log", "reply_source"):
            op.add_column("interactions_log", sa.Column("reply_source", sa.String(), nullable=True))
        if not _has_column(bind, "interactions_log", "reply_author_user_id"):
            op.add_column("interactions_log", sa.Column("reply_author_user_id", uuid_type, nullable=True))
            if bind.dialect.name == "postgresql":
                op.create_foreign_key(
                    "fk_interactions_log_reply_author_user_id",
                    "interactions_log",
                    "users",
                    ["reply_author_user_id"],
                    ["id"],
                )
        if not _has_column(bind, "interactions_log", "last_error"):
            op.add_column("interactions_log", sa.Column("last_error", sa.String(), nullable=True))
        if not _has_index(bind, "interactions_log", "ix_interactions_log_reply_author_user_id"):
            op.create_index("ix_interactions_log_reply_author_user_id", "interactions_log", ["reply_author_user_id"], unique=False)

        op.execute(
            sa.text(
                """
                UPDATE interactions_log
                SET reply_mode = CASE
                    WHEN status = 'ignored' THEN 'operator'
                    ELSE 'ai'
                END
                WHERE reply_mode IS NULL OR reply_mode = ''
                """
            )
        )


def downgrade() -> None:
    bind = op.get_bind()

    if _has_table(bind, "interactions_log"):
        if _has_index(bind, "interactions_log", "ix_interactions_log_reply_author_user_id"):
            op.drop_index("ix_interactions_log_reply_author_user_id", table_name="interactions_log")
        if _has_column(bind, "interactions_log", "last_error"):
            op.drop_column("interactions_log", "last_error")
        if _has_column(bind, "interactions_log", "reply_author_user_id"):
            if bind.dialect.name == "postgresql":
                op.drop_constraint("fk_interactions_log_reply_author_user_id", "interactions_log", type_="foreignkey")
            op.drop_column("interactions_log", "reply_author_user_id")
        if _has_column(bind, "interactions_log", "reply_source"):
            op.drop_column("interactions_log", "reply_source")
        if _has_column(bind, "interactions_log", "reply_mode"):
            op.drop_column("interactions_log", "reply_mode")
