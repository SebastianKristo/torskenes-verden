# Fiks: dobbel refresh-spinner som aldri blir ferdig (Liste)

## Symptom
- Pull-to-refresh i **Liste** viser ofte **to spinnere**: systemets refresh-spinner under hero-bildet og en egen lastespinner midt i listen.
- Listen blir tom, og spinnerne går for alltid. Bare å lukke appen helt får den tilbake.
- Skjermbilde: `uploads/IMG_1582.PNG`.

## Sannsynlige årsaker (sjekk alle)
1. **Refresh trigger full innlasting.** `.refreshable` setter `isLoading = true` og tømmer `transactions`, så den egne `ProgressView` vises i tillegg til systemets. Refresh skal aldri tømme listen eller vise egen spinner.
2. **`.refreshable` returnerer ikke.** Closure-en må `await`e selve lastingen. Hvis den starter en `Task {}` uten å vente, eller venter på noe som aldri fullføres (continuation som ikke resumes, publisher uten completion), henger systemspinneren.
3. **Samtidige lastinger.** `.task`/`onAppear` + `.refreshable` + filterbytte (Alle / Til gjennomgang) starter parallelle kall. Ett blir kansellert (`CancellationError` / `URLError.cancelled`), og `isLoading` settes aldri tilbake til `false`.
4. **Feil håndteres ikke.** Ved feil/timeout blir `isLoading` stående `true`.

## Løsning
- Én lastefunksjon i ViewModel, `@MainActor`:
  ```swift
  private var loadTask: Task<Void, Never>?

  func reload(isRefresh: Bool) async {
      loadTask?.cancel()
      let task = Task { await fetch(isRefresh: isRefresh) }
      loadTask = task
      await task.value
  }

  private func fetch(isRefresh: Bool) async {
      if !isRefresh && transactions.isEmpty { isLoading = true }
      defer { isLoading = false }
      do {
          let result = try await api.transactions(filter: filter)
          try Task.checkCancellation()
          transactions = result
          error = nil
      } catch is CancellationError {
          // ignorer, ny lasting tar over
      } catch let e as URLError where e.code == .cancelled {
      } catch {
          self.error = error   // behold gamle data, vis diskret feil
      }
  }
  ```
- View:
  ```swift
  .task { await vm.reload(isRefresh: false) }
  .refreshable { await vm.reload(isRefresh: true) }
  ```
  Ingen `Task {}` inni `.refreshable`.
- Den sentrerte `ProgressView` vises **kun** når `isLoading && transactions.isEmpty && !isRefreshing`. Under pull-to-refresh står gamle rader synlige til nye data er klare.
- **Timeout:** 15 s på API-kallet (`URLRequest.timeoutInterval` eller `withTimeout`). Etter timeout: stopp spinner, behold data, vis «Kunne ikke oppdatere» som liten tekst/toast.
- `defer { isLoading = false }` slik at den alltid nullstilles.
- Når appen kommer tilbake fra bakgrunn (`scenePhase == .active`): hvis `isLoading` har stått > 15 s, nullstill og last på nytt.
- Gjør det samme for alle skjermer med pull-to-refresh (Oversikt, Finn, Søk, Sporing).

## Test
- Dra ned 5 ganger raskt etter hverandre → én spinner, avsluttes, data står.
- Bytt filter mens refresh pågår → ingen heng.
- Flymodus + refresh → spinner stopper innen 15 s, gamle data står, feilmelding vises.
- Send appen til bakgrunn midt i refresh og kom tilbake → ingen evig spinner.
