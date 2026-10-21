# Logg inn som et familiemedlem (admin) for å redigere oppsettet

Ønske 2026-10-21: «hvordan redigere jeg andres mobil oppset fra mobil appen» → «bygg det.» → «riktig, men logg meg heller inn i dems bruker fra den menyen for å rediger, trenger ikke noe passord siden jeg er admin, når jeg er ferdig kan jeg bare gå ut igjen»
Fasit: `Rediger Andres Oppsett.dc.html` (klikkbar).

## Flyt
1. **Familie → [person]** (bare for admin). Raden viser enhet og «kan endre selv» / «låst oppsett».
2. Personsiden, **OPPSETT**:
   - **Logg inn som X** · «Uten passord, fordi du er admin.» Admin går rett inn i appen som X.
   - **Kopier mitt oppsett hit** (bekreft først), **Tilbakestill til standard** («Sist endret av …»).
   - Bryter **«X kan endre selv»**. Av: wiggle er av på X sin telefon («Oppsettet styres av Sebastian»).
3. **Innlogget som X:** hele appen er X sin (Hjem, fanelinje, Mer, data). Fast stripe øverst i X sin farge: avatar, **«Logget inn som X»**, status, **Gå ut**.
   - Redigering skjer som vanlig: hold inne et kort → wiggle med «–» og «LEGG TIL». Hold inne fanelinja → rediger fanelinja. «Ferdig» i stripa avslutter wiggle.
   - Endringer lagres med en gang på X sin konto. Status: «3 endringer lagret».
4. **Gå ut** → tilbake til personsiden som deg selv. Toast «Logget ut av X · 3 endringer lagret. Du er Sebastian igjen.» + **Angre** (4,5 s, ruller tilbake endringene).

## Sikkerhet og teknikk
- Impersonering: `POST /api/admin/impersonate {userId}` → kortlevd token (30 min, fornyes ved aktivitet) med `act: {sub: adminId}` (RFC 8693). Bare rollen `admin`. Ellers 403.
- Admin-tokenet beholdes i Keychain/Keystore. **Gå ut** = forkast X-tokenet, bruk admin-tokenet igjen. Ingen passord, ingen ny innlogging.
- Mens man er logget inn som X: ingen push-varsler til admin-enheten for X, ikke endre X sitt passord, 2FA eller rolle. Chat, Finans og Helse vises som **skrivebeskyttet** («Du ser dette som admin»).
- Alle handlinger logges med `actor=admin, as=X` i Docker-loggen. X ser en melding neste gang: «Sebastian har oppdatert oppsettet ditt».
- Oppsett: `GET/PUT /api/users/:id/layout` → `{home, nav, mer, locked, updatedBy, updatedAt}`. Den andre telefonen henter ved oppstart og ved push `layout.updated`.

## Lagt inn i mobilappen (2026-10-21)
Ønske: «legg det til i mobil appen. gi full demonstrasjon og at den funker.» (vedlegg `uploads/Screenshot 2026-10-21 at 13.32.21.png`)
Fasit: `Mobil Papir App.dc.html` → Innstillinger → **Kontoer og brukere** → **FAMILIE · LOGG INN SOM** (metodene `asLogin`, `asLogout`, `asRows`, `asVals`).
- Trykk Ingrid / Petter → ark: avatar, **Logg inn som X** (rød), «Uten passord, fordi du er admin …», Kopier mitt oppsett hit, Tilbakestill til standard, bryter «X kan endre selv».
- **Logg inn:** appen lastes på nytt som X. Ingrid har Plomme-farge og fanelinja Hjem · Kalender · Gjøremål · Bursdager. Petter har Skog og Hjem · Sporing · Mat · Familie. Begge har egne skjulte kort på Hjem. Pille øverst: «Logget inn som X · **Gå ut**».
- Alt redigeres som vanlig (wiggle, fanelinje, Mer, tema). Endringene lagres i X sin profil.
- **Gå ut:** X sitt oppsett lagres, ditt eget kommer tilbake, appen lastes på nytt. Toast «Logget ut av X · N endringer lagret. Du er Sebastian igjen.» + **Angre**.
- I designet er profilene lagret lokalt (`papir_u_<id>`, `papir_as`). I appen gjøres det med impersonerings-token mot serveren, som beskrevet over.
