# Kalender: bare fire kalendere + bedre legg til / rediger + Google-kobling

Ønske 2026-10-20: «det ble veldig mange kalendere i kalender-appen, egentlig har jeg jo bare min personlige som jeg skal kunne velge fra google, en bursdagskalender jeg skal kunne velge fra google og en skolekalender som jeg importerer med url, og helligdager. lag også i mobilappen en bedre måte å legge til og redigere eksisterende kalendere. i web og mac-app kanskje gi meg en google kalender-velger: hvilken kalender er hva.»

Fasit: `Kalendere Oppsett.dc.html` → 1a–1d. Gjelder Kalender på iPhone, Android, web og Mac. Ett datasett: `/api/calendars`.

**Bygget inn (2026-10-20, «jeg ser ikke de i web eller i ios app»):**
- `Kalender App.dc.html` (iOS): `CALS` = Personlig · Bursdager · Skole · Helligdager. Gamle Jobb/Familie/Helse-hendelser vises som Personlig (`CNORM`). Helligdager legges inn som heldag (`HOLI`). Radene viser kilde (Google / tp.uio.no / Norge). «Legg til kalender» har fanene Google · URL (iCal) · Home Assistant.
- `Kalender.dc.html` (web og Mac): samme fire. Timeplan, Prøver og Skole er slått sammen til Skole, og Familie til Personlig (alias i `CALC/CALN/CALSRC`).
- Google-velgeren (1d) er bare i fasit-filen ennå.

## 1. Fire kalendere
| id | Navn | Kilde | Standardfarge |
|---|---|---|---|
| `p` | **Personlig** | Google (én eller flere Google-kalendere slått sammen) | `#b23a2a` |
| `b` | **Bursdager** | Google («Bursdager» fra Google Kontakter) | `#8a3fa0` |
| `s` | **Skole** | iCal/webcal-URL (f.eks. tp.uio.no) | `#2f7a4f` |
| `h` | **Helligdager** | Innebygd (land, standard Norge) | `#a39d90` |

- **Opprydding (migrering):**
  - Jobb, Familie, Helse og Personlig (duplikat) slås inn i **Personlig**.
  - Studie og «Studie 40» slås inn i **Skole**.
  - «Sebastian… Google» blir kilden til Personlig.
  - Bursdager-duplikater blir **Bursdager**.

  Hendelser beholdes og flyttes. Duplikater (samme UID/tittel+tid) slås sammen. Vis én gang: «Vi ryddet kalenderne: 12 → 4. Angre».
- Brukeren kan senere lage egne kalendere («Lag en egen kalender» nederst i Legg til), men de er ikke standard.
- Sidemenyen på Mac/web (som i skjermbildet av Mac-appen) viser bare disse fire + eventuelle egne, uten duplikater og uten «Sebastian… Google»-rader.

## 2. Mobil: Kalendere (1a)
- Innstillinger i Kalender → **Kalendere**. Én rad per kalender:
  - **Fargeboks** = vis/skjul (trykk)
  - **Navnet** åpner redigering
  - Under navnet: merke **GOOGLE / URL / INNEBYGD** + kort kilde («sebastian@kristo.no», «tp.uio.no · hver time», «Norge»), og antall hendelser
- **+ Legg til kalender** (stiplet). Nederst: «Sist synket 08:12 · Synk nå».

## 3. Mobil: Rediger (1b)
- Topp: fargeflate + type-overskrift (GOOGLE KALENDER / ABONNEMENT / INNEBYGD) + navn. **Lagre** oppe til høyre.
- Navn og **Farge** (10 farger, valgt har dobbel ring).
- **KILDE:**
  - Google: konto + hvilke Google-kalendere + «Endre kobling ›»
  - URL: adresse (mono), oppdateringsintervall (15 min / time / 6 t / daglig), sist hentet + antall, og knappene **Lim inn ny URL** · **↻ Oppdater nå**
  - Innebygd: land
- **VIS OG VARSLE:**
  - Vis i kalenderen
  - Vis i Glimt-brief (Helligdager: bare fridager)
  - Varsel (Bursdager kl. 09:00 samme dag, ellers 15 min før, Helligdager av)
  - Skole: **Farge per fag**
- **Fjern kalenderen** (rød, med bekreftelse). Personlig kan ikke fjernes, bare kobles om.

## 4. Mobil: Legg til (1c)
- Ark med tre valg:
  - **Google-kalender** (åpner Google-velgeren, punkt 5)
  - **Abonner med URL** (felt for iCal-adresse + hjelpetekst om hvor man finner den hos skolen + «Legg til»)
  - **Helligdager** (velg land)
- URL: valider `webcal://` / `https://…ics`, hent én gang og vis navn + antall hendelser før lagring. Fag hentes fra tittel (`fagKey`) for fargene.

## 5. Web og Mac: «Hvilken kalender er hva?» (1d)
- **Åpnes:**
  - første gang Google kobles til
  - fra Rediger → «Endre kobling»
  - fra Innstillinger → Kalendere på web
- **Venstre:** alle kalendere i Google-kontoen (`calendarList.list`), med Google-farge, navn og tilgang (primær · eier / delt av … · kan se). Hver rad har segmentet **Personlig · Bursdager · Ikke bruk**.
  - Standard: primær og egne → Personlig, «Bursdager»/kontakter → Bursdager, alt annet → Ikke bruk.
- **Under:** kortene **Skole** (URL, status) og **Helligdager** (land-velger).
- **Høyre:** **SLIK BLIR DET I APPEN**, med de fire kalenderne og hva de består av («Sebastian Kristo + Jobb · Kristo AS · slått sammen»). Oppdateres live.
- Info: Ikke brukt hentes ikke. Nye hendelser fra appen lagres i primær Google-kalender (Personlig).
- **Avbryt / Lagre.** Lagre → `PUT /api/calendars/mapping {googleCalId: 'p'|'b'|null}` → full synk i bakgrunnen med fremdrift.

## Backend
- Google: OAuth `calendar.readonly` + `calendar.events` (bare primær for skriving). Synk med `syncToken` hvert 5. min og push-varsler (`events.watch`).
- URL: hent med `If-None-Match`/`If-Modified-Since` etter valgt intervall. Mislykket 3× → status «Feil · sjekk URL» på raden.
- Helligdager: innebygd tabell per land (bevegelige helligdager beregnet), ingen nett.
