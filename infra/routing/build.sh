#!/usr/bin/env bash
# Builds fresh OSRM and Valhalla data from REGION_PBF_URL into new folders,
# then swaps them in. Serving isn't touched until you recreate the containers
# (update.sh does both); the previous build is kept as data/*-old for a rollback.
set -euo pipefail
cd "$(dirname "$0")"
set -a
. ./.env
set +a

OSRM_IMAGE="${OSRM_IMAGE:-ghcr.io/project-osrm/osrm-backend:latest}"
VALHALLA_IMAGE="${VALHALLA_IMAGE:-ghcr.io/valhalla/valhalla-scripted:latest}"

mkdir -p data
echo "==> Downloading $REGION_PBF_URL"
curl -fL --retry 3 -o data/region.osm.pbf.part "$REGION_PBF_URL"
mv data/region.osm.pbf.part data/region.osm.pbf

echo "==> OSRM (car profile, MLD)"
rm -rf data/osrm-next
mkdir -p data/osrm-next
ln data/region.osm.pbf data/osrm-next/region.osm.pbf
osrm() { docker run --rm -v "$PWD/data/osrm-next:/data" "$OSRM_IMAGE" "$@"; }
osrm osrm-extract -p /opt/car.lua /data/region.osm.pbf
osrm osrm-partition /data/region.osrm
osrm osrm-customize /data/region.osrm
rm -f data/osrm-next/region.osm.pbf

echo "==> Valhalla tiles"
rm -rf data/valhalla-next
mkdir -p data/valhalla-next
ln data/region.osm.pbf data/valhalla-next/region.osm.pbf
# The image runs as uid 59999 and writes its config and tiles into the folder.
chown -R 59999:59999 data/valhalla-next 2>/dev/null || chmod -R a+rwX data/valhalla-next
docker run --rm -v "$PWD/data/valhalla-next:/custom_files" \
  -e serve_tiles=False \
  -e build_admins=True \
  -e build_time_zones=True \
  -e build_elevation=False \
  -e server_threads="${VALHALLA_THREADS:-8}" \
  "$VALHALLA_IMAGE"
rm -f data/valhalla-next/region.osm.pbf

echo "==> Swapping in the new data"
for d in osrm valhalla; do
  rm -rf "data/$d-old"
  if [ -d "data/$d" ]; then mv "data/$d" "data/$d-old"; fi
  mv "data/$d-next" "data/$d"
done
rm -f data/region.osm.pbf
echo "==> Built. Serve it with: docker compose up -d --force-recreate osrm valhalla"
