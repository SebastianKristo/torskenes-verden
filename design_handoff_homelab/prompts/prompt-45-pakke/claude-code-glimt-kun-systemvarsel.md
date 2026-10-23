# Glimt-svar mens appen er lukket: kun systemvarsel, ingen banner i appen

Erstatter banner-delen av `claude-code-ai-bakgrunnsvarsel.md` og `claude-code-glimt-varsel-ikon.md`.

- Svarer Glimt mens appen er i bakgrunnen eller lukket: send **kun** systemvarsel (push / lokal varsling) med Glimt-logo, tittel «Glimt» og svaret.
- Når brukeren åpner appen igjen (med eller uten å trykke på varselet): **ingen** banner, toast eller tekst «Glimt svarte mens du var borte». Fjern denne teksten helt fra koden.
- Svaret ligger bare der det hører hjemme (chatten / svarfeltet på Hjem).
- Fjern innstillingen «Vis svaret i appen også» (`n_ai_in`) fra AI-kontroll/Varsler, den trengs ikke lenger.
- Er appen åpen og i forgrunnen: ingen systemvarsel, bare svaret i appen (uendret).
- Gjelder iOS, Android, web (Web Notifications) og Mac.

Fasit: `Mobil Papir App.dc.html` (banneret ved retur er fjernet).
