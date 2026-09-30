#!/usr/bin/env bash
# Downloads the prebuilt Photon search index (PHOTON_DB_URL) into a new folder,
# then swaps it in. Serving isn't touched until the container is recreated
# (update.sh does both); the previous index is kept as data/photon-old until the next download.
set -euo pipefail
cd "$(dirname "$0")"
set -a
. ./.env
set +a

mkdir -p data
# Last week's rollback copy goes first, so only two copies exist at any time.
rm -rf data/photon-old data/photon-next
mkdir -p data/photon-next
echo "==> Downloading and unpacking $PHOTON_DB_URL (the planet index is large)"
# Streamed straight into tar, so the compressed file never needs its own space.
# pbzip2 unpacks on every core when it's installed.
if command -v pbzip2 >/dev/null; then
  curl -fL --retry 3 "$PHOTON_DB_URL" | pbzip2 -dc | tar -x -C data/photon-next
else
  curl -fL --retry 3 "$PHOTON_DB_URL" | tar -xj -C data/photon-next
fi

echo "==> Swapping in the new index"
if [ -d data/photon ]; then mv data/photon data/photon-old; fi
mv data/photon-next data/photon
echo "==> Done. Serve it with: docker compose up -d --force-recreate photon"
