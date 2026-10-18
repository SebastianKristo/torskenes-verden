# Til Claude Code: Boliger, nøyaktig likt på iOS og Android (Standard og Finans + Boliger)

Fasit: `design/Boliger.dc.html` (`variant="mobile"`, `theme="papir"`, `hide-title`), slik den vises i `design/Mobil Papir App.dc.html` → side `boliger`. iOS og Android skal være **piksel-like**, i begge profiler. Bruk tokens, fonter og radier fra `claude-code-familie-design.md`. Ikke bruk Material-kort, `ListItem`, `TabRow` eller systemets segmentkontroll.

## Felles for begge profiler
1. **Toppbilde:** bakgrunnen til valgt bolig. Strømstad-bildet, eget bilde, eller vanlig toppbilde når boligen har «Farge». Det skifter med en gang du bytter bolig (krysstoning 200 ms) og har samme mørke gradient som andre toppbilder.
   - Undertittel: boligenes navn i kursiv (*«Strømstad · Leiligheten»*). Tittel **Boliger** (Newsreader 500, 36).
   - Profilbildet står **alltid øverst til høyre**.
2. **Bolig-piller** (overlapper toppbildet, vannrett scroll):
   - Høyde 52, radius 26. Valgt pille er `ink` med lys tekst, uvalgt er `card` med `line`-kant.
   - Avatar 36 i boligens farge. Navnet i Manrope 700 14, «13 890 kr i okt» i 11.5.
   - Siste pille: «+ Ny bolig» med stiplet kant.
   - **Hold inne 0,5 s** → «Rediger bolig» (bunnark): forhåndsvisning, Navn, Adresse, Budsjett, Farge (7 + fri), Bakgrunn (Farge / Strømstad / eget / Last opp), Lagre, Slett (to trykk). Vanlig trykk bytter bolig.
3. **Fanevelger** Oversikt · Utgifter · N · Tilgang: kortfarget pille, valgt er `ink`-pille.
4. **Bolig-kort:**
   - Boligens farge som gradient (`150deg, farge → 70 % farge + svart`). Ikke bilde i appen.
   - Avatar og navn i Newsreader 30, adresse, og «Oktober»-chip.
   - «Brukt denne måneden», stort beløp i Newsreader 52.
   - Endringschip, budsjettlinje, og «av 8 000 kr i budsjett» / «5 890 kr over».
5. **Handlinger** i 4 like fliser: Skann (rød sirkel), Last opp, Fra e-post, Ny utgift.
6. **TIL GJENNOMGANG · N** med «Godkjenn alle». Kortet har rød kant, kvitteringsbilde, tittel, «AI foreslår …», beløp, kategori-chips, Detaljer og Godkjenn.
7. Utgifter- og Tilgang-fanene: som i designet.

## Forskjeller mellom profilene
| | Standard | Finans + Boliger |
|---|---|---|
| Fanelinje | Finans-faner (Oversikt · Liste · Finn · Søk · Mer) | **Boliger** · Søk · Liste · Oversikt · Kvitteringer · Mer |
| Tilbake øverst til venstre | «‹ Mer» / «‹ Oversikt» (der du kom fra) | **ingen**, Boliger er rot |
| Domene-pille i toppbildet | nei | **ja**: globus, «48 597», «besøk i dag · 5 domener», statusprikk. Trykk åpner Domener, og «‹ Boliger» går tilbake |
| Appen starter i | Hjem | Boliger |
| Hjem | fane | rad i Mer og flis i Finans → Mer |

## Fanelinje-ikoner
Som i `claude-code-familie-design.md` → «Fanelinje – ikon ved siden av tekst»: 18 pt boks og 16 pt glyf, sentrert og 1,5 pt ned. Bare valgt fane viser ikon. Android bruker egen Row med `includeFontPadding = false`.

## Test
Ta skjermbilder av Boliger på iPhone 15 og Pixel 8 / Galaxy S24, i **begge profiler**, lyst og mørkt tema, med Hytta og Strømstad valgt. Sjekk også at «Rediger bolig» åpner seg. Legg bildene ved siden av designet i 390 bredde. Alt skal være likt, utenom forskjellene i tabellen.
