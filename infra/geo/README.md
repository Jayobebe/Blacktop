# Blacktop geo server

One server that runs everything Blacktop would otherwise ask shared public
services for, so 5,000 riders at once never hit someone else's rate limit:

| Path | Service | Used for | Replaces |
| --- | --- | --- | --- |
| `/valhalla` | Valhalla | every route, turn-by-turn, the road data twisty roads and loops are scored on | FOSSGIS Valhalla |
| `/osrm` | OSRM | the second engine: twisty and loop planning try candidates on both and keep the best, and its time for each route gives the ETA window ("12:44–13:05") | the OSRM demo server |
| `/photon` | Photon | place search and reverse lookup | Nominatim (1 request a second for everyone) and komoot's Photon |
| `/overpass` | Overpass | speed cameras, nearby places, scenic loop viewpoints, the Track Day road picker, the circuit library build | overpass-api.de and its mirrors |
| `/weather` | Open-Meteo | weather alerts (push notifications) | api.open-meteo.com (free for non-commercial use only, ~10,000 calls a day) |
| `/spots` | static files | speed cameras on the map, and the viewpoints scenic loops are routed through | the same two things from Overpass |
| `/cells` | `osmcells` (SQLite) | the shared speed-limit map's road cells, and the map's quick searches (fuel, coffee, parking, open 24h…) | the same two things from Overpass |

Caddy sits in front with an automatic HTTPS certificate and a shared token, so
only Blacktop's Edge Functions can use it.

**Nothing changes in the app until the Supabase secrets are set.** Until then
everything uses the public services exactly as before. Once they're set, each
service the server runs falls back to its public equivalent if ours fails (down
or rebuilding) and ours is skipped for that service for a minute. A service the
server doesn't run is never asked for.
The app's own forecasts (the Console's riding weather, the calendar, rain and
wind along a route, the wind layer) are called from riders' phones and move to
this server with one build setting, not a Supabase secret: see "The app's
forecasts" below.

## 1. The server

The server needn't run everything. `GEO_SERVICES` (in `.env`, and the same
list as a Supabase secret) says what it has; whatever is left out keeps using
the public services exactly as it does with no server at all.

These are rough figures for the whole world; check them against the current
downloads when you order.

| | Disk | Memory | Build / first start |
| --- | --- | --- | --- |
| `valhalla` (planet tiles) | ~100 GB, plus ~80 GB of map data while building | ~64 GB to build, far less to serve | most of a day |
| `photon` (planet index) | ~100–200 GB unpacked | 12 GB of Java heap by default | a few hours to download and unpack |
| `weather` (one global model) | ~10–30 GB | little | minutes, then live |
| `spots` (cameras and scenic spots) | well under 1 GB | none: static files | minutes, during the Valhalla build |
| `cells` (speed-limit roads, quick-search places) | ~15–25 GB, plus ~25 GB of node positions while building | little | an hour or two, during the Valhalla build |
| `osrm` (planet, car) | ~150–250 GB, plus ~80 GB while building | ~256 GB to build | most of a day |
| `overpass` (planet clone) | ~300–400 GB | moderate | several hours to download, then live |

**Recommended: `valhalla,photon,weather,spots,cells`.** That is every route and
turn-by-turn, twisty and loop scoring on real road data, place search without
the public one-request-a-second ceiling, weather alerts off the non-commercial
public API, and speed cameras, scenic viewpoints, speed limits and quick
searches without the public Overpass servers' timeouts. Roughly 300–450 GB of disk and 64 GB of memory: a mid-size
dedicated server (8 cores, 64 GB, 2 × 512 GB NVMe or more). Disk is tightest
during the weekly update, when a fresh copy is built beside the live one; a
1 TB pair leaves comfortable room.

What that leaves out, on purpose:

- **`osrm`**, the second routing engine. With it, twisty and loop planning try
  every candidate on both engines, and routes show an ETA window. Its planet
  build is what needs 256 GB of memory and a far dearer machine. Without it
  Valhalla plans alone, and the public OSRM demo is only the fallback if
  Valhalla is down. Add it later, or build it for one continent.
- **`overpass`**, the whole map database. The only things Blacktop asked it for
  at scale were cameras and scenic spots, speed limits and the map's quick
  searches, which `spots` and `cells` now cover from the download the routing
  build already makes. A typed name search goes to Photon, as it always has.
  Overpass is still the fallback when ours is down, and what answers for
  anywhere outside the area the server was built for.

Prices moved a lot in 2026 (Hetzner roughly tripled its dedicated servers in
June), so compare before ordering: Hetzner's AX line and its server auction,
OVH, and others. Ubuntu 24.04. Choose a location close to Supabase's EU region.

One box is enough for 5,000 riders:

- **Turn-by-turn** asks for a route when a ride starts, and again only when the rider leaves the line (at most every 12 s).
- **Speed:** Valhalla answers in tens of milliseconds, and Photon is similar. Cameras and scenic spots are a few small files a request; a speed-limit cell or a quick search is one indexed lookup in `cells`.
- **Twisty and loop planning** are the heaviest calls (dozens of routes each), but they're occasional.
- The per-rider limit in `place-search` (60 calls a minute) still applies.

To test cheaply first, use a region: set `REGION_PBF_URL` to a Geofabrik
extract and `GEO_SERVICES=valhalla,spots,cells` (search and weather stay public).
Anywhere outside the extract, `cells` says so and the Edge Functions ask
Overpass instead, so a region never leaves riders elsewhere without speed
limits.
Then a 16 GB cloud server is enough.

## 2. Set it up

On the fresh server, as root:

```sh
# Firewall: SSH and web only
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Docker, and tools the scripts use
curl -fsSL https://get.docker.com | sh
apt-get install -y pbzip2 python3 tmux osmium-tool

# This folder
git clone https://github.com/<you>/convoy-comms.git /opt/blacktop
cd /opt/blacktop/infra/geo
chmod +x *.sh
cp .env.example .env
```

Edit `.env`:

- `GEO_DOMAIN`: for example `geo.blacktoplive.com`. Add a DNS **A record** for that name pointing at the server's IP before starting Caddy.
- `GEO_TOKEN`: the output of `openssl rand -hex 32`. Keep it; it goes in Supabase too.
- `GEO_SERVICES`: what this server runs. The recommended five are already there; see section 1 before adding `osrm` or `overpass`.
- The rest can stay as it is for the whole world.

**Photon's version:** `photon/Dockerfile` pins the Photon jar, and `PHOTON_DB_URL` is the matching prebuilt index. Before the first run, check [Photon's releases](https://github.com/komoot/photon/releases) and the index downloads they link to. If you move to a newer Photon, change both together, because an index only works with its own version family.

## 3. Build and start

The long steps run inside `tmux`, so they survive a dropped SSH session
(`tmux new -s geo`, then `tmux attach -t geo` to come back).

Run the lines for the services in your `GEO_SERVICES`. `./compose.sh` is
`docker compose` for those services only.

```sh
./build-valhalla.sh      # valhalla: routing tiles (most of a day for the planet); also cuts the spots files and builds the cells database when they're listed
./get-photon.sh          # photon: search index
./compose.sh run --rm weather sync copernicus_dem90 static   # weather: elevation data for the forecasts, once
./build-osrm.sh          # osrm only: the second routing engine (the same again, and 256 GB of memory for the planet)
./compose.sh up -d       # starts what's listed (overpass, if listed, downloads its database on first start)
./compose.sh ps
```

To rebuild the cameras and scenic spots on their own, from a download you already have: `./build-spots.sh path/to/region.osm.pbf`; the cells database the same way: `./build-cells.sh path/to/region.osm.pbf` (Docker builds its image the first time).

Check it, replacing the token and the domain:

```sh
T=your-token; D=geo.blacktoplive.com; A="Authorization: Bearer $T"
curl https://$D/health                                                                  # ok
curl -H "$A" -H "Content-Type: application/json" \
  -d '{"locations":[{"lat":51.5072,"lon":-0.1276},{"lat":51.7520,"lon":-1.2577}],"costing":"motorcycle"}' \
  https://$D/valhalla/route                                                             # a trip
curl -H "$A" "https://$D/spots/ready.json"                                               # when it was built, and how many cameras and spots
curl -H "$A" "https://$D/spots/cameras/283/359.json"                                     # central London's cameras
curl -H "$A" "https://$D/cells/ready"                                                    # when the cells database was built, roads and places
curl -H "$A" "https://$D/cells/roads?south=51.50&west=-0.13&north=51.51&east=-0.12"      # roads with "maxspeed" tags
curl -H "$A" "https://$D/cells/places?lat=51.5&lon=-0.12&radius_m=5000&amenities=fuel&limit=3"  # the three nearest fuel stations
curl -H "$A" "https://$D/osrm/route/v1/driving/-0.1276,51.5072;-1.2577,51.7520"        # "code":"Ok" (only with osrm)
curl -H "$A" "https://$D/photon/api?q=Silverstone&limit=1"                              # a place
curl -H "$A" --data-urlencode 'data=[out:json];node(51.5,-0.13,51.51,-0.12)[amenity=fuel];out 1;' \
  https://$D/overpass/api/interpreter                                                   # a fuel station (only with overpass)
curl -H "$A" "https://$D/weather/v1/forecast?latitude=51.5&longitude=-0.1&hourly=precipitation,weather_code,wind_gusts_10m&models=ecmwf_ifs025&forecast_hours=4"
                                                                                        # numbers, not nulls
curl "https://$D/photon/api?q=London"                                                   # unauthorized
```

If the weather check shows `null` for `weather_code`, add the variables it needs to `WEATHER_VARIABLES` in `.env`; Open-Meteo's self-hosting docs list them. Until then, alerts fall back to the public API.

## 4. Point Blacktop at it

Add three Edge Function secrets, in Lovable (Cloud, then Secrets) or in the Supabase dashboard (Edge Functions, then Secrets):

| Secret | Value |
| --- | --- |
| `GEO_SERVER_URL` | `https://geo.blacktoplive.com` |
| `GEO_SERVER_TOKEN` | the token from `.env` |
| `GEO_SERVICES` | the same list as in `.env`, e.g. `valhalla,photon,weather,spots,cells` |

Leave `GEO_SERVICES` out only if the server runs all seven: without it every service is tried on the server first.

Then redeploy `place-search` and `send-push`.

With the secrets set, routes come from Valhalla and twisty roads and loops are scored on its road data; search uses Photon; cameras and scenic spots come from the files; speed-limit cells and quick searches come from `cells`. With `osrm` as well, planning tries both engines and ETAs show as a window. Watch the requests arrive with `./compose.sh logs -f caddy`. Remove the secrets to go straight back to the public services.

To compare the twisty and loop planners on your own server:

```sh
GEO_SERVER_URL=https://geo.blacktoplive.com GEO_SERVER_TOKEN=… npm run routing:eval
```

## 5. Keep it fresh

- Overpass applies OpenStreetMap's changes every minute.
- The weather model re-syncs every 10 minutes.
- Routing, the cameras and scenic spots, the cells database, and search are rebuilt weekly from fresh data (whichever of them `GEO_SERVICES` lists), beside the live copies, then swapped in:

```sh
crontab -e
# Mondays 02:00 UTC
0 2 * * 1 /opt/blacktop/infra/geo/update.sh >> /var/log/blacktop-geo.log 2>&1
```

The previous builds stay in `data/valhalla-old`, `data/spots-old`, `data/cells/cells-old.db`, `data/osrm-old` and `data/photon-old` until the next update. To roll back, swap the folders and run `./compose.sh up -d --force-recreate valhalla photon` (the spots files need no restart; for cells, copy `cells-old.db` over `cells.db`, which it picks up by itself).

## Still public (and fine)

These are called from riders' phones (each phone has its own limits) or are
built for production traffic:

- **OpenFreeMap** map tiles;
- the **AWS** terrain tiles;
- **RainViewer** radar;
- **Esri** satellite imagery (check its terms for commercial use);
- the app's forecasts straight from the phone, which are **Open-Meteo**'s public API until `VITE_WEATHER_URL` points them here (its free tier is non-commercial: see "The app's forecasts");
- the pilot voice and video tools' **CDNs**;
- **Cloudflare TURN** for voice.

## The app's forecasts

Open-Meteo's public API is free for non-commercial use only. Every forecast the
app asks for on the phone goes through `src/lib/weatherApi.ts`, which uses this
server once the app is built with its address:

1. Run the `weather` service (`GEO_SERVICES` includes `weather`) and let it sync.
   `WEATHER_VARIABLES` must cover what the app asks for (the default in
   `docker-compose.yml` does: temperature, rain, snow, cloud, weather code, gusts
   and the wind's two components). After changing it, restart `weather-sync`.
2. Check the public forecast path answers without the token:
   `curl "https://$D/open-weather/v1/forecast?latitude=51.5&longitude=-0.1&hourly=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m&models=ecmwf_ifs025&forecast_hours=4"`
   should show numbers, not nulls. Anything else under `/open-weather` answers 404.
3. In Lovable, set the build variable `VITE_WEATHER_URL` to
   `https://<GEO_DOMAIN>/open-weather` (and `VITE_WEATHER_MODEL` if `WEATHER_MODEL`
   isn't `ecmwf_ifs025`), then republish.

From then on every forecast goes here first; if this server fails or hasn't
synced, that call goes to the public API and this server is left alone for a
minute. `/open-weather` needs no token, because an app can't keep one secret:
only the forecast endpoint is open there, read-only. Stock Caddy has no rate
limit; if strangers start using it, add the `caddy-ratelimit` module or put the
server behind Cloudflare. The model kept here has no chance of rain
(`precipitation_probability` is empty); the app then judges rain by the amount
forecast.
