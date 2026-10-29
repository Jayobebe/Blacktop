#!/usr/bin/env python3
"""Answers from the cells database (build.py), in Overpass's shape, so place-search reads both the same.

  python3 serve.py /data/cells.db [port]          (8090 by default; Caddy puts it at /cells)

  GET /roads?south=&west=&north=&east=        the roads in a box (at most 0.05 degrees a side), each
                                              {type: "way", tags: {maxspeed}, geometry: [{lat, lon}]}:
                                              place-search's encodeCell makes the speed-limit cell
  GET /places?lat=&lon=&radius_m=&amenities=fuel,cafe&filter24h=1&limit=
                                              the nearest places of those kinds (or open all day and
                                              night), {type, id, lat, lon, tags}, nearest first
  GET /ready                                  when it was built, and what from

An area the download doesn't cover answers 404 "outside", never an empty list: an empty one would be
stored as "no roads here" for a month. Covered means the 0.1-degree square round the point has roads
in it (`cover`). The database is opened read-only and reopened when build.py swaps in a new one.
Standard library only.
"""
import json
import math
import os
import sqlite3
import sys
import threading
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

DB = sys.argv[1] if len(sys.argv) > 1 else "/data/cells.db"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8090
COVER = 0.1
MAX_SIDE = 0.05

local = threading.local()


def db():
    """This thread's connection, reopened when the file has been replaced."""
    try:
        stamp = os.stat(DB).st_mtime_ns
    except FileNotFoundError:
        return None
    conn = getattr(local, "conn", None)
    if conn is None or local.stamp != stamp:
        if conn is not None:
            conn.close()
        local.conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, check_same_thread=False)
        local.stamp = stamp
    return local.conn


def covered(conn, lat, lon):
    r, c = math.floor(lat / COVER), math.floor(lon / COVER)
    return conn.execute("SELECT 1 FROM cover WHERE r = ? AND c = ?", (r, c)).fetchone() is not None


def num(q, key, lo, hi):
    v = float(q[key][0])
    if not math.isfinite(v) or v < lo or v > hi:
        raise ValueError(key)
    return v


def roads(conn, q):
    s, w = num(q, "south", -90, 90), num(q, "west", -180, 180)
    n, e = num(q, "north", -90, 90), num(q, "east", -180, 180)
    if not (s < n and w < e and n - s <= MAX_SIDE and e - w <= MAX_SIDE):
        raise ValueError("box")
    if not covered(conn, (s + n) / 2, (w + e) / 2):
        return None
    rows = conn.execute(
        "SELECT r.maxspeed, r.pts FROM road_idx i JOIN roads r ON r.id = i.id WHERE i.maxx >= ? AND i.minx <= ? AND i.maxy >= ? AND i.miny <= ?",
        (w, e, s, n),
    )
    out = []
    for maxspeed, packed in rows:
        pts = json.loads(zlib.decompress(packed))
        out.append({"type": "way", "tags": {"maxspeed": maxspeed} if maxspeed else {}, "geometry": [{"lat": y, "lon": x} for x, y in pts]})
    return out


def distance_m(lat1, lon1, lat2, lon2):
    rad = math.pi / 180
    x = (lon2 - lon1) * rad * math.cos((lat1 + lat2) / 2 * rad)
    return math.hypot(x, (lat2 - lat1) * rad) * 6371000


def places(conn, q):
    lat, lon = num(q, "lat", -90, 90), num(q, "lon", -180, 180)
    radius = max(1000.0, min(50000.0, float(q.get("radius_m", ["30000"])[0])))
    limit = max(1, min(100, int(q.get("limit", ["60"])[0])))
    h24 = q.get("filter24h", ["0"])[0] in ("1", "true")
    wanted = [a for a in ",".join(q.get("amenities", [""])).split(",") if a][:10]
    if not h24 and not wanted:
        return []
    if not covered(conn, lat, lon):
        return None
    d_lat = radius / 111320
    d_lon = min(180.0, radius / (111320 * max(math.cos(lat * math.pi / 180), 0.01)))
    box = (lon - d_lon, lon + d_lon, lat - d_lat, lat + d_lat)
    if h24:
        where, args = "p.h24 = 1 AND (p.kind = 'shop' OR p.value IN ('fuel', 'convenience'))", []
    else:
        # The same split as place-search's Overpass query: these are shops, the rest amenities.
        shops = {"supermarket", "convenience", "bakery", "motorcycle", "car_repair", "tyres"}
        terms = [("shop" if a in shops else "amenity", a) for a in wanted]
        where = " OR ".join("(p.kind = ? AND p.value = ?)" for _ in terms)
        args = [x for t in terms for x in t]
    rows = conn.execute(
        f"SELECT p.osm, p.lat, p.lon, p.tags FROM place_idx i JOIN places p ON p.id = i.id "
        f"WHERE i.minx >= ? AND i.maxx <= ? AND i.miny >= ? AND i.maxy <= ? AND ({where})",
        (*box, *args),
    ).fetchall()
    found = []
    for osm, plat, plon, tags in rows:
        d = distance_m(lat, lon, plat, plon)
        if d <= radius:
            found.append((d, osm, plat, plon, tags))
    found.sort(key=lambda r: r[0])
    return [
        {"type": "node" if osm[0] == "n" else "way", "id": int(osm[1:]), "lat": plat, "lon": plon, "tags": json.loads(tags)}
        for _, osm, plat, plon, tags in found[:limit]
    ]


class Handler(BaseHTTPRequestHandler):
    def send(self, status, body):
        data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        q = parse_qs(url.query)
        conn = db()
        if conn is None:
            return self.send(503, {"error": "not built"})
        try:
            if url.path == "/ready":
                meta = dict(conn.execute("SELECT key, value FROM meta").fetchall())
                return self.send(200, meta)
            if url.path == "/roads":
                found = roads(conn, q)
            elif url.path == "/places":
                found = places(conn, q)
            else:
                return self.send(404, {"error": "not found"})
        except (KeyError, ValueError, IndexError):
            return self.send(400, {"error": "bad request"})
        if found is None:
            return self.send(404, {"error": "outside"})
        self.send(200, {"elements": found})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"cells: {DB} on :{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
