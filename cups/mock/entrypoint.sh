#!/bin/sh
set -eu

output_dir=/var/spool/printle-mock
mkdir -p "$output_dir"
chown lp:lp "$output_dir"

/usr/sbin/cupsd -f &
cups_pid=$!

cleanup() {
  kill -TERM "$cups_pid" 2>/dev/null || true
  wait "$cups_pid" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

attempt=0
until lpstat -r >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 50 ]; then
    echo "CUPS scheduler did not become ready" >&2
    exit 1
  fi
  sleep 0.1
done

create_queue() {
  queue=$1
  uri=$2
  lpadmin -p "$queue" -E -v "$uri" -m raw
  cupsaccept "$queue"
  cupsenable "$queue"
}

create_queue mock-success mockprint://success
create_queue mock-delay mockprint://delay
create_queue mock-cancel mockprint://cancel
create_queue mock-hold mockprint://hold
create_queue mock-stop mockprint://stop

wait "$cups_pid"
