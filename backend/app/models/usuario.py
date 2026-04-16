from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Rol(str, Enum):
    ADMIN = "admin"
    COTIZADOR = "cotizador"
    OPERADOR = "operador"
    CLIENTE = "cliente"


class Usuario(Base):
    __tablename__ = "usuario"
    __table_args__ = (UniqueConstraint("taller_id", "email", name="uq_usuario_email_por_taller"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    taller_id: Mapped[int] = mapped_column(ForeignKey("taller.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    rol: Mapped[str] = mapped_column(String(32), default=Rol.COTIZADOR.value, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    taller: Mapped["Taller"] = relationship(back_populates="usuarios")  # noqa: F821
