# Fiks: fargefeil i «Hent domener»-fanene (Domener, web)

Ønske 2026-10-20: «ordne fargefeilen her» (skjermbilde: `vedlegg/domener-fanefarge-feil.png`)

## Feil
- Aktiv fane (*Search Console*) vises som **svart pille med hvit tekst** (#1b1a17 / #fff). Det er stilen for domene-pillene øverst, ikke for segmentkontrollen.
- Sporet bak fanene er grått (#e3ddcf-aktig) og høyt/fullbredde. Ikonene (Google-G / CF) mangler.

## Riktig (fasit: `Homelab Domener Papir.dc.html`, seksjon HENT DOMENER)
- Spor: `background:#f1ece2; padding:4px; border-radius:12px; display:flex; gap:4px;` – kun så bredt som fanene (ikke fullbredde), høyrestilt ved siden av tittelen på bred skjerm.
- Fane: `height:34px; padding:0 14px; border-radius:9px; font:600 13px Manrope; color:#1b1a17;` + ikon 18 px (Google-G for Search Console, oransje «CF»-merke #f38020 for Cloudflare).
- **Aktiv:** `background:#ffffff; box-shadow:0 1px 3px rgba(0,0,0,.12); color:#1b1a17`.
- **Inaktiv:** `background:transparent; box-shadow:none; color:#1b1a17`.
- Samme mønster som periodevelgeren (1t/24t/7d/30d). Ingen svart aktiv-tilstand i segmentkontroller.

## Rad-knappen
- «+ Legg til»: `border:1px solid #1b1a17; background:transparent; color:#1b1a17`.
- «✓ Lagt til» (deaktivert): `border:1px solid #e3ddcf; background:transparent; color:#8f897c` – ikke grønn. Grønn (#1f7a6e) brukes kun for status (oppe/OK).

## Dark mode
- Spor `#2a2824`, aktiv fane `#3a3732` + tekst `#f3efe6`, inaktiv tekst `#a8a194`.

## Sjekk
- Begge faner, lys og mørk modus, smal skjerm (fanene brytes under tittelen, sporet blir fortsatt ikke fullbredde).
