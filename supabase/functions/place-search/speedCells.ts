// The shared speed-limit map: OpenStreetMap's roads and their `maxspeed`, one map cell at a time,
// fetched from Overpass the first time anyone rides through the cell and kept in Supabase storage
// (the public `speed-cells` bucket, migration 20261101000000_speed_cells.sql), where every phone
// reads it straight from the CDN after that. So the public servers are asked once a cell a month,
// however many riders pass through, and the phone matches the rider to the road itself
// (src/lib/speedLimitRoads.ts). Cells refresh when someone rides through one over CELL_DAYS old.
//
// A cell is CELL degrees a side, numbered from (0, 0) at the equator and meridian, with MARGIN on
// every side so a road along an edge still matches: the same numbers as src/lib/speedLimit.ts, keep
// them in step. The file (CellFile) is compact: each road's points are whole 1e-5 degrees from the
// cell's south-west corner, each after the first as a step from the one before.

export const CELL = 0.015
export const MARGIN = 0.002
export const CELL_DAYS = 30
export const BUCKET = 'speed-cells'

export interface CellFile {
  v: 1
  /** When it was fetched (ms). */
  at: number
  row: number
  col: number
  /** Each road: its maxspeed tag (null without one), then x0, y0, dx1, dy1, … */
  w: Array<[string | null, ...number[]]>
}

const env = (k: string): string => {
  const g = globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } }; process?: { env: Record<string, string | undefined> } }
  return (g.Deno?.env.get(k) ?? g.process?.env?.[k] ?? '').trim()
}

export const cellPath = (row: number, col: number) => `v1/${row}/${col}.json`

/** The cell's box, margin included: [south, west, north, east]. */
export function cellBox(row: number, col: number): [number, number, number, number] {
  const south = row * CELL - MARGIN
  const west = col * CELL - MARGIN
  return [south, west, south + CELL + 2 * MARGIN, west + CELL + 2 * MARGIN]
}

/** The Overpass query for a cell's roads. */
export function cellQuery(row: number, col: number): string {
  const [s, w, n, e] = cellBox(row, col)
  return `
    [out:json][timeout:15];
    way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|road)$"](${s},${w},${n},${e});
    out tags geom;
  `
}

/**
 * Overpass's answer as a cell file. Roads running far out of the cell keep only the stretch near it
 * (a point outside is kept when the one before or after is inside the box plus 300 m), which is all
 * the matcher can use and keeps a motorway from filling the file.
 */
export function encodeCell(row: number, col: number, overpass: unknown, at = Date.now()): CellFile {
  const [s, w, n, e] = cellBox(row, col)
  const pad = 0.003
  const near = (lat: number, lon: number) => lat >= s - pad && lat <= n + pad && lon >= w - pad && lon <= e + pad
  const ways: CellFile['w'] = []
  const elements = (overpass as { elements?: unknown[] } | null)?.elements
  for (const el of Array.isArray(elements) ? elements : []) {
    const way = el as { type?: string; tags?: Record<string, string>; geometry?: Array<{ lat?: number; lon?: number }> }
    if (way?.type !== 'way' || !Array.isArray(way.geometry)) continue
    const pts = way.geometry.filter((g) => typeof g?.lat === 'number' && typeof g?.lon === 'number') as Array<{ lat: number; lon: number }>
    // Split into runs near the cell.
    let run: Array<{ lat: number; lon: number }> = []
    const flush = () => {
      if (run.length >= 2) {
        const t = way.tags ?? {}
        const raw = t.maxspeed ?? t['maxspeed:forward'] ?? t['maxspeed:backward'] ?? null
        const out: [string | null, ...number[]] = [raw == null ? null : String(raw).slice(0, 40)]
        let px = 0
        let py = 0
        run.forEach((p, i) => {
          const x = Math.round((p.lon - w) * 1e5)
          const y = Math.round((p.lat - s) * 1e5)
          if (i === 0) out.push(x, y)
          else out.push(x - px, y - py)
          px = x
          py = y
        })
        ways.push(out)
      }
      run = []
    }
    pts.forEach((p, i) => {
      const keep = near(p.lat, p.lon) || (i > 0 && near(pts[i - 1].lat, pts[i - 1].lon)) || (i < pts.length - 1 && near(pts[i + 1].lat, pts[i + 1].lon))
      if (keep) run.push(p)
      else flush()
    })
    flush()
  }
  return { v: 1, at, row, col, w: ways }
}

/** The stored cell, or null (none yet, or no bucket: the migration not run). */
export async function readStoredCell(row: number, col: number): Promise<CellFile | null> {
  const base = env('SUPABASE_URL')
  if (!base) return null
  try {
    const res = await fetch(`${base}/storage/v1/object/public/${BUCKET}/${cellPath(row, col)}`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const file = (await res.json()) as CellFile
    return file?.v === 1 && Array.isArray(file.w) && typeof file.at === 'number' ? file : null
  } catch {
    return null
  }
}

/** Saves a cell for everyone (needs the service role, which every Edge Function has). Best-effort. */
export async function storeCell(file: CellFile): Promise<boolean> {
  const base = env('SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!base || !key) return false
  try {
    const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${cellPath(file.row, file.col)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        'Content-Type': 'application/json',
        'x-upsert': 'true',
        // Phones read it from the CDN; a refreshed cell may take a day to replace the old copy there.
        'Cache-Control': 'max-age=86400',
      },
      body: JSON.stringify(file),
    })
    if (!res.ok) console.warn('[speed-cells] store', res.status, (await res.text()).slice(0, 120))
    return res.ok
  } catch (e) {
    console.warn('[speed-cells] store failed', e instanceof Error ? e.message : e)
    return false
  }
}

export const isFresh = (file: CellFile, now = Date.now()) => now - file.at < CELL_DAYS * 86_400_000
