#!/usr/bin/env bash
# Weekly refresh (cron). Overpass and the weather keep themselves current; this
# rebuilds what GEO_SERVICES (.env) lists of the routing tiles, the cameras and
# scenic spots (with the routing tiles, from the same download) and the search
# index, from fresh OpenStreetMap data beside the live copies, then restarts
# each onto its new data (seconds, covered by the Edge Functions' fallback to
# the public servers).
set -euo pipefail
cd "$(dirname "$0")"
set -a
. ./.env
set +a
has() { case ",${GEO_SERVICES// /}," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
echo "==> $(date -u) geo update (${GEO_SERVICES})"
if has valhalla; then
  ./build-valhalla.sh
  ./compose.sh up -d --force-recreate valhalla
fi
if has osrm; then
  ./build-osrm.sh
  ./compose.sh up -d --force-recreate osrm
fi
if has photon; then
  ./get-photon.sh
  ./compose.sh up -d --force-recreate photon
fi
echo "==> $(date -u) done"
