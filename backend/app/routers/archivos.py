"""Router de archivos — API del Modo Preparar.

Endpoints:
- POST   /proyectos/{id}/archivos          → Subir archivo
- GET    /proyectos/{id}/archivos          → Listar archivos del proyecto
- GET    /archivos/{id}                    → Detalle de un archivo
- GET    /archivos/{id}/geometria          → Geometria para el canvas
- POST   /archivos/{id}/validar            → Ejecutar validacion
- POST   /archivos/{id}/reparar            → Auto-reparar problemas
- POST   /archivos/{id}/editar             → Editar vectores (mover, escalar, etc.)
- DELETE /archivos/{id}                    → Eliminar archivo
"""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import CurrentUser
from app.models import Proyecto, Archivo, EstadoArchivo
from app.schemas import ArchivoOut, GeometriaOut, ValidacionOut, EditarRequest
from app.services.dxf_service import parsear_dxf, validar_geometria, auto_reparar, detectar_jerarquia
from app.services import vector_ops

router = APIRouter(tags=["archivos"])

# Directorio de almacenamiento (montado como volumen Docker)
STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", "/app/storage"))

FORMATOS_ACEPTADOS = {
    ".dxf": "dxf",
    ".svg": "svg",
    ".ai": "ai",
    ".pdf": "pdf",
    ".eps": "eps",
    ".cdr": "cdr",
    ".png": "png",
    ".jpg": "jpg",
    ".jpeg": "jpg",
}


def _verificar_proyecto(proyecto_id: int, user: CurrentUser, db: Session) -> Proyecto:
    """Verifica que el proyecto existe y pertenece al tenant del usuario."""
    proyecto = db.get(Proyecto, proyecto_id)
    if proyecto is None or proyecto.taller_id != user.taller_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="proyecto no existe")
    return proyecto


def _verificar_archivo(archivo_id: int, user: CurrentUser, db: Session) -> Archivo:
    """Verifica que el archivo existe y pertenece al tenant del usuario."""
    archivo = db.get(Archivo, archivo_id)
    if archivo is None or archivo.taller_id != user.taller_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="archivo no existe")
    return archivo


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("/proyectos/{proyecto_id}/archivos", response_model=ArchivoOut,
             status_code=status.HTTP_201_CREATED)
async def subir_archivo(
    proyecto_id: int,
    user: CurrentUser,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    """Sube un archivo al proyecto y lo procesa."""
    proyecto = _verificar_proyecto(proyecto_id, user, db)

    # Validar extension
    nombre = file.filename or "sin_nombre"
    ext = os.path.splitext(nombre)[1].lower()
    if ext not in FORMATOS_ACEPTADOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Formato {ext} no soportado. Formatos aceptados: {', '.join(FORMATOS_ACEPTADOS.keys())}",
        )

    formato = FORMATOS_ACEPTADOS[ext]

    # Guardar archivo en disco
    proyecto_dir = STORAGE_DIR / str(user.taller_id) / str(proyecto_id)
    proyecto_dir.mkdir(parents=True, exist_ok=True)

    unique_name = f"{uuid.uuid4().hex}{ext}"
    ruta_disco = proyecto_dir / unique_name
    contenido = await file.read()

    with open(ruta_disco, "wb") as f:
        f.write(contenido)

    # Crear registro en BD
    ruta_relativa = f"{user.taller_id}/{proyecto_id}/{unique_name}"
    archivo = Archivo(
        proyecto_id=proyecto.id,
        taller_id=user.taller_id,
        nombre_original=nombre,
        formato_original=formato,
        tamano_bytes=len(contenido),
        ruta_original=ruta_relativa,
        estado=EstadoArchivo.SUBIDO.value,
        subido_por=user.id,
    )

    # Si es DXF, procesarlo inmediatamente
    if formato == "dxf":
        try:
            resultado = parsear_dxf(str(ruta_disco))
            resultado = validar_geometria(resultado)
            jerarquia = detectar_jerarquia(resultado.entidades)

            archivo.ruta_dxf = ruta_relativa
            archivo.estado = EstadoArchivo.VALIDADO.value
            archivo.entidades_total = resultado.total_entidades
            archivo.longitud_total_mm = resultado.longitud_total_mm
            archivo.ancho_mm = resultado.ancho_mm
            archivo.alto_mm = resultado.alto_mm
            archivo.entidades_cerradas = resultado.cerradas
            archivo.entidades_abiertas = resultado.abiertas
            archivo.problemas = {
                "lista": [p.to_dict() for p in resultado.problemas],
                "errores_criticos": resultado.errores_criticos,
                "puede_avanzar": resultado.puede_avanzar,
            }
            archivo.geometria = {
                "entidades": [e.to_dict() for e in resultado.entidades],
                "bounds": list(resultado.bounds),
                "jerarquia": jerarquia,
            }

            if resultado.puede_avanzar:
                archivo.estado = EstadoArchivo.LISTO.value
        except Exception as e:
            archivo.estado = EstadoArchivo.ERROR.value
            archivo.problemas = {"error": str(e)}
    else:
        # Para formatos que no son DXF: marcar como pendiente de conversion
        # TODO: Implementar conversion con Inkscape headless (Fase 1.1)
        archivo.estado = EstadoArchivo.SUBIDO.value

    db.add(archivo)
    db.commit()
    db.refresh(archivo)
    return archivo


# ---------------------------------------------------------------------------
# Listar archivos de un proyecto
# ---------------------------------------------------------------------------

@router.get("/proyectos/{proyecto_id}/archivos", response_model=list[ArchivoOut])
def listar_archivos(proyecto_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    _verificar_proyecto(proyecto_id, user, db)
    rows = db.execute(
        select(Archivo)
        .where(Archivo.proyecto_id == proyecto_id, Archivo.taller_id == user.taller_id)
        .order_by(Archivo.creado.desc())
    ).scalars().all()
    return list(rows)


# ---------------------------------------------------------------------------
# Detalle de un archivo
# ---------------------------------------------------------------------------

@router.get("/archivos/{archivo_id}", response_model=ArchivoOut)
def detalle_archivo(archivo_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    return _verificar_archivo(archivo_id, user, db)


# ---------------------------------------------------------------------------
# Geometria para el canvas
# ---------------------------------------------------------------------------

@router.get("/archivos/{archivo_id}/geometria", response_model=GeometriaOut)
def obtener_geometria(archivo_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    """Retorna la geometria completa para renderizar en el canvas frontend."""
    archivo = _verificar_archivo(archivo_id, user, db)

    if not archivo.geometria:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archivo no tiene geometria procesada",
        )

    geo = archivo.geometria
    prob = archivo.problemas or {}

    return GeometriaOut(
        archivo_id=archivo.id,
        entidades=geo.get("entidades", []),
        problemas=prob.get("lista", []),
        bounds=geo.get("bounds", [0, 0, 0, 0]),
        longitud_total_mm=archivo.longitud_total_mm or 0,
        ancho_mm=archivo.ancho_mm or 0,
        alto_mm=archivo.alto_mm or 0,
        total_entidades=archivo.entidades_total or 0,
        cerradas=archivo.entidades_cerradas or 0,
        abiertas=archivo.entidades_abiertas or 0,
        errores_criticos=prob.get("errores_criticos", 0),
        puede_avanzar=prob.get("puede_avanzar", False),
        jerarquia=geo.get("jerarquia", {}),
    )


# ---------------------------------------------------------------------------
# Validar
# ---------------------------------------------------------------------------

@router.post("/archivos/{archivo_id}/validar", response_model=ValidacionOut)
def validar_archivo(archivo_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    """Re-ejecuta la validacion sobre el archivo."""
    archivo = _verificar_archivo(archivo_id, user, db)

    if not archivo.ruta_dxf:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo no tiene DXF procesado")

    ruta = STORAGE_DIR / archivo.ruta_dxf
    if not ruta.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo DXF no encontrado en disco")

    resultado = parsear_dxf(str(ruta))
    resultado = validar_geometria(resultado)
    jerarquia = detectar_jerarquia(resultado.entidades)

    archivo.estado = EstadoArchivo.LISTO.value if resultado.puede_avanzar else EstadoArchivo.VALIDADO.value
    archivo.entidades_total = resultado.total_entidades
    archivo.longitud_total_mm = resultado.longitud_total_mm
    archivo.ancho_mm = resultado.ancho_mm
    archivo.alto_mm = resultado.alto_mm
    archivo.entidades_cerradas = resultado.cerradas
    archivo.entidades_abiertas = resultado.abiertas
    archivo.problemas = {
        "lista": [p.to_dict() for p in resultado.problemas],
        "errores_criticos": resultado.errores_criticos,
        "puede_avanzar": resultado.puede_avanzar,
    }
    archivo.geometria = {
        "entidades": [e.to_dict() for e in resultado.entidades],
        "bounds": list(resultado.bounds),
        "jerarquia": jerarquia,
    }

    db.commit()

    return ValidacionOut(
        archivo_id=archivo.id,
        estado=archivo.estado,
        problemas=archivo.problemas.get("lista", []),
        errores_criticos=resultado.errores_criticos,
        puede_avanzar=resultado.puede_avanzar,
        entidades_total=resultado.total_entidades,
        cerradas=resultado.cerradas,
        abiertas=resultado.abiertas,
    )


# ---------------------------------------------------------------------------
# Auto-reparar
# ---------------------------------------------------------------------------

@router.post("/archivos/{archivo_id}/reparar", response_model=ValidacionOut)
def reparar_archivo(archivo_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    """Ejecuta auto-reparacion sobre el archivo."""
    archivo = _verificar_archivo(archivo_id, user, db)

    if not archivo.geometria or not archivo.geometria.get("entidades"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No hay geometria para reparar")

    # Reconstruir ResultadoDXF desde los datos almacenados
    from app.services.dxf_service import ResultadoDXF, Entidad, Problema
    entidades = []
    for ed in archivo.geometria.get("entidades", []):
        puntos = [tuple(p) for p in ed.get("puntos", [])]
        centro = tuple(ed["centro"]) if ed.get("centro") else None
        bounds = tuple(ed["bounds"]) if ed.get("bounds") else None
        entidades.append(Entidad(
            id=ed["id"], tipo=ed["tipo"], puntos=puntos,
            cerrada=ed.get("cerrada", False), radio=ed.get("radio", 0),
            centro=centro, longitud=ed.get("longitud", 0), bounds=bounds,
        ))

    problemas_raw = (archivo.problemas or {}).get("lista", [])
    problemas = []
    for p in problemas_raw:
        pos = tuple(p["posicion"]) if p.get("posicion") else None
        problemas.append(Problema(
            tipo=p["tipo"], severidad=p["severidad"],
            entidad_id=p["entidad_id"], descripcion=p["descripcion"],
            posicion=pos, reparable=p.get("reparable", False),
        ))

    resultado = ResultadoDXF(entidades=entidades, problemas=problemas)
    if archivo.geometria.get("bounds"):
        resultado.bounds = tuple(archivo.geometria["bounds"])
    resultado.longitud_total_mm = archivo.longitud_total_mm or 0
    resultado.ancho_mm = archivo.ancho_mm or 0
    resultado.alto_mm = archivo.alto_mm or 0

    # Reparar
    reparado = auto_reparar(resultado)
    jerarquia = detectar_jerarquia(reparado.entidades)

    # Actualizar BD
    archivo.estado = EstadoArchivo.LISTO.value if reparado.puede_avanzar else EstadoArchivo.VALIDADO.value
    archivo.entidades_total = reparado.total_entidades
    archivo.longitud_total_mm = reparado.longitud_total_mm
    archivo.ancho_mm = reparado.ancho_mm
    archivo.alto_mm = reparado.alto_mm
    archivo.entidades_cerradas = reparado.cerradas
    archivo.entidades_abiertas = reparado.abiertas
    archivo.problemas = {
        "lista": [p.to_dict() for p in reparado.problemas],
        "errores_criticos": reparado.errores_criticos,
        "puede_avanzar": reparado.puede_avanzar,
    }
    archivo.geometria = {
        "entidades": [e.to_dict() for e in reparado.entidades],
        "bounds": list(reparado.bounds),
        "jerarquia": jerarquia,
    }

    db.commit()

    return ValidacionOut(
        archivo_id=archivo.id,
        estado=archivo.estado,
        problemas=archivo.problemas.get("lista", []),
        errores_criticos=reparado.errores_criticos,
        puede_avanzar=reparado.puede_avanzar,
        entidades_total=reparado.total_entidades,
        cerradas=reparado.cerradas,
        abiertas=reparado.abiertas,
    )


# ---------------------------------------------------------------------------
# Editar vectores
# ---------------------------------------------------------------------------

OPERACIONES = {
    "mover": lambda ents, ids, p: vector_ops.mover(ents, ids, p.get("dx", 0), p.get("dy", 0)),
    "escalar": lambda ents, ids, p: vector_ops.escalar(ents, ids, p.get("factor", 1)),
    "escalar_medida": lambda ents, ids, p: vector_ops.escalar_a_medida(ents, ids, ancho=p.get("ancho"), alto=p.get("alto")),
    "rotar": lambda ents, ids, p: vector_ops.rotar(ents, ids, p.get("angulo", 0)),
    "espejar_h": lambda ents, ids, p: vector_ops.espejar_horizontal(ents, ids),
    "espejar_v": lambda ents, ids, p: vector_ops.espejar_vertical(ents, ids),
    "duplicar": lambda ents, ids, p: vector_ops.duplicar(ents, ids, p.get("dx", 10), p.get("dy", 10)),
    "multiplicar": lambda ents, ids, p: vector_ops.multiplicar_grilla(ents, ids, p.get("filas", 2), p.get("columnas", 2), p.get("dx", 50), p.get("dy", 50)),
    "eliminar": lambda ents, ids, p: vector_ops.eliminar(ents, ids),
    "cerrar": lambda ents, ids, p: vector_ops.cerrar_polilinea(ents, ids[0] if ids else 0),
    "mover_origen": lambda ents, ids, p: vector_ops.mover_a_origen(ents, ids),
}


@router.post("/archivos/{archivo_id}/editar", response_model=GeometriaOut)
def editar_archivo(archivo_id: int, body: EditarRequest, user: CurrentUser, db: Session = Depends(get_db)):
    """Aplica una operacion de edicion sobre las entidades del archivo."""
    archivo = _verificar_archivo(archivo_id, user, db)

    if not archivo.geometria or not archivo.geometria.get("entidades"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No hay geometria para editar")

    operacion_fn = OPERACIONES.get(body.operacion)
    if operacion_fn is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Operacion '{body.operacion}' no reconocida. Disponibles: {', '.join(OPERACIONES.keys())}",
        )

    entidades = archivo.geometria.get("entidades", [])

    # Aplicar operacion
    try:
        entidades = operacion_fn(entidades, body.ids, body.params)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Error en operacion: {e}")

    # Recalcular totales
    totales = vector_ops.recalcular_totales(entidades)

    # Re-detectar jerarquia
    from app.services.dxf_service import Entidad
    entidades_obj = []
    for ed in entidades:
        puntos = [tuple(p) for p in ed.get("puntos", [])]
        centro = tuple(ed["centro"]) if ed.get("centro") else None
        bounds_t = tuple(ed["bounds"]) if ed.get("bounds") else None
        entidades_obj.append(Entidad(
            id=ed["id"], tipo=ed["tipo"], puntos=puntos,
            cerrada=ed.get("cerrada", False), radio=ed.get("radio", 0),
            centro=centro, longitud=ed.get("longitud", 0), bounds=bounds_t,
        ))
    jerarquia = detectar_jerarquia(entidades_obj)

    # Guardar en BD
    archivo.geometria = {
        "entidades": entidades,
        "bounds": totales["bounds"],
        "jerarquia": jerarquia,
    }
    archivo.entidades_total = totales["total_entidades"]
    archivo.longitud_total_mm = totales["longitud_total_mm"]
    archivo.ancho_mm = totales["ancho_mm"]
    archivo.alto_mm = totales["alto_mm"]
    archivo.entidades_cerradas = totales["cerradas"]
    archivo.entidades_abiertas = totales["abiertas"]

    db.commit()

    prob = archivo.problemas or {}
    return GeometriaOut(
        archivo_id=archivo.id,
        entidades=entidades,
        problemas=prob.get("lista", []),
        bounds=totales["bounds"],
        longitud_total_mm=totales["longitud_total_mm"],
        ancho_mm=totales["ancho_mm"],
        alto_mm=totales["alto_mm"],
        total_entidades=totales["total_entidades"],
        cerradas=totales["cerradas"],
        abiertas=totales["abiertas"],
        errores_criticos=prob.get("errores_criticos", 0),
        puede_avanzar=prob.get("puede_avanzar", False),
        jerarquia=jerarquia,
    )


# ---------------------------------------------------------------------------
# Eliminar
# ---------------------------------------------------------------------------

@router.delete("/archivos/{archivo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_archivo(archivo_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    archivo = _verificar_archivo(archivo_id, user, db)

    # Eliminar archivos de disco
    for ruta_rel in [archivo.ruta_original, archivo.ruta_dxf]:
        if ruta_rel:
            ruta = STORAGE_DIR / ruta_rel
            if ruta.exists():
                ruta.unlink()

    db.delete(archivo)
    db.commit()
