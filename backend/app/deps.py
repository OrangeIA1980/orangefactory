"""Dependencias FastAPI: autenticacion y tenant scoping.

Todas las rutas protegidas deben depender de current_user, que garantiza que
el JWT es valido y retorna el Usuario (con taller_id cargado). El filtro
por tenant debe aplicarse en cada query — hay un helper `tenant_filter` abajo.
"""
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Usuario
from app.security import decode_access_token


def _extract_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="token faltante")
    return authorization.split(" ", 1)[1]


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> Usuario:
    token = _extract_token(authorization)
    try:
        payload = decode_access_token(token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="token invalido")

    user_id = int(payload["sub"])
    user = db.get(Usuario, user_id)
    if user is None or not user.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="usuario no existe o inactivo")
    if user.taller_id != payload.get("taller_id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="tenant mismatch")
    return user


CurrentUser = Annotated[Usuario, Depends(get_current_user)]


def require_rol(*roles_permitidos: str):
    """Dependency factory que restringe una ruta a ciertos roles."""

    def _check(user: CurrentUser) -> Usuario:
        if user.rol not in roles_permitidos:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="rol insuficiente")
        return user

    return _check
