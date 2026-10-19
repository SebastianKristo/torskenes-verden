# Web-innstillinger: AI-søk, fargede ikoner og Cloudflare-guide bak ?

Fasit: `Innstillinger Web.dc.html` (ny fil, viser sidemeny + Domener).
Vedlegg: sidemenyen uten ikoner, og Domener med lang hjelpetekst under API-token.

## 1. Sidemeny med fargede ikoner
- Hvert menypunkt har et ikon i en farget, avrundet rute (30×30, radius 9, hvit strek-ikon 16 px), som iOS-innstillinger:
  - GENERELT: Konto #2b5d8a · Utseende #7a5ad6 · Startside #3f7a6e · Domener #c0562a · Varsler #b23a2a · App #5b6470
  - TILKOBLINGER: Integrasjoner #4a5bbf (rødt tall-merke for manglende nøkler) · Kalendere #2f7d4f · AI #7a3b6b
  - SIKKERHET: Brukere #a8661a · Innlogging #1f6f78
  - SERVER: System #6b6558 · Backup #2f6b45
- Aktivt punkt: fet tekst + bakgrunn `#ece6da` (erstatter understreken). Hover samme bakgrunn.
- Sidetittelen til høyre får samme ikon (44 px) foran tittelen.
- Samme farger brukes på mobil (Innstillinger-listen) så de matcher.
- Fjern «@sebastian» under navnet, vis «Admin · Se konto ›».
- **Hele profilblokken (bilde + navn) er en knapp** som åpner **Konto** for innlogget bruker. Hover/aktiv: bakgrunn `#ece6da`, radius 16. Samme på mobil: trykk på profilkortet øverst i Innstillinger → Konto.

## 2. AI-søk i innstillinger (web, samme som mobil)
- Søkefeltet har en **✦ AI**-knapp til høyre. Vanlig skriving gir treffliste (ikon + navn + sti, f.eks. «Bakgrunn på forsiden · Utseende → Bakgrunn»).
- AI-svar når ✦ AI er på, eller teksten har mellomrom/spørsmålstegn, og man trykker Enter: kort «✦ AI-SVAR» med forklaring + knapp «Åpne Utseende ›».
- Backend: søkeindeks over alle innstillinger (tittel, sti, nøkkelord, beskrivelse). AI (lokal modell først) får spørsmålet + indeksen og svarer med `{answer, targetId}`. Ingen brukerdata sendes.
- Esc tømmer. ⌘K / Ctrl+K fokuserer feltet.

## 3. Domener: instruksjoner bak ?-ikon
- Fjern den lange hjelpeteksten under skjemaet.
- Rund **?**-knapp (26 px, ink-kant) rett etter «API-token». Åpner et **sidepanel** (560 px fra høyre, mobil: fullskjerm-ark) «Lag et API-token for statistikk»:
  - Knapp «Åpne API-tokens i Cloudflare ↗» → https://dash.cloudflare.com/profile/api-tokens
  - 6 nummererte steg, hvert med en forenklet skisse av Cloudflare-skjermen der det man skal trykke på er markert oransje:
    1. My Profile → API Tokens
    2. Create Token → Custom token → Get started (ikke Global API Key)
    3. Token name: «Homelab statistikk»
    4. Permissions (alle Read): Zone · Zone, Zone · DNS, Zone · Analytics, Zone · Firewall Services, Account · Registrar: Domains
    5. Zone Resources: Include · Specific zone · <domenet>. Account Resources: Include · kontoen.
    6. Continue to summary → Create Token → kopier (vises én gang)
  - Gul merknad nederst: tokenet vises bare én gang, lagres kryptert på serveren.
  - Vil du ha ekte skjermbilder fra Cloudflare: ta dem selv (lys modus, 1280 px bred), beskjær til det aktuelle feltet og legg dem inn i stedet for skissene (`assets/cf-step-1.png` …). Oppdater når Cloudflare endrer dashbordet.
- Ny knapp **Test token** ved siden av «Legg til domene»: `GET https://api.cloudflare.com/client/v4/user/tokens/verify` + sjekk at sonen kan leses. Viser «✓ Tokenet virker · 5 av 5 tillatelser» eller hvilke som mangler.
- Tomt token-felt = standard-token fra Integrasjoner → Cloudflare (uendret).

## 4. Profilmenyen (S-knappen øverst til høyre på web)
- Hvert valg får et farget ikon (26×26, radius 8, hvitt ikon 14 px) til venstre, samme stil som sidemenyen:
  - Språk #2b5d8a (globus) · Innstillinger #6b6558 (tannhjul) · Bytt tema #7a5ad6 (halv sirkel) · Logg ut #b23a2a (utgang, rød tekst)
- Menyen er 250 px bred, rader 42 px.
- Fjern «@admin» under navnet, vis kun rolle.
- **Feil:** «Innstillinger» i menyen gjorde ingenting. Den skal alltid åpne innstillingene som et **vindu** midt på skjermen (som før): maks 1180×860 px, radius 24, mørk uskarp bakgrunn bak (`rgba(14,13,11,.5)` + blur 6 px), stor skygge. Sidemeny og innhold scroller hver for seg inne i vinduet. **Feil som er rettet:** vinduet hadde `height:100%` på et barn uten fast høyde, så innholdet ble kuttet og kunne ikke scrolles. Gi selve innstillingsroten en fast høyde (`min(860px, 100vh − marg)`), `overflow:hidden`, og la sidemeny og innhold ha `height:100%; overflow-y:auto`. «Ferdig»-pille i **øverste høyre hjørne av vinduet** (18/20 px). Klikk utenfor eller Esc lukker. URL `/innstillinger/<side>`. Esc lukker også.

## 5. Tilpass profilmenyen selv
Vedlegg: menyen i appen har Innstillinger, Bytt tema, Språk, Skjul søkebar, Skjul nyhetslinje, Tilpass forside og meny, CV ↗, Logg ut.
- Nederst i menyen: **«✎ Tilpass denne menyen»** (grå, liten). Bytter menyen til redigering på stedet:
  - Overskrift «TILPASS MENYEN» + **Ferdig**-pille.
  - Hver rad: avkrysning (vis/skjul) · farget ikon · navn · ▲ ▼ for rekkefølge. Skjulte rader vises med 45 % opasitet.
  - Bunn: «Logg ut ligger alltid nederst.» + **Tilbakestill**.
- Tilgjengelige valg: Innstillinger, Bytt til nåværende tema, Språk, Skjul/vis søkebar, Skjul/vis nyhetslinje, Tilpass forside og meny, CV ↗, Lås skjermen. Standard skjult: søkebar, nyhetslinje, lås skjermen.
- **Logg ut** kan ikke skjules eller flyttes (alltid nederst, rød).
- Lagres per bruker på serveren (`profile_menu: {order[], hidden[]}`) så det følger med mellom enheter. Fasiten bruker localStorage `papir_me_menu`.
- Klikk inne i menyen i redigering lukker den ikke. Klikk utenfor eller Esc lukker.
