#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /absolute/path/to/empty-backup-directory" >&2
  exit 2
fi

destination=$1
case "$destination" in /*) ;; *) echo "Backup destination must be an absolute path" >&2; exit 2;; esac
if [ -e "$destination" ] && [ "$(find "$destination" -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1)" ]; then
  echo "Backup destination must be empty" >&2
  exit 2
fi
mkdir -p "$destination"

server_id=$(docker compose ps -aq server)
cups_id=$(docker compose ps -aq cups)
if [ -z "$server_id" ] || [ -z "$cups_id" ]; then
  echo "Start the printLe stack before backing it up" >&2
  exit 1
fi

restart() { docker compose start cups print-node server >/dev/null 2>&1 || true; }
trap restart EXIT INT TERM
docker compose stop server print-node cups >/dev/null
docker compose exec -T postgres pg_dump --username printle --dbname printle --format custom > "$destination/database.dump"
docker cp "$server_id:/var/lib/printle/jobs" "$destination/jobs" >/dev/null
docker cp "$cups_id:/etc/cups" "$destination/cups" >/dev/null
docker inspect --format '{{.Image}}' "$server_id" > "$destination/server-image.txt"
date -u +%FT%TZ > "$destination/created-at.txt"
restart
trap - EXIT INT TERM
echo "Backup written to $destination"
