# Prøveperioder: widgets (iOS, Samsung, Android) + Hjem-widget i appen

Fasit: `Prøveperiode Widgets.dc.html` (alle tre plattformene + appen) og `Mobil Papir App.dc.html` → widget `h11` «Prøveperioder» (`trwVals()`).
Data: samme liste som påminnelsene (`papir_trials` / `trials`-tabellen): `{id, n, end, start?, p, rem[], done?, kept?}`. Se `claude-code-prove-paminnelse.md`.

## Innhold (alle varianter)
- Prøven som slutter først: logo · navn · **dager igjen** (stort tall) · «Avslutt før {dag dato}» · pris etterpå.
- Farge på tallet: ≤ 2 dager rød `#b23a2a` · ≤ 7 dager oransje `#a8661a` · ellers svart/tekstfarge.
- Fremdrift: andel av prøven som er brukt (start → slutt). Uten startdato regnes 14 dager.
- Flere prøver: de neste 1–2 som små rader/chips med dager igjen.
- Trykk på widgeten åpner Abonnement. **Avsluttet** markerer `done`, fjerner påminnelsene og oppdaterer widgeten. **Behold** (bare i appen) flytter den til vanlige abonnementer.
- Tom: «Ingen aktive prøver», med «+ Legg til».
- Oppdatering: ved midnatt, når en prøve lagres/endres (push til WidgetKit/Glance) og når varselet sendes.

## iPhone (WidgetKit)
- **Liten** (2×2): logo + «PRØVE» · tall 46 pt · «dager igjen» · navn · «Avslutt før …».
- **Medium** (4×2): ring (Gauge) med dager igjen og navn · pris til venstre. Til høyre de to neste og knappene **✓ Avsluttet** (AppIntent, interaktiv widget iOS 17+) og **Åpne**.
- **Låseskjerm**: `accessoryCircular` (gauge med dager) og `accessoryRectangular` (⏳ navn · dager · pris · «Avslutt før …»).

## Samsung (One UI)
- Gjennomsiktig hvit (78 %) med blur, radius 28, følger One UI-stil.
- **2×2**: logo + navn · «2 d» · «igjen av prøven» · fremdriftslinje.
- **4×2**: «Prøveperioder» + «+» · tre rader (logo, navn, pris, dager, linje) · blå pille «Avslutt {navn}» (åpner oppsigelsessiden via deep link).
- Støtt widget-gjennomsiktighet fra One UI-innstillingene.

## Android (Material You / Jetpack Glance)
- Dynamiske farger fra bakgrunnsbildet (`GlanceTheme`): primaryContainer som bakgrunn og secondaryContainer for chips. Radius 28.
- **2×2**: chip med logo + navn · tall 52 sp · «dager igjen» · «før {pris}».
- **4×2**: «Prøveperioder · 3 aktive» · hovedkort med rund rød teller og knappen **Avsluttet** (ActionCallback) · chips for de neste.

## Appen (Hjem)
- Ny widget **Prøveperioder** (`h11`) på Hjem, under Avganger som standard. Kan flyttes og skjules i wiggle-modus.
- Kort i appens stil: «PRØVEPERIODER · 3 AKTIVE» · logo · navn (Newsreader) · «Avslutt før … · deretter 149 kr/mnd» · stort tall · fremdriftslinje · chips for neste · **Jeg har avsluttet** / **Behold**.
