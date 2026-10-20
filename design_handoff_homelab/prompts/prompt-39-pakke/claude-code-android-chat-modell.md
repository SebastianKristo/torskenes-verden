# Android · Chat: valgt modell vises ikke

Ønske 2026-10-20: «jeg ser ikke hvilken modell som er valgt i chat på android»

Fasit: `Mobil Papir App.dc.html` → Chat-toppen. Rekkefølge: ‹ · ☰ · **[Modellnavn] [LOKAL/SKY] ▾** · (luft) · ⚙ · ✎. Modellknappen har nå `min-width: 112px`, og navnet forkortes med «…», så den aldri presses bort.

## Sjekk i appen (i denne rekkefølgen)
1. **Navnet er tomt.** Modell-listen (`/api/ai/models`) er ikke lastet når Chat åpnes på Android (treg første kall / Ollama laster), og `mName` blir `''`.
   - Fiks: vis alltid **standardmodellen fra rutingen** med en gang (`rt.chat.v`, f.eks. «Gemma 4»). Oppdater når listen kommer. Mens den henter: «Gemma 4 · laster …». Feiler den: «Gemma 4» + rød prikk.
2. **Toppen ligger under statuslinjen** (edge-to-edge på Android 15). Modellknappen er skjult bak klokka og ikonene.
   - Fiks: `WindowInsets.statusBars` / `env(safe-area-inset-top)` → `padding-top` på Chat-toppen. Samme verdi som `ch.pt` i fasiten.
3. **Knappen krymper til 0** på smale skjermer (360 dp) fordi den har `min-width: 0` og ikonknappene er `flex: none`.
   - Fiks: `min-width: 112px` på modellknappen. Ved < 340 dp skjules «Ny chat»-ikonet (finnes i ☰).
4. **Farge:** i mørkt tema / Material You får teksten samme farge som bakgrunnen (dynamisk farge overstyrer `--ci`).
   - Fiks: bruk appens egne farger i Chat, ikke `dynamicColorScheme`.
5. **Merket LOKAL/SKY** skal alltid vises (grønn = lokal Ollama, blå = sky), så du ser hvor svaret kommer fra.

## Ekstra
- Under meldingsfeltet: liten grå tekst «Svarer med Gemma 4 · lokal». Trykk = samme modellvelger.
- Hvert svar viser modellen nederst («Gemma 4 · 1,2 s») når du holder inne på svaret.

## Test
Pixel 6a (412 dp) og Galaxy A-serien (360 dp), lys og mørk, første oppstart med Ollama av: modellnavnet er synlig øverst innen 0,5 s og forsvinner aldri bak statuslinjen.
