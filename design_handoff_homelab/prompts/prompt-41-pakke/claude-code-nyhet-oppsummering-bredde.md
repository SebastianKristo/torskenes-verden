# Fiks: Glimt nyhetsoppsummering (iOS) – siden er forskjøvet og kuttet

Ønske 2026-10-20: «feil du ser vel» (skjermbilde: `vedlegg/nyhet-oppsummering-kuttet.png`)
Fasit: `Nyhetsleser.dc.html` → Glimt-oppsummering (variant mobile).

## Feil på skjermbildet
1. **Hele innholdet er skjøvet til venstre og kuttet på begge sider.** «Nyheter»-knappen, «NYHETSOPPSUMMERING», tittelen («… døgn»), metalinjen og teksten starter utenfor venstre kant; «Innhold»-knappen og lange linjer går utenfor høyre kant. Siden er bredere enn skjermen og scrollet sidelengs.
   - Årsak: et barn med fast/for stor bredde (bildegrid, lange ord/URL-er, `white-space: nowrap` på sammendragslinjer, eller `width: 100vw` + padding) som gjør at `ScrollView` (eller WebView) får horisontal scroll.
   - Fiks: innholdet skal ha `maxWidth: .infinity` innenfor skjermen med 20 pt marg; ingen horisontal scroll (`ScrollView(.vertical)`, `.scrollBounceBehavior(.basedOnSize, axes: .horizontal)`, WebView: `overflow-x: hidden`, `max-width: 100%` på alt). Tekst bryter (`.fixedSize(horizontal: false, vertical: true)`, CSS `overflow-wrap: anywhere`). Ingen `nowrap` på sakslinjer.
2. **Bildegriden er bredere enn skjermen.** 2×2-griden skal være 100 % av innholdsbredden med 4 pt mellomrom og 12 pt hjørner, bilder `aspectRatio(1, contentMode: .fill)` + `clipped()`.
3. **Kildereferanser vises som rå tekst** («[9]», «] · VG»). Vis kildene som små piller («VG», «NRK») eller fotnotetall i hevet skrift som kan trykkes; aldri halve hakeparenteser.
4. **«Mest om norge og oslo og økonomi.»** – temaord skal ha stor forbokstav der det er egennavn og listes naturlig: «Mest om Norge, Oslo og økonomi.»
5. Toppen: «‹ Nyheter», «▶ Les opp» og «Innhold» må alle få plass på én linje; ved smal skjerm krymper «Les opp» til bare ikon.

## Sjekk
- iPhone SE og 15 Pro Max: ingen sidelengs scroll, alt innenfor margene, griden passer.
- Lange titler og URL-er bryter riktig.
