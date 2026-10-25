# Mediekontroll (prompt 51, MEDCTL51)

## Hva det gjør
- **Spilles nå** (Media › Avspilling på web/PWA, iPhone, Apple Watch, Wear OS og Android Auto) har knapper for
  pause/spill av, forrige, neste, spol 30 s tilbake/frem, stopp og volum (der avspilleren støtter det).
- Kommandoene går fra Homelab-serveren til Plex og Jellyfin via deres egne API-er. Nøklene blir på serveren.
- **Hvem kan styre hva:** du styrer dine egne avspillinger; en administrator kan styre alle (og får spørsmål før han
  stopper noe for en annen). Hva som er «dine» avgjøres bare av koblingen en administrator har satt (Homelab-bruker →
  Plex-/Jellyfin-/Audiobookshelf-brukernavn). Uten kobling kan en vanlig bruker bare se, ikke styre. Navnet du selv setter i
  «I kveld» brukes bare til forslag, aldri til tilgang.
- **Lydbøker og podkaster:** åpne lytteøkter i Audiobookshelf vises med fremdrift («Lydbøker og podkaster nå»). Audiobookshelf
  lar seg ikke fjernstyre fra et annet program, så de styres i Audiobookshelf-appen.
- Rate limit: maks 12 kommandoer per 10 sekunder og 60 per minutt per bruker.

## Hva du må gjøre
- Plex og Jellyfin må være koblet til (Media › Avspilling › «Logg inn med Plex», Jellyfin under Innstillinger › Integrasjoner).
- **Administrator:** koble hver bruker til navnet sitt i Plex, Jellyfin og/eller Audiobookshelf under Media › Avspilling ›
  Spilles nå › «Hvem kan styre avspillinger» (web og PWA). Et mediebrukernavn kan bare kobles til én bruker – lagring
  avvises ellers. Tomt felt fjerner koblingen.
- Plex-avspillere må tillate fjernkontroll (Plex-appen: Innstillinger › «Annonser som spiller»/«Advertise as player»).
  Tar spilleren ikke imot kommandoer, virker **Stopp** likevel (serveren avslutter strømmen). Jellyfin-klienter som ikke
  støtter fjernkontroll (f.eks. noen nettlesere) vises med «Denne avspilleren kan ikke fjernstyres».
- Audiobookshelf: `ABS_URL` og `ABS_TOKEN` (admin-token) i `.env`, som for «Fortsett» (se docs/media-familie-51.md).

## Kommandoer
- Tester: `node --test test/p51-medctl.test.js`
- API: `GET /api/medctl51/now`, `POST /api/medctl51/sessions/<id>/<play|pause|toggle|stop|next|previous|seek|volume>`
  (seek: `{"offset": -30000}` eller `{"position": 60000}`, volum: `{"volume": 40}`).
- Koblinger (bare admin): `GET /api/medctl51/links`, `PUT /api/medctl51/links/<brukerId> {"plex": "Ingrid", "jellyfin": "ingrid", "abs": ""}`.
