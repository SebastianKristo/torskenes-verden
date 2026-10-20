# Ikke hopp til toppen eller bunnen når en innstilling endres

Ønske 2026-10-20: «feks i innstillinger på web når jeg går inn i ai og velger annen tid før glimt sender meg til chat, så blir jeg sendt i bunnen av siden, jeg vil ikke bli sendt til toppen eller bunnen i slike situasjoner»

Gjelder hele appen (web, iPhone, Android), ikke bare Innstillinger → AI og tolkning → «Send til Chat etter».

## Regel
Scroll-posisjonen endres **bare** ved ekte navigasjon:
- Ny side: start øverst.
- Tilbake: gjenopprett der du var.

Alt annet holder posisjonen der den er, piksel for piksel:
- endre en innstilling, bryter eller verdi (5 → 8 → 15 → 30 s)
- lagring til server, toast og banner
- AI-svar som kommer inn og data som oppdateres i bakgrunnen

## Sannsynlige årsaker (sjekk i denne rekkefølgen)
1. **Siden remountes.** Lagringen gjør `settings = await refetch()`. Mens den henter, vises «Laster …» eller en tom liste, siden blir kort, og nettleseren klemmer scrollen. Når innholdet kommer tilbake, havner du nederst/øverst.
   - Fiks: **optimistisk oppdatering**. Endre verdien lokalt med en gang, lagre i bakgrunnen, og vis aldri loader for en eksisterende liste. Rull bare tilbake ved feil (med toast).
2. **`key` endres** på listen/siden (f.eks. `key={JSON.stringify(settings)}` eller `key={version}`). Det gir ny DOM og scroll 0.
   - Fiks: stabile `key` per rad (`row.id`), aldri på hele siden.
3. **Scroll-gjenoppretting kjører feil.** Ruteren tror det er navigasjon fordi URL/state endres (f.eks. `?tab=ai&hs_to=15`, eller `router.replace` ved lagring).
   - Fiks: innstillingsverdier ligger ikke i URL-en. Bruk `router.replace(url, { scroll: false })` / `preventScrollReset`. Nøkkelen for scroll-gjenoppretting = bare side + underside.
4. **Fokus flytter scrollen.** En knapp/input får `focus()` etter klikk, eller en toast/live-region legges nederst i DOM og får fokus.
   - Fiks: `el.focus({ preventScroll: true })`. Toast i en `position: fixed`-portal utenfor scroll-containeren. Ingen `scrollIntoView` ved lagring.
5. **Kode som scroller chatten** (`scrollTop = scrollHeight`) kjører globalt når «Send til Chat etter» endres.
   - Fiks: bare chat-containeren, og bare når chatten er synlig og brukeren allerede var nederst.
6. **Layout-hopp:** rader som endrer høyde når verdien byttes (f.eks. undertekst som brytes annerledes).
   - Fiks: fast `min-height` på raden og `overflow-anchor: auto` (standard) på scroll-containeren. Ikke `none`.

## Test (web Safari/Chrome + iPhone + Android)
1. Innstillinger → AI og tolkning, scroll litt ned. Trykk «Send til Chat etter» 4 ganger. Scrollen står stille.
2. Det samme for alle brytere i Varsler, Utseende, Personvern og Finans → AI-valg.
3. Endre en innstilling mens et AI-svar kommer inn i bakgrunnen. Ingen hopp.
4. Gå til en annen side og tilbake. Du kommer tilbake til samme posisjon.
5. Treg nettverksforbindelse (DevTools «Slow 3G»): verdien endres med en gang, og det blir ingen hopp mens lagringen pågår.
