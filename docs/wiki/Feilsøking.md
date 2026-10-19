# Feilsøking

Start med disse tre:

```bash
curl http://localhost:3000/healthz            # skal svare ok
docker compose logs --tail 100 os             # feilmeldinger fra serveren
docker compose ps                             # kjører containerne?
```

Integrasjoner har **Test**-knapper i Innstillinger → Integrasjoner, som viser nøyaktig hva som er galt. AI-feil står i FinansHub → Innstillinger → AI og tolkning → AI-logg.

**Innhold:**
[Google: private IP](#google-device_id-and-device_name-are-required-for-private-ip) · [Apple Health](#apple-health-dukker-ikke-opp) · [AI-søk stopper etter 30 s](#ai-søket-stopper-etter-30-s) · [Android krasjer](#android-appen-krasjer-ved-oppstart) · [Kart 403](#kartet-er-grått-eller-viser-403) · [Familie-deling av](#familie-viser-ingen-etter-oppdateringen) · [Ukjent integrasjon](#ukjent-integrasjon) · [PostNord](#postnord-uten-organisasjonsnummer) · [Andre feil](#andre-vanlige-feil)

---

## Google: «device_id and device_name are required for private IP»

**Hva skjer:** du trykker «Logg inn med Google» og får denne feilen fra Google (ofte med «Error 400: invalid_request»).

**Årsak:** omdirigeringsadressen er en privat IP, for eksempel `http://192.168.1.60:3000/api/birthdays/google/callback`. Google godtar bare **https med et offentlig domenenavn**, eller `http://localhost`.

**Løsning:**

1. Gjør serveren tilgjengelig på et domene med https, for eksempel med Cloudflare Tunnel, se [Installasjon](Installasjon#cloudflare-tunnel-anbefalt).
2. I Google Cloud Console → Credentials → OAuth-klienten: legg til
   `https://os.example.no/api/birthdays/google/callback` under **Authorized redirect URIs**.
3. I Homelab → Integrasjoner → Google Kalender: sett **Omdirigerings-URI** til den samme adressen, eller la feltet stå tomt.
4. Åpne **`https://os.example.no`** (ikke IP-adressen) og logg inn med Google derfra.

Får du «redirect_uri_mismatch», er adressen i Google Cloud ikke nøyaktig lik den serveren sender. Sjekk `https`, domenet og at det ikke er `/` på slutten.

Får du «Access blocked: … has not completed the Google verification process», mangler Google-kontoen din på listen over **testbrukere**. Se [Integrasjoner → Google Kalender](Integrasjoner#2-samtykkeskjermen-oauth-consent-screen).

---

## Apple Health dukker ikke opp

**Hva skjer:** iOS-appen spør aldri om tilgang til Apple Health, og appen står ikke under Helse → Apper.

**Årsak:** nesten alltid sideloading. Med gratis Apple-ID fjerner Sideloadly (med «Remove entitlements»), AltStore eller SideStore ofte HealthKit fra signaturen. Da får ikke appen lov til å spørre.

**Sjekk:** Innstillinger → App → Helse og posisjon i appen viser hvorfor appen ikke får spørre (fra 4.17).

**Løsning:**
- Signer appen med en betalt Apple-utviklerkonto, eller bygg den selv i Xcode med ditt team. Da beholdes HealthKit.
- Med gratis Apple-ID: prøv å installere **uten** «Remove entitlements». Feiler installasjonen, må du velge mellom Apple Health og å installere med fjernede entitlements.
- Alt annet i appen virker uten HealthKit.

---

## AI-søket stopper etter 30 s

**Hva skjer:** AI-søket gir opp etter rundt 30 sekunder, selv om Ollama er satt til 60 s.

**Årsak:** en fast grense på 30 s i appene og på serveren. Den er **rettet i 4.17.0**, og serverdelen i 4.18.0.

**Løsning:**
1. Oppdater serveren til 4.18.0 eller nyere, se [Oppdatering og backup](Oppdatering-og-backup).
2. Oppdater Android- og iOS-appen fra [Releases](https://github.com/SebastianKristo/torskenes-verden/releases).
3. Sett tidsgrensen for motoren under FinansHub → Innstillinger → AI og tolkning → Tidsgrenser.
4. Har du egen reverse proxy, sett tidsgrensen der til minst 5 minutter, se [Installasjon](Installasjon#egen-reverse-proxy-caddy-eller-nginx).

Nå kjøres lange søk som jobb med fremdrift og Avbryt. Se [AI og tidsgrenser](AI-og-tidsgrenser).

---

## Android-appen krasjer ved oppstart

**Hva skjer:** appen lukker seg med en gang den åpnes. Det gjaldt versjonene fra 4.11.0 til 4.12.x.

**Årsak:** oppstartskoden brukte deler av appen som ikke var klare ennå. Det er **rettet i 4.13.0**.

**Løsning:** installer siste APK fra [Releases](https://github.com/SebastianKristo/torskenes-verden/releases) over den gamle. Kommer du fra 4.6.0 eller eldre, avinstaller først (signaturnøkkelen ble byttet i 4.6.1).

Krasjer den fortsatt? Hent loggen med en PC:

```bash
adb logcat -d | grep -iE "AndroidRuntime|FATAL" -A 20
```

Legg ved loggen i en [issue](https://github.com/SebastianKristo/torskenes-verden/issues).

---

## Kartet er grått eller viser 403

**«403 Access blocked»:** OpenStreetMap blokkerer apper som henter fliser direkte. Fra 4.12.0 går alle kartflisene gjennom serveren (`/tiles/...`), og standardkartet er Kartverket topo. **Oppdater serveren og appene.**

**Grå fliser:** serveren får ikke hentet fliser fra leverandøren, og sender da en nøytral grå flis (eller en eldre flis fra cachen). Sjekk fra serveren:

```bash
docker compose exec os node -e "fetch('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/5/9/16.png').then(r => console.log(r.status), e => console.log('feil:', e.cause?.code || e.message))"
```

- Skriver den ikke `200`, mangler serveren tilgang til internett (brannmur, DNS eller proxy).
- Har du valgt MapTiler eller Stadia, sjekk nøkkelen med **Test** under Integrasjoner → Kart.
- «API KEY REQUIRED» i kartet betyr et gammelt kartoppsett. Kartverket topo er standard fra 4.13.0.

---

## Familie viser ingen etter oppdateringen

**Årsak:** fra 4.13.0 er posisjonsdeling **av som standard**, også for dem som delte før. Du ser bare personer som deler med deg.

**Løsning:** hver person må åpne appen og slå på deling under **Innstillinger → App → Helse og posisjon**. Se [Familie og kart](Familie-og-kart#slå-på-deling).

Soner du har laget, er dine egne til du slår på «Del med familien».

---

## «Ukjent integrasjon»

**Hva skjer:** **Test** eller **Lagre** på en integrasjon gir «Ukjent integrasjon» (HTTP 404).

**Årsak:** appen og serveren har ulik versjon, og appen ber om en integrasjon serveren ikke kjenner. Det kan være en ny integrasjon i en gammel server, eller omvendt. Fra 4.19 heter for eksempel kalenderoppsettet `calendars` (Kalendere), og den gamle `calendar` er skjult.

**Løsning:**
1. Oppdater **serveren** først, og deretter **appen**, til samme versjon.
2. Last nettsiden på nytt med Ctrl+Shift+R.
3. Listen over gyldige ID-er får du med
   `curl -s https://os.example.no/api/integrasjoner -H "Authorization: Bearer $TOKEN" | jq '.[].id'`.

Får du «Bare administratorer kan se og endre serveroppsettet» (403), er integrasjonen serveroppsett. Be admin sette den opp.

---

## PostNord uten organisasjonsnummer

PostNords offisielle API krever organisasjonsnummer. **Du trenger det ikke.** La feltet API-nøkkel under Integrasjoner → PostNord stå tomt:

- Pakken får en sporingslenke til postnord.no/pakkesporing.
- Status hentes fra PostNords offentlige sporingsside (ikke et offisielt API, så det kan slutte å virke).
- Feiler det, er ParcelsApp reserven, se [Integrasjoner → ParcelsApp](Integrasjoner#parcelsapp).
- Du kan også tvinge en pakke over til ParcelsApp med hold inne → **Spor via**.

---

## Andre vanlige feil

| Symptom | Årsak og løsning |
|---|---|
| Innloggingen «virker», men du kastes ut igjen | Du bruker `http://` med `COOKIE_SECURE=true`. Sett `COOKIE_SECURE=false` i `.env` (bare uten https), og start på nytt. |
| Glemt passord eller mistet 2FA | `docker compose exec -u 1000 os npm run reset-password -- brukernavn` (bruk din PUID) |
| Appen får ikke kontakt | Skriv `http://` foran lokal adresse, sjekk porten, og at telefonen er på samme nett. Bak Cloudflare Access: slipp `/finans/api/*`, `/api/*` og `/tiles/*` forbi. |
| <a id="ios-widgeten-viser-logg-inn"></a>iOS-widgeten viser «Logg inn» | Åpne appen → Innstillinger → Widgets → «Oppdater widgetene nå». Installer IPA-en på nytt hvis widgetene ikke er koblet til appen. |
| Ser ingen endringer etter oppdatering | Hard reload (Ctrl+Shift+R). Lukk og åpne PWA-en. |
| «Ollama kan ikke nås på http://…:11434» | Ollama lytter bare på localhost. Sett `OLLAMA_HOST=0.0.0.0` og start Ollama på nytt, se [Integrasjoner → Ollama](Integrasjoner#ollama-lokalt-ingenting-forlater-huset). |
| «Gemini svarte ikke innen 20 s» | Øk grensen under Tidsgrenser, eller legg til reservenøkler eller Groq. |
| Gemini 429 hele tiden | Dagskvoten er brukt opp. Legg til flere nøkler fra ulike Google-prosjekter. |
| IMAP: AUTHENTICATIONFAILED | Du har brukt Proton-passordet. Bruk **Bridge-passordet** fra `info`. |
| Trading 212: 401 | Nøkkelen hører til det andre miljøet (live/demo), eller secret mangler. |
| Kan ikke dekryptere lagrede nøkler | `SESSION_SECRET` er byttet uten `SECRET_KEY`. Lim inn nøklene på nytt. |
| `storage 'local-lvm' does not exist` (Proxmox) | Sett `STORAGE=` foran installasjonskommandoen. |

Finner du ikke svaret her? Opprett en [issue](https://github.com/SebastianKristo/torskenes-verden/issues) med versjon, hva du gjorde, og utdrag fra `docker compose logs os`. Fjern nøkler og adresser først.
