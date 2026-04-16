"""tabla archivo para Modo Preparar

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "archivo",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("proyecto_id", sa.Integer(), sa.ForeignKey("proyecto.id", ondelete="CASCADE"), nullable=False),
        sa.Column("taller_id", sa.Integer(), sa.ForeignKey("taller.id", ondelete="CASCADE"), nullable=False),
        # Archivo original
        sa.Column("nombre_original", sa.String(500), nullable=False),
        sa.Column("formato_original", sa.String(20), nullable=False),
        sa.Column("tamano_bytes", sa.Integer(), server_default="0"),
        # Rutas en disco
        sa.Column("ruta_original", sa.String(500), nullable=False),
        sa.Column("ruta_dxf", sa.String(500), nullable=True),
        # Estado
        sa.Column("estado", sa.String(32), nullable=False, server_default="subido"),
        # Metadata DXF
        sa.Column("entidades_total", sa.Integer(), nullable=True),
        sa.Column("longitud_total_mm", sa.Float(), nullable=True),
        sa.Column("ancho_mm", sa.Float(), nullable=True),
        sa.Column("alto_mm", sa.Float(), nullable=True),
        sa.Column("entidades_cerradas", sa.Integer(), nullable=True),
        sa.Column("entidades_abiertas", sa.Integer(), nullable=True),
        # JSON
        sa.Column("problemas", sa.JSON(), nullable=True),
        sa.Column("geometria", sa.JSON(), nullable=True),
        # Audit
        sa.Column("subido_por", sa.Integer(), sa.ForeignKey("usuario.id"), nullable=True),
        sa.Column("creado", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("actualizado", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_archivo_proyecto", "archivo", ["proyecto_id"])
    op.create_index("ix_archivo_taller", "archivo", ["taller_id"])


def downgrade() -> None:
    op.drop_index("ix_archivo_taller", table_name="archivo")
    op.drop_index("ix_archivo_proyecto", table_name="archivo")
    op.drop_table("archivo")
