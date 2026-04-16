"""Servicio de procesamiento DXF para el Modo Preparar.

Funcionalidades:
1. Parsear DXF con ezdxf (mas robusto que el parser legacy para archivos complejos)
2. Validar geometria: polilineas abiertas, casi cerradas, duplicadas, diminutas
3. Auto-reparar problemas resolubles
4. Serializar geometria para el canvas frontend
"""
import math
from typing import List, Tuple, Optional
from dataclasses import dataclass, field

import ezdxf


# ---------------------------------------------------------------------------
# Dataclasses de geometria
# ---------------------------------------------------------------------------

@dataclass
class Entidad:
    """Entidad geometrica normalizada (independiente de formato origen)."""
    id: int
    tipo: str  # LINE, CIRCLE, ARC, LWPOLYLINE, SPLINE, ELLIPSE
    puntos: List[Tuple[float, float]] = field(default_factory=list)
    cerrada: bool = False
    radio: float = 0.0
    centro: Optional[Tuple[float, float]] = None
    longitud: float = 0.0
    bounds: Optional[Tuple[float, float, float, float]] = None

    def to_dict(self) -> dict:
        """Serializa para JSON (frontend)."""
        return {
            "id": self.id,
            "tipo": self.tipo,
            "puntos": self.puntos,
            "cerrada": self.cerrada,
            "radio": self.radio,
            "centro": list(self.centro) if self.centro else None,
            "longitud": round(self.longitud, 2),
            "bounds": list(self.bounds) if self.bounds else None,
        }


@dataclass
class Problema:
    """Un problema detectado durante la validacion."""
    tipo: str  # abierta, casi_cerrada, duplicada, diminuta
    severidad: str  # critico, advertencia, info
    entidad_id: int
    descripcion: str
    posicion: Optional[Tuple[float, float]] = None  # para zoom-to en frontend
    reparable: bool = True

    def to_dict(self) -> dict:
        return {
            "tipo": self.tipo,
            "severidad": self.severidad,
            "entidad_id": self.entidad_id,
            "descripcion": self.descripcion,
            "posicion": list(self.posicion) if self.posicion else None,
            "reparable": self.reparable,
        }


@dataclass
class ResultadoDXF:
    """Resultado completo del analisis de un archivo DXF."""
    entidades: List[Entidad] = field(default_factory=list)
    problemas: List[Problema] = field(default_factory=list)
    bounds: Tuple[float, float, float, float] = (0, 0, 0, 0)
    longitud_total_mm: float = 0.0
    ancho_mm: float = 0.0
    alto_mm: float = 0.0

    @property
    def total_entidades(self) -> int:
        return len(self.entidades)

    @property
    def cerradas(self) -> int:
        return sum(1 for e in self.entidades if e.cerrada)

    @property
    def abiertas(self) -> int:
        return sum(1 for e in self.entidades if not e.cerrada)

    @property
    def errores_criticos(self) -> int:
        return sum(1 for p in self.problemas if p.severidad == "critico")

    @property
    def puede_avanzar(self) -> bool:
        """Solo puede avanzar a Cotizar si no hay errores criticos."""
        return self.errores_criticos == 0

    def to_dict(self) -> dict:
        return {
            "entidades": [e.to_dict() for e in self.entidades],
            "problemas": [p.to_dict() for p in self.problemas],
            "bounds": list(self.bounds),
            "longitud_total_mm": round(self.longitud_total_mm, 2),
            "ancho_mm": round(self.ancho_mm, 2),
            "alto_mm": round(self.alto_mm, 2),
            "total_entidades": self.total_entidades,
            "cerradas": self.cerradas,
            "abiertas": self.abiertas,
            "errores_criticos": self.errores_criticos,
            "puede_avanzar": self.puede_avanzar,
        }


# ---------------------------------------------------------------------------
# Parser DXF con ezdxf
# ---------------------------------------------------------------------------

def _discretizar_arco(cx: float, cy: float, r: float,
                      start_deg: float, end_deg: float,
                      res: float = 0.5) -> List[Tuple[float, float]]:
    """Convierte arco a puntos."""
    start = math.radians(start_deg)
    end = math.radians(end_deg)
    sweep = (end - start) % (2 * math.pi)
    if sweep < 1e-6:
        sweep = 2 * math.pi
    arc_len = r * sweep
    n = max(8, int(arc_len / res))
    pts = []
    for i in range(n + 1):
        t = i / n
        ang = start + sweep * t
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    return pts


def _longitud_puntos(pts: List[Tuple[float, float]], cerrada: bool = False) -> float:
    """Calcula longitud total de una secuencia de puntos."""
    if len(pts) < 2:
        return 0.0
    total = 0.0
    for i in range(len(pts) - 1):
        dx = pts[i + 1][0] - pts[i][0]
        dy = pts[i + 1][1] - pts[i][1]
        total += math.sqrt(dx * dx + dy * dy)
    if cerrada and len(pts) > 2:
        dx = pts[0][0] - pts[-1][0]
        dy = pts[0][1] - pts[-1][1]
        total += math.sqrt(dx * dx + dy * dy)
    return total


def _bounds_puntos(pts: List[Tuple[float, float]]) -> Tuple[float, float, float, float]:
    """Bounding box de una lista de puntos."""
    if not pts:
        return (0, 0, 0, 0)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def parsear_dxf(ruta: str) -> ResultadoDXF:
    """Parsea un archivo DXF y retorna las entidades geometricas."""
    doc = ezdxf.readfile(ruta)
    msp = doc.modelspace()

    entidades: List[Entidad] = []
    idx = 0

    for entity in msp:
        dxf_type = entity.dxftype()

        if dxf_type == "LINE":
            start = (entity.dxf.start.x, entity.dxf.start.y)
            end = (entity.dxf.end.x, entity.dxf.end.y)
            dx = end[0] - start[0]
            dy = end[1] - start[1]
            longitud = math.sqrt(dx * dx + dy * dy)
            if longitud < 1e-6:
                continue
            entidades.append(Entidad(
                id=idx, tipo="LINE", puntos=[start, end],
                cerrada=False, longitud=longitud,
                bounds=_bounds_puntos([start, end]),
            ))
            idx += 1

        elif dxf_type == "CIRCLE":
            cx, cy = entity.dxf.center.x, entity.dxf.center.y
            r = entity.dxf.radius
            n = max(32, int(2 * math.pi * r / 0.5))
            pts = [(cx + r * math.cos(2 * math.pi * i / n),
                     cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
            entidades.append(Entidad(
                id=idx, tipo="CIRCLE", puntos=pts, cerrada=True,
                radio=r, centro=(cx, cy),
                longitud=2 * math.pi * r,
                bounds=(cx - r, cy - r, cx + r, cy + r),
            ))
            idx += 1

        elif dxf_type == "ARC":
            cx, cy = entity.dxf.center.x, entity.dxf.center.y
            r = entity.dxf.radius
            pts = _discretizar_arco(cx, cy, r, entity.dxf.start_angle, entity.dxf.end_angle)
            entidades.append(Entidad(
                id=idx, tipo="ARC", puntos=pts, cerrada=False,
                radio=r, centro=(cx, cy),
                longitud=_longitud_puntos(pts),
                bounds=_bounds_puntos(pts),
            ))
            idx += 1

        elif dxf_type == "LWPOLYLINE":
            # Obtener puntos con bulge resuelto via ezdxf
            try:
                pts_raw = list(entity.get_points(format="xy"))
            except Exception:
                pts_raw = [(v[0], v[1]) for v in entity.get_points(format="xyseb")]
            pts = [(float(p[0]), float(p[1])) for p in pts_raw]
            if len(pts) < 2:
                continue
            cerrada = entity.closed
            # Si tiene bulges, flattening las curvas
            try:
                with_curves = list(entity.flattening(0.5))
                pts = [(float(p.x), float(p.y)) for p in with_curves]
            except Exception:
                pass  # Si falla flattening, quedamos con los puntos crudos
            entidades.append(Entidad(
                id=idx, tipo="LWPOLYLINE", puntos=pts,
                cerrada=cerrada,
                longitud=_longitud_puntos(pts, cerrada),
                bounds=_bounds_puntos(pts),
            ))
            idx += 1

        elif dxf_type == "POLYLINE":
            pts = [(float(v.dxf.location.x), float(v.dxf.location.y))
                   for v in entity.vertices if v.dxf.location is not None]
            if len(pts) < 2:
                continue
            cerrada = entity.is_closed
            entidades.append(Entidad(
                id=idx, tipo="POLYLINE", puntos=pts,
                cerrada=cerrada,
                longitud=_longitud_puntos(pts, cerrada),
                bounds=_bounds_puntos(pts),
            ))
            idx += 1

        elif dxf_type == "SPLINE":
            try:
                pts = [(float(p.x), float(p.y)) for p in entity.flattening(0.5)]
            except Exception:
                # Fallback: control points
                pts = [(float(p[0]), float(p[1])) for p in entity.control_points]
            if len(pts) < 2:
                continue
            cerrada = entity.closed
            entidades.append(Entidad(
                id=idx, tipo="SPLINE", puntos=pts,
                cerrada=cerrada,
                longitud=_longitud_puntos(pts, cerrada),
                bounds=_bounds_puntos(pts),
            ))
            idx += 1

        elif dxf_type == "ELLIPSE":
            try:
                pts = [(float(p.x), float(p.y)) for p in entity.flattening(0.5)]
            except Exception:
                continue
            if len(pts) < 2:
                continue
            entidades.append(Entidad(
                id=idx, tipo="ELLIPSE", puntos=pts,
                cerrada=True,
                longitud=_longitud_puntos(pts, True),
                bounds=_bounds_puntos(pts),
            ))
            idx += 1

    # Calcular bounds y longitud totales
    resultado = ResultadoDXF(entidades=entidades)
    if entidades:
        all_pts = []
        total_len = 0.0
        for e in entidades:
            all_pts.extend(e.puntos)
            total_len += e.longitud
        resultado.longitud_total_mm = total_len
        if all_pts:
            xs = [p[0] for p in all_pts]
            ys = [p[1] for p in all_pts]
            resultado.bounds = (min(xs), min(ys), max(xs), max(ys))
            resultado.ancho_mm = max(xs) - min(xs)
            resultado.alto_mm = max(ys) - min(ys)

    return resultado


# ---------------------------------------------------------------------------
# Validacion geometrica
# ---------------------------------------------------------------------------

def validar_geometria(resultado: ResultadoDXF, gap_tolerancia: float = 2.0,
                       min_longitud: float = 0.5, dup_tolerancia: float = 0.1) -> ResultadoDXF:
    """Analiza las entidades y detecta problemas.

    Problemas detectados:
    - Polilineas abiertas (critico si deberian ser cerradas)
    - Polilineas casi cerradas (gap < gap_tolerancia mm)
    - Entidades diminutas (longitud < min_longitud mm)
    - Entidades duplicadas (mismos bounds dentro de dup_tolerancia)
    """
    problemas: List[Problema] = []

    for e in resultado.entidades:
        # --- Polilineas abiertas ---
        if not e.cerrada and e.tipo in ("LWPOLYLINE", "POLYLINE", "SPLINE") and len(e.puntos) >= 3:
            p_inicio = e.puntos[0]
            p_fin = e.puntos[-1]
            gap = math.sqrt((p_inicio[0] - p_fin[0]) ** 2 + (p_inicio[1] - p_fin[1]) ** 2)

            if gap < gap_tolerancia:
                # Casi cerrada (advertencia, reparable)
                problemas.append(Problema(
                    tipo="casi_cerrada",
                    severidad="advertencia",
                    entidad_id=e.id,
                    descripcion=f"Polilinea casi cerrada (gap {gap:.2f} mm). Se puede cerrar automaticamente.",
                    posicion=p_inicio,
                    reparable=True,
                ))
            else:
                # Abierta (critico para corte)
                problemas.append(Problema(
                    tipo="abierta",
                    severidad="critico",
                    entidad_id=e.id,
                    descripcion=f"Polilinea abierta (gap {gap:.1f} mm). Revisar manualmente.",
                    posicion=p_inicio,
                    reparable=False,
                ))

        # --- Entidades diminutas ---
        if e.longitud < min_longitud and e.tipo != "CIRCLE":
            problemas.append(Problema(
                tipo="diminuta",
                severidad="advertencia",
                entidad_id=e.id,
                descripcion=f"Entidad muy pequena ({e.longitud:.2f} mm). Considerar eliminar.",
                posicion=e.puntos[0] if e.puntos else None,
                reparable=True,
            ))

    # --- Duplicadas ---
    for i in range(len(resultado.entidades)):
        for j in range(i + 1, len(resultado.entidades)):
            ei = resultado.entidades[i]
            ej = resultado.entidades[j]
            if ei.tipo != ej.tipo:
                continue
            if ei.bounds and ej.bounds:
                if (abs(ei.bounds[0] - ej.bounds[0]) < dup_tolerancia and
                    abs(ei.bounds[1] - ej.bounds[1]) < dup_tolerancia and
                    abs(ei.bounds[2] - ej.bounds[2]) < dup_tolerancia and
                    abs(ei.bounds[3] - ej.bounds[3]) < dup_tolerancia and
                    abs(ei.longitud - ej.longitud) < dup_tolerancia):
                    problemas.append(Problema(
                        tipo="duplicada",
                        severidad="advertencia",
                        entidad_id=ej.id,
                        descripcion=f"Posible duplicado de entidad #{ei.id}.",
                        posicion=ej.puntos[0] if ej.puntos else None,
                        reparable=True,
                    ))

    resultado.problemas = problemas
    return resultado


# ---------------------------------------------------------------------------
# Auto-reparacion
# ---------------------------------------------------------------------------

def auto_reparar(resultado: ResultadoDXF, gap_tolerancia: float = 2.0,
                  min_longitud: float = 0.5) -> ResultadoDXF:
    """Repara problemas automaticamente donde es posible.

    Reparaciones:
    - Cerrar polilineas casi cerradas (gap < gap_tolerancia)
    - Eliminar entidades diminutas
    - Eliminar duplicadas
    """
    ids_eliminar = set()
    entidades_modificadas = {}

    for p in resultado.problemas:
        if not p.reparable:
            continue

        if p.tipo == "casi_cerrada":
            # Cerrar la polilinea
            e = next((e for e in resultado.entidades if e.id == p.entidad_id), None)
            if e and not e.cerrada:
                entidades_modificadas[e.id] = Entidad(
                    id=e.id, tipo=e.tipo, puntos=e.puntos,
                    cerrada=True, radio=e.radio, centro=e.centro,
                    longitud=_longitud_puntos(e.puntos, True),
                    bounds=e.bounds,
                )

        elif p.tipo == "diminuta":
            ids_eliminar.add(p.entidad_id)

        elif p.tipo == "duplicada":
            ids_eliminar.add(p.entidad_id)

    # Aplicar modificaciones
    nuevas_entidades = []
    for e in resultado.entidades:
        if e.id in ids_eliminar:
            continue
        if e.id in entidades_modificadas:
            nuevas_entidades.append(entidades_modificadas[e.id])
        else:
            nuevas_entidades.append(e)

    # Re-numerar IDs
    for i, e in enumerate(nuevas_entidades):
        e.id = i

    # Recalcular totales
    nuevo = ResultadoDXF(entidades=nuevas_entidades)
    if nuevas_entidades:
        all_pts = []
        total_len = 0.0
        for e in nuevas_entidades:
            all_pts.extend(e.puntos)
            total_len += e.longitud
        nuevo.longitud_total_mm = total_len
        if all_pts:
            xs = [p[0] for p in all_pts]
            ys = [p[1] for p in all_pts]
            nuevo.bounds = (min(xs), min(ys), max(xs), max(ys))
            nuevo.ancho_mm = max(xs) - min(xs)
            nuevo.alto_mm = max(ys) - min(ys)

    # Re-validar
    nuevo = validar_geometria(nuevo)
    return nuevo


# ---------------------------------------------------------------------------
# Deteccion interior/exterior (legacy portado)
# ---------------------------------------------------------------------------

def detectar_jerarquia(entidades: List[Entidad]) -> dict:
    """Detecta cuales entidades son interiores vs exteriores.

    Usa ray-casting: cuenta cuantos poligonos cerrados contienen el centroide.
    Par = exterior, Impar = interior.

    Retorna dict {entidad_id: "exterior" | "interior" | "abierta"}
    """
    def punto_en_poligono(px: float, py: float, poligono: List[Tuple[float, float]]) -> bool:
        n = len(poligono)
        dentro = False
        j = n - 1
        for i in range(n):
            xi, yi = poligono[i]
            xj, yj = poligono[j]
            if ((yi > py) != (yj > py)) and \
               (px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi):
                dentro = not dentro
            j = i
        return dentro

    resultado = {}
    for e in entidades:
        if not e.cerrada:
            resultado[e.id] = "abierta"
            continue

        cx = sum(p[0] for p in e.puntos) / len(e.puntos) if e.puntos else 0
        cy = sum(p[1] for p in e.puntos) / len(e.puntos) if e.puntos else 0

        contenidos = 0
        for otro in entidades:
            if otro.id == e.id or not otro.cerrada:
                continue
            if punto_en_poligono(cx, cy, otro.puntos):
                contenidos += 1

        resultado[e.id] = "interior" if contenidos % 2 == 1 else "exterior"

    return resultado
