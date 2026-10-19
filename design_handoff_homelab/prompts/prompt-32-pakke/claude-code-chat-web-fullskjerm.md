# Web: Chat i fullskjerm

Fasit: `Homelab Papir Web.dc.html` → `chW` (chat-wrapper).

- Chat åpnes som standard i **fullskjerm**: `position: fixed; inset: 0`, ingen toppmeny/hero, ingen radius, ingen kant. Sidepanel (samtaler) + samtale fyller hele vinduet. Samme mønster som Kalender og Finans.
- Oppe til høyre i samtalehodet, etter ⚙ samtaleinnstillinger:
  - **Vis i siden / Fullskjerm** (rund 40 px, kant, ikon med piler inn/ut). Bytter mellom fullskjerm og det gamle kortet i siden (under hero, radius 24).
  - **✕ Lukk** (rund 40 px, mørk fylt). Bare i fullskjerm. Går tilbake til Dashboard.
- Valget huskes (`hl_chat_full`, standard «1»). Esc lukker fullskjerm (valgfritt).
- Meldingskolonnen beholder maks 760 px bredde (lesbarhet). Det er rammen rundt som får mer plass.
