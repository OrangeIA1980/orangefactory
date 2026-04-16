"""Operaciones de edicion de vectores para el Modo Preparar.

Portado desde OrangeCam/src/editor_vectores.py, adaptado para trabajar
con las entidades serializadas en JSON del modelo Archivo.

Operaciones disponibles:
- mover (translate)
- escalar (porcentaje o a medida)
- rotar
- espejar horizontal/vertical
- duplicar
- eliminar entidades seleccionadas
- cerrar polilinea abierta
- unir segmentos automaticamente
"""
import math
from typing import List, Tuple, Optional


def _bounds(puntos: List[List[float]]) -> Tuple[float, float, float, float]:
    if not puntos:
        return (0, 0, 0, 0)
    xs = [p[0] for p in puntos]
    ys = [p[1] for p in puntos]
    return (min(xs), min(ys), max(xs), max(ys))


def _longitud(puntos: List[List[float]], cerrada: bool = False) -> float:
    if len(puntos) < 2:
        return 0.0
    total = 0.0
    for i in range(len(puntos) - 1):
        dx = puntos[i + 1][0] - puntos[i][0]
        dy = puntos[i + 1][1] - puntos[i][1]
        total += math.sqrt(dx * dx + dy * dy)
    if cerrada and len(puntos) > 2:
        dx = puntos[0][0] - puntos[-1][0]
        dy = puntos[0][1] - puntos[-1][1]
        total += math.sqrt(dx * dx + dy * dy)
    return total


def _centroide_entidades(entidades: List[dict]) -> Tuple[float, float]:
    """Calcula el centro del bounding box de un grupo de entidades."""
    all_pts = []
    for e in entidades:
        all_pts.extend(e.get("puntos", []))
    if not all_pts:
        return (0, 0)
    xs = [p[0] for p in all_pts]
    ys = [p[1] for p in all_pts]
    return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)


def _actualizar_metadata(entidad: dict) -> dict:
    """Recalcula bounds y longitud despues de modificar puntos."""
    pts = entidad.get("puntos", [])
    entidad["bounds"] = list(_bounds(pts))
    entidad["longitud"] = round(_longitud(pts, entidad.get("cerrada", False)), 2)
    return entidad


# ---------------------------------------------------------------------------
# Operaciones
# ---------------------------------------------------------------------------

def mover(entidades: List[dict], ids: List[int], dx: float, dy: float) -> List[dict]:
    """Mueve las entidades seleccionadas por (dx, dy)."""
    resultado = []
    for e in entidades:
        if e["id"] in ids:
            e = dict(e)
            e["puntos"] = [[p[0] + dx, p[1] + dy] for p in e["puntos"]]
            e = _actualizar_metadata(e)
        resultado.append(e)
    return resultado


def escalar(entidades: List[dict], ids: List[int], factor: float,
            pivote: Optional[Tuple[float, float]] = None) -> List[dict]:
    """Escala las entidades seleccionadas por un factor desde un pivote."""
    seleccionadas = [e for e in entidades if e["id"] in ids]
    if pivote is None:
        pivote = _centroide_entidades(seleccionadas)
    px, py = pivote

    resultado = []
    for e in entidades:
        if e["id"] in ids:
            e = dict(e)
            e["puntos"] = [
                [px + (p[0] - px) * factor, py + (p[1] - py) * factor]
                for p in e["puntos"]
            ]
            if e.get("radio"):
                e["radio"] = e["radio"] * factor
            if e.get("centro"):
                e["centro"] = [px + (e["centro"][0] - px) * factor,
                               py + (e["centro"][1] - py) * factor]
            e = _actualizar_metadata(e)
        resultado.append(e)
    return resultado


def escalar_a_medida(entidades: List[dict], ids: List[int],
                     ancho: Optional[float] = None,
                     alto: Optional[float] = None) -> List[dict]:
    """Escala para que el grupo seleccionado tenga el ancho/alto indicado."""
    seleccionadas = [e for e in entidades if e["id"] in ids]
    all_pts = []
    for e in seleccionadas:
        all_pts.extend(e.get("puntos", []))
    if not all_pts:
        return entidades

    xs = [p[0] for p in all_pts]
    ys = [p[1] for p in all_pts]
    w_actual = max(xs) - min(xs)
    h_actual = max(ys) - min(ys)

    if w_actual < 0.01 and h_actual < 0.01:
        return entidades

    if ancho and w_actual > 0.01:
        factor = ancho / w_actual
    elif alto and h_actual > 0.01:
        factor = alto / h_actual
    else:
        factor = 1.0

    return escalar(entidades, ids, factor)


def rotar(entidades: List[dict], ids: List[int], angulo_grados: float,
          pivote: Optional[Tuple[float, float]] = None) -> List[dict]:
    """Rota las entidades seleccionadas (positivo = CCW)."""
    seleccionadas = [e for e in entidades if e["id"] in ids]
    if pivote is None:
        pivote = _centroide_entidades(seleccionadas)
    px, py = pivote
    rad = math.radians(angulo_grados)
    cos_a = math.cos(rad)
    sin_a = math.sin(rad)

    resultado = []
    for e in entidades:
        if e["id"] in ids:
            e = dict(e)
            e["puntos"] = [
                [px + (p[0] - px) * cos_a - (p[1] - py) * sin_a,
                 py + (p[0] - px) * sin_a + (p[1] - py) * cos_a]
                for p in e["puntos"]
            ]
            if e.get("centro"):
                cx, cy = e["centro"]
                e["centro"] = [
                    px + (cx - px) * cos_a - (cy - py) * sin_a,
                    py + (cx - px) * sin_a + (cy - py) * cos_a,
                ]
            e = _actualizar_metadata(e)
        resultado.append(e)
    return resultado


def espejar_horizontal(entidades: List[dict], ids: List[int]) -> List[dict]:
    """Espeja horizontalmente las entidades seleccionadas."""
    seleccionadas = [e for e in entidades if e["id"] in ids]
    cx, _ = _centroide_entidades(seleccionadas)

    resultado = []
    for e in entidades:
        if e["id"] in ids:
            e = dict(e)
            e["puntos"] = [[2 * cx - p[0], p[1]] for p in e["puntos"]]
            e["puntos"] = list(reversed(e["puntos"]))
            if e.get("centro"):
                e["centro"] = [2 * cx - e["centro"][0], e["centro"][1]]
            e = _actualizar_metadata(e)
        resultado.append(e)
    return resultado


def espejar_vertical(entidades: List[dict], ids: List[int]) -> List[dict]:
    """Espeja verticalmente las entidades seleccionadas."""
    seleccionadas = [e for e in entidades if e["id"] in ids]
    _, cy = _centroide_entidades(seleccionadas)

    resultado = []
    for e in entidades:
        if e["id"] in ids:
            e = dict(e)
            e["puntos"] = [[p[0], 2 * cy - p[1]] for p in e["puntos"]]
            e["puntos"] = list(reversed(e["puntos"]))
            if e.get("centro"):
                e["centro"] = [e["centro"][0], 2 * cy - e["centro"][1]]
            e = _actualizar_metadata(e)
        resultado.append(e)
    return resultado


def duplicar(entidades: List[dict], ids: List[int],
             dx: float = 10, dy: float = 10) -> List[dict]:
    """Duplica las entidades seleccionadas con un offset."""
    max_id = max(e["id"] for e in entidades) if entidades else 0
    nuevas = []
    for e in entidades:
        if e["id"] in ids:
            copia = dict(e)
            max_id += 1
            copia["id"] = max_id
            copia["puntos"] = [[p[0] + dx, p[1] + dy] for p in e["puntos"]]
            if copia.get("centro"):
                copia["centro"] = [e["centro"][0] + dx, e["centro"][1] + dy]
            copia = _actualizar_metadata(copia)
            nuevas.append(copia)
    return entidades + nuevas


def multiplicar_grilla(entidades: List[dict], ids: List[int],
                       filas: int, columnas: int,
                       dx: float, dy: float) -> List[dict]:
    """Crea copias en grilla de las entidades seleccionadas."""
    max_id = max(e["id"] for e in entidades) if entidades else 0
    nuevas = []
    originales = [e for e in entidades if e["id"] in ids]

    for r in range(filas):
        for c in range(columnas):
            if r == 0 and c == 0:
                continue  # Skip original
            for orig in originales:
                max_id += 1
                copia = dict(orig)
                copia["id"] = max_id
                offset_x = c * dx
                offset_y = r * dy
                copia["puntos"] = [[p[0] + offset_x, p[1] + offset_y] for p in orig["puntos"]]
                if copia.get("centro"):
                    copia["centro"] = [orig["centro"][0] + offset_x, orig["centro"][1] + offset_y]
                copia = _actualizar_metadata(copia)
                nuevas.append(copia)

    return entidades + nuevas


def eliminar(entidades: List[dict], ids: List[int]) -> List[dict]:
    """Elimina las entidades seleccionadas."""
    return [e for e in entidades if e["id"] not in ids]


def cerrar_polilinea(entidades: List[dict], entidad_id: int) -> List[dict]:
    """Cierra una polilinea abierta."""
    resultado = []
    for e in entidades:
        if e["id"] == entidad_id and not e.get("cerrada", False):
            e = dict(e)
            e["cerrada"] = True
            e = _actualizar_metadata(e)
        resultado.append(e)
    return resultado


def mover_a_origen(entidades: List[dict], ids: List[int]) -> List[dict]:
    """Mueve las entidades seleccionadas al origen (0,0)."""
    seleccionadas = [e for e in entidades if e["id"] in ids]
    all_pts = []
    for e in seleccionadas:
        all_pts.extend(e.get("puntos", []))
    if not all_pts:
        return entidades
    min_x = min(p[0] for p in all_pts)
    min_y = min(p[1] for p in all_pts)
    return mover(entidades, ids, -min_x, -min_y)


def recalcular_totales(entidades: List[dict]) -> dict:
    """Recalcula estadisticas globales despues de una operacion."""
    all_pts = []
    total_len = 0.0
    cerradas = 0
    abiertas = 0
    for e in entidades:
        all_pts.extend(e.get("puntos", []))
        total_len += e.get("longitud", 0)
        if e.get("cerrada"):
            cerradas += 1
        else:
            abiertas += 1

    bounds = [0, 0, 0, 0]
    ancho = 0.0
    alto = 0.0
    if all_pts:
        xs = [p[0] for p in all_pts]
        ys = [p[1] for p in all_pts]
        bounds = [min(xs), min(ys), max(xs), max(ys)]
        ancho = max(xs) - min(xs)
        alto = max(ys) - min(ys)

    return {
        "total_entidades": len(entidades),
        "cerradas": cerradas,
        "abiertas": abiertas,
        "longitud_total_mm": round(total_len, 2),
        "ancho_mm": round(ancho, 2),
        "alto_mm": round(alto, 2),
        "bounds": bounds,
    }
