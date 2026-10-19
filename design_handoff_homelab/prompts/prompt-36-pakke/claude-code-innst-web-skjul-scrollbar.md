# Web Innstillinger: ingen synlig scrollbar

Fasit: `Innstillinger Web.dc.html` (rot-elementet har klassen `iw-ns`).

- Sidepanelet (menyen) og innholdsområdet scroller som før, men **scrollbaren vises ikke**, verken i Chrome/Edge, Safari eller Firefox.
- CSS (global for innstillingsvinduet):
  ```css
  .iw-ns, .iw-ns * { scrollbar-width: none; }
  .iw-ns::-webkit-scrollbar, .iw-ns *::-webkit-scrollbar { display: none; width: 0; height: 0; }
  ```
- Alle `overflow-y: auto` i vinduet har også `scrollbar-width: none`.
- Skillelinjen mellom menyen og innholdet (`border-right 1px #d8d1c2`) blir stående. Det var den grå scrollbaren ved siden av som var feil.
- Gjelder hele web-appen: bruk samme regel på alle scrollbare paneler (Chat, Kalender, Finans).


## Oppdatering 2026-10-19: skjul scrollbar overalt på web
Vedlegg: `uploads/Screenshot 2026-10-19 at 21.39.43.png` og `… 21.40.00.png`. En grå systemscrollbar vises fortsatt i sidemenyen i Innstillinger (og flere steder).
- Global regel i appens CSS (gjelder alle scrollbare elementer, også sidemeny og innhold):
```css
* { scrollbar-width: none; -ms-overflow-style: none; }
*::-webkit-scrollbar { width: 0; height: 0; display: none; }
```
- Fjern alle `scrollbar-width: thin` (Innstillinger-innhold og AI-kontroll). Scrolling virker som før med hjul, trackpad og touch.
- Lagt inn i: Innstillinger Web, Homelab Papir Web, AI Kontroll, Kalender, Matplan, Rom, Familie, FinansHub v2, Domener og Glimt Brief.
