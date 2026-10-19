# Oppdater Homelab fra mobilappen (banner)

Fasit: `Mobil Papir App.dc.html` → Hjem (øverst) og Innstillinger (øverst + gruppe PROGRAMVARE).

## Når vises banneret
- Serveren sjekker etter ny versjon (GitHub-release / container-registry) hver 6. time. Finnes nyere versjon enn installert → `update_available`.
- **Hjem**: kort øverst, over søkefeltet. ✕ skjuler det i 24 t (hint «Du finner oppdateringen i Innstillinger»). Under oppdatering og når den er ferdig vises det alltid.
- **Innstillinger**: samme kort øverst, kan ikke skjules. I tillegg gruppe **PROGRAMVARE**:
  - «Homelab 2.3.1 · Ny versjon 2.4.0 er klar» → «Oppdater ›» (rød). Etterpå «Siste versjon ✓».
  - Bryter **Automatiske oppdateringer** (av som standard): kl. 03:30, etter nattlig backup.
  - Bryter **Varsle om nye versjoner** (på): banner + push.
- Kun brukere med rolle Eier/admin ser banneret og kan oppdatere.

## Banneret (tilstander)
1. **Tilgjengelig**: ikon (pil ned i `lab`-sirkel) · «Ny versjon 2.4.0» · «Du har 2.3.1. Oppdaterer hjemmeserveren, web og appen.» Knapper: **Oppdater nå** (ink-pille) + **Hva er nytt** (sekundær pille, viser punktliste fra release notes).
2. **Oppdaterer**: «Oppdaterer Homelab» · «Du kan bruke appen mens den oppdateres.» Fremdriftslinje + steg: Laster ned → Tar backup før oppdatering → Installerer på hjemmeserveren → Starter tjenestene på nytt. Prosent til høyre (mono).
3. **Ferdig**: hake-ikon · «Oppdatert til 2.4.0» · «Alt kjører. Endringene er aktive i appen og på web.» Knapp **Ferdig**. Lett haptikk (to tikk).
4. **Feilet**: «Oppdateringen feilet» · feilmelding · **Prøv igjen** og **Gjenopprett 2.3.1** (bruker backupen fra steg 2).

## Backend
- `GET /api/system/version` → `{current, latest, notes[], publishedAt}`.
- `POST /api/system/update` (admin) → starter jobb. `GET /api/system/update/status` (SSE/polling 1 s) → `{step, pct, error}`.
- Jobben: backup (se `claude-code-backup.md`) → `docker compose pull` → migrering → `docker compose up -d` → helsesjekk. Feil i helsesjekk → automatisk rollback.
- Appen mister forbindelsen under omstart: vis «Starter tjenestene på nytt …» og prøv igjen hvert 2. sek i opptil 2 min.
- Web/PWA: etter ferdig, oppdater service worker og last inn på nytt. Native app: hvis appen selv har ny build, vis i tillegg «Oppdater appen i App Store/TestFlight ›».
