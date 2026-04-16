# CHECKLIST semana 1 — OrangeFactory

Cosas que haces tú (Gonzalo) esta semana, en orden. Marca con [x] cuando termines cada una.

## Bloque A — Cuentas y dominio (1-2 horas tuyas)

- [ ] **Comprar el dominio `orangefactory.cl`** en NIC Chile (https://www.nic.cl/).
      Costo: ~10.000 CLP al año. Pago con tarjeta, dominio activo en ~24 hrs.
      También puedes comprar `orangefactory.app` en Porkbun o Cloudflare (~25 USD/año)
      si quieres apuntar desde el inicio al mercado internacional, pero no es bloqueante.

- [ ] **Crear cuenta en Hetzner Cloud** (https://www.hetzner.com/cloud).
      Registro con email + tarjeta. Te dan 20 EUR de crédito gratis al principio
      usando el referral link de un amigo (o sin él, igual funciona).

- [ ] **Levantar un servidor CX22** en Hetzner (2 vCPU, 4GB RAM, 40GB disco).
      Costo: ~5 EUR/mes. Elige ubicación Ashburn VA o Falkenstein DE.
      Sistema operativo: Ubuntu 24.04.
      Agrega tu SSH key pública en el panel antes de crear el servidor.

- [ ] **Apuntar DNS del dominio al IP del servidor.**
      En NIC Chile o Cloudflare, crea un registro A:
      - `orangefactory.cl` → IP de Hetzner
      - `www.orangefactory.cl` → IP de Hetzner
      Propagación: 5-30 minutos.

- [ ] **Copiar la IP y el dominio en `.env`** del proyecto local cuando lo tengas.

## Bloque B — GitHub (15 minutos tuyas)

- [ ] **Crear un repo nuevo en GitHub** llamado `orangefactory` (privado).
      No conflictúa con tu bot de WhatsApp — ese queda en su propio repo.

- [ ] **Agregar un Deploy Key SSH** al repo (Settings → Deploy Keys) con
      la clave pública del servidor Hetzner. Esto permite que el servidor haga
      `git pull` sin usar tu password.

- [ ] **Agregar estos Secrets** al repo (Settings → Secrets and variables → Actions):
      - `HETZNER_SSH_KEY` — llave privada SSH con acceso al servidor
      - `HETZNER_HOST` — IP del servidor
      - `HETZNER_USER` — `root` o el usuario que creaste
      - `DATABASE_URL` — string de conexión Postgres de producción
      - `SECRET_KEY` — string aleatorio largo para firmar JWT (generar con `openssl rand -hex 32`)

## Bloque C — Servidor (30 minutos tuyas)

- [ ] **Entrar al servidor** por SSH: `ssh root@<ip-hetzner>`

- [ ] **Instalar Docker** y Docker Compose:
      ```bash
      curl -fsSL https://get.docker.com | sh
      apt install -y docker-compose-plugin git
      ```

- [ ] **Clonar el repo** en `/opt/orangefactory`:
      ```bash
      cd /opt
      git clone git@github.com:<tu-user>/orangefactory.git
      cd orangefactory
      ```

- [ ] **Crear el `.env` de producción** en el servidor con los valores reales.

- [ ] **Levantar el stack** en modo producción:
      ```bash
      docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
      ```

- [ ] **Verificar** entrando a `https://orangefactory.cl` desde tu navegador.
      Deberías ver la landing mínima con el logo y el botón "Iniciar sesión".

## Bloque D — Primer login (5 minutos tuyas)

- [ ] **Correr migraciones** en el servidor:
      ```bash
      docker compose exec backend alembic upgrade head
      ```

- [ ] **Crear el tenant OFD** con el script de seed:
      ```bash
      docker compose exec backend python -m app.scripts.seed_ofd
      ```
      El script imprime tu password inicial. Anótalo.

- [ ] **Probar login** en `https://orangefactory.cl/login` con
      `proyecto@orangefd.cl` y la password del seed.

- [ ] **Cambiar password inmediatamente** después del primer login.

## Qué hago yo (Claude) en paralelo mientras haces lo de arriba

- [x] Scaffolding completo del backend FastAPI con multi-tenant
- [x] Scaffolding del frontend React + Vite + Tailwind
- [x] Docker compose para local y producción
- [x] Migraciones Alembic iniciales (tenant, usuario, proyecto)
- [x] Script de seed para crear OFD como primer tenant
- [x] GitHub Actions para deploy automático
- [x] Configuración de nginx con Let's Encrypt
- [x] README y .env.example

## Problemas comunes

**"SSL no funciona"** — Let's Encrypt tarda 1-2 minutos la primera vez. Si falla,
revisa que el DNS del dominio haya propagado (`dig orangefactory.cl` debe mostrar la IP).

**"docker compose: command not found"** — En Ubuntu 24.04 instala con
`apt install -y docker-compose-plugin` (no `docker-compose` viejo).

**"backend no conecta a postgres"** — Revisa que `DATABASE_URL` apunte al hostname
`postgres` (no `localhost`) dentro del docker compose.

**"alembic upgrade head falla"** — Revisa que la BD esté creada (`CREATE DATABASE orangefactory;`)
antes de correr migraciones.

---

Cuando termines un bloque, avísame y vamos al siguiente. Si algo se complica, copias el error
acá y lo resolvemos al tiro.
