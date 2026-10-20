# Kalender: søk med Glimt (Ollama) + testvarsel

Ønske 2026-10-20: «i kalender leg tili søk en søkeknapp med glimt, gi den onkelig ai ollama søk. legg også til i kalender mobil app test av varsling.»
Fasit: `Kalender App.dc.html` → søkeskjermen (`calAi`, `sAi`) og Innstillinger → VARSLER (`notTest`).

## Søk med Glimt
- I søkefeltet: knapp **«✦ Glimt»** til høyre (rød når aktiv). Plassholder: «Søk, eller spør Glimt: «når er neste tannlege?»».
- Vanlig tekstsøk virker som før mens du skriver. Trykk ✦ Glimt (eller Enter på en setning med mellomrom) for AI-søk.
- AI-søk: send spørsmålet + kompakt liste over hendelser (60 dager bak, 180 frem; id, dato, ukedag, tid, tittel, sted, kalender) til **Ollama** på hjemmeserveren (modell fra «✦ Auto», normalt Llama 3.1 8B). Systemprompt: svar kort på norsk med dag og klokkeslett, ikke finn på hendelser, returner `{"answer","ids"}`.
- Svarkort øverst: «GLIMT · OLLAMA», svaret (1–2 setninger) og opptil 6 treff med fargestrek, tittel og tid. Trykk åpner hendelsen.
- Mens den jobber: «Leser kalenderen din med Ollama …». Tidsgrense 20 s → lokal reserve (nøkkelord) merket «UTEN AI».
- Kjøres på serveren (`POST /api/calendar/ask`), aldri sky-modeller med kalenderdata uten samtykke (samme regel som Chat).
- Eksempler: «hva skjer i helgen?», «når har jeg fri neste uke?», «når var jeg sist hos tannlegen?», «hvilke frister har jeg i november?».

## Testvarsel
- Innstillinger → **VARSLER** øverst: rad **«Send testvarsel»** (rødt bjelle-ikon) · «Kommer om 5 sekunder · lås skjermen for å se det» · «Test».
- Sender et ekte lokalt varsel etter 5 s via samme kanal som påminnelser (iOS `UNUserNotificationCenter` med `timeInterval: 5`, kategori som vanlige påminnelser; Android `NotificationManager` på kanalen «Påminnelser»), tittel «Kalender · test», tekst «Tannlege kl. 17:30 · om 15 min. Varsler virker.».
- Mangler tillatelse: be om den først. Avslått: vis «Varsler er slått av for Kalender» med knapp «Åpne Innstillinger» (`UIApplication.openSettingsURLString` / `Settings.ACTION_APP_NOTIFICATION_SETTINGS`).
- Er appen åpen når varselet kommer: vis banneret i appen (fasiten) i tillegg.
- Test også push fra serveren: lang-trykk på raden sender `POST /api/push/test {app:"kalender"}` → APNs/FCM, og viser «Push sendt · kom fram på 1,2 s» eller feilen.
