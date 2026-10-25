# Finans → Mer: farge, og skjul titler og søkefelt i wiggle

Ønske 2026-10-24: «gi noe farge her, la meg fjerne teksten finans og verktøy, fjern da også mellomrommet bak teksten. gi den mulightten i wiggle redigering av den. la meg også fjerne søkebaren.» (vedlegg `Screenshot 2026-10-24 at 17.27.39.png`)
Fasit: `Mer Ny.dc.html` (`mode="finans"`, brukt i `Homelab.dc.html` → Finans → Mer). Gjelder også vanlig Mer (`mode` uten finans).

## Farge
- **Kortene øverst** (Kvitteringer, Saldo …): bakgrunn = modulens farge 13 % blandet inn i kortfargen (`color-mix(ic 13%, card)`), så det følger lyst/mørkt tema.
- **Ikonbrikker** (både kortene og Verktøy-listen): helfylt i modulfargen med hvitt symbol (i dag beige med farget symbol).
- Modulfarger: Saldo/Aksjer/Abonnement `#2f6b4a`, Budsjett/Boliger `#b23a2a`, Kvitteringer/Finn `#a0671a`, Faste trekk/Kontoer `#2b5d8a`, Import `#7a5ad6`, Transaksjoner/Rapporter `#6b665c`.

## Skjul i wiggle-redigering
- Hold inne et kort eller en rad → wiggle (som i dag). Øverst kommer en rad med tre brytere (piller): **Søkefelt**, **Finans** (tittel), **Verktøy** (tittel). På = svart pille med ✓, av = kontur med +.
- **Av** fjerner elementet helt, inkludert luften rundt (ingen tom rad, ingen ekstra 10/8 pt margin). Kortene / listen flytter seg opp.
- Tittelraden «FINANS» vises fortsatt i wiggle så Store/Lave og Ferdig er tilgjengelig, men uten teksten når den er av.
- **Søkefelt av** skal fjerne feltet overalt der Mer vises (både innebygd under hero og frittstående). Feil 2026-10-24: frittstående søkefelt ble stående når bryteren var av.
- Lagres per side: `papir_fmer_hid_vis` / `papir_mer_hid_vis` = `{ sok, tit, vkt }` (false = skjult). Synkes med resten av oppsettet.
