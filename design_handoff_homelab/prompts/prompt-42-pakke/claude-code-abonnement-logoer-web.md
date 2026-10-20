# FEIL: Abonnement-logoer vises feil på web (Starlink m.fl.)

Vedlegg: `uploads/Screenshot 2026-10-20 at 18.51.29.png` (Finans web → Abonnementer). Starlink vises riktig på mobil, men på web er det bare en hvit sirkel med en kuttet grå bit. Tv2 og Claude er firkanter som ikke fyller sirkelen likt, og logoene har ulik størrelse.

## Årsak (sannsynlig)
1. **Hvit logo på hvit flate:** Starlink-logoen er hvit/transparent (laget for mørk bakgrunn). Mobilappen legger den på en mørk eller grå brikke, men web bruker hvit `#fff`, så bare skyggen/kanten synes.
2. **`object-fit: cover` + `border-radius: 50%`** på selve `<img>`. Logoen zoomes inn og kuttes i sirkelen (derfor bare en bit av «swooshen»).
3. Web og mobil bruker **ulike kilder/størrelser**. Web viser favicon 32 px (skalert opp), og mobil bruker logobibliotekets 128 px-fil.

## Fiks
- **Én felles logo-komponent** for web og mobil (`<SubLogo>` / `LogoBadge`), brukt i Abonnementer, Finans, transaksjoner, Kalender (Abonnementer-kalenderen) og widgets.
- **Brikke:** 44 × 44, radius 12 (squircle, ikke sirkel). Samme form overalt.
- **Bildet:** `object-fit: contain`, `width/height: 100%`, med innvendig luft **6 px**. Aldri `cover`, og aldri `border-radius` på selve bildet. `overflow: hidden` på brikken.
- **Full-bleed-logoer** (app-ikon med egen bakgrunn, f.eks. Tv2, Claude, YouTube): registeret har `fill: true` → bildet fyller brikken uten luft, med radius fra brikken.
- **Bakgrunn etter logo:**
  - Registeret har `bg` per logo (`"starlink": {"bg":"#000"}`). Settes automatisk ved import: regn ut snittlyshet for ikke-transparente piksler. Er logoen lys (L > 0,8) og transparent → mørk brikke `#1b1a17`. Er den mørk og transparent → lys brikke `#fffdf8`. Har den egen bakgrunn → `fill: true`.
  - I mørkt tema snus regelen tilsvarende (mørke logoer får lys brikke).
- **Samme kilde som mobil:** web skal hente `GET /api/logos/{id}?size=128` (logobiblioteket), ikke favicon direkte. `srcset` med 64/128/256 for retina.
- 1 px kant `rgba(27,26,23,.08)` rundt brikken, så hvite logoer på hvit side har en tydelig form.
- Fallback: forbokstav i brikkefarge (som i dag) mens bildet lastes og ved feil, ikke tom sirkel.

## Rydd i registeret
- Kjør en sjekk over alle logoer i `registry.json`: merk `bg`/`fill` automatisk, og list dem som ble endret i `logo-audit.txt`.
- Kjente: Starlink (`bg:#000`), Apple (`bg:#000` eller mørk), Tv2 (`fill`), Claude/Anthropic (`fill`), YouTube (`fill` eller lys bg), Squarespace (lys bg), ice (lys bg), Google One (lys bg).

## Test
- Starlink på web ser lik ut som på mobil: hvit logo på mørk brikke, hel og ikke kuttet.
- Alle radene i lista har like store brikker, logoene er sentrert og ingen er kuttet.
- Mørkt tema: Starlink og Apple er fortsatt lesbare.
