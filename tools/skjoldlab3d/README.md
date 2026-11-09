# Skjold Lab 3D – sortering rundt hovedskapet

Parametrisk OpenSCAD-modell av 3D-printet sortering som fyller hylla rundt hovedskapet
(Raaco 150-01-typen, 12 rader × 5 kolonner, 60 skuffer). Modellen startet som et
tilleggsskap på 27 cm ved siden av hovedskapet. Nå fyller den hele hylla: et sidetårn med
små og store skuffer, en topphylle over Raaco, valgfrie bakkasser og løse kasser.

| Fil | Innhold |
| --- | --- |
| `skjoldlab_tilleggsskap.scad` | Hele modellen. Alle mål er parametre øverst i filen og kan også endres i Customizer. |
| `eksporter.sh` | Eksporterer alle printdeler til STL med OpenSCAD CLI. |
| `.gitignore` | Holder STL/3MF/G-code/PNG utenfor git. Repoet skal ikke ha binærfiler. |

> **Viktig:** standardmålene er *typiske* mål og anslag fra brukerens beskrivelse.
> De er **ikke** målt. **Mål hylla, Raaco-skapet og én skuff** før du printer noe stort
> (se målekladden), og print først én skuff og den nederste modulen som prøve.

---

## Fyll hylla rundt Raaco

### Tolkning

Brukeren skrev 2026-11-09: «dette skapet var også 30 cm bredt og rundt 15 cm dypt. skapet er
ca 57 cm bredt og ca 70 cm høyt. lag 3d print sortering for plassen rundt. gjerne også noen
kasser som er litt større for større ting». Senere kom det at hylla er ca. 30 cm dyp.

Modellen tolker det slik:

- **Raaco-skapet** (300 × 150 × 552 mm, B × D × H) står nederst i hylla, inntil én side og med fronten fremst.
- **Hylla** er ca. 570 mm bred, 700 mm høy og 300 mm dyp, innvendig.
- **Ledig plass** finnes på fire steder:
  - **(a) Sidetårn:** ved siden av Raaco, (570 − 300) = 270 mm bredt og i full høyde.
  - **(b) Topphylle:** over Raaco, 300 mm bred og (700 − 552) = 148 mm høy.
  - **(c) Bak Raaco:** (300 − 150) = 150 mm dybde bak skapet.
  - **(d) Løse kasser** for større ting. De kan stå i hylla eller hvor som helst.
- Alt er parametrisk: `hylle_bredde`, `hylle_hoyde`, `hylle_dybde`, `raaco_bredde`, `raaco_hoyde`, `raaco_dybde`, `raaco_side` (`"venstre"`/`"hoyre"`) og `klaring` (luft mot hyllekanter og mellom seksjonene, 3 mm).

**Begrensning fra printeren:** rammene printes liggende på ryggen. Derfor blir dybden printhøyde, og rammene og skuffene kan ikke bruke hele 297 mm. Modellen bruker `dybde_maks = byggehoyde − 10` = **240 mm**, og da får skuffene 228 mm dybde. Bak sidetårnet og topphylla blir det ca. 57 mm ledig. Har du en større printer, øker du `byggehoyde`/`dybde_maks`. Vil du spare filament, setter du `dybde_maks = 150`. Fronten på alt står i flukt med Raaco-fronten (y = 0), så de små skuffene står på linje med Raaco-radene.

### Oppsett (standardmål, Raaco til venstre, sett forfra)

```
 x=0                          300 303                         567 570
 +-----------------------------------------------------------------+  z=700
 |  TOPPHYLLE (3D)  1 x 2        |  | SIDETÅRN STORE  2 x 2          |
 | +-------------+-------------+ |  | +-------------+-------------+ |
 | |   stor 1    |   stor 2    | |  | |   1-1       |   1-2       | |  z=697
 | | 143x228x138 | 143x228x138 | |  | +-------------+-------------+ |
 | |             |             | |  | |   2-1       |   2-2       | |
 | +-------------+-------------+ |  | +-------------+-------------+ |  z=552
 +-------------------------------+  +-------------------------------+
 |                               |  | SIDETÅRN (3D)  12 x 4          |
 |   RAACO 150-01                |  | [1-1][1-2][1-3][1-4]  rad 1    |
 |   300 x 150 x 552             |  | [2-1][2-2][2-3][2-4]           |
 |   12 x 5 skuffer              |  |  ...   62 x 228 x 37           |
 |   (står foran; bak den:       |  |  ...   på linje med Raaco      |
 |    BAKKASSER 2 x 5, valgfritt)|  | [12-1]...........[12-4] rad 12 |
 +-------------------------------+--+-------------------------------+  z=0
                                         + LØSE KASSER: 3 S, 2 M, 1 L
```

Med `raaco_side = "hoyre"` speiles oppsettet. Sidetårnet står da til venstre (x = 3–267), og Raaco med topphylla til høyre.

### Mål per seksjon (standard)

| Seksjon | Rammemål (B × D × H) | Rader × kolonner | Skuff/kasse (B × D × H) | Moduler |
| --- | --- | --- | --- | --- |
| **Sidetårn, små skuffer** | 264 × 240 × 552 | 12 × 4 = 48 | 62,0 × 228 × 37 | 2 × 3 = 6 à 132 mm |
| **Sidetårn, store skuffer** (oppå) | 264 × 240 × 145 | 2 × 2 = 4 | 126,4 × 228 × 66,5 | 2 à 132 × 145 mm |
| **Topphylle** (oppå Raaco) | 297 × 240 × 145 | 1 × 2 = 2 | 142,9 × 228 × 138 | 2 à 148,5 × 145 mm |
| **Bakkasser** (bak Raaco, valgfritt) | 297 × 147 × 552 | 5 høyt × 2 = 10 | 147,5 × 142 × 110 | – |
| **Kasse S** | – | 3 stk | 98 × 241 × 70 | – |
| **Kasse M** | – | 2 stk | 147 × 241 × 100 | – |
| **Kasse L** | – | 1 stk | 296 × 241 × 120, printes i **2 deler** | – |

Slik regner modellen ut målene:

- **Sidetårnets bredde** er `hylle_bredde − raaco_bredde − 2 × klaring` = 264. Høyden er `raaco_hoyde`, og radene følger `rad_avstand` og `nederste_skuff_z`.
- **Store skuffer i tårnet** fyller `hylle_hoyde − klaring − raaco_hoyde` = 145 mm. Antall rader er det største antallet som gir skuffer på minst `stor_hoyde_onsket` (60 mm), her 2. Antall kolonner følger av `stor_bredde_onsket` (120 mm), her 1 per modul. Overstyr med `tarn_store_rader`/`tarn_store_kolonner`.
- **Topphylla** er `raaco_bredde − klaring` = 297 mm bred og deles i 2 moduler fordi byggeplaten er 256 mm. Den har `topp_rader = 1` og 1 kolonne per modul. Vil du ha 3 skuffer, setter du `topp_kolonner = 4`; det rundes opp til hele moduler. Vil du ha 2 lavere rader, setter du `topp_rader = 2`.
- **Kassene** følger `kasse_s`/`kasse_m`/`kasse_l = [bredde, dybde, høyde]`, der dybde 0 betyr auto: `min(hylle_dybde − klaring, byggeplate − margin − grep)` = 241.
  - Over Raaco (297 mm) er det plass til 3 S, 2 M eller 1 L i bredden.
  - To S stablet er 136 mm høye, så de får plass under hyllekanten over Raaco hvis du heller vil ha kasser enn topphylle (`lag_topphylle = false`).
  - L er bredere enn byggeplaten, så den printes som `kasse_l_1` + `kasse_l_2` med skjøtflens og skrus sammen med 5 M3×12 og mutter.
- **Bakkasser** bruker plassen bak Raaco: `hylle_dybde − raaco_dybde − klaring − grep` = 142 mm dybde, med 2 i bredden og 5 stablet. Du når dem bare når Raaco trekkes ut, så de passer til reservedeler og ting du sjelden bruker. Slå dem av med `lag_bakkasser = false`. De blir borte av seg selv hvis hylla er for grunn.
- **Store skuffer generelt:** `del="skuff_stor"` med `skuff_stor_bredde`/`skuff_stor_hoyde`/`skuff_stor_dybde` gir en stor skuff i valgfritt mål. 0 betyr samme mål som i topphylla.

Modellen stopper med en tydelig norsk melding (`assert`) når målene ikke går opp. Det skjer for eksempel hvis Raaco er høyere enn hylla, det er for lite plass over Raaco til topphylle, en skuff eller modul ikke får plass på byggeplaten, eller en kasse er for lav til grep og etikettfelt. Konsollen viser linjer som starter med `SKJOLDLAB3D:` med rader, kolonner, mål og antall deler per seksjon, og en ferdig linje for Skjold Lab.

### Se hele hylla

```bash
openscad -o oversikt.png --imgsize=1600,1400 -D 'del="oversikt"' skjoldlab_tilleggsskap.scad
```

`del="oversikt"` viser hylla som gjennomsiktige plater, Raaco som en grå blokk og alle printede deler på plass, med bakkassene bak Raaco. De løse kassene står ved siden av hylla. Bare til visning, ikke for print.

### Skuffer og kasser

- **Store skuffer** har samme utforming som de små: håndtak nederst med 45° overside, etikettfelt øverst på fronten og spor for 1–3 skillevegger. Veggene er 1,6 mm og fronten 2,4 mm.
- **Løse kasser** har åpen front:
  - Fronten er lav, 40 % av høyden, og sidekantene er skrå, så du ser og når innholdet.
  - Grepsleppe på overkanten av fronten, med 45° underside.
  - Etikettfelt under grepet.
  - Stablefot: de nederste 4 mm er trukket inn og passer ned i kassen under, med 0,4 mm luft.
  - Kassene printes stående uten support.

### Antall deler, printtid og filament (anslag, 0,2 mm lag, PETG/PLA)

Dette er grove anslag. Sjekk alltid i sliceren. Dype deler (240 mm) bruker ca. 1,6 ganger så mye som i den første 150 mm-versjonen.

| Seksjon | Deler | Printtid | Filament |
| --- | --- | --- | --- |
| Sidetårn, små skuffer | 48 skuffer (16 plater à 3), 6 rammemoduler, 4 lask, 2 lask4, 8 pinner | ca. 220 t (skuffer ca. 2,5 t/stk, moduler ca. 14–20 t/stk) | ca. 7,5 kg (skuffer ca. 55 g, moduler ca. 600–800 g) |
| Sidetårn, store skuffer | 4 skuffer, 2 rammemoduler, 2 lask, 1 lask4, 4 pinner | ca. 45 t (skuff 5–6 t, modul 10–14 t) | ca. 1,6 kg (skuff ca. 150 g, modul ca. 500 g) |
| Topphylle | 2 skuffer, 2 rammemoduler | ca. 40 t (skuff 8–10 t, modul 9–12 t) | ca. 1,4 kg (skuff ca. 270 g, modul ca. 450 g) |
| Kasser 3 S + 2 M + 1 L | 7 printdeler (L i 2 deler) | ca. 35 t (S 4 t, M 6 t, L 11 t) | ca. 1,1 kg (S 120 g, M 190 g, L 340 g) |
| Bakkasser (valgfritt) | 10 | ca. 45 t (4–5 t/stk) | ca. 1,4 kg (140 g/stk) |
| **Totalt** | | **ca. 385 t** | **ca. 13 kg** |

Skillevegger printes etter behov, ca. 5–15 min per stk.

**Innkjøp:**

- **M3×20 bolt med mutter og skive, 18 stk:** 12 til sidetårnet (én per rad), 4 til tårnets store skuffer og 2 til topphylla.
- **M3×10 selvgjengende skrue (PT-skrue), 24 stk:** 16 til sidetårnet og 8 til lasker mellom tårnet og de store skuffene.
- **M3×12 med mutter, 5 stk:** til kasse L.

**Rekkefølge:** begynn med de store skuffene i tårnet og topphylla. Det går raskest og gir mest plass til større ting. Ta deretter de små skuffene én etasje (4 rader) om gangen.

### Legg seksjonene inn i Skjold Lab

Hver seksjon blir et eget skap i **Skjold Lab → Skap → Legg til skap** (type **«3d»**). Nummereringen er den samme overalt: **rad 1 øverst og skuff 1 til venstre**, så «2-1» betyr rad 2, skuff 1. Tallene står også i konsollen på linjen `SKJOLDLAB3D: Skjold Lab: …`.

| Skap i Skjold Lab | Rader × kolonner | Merknad |
| --- | --- | --- |
| **Sidetårn (3D)** | 12 × 4 | Radene står på linje med Hovedskap, så rad 4 i begge skapene er samme høyde. |
| **Sidetårn store** | 2 × 2 | Øverst i tårnet. |
| **Topphylle (3D)** | 1 × 2 | Over Raaco. |
| **Kasser** | 1 × 6 | Én «skuff» per kasse. Gi dem navn som etikett per skuff, f.eks. «S1», «S2», «S3», «M1», «M2», «L», eller etter innholdet. |
| **Bak Raaco** (valgfritt) | 5 × 2 | Rad 1 er den øverste kassen i stabelen. |

Har du endret mål eller antall, bruker du tallene fra konsollen. Ta gjerne et bilde av hele hylla og legg det inn på hvert skap med hjørnene rundt den aktuelle seksjonen. Da vises uthevingen også på bildet.

---

## Målekladd

Bruk skyvelære der du kan, og ellers en stållinjal eller et tommestokk. Skriv målene inn i parametrene øverst i `.scad`-filen.

| # | Hva du måler | Hvordan | Parameter | Standard |
| --- | --- | --- | --- | --- |
| 1 | **Hyllas bredde** | Innvendig, mellom sideveggene. | `hylle_bredde` | 570 |
| 2 | **Hyllas høyde** | Fra hyllegulvet til underkant av hylla over. | `hylle_hoyde` | 700 |
| 3 | **Hyllas dybde** | Fra forkant til bakvegg, innvendig. | `hylle_dybde` | 300 |
| 4 | **Raaco-skapets bredde** | Utvendig. | `raaco_bredde` | 300 |
| 5 | **Raaco-skapets høyde** | Fra underkant til overkant, utvendig. | `raaco_hoyde` | 552 |
| 6 | **Raaco-skapets dybde** | Fra front (uten håndtak) til bakvegg, utvendig. | `raaco_dybde` | 150 |
| 7 | **Plassering** | Står Raaco inntil venstre eller høyre side? | `raaco_side` | `"venstre"` |
| 8 | **Radavstand** | Fra overkant skuff i rad 1 til overkant skuff i rad 12, delt på 11. Det er mer nøyaktig enn å måle én rad. | `rad_avstand` | 44 |
| 9 | **Skuffhøyde** | Én skuff, utvendig høyde uten håndtak. | `skuff_hoyde` | 37 |
| 10 | **Høyde til nederste skuff** | Fra underkant av skapet (hyllegulvet) til underkant av skuffen i rad 12. | `nederste_skuff_z` | 14 |

```
Mål 1   hylle_bredde      = ______ mm
Mål 2   hylle_hoyde       = ______ mm
Mål 3   hylle_dybde       = ______ mm
Mål 4   raaco_bredde      = ______ mm
Mål 5   raaco_hoyde       = ______ mm
Mål 6   raaco_dybde       = ______ mm
Mål 7   raaco_side        = venstre / hoyre
Mål 8   rad_avstand       = (______ − ______) / 11 = ______ mm
Mål 9   skuff_hoyde       = ______ mm
Mål 10  nederste_skuff_z  = ______ mm
```

Hvis hylla ikke er helt rett, bruker du det minste målet. `klaring` (3 mm) trekkes fra mot hyllekantene. Modellen regner ut resten selv:

- **Antall kolonner** i sidetårnet følger av bredden og `skuff_bredde_onsket` (60 mm). Med 264 mm blir det 4. Vil du ha et annet antall, setter du `kolonner_tvunget`.
- **Skuffbredden** fyller kolonnen med `toleranse` (0,4 mm) luft på hver side.
- **Skuffdybden** er `rammedybde − bakvegg − bak_rom`, altså 228 mm. Bak skuffene er det 10 mm til stolper og bolter.
- **Sokkel og topp** blir slik at radene står på linje og tårnets små-skuff-del blir like høy som Raaco.
- **Delingen i moduler** følger `byggeplate` (256) minus `plate_margin` (10).

Den gamle måten fungerer fortsatt: `skap_bredde`, `skap_hoyde` og `skap_dybde` overstyrer tårnets bredde, høyde og dybde. 0 betyr at målet regnes ut fra hylla.

---

## Åpne og eksportere

Installer OpenSCAD (2021.01 eller nyere) fra <https://openscad.org>, eller med `brew install --cask openscad` eller `apt install openscad`.

**Med GUI:** åpne `skjoldlab_tilleggsskap.scad` og slå på *Window → Customizer*. Velg `del` og eventuelt `modul_x`/`modul_y`, og trykk F6 (render) og så F7 (eksporter STL). `del = "oversikt"` viser hele hylla, og `del = "samlet"` viser bare sidetårnets små-skuff-del. Begge er bare til visning.

**Med CLI, én del om gangen** (kjør fra denne mappen):

```bash
S=skjoldlab_tilleggsskap.scad
# Sidetårn, små skuffer (som før)
openscad -o skuff.stl        -D 'del="skuff"'        $S   # én skuff
openscad -o skuffplate.stl   -D 'del="skuffplate"'   $S   # så mange skuffer som får plass på platen (3 stk)
openscad -o skillevegg.stl   -D 'del="skillevegg"'   $S
openscad -o skilleplate.stl  -D 'del="skilleplate"'  $S   # en hel plate med skillevegger
openscad -o lask.stl         -D 'del="lask"'         $S   # lask med 2 hull (ytterkant)
openscad -o lask4.stl        -D 'del="lask4"'        $S   # lask med 4 hull (der to moduler møtes)
openscad -o pinne.stl        -D 'del="pinne"'        $S
openscad -o modul_x0_y0.stl  -D 'del="modul"' -D modul_x=0 -D modul_y=0 $S   # x 0/1, y 0/1/2
# Sidetårn, store skuffer
openscad -o tarn_stor_modul_x0.stl -D 'del="tarn_stor_modul"' -D modul_x=0 $S   # x 0/1
openscad -o skuff_tarn_stor.stl    -D 'del="skuff_tarn_stor"'      $S
openscad -o skillevegg_tarn_stor.stl -D 'del="skillevegg_tarn_stor"' $S
# Topphylle
openscad -o topp_modul_x0.stl -D 'del="topp_modul"' -D modul_x=0 $S   # x 0/1
openscad -o skuff_topp.stl    -D 'del="skuff_topp"'      $S
openscad -o skillevegg_topp.stl -D 'del="skillevegg_topp"' $S
# Stor skuff i eget mål
openscad -o skuff_stor.stl -D 'del="skuff_stor"' -D skuff_stor_bredde=100 -D skuff_stor_hoyde=80 $S
# Kasser
openscad -o kasse_s.stl   -D 'del="kasse_s"'   $S
openscad -o kasse_m.stl   -D 'del="kasse_m"'   $S
openscad -o kasse_l_1.stl -D 'del="kasse_l_1"' $S   # venstre halvdel
openscad -o kasse_l_2.stl -D 'del="kasse_l_2"' $S   # høyre halvdel
openscad -o bakkasse.stl  -D 'del="bakkasse"'  $S
```

Dine egne mål kan legges på som ekstra `-D`, for eksempel `-D hylle_bredde=565 -D rad_avstand=44.2 -D 'raaco_side="hoyre"'`.

**Alt på én gang:** `./eksporter.sh stl -D hylle_bredde=565` legger alle printdelene i `stl/`. Antall moduler leses fra modellen, og det samme gjør valget mellom hel og delt kasse L og om topphylle, store skuffer og bakkasser er med. Mappen `stl/` er ignorert av git.

Alle deler legges ut i riktig retning for print:

- **Skuffer og kasser** står på bunnen.
- **Rammemodulene** ligger på ryggen, med bakveggen ned og fronten opp.
- **Skilleveggen, lasken og pinnen** ligger flatt.

---

## Printinnstillinger

| | Skuffer, kasser og skillevegger | Rammemoduler | Lasker og pinner |
| --- | --- | --- | --- |
| Materiale | PETG (tåler mest, glatt glid) eller PLA. Transparent/natur PETG ligner originalen. | PLA eller PETG, svart eller mørk grå som hovedskapet | PETG eller PLA |
| Lagtykkelse | 0,2 mm (0,28 mm går fint for store skuffer og kasser) | 0,2–0,28 mm | 0,2 mm |
| Vegger/perimeter | 2 for små skuffer (1,2 mm), 2 for store skuffer og kasser (1,6 mm) | 3 | 4 |
| Infill | 15 % (gjelder bare bunnen) | 15–20 % gyroid | 40 % |
| Support | **Ingen.** Håndtak og grep har 45° flater. | **Ingen.** Liggende hull er dråpeformet. | Ingen |
| Brim | Nei (gjerne 3 mm på kasse L-halvdelene) | Gjerne 3–5 mm (store, flate deler) | Nei |

- Dyse 0,4 mm. Toleransen er 0,4 mm. Sitter skuffene for trangt eller løst, endrer du `toleranse` og printer én skuff på nytt.
- PETG trekker seg litt mindre enn ABS. Rammen bør ikke printes i ABS uten kabinett, fordi så store flater kan vri seg.
- Etikettfeltet er en 0,6 mm forsenkning. Passer for P-touch-tape (12 mm) eller trykte etiketter fra Skjold Lab.

---

## Montering

1. **Prøv først:** print én skuff og `modul_x0_y0`. Sjekk at skuffen glir, at fronten flukter (bakstoppen tar imot), og at radene står på linje med Raaco.
2. **Side om side:** legg venstre og høyre modul i samme etasje inntil hverandre. Stikk en M3×20 gjennom boltehullene bak i hver rad (gjennom vegg + stolpe på begge moduler), og stram mutteren lett.
3. **Etasjer:** sett pinner i hullene på toppen av stolpene og senk neste etasje ned. Tungene under gulvet glir ned innenfor sideveggene og låser fronten.
4. **Store skuffer oppå tårnet:** øverste etasje har pinnehull på toppen. Sett i pinner, senk de to `tarn_stor_modul`-ene ned, bolt dem sammen (2 bolter per rad), og skru lasker bak over skjøten: 2-hulls lask i ytterkantene og en 4-hulls lask i midten.
5. **Lasker bak:** skru en 2-hulls lask over hver etasjeskjøt i ytterkantene og en 4-hulls lask der venstre og høyre modul møtes (M3×10 selvgjengende).
6. **Topphylla:** bolt de to `topp_modul`-ene sammen (2 bolter) og sett dem oppå Raaco, med fronten i flukt. Topphylla er 240 mm dyp og stikker 90 mm bak Raaco. Står det bakkasser der, støtter de den. Ellers kan en filtbit eller et dobbeltsidig teip på Raaco-toppen hindre at den sklir.
7. **Kasse L:** legg halvdelene inntil hverandre og skru sammen flensene med 5 M3×12 og mutter.
8. Sett inn skuffer og eventuelt skillevegger: 1 vegg i midtsporet gir 2 rom, og 2 vegger i 1/3- og 2/3-sporene gir 3 rom.

Merk: skuffene har ingen utfallssperre. De trekkes helt ut, så hold under når du tar dem ut. Det gjelder særlig de store skuffene.
