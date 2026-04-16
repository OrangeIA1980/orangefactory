from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Taller(Base):
    """Un taller (tenant) en OrangeFactory. OFD es el primero."""

    __tablename__ = "taller"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    pais: Mapped[str] = mapped_column(String(2), default="CL", nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    usuarios: Mapped[list["Usuario"]] = relationship(back_populates="taller", cascade="all, delete-orphan")  # noqa: F821
    proyectos: Mapped[list["Proyecto"]] = relationship(back_populates="taller", cascade="all, delete-orphan")  # noqa: F821
