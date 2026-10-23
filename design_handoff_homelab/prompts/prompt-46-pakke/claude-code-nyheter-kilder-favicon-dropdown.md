# Nyhetskilder (Innstillinger → Nyheter → Adresser): favicon + kategori som nedtrekksmeny

Skjermbilder: `uploads/Screenshot 2026-10-23 at 14.16.20.png`, `uploads/Screenshot 2026-10-23 at 14.16.48.png`
Fasit: `Nyhetsleser.dc.html` → listen «ADRESSER» (`feeds`: `fav`, `favErr`, `setCat`, `catOpts`).

## Favicon
- Når en adresse legges til (og ved første visning av eksisterende), hent nettstedets ikon og vis det i stedet for de to bokstavene (NR, VG …).
- Rekkefølge på serveren: 1) `<link rel="icon"|"apple-touch-icon">` fra forsiden til domenet (følg redirect), velg største PNG/SVG ≥ 64 px; 2) `/favicon.ico`; 3) `https://www.google.com/s2/favicons?sz=128&domain=<domene>`; 4) RSS-kanalens `<image><url>` / Atom `<icon>`.
- Domene: fjern `www.`, `rss.` og `feed(s).` fra feed-URLen (`www.vg.no/rss/feed` → `vg.no`).
- Lagre ikonet lokalt (cache 30 dager) og bruk det samme ikonet i nyhetslisten, i sammendraget og i widgets.
- Visning: 34 pt rundet firkant, hvit bakgrunn, tynn kant, ikonet innenfor 6 pt marg. Feiler alt: behold bokstavene på farget bakgrunn.

## Kategori som nedtrekksmeny
- Pillen («Teknologi ▾», «✦ Auto ▾») blir en ekte nedtrekksmeny, ikke et trykk som bytter til neste.
- Valg: **✦ Auto** (AI setter kategori per sak når AI-kategorisering er på; ellers «Auto») + alle kategoriene fra listen over (Norge, Verden, Økonomi, Sport, Teknologi, Kultur, og egne kategorier om det finnes).
- iOS: `Menu`/`Picker(.menu)`; Android: `ExposedDropdownMenu`/`DropdownMenu` forankret i pillen; web: native `<select>` med pill-stil eller en egen meny.
- Valget lagres med en gang. Saker som allerede er hentet, kategoriseres på nytt ved neste henting.
- Teksten over listen endres fra «Trykk på kategorien for å endre» til «Velg kategori per kilde».
