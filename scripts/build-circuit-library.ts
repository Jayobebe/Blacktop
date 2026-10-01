/**
 * Builds Track Pack's circuit library from OpenStreetMap circuit relations
 * (`type=circuit`: one relation per layout, e.g. "Brands Hatch Indy Circuit").
 *
 *   npm run tracks:build            (resumes from cached Overpass answers)
 *   npm run tracks:build -- --fresh (re-download everything)
 *
 * Writes public/circuits/index.json (names + positions, for instant offline
 * search) and public/circuits/<relation id>.json (the lap, running order,
 * simplified). Each layout goes through the same road → lap code as the map
 * builder (lib/roadLoop), so junctions, spurs and pit lanes are handled the
 * same way. Direction comes from how the ways are drawn (mappers draw circuit
 * ways in the racing direction; `backward` members flip), and the rider can
 * reverse it in the chase cam. Start/finish and sectors are NOT taken from
 * anywhere: the rider places them in the chase cam.
 *
 * Data © OpenStreetMap contributors, ODbL. The generated files are a derived
 * database under ODbL: keep the attribution, and they must stay available
 * under ODbL.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyseLoop, buildEdges, initialRemovals, lapOptions, looksLikePit, removalsFor, type RoadPiece } from '../src/features/track/lib/roadLoop';
import { Centerline, resampleLoop, simplifyLine } from '../src/features/track/lib/centerline';
import { toLocal } from '../src/features/track/lib/geometry';
import type { LatLng } from '../src/features/track/types';

const OUT = join(process.cwd(), 'public', 'circuits');
/** Raw Overpass answers, so a re-run after a failure (Overpass is often busy) resumes where it stopped. */
const CACHE = join(process.cwd(), 'node_modules', '.cache', 'circuit-library');
// Our own geo server's Overpass first when GEO_SERVER_URL / GEO_SERVER_TOKEN
// are set (infra/geo), then the public mirrors.
const GEO_URL = (process.env.GEO_SERVER_URL ?? '').replace(/\/+$/, '');
const GEO_TOKEN = process.env.GEO_SERVER_TOKEN ?? '';
const ENDPOINTS = [
  ...(GEO_URL ? [`${GEO_URL}/overpass/api/interpreter`] : []),
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
const BATCH = 12;
const ATTRIBUTION = 'Circuit data © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(query: string): Promise<any> {
  let last: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'Blacktop-TrackPack/1.0 (circuit library build)',
          ...(GEO_URL && url.startsWith(GEO_URL) && GEO_TOKEN ? { Authorization: `Bearer ${GEO_TOKEN}` } : {}),
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(120_000),
      });
      const text = await res.text();
      if (!res.ok || !text.trimStart().startsWith('{')) throw new Error(`${res.status} ${text.replace(/<[^>]+>/g, ' ').slice(0, 160)}`);
      return JSON.parse(text);
    } catch (e) {
      last = e;
      console.warn(`  ${new URL(url).host} failed (${String((e as Error).message ?? e).slice(0, 120)}), retrying…`);
      await sleep(4000 * (attempt + 1));
    }
  }
  throw last;
}

/**
 * Circuits with no OpenStreetMap circuit relation: built from the race-track
 * roads (`highway=raceway`) in a box, taking the longest lap (pit lanes
 * dropped), exactly like the map builder. Ids are synthetic (9xxxxxxxx).
 */
const EXTRAS: { id: number; name: string; aka?: string; box: [south: number, west: number, north: number, east: number]; lat: number; lng: number }[] = [
  { id: 900000001, name: 'Cadwell Park', aka: 'Cadwell Park Full Circuit', box: [53.298, -0.092, 53.322, -0.042], lat: 53.3095, lng: -0.0655 },
];

interface Layout {
  id: number;
  name: string;
  /** Other names to find it by (the local-language name, a layout name). */
  aka?: string;
  lat: number;
  lng: number;
  length: number;
  sport?: string;
  loop: LatLng[];
  start?: LatLng;
  direction: 'ways' | 'guess';
  /** Pit lane lines (for pit lane timing in the app), never part of the lap. */
  pits?: LatLng[][];
}

/** +1 if the lap runs the way the ways are drawn, -1 if against, weighted by length. */
function directionVote(line: Centerline, pieces: RoadPiece[], backward: Set<string>): number {
  let vote = 0;
  for (const p of pieces) {
    if (p.pts.length < 2) continue;
    const i = Math.max(0, Math.floor(p.pts.length / 2) - 1);
    const a = { lat: p.pts[i][0], lng: p.pts[i][1] };
    const b = { lat: p.pts[i + 1][0], lng: p.pts[i + 1][1] };
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    const hit = line.project(mid);
    if (hit.off > 8) continue; // not on the lap (spur, pit lane)
    const v = toLocal(b, a);
    const h = line.headingAt(hit.d, 3, 3);
    const len = Math.hypot(v.x, v.y);
    if (!len) continue;
    const dot = (v.x * Math.cos(h) + v.y * Math.sin(h)) / len;
    const wayLen = p.pts.length; // points as a cheap length proxy
    vote += Math.sign(dot) * wayLen * (backward.has(p.id) ? -1 : 1);
  }
  return vote;
}

/** Ways → a closed lap in running order (the longest lap when there's a choice), or why not. */
function lapFrom(pieces: RoadPiece[], backward: Set<string>, removed = new Set<string>()): { loop: LatLng[]; length: number; direction: 'ways' | 'guess' } | string {
  if (!pieces.length) return 'no ways';
  const edges = buildEdges(pieces);
  let analysis = analyseLoop(edges, removed);
  if (analysis.status !== 'loop') {
    // Extra bits (other layouts, spurs): take the longest lap.
    const [best] = lapOptions(edges, removed);
    if (!best) return `no lap (${analysis.status})`;
    analysis = analyseLoop(edges, removalsFor(edges, best));
    if (analysis.status !== 'loop') return `no lap (${analysis.status})`;
  }
  let loop = analysis.loop!;
  const line = new Centerline(resampleLoop(loop, 2));
  const vote = directionVote(line, pieces, backward);
  if (vote < 0) loop = [...loop].reverse();
  return { loop, length: Math.round(line.length), direction: vote !== 0 ? 'ways' : 'guess' };
}

/**
 * A layout whose own ways only close through the pit lane (OSM's Brands Hatch
 * Indy lacks the bit joining Clearways to the start straight): borrow the
 * venue's other race track (its other layouts' ways) and take the lap that
 * covers the most of this layout's own track, then the least borrowed.
 */
function lapWithVenue(own: RoadPiece[], venue: RoadPiece[], backward: Set<string>): { loop: LatLng[]; length: number; direction: 'ways' | 'guess' } | string {
  const ownWays = new Set(own.map((p) => p.id.split(':')[0]));
  const pieces = [...own, ...venue.filter((p) => !ownWays.has(p.id.split(':')[0]))];
  const ownIds = new Set(own.map((p) => p.id));
  const edges = buildEdges(pieces);
  const removed = initialRemovals(edges);
  const isOwn = (edgeId: string) => ownIds.has(edgeId.slice(0, edgeId.lastIndexOf('/')));
  const ownTotal = edges.filter((e) => isOwn(e.id) && !removed.has(e.id)).reduce((s, e) => s + e.length, 0);
  const byId = new Map(edges.map((e) => [e.id, e]));
  const scored = lapOptions(edges, removed, 12).map((o) => {
    let mine = 0;
    let borrowed = 0;
    for (const id of o.ids) {
      const e = byId.get(id)!;
      if (isOwn(id)) mine += e.length;
      else borrowed += e.length;
    }
    return { o, mine, borrowed };
  });
  // Most of the layout's own track first (within 5 %), then the least borrowed.
  const top = Math.max(0, ...scored.map((s) => s.mine));
  const best = scored.filter((s) => s.mine >= top * 0.95 && s.mine > ownTotal * 0.5).sort((a, b) => a.borrowed - b.borrowed)[0];
  if (!best) return 'no lap with the venue';
  const analysis = analyseLoop(edges, removalsFor(edges, best.o));
  if (analysis.status !== 'loop') return `no lap with the venue (${analysis.status})`;
  let loop = analysis.loop!;
  const line = new Centerline(resampleLoop(loop, 2));
  const vote = directionVote(line, own, backward);
  if (vote < 0) loop = [...loop].reverse();
  return { loop, length: Math.round(line.length), direction: vote !== 0 ? 'ways' : 'guess' };
}

/** How much of the layout's own (non-pit) track the lap runs along, 0-1. */
function ownCoverage(loop: LatLng[], pieces: RoadPiece[], edges: ReturnType<typeof buildEdges>): number {
  const line = new Centerline(resampleLoop(loop, 2));
  const pitPieces = new Set(edges.filter((e) => e.pit).map((e) => e.id.slice(0, e.id.lastIndexOf('/'))));
  let total = 0;
  let covered = 0;
  for (const p of pieces) {
    if (pitPieces.has(p.id)) continue;
    for (let i = 1; i < p.pts.length; i++) {
      const a = { lat: p.pts[i - 1][0], lng: p.pts[i - 1][1] };
      const b = { lat: p.pts[i][0], lng: p.pts[i][1] };
      const v = toLocal(b, a);
      const len = Math.hypot(v.x, v.y);
      const n = Math.max(1, Math.round(len / 10));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        total += len / n;
        if (line.project({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }).off < 4) covered += len / n;
      }
    }
  }
  return total ? covered / total : 1;
}

/** A relation's pit lane ways (pit roles, or named / tagged as one), as lines. */
function pitLinesOf(rel: any, ways: Map<number, any>): LatLng[][] {
  const out: LatLng[][] = [];
  for (const m of rel.members ?? []) {
    if (m.type !== 'way') continue;
    const w = ways.get(m.ref);
    if (!w?.geometry) continue;
    if (m.role === 'pit_lane' || m.role === 'pit' || looksLikePit(w.tags?.name, w.tags?.raceway)) {
      out.push(w.geometry.map((g: any) => ({ lat: g.lat, lng: g.lon })));
    }
  }
  return out;
}

/** Race-track ways of a relation (no pit roles), as road pieces. */
function relationPieces(rel: any, ways: Map<number, any>): { pieces: RoadPiece[]; backward: Set<string> } {
  const pieces: RoadPiece[] = [];
  const backward = new Set<string>();
  for (const m of rel.members ?? []) {
    if (m.type !== 'way' || m.role === 'pit_lane' || m.role === 'pit') continue;
    const w = ways.get(m.ref);
    if (!w?.geometry || !w.nodes || w.geometry.length !== w.nodes.length) continue;
    const id = `${w.id}:${pieces.length}`;
    pieces.push({ id, hw: 'raceway', name: w.tags?.name, raceway: w.tags?.raceway, pts: w.geometry.map((g: any, i: number) => [g.lat, g.lon, w.nodes[i]]) });
    if (m.role === 'backward') backward.add(id);
  }
  return { pieces, backward };
}

/** An extra circuit, from the raceway roads in its box. */
function extraLayout(extra: (typeof EXTRAS)[number], data: any): Layout | string {
  const pieces: RoadPiece[] = [];
  for (const w of data.elements ?? []) {
    if (w.type !== 'way' || !w.geometry || !w.nodes || w.geometry.length !== w.nodes.length) continue;
    pieces.push({ id: `${w.id}:0`, hw: 'raceway', name: w.tags?.name, raceway: w.tags?.raceway, pts: w.geometry.map((g: any, i: number) => [g.lat, g.lon, w.nodes[i]]) });
  }
  const lap = lapFrom(pieces, new Set(), initialRemovals(buildEdges(pieces)));
  if (typeof lap === 'string') return lap;
  const round = (p: LatLng) => ({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 });
  const pits = pieces.filter((p) => looksLikePit(p.name, p.raceway)).map((p) => simplifyLine(p.pts.map(([lat, lng]) => ({ lat, lng })), 0.8).map(round));
  return {
    id: extra.id,
    name: extra.name,
    aka: extra.aka,
    lat: extra.lat,
    lng: extra.lng,
    length: lap.length,
    loop: simplifyLine(lap.loop, 0.6).map(round),
    direction: lap.direction,
    pits: pits.length ? pits : undefined,
  };
}

function toLayout(rel: any, ways: Map<number, any>, nodes: Map<number, any>, venue: RoadPiece[] = [], venuePits: LatLng[][] = []): Layout | string {
  // English name first (Suzuka is mapped as 鈴鹿サーキット); the local name is kept for search.
  const local = String(rel.tags?.name ?? '').trim();
  const english = String(rel.tags?.['name:en'] ?? '').trim();
  const name = english || local;
  if (!name) return 'no name';
  let start: LatLng | undefined;
  for (const m of rel.members ?? []) {
    if (m.type === 'node' && m.role === 'start') {
      const n = nodes.get(m.ref);
      if (n) start = { lat: n.lat, lng: n.lon };
    }
  }
  const { pieces, backward } = relationPieces(rel, ways);
  // Pit lanes the relation lists without a pit role (Brands Hatch's "Pit Lane"
  // is a plain member) go too, like the map builder. If the layout's own ways
  // only close through the pits, the venue's other track fills the gap. A lap
  // never includes a pit lane: a layout that can't close without one (its
  // mapping is incomplete) is left out, and can still be built from the map.
  const edges = buildEdges(pieces);
  const pits = edges.filter((e) => e.pit).length > 0;
  const withoutPits = lapFrom(pieces, backward, initialRemovals(edges));
  const viaVenue = typeof withoutPits === 'string' && pits && venue.length ? lapWithVenue(pieces, venue, backward) : null;
  const lap = typeof withoutPits !== 'string' ? withoutPits : viaVenue && typeof viaVenue !== 'string' ? viaVenue : pits ? 'only closes through the pit lane' : withoutPits;
  if (typeof lap === 'string') return lap;
  // A lap over only part of the layout's track (gaps in the mapping leave a
  // small loop to close) would read far too short: leave it out too.
  if (ownCoverage(lap.loop, pieces, edges) < 0.6) return 'lap misses most of the track';
  const round = (p: LatLng) => ({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 });
  return {
    id: rel.id,
    name: name.slice(0, 80),
    aka: english && local && local !== english ? local.slice(0, 80) : undefined,
    lat: rel.center?.lat ?? lap.loop[0].lat,
    lng: rel.center?.lon ?? lap.loop[0].lng,
    length: lap.length,
    sport: rel.tags?.sport,
    loop: simplifyLine(lap.loop, 0.6).map(round),
    start: start && round(start),
    direction: lap.direction,
    // Its own pit lane, or the venue's when this layout's relation leaves it out.
    pits: (() => {
      const own = pitLinesOf(rel, ways);
      const lines = own.length ? own : venuePits;
      return lines.length ? lines.map((l) => simplifyLine(l, 0.8).map(round)) : undefined;
    })(),
  };
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const cached = async (key: string, query: string) => {
    const file = join(CACHE, `${key}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
    const data = await overpass(query);
    writeFileSync(file, JSON.stringify(data));
    return data;
  };
  if (process.argv.includes('--fresh')) for (const f of readdirSync(CACHE)) rmSync(join(CACHE, f));

  console.log('Fetching the circuit index…');
  const index = await cached('index', '[out:json][timeout:120];relation["type"="circuit"];out tags center;');
  const rels: any[] = index.elements ?? [];
  console.log(`${rels.length} circuit relations`);

  mkdirSync(OUT, { recursive: true });

  const layouts: Layout[] = [];
  /** Layouts whose batch failed this run: their files from an earlier run are kept. */
  const unfetched = new Set<number>();
  const skipped: Record<string, number> = {};
  // Everything is gathered first and built after, so a layout can borrow its
  // venue's other track (lapWithVenue) whichever batch that came in.
  const allWays = new Map<number, any>();
  const allNodes = new Map<number, any>();
  const fetched: any[] = [];
  for (let i = 0; i < rels.length; i += BATCH) {
    const batch = rels.slice(i, i + BATCH);
    console.log(`Layouts ${i + 1}–${i + batch.length}…`);
    const ids = batch.map((r) => r.id);
    // Read from the cache: no server to be kind to, so no pause after it.
    const fromCache = existsSync(join(CACHE, `batch-${ids[0]}-${ids.length}.json`));
    let data: any;
    try {
      data = await cached(`batch-${ids[0]}-${ids.length}`, `[out:json][timeout:180];relation(id:${ids.join(',')});out body;way(r);out geom;node(r);out;`);
    } catch (e) {
      // Overpass gave up on this batch: carry on, and a re-run fills the gap from cache.
      console.warn(`  batch failed (${String((e as Error).message ?? e).slice(0, 80)}); re-run later to fill it in`);
      skipped['batch failed (re-run)'] = (skipped['batch failed (re-run)'] ?? 0) + batch.length;
      ids.forEach((id) => unfetched.add(id));
      continue;
    }
    const bodies = new Map<number, any>();
    // Each layout keeps the ways from its own download: the same way fetched
    // at another time (another batch) may have been redrawn since.
    const ways = new Map<number, any>();
    for (const el of data.elements ?? []) {
      if (el.type === 'way') {
        ways.set(el.id, el);
        if (!allWays.has(el.id)) allWays.set(el.id, el);
      }
      else if (el.type === 'node') allNodes.set(el.id, el);
      else if (el.type === 'relation') bodies.set(el.id, el);
    }
    for (const r of batch) {
      const body = bodies.get(r.id);
      if (!body) {
        skipped['missing'] = (skipped['missing'] ?? 0) + 1;
        continue;
      }
      fetched.push({ ...body, center: r.center, ways });
    }
    if (!fromCache) await sleep(5000); // be kind to shared Overpass servers
  }

  // A venue: the other circuit relations within 4 km.
  const near = (a: any, b: any) =>
    a.center && b.center && Math.abs(a.center.lat - b.center.lat) < 0.036 && Math.abs(a.center.lon - b.center.lon) < 0.036 / Math.cos((a.center.lat * Math.PI) / 180);
  for (const rel of fetched) {
    const others = fetched.filter((o) => o.id !== rel.id && near(rel, o));
    const venue = others.flatMap((o) => relationPieces(o, o.ways).pieces);
    const venuePits = others.flatMap((o) => pitLinesOf(o, o.ways));
    const result = toLayout(rel, rel.ways, allNodes, venue, venuePits);
    if (typeof result === 'string') {
      skipped[result] = (skipped[result] ?? 0) + 1;
      continue;
    }
    if (result.length < 200) {
      skipped['under 200 m'] = (skipped['under 200 m'] ?? 0) + 1;
      continue;
    }
    layouts.push(result);
  }

  for (const extra of EXTRAS) {
    const [south, west, north, east] = extra.box;
    try {
      const data = await cached(`extra-${extra.id}`, `[out:json][timeout:60];way["highway"="raceway"](${south},${west},${north},${east});out geom;`);
      const result = extraLayout(extra, data);
      if (typeof result === 'string') {
        console.warn(`  ${extra.name}: ${result}`);
        skipped[`extra: ${result}`] = (skipped[`extra: ${result}`] ?? 0) + 1;
      } else {
        console.log(`  ${extra.name}: ${result.length} m`);
        layouts.push(result);
      }
    } catch {
      console.warn(`  ${extra.name}: fetch failed, keeping any earlier file`);
      unfetched.add(extra.id);
    }
  }

  layouts.sort((a, b) => a.name.localeCompare(b.name));
  // Only now, with the new set built, drop layouts that are no longer in it
  // (a stalled or failed run never leaves the library empty).
  const keep = new Set([...layouts.map((l) => `${l.id}.json`), ...[...unfetched].map((id) => `${id}.json`), 'index.json']);
  for (const f of readdirSync(OUT)) if (f.endsWith('.json') && !keep.has(f)) rmSync(join(OUT, f));
  for (const l of layouts) {
    const { id, name, length, loop, start, direction, pits } = l;
    writeFileSync(
      join(OUT, `${id}.json`),
      JSON.stringify({
        attribution: ATTRIBUTION,
        id,
        name,
        length,
        direction,
        start,
        loop: loop.map((p) => [p.lat, p.lng]),
        pits: pits?.map((line) => line.map((p) => [p.lat, p.lng])),
      }),
    );
  }
  writeFileSync(
    join(OUT, 'index.json'),
    JSON.stringify({
      attribution: ATTRIBUTION,
      generatedAt: new Date().toISOString(),
      circuits: layouts.map(({ id, name, aka, lat, lng, length, sport }) => ({ id, name, aka, lat: +lat.toFixed(5), lng: +lng.toFixed(5), length, sport })),
    }),
  );
  console.log(`\nWrote ${layouts.length} layouts. Skipped:`, skipped);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
