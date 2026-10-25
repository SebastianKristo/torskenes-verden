# Web: oppstart uten «rar» header + sideanimasjon

## Problem
Når web-appen lastes vises headeren med **alle** faner (også de brukeren har skjult), uten valgt fane, og innholdet er tomt til data kommer. Ingen overgang som på mobil.

## Årsak (sannsynlig)
Fanelista rendres fra standardlista før brukerens faneoppsett (skjulte faner, rekkefølge, navn) og aktiv rute er lest. Først etter fetch/hydrering filtreres den.

## Fiks
1. **Les faneoppsettet synkront ved oppstart.** Cache siste oppsett i `localStorage` (f.eks. `hl_tabs`: `{order, hide, names}`) hver gang det lagres eller hentes fra server. Bruk cachen som startverdi i state, og oppdater i bakgrunnen når serveren svarer.
2. **Aktiv fane fra URL/ruten med en gang**, ikke etter at data er lastet. Ingen tilstand der ingen fane er markert.
3. **Hvis ingen cache finnes:** vis fanepillen som skjelett (samme høyde/radius, 5–6 grå felt, `opacity .5`) i stedet for hele standardlista. Ikke vis skjulte faner selv et øyeblikk.
4. **Innhold:** vis skjelettkort (samme rutenett som siden) i stedet for tomt område mens data lastes.
5. **Inngangsanimasjon** – samme følelse som mobil, litt roligere:
```css
@keyframes pgIn{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:none}}
.page-enter{animation:pgIn .28s cubic-bezier(.22,.9,.28,1) both}
@media (prefers-reduced-motion:reduce){.page-enter{animation:none}}
```
   Kjør på innholdsbeholderen (ikke headeren) ved første visning **og** ved hvert fanebytte (nøkkel = rute). Headeren skal stå stille.
6. Header og logo-tekst («Homelab»/valgt navn) skal komme fra samme cache, så det ikke blinker «OS» eller standardnavn før navnet er lastet.

## Test
- Hard reload med skjulte faner: kun synlige faner vises fra første frame, riktig fane markert.
- Bytt fane: innholdet glir inn 10 px fra under med fade (280 ms), header står i ro.
- Tom cache (inkognito): skjelett i stedet for full faneliste.
