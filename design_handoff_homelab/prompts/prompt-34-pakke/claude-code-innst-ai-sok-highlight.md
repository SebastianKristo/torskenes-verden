# Innstillinger: AI-søk tar deg til riktig sted og markerer knappen

Vedlegg: `uploads/Screenshot 2026-10-19 at 20.23.30.png` (System-siden med «Oppdater nå»).
Fasit: `Innstillinger Web.dc.html` → `IDX` (nå med mål-id), `match()` (poengsum), `goK(k, h)`, `hl`, `data-hl` på målene, keyframes `hlRing` / `hlTip`.

## Oppførsel
1. Spør i søkefeltet («hvordan oppdaterer jeg», «hvor ser jeg etter oppdatering», «krev passord for oppdatering»), eller trykk ✦ AI.
2. Glimt svarer kort i søkemenyen, f.eks. «Gå til System og trykk «Oppdater nå». Den tar backup først og bruker ca. 2 minutter. Jeg tar deg dit og viser knappen …».
3. **Etter ca. 1,6 s går den automatisk** til siden. Knappen «Vis meg nå ›» gjør det med en gang.
4. Siden scrolles slik at målet står midt i innholdsfeltet (`scrollTo smooth`). Målet får en **rød ring som pulserer** (`0 0 0 3px #b23a2a` + utvidende glød, 1,4 s × 4). For «Oppdater nå» vises også en mørk boble over: «✦ Trykk her for å oppdatere». Markeringen forsvinner etter 6 s eller ved første trykk. Lett haptikk.
5. Vanlig søk (ett ord, Enter) går også rett til målet med markering.

## Indeks
Hver oppføring: `[nøkkelord, side, tittel, sti, mål-id]`. Poengsum: helt ord = 3, prefiks = 2, treff i tittel = 1. Beste treff først.
- `upd`: «Oppdater nå» (oppdater, oppdatere, update, nordlys)
- `chk`: «Se etter oppdatering» (oppdatering, versjon)
- `pw`: «Krev passord for å oppdatere» (krev, passord + oppdater)

**Legg til mål-id for alle innstillinger** som har en konkret kontroll, f.eks.:
- `bg`: Utseende → Bakgrunn
- `theme`: Tema
- `push`: Varsler → Push
- `quiet`: Stille timer
- `2fa`: Innlogging → 2FA
- `bk-auto`: Backup → Automatisk backup
- `bk-now`: Ta backup nå
- `cf-token`: Domener → API-token
- `ai-mod`: AI → Modeller
- `ai-key-gemini`: AI → API og nøkler → Gemini
- `invite`: Brukere → Inviter
- `haptic`: App → Haptikk

Ved AI-spørsmål som ikke treffer indeksen: send spørsmålet + indeksen til Glimt og la den returnere `{side, mål, svar}` (JSON). Valider mot indeksen før navigering.

## Mobil
Samme mekanisme i Innstillinger på mobil (`Mobil Papir App` → `setSub`), med `data-hl` på radene. Scroll med `scrollTo` (ikke `scrollIntoView`), og samme ring og boble.
