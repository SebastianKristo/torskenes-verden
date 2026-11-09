# Skjold Lab 3D – tilleggsskap til 27 cm

Parametrisk OpenSCAD-modell av et 3D-printet skuffeskap. Det står i de ca. 27 cm ledige
hyllebredden ved siden av hovedskapet (Raaco 150-01-typen, 12 rader × 5 kolonner, 60 skuffer).
Skapet har samme radavstand, skuffhøyde og totalhøyde som hovedskapet, så radene står på linje.

| Fil | Innhold |
| --- | --- |
| `skjoldlab_tilleggsskap.scad` | Hele modellen. Alle mål er parametre øverst i filen og kan også endres i Customizer. |
| `eksporter.sh` | Eksporterer alle deler til STL med OpenSCAD CLI. |
| `.gitignore` | Holder STL/3MF/G-code/PNG utenfor git. Repoet skal ikke ha binærfiler. |

Med standardmålene blir resultatet:

- **12 rader × 4 kolonner = 48 skuffer**, hver ca. **63,5 × 138 × 37 mm** (B × D × H), med håndtak, etikettfelt og spor for 1–3 skillevegger.
- Rammen er **2 × 3 = 6 moduler** à 135 mm bredde (etasjer med 4 + 4 + 4 rader, 188/176/188 mm høye). Hver modul får plass på en 220–256 mm byggeplate.
- Modulene skrus sammen med M3-bolter (side om side) og lasker bak, og pinner og tunger holder etasjene på linje.

> **Viktig:** standardmålene er *typiske* mål for Raaco 150-01 (skap ca. 306 × 150 × 552 mm).
> De er **ikke** målt på ditt skap. **Mål ditt eget skap og én skuff** før du printer noe stort,
> og print først én skuff og den nederste modulen som prøve.

---

## Målekladd (6 mål)

Bruk skyvelære der du kan, og ellers en stållinjal. Skriv målene inn i parametrene øverst i `.scad`-filen.

| # | Hva du måler | Hvordan | Parameter | Standard |
| --- | --- | --- | --- | --- |
| 1 | **Ledig bredde i hylla** | Fra hovedskapets side til hyllekanten/veggen. Trekk fra 3–5 mm luft. | `skap_bredde` | 270 |
| 2 | **Hovedskapets høyde** | Fra underkant til overkant, utvendig. | `skap_hoyde` | 552 |
| 3 | **Hovedskapets dybde** | Fra front (uten håndtak) til bakvegg, utvendig. | `skap_dybde` | 150 |
| 4 | **Radavstand** | Fra overkant skuff i rad 1 til overkant skuff i rad 12, delt på 11. Det er mer nøyaktig enn å måle én rad. | `rad_avstand` | 44 |
| 5 | **Skuffhøyde** | Én skuff, utvendig høyde uten håndtak. | `skuff_hoyde` | 37 |
| 6 | **Høyde til nederste skuff** | Fra underkant skap (bordet) til underkant av skuffen i rad 12. | `nederste_skuff_z` | 14 |

```
Mål 1  skap_bredde       = ______ mm  (ledig bredde − 3–5 mm)
Mål 2  skap_hoyde        = ______ mm
Mål 3  skap_dybde        = ______ mm
Mål 4  rad_avstand       = (______ − ______) / 11 = ______ mm
Mål 5  skuff_hoyde       = ______ mm
Mål 6  nederste_skuff_z  = ______ mm
```

Modellen regner ut resten selv:

- **Antall kolonner** følger av bredden og `skuff_bredde_onsket` (60 mm). Med 270 mm blir det 4 kolonner. Vil du ha et annet antall, setter du `kolonner_tvunget`.
- **Skuffbredden** fyller kolonnen med `toleranse` (0,4 mm) luft på hver side.
- **Skuffdybden** er `skap_dybde − bakvegg − bak_rom`, altså 138 mm. Bak skuffene er det 10 mm til stolper og bolter.
- **Sokkel og topp** blir slik at radene står på linje og totalhøyden blir lik hovedskapet.
- **Delingen i moduler** følger `byggeplate` (256) minus `plate_margin` (10).

Modellen stopper med en tydelig melding hvis målene ikke går opp, for eksempel hvis det blir for lite luft over skuffen eller en modul blir for stor for byggeplaten. Kontroller også linjene som starter med `SKJOLDLAB3D:` i konsollen. Der står antall skuffer, mål, modulhøyder og antall småtteri.

---

## Åpne og eksportere

Installer OpenSCAD (2021.01 eller nyere) fra <https://openscad.org>, eller med `brew install --cask openscad` eller `apt install openscad`.

**Med GUI:** åpne `skjoldlab_tilleggsskap.scad` og slå på *Window → Customizer*. Velg `del` og eventuelt `modul_x`/`modul_y`, og trykk F6 (render) og så F7 (eksporter STL). Med `del = "samlet"` ser du hele skapet med skuffene (bare til visning).

**Med CLI, én del om gangen** (kjør fra denne mappen):

```bash
S=skjoldlab_tilleggsskap.scad
openscad -o skuff.stl        -D 'del="skuff"'        $S   # én skuff
openscad -o skuffplate.stl   -D 'del="skuffplate"'   $S   # så mange skuffer som får plass på platen (3 stk)
openscad -o skillevegg.stl   -D 'del="skillevegg"'   $S
openscad -o skilleplate.stl  -D 'del="skilleplate"'  $S   # en hel plate med skillevegger
openscad -o lask.stl         -D 'del="lask"'         $S   # lask med 2 hull (ytterkant)
openscad -o lask4.stl        -D 'del="lask4"'        $S   # lask med 4 hull (der to moduler møtes)
openscad -o pinne.stl        -D 'del="pinne"'        $S
# Rammemoduler: modul_x = 0 (venstre) / 1 (høyre), modul_y = 0 (nederst) / 1 / 2 (øverst)
openscad -o modul_x0_y0.stl  -D 'del="modul"' -D modul_x=0 -D modul_y=0 $S
openscad -o modul_x1_y0.stl  -D 'del="modul"' -D modul_x=1 -D modul_y=0 $S
# ... osv. for y1 og y2
openscad -o samlet.png --imgsize=1200,1600 -D 'del="samlet"' $S   # forhåndsvisning
```

Dine egne mål kan legges på som ekstra `-D`, for eksempel `-D skap_bredde=265 -D rad_avstand=44.2`.

**Alt på én gang:** `./eksporter.sh stl -D skap_bredde=265` legger alle delene i `stl/`. Antall moduler leses fra modellen. Mappen `stl/` er ignorert av git.

Alle deler legges ut i riktig retning for print:

- **Skuffen** står på bunnen.
- **Rammemodulen** ligger på ryggen, med bakveggen ned og fronten opp.
- **Skilleveggen, lasken og pinnen** ligger flatt.

---

## Printinnstillinger

| | Skuffer og skillevegger | Rammemoduler | Lasker og pinner |
| --- | --- | --- | --- |
| Materiale | PETG (tåler mest, glatt glid) eller PLA. Transparent/natur PETG ligner originalen. | PLA eller PETG, svart eller mørk grå som hovedskapet | PETG eller PLA |
| Lagtykkelse | 0,2 mm | 0,2–0,28 mm | 0,2 mm |
| Vegger/perimeter | 2 (skuffveggene er 1,2 mm = 3 linjer à 0,4) | 3 | 4 |
| Infill | 15 % (gjelder bare bunnen) | 15–20 % gyroid | 40 % |
| Support | **Ingen.** Håndtaket har 45° overside. | **Ingen.** Liggende hull er dråpeformet. | Ingen |
| Brim | Nei | Gjerne 3–5 mm (store, flate deler) | Nei |

- Dyse 0,4 mm. Toleransen er 0,4 mm. Sitter skuffene for trangt eller løst, endrer du `toleranse` og printer én skuff på nytt.
- PETG trekker seg litt mindre enn ABS. Rammen bør ikke printes i ABS uten kabinett, fordi så store flater kan vri seg.
- Etikettfeltet er en 0,6 mm forsenkning øverst på fronten. Passer for P-touch-tape (12 mm) eller trykte etiketter fra Skjold Lab.

### Antall deler og printtid (anslag)

Dette er grove anslag for en Prusa MK4-, Bambu- eller Ender-klasse printer med 0,2 mm lag. Sjekk alltid i sliceren.

| Del | Antall | Per stk | Totalt | Filament |
| --- | --- | --- | --- | --- |
| Skuff | 48 (16 plater à 3) | ca. 1,5–2 t | ca. 75–95 t | ca. 40 g/stk, ca. 1,9 kg |
| Skillevegg | etter behov (f.eks. 48) | ca. 5 min | ca. 4 t | ca. 4 g/stk |
| Rammemodul | 6 | ca. 9–13 t | ca. 55–75 t | ca. 350–450 g/stk, ca. 2,4 kg |
| Lask (2 hull) | 4 | 10 min | | |
| Lask (4 hull) | 2 | 15 min | | |
| Pinne | 8 (eller 3 mm stålstift / M3-gjengestang, 15 mm) | 5 min | | |

**Innkjøp:**

- 12 stk M3×20 bolt med mutter og skive. Det er én per rad, og de holder sammen venstre og høyre modul gjennom stolpene bak.
- 16 stk M3×10 selvgjengende skrue (f.eks. «plastskrue»/PT-skrue) til laskene.

Totalt blir det ca. 4–4,5 kg filament og ca. 140–175 timer printing. Det går fint å printe og ta i bruk én etasje (4 rader) om gangen.

---

## Montering

1. **Prøv først:** print én skuff og `modul_x0_y0`. Sjekk at skuffen glir, at fronten flukter (bakstoppen tar imot), og at radene står på linje med hovedskapet.
2. **Side om side:** legg venstre og høyre modul i samme etasje inntil hverandre. Stikk en M3×20 gjennom boltehullene bak i hver rad (gjennom vegg + stolpe på begge moduler), og stram mutteren lett.
3. **Etasjer:** sett pinner i hullene på toppen av stolpene og senk neste etasje ned. Tungene under gulvet glir ned innenfor sideveggene og låser fronten.
4. **Lasker bak:** skru en 2-hulls lask over hver etasjeskjøt i ytterkantene og en 4-hulls lask der venstre og høyre modul møtes (M3×10 selvgjengende). Hullene øverst i toppetasjen og nederst i bunnetasjen kan brukes til å feste skapet til veggen eller til hovedskapet med en vinkel.
5. Sett inn skuffer og eventuelt skillevegger: 1 vegg i midtsporet gir 2 rom, og 2 vegger i 1/3- og 2/3-sporene gir 3 rom.

Merk: skuffene har ingen utfallssperre. De trekkes helt ut, så hold under når du tar dem ut.

---

## Legg tilleggsskapet inn i Skjold Lab

1. Gå til **Skjold Lab → Skap → Legg til skap**.
2. Navn: f.eks. **«Tilleggsskap (3D-print)»**, type **«3d»**.
3. **Rader = 12** (som hovedskapet) og **kolonner = 4**, eller det modellen skriver i `SKJOLDLAB3D: … rader x … kolonner`. Har du endret bredde eller `kolonner_tvunget`, bruker du tallet derfra.
4. Nummereringen er den samme som i hovedskapet: **rad 1 øverst og skuff 1 til venstre**. «4-2» er altså rad 4, skuff 2.
5. Sett **rom (compartments)** per skuff etter hvor mange skillevegger du har satt inn (1–3).
6. Ta gjerne et bilde av begge skapene og dra hjørnehåndtakene til hjørnene på tilleggsskapet, slik at uthevingen også vises på bildet.
7. Skriv ut etiketter fra **Etiketter** (`/labels?cabinet=<id>`) og fest dem i etikettfeltet på skuffene.
