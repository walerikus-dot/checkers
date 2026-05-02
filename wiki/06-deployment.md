# 06 — Deployment Guide

## Production Server

| Property | Value |
|---|---|
| IP | `130.12.242.84` |
| Domain | `chashki.duckdns.org` (DuckDNS free subdomain → 130.12.242.84) |
| OS | Ubuntu 24.04.3 LTS |
| SSH key (local) | `~/.ssh/checkers_deploy` |
| SSL cert | Let's Encrypt, expires 2026-07-13, auto-renews |

```bash
ssh -i ~/.ssh/checkers_deploy root@130.12.242.84
```

---

## What Is Running

| Service | How | Listens on | Notes |
|---|---|---|---|
| nginx | Docker container | `0.0.0.0:80` + `0.0.0.0:443` | Port 80 → HTTPS redirect; 443 proxies everything |
| checkers-frontend-1 | Docker container | internal port 3001 | Next.js 14, standalone build, serves `/` |
| checkers-backend-1 | Docker container | internal port 3001 | Full NestJS — REST API + `/guest` + `/game` WebSocket namespaces |
| checkers-postgres-1 | Docker container | internal port 5432 | PostgreSQL 16, volume `pgdata` |
| checkers-redis-1 | Docker container | internal port 6379 | Redis 7 |

No service other than nginx is reachable from outside the server.

**Relay consolidated:** The separate relay container (`Dockerfile.guest`) has been removed. The full backend (`main.ts`) includes `GuestModule` and handles both the `/guest` namespace (standalone HTML client) and `/game` namespace (Next.js authenticated play) through the single backend service.

**Standalone HTML client** is still served at `https://chashki.duckdns.org/checkers-final.html` (static file bind-mount in nginx).

---

## Directory Layout

```
/opt/checkers/
├── .env                     secrets (DB creds, JWT secrets, Google OAuth keys)
│                            DB_SYNC=false after first-deploy schema creation
├── docker-compose.yml       5 services: postgres, redis, backend, frontend, nginx
├── backend/                 NestJS full backend source
│   ├── Dockerfile           multi-stage build, node:20-alpine
│   ├── src/
│   │   ├── main.ts          full bootstrap (REST + /guest + /game WebSocket)
│   │   ├── guest-main.ts    relay-only bootstrap (local dev only)
│   │   └── ...
│   └── package.json
├── frontend/                Next.js 14 source
│   ├── Dockerfile           3-stage build (deps → builder → runner), standalone output
│   ├── next.config.js       output: standalone, dev rewrites for /api/
│   └── src/
│       ├── app/             Pages: /, /auth/login, /auth/register, /dashboard, /leaderboard, /play/[id]
│       ├── middleware.ts     Route guard — protects /dashboard, /play, /profile, /history
│       ├── store/auth.store.ts  Zustand + persist (localStorage + cookie sync)
│       └── ...
└── nginx/
    ├── nginx.conf           HTTPS, /api/ → backend, /socket.io/ → backend, / → frontend
    └── html/
        └── checkers-final.html   standalone HTML client (served directly by nginx)
```

The `/var/www/html/` directory and the native nginx config at `/etc/nginx/sites-available/checkers` are no longer used.

---

## SSL Certificate

Issued by Let's Encrypt via certbot standalone mode. Lives on the host at `/etc/letsencrypt/live/chashki.duckdns.org/` and is bind-mounted read-only into the nginx container.

```bash
# Manual renewal (auto-renewal is set up by certbot)
certbot renew --pre-hook "docker compose -f /opt/checkers/docker-compose.yml stop nginx" \
              --post-hook "docker compose -f /opt/checkers/docker-compose.yml start nginx"
```

Certbot's systemd timer runs twice daily and handles renewal automatically when the cert is within 30 days of expiry.

---

## Nginx Configuration

The active config is `/opt/checkers/nginx/nginx.conf`, mounted into the Docker nginx container.

**Port 80** — redirects all traffic to HTTPS:
```nginx
server {
    listen 80;
    server_name chashki.duckdns.org;
    return 301 https://$host$request_uri;
}
```

**Port 443** — serves everything over TLS:
1. **Static files** from `/usr/share/nginx/html` (bind mount from `/opt/checkers/nginx/html/`)
2. **`/api/`** → backend:3001 via Docker internal DNS (lazy resolve)
3. **`/socket.io/`** → relay:3000 with WebSocket upgrade headers

The `set $backend_host` / `set $relay_host` pattern (with `resolver 127.0.0.11`) lets nginx start even if the upstream containers are still initializing.

SSL cert and key are mounted from `/etc/letsencrypt` on the host:
```nginx
ssl_certificate     /etc/letsencrypt/live/chashki.duckdns.org/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/chashki.duckdns.org/privkey.pem;
```

No nginx container rebuild is needed when updating only the HTML file — the `html/` directory is a bind mount.

---

## Updating the HTML Client

No Docker rebuild or restart required — the `html/` directory is a bind mount into the nginx container.

```bash
scp -i ~/.ssh/checkers_deploy \
  "C:/Users/valer/Desktop/checkers-final.html" \
  root@130.12.242.84:/opt/checkers/nginx/html/checkers-final.html
```

The new version is live immediately after the copy completes.

---

## Updating the Relay or Backend (Requires Docker Rebuild)

Copy the changed source files, then SSH in and rebuild only the affected service:

```bash
# Example: updating the guest gateway
scp -i ~/.ssh/checkers_deploy \
  backend/src/guest/guest.gateway.ts \
  root@130.12.242.84:/opt/checkers/backend/src/guest/

# Rebuild and restart only the relay service
ssh -i ~/.ssh/checkers_deploy root@130.12.242.84 \
  "cd /opt/checkers && docker compose up --build -d relay"

# Or rebuild everything
ssh -i ~/.ssh/checkers_deploy root@130.12.242.84 \
  "cd /opt/checkers && docker compose up --build -d"
```

The nginx and postgres containers continue running uninterrupted during a relay or backend rebuild.

---

## First-Deploy Schema Sync

On a fresh server with no existing database schema:

1. Set `DB_SYNC=true` in `/opt/checkers/.env`
2. Run `docker compose up -d` — TypeORM will auto-create all tables on startup
3. Verify the backend is healthy (`docker compose logs backend`)
4. Set `DB_SYNC=false` in `/opt/checkers/.env`
5. Run `docker compose up -d` again — backend restarts without schema modification

---

## Checking Status

```bash
ssh -i ~/.ssh/checkers_deploy root@130.12.242.84 \
  "cd /opt/checkers && docker compose ps"
```

All five services should show `Up`. Spot-check individual services:

```bash
# HTTP → HTTPS redirect
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://chashki.duckdns.org/
# Expected: 301 https://chashki.duckdns.org/

# HTTPS HTML client
curl -s -o /dev/null -w "%{http_code}" https://chashki.duckdns.org/checkers-final.html
# Expected: 200

# Backend health (401 = correct, no token supplied)
curl -s -o /dev/null -w "%{http_code}" https://chashki.duckdns.org/api/auth/me
# Expected: 401

# Leaderboard (public endpoint)
curl -s https://chashki.duckdns.org/api/users/leaderboard?limit=3
# Expected: JSON array

# Relay WebSocket handshake
curl -s 'https://chashki.duckdns.org/socket.io/?EIO=4&transport=polling' | head -c 60
# Expected: starts with 0{
```

---

## Common Deployment Notes

- **nginx is now in Docker.** The native nginx systemd service has been stopped and disabled. Do not re-enable it — it would conflict with the Docker container on ports 80/443.
- **HTTPS only.** All plaintext HTTP is redirected to HTTPS via the port 80 server block. Never send credentials or tokens over HTTP.
- **Internal services are not exposed.** The relay (3000), backend (3001), postgres (5432), and redis (6379) ports are only reachable between containers. Only nginx binds to `0.0.0.0:80` and `0.0.0.0:443`.
- **`DB_SYNC` must be `false` in normal operation.** Leaving it `true` risks dropping and recreating tables on every restart.
- **Restarting the relay clears in-memory rooms.** Active games are lost when the relay container restarts. The full backend and database are unaffected.
- **SSH key must be chmod 600** on the local machine or ssh will refuse to use it.
- **Secrets in `.env` are never committed to git.** The `.env` file lives only on the server at `/opt/checkers/.env`.
