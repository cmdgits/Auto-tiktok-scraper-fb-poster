"""add product sheet url to campaigns

Revision ID: 20260402_02
Revises: 20260402_01
Create Date: 2026-04-02 00:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260402_02"
down_revision = "20260402_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("campaigns", sa.Column("product_sheet_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("campaigns", "product_sheet_url")
