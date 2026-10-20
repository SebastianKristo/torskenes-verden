# FEIL: Finn i Finans web – bildene kuttes, og samme bilde av en dame er med i alle annonser

Vedlegg: `uploads/Screenshot 2026-10-20 at 18.47.34.png` (bildet er kuttet: iPhone-bildet vises bare øverst, og under er det tomt), `uploads/Screenshot 2026-10-20 at 18.48.09.png` (bilde 2/2 er et reklame-/stockbilde av en dame, som dukker opp i alle lagrede annonser).

## 1. Bildet skal vises i full høyde
I dag har galleriet fast høyde (~580 px) med `object-fit: cover`, mens detaljpanelet er mye høyere. Bildet kuttes i toppen og bunnen, og under galleriet er det et stort tomt felt.
- Galleriet fyller **hele høyden** av venstre kolonne (`align-self: stretch; height: 100%`, `min-height: 420px`), eller er `position: sticky; top: 0; height: 100vh` når panelet scroller.
- Bildet: `object-fit: contain; width: 100%; height: 100%`. Hele bildet skal alltid være synlig, også høye mobilbilder.
- Bakgrunn bak bildet: samme bilde uskarpt (`filter: blur(28px) brightness(.85); transform: scale(1.15)`, `object-fit: cover`), så det ikke blir svarte eller tomme kanter. Alternativ: `--card2`.
- Pilene ‹ › blir liggende midt på bildet. Telleren («1 / 2») står nede til høyre. Det er også miniatyrer i en rad under bildet når det er mer enn 1 bilde (64 × 64, radius 10, valgt har 2 px ring).
- Klikk på bildet → fullskjerm (lightbox) med ← → og Esc.
- Smal skjerm (< 900 px): galleriet øverst, `aspect-ratio: 4/3`, fortsatt `contain`.

## 2. Bildet av damen er ikke fra annonsen
Det kommer fra Finn-siden, men ikke fra annonsens galleri. Det er sannsynligvis et annonsebanner, en «anbefalt»-blokk eller `og:image`/fallback-bilde som skraperen plukker opp med en for generell selektor (f.eks. alle `<img>` på `images.finncdn.no`). Derfor havner det i alle annonser.
- **Hent bilder bare fra annonsedataene**, i rekkefølge:
  1. `script#__NEXT_DATA__` / `window.__remixContext` → annonsens `images[]` (`uri`, `width`, `height`, `description`).
  2. JSON-LD `@type: Product` → `image[]`.
  3. Galleriet i markupen (`[data-testid="image-gallery"] img`, `section[aria-label*="bilde"] img`). Ingen generell `img`-selektor.
- **Filter:**
  - Bare URL-er på `images.finncdn.no/dynamic/…` som inneholder annonsens `finnkode` eller som står i annonsens `images[]`.
  - Avvis `og:image` hvis det ikke også er i `images[]`.
  - Avvis bilder fra reklame (`/ads/`, `adnami`, `doubleclick`, `googlesyndication`, `cdn.schibsted`, `banner`, `display`) og bilder fra «Lignende annonser» / «Anbefalt for deg».
  - **Avvis bilder som går igjen på tvers av annonser:** lagre `sha1` (eller perseptuell hash) per bilde. Finnes samme hash i ≥ 2 annonser med ulik finnkode, merkes det `shared: true` og vises ikke.
- **Rydd opp i det som er lagret:** migrering som går gjennom alle lagrede annonser, fjerner bilder med `shared: true` / reklame-URL, og oppdaterer `images[]`. Gi «Hent annonsen på nytt» samme filter.
- Bruk største størrelse: `…/dynamic/1280w/…` (eller `default/`), ikke miniatyr (`/240w/`).

## 3. Logg
Logg `finnkode, kilde (next_data|jsonld|dom), antall bilder, forkastet (grunn)` ved hver henting.

## Test
- iPhone-annonsen: 1/1 eller 2/2 riktige bilder av telefonen og eska, hele bildet synlig og ingen tom flate under.
- Damen vises ikke i noen annonse etter migreringen.
- Annonse med 12 bilder: alle 12, riktig rekkefølge, miniatyrer under.
- Høyt bilde (stående mobilfoto) og bredt bilde vises begge uten kutt.
