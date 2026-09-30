#!/usr/bin/env bash
# Builds fresh OSRM data (car profile, MLD) from REGION_PBF_URL into a new
# folder, then swaps it in. Serving isn't touched until the container is
# recreated (update.sh does both); the previous build is kept as data/osrm-old
# for a rollback until the next build.
set -euo pipefail
cd "$(dirname "$0")"
set -a
. ./.env
set +a

OSRM_IMAGE="${OSRM_IMAGE:-ghcr.io/project-osrm/osrm-backend:latest}"

mkdir -p data
# Last week's rollback copy goes first, so only two copies exist at any time.
rm -rf data/osrm-old data/osrm-next
mkdir -p data/osrm-next
echo "==> Downloading $REGION_PBF_URL"
curl -fL --retry 3 -o data/osrm-next/region.osm.pbf "$REGION_PBF_URL"

echo "==> Building (the planet needs a lot of memory; see README.md)"
osrm() { docker run --rm -v "$PWD/data/osrm-next:/data" "$OSRM_IMAGE" "$@"; }
osrm osrm-extract -p /opt/car.lua /data/region.osm.pbf
osrm osrm-partition /data/region.osrm
osrm osrm-customize /data/region.osrm
rm -f data/osrm-next/region.osm.pbf

echo "==> Swapping in the new data"
if [ -d data/osrm ]; then mv data/osrm data/osrm-old; fi
mv data/osrm-next data/osrm
echo "==> Built. Serve it with: docker compose up -d --force-recreate osrm"
