# Blacktop routing server

Blacktop's own OSRM + Valhalla, so riders never hit the public demo servers'
rate limits. The app doesn't change: `place-search` uses this server when three
Supabase secrets are set and falls back to the public servers if it's down
(skipping it for a minute after a failure).

- **OSRM** (car profile): the default router. Turn-by-turn, and the twisty and
  loop scoring, which needs OSRM's per-segment speeds.
- **Valhalla**: routes with Route Preferences on (avoid motorways / tolls /
  ferries / unpaved) and for bicycles, e-bikes and e-scooters.
- **Caddy**: HTTPS with an automatic certificate, and a shared token so only
  the Edge Function can use the routers.

## 1. Pick the region and the server

Routing only works inside the map data you build. Start with where your riders
are and grow later (changing region is one line in `.env` plus a rebuild).

| Region (`REGION_PBF_URL`) | Download | RAM to build | Disk | Build time |
| --- | --- | --- | --- | --- |
| Great Britain | ~2 GB | 16 GB | 60 GB | under an hour |
| Britain and Ireland | ~2.5 GB | 16 GB | 60 GB | about an hour |
| Europe | ~30 GB | 128 GB (OSRM's extract is the hungry step) | 400 GB NVMe | most of a day |
| Planet | ~80 GB | 256 GB+ | 1 TB NVMe | a day or two |

These are rough; building needs far more memory than serving.

- **Britain and Ireland:** a Hetzner Cloud server with 16 GB RAM and 8 dedicated vCPUs (the CCX line) is plenty.
- **Europe:** a Hetzner dedicated server with 128 GB RAM and NVMe (the AX line).

Check Hetzner's current prices when you order. Pick a German or Finnish location: that's close to Supabase's EU region and to UK riders.

**Is it enough for 5,000 riders?** Yes, comfortably:

- Turn-by-turn asks for a route when a ride starts, and again only when the rider leaves the line (at most every 12 s), or when the stops change.
- OSRM answers in milliseconds and Valhalla in tens of milliseconds, so one 8-core box handles hundreds of routes a second.
- Twisty and loop requests are the heavy ones (dozens of candidate routes each), but they're occasional.
- The per-rider limit in `place-search` (60 a minute) still applies.

## 2. Set up the server

On a fresh Ubuntu 24.04 server, as root:

```sh
# Firewall: SSH and web only
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Docker
curl -fsSL https://get.docker.com | sh

# This folder
git clone https://github.com/<you>/convoy-comms.git /opt/blacktop
cd /opt/blacktop/infra/routing
chmod +x build.sh update.sh
cp .env.example .env
```

Edit `.env`:

- `ROUTING_DOMAIN`: for example `routing.blacktoplive.com`. Add a DNS **A record** for that name pointing at the server's IP before starting Caddy.
- `ROUTING_TOKEN`: the output of `openssl rand -hex 32`. Keep it; it goes in Supabase too.
- `REGION_PBF_URL`: the region from the table above.
- `VALHALLA_THREADS`: the number of CPU cores.

## 3. Build and start

```sh
./build.sh            # downloads the map and builds both routers (see times above)
docker compose up -d  # starts OSRM, Valhalla and Caddy
```

For long builds, run them inside `tmux` so they survive a dropped SSH session.

Check it (replace the token and domain):

```sh
T=your-token; D=routing.blacktoplive.com
curl https://$D/health                                                   # ok
curl -H "Authorization: Bearer $T" \
  "https://$D/osrm/route/v1/driving/-0.1276,51.5072;-1.2577,51.7520"    # "code":"Ok"
curl -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"locations":[{"lat":51.5072,"lon":-0.1276},{"lat":51.7520,"lon":-1.2577}],"costing":"motorcycle"}' \
  https://$D/valhalla/route                                              # a trip
curl "https://$D/osrm/route/v1/driving/-0.1276,51.5072;-1.2577,51.7520" # unauthorized
```

## 4. Point Blacktop at it

Add three Edge Function secrets, either in Lovable (Cloud, then Secrets) or in the Supabase dashboard (Edge Functions, then Secrets):

| Secret | Value |
| --- | --- |
| `ROUTING_OSRM_URL` | `https://routing.blacktoplive.com/osrm` |
| `ROUTING_VALHALLA_URL` | `https://routing.blacktoplive.com/valhalla` |
| `ROUTING_TOKEN` | the token from `.env` |

Then redeploy `place-search`. Plan a route in the app, and the server's logs
(`docker compose logs -f caddy`) show the requests. Remove the secrets to go
back to the public servers.

## 5. Keep the map fresh

OpenStreetMap changes daily; a weekly rebuild is plenty. `update.sh` builds
into new folders while the old data keeps serving, then restarts onto it (a
few seconds, covered by the public fallback):

```sh
crontab -e
# Mondays 03:00 UTC
0 3 * * 1 /opt/blacktop/infra/routing/update.sh >> /var/log/blacktop-routing.log 2>&1
```

The previous build stays in `data/osrm-old` and `data/valhalla-old`. To roll
back, swap the folders and run `docker compose up -d --force-recreate osrm valhalla`.

## Still on public servers

These still use shared public services with their own fair-use limits. They're
the next things to self-host as riders grow:

- **Search** (Nominatim, max 1 request a second, and Photon): the first to
  strain at scale. Photon is the easy one to self-host (one container plus a
  downloadable index).
- **Overpass** (speed cameras, map POIs, scenic loops, the Track Day road
  picker): heavy to self-host; cache first.
- **Map tiles** (OpenFreeMap): built for production use; fine for now.
