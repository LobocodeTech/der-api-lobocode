# Docker (aplicação + banco)

**API (Nest):** `.env` na **raiz** do repositório — veja `.env.example`.

**Traefik (gateway da VPS):** pasta **`traefik/`** na raiz — não misture env do proxy com o `.env` do app.

| Arquivo | Uso |
|---------|-----|
| `Dockerfile.prod` | Build do backend em produção |
| `Dockerfile.dev` | Desenvolvimento local |
| `docker-compose.database.yml` | PostgreSQL + Redis + MinIO |
| `docker-compose.minio-traefik.yml` | Overlay **só na VPS**: proxy HTTPS `Host(APP_HOST)` + prefixo `/files/<bucket>/` → MinIO (use com `COMPOSE_FILE_EXTRA`; ver `scripts/start-database.sh`) |
| `docker-compose.vps-app.yml` | Backend com labels Traefik |
| `postgres-entrypoint.sh` | Entrada do Postgres |
| `docker-entrypoint.sh` | Antes do Nest: `prisma migrate deploy`. Seed conforme projeto (`prisma db seed` / script). `SKIP_PRISMA_MIGRATE=1` só para debug. |

Fluxo típico: `traefik/.env.gateway` → `./scripts/deploy.sh vps-gateway` → `COMPOSE_FILE_EXTRA=docker/docker-compose.minio-traefik.yml ./scripts/deploy.sh database` → `./scripts/deploy.sh vps-app`.

**Produção — link público dos arquivos (bucket path-style):** `https://<APP_HOST>/files/<MINIO_BUCKET_NAME>/...` (ex.: prefixo `companies/<id>/...`). O `docker-compose.vps-app.yml` força `MINIO_PUBLIC_ENDPOINT` e endpoint interno para o container MinIO na rede Docker. Sem o overlay `minio-traefik`, o próprio Nest ainda atende `GET /files/...` via middleware. Com o overlay, o Traefik encaminha ao MinIO com `passHostHeader=false` para evitar falhas de roteamento S3.

Documentação multi-projeto: `scripts/vps/VPS_MULTI_PROJECT.md`.
