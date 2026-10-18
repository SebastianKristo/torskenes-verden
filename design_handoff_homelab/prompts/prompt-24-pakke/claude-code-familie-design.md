# Til Claude Code: Familie-siden skal se nøyaktig ut som designet, på iOS og Android

**Fasit:** `design/Familie.dc.html` (åpnes direkte i nettleser) og `design/Mobil Papir App.dc.html` → side `kart`.
iOS og Android skal være **piksel-like**. Ikke bruk systemkomponenter som endrer utseendet (ingen `List`/`Form`-stil på iOS, ingen Material-kort med egen elevasjon på Android). Bygg egne komponenter med tokenene under.

## Tokens (Papir lys / mørk)
| Token | Lys | Mørk | Bruk |
|---|---|---|---|
| `bg` | `#f3efe6` | `#14130f` | Sidebakgrunn |
| `card` | `#ffffff` | `#211f19` | Kort |
| `ink` | `#1b1a17` | `#f3efe6` | Tekst, valgt pille |
| `mut` | `#7a7468` | `#8a8578` | Sekundærtekst |
| `line` | `#d8d1c2` | `#34312a` | Skillelinjer, kanter |
| `lab` | `#b23a2a` | `#f08a76` | Etiketter, varsel |
| `pos` | `#2f7a4f` | `#8fd3a5` | Delt / fersk / OK |

**Fonter** (pakkes med appen, ikke systemfont): *Newsreader* (titler, store tall), *Manrope* 400–800 (UI-tekst), *IBM Plex Mono* 500–600 (etiketter i versaler, tall i tabeller). Etiketter: Plex Mono 600, 10.5 pt, sperring 0.12 em, `lab`.
**Radier:** kort 20–24, piller 999, ikonknapper 12–14. **Avstand:** sidemarg 16, mellom kort 12–14, kortpadding 14–16.

## Struktur
1. **Topp:** samme toppbilde som resten av appen. «‹ Hjem» (mørk glass-pille) til venstre, profilbilde til høyre, undertittel *«Posisjon, soner og helse»* (Newsreader kursiv 17) og tittel **Familie** (Newsreader 500, 40).
2. **Fanelinje nederst:** Kart ◎ · Soner ◌ · Helse ♡ · Mer ⋯. Flytende svart pille (`#1b1a17`), valgt fane er lys pille med ikon og tekst. **Ingen skann-knapp (FAB).** Ingen fanevelger øverst.
3. **Verktøyrad over kartet:** «+ Ny sone på kartet» (fylt `ink`, høyde 42) til venstre. «Vis alle» (kortfarge + `line`-kant) og ↻ (rund 42) til høyre.
4. **Kart** (høyde 420, radius 24):
   - **iPhone og iPad: Apple Maps (MapKit)** med `MKMapView` / SwiftUI `Map`, stil `.standard(elevation: .flat, pointsOfInterest: .excludingAll)`. Tilpass utseendet så det ligner Papir: lys modus, dempede POI-er. Soner er `MapCircle` (fyll 13 %, kant 2 pt), personer er `Annotation` med samme pin-komponent som designet. Ingen ekstra kostnad, krever ingen nøkkel og virker offline med Apples cache.
   - **Android og web: Kartverket topo** (`https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png`) via MapLibre / Leaflet, eventuelt gjennom backend-proxyen. Se `claude-code-kart-fiks.md`.
   - Alt over kartet (pins, sonesirkler, ikoner, etiketter, zoomknapper, «Sanntid»-pille, verktøyraden) skal være likt på begge. Bare bakgrunnskartet er forskjellig.
   - **Soner:** sirkel med fyll = sonefarge 13 % (`22` hex-alfa), kant 2 px i sonefarge. I sentrum er sonens ikon i en 28 px sirkel (fylt sonefarge, hvit 2 px kant, skygge). Navnet ligger i en hvit etikett (88 % opasitet, radius 8, Manrope 700 11) rett under sirkelen.
   - **Personer:** rund pin 40 px (50 px når valgt), 3 px hvit kant, skygge 0 6 16 / 30 %. Profilbilde, ellers initialer (Manrope 800 13, hvit) på personfarge. Liten svart badge med fart (km/t) når personen beveger seg. Spor (siste posisjoner) som linje i personfarge, 55 % opasitet.
   - Zoom + / − / ◎ nede til høyre (40 × 40, radius 12, hvit 95 %). «Sanntid · …»-pille nede til venstre med statusprikk. «© Kartverket» liten nederst.
5. **Personkort** (når en person er valgt): stor avatar 48 (trykk = bytt bilde, ✎-merke), navn Newsreader 22, «Sted · oppdatert …», × til høyre. Tre sensorruter: Batteri, Bevegelse, Fart.
6. **«Min deling»-kort** og **FAMILIEN**-liste: avatar 42 med statusprikk (grønn fersk / gul > 15 min / grå av), navn Manrope 700 15, sted 12.5 `mut`, batteri til høyre.
7. **Soner-fanen:**
   - Liste med kort per sone: ikon i fylt sirkel 42 (sonefarge, hvitt ikon), navn + «radius · hvem er der nå», ✎ og −.
   - ✎ åpner redigering inne i kortet: navn, ikonrutenett (13 ikoner), 10 farger + fri fargevelger (regnbuerunding, hex vises) og radius-slider 50–2000 m.
   - Personchips per sone for varsel av/på.
   - «Ny sone»-kortet har samme felter.
   - **Ikoner** (nøkkel → SF Symbol / Material Symbol): `home` house / home, `work` briefcase / work, `school` graduationcap / school, `heart` heart / favorite, `cabin` house.lodge / cabin, `gym` dumbbell / fitness_center, `shop` bag / shopping_bag, `ball` sportscourt / sports_soccer, `coffee` cup.and.saucer / local_cafe, `tree` tree / park, `plane` airplane / flight, `star` star / star, `pin` mappin / location_on. Tegn dem med samme strek (1.9–2.2) og størrelse på begge plattformer. Bruker du SVG-banene fra designet, blir de identiske.
8. **Helse-fanen:** kilder (Apple Health ♥ / Health Connect ✚) med status, og liste per person (avatar 40, kilde, delingsstatus-chip).

## Fanelinje – ikon ved siden av tekst (Android avviker)
Gjelder **alle** fanelinjer (Hjem, Finans, Familie, Domener, Subscription OS), men feilen synes tydeligst på Familie (Kart ◎ · Soner ◌ · Helse ♡ · Mer ⋯):
- **Ikonboks 18 × 18 pt**, glyf **16 pt** (Newsreader 500 for tegn-ikoner, eller SVG 18 med strek 2), `line-height: 1`.
- **Vertikalt sentrert mot teksten** med `align-items: center`, og **flyttet 1,5 pt ned** (`translateY(1.5)`) så den optiske midten treffer x-høyden i Manrope 600 12.5.
- Mellomrom ikon–tekst **7 pt**. Pillens høyde 46, radius 999, padding 0 16 for valgt og 0 6 for uvalgte.
- Valgt fane: lys pille (`navAct`) med ikon og tekst. Uvalgte: bare tekst (ikon skjult), slik iPhone og designet gjør.
- **Android:** ikke bruk `NavigationBarItem`, som har egne mål (24 dp ikon over tekst). Bygg egen `Row(verticalAlignment = CenterVertically)` med `Icon(Modifier.size(18.dp).offset(y = 1.5.dp))` + `Spacer(7.dp)` + `Text(fontSize = 12.5.sp, lineHeight = 12.5.sp, includeFontPadding = false)`. Uten `includeFontPadding = false` havner teksten for høyt i forhold til ikonet.
- **iOS:** `HStack(spacing: 7) { Image().font(.system(size: 16)).frame(width: 18, height: 18).offset(y: 1.5); Text().font(.custom("Manrope-SemiBold", size: 12.5)) }`.
- Test: legg et 4× forstørret utsnitt av Familie-fanelinjen på Android og iPhone ved siden av hverandre. Ikonene skal ha samme størrelse og ligge på samme høyde (±0,5 pt).

## Én person = én oppføring (flere enheter)
- En person som er logget inn på flere telefoner, nettbrett eller klokker vises **én gang**: én pin på kartet, én rad i Familien-listen, én rad i Helse og én avatar i Posisjon-kortet på Hjem. Ikke én per enhet.
- Grupper på `user_id` (ikke `device_id`). Innlogget bruker vises som «Du» / «Sebastian (deg)».
- **Posisjon:** bruk den nyeste og mest nøyaktige posisjonen blant enhetene (lavest `accuracy` innenfor siste 5 min, ellers nyeste). Spor (trail) kommer fra enheten som ble brukt.
- **Batteri og bevegelse** fra samme enhet som posisjonen. Undertekst: «Hjem · 2 enheter».
- Personkortet viser enhetene under sensorrutene: «iPhone 15 Pro · 82 % · nå» og «Galaxy S24 · 54 % · 12 min siden». Trykk velger hvilken enhet som brukes som kilde («Automatisk» som standard).
- Helse: slå sammen per person (Apple Health og Health Connect) og fjern overlappende skritt (bruk høyeste per time, ikke summen).
- Backend: `GET /api/familie/posisjoner` returnerer én post per person med `devices: [...]` og `source_device`.

## Data og oppførsel
- Profilbilde: fra brukerkontoen, kan overstyres per person (beskjæres til kvadrat, 160 px).
- Sone: `{id, name, lat, lon, radius, color: "#rrggbb", icon: "home"|…, notify: {userId: bool}}` via `/api/familie/soner`. Endringer lagres umiddelbart.
- «Vis alle» zoomer slik at alle personer er synlige. ↻ henter posisjoner på nytt.
- Lys og mørk følger appens Papir-tema.

## Akseptanse
Ta skjermbilde av Kart, Soner (med én sone i redigering) og Helse på iPhone 15 og Pixel 8 i lyst og mørkt tema. Legg dem ved siden av designet i 390 px bredde. Farger, fonter, radier, avstander og ikoner skal være like. Avvik på mer enn 2 px eller annen font regnes som feil.
