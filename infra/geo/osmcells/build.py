#!/usr/bin/env python3
"""Builds the cells database: what Blacktop asked the public Overpass servers for, out of the
server's own OpenStreetMap download, so it needs no Overpass database (300-400 GB for the world).

  python3 build.py region.osm.pbf cells.db [node-index]

Two things go in one SQLite file, each with a spatial index (SQLite's built-in R*Tree):

  roads   every road a vehicle uses, with its `maxspeed` (or the forward / backward one): the
          shared speed-limit map's cells (serve.py /speed, the app's CellFile, the same as
          supabase/functions/place-search/speedCells.ts writes from Overpass). Long roads are
          kept in pieces of up to 40 points, so a piece's box stays small.
  places  what the map's quick searches look for (fuel, charging, water, parking, coffee, food,
          shops, repairs, pharmacies, and anything open all day and night): serve.py /places,
          answered in Overpass's shape, so place-search reads it unchanged.

`node-index` is pyosmium's location store: `flex_mem` (the default) for a country, and
`dense_file_array,/path/nodes.bin` for a continent or the world (a file the size of the largest
node id times 8 bytes, so a few tens of GB for the planet). The database is written beside the
target and renamed over it at the end, so serve.py never sees half of one.
"""
import json
import math
import os
import sqlite3
import sys
import time
import zlib

import osmium

HIGHWAYS = {
    "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
    "tertiary", "tertiary_link", "unclassified", "residential", "living_street", "road",
}
# What the quick searches ask for (src/features/experience/lib/places.ts, place-search's SHOP_VALUES).
AMENITIES = {
    "fuel", "charging_station", "drinking_water", "parking", "motorcycle_parking", "bicycle_parking", "cafe",
    "restaurant", "fast_food", "pharmacy", "hospital", "bicycle_repair_station", "toilets", "convenience",
}
SHOPS = {"supermarket", "convenience", "bakery", "motorcycle", "car_repair", "tyres"}
# Tags a place keeps: what the app reads (names, hours, price signs, address lines).
KEEP = {
    "name", "brand", "operator", "opening_hours", "fee", "charge", "amenity", "shop", "addr:street",
    "addr:housenumber", "addr:city", "addr:postcode", "website", "phone", "socket:type2", "socket:ccs",
    "capacity", "motorcycle", "access",
}
PIECE = 40
COVER = 0.1


def is24(tags):
    hours = str(tags.get("opening_hours", "")).lower()
    return "24/7" in hours or "24 hours" in hours or "24h" in hours


class Handler(osmium.SimpleHandler):
    def __init__(self, db):
        super().__init__()
        self.db = db
        self.roads = 0
        self.places = 0
        self.batch = []
        self.pbatch = []
        # The 0.1-degree squares with roads in them: what the download covers (serve.py `covered`).
        self.cover = set()

    def flush(self):
        if self.batch:
            self.db.executemany("INSERT INTO roads(id, maxspeed, pts) VALUES (?, ?, ?)", [(i, m, p) for i, m, p, *_ in self.batch])
            self.db.executemany("INSERT INTO road_idx(id, minx, maxx, miny, maxy) VALUES (?, ?, ?, ?, ?)", [(i, *b) for i, _, _, *b in self.batch])
            self.batch = []
        if self.pbatch:
            self.db.executemany("INSERT INTO places(id, osm, kind, value, h24, lat, lon, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [r[:8] for r in self.pbatch])
            self.db.executemany("INSERT INTO place_idx(id, minx, maxx, miny, maxy) VALUES (?, ?, ?, ?, ?)", [(r[0], r[6], r[6], r[5], r[5]) for r in self.pbatch])
            self.pbatch = []

    def place(self, osm, tags, lat, lon):
        amenity, shop = tags.get("amenity"), tags.get("shop")
        h24 = is24(tags)
        if amenity in AMENITIES:
            kind, value = "amenity", amenity
        elif shop in SHOPS:
            kind, value = "shop", shop
        elif h24 and (shop or amenity in ("fuel", "convenience")):
            kind, value = ("shop", shop) if shop else ("amenity", amenity)
        else:
            return
        self.places += 1
        kept = {k: v for k, v in tags.items() if k in KEEP or k.startswith("addr:")}
        self.pbatch.append((self.places, osm, kind, value, 1 if h24 else 0, round(lat, 6), round(lon, 6), json.dumps(kept, ensure_ascii=False)))
        if len(self.pbatch) >= 5000:
            self.flush()

    def node(self, n):
        if "amenity" in n.tags or "shop" in n.tags:
            self.place(f"n{n.id}", dict(n.tags), n.location.lat, n.location.lon)

    def way(self, w):
        tags = w.tags
        try:
            pts = [(n.location.lon, n.location.lat) for n in w.nodes if n.location.valid()]
        except osmium.InvalidLocationError:
            return
        if len(pts) < 2:
            return
        if tags.get("highway") in HIGHWAYS:
            raw = tags.get("maxspeed") or tags.get("maxspeed:forward") or tags.get("maxspeed:backward")
            maxspeed = str(raw)[:40] if raw else None
            # In pieces that overlap by a point, so a road's line stays whole across them.
            for start in range(0, len(pts) - 1, PIECE - 1):
                piece = pts[start:start + PIECE]
                if len(piece) < 2:
                    continue
                self.roads += 1
                for x, y in piece:
                    self.cover.add((math.floor(y / COVER), math.floor(x / COVER)))
                xs = [p[0] for p in piece]
                ys = [p[1] for p in piece]
                packed = zlib.compress(json.dumps([[round(x, 6), round(y, 6)] for x, y in piece]).encode(), 6)
                self.batch.append((self.roads, maxspeed, packed, min(xs), max(xs), min(ys), max(ys)))
            if len(self.batch) >= 5000:
                self.flush()
        elif "amenity" in tags or "shop" in tags:
            # An area (most supermarkets, many fuel stations): its middle.
            lon = sum(p[0] for p in pts) / len(pts)
            lat = sum(p[1] for p in pts) / len(pts)
            self.place(f"w{w.id}", dict(tags), lat, lon)


def main(pbf, target, index="flex_mem"):
    tmp = target + ".next"
    if os.path.exists(tmp):
        os.remove(tmp)
    db = sqlite3.connect(tmp)
    db.executescript(
        """
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE roads (id INTEGER PRIMARY KEY, maxspeed TEXT, pts BLOB);
        CREATE VIRTUAL TABLE road_idx USING rtree(id, minx, maxx, miny, maxy);
        CREATE TABLE places (id INTEGER PRIMARY KEY, osm TEXT, kind TEXT, value TEXT, h24 INTEGER, lat REAL, lon REAL, tags TEXT);
        CREATE TABLE cover (r INTEGER, c INTEGER, PRIMARY KEY (r, c)) WITHOUT ROWID;
        CREATE VIRTUAL TABLE place_idx USING rtree(id, minx, maxx, miny, maxy);
        """
    )
    started = time.time()
    h = Handler(db)
    h.apply_file(pbf, locations=True, idx=index)
    h.flush()
    db.executemany("INSERT INTO cover(r, c) VALUES (?, ?)", sorted(h.cover))
    db.execute("CREATE INDEX places_kind ON places(kind, value)")
    db.executemany(
        "INSERT INTO meta(key, value) VALUES (?, ?)",
        [("built", str(int(time.time() * 1000))), ("source", os.path.basename(pbf)), ("roads", str(h.roads)), ("places", str(h.places))],
    )
    db.commit()
    db.close()
    os.replace(tmp, target)
    print(f"{target}: {h.roads} road pieces, {h.places} places in {time.time() - started:.0f} s")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "flex_mem")
