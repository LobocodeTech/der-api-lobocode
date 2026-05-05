#!/bin/bash
set -euo pipefail

# Postgres + Redis + MinIO (docker/docker-compose.database.yml). Variáveis só no .env.

ENV_FILE="${ENV_FILE:-.env}"
if [ -f "${ENV_FILE}" ]; then
  set -a
  # Suporta .env com final de linha CRLF (Windows) sem quebrar no Bash.
  # shellcheck disable=SC1090
  . <(sed 's/\r$//' "${ENV_FILE}")
  set +a
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker/docker-compose.database.yml}"
WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-90}"

require_var() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Defina ${name} no ${ENV_FILE}"
    exit 1
  fi
}

require_var COMPOSE_DATABASE_PROJECT_NAME
require_var DOCKER_NETWORK_NAME
require_var DB_CONTAINER_NAME
require_var REDIS_CONTAINER_NAME
require_var MINIO_CONTAINER_NAME
require_var POSTGRES_VOLUME_NAME
require_var REDIS_VOLUME_NAME
require_var MINIO_VOLUME_NAME
require_var DB_HOST_PORT
require_var REDIS_HOST_PORT
require_var MINIO_API_HOST_PORT
require_var MINIO_CONSOLE_HOST_PORT

if [ "$#" -gt 0 ]; then
  SERVICES=("$@")
else
  SERVICES=("db" "redis" "minio")
fi

echo "Subindo serviços: ${SERVICES[*]}..."

if ! docker info >/dev/null 2>&1; then
  echo "Docker não está rodando."
  exit 1
fi

check_port_conflict() {
  local port="$1"
  local service_name="$2"
  local expected_container="$3"
  local docker_conflict
  local external_conflict
  docker_conflict="$(docker ps --format '{{.Names}} {{.Ports}}' | grep -E "0\\.0\\.0\\.0:${port}->|\\[::\\]:${port}->" || true)"
  if [ -n "${docker_conflict}" ]; then
    external_conflict="$(echo "${docker_conflict}" | grep -v "^${expected_container} " || true)"
    if [ -z "${external_conflict}" ]; then
      echo "Porta ${port} já em uso por ${expected_container}. OK."
      return 0
    fi
    echo "Porta ${port} em uso (${service_name}):"
    echo "${external_conflict}"
    exit 1
  fi
}

contains_service() {
  local target="$1"
  shift
  for service in "$@"; do
    if [ "${service}" = "${target}" ]; then
      return 0
    fi
  done
  return 1
}

if contains_service "db" "${SERVICES[@]}"; then
  check_port_conflict "${DB_HOST_PORT}" "PostgreSQL" "${DB_CONTAINER_NAME}"
fi
if contains_service "redis" "${SERVICES[@]}"; then
  check_port_conflict "${REDIS_HOST_PORT}" "Redis" "${REDIS_CONTAINER_NAME}"
fi
if contains_service "minio" "${SERVICES[@]}"; then
  check_port_conflict "${MINIO_API_HOST_PORT}" "MinIO API" "${MINIO_CONTAINER_NAME}"
  check_port_conflict "${MINIO_CONSOLE_HOST_PORT}" "MinIO Console" "${MINIO_CONTAINER_NAME}"
fi

if ! docker network ls --format '{{.Name}}' | grep -Fxq "${DOCKER_NETWORK_NAME}"; then
  echo "Criando rede: ${DOCKER_NETWORK_NAME}"
  docker network create --driver bridge "${DOCKER_NETWORK_NAME}" >/dev/null
fi

if contains_service "db" "${SERVICES[@]}"; then
  if ! docker volume inspect "${POSTGRES_VOLUME_NAME}" >/dev/null 2>&1; then
    echo "Criando volume externo: ${POSTGRES_VOLUME_NAME}"
    docker volume create "${POSTGRES_VOLUME_NAME}" >/dev/null
  fi
fi

echo "docker compose up -d ${SERVICES[*]}..."
docker compose -p "${COMPOSE_DATABASE_PROJECT_NAME}" -f "${COMPOSE_FILE}" up -d "${SERVICES[@]}"

if contains_service "db" "${SERVICES[@]}"; then
  echo "Aguardando PostgreSQL healthy..."
  start_time="$(date +%s)"
  while true; do
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "${DB_CONTAINER_NAME}" 2>/dev/null || echo "missing")"
    if [ "${health}" = "healthy" ]; then
      break
    fi
    now="$(date +%s)"
    elapsed="$((now - start_time))"
    if [ "${elapsed}" -ge "${WAIT_TIMEOUT_SECONDS}" ]; then
      echo "Timeout aguardando PostgreSQL."
      docker compose -p "${COMPOSE_DATABASE_PROJECT_NAME}" -f "${COMPOSE_FILE}" ps
      exit 1
    fi
    sleep 2
  done
fi

echo "Status:"
docker compose -p "${COMPOSE_DATABASE_PROJECT_NAME}" -f "${COMPOSE_FILE}" ps
echo ""
echo "PostgreSQL: localhost:${DB_HOST_PORT} | Redis: localhost:${REDIS_HOST_PORT}"
echo "MinIO: http://localhost:${MINIO_API_HOST_PORT} | Console: http://localhost:${MINIO_CONSOLE_HOST_PORT}"
