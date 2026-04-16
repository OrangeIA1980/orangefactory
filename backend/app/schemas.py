from datetime import datetime

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: "UsuarioOut"


class UsuarioOut(BaseModel):
    id: int
    email: EmailStr
    nombre: str
    rol: str
    taller_id: int
    taller_nombre: str

    class Config:
        from_attributes = True


class ProyectoOut(BaseModel):
    id: int
    nombre: str
    cliente: str | None
    estado: str
    creado: datetime
    actualizado: datetime

    class Config:
        from_attributes = True


class ProyectoCreate(BaseModel):
    nombre: str
    cliente: str | None = None


# --- Archivo (Modo Preparar) ---

class ArchivoOut(BaseModel):
    id: int
    proyecto_id: int
    nombre_original: str
    formato_original: str
    tamano_bytes: int
    estado: str
    entidades_total: int | None
    longitud_total_mm: float | None
    ancho_mm: float | None
    alto_mm: float | None
    entidades_cerradas: int | None
    entidades_abiertas: int | None
    problemas: dict | None
    creado: datetime
    actualizado: datetime

    class Config:
        from_attributes = True


class GeometriaOut(BaseModel):
    """Geometria completa para renderizar en el canvas frontend."""
    archivo_id: int
    entidades: list
    problemas: list
    bounds: list
    longitud_total_mm: float
    ancho_mm: float
    alto_mm: float
    total_entidades: int
    cerradas: int
    abiertas: int
    errores_criticos: int
    puede_avanzar: bool
    jerarquia: dict  # {entidad_id: "exterior"|"interior"|"abierta"}


class ValidacionOut(BaseModel):
    """Resultado de validacion/reparacion."""
    archivo_id: int
    estado: str
    problemas: list
    errores_criticos: int
    puede_avanzar: bool
    entidades_total: int
    cerradas: int
    abiertas: int


class EditarRequest(BaseModel):
    """Solicitud de edicion de vectores."""
    operacion: str  # mover, escalar, rotar, espejar_h, espejar_v, duplicar, multiplicar, eliminar, cerrar, mover_origen, escalar_medida
    ids: list[int]  # IDs de entidades seleccionadas
    params: dict = {}  # Parametros segun la operacion (dx, dy, factor, angulo, filas, columnas, ancho, alto)


class WorkspaceOut(BaseModel):
    """Workspace unificado: geometria de TODOS los archivos del proyecto combinados."""
    proyecto_id: int
    entidades: list  # All entities from all files, with unique IDs
    problemas: list
    bounds: list
    longitud_total_mm: float
    ancho_mm: float
    alto_mm: float
    total_entidades: int
    cerradas: int
    abiertas: int
    errores_criticos: int
    puede_avanzar: bool
    jerarquia: dict
    archivos: list  # [{id, nombre, estado, entidad_ids: []}]


TokenResponse.model_rebuild()
