# Innstillinger: samle relaterte ting og rydde menyen

Design: `Innstillinger Web.dc.html` (sidemeny + sider), `AI Kontroll v2.dc.html`, `System.dc.html`. Bygger på `claude-code-ai-innstillinger-kompakt.md` (rad-/kortsystemet).

## Regel
Hver innstilling finnes **ett** sted. Andre steder viser bare status + en lenke («AI ›», «Integrasjoner ›»), aldri en kopi av kontrollen.
- Nøkler, adresser og tokens for eksterne tjenester → **Integrasjoner** (AI-tjenester → **AI → Tjenester**).
- Hvordan en modul oppfører seg → modulens egen side under **Moduler**.
- Hva Glimt sier og hvordan → **Glimt**. Hvilken modell som gjør jobben → **AI**.

## Ny sidemeny
| Gruppe | Side | Inneholder (og flyttet fra) |
|---|---|---|
| GENERELT | Konto | Profil, e-post · Passord, 2FA, økter og enheter (fra **Sikkerhet/Innlogging**) |
| | Utseende | Tema, fargetema · Widgets og rekkefølge, bakgrunn på forsiden (fra **Startside**) |
| | Varsler | Push, e-post, **ntfy** (fra System → Helse), stille timer |
| | App | Faner, haptikk, språk |
| HUSSTAND | Brukere og familie | Roller, tilgang, inviter · Barn og foresatte (fra **Familie**) · Hvem får Homelab/Domener/Aksjer og Glimt-figur per bruker (fra **System → Mer → Brief og Glimt-figur**) |
| GLIMT OG AI | Glimt | Figur, brief, stemme, venner · Personlighet, «Send til Chat etter», nettsøk-rekkefølge, Glimt husker (fra **AI → Glimt og chat**) |
| | AI | Oversikt, Modeller, Oppgaver, Kvitteringer, Tjenester, Jobber, Forbruk. Chat-brytere («La Chat lese mine data», «Spør før sky-modeller») og AI-logg ligger nå i **Oppgaver → Regler**. Fanen «Glimt og chat» fjernes. |
| TILKOBLINGER | Integrasjoner | Alle API-nøkler og tjenester. «Kalendere»-kortet her fjernes (lenke til Kalender og gjøremål). |
| | Kalender og gjøremål | Google, iCloud, skole · Lister og synk (fra **Gjøremål**) · Home Assistant to-do (fra **Integrasjoner**) |
| MODULER | Domener, Finans, Media, Nyheter, Ruter, Studie, Vær | Moduloppsett. Domener flyttes hit fra Generelt. Ruter viser Entur-status med lenke til Integrasjoner; Finans lenker til AI → Kvitteringer; Nyheter lenker til AI → Oppgaver for nyhetssammendraget. |
| SERVER | System | Oversikt (helse), Oppdateringer, Ytelse, Selvreparasjon, Mer (kvalitet). **Backup-fanen fjernes her.** |
| | Backup | Kopier, gjenoppretting, database (samme innhold som tidligere System → Backup; én kilde) |
| | Logger | Uendret |

Fjernet som egne menypunkter: **Startside**, **Familie**, **Gjøremål**, **Sikkerhet/Innlogging**. Gamle lenker/dyplenker og søkeindeksen (`IDX`) skal peke til nye steder (f.eks. `startside` → `utseende`, `2fa` → `konto`, `familie` → `brukere`, `gjøremål` → `kalendere`).

## Sidemenyen (stil)
- Punkt 38 px høyt (var 44), ikonflis 26 px radius 8 med 14 px ikon (var 30/16), tekst 14,5 px med ellipsis.
- Gruppeetiketter grå mono (`#8f897c`), ikke røde – samme som seksjonsetikettene på sidene.
- Badge kun der noe krever handling (Integrasjoner).

## Sider uten eget design ennå
Bruk samme seksjon + kort + rad som AI/System: grå mono-etikett, hvitt kort radius 14, rad 46 px med tittel, chevron. Ting som er flyttet får en liten oransje mono-tag «FLYTTET FRA …» i den første versjonen etter endringen (fjernes i neste versjon).

## Innebygde sider
- Glimt-siden bygger inn `AI Kontroll v2` med `only="glimt"` (ingen faner, bare seksjonene).
- Backup-siden bygger inn `System` med `only="bak"`.
- `only` skjuler fanelinjen; `embed` skjuler egen tittel og Ferdig.

## Akseptkriterier
- Ingen innstilling kan endres to steder (søk i koden etter samme nøkkel/state-felt i to sider).
- Alle gamle menypunkter som er fjernet, sender brukeren til riktig ny side via søk og dyplenker.
- Sidemenyen får plass uten scroll på 900 px høy skjerm fram til og med MODULER.

## Ikoner på alt
Samme regel som AI-siden (`claude-code-ai-innstillinger-kompakt.md` § Ikoner på alt) gjelder nå **alle** innstillingssider: hver fane har 15 px strek-ikon, hver rad har 28 px ikonflis (`#ece6da`, ikon `#4a463f`), statusprikk som 9 px merke på flisen. System: containere = boks, disk/backup = disk, database = database, oppdateringer = sirkelpiler, tilbakerulling = angre, røyktest = kolbe, trege forespørsler = klokke (/api/health = puls), feature flags = flagg, krasjrapporter = insekt. Konto/Utseende/Varsler/App/Brukere/Kalender/Moduler: ikon etter innhold (passord = nøkkel, 2FA = skjold, push = bjelle, språk = globus, kalender = kalender, timeplan = bok osv.). Sidemenyen beholder fargede fliser.
