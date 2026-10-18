# Til Claude Code: Internt logobibliotek for norske butikker og tjenester

Denne prompten utvider `claude-code-logoer.md`. Før logo-tjenesten tas i bruk skal du bygge et **internt, ferdig nedlastet logobibliotek**. Det skal dekke butikker, kjeder og tjenester som ofte står på kvitteringer og banktransaksjoner i Norge.

## Oppgave
1. Lag `backend/logos/registry.json`. Hver oppføring har:
```json
{ "id": "biltema", "navn": "Biltema", "domene": "biltema.no",
  "alias": ["biltema norge", "biltema as", "biltema 1234"],
  "kategori": "Bil og fritid", "orgnr": "", "farge": "#003C8F",
  "fil": "biltema.png", "kilde": "favicon", "hentet": "2026-10-18" }
```
2. Skriv `backend/logos/fetch_logos.py`. Det leser registeret, laster ned logoene og lagrer dem i `backend/logos/files/<id>.png` (128×128, PNG med gjennomsiktig bakgrunn hvis mulig). Kilder i prioritert rekkefølge:
   1. `https://<domene>/apple-touch-icon.png` (ofte 180 px)
   2. Største `<link rel="icon">` eller `manifest.json`-ikon fra forsiden
   3. `https://www.google.com/s2/favicons?sz=128&domain=<domene>`
   4. `https://icons.duckduckgo.com/ip3/<domene>.ico`

   Avvis ikoner under 32 px og generiske «globus»-ikoner (sammenlign hash mot kjent standardikon). Logg det som mangler i `missing.txt`.
3. **Ta med logoene i appen og i backend-imaget**, så de fungerer offline og ingen eksterne oppslag gjøres ved visning. Nettoppslag brukes bare som reserve for ukjente navn (se `claude-code-logoer.md` steg 4–7). Nye treff lagres i `/data/logos/` og legges til registeret.
4. **Matching mot transaksjonstekst.** Banktekster ser ut som `REMA 1000 GRUNERLOKKA`, `VIPPS*KIWI 123`, `KLARNA*KOMPLETT.NO`, `SQ *KAFFEBAR`, `IZ *RUTER`, `PAYPAL *STEAM`. Fjern derfor:
   - Prefikser: `VIPPS*`, `KLARNA*`, `PAYPAL *`, `SQ *`, `IZ *`, `SUMUP *`, `NETS*`, `ZETTLE_*`, `GOOGLE *`, `APPLE.COM/BILL`
   - Butikknummer, postnummer, stedsnavn, datoer og kortnummer (`*1234`)
   - Æ/ø/å-varianter: `ELKJOP`/`ELKJØP`, `GRUNERLOKKA`/`GRÜNERLØKKA`

   Match deretter mot `alias`: først eksakt, så prefiks, så Levenshtein ≤ 2.
5. **Kjeder med flere merkevarer** får egne logoer (Coop Extra, Coop Obs, Coop Prix og Coop Mega skal ikke dele én logo).
6. **Lisens:** logoene er varemerker. De brukes bare som identifikasjon i privat app og skal ikke endres. Ikke last ned fra Getty eller andre betalingsbanker.

## Innhold i registeret (minst disse, gjerne flere)

**Dagligvare:** Rema 1000, Kiwi, Meny, Spar, Joker, Coop Extra, Coop Obs, Coop Prix, Coop Mega, Coop Marked, Bunnpris, Oda, Holdbart, Europris, Normal, Nille, Lidl (gammel), Matkroken

**Elektronikk:** Komplett, Elkjøp, Power, NetOnNet, Proshop, Kjell & Company, Dustin, Multicom, Apple

**Bygg, bil og hjem:** Biltema, Clas Ohlson, Jula, Obs Bygg, Byggmax, Maxbo, Montér, Coop Byggmix, Mekonomen, Biltema, Thansen, Bauhaus, Jernia, IKEA, Jysk, Bohus, Skeidar, Kid Interiør, Princess, Søstrene Grene, Rusta, Plantasjen, Hageland

**Sport og fritid:** XXL, Sport 1, Intersport, G-Sport, Anton Sport, Fjellsport, Gresvig, Bergans, Norrøna

**Klær og sko:** H&M, Cubus, Dressmann, Carlings, Bik Bok, Lindex, KappAhl, Zalando, Boozt, Vivikes, Skoringen, Eurosko, Din Sko, Nordic Feet, Ellos

**Apotek og helse:** Vitusapotek, Apotek 1, Boots, Farmasiet, Specsavers, Synsam, Interoptik, Fürst, Unilabs, Helsenorge

**Drivstoff og lading:** Circle K, Esso, Uno-X, Shell, YX, St1, Tesla Supercharger, Ionity, Recharge, Mer, Fortum Charge & Drive, Kople, Easee

**Transport og parkering:** Ruter, Vy, Flytoget, Entur, AtB, Skyss, Kolumbus, Norwegian, SAS, Widerøe, Bolt, Uber, Voi, Ryde, Tier, EasyPark, Apcoa, Aimo Park, OnePark, Autopass, Fjellinjen, Bilkollektivet, Getaround

**Mat ute og levering:** Foodora, Wolt, Just Eat, McDonald's, Burger King, Max Burgers, Peppes Pizza, Dolly Dimple's, Egon, Starbucks, Espresso House, Kaffebrenneriet, Deli de Luca, 7-Eleven, Narvesen, Mix, Big Bite

**Netthandel og betaling:** Finn, Tise, Temu, Shein, AliExpress, Amazon, eBay, Wish, Vipps, MobilePay, Klarna, PayPal, Walley, Resurs, Qliro

**Bank og forsikring:** DNB, Nordea, SpareBank 1, Sbanken, Handelsbanken, Danske Bank, Storebrand, Bulder, Bank Norwegian, Komplett Bank, Gjensidige, If, Tryg, Fremtind, Frende, KLP

**Telekom, strøm og bolig:** Telenor, Telia, Ice, Talkmore, OneCall, Chilimobil, Altibox, Get/Telia, Fjordkraft, Tibber, Hafslund, Elvia, Fortum, Norgesenergi, Ishavskraft, Sector Alarm, Verisure, OBOS, USBL

**Strømming og abonnement:** Netflix, Spotify, Viaplay, TV 2 Play, NRK, Max, Disney+, Apple TV+, Prime Video, YouTube, Storytel, BookBeat, Fabel, Aftenposten, VG+, DN, Google One, iCloud, Microsoft 365, Adobe, Dropbox, ChatGPT/OpenAI, Claude, GitHub, Cloudflare, Squarespace, Proton

**Offentlig og frakt:** Skatteetaten, NAV, Statens vegvesen, Lånekassen, Posten, Bring, PostNord, DHL, Helthjem, Instabox, Budbee, UPS, FedEx

**Bøker, gaver og annet:** Norli, Ark, Adlibris, Bokklubben, Tanum, Vinmonopolet, Lekia, BR-Leker, Extra Leker, Cutters, Bislett Hår, SATS, Evo, Elixia, 3T, Ticketmaster, Billettservice, Hoopla, Oslo Kino, Nordisk Film Kino

## Akseptansetest
Kjør `fetch_logos.py`. Minst 95 % av oppføringene skal få logo. Følgende transaksjonstekster skal gi riktig logo:
`REMA 1000 GRUNERLOKKA` · `VIPPS*KIWI 123` · `KLARNA*KOMPLETT.NO` · `BILTEMA ALNABRU` · `CLAS OHLSON OSLO CITY` · `IZ *RUTER` · `FINN.NO AS` · `CIRCLE K BISLETT` · `ELKJOP STORO` · `NETFLIX.COM` · `APPLE.COM/BILL` (→ Apple)

`KIOSK HANSEN` skal gi bokstav-reserve.
