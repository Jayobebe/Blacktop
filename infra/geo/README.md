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

Caddy sits in front with an automatic HTTPS certificate and a shared token, so
only Blacktop's Edge Functions can use it.

**Nothing changes in the app until the Supabase secrets are set.** Until then
everything uses the public services exactly as before. Once they're set, each
service the server runs falls back to its public equivalent if ours fails (down
or rebuilding) and ours is skipped for that service for a minute. A service the
server doesn't run is never asked for.
Route weather on the phone still calls Open-Meteo straight from each rider's
phone (per-phone limits, so not a scale problem).

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
| `osrm` (planet, car) | ~150–250 GB, plus ~80 GB while building | ~256 GB to build | most of a day |
| `overpass` (planet clone) | ~300–400 GB | moderate | several hours to download, then live |

**Recommended: `valhalla,photon,weather,spots`.** That is every route and
turn-by-turn, twisty and loop scoring on real road data, place search without
the public one-request-a-second ceiling, weather alerts off the non-commercial
public API, and speed cameras and scenic viewpoints without the public Overpass
servers' timeouts. Roughly 250–400 GB of disk and 64 GB of memory: a mid-size
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
  at scale were cameras and scenic spots, which `spots` now covers from the
  download the routing build already makes. The Track Day road picker (no
  longer offered) and the map's category searches still go to the public
  Overpass servers, with Photon as their fallback.

Prices moved a lot in 2026 (Hetzner roughly tripled its dedicated servers in
June), so compare before ordering: Hetzner's AX line and its server auction,
OVH, and others. Ubuntu 24.04. Choose a location close to Supabase's EU region.

One box is enough for 5,000 riders:

- **Turn-by-turn** asks for a route when a ride starts, and again only when the rider leaves the line (at most every 12 s).
- **Speed:** Valhalla answers in tens of milliseconds, and Photon is similar. Cameras and scenic spots are a few small files a request.
- **Twisty and loop planning** are the heaviest calls (dozens of routes each), but they're occasional.
- The per-rider limit in `place-search` (60 calls a minute) still applies.

To test cheaply first, use a region: set `REGION_PBF_URL` to a Geofabrik
extract and `GEO_SERVICES=valhalla,spots` (search and weather stay public).
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
- `GEO_SERVICES`: what this server runs. The recommended four are already there; see section 1 before adding `osrm` or `overpass`.
- The rest can stay as it is for the whole world.

**Photon's version:** `photon/Dockerfile` pins the Photon jar, and `PHOTON_DB_URL` is the matching prebuilt index. Before the first run, check [Photon's releases](https://github.com/komoot/photon/releases) and the index downloads they link to. If you move to a newer Photon, change both together, because an index only works with its own version family.

## 3. Build and start

The long steps run inside `tmux`, so they survive a dropped SSH session
(`tmux new -s geo`, then `tmux attach -t geo` to come back).

Run the lines for the services in your `GEO_SERVICES`. `./compose.sh` is
`docker compose` for those services only.

```sh
./build-valhalla.sh      # valhalla: routing tiles (most of a day for the planet); also cuts the spots files when spots is listed
./get-photon.sh          # photon: search index
./compose.sh run --rm weather sync copernicus_dem90 static   # weather: elevation data for the forecasts, once
./build-osrm.sh          # osrm only: the second routing engine (the same again, and 256 GB of memory for the planet)
./compose.sh up -d       # starts what's listed (overpass, if listed, downloads its database on first start)
./compose.sh ps
```

To rebuild the cameras and scenic spots on their own, from a download you already have: `./build-spots.sh path/to/region.osm.pbf`.

Check it, replacing the token and the domain:

```sh
T=your-token; D=geo.blacktoplive.com; A="Authorization: Bearer $T"
curl https://$D/health                                                                  # ok
curl -H "$A" -H "Content-Type: application/json" \
  -d '{"locations":[{"lat":51.5072,"lon":-0.1276},{"lat":51.7520,"lon":-1.2577}],"costing":"motorcycle"}' \
  https://$D/valhalla/route                                                             # a trip
curl -H "$A" "https://$D/spots/ready.json"                                               # when it was built, and how many cameras and spots
curl -H "$A" "https://$D/spots/cameras/283/359.json"                                     # central London's cameras
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
| `GEO_SERVICES` | the same list as in `.env`, e.g. `valhalla,photon,weather,spots` |

Leave `GEO_SERVICES` out only if the server runs all six: without it every service is tried on the server first.

Then redeploy `place-search` and `send-push`.

With the secrets set, routes come from Valhalla and twisty roads and loops are scored on its road data; search uses Photon; cameras and scenic spots come from the files. With `osrm` as well, planning tries both engines and ETAs show as a window. Watch the requests arrive with `./compose.sh logs -f caddy`. Remove the secrets to go straight back to the public services.

To compare the twisty and loop planners on your own server:

```sh
GEO_SERVER_URL=https://geo.blacktoplive.com GEO_SERVER_TOKEN=… npm run routing:eval
```

## 5. Keep it fresh

- Overpass applies OpenStreetMap's changes every minute.
- The weather model re-syncs every 10 minutes.
- Routing, the cameras and scenic spots, and search are rebuilt weekly from fresh data (whichever of them `GEO_SERVICES` lists), beside the live copies, then swapped in:

```sh
crontab -e
# Mondays 02:00 UTC
0 2 * * 1 /opt/blacktop/infra/geo/update.sh >> /var/log/blacktop-geo.log 2>&1
```

The previous builds stay in `data/valhalla-old`, `data/spots-old`, `data/osrm-old` and `data/photon-old` until the next update. To roll back, swap the folders and run `./compose.sh up -d --force-recreate valhalla photon` (the spots files need no restart).

## Still public (and fine)

These are called from riders' phones (each phone has its own limits) or are
built for production traffic:

- **OpenFreeMap** map tiles;
- the **AWS** terrain tiles;
- **RainViewer** radar;
- **Esri** satellite imagery (check its terms for commercial use);
- route weather straight from the phone, which is **Open-Meteo**'s public API (fine on rate, but its free tier is non-commercial; point it at this server when you're ready);
- the pilot voice and video tools' **CDNs**;
- **Cloudflare TURN** for voice.
