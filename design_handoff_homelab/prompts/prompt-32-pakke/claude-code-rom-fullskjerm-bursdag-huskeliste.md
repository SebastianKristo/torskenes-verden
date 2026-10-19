# Rom 1a i fullskjerm · Bursdager uten widgets på web · Huskeliste med arkiv

## Rom (web): valgt 1a Kontrollrom, i fullskjerm
Fasit: `Homelab Papir Web.dc.html` → `isRom` laster `Rom` `variant="a"`. Variant 1b brukes ikke.
- Åpner i **fullskjerm** (`position: fixed; inset: 0`), uten toppmeny og hero, som Vær, Kalender og Chat.
- Fast topplinje som blir stående når man scroller: «Rom» (Newsreader 30) til venstre og **✕** (rund 42 px, `ink`) til høyre. ✕ går til Dashboard.
- Innholdet er maks 1600 px bredt og midtstilt. Se `claude-code-rom-ny.md` for innholdet.

## Bursdager (web): ingen «Widgets på telefonen»
Fasit: `Bursdager.dc.html` → `showWg = variant !== 'web' && !calOnly`.
- Seksjonen «WIDGETS PÅ TELEFONEN» (iOS liten/medium, Android, Samsung) vises bare i mobilappen, ikke på web.

## Huskeliste (web og mobil): Arkivert
Fasit: `Huskeliste.dc.html` (også lagt inn som fanen **Huskeliste** på web).
- Ny chip **Arkivert · N** sist i listevelgeren (etter Alle, Hjem, Handel …).
- **FERDIG**-gruppen har knappen **Arkiver alle**. Hver fullført oppgave har et arkivikon (boks) ved siden av ×.
- **Automatisk:** fullførte oppgaver arkiveres etter 7 dager (`doneAt`).
- I **Arkivert**: liste «ARKIVERT · N», nyeste først. Hver rad har **↺ Gjenopprett** (tilbake som åpen oppgave i sin liste) og × (slett for godt). Knappen **Tøm arkivet** står øverst. Feltet «Ny oppgave» skjules her.
- Tom tilstand: «Ingenting i arkivet. Fullførte oppgaver arkiveres automatisk etter 7 dager.»
- Arkiverte oppgaver telles ikke i lister, widgets eller på Hjem.
- Home Assistant: arkivering = fjern fra HA-listen (`todo.remove_item`). Gjenoppretting legger den inn igjen.
- Data: `{…, done, doneAt, arch}`. Synkes mellom web og mobil.
