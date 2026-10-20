# Bibel-siden: rekke-kortet skal gå litt opp i bakgrunnen

Ønske 2026-10-20: «burde gå litt opp i bakgrunnen.» (skjermbilde: `vedlegg/bibel-rekke-under-hero.png`)
Fasit: `Mobil Papir App.dc.html` → Bibel (`isBibel`-wrapperen).

Dette erstatter punktet «innholdet starter under hero» i `claude-code-bibel-topp-mellomrom.md` (prompt 39). Mellomrom mellom kortene (14 pt) og bunn-padding gjelder fortsatt.

## Slik skal det være
- Det første kortet («1 dag på rad») **overlapper hero med ca. 36 pt**, så toppen av kortet ligger oppe i skybildet, litt mer enn søkefeltet på de andre sidene (23 pt).
- Kortet ligger over hero (`zIndex` over bildet), med skygge `0 14px 30px -12px rgba(0,0,0,.35)` så det løfter seg fra bildet.
- **Alle fire hjørner er runde** (radius 24). Ikke klipp kortet mot hero.
- **Fotokreditten** («Skyet · 6° · Free Nature Stock …») flyttes opp så den står **over** kortet: `bottom = overlapp + 10 pt`, høyrejustert, én linje med «…». Den skal aldri ligge bak eller inntil kortet.
- Tittel og undertittel i hero flyttes opp tilsvarende, så det er minst 12 pt luft mellom «Bibel» og kortets topp.
- Når man scroller, glir kortet opp over hero som på de andre sidene (ingen hopp).
