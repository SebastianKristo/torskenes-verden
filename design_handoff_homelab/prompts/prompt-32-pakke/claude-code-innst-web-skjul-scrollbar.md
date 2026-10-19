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
