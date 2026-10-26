# Sporing: kilder og transportører flyttes til Innstillinger

Ønske 2026-10-26: «disse tingene i sporing kan ligge i innstillinger» (vedlegg `uploads/Screenshot 2026-10-26 at 14.48.14.png`: KILDER og TRANSPORTØRER nederst på Sporing).
Fasit: `Innstillinger Web.dc.html` → Moduler → **Sporing** (`spVals`), `Homelab Papir Web.dc.html` → Sporing.

## Ny side: Innstillinger → Moduler → Sporing
Ikon: pakke (oransje `#A8661A`), undertekst «Kilder, transportører og varsler». Ligger mellom Ruter og Studie.
- **KILDER** (overskrift høyre: «Sist sjekket 14:47 · Sjekk nå»)
  - Kilde: e-post (Proton) · «1 funnet i innboksen» · bryter
  - Kilde: Finn-handler · «0 fra handler» · bryter
  - Arkiver leverte automatisk · «Leverte pakker flyttes til arkivet» · bryter
  - Varsler for pakker · «Ny pakke, klar for henting, ute for levering, forsinket og levert» → Innstillinger → Varsler
- **TRANSPORTØRER** (høyre: «Nøkler i Integrasjoner ›»)
  - Posten og Bring, PostNord, DHL, UPS, 17TRACK med logo, beskrivelse og status (grønn «Tilkoblet» / oransje «Mangler nøkkel»). Trykk åpner nøkkelen i Integrasjoner.
- Samme radstil som de andre modulsidene (hvite kort, radius 14, mono-overskrift, 58 px rader).
- Lagres i `papir_spor_set` = `{mail, finn, arch}` per bruker, synkes til serveren. «Sjekk nå» kjører innhentingen fra e-post/Finn med en gang.
- Søk i Innstillinger finner: sporing, pakke, transportør, postnord, bring, dhl, ups, 17track, proton, arkiv.

## Sporing-siden
- Hele KILDER- og TRANSPORTØRER-blokken fjernes fra Sporing (web og mobil).
- I stedet én rad nederst: «Kilder, transportører og varsler · E-post, Finn, arkivering og API-nøkler ligger i Innstillinger · **Innstillinger ›**». Trykk åpner Innstillinger direkte på Sporing (`start="sporing"`).
- Mobil: ⚙ i Sporing-toppen åpner også Innstillinger → Sporing (ikke eget ark lenger).
