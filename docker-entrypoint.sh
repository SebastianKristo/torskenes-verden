#!/bin/sh
# Kjører som root kun for å rette eierskap på /data, og bytter deretter til PUID:PGID.
set -e
PUID="${PUID:-1000}"; PGID="${PGID:-1000}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data/uploads
  chown -R "$PUID:$PGID" /data
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups "$@"
fi
exec "$@"
