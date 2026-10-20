# Prompt 41 · pakke til Claude Code

Les `prompt-41.md` først (alle ønskene ordrett). Hver `claude-code-*.md` er én oppgave med fasit i `design/` og skjermbilder i `vedlegg/`. Design-filene (`.dc.html`) åpnes direkte i nettleseren (`support.js` og `glimt-figurer.js` ligger ved siden av).

## Feil som skal rettes først
1. `claude-code-wiggle-scroll-ios.md` – kan ikke scrolle i wiggle-modus på Hjem (iOS).
2. `claude-code-nyhet-oppsummering-bredde.md` – Glimt nyhetsoppsummering er bredere enn skjermen.
3. `claude-code-hjem-fjern-bildekreditering.md` – fjern «Free Nature Stock · Wikimedia …» fra Hjem.
4. `claude-code-innst-web-meny-scroll.md` – Innstillinger (web) hopper til toppen.
5. `claude-code-domener-fanefarge-fiks.md` – fargefeil i «Hent domener»-fanene.
6. `claude-code-kalender-logg-inn-homelab.md` – «Logg inn med Homelab-appen» i Kalender virker ikke.
7. `claude-code-finans-les-pa-nytt-alltid.md` – les kvittering på nytt uansett status, åpne bokførte, «Glimt» i stedet for «AI».
8. `claude-code-glimt-vaer-uke-ai.md` – værspørsmål om uka skal gå til Ollama med ukesdata.

## Hjem og navigasjon
9. `claude-code-innlogging-uten-server.md` – ikke spør om serveradresse; lokal/ekstern i Innstillinger.
10. `claude-code-hjem-skanneknapp-av.md` – slå av skanneknappen på Hjem (også i Rediger fanelinjen).
11. `claude-code-fold-hjem-knapp.md` – rød Hjem-knapp i samme form som fanene på Fold.
12. `claude-code-hjem-fold-ipad-oppsett.md` – **Fold: 1c valgt** (stort Glimt-kort + faner).
13. `claude-code-bakgrunn-oslo-dognet.md` – ekte Oslo-bilder fra lufta som skifter gjennom dagen.
14. `claude-code-sok-pille-dra-til-chat.md` – dra søkepillen ned → animasjon inn i Chat.

## Glimt og AI
15. `claude-code-huskeliste-glimt-ai-bakgrunn.md` – Glimt deler opp beskjeder med AI i bakgrunnen, «Laget med Glimt», fra Hjem-søk.
16. `claude-code-chat-mine-data-standard.md` – «Mine data» på som standard.
17. `claude-code-chat-auto-modell.md` – «✦ Auto»: Glimt velger beste modell, standard.
18. `claude-code-ai-jobber-klokkeslett.md` – klokkeslett i Jobber.
19. `claude-code-vaer-rediger-ski-julfigur.md` – julefigurer, rediger kort i Vær, Glimt skiføre (+ i Brief).
20. `claude-code-17-mai.md` – figurer med flagg, eget Hjem 17. mai med bryter.

## Familie, Ruter og pakker
21. `claude-code-hjemlys.md` – Hjemlys: si fra hvor som helst, start/personer, Live Activity-fiks, lagt i Familie, 1b/1c/Felles.
22. `claude-code-ruter-forhandsruter-sebastian.md` – Min reise skole ⇄ Amagerveien, skolesoner, kort på Hjem, sveip bort.
23. `claude-code-postnord-uten-nokkel.md` – PostNord-sporing uten API-nøkkel.

## Bursdager og Kalender
24. `claude-code-bursdag-jenka-glimt.md` – jenka-tog med trompet og konfetti i toppkortet, uten fanelinje/skann.
25. `claude-code-bursdag-bilder.md` – last opp bilder, kalendere fjernet fra siden.
26. `claude-code-kalender-bursdag-hendelse.md` – eget bursdagsdesign på hendelser.
27. `claude-code-kalender-mac-widgets.md` – samme widgets på Mac.
28. `claude-code-kalender-glimt-sok-testvarsel.md` – søk med Glimt (Ollama) + testvarsel.

## Ikke valgt ennå (bygg ikke før brukeren har valgt)
- Hjem på **iPad**: `design/Hjem Fold iPad Varianter.dc.html` 1a / 1b / 1c (Fold er valgt: 1c).

## Felles regler
- Samme utseende på iOS, Android, web og Mac (Papir-stil). Mac er fasit for kalendere.
- «Glimt» i brukertekster, ikke «AI».
- Glimt-figurer: alt tilbehør (jul, 17. mai) bruker ankerpunkter per figur fra `design/glimt-figurer.js`.
