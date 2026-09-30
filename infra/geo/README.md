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

Caddy sits in front with an automatic HTTPS certificate and a shared token, so
only Blacktop's Edge Functions can use it.

**Nothing changes in the app until two Supabase secrets are set.** Until then
everything uses the public services exactly as before. Once they're set, each
service falls back to its public equivalent if ours fails (down, rebuilding,
not installed yet) and ours is skipped for that service for a minute.
Route weather on the phone still calls Open-Meteo straight from each rider's
phone (per-phone limits, so not a scale problem).

## 1. The server

Everything here is sized for the whole world. These are rough figures; check
them against the current downloads, and Hetzner's current prices, when you order.

| | Disk | Build / first start |
| --- | --- | --- |
| Valhalla (planet tiles) | ~100 GB, plus ~80 GB of map data while building | most of a day |
| OSRM (planet, car) | ~150–250 GB, plus ~80 GB of map data while building | most of a day, and far more memory than serving |
| Photon (planet index) | ~100–200 GB unpacked | a few hours to download and unpack |
| Overpass (planet clone) | ~300–400 GB | several hours to download, then live |
| Open-Meteo (one global model) | ~10–30 GB | minutes, then live |

**Recommended:** a Hetzner dedicated server (the AX line) with:

- 16 cores and 256 GB RAM, because OSRM's planet build is the hungry step (Valhalla's build and all the serving are far lighter);
- 2 × ~2 TB NVMe.

With 128 GB, OSRM's planet build needs a large swap file and runs much slower. Either build it on a bigger machine rented for a day and copy the `data/osrm` folder across, or give OSRM a continent and let Valhalla cover the world (the app falls back to one engine wherever OSRM has no roads).

Ubuntu 24.04. Choose a German or Finnish location, close to Supabase's EU region.

One box is enough for 5,000 riders:

- **Turn-by-turn** asks for a route when a ride starts, and again only when the rider leaves the line (at most every 12 s).
- **Speed:** Valhalla answers in tens of milliseconds, and Photon and Overpass (bounding-box queries) are similar.
- **Twisty and loop planning** are the heaviest calls (dozens of routes each), but they're occasional.
- The per-rider limit in `place-search` (60 calls a minute) still applies.

To test cheaply first, use a region: set `REGION_PBF_URL` to a Geofabrik
extract, `OVERPASS_MODE=init` with `OVERPASS_PLANET_URL` for the same region,
and skip Photon (search falls back to the public servers). Then a 16 GB
Hetzner Cloud server is enough.

## 2. Set it up

On the fresh server, as root:

```sh
# Firewall: SSH and web only
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Docker, and tools the scripts use
curl -fsSL https://get.docker.com | sh
apt-get install -y pbzip2 python3 tmux

# This folder
git clone https://github.com/<you>/convoy-comms.git /opt/blacktop
cd /opt/blacktop/infra/geo
chmod +x *.sh
cp .env.example .env
```

Edit `.env`:

- `GEO_DOMAIN`: for example `geo.blacktoplive.com`. Add a DNS **A record** for that name pointing at the server's IP before starting Caddy.
- `GEO_TOKEN`: the output of `openssl rand -hex 32`. Keep it; it goes in Supabase too.
- The rest can stay as it is for the whole world.

**Photon's version:** `photon/Dockerfile` pins the Photon jar, and `PHOTON_DB_URL` is the matching prebuilt index. Before the first run, check [Photon's releases](https://github.com/komoot/photon/releases) and the index downloads they link to. If you move to a newer Photon, change both together, because an index only works with its own version family.

## 3. Build and start

The long steps run inside `tmux`, so they survive a dropped SSH session
(`tmux new -s geo`, then `tmux attach -t geo` to come back).

```sh
./build-valhalla.sh      # routing tiles (most of a day for the planet)
./build-osrm.sh          # the second routing engine (the same again)
./get-photon.sh          # search index
docker compose run --rm weather sync copernicus_dem90 static   # elevation data for the forecasts, once
docker compose up -d     # starts everything; Overpass downloads its database on first start
docker compose logs -f overpass   # watch it; it's ready when it starts applying updates
```

Check it, replacing the token and the domain:

```sh
T=your-token; D=geo.blacktoplive.com; A="Authorization: Bearer $T"
curl https://$D/health                                                                  # ok
curl -H "$A" -H "Content-Type: application/json" \
  -d '{"locations":[{"lat":51.5072,"lon":-0.1276},{"lat":51.7520,"lon":-1.2577}],"costing":"motorcycle"}' \
  https://$D/valhalla/route                                                             # a trip
curl -H "$A" "https://$D/osrm/route/v1/driving/-0.1276,51.5072;-1.2577,51.7520"        # "code":"Ok"
curl -H "$A" "https://$D/photon/api?q=Silverstone&limit=1"                              # a place
curl -H "$A" --data-urlencode 'data=[out:json];node(51.5,-0.13,51.51,-0.12)[amenity=fuel];out 1;' \
  https://$D/overpass/api/interpreter                                                   # a fuel station
curl -H "$A" "https://$D/weather/v1/forecast?latitude=51.5&longitude=-0.1&hourly=precipitation,weather_code,wind_gusts_10m&models=ecmwf_ifs025&forecast_hours=4"
                                                                                        # numbers, not nulls
curl "https://$D/photon/api?q=London"                                                   # unauthorized
```

If the weather check shows `null` for `weather_code`, add the variables it needs to `WEATHER_VARIABLES` in `.env`; Open-Meteo's self-hosting docs list them. Until then, alerts fall back to the public API.

## 4. Point Blacktop at it

Add two Edge Function secrets, in Lovable (Cloud, then Secrets) or in the Supabase dashboard (Edge Functions, then Secrets):

| Secret | Value |
| --- | --- |
| `GEO_SERVER_URL` | `https://geo.blacktoplive.com` |
| `GEO_SERVER_TOKEN` | the token from `.env` |

Then redeploy `place-search` and `send-push`.

With the secrets set, routes come from Valhalla, twisty roads and loops are planned on both engines and scored on Valhalla's road data, ETAs show as a window from both engines, and search uses Photon. Watch the requests arrive with `docker compose logs -f caddy`. Remove the secrets to go straight back to the public services.

To compare the twisty and loop planners on your own server:

```sh
GEO_SERVER_URL=https://geo.blacktoplive.com GEO_SERVER_TOKEN=… npm run routing:eval
```

## 5. Keep it fresh

- Overpass applies OpenStreetMap's changes every minute.
- The weather model re-syncs every 10 minutes.
- Both routing engines and search are rebuilt weekly from fresh data, beside the live copies, then swapped in:

```sh
crontab -e
# Mondays 02:00 UTC
0 2 * * 1 /opt/blacktop/infra/geo/update.sh >> /var/log/blacktop-geo.log 2>&1
```

The previous builds stay in `data/valhalla-old`, `data/osrm-old` and `data/photon-old` until the next update. To roll back, swap the folders and run `docker compose up -d --force-recreate valhalla osrm photon`.

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
