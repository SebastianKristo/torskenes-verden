# Web: Kalender med toppmeny eller i fullskjerm

Fasit: `Homelab Papir Web.dc.html` → Kalender, og `Kalender.dc.html` (props `full`, `onToggleFull`, `onClose`).

## To oppsett (brukeren velger)
1. **Med toppmeny** (som i dag): Homelab-menyen øverst, kalenderen fyller resten.
2. **Fullskjerm**: ingen Homelab-toppmeny. Kalenderen dekker hele vinduet (`position:fixed; inset:0`), som Økonomi/Finans.

## Bytte
- Ny knapp i kalenderens verktøylinje, til høyre for «+ Ny hendelse»: ikon ⤢ «Fullskjerm» / ⤡ «Vis med toppmeny» (40×40, `card`, 1 px `line`).
- I begge oppsett: **✕** helt til høyre (40×40, `ink` bakgrunn, `bg` ikon) lukker kalenderen og går til Dashboard, som ‹ Hjem i Finans.
- `Esc` i fullskjerm = ✕.
- Valget huskes per bruker (`calendar.web_layout = "menu" | "full"`) og brukes neste gang Kalender åpnes.
- Innstillinger → Kalender: samme valg som segmentkontroll «Med toppmeny · Fullskjerm».
