"""
Kart lines, kart venues and towns out of a Geofabrik .osm.pbf, for the world kart build's regions that the public
Overpass servers never answered. Each region's finds are added to a staging file (so a region spanning several
downloads collects all of them); `--finish` writes the staged regions into the build's own cache in the shape
Overpass answers (lines `out geom` with node ids, venues `out tags bb`, towns as nodes), so the build reads them
unchanged (`npm run tracks:build -- --karts=all` then needs no Overpass at all). Needs `pip install osmium`.
Download each extract from https://download.geofabrik.de, one at a time, run it through, delete it (a whole
continent is tens of GB). Usage:
  py -3.11 -X utf8 scripts/karts-from-extracts.py <file.osm.pbf> <staging dir>
  py -3.11 -X utf8 scripts/karts-from-extracts.py --finish <staging dir> node_modules/.cache/circuit-library <region,region,...>
Unnamed tracks are named after the nearest town from `-near-towns`; where a region has none, GeoNames' cities1000
(pop. 3,000 and up, CC BY 4.0, credited in the kart files) was used for the 2026-10-29 build, OpenStreetMap's own
towns inside the UK pass's box so the UK names stayed as they were.
"""
import json, os, re, sys
import osmium
from osmium.filter import TagFilter, IdFilter

LATS = [-56, -20, 10, 35, 47, 56, 72]
LNGS = [-180, -120, -60, -20, 10, 40, 80, 120, 180]
BOXES = [(LATS[i], LNGS[j], LATS[i + 1], LNGS[j + 1]) for i in range(len(LATS) - 1) for j in range(len(LNGS) - 1)]


def key_of(box):
    return 'karts-' + re.sub(r'[^0-9-]+', '_', ','.join(str(x) for x in box))


def box_of(lat, lon):
    for b in BOXES:
        if b[0] <= lat < b[2] and b[1] <= lon < b[3]:
            return b
    return None


def extract(pbf, staging):
    # Pass 1: the kart lines and venues (tags only, node ids), and every town and city.
    lines, venues, towns = {}, {}, []
    need = set()
    for o in osmium.FileProcessor(pbf).with_filter(TagFilter(('highway', 'raceway'), ('sport', 'karting'), ('place', 'city'), ('place', 'town'))):
        t = dict(o.tags)
        if o.is_node():
            if t.get('place') in ('city', 'town') and (t.get('name') or t.get('name:en')):
                towns.append({'type': 'node', 'id': o.id, 'lat': o.location.lat, 'lon': o.location.lon, 'tags': {k: t[k] for k in ('name', 'name:en', 'place') if k in t}})
            elif t.get('sport') == 'karting' and t.get('name') and not t.get('highway'):
                venues[('n', o.id)] = {'type': 'node', 'id': o.id, 'lat': o.location.lat, 'lon': o.location.lon, 'tags': t}
        elif o.is_way():
            refs = [n.ref for n in o.nodes]
            if t.get('highway') == 'raceway' and t.get('sport') == 'karting':
                lines[o.id] = {'type': 'way', 'id': o.id, 'nodes': refs, 'tags': t}
                need.update(refs)
            elif t.get('sport') == 'karting' and t.get('name') and not t.get('highway'):
                venues[('w', o.id)] = {'type': 'way', 'id': o.id, 'refs': refs, 'tags': t}
                need.update(refs)
    # Pass 2: where those nodes are (only those ids, filtered in C++).
    where = {}
    if need:
        for n in osmium.FileProcessor(pbf, osmium.osm.NODE).with_filter(IdFilter(need)):
            where[n.id] = (n.location.lat, n.location.lon)
    staged = {}

    def put(box, kind, el):
        staged.setdefault(key_of(box), {'lines': [], 'venues': [], 'towns': []})[kind].append(el)

    for w in lines.values():
        pts = [where.get(r) for r in w['nodes']]
        if any(p is None for p in pts):
            continue
        w['geometry'] = [{'lat': round(a, 7), 'lon': round(b, 7)} for a, b in pts]
        lat = sum(p[0] for p in pts) / len(pts)
        lon = sum(p[1] for p in pts) / len(pts)
        b = box_of(lat, lon)
        if b:
            put(b, 'lines', w)
    for v in venues.values():
        if v['type'] == 'way':
            pts = [where.get(r) for r in v.pop('refs')]
            pts = [p for p in pts if p]
            if not pts:
                continue
            v['bounds'] = {'minlat': min(p[0] for p in pts), 'minlon': min(p[1] for p in pts), 'maxlat': max(p[0] for p in pts), 'maxlon': max(p[1] for p in pts)}
            lat, lon = (v['bounds']['minlat'] + v['bounds']['maxlat']) / 2, (v['bounds']['minlon'] + v['bounds']['maxlon']) / 2
        else:
            lat, lon = v['lat'], v['lon']
        b = box_of(lat, lon)
        if b:
            put(b, 'venues', v)
    for t in towns:
        b = box_of(t['lat'], t['lon'])
        if b:
            put(b, 'towns', t)
    os.makedirs(staging, exist_ok=True)
    for k, add in staged.items():
        path = os.path.join(staging, k + '.json')
        cur = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {'lines': {}, 'venues': {}, 'towns': {}}
        for kind in ('lines', 'venues', 'towns'):
            for el in add[kind]:
                cur[kind][f"{el['type']}{el['id']}"] = el
        json.dump(cur, open(path, 'w', encoding='utf-8'))
    print(os.path.basename(pbf), 'lines', len(lines), 'venues', len(venues), 'towns', len(towns), 'regions', len(staged))


def finish(staging, cache, regions):
    for key in regions:
        path = os.path.join(staging, key + '.json')
        cur = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {'lines': {}, 'venues': {}, 'towns': {}}
        lines = list(cur['lines'].values())
        out = lambda els: {'version': 0.6, 'generator': 'Geofabrik extract (karts_pbf.py)', 'elements': els}
        json.dump(out(lines), open(os.path.join(cache, key + '-lines.json'), 'w', encoding='utf-8'))
        json.dump(out(list(cur['venues'].values())), open(os.path.join(cache, key + '-venues.json'), 'w', encoding='utf-8'))
        json.dump(out(list(cur['towns'].values())), open(os.path.join(cache, key + '-near-towns.json'), 'w', encoding='utf-8'))
        json.dump({'n': len(lines)}, open(os.path.join(cache, key + '-count.json'), 'w', encoding='utf-8'))
        print(key, 'lines', len(lines), 'venues', len(cur['venues']), 'towns', len(cur['towns']))


if __name__ == '__main__':
    if sys.argv[1] == '--finish':
        finish(sys.argv[2], sys.argv[3], sys.argv[4].split(','))
    else:
        extract(sys.argv[1], sys.argv[2])
