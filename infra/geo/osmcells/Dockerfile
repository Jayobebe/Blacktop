# The cells service (build.py makes the database, serve.py answers from it). osmium-tool for
# build-cells.sh's pre-filter, pyosmium for build.py; serve.py needs only Python itself.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends osmium-tool && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir osmium==4.0.2
WORKDIR /app
COPY build.py serve.py ./
EXPOSE 8090
CMD ["python3", "serve.py", "/data/cells.db", "8090"]
