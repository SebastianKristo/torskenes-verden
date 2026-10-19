# AI-svar som varsel når appen er i bakgrunnen

Fasit: `Mobil Papir App.dc.html` → `aiBgNotify()`, `nextAppt()`, kalt fra `hsAsk()` (søkefeltet på Hjem) og `chToolRun()` / `fin()` (Chat).

## Oppførsel
- Brukeren spør (søkefelt eller Chat) og går ut av appen før svaret er klart. Når svaret kommer, sendes det som **push-varsel**:
  - Tittel: «Papir · AI» (appnavn + AI)
  - Tekst: hele svaret, uten markdown. Eksempel: «Nina frisør er fredag 25. september kl. 14.30 (om 6 dager).»
  - Trykk på varselet åpner Chat (eller Hjem hvis spurt fra søkefeltet) med svaret.
- Er appen åpen, vises bare svaret i appen, uten varsel.
- Kommer brukeren tilbake uten å trykke på varselet, vises et banner øverst: «AI svarte mens du var borte» + svaret (4 s).
- Gjelder alle AI-svar: vanlige spørsmål, vær, kalender, prøveperiode-påminnelser.

## Nytt kalenderverktøy: neste time
- Spørsmål som «når er neste frisør time», «når har jeg tannlege», «neste time hos Nina» → søk i kalenderen etter første kommende avtale som matcher nøkkelordene (stoppord fjernes: når, er, neste, time, hos …).
- Svar: «{tittel} er {ukedag} {dato}. {måned} kl. {tid} ({i dag / i morgen / om N dager}).» Ingen treff: «Fant ingen kommende {ord}time i kalenderen.»
- Fungerer både i søkefeltet (svarboble) og i Chat (verktøy-merke «Kalender»).

## Innstilling
- Innstillinger → Varsler: ny bryter **AI-svar i bakgrunnen**, med teksten «Får du svar mens du er ute av appen, kommer det som varsel». På som standard. Følger hovedbryteren «Varsler».

## Implementasjon
- AI-jobben kjører på serveren (ikke i klienten), så den fullføres selv om appen lukkes. Når den er ferdig: lagre svaret i chatten og send push (APNs / Web Push via service worker) hvis klienten ikke er i forgrunnen (heartbeat/visibility fra klienten, ellers alltid push).
- iOS: `UNUserNotificationCenter`, kategori `AI_ANSWER`, `threadIdentifier` = chat-id, deep link `papir://chat/{id}`.
- Web: `registration.showNotification(title,{body,tag,data:{url}})`, og `notificationclick` → `clients.openWindow(url)`.
