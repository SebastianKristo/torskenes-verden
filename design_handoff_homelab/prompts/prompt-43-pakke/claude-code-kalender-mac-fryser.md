# FEIL: Kalender for Mac fryser rett etter oppstart (og widgeten henger)

Ønske 2026-10-21: «i kalender appen på mac, den åpne seg men fryser med en gang samme med widget» (vedlegg `uploads/Screenshot 2026-10-21 at 11.20.15.png`: knappene «Skriv time» og «+ Ny hendelse» øverst til høyre)
Fasit for oppførsel: `Kalender Mac.dc.html` (vindu, menylinje, Innstillinger, oppdatering) og `claude-code-kalender-mac-dmg.md`, `claude-code-kalender-mac-widgets.md`.

## 1. Finn ut hvor den henger (før du endrer noe)
- **Xcode:** kjør appen, vent til den fryser, trykk **Pause** (⌃⌘Y). Se på **Thread 1 (main)**. Står den i `semaphore_wait`, `URLSession`, `SecItemCopyMatching` (nøkkelring), `WKWebView`/`JavaScriptCore` eller `NSLayoutConstraint`? Det er feilen.
- **Uten Xcode:** Aktivitetsmonitor → Kalender → ⚙ → **Sample Process** (10 s). Øverste linjer i hovedtråden viser hvor den står.
- **Logg:** `log stream --level debug --predicate 'subsystem BEGINSWITH "no.kristo.kalender"'`. Legg inn `Logger`-linjer ved: app start, innlogging, første synk, første tegning, widget-tidslinje.
- **Instruments → Hangs** viser hver frysing over 250 ms med stack.

## 2. Vanlige årsaker (sjekk i denne rekkefølgen)
1. **Nettverk på hovedtråden ved oppstart.** Henting fra `home.kristo.no` med `DispatchSemaphore`, `Data(contentsOf:)` eller synkron `URLSession` i `init`/`applicationDidFinishLaunching`/`onAppear`. Er serveren treg eller utenfor nett, står appen fast.
   → Alt nettverk med `async/await` (`URLSession.shared.data(for:)`) i `.task {}`, tidsgrense 8 s (`timeoutIntervalForRequest`). Vis lokal cache først, synk i bakgrunnen.
2. **Nøkkelring-dialog bak vinduet.** `SecItemCopyMatching` på hovedtråden kan vente på en «Kalender vil bruke nøkkelringen»-dialog som havner bak vinduet.
   → Les nøkkelring i en bakgrunnsoppgave. Bruk `kSecAttrAccessibleAfterFirstUnlock` og samme Keychain Access Group i app og widget, så macOS ikke spør.
3. **WebView-innhold som går i løkke** (hvis Mac-appen viser web-kalenderen i `WKWebView`): en render-løkke (`setState` i `componentDidUpdate`, `ResizeObserver` som endrer størrelse, eller `storage`-event som skriver til `localStorage` igjen). JavaScript låser da hele vinduet.
   → Web Inspector (Develop → Kalender) → Performance. Ingen `setState` uten endring. `storage`-lytteren skal bare lese, aldri skrive tilbake.
4. **Stor synk på hovedtråden.** Parsing av hele kalenderen (tusenvis av hendelser, ICS) med `JSONDecoder` på main.
   → Dekod i `Task.detached(priority: .userInitiated)`, publiser til `@MainActor` i biter.
5. **Menylinje + vindu som venter på hverandre.** `MenuBarExtra` og hovedvinduet som begge prøver å aktivere appen ved start, eller `NSApp.setActivationPolicy` byttet mens vinduet tegnes.
   → Sett aktiveringsmodus én gang i `applicationWillFinishLaunching`. Ikke åpne popoveren automatisk ved start.
6. **Sandbox-rettigheter mangler.** `com.apple.security.network.client`, App Groups og Keychain Sharing må være på både app og widget, ellers henger enkelte kall til de går ut på tid.

## 3. Widgeten henger / viser bare plassholder
- `getTimeline` må **alltid** kalle `completion`, også ved feil og når serveren ikke svarer. Tidsgrense 5 s, så bruk forrige data fra App Group.
- **Ikke nettverk i widgeten hvis det kan unngås.** Appen skriver `calendar.json` til App Group (`group.no.kristo.papir`) og kaller `WidgetCenter.shared.reloadAllTimelines()`. Widgeten leser bare fila.
- Widget-utvidelser har lite minne (ca. 30 MB). Ikke last hele kalenderen. Skriv bare de neste 10 hendelsene for widgeten.
- `getSnapshot` returnerer eksempeldata med en gang (brukes i galleriet).
- Samme Team, App Group og Keychain Group i app og widget. Etter endring: slett appen, tøm `~/Library/Containers/no.kristo.kalender*` og installer på nytt. Kjør `killall NotificationCenter chronod` så widgetene lastes på nytt.

## 4. Når den er fikset
- Oppstart til første tegning under 1 s med lokal cache, også uten nett.
- Uten nett: «Ikke tilkoblet home.kristo.no · viser lagret kalender» i toppen, ingen frysing.
- Widget: oppdatert innen 1 min etter endring i appen, og viser lagret innhold uten nett.

## Test
- Start med Wi-Fi av → åpner med lagret kalender, klikkbar med en gang.
- Start med serveren av → samme, med melding.
- Første oppstart etter installasjon → ingen nøkkelring-dialog som blokkerer.
- Legg til widget (liten, medium, stor) → innhold innen 2 s, ingen tom/grå widget.
- Instruments → Hangs: ingen hang over 250 ms ved oppstart.
