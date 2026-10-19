# AI-agenten heter **Glimt**

Fasit: `Glimt AI.dc.html` (animasjon og tilstander) + `Mobil Papir App.dc.html` (`aiSpark`, toast, boble).

## Navn
- **Glimt**, AI-agenten i Nordlys OS. Erstatter «System-AI» overalt: søkemotorvalg («Glimt»), kildetekst under svar, modellinje i AI-boblen («Glimt · lokal»), avsender i Chat, plassholder «Spør Glimt …».
- Varsel-tittel: «Glimt» (i stedet for «Papir · AI»).

## Merke
- Ring med konisk gradient `#b23a2a → #e8794a → #7a5ad6 → #3fbf9a` (strek ≈ 6 % av størrelsen) + 4-spisset stjerne i gradient `#ffb38a → #ff5a3c` + to små glimt (tindrer forskjøvet).
- Stor størrelse (> 60 px): myk glød bak (oransje/lilla, ferdig = grønn).

## Tilstander
1. **Klar**: ringen roterer sakte (6 s), stjernen puster (skala .92–1, 3,2 s).
2. **Tenker**: ringen spinner raskt (1,4 s), stjernen pulserer og vris 45° (1,2 s), gløden pulserer.
3. **Svarer**: roligere spinn (2,6 s), puls 2 s. Brukes mens teksten strømmer inn.
4. **Ferdig**: ringen blir grønn `#3fbf9a` og stopper, haken spretter inn (scale .4 → 1.12 → 1, 450 ms). Lett haptikk.

## Bruk
- Toast (24 px) + tre hoppende prikker · søkefelt (26 px, Klar) · Chat-avsender (22 px) · AI-boble (28 px).
- iOS: SwiftUI `AngularGradient` + `.rotationEffect` med `.repeatForever`, `symbolEffect(.bounce)` på haken.
