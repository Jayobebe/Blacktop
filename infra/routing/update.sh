#!/usr/bin/env bash
# Weekly refresh (cron): new OpenStreetMap data for both routers, then a quick
# restart onto it. place-search falls back to the public servers for the few
# seconds the containers take to come back.
set -euo pipefail
cd "$(dirname "$0")"
echo "==> $(date -u) routing update"
./build.sh
docker compose up -d --force-recreate osrm valhalla
echo "==> $(date -u) done"
