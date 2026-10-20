# Innlogging uten serveradresse (Homelab og Kalender)

Ønske 2026-10-20: «for begge appene, ikke spør om addrese, hvis man har kommet til innloginsiden er det klart at man ikke trenger addresen. la man sette lokal og ekstern addrese senere i innsliinger.»
Fasit: `Mobil Papir App.dc.html` (innlogging uten SERVER-felt, Innstillinger → Konto → **SERVER**) og `Kalender App.dc.html` (innlogging uten adresse, Innstillinger → Server).

## Innlogging
- **Fjern SERVER-feltet** fra innloggingen i Homelab og Kalender. Bare brukernavn, passord (og 2FA), eller «Logg inn med Homelab-appen» / «Fortsett som …».
- Adressen er kjent fra før: appen leveres med `https://home.kristo.no` som standard (bygges inn i appen / konfig), og lokal adresse oppdages automatisk (Bonjour/mDNS `_homelab._tcp`, eller fra serverens `/api/discovery` etter første innlogging).
- Kalender henter adressene fra Homelab (delt Keychain / App Group, eller fra serveren ved innlogging). Kalender spør aldri om adresse.

## Innstillinger → Konto → SERVER (Homelab)
- **Lokal adresse** (f.eks. `http://192.168.1.40:8080`) · «Brukes når du er hjemme på Wi-Fi».
- **Ekstern adresse** (f.eks. `https://home.kristo.no`).
- **Bytt automatisk** (på): lokal når hjemme-Wi-Fi/lokal adresse svarer < 300 ms, ellers ekstern. Raden viser «nå: Lokal/Ekstern».
- Endre åpner et ark med felt (URL-tastatur, ingen autokorrektur), **Test** («✓ Homelab svarer på … · 12 ms» eller feilmelding) og **Lagre**. Krever http:// eller https://.
- Lagres per bruker på serveren og synkes til Kalender og andre enheter.

## Kalender → Innstillinger
- Raden **Server** viser lokal og ekstern adresse (lesbar). Trykk: «Endres i Homelab → Innstillinger → Konto → Server». Ingen egen redigering i Kalender.

## Feil
- Når ingen adresse svarer ved innlogging: «Får ikke kontakt med Homelab» + «Prøv igjen» og en lenke «Endre serveradresse» (åpner samme ark). Ikke vis serverfeltet som standard.
