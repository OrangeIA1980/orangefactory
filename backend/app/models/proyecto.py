from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class EstadoProyecto(str, Enum):
    """Los tres modos del pipeline OrangeFactory."""

    PREPARAR = "preparar"   # Modo 1 — limpiar archivo del cliente
    COTIZAR = "cotizar"     # Modo 2 — nesting + estimacion + presupuesto
    PRODUCIR = "producir"   # Modo 3 — ruta real + G-code


class Proyecto(Base):
    __tablename__ = "proyecto"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    taller_id: Mapped[int] = mapped_column(ForeignKey("taller.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    cliente: Mapped[str | None] = mapped_column(String(200), nullable=True)
    estado: Mapped[str] = mapped_column(String(32), default=EstadoProyecto.PREPARAR.value, nullable=False)
    creado_por: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"), nullable=True)
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    taller: Mapped["Taller"] = relationship(back_populates="proyectos")  # noqa: F821
