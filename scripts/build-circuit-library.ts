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
import { analyseLoop, buildEdges, lapOptions, removalsFor, type RoadPiece } from '../src/features/track/lib/roadLoop';
import { Centerline, resampleLoop, simplifyLine } from '../src/features/track/lib/centerline';
import { toLocal } from '../src/features/track/lib/geometry';
import type { LatLng } from '../src/features/track/types';

const OUT = join(process.cwd(), 'public', 'circuits');
/** Raw Overpass answers, so a re-run after a failure (Overpass is often busy) resumes where it stopped. */
const CACHE = join(process.cwd(), 'node_modules', '.cache', 'circuit-library');
const ENDPOINTS = [
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'Blacktop-TrackPack/1.0 (circuit library build)' },
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

interface Layout {
  id: number;
  name: string;
  lat: number;
  lng: number;
  length: number;
  sport?: string;
  loop: LatLng[];
  start?: LatLng;
  direction: 'ways' | 'guess';
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

function toLayout(rel: any, ways: Map<number, any>, nodes: Map<number, any>): Layout | string {
  const name = String(rel.tags?.name ?? '').trim();
  if (!name) return 'no name';
  const pieces: RoadPiece[] = [];
  const backward = new Set<string>();
  let start: LatLng | undefined;
  for (const m of rel.members ?? []) {
    if (m.type === 'node' && m.role === 'start') {
      const n = nodes.get(m.ref);
      if (n) start = { lat: n.lat, lng: n.lon };
    }
    if (m.type !== 'way' || m.role === 'pit_lane' || m.role === 'pit') continue;
    const w = ways.get(m.ref);
    if (!w?.geometry || !w.nodes || w.geometry.length !== w.nodes.length) continue;
    const id = `${w.id}:${pieces.length}`;
    pieces.push({ id, hw: 'raceway', name: w.tags?.name, pts: w.geometry.map((g: any, i: number) => [g.lat, g.lon, w.nodes[i]]) });
    if (m.role === 'backward') backward.add(id);
  }
  if (!pieces.length) return 'no ways';

  const edges = buildEdges(pieces);
  let analysis = analyseLoop(edges, new Set());
  if (analysis.status !== 'loop') {
    // Extra bits in the relation: take its longest lap.
    const [best] = lapOptions(edges, new Set());
    if (!best) return `no lap (${analysis.status})`;
    analysis = analyseLoop(edges, removalsFor(edges, best));
    if (analysis.status !== 'loop') return `no lap (${analysis.status})`;
  }
  let loop = analysis.loop!;
  const line = new Centerline(resampleLoop(loop, 2));
  const edgePieces = pieces.map((p) => p); // votes use the original ways
  const vote = directionVote(line, edgePieces, backward);
  if (vote < 0) loop = [...loop].reverse();

  const round = (p: LatLng) => ({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 });
  return {
    id: rel.id,
    name: name.slice(0, 80),
    lat: rel.center?.lat ?? loop[0].lat,
    lng: rel.center?.lon ?? loop[0].lng,
    length: Math.round(line.length),
    sport: rel.tags?.sport,
    loop: simplifyLine(loop, 0.6).map(round),
    start: start && round(start),
    direction: vote !== 0 ? 'ways' : 'guess',
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
  for (const f of readdirSync(OUT)) if (f.endsWith('.json')) rmSync(join(OUT, f));

  const layouts: Layout[] = [];
  const skipped: Record<string, number> = {};
  for (let i = 0; i < rels.length; i += BATCH) {
    const batch = rels.slice(i, i + BATCH);
    console.log(`Layouts ${i + 1}–${i + batch.length}…`);
    const ids = batch.map((r) => r.id);
    let data: any;
    try {
      data = await cached(`batch-${ids[0]}-${ids.length}`, `[out:json][timeout:180];relation(id:${ids.join(',')});out body;way(r);out geom;node(r);out;`);
    } catch (e) {
      // Overpass gave up on this batch: carry on, and a re-run fills the gap from cache.
      console.warn(`  batch failed (${String((e as Error).message ?? e).slice(0, 80)}); re-run later to fill it in`);
      skipped['batch failed (re-run)'] = (skipped['batch failed (re-run)'] ?? 0) + batch.length;
      continue;
    }
    const ways = new Map<number, any>();
    const nodes = new Map<number, any>();
    const bodies = new Map<number, any>();
    for (const el of data.elements ?? []) {
      if (el.type === 'way') ways.set(el.id, el);
      else if (el.type === 'node') nodes.set(el.id, el);
      else if (el.type === 'relation') bodies.set(el.id, el);
    }
    for (const r of batch) {
      const body = bodies.get(r.id);
      if (!body) {
        skipped['missing'] = (skipped['missing'] ?? 0) + 1;
        continue;
      }
      const result = toLayout({ ...body, center: r.center }, ways, nodes);
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
    await sleep(5000); // be kind to shared Overpass servers
  }

  layouts.sort((a, b) => a.name.localeCompare(b.name));
  for (const l of layouts) {
    const { id, name, length, loop, start, direction } = l;
    writeFileSync(
      join(OUT, `${id}.json`),
      JSON.stringify({ attribution: ATTRIBUTION, id, name, length, direction, start, loop: loop.map((p) => [p.lat, p.lng]) }),
    );
  }
  writeFileSync(
    join(OUT, 'index.json'),
    JSON.stringify({
      attribution: ATTRIBUTION,
      generatedAt: new Date().toISOString(),
      circuits: layouts.map(({ id, name, lat, lng, length, sport }) => ({ id, name, lat: +lat.toFixed(5), lng: +lng.toFixed(5), length, sport })),
    }),
  );
  console.log(`\nWrote ${layouts.length} layouts. Skipped:`, skipped);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
