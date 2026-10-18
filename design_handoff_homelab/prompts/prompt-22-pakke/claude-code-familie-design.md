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
   - Fliser: Kartverket topo (se `claude-code-kart-fiks.md`). Ikke Apple Maps eller Google-stil, så iOS og Android blir like. iOS: `MKTileOverlay` med `canReplaceMapContent = true`. Android: MapLibre/osmdroid med samme flis-URL.
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

## Data og oppførsel
- Profilbilde: fra brukerkontoen, kan overstyres per person (beskjæres til kvadrat, 160 px).
- Sone: `{id, name, lat, lon, radius, color: "#rrggbb", icon: "home"|…, notify: {userId: bool}}` via `/api/familie/soner`. Endringer lagres umiddelbart.
- «Vis alle» zoomer slik at alle personer er synlige. ↻ henter posisjoner på nytt.
- Lys og mørk følger appens Papir-tema.

## Akseptanse
Ta skjermbilde av Kart, Soner (med én sone i redigering) og Helse på iPhone 15 og Pixel 8 i lyst og mørkt tema. Legg dem ved siden av designet i 390 px bredde. Farger, fonter, radier, avstander og ikoner skal være like. Avvik på mer enn 2 px eller annen font regnes som feil.
