# Skjold Lab 3D – sortering rundt hovedskapet

Parametrisk OpenSCAD-modell av 3D-printet sortering som fyller hylla rundt hovedskapet
(Raaco 150-01-typen, 12 rader × 5 kolonner, 60 skuffer). Modellen startet som et
tilleggsskap på 27 cm ved siden av hovedskapet. Nå fyller den hele hylla: et sidetårn med
små og store skuffer, en topphylle over Raaco, valgfrie bakkasser og løse kasser.

| Fil | Innhold |
| --- | --- |
| `skjoldlab_tilleggsskap.scad` | Sorteringen uten LED: sidetårn, topphylle, bakkasser og kasser. Alle mål er parametre øverst i filen og kan også endres i Customizer. |
| `skjoldlab_ledvegg.scad` | **LED-vegg** (prompt 78): skuffer i rader med en LED-kanal over hver rad, LED-skinne og klips for Raaco, og elektronikkboks. Se [LED-vegg](#led-vegg-lys-over-skuffen). |
| `eksporter.sh` | Eksporterer alle printdeler fra begge modellene til STL med OpenSCAD CLI. |
| `../skjoldlab-led/README.md` | Innkjøp, kobling, WLED og oppsett i Skjold Lab for LED-ene. |
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

**Oppdatert (prompt 78):** hylla er målt til **560 × 760 × 320 mm** (B × H × D). Raaco-skuffen er
55 B × 40 H mm (42 mm med leppen bak) og 153 mm lang med håndtak. Standardmålene i begge
modellene er oppdatert. De gamle målene var 570 × 700 × 300.

Modellen tolker det slik:

- **Raaco-skapet** (300 × 150 × 552 mm, B × D × H) står nederst i hylla, inntil én side og med fronten fremst.
- **Hylla** er 560 mm bred, 760 mm høy og 320 mm dyp, innvendig.
- **Ledig plass** finnes på fire steder:
  - **(a) Sidetårn:** ved siden av Raaco, (560 − 300) = 260 mm bredt og i full høyde.
  - **(b) Topphylle:** over Raaco, 300 mm bred og (760 − 552) = 208 mm høy.
  - **(c) Bak Raaco:** (320 − 150) = 170 mm dybde bak skapet.
  - **(d) Løse kasser** for større ting. De kan stå i hylla eller hvor som helst.
- Alt er parametrisk: `hylle_bredde`, `hylle_hoyde`, `hylle_dybde`, `raaco_bredde`, `raaco_hoyde`, `raaco_dybde`, `raaco_side` (`"venstre"`/`"hoyre"`) og `klaring` (luft mot hyllekanter og mellom seksjonene, 3 mm).

**Begrensning fra printeren:** rammene printes liggende på ryggen. Derfor blir dybden printhøyde, og rammene og skuffene kan ikke bruke hele 317 mm. Modellen bruker `dybde_maks = byggehoyde − 10` = **240 mm**, og da får skuffene 228 mm dybde. Bak sidetårnet og topphylla blir det ca. 77 mm ledig. Har du en større printer, øker du `byggehoyde`/`dybde_maks`. Vil du spare filament, setter du `dybde_maks = 150`. Fronten på alt står i flukt med Raaco-fronten (y = 0), så de små skuffene står på linje med Raaco-radene.

### Oppsett (standardmål, Raaco til venstre, sett forfra)

```
 x=0                          300 303                         557 560
 +-----------------------------------------------------------------+  z=760
 |  TOPPHYLLE (3D)  2 x 2        |  | SIDETÅRN STORE  3 x 2          |
 | +-------------+-------------+ |  | +-------------+-------------+ |  z=757
 | |   1-1       |   1-2       | |  | |   1-1       |   1-2       | |
 | | 143x228x97  | 143x228x97  | |  | +-------------+-------------+ |
 | +-------------+-------------+ |  | |   2-1  121x228x63  2-2    | |
 | |   2-1       |   2-2       | |  | +-------------+-------------+ |
 | |             |             | |  | |   3-1       |   3-2       | |
 | +-------------+-------------+ |  | +-------------+-------------+ |  z=552
 +-------------------------------+  +-------------------------------+
 |                               |  | SIDETÅRN (3D)  12 x 4          |
 |   RAACO 150-01                |  | [1-1][1-2][1-3][1-4]  rad 1    |
 |   300 x 150 x 552             |  | [2-1][2-2][2-3][2-4]           |
 |   12 x 5 skuffer              |  |  ...   59,5 x 228 x 37         |
 |   (står foran; bak den:       |  |  ...   på linje med Raaco      |
 |    BAKKASSER 2 x 5, valgfritt)|  | [12-1]...........[12-4] rad 12 |
 +-------------------------------+--+-------------------------------+  z=0
                                         + LØSE KASSER: 3 S, 2 M, 1 L
```

Med `raaco_side = "hoyre"` speiles oppsettet. Sidetårnet står da til venstre (x = 3–257), og Raaco med topphylla til høyre.

### Mål per seksjon (standard)

| Seksjon | Rammemål (B × D × H) | Rader × kolonner | Skuff/kasse (B × D × H) | Moduler |
| --- | --- | --- | --- | --- |
| **Sidetårn, små skuffer** | 254 × 240 × 552 | 12 × 4 = 48 | 59,5 × 228 × 37 | 2 × 3 = 6 à 127 mm |
| **Sidetårn, store skuffer** (oppå) | 254 × 240 × 205 | 3 × 2 = 6 | 121,4 × 228 × 62,7 | 2 à 127 × 205 mm |
| **Topphylle** (oppå Raaco) | 297 × 240 × 205 | 2 × 2 = 4 | 142,9 × 228 × 96,5 | 2 à 148,5 × 205 mm |
| **Bakkasser** (bak Raaco, valgfritt) | 297 × 167 × 552 | 5 høyt × 2 = 10 | 147,5 × 162 × 110 | – |
| **Kasse S** | – | 3 stk | 98 × 241 × 70 | – |
| **Kasse M** | – | 2 stk | 147 × 241 × 100 | – |
| **Kasse L** | – | 1 stk | 296 × 241 × 120, printes i **2 deler** | – |

Slik regner modellen ut målene:

- **Sidetårnets bredde** er `hylle_bredde − raaco_bredde − 2 × klaring` = 254. Høyden er `raaco_hoyde`, og radene følger `rad_avstand` og `nederste_skuff_z`.
- **Store skuffer i tårnet** fyller `hylle_hoyde − klaring − raaco_hoyde` = 205 mm. Antall rader er det største antallet som gir skuffer på minst `stor_hoyde_onsket` (60 mm), her 3. Antall kolonner følger av `stor_bredde_onsket` (120 mm), her 1 per modul. Overstyr med `tarn_store_rader`/`tarn_store_kolonner`.
- **Topphylla** er `raaco_bredde − klaring` = 297 mm bred og deles i 2 moduler fordi byggeplaten er 256 mm. Den har `topp_rader = 2` (før 1; med 208 mm høyde ble én rad 198 mm høye skuffer) og 1 kolonne per modul. Vil du ha 3 skuffer i bredden, setter du `topp_kolonner = 4`; det rundes opp til hele moduler. Vil du ha én høy rad, setter du `topp_rader = 1`.
- **Kassene** følger `kasse_s`/`kasse_m`/`kasse_l = [bredde, dybde, høyde]`, der dybde 0 betyr auto: `min(hylle_dybde − klaring, byggeplate − margin − grep)` = 241.
  - Over Raaco (297 mm) er det plass til 3 S, 2 M eller 1 L i bredden.
  - To S stablet er 136 mm høye, så de får plass under hyllekanten over Raaco hvis du heller vil ha kasser enn topphylle (`lag_topphylle = false`).
  - L er bredere enn byggeplaten, så den printes som `kasse_l_1` + `kasse_l_2` med skjøtflens og skrus sammen med 5 M3×12 og mutter.
- **Bakkasser** bruker plassen bak Raaco: `hylle_dybde − raaco_dybde − klaring − grep` = 162 mm dybde, med 2 i bredden og 5 stablet. Du når dem bare når Raaco trekkes ut, så de passer til reservedeler og ting du sjelden bruker. Slå dem av med `lag_bakkasser = false`. De blir borte av seg selv hvis hylla er for grunn.
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
| Sidetårn, store skuffer | 6 skuffer, 2 rammemoduler, 2 lask, 1 lask4, 4 pinner | ca. 55 t (skuff 5 t, modul 12–16 t) | ca. 2,0 kg (skuff ca. 140 g, modul ca. 600 g) |
| Topphylle | 4 skuffer, 2 rammemoduler | ca. 50 t (skuff 6–7 t, modul 12–15 t) | ca. 1,8 kg (skuff ca. 190 g, modul ca. 550 g) |
| Kasser 3 S + 2 M + 1 L | 7 printdeler (L i 2 deler) | ca. 35 t (S 4 t, M 6 t, L 11 t) | ca. 1,1 kg (S 120 g, M 190 g, L 340 g) |
| Bakkasser (valgfritt) | 10 | ca. 45 t (4–5 t/stk) | ca. 1,4 kg (140 g/stk) |
| **Totalt** | | **ca. 405 t** | **ca. 13,8 kg** |

Skillevegger printes etter behov, ca. 5–15 min per stk.

**Innkjøp:**

- **M3×20 bolt med mutter og skive, 22 stk:** 12 til sidetårnet (én per rad), 6 til tårnets store skuffer og 4 til topphylla (2 per rad når radene er over 60 mm).
- **M3×10 selvgjengende skrue (PT-skrue), 24 stk:** 16 til sidetårnet og 8 til lasker mellom tårnet og de store skuffene.
- **M3×12 med mutter, 5 stk:** til kasse L.

**Rekkefølge:** begynn med de store skuffene i tårnet og topphylla. Det går raskest og gir mest plass til større ting. Ta deretter de små skuffene én etasje (4 rader) om gangen.

### Legg seksjonene inn i Skjold Lab

Hver seksjon blir et eget skap i **Skjold Lab → Skap → Legg til skap** (type **«3d»**). Nummereringen er den samme overalt: **rad 1 øverst og skuff 1 til venstre**, så «2-1» betyr rad 2, skuff 1. Tallene står også i konsollen på linjen `SKJOLDLAB3D: Skjold Lab: …`.

| Skap i Skjold Lab | Rader × kolonner | Merknad |
| --- | --- | --- |
| **Sidetårn (3D)** | 12 × 4 | Radene står på linje med Hovedskap, så rad 4 i begge skapene er samme høyde. |
| **Sidetårn store** | 3 × 2 | Øverst i tårnet. |
| **Topphylle (3D)** | 2 × 2 | Over Raaco. |
| **Kasser** | 1 × 6 | Én «skuff» per kasse. Gi dem navn som etikett per skuff, f.eks. «S1», «S2», «S3», «M1», «M2», «L», eller etter innholdet. |
| **Bak Raaco** (valgfritt) | 5 × 2 | Rad 1 er den øverste kassen i stabelen. |

Har du endret mål eller antall, bruker du tallene fra konsollen. Ta gjerne et bilde av hele hylla og legg det inn på hvert skap med hjørnene rundt den aktuelle seksjonen. Da vises uthevingen også på bildet.

---

## LED-vegg (lys over skuffen)

`skjoldlab_ledvegg.scad` er et **alternativ** til sidetårnet og topphylla over. Den fyller den samme plassen, men i stilen fra brukerens bilde: sorte skuffer i rader, og over hver rad en kanal med en adresserbar LED-stripe. Når du søker etter en del i Skjold Lab, lyser LED-en over skuffen. Raaco-skapet får en egen LED-skinne over hver rad. Elektronikk, WLED og oppsett står i [`../skjoldlab-led/README.md`](../skjoldlab-led/README.md).

Alt printes i **sort PETG**. Det eneste unntaket er diffusoren, som bør være natur eller hvit PETG. Du kan også bruke bakepapir eller en opal plaststrimmel i sporet.

### Skuffavstanden er låst til LED-ene

Skuffavstanden er alltid et helt antall LED-er:

- `led_per_m = 60` gir en LED-avstand på 1000 / 60 = **16,667 mm**.
- `led_per_skuff = 3` (standard) gir en skuffavstand på **50 mm**. Med `4` blir den 66,7 mm.

Hver modul er et helt antall skuffer bred, og modulkanten er en halv skillevegg (`vegg_t` = 1,6 mm). Derfor holder skuffavstanden seg også over modulskjøtene. Stripa kuttes mellom to LED-er, og da havner kuttet nøyaktig på kanten av seksjonen:

- **Oddetall** LED-er per skuff (3): LED nr. 0 sitter 8,333 mm fra venstre kant. Midt-LED-en står over midten av hver skuff (25, 75, 125 … mm).
- **Partall** LED-er per skuff (4): stripa starter én LED inn (`offsetMm` = 16,667 mm), og raden får én LED mindre. Det er fordi midten av skuffen ellers havner mellom to LED-er.

Det er et siktemerke over midten av hver skuff: et hakk i den fremre ribba og en strek på LED-veggen. Legg midten av en LED på streken når du limer stripa.

### Oppsett (standardmål, Raaco til venstre, sett forfra)

```
 x=0  25                 275 300 303                       553    560
 +-----------------------------------------------------------------+  z=760
 |                                |  | SIDEVEGG  13 x 5            | |
 |    TOPPVEGG  3 x 5 (552–728)   |  | ~~~~~~~~~~~~~~~~~~~ LED ~~  | |  z=756
 |    ~~~~~~~~~~~~~~~~~~~~ LED ~~ |  | [1-1][1-2][1-3][1-4][1-5]   | |
 |    [1-1][1-2][1-3][1-4][1-5]   |  | ~~~~~~~~~~~~~~~~~~~~~~~~~~  | |
 |    ~~~~~~~~~~~~~~~~~~~~~~~~~~  |  | [2-1] ...                   | |
 |    [2-1] ...                   |  |  ...                        | |
 |    [3-1] ...    250 x 176      |  |  skuff 46 x 231 x 40        | |
 +--------------------------------+  |  (42 med leppe bak)         | |  z=552
 |  RAACO 150-01   ===== skinne ==|  |                             | |
 |  12 x 5         [ ][ ][ ][ ][ ]|  |  2 x 4 moduler              | |
 |  300 x 150 x 552 ===== skinne =|  |  (3 + 2 kolonner,           | |
 |                 [ ][ ][ ][ ][ ]|  |   4/3/3/3 rader)            | |
 |  klips på begge  ...           |  |                             | |
 |  sideveggene    [ ][ ][ ][ ][ ]|  | [13-1] ............ [13-5]  | |
 +--------------------------------+--+-----------------------------+-+  z=0
   ELEKTRONIKKBOKS (ved siden av eller på toppen av hylla)
```

### Mål (standard)

| Seksjon | Mål (B × D × H) | Rader × kolonner | Moduler (B × H, printes på ryggen) |
| --- | --- | --- | --- |
| **Sidevegg** (x = 303–553) | 250 × 240 × 756 | 13 × 5 = 65 | 2 × 4: 150 og 100 mm brede, 234/174/174/176 mm høye (4/3/3/3 rader) |
| **Toppvegg** (oppå Raaco, x = 25–275) | 250 × 240 × 176 | 3 × 5 = 15 | 2 × 1: 150 og 100 mm brede, 176 mm høye |
| **Skuff** | 46,0 × 231 × 40 (42 med leppe) | 80 til sammen | 4 per plate (`skuffplate`) |
| **Raaco-skinne** | 294 × 12,8 × 3,0 | 12 stk | printes diagonalt (217 mm) |
| **Raaco-klips** | 8 × 17 × 45,6 | 24 stk (2 per rad) | 24 per plate (`raaco_klipsplate`) |
| **Elektronikkboks** | 114 × 84 × 40 (+ ører) | 1 + lokk | – |

Slik regner modellen ut målene:

- **Radavstanden** er `rad_hoyde + kanal_h` = 45 + 13 = **58 mm**. Gulvet er 2 mm, skuffåpningen 43 mm og LED-kanalen 13 mm. `kanal_h = 0` betyr auto, altså `led_bredde + 3`, som gir 15 mm for 12 mm stripe.
- **Sideveggen** er 560 − 300 − 2 × 3 = 254 mm bred, og det gir 5 skuffer à 50 mm (250 mm). Høyden er 760 − 3 = 757 mm, og det gir 13 rader: 13 × 58 + 2 = 756 mm.
- **Toppveggen** har 760 − 552 − 3 = 205 mm, og det gir 3 rader (176 mm). Den står midt over Raaco.
- **Moduler:** byggeplaten 256 − 10 = 246 mm gir maks 4 skuffer (200 mm) i bredden og maks 4 rader (232 mm + ribber) i høyden per modul. Rammene printes liggende på ryggen, så dybden er printhøyde, maks `byggehoyde − 10` = 240 mm.
- **Skuffen** er `50 − 2 × 1,6 − 2 × 0,4` = 46,0 mm bred og `240 − 2 − 7` = 231 mm dyp, og kan ikke være dypere enn byggeplaten tillater. Høyden er 43 − 2 − 1 = 40 mm, og leppa bak gjør den 42 mm, akkurat som Raaco.

### Kanalen over hver rad (snitt fra siden)

```
   front                              bak
     |  gulv neste rad (2 mm) ---------------------------
     |r|  |r|      LED  ->|█|  LED-vegg (stripa limes her)
     |i|M |i|      lys    |█|
     |b|D |b|             |█|            (hult bak)
     |b|  |b|             |█|
  ===+=+==+=+=============+=+====  tak 1,6 mm (bare 21 mm dypt)
     \__/  stoppkant (skrå forside, loddrett bakside)
     [skuff 40 mm .................... leppe 42 mm ]
  ===============================================  gulv 2 mm
   M = maske (sort, vindu over hver skuff) + D = diffusor, i sporet (2,4 mm)
```

- **Masken** (`del="maske"`) er sort og har ett vindu per skuff, `vindu_b` = 14 mm bredt, altså omtrent én LED. Da lyser bare den skuffen.
- **Diffusoren** (`del="diffusor"`, 0,8 mm) printes i natur/hvit PETG og legges bak masken. Sporet er 2,4 mm og har plass til begge.
- Masken og diffusoren skyves inn fra siden. Kanalen går gjennom sideveggene i modulene, så stripa, masken og ledningene fortsetter til neste modul.
- Ribbene under hvert gulv stikker 1,5 mm ned i kanalen under. Ved en etasjeskjøt griper de ned i modulen under og låser fronten.

### Skuffen

- **Avrundet grep** foran, som på bildet. Det er 30 mm bredt, stikker 8 mm ut og har skrå overside, så det printes uten support.
- **Etikettfelt** øverst på fronten, 10 mm høyt og 0,6 mm dypt.
- **Spor for skillevegger** ved 1/3, 1/2 og 2/3 (`del="skillevegg"`/`"skilleplate"`).
- **Stoppleppe bak**, som på Raaco. Når du trekker ut skuffen, tar leppa (42 mm) imot stoppkanten under taket (41 mm), og skuffen faller ikke ut. Vil du ta skuffen helt ut, løfter du fronten litt. Når du setter den inn, holder du bakkanten litt ned. Stoppkanten er skrå på forsiden, så leppa glir under.

### LED-skinne for Raaco

Raaco-skapet har ingen plass til en kanal. Skinna ligger derfor **flatt i spalten mellom radene, foran rammen**, med LED-ene ned mot skuffen under. Lyset faller på fronten og grepet til skuffen.

- **Skuffene kan trekkes ut:** skuffen under glir under skinna, fordi leppa bak er 42 mm og skinna starter på 42,5 mm. Skuffen over glir over. Rad-pitch er 552 / 12 = 46 mm, og da er spalten 46 − 42 = 4 mm. Skinna er 3,0 mm (1,0 mm plate + 2,0 mm stripe) med 0,5 mm luft over og under.
- **Mål spalten** (`raaco_spalte`) før du printer. Er den under 4 mm, stopper modellen med en melding. Da limer du stripa rett på rammen, eller du bruker en tynnere stripe (`led_tykk`).
- **Klipsene** (2 per rad) limes med VHB-tape på den synlige forkanten av Raaco-sideveggene (`raaco_sidevegg_b` = 8 mm). De går aldri inn foran skuffene.
  - Bakplata er `pitch − 0,4` = 45,6 mm høy. Klipsene kan derfor stables fra bunnen og opp, og da får radavstanden riktig mål av seg selv.
  - Skinna klikkes inn forfra. Det er 0,4 mm klikklepper oppe og nede.
  - Ytterst er det et ledningsspor (3 mm) gjennom kjevene, slik at ledningen fra én rad kan gå ned til neste.
- **Stripa** er 300 mm (18 LED-er) og limes under skinna fra Raacos venstre ytterkant. Skinna er 294 mm, så de ytterste 3 mm av stripa (loddepunktene) står fritt i klipsen. LED nr. 0 sitter 8,333 mm fra kanten. Det stemmer med standardoppsettet i Skjold Lab (`firstDrawerXmm` 30, `drawerPitchMm` 60, `offsetMm` 8,333). Skuffene er 60 mm brede og LED-ene står 16,667 mm fra hverandre, så LED-en treffer midten av skuffen med opptil ca. 8 mm avvik. Er du ikke fornøyd, overstyrer du med kalibreringen i Skjold Lab.

### Elektronikkboksen

`del="elboks"` + `del="elboks_lokk"`. Boksen er 110 × 80 × 38 mm innvendig.

- **Innhold:** et hullkort på 70 × 50 mm (4 avstandsstykker for M2/selvgjengende skrue) med ESP32-DevKit i hunnlister og 74AHCT125.
- **Venstre ende:** hull til DC-kontakt (11,5 mm, 5,5/2,1) og sikringsholder for panel (12,5 mm, 5 × 20).
- **Høyre ende:** 2 kabelhull (7 mm) til stripene, med bøyler til strips som strekkavlastning.
- **Forside:** USB-luke til ESP32 (`usb_luke`). Juster den etter hvor USB-kontakten havner.
- **Lufting:** spalter i langsidene og i lokket.
- **Lokket** skrus fast med 4 M3 × 10 selvgjengende skruer. Ørene har 4,2 mm hull for skruer.

Alle liggende hull er dråpeformede, så boksen printes stående uten support. Lokket printes med oversiden ned.

### Deler og innkjøp (standard)

| Del | Antall | `del=` |
| --- | --- | --- |
| Rammemoduler, sidevegg | 8 (2 × 4) | `modul` med `modul_x` 0–1 og `modul_y` 0–3 |
| Rammemoduler, toppvegg | 2 | `topp_modul` med `modul_x` 0–1 |
| Skuffer | 80 (20 plater à 4) | `skuff` / `skuffplate` |
| Masker + diffusorer | 1 per rad per modul: side 13 × 2, topp 3 × 2 | `maske` / `diffusor` med `seksjon` og `modul_x` |
| Lasker bak | 2-hulls i ytterkantene, 4-hulls der fire moduler møtes | `lask` / `lask4` |
| Raaco-skinner og klips | 12 + 24 | `raaco_skinne` / `raaco_klipsplate` |
| Elektronikkboks | 1 + lokk | `elboks` / `elboks_lokk` |

**Innkjøp til veggen:**

- M3 × 10 bolt med mutter: én per rad i hver sideskjøt, altså 13 + 3 = 16 stk.
- M3 × 10 selvgjengende skrue til laskene: ca. 30 stk.
- VHB-tape, 8–10 mm bred, til Raaco-klipsene.

**LED-er:** Raaco 216, toppvegg 45 og sidevegg 195, til sammen **456 LED-er** eller ca. 7,6 m stripe. Se innkjøpslisten i `../skjoldlab-led/README.md`.

**Grovt anslag for printing** (PETG, 0,2 mm lag):

- Moduler: 10–14 t og ca. 350–450 g per stk.
- Skuffer: ca. 2,5 t og 50 g per stk.
- Totalt ca. 300 t og 8 kg.

Begynn med én skuff, én maske og den nederste modulen som prøve.

### Montering

1. **Prøv først:** print én skuff og `modul_x0_y0`. Sjekk at skuffen glir og stopper, og at masken og diffusoren glir inn i sporet.
2. **Stripa:** lim stripa i hver rad på LED-veggen, med midten av LED-en på streken. Gjør det før modulene skrus sammen; det er lettest når modulen ligger på ryggen. Kanalen er åpen gjennom sideveggene, så én stripe kan gå over begge modulene i en rad. Du kan også lodde den i skjøten.
3. **Side om side:** bolt modulene i hver etasje sammen, én M3 × 10 per rad, bak skuffene. Gjør dette før du stabler.
4. **Etasjer:** sett neste etasje oppå. Ribbene under gulvet går ned i kanalen under. Skru lasker over skjøtene bak (16 mm mellom hullene, M3 × 10 selvgjengende i bossene).
5. **Masker og diffusorer:** skyv dem inn fra siden i hver rad.
6. **Ledninger:** i enden av hver rad går ledningen ut gjennom kanalåpningen i sideveggen og ned til neste rad, i klaringen mot hylleveggen eller Raaco. Stripa går i serpentine: rad 1 fra venstre mot høyre, rad 2 tilbake, og så videre.
7. **Raaco:** lim klipsene fra bunnen og opp, klikk inn skinnene og før ledningene gjennom sporene ytterst.

### Legg LED-veggen inn i Skjold Lab

| Skap i Skjold Lab | Rader × kolonner | LED-oppsett (start, LED-er per rad, `drawerPitchMm`, `firstDrawerXmm`, `offsetMm`) |
| --- | --- | --- |
| **Hovedskap** (Raaco) | 12 × 5 | start 0, 18 per rad, 60, 30, 8,333 (standard) |
| **LED-vegg topp** | 3 × 5 | start 216, 15 per rad, 50, 25, 8,333 |
| **LED-vegg side** | 13 × 5 | start 261, 15 per rad, 50, 25, 8,333 |

Konsollen skriver de samme tallene på linjen `SKJOLDLAB-LED: Skjold Lab: …`, og de følger parametrene dine. Fremgangsmåten står i `../skjoldlab-led/README.md`.

---

## Målekladd

Bruk skyvelære der du kan, og ellers en stållinjal eller et tommestokk. Skriv målene inn i parametrene øverst i `.scad`-filen.

| # | Hva du måler | Hvordan | Parameter | Standard |
| --- | --- | --- | --- | --- |
| 1 | **Hyllas bredde** | Innvendig, mellom sideveggene. | `hylle_bredde` | 560 |
| 2 | **Hyllas høyde** | Fra hyllegulvet til underkant av hylla over. | `hylle_hoyde` | 760 |
| 3 | **Hyllas dybde** | Fra forkant til bakvegg, innvendig. | `hylle_dybde` | 320 |
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

- **Antall kolonner** i sidetårnet følger av bredden og `skuff_bredde_onsket` (60 mm). Med 254 mm blir det 4. Vil du ha et annet antall, setter du `kolonner_tvunget`.
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

# LED-vegg (nye del-verdier, egen fil)
L=skjoldlab_ledvegg.scad
openscad -o modul_x0_y0.stl      -D 'del="modul"' -D modul_x=0 -D modul_y=0 $L   # x 0/1, y 0–3
openscad -o topp_modul_x0.stl    -D 'del="topp_modul"' -D modul_x=0 $L           # x 0/1
openscad -o skuff.stl            -D 'del="skuff"'            $L
openscad -o skuffplate.stl       -D 'del="skuffplate"'       $L   # 4 skuffer
openscad -o skillevegg.stl       -D 'del="skillevegg"'       $L
openscad -o skilleplate.stl      -D 'del="skilleplate"'      $L
openscad -o maske_side_x0.stl    -D 'del="maske"' -D 'seksjon="side"' -D modul_x=0 $L
openscad -o diffusor_side_x0.stl -D 'del="diffusor"' -D 'seksjon="side"' -D modul_x=0 $L
openscad -o lask.stl             -D 'del="lask"'             $L
openscad -o lask4.stl            -D 'del="lask4"'            $L
openscad -o raaco_skinne.stl     -D 'del="raaco_skinne"'     $L   # diagonalt
openscad -o raaco_klips.stl      -D 'del="raaco_klips"'      $L
openscad -o raaco_klipsplate.stl -D 'del="raaco_klipsplate"' $L   # 24 klips
openscad -o elboks.stl           -D 'del="elboks"'           $L
openscad -o elboks_lokk.stl      -D 'del="elboks_lokk"'      $L
openscad -o ledvegg.png --imgsize=1600,1400 -D 'del="oversikt"' $L   # bare visning
```

Dine egne mål kan legges på som ekstra `-D`, for eksempel `-D hylle_bredde=565 -D rad_avstand=44.2 -D 'raaco_side="hoyre"'`.

**Alt på én gang:** `./eksporter.sh stl -D hylle_bredde=565` legger alle printdelene i `stl/`. LED-veggen eksporteres til `stl/ledvegg/` med `./eksporter.sh stl --led` (bare LED-veggen) eller `--alle` (begge modellene). Parametre etter flagget gjelder modellen du eksporterer. Antall moduler leses fra modellen, og det samme gjør valget mellom hel og delt kasse L og om topphylle, store skuffer og bakkasser er med. Mappen `stl/` er ignorert av git.

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
