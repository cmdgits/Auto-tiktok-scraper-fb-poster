"""facebook support automation settings

Revision ID: 20260402_01
Revises: 20260401_03
Create Date: 2026-04-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260402_01"
down_revision = "20260401_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("facebook_pages", sa.Column("ai_agent_name", sa.String(), nullable=True))
    op.add_column(
        "facebook_pages",
        sa.Column("message_history_turn_limit", sa.Integer(), nullable=False, server_default="5"),
    )
    op.add_column(
        "facebook_pages",
        sa.Column("message_reply_min_delay_seconds", sa.Integer(), nullable=False, server_default="3"),
    )
    op.add_column(
        "facebook_pages",
        sa.Column("message_reply_max_delay_seconds", sa.Integer(), nullable=False, server_default="5"),
    )
    op.add_column(
        "facebook_pages",
        sa.Column("message_typing_indicator_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column("facebook_pages", sa.Column("handoff_keywords", sa.String(), nullable=True))
    op.add_column("facebook_pages", sa.Column("negative_keywords", sa.String(), nullable=True))

    op.alter_column("facebook_pages", "message_history_turn_limit", server_default=None)
    op.alter_column("facebook_pages", "message_reply_min_delay_seconds", server_default=None)
    op.alter_column("facebook_pages", "message_reply_max_delay_seconds", server_default=None)
    op.alter_column("facebook_pages", "message_typing_indicator_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("facebook_pages", "negative_keywords")
    op.drop_column("facebook_pages", "handoff_keywords")
    op.drop_column("facebook_pages", "message_typing_indicator_enabled")
    op.drop_column("facebook_pages", "message_reply_max_delay_seconds")
    op.drop_column("facebook_pages", "message_reply_min_delay_seconds")
    op.drop_column("facebook_pages", "message_history_turn_limit")
    op.drop_column("facebook_pages", "ai_agent_name")
