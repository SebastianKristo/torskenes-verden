# Web: Lys · Mørk · Følg systemet

Ønske 2026-10-21: «la meg velge theme for web versjon også, dark mode eller light mode som er standard. og følg systemet» (vedlegg `uploads/Screenshot 2026-10-21 at 14.18.28.png`: Innstillinger → Utseende på web)

## Plassering
Innstillinger → **Utseende**, ny seksjon **LYS OG MØRK** rett under TEMA (samme stil: rød mono-etikett, strek under). Tre kort på rad (brytes på smal skjerm):
- **Lys** · «Standard · lyst papir» (valgt som standard)
- **Mørk** · «Mørkt papir, lys tekst»
- **Følg systemet** · «Bytter med macOS/Windows»
Valgt kort har 2 px mørk ramme som TEMA-kortene. Under: «Gjelder web-versjonen. Lagres på brukeren og i denne nettleseren.»

## Teknikk
- Lagres på brukeren (`settings.webMode: 'light'|'dark'|'system'`) og i `localStorage.papir_web_mode`, så riktig modus brukes før innloggingen er lastet.
- Følg systemet: `matchMedia('(prefers-color-scheme: dark)')` med `change`-lytter, bytter med en gang.
- Sett `data-mode="light|dark"` på `<html>` **før første tegning** (lite inline-skript i `<head>`), så siden ikke blinker hvit.
- Alle sider bruker felles CSS-variabler (`--bg, --card, --ink, --mut, --line, --lab`). Mørk: bg `#16140f`, kort `#211e18`, tekst `#f3efe6`, dempet `#a39d90`, linjer `#3a352c`, rød `#ec7a64`. Kontrast minst 4.5:1.
- Gjelder alle sider på web (Dashboard, Kalender, Gjøremål, Media, Avspilling, Finans, Innstillinger). Valget av tema («Nåværende» / «Vindu og papir») er uavhengig av lys/mørk.
- Send hendelsen `papir-web-mode` ved bytte så åpne faner/komponenter oppdateres (også `storage`-hendelse mellom faner).
