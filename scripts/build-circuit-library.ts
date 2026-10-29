/**
 * Builds Track Pack's circuit library from OpenStreetMap circuit relations
 * (`type=circuit`: one relation per layout, e.g. "Brands Hatch Indy Circuit").
 *
 *   npm run tracks:build            (resumes from cached Overpass answers)
 *   npm run tracks:build -- --fresh (re-download everything)
 *   npm run tracks:build -- --karts=uk   (kart tracks only, one region; --karts=all for the world)
 *
 * Kart tracks have no circuit relations (almost none): they're mapped as
 * race-track lines (`highway=raceway` + `sport=karting`), often in pieces
 * named by corner, with the venue (`sport=karting`, usually a sports centre)
 * around them. The kart pass groups the lines into tracks by the nodes they
 * share, builds each one's longest lap with the same road → lap code (pit
 * lanes kept out of the lap and kept for pit lane timing), names it from the
 * venue it sits in, and writes public/circuits/karts.json beside index.json
 * (`sport: 'karting'`; the app loads both). Ids are KART_ID_BASE plus the
 * lowest way id in the track, so they stay put between builds and never meet
 * a relation's id (track records are kept by id). Indoor tracks (no GPS) and
 * laps under 300 m or over 3 km are left out, and so is a lap that misses
 * most of its own mapped track.
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
/** Kart tracks with no name of their own are named after the nearest town, some from GeoNames' list of towns. */
const KART_ATTRIBUTION = `${ATTRIBUTION}; some town names © GeoNames, CC BY 4.0 (https://www.geonames.org)`;

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

/** Kart track ids: this plus the lowest way id in the track. */
const KART_ID_BASE = 1_000_000_000_000;
const KART_MIN_M = 300;
const KART_MAX_M = 3000;
/** Regions for the kart pass, south / west / north / east. `all` is the world in tiles. */
const KART_REGIONS: Record<string, [number, number, number, number][]> = {
  uk: [[49.8, -8.7, 61.0, 2.1]],
  all: (() => {
    const lats = [-56, -20, 10, 35, 47, 56, 72];
    const lngs = [-180, -120, -60, -20, 10, 40, 80, 120, 180];
    const out: [number, number, number, number][] = [];
    for (let i = 0; i + 1 < lats.length; i++) for (let j = 0; j + 1 < lngs.length; j++) out.push([lats[i], lngs[j], lats[i + 1], lngs[j + 1]]);
    return out;
  })(),
};

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

/** A kart track's name: the venue it sits in, else a track-like name on its lines, else "Kart track". */
const TRACK_WORDS = /kart|karting|circuit|raceway|track|park|arena|speedway|autodrome|kartbahn|kartbaan|piste/i;
const PART_WORDS = /^(turn|corner|bend|hairpin|chicane|pit|start|finish|straight|esses|kink)\b|\b(straight|hairpin|corner|bend|chicane)$/i;

interface KartVenue {
  name: string;
  minlat: number;
  minlon: number;
  maxlat: number;
  maxlon: number;
}

function kartVenues(data: any): KartVenue[] {
  const out: KartVenue[] = [];
  for (const e of data.elements ?? []) {
    const name = String(e.tags?.['name:en'] ?? e.tags?.name ?? '').trim();
    if (!name || e.tags?.highway) continue;
    const b = e.bounds ?? (typeof e.lat === 'number' ? { minlat: e.lat - 0.002, minlon: e.lon - 0.003, maxlat: e.lat + 0.002, maxlon: e.lon + 0.003 } : null);
    if (!b) continue;
    out.push({ name: name.slice(0, 80), ...b });
  }
  return out;
}

function venueFor(at: LatLng, venues: KartVenue[]): string | null {
  const m = 0.0004; // about 40 m of slack round the venue's outline
  const inside = venues.filter((v) => at.lat >= v.minlat - m && at.lat <= v.maxlat + m && at.lng >= v.minlon - m && at.lng <= v.maxlon + m);
  inside.sort((a, b) => (a.maxlat - a.minlat) * (a.maxlon - a.minlon) - (b.maxlat - b.minlat) * (b.maxlon - b.minlon));
  return inside[0]?.name ?? null;
}

/** The kart tracks in one region's lines: grouped by shared nodes, a lap each. */
/** Towns and cities, to name a track with no name of its own after ("Kart track, Lewes"). */
function townsOf(data: any): { name: string; lat: number; lng: number }[] {
  return (data.elements ?? [])
    .filter((e: any) => e.type === 'node' && (e.tags?.['name:en'] || e.tags?.name))
    .map((e: any) => ({ name: String(e.tags['name:en'] ?? e.tags.name).slice(0, 50), lat: e.lat, lng: e.lon }));
}

function nearestTown(at: LatLng, towns: { name: string; lat: number; lng: number }[]): string | null {
  let best: { name: string; d: number } | null = null;
  const k = Math.cos((at.lat * Math.PI) / 180);
  for (const t of towns) {
    const d = Math.hypot(t.lat - at.lat, (t.lng - at.lng) * k);
    if (!best || d < best.d) best = { name: t.name, d };
  }
  return best && best.d < 0.25 ? best.name : null; // within about 25 km
}

function kartLayouts(lines: any, venues: KartVenue[], skipped: Record<string, number>, taken: { lat: number; lng: number }[], towns: { name: string; lat: number; lng: number }[] = []): Layout[] {
  const ways = (lines.elements ?? []).filter((w: any) => w.type === 'way' && w.geometry && w.nodes && w.geometry.length === w.nodes.length);
  // Tracks: ways that share a node.
  const parent = ways.map((_: any, i: number) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byNode = new Map<number, number>();
  ways.forEach((w: any, i: number) => {
    for (const n of w.nodes) {
      const j = byNode.get(n);
      if (j === undefined) byNode.set(n, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, any[]>();
  ways.forEach((w: any, i: number) => groups.set(find(i), [...(groups.get(find(i)) ?? []), w]));

  const round = (p: LatLng) => ({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 });
  const out: Layout[] = [];
  for (const group of groups.values()) {
    const why = (k: string) => (skipped[`kart: ${k}`] = (skipped[`kart: ${k}`] ?? 0) + 1);
    if (group.some((w: any) => w.tags?.indoor === 'yes' || w.tags?.covered === 'yes' || w.tags?.indoor === 'room')) {
      why('indoor');
      continue;
    }
    const pieces: RoadPiece[] = group.map((w: any) => ({
      id: `${w.id}:0`,
      hw: 'raceway',
      name: w.tags?.name,
      raceway: w.tags?.raceway,
      pts: w.geometry.map((g: any, i: number) => [g.lat, g.lon, w.nodes[i]]),
    }));
    const edges = buildEdges(pieces);
    const lap = lapFrom(pieces, new Set(), initialRemovals(edges));
    if (typeof lap === 'string') {
      why(lap);
      continue;
    }
    if (lap.length < KART_MIN_M) {
      why(`under ${KART_MIN_M} m`);
      continue;
    }
    if (lap.length > KART_MAX_M) {
      why(`over ${KART_MAX_M} m`);
      continue;
    }
    if (ownCoverage(lap.loop, pieces, edges) < 0.5) {
      why('lap misses most of the track');
      continue;
    }
    const lat = lap.loop.reduce((s, p) => s + p.lat, 0) / lap.loop.length;
    const lng = lap.loop.reduce((s, p) => s + p.lng, 0) / lap.loop.length;
    // Already in the library as a circuit relation (a few kart tracks are): not twice.
    if (taken.some((t) => Math.abs(t.lat - lat) < 0.003 && Math.abs(t.lng - lng) < 0.005)) {
      why('already a circuit');
      continue;
    }
    const own = group
      .map((w: any) => String(w.tags?.name ?? '').trim())
      .find((n: string) => n && TRACK_WORDS.test(n) && !PART_WORDS.test(n));
    const town = nearestTown({ lat, lng }, towns);
    const name = venueFor({ lat, lng }, venues) ?? own ?? (town ? `Kart track, ${town}` : 'Kart track');
    const pits = pieces.filter((p) => looksLikePit(p.name, p.raceway)).map((p) => simplifyLine(p.pts.map(([a, b]) => ({ lat: a, lng: b })), 0.8).map(round));
    out.push({
      id: KART_ID_BASE + Math.min(...group.map((w: any) => w.id)),
      name,
      // A named layout of its own ("National Circuit") is found by too.
      aka: own && own !== name ? own.slice(0, 80) : undefined,
      lat,
      lng,
      length: lap.length,
      sport: 'karting',
      loop: simplifyLine(lap.loop, 0.4).map(round),
      direction: lap.direction,
      pits: pits.length ? pits : undefined,
    });
  }
  // Two tracks at one venue: the longest has the venue's name, the others their length after it.
  const byName = new Map<string, Layout[]>();
  for (const l of out) byName.set(`${l.name}@${l.lat.toFixed(2)},${l.lng.toFixed(2)}`, [...(byName.get(`${l.name}@${l.lat.toFixed(2)},${l.lng.toFixed(2)}`) ?? []), l]);
  for (const same of byName.values()) {
    if (same.length < 2) continue;
    same.sort((a, b) => b.length - a.length);
    for (const l of same.slice(1)) l.name = `${l.name} ${l.length} m`;
  }
  return out;
}

function writeLayoutFile(l: Layout) {
  const { id, name, length, loop, start, direction, pits } = l;
  writeFileSync(
    join(OUT, `${id}.json`),
    JSON.stringify({
      attribution: id >= KART_ID_BASE ? KART_ATTRIBUTION : ATTRIBUTION,
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

/** One quick try at each Overpass server, giving up on any that hasn't answered in `ms`. */
async function quickOverpass(query: string, ms: number): Promise<any> {
  let last: unknown;
  for (const url of ENDPOINTS) {
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
        signal: AbortSignal.timeout(ms),
      });
      const text = await res.text();
      if (!res.ok || !text.trimStart().startsWith('{')) throw new Error(`${res.status}`);
      return JSON.parse(text);
    } catch (e) {
      last = e;
      console.warn(`    ${new URL(url).host}: ${String((e as Error).message ?? e).slice(0, 60)}`);
    }
  }
  throw last;
}

interface KartTile {
  box: [number, number, number, number];
  key: string;
  /** Kart lines in it (a cheap count first), null until asked. */
  count: number | null;
  done: boolean;
  tracks: Layout[];
}

const inBox = (p: { lat: number; lng: number }, [s, w, n, e]: KartTile['box']) => p.lat >= s && p.lat < n && p.lng >= w && p.lng < e;

/**
 * The kart pass on its own (`--karts=<region>`): the circuit files are left as
 * they are. Each tile's kart lines are counted first (a tiny query: empty
 * ocean tiles go at once) and the tiles are fetched one at a time, smallest
 * first, each with one quick try at each server and a time limit by its size,
 * so one slow tile can't hold the rest up. What's fetched is cached and
 * written straight away, a tile not fetched yet keeping the tracks the last
 * run had there. `--patient` rests half an hour and goes round again for the
 * tiles left, for up to twelve hours (an overnight run).
 */
async function buildKarts(region: string, patient: boolean) {
  const boxes = KART_REGIONS[region];
  if (!boxes) throw new Error(`No kart region "${region}" (${Object.keys(KART_REGIONS).join(', ')})`);
  mkdirSync(OUT, { recursive: true });
  const existing = JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8')).circuits as { lat: number; lng: number }[];
  const before: { id: number; lat: number; lng: number }[] = existsSync(join(OUT, 'karts.json'))
    ? JSON.parse(readFileSync(join(OUT, 'karts.json'), 'utf8')).circuits ?? []
    : [];
  const skipped: Record<string, number> = {};
  const tiles: KartTile[] = boxes.map((box) => ({ box, key: `karts-${box.join(',').replace(/[^0-9-]+/g, '_')}`, count: null, done: false, tracks: [] }));
  const file = (key: string) => join(CACHE, `${key}.json`);
  const read = (key: string) => (existsSync(file(key)) ? JSON.parse(readFileSync(file(key), 'utf8')) : null);
  const keep = (key: string, data: any) => writeFileSync(file(key), JSON.stringify(data));

  /** A tile's tracks from its cached answers (unnamed ones named after the nearest town). */
  const build = async (t: KartTile, ms: number) => {
    const box = t.box.join(',');
    let lines = read(`${t.key}-lines`);
    if (!lines) {
      lines = await quickOverpass(`[out:json][timeout:${Math.round(ms / 1000)}];way["highway"="raceway"]["sport"="karting"](${box});out geom;`, ms);
      keep(`${t.key}-lines`, lines);
    }
    let venues = read(`${t.key}-venues`);
    if (!venues) {
      venues = await quickOverpass(`[out:json][timeout:${Math.round(ms / 1000)}];nwr["sport"="karting"]["name"](${box});out tags bb;`, ms);
      keep(`${t.key}-venues`, venues);
    }
    // Unnamed tracks take the nearest town's name inside kartLayouts, before two of the same name are told apart by
    // their lengths: named after (as this did at first), the second of a pair came out "Kart track 388 m".
    let towns = read(`${t.key}-near-towns`);
    let tracks = kartLayouts(lines, kartVenues(venues), skipped, existing, towns ? townsOf(towns) : []);
    const unnamed = tracks.filter((l) => /^Kart track( \d+ m)?$/.test(l.name));
    if (unnamed.length && !towns) {
      // Towns only round the tracks that need one: a whole tile's towns is a big ask.
      const around = unnamed.map((l) => `node(around:25000,${l.lat.toFixed(4)},${l.lng.toFixed(4)})["place"~"^(city|town)$"];`).join('');
      towns = await quickOverpass(`[out:json][timeout:${Math.round(ms / 1000)}];(${around});out;`, ms);
      keep(`${t.key}-near-towns`, towns);
      tracks = kartLayouts(lines, kartVenues(venues), skipped, existing, townsOf(towns));
    }
    return tracks;
  };

  const write = () => {
    const done = tiles.filter((t) => t.done);
    const fresh = done.flatMap((t) => t.tracks);
    // Tiles not fetched yet keep what the last run had in them.
    const kept = before.filter((b) => tiles.some((t) => !t.done && inBox(b, t.box)));
    const seen = new Set<number>();
    const all = [...fresh.map((l) => ({ l, id: l.id })), ...kept.map((b) => ({ l: null as Layout | null, id: b.id, b }))]
      .filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
    for (const f of readdirSync(OUT)) {
      const id = Number(f.replace(/\.json$/, ''));
      if (Number.isFinite(id) && id >= KART_ID_BASE && !seen.has(id)) rmSync(join(OUT, f));
    }
    for (const l of fresh) writeLayoutFile(l);
    const entries = all
      .map((x) => (x.l ? { id: x.l.id, name: x.l.name, aka: x.l.aka, lat: +x.l.lat.toFixed(5), lng: +x.l.lng.toFixed(5), length: x.l.length, sport: 'karting' } : (x as any).b))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    writeFileSync(
      join(OUT, 'karts.json'),
      JSON.stringify({ attribution: KART_ATTRIBUTION, generatedAt: new Date().toISOString(), region, circuits: entries }),
    );
    console.log(`  wrote ${entries.length} kart tracks (${done.length} of ${tiles.length} tiles fetched)`);
  };

  const started = Date.now();
  for (let pass = 1; ; pass++) {
    console.log(`\nPass ${pass}`);
    // Counts first: cheap, and they put the tiles in order.
    for (const t of tiles.filter((t) => t.count == null)) {
      const cachedCount = read(`${t.key}-count`);
      const cachedLines = cachedCount ? null : read(`${t.key}-lines`);
      if (cachedCount || cachedLines) {
        t.count = cachedCount ? cachedCount.n : (cachedLines.elements ?? []).length;
        continue;
      }
      try {
        const d = await quickOverpass(`[out:json][timeout:25];way["highway"="raceway"]["sport"="karting"](${t.box.join(',')});out count;`, 30_000);
        t.count = Number(d.elements?.[0]?.tags?.ways ?? d.elements?.[0]?.tags?.total ?? 0);
        keep(`${t.key}-count`, { n: t.count });
      } catch {
        console.warn(`  count for ${t.box.join(',')} didn't come back: later`);
      }
    }
    for (const t of tiles) if (t.count === 0 && !t.done) t.done = true;
    const todo = tiles.filter((t) => !t.done && t.count != null).sort((a, b) => a.count! - b.count!);
    console.log(`  ${todo.length} tiles to fetch, smallest first: ${todo.map((t) => t.count).join(', ')}`);
    for (const t of todo) {
      // Time allowed by size: a small tile that hasn't answered in a minute is crawling.
      const ms = Math.min(240_000, 60_000 + (t.count ?? 0) * 40);
      console.log(`  ${t.box.join(',')} (${t.count} lines, ${Math.round(ms / 1000)} s each)`);
      try {
        t.tracks = await build(t, ms);
        t.done = true;
        console.log(`    ${t.tracks.length} tracks`);
        write();
      } catch {
        console.warn(`    skipped for now`);
      }
      await sleep(3000); // be kind to shared Overpass servers
    }
    const left = tiles.filter((t) => !t.done);
    if (!left.length) break;
    if (!patient || Date.now() - started > 12 * 3600_000) {
      console.warn(`\n${left.length} tile(s) still to fetch: run again (--patient to keep trying). Answers so far are cached.`);
      break;
    }
    console.log(`\n${left.length} tile(s) left: resting 30 minutes…`);
    await sleep(30 * 60_000);
  }
  write();
  console.log(`\nDone (${region}). Skipped:`, skipped);
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

  const karts = process.argv.find((a) => a.startsWith('--karts='))?.slice('--karts='.length);
  if (karts) {
    await buildKarts(karts, process.argv.includes('--patient'));
    return;
  }

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
  const keep = new Set([...layouts.map((l) => `${l.id}.json`), ...[...unfetched].map((id) => `${id}.json`), 'index.json', 'karts.json']);
  // (Kart tracks are the kart pass's own: never touched here.)
  for (const f of readdirSync(OUT)) if (f.endsWith('.json') && !keep.has(f) && !(Number(f.replace(/\.json$/, '')) >= KART_ID_BASE)) rmSync(join(OUT, f));
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
