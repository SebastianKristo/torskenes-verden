#!/bin/sh
# Kjører som root kun for å rette eierskap på /data, og bytter deretter til PUID:PGID.
set -e
PUID="${PUID:-1000}"; PGID="${PGID:-1000}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data/uploads
  # Prompt 85: en fil som ikke kan bytte eier (NFS med root_squash, skrivebeskyttet undermappe) skal ikke stoppe hele oppstarten
  # i en omstartsløkke (set -e). Serveren starter, og feilen står i loggen.
  chown -R "$PUID:$PGID" /data || echo "[entrypoint] Advarsel: kunne ikke sette eier $PUID:$PGID på alt i /data. Sjekk rettighetene på mappen." >&2
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups "$@"
fi
exec "$@"
