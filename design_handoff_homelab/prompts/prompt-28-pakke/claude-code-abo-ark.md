# Fiks: arket «Legg til abonnement» (Papir, mobil)

Fasit: `Abonnement Legg til ark.dc.html` (skjermbilde 13.20.38 viser feilen).

## Feil i dag
1. **To grep-streker** øverst: arket har sin egen strek, og systemarket legger til en til. Behold **én**.
2. **Feil farger**: ikoner i lys laks (`#f08a76`, mørk-tema-aksent) på lys bakgrunn, kort i beige på beige.
3. **Ujevn tekst**: «Manuelt» og «Kvittering» er større enn «Skjermbilde» og «Transaksjon».
4. Fire små fliser uten forklaring, og resten av arket står tomt.

## Ny meny
- Bruk `.presentationDetents([.medium, .large])` + `.presentationDragIndicator(.visible)` og **fjern** den egentegnede streken (Android: bruk kun `BottomSheetDefaults.DragHandle()`).
- Ark: bakgrunn `bg #f3efe6`, radius 28 øverst.
- Topp: tittel «Legg til abonnement» i Newsreader 26, «Lukk» i `lab #b23a2a` (min. 44 pt treffflate). Undertekst «Velg hvordan du vil legge det inn.» i `mut #7a7468`, 14.
- **Liste** i ett hvitt kort (`#fff`, kant `#e4ddcf`, radius 20), rader min. 72 pt, skillelinje `#eee8dc`:
  | Ikon | Tittel | Beskrivelse |
  |---|---|---|
  | skann-ramme | Skjermbilde ✦ AI | Fra App Store, e-post eller kontoside. Tjeneste, pris og trekkdato fylles ut. |
  | kvittering | Kvittering ✦ AI | Ta bilde eller velg PDF. Ollama leser beløp og syklus. |
  | piler | Fra transaksjon | Velg et gjentakende trekk fra banken. |
  | blyant | Skriv inn selv | Tjeneste, beløp, syklus og trekkdag. |
- Ikonflis 44×44, radius 12, bakgrunn `#f5e4e0`, ikon `lab` strek 1.8. Tittel 16/700 `ink`, beskrivelse 13.5 `mut`, chevron `#a39c8e`.
- «✦ AI»-merke: `ink` bakgrunn, `bg` tekst, 10.5/800.
- Fotnote: «Bilder og kvitteringer leses lokalt av Ollama. Ingenting sendes ut av Homelab.»

## Skriv inn selv
- Samme ark, «‹ Tilbake» til venstre. Feltkort: Tjeneste · Beløp (desimaltastatur) · Trekkdag (tall).
- SYKLUS: segmentert Uke / Måned / År.
- Primærknapp «Legg til abonnement»: `lab` bakgrunn, hvit tekst, 52 pt, radius 16.

## Regel
Alle farger fra `PAL[mode]`. Mørk-aksent (`#f08a76`) kun når `mode==='dark'`.
