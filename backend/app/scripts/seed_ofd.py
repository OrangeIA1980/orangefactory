"""Seed inicial — crea el tenant OFD y el usuario admin Gonzalo.

Uso:
    docker compose exec backend python -m app.scripts.seed_ofd

El script es idempotente: si ya existe el taller OFD, no hace nada.
Imprime el password generado en consola — Gonzalo debe cambiarlo en el primer login.
"""
import secrets
import string
import sys

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Rol, Taller, Usuario
from app.security import hash_password


def random_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def main():
    db = SessionLocal()
    try:
        taller = db.execute(select(Taller).where(Taller.slug == "ofd")).scalar_one_or_none()
        if taller:
            print("[seed] Taller OFD ya existe, no se hace nada.")
            sys.exit(0)

        taller = Taller(slug="ofd", nombre="Orange Fabrica Digital", pais="CL")
        db.add(taller)
        db.flush()

        password = random_password()
        usuario = Usuario(
            taller_id=taller.id,
            email="proyecto@orangefd.cl",
            password_hash=hash_password(password),
            nombre="Gonzalo",
            rol=Rol.ADMIN.value,
        )
        db.add(usuario)
        db.commit()

        print("=" * 60)
        print("[seed] Taller OFD creado correctamente.")
        print(f"[seed] Email: proyecto@orangefd.cl")
        print(f"[seed] Password inicial: {password}")
        print(f"[seed] Cambiar inmediatamente despues del primer login.")
        print("=" * 60)
    finally:
        db.close()


if __name__ == "__main__":
    main()
