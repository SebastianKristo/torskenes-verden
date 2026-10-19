# FEIL: Backup til nettverksdisk: skann finner ingenting, og «backup»-mappen vises ikke i sharen

Tilbakemelding: skanningen fant ingen enheter. Manuell innlogging virket, og andre mapper i sharen dukket opp og kunne brukes, men **mappen «backup» (eller en mappe i en av sharene) dukket ikke opp**, så man kunne ikke lagre der.
Se også `claude-code-backup.md`. **Gå gjennom alle punktene og rett det som stemmer.**

## A. Skanning finner ingen enheter
Mest sannsynlig kjører backup-tjenesten i en **Docker-container på bridge-nettverk**. Da når ikke multicast/broadcast (mDNS, NetBIOS, WS-Discovery) containeren.
1. Kjør oppdagelsen fra **host-nettverket**: `network_mode: host` for en liten `discovery`-sidecar, eller mount `/var/run/dbus` + `/var/run/avahi-daemon/socket` og spør Avahi.
2. Bruk **alle** metodene parallelt (timeout 4 s), slå sammen på IP:
   - mDNS/Bonjour: `_smb._tcp.local`, `_device-info._tcp`, `_adisk._tcp` (Time Machine). Gir Synology, QNAP, TrueNAS, Mac og Raspberry Pi med Samba.
   - NetBIOS: `nmblookup -S '*'` / UDP 137-broadcast. Gir eldre NAS og Windows.
   - WS-Discovery: UDP 3702 multicast. Gir Windows 10/11.
   - **Subnett-skann på TCP 445** for /24 rundt egen IP (maks 64 samtidige, 300 ms timeout). Dette fungerer selv når multicast er blokkert.
3. For hvert funn: hent navn (mDNS-navn, NetBIOS-navn eller omvendt DNS), modell (`_device-info` → `model=`) og liste over shares (`smbclient -L //ip -N` anonymt, ellers etter innlogging).
4. UI: vis fremdrift («Søker i 192.168.1.0/24 … 38 %») og funn fortløpende. Tom liste skal vise årsak og tiltak: «Fant ingen. Sjekk at NAS-en er på samme nett, eller legg til manuelt: smb://192.168.1.20». Behold **Legg til manuelt** med IP/vertsnavn + share.
5. Kjente adresser fra Homelab (f.eks. TrueNAS 192.168.1.20 i Nettverk) vises som forslag øverst.

## B. «backup»-mappen vises ikke i sharen
Sjekk i denne rekkefølgen:
1. **Eget filter i koden.** Søk etter filtre i mappelistingen: skjulte (`.`-prefiks), systemmapper (`@eaDir`, `#recycle`, `#snapshot`, `$RECYCLE.BIN`, `System Volume Information`) og **navn som «backup», «Backups», «Time Machine»**. Et for bredt filter (`/backup|recycle|snapshot/i`) skjuler brukerens mappe. Bare de eksakte systemnavnene over skal filtreres.
2. **Tilgang.** Brukeren har ikke **List folder / Read**-rett på mappen (Synology: «Ingen tilgang», TrueNAS-ACL, Windows NTFS). Da returnerer SMB `STATUS_ACCESS_DENIED` ved åpning, eller mappen utelates med Access-Based Enumeration (ABE). Fiks:
   - Vis mapper man ser men ikke har tilgang til med 🔒 og teksten «Ingen tilgang for {bruker}». Ikke skjul dem.
   - Ved ABE (mappen sendes ikke i det hele tatt): la brukeren **skrive stien manuelt** («/backup/homelab») og test den.
   - Hjelpetekst: «Gi brukeren {bruker} lese- og skrivetilgang til mappen i NAS-ens innstillinger.» Lenke til Synology DSM / TrueNAS når modellen er kjent.
3. **Egen share, ikke undermappe.** På mange NAS-er er «backup» en **egen share** (`//nas/backup`), ikke en mappe i `//nas/homes`. List alle shares på enheten (`NetShareEnumAll`) og la brukeren velge share først, så mappe. Ta med skjulte shares (`backup$`) når brukeren skriver navnet.
4. **Symlink / junction / montert volum.** Synology Hyper Backup-destinasjoner, Windows-junctions og ZFS-datasett kan være reparse points som listes som filer eller ikke vises. Behandle `FILE_ATTRIBUTE_REPARSE_POINT` og `DT_LNK` som mapper hvis målet er en mappe.
5. **SMB-versjon og protokoll.** Bruk SMB 3 (`vers=3.0` / smbprotocol). Med SMB1 eller feil dialekt kan noen shares og mapper mangle. Logg forhandlet dialekt.
6. **Sti og tegn.** Normaliser Unicode (NFC) og håndter æ/ø/å, mellomrom og store/små bokstaver (`Backup` ≠ `backup` på Linux-Samba).
7. **Paginering.** Store mapper: sørg for at listingen henter **alle** sider (`QUERY_DIRECTORY` til `STATUS_NO_MORE_FILES`), ikke bare de første ~100.

## C. Lagring feiler i valgt mappe
- Før lagring: **Test skrivetilgang**. Lag `.homelab-test-{uuid}`, skriv 1 KB, les, slett, og vis resultatet («✓ Kan skrive · 38 MB/s» / «✗ Ingen skrivetilgang: STATUS_ACCESS_DENIED»).
- Skriv til en midlertidig fil og `rename` når den er ferdig, så avbrutte backups ikke blir liggende som halve filer.
- Vis den faktiske SMB-feilen i UI og logg (ikke bare «Kunne ikke lagre»).
- Mount med `uid/gid` som tjenesten kjører som, `file_mode=0660,dir_mode=0770`, og legitimasjon fra en credentials-fil (`chmod 600`), ikke i kommandolinjen.

## D. UI (Innstillinger → Backup → HVOR → Nettverksdisk)
1. **Finn enhet**: skann med fremdrift → liste (navn, IP, modell). Under: **Legg til manuelt**.
2. **Logg inn**: bruker/passord (lagres kryptert). «Gjest» hvis anonym lesing er tillatt.
3. **Velg share** → **Velg mappe** (mappeleser):
   - brødsmulesti
   - alle mapper, 🔒 på de uten tilgang
   - **+ Ny mappe**
   - **Skriv sti manuelt**
   - **Vis skjulte**
4. **Test skrivetilgang** → **Bruk denne mappen**. Valgt mål vises som `smb://truenas.local/backup/homelab` med siste testresultat.

## Logging (for videre feilsøking)
Logg per forsøk: metode (mDNS/NetBIOS/WSD/445), antall funn, forhandlet SMB-dialekt, rå mappeliste fra serveren (navn + attributter) før filtrering og hvilke som ble filtrert bort og hvorfor. Da ser man med en gang om «backup» kom fra serveren og ble filtrert bort, eller aldri kom.

## Akseptkriterier
- [ ] Skann finner TrueNAS/Synology på samme nett innen 5 s, også når Homelab kjører i Docker.
- [ ] Mappen «backup» vises i sharen, eller vises med 🔒 og en forklaring hvis brukeren mangler tilgang.
- [ ] Man kan skrive stien manuelt, teste og lagre backup der.
- [ ] Feil viser den ekte SMB-feilkoden og et konkret tiltak.


---
# Oppdatering 2026-10-19: åpne undermapper + backup «tatt», men ingen filer

Tilbakemelding: SMB virker stort sett. Men (1) man kan ikke **åpne** den valgte mappen og velge en **undermappe** inni den, og (2) backup sier «tatt», men **det ligger ingen filer** i mappen.

## E. Mappeleser: naviger inn i mapper
- Trykk på en mappe **åpner** den, og den velges ikke med en gang. Hver rad har en egen knapp **Velg** (eller radioknapp), og øverst står **Bruk denne mappen**, som velger mappen man står i.
- Brødsmulesti `smb://truenas.local › backup › homelab`. Trykk på et ledd hopper opp. Tilbake-pil og sveip går ett nivå opp.
- **+ Ny mappe** lager en undermappe der man står (`mkdir`, tester skrivetilgang med en gang).
- Den lagrede stien er **share + full understi** (`{share:'backup', path:'/homelab/2026'}`), ikke bare sharen. Vis den som `smb://truenas.local/backup/homelab/2026`.
- Lazy-last innholdet per nivå (`QUERY_DIRECTORY` med paginering). Vis spinner per mappe. Tomme mapper viser «Tom mappe».
- Se også punkt **B** (🔒 / ABE / manuell sti).

## F. FEIL: «Backup tatt», men tom mappe
Sannsynlige årsaker. Sjekk alle:
1. **Skrevet lokalt, ikke til SMB.** Jobben skriver til `/srv/backup` (lokal standard) fordi målet ikke leses fra innstillingene, eller fordi monteringen feilet stille og `/mnt/smb-backup` er en **tom lokal mappe** (mount point uten mount). Fiks:
   - Les målet fra innstillingene i jobben.
   - Før skriving: sjekk `mountpoint -q` / at enhets-id ≠ forelder. Uten mount: **feil**, ingen stille fallback.
   - Bruk helst SMB-klient direkte (smbprotocol / libsmbclient) i stedet for kernel-mount i container.
2. **Feil understi.** Skriver til roten av sharen, eller til `share/share/…` (stien dobles), mens brukeren ser i undermappen. Logg den **faktiske** fullstien og vis den i UI.
3. **Temp-fil + rename feilet.** Filen skrives som `.homelab-tmp-*` (skjult) og `rename` til endelig navn feiler (rettigheter / `STATUS_OBJECT_NAME_COLLISION` / cross-device). Status settes likevel til OK. Fiks: `rename` må lykkes før status OK. Sjekk at skjulte temp-filer ikke ligger igjen, og rydd dem.
4. **Status settes før opplasting er ferdig.** Jobben markeres «ferdig» når arkivet er laget lokalt, ikke når det er **lastet opp og verifisert**. Fiks: status OK bare etter (a) skriving, (b) `fsync`/flush og close, (c) **verifisering**.
5. **Retention sletter med en gang.** «Behold 7 siste» med feil sortering eller tidssone sletter den nye filen rett etter skriving. Kjør retention **etter** verifisering og aldri på filen som nettopp ble laget. Logg hva som slettes.
6. **Synlighet på NAS-en.** Filen heter `.homelab-…` (punktum foran) og skjules i Finder/Explorer, eller ligger i en undermappe med dato. Bruk et synlig navn: `homelab-2026-10-19_2130-hele.tar.zst` (+ `.json`-manifest ved siden av).

## G. Verifisering og kvittering (obligatorisk)
- Etter opplasting: `stat` filen på SMB, sammenlign **størrelse** og **SHA-256** (les tilbake, eller beregn ved skriving og sammenlign med serverens størrelse), og list mappen og sjekk at filen er der.
- Backup-raden i UI viser: `✓ 2,4 GB · smb://truenas.local/backup/homelab/homelab-2026-10-19_2130-hele.tar.zst · verifisert`, med **Åpne mappe ›** (åpner mappeleseren der) og **Vis logg**.
- Feiler verifiseringen: status **Feilet** med årsak og push-varsel. Aldri «tatt» uten fil.
- Logg per kjøring: mål (share, sti), metode (smbclient/mount), bytes skrevet, hash, verifiseringsresultat, retention-handlinger og tid.

## Akseptkriterier (tillegg)
- [ ] Kan åpne «backup», gå inn i «homelab», lage «2026» og velge den.
- [ ] Etter «Ta backup nå» ligger `homelab-…tar.zst` + `.json` synlig i valgt mappe på NAS-en.
- [ ] Trekker man ut nettverkskabelen midt i, blir status «Feilet», og det blir ikke liggende en halv fil.
