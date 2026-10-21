# Innstillinger: overfør eierskapet til serveren

Ønske 2026-10-21: «i innstillinger la også admin og den brukeren som startet serveren å overføre den til en annen bruker.»
Fasit: `Mobil Papir App.dc.html` → Innstillinger → Kontoer og brukere → **SERVER · EIER** (`ownRows`, `ownVals`). Web (`Innstillinger Web.dc.html` → Kontoer og brukere) får samme seksjon og samme to steg i et vindu.

## Hvem kan
- **Eieren** (den som startet serveren, `owner_id` satt ved første oppsett) og **admin**.
- Admin som ikke er eier: kan starte overføring, men eieren må godkjenne (push + e-post «Ingrid vil overføre serveren til Petter», Godkjenn/Avslå, gyldig i 48 t).

## Flyt
1. Rad «Eier av serveren · Sebastian (deg) · startet serveren 3. mars 2025».
2. **Overfør eierskap ›** (rød) → ark: forklaring + liste over brukere (avatar, rolle). Velg én → **Fortsett**.
3. Bekreft: skriv navnet til mottakeren + Face ID / fingeravtrykk / passord på web. **Overfør til X** (rød, aktiv først når navnet stemmer).
4. Resultat: X blir eier, forrige eier blir **admin**. Toast «X eier nå serveren. Du er fortsatt admin. X har fått e-post og varsel.» X får push og e-post.

## Server
- `POST /api/server/owner/transfer {toUserId}` + reautentisering (`auth_time` < 5 min). Transaksjon: `owner_id = toUserId`, gammel eier → `role=admin`, mottaker → `role=admin` hvis lavere.
- Mottaker må være aktiv bruker med bekreftet e-post og 2FA på (ellers: «X må slå på 2FA først»).
- Overfør også: backup-nøkkel (krypteres på nytt med mottakerens nøkkel), Let's Encrypt-e-post, varsler for serverfeil, domene- og DNS-kontoer som er koblet til eierkontoen (spør per konto).
- Revisjonslogg + Docker-logg: `owner.transfer from=… to=… by=…`. Kan ikke angres i appen. Ny eier kan overføre tilbake.
