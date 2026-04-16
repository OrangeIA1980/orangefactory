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


TokenResponse.model_rebuild()
