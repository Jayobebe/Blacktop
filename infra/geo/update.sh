#!/usr/bin/env bash
# Weekly refresh (cron). Overpass and the weather keep themselves current; this
# rebuilds the routing tiles and the search index from fresh OpenStreetMap data
# beside the live copies, then restarts each onto its new data (seconds, covered
# by the Edge Functions' fallback to the public servers).
set -euo pipefail
cd "$(dirname "$0")"
echo "==> $(date -u) geo update"
./build-valhalla.sh
docker compose up -d --force-recreate valhalla
./build-osrm.sh
docker compose up -d --force-recreate osrm
./get-photon.sh
docker compose up -d --force-recreate photon
echo "==> $(date -u) done"
