# Navigasjon uten ny sidelasting (prompt 87)

Ønsket (2026-11-13): et trykk på en fane (Hjem → Studie) eller i sidemenyen i FinansHub (Oversikt → Boliger) skal ikke
oppføre seg som om siden lastes på nytt. Spesifikasjon: `claude-code-web-navigasjon-uten-reload.md`.

Appen er ren JavaScript med hash-ruting (`#/studie`), ikke React. Punktene i spesifikasjonen er derfor oversatt til det
som faktisk skjer i koden.

## Hva som var galt (målt i Playwright, 1440 × 900 og 390 × 844)

| Måling per fanebytte | Før | Etter |
| --- | --- | --- |
| Homelab: dokument-forespørsler | 0 | 0 |
| Homelab: toppmeny og fanelinje byttet ut | nei (men bakgrunnsmenyen i topplinjen ble tegnet på nytt hver gang, 6 noder) | nei, og ingen noder tegnes på nytt |
| Homelab: fotovinduet (hero) fjernet og laget på nytt | ja, hver gang | nei mellom vanlige sider; til og fra Dashboard lages rammen på nytt, men bildelaget flyttes over |
| Homelab: fotovinduet usynlig eller delvis gjennomsiktig | 245–325 ms (tonet inn fra 0 sammen med siden) | 0 ms |
| Homelab: overgang på innholdet | 280 ms, hele visningen | 220 ms, bare innholdet; av ved «Reduser bevegelse» |
| Homelab: kall for bakgrunnen | 2 ved første bytte (Oslo-bildet ble byttet midt i fanebyttet), ellers 0 | 0 |
| Homelab: tilbake-knappen | samme posisjon | samme posisjon |
| FinansHub: sidemeny, merke, topp og søkefelt | fjernet og laget på nytt to ganger per trykk | de samme elementene blir stående |
| FinansHub: scroll etter Oversikt (600 px) → Boliger | 0 (toppen av siden) | toppen av innholdsområdet (87–110 px), toppen hopper ikke inn igjen |
| FinansHub: sidemenyens egen scroll (lavt vindu) | nullstilt | beholdt |
| FinansHub: tilbake-knappen | samme posisjon | samme posisjon |

Ingen av trykkene var ekte sidelastinger. Det som ga følelsen av «lastes på nytt» var at fotovinduet og (i FinansHub) hele
skallet ble revet ned og bygget opp igjen, at alt ble tonet inn fra blankt, og at FinansHub hoppet til toppen.

## Hva som er gjort

- **Homelab (`public/js/app.js`, `swapView`)**: fotovinduet regnes som en del av skallet. Mellom sider med lavt vindu byttes
  bare kicker og tittel; innholdet under byttes. Til og fra Dashboard (høyt vindu) overtar det nye vinduet bildelaget som
  allerede er malt.
- **Overgang (`public/js/web52.js`)**: bare innholdet tones og skyves inn, 220 ms. Ved `prefers-reduced-motion` er den av.
- **Topplinjen (`public/js/hltheme.js`)**: bakgrunnsmenyen tegnes bare når innholdet er endret.
- **Oslo-bakgrunnen (`public/js/web41.js`)**: tidsrommet (morgen/dag/kveld/natt) regnes på nytt når været kommer med
  soloppgang og solnedgang, ikke ved første fanebytte.
- **FinansHub (`public/finans/js/desktop.js`, `paintShell87`)**: sidemenyen og toppen flettes inn i elementene som står
  (bare det som er endret, f.eks. `aria-current`), og bare innholdet under toppen byttes.
- **Scroll (`public/js/scrollmem.js`)**: `history.scrollRestoration = 'manual'` (fra før). Ny modul åpner øverst. Ny side i
  samme modul (FinansHub) åpner på `min(nåværende, toppen av innholdsområdet)`. Tilbake og frem gir posisjonen man hadde.
  Posisjonen holdes i 1,5 s mens innholdet lastes, men slippes straks man selv ruller.
- **Data**: FinansHub tegner siden straks med det som allerede er hentet og oppdaterer når svaret kommer. Homelab-sidene
  har egne mellomlagre (Studie og Hjem gjorde ingen kall ved andre besøk i målingen).

## Homelab → Økonomi er fortsatt en ekte sidelasting

Fanen «Økonomi» peker til `/finans/`, som er FinansHub: en egen app med eget dokument, egne stilark, egen service worker og
egen innlogging i PWA-en. Målt mot testserveren: ett dokument hver vei, ca. 1,8 s til FinansHub er tegnet og ca. 2,1 s
tilbake til Homelab (uten service worker og uten mellomlager i nettleseren; i vanlig bruk er filene bufret).

Vurdering: å slå appene sammen til én er en ombygging av to skall og to sett med stilark som begge bruker korte, generelle
klassenavn, og det er ikke gjort. Det som finnes for å gjøre overgangen kort: modulene og stilarket forhåndslastes når
pekeren kommer på lenken (`public/js/finpreload.js`), oversikten hentes parallelt med modulene (`loader.js`), og lasteskjermen
har samme tema som Homelab, så det ikke blir en hvit ramme. Innenfor hver av appene er ingen trykk sidelastinger.

## Ikke endret

- FinansHub på mobil (PWA-en i Papir-design) har sin egen sidebunke med scroll per side og er ikke rørt.
- Undersider som tegner seg selv inni en side (Domener: velg domene, Studie: faner, Media, Innstillinger) rørte ikke skallet
  fra før og er ikke endret.

## Test

- `test/p87-nav.test.js` (i `npm test`): scroll-reglene i en liten falsk nettleser og reglene i koden.
- `test/e2e51/nav87.e2e.mjs` (`npm run test:e2e`): testlista fra spesifikasjonen i Chromium.
