"""Add ai knowledge base to facebook pages

Revision ID: 20260401_03
Revises: 20260401_02
Create Date: 2026-04-01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260401_03"
down_revision = "20260401_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("facebook_pages", sa.Column("ai_knowledge_base", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("facebook_pages", "ai_knowledge_base")
