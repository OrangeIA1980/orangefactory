from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import CurrentUser
from app.models import Proyecto
from app.schemas import ProyectoCreate, ProyectoOut

router = APIRouter(prefix="/proyectos", tags=["proyectos"])


@router.get("", response_model=list[ProyectoOut])
def listar(user: CurrentUser, db: Session = Depends(get_db)):
    rows = db.execute(
        select(Proyecto)
        .where(Proyecto.taller_id == user.taller_id)
        .order_by(Proyecto.actualizado.desc())
    ).scalars().all()
    return list(rows)


@router.post("", response_model=ProyectoOut, status_code=status.HTTP_201_CREATED)
def crear(body: ProyectoCreate, user: CurrentUser, db: Session = Depends(get_db)):
    proyecto = Proyecto(
        taller_id=user.taller_id,
        nombre=body.nombre,
        cliente=body.cliente,
        creado_por=user.id,
    )
    db.add(proyecto)
    db.commit()
    db.refresh(proyecto)
    return proyecto


@router.get("/{proyecto_id}", response_model=ProyectoOut)
def obtener(proyecto_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    proyecto = db.get(Proyecto, proyecto_id)
    if proyecto is None or proyecto.taller_id != user.taller_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="proyecto no existe")
    return proyecto
