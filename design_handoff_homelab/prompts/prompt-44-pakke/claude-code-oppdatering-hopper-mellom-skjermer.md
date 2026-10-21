# Oppdatering (WEB): skjermen hopper mellom oppstartsskjermen og Homelab

Ønske 2026-10-21: «når oppdater hakker skjermen mellom de to sidene her. den ene skal jo bare vises under oppdateringen ikke før oppdateringen er ferdig»
Vedlegg: `uploads/Screenshot 2026-10-21 at 13.49.34.png` (oppstartsskjerm «NordlysOS 4.37 · KLAR · Laster inn siden …»), `uploads/Screenshot 2026-10-21 at 13.49.46.png` (Dashboard med kortet «Oppdaterer Nordlys OS · Installerer på hjemmeserveren … 55 %»).

## Feilen
Mens oppdateringen lastes ned og installeres (0–99 %), bytter nettleseren frem og tilbake mellom Dashboard og oppstartsskjermen. Sannsynlig årsak: klienten viser oppstartsskjermen så fort ett helsekall feiler (502/timeout mens bildet hentes, eller mens en container startes på nytt), og går tilbake så fort neste kall svarer. Oppstartsskjermen sier også «KLAR 100 %» mens oppdateringen fortsatt står på 55 %.

## Riktig oppførsel (én vei, ingen hopping)
1. **Laster ned / installerer (0–99 %)**: brukeren blir på siden sin. Bare kortet «Oppdaterer Nordlys OS» (og pillen i mobilappen) viser fremdrift. **Aldri** oppstartsskjermen i denne fasen.
2. **Starter på nytt**: først når serveren selv sier `phase: "restarting"` vises oppstartsskjermen. Den står til den nye versjonen svarer.
3. **Klar**: oppstartsskjermen viser stegene med ✓, «NordlysOS 4.38 · Klar», og gjør **én** ny innlasting av siden. Så vises Dashboard med toast «Oppdatert til 4.38 · Se hva som er nytt».

## Regler i klienten
- Tilstand kommer fra `GET /api/update/status` → `{phase: idle|downloading|installing|restarting|done|failed, progress, from, to}` (SSE/WebSocket, med polling som reserve). Ikke gjett fasen ut fra om helsekallet feiler.
- **Hysterese:** vis oppstartsskjermen uten `restarting` bare hvis helsekallet feiler **3 ganger på rad over minst 6 s**. Én feil gjør ingenting.
- Når oppstartsskjermen først vises, **går den ikke tilbake**. Den forlates bare når `/api/ready` svarer `ok` to ganger på rad **og** `version === to`. Da gjøres én `location.reload()` med `?v=<to>`, ikke flere.
- «KLAR / 100 %» vises bare når alle stegene er ferdige for den nye versjonen. Mens den venter står det «Starter på nytt …».
- Flere faner: koordiner med `BroadcastChannel('nordlys-update')`, så bare én fane laster på nytt først.
- Mobilappen: samme faser. Oppstartsskjermen vises bare ved `restarting`, ellers pille/kort med fremdrift.

## Server
- Oppdateringen kjøres av en egen liten **updater**-container (eller sidecar) som eier statusen og svarer på `/api/update/status` mens hovedcontaineren byttes. Oppstartsskjermen serveres av den, ikke av appen som startes på nytt.
- Hent det nye bildet og kjør migrasjoner **før** den gamle containeren stoppes. Bytt raskt (blue/green bak Caddy/Traefik) så avbruddet blir så kort som mulig.
- Logg faseskifter med tid (`update.phase from=… to=… ms=…`) i Docker-loggen.

## Gjelder web-versjonen (presisert 2026-10-21)
Brukeren: «denne feilen er på web versjonen». Feilen er i nettleser-klienten (Homelab web), ikke i mobilappen.
- Fasit for de to skjermene: `Nordlys Starter.dc.html` (oppstartsskjermen, se `claude-code-nordlys-oppstartsside.md`) og kortet «Oppdaterer Nordlys OS» på Dashboard i `Homelab Papir Web.dc.html`.
- Finn koden i web-klienten som bytter til oppstartsskjermen (typisk en `fetch('/api/health')`-løkke, en service worker som svarer med `starter.html` ved nettverksfeil, eller en global feilhåndterer ved 502/503). Den skal erstattes av tilstandsmaskinen over: `idle → downloading → installing → restarting → done`.
- **Service worker:** hvis den viser oppstartsskjermen som fallback ved feil, må den bare gjøre det når `/api/update/status` sist sa `restarting` (lagret i `caches`/IndexedDB). Ikke ved hver feilet forespørsel.
- **Caddy/Traefik:** ikke la proxyen svare med oppstartssiden for vanlige 502 under installasjon. Bare når updater-tjenesten har satt «restarting»-flagget.
- Test: start en oppdatering i Chrome og Safari med to faner åpne. Ingen fane skal vise oppstartsskjermen før fremdriften er ferdig, og hver fane skal bare laste på nytt én gang.
