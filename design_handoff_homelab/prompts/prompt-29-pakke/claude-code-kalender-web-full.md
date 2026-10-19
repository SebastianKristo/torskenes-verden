# Web: Kalender i full størrelse

Fasit: `Homelab Papir Web.dc.html` → Kalender.

- Kalenderen fyller **hele vinduet** under toppmenyen, kant til kant, som Google/Apple Calendar på web.
  - Ingen avrundet kort, ingen ramme eller skygge rundt, ingen sidemarg og ingen `max-width`.
  - Høyde: `100vh − toppmeny (≈72 px)`, minst 620 px. Ingen side-scroll; bare tidsrutenettet scroller internt.
  - Ingen annen sideinnhold under kalenderen (ingen bunnpadding).
- En tynn linje (1 px `line`) skiller toppmenyen fra kalenderen.
- Innholdet i kalenderen (sidepanel med minikalender og kalendere, verktøylinje Dag/3 dager/Uke/Måned/Liste, «Neste»-banner, rutenett) er uendret.
- Ved smale vinduer (< 820 px): skjul sidepanelet og vis det som skuff fra kalender-ikonet.
