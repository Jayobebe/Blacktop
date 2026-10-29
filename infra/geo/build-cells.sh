#!/usr/bin/env bash
# The cells database (osmcells/): every road's speed limit and the places the map's quick searches
# look for, cut out of the same OpenStreetMap download the routing tiles are built from. It's what
# Blacktop asked the public Overpass servers for (the shared speed-limit map's cells, fuel / coffee /
# parking near the rider), with no Overpass database to run.
#
#   ./build-cells.sh path/to/region.osm.pbf
#
# build-valhalla.sh calls it with its own download (when GEO_SERVICES lists cells). It writes a new
# database beside the live one and swaps it in; the cells service picks it up on its next request,
# so there's nothing to restart. The previous one is kept as data/cells/cells-old.db.
set -euo pipefail
cd "$(dirname "$0")"
PBF="${1:?Usage: ./build-cells.sh path/to/region.osm.pbf}"
IN="$(cd "$(dirname "$PBF")" && pwd)"
NAME="$(basename "$PBF")"
mkdir -p data/cells
docker build -q -t blacktop-cells osmcells >/dev/null

echo "==> Picking roads and places out of $PBF"
# Only what build.py keeps (C++, minutes for the planet), so the Python pass sees a fraction of it.
docker run --rm -v "$IN:/in:ro" -v "$PWD/data/cells:/data" blacktop-cells \
  osmium tags-filter "/in/$NAME" \
  w/highway=motorway,motorway_link,trunk,trunk_link,primary,primary_link,secondary,secondary_link,tertiary,tertiary_link,unclassified,residential,living_street,road \
  nw/amenity nw/shop \
  -o /data/filtered.osm.pbf --overwrite

# A country fits in memory; a continent or the planet keeps node positions in a file instead.
SIZE=$(stat -c %s data/cells/filtered.osm.pbf)
INDEX=flex_mem
if [ "$SIZE" -gt 2000000000 ]; then INDEX=sparse_file_array,/data/nodes.bin; fi

echo "==> Building the database ($INDEX)"
docker run --rm -v "$PWD/data/cells:/data" blacktop-cells \
  python3 build.py /data/filtered.osm.pbf /data/cells-new.db "$INDEX"
rm -f data/cells/filtered.osm.pbf data/cells/nodes.bin

if [ -f data/cells/cells.db ]; then cp -f data/cells/cells.db data/cells/cells-old.db; fi
mv -f data/cells/cells-new.db data/cells/cells.db
echo "==> Done: data/cells/cells.db (served at /cells)"
