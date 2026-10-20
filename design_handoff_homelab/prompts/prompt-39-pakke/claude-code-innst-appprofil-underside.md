# Innstillinger: flytt «Profil» til egen side lenger ned

Ønske 2026-10-20: «disse kan legges lengre ned i innstillinger i en egen side.» (skjermbilde: `vedlegg/innst-profil.png`, PROFIL-gruppen med Standard / Finans + Boliger / Boliger-profil øverst i Innstillinger)

Fasit: `Mobil Papir App.dc.html` → `SUBP.profil` og raden `nav('Appprofil', …, 'profil')`.

## Endring (mobil og web)
- **Fjern** PROFIL-gruppen øverst i Innstillinger. Toppen starter nå med PROGRAMVARE.
- **Ny rad** nederst i APP-gruppen (etter «Helse og posisjon»):
  - **Appprofil** · undertekst = valgt profil («Standard» / «Finans + Boliger» / «Boliger-profil») · chevron.
- **Ny underside «Appprofil»:**
  - VELG PROFIL: de tre profilene som før, med «✓ Valgt» / «Velg». Samme `pickProf()`-logikk, uendret oppførsel.
  - Forklaring under: «En profil bestemmer hvilke faner og sider appen viser og hvor den åpner. Dataene dine endres ikke.»
- Søk i Innstillinger («profil», «boliger», «oppsett») skal finne undersiden.
- Web (`Innstillinger Web.dc.html`): samme plassering, Appprofil som eget punkt i APP-seksjonen i sidemenyen.
