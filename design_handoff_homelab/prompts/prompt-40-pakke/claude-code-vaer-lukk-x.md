# Vær: samme lukkeknapp (✕) overalt

Ønske 2026-10-20: «i vær yr mot storm legg til x som i været og i alle popups i vær gi samme x like stor som i hovedside i vær»
Fasit: `Vaer.dc.html` (hovedsiden sin ✕) og `Yr mot Storm Design.dc.html`.

## Knappen (fra hovedsiden i Vær)
- 42 × 42 pt sirkel, `rgba(255,255,255,.22)` + `blur(12px)`, hvit ✕ (17 pt, strek 2,8, runde ender), `aria-label="Lukk"`.
- Over kart (lys bakgrunn): samme størrelse, men mørk glass `rgba(10,20,35,.62)` for kontrast.
- Trykkflate minst 44 pt. Haptikk som på hovedsiden.
- SwiftUI: én felles `VaerCloseButton`. Compose: én felles `VaerCloseButton()`. Ikke egne varianter per ark.

## Hvor
- **Yr mot Storm**: «Ferdig» øverst til høyre byttes til ✕. Mens man redigerer rekkefølgen på kortene vises «Ferdig» (hvit pille, 42 pt høy) i stedet, og blir til ✕ igjen etterpå.
- **Kart** (Nedbør/Temperatur/Vind-kartet): «Ferdig» → ✕.
- **Steder** (lista over steder): «Ferdig» → ✕.
- **Detaljark** (time-/dagsdetaljer, «Forhold», måne/sol osv.): den lille mørke «×» (40 pt) → samme ✕.
- Plassering: øverst til høyre, samme avstand fra kant som på hovedsiden (16 pt), vertikalt midt på tittellinja.
- Sveip ned / tilbake-gest lukker fortsatt arkene.
