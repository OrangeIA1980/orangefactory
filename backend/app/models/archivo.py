"""Modelo Archivo — representa un archivo subido a un proyecto.

Cada proyecto puede tener multiples archivos. Cada archivo pasa por el pipeline:
subido → convertido (a DXF) → validado → reparado → listo.
"""
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class EstadoArchivo(str, Enum):
    SUBIDO = "subido"           # Archivo original recien subido
    CONVIRTIENDO = "convirtiendo"  # Conversion a DXF en progreso
    CONVERTIDO = "convertido"   # DXF generado, pendiente validacion
    VALIDADO = "validado"       # Validacion completa (puede tener errores)
    LISTO = "listo"             # Sin errores criticos, puede avanzar a Cotizar
    ERROR = "error"             # Conversion fallida


class Archivo(Base):
    __tablename__ = "archivo"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    proyecto_id: Mapped[int] = mapped_column(
        ForeignKey("proyecto.id", ondelete="CASCADE"), nullable=False, index=True
    )
    taller_id: Mapped[int] = mapped_column(
        ForeignKey("taller.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Archivo original subido por el usuario
    nombre_original: Mapped[str] = mapped_column(String(500), nullable=False)
    formato_original: Mapped[str] = mapped_column(String(20), nullable=False)  # dxf, svg, ai, pdf, etc.
    tamano_bytes: Mapped[int] = mapped_column(Integer, default=0)

    # Ruta en disco (relativa a storage/)
    ruta_original: Mapped[str] = mapped_column(String(500), nullable=False)
    ruta_dxf: Mapped[str | None] = mapped_column(String(500), nullable=True)  # DXF convertido

    # Estado del pipeline
    estado: Mapped[str] = mapped_column(String(32), default=EstadoArchivo.SUBIDO.value, nullable=False)

    # Metadata del DXF parseado
    entidades_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    longitud_total_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    ancho_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    alto_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    entidades_cerradas: Mapped[int | None] = mapped_column(Integer, nullable=True)
    entidades_abiertas: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Resultados de validacion (JSON con lista de problemas)
    problemas: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Datos geometricos para el canvas frontend (JSON con entidades serializadas)
    geometria: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Timestamps
    subido_por: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"), nullable=True)
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    proyecto: Mapped["Proyecto"] = relationship()  # noqa: F821
    taller: Mapped["Taller"] = relationship()  # noqa: F821
