"""initial schema — taller, usuario, proyecto

Revision ID: 0001
Revises:
Create Date: 2026-04-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "taller",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("pais", sa.String(2), nullable=False, server_default="CL"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creado", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "usuario",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("taller_id", sa.Integer(), sa.ForeignKey("taller.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(200), nullable=False),
        sa.Column("password_hash", sa.String(200), nullable=False),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("rol", sa.String(32), nullable=False, server_default="cotizador"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("creado", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("taller_id", "email", name="uq_usuario_email_por_taller"),
    )

    op.create_table(
        "proyecto",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("taller_id", sa.Integer(), sa.ForeignKey("taller.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("cliente", sa.String(200), nullable=True),
        sa.Column("estado", sa.String(32), nullable=False, server_default="preparar"),
        sa.Column("creado_por", sa.Integer(), sa.ForeignKey("usuario.id"), nullable=True),
        sa.Column("creado", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("actualizado", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_proyecto_taller", "proyecto", ["taller_id"])


def downgrade() -> None:
    op.drop_index("ix_proyecto_taller", table_name="proyecto")
    op.drop_table("proyecto")
    op.drop_table("usuario")
    op.drop_table("taller")
