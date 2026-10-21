# Web: Tab godtar Glimt-forslaget (hele systemet, bare web)

Ønske 2026-10-21: «i hele systemet på web bare på web, når noe står som forslag i Glimt hvis man tar "tab" på tastaturet skriv det som er foreslått.» (vedlegg `uploads/Screenshot 2026-10-21 at 14.08.38.png`: «Spør Glimt: «legg til Severance i 4K»»)
Fasit: `Media.dc.html` (Glimt-feltet øverst: `gTab`, `gGhost`).

## Oppførsel
- **Tomt felt + Tab** → forslaget i «…» skrives inn i feltet (uten «Spør Glimt:» og anførselstegn), og markøren havner til slutt. Enter sender.
- **Skriver man begynnelsen av forslaget** («legg ti») vises resten som **grå spøkelsestekst** etter markøren. Tab fullfører.
- Liten **Tab**-brikke (mono, ramme) til høyre i feltet når Tab gjør noe. Skjules ellers.
- Når Tab ikke har noe forslag: vanlig Tab (neste felt). **Shift+Tab** er alltid vanlig.
- Flere forslag (forslagslisten under feltet): Tab godtar det markerte, ↑/↓ bytter.

## Hvor
Gjelder alle Glimt-felt **på web**: Hjem-søket, Chat, Kalender («Spør Glimt eller skriv en hendelse»), Gjøremål, Finans-søk, Media, Domener, Studie, Matplan. Lag én felles komponent `<GlimtInput suggestion>` med denne oppførselen, så alle får den.
- Forslaget kan være fast (plassholder) eller komme fra Glimt (siste lignende spørsmål, «neste naturlige» handling).
- **Ikke på mobil/nettbrett med skjermtastatur** (`pointer: coarse` og ingen fysisk tastatur-hendelse). iPad med tastatur: på.

## Forslag mens man skriver (2026-10-21)
Ønske: «legg derfor da til forslag når man skriver»
- Under feltet: liste med opptil **5 forslag** (✦ + tekst), først de som **begynner med** det man har skrevet, så de som **inneholder** det (fra 2 tegn).
- Det øverste/markerte vises som grå spøkelsestekst i feltet. **Tab** fullfører, **↑/↓** bytter, **Esc** lukker, klikk velger. Bunntekst: «TAB FULLFØRER · ↑↓ VELGER · ESC LUKKER».
- Kilder (Media-eksempel): faste kommandoer («pause alle nedlastinger», «hva kommer i morgen» …) + titler i biblioteket («finn The Diplomat», «hvor langt har … kommet», «last ned … på nytt»). I appen: + siste spørsmål brukeren har stilt, + forslag fra Glimt/Ollama (maks 150 ms, ellers bare lokale).
- Hver modul har sin egen liste (Kalender: «ny hendelse i morgen kl. 10», Gjøremål: «husk å …», Finans: «hva brukte jeg på mat i oktober»).
