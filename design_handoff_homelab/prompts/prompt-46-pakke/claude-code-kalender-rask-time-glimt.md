# Kalender (mobil) «Skriv en time»: Glimt (Ollama) skal tolke, ikke bare regex

Ønske 2026-10-23: «også på kalender på mobil, her burde glimt ollama lese og lage en glimt ai avtale. den burde skjønt Dune - Kino plass er coluseum kino og dato og tid.»
Skjermbilde: `uploads/Screenshot 2026-10-23 at 12.16.49.png` (✦ AI · RASK TIME · «vi skal se på dune på coluseum kino 17.12 kl 17:30»).
Hører til `claude-code-glimt-intelligent-agent.md` (felles motor). Samme motor her som på Hjem og i chat.

## Feil
«GLIMT FORSTÅR» viser tittel **«Vi skal se på dune på coluseum kino»**: hele setningen minus dato/tid. Dato og tid er riktige (17. desember 17:30–18:30), men tittel og sted er feil. Feltet bruker bare den lokale regex-tolkningen og kaller aldri Ollama.

## Forventet
| Felt | Verdi |
|---|---|
| Tittel | **Dune – Kino** |
| Sted | **Colosseum Kino** (rettet stavefeil, slått opp i stedssøket → Fridtjof Nansens vei 6, Oslo) |
| Dato | torsdag 17. desember 2026 |
| Start | 17:30 |
| Slutt | 20:15 (film ≈ 2 t 45 min, ellers standardvarighet) |
| Kalender | standardkalender (se `claude-code-glimt-kalender-standardkalender.md`) |
| Varsel | 1 t før (brukerens standard) |

## Slik
1. **Lokal tolkning først (umiddelbart):** dato og tid som i dag (`claude-code-kalender-glimt-klokkeslett.md`). Vis forhåndsvisningen med en gang.
2. **Glimt (Ollama) parallelt**, med debounce 400 ms når brukeren slutter å skrive. Ett kall med `format` (JSON-skjema) og liten kontekst (dagens dato, tidssone, standardkalender):
   `{title, location, start, end?, allDay, calendarId?, notes?}`. Instruks: tittel kort og ryddig («Hva – Type», f.eks. «Dune – Kino», «Tannlege»), fyllord fjernes («vi skal», «jeg må», «se på»), sted skilles ut («på/hos/i X»), stavefeil i kjente steder rettes.
3. **Koden validerer:** dato og tid fra den lokale parseren vinner hvis de er entydige (modellen får ikke flytte dem). Modellen bestemmer tittel og sted.
4. **Sted:** slå opp `location` i stedssøket (samme som adressefeltet). Treff → vis navn + adresse. Ingen treff → behold teksten.
5. **Kino:** kjennes tittelen igjen som film (TMDB, som Media bruker), settes slutt = start + spilletid + 15 min, og plakaten brukes som bilde på avtalen.
6. Forhåndsvisningen oppdateres med en myk overgang når Glimt-svaret kommer (skimrende «Glimt tenker …» i 0,3–1 s). Merket viser «✦ Glimt» når modellen ble brukt.
7. **Uten modell / tidsavbrudd (3 s):** bruk lokal tolkning, men rydd tittelen med enkle regler (fjern «vi skal / jeg skal / se på», og del ut «på X kino/hos X» som sted).

## Forhåndsvisning (GLIMT FORSTÅR)
- Linje 1: **Dune – Kino** + kalendernavn til høyre.
- Linje 2: «Torsdag 17. desember · 17:30–20:15 · 1 t før».
- Linje 3 (ny): «📍 Colosseum Kino · Fridtjof Nansens vei 6».
- Trykk på en verdi for å rette den før lagring.

## Test
- «vi skal se på dune på coluseum kino 17.12 kl 17:30» → som tabellen.
- «tannlege hos Nina fredag kl 9» → «Tannlege», sted «Nina», fre 09:00.
- «middag med mormor søndag 18» → «Middag med mormor», søn 18:00, uten sted.
- Ollama av → lokal reserve gir «Dune», sted «Coluseum kino».
