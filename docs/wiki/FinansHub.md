# FinansHub

FinansHub er økonomidelen og ligger på `/finans/`. På PC får du desktop-grensesnittet, og på telefon får du mobil-PWA-en i Papir-design. De native appene bruker det samme API-et. Hver bruker har sitt eget regnskap.

<img src="https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/docs/images/finanshub-oversikt.webp" alt="FinansHub-oversikten i Lys hovedbok" width="100%">

**Innhold:** [Kom i gang](#kom-i-gang) · [Kontoer](#kontoer) · [Import fra banken](#import-fra-banken) · [Kvitteringer](#kvitteringer) · [Budsjett og faste utgifter](#budsjett-og-faste-utgifter) · [Abonnementer](#abonnementer-subscription-os) · [Aksjer](#aksjer-trading-212) · [Finn-handler](#finn-handler) · [Boliger](#boliger) · [✦ AI-søk](#-ai-søk) · [Temaer](#temaer)

## Kom i gang

Første gang du åpner `/finans/` med tom database, velger du:

| Valg | Hva skjer |
|---|---|
| **Start tom** | Standardkategorier og ingen data |
| **Hent fra SMB-share** | Gjenoppretter en backup fra NAS-en |
| **Last opp backupfil** | `.json`, `.xlsx` eller `.tar.gz(.enc)` |
| **Eksempeldata** | Demodata, så du kan se hvordan alt ser ut |

En god rekkefølge: legg til kontoene dine, importer de siste månedene fra nettbanken, sett et budsjett, og begynn å skanne kvitteringer.

## Kontoer

**Kontoer → + Ny konto.** Gi kontoen navn, bank, type (brukskonto, sparekonto, kredittkort eller kontanter), de fire siste sifrene på kortet og startsaldo. De fire sifrene brukes til å matche kvitteringer. Saldoen oppdateres av transaksjonene. Sparemål legges på kontoen, og fremdriften vises på Oversikt.

## Import fra banken

1. Last ned kontoutskriften fra nettbanken som **CSV** eller **Excel**.
2. **Innstillinger → Import** (eller dra filen inn på Transaksjoner).
3. Velg konto. Kolonnene finnes automatisk for DNB (konto og kort), Nordea, SpareBank 1, Sbanken og Bank Norwegian.
4. Forhåndsvisningen viser logo, dato, renset navn, kategoriforslag og beløp. Trykk **Importer N poster**. Duplikater hoppes over.

Ukjente formater: AI finner kolonnene og lagrer formatet som en mal til neste gang. Beløp som `11,616.00` og `1 234,50` tolkes riktig. Banktekster ryddes, så `Vipps:pal wengard` blir «Vipps · Pal Wengard», og `VIPPS*KIWI 123` gjenkjennes som KIWI.

## Kvitteringer

<img src="https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/docs/images/finanshub-kvitteringer.webp" alt="Kvitteringer med kø og gjennomgang" width="100%">

### Slik kommer kvitteringene inn

| Hvor | Hvordan |
|---|---|
| **Appen** | Trykk på skanneknappen: kameraet åpner med en gang (dokumentskanneren på iOS). Hold inne for Kvittering, Oppskrift, Bilder eller Fil. |
| **Web** | Kvitteringer → Last opp, eller dra filer inn (flere samtidig, også PDF og HEIC) |
| **E-post** | Kvitteringer i en IMAP-mappe hentes automatisk, se [Integrasjoner](Integrasjoner#imap-og-proton-mail-bridge) |
| **Del-menyen** | «Del → FinansHub» fra Galleri (Android) |
| **iOS-snarvei / skript** | `POST /finans/api/receipts`, se [API](API#last-opp-en-kvittering) |

Uten nett legges kvitteringene i **«Venter på opplasting»** og sendes når nettet er tilbake.

### Flyten

1. **Kø:** hver fil får en jobb. Køen viser status, for eksempel «Gemini leser … 60 %», eller «Gemini svarte ikke innen 20 s · prøver Groq».
2. **AI eller OCR:** motoren du har valgt under «Hvem gjør hva» leser butikk, dato, sum, MVA og varelinjer. Feiler AI, kan **lokal OCR (Tesseract)** lese kvitteringen i stedet. Kjente kjeder gjenkjennes, og butikknavnet slås opp i Enhetsregisteret ut fra org.nr.
3. **Kategori:** regler går foran AI-forslaget.
4. **Bankmatch:** samme beløp ±1 kr og dato ±3 dager. Like fire siste siffer på kortet gir forrang.
5. **Til gjennomgang:** her kan du redigere, **godkjenne**, **analysere på nytt** (også «✦ Analyser på nytt med Gemini» eller «Les med lokal OCR», med resultatene side om side) eller slette.
6. **Bokfør:** ingenting bokføres før du trykker Bokfør.
7. **Angre:** under «Bokført» har hver kvittering **↺** for å angre bokføringen.

> [!TIP]
> Kvitteringer AI ikke klarte, kan leses på nytt samlet. Trykk «Les N som AI ikke klarte, med lokal OCR» i køen.

## Budsjett og faste utgifter

- **Budsjett:** et månedsbudsjett per kategori. Du får varsel ved 80 % og 100 %. Oversikt viser «Igjen av budsjett» med dager igjen i måneden.
- **Faste utgifter:** regninger og trekk, med automatisk oppdagelse (**Finn faste trekk**). Kommende trekk vises på Oversikt.
- **Regler:** **Innstillinger → Regler**. `*` er jokertegn. For eksempel `REMA*` gir kategorien *Mat og dagligvarer*. Retter du en kategori, kan den bli en ny regel.

## Abonnementer (Subscription OS)

<img src="https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/docs/images/finanshub-abonnementer.webp" alt="Subscription OS" width="100%">

- **+ Legg til abonnement:** skriv inn selv, lag fra en kvittering (AI fyller ut feltene), eller velg fra transaksjoner.
- **Intervall:** månedlig, årlig eller hvert 2. år. 1 200 kr hvert 2. år gir 50 kr i måneden.
- **Innsikt:** AI-sparing («Spar 428 kr i måneden»), «Lite brukt», «Pris økt», graf per kategori og en kalender over trekk.
- **Rekkefølge:** hold inne og dra kortene i appen.

## Aksjer (Trading 212)

Sett opp nøkkelen under [Integrasjoner → Trading 212](Integrasjoner#trading-212). Aksjer viser portefølje, fordeling, posisjoner, ordrer og utbytte, med «Synk nå». Ved feil (for eksempel 429) vises sist gode data. Feilmeldinger og løsninger står i [docs/finanshub.md](https://github.com/SebastianKristo/torskenes-verden/blob/main/docs/finanshub.md#hvis-trading-212-avviser-nøkkelen).

## Finn-handler

Kjøp og salg via Finn (Trygg betaling, Fiks ferdig, Tillit).

- **Legg inn:** lim inn en annonselenke eller en Finn-e-post, eller skriv inn handelen selv. Med en Finn-mappe i e-postoppsettet leses Finn-e-postene inn automatisk.
- **Detaljside:** annonsen med bildekarusell, pris og beskrivelse (lagret lokalt, så den vises selv om annonsen er fjernet), original kvittering, e-postene i handelen og egne bilder.
- **Steg:** Betalt → Sendt → Mottatt → Godkjent ved kjøp, og Solgt → Sendt → Levert → Utbetalt ved salg.
- Sporingsnumre fra Fiks ferdig går rett til [Sporing](Sporing).

## Boliger

<img src="https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/docs/images/finanshub-boliger.webp" alt="Boliger" width="100%">

En bolig er et felles regnskap for et hus, en hytte eller en husholdning, og er **det eneste som deles mellom brukere**.

**Eksempel: hytte delt med søsken**

1. **Boliger → + Ny bolig:** navn «Hytta Geilo», adresse, farge og bakgrunnsbilde.
2. **Tilgang:** inviter brukerne med rollene Eier, Kan redigere eller Kan se.
3. **Budsjett:** for eksempel 40 000 kr i året.
4. **Prosjekter:** «Nytt tak» med leverandør, budsjett og avdragsplan. **Registrer betalt** lager utgiften.
5. **Regninger:** strøm, forsikring og kommunale avgifter, med hvem som betaler.
6. **Utgifter:** skann en kvittering rett inn i boligen fra mobilen. Utgifter fra andre medlemmer havner under «Til gjennomgang» og må godkjennes.

AI velger boligkategori (med underkategorier, for eksempel *Hage og uteområde › Blomster*). Hold inne på en bolig i appen for å redigere navn, adresse, budsjett, farge og bakgrunn.

## ✦ AI-søk

Trykk **✦ AI** i søkefeltet og spør på vanlig norsk:

- «hvor mye brukte jeg på strøm i september?»
- «sist jeg var på Biltema»
- «kvitteringer med tomater»
- «største utgift forrige måned»
- «abonnementer over 200 kr»

**Slik virker det:** treffene hentes fra transaksjoner, kvitteringer og varelinjer (fulltekstsøk, og vektorsøk hvis du har embeddings). Språkmodellen svarer bare ut fra treffene, og et svar med tall som ikke finnes i dataene, blir forkastet. Hvert treff viser hvorfor det traff.

Lange søk kjøres som jobb, med «✦ Ollama tenker … 34 s av 60 s», fremdriftslinje og **Avbryt**. Søket venter så lenge tidsgrensen du har satt for motoren. Korte søk på 1–2 ord bruker vanlig søk først, med «✦ Spør AI likevel». Se [AI og tidsgrenser](AI-og-tidsgrenser).

## Temaer

**Innstillinger → Utseende:** Lys hovedbok (standard), Mørk hovedbok, Glød og «Nåværende (FinansHub v2)». Valget lagres per bruker. Sidemenyen kan kollapses til bare ikoner, og rekkefølgen endres med **Endre** ved siden av «Generelt».

## Backup

Se [Oppdatering og backup](Oppdatering-og-backup).
