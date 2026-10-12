#!/usr/bin/env bash
# Speed cameras and scenic spots, cut out of the same OpenStreetMap download
# the routing tiles are built from, as small files by map cell (see spots.py).
# This is what Blacktop asked Overpass for; with it there's no need to run an
# Overpass database (300-400 GB for the world) just for these two things.
#
#   ./build-spots.sh path/to/region.osm.pbf
#
# build-valhalla.sh calls it with its own download before deleting it, so the
# weekly update refreshes both from one file. It builds into a new folder and
# swaps it in; Caddy serves the folder as it is, so there's nothing to restart.
# The previous extract is kept as data/spots-old.
set -euo pipefail
cd "$(dirname "$0")"
PBF="${1:?Usage: ./build-spots.sh path/to/region.osm.pbf}"
command -v osmium >/dev/null || { echo "osmium isn't installed: apt-get install -y osmium-tool"; exit 1; }

mkdir -p data
rm -rf data/spots-next
mkdir -p data/spots-next
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Picking cameras and scenic spots out of $PBF"
# Nodes only. A little more than is kept (every surveillance node, every peak):
# spots.py makes the final choice, the same one place-search made with Overpass.
osmium tags-filter "$PBF" \
  n/highway=speed_camera n/man_made=surveillance \
  n/tourism=viewpoint n/natural=peak n/waterway=waterfall n/mountain_pass=yes \
  -o "$TMP/spots.osm.pbf" --overwrite

echo "==> Cutting them into cells"
osmium export "$TMP/spots.osm.pbf" -f geojsonseq -x print_record_separator=false --add-unique-id=type_id --geometry-types=point -o - \
  | python3 spots.py data/spots-next

rm -rf data/spots-old
if [ -d data/spots ]; then mv data/spots data/spots-old; fi
mv data/spots-next data/spots
echo "==> Done: data/spots (Caddy serves it at /spots)"
