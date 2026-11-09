# Skjold Lab LED – lys over skuffen

Når du søker etter en del i Skjold Lab og trykker **💡 Vis i skapet**, lyser LED-en over skuffen der delen ligger. Standard er at **hele hylla er ett 3D-printet sorteringsskap med LED** (13 × 11 = 143 skuffer, uten Raaco). Alternativet er en LED-vegg rundt Raaco-skapet, der også Raaco får LED-er (`variant = "rundt_raaco"`). Denne siden beskriver maskinvaren: innkjøp, kobling, WLED og oppsett i Skjold Lab.

Hvordan det henger sammen:

- **Lyset:** en adresserbar LED-stripe (WS2812B, 5 V, 60 LED/m) går over hver skuffrad.
- **Styringen:** en ESP32 med **[WLED](https://kno.wled.ge/)**. WLED er ferdig fastvare, og du trenger ikke skrive egen kode.
- **Kallet:** Skjold Lab-serveren sender `POST http://<wled>/json/state` med indeksen til LED-en. Når tiden er ute (standard 30 s), legges forrige tilstand tilbake.
- **Hjemmenettet:** serveren snakker bare med verter i hjemmenettet, det vil si private IP-adresser, `.local`/`.lan` eller et lokalt navn uten punktum.

De 3D-printede delene er LED-skapet, elektronikkboksen og (bare rundt Raaco) Raaco-skinna med klips. De ligger i [`../skjoldlab3d/skjoldlab_ledvegg.scad`](../skjoldlab3d/skjoldlab_ledvegg.scad), og målene er forklart i [`../skjoldlab3d/README.md`](../skjoldlab3d/README.md#led-vegg-lys-over-skuffen).

---

## Hvor mange LED-er?

Tallene gjelder standardmålene: hylla er 560 × 760 × 320 mm, med 3 LED-er per skuff. Konsollen i OpenSCAD viser de samme tallene på linjene `SKJOLDLAB-LED: LED-er: …` og `SKJOLDLAB-NETT: …`, og regner dem om hvis du endrer parametrene.

**Hele hylla (standard):**

| Del | Rader | LED-er per rad | Stripe per rad | LED-er |
| --- | --- | --- | --- | --- |
| Sorteringsskap (13 × 11 skuffer) | 13 | 33 | 550 mm | **429** (ca. 7,2 m) |

**Rundt Raaco** (`variant = "rundt_raaco"`):

| Del | Rader | LED-er per rad | Stripe per rad | LED-er |
| --- | --- | --- | --- | --- |
| Raaco (12 × 5 skuffer) | 12 | 18 | 300 mm | 216 |
| LED-vegg topp (3 × 5) | 3 | 15 | 250 mm | 45 |
| LED-vegg side (13 × 5) | 13 | 15 | 250 mm | 195 |
| **Sum** | 28 | | **ca. 7,6 m** | **456** |

En rull på 5 m har 300 LED-er. **Kjøp 2 ruller (10 m)** i begge variantene. Da har du nok reserve til kutt og feil.

## Innkjøpsliste

| # | Hva | Antall | Merknad |
| --- | --- | --- | --- |
| 1 | **ESP32-DevKitC** (ESP32-WROOM-32, 38 pinner) | 1 | Alle vanlige ESP32-kort med WLED-støtte går. ESP32-C3/S3 går også, men da blir pinnenumrene andre. |
| 2 | **WS2812B LED-stripe, 60 LED/m, 10 mm, 5 V**, IP30 (uten silikon) | 2 × 5 m | IP30 er tynnest (ca. 2 mm). Det trengs for Raaco-skinna (3 mm) rundt Raaco; i hele-hylla-varianten går også en tynn silikonkappe (sett `led_tykk`). SK6812 (RGB eller RGBW) går også. |
| 3 | **5 V strømforsyning, 4 A (20 W)**, lukket type med jordet plugg, eller en god 5 V / 4 A-adapter med 5,5/2,1-plugg | 1 | Se [Strøm](#strøm). Tar du 6–10 A, har du reserve til effekter. |
| 4 | **Nivåskifter 74AHCT125** (DIP-14) + sokkel | 1 | Gjør om 3,3 V-datasignalet fra ESP32 til 5 V. Alternativet 74HCT125 går også. |
| 5 | **330 Ω-motstand**, 1/4 W | 2 | Seriemotstand i datalinja, én per utgang, ved nivåskifteren. |
| 6 | **1000 µF elektrolyttkondensator**, minst 10 V (gjerne 16 V) | 2 | Én over 5 V/GND ved starten av hver stripekjede. |
| 7 | **100 nF keramisk kondensator** | 1 | Avkobling ved 74AHCT125 (VCC–GND). |
| 8 | **Sikringsholder for panel 5 × 20 mm** + **trege sikringer T3,15 A** | 1 + 3 | På 5 V-siden, rett etter inntaket. |
| 9 | **DC-kontakt for panel**, 5,5/2,1 mm (eller skrueklemme hvis forsyningen har løse ledninger) | 1 | Passer i hullet på 11,5 mm i elektronikkboksen. |
| 10 | **Hullkort 70 × 50 mm** + hunnlister (2 × 19) til ESP32 | 1 | Passer i boksen. |
| 11 | **Ledning, 0,75–1 mm²** (rød/sort) | 2 m | Fra forsyningen til fordeling og innmating. |
| 12 | **Ledning, 0,5 mm² (AWG 20)**, 3-leder (5 V, data, GND) | 4 m | Fra boksen til starten av hver kjede, og innmating i enden. |
| 13 | **Tynn 3-leder, 0,14–0,25 mm² (AWG 24–26)** | 3 m | Hopp mellom radene (ca. 6–10 cm per hopp). |
| 14 | **JST SM 3-pin** eller **WAGO 221** | etter behov | Skjøter som kan tas fra hverandre ved modulene og boksen. |
| 15 | **VHB-tape** (8–10 mm) | 1 rull | Bare rundt Raaco: til Raaco-klipsene. |
| 16 | Krympestrømpe, strips, loddetinn | | |

## Strøm

**Dimensjonering:**

- Én WS2812B trekker opptil ca. **60 mA** på full hvit, altså 20 mA per farge.
- Alle 429 på full hvit ville trekke 429 × 60 mA ≈ **26 A** (rundt Raaco: 456 LED-er, ca. 27 A). Det skjer aldri her, fordi vi tenner bare noen få LED-er om gangen.
- Et søk tenner maks 10 skuffer, med 1 LED hver, i blått (`#2F6BFF`) på lysstyrke 128 av 255. Det blir ca. 10 × (5 + 10 + 20 mA) × 0,5 ≈ **0,2 A**.
- Testknappen «Test alle» i Skjold Lab tenner alle LED-ene samtidig. Det er den største belastningen, og derfor trenger vi strømgrensen i WLED.

| Hva | Strøm |
| --- | --- |
| ESP32 med WiFi | ca. 0,25 A |
| 429–456 LED-er som er «av» (hvilestrøm ca. 0,6–1 mA hver) | ca. 0,3–0,5 A |
| Søk, opptil 10 skuffer | ca. 0,2 A |
| Grense i WLED (ABL, se nedenfor) | **2 A** for LED-ene |
| **Forsyning** | **5 V, 4 A** (2 A grense + ESP32 + hvilestrøm + god margin) |

- **Sikring:** T3,15 A (treg) på 5 V-siden, rett etter inntaket i boksen. Den beskytter ledningene hvis noe kortslutter.
- **Hvilestrøm:** stripene trekker ca. 2–3 W hele døgnet også når de er av. Vil du unngå det, kan du styre et relé fra WLED (*Config → LED Preferences → Relay GPIO*), som kutter 5 V til stripene når alt er av. Det tar et halvt sekund ekstra før første LED lyser.
- **Innmating:** med så lav strøm holder det å mate inn 5 V/GND i begge ender av hver kjede. Hele hylla: i rad 1 (øverst) og rad 13 (nederst). Rundt Raaco: Raaco i rad 1 og rad 12, og veggen øverst i toppveggen og nederst i sideveggen. Skal du kjøre effekter med mye lys, mater du i tillegg inn i midten (rad 7).

## Koblingsskjema

### I tekst

1. **5 V inn:**
   - Forsyningen går til DC-kontakten, så til sikringsholderen (T3,15 A), og så til 5 V-skinna på hullkortet.
   - GND går rett til GND-skinna.
2. **ESP32:**
   - 5 V-skinna går til pinnen **5V** (VIN) på ESP32, og GND til **GND**.
   - Ikke koble til USB og 5 V-forsyningen samtidig, med mindre kortet har diode på USB-siden. Ta ut 5 V-pluggen når du flasher via USB.
3. **74AHCT125:**
   - Pinne 14 (VCC) til 5 V, og pinne 7 (GND) til GND, med 100 nF mellom pinne 14 og 7.
   - Pinne 1 (1OE) og pinne 4 (2OE) til GND, så kanal 1 og 2 alltid er på.
   - Kanal 3 og 4 brukes ikke: pinne 10 (3OE) og 13 (4OE) går til 5 V, og pinne 9 (3A) og 12 (4A) går til GND.
4. **Data, utgang A:** **GPIO16** på ESP32 går til pinne 2 (1A). Pinne 3 (1Y) går gjennom **330 Ω** til DIN på første LED: i hele-hylla-varianten rad 1 (øverst), venstre ende. Rundt Raaco går utgang A til Raaco (rad 1, venstre ende).
5. **Data, utgang B (bare rundt Raaco):** **GPIO17** går til pinne 5 (2A). Pinne 6 (2Y) går gjennom **330 Ω** til DIN på første LED i toppveggen (rad 1, venstre ende). I hele-hylla-varianten brukes ikke utgang B; da kobles pinne 4 (2OE) til 5 V og pinne 5 (2A) til GND.
6. **Ved starten av hver kjede:** 1000 µF mellom 5 V og GND, med riktig polaritet. Den lange beina er +.
7. **Felles jord:** GND fra forsyningen, ESP32, 74AHCT125 og alle stripene skal henge sammen. Data uten felles GND virker ikke, eller flimrer.
8. **Rekkefølgen på stripene er serpentine.** Rad 1 går fra venstre mot høyre, rad 2 fra høyre mot venstre, og så videre. DOUT i enden av én rad kobles til DIN i neste rad med en kort 3-leder (5 V, data, GND). Pilene på stripa viser retningen.
   - **Hele hylla:** rad 1 til rad 13, 33 LED-er per rad, 429 til sammen. Rad 13 slutter til høyre (13 er oddetall).
   - **Raaco:** rad 1 til rad 12, 216 LED-er. Raden slutter til venstre (12 er partall).
   - **Veggen:** toppveggen rad 1–3 (45 LED-er, slutter til høyre), så sideveggen rad 1–13 (195 LED-er). Toppveggen slutter rett ved siden av sideveggens rad 1, så hoppet blir kort.

### ASCII

```
                         ELEKTRONIKKBOKS
  230 V ~  +-------------------------------------------------------------+
 ---[PSU 5V 4A]--DC-jack--[T3,15A]--+-----------------+-----------+       |
           |                        | 5V              | 5V        | 5V    |
           |                     +--+--+          +---+---+       |       |
           |                     | 5V  |          |VCC 14 |       |       |
           |                     |     |  GPIO16->| 2  1A |       |       |
           |                     |ESP32|          | 3  1Y |--[330R]--+----+---> DATA A (Raaco)
           |                     |     |  GPIO17->| 5  2A |       |  |    |
           |                     | GND |          | 6  2Y |--[330R]--|--+-+---> DATA B (vegg)
           |                     +--+--+          | 1,4 OE|-GND   |  |  | |
           |                        |             | 7 GND |       |  |  | |
           |                        |             +---+---+       |  |  | |
   GND ----+------------------------+-----------------+-----------+--|--|-+---> GND (A og B)
           |                                                       \ |  | |
           |                                                5V A og B ---> 5V (A og B)
           +-------------------------------------------------------------+

  Ved hver kjede:   5V ---+----------- 5V ----> stripe
                          = 1000 µF (+ mot 5V)
                    GND --+----------- GND ---> stripe
                    DATA ------------- DIN ---> stripe

  Hele hylla (sett forfra), utgang A, start 0, 33 LED-er per rad:
     DIN ->[  0 ............................ 32 ]-+    rad 1   (x = 5 -> 555 mm i hylla)
        +-[ 65 ............................. 33 ]<-+     rad 2
        +->[ 66 ............................ 98 ]-+     rad 3
                    ...                                ...
        +->[396 ........................... 428 ]       rad 13

  Rundt Raaco: Raaco (sett forfra), utgang A, start 0:
     DIN ->[ 0 .............................. 17 ]-+    rad 1   (x = 0 -> 300 mm)
        +-[ 35 ............................. 18 ]<-+     rad 2
        +->[ 36 ............................ 53 ]-+     rad 3
                    ...                                ...
        +-[215 ............................ 198 ]<-+    rad 12

  Rundt Raaco: LED-veggen, utgang B, start 216:
     toppvegg  rad 1: 216 -> 230,  rad 2: 245 <- 231,  rad 3: 246 -> 260 -+
     sidevegg  rad 1: 261 -> 275,  rad 2: 290 <- 276,  ... rad 13: 441 -> 455
```

## Installere WLED

1. **Flash** ESP32 fra nettleseren med den offisielle web-installeren på <https://install.wled.me>. Den krever Chrome eller Edge på PC/Mac.
   - Koble ESP32 til med USB, velg siste stabile versjon (0.15 eller nyere) og trykk *Install*.
   - Får du ikke kontakt, mangler du USB-driver (CP210x eller CH340), eller du må holde inne BOOT-knappen mens du kobler til.
2. **WiFi:** etter flashingen lager ESP32 et nett som heter **WLED-AP** (passord `wled1234`). Koble til, gå til <http://4.3.2.1>, og velg *WiFi Settings*. Skriv inn hjemmenettet ditt. Under *mDNS address* kan du sette for eksempel `skjoldled`, så heter den `skjoldled.local`.
3. **Fast IP-adresse:** gi kontrolleren en fast adresse med DHCP-reservasjon i ruteren, for eksempel `192.168.1.50`. Det er tryggere enn `.local`, som ikke alltid virker i Docker eller på alle nett. Du kan også sette statisk IP i WLED under *WiFi Settings*.
4. **LED-er** (*Config → LED Preferences*):
   - **Hele hylla:** én utgang. *Output 1:* type *WS281x*, color order *GRB*, GPIO **16**, start **0**, length **429**. **Total LEDs** blir **429**.
   - **Rundt Raaco:** *Output 1:* GPIO **16**, start **0**, length **216** (Raaco). *Output 2:* trykk **+**, GPIO **17**, start **216**, length **240** (toppvegg 45 + sidevegg 195). **Total LEDs** blir **456**.
   - Med SK6812 RGBW velger du *SK6812 RGBW*. Skjold Lab sender likevel `RRGGBB`.
5. **Strømgrense** (*Config → LED Preferences*):
   - Huk av for *Enable automatic brightness limiter*, og sett *Maximum current* til **2000 mA**.
   - Sett *LED voltage/current* til *5V WS2812 (55 mA)*.
   - WLED demper da alt som ville trekket mer enn 2 A, også «Test alle».
6. **Ved oppstart** (*Config → LED Preferences*): slå av *Turn LEDs on after power up/reset*, og sett *Default brightness* til for eksempel 128. Da er alt mørkt etter et strømbrudd.
7. **Segmenter:** behold ett segment (id 0) over alle LED-ene (429 eller 456). Skjold Lab regner indeksene fra starten av segmentet, og bruker segment 0 hvis du ikke endrer det. Lager du egne segmenter per skap, setter du `segment` i skapets LED-oppsett og bruker start 0 i hvert skap.
8. **Ta backup:** *Config → Security & Updates → Backup configuration*.
9. **Test:** åpne `http://192.168.1.50/json/info` i nettleseren. Du skal se `"leds":{"count":429,…}` (rundt Raaco: 456).

**Sikkerhet:** WLED har ingen innlogging som standard, så ikke åpne den mot internett (ingen portviderekobling). Sett gjerne en PIN under *Config → Security & Updates*. Skjold Lab trenger bare JSON-API-et.

## Oppsett i Skjold Lab

Lag skapet **«Sorteringsskap (LED)»** med 13 rader × 11 kolonner i Skjold Lab (rundt Raaco: de tre skapene i tabellen under). Gå så til **Skjold Lab → Skap → velg skapet → 💡 Sett opp lys over skuffene**, for hvert skap.

1. **WLED-vert:** `192.168.1.50` (eller `skjoldled.local`). Trykk **Sjekk**. Statusmerket viser navnet, LED-antallet (429, eller 456 rundt Raaco) og versjonen.
2. **Skuffavstand og første skuff:** fyll inn tallene fra tabellen under.
3. **Rader:** trykk **Fyll ut** med *Serpentine (annenhver rad baklengs)*. Kontroller **Første LED**, **Antall** og **Forskyvn. mm** mot tabellen. Rundt Raaco har toppveggen og sideveggen egne startindekser.
4. **Test:** **Test alle** tenner hele skapet i 5 s. **Test** på en rad tenner bare den raden. Lyser feil rad, sjekk retningen og startindeksen.
5. **Kalibrering:** trykk **Kalibrer …**. Én LED lyser. Trykk på skuffen den står over, og bruk **‹ Forrige LED** og **Neste LED ›** for å flytte. Overstyringen lagres per skuff. Det er nyttig i Raaco, der skuffavstanden (60 mm) ikke går opp i LED-avstanden.
6. **Farge, varighet og blink:** standard er blått `#2F6BFF`, 30 s, uten blink og lysstyrke 128.
7. **Valgfritt:** slå på **Lys opp automatisk når jeg åpner et treff**. I Glimt kan du også slå på at «hvor er M3-skruene?» tenner skuffen. Det er av som standard.

| Skap | Rader × kolonner | Skuffavstand (mm) | Midt i første skuff (mm) | Første LED (rad 1) | LED per rad | LED-avstand | Forskyvn. mm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Sorteringsskap (LED)** (hele hylla, standard) | 13 × 11 | 50 | 25 | 0 | 33 | 16,667 | 8,333 |
| *Rundt Raaco:* | | | | | | | |
| **Hovedskap** (Raaco) | 12 × 5 | 60 | 30 | 0 | 18 | 16,667 | 8,333 |
| **LED-vegg topp** | 3 × 5 | 50 | 25 | 216 | 15 | 16,667 | 8,333 |
| **LED-vegg side** | 13 × 5 | 50 | 25 | 261 | 15 | 16,667 | 8,333 |

- Hele hylla med serpentine: rad 1 = 0–32, rad 2 = 33–65 (baklengs), rad 3 = 66–98 og så videre til rad 13 = 396–428.
- Rundt Raaco, med serpentine og 15 LED-er per rad, blir radene i toppveggen 216–230, 231–245 (baklengs) og 246–260. I sideveggen blir de 261–275, 276–290 (baklengs) og så videre.
- **4 LED-er per skuff** (`led_per_skuff = 4`, 66,7 mm): sett *Forskyvn. mm* til **16,667** og *LED per rad* til `kolonner × 4 − 1`, altså 31 i hele hylla, der det da blir 8 kolonner à 66,7 mm (533 mm). Da treffer LED-en midten av skuffen.
- Hvis du endrer målene i OpenSCAD, står de riktige tallene på linjen `SKJOLDLAB-LED: Skjold Lab: …` i konsollen.

## Strømsikkerhet

- **Bare 5 V likestrøm i boksen og i hylla.** 230 V skal bare finnes i en ferdig, CE-merket og lukket strømforsyning. Ikke bygg inn en åpen forsyning med skrueklemmer for 230 V i hylla, med mindre den sitter i en lukket boks med strekkavlastning og jord, montert av noen som kan det.
- **Sikring** (T3,15 A) rett etter inntaket. Bytt aldri til en større sikring for å «få det til å virke». Finn feilen.
- **Ledningstverrsnitt:** minst 0,75 mm² fra forsyningen til boksen, og 0,5 mm² til hver kjede. De tynne hoppene mellom radene tåler mindre enn 1 A, og det holder med strømgrensen i WLED.
- **Strømgrensen i WLED (2 A) skal alltid være på.** Uten den kan «Test alle» på full hvit prøve å trekke 27 A. Forsyningen kutter da ut, eller ledningene blir varme.
- **Riktig polaritet:** sjekk + og − med et multimeter før du kobler til stripa. Feil polaritet ødelegger den første LED-en med en gang.
- **Varme:** WS2812B tåler lite varme. Hold stripene unna lyspærer og varmekilder, og ikke dekk til ventilasjonen i boksen. PETG tåler ca. 70 °C, og det er godt over det stripene gir med denne bruken.
- **Feste:** strekkavlast alle ledninger ved boksen (strips i bøylene) og ved hver modul, så ingen ledning henger i et loddepunkt.
- **Lodding:** isoler alle skjøter med krympestrømpe, og sjekk at det ikke er kortslutning mellom 5 V og GND før du setter på strøm.
- **USB og 5 V samtidig:** ta ut 5 V-pluggen når du flasher ESP32 via USB.

## Feilsøking

| Symptom | Mulig årsak |
| --- | --- |
| Ingenting lyser | Mangler felles GND, feil GPIO i WLED, DIN og DOUT er byttet om, eller 74AHCT125 mangler 5 V. |
| Den første LED-en lyser feil farge eller flimrer | Seriemotstanden mangler, datalinja er for lang (over 1 m før første LED), eller nivåskifteren er hoppet over. |
| Alt etter én rad er mørkt | Hoppet mellom radene er brutt, eller DIN og DOUT er byttet om i den raden. |
| Feil skuff lyser | Feil startindeks eller retning i raden. Kalibrer med **Kalibrer …**, eller sjekk *Forskyvn. mm*. |
| Skjold Lab sier at verten må være i hjemmenettet | Bruk privat IP-adresse (192.168.x.x/10.x.x.x), et `.local`/`.lan`-navn eller et navn uten punktum. Offentlige adresser blir avvist med vilje. |
| Lyset slukker ikke etter et søk | Trykk **Slå av**. Skjold Lab legger tilbake forrige tilstand. Har noen endret WLED i mellomtiden, kan du slå av i WLED-appen. |
