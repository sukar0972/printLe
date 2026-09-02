FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 cups-client cups-ipp-utils ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.py /app/server.py
RUN useradd --system --uid 10001 --create-home printnode \
 && mkdir -p /var/lib/print-node \
 && chown -R printnode:printnode /var/lib/print-node
USER printnode
EXPOSE 8080
CMD ["python3", "/app/server.py"]
