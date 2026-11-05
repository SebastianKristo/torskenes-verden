# Android: «StandaloneCoroutine was cancelled» vises ved oppstart

Symptom: når appen åpnes på Android, vises en melding (toast/snackbar/feilkort) med tekst som «StandaloneCoroutine was cancelled» / «Job was cancelled».

Årsak (typisk): en coroutine (f.eks. lasting av vær, posisjon, hjem-kort) blir avbrutt fordi skjermen/ViewModel bytter eller lasting startes på nytt. `CancellationException` fanges i en generell `catch (e: Exception)` og `e.message` vises til brukeren.

## Fiks
- Avbrudd er ikke en feil. Fang aldri `CancellationException` som vanlig feil:
  ```kotlin
  try { ... }
  catch (e: CancellationException) { throw e }
  catch (e: Exception) { visFeil(e) }
  ```
  Eller bruk `runCatching` med `.onFailure { if (it is CancellationException) throw it }`.
- Gå gjennom alle steder som viser `e.message` / `e.localizedMessage` i UI (søk etter `Toast`, `Snackbar`, `errorMessage`, `_error.value`). Filtrer bort `CancellationException`.
- Vis aldri rå exception-tekst til brukeren. Bruk norske, korte meldinger («Klarte ikke hente været. Prøv igjen.») og logg detaljene med `Log.w`.
- Sjekk oppstartsflyten: ikke start samme lasting to ganger (f.eks. både i `init` og `onResume`/`LaunchedEffect`). Bruk én jobb og avbryt forrige stille (`job?.cancel(); job = viewModelScope.launch { ... }`).
- Bruk `viewModelScope`/`lifecycleScope`, ikke `GlobalScope`.
- Hvis det er React Native / Expo-bro: samme regel i native-modulene, og i JS ignorer feil med `name === 'CancellationError'` eller melding som inneholder «was cancelled».

## Test
- Kald start av appen på Android: ingen melding.
- Åpne/lukk Vær, bytt sted raskt, send appen i bakgrunn og tilbake: ingen melding.
- Skru av nett: riktig norsk feilmelding vises, ikke exception-tekst.
