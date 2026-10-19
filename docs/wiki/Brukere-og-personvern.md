# Brukere og personvern

Homelab OS er laget for en husstand. Alle får sin egen konto, og **hver bruker ser bare sine egne data**. Det gjelder også andre administratorer. Det eneste som deles, er **Boliger** du er invitert til, og det du selv velger å dele.

## Roller

| Rolle | Kan |
|---|---|
| **Hovedadmin** | Den som satte opp serveren. Alt en admin kan. Eier dataene som fantes før 4.18. |
| **admin** | Legge til og fjerne brukere, sette roller, og endre **serveroppsettet**: AI-motorer og nøkler, Home Assistant, Google-klienten, Cloudflare/Domener, Entur, MET, kart, bilder og SMB-backup |
| **bruker** | Alt for egne data: FinansHub, Kalender, Sporing, Mat, Hjem, Huskeliste, Familie, egne integrasjoner, egen 2FA og eget passord. Kan *bruke* AI-motorene, men ikke endre dem. |

Vanlige brukere ser «Settes opp av administrator» på serveroppsettet. De ser aldri adresser, nøkler eller URL-er.

## Legge til en bruker

1. Logg inn som admin og åpne **Innstillinger → Brukere**.
2. Trykk **Ny bruker** og fyll inn navn, brukernavn (for eksempel `emma`), et midlertidig passord og rolle.
3. Gi personen brukernavn og passord. Be dem bytte passord og slå på 2FA under **Innstillinger → Konto**.
4. Personen logger inn i appene med serveradressen og sin egen bruker, se [Mobilapper](Mobilapper#logg-inn-med-app-token).

**Endre brukernavn:** Innstillinger → Konto. Passord, data og app-tokens beholdes.

**Glemt passord eller mistet 2FA:**

```bash
docker compose exec -u 1000 os npm run reset-password -- emma
```

Bruk din `PUID` i stedet for `1000` hvis den er en annen. Kommandoen setter nytt passord og slår av 2FA.

## Hva er mitt, og hva deles?

| Område | Hvem ser det |
|---|---|
| **FinansHub:** kontoer, transaksjoner, kvitteringer, budsjett, faste utgifter, abonnementer, Finn, AI-søk og AI-logg, e-postimport, Trading 212, innstillinger | Bare deg |
| **Egne integrasjoner:** Plex, Jellyfin, Sonarr, Radarr, skole-iCal og Canvas, Google Kalender-innlogging, Trading 212, IMAP, Mybring, PostNord, ParcelsApp, Finn | Bare deg. Under Integrasjoner står de under «Dine integrasjoner». |
| **Sporing, Mat, Hjem, Kalender, Bursdager** | Bare deg |
| **Huskeliste** | Listen din. Du kan dele en liste med utvalgte personer. |
| **Familie** | Bare dem du deler med. **Deling er av som standard.** |
| **Boliger** | Medlemmene av boligen |
| **Serveroppsett** (AI, Home Assistant, Entur, kart …) | Admin endrer. Alle bruker det. |
| **Brukerlisten** | Vanlige brukere ser bare navn og profilbilde til de andre, ikke brukernavn eller rolle. |
| **Filer** (kvitteringsbilder, profilbilder) | Eieren og admin |

Varsler og sanntidsoppdateringer går bare til den som eier dataene, eller til dem som har tilgang.

## Boliger: det som deles

En bolig er et felles regnskap for et hus, en hytte eller en husholdning.

1. **FinansHub → Boliger → + Ny bolig** (eller Innstillinger → Boliger).
2. Åpne **Deling** og inviter brukere med rolle.
3. Alle medlemmene kan skanne kvitteringer rett inn i boligen, se utgifter og prosjekter, og godkjenne utgifter.

Detaljer:
- Kvitteringer en bruker laster opp til en bolig, vises **ikke** for en admin som ikke er medlem av boligen.
- Bare admin kan endre bolig-kategoriene.
- Profilen **Finans + Boliger** åpner appen rett i Boliger. Den finnes under Innstillinger → Profil.

## Familie: deling er av

Etter 4.13.0 er all posisjonsdeling **av som standard**, også for dem som delte før.

- Du ser bare personer som deler med deg.
- **Helse** vises aldri når delingen er av.
- **Soner** er dine egne til du slår på «Del med familien». Bare den som lagde sonen kan endre den.
- Du kan sette deling på pause, slå den av, eller dele **omtrentlig posisjon**. Serveren håndhever valget.
- Når du slår av hovedbryteren for helse, slettes helsedataene dine på serveren.

Se [Familie og kart](Familie-og-kart) for hvordan du slår det på.

## Profiler

Under **Innstillinger → Profil** velger hver bruker hvordan appen er bygd opp:

| Profil | Passer for |
|---|---|
| **Standard** | Alt: Hjem, Finans, Mat, Sporing og Mer |
| **Finans + Boliger** | Den som mest fører regnskap. Appen åpner i Boliger, og Hjem ligger under Mer. |
| **Boliger-profil** | Den som bare er med i en bolig |

## Innlogging og sikkerhet

- **2FA (TOTP):** Innstillinger → Konto → Slå på 2FA. Skann QR-koden med Aegis, 1Password, Google Authenticator eller lignende, og ta vare på de 10 gjenopprettingskodene.
- **Pålitelig enhet:** «Husk denne enheten på lokalt nett» slipper passord bare når enheten har gyldig enhetscookie **og** IP-en er privat (`10.x`, `172.16–31.x`, `192.168.x`). Fra internett kreves alltid passord og 2FA.
- **Lås skjermen** i menyen pauser enheten til neste innlogging med passord.
- **App-tokens** (`fh_pat_…`) har egne tilganger og utløp. Du ser og trekker dem tilbake under FinansHub → Innstillinger → Mobil og tilgang.

| Tilgang | Gir |
|---|---|
| `finance:read` | Lese alle dine data (også Kalender, Sporing, Familie og Huskeliste via `/api/*`) |
| `finance:write` | Endre alle dine data |
| `receipts:write` | Bare laste opp kvitteringer, for eksempel fra en iOS-snarvei |

Mer om passord-hashing, kryptering og sesjoner står i [docs/sikkerhet.md](https://github.com/SebastianKristo/torskenes-verden/blob/main/docs/sikkerhet.md).
