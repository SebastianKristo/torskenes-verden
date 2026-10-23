# Familie → Soner: ikke vis kartet

Ønske 2026-10-20: «ikke vis kartet i soner meny» (vedlegg `uploads/Screenshot 2026-10-20 at 21.42.49.png`).
Fasit: `Familie.dc.html` (`showMap`, `snAdd`).

- Fanen **Soner** viser bare lista over soner (Hjem, Skole, Mormor …) med personer, varsler, rediger og slett. Ingen kart og ingen verktøyrad («Vis alle / ↻») over.
- Øverst i Soner: **+ Ny sone på kartet**. Trykk viser kartet midlertidig i plasseringsmodus (trådkors, radius, navn, farge, ikon). Når sonen er lagret eller avbrutt, skjules kartet igjen.
- «Vis på kart» på en sone åpner fanen **Kart** sentrert på sonen.
- Kart-fanen er uendret. Gjelder iOS, Android og web.

## Velg hvilket som helst ikon for en sone (ønske 2026-10-20: «la meg velge hvilke som helst ikoner»)
- Ikonvelgeren (ny og rediger sone) har et **søkefelt** («Søk i ikoner, f.eks. båt, kirke, ski …»). Den viser først 18 vanlige ikoner + **Vis alle** (50 i designet: transport, helse, mat, fritid, natur, jobb, reise, høytid …), og «N treff» / «Ingen ikoner heter …».
- I appen: tilby hele **SF Symbols** (iOS) / **Material Symbols** (Android) med norske søkeord og synonymer («hytte» → house.lodge / cabin, «trening» → dumbbell / fitness_center). Lagre som `{set, name}` med fallback til Homelab-ikonet på andre plattformer.
- Ekstra: **bokstav eller emoji** som ikon (ett tegn). Sist brukte ikoner vises først.

## Større ikonbiblioteker (ønske 2026-10-20: «finn noen større ikonbiblioteker jeg kan søke etter»)
I designet: når man skriver i ikonsøket, søker Familie også i **Lucide** (~1 600) og **Tabler** (~5 900) via Iconify-API-et og viser treffene under de innebygde («36 fra Lucide og Tabler · søkte «boat»»). Norske ord oversettes først (båt → boat, kirke → church, hytte → cabin, trening → barbell …). Valgt ikon lagres på sonen som `ic:'ify:lucide:sailboat'` + `icp` (path-data), så det vises uten nett.

I appen, søkbare biblioteker (alle åpne lisenser, kan brukes kommersielt):
- **Iconify** (api.iconify.design): 200 000+ ikoner fra 150+ sett, ett søke-API (`/search?query=…&prefixes=…`) og SVG/JSON per ikon. Bruk det som felles søk. Begrens til stroke-sett som passer stilen: `lucide`, `tabler`, `iconoir`, `ph` (Phosphor regular), `solar` (linear).
- **Lucide** (ISC): ~1 600, stroke 2, 24 × 24. Ligner dagens Homelab-ikoner mest.
- **Tabler Icons** (MIT): ~5 900, stroke 2, 24 × 24.
- **Phosphor** (MIT): ~9 000 (1 500 × 6 vekter).
- **Material Symbols** (Apache 2.0): ~3 900, variabel font. Naturlig valg på Android.
- **SF Symbols** (Apple, bare på Apple-plattformer): 6 000+. Naturlig på iOS, men kan ikke vises på Android/web. Lagre derfor alltid en Iconify-fallback.
- Lag en norsk synonymliste (`icon_synonyms_nb.json`) og send oversatt søk. Cache treff lokalt. Lagre valgt ikon som SVG-path i databasen, så sonen ser lik ut på iOS, Android og web.
