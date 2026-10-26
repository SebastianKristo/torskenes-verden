# Innstillinger → AI: kompakt, uniform redesign

Design: `AI Kontroll v2.dc.html`. Erstatter dagens AI-side og de løse seksjonene under den (Kvitteringer, «Chat, Glimt og personvern», Open WebUI-serveroppsett, Glimt husker). Ingen funksjoner fjernes – de flyttes og får samme komponent.

## 1. Navigasjon
- Fjern den vertikale undermenyen (Oversikt/Modeller/Valg …) – den tar ~270 px ved siden av innstillingsmenyen.
- Ny horisontal fanerad under tittelen, sticky sammen med headeren:
  `Oversikt · Modeller · Oppgaver · Glimt og chat · Kvitteringer · Tjenester · Jobber · Forbruk`
- Fane: 38 px høy, 13,5 px/600, aktiv = blekk + 2 px understrek. Teller-badge: Jobber (feilede i dag, rød), Tjenester (tjenester som feiler, oransje).
- Header: ikon 36 px, «AI» Newsreader 26 px, statuslinje 12,5 px på én linje. Ingen kursiv undertittel på 24 px.
- Innhold maks 940 px bredt, 16 px luft over, 20 px mellom seksjoner.

## 2. Én rad-komponent overalt
Alle lister bruker samme rad (`SettingsRow`):
- Min-høyde 46 px (tweak «luftig» = 56), padding 8 px 0, skillelinje 1 px `#ddd5c5` mellom rader.
- Venstre (valgfritt): statusprikk 8 px **eller** ikonflis 28 px (radius 8, `#ece6da`, mono-forkortelse).
- Midt: tittel 13,5 px/600 (mono 13 px for modell-id-er, kommandoer), undertekst 12 px grå, **én linje med ellipsis**. Valgfri liten mono-tag (STANDARD, I MINNET, PASSER/TRANGT/FOR STOR) rett etter tittelen – ingen fargede piller.
- Høyre (valgfritt, wrapper under på smal skjerm): verdi (mono 11,5 px), select, segmentert kontroll, knapper, bryter, chevron.
- Utvidbar: chevron roterer 90°, panel under raden med felter, knapper og forklaring.

Kontroller – samme høyde og form overalt:
- Knapp 30 px pill. Primær = blekk (`#1b1a17`), sekundær = 1 px kant, fare = rød tekst uten kant. **Ikke rød «Lagre»** (Mac-OCR i dag).
- Segmentert 30 px (2 px innpakning `#ece6da`, aktiv hvit med skygge). Høyrestilt i raden, aldri full bredde.
- Select 30 px pill, mono 12 px, egen chevron.
- Bryter 36×22 grønn `#2f7a4f`.
- Felt 34 px, radius 10, `#f3efe6`, mono 12,5 px; etikett 96 px til venstre.

Kort: `#fffdf8`, radius 14, padding 0 14 px, ingen skygge, ingen grå «kort i kort». Seksjonsetikett: mono 10,5 px, letter-spacing .12em, grå (ikke rød, ingen strek under). Valgfri høyretekst/lenke i etiketten («Kopier alle», «67,7 GB på disk»).
Banner (status): tonet bakgrunn + prikk + tittel/undertekst + én knapp. Brukes for feil, «Finansdata forlater aldri huset» og liknende.

Fjern: grå bakgrunnskort (Kvitteringer), rød seksjonsstrek («CHAT, GLIMT OG PERSONVERN»), lilla ikonfliser på hver rad, «Åpne→ / Vis→ / Lagre→»-tekstlenker, grå notatbokser – notater er vanlig 12 px tekst under kortet.

## 3. Innhold per fane
**Oversikt**: KPI-stripe (4 celler i ett kort: Kjører, I minnet, Tokens 30 d, Sky-kostnad – klikk går til fanen). Feilbanner hvis jobber feilet. Selvtest som én rad; resultater som rader under (prikk + melding + «Bytt modell»). Maskin (3 rader med tynn 4 px stolpe). Anbefalt oppsett: hver env-linje er én rad med mono-tittel + «Kopier», «Kopier alle» i etiketten, «Avansert» utvidbar. Tjenester-sammendrag (prikk + latens, klikk åpner tjenesten).
**Modeller**: segmentert `Installert · Last ned · Sky`. Installert-rad: prikk, id, tag, metadata på én linje (`8.3B · 6 GB · Q4_K_M · bilde · sist brukt …`), **keep_alive-select i raden** (flyttet fra Valg – 7-valgs segment per modell fjernes), «Last inn/ut», chevron → «Bruk som standard», «Slett · frigjør X GB», «Brukes av: …». Last ned: søk + chips + rader med PASSER/TRANGT/FOR STOR-tag. Sky: rad med bryter.
**Oppgaver** (før «Valg»): «La Glimt velge modeller»-rad. Én tabell: oppgave | modell-select | reserve-select | Ollama/oMLX-segment. «Motor per oppgave» slås sammen inn i denne. Avvik fra anbefaling vises som oransje undertekst «Glimt anbefaler …». Spør Glimt-felt. Regler (inkl. «Bruk Ollama hvis oMLX ikke svarer»). Parametre: én rad per parameter med segment til høyre.
**Glimt og chat**: Personlighet, Send til Chat etter, Chat-brytere, standardmodell (lenke til Oppgaver), nettsøk-rekkefølge (↑↓), Glimt husker, AI-logg.
**Kvitteringer**: banner, Steg i kjeden (status + bryter i samme rad – «Status» og «Steg» slås sammen), Tolking, Logoer. Mac-OCR-oppsett flyttes til Tjenester.
**Tjenester** (før «API og nøkler» + løse oppsettkort): backend-segment øverst, deretter gruppene Kjøring / Mac mini / Server / Sky. Hver tjeneste er én utvidbar rad: ikonflis, navn, undertekst, statusprikk + tekst. Utvidet: Adresse, Nøkkel («satt»-tag, aldri vist), ekstra felt (oMLX-modeller), `Lagre` (primær) · `Test` · `Fjern nøkkel`, forklaring. Samme oppsett for Ollama, oMLX, Open WebUI, Mac-OCR, NB-Whisper, VoxCPM2, Phonon, neutrino, Voz, SearXNG, Gemini, Groq. Glimt-API og Importer under «Andre».
**Jobber**: statusrad med Pause/Tøm, feilbanner, Feilet (gruppert, utvidbar: detaljer + «Prøv igjen»), Siste.
**Forbruk**: periode-segment, KPI-stripe, stolpediagram, per funksjon (rad + 4 px stolpe), budsjett som segment + brytere.

## Akseptkriterier
- Ingen side har mer enn én kort-/rad-stil; alle knapper 30 px, alle segment/select 30 px.
- AI-siden har ingen vertikal undermeny; fanene er sticky.
- Ingen tekstlinje i rader brytes over to linjer på web (ellipsis); på mobil wrapper kontrollene under teksten.
- Alle innstillinger fra før finnes fortsatt, bare flyttet (se fanelisten).
- Mobil (<600 px): samme komponenter, fanerad scroller horisontalt.

## Innkobling
- Innstillinger → AI og AI-overlegget fra dashboardet (web) bruker nå den nye siden. Gamle fane-nøkler mappes: `rt` → Oppgaver, `api`/`imp` → Tjenester.
- Innebygd i Innstillinger (`embed`): ingen egen Ferdig-knapp, ingen 100vh-høyde – siden scroller med innstillingene, og headeren med fanene er sticky.
- Som overlegg: containeren scroller (`overflow-y:auto`), Ferdig lukker.

## System (Innstillinger → System)
Design: `System.dc.html`, samme komponenter som AI-siden (fanerad, rad, kort, banner, KPI-stripe). Nordlys-hero, oppdater-knapp og «Krev passord» beholdes øverst; alt under erstattes av fanene:
- **Oversikt**: helse-banner (Oppdater), KPI-stripe (Containere, Disk, Ollama, Backup), Containere (prikk + mono-navn + CPU/minne + running), Maskiner og tjenester (Data-mappen med stolpe, Mac mini, Ollama, Mac-OCR, Proxmox/ntfy med «Sett opp»). Erstatter de 8 like grå flisene.
- **Oppdateringer**: Automatiske oppdateringer (bryter), Staging (utvidbar rad med røyktest-sjekkene + «Prøv ny versjon i staging» / «Gå tilbake til 4.47.0»), Versjoner (mono-rad, dato · endringer, «Installert …» grønt til høyre, «Vis flere» i etiketten).
- **Backup**: banner «Backup trenger tilsyn» (3-2-1-status + Oppsett), Kopier (Lokal disk + Ta backup nå, restic-bryter, utenfor huset), Gjenoppretting (5 steg som prikk-rader, «Test nå»), Database (Integritet, VACUUM med hver sin knapp). De fire store kortene med fargekant fjernes.
- **Ytelse**: Trege forespørsler som rader (mono rute, «Mest tid i … · tregest: …», ms · status · tid, 4 px stolpe i kategorifarge) – ikke store grå kort. Per rute: én rad per rute med «N kall · N trege» og p50 · p95 til høyre (rød over 60 s) – erstatter tabellen.
- **Selvreparasjon**: bryter + «Maks omstarter per time» som segment (1/3/5/10), Historikk.
- **Mer**: Lokale modeller, Brukere, Kvalitet (Feature flags, Krasjrapporter, Nytt i denne versjonen) som rader med chevron – ikke «Åpne→».

## Fiks: dobbel overskrift
Innebygd i Innstillinger skal AI- og System-siden **ikke** tegne egen ikon/tittel/statuslinje – Innstillinger viser allerede «AI · Modeller, jobber, forbruk og nøkler». Bare den sticky fanelinjen vises, rett under Innstillinger-overskriften. Statuslinjen («10 lokale modeller · 6 i skyen …») kan erstatte Innstillinger-undertittelen for AI.

## Flytting fra System → Mer til AI
- «Desert Ant Labs-modellene» → AI → Modeller (Installert), egen seksjon «LOKALE MODELLER · DESERT ANT LABS» under listen.
- «Brief og Glimt-figur» → AI → Glimt og chat, seksjon «BRUKERE» før Personvern.
- System → Mer har nå bare Kvalitet (Feature flags, Krasjrapporter, Nytt i denne versjonen).

## Ikoner på alt (AI)
- Hver fane får et 15 px strek-ikon foran navnet (Oversikt puls, Modeller brikke, Oppgaver gren, Glimt og chat gnist, Kvitteringer kvittering, Tjenester server, Jobber liste, Forbruk stolper).
- Hver rad får en 28 px ikonflis (`#ece6da`, radius 8, 15 px strek-ikon `#4a463f`, stroke 1.9). Statusprikken flyttes til et 9 px merke nederst til høyre på flisen (2 px kant i kortfarge), i stedet for en egen prikk foran tittelen.
- Modeller: ikon etter type (tekst = brikke, bilde = bilde, embedding = lag, resonnering = hjerne). Tjenester: eget ikon per tjeneste (Ollama brikke, oMLX lyn, Open WebUI globus, Mac-OCR øye, NB-Whisper/Phonon/Voz mikrofon, VoxCPM høyttaler, SearXNG søk, Gemini gnist, Groq lyn). Sky-modeller beholder bokstavflis (G / GQ). Nettsøk beholder rekkefølgetall.
- Øvrige rader: ikon velges etter innhold (kalender, kvittering, nøkkel, skjold for personvern, klokke for tidsgrenser, termometer for temperatur osv.). Bruk samme ikonsett som resten av appen.

## Endret av samle-runden
- AI-fanen «Glimt og chat» er fjernet: Glimt-delen vises under Innstillinger → Glimt (`only="glimt"`), Chat-brytere og AI-logg ligger i Oppgaver → Regler. Se `claude-code-innstillinger-samlet.md`.
- System-fanen «Backup» er fjernet; Backup er egen side (`only="bak"`).
