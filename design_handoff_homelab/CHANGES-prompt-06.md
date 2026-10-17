# Endringer fra prompt 06

Gjelder `design/FinansHub v2.dc.html`, `design/Homelab v2.dc.html` og `design/FinansHub Mobil v2.dc.html`. Dette dokumentet kommer i tillegg til `PROMPT-CLAUDE-CODE.md`. Der de to sier noe ulikt, er det dette dokumentet som gjelder. Brukerens ordrette ønsker står i `prompts/prompt-06.md`.

All tekst i grensesnittet er på norsk bokmål. Alt som lagres i `localStorage` i prototypene skal lagres på serveren per bruker, med mindre det står at det hører til enheten.

---

## 1. Homelab OS (desktop, `Homelab v2.dc.html`)

### 1.1 Førstegangsoppsett av ny server
- **Når:** ved første oppstart, når det ikke finnes noen brukere i databasen. Oppsettet vises i stedet for innloggingen.
- **Steg 1 av 2:**
  - Tittel «Velkommen til **din nye server**».
  - Felt: «Navn på hovedadmin» (påkrevd) og «Navn på serveren» (standard «Homelab»).
- **Steg 2 av 2:**
  - Tittel «Hei, {navn}».
  - Felt: «Brukernavn» (foreslås fra navnet: små bokstaver, æ→ae, ø→o, å→a, bare `a–z0–9`), «Passord» (minst 8 tegn) og «Gjenta passord».
- **Validering:** feilmelding vises under feltene, farge `#f59a8f`.
  - Brukernavn: `^[a-z0-9._-]{2,}$`.
  - Passordene må være like.
- **Ved fullføring:**
  - Første bruker opprettes med `role=Admin` og `main=true` (hovedadmin).
  - Servernavnet lagres.
  - Brukeren logges inn direkte.
- **Navn i grensesnittet:** navnet vises i hilsenen («God kveld, **{navn}**») og øverst i menyen. Det skal ikke lenger stå «Sebastian» fast i koden.
- **Endre navn senere:** Innstillinger → Innlogging → Brukere har knappen «Endre navn» per bruker. Den åpner et skjema i raden med Lagre og Avbryt.
  - Admin kan endre alle.
  - Andre kan bare endre sitt eget navn.
  - Hovedadmin er merket «· hovedadmin».
- **Datamodell:** `users`-tabellen får `display_name` og `is_main_admin`.
- **I prototypen:** tweaket `onboarding` tvinger fram oppsettet.

### 1.2 Google-søkebar med forslag og historikk
- **Forslag:**
  - Når du skriver, kommer forslag fra Google. Prototypen bruker `suggestqueries.google.com/complete/search?client=chrome&hl=no` med JSONP.
  - I produksjon skal kallet gå via backend-proxy.
  - Forslagene hentes med 140–150 ms debounce.
- **Nylige søk:** klikk i et tomt felt viser «Nylige søk» (opptil 8) med «Tøm historikk». Hvert punkt har × for å fjerne det.
- **Tastatur:** piltast opp/ned velger, Enter søker og Esc lukker.
- **Adresser:** tekst som ser ut som en adresse (f.eks. `vg.no`) åpnes direkte i stedet for å søkes på.
- **Historikk:**
  - Lagres per bruker på serveren, maks 100 i UI og 500 i import.
  - Samme historikk brukes i mobilappen.
- **Innstillinger → Søkebar:**
  - Bryterne «Vis forslag fra Google mens du skriver» og «Lagre søkehistorikk».
  - «Importer Google-historikk (.json)»: Google Takeout → Mine aktiviteter → Søk. Parser `title` som starter med «Searched for» / «Søkte etter».
  - «Tøm søkehistorikk».
  - Google gir ikke tilgang til historikken via API, og det skal stå i UI.

### 1.3 Profilbilde
- Opplasting under Innstillinger → Innlogging (Last opp / Fjern).
- **Lagring:** beskjæres til kvadrat på 256×256 og lagres som JPEG med kvalitet 0,85.
- **Hvor det vises:** i menyknappen øverst til høyre i Homelab og i mobilappen. Uten bilde vises initialen.
- **Backend:** `POST /api/me/avatar` og `DELETE /api/me/avatar`.

---

## 2. FinansHub desktop (`FinansHub v2.dc.html`)

### 2.1 Sidemenyen redigeres i Innstillinger
- «Endre»-knappen ved «Generelt» i sidemenyen er fjernet.
- **Innstillinger → Sidemeny** (undertekst «Rekkefølge og synlighet»): én rad per menypunkt med
  - ⋮⋮ (dra for å flytte),
  - nummer, ikon og navn,
  - ▲ ▼,
  - bryter for vis/skjul (oransje `#FF7A3D` når synlig). Skjulte punkter vises med 45 % opasitet.
- Oversikt og Innstillinger kan ikke skjules. Raden viser da «Alltid».
- Knappene «Vis alle» og «Tilbakestill rekkefølge».
- **Lagring per bruker:**
  - `nav_order: string[]`
  - `nav_hidden: string[]`
  - Nye sider som ikke finnes i lagret rekkefølge legges sist.

### 2.2 Import er flyttet til Innstillinger
- Import er ikke lenger i sidemenyen.
- Den ligger i fanen Innstillinger → Import («Kontoutskrift, CSV og XLSX») og bruker samme modul som før (`FinansHub v2 Moduler`, side `imp`).

### 2.3 AI-søk som egen side
- **Plassering:** sidemenypunktet «AI-søk» (ikon ✦) ligger etter Transaksjoner.
- **Søkefelt:** stort, med knappen «Spør AI».
- **Forslag:** «Hvor mye har jeg brukt på kaffe?», «Når kjøpte jeg lyspærer?», «Mat i oktober» og «Hva har jeg betalt for lading?».
- **Svar og treff:** svaret kommer med treffliste, der hvert treff åpner transaksjonen.
- **«Tidligere spørsmål»:** de 8 siste, med «Tøm». Lagres per bruker, maks 20.
- **Hva AI-en søker i:** transaksjoner, kvitteringer og varelinjene AI har lest av kvitteringsbildene.

---

## 3. Mobilappen (`FinansHub Mobil v2.dc.html`): iOS (1a), Android (1b) og brettbar (1c)

### 3.1 Homelab er hovedsiden, Finans er «Andre OS»
- **Start:** appen åpner på **Homelab**.
- **Menyen** åpnes fra profilbildet øverst til høyre og inneholder:
  - Homelab («Dashbord, søk og snarveier»),
  - «Andre OS»: Finans («Hjem, liste, budsjett og mer»), Matplan og Domener,
  - «Rediger forsiden»,
  - Innstillinger.
- **Bunnlinje på Homelab:** Homelab, Finans, Domener, Matplan (rekkefølgen kan endres, se 3.3).
- **Bunnlinje i Finans:** Oversikt (het «Hjem» før), Liste, Budsjett, Søk, Mer.
- **Tilbake til Homelab** fra alle andre OS:
  - iOS: rund glassknapp (62 px) med husikon til venstre for fanelinjen.
  - Android: «Homelab» helt til venstre i bunnlinjen, skilt fra resten med en tynn strek.
  - Brettbar: husknapp øverst i siderailen.
- **Startside-innstillingen** har valget «Homelab» (standard).

### 3.2 Homelab-siden på mobil
Seksjonene står i denne rekkefølgen som standard:
1. **Topp:** dato (liten), hilsen «God kveld, {navn}», og profilbilde (initial uten bilde) som åpner menyen.
2. **Klokke og vær:**
   - Klokka er stor (52 px, vekt 300, tabulære tall).
   - Til høyre: temperatur, værtekst og vind, «Oslo · maks / min».
   - Data fra Open-Meteo (`current=temperature_2m,weather_code,wind_speed_10m`, `daily=temperature_2m_max,temperature_2m_min`, `wind_speed_unit=ms`, `timezone=Europe/Oslo`).
   - Værkodene oversettes til norsk (tabellen `WXT` i prototypen).
3. **Google-søk:**
   - Felt med Google-«G» og en nedtrekksliste rett under med nylige søk og forslag.
   - Historikken deles med desktop.
   - Feltet har `type=search` og `enterkeyhint=search`.
4. **Snarveier:**
   - Rutenett med 4 kolonner. Ikon 56×56, radius 18. Ikonet er favicon via `google.com/s2/favicons?sz=64`, og initial for adresser på lokalnettet.
   - Snarveiene skal hentes fra Homelab-oppsettet til brukeren.
5. **Andre OS:**
   - Stort Finans-kort med «igjen å bruke i oktober» og antall kvitteringer til gjennomgang.
   - Ved siden av: kortet Domener (besøk i dag) og kortet Matplan (dagens middag).
6. **Valgfrie widgets** (skjult til de legges til):
   - «Serverstatus»: CPU, minne, lagring, temperatur og oppetid.
   - «Ruter-avganger»: neste avganger fra Bislett, med linjemerke i Ruters farger.
   - Begge skal kobles til ekte data: Proxmox/node-exporter og Entur sanntids-API.

### 3.3 Rediger forsiden (som hjemskjermen på iPhone og Android)
- **Starte og avslutte:** «Rediger forsiden» i menyen starter redigeringen. Toppen viser da «+» og «Ferdig».
- **Widgetene vugger:**
  - rotasjon ±0,5°, 0,32 s ease-in-out, uendelig, vekslende retning;
  - annenhver widget er i motfase;
  - et gjennomsiktig lag over hver widget blokkerer klikk, og den får en stiplet ramme.
- **Kontroller på hver widget:**
  - «−» oppe til venstre skjuler widgeten;
  - ▲▼ oppe til høyre flytter den;
  - dra og slipp flytter den også.
- **«+» åpner «Legg til widget»:**
  - kort i 2 kolonner med ikon, navn og beskrivelse;
  - knappen «Legg til» står på skjulte widgets, og «Lagt til» (deaktivert) på synlige.
- **Under galleriet:**
  - «Navigasjon · Homelab»: Homelab og Finans kan ikke skjules.
  - «Navigasjon · Finans»: Oversikt og Mer kan ikke skjules.
  - Begge har ▲▼ og bryter, pluss «Tilbakestill».
- **Lagring:** per bruker og enhet, som `{sec:[ids], hlTabs:[ids], finTabs:[ids], hide:{id:bool}}`.
  - Nye widget-ID-er som ikke finnes i lagret oppsett legges sist.
  - Nye widget-ID-er får standard synlighet.
- **iOS-fanelinjen** regner pillens bredde og posisjon ut fra hvor mange faner som er synlige.

### 3.4 Alle funksjonene fra nettsiden finnes på mobil («Mer»-fanen)
- **Mer-siden:** rutenett med Kvitteringer, Faste utgifter, Kontoer, Aksjer, Rapporter, Subscription OS, Delte mapper, Finn-handler, Import og AI-søk. Hver flis har en undertekst med live-tall, og Kvitteringer har et merke med antall.
- **Felles mal for alle sidene**, i samme stil som innstillingene:
  - tilbakeknapp,
  - tittel og undertekst,
  - «hero»-kort,
  - nøkkeltall i 2 eller 3 kolonner,
  - grupper med rader (elementrad, stolpe, bryter, verdi, chips, felt, knapp, tekst og fil).
- **Innholdet på sidene** tilsvarer desktop: se `PROMPT-CLAUDE-CODE.md` §3. Det gjelder blant annet:
  - bokføre kvitteringer,
  - skru faste trekk av og på,
  - sparemål,
  - Trading 212-posisjoner med periodevalg 1D, 1U, 1M, 1Å og Alt,
  - rapport per måned og per år, med CSV/PDF,
  - abonnementer med syklus månedlig, årlig eller «hvert 2. år», og status Aktiv → Si opp → Sagt opp,
  - delte mapper med deling, roller, prosjekter, regninger og fordeling,
  - Finn-handler med steg,
  - import fra filer eller innlimt tekst, med forhåndsvisning.
- **Detaljsider:** alle rader på disse sidene åpner en detaljside med feltene og tilhørende transaksjoner.
- **Innstillinger på mobil** har fått gruppen «Finans»: AI-motor, Kategorier, Regler, Bank og import, Aksjer · Trading 212, Backup og data.

### 3.5 Søk-fanen
- Når fanen åpnes, får spørsmålsfeltet **fokus med en gang**, så tastaturet kommer opp.
- Enter sender spørsmålet.
- Under feltet: forslagschips, svar og treff. Hvert treff åpner transaksjonsdetaljen, og tilbakeknappen går til Søk.

### 3.6 Transaksjoner: redigere, legge til og slette
- **Legge til:** «+» ved «Transaksjoner» i Liste (iOS: rund glassknapp; Android og brettbar: «+ Ny»).
- **I detaljen:** «Rediger» og «Slett» står under infolisten. Infolisten viser Kategori, Konto, Dato, Kvittering, Delt mappe og eventuelt Notat.
- **Redigeringsskjemaet** har:
  - Type (Utgift/Inntekt), Beskrivelse, Beløp (desimaltastatur) og Dato;
  - Kategori (chips), Konto (chips) og Kvittering (Vedlagt / Til gjennomgang / Ingen), pluss «Legg ved kvittering»;
  - Delt mappe (Ingen / mappene), Notat;
  - knappene «Lagre endringer» / «Legg til» og «Slett transaksjon».
- **Validering:** beskrivelse og beløp er påkrevd, og beløpet lagres med fortegn etter typen.
- **Etter lagring** går appen tilbake til detaljen, og etter sletting til listen.
- **API:** `POST`, `PATCH` og `DELETE` på `/api/transactions/:id`.

### 3.7 Original kvittering og banktransaksjon
- **Hvor:** i transaksjonsdetaljen, radene «Original kvittering» og «Original banktransaksjon».
- **Visningen:** en fullskjermvisning med en bryter mellom de to.
- **Kvittering:**
  - Det ekte bildet eller PDF-en fra lagringen, med zoom.
  - Prototypen viser en papirkvittering laget av varelinjene: butikk, adresse, org.nr, linjer, TOTAL, MVA, BankAxept, tid og ref.
  - Hvis kvittering mangler: «Ingen kvittering vedlagt» og «Legg ved kvittering».
- **Banktransaksjon** viser posten slik den kom fra banken:
  - Dato, Rentedato, Forklaring (bankens tekst), Ut/Inn, Konto, Bank, Arkivref., Importert;
  - rådata som JSON (`bookingDate`, `valueDate`, `description`, `amount`, `account`, `archiveReference`, `source`).
  - **Krav:** importen må lagre den opprinnelige bankraden uendret i en egen kolonne (`raw_bank_row jsonb`).
- **Knapper:** «Last ned» og «Del» (`navigator.share` / delingsarket i systemet).

### 3.8 Brettbar: samme funksjoner som Android
- **Hjem:** under «Igjen å bruke» kommer kortene «Inn i oktober», «Spart i år» og «Til gjennomgang».
- **Høyre panel i transaksjonsdetaljen:** AI-beskrivelse, varelinjer, originalene og infolisten (samme som i 3.6), pluss Rediger og Slett.
- **Siderail:** Homelab-knapp, Skann, fanene og profil.

### 3.9 iOS: Liquid Glass
- **Tilbakeknapper:** runde glassknapper på 44×44 med bare en ‹-pil, uten tekst. De har `aria-label` «Tilbake» / «Tilbake til …».
  - Glass: `rgba(255,255,255,.08)`, `backdrop-filter: blur(8px) saturate(190%) brightness(1.12)`, indre highlight-skygger og en diagonal gradient-glans. Den skaleres til 1,1 når den trykkes.
- **Fanelinjen** går over full bredde.
- **«Skann»** er en egen glass-pille (58 px høy, oransje glass `rgba(255,122,61,.5)`) som flyter over fanelinjen til høyre, slik FAB-en gjør på Android.
  - Trykk åpner kameraet.
  - Langt trykk viser valg for Bilder og Filer.

### 3.10 Android: Material You, lys og mørk
- **Fargetema:** Innstillinger → Utseende → «Farger»: Følg systemet, Oransje, Blå, Grønn, Lilla, Rosa, Gul.
  - I den native appen skal «Følg systemet» bruke dynamiske farger: `DynamicColors.applyToActivitiesIfAvailable` (Android 12+), eller `dynamicDarkColorScheme` / `dynamicLightColorScheme` i Compose.
  - Prototypen prøver CSS-`AccentColor` og faller ellers tilbake til oransje `#FFB68A`.
- **Modus:** «Lys eller mørk», med valgene Følg systemet, Lys og Mørk. Standard er Mørk, som tilsvarer dagens design.
- **I prototypen:**
  - Alle Android-farger er CSS-variabler: `var(--m3-XXXXXX, #XXXXXX)`.
  - Tonene regnes om fra én frøfarge ved å flytte fargetonen; semantisk grønn, rød og gul flyttes ikke.
  - Lys modus speiler lysheten.
  - I native: bruk M3-tonepaletter fra frøfargen og standard rollefarger.
- **Plass til FAB:** innholdet har 180 px bunnpolstring, så Skann-FAB-en ikke dekker knapper.

### 3.11 Profilbilde i appen
- **Opplasting:** under Innstillinger → Konto («Last opp / Bytt profilbilde», «Fjern bildet»). Brukeren velger fra Bilder, Filer eller tar et nytt bilde.
- **Hvor det vises:** i kontoraden og i menyknappen på Homelab.
- **Deling:** samme bilde som i Homelab på desktop (samme endepunkt).

---

## 4. Nye/endrede endepunkter

```
GET    /api/setup/status                  → { needsSetup: bool }
POST   /api/setup                         { adminName, serverName, username, password }
PATCH  /api/users/:id                     { displayName? , role? }
POST   /api/me/avatar   DELETE /api/me/avatar
GET    /api/search/suggest?q=             (proxy mot Google Suggest, hl=no)
GET    /api/search/history   POST /api/search/history { q }   DELETE /api/search/history[/:q]
POST   /api/search/history/import         (Google Takeout JSON)
GET    /api/me/layout   PUT /api/me/layout { finNav:{order,hidden}, mobile:{sec,hlTabs,finTabs,hide} }
POST   /api/transactions   PATCH /api/transactions/:id   DELETE /api/transactions/:id
GET    /api/transactions/:id/original     → { receiptUrl?, bankRow }
GET    /api/ai/history   DELETE /api/ai/history
GET    /api/widgets/server-status         GET /api/widgets/ruter?stop=
```

## 5. Akseptansekriterier (prompt 06)

1. **Ny server:** en tom database viser oppsettet. Etter det er hovedadmin opprettet, brukeren er innlogget, og navnet vises i hilsenen.
2. **Endre navn:** et nytt navn under Brukere slår inn med en gang i hilsen og meny, både på desktop og mobil.
3. **Mobil Homelab:** «−» på Snarveier skjuler den. «+» → «Legg til» henter den tilbake. Rekkefølgen beholdes etter omstart.
4. **Mobil fanelinje:** endret rekkefølge i «Navigasjon · Finans» gjelder alle tre formfaktorene, og pillen på iOS følger riktig fane.
5. **Søk-fanen:** åpner tastaturet uten et ekstra trykk.
6. **Redigert transaksjon:** endringen vises i liste, detalj, rapporter og AI-søk. En slettet transaksjon er borte overalt.
7. **Original banktransaksjon:** viser bankens tekst uendret, slik den var før navnevasking.
8. **Android:** «Følg systemet» endrer appens farger når bakgrunnsbildet byttes (Android 12+). Lys og mørk modus følger systemet når det er valgt.
9. **FinansHub desktop:** et skjult menypunkt forsvinner fra sidemenyen, men siden kan fortsatt nås fra lenker. Import ligger bare under Innstillinger.
