#!/bin/bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

COMPOSE_FILE="${VPS_APP_COMPOSE_FILE:-docker/docker-compose.vps-app.yml}"
TRAEFIK_NETWORK="${TRAEFIK_NETWORK:-}"
APP_HOST="${APP_HOST:-}"
APP_HOST_EXAMPLE="${APP_HOST_EXAMPLE:-api.exemplo.com}"
AUTO_DB_SYNC_ON_DEPLOY="${AUTO_DB_SYNC_ON_DEPLOY:-${AUTO_DB_INIT_ON_DEPLOY:-true}}"

if [ -z "${COMPOSE_VPS_STACK_NAME:-}" ]; then
  echo "Defina COMPOSE_VPS_STACK_NAME no ${ENV_FILE}"
  exit 1
fi

echo "Subindo app no modo VPS multi-projeto..."

if [ ! -f "${COMPOSE_FILE}" ]; then
  echo "Arquivo ${COMPOSE_FILE} não encontrado."
  exit 1
fi

if [ -z "${APP_HOST}" ]; then
  echo "Defina APP_HOST no ${ENV_FILE}"
  echo "Exemplo: APP_HOST=${APP_HOST_EXAMPLE}"
  exit 1
fi

if [ -z "${TRAEFIK_NETWORK}" ]; then
  echo "Defina TRAEFIK_NETWORK no ${ENV_FILE}"
  exit 1
fi

if ! docker network ls --format '{{.Name}}' | grep -Fxq "${TRAEFIK_NETWORK}"; then
  echo "Rede compartilhada ${TRAEFIK_NETWORK} não existe."
  echo "Suba o gateway primeiro: ./scripts/deploy.sh vps-gateway"
  exit 1
fi

if [ -z "${DOCKER_NETWORK_NAME:-}" ]; then
  echo "Defina DOCKER_NETWORK_NAME no ${ENV_FILE} (mesma rede do stack database)."
  exit 1
fi

if ! docker network ls --format '{{.Name}}' | grep -Fxq "${DOCKER_NETWORK_NAME}"; then
  echo "Criando rede ${DOCKER_NETWORK_NAME}..."
  docker network create --driver bridge "${DOCKER_NETWORK_NAME}" >/dev/null
  echo "Suba Postgres/Redis/MinIO na mesma rede: ./scripts/deploy.sh database"
fi

echo "Validando compose da aplicação..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" config >/dev/null

echo "Iniciando stack ${COMPOSE_VPS_STACK_NAME}..."
docker compose --env-file "${ENV_FILE}" -p "${COMPOSE_VPS_STACK_NAME}" -f "${COMPOSE_FILE}" up -d --build
if [ "${AUTO_DB_SYNC_ON_DEPLOY}" = "true" ]; then
  echo "Sincronizando banco (generate + migrate/push + seed)..."
  ./scripts/vps/seed-database.sh
else
  echo "AUTO_DB_SYNC_ON_DEPLOY=false: sincronização de banco ignorada."
fi

echo ""
echo "Stack da aplicação iniciada."
echo "Domínio roteado: ${APP_HOST}"
if [ -n "${MINIO_BUCKET_NAME:-}" ]; then
  echo "MinIO (URLs públicas de objeto): https://${APP_HOST}/files/${MINIO_BUCKET_NAME}/<caminho-do-objeto>"
fi
echo "Verifique: docker compose --env-file \"${ENV_FILE}\" -p ${COMPOSE_VPS_STACK_NAME} -f ${COMPOSE_FILE} ps"
