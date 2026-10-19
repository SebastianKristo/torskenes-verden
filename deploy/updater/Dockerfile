# Updater for «Oppdater nå» i Innstillinger → System. Se updater.sh og docker-compose.yml.
# docker:27-cli har docker, buildx og compose-pluginen. Kjører som root fordi den må bruke /var/run/docker.sock.
FROM docker:27-cli
RUN apk add --no-cache bash curl tar rsync jq coreutils
COPY updater.sh /usr/local/bin/updater.sh
RUN chmod 755 /usr/local/bin/updater.sh
ENTRYPOINT ["/usr/local/bin/updater.sh"]
