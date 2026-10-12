#!/usr/bin/env python3
"""Cuts speed cameras and scenic spots into small files by map cell.

Reads OpenStreetMap nodes as line-delimited GeoJSON on stdin (what
`osmium export -f geojsonseq` writes) and writes, under the folder given:

  cameras/<row>/<column>.json   half-degree cells: the objects the app shows
                                ({id, lat, lng, type, direction, maxspeed})
  scenic/<row>/<column>.json    one-degree cells: [lon, lat, name] rows
  ready.json                    when it was built and how much is in it

Rows and columns count cells from the south-west corner of the world, the
same sum `place-search` does (ownSpots): keep the two in step. A cell with
nothing in it gets no file. What counts as a camera or a scenic spot is what
`place-search` asked Overpass for before this existed.
"""
import json
import math
import os
import sys
import time

CAMERA_CELL = 0.5
SCENIC_CELL = 1.0


def cell(lat, lon, size):
    row = math.floor((max(-90.0, min(89.999, lat)) + 90.0) / size)
    col = math.floor((max(-180.0, min(179.999, lon)) + 180.0) / size)
    return row, col


def camera(tags):
    """speed / alpr / surveillance, or None when it isn't one the app shows."""
    if tags.get("highway") == "speed_camera":
        return "speed"
    if tags.get("man_made") != "surveillance":
        return None
    kind = str(tags.get("surveillance:type", "")).lower()
    if "alpr" in kind or "anpr" in kind:
        return "alpr"
    if tags.get("surveillance:zone") == "traffic":
        return "surveillance"
    return None


def scenic(tags):
    if tags.get("tourism") == "viewpoint" or tags.get("waterway") == "waterfall" or tags.get("mountain_pass") == "yes":
        return True
    return tags.get("natural") == "peak" and bool(tags.get("name"))


def main(out):
    cameras, spots = {}, {}
    seen = 0
    for line in sys.stdin:
        line = line.strip().lstrip("\x1e")
        if not line:
            continue
        try:
            feature = json.loads(line)
        except ValueError:
            continue
        geometry = feature.get("geometry") or {}
        if geometry.get("type") != "Point":
            continue
        lon, lat = geometry["coordinates"][:2]
        tags = feature.get("properties") or {}
        seen += 1
        kind = camera(tags)
        if kind:
            # osmium's id is "n123"; the app only needs it to be unique.
            ident = str(feature.get("id", "")).lstrip("n") or f"{lat:.6f},{lon:.6f}"
            cameras.setdefault(cell(lat, lon, CAMERA_CELL), []).append(
                {"id": ident, "lat": round(lat, 6), "lng": round(lon, 6), "type": kind, "direction": tags.get("direction"), "maxspeed": tags.get("maxspeed")}
            )
        if scenic(tags):
            name = tags.get("name") or tags.get("name:en") or ""
            spots.setdefault(cell(lat, lon, SCENIC_CELL), []).append([round(lon, 5), round(lat, 5), name])

    for folder, cells in (("cameras", cameras), ("scenic", spots)):
        for (row, col), rows in cells.items():
            os.makedirs(os.path.join(out, folder, str(row)), exist_ok=True)
            with open(os.path.join(out, folder, str(row), f"{col}.json"), "w", encoding="utf-8") as f:
                json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    counts = {"cameras": sum(len(v) for v in cameras.values()), "scenic": sum(len(v) for v in spots.values())}
    with open(os.path.join(out, "ready.json"), "w", encoding="utf-8") as f:
        json.dump({"built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **counts, "cameraCells": len(cameras), "scenicCells": len(spots)}, f)
    print(f"{seen} nodes read: {counts['cameras']} cameras in {len(cameras)} cells, {counts['scenic']} scenic spots in {len(spots)} cells")
    # An extract with nothing in it is a broken build, not an empty world: don't let it replace a good one.
    if counts["cameras"] == 0 and counts["scenic"] == 0:
        sys.exit("nothing found: not swapping it in")


if __name__ == "__main__":
    main(sys.argv[1])
