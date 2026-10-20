# Innstillinger → Domener: feil farge/ikon ved Cloudflare og Search Console

Ønske 2026-10-20: «litt rar farge feil ved seach console og cloudflare» (vedlegg: `vedlegg/domener-ikon-feil.png`).
Fasit: `Innstillinger Web.dc.html` → Domener → «DINE DOMENER».

## Feil
Ikonet foran hvert domene vises som en **smal, mørk stripe** (ca. 14 × 36 px, mørk blå bakgrunn med blå bokstav «A»/«K»). Ikonet krymper fordi det ikke har fast bredde i flex-raden, og fargen kommer fra en mørk tema-variabel som ikke finnes i Papir-temaet.

## Riktig
- Fast størrelse **36 × 36**, radius 10, `flex: none` / `flex-shrink: 0` (iOS: `.frame(width:36,height:36)`).
- Ikon etter kilde:
  - **Cloudflare:** Cloudflare-skyen (oransje `#F6821F` + `#FBAD41`) på lys oransje `#FDEBDC`.
  - **Google Search Console:** Google-«G» i farger på hvit bakgrunn med 1 px kant `#E3DCCD`.
  - **Begge:** Cloudflare-ikonet, og «· Search Console» i undertittelen.
  - **Annet / ukjent:** forbokstav i `#1B1A17` på `#E9E2D3`.
- Har domenet et favicon (hentes via `/favicon.ico` eller Google s2), kan det vises i stedet, men alltid i 36 × 36-ruta med lys bakgrunn.
- I Search Console-seksjonen: kontoraden bruker Google-«G», eiendomsradene bruker samme 36 × 36-rute som over (favicon eller forbokstav), ikke rosa info-/konvoluttikoner.
- Ingen hardkodede mørke farger i Papir-temaet. Bruk temaets tokens.
