# OrangeFactory

El software que corre tu fábrica Orange. Web app con tres modos (Preparar, Cotizar, Producir) para operar un taller CNC de punta a punta.

> Ver la especificación completa en `../ESPECIFICACION.md`.

## Arquitectura

```
OrangeFactory/
├── backend/          FastAPI + SQLAlchemy + Alembic (Python)
├── frontend/         React + Vite + TypeScript + Tailwind
├── nginx/            Reverse proxy con SSL
├── .github/          CI/CD con GitHub Actions
├── docker-compose.yml    Local development y producción
├── .env.example          Variables de entorno template
└── CHECKLIST.md          Pasos manuales que hace Gonzalo (dominio, Hetzner, etc.)
```

## Desarrollo local

```bash
# Clonar y entrar
git clone git@github.com:<tu-user>/orangefactory.git
cd orangefactory

# Copiar env
cp .env.example .env
# Editar .env con tu SECRET_KEY local

# Levantar todo
docker compose up --build

# Abrir en el navegador
open http://localhost:5173    # Frontend
open http://localhost:8000/docs    # Backend API (Swagger)
```

La primera vez Docker se demora 3-5 minutos construyendo las imágenes. Las siguientes son instantáneas.

## Primer usuario

Al levantar por primera vez, corre las migraciones y crea el primer tenant (OFD) con Gonzalo como admin:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.scripts.seed_ofd
```

Eso crea el taller "Orange Fábrica Digital" con Gonzalo de admin y login inicial:
- email: `proyecto@orangefd.cl`
- password: se imprime en consola al correr el seed

## Despliegue a producción

El push a `main` dispara GitHub Actions que hace build + deploy al VPS. Ver `.github/workflows/deploy.yml`.

## Estado actual

Fase 0 — Fundación. Todavía no hay features visibles. Lo que hay:
- Scaffolding completo de backend y frontend
- Base de datos multi-tenant con Taller, Usuario, Proyecto
- Auth JWT con middleware de tenant
- Docker compose listo para local y producción
- CI/CD a Hetzner

Próximo: Fase 1 — Modo Preparar MVP (semanas 3-6).
