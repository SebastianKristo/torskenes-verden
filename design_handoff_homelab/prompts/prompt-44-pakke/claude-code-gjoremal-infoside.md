# Gjøremål: trykk på en oppgave → enkel side der alt redigeres direkte

Ønske 2026-10-21: «la meg trykke på et gjøremål å få en side med info om hendelsen» → «la meg trykke på et gjøremål å få en side litt som dette» (vedlegg `uploads/Screenshot 2026-10-21 at 13.48.28.png`: rolig side med tittel og «Legg til …»-rader).
Fasit: `Huskeliste.dc.html` (`vwVals`). Papir-tema, følger lys/mørk.

## Oppsett (helside, maks 640 bredde)
- **Topp:** rund tilbake-knapp (46, venstre). Pille til høyre med **☆/★** (flagg, gul når på) og **•••** (meny: Flere valg … → dagens redigeringsark, Dupliser, Slett i rødt).
- **Liste-velger:** listenavn i listens farge + ▾. Trykk → meny med alle lister (prikk, navn, ✓). Bytter liste med en gang.
- **Tittel:** Newsreader 32, redigeres direkte (ingen lagre-knapp).
- **Rader** med ikon til venstre (22, dempet) og tekst 17 pt. Tomme rader står som grå «Legg til …»:
  - ≡ **Legg til detaljer** → tekstfelt som vokser.
  - ◎ **Legg til frist** → datovelger. Satt: «Frist: Fredag 24. oktober», rød + «forfalt» hvis passert, ✕ fjerner.
  - ◷ **Legg til dato/tid** → datovelger. Satt: «I morgen» + pille «Legg til tid» / «09:00», ✕ fjerner.
  - ↳ **Legg til deloppgaver** → felt. Enter legger til. Deloppgaver står over feltet med runde avkrysningsbokser i listens farge og ✕.
- **Nederst til høyre:** tekstknapp **Marker som fullført** i listens farge (/«Marker som ikke fullført»).
- Alt lagres fortløpende og synkes (HA, familie). Frist (`dl`) og dato/tid (`due`, `time`) er to felt: frist = siste dag, dato/tid = når du planlegger å gjøre det.
- Lukk: tilbake-knapp, sveip fra venstre kant (iOS), tilbake (Android). Web: samme innhold i et panel til høyre.

- Feil 2026-10-21: trykk gjorde ingenting på mobil fordi siden bare fantes i web-visningen. Infosiden skal være felles for mobil og web.

## Nytt utseende (2026-10-21)
Ønske: «lag nytt design, den skulle bare ha de funksjonene men ikke utseende» (vedlegg `uploads/Screenshot 2026-10-21 at 13.52.30.png`). Samme funksjoner, Papir-uttrykk:
- **Toppfelt** (fast, strek under): «‹ Gjøremål» som tekst, ☆/★ og ⋯ (meny: Gjentakelse, påminnelse og mer … / Dupliser / Slett oppgaven i rødt).
- **Liste-pille** (prikk i listens farge, navn, ▼) → meny med lister.
- **Avkrysningsboks (30, listens farge) + tittel** (Newsreader 30, redigeres direkte) på samme linje.
- **To kort side om side:** FRIST (dato, rød ramme + «forfalt» hvis passert) og NÅR (dato + tid-pille). «Legg til» når tomme, ✕ fjerner.
- **DETALJER**-kort med notatfelt (Newsreader 16).
- **DELOPPGAVER**-kort: «1 av 3» + tynn stolpe, rader med avkrysning og ✕, nederst stiplet boks + «Legg til deloppgave» + rund «+».
- **Fast knapp nederst** i full bredde: «Fullfør oppgaven» (listens farge) / «Angre fullført».
- Siden ligger **over** skrivefeltet «Ny oppgave …» og Glimt-knappen (de skjules mens siden er åpen). Redigeringsarket fra ⋯ åpnes over siden.
- Ønske 2026-10-21: «ikke vis pluss og skrivefeltet når et gjøremål er åpent» (vedlegg `uploads/Screenshot 2026-10-21 at 13.54.06.png`): skrivefeltet «Ny oppgave …» og Glimt-knappen skjules helt mens infosiden er åpen (samme signal som når et ark er åpent, `huske-sheet` med `open:true`). De kommer tilbake når man går ut.

## Web: deloppgaver og egen side for stor skjerm (2026-10-21)
Ønske: «få lagt til de nye funksjonene for web også, underoppgaver og lag en side for et gjøremål som er tilpasset en stor pc skjerm» (vedlegg `uploads/Screenshot 2026-10-21 at 13.54.44.png`)
Fasit: `Huskeliste.dc.html` (web-grenen `isWeb`, `vw.web`).
- **Lista på web:** samme ↳+ som mobil på hver rad. Deloppgaver vises innrykket under oppgaven, og man kan legge til direkte.
- **Trykk på en oppgave** åpner et **panel fra høyre** (920 bredde, skygge, mørk bakgrunn bak, klikk utenfor eller ✕ lukker, Esc også):
  - **Toppfelt:** ✕, «GJØREMÅL», knappene ☆ Flagg, Dupliser og Slett (rød tekst).
  - **Venstre kolonne:** avkrysning + tittel (Newsreader 40, redigeres direkte), DETALJER (stort notatfelt, kan dras høyere), DELOPPGAVER (fremdrift + liste + «Legg til deloppgave og trykk Enter»).
  - **Høyre kolonne (300):** Fullfør-knapp i listens farge, LISTE (piller, bytt med ett klikk), FRIST (datofelt + tekst «Frist: Fredag 24. oktober», rød ramme hvis forfalt), NÅR (dato + klokkeslett), øvrige felt (Gjentas, Påminnelse, Ansvarlig, Prioritet, Sted, Venter på), og «Gjentakelse, påminnelse og mer …» som åpner redigeringsarket.
- Tastatur: Esc lukker, ⌘/Ctrl+Enter fullfører, ↑/↓ i lista bytter oppgave mens panelet er åpent.

## Frist / Når virker + sted med kart (2026-10-21)
Ønske: «gi funksjon til disse, legg da også kartet av stedet i bunnen» (vedlegg `uploads/Screenshot 2026-10-21 at 13.55.33.png`)
- **FRIST- og NÅR-kortene** åpner datovelgeren ved trykk hvor som helst på kortet (`input.showPicker()`, fallback `focus()+click()`). Tid-pillen i NÅR åpner klokkeslett-velgeren. ✕ fjerner uten å åpne velgeren. Native: `DatePicker` i sheet (iOS) / `DatePickerDialog` + `TimePickerDialog` (Android).
- **STED-kort nederst** (mobil og web, venstre kolonne): kartnål + «Legg til sted eller adresse». Forslag mens man skriver (Kartverket, deretter OSM), trykk lagrer `pl` + `geo`.
- **Kart** under feltet (mobil 210 pt, web 300 pt) med nål på stedet (OSM-innbygging i designet. I appen: MapKit / Google Maps Compose), og knappene **Åpne i Kart** og **Google Maps**.
- Har oppgaven et sted uten koordinater (f.eks. «Toten»), slås det opp automatisk første gang siden åpnes («Finner stedet på kartet …») og lagres.
- Stedet brukes også til stedsvarsel (Glimt varsler når du er der).

## Ny toppstripe (2026-10-21)
Ønske: «og gi mer en slik design for topbar i stedet for den nå» (vedlegg `… 13.56.25.png`, `… 13.56.39.png`): samme toppstripe som andre undersider. Til venstre rød «‹ Tilbake» (Manrope 16/700, #b23a2a). Til høyre to runde hvite knapper (42 pt, tynn ramme, liten skygge): ☆ (rød, gul ★ når flagget) og innstillinger-ikon (glidebrytere) som åpner menyen (Gjentakelse, påminnelse og mer … / Dupliser / Slett). Ingen strek under.
- Ønske 2026-10-21: «få top bar i begge sider i lik høyde» (vedlegg `uploads/Screenshot 2026-10-21 at 13.58.39.png`): «‹ Tilbake» og de runde knappene skal stå i **samme høyde** som på Media og andre undersider. Bruk felles toppstripe-komponent (samme topp-innrykk: safe area + 12 pt, høyde 42 pt), ikke egen padding per side.
