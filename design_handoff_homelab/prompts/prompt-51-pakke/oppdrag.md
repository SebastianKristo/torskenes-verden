# Prompt 51: forbedringslista (alt unntatt det brukeren valgte bort)

Mottatt 2026-10-24. Status: **godkjent** («ja til alt, dropp bankintegrasjon og CarPlay, sett i gang»). Rekkefølge: kvitteringsrettingen og fase 1 først, fase 3 (Glimt) etter prompt 49. Brukerens tekst: «legg til alt uten om dette» + lista som ikke skal bygges (se nederst).

## Skal bygges
**Glimt:** proaktiv Glimt (med ukentlig grense og «ikke nå») · Glimt som handler, med «Angre siste 10 handlinger» · dokument-spørsmål på tvers med kilde (kvitteringer, Boliger, Studie, e-post, notater) · garanti fra kvitteringer (2/5 år) med varsel · stemme lokalt (Whisper + Piper på Mac minien, «Hei Glimt») · bildeforståelse utover kvitteringer (skilt, plante, del, regning → riktig modul) · personlige rutiner · «Hvorfor svarte du det?» (lesbart spor) · tillitsnivå per verktøy (les fritt / spør før skriving / Face ID før betale eller sende).
**Finans:** sparemål med fremdrift og «rund opp» · faste utgifter-kalender med saldoprognose dag for dag · skattehjelp (fradragsposter, påminnelse, eksport) · prishistorikk fra kvitteringer (prisøkning, billigste butikk) · abonnementsjeger (prisøkninger, doble, ubrukte, oppsigelsestekst).
**Hjem:** scener fra Glimt («Filmkveld» …).
**Familie:** felles familiekalender med «hvem kjører?» (henting/bringing som oppgave + Ruter-forslag).
**Media:** «Hva skal vi se i kveld?» (eget bibliotek, hvem er hjemme, historikk) · norske undertekster (Bazarr + Whisper) · lagring med anbefaling (sett og stort, slett med angre) · lydbøker og podkaster (Audiobookshelf) med «fortsett der du slapp».
**Backend og drift:** helsedashbord for hele homelaben med trendvarsel · selvreparasjon (omstart, issue-utkast) · backup med ukentlig testet gjenoppretting og 3-2-1 · staging-kanal for oppdateringer med tilbakerulling · database-vedlikehold (WAL, VACUUM, integritet, størrelse per tabell, migrasjonslogg) · revisjonslogg (innlogginger, nye enheter godkjennes, nytt land) · passkeys (WebAuthn) · rotering av hemmeligheter + sjekk at ingen nøkler er i loggene · rate limiting/sperre på innlogging og QR · spor for trege forespørsler · ntfy (selvhostet push).
**AI:** modellruter etter oppgave og last · lokale embeddings og hybrid søk (FTS5 + vektor) over alt · oMLX når eval er grønn · eval i CI (mock) + kvalitetskurve · kostnad og personvern per svar + månedssammendrag.
**Appene:** widgets og Live Activities (Sjekk inn, pakker, nedlastinger, avganger) · Apple Watch- og Wear OS-app · App Intents/App Actions · offline-modus med synkkø for alle moduler · Android Auto · felles søk (⌘K / sveip ned) med handlinger · tilgjengelighet (dynamisk tekst, VoiceOver/TalkBack, kontrast i CI) · onboarding for nye familiemedlemmer · tema per bruker og automatisk tema.
**Kvalitet:** visuelle regresjonstester (web/PWA/iOS/Android) · ende-til-ende-tester for de kritiske flytene · feature flags per bruker/enhet · selvhostet krasjrapportering (GlitchTip) · «Nytt i denne versjonen» i appen.

## Skal IKKE bygges (brukerens valg)
Bankintegrasjon (PSD2) · CarPlay · Dagsplan-agent · «Hva har endret seg?» · budsjett per kategori med prognose · delte utgifter · strømregning mot spotpris · strømsmart styring · fravær og tilstedeværelse · lekkasje/røyk/vindu-varsler · vedlikeholdskalender for huset · energi-dashbord · lommepenger · skjermtid og leggetid · matplan til butikkhyller og prissammenligning · restemat · «Hvem henter?» for pakker · felles minnebok · familieprofiler med aldersgrense.

## Avhengigheter
Kvitteringsrettingen (tillegg til prompt 48, Del B–E) og prompt 49 (venter på eval) går foran Glimt-delene her, som bygger på de samme modulene.
