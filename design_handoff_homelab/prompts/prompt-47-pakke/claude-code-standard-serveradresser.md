# Standard serveradresser (alle apper)

Ønske 2026-10-23: «husk at standard arrese til serveren er https://os.smarthjemexperten.no og lokal er http://10.69.1.39:3000, la meg sette disse deafult i innstlinger.»

## Standardverdier
- **Ekstern:** `https://os.smarthjemexperten.no`
- **Lokal:** `http://10.69.1.39:3000`

Erstatter tidligere eksempler (`home.kristo.no` o.l.) i instruksene. Gjelder Homelab/Papir, Kalender, FinansHub og alle andre klienter: iOS, iPadOS, Android/Fold, Mac og web.

## Innstillinger → Server
- To felt: **Ekstern adresse** og **Lokal adresse**, forhåndsutfylt med verdiene over ved første oppstart.
- Under hvert felt: status (grønn «Svarer · 34 ms» / rød «Svarer ikke») og «Test».
- Knapp «Tilbakestill til standard» som setter begge feltene tilbake til standardverdiene.
- Endringer lagres per enhet og synkes til andre enheter på samme konto.
- Serveren kan overstyre standardverdiene via env (`PUBLIC_URL`, `LOCAL_URL`); appene henter dem fra `/api/config` etter innlogging. Er de ikke satt, gjelder standardverdiene over.

## Valg av adresse
- På hjemmenettet (lokal adresse svarer innen 1,5 s): bruk lokal.
- Ellers: bruk ekstern. Bytt automatisk ved nettverksendring.
- Innlogging spør fortsatt ikke om adresse (se `claude-code-innlogging-uten-server.md`); appen prøver lokal, så ekstern.

## Lokal adresse over http
- iOS/Mac: legg til ATS-unntak for lokalt nett (`NSAllowsLocalNetworking = true`) og `NSLocalNetworkUsageDescription`. Ikke slå av ATS globalt.
- Android: `network_security_config` som tillater klartekst bare for `10.69.1.39`.
- Web: når siden er lastet over https, ikke prøv http-adressen (blandet innhold). Bruk ekstern.

## Visning
- Vis domenet (`os.smarthjemexperten.no`) i meldinger og varsler, ikke den interne IP-en. Den lokale adressen vises bare i Innstillinger → Server.

## Test
- Ny installasjon: begge feltene er forhåndsutfylt, og innlogging fungerer uten at noe skrives inn.
- Hjemme på Wi-Fi bruker appen lokal adresse. På 5G bruker den ekstern.
- «Tilbakestill til standard» virker etter at feltene er endret.
