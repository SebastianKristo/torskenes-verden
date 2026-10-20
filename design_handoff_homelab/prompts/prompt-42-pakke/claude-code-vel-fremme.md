# Hjemlys får nytt navn: **Vel fremme** + kortene i appen

Ønske 2026-10-20: «legg til slike kort i hjemlys-menyen, og lag et nytt navn, apple kalte det check in» (vedlegg `uploads/Screenshot 2026-10-20 at 21.43.53.png`: «AKTIVE I FAMILIEN» + Glimt-forslaget).
Fasit: `Familie.dc.html` → fanen **Vel fremme** (`isHjl`, `hl.others`, `hl.sugOn`).

## Navn
- **Vel fremme** (fra «kom vel fram»). Apples tilsvarende funksjon heter Check In. Navnet sier hva det gjelder: å si fra at man er trygt fremme.
- Erstatt «Hjemlys» overalt i UI: fane i Familie, tittel, varsler («Vel fremme: Ingrid er hjemme»), widgets, Live Activity / Dynamic Island, Glimt-tekster og innstillinger. Ikonet (varm glødende prikk) beholdes. Interne nøkler (`hjemlys`) kan bli stående.
- Varseltekster: «Ingrid er vel fremme 23:21», «Pål er 15 min forsinket», «Kari sjekket inn · Bursdag hos Mari».

## Kortene i Vel fremme-fanen (som i designet)
1. **Aktive i familien**, gruppert kort med én rad per person som har en aktiv økt:
   - Avatar (initialer/bilde), tittel («Ingrid er på vei hjem» / «Pål er 15 min forsinket» / «Kari sjekket inn»), undertekst («Hjemme ca. 23:24 · i rute», «Trykk for siste posisjon og ring», «Bursdag hos Mari · 19:42») og statusprikk: grønn = i rute, rød = forsinket, gul = sjekket inn.
   - Trykk åpner personens økt: kart med siste posisjon, **Ring**, **Send melding**, **Avslutt for dem** (admin).
   - Oppdateres live (WebSocket/push). Rekkefølge: forsinket først, så på vei, så sjekket inn.
2. **Glimt-forslag**: kort med Glimt-merke og «nå», et spørsmål basert på kalender og posisjon («Kinoen er ferdig. Skal jeg si fra til Ingrid og Pål når du er hjemme?»), en linje med rute («Trikk 19 fra Majorstuen · hjemme ca. 22:09») og knappene **Ja, start** / **Ikke nå**. «Ja, start» starter en økt med de foreslåtte personene og ruten.
- Kortene ligger under valgene «Hva vil du si fra om?», med samme kortstil (radius 18–20, `--k-card`) på iOS, Android og web.

## Fanelinja på Familie (ønske 2026-10-20: «i familie-siden ikke vis mer i navbaren»)
- På Familie-siden har fanelinja bare **Kart · Soner · Helse · Vel fremme**, uten «⋯ Mer». Man går tilbake med «‹ Hjem» øverst. Gjelder iOS og Android.
- **Toppen i Vel fremme** (ønske 2026-10-20: «ordne toppen her»): innholdet i Vel fremme-fanen (tittelen med lys-prikken og «‹ Tilbake · Hvem får beskjed? · Neste») starter **under** toppbildet, med 16 px luft, og overlapper ikke bildet. Bare Kart-fanen har verktøyraden som ligger delvis over bildet.
