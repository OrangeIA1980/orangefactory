# nginx edge — orangefactory.cl

Este nginx corre como servicio dentro de `docker-compose.prod.yml` y es el **unico punto de entrada publico** (puertos 80 y 443). Termina TLS y enruta:

- `/api/*` -> `backend:8000` (FastAPI)
- Todo lo demas -> `frontend:80` (nginx interno con el build de Vite)

## Primer arranque en el servidor (bootstrap Let's Encrypt)

El `nginx.conf` referencia certificados que aun no existen. Para romper el circulo:

1. Comenta temporalmente el bloque `server { listen 443 ... }` en `nginx.conf`.
2. Levanta solo los servicios necesarios para el challenge HTTP-01:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx
   ```
3. Pide los certificados:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot \
     certonly --webroot -w /var/www/certbot \
     -d orangefactory.cl -d www.orangefactory.cl \
     -m proyecto@orangefd.cl --agree-tos --non-interactive
   ```
4. Descomenta el bloque `:443` y recarga:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload
   ```
5. El servicio `certbot` ya corre en loop renovando cada 12h.

## Volumenes

- `./nginx/nginx.conf` -> `/etc/nginx/nginx.conf` (config)
- `./nginx/certs` -> `/etc/nginx/certs` + `/etc/letsencrypt` (certificados persistentes)
- `./nginx/webroot` -> `/var/www/certbot` (desafios ACME)
