# Glimt-brief (morgen / dag / kveld) + widgets + Hjem-kort + Glimt-figur

Inspirasjon: vedlegg `uploads/pasted-1792434461040-0.png` (en «brief» på telefonen). Eget design i Papir-stil.
Fasit: `Glimt Brief.dc.html` (`mode`: page | card | ios | android | samsung). Oversikt: `Glimt Brief Oversikt.dc.html`. Integrert i `Mobil Papir App.dc.html` (Hjem-kort øverst og brief-side som fullskjerm).

## Brief-siden
- Tittel etter tid: **Morgenbrief** (før 11) / **Dagsbrief** (11–17) / **Kveldsbrief** (etter 17). «GLIMT · …» i rød mono og **Ferdig**-pille.
- **Oppsummering** fra Glimt (Newsreader 17), f.eks. «God kveld, Sebastian. Lettskyet og 8° i Oslo, regn fra ca. 20. Neste er Tannlege kl. 15:15. Ta med paraply.». Bygges av backend/LLM fra dataene under. Prototypen bruker en mal.
- **Vær** (blått kort `#22476b`):
  - ikon, temperatur nå, sted og høy/lav
  - **nedbør neste 12 t** som søyler
  - «Sammenlignet med i går» (X grader kaldere/varmere) og solnedgang
  - Data: Open-Meteo/MET (`current`, `hourly.precipitation`, `daily` med `past_days=1`).
- **Kalender:** de 3 neste (i dag/i morgen) med tid, fargestripe, tittel og sted. Topp-høyre: «NESTE OM 40 MIN». Trykk åpner **Kalender-appen** på dagen (`kalender://dag/…`).
- **Nyheter:** 3 saker fra Nyhetsleser-kildene (NRK, VG, E24) med kilde og tid. Trykk åpner saken.
- Bunn: «Laget av Glimt 20:31 · Vær: … · Nyheter: …».

## Glimt-figuren (interaktiv)
> Oppdatert: guide-runden bruker nå Glimt-familien (Sky/Dråpe på vær, Ugle på kalender, Glimt på nyheter). Se `claude-code-glimt-figurer.md` → «Glimt-familien».
- En liten figur: krem fjes i Glimts regnbuering (roterer sakte), to øyne som blunker, rosa kinn og rød munn. En stjerne over hodet glitrer, og én arm vinker. Den svever opp og ned (2,6 s).
- **Guide-runde** starter automatisk første gang briefen åpnes (kan slås av):
  1. «Hei! Jeg er Glimt. Vil du at jeg viser deg dagen din?» [Vis meg]
  2. Scroller til **Vær**: kortet får en pulserende rød ring, og figuren lener seg mot kortet og «snakker» (munnen beveger seg, ringen spinner raskere). Teksten forklarer været.
  3. **Kalender** → neste avtale.
  4. **Nyheter**.
  5. «Det var alt for nå. Trykk på meg når du vil ha en ny runde.»
  
  Boble med **Neste** / **Hopp over**. Trykk på figuren starter eller avslutter runden. Lett haptikk ved hvert steg.
- Senere: figuren kan svare på spørsmål («hva betyr det for løpeturen?») ved å åpne Glimt-chat med briefen som kontekst.
- Respekter «Reduser bevegelse»: ingen svev eller spinn, bare fade.
- Native: tegn figuren som vektor (SwiftUI Shapes / Compose Canvas, eller Lottie/Rive) med tilstandene **idle**, **talk**, **point** og **wave**.

## Hjem-kort
Øverst på Hjem (over widgetene, kan flyttes og skjules i wiggle-modus som widget `h12` «Glimt-brief»). Blått kort med «KVELDSBRIEF · GLIMT», oppsummering (3 linjer), chips (8° lettskyet · Tannlege 15:15 · 3 nyheter) og figuren til høyre. Trykk åpner briefen.

## Widgets
- **iPhone (WidgetKit):**
  - Liten: blå, figur + temperatur, «KVELDSBRIEF» og neste avtale.
  - Medium: krem, figur + oppsummering til venstre, og VÆR / NESTE / NYHET til høyre.
  - Trykk → `homelab://brief`.
- **Android (Glance, Material You):** 4×2 med `primaryContainer`, figur, tittel, temperatur-pille, oppsummering (2 linjer) og chips.
- **Samsung (One UI):** 4×2, hvit 78 % med blur, tittel, oppsummering, «Åpne brief ›», figur + temperatur.
- Oppdatering: kl. 06:30 (morgen), 11:00 og 17:00, og ved store endringer (ny avtale innen 2 t, regnvarsel). Varsel «Morgenbrief er klar» kan slås av.

## Backend
`GET /api/brief?kind=morning|day|evening` → `{title, summary, weather{now,hi,lo,cond,rain12h[],vsYesterday,sunset}, events[], news[], generatedAt}`. Lages av Glimt (rute «Glimt · brief» i AI-kontroll, standard lokal modell) og caches til neste vindu.

## Alle widget-størrelser
Fasit: `Glimt Brief.dc.html` → `mode="ios" | "android" | "samsung"` viser alle størrelsene. Se `Glimt Brief Oversikt.dc.html`.
- **iPhone (WidgetKit):**
  - **Liten** (`systemSmall`): blå, figur, temperatur, «KVELDSBRIEF» og neste avtale.
  - **Medium** (`systemMedium`): krem, figur + oppsummering, og VÆR / NESTE / NYHET.
  - **Stor** (`systemLarge`): figur + oppsummering (3 linjer), blått værkort med nedbør 12 t, 2 neste avtaler og 2 nyheter.
  - **Låseskjerm:** `accessoryRectangular` (✦ BRIEF, temperatur · neste og tid) og `accessoryCircular` (figuren).
- **Android (Glance, Material You):**
  - **2×2**: figur, stor temperatur, tilstand og chip med neste.
  - **4×1**: figur + oppsummering (2 linjer) + temperatur-pille.
  - **4×2**: tittel, oppsummering og chips.
  - **4×4**: figur + oppsummering, værkort med nedbør, 2 avtaler og knappene **Åpne brief** / **Spør Glimt**.
  - Responsiv `SizeMode.Responsive` med disse fire.
- **Samsung (One UI):**
  - **2×2**: figur, temperatur, tittel og neste.
  - **4×1**: figur, «Kveldsbrief · 8°», neste og «Åpne ›».
  - **4×2**: oppsummering + figur.
  - **4×4**: oppsummering, to fliser (vær blå, neste avtale), 2 avtaler og 2 nyheter.
  - Hvit 78 % + blur, radius 26, og støtte for One UI-gjennomsiktighet.
- Alle: trykk på avtale → `kalender://hendelse/{id}`, trykk på nyhet → artikkelen, resten → `homelab://brief`. Figuren er statisk i widgets (idle-positur). Tittel følger tiden: morgen, dag eller kveld.

## Glimt snakker (opplesning) + brief-innstillinger
Fasit: `Glimt Brief.dc.html` → `say()`, `VOICES`, `CHV`, `cfg` (`localStorage glimt_brief_cfg`). Prototypen bruker nettleserens norske `speechSynthesis`. I appen brukes ekte TTS.

### Stemme
- **Merk:** Whisper er tale → tekst (lytting), ikke tekst → tale. Whisper (lokalt, `large-v3-turbo`) brukes når brukeren **snakker til** Glimt.
- **ERSTATTET (se «Nesten menneskelige stemmer» under):** Piper og nettleserstemmer høres robotaktige ut og skal ikke være standard.
- `POST /api/tts {text, voice, rate, pitch, character}` → `audio/ogg` (stream). Cache per setning (hash) så samme brief ikke genereres på nytt. Forhåndsgenerer lyd når briefen lages.
- **Stemmer:** Nora (rolig og varm, standard), Henrik (lav og trygg), Lys (glad og lett). Hver har «▶ Hør». **Tempo:** Rolig ×0,85 · Normal ×1 · Rask ×1,15.
- **Vennene får egen klang** på samme stemme: Sky lysere (pitch ×1,12), Dråpe lysest (×1,25), Ugle dypere (×0,8), Glimt Natt litt lavere og roligere.
- Mens noen snakker: munnen beveger seg, og en mørk pille viser «▮▮▮ Sky snakker · Nora · Stopp» med lydstolper. Lyd stopper ved Hopp over, Ferdig, når appen går i bakgrunnen og ved telefonsamtale. Følger lydløs-bryteren og «Stille timer».
- Høyttaler-knapp i toppen slår opplesning av/på (husker valget).

### Innstillinger (⚙ i briefen, og Innstillinger → Varsler → Glimt-brief)
- **Glimt-brief** (av/på, alt).
- **Les opp**.
- **Vis meg rundt automatisk**.
- **Venner av Glimt** (av = bare Glimt snakker, og tekstene skrives om uten vennene).
- **Varsel når briefen er klar**.
- **Briefer gjennom dagen**, hver med av/på og klokkeslett:
  - Morgenbrief 06:45 (på)
  - Dagsbrief 12:00 (av)
  - Kveldsbrief 18:00 (på)
  - Nattbrief 22:30 (av)
- Bare valgte briefer lages og varsles. Widgets og Hjem-kortet viser siste valgte brief.
- Lagres i profilen (synk web ↔ mobil): `PUT /api/brief/settings`.

## Web
Fasit: `Homelab Papir Web.dc.html`.
- **Dashboard:** Glimt-brief-kortet (`mode="card"`) rett under søkefeltet, høyrejustert og maks 900 px som søket. Trykk åpner briefen.
- **Brief-panel:** glir inn fra høyre (`translateX(100%) → 0`, 0,34 s), bredde `min(520px, 100%)` og full høyde, med dempet bakteppe (klikk lukker). Innholdet er samme brief-side som mobil (Glimt og venner, opplesning, ⚙ innstillinger, **Ferdig**). Trykk på en avtale går til Kalender. Esc lukker.
- På web leses briefen opp bare etter at brukeren har trykket noe (nettleseren tillater ikke lyd før det). Første gang vises «🔊 Trykk for å høre Glimt».
- Varsler på web: nettleservarsel (Web Push) på brief-tidspunktene hvis tillatt.

## Nesten menneskelige stemmer (erstatter Piper som standard)
Tilbakemelding: «alle de stemmene var grusomme å høre på». Nettleserens og Pipers stemmer er robotaktige. Bruk nevrale sky-stemmer som standard.
Fasit: `Glimt Brief.dc.html` → ⚙ → **STEMMEMOTOR** + `say()` (spiller av MP3 fra leverandøren). Faller tilbake til nettleserstemmen bare ved feil.

| Motor | Standard | Hvorfor | Oppsett |
|---|---|---|---|
| **OpenAI `gpt-4o-mini-tts`** | ✓ ANBEFALT | Svært naturlig. Tar **instruksjoner** om tone/følelse, så hver figur får sin egen personlighet. Billig. | `POST /v1/audio/speech {model, voice, input, instructions, response_format:"mp3"}` |
| **ElevenLabs Multilingual v2** | BEST | Mest menneskelig og uttrykksfull. God norsk. Kan **klone en egen Glimt-stemme** (Voice Design / Instant Voice Clone). | `POST /v1/text-to-speech/{voice_id}`, `model_id: eleven_multilingual_v2`, `language_code: "no"` |
| **Azure Neural nb-NO** | NORSK | Ekte norske stemmer (`nb-NO-PernilleNeural`, `nb-NO-FinnNeural`, `nb-NO-IselinNeural`) med korrekt **tonelag**. Pålitelig, SSML. | Speech SDK / REST med nøkkel + region, SSML `<prosody>` per figur |
| Nettleser | test | Robotaktig | bare fallback |

**Stemmer:**
- **Nora** (rolig og varm): OpenAI `sage`, ElevenLabs `XrExE9yKIg1WjnnlVkGX`, Azure Pernille
- **Henrik** (lav og trygg): OpenAI `ash`, ElevenLabs `pNInz6obpgDQGcFmaJgB`, Azure Finn
- **Lys** (glad og lett): OpenAI `coral`, ElevenLabs `EXAVITQu4vr4xnSDxMaL`, Azure Iselin

Prøv flere og velg på gehør. ElevenLabs har også ekte norske stemmer i Voice Library: søk «Norwegian».

**Personlighet per figur:**
- **OpenAI:** `instructions`:
  - Glimt: «varm, vennlig, litt leken, Oslo-uttale, rolig tempo, smil i stemmen»
  - Natt: lav og nesten hviskende
  - Sky: lys, glad og nysgjerrig
  - Dråpe: søt, sprudlende og fnisete
  - Ugle: klok, dyp og langsom, som en snill bestefar
- **ElevenLabs:** `stability` / `style` per figur (Ugle .75/.2, Dråpe .3/.65 osv.).
- **Azure:** SSML `<mstts:express-as style="cheerful|calm|whispering">` + `<prosody pitch rate>`.

**Uttale:** gjør om «kl.» til «klokka» og datoer/tider til tekst før TTS («15:15» → «kvart over tre»). Legg et uttaleordbok for egennavn (Grünerløkka, Majorstuen, IN2010 → «I N tjue ti»).

**Arkitektur i appen:**
- `POST /api/tts {text, character, voice, rate}` på serveren, med nøkler fra AI-kontroll (aldri i klienten). Stream MP3/Opus, så lyden starter innen ca. 300 ms.
- **Cache** per (motor, stemme, figur, tekst-hash) i 30 dager. Forhåndsgenerer hele briefen når den lages, så avspillingen er umiddelbar.
- Budsjett: inngår i sky-budsjettet i AI-kontroll. En brief på ca. 600 tegn koster øre per dag.
- Lokalt alternativ for de som vil holde alt hjemme: **F5-TTS / XTTS** med en norsk finjustert modell på GPU-en. Valgfritt, ikke standard.

## Engelsk stemme, nyheter med bilder, prøveperioder i briefen
Fasit: `Glimt Brief.dc.html`.
- **Språk for opplesning:** Norsk · English (⚙ og Innstillinger → Glimt). På English byttes guide-replikkene til engelsk («Hi, it's Sky! …», «Hoo, Owl here …», «Oink! Piggy here …»), og TTS kjøres med engelske instruksjoner (`CHAR_EN`) / `language_code: "en"` / `en-GB`. Nettleserfallback velger beste engelske stemme (Natural/Neural/Premium). Prøv OpenAI eller ElevenLabs på engelsk: de høres ofte enda mer naturlige ut. Neste steg: oversett også hele briefen (oppsummering, kort) når språket er English.
- **Nyheter:**
  - **Toppsak** med stort bilde (16:9, radius 16), kilde, tid, tittel (Newsreader 20) og ingress.
  - Under: **6 saker** med miniatyr (76 × 56, radius 10), kilde, tid og tittel (2 linjer).
  - Bilder i appen: `media:content` / `enclosure` fra RSS, ellers `og:image` fra artikkelen (server-proxy og cache). Prototypen bruker plassholderbilder (picsum).
  - Kilder: Nyhetsleser-oppsettet (NRK, VG, E24, Aftenposten …). Glimt velger de viktigste etter brukerens interesser.
- **Abonnementer (prøveperioder):**
  - Nytt rosa kort i briefen når en prøve slutter innen 7 dager. Per prøve: logo, navn, «Prøve · avslutt før tir 21. · deretter 149 kr/mnd», fremdrift og stort tall med dager igjen (rødt ≤ 2, oransje ≤ 7).
  - Knapper: **✓ Jeg har avsluttet Viaplay** (markerer `done`, fjerner påminnelser) og **Åpne Abonnement ›**.
  - Data: `papir_trials` / `trials`-tabellen (se `claude-code-prove-paminnelse.md`).
  - I guide-runden tar **Gris** over: «Nøff! Gris her. Prøveperioden på Viaplay slutter om 2 dager. Husk å avslutte den før tir 21., ellers koster den 149 kroner i måneden.» [Takk, Gris]


## FEIL 2026-10-19: siden endrer bredde når Glimt viser fram, og den røde ringen sitter skjevt
Vedlegg: `uploads/ScreenRecording_10-19-2026 22-11-25_1.MP4`. Vanlig scroll fungerer, men når Glimt guider (flyr inn, peker, snakker) blir siden bredere og kan dras sideveis. Den pulserende røde rammen rundt Vær-kortet følger ikke kanten nøyaktig.
Fasit: `Glimt Brief.dc.html`.
1. **Fast bredde:**
   - Scroll-containeren har `overflow-x: hidden`, `overscroll-behavior-x: none` og `touch-action: pan-y`.
   - Rot-flaten har `overflow: hidden` + `contain: paint` + `max-width: 100vw`.
   - Figur, boble og vennene som flyr inn utenfra (translateX) skal ligge i et `position: fixed`/absolutt lag **utenfor** scroll-innholdet, så de ikke øker `scrollWidth`.
   - Native: `ScrollView(.vertical)` med `.scrollBounceBehavior(.basedOnSize, axes: .horizontal)` / Compose `verticalScroll`, og overlay i egen `ZStack`/`Box`.
2. **Ringen:**
   - Erstatt `box-shadow`-pulsen med **`outline`** som følger kortets `border-radius` nøyaktig: `outline: 2.5px solid #b23a2a`, `outline-offset` 4 → 8 → 4 px (1,3 s), og fargen pulserer mellom 100 % og 45 %.
   - Ringen settes på selve kortet (`data-gb="vaer"`), ikke på en wrapper med annen størrelse, og kortet må ikke ha `transform: scale` samtidig.
   - Native: `.overlay(RoundedRectangle(cornerRadius: 24 + offset).stroke(...))` med `padding(-offset)`, så radius = kortradius + offset.
3. Scroll til kortet: `scrollTo(top − 90)`, og ringen starter først når scrollen er ferdig (`scrollend` / 350 ms), så den ikke hopper.


## Sveip bort brief-kortet på Hjem (venstre → høyre)
Fasit: `Mobil Papir App.dc.html` → `bsVals()`.
- **Sveip mot høyre** på brief-kortet.
  - Kortet følger fingeren (og roterer litt, opptil 5°).
  - Bak kortet kommer et mørkt felt fram: ✓ «Sveip for å skjule», «Kommer tilbake med kveldsbriefen kl. 17».
  - Retningslås: mer vannrett enn loddrett (1,2×) og mot høyre. Ellers scroller siden som vanlig.
- **Terskel** 38 % av bredden (eller rask flikk > 0,6 px/ms etter 60 px):
  - Feltet blir **grønt**, teksten blir «Slipp for å skjule», ✓ spretter (scale 1,15) og det kommer et lett haptisk tikk.
- **Slipp over terskel (animasjon):**
  1. Kortet flyr ut til høyre (`translateX(115%) rotate(7°)`, 0,34 s), og feltet viser «Brief skjult».
  2. Høyden kollapser til 0 (0,34 s), så de andre widgetene glir opp.
  3. Toast nederst: «Brief skjult til kveldsbriefen kl. 17» + **Angre** (4,5 s).
  4. Haptikk: kort-pause-kort.
- **Slipp under terskel:** kortet fjærer tilbake (0,38 s, lett overshoot).
- **Skjult til neste brief:** lagres per dag og periode (`morgen`/`dag`/`kveld`/`natt`). Kortet kommer tilbake automatisk ved neste brief. Angre viser det med en gang.
- Trykk åpner fortsatt briefen, men ikke hvis man har dratt (click capture).
- Native: SwiftUI `DragGesture` + `.offset/.rotationEffect`, `withAnimation(.snappy)` / Compose `SwipeToDismissBox` (bare `StartToEnd`).

- **Vis hvordan (2026-10-19):** De **2 første gangene** Hjem åpnes (`glimt_brief_swhint`) viser kortet etter 1,2 s et **hint**: det glir 72 px til høyre og tilbake, så 40 px og tilbake (`bsNudge` 2,4 s). Bak kortet vises det mørke feltet «✓ Sveip → for å skjule · Kommer tilbake med …». Hintet stopper med en gang man rører kortet.
- **Now Brief i Mer:** egen rad øverst i Mer (✦-ikon), «Now Brief · Glimt oppsummerer dagen», eller «Skjult på Hjem · trykk for å åpne» når kortet er sveipet bort. Trykk åpner briefen i fullskjerm. Raden kan flyttes eller skjules i Mer-redigeringen som de andre.
