# Mock de configuração para 3 projetos (mesmo repositório)

Este guia mostra como subir **3 projetos diferentes** usando o **mesmo código** apenas para teste, mudando variáveis de ambiente por projeto.

## Regra geral

- Suba o gateway **uma única vez** na VPS.
- Para cada projeto, use um arquivo de ambiente diferente (`ENV_FILE=...`) e rode `vps-app`.
- O isolamento entre projetos acontece por `VPS_APP_PROJECT_NAME` (stack Docker).

## 1) Subir gateway (uma vez)

```bash
./scripts/deploy.sh vps-gateway
```

## 2) Variáveis mínimas que você precisa mudar por projeto

As principais:

- `VPS_APP_PROJECT_NAME` (nome único da stack)
- `APP_HOST` (domínio/subdomínio único)

Recomendado também separar:

- `DB_NAME`
- `DB_PASSWORD`
- `JWT_SECRET`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`

## 3) Criar 3 arquivos de ambiente mock

### `.env.der`

```env
VPS_APP_PROJECT_NAME=der-hml
APP_HOST=api.der.hml.seudominio.com
APP_PORT=3000

DB_NAME=der_db
DB_USER=postgres
DB_PASSWORD=der_pass_123
JWT_SECRET=der_jwt_secret

MINIO_ROOT_USER=der_minio
MINIO_ROOT_PASSWORD=der_minio_pass

TRAEFIK_NETWORK=reverse-proxy
VPS_APP_COMPOSE_FILE=docker/docker-compose.vps-app.yml
```

### `.env.template_lobocode`

```env
VPS_APP_PROJECT_NAME=template_lobocode-hml
APP_HOST=api.template_lobocode.hml.seudominio.com
APP_PORT=3000

DB_NAME=template_lobocode_db
DB_USER=postgres
DB_PASSWORD=template_lobocode_pass_123
JWT_SECRET=template_lobocode_jwt_secret

MINIO_ROOT_USER=template_lobocode_minio
MINIO_ROOT_PASSWORD=template_lobocode_minio_pass

TRAEFIK_NETWORK=reverse-proxy
VPS_APP_COMPOSE_FILE=docker/docker-compose.vps-app.yml
```

### `.env.itamoving`

```env
VPS_APP_PROJECT_NAME=itamoving-hml
APP_HOST=api.itamoving.hml.seudominio.com
APP_PORT=3000

DB_NAME=itamoving_db
DB_USER=postgres
DB_PASSWORD=itamoving_pass_123
JWT_SECRET=itamoving_jwt_secret

MINIO_ROOT_USER=itamoving_minio
MINIO_ROOT_PASSWORD=itamoving_minio_pass

TRAEFIK_NETWORK=reverse-proxy
VPS_APP_COMPOSE_FILE=docker/docker-compose.vps-app.yml
```

## 4) Deploy de cada projeto (mesmo repositório)

```bash
ENV_FILE=.env.der ./scripts/deploy.sh vps-app
ENV_FILE=.env.template_lobocode ./scripts/deploy.sh vps-app
ENV_FILE=.env.itamoving ./scripts/deploy.sh vps-app
```

## 5) Verificar se os 3 stacks subiram

```bash
docker compose -p der-hml -f docker/docker-compose.vps-app.yml ps
docker compose -p template_lobocode-hml -f docker/docker-compose.vps-app.yml ps
docker compose -p itamoving-hml -f docker/docker-compose.vps-app.yml ps
```

## 6) Observações

- Todos os projetos podem usar `APP_PORT=3000` internamente.
- O acesso externo é por domínio (`APP_HOST`) via gateway.
- Se quiser atualizar só backend de um projeto:

```bash
ENV_FILE=.env.der ./scripts/deploy.sh vps-backend
```

