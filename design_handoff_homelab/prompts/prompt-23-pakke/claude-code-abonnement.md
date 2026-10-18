# Til Claude Code: Subscription OS (Abonnementer), nøyaktig kopi på iOS og Android

Fasit: `design/Mobil Papir App.dc.html` → side `abo`, som importerer `design/Subscription OS.dc.html` med `variant="mobile"`, `theme="papir"`/`"papirDark"`, `hide-title`, `nav-external`. iOS og Android skal være **piksel-like**. Bygg egne komponenter, ikke systemlister eller Material-kort.

## Tokens (`MT.papir` / `MT.papirDark` i Subscription OS.dc.html)
| Token | Lys | Mørk |
|---|---|---|
| card | `#ffffff` | `#211f19` |
| card2 | `#f6f2ea` | `#1a1814` |
| fg | `#1b1a17` | `#ece7dc` |
| mut | `#6b665c` | `#a39d90` |
| bd | `#ddd6c7` | `#3a372e` |
| chip | `#ece6da` | `#2a2821` |
| neg | `#b23a2a` | `#f08a76` |
| on / onFg (valgt) | `#1b1a17` / `#f3efe6` | `#ece7dc` / `#14130f` |

Fonter som resten av appen: Newsreader (sidetittel i toppbildet), Manrope (UI) og IBM Plex Mono (beløp). Radius 24 på kort og 999 på piller.

## Struktur
1. **Topp:** felles toppbilde med «‹ Mer», profilbilde, undertittel *Subscription OS* og tittel **Abonnementer**. Det skal ikke være noen ekstra tittel eller liten «Abonnementer»-tekst under toppbildet.
2. **Første kort overlapper toppbildet** med cirka 23 pt, som på Boliger, Familie og Aksjer.
3. **Fanelinje nederst:** Hjem ⌂ · Innsikt ◔ · Historikk ↺ (egen for Subscription OS). Skann-knappen (FAB) er byttet med **+ Legg til abonnement**.
4. **Hjem:**
   - **✦ AI-SPARING**-kort: mørk radial gradient `radial-gradient(120% 120% at 100% 0%, #5A2A14 0%, #24130B 45%, #141418 80%)`. Chip «✦ AI-SPARING» i `#FFB08A` på 8 % hvit. Stor tekst «Spar 687 kr / i måneden» (34, 700, hvit), undertekst «AI fant 3 abonnementer å se på, og én prisøkning.» og knappen «Gå gjennom» (lys pille).
   - **Neste 7 dager**: beløp i Plex Mono (stort), «4 trekk», og søylediagram per dag i oransje `#FF7A3D`.
   - **Abonnementssjekk** («Gå gjennom før fornyelse», «N trenger en titt · spar opptil …»).
   - Liste over abonnementer: logo (logobiblioteket), navn, plan, neste trekk og pris høyrejustert.
5. **Innsikt:** «Abonnementer per måned» (graf), «Abonnementshelse» (poeng /100), «Per kategori», «Smart sparing» og «AI-agent».
6. **Historikk:** «Denne måneden» og tidligere trekk med status.
7. **Rediger abonnement** (trykk på rad): logo med «↑ Last opp» og «Fjern», Navn, Pris (kr), Plan, Kategori, Hvor ofte, Faktureringsdato, «Lagre» og «Slett».
8. **Legg til:** ark med tre valg (skann, fra e-post, manuelt), og så samme felter.

## «Endre abonnement»-arket (Papir)
- Bakgrunn `#f3efe6` (mørk `#14130f`), felter `card`, tekst `fg` og kanter `bd`. Font Manrope.
- Valgt chip (Månedlig, Aktiv …) er **fylt `on` (`#1b1a17`) med lys tekst `onFg`**. Den skal ikke være hvit pille på grå bakgrunn.
- «Last opp logo» er kortfarget pille med kant. «✦ Finn logo med AI» har `neg`-tekst (`#b23a2a`) på kortfarge, ikke blek rosa.
- **«Lagre»** er fylt `on` med `onFg`-tekst og full opasitet. Den skal aldri se deaktivert ut når skjemaet er gyldig. Er skjemaet ugyldig: 40 % opasitet og en kort forklaring under.
- **«Slett»** står i `neg` (`#b23a2a`), ikke lys laks.
- Måned er aktiv og valgbar for årlige og 2-årige abonnementer. For månedlige vises den dempet (`mut`) med teksten «hver måned».
- «Lukk» øverst til høyre i `neg`.

## Rekkefølge
- Hold inne på et kort på Hjem (0,45 s) → redigering. Dra for å flytte, og bruk «Tilbakestill» eller «Ferdig». Rekkefølgen lagres per bruker. Et langt trykk skal ikke åpne abonnementet.

## Test
Lys og mørk Papir på iPhone 15 og Pixel 8. Legg skjermbilder av Hjem, Innsikt, Historikk og Rediger ved siden av designet i 390 px. Kort, farger, fonter, radier og overlapp mot toppbildet skal være like. Det skal ikke være noen dobbel tittel.
