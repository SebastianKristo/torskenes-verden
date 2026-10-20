# AI-jobber feiler (selvtest) + feil mappevalg i SMB-backup

Ønske 2026-10-20: «ser ut til mye feil her, for også feil med valg av mappe i backup smb»
Vedlegg: `vedlegg/ai-jobber-selvtest-feil.png`, `vedlegg/smb-mappe-feil.png`.

---

## Del 1 · AI → Jobber: alle selvtester feiler med «svarte ikke innen 15 s»

### Hva skjermbildet viser
- 38 feilede jobber. Alle selvtestene (brief, kunnskapsbase, domener, strekkoder, finans, kategorisering, kvitteringer, kalender) og «Glimt · anbefaler modeller» feiler med «Glimt fikk ikke svar fra <modell>: svarte ikke innen 15 s».
- Jobben som kjører står på «gemma4:12b · 0 % · Laster modellen fra disk …».
- Ingen modell svarer, også de små (llama3.2:3b, bge-m3). Da er det ikke modellene, men måten testene kjøres på.

### Årsaker (sjekk i denne rekkefølgen)
1. **Tidsgrensen på 15 s inkluderer innlasting.** En kald modell må først lastes fra disk til RAM/VRAM (gemma4:12b ≈ 8 GB tar ofte 20–90 s på Mac mini). Grensen må skille mellom *innlasting* og *svar*.
2. **For mange modeller samtidig.** «Maks 2 samtidig» + selvtest av 8 forskjellige modeller gjør at Ollama hele tiden laster ut og inn modeller (`OLLAMA_MAX_LOADED_MODELS`, minne). Da når ingen frem.
3. **Køen blokkeres av en hengende jobb.** «Anbefaler modeller» står på 0 % mens selvtestene starter. Testene venter i kø, men klokka starter med en gang de legges i kø.
4. **Feil adresse/proxy.** Sjekk at worker når Ollama (`http://ollama:11434` i Docker, ikke `localhost`) og at Cloudflare ikke kutter (100 s grense).

### Fiks
- **To tidsgrenser per kall:** `load_timeout` (standard 180 s, kan endres) og `response_timeout` (standard 60 s for tekst, 120 s for bilde). Klokka for svar starter først når modellen er lastet (Ollama `load_duration` / første token).
- **Varm opp før test:** `POST /api/generate {model, prompt:"", keep_alive:"10m"}` og vent til `ollama ps` viser modellen, *før* selvtesten starter.
- **Selvtest kjøres sekvensielt, én modell om gangen**, gruppert per modell (alle tester som bruker qwen3:8b kjøres etter hverandre mens den er lastet). Ikke parallelt med andre jobber.
- **Klokka starter når jobben faktisk kjører**, ikke når den legges i kø.
- **Sjekk minne først:** hvis modellen ikke får plass (`ollama show` størrelse > ledig RAM/VRAM), merk testen «Hoppet over · for lite minne (trenger 8,1 GB, ledig 5,2 GB)» i stedet for å vente til tidsavbrudd.
- **Helsesjekk før selvtest:** `GET /api/version` og `GET /api/tags`. Svarer ikke Ollama: stopp alle testene og vis én melding «Får ikke kontakt med Ollama på <adresse>» med knapp «Test tilkobling».
- **Hengende jobb:** en jobb som står på 0 % i mer enn `load_timeout` avbrytes automatisk med «Modellen ble ikke lastet (… s)».

### Visning i Jobber
- Feil med samme årsak **grupperes**: «8 selvtester feilet · tidsavbrudd 15 s» med pil for å se hver enkelt, og én knapp «Prøv alle igjen».
- Kort feiltekst på én linje: «Tidsavbrudd · lastet ikke inn på 15 s» / «Tidsavbrudd · svarte ikke på 60 s» / «For lite minne» / «Ingen kontakt med Ollama». Hele meldingen i detaljer.
- Kjører-raden viser faser: «Laster modellen fra disk · 4,1 av 8,1 GB» → «Tenker …» → «Svarer · 120 tegn».
- Tallet på Jobber-fanen (38) teller bare **nye** feil siden sist du så fanen, ikke hele historikken.
- «Prøv igjen» bruker de nye tidsgrensene.

### Test
- Kald start av gemma4:12b: selvtesten skal fullføre (innlasting ~60 s, svar < 60 s).
- Kjør hele selvtesten: modellene lastes én etter én, ingen tidsavbrudd på grunn av kø.
- Stopp Ollama: én samlet melding, ikke 38 feil.

---

## Del 2 · Backup → Nettverksdisk (SMB): «Ugyldig mappenavn» for `[05] Backup`

### Hva skjermbildet viser
`smb://10.69.1.126/Skogen/[05] Backup` avvises: «Ugyldig mappenavn. Bruk bokstaver, tall, mellomrom og . _ - ( ) + , = @ # ~ !». Hakeparenteser er lov i SMB/Windows/Synology-mapper, så valideringen er for streng. Tipsene under (slå på SMB, samme nett) handler om tilkobling og passer ikke til feilen.

### Fiks
- **Validering etter SMB-reglene:** bare disse tegnene er forbudt i et mappenavn: `\ / : * ? " < > |` og kontrolltegn. Navn kan ikke slutte på mellomrom eller punktum. Alt annet er lov, også `[ ] { } & ' æ ø å`.
- **Del adressen riktig:** `Skogen` = delt ressurs (share), `[05] Backup` = sti inne i den. Valider share og sti hver for seg.
- **Escape riktig når du kobler til:** bruk `smbprotocol`/`smbclient` med sti som egen parameter (ikke bygget inn i en kommandolinje), eller `mount -t cifs '//10.69.1.126/Skogen' … ` + `subdir`. Ved URL: prosent-kod `[`→`%5B`, `]`→`%5D`, mellomrom→`%20`. Aldri send stien gjennom `glob`/shell (hakeparenteser er glob-tegn – trolig den egentlige feilen).
- **Velg mappe i stedet for å skrive:** steg 3 får en **mappevelger**: etter innlogging listes delte ressurser (`NetShareEnum`), og man blar i mappene (mappeikon, navn, «Ny mappe»). Valgt sti vises som brødsmuler `Skogen › [05] Backup`. Skrive-feltet finnes fortsatt under «Skriv stien selv».
- **Riktig feilmelding per type:**
  - Ugyldig navn → «Mappenavnet kan ikke inneholde \ / : * ? " < > |» (vis hvilket tegn), ingen nettverkstips.
  - Finnes ikke → «Fant ikke mappen «[05] Backup» i Skogen» + «Opprett mappen».
  - Ingen tilgang → «Brukeren sebastian har ikke skrivetilgang til mappen».
  - Får ikke kontakt → nettverkstipsene (IP, SMB på, samme nett).
- **Skrivetest:** testen lager og sletter `.homelab-test` i mappen, så vi vet at backup kan skrives.
- «Lagre» er grå til testen er OK, men har lenken «Lagre likevel» (med advarsel) for når NAS-en er av akkurat nå.

### Utseende i veiviseren
- Følg Papir: avrundede knapper (radius 999 for primær/sekundær, 12 for felt), ikke firkantede. Ikonet foran adressen er en NAS-/mappeikon i 36 × 36-rute, ikke tegnet «▤».
- Adressen vises i vanlig skrift med share og sti som brødsmuler; monospace bare i «Detaljer».

### Test
- `Skogen/[05] Backup`, `Skogen/Bilder & video`, `Skogen/Æøå` → godkjennes og testen skriver filen.
- `Skogen/Backup?` → «Mappenavnet kan ikke inneholde ?».
- Mappevelger: bla til mappen og velg den uten å skrive.
