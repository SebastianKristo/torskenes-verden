# Proton Mail Bridge oppdaterer seg selv til nyere versjoner (lagret i /root), og de krever libfido2,
# som mangler i grunnimaget. Uten den krasjer Bridge med «libfido2.so.1: cannot open shared object file».
FROM shenxn/protonmail-bridge:latest
RUN apt-get update \
 && apt-get install -y --no-install-recommends libfido2-1 \
 && rm -rf /var/lib/apt/lists/*
