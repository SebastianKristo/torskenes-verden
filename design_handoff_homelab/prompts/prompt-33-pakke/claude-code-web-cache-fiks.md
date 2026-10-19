# Web: ny versjon lastes ikke uten Cmd+Shift+R

## Feil
Etter en deploy viser nettleseren fortsatt den gamle versjonen, helt til man tvinger ny lasting (Cmd+Shift+R). Typiske årsaker: `index.html` caches, service workeren serverer gammel app-shell, eller JS/CSS har faste filnavn uten hash.

## Fiks
1. **Cache-headere** (Caddy/Nginx/Cloudflare):
   - `index.html`, `/`, alle HTML-ruter, `sw.js`, `manifest.webmanifest`, `version.json`: `Cache-Control: no-cache, must-revalidate` (eventuelt `no-store` for `sw.js`).
   - Hashede assets (`/assets/app.3f9c2a.js`, `.css`, fonter, bilder): `Cache-Control: public, max-age=31536000, immutable`.
   - Cloudflare: Cache Rule «Bypass cache» for HTML, `sw.js` og `version.json`. Etter deploy: purge `/`, `/index.html`, `/sw.js`, `/version.json` (API-kall i deploy-skriptet).
2. **Filnavn med hash** for all JS/CSS (Vite gjør dette som standard: `build.rollupOptions.output.entryFileNames: 'assets/[name].[hash].js'`). Ingen `app.js?v=1` med fast navn.
3. **Service worker** (hvis PWA):
   - Nettverk først for navigasjon/HTML. Cache først bare for hashede assets.
   - `self.skipWaiting()` i `install` og `clients.claim()` i `activate`. Slett gamle cacher i `activate` (cache-navn med build-id).
   - I klienten: `registration.update()` ved oppstart, når fanen får fokus (`visibilitychange`) og hvert 10. minutt. Ved `controllerchange` → `location.reload()` én gang (beskytt mot løkke med et flagg).
4. **Versjonssjekk** (i tillegg, så åpne faner også oppdateres):
   - Bygget skriver `/version.json` = `{ "build": "<git-sha>", "version": "4.22", "time": "…" }`, og samme `build` bakes inn i appen (`import.meta.env.VITE_BUILD`).
   - Appen henter `/version.json?ts=…` med `cache: 'no-store'` ved oppstart, ved fokus og hvert 5. minutt. Er `build` ulik: vis banner nederst «Ny versjon av Nordlys er klar · **Last inn på nytt**» (samme stil som oppdateringsbanneret). Trykk → `location.reload()`.
   - Står brukeren ikke midt i et skjema (ingen ulagrede endringer) og fanen er skjult: last inn på nytt automatisk når fanen blir synlig igjen.
5. **API-svar**: `Cache-Control: no-store` på `/api/*` som standard, så data ikke blir gamle.

## Test
- Deploy → la en fane stå åpen → innen 5 min (eller ved fokus) kommer banneret, og ett trykk gir ny versjon. Ingen Cmd+Shift+R.
- Ny fane etter deploy laster ny versjon med en gang.
- `curl -I https://…/` viser `no-cache`. `curl -I https://…/assets/app.<hash>.js` viser `immutable`.
