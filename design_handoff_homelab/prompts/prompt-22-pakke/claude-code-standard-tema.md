# Til Claude Code: «Lys hovedbok» er nytt standardtema i FinansHub

## Endring
- Nye brukere og nye enheter starter i **Lys hovedbok** (`design: 'lys'`): papirtone `#f4f1ea`, grønn aksent `#1f4d3a`, serif-tall. Tokens står i `design/FinansHub v3 Temaer.dc.html` → `THEMES.lys` og i `FinansHub v3 Temaer README.md`.
- Det gamle mørke designet (**FinansHub v2**, oransje aksent) beholdes uendret. Brukeren må selv velge det i Innstillinger → Utseende.
- Eksisterende brukere som allerede har valgt et tema, beholder valget sitt.

## Implementasjon
1. **Backend:** `user_settings.design` får standardverdi `'lys'` (migrering: `ALTER ... SET DEFAULT 'lys'`). Ikke overskriv rader som allerede har en verdi. Rader med `NULL` blir `'lys'`.
2. **Klient (web, iOS, Android):** rekkefølge for tema: 1) brukerens lagrede verdi fra `/api/me/settings`, 2) lokal cache `fh_design`, 3) `'lys'`. Det gamle fallbacket `'v2'` fjernes overalt.
3. **Første lasting:** sett `data-theme="lys"` i HTML/SSR, så siden ikke blinker i mørkt før innstillingene er hentet. Lasteskjermen (Papir) passer allerede til det.
4. **Innstillinger → Utseende:** kortet heter «Lys hovedbok · standard». «Nåværende (FinansHub v2)» ligger fortsatt i listen. Å bytte tema åpner ikke lenger innstillingene automatisk ved første oppstart. Det skjer bare rett etter et manuelt bytte (`sessionStorage fh_jump`).
5. **Mobilappene** bruker Papir allerede. FinansHub-sidene i appen skal bruke samme `lys`-tokens som standard.

## Test
- Inkognito / ny enhet / ny bruker → FinansHub åpner i Lys hovedbok på Oversikt, ikke på Innstillinger.
- Velg «Nåværende (FinansHub v2)» → mørkt design. Last på nytt → fortsatt v2. Logg inn på en annen enhet → v2.
- Eksisterende bruker med `design='glod'` → uendret.
