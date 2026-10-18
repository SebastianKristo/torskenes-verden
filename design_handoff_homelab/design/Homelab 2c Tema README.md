# Handoff: Homelab OS – redesign «Vindu og papir» (2c + 3a)

## Overview
Nytt visuelt uttrykk for Homelab OS (personlig startside/dashboard for homelab, norsk UI). Konseptet heter «Vindu og papir»: et bredt fotovindu øverst med hilsen, klokke og vær, og resten av innholdet på lyst papir i avisspalter. Pakken dekker:
- **2c – Dashboard**
- **3a – Innlogging, Innstillinger (Startside) og Rom (Satellitt og teleskop)**

## About the Design Files
`Homelab 2c.dc.html` er en **designreferanse i HTML**, ikke produksjonskode. Oppgaven er å **gjenskape designet i den eksisterende Homelab-kodebasen** (filen `Homelab v2.dc.html` med all eksisterende logikk: innlogging/2FA, onboarding, nyhetsbar, Ruter-avganger, yr-vær, iCal/Canvas, Trading 212, Home Assistant, Sonarr/Radarr, Plex/Jellyfin, innstillingspanel, Starlink via CelesTrak, NASA APOD). **All funksjonalitet beholdes – bare det visuelle laget byttes.** Data i prototypen er statiske eksempler.

Åpne filen i nettleser (krever `support.js` og `image-slot.js` i samme mappe).

## Fidelity
**High-fidelity.** Farger, typografi, avstander og copy er endelige.

## Design Tokens
**Farger**
- Papir (bakgrunn): `#f3efe6`
- Blekk (tekst, aktive knapper): `#1b1a17`
- Sekundærtekst: `#6b665c` · Dempet: `#8f897c`
- Spaltelinjer: `#d8d1c2` (hoved) · `#e3ddcf` (rader)
- Aksent (seksjonsetiketter, frister, feil): `#b23a2a`
- Positiv: `#2f7a4f`
- Hvit flate (søkefelt): `#fff`, skygge `0 10px 30px -10px rgba(0,0,0,.25)`
- Linjefarger avganger: T-bane `#f3d38a`, trikk/buss `#a8d4fb` (brukes nå som ramme-merke i blekk)

**Typografi**
- Display/serif: **Newsreader** – hilsen 84px/500, temperatur 120px/400, dato italic 22px, korttitler 17–26px/500, store tall 28–64px/400
- UI: **Manrope** 400–700 – brødtekst 13–15px, faner 13px/600
- Etiketter: **IBM Plex Mono** 600 11px, letter-spacing .12em, versaler, farge `#b23a2a` (f.eks. «I DAG PÅ SKOLEN», «AVGANGER», «SPILLES NÅ»)

**Form**
- Ytre ramme radius 20px; piller/knapper 999px; ingen kort – innhold skilles med 1px spaltelinjer og 2px blekk-linje under seksjonstitler.

## Screens

### 2c – Dashboard
1. **Fotovindu** (høyde 420px, full bredde, bildet dekker): 
   - Topprad (padding 24px 44px): «Homelab» Newsreader 26px hvit · fane-pille (bg `rgba(243,239,230,.94)`, aktiv fane blekk/papir) · bakgrunnsvelger-pille (bg `rgba(27,26,23,.55)` + blur, valg «Oslo / Vær nå / Planeter») · avatar 40px blekk.
   - Nederst: dato (italic) + «God morgen, Sebastian» til venstre; temperatur 7° + «Lett regn · 08:42» til høyre. Tekstskygge `0 2px 18px rgba(0,0,0,.35)`.
2. **Søkefelt**: hvit pille 56px, overlapper vinduet med −28px, starter 420px inn fra venstre slik at bildekreditten nederst til venstre i vinduet er synlig. Google-logo, plassholder, «Søk»-knapp i blekk.
3. **Nyhetslinje**: «SISTE NYTT» (mono, aksent) + rullende overskrifter, bunnlinje.
4. **Tre spalter** (skilt med 1px linjer, 28px padding):
   - *I dag på skolen*: NÅ-merke + time (Newsreader 24px), tid/rom/MazeMap-lenke, deretter agenda-rader (dato · tittel · tag).
   - *Avganger* (4 strekninger, Newsreader 17px + linjemerker) og *Energi* (kW nå, kWh uke, 7 søyler; i dag i blekk, øvrige `#d8d1c2`).
   - *Spilles nå* (plakat 38×52 + tittel/bruker/kilde/gjenstår), *Penger* (Trading 212 + brukt i måneden), *Snarveier* (fargeprikk + navn).
   - Elementer fra dagens app som ikke er tegnet (skolekalender-rutenett, Kommer ut, Mediehistorikk, full værvarsling) legges inn som flere rader/spalter i samme stil.

### 3a – Innlogging
Kort 460×640: fotovindu 260px med «Homelab» (italic) og «Hei, velkommen hjem» (Newsreader 46px). Under: felter som understrekede linjer (etikett i mono-aksent, verdi Newsreader 19px; aktivt felt 2px aksent-linje), avkrysning «Husk denne enheten på lokalt nett», «Lås opp»-pille i blekk, demo-hint. 2FA-steget og onboarding følger samme mønster.

### 3a – Innstillinger
To kolonner: venstre 260px (avatar + navn/rolle, søkefelt-pille, grupper GENERELT/TILKOBLINGER/SIKKERHET med aktivt punkt i fet blekk + understrek, «Lås skjermen»/«Logg ut» nederst). Høyre: tittel Newsreader 44px + italic undertittel, grupper med mono-etikett og 2px blekk-linje, rader med tittel/beskrivelse og enten verdi «→» eller bryter (42×24, på = `#2f7a4f`).

### 3a – Rom
Fotovindu 360px (NASA-bilde) med fane-pille (Rom aktiv), etikett «NASA · DAGENS ROMBILDE · dato» og tittel «Satellitt og teleskop». Tre spalter: Starlink-tall (Newsreader 64px) + byvelger-piller; «Høyest på himmelen nå»-liste; NASA-arkiv som 3×2 bilderutenett.

## Interactions & Behavior
- Bakgrunnsvelger: Oslo (roterende Oslo-bilder), Vær nå (bilde etter yr-symbol), Planeter. Speiler eksisterende «Bakgrunnsbilde»-innstilling.
- Hold nedre venstre hjørne av alle fotovinduer fritt for tekst (bildekreditt).
- Eksisterende drag-og-slipp/masonry for seksjoner kan beholdes; spaltene er standardoppsett.

## Assets
Bilder (lisens må vises):
- Oslo: `Oslo_S_aerial.jpg` – Wilhelm Joys Andersen, Wikimedia Commons, CC BY-SA 2.0
- Vær: `Cloudy_Sky_Background.jpg` – Free Nature Stock, Wikimedia Commons, CC0
- Planet: `PIA21641` Jupiter – NASA/JPL-Caltech/SwRI/MSSS
URL-mønster: `https://commons.wikimedia.org/wiki/Special:FilePath/<fil>?width=2400`. Plakatbilder og logoer i prototypen er plassholdere – bruk Sonarr/Radarr-covers og favicons som i dagens app.

## Files
- `Homelab 2c.dc.html` – 2c-dashboard og 3a-skjermer
- `support.js`, `image-slot.js` – runtime for å åpne prototypen
