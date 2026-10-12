#!/usr/bin/env bash
# "docker compose", for the services GEO_SERVICES (.env) lists and no others:
#   ./compose.sh up -d        ./compose.sh logs -f valhalla        ./compose.sh ps
# Caddy always runs. spots isn't a container (Caddy serves its files).
set -euo pipefail
cd "$(dirname "$0")"
set -a
. ./.env
set +a
export COMPOSE_PROFILES="${GEO_SERVICES// /}"
exec docker compose "$@"
