# Skjold Lab 3D – sortering rundt hovedskapet

Parametrisk OpenSCAD-modell av 3D-printet sortering som fyller hylla rundt hovedskapet
(Raaco 150-01-typen, 12 rader × 5 kolonner, 60 skuffer). Modellen startet som et
tilleggsskap på 27 cm ved siden av hovedskapet. Nå fyller den hele hylla: et sidetårn med
små og store skuffer, en topphylle over Raaco, valgfrie bakkasser og løse kasser.

| Fil | Innhold |
| --- | --- |
| `skjoldlab_tilleggsskap.scad` | Sorteringen uten LED: sidetårn, topphylle, bakkasser og kasser. Alle mål er parametre øverst i filen og kan også endres i Customizer. |
| `skjoldlab_ledvegg.scad` | **LED-skap** (prompt 78): skuffer i rader med en LED-kanal over hver rad. Standard er **hele hylla som ett sorteringsskap med LED** (`variant = "hele_hylla"`, uten Raaco: 90 skuffer, av dem 10 store 2 × 2 og 10 brede 2 × 1, alle med akrylfront; 143 like skuffer med `store_skuffer = 0` og `brede_skuffer = 0`). `variant = "rundt_raaco"` gir LED-vegg rundt Raaco med LED-skinne og klips for Raaco. Elektronikkboks i begge. Se [LED-vegg](#led-vegg-lys-over-skuffen). |
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

**Dybde og vekt:** rammene printes liggende på ryggen, så dybden er printhøyde. Standard er nå `dybde_maks = 165` mm. Da blir skuffene 153 mm dype (159 mm med håndtak), omtrent som Raaco-skuffene (153 mm), og det er ca. 150 mm ledig bak sidetårnet og topphylla. Vil du ha dypere skuffer, setter du `dybde_maks = 0` (= `byggehoyde − 10` = 240 mm, skuffer 228 mm). Det bruker ca. 1,5 ganger så mye filament i rammene og skuffene og tar tilsvarende lengre tid.

**Lett ramme (fra 2026-11-09):** den første utgaven hadde hele hyller, hel bakvegg og massive sidevegger, og en modul brukte 650–820 g. Nå har hver rad bare smale skinner langs dybden (L ytterst, T mellom kolonnene, midtskinner under brede skuffer), en frontlist med 45° fas foran og en tynn bakstopp. Sidene er rammer med store vinduer, ryggen er åpen med kryss, og stolpene bak er bare klosser der pinner, lasker og bolter sitter. Alt printes liggende på ryggen uten support. Fronten på alt står i flukt med Raaco-fronten (y = 0), så de små skuffene står på linje med Raaco-radene.

### Oppsett (standardmål, Raaco til venstre, sett forfra)

```
 x=0                          300 303                         557 560
 +-----------------------------------------------------------------+  z=760
 |  TOPPHYLLE (3D)  3 x 2        |  | SIDETÅRN STORE  3 x 2          |
 | +-------------+-------------+ |  | +-------------+-------------+ |  z=757
 | |   1-1       |   1-2       | |  | |   1-1       |   1-2       | |
 | +-------------+-------------+ |  | +-------------+-------------+ |
 | |   2-1  143x153x63  2-2    | |  | |   2-1  121x153x63  2-2    | |
 | +-------------+-------------+ |  | +-------------+-------------+ |
 | |   3-1       |   3-2       | |  | |   3-1       |   3-2       | |
 | +-------------+-------------+ |  | +-------------+-------------+ |  z=552
 +-------------------------------+  +-------------------------------+
 |                               |  | SIDETÅRN (3D)  12 x 4          |
 |   RAACO 150-01                |  | [1-1][1-2][1-3][1-4]  rad 1    |
 |   300 x 150 x 552             |  | [2-1][2-2][2-3][2-4]           |
 |   12 x 5 skuffer              |  |  ...   59,5 x 153 x 37         |
 |   (står foran; bak den:       |  |  ...   på linje med Raaco      |
 |    BAKKASSER 2 x 5, valgfritt)|  | [12-1]...........[12-4] rad 12 |
 +-------------------------------+--+-------------------------------+  z=0
                                         + LØSE KASSER: 3 S, 2 M, 1 L
```

Med `raaco_side = "hoyre"` speiles oppsettet. Sidetårnet står da til venstre (x = 3–257), og Raaco med topphylla til høyre.

### Mål per seksjon (standard)

| Seksjon | Rammemål (B × D × H) | Rader × kolonner | Skuff/kasse (B × D × H) | Moduler |
| --- | --- | --- | --- | --- |
| **Sidetårn, små skuffer** | 254 × 165 × 552 | 12 × 4 = 48 | 59,5 × 153 × 37 | 2 × 3 = 6 à 127 mm |
| **Sidetårn, store skuffer** (oppå) | 254 × 165 × 205 | 3 × 2 = 6 | 121,4 × 153 × 62,7 | 2 à 127 × 205 mm |
| **Topphylle** (oppå Raaco) | 297 × 165 × 205 | 3 × 2 = 6 | 142,9 × 153 × 62,7 | 2 à 148,5 × 205 mm |
| **Bakkasser** (bak Raaco, valgfritt) | 297 × 167 × 552 | 5 høyt × 2 = 10 | 147,5 × 162 × 110 | – |
| **Kasse S** | – | 3 stk | 98 × 241 × 70 | – |
| **Kasse M** | – | 2 stk | 147 × 241 × 100 | – |
| **Kasse L** | – | 1 stk | 296 × 241 × 120, printes i **2 deler** | – |

Slik regner modellen ut målene:

- **Sidetårnets bredde** er `hylle_bredde − raaco_bredde − 2 × klaring` = 254. Høyden er `raaco_hoyde`, og radene følger `rad_avstand` og `nederste_skuff_z`.
- **Store skuffer i tårnet** fyller `hylle_hoyde − klaring − raaco_hoyde` = 205 mm. Antall rader er det største antallet som gir skuffer på minst `stor_hoyde_onsket` (60 mm), her 3. Antall kolonner følger av `stor_bredde_onsket` (120 mm), her 1 per modul. Overstyr med `tarn_store_rader`/`tarn_store_kolonner`.
- **Topphylla** er `raaco_bredde − klaring` = 297 mm bred og deles i 2 moduler fordi byggeplaten er 256 mm. Den har `topp_rader = 3` (lavere og lettere skuffer enn med 2) og 1 kolonne per modul. Vil du ha 3 skuffer i bredden, setter du `topp_kolonner = 4`; det rundes opp til hele moduler. Vil du ha færre og høyere skuffer, setter du `topp_rader = 2` eller `1`.
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

- **Store skuffer** har samme utforming som de små: håndtak nederst med 45° overside, etikettfelt øverst på fronten og spor for 1–3 skillevegger. Veggene og bunnen er 1,2 mm og fronten 1,6 mm (små skuffer: 1,2 mm vegger, 1,0 mm bunn, 1,6 mm front).
- **Løse kasser** har åpen front:
  - Fronten er lav, 40 % av høyden, og sidekantene er skrå, så du ser og når innholdet.
  - Grepsleppe på overkanten av fronten, med 45° underside.
  - Etikettfelt under grepet.
  - Stablefot: de nederste 4 mm er trukket inn og passer ned i kassen under, med 0,4 mm luft.
  - Kassene printes stående uten support.

### Antall deler, printtid og filament (anslag, 0,2 mm lag, PETG/PLA)

Dette er grove anslag regnet for hånd. **Sliceren gir fasit.**

- **Massivt anslag** er volumet × 1,27 g/cm³ (PETG). CI-en regner det ut for hver STL med `sjekk_stl.py` og feiler hvis en `*modul*`-fil er over 300 g.
- **Slicet forbruk** med 2 vegger og 15 % infill: regn med ca. **80 %** av det massive anslaget. Delene består nesten bare av 1,2–2 mm gods, som blir massivt uansett. (Den gamle modulen var 1041 g massivt og 842 g i sliceren.) Tykke deler som pinner og lasker ligger nærmere 50 %.
- **Tid** er for en Creality K2 med 0,4 mm dyse og 0,2 mm lag i PETG.

| Seksjon | Deler | Printtid | Filament, massivt → slicet (≈ 0,8) |
| --- | --- | --- | --- |
| Sidetårn, små skuffer | 48 skuffer (16 plater à 3), 6 rammemoduler, 4 lask, 2 lask4, 8 pinner | ca. 90 t (skuff ca. 1–1,5 t, modul ca. 4–6 t) | skuff ca. 36 g, modul ca. 95–125 g → ca. 2,4 kg → **ca. 1,9 kg** |
| Sidetårn, store skuffer | 6 skuffer, 2 rammemoduler, 2 lask, 1 lask4, 4 pinner | ca. 26 t (skuff 2,5–3 t, modul 4–5 t) | skuff ca. 80 g, modul ca. 95 g → ca. 0,7 kg → **ca. 0,55 kg** |
| Topphylle | 6 skuffer, 2 rammemoduler | ca. 27 t (skuff ca. 3 t, modul 4–5 t) | skuff ca. 95 g, modul ca. 100 g → ca. 0,75 kg → **ca. 0,6 kg** |
| Kasser 3 S + 2 M + 1 L | 7 printdeler (L i 2 deler) | ca. 35 t (S 4 t, M 6 t, L 11 t) | ca. 1,1 kg slicet (S 120 g, M 190 g, L 340 g) |
| Bakkasser (valgfritt) | 10 | ca. 45 t (4–5 t/stk) | ca. 1,4 kg slicet (140 g/stk) |
| **Totalt** | | **ca. 220 t** | **ca. 5,5 kg** (før: 13,8 kg) |

Med `dybde_maks = 0` (240 mm dype rammer og skuffer) blir skuffene og rammene ca. 1,5 ganger tyngre og tar tilsvarende lengre tid.

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

`skjoldlab_ledvegg.scad` lager sorte skuffer i rader, i stilen fra brukerens bilde, med en kanal over hver rad for en adresserbar LED-stripe. Når du søker etter en del i Skjold Lab, lyser LED-en over skuffen. Elektronikk, WLED og oppsett står i [`../skjoldlab-led/README.md`](../skjoldlab-led/README.md).

Modellen har to varianter (`variant`):

| Variant | Hva | Skuffer | LED-er |
| --- | --- | --- | --- |
| **`"hele_hylla"`** (standard) | Hele hylla (560 × 760 × 320) er **ett sorteringsskap med LED**, uten Raaco. | 10 LED-rader × 11 kolonner, **90 skuffer** (143 uten store/brede) | 330 (ca. 5,5 m); 429 uten store/brede |
| `"rundt_raaco"` | Raaco står nederst inntil én side. LED-veggen fyller resten: en sidevegg i full høyde og en toppvegg over Raaco. Raaco får en egen LED-skinne over hver rad. | 65 + 15 = 80 (+ 60 i Raaco) | 456 (ca. 7,6 m) |

Alt printes i **sort PETG**. Det eneste unntaket er diffusoren, som bør være natur eller hvit PETG. Du kan også bruke bakepapir eller en opal plaststrimmel i sporet.

### Lett konstruksjon, printes uten support

Den første utgaven hadde hele hyller per rad, hel bakvegg, massive sidevegger og 240 mm dybde. En modul på 150 × 232 mm brukte 842 g og 20 t 45 min i sliceren (1041 g massivt), og sliceren varslet «floating cantilever». Årsakene var korte, flate utstikk som hang i lufta når modulen ligger på ryggen: ribbene for masken (1,5 mm), den loddrette innsiden av stoppkanten (2 mm) og LED-veggen i øverste rad (11 mm som bare hang i taket).

Nå er rammen bygd slik:

- **Skinner i stedet for hyller:** per rad to smale skinner per skuffkolonne langs hele dybden. Ytterst er det L-skinner der sideramma er styrekanten. Mellom kolonnene er det T-skinner med en 3,2 mm styrekant (2 × `vegg_t`, som en modulskjøt). Flensen er 4,5 mm bred og 1,6 mm tykk, og skuffen glir på den.
- **Tverrlist foran per rad:** frontlista (gulvet foran), taket med stoppkanten og LED-veggen danner en lukket boks over hver rad. Det er tverrlista som bærer LED-kanalen, og kanalen er sammenhengende foran.
- **Skråstag foran:** mellom kolonnene går et 2 mm stag i 45° fra T-skinna opp til bakkanten av taket. Det avstiver fronten og bærer taket i printen.
- **Tynn bakstopp:** en 1,6 mm tverrstang bak på hver rad. Skuffen stopper mot den med fronten i flukt.
- **Åpen rygg:** bare lister oppe og nede og et kryss, pluss puter rundt skruebossene til laskene.
- **Sidene er rammer:** to store vinduer per rad, med plass rundt boltehullene bak og der lister og tak sitter fast foran.
- **Dybde:** standard `dybde_maks = 165`. Skuffen blir 156 mm, eller 164 mm med grep, omtrent som Raaco (153 mm). `dybde_maks = 0` gir 240 mm som før, men da blir rammene og skuffene ca. 1,5 ganger tyngre.
- **Mindre moduler:** maks 3 skuffer × 3 rader per modul (`modul_kolonner_maks`, `modul_rader_maks`). Det gir moduler på maks 150 × 176 mm.

**Printretning:** rammene printes fortsatt **liggende på ryggen** (`modul_print`), med ryggen ned og fronten opp. Det er den beste retningen. Skinner, siderammer og skråstag står da loddrett og blir sterke langs lagene. Ryggen og enden av skinnene står på platen. Stående eller på siden ville gjort skinnene til lange broer. Alle flater som vender ned i denne retningen er laget for print uten support:

- Ribbene for masken har loddrett forside og 45° bakside.
- Stoppkanten er 45° både foran og bak (den bakre flaten hekter leppa på skuffen).
- Vinduene i siderammene har 45° spiss foran, der taket på vinduet havner i printen.
- LED-veggen i øverste rad bæres av et 45° skråstag bak.
- Liggende hull er dråpeformede.
- Det eneste som bygges som bro, er korte spenn mellom skinner og skråstag: taket og frontlista spenner maks ca. 48 mm, og bakstoppen ca. 38 mm.

### Skuffavstanden er låst til LED-ene

Skuffavstanden er alltid et helt antall LED-er:

- `led_per_m = 60` gir en LED-avstand på 1000 / 60 = **16,667 mm**.
- `led_per_skuff = 3` (standard) gir en skuffavstand på **50 mm**. Med `4` blir den 66,7 mm.

Hver modul er et helt antall skuffer bred, og modulkanten er en halv styrekant (`vegg_t` = 1,6 mm). Derfor holder skuffavstanden seg også over modulskjøtene. Stripa kuttes mellom to LED-er, og da havner kuttet nøyaktig på kanten av veggen:

- **Oddetall** LED-er per skuff (3): LED nr. 0 sitter 8,333 mm fra venstre kant. Midt-LED-en står over midten av hver skuff (25, 75, 125 … mm).
- **Partall** LED-er per skuff (4): stripa starter én LED inn (`offsetMm` = 16,667 mm), og raden får én LED mindre. Det er fordi midten av skuffen ellers havner mellom to LED-er.

Det er et siktemerke over midten av hver skuff: et hakk i den fremre ribba og en strek på LED-veggen. Legg midten av en LED på streken når du limer stripa.

### Store og brede skuffer, og akrylfront (fra 2026-11-09)

- **`store_skuffer = 10`** gir skuffer som er 2 brede og 2 høye (96 × 156 × 98 mm). De ligger i doble rader nederst. En dobbel rad er like høy som to vanlige (116 mm) og har én LED-stripe på toppen.
- **`brede_skuffer = 10`** gir skuffer som er 2 brede og 1 høy (96 × 156 × 40 mm), i radene over de store.
- Hver modulkolonne med 3 skuffer får én dobbel skuff og én enkel per rad (3/3/3/2 gir 4 doble per rad). De fylles rad for rad fra venstre. 10 store gir derfor 3 doble rader: 4 + 4 + 2. Plassene som blir igjen i de doble radene, blir høye smale skuffer (1 × 2, 46 × 156 × 98 mm).
- Under en dobbel skuff er det ingen T-skinne, bare en midtskinne. Skråstaget som bærer taket i printen, er byttet ut med en finne oppå taket. Den går helt bak til ryggen og står på printplata.
- I Skjold Lab blir skapet **10 rader × 11 kolonner** (LED-radene). En bred skuff dekker to kolonner. Bruk den venstre kolonnen; LED-en over den lyser over skuffen.
- **`akryl = true`** (standard) gir alle skuffene et vindu i fronten over grepet og et spor bak til en akrylplate på `akryl_t = 2` mm (f.eks. Clas Ohlson 34-1359, 300 × 200 × 2 mm). Platen skyves ned ovenfra, og vinduet er åpent oppover, så det trengs ingen bro i printen. Du kan legge en papiretikett bak platen eller la den være klar. Konsollen viser platemålene på linjene `SKJOLDLAB-AKRYL`, og `LES-MEG.md` i pakken har kutteliste. Med standardmålene er platene 43 × 24 mm (1 × 1), 93 × 24 (2 × 1), 43 × 82 (1 × 2) og 93 × 82 (2 × 2), til sammen ca. 2 000 cm², altså 4–6 ark. `akryl = false` gir etikettfeltet som før.

Med standardverdiene blir det **90 skuffer**: 57 vanlige, 10 brede, 13 høye smale og 10 store. LED-er: 10 rader × 33 = 330.

| Rad i Skjold Lab | Skuffer fra venstre (2 = dobbel) |
| --- | --- |
| 1–4 | 11 vanlige |
| 5 | 2 1 · 2 1 · 1 1 1 · 1 1 (2 brede) |
| 6–7 | 2 1 · 2 1 · 2 1 · 2 (4 brede) |
| 8 (dobbel høyde) | 2 1 · 2 1 · 1 1 1 · 1 1 (2 store, resten høye smale) |
| 9–10 (dobbel høyde) | 2 1 · 2 1 · 2 1 · 2 (4 store) |

Modulene blir 4 × 5 = 20 som før, med etasjene 116/116/174/174/176 mm (nedenfra). Sett `store_skuffer = 0` og `brede_skuffer = 0` for 143 like skuffer som før.

### Oppsett, hele hylla (sett forfra, uten store skuffer)

```
 x=0 5     155      305      455     555 560
 +------------------------------------------+  z=760
 | +--------+--------+--------+------+      |  z=756
 | |  nr 17 |  nr 18 |  nr 19 | nr 20|      |  2 rader (lokk på toppen)
 | +--------+--------+--------+------+      |  z=638
 | |  nr 13 |  nr 14 |  nr 15 | nr 16|      |  2 rader
 | +--------+--------+--------+------+      |  z=522
 | |  nr 9  |  nr 10 |  nr 11 | nr 12|      |  3 rader
 | +--------+--------+--------+------+      |  z=348
 | |  nr 5  |  nr 6  |  nr 7  | nr 8 |      |  3 rader
 | +--------+--------+--------+------+      |  z=174
 | |  nr 1  |  nr 2  |  nr 3  | nr 4 |      |  3 rader
 | +--------+--------+--------+------+      |  z=0
 |  3 skuff  3 skuff  3 skuff  2 skuff      |
 +------------------------------------------+
   11 x 13 = 143 skuffer, 46 x 156 x 40 mm. Rad 1 er øverst, kolonne 1 til venstre.
   ELEKTRONIKKBOKS ved siden av eller på toppen av hylla.
```

Rekkefølgen (nr) er den samme som på linjene `SKJOLDLAB-MODUL` i konsollen: nederste rad først, fra venstre mot høyre. Det er også rekkefølgen du printer og monterer i.

### Mål (standard)

| | Hele hylla (standard) | Rundt Raaco: sidevegg | Rundt Raaco: toppvegg |
| --- | --- | --- | --- |
| **Vegg** (B × D × H) | 550 × 165 × 756, x = 5–555 | 250 × 165 × 756, x = 303–553 | 250 × 165 × 176, x = 25–275, oppå Raaco |
| **Rader × kolonner** | 13 × 11 = 143 | 13 × 5 = 65 | 3 × 5 = 15 |
| **Moduler** (B × H) | 4 × 5 = 20: 150/150/150/100 mm brede, 3/3/3/2/2 rader (174/174/174/116/118 mm høye) | 2 × 5 = 10: 150 og 100 mm brede, 3/3/3/2/2 rader | 2 × 1: 150 og 100 mm brede, 176 mm høye |
| **Skuff** | 46,0 × 156 × 40 (42 med leppe, 164 med grep) | samme | samme |

Slik regner modellen ut målene:

- **Radavstanden** er `rad_hoyde + kanal_h` = 45 + 13 = **58 mm**. Gulvnivået er 2 mm, skuffåpningen 43 mm og LED-kanalen 13 mm. `kanal_h = 0` betyr auto, altså `led_bredde + 3`, som gir 15 mm for 12 mm stripe.
- **Hele hylla:** bredden er 560 − 2 × 3 = 554 mm, som gir 11 skuffer à 50 mm (550 mm), midt i hylla. Høyden er 760 − 3 = 757 mm, som gir 13 rader: 13 × 58 + 2 = 756 mm. Overstyr med `kolonner_hele`/`rader_hele`.
- **Rundt Raaco:** sideveggen er 560 − 300 − 2 × 3 = 254 mm bred (5 skuffer). Toppveggen har 760 − 552 − 3 = 205 mm og får 3 rader (176 mm).
- **Moduler:** maks `modul_kolonner_maks` × `modul_rader_maks` = 3 × 3 skuffer, og aldri større enn byggeplaten (256 − 10 = 246 mm). Rammene printes liggende på ryggen, så dybden er printhøyde: 165 mm.
- **Skuffen** er `50 − 2 × 1,6 − 2 × 0,4` = 46,0 mm bred og `165 − 2 − 7` = 156 mm dyp. Høyden er 43 − 2 − 1 = 40 mm, og leppa bak gjør den 42 mm, akkurat som Raaco.

### Kanalen over hver rad (snitt fra siden)

```
   front                                  bak
     |  frontlist 1,2 (gulvet i raden over) ----- skinner -------
     |r|  |r|        LED  ->|█|\
     |i|M |i|        lys    |█| \  skråstag 45° (bare øverste rad
     |b|D |b|               |█|  \  i modulen: bærer LED-veggen)
     |/|  |/|               |█|   \
  ===+=+==+=+===============+=+====+=  tak 1,2 mm (14,6 mm dypt)
     \__/  stoppkant (45° foran og bak)        \ skråstag 45° ned til T-skinna
     [skuff 40 mm ........................ leppe 42 mm ]
  === skinner (L/T, 1,6 mm flens) ========== bakstopp ==
   M = maske (sort, vindu over hver skuff) + D = diffusor, i sporet (2,4 mm)
```

- **Masken** (`del="maske"`) er sort og har ett vindu per skuff, `vindu_b` = 14 mm bredt, altså omtrent én LED. Da lyser bare den skuffen.
- **Diffusoren** (`del="diffusor"`, 0,8 mm) printes i natur/hvit PETG og legges bak masken. Sporet er 2,4 mm ved roten av ribbene og har plass til begge. Masken og diffusoren er 12,2 mm høye.
- Masken og diffusoren skyves inn fra siden. Kanalen går gjennom siderammene, så stripa, masken og ledningene fortsetter til neste modul.
- Ribbene under frontlista stikker 1,5 mm ned i kanalen under. Ved en etasjeskjøt griper de ned i modulen under og låser fronten.

### Skuffen

- **Lett:** 1,2 mm vegger (3 linjer med 0,4 mm dyse), 1,0 mm bunn og 1,6 mm front. Ca. 28 cm³, altså ca. 36 g massivt og ca. 29 g slicet. Vil du ned mot 25 g, setter du `skuff_vegg = 0.8` og `skuff_bunn = 0.8`, men da blir skuffen mykere.
- **Avrundet grep** foran, som på bildet. Det er 30 mm bredt, stikker 8 mm ut og er et hult skall (1,2 mm) med 45° tak, så det printes uten support.
- **Etikettfelt** øverst på fronten, 10 mm høyt og 0,6 mm dypt.
- **Spor for skillevegger** ved 1/3, 1/2 og 2/3 (`del="skillevegg"`/`"skilleplate"`).
- **Stoppleppe bak**, som på Raaco, med 45° forside. Når du trekker ut skuffen, hekter leppa (42 mm) seg under den skrå stoppkanten (41 mm), og skuffen trekkes ned mot skinnene i stedet for å vippe ut. Vil du ta skuffen helt ut, løfter du fronten litt. Når du setter den inn, holder du bakkanten litt ned.

### LED-skinne for Raaco (bare rundt_raaco)

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


### Deler, innkjøp og forbruk (standard)

Konsollen skriver én linje per del (`SKJOLDLAB-DEL: navn=… del=… antall=… gruppe=…`) og én per modul (`SKJOLDLAB-MODUL: nr=… del=… modul_x=… modul_y=… x=… y=… b=… h=… rader=… kolonner=… seksjon=…`). Linjen `SKJOLDLAB-NETT: …` gir rader, kolonner, avstander, midten av skuff 1-1 (`x0`/`y0` i mm fra nedre venstre hjørne av hylla) og antall LED-er. `eksporter.sh` lager STL-filene ut fra disse linjene.

| Del | Hele hylla | Rundt Raaco | `del=` |
| --- | --- | --- | --- |
| Rammemoduler | 20 (4 × 5) | 10 side + 2 topp | `modul` med `modul_x`/`modul_y`, og `topp_modul` |
| Skuffer | 143 (36 plater à 4 + 1 prøveskuff) | 80 | `skuff` / `skuffplate` |
| Masker + diffusorer | 1 per rad per modulkolonne: 4 × 13 | side 2 × 13, topp 2 × 3 | `maske` / `diffusor` med `seksjon` (`hele`/`side`/`topp`) og `modul_x` |
| Lasker bak | 8 `lask` + 12 `lask4` | 8 `lask` + 4 `lask4` | `lask` / `lask4` |
| Raaco-skinner og klips | – | 12 + 24 | `raaco_skinne` / `raaco_klipsplate` |
| Elektronikkboks | 1 + lokk | 1 + lokk | `elboks` / `elboks_lokk` |

**Innkjøp til hele hylla:**

- M3 × 10 bolt med mutter og skive: én per rad i hver sideskjøt, altså 3 × 13 = 39 stk. Rundt Raaco: 13 + 3 = 16 stk.
- M3 × 10 selvgjengende skrue til laskene: 2 per `lask` og 4 per `lask4`, altså 64 stk. Rundt Raaco: 32 stk.

**LED-er:** hele hylla har 13 × 33 = **429 LED-er**, ca. 7,2 m stripe. Rundt Raaco: Raaco 216, toppvegg 45 og sidevegg 195, til sammen 456. Se innkjøpslisten i `../skjoldlab-led/README.md`.

**Grovt anslag for forbruk** (PETG, 0,2 mm lag, Creality K2 med 0,4 mm dyse). Massivt anslag = volum × 1,27 g/cm³, som CI regner ut per STL. Slicet med 2 vegger og 15 % infill blir det ca. **80 %** av dette, fordi delene nesten bare er 1,2–2 mm gods. **Sliceren gir fasit.**

| Del | Massivt (anslag) | Slicet (≈ 0,8) | Tid (anslag) |
| --- | --- | --- | --- |
| Modul 3 × 3 (150 × 174 × 165) | ca. 145 g | ca. 115 g | ca. 4–6 t |
| Modul 2 × 3 / 3 × 2 / 2 × 2 | ca. 80–110 g | ca. 65–90 g | ca. 3–4 t |
| Skuff (46 × 156 × 40) | ca. 36 g | ca. 29 g | ca. 1–1,5 t (skuffplate med 4: ca. 5 t) |
| Maske / diffusor | ca. 3 g / 2 g | | ca. 15 min |
| **Hele hylla** (20 moduler, 143 skuffer, masker, lasker, boks) | **ca. 7,8 kg** (moduler ca. 2,4 kg, skuffer ca. 5,1 kg) | **ca. 6,2 kg** | **ca. 270 t** |
| **Rundt Raaco** (12 moduler, 80 skuffer, Raaco-deler, boks) | ca. 4,5 kg | ca. 3,6 kg | ca. 160 t |

Den gamle modulen (150 × 232 × 240 mm) var 1041 g massivt og 842 g slicet. En modul er nå 6–8 ganger lettere. Det meste av filamentet går nå til skuffene. Med `dybde_maks = 0` (240 mm) blir både moduler og skuffer ca. 1,5 ganger tyngre, og 3 × 4-moduler (`modul_rader_maks = 4`) havner på ca. 190 g massivt.

Begynn med én skuff, én maske og `modul_x0_y0` som prøve (gruppen `prove` i `SKJOLDLAB-DEL`).

### Montering

1. **Prøv først:** print én skuff og `modul_x0_y0`. Sjekk at skuffen glir, stopper mot bakstoppen og hekter seg i stoppkanten, og at masken og diffusoren glir inn i sporet.
2. **Stripa:** lim stripa i hver rad på LED-veggen, med midten av LED-en på streken. Gjør det før modulene skrus sammen; det er lettest når modulen ligger på ryggen. Kanalen er åpen gjennom siderammene, så én stripe kan gå over alle modulene i en rad. Du kan også lodde den i skjøten.
3. **Side om side:** bolt modulene i hver etasje sammen, én M3 × 10 per rad, bak skuffene. Gjør dette før du stabler.
4. **Etasjer:** sett neste etasje oppå i nummerrekkefølgen. Ribbene under frontlista går ned i kanalen under. Skru lasker over skjøtene bak (16 mm mellom hullene, M3 × 10 selvgjengende i bossene): `lask` i ytterkantene og `lask4` der fire moduler møtes.
5. **Masker og diffusorer:** skyv dem inn fra siden i hver rad.
6. **Ledninger:** i enden av hver rad går ledningen ut gjennom kanalåpningen i sideramma og ned til neste rad, i klaringen mot hylleveggen. Stripa går i serpentine: rad 1 fra venstre mot høyre, rad 2 tilbake, og så videre.
7. **Rundt Raaco:** lim klipsene fra bunnen og opp, klikk inn skinnene og før ledningene gjennom sporene ytterst.

### Legg LED-skapet inn i Skjold Lab

**Hele hylla (standard):** ett skap.

| Skap i Skjold Lab | Rader × kolonner | LED-oppsett (start, LED-er per rad, `drawerPitchMm`, `firstDrawerXmm`, `offsetMm`) |
| --- | --- | --- |
| **Sorteringsskap (LED)** | 13 × 11 | start 0, 33 per rad, 50, 25, 8,333 |

**Rundt Raaco:**

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
- **Skuffdybden** er `rammedybde − bakvegg − bak_rom`, altså 165 − 2 − 10 = 153 mm. Bak skuffene er det 10 mm til stolpeklossene og boltene.
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

# LED-skap (egen fil). Standard: hele hylla (variant="hele_hylla")
L=skjoldlab_ledvegg.scad
openscad -o modul_x0_y0.stl      -D 'del="modul"' -D modul_x=0 -D modul_y=0 $L   # hele hylla: x 0–3, y 0–4
openscad -o maske_hele_x0.stl    -D 'del="maske"' -D 'seksjon="hele"' -D modul_x=0 $L
# Rundt Raaco: legg til -D 'variant="rundt_raaco"'
openscad -o modul_x0_y0.stl      -D 'variant="rundt_raaco"' -D 'del="modul"' -D modul_x=0 -D modul_y=0 $L   # x 0/1, y 0–4
openscad -o topp_modul_x0.stl    -D 'variant="rundt_raaco"' -D 'del="topp_modul"' -D modul_x=0 $L           # x 0/1
openscad -o skuff.stl            -D 'del="skuff"'            $L
openscad -o skuffplate.stl       -D 'del="skuffplate"'       $L   # 4 skuffer
openscad -o skillevegg.stl       -D 'del="skillevegg"'       $L
openscad -o skilleplate.stl      -D 'del="skilleplate"'      $L
openscad -o diffusor_hele_x0.stl -D 'del="diffusor"' -D 'seksjon="hele"' -D modul_x=0 $L
openscad -o lask.stl             -D 'del="lask"'             $L
openscad -o lask4.stl            -D 'del="lask4"'            $L
openscad -o raaco_skinne.stl     -D 'del="raaco_skinne"'     $L   # diagonalt (bare rundt Raaco)
openscad -o raaco_klips.stl      -D 'del="raaco_klips"'      $L
openscad -o raaco_klipsplate.stl -D 'del="raaco_klipsplate"' $L   # 24 klips
openscad -o elboks.stl           -D 'del="elboks"'           $L
openscad -o elboks_lokk.stl      -D 'del="elboks_lokk"'      $L
openscad -o ledvegg.png --imgsize=1600,1400 -D 'del="oversikt"' $L   # bare visning
```

Dine egne mål kan legges på som ekstra `-D`, for eksempel `-D hylle_bredde=565 -D rad_avstand=44.2 -D 'raaco_side="hoyre"'`.

**Alt på én gang:** `./eksporter.sh stl -D hylle_bredde=565` legger alle printdelene i `stl/`. LED-skapet eksporteres til `stl/ledvegg/` med `./eksporter.sh stl --led` (bare LED-skapet) eller `--alle` (begge modellene). `--variant hele_hylla` (standard) eller `--variant rundt_raaco` velger LED-variant; hvilke moduler og deler som lages, leses fra linjene `SKJOLDLAB-MODUL` og `SKJOLDLAB-DEL`. Parametre etter flaggene gjelder modellen du eksporterer. Antall moduler leses fra modellen, og det samme gjør valget mellom hel og delt kasse L og om topphylle, store skuffer og bakkasser er med. Mappen `stl/` er ignorert av git.

Alle deler legges ut i riktig retning for print:

- **Skuffer og kasser** står på bunnen.
- **Rammemodulene** ligger på ryggen, med ryggen ned og fronten opp. Skinner, siderammer og stag står loddrett, og alle flater som vender ned er 45° eller korte broer (maks ca. 55 mm) mellom skinnene.
- **Skilleveggen, lasken og pinnen** ligger flatt.

---

## Printinnstillinger

| | Skuffer, kasser og skillevegger | Rammemoduler | Lasker og pinner |
| --- | --- | --- | --- |
| Materiale | PETG (tåler mest, glatt glid) eller PLA. Transparent/natur PETG ligner originalen. | PLA eller PETG, svart eller mørk grå som hovedskapet | PETG eller PLA |
| Lagtykkelse | 0,2 mm (0,28 mm går fint for store skuffer og kasser) | 0,2–0,28 mm | 0,2 mm |
| Vegger/perimeter | 2–3 (1,2 mm vegg = 3 linjer à 0,4 mm; kasser 1,6 mm) | 2–3 (rammen er 1,2–2 mm gods og blir massiv uansett) | 4 |
| Infill | 15 % (gjelder bare bunnen) | 15–20 % gyroid | 40 % |
| Support | **Ingen.** Håndtak og grep har 45° flater. | **Ingen.** 45° fas på alt som vender ned, korte broer mellom skinnene, dråpeformede hull. | Ingen |
| Brim | Nei (gjerne 3 mm på kasse L-halvdelene) | **Ja, 5 mm.** Rammen står på smale lister og skinneender. | Nei |

- Dyse 0,4 mm. Toleransen er 0,4 mm. Sitter skuffene for trangt eller løst, endrer du `toleranse` og printer én skuff på nytt.
- PETG trekker seg litt mindre enn ABS. Rammen bør ikke printes i ABS uten kabinett, fordi så store flater kan vri seg.
- Etikettfeltet er en 0,6 mm forsenkning. Passer for P-touch-tape (12 mm) eller trykte etiketter fra Skjold Lab.

---

## Montering

1. **Prøv først:** print én skuff og `modul_x0_y0`. Sjekk at skuffen glir, at fronten flukter (bakstoppen tar imot), og at radene står på linje med Raaco.
2. **Side om side:** legg venstre og høyre modul i samme etasje inntil hverandre. Stikk en M3×20 gjennom boltehullene bak i hver rad (gjennom sideramme + kloss på begge moduler), og stram mutteren lett.
3. **Etasjer:** sett pinner i hullene på toppen av stolpeklossene og senk neste etasje ned. Tungene under kantskinnene glir ned innenfor siderammene og låser fronten.
4. **Store skuffer oppå tårnet:** øverste etasje har pinnehull på toppen. Sett i pinner, senk de to `tarn_stor_modul`-ene ned, bolt dem sammen (2 bolter per rad), og skru lasker bak over skjøten: 2-hulls lask i ytterkantene og en 4-hulls lask i midten.
5. **Lasker bak:** skru en 2-hulls lask over hver etasjeskjøt i ytterkantene og en 4-hulls lask der venstre og høyre modul møtes (M3×10 selvgjengende).
6. **Topphylla:** bolt de to `topp_modul`-ene sammen (2 bolter per rad) og sett dem oppå Raaco, med fronten i flukt. Topphylla er 165 mm dyp og stikker 15 mm bak Raaco. En filtbit eller et dobbeltsidig teip på Raaco-toppen hindrer at den sklir.
7. **Kasse L:** legg halvdelene inntil hverandre og skru sammen flensene med 5 M3×12 og mutter.
8. Sett inn skuffer og eventuelt skillevegger: 1 vegg i midtsporet gir 2 rom, og 2 vegger i 1/3- og 2/3-sporene gir 3 rom.

Merk: skuffene har ingen utfallssperre. De trekkes helt ut, så hold under når du tar dem ut. Det gjelder særlig de store skuffene.
