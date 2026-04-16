from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import CurrentUser
from app.models import Taller, Usuario
from app.schemas import LoginRequest, TokenResponse, UsuarioOut
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(select(Usuario).where(Usuario.email == body.email)).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="credenciales invalidas")
    if not user.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="usuario inactivo")

    taller = db.get(Taller, user.taller_id)
    token = create_access_token(user_id=user.id, taller_id=user.taller_id, rol=user.rol)
    return TokenResponse(
        access_token=token,
        usuario=UsuarioOut(
            id=user.id,
            email=user.email,
            nombre=user.nombre,
            rol=user.rol,
            taller_id=user.taller_id,
            taller_nombre=taller.nombre if taller else "",
        ),
    )


@router.get("/me", response_model=UsuarioOut)
def me(user: CurrentUser, db: Session = Depends(get_db)):
    taller = db.get(Taller, user.taller_id)
    return UsuarioOut(
        id=user.id,
        email=user.email,
        nombre=user.nombre,
        rol=user.rol,
        taller_id=user.taller_id,
        taller_nombre=taller.nombre if taller else "",
    )
