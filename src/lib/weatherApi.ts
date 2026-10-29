/**
 * Every forecast the app asks for on the phone (the Console's riding weather, the calendar, rain and
 * wind along a route, the wind layer) goes through here. Open-Meteo's public API is free for
 * non-commercial use only, so once Blacktop's own geo server runs it (infra/geo, its `weather`
 * service at the public path `/open-weather`), the build is pointed there with VITE_WEATHER_URL
 * (e.g. https://geo.blacktoplive.com/open-weather) and every forecast goes to it first, with the
 * model it keeps named (VITE_WEATHER_MODEL, ecmwf_ifs025 by default: the same as WEATHER_MODEL in
 * the server's .env). If it fails, or answers without data (not synced yet), the public API answers
 * instead and ours is left alone for a minute. Without VITE_WEATHER_URL everything goes to the
 * public API exactly as before. The server keeps one model, which has no chance of rain:
 * `precipitation_probability` comes back empty from it, and the screens read that as 0 (rain is then
 * judged by the amount forecast). Imports nothing.
 */
const PUBLIC = 'https://api.open-meteo.com';
const OWN = String(import.meta.env.VITE_WEATHER_URL ?? '').trim().replace(/\/+$/, '');
const OWN_MODEL = String(import.meta.env.VITE_WEATHER_MODEL ?? '').trim() || 'ecmwf_ifs025';
const REST_MS = 60_000;
let ownRestingUntil = 0;

/** A forecast request to build with searchParams, then hand to `fetchForecast`. */
export function forecastUrl(): URL {
  return new URL(`${PUBLIC}/v1/forecast`);
}

/** The forecast for `url` (from forecastUrl): our own server first when there is one, else the public API. */
export async function fetchForecast(url: URL): Promise<Response> {
  if (OWN && Date.now() >= ownRestingUntil) {
    const own = new URL(`${OWN}/v1/forecast`);
    url.searchParams.forEach((v, k) => own.searchParams.set(k, v));
    own.searchParams.set('models', OWN_MODEL);
    try {
      const res = await fetch(own.toString());
      if (res.ok) {
        // An empty answer means ours hasn't synced yet: the public one instead.
        const body = await res.clone().json().catch(() => null);
        const first = Array.isArray(body) ? body[0] : body;
        if (first && (first.hourly?.time?.length || first.daily?.time?.length || first.current)) return res;
      }
    } catch {
      /* down or unreachable: the public one */
    }
    ownRestingUntil = Date.now() + REST_MS;
  }
  return fetch(url.toString());
}
