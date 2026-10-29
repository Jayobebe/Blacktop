// Search and reverse lookups in Nominatim's shape, from a pool: the public Nominatim
// server, then the keyed providers switched on by their secrets (LocationIQ speaks
// Nominatim's own API; Geoapify's answers are turned into it). The public server allows
// about one request a second for everyone, so it carries a per-minute allowance and the
// pool moves calls to the keyed ones as it fills. A keyed provider that answers is credited
// on what it answered (`credit`), as its free terms ask.
import { fetchWithTimeout, keyedProviders, type Hop, type Provider, upstreamHeaders, viaPool } from "../_shared/upstream.ts";

const NOMINATIM: Provider = { id: "nominatim", base: "https://nominatim.openstreetmap.org", perMinute: 50 };

export interface SearchAsk {
  q: string;
  countryCode?: string | null;
  viewbox?: string | null;
  /** "1" to stay inside the viewbox. */
  bounded?: "0" | "1" | null;
  limit?: number | string | null;
}

function providers(): Provider[] {
  return [NOMINATIM, ...keyedProviders("nominatim")];
}

function viewbox(v: string | null | undefined): [number, number, number, number] | null {
  const vb = String(v ?? "").split(",").map(Number);
  return vb.length === 4 && vb.every(Number.isFinite)
    ? [Math.min(vb[0], vb[2]), Math.min(vb[1], vb[3]), Math.max(vb[0], vb[2]), Math.max(vb[1], vb[3])]
    : null;
}

async function getJson(hop: Hop, url: URL, timeoutMs: number) {
  const res = await fetchWithTimeout(url.toString(), { hop, headers: upstreamHeaders(false, { Accept: "application/json" }) }, timeoutMs);
  // LocationIQ answers 404 "Unable to geocode" for nothing found: an answer.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${hop.provider.id} ${res.status}`);
  return res.json();
}

/** A Geoapify result's address in the fields the app reads from Nominatim's. */
function geoapifyAddress(r: any) {
  // A place that is itself the town or village can come back with only its name.
  const city = r.city ?? (r.result_type === "city" || r.category === "populated_place" ? r.name : undefined);
  return {
    road: r.street, house_number: r.housenumber, suburb: r.suburb ?? r.district, city, village: r.village,
    hamlet: r.hamlet, county: r.county, state: r.state, postcode: r.postcode, country: r.country,
    country_code: typeof r.country_code === "string" ? r.country_code.toLowerCase() : undefined,
  };
}

function geoapifyPlace(r: any) {
  const [cls, ...type] = String(r.category ?? r.result_type ?? "").split(".");
  return {
    place_id: `ga${r.place_id ?? `${r.lat},${r.lon}`}`,
    lat: String(r.lat),
    lon: String(r.lon),
    name: r.name ?? r.address_line1 ?? "",
    display_name: r.formatted ?? [r.name, r.street, r.city, r.postcode, r.country].filter(Boolean).join(", "),
    class: cls,
    type: type.join(".") || cls,
    address: geoapifyAddress(r),
  };
}

/** Places matching `q`, Nominatim-shaped, and the credit owed for them (null when none is). */
export async function geocodeSearch(ask: SearchAsk): Promise<{ results: any[]; credit: string | null }> {
  const limit = Math.max(1, Math.min(50, Number(ask.limit) || 10));
  const box = viewbox(ask.viewbox);
  const { value, provider } = await viaPool("nominatim", providers(), async (base, _own, hop) => {
    const p = hop.provider;
    if (p.kind === "geoapify") {
      const url = new URL(`${base}/search`);
      url.searchParams.set("text", ask.q.slice(0, 200));
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", String(Math.min(20, limit)));
      const filters: string[] = [];
      if (ask.countryCode) filters.push(`countrycode:${String(ask.countryCode).toLowerCase()}`);
      if (box && ask.bounded === "1") filters.push(`rect:${box.join(",")}`);
      if (filters.length) url.searchParams.set("filter", filters.join("|"));
      if (box) url.searchParams.set("bias", `proximity:${(box[0] + box[2]) / 2},${(box[1] + box[3]) / 2}`);
      url.searchParams.set("apiKey", p.key ?? "");
      const j = await getJson(hop, url, 7000);
      return (Array.isArray(j?.results) ? j.results : []).map(geoapifyPlace);
    }
    const url = new URL(`${base}/search`);
    url.searchParams.set("q", ask.q);
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("namedetails", "1");
    url.searchParams.set("extratags", "1");
    url.searchParams.set("limit", String(limit));
    if (ask.countryCode) url.searchParams.set("countrycodes", ask.countryCode);
    if (ask.viewbox) url.searchParams.set("viewbox", ask.viewbox);
    if (ask.bounded) url.searchParams.set("bounded", ask.bounded);
    if (p.kind === "locationiq") url.searchParams.set("key", p.key ?? "");
    const j = await getJson(hop, url, 7000);
    // LocationIQ leaves `name` out and keeps it in namedetails.
    return Array.isArray(j) ? j.map((r: any) => (r?.name || !r?.namedetails?.name ? r : { ...r, name: r.namedetails.name })) : [];
  });
  return { results: value, credit: provider.credit ?? null };
}

/** What's at a point, Nominatim-shaped (`address` with city / town / … / country_code), and its credit. */
export async function geocodeReverse(lat: number, lon: number, zoom: number): Promise<{ place: any; credit: string | null }> {
  const { value, provider } = await viaPool("nominatim", providers(), async (base, _own, hop) => {
    const p = hop.provider;
    if (p.kind === "geoapify") {
      const url = new URL(`${base}/reverse`);
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      url.searchParams.set("format", "json");
      // Nominatim's zoom 3 is the country, 10 a city, 12 a town or suburb.
      url.searchParams.set("type", zoom <= 5 ? "country" : zoom <= 10 ? "city" : "street");
      url.searchParams.set("apiKey", p.key ?? "");
      const r = (await getJson(hop, url, 6000))?.results?.[0];
      return r ? { display_name: r.formatted, address: geoapifyAddress(r) } : {};
    }
    const url = new URL(`${base}/reverse`);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("format", "json");
    url.searchParams.set("zoom", String(zoom));
    if (p.kind === "locationiq") url.searchParams.set("key", p.key ?? "");
    return (await getJson(hop, url, 6000)) ?? {};
  });
  return { place: value, credit: provider.credit ?? null };
}
