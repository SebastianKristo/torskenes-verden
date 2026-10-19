# Kalender (web/PC): AI-søket virker ikke, og søkemenyen flimrer

Fasit: `Kalender.dc.html` (`variant="web"`) → søkearket `sr`, `ask()`, `srLocal()`, `srCloud()`.

## Feil 1: AI-svar kommer ikke
**Årsaker:**
- Enter i feltet ble fanget opp av globale snarveier eller skjemaet sendte ikke, så `ask()` ble aldri kalt.
- Spørsmål som «når er neste frisørtime» ga ingen treff, fordi «frisørtime» ikke er et ord i «Nina frisør».
- Fallback til sky-AI brukte bare `window.claude`, som ikke finnes i den ekte appen.

**Fiks:**
1. Feltet har egen `onKeyDown`: **Enter** → `ask()` (med `preventDefault` og `stopPropagation`, ignorer `isComposing`). **Esc** lukker. «✦ Spør» er `type="button"` med `onClick`. Ikke stol på `<form onSubmit>`.
2. Globale tastatursnarveier (T, D, W, M, piler) skal ignoreres når fokus er i input/textarea **eller når søket er åpent**.
3. Søkeord: fjern stoppord og suffikser (`-timen/-time/-avtale/-en/-et/-er`). Match på delord begge veier, med minst 4 tegn felles prefiks. «frisørtime» → «frisør» → treffer «Nina frisør».
4. Ingen lokal forståelse → vis «Jeg er ikke sikker på hva du mener, men her er det som skjer fremover …» med de neste 5 hendelsene, og spør Glimt-backend parallelt: `POST /api/glimt {prompt, tool:'calendar'}` → `{text}` (timeout 12 s). Svaret erstatter fallback-teksten når det kommer.
5. Tenketid lokalt: 420 ms med animert Glimt-merke, så svar.

## Feil 2: Søkemenyen flimrer
**Årsaker:**
- `backdrop-filter: blur()` på hele overlegget måtte tegnes om ved hver re-render. Homelab-web re-rendrer hvert 3. sekund på grunn av satellitt-tick, og hver gang man skriver.
- AI-kortet forsvant og kom tilbake for hver tast, fordi det bare viste seg når teksten var lik det siste spørsmålet.
- Glimt-merket (React-element med animasjon) ble laget på nytt hver render, så animasjonen startet om.
- 60-sekunders `forceUpdate`.

**Fiks:**
- Overlegget er en ensfarget demping `rgba(20,18,14,.46)` med `transform: translateZ(0)` (eget lag). **Ingen blur.**
- Forrige AI-svar **blir stående** mens man skriver et nytt spørsmål (`keep`) og byttes først når man trykker Enter.
- Glimt-merket caches (ett element for «tenker» og ett for «ferdig»).
- Ingen periodisk re-render mens søket er åpent. I den ekte appen: isoler søkekomponenten (`React.memo`) så foreldre-ticks ikke re-rendrer den. Flytt satellitt-ticket til en egen komponent, så den ikke kjører på hele siden.

## Test (PC)
1. Kalender → søk (⌘K / knapp) → skriv «når er neste frisørtime» → Enter. Svaret med tid og sted kommer innen 0,5 s, og raden åpner hendelsen.
2. «er jeg ledig fredag ettermiddag» → ledige tidsrom.
3. Skriv videre i feltet: det forrige svaret blir stående og flimrer ikke.
4. La søket stå åpent i 30 s: ingen blink.
