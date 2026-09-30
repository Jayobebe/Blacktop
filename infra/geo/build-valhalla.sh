#!/usr/bin/env bash
# Builds fresh Valhalla routing tiles from REGION_PBF_URL into a new folder,
# raises the service limits Blacktop needs, then swaps it in. Serving isn't
# touched until the container is recreated (update.sh does both); the previous
# build is kept as data/valhalla-old for a rollback.
set -euo pipefail
cd "$(dirname "$0")"
set -a
. ./.env
set +a

VALHALLA_IMAGE="${VALHALLA_IMAGE:-ghcr.io/valhalla/valhalla-scripted:latest}"

mkdir -p data
# Last week's rollback copy goes first, so only two copies exist at any time.
rm -rf data/valhalla-old data/valhalla-next
mkdir -p data/valhalla-next
echo "==> Downloading $REGION_PBF_URL"
curl -fL --retry 3 -o data/valhalla-next/region.osm.pbf "$REGION_PBF_URL"

echo "==> Building tiles (the planet takes most of a day)"
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

echo "==> Raising service limits"
# Long rides (motorcycle and car routes up to 5,000 km, bikes 500 km) and
# road data for whole routes and loops (trace_attributes up to 1,000 km).
python3 - data/valhalla-next/valhalla.json <<'PY'
import json, sys
path = sys.argv[1]
cfg = json.load(open(path))
limits = cfg["service_limits"]
for costing, metres in (("auto", 5_000_000), ("motorcycle", 5_000_000), ("bicycle", 500_000)):
    limits.setdefault(costing, {})
    limits[costing]["max_distance"] = max(limits[costing].get("max_distance", 0), metres)
    limits[costing]["max_locations"] = max(limits[costing].get("max_locations", 0), 25)
trace = limits.setdefault("trace", {})
trace["max_distance"] = max(trace.get("max_distance", 0), 1_000_000)
trace["max_shape"] = max(trace.get("max_shape", 0), 100_000)
json.dump(cfg, open(path, "w"), indent=2)
PY

echo "==> Swapping in the new tiles"
if [ -d data/valhalla ]; then mv data/valhalla data/valhalla-old; fi
mv data/valhalla-next data/valhalla
echo "==> Built. Serve it with: docker compose up -d --force-recreate valhalla"
