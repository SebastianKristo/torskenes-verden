# FEIL: Fold (Android) viser ikke delt oppsett på Hjem

Ønske 2026-10-21: «For mobil app for fold, du ser feilen, den er ikke delt som den skal» (vedlegg `uploads/Screenshot_20261021_102819.jpg`)
Fasit: `Mobil Papir App.dc.html` med `wide`, og valgt oppsett **1c** i `claude-code-hjem-fold-ipad-oppsett.md` (`Hjem Fold iPad Varianter.dc.html` → 1c).

## Det som skjer (skjermbildet)
- Telefonen er brettet helt ut (indre skjerm ca. 2020 × 1820 px, altså bredere enn høy). Likevel stables alt i én kolonne: Glimt-kortet går over hele bredden øverst, og fanene **Nå · I dag · Hjemme · Økonomi** og kortene ligger under.
- Brief-kortet inne i Glimt-kortet er klemt til en blå stripe på ca. 70 px. Glimt-figuren er kuttet nederst, og teksten («KVELDSBRIEF · GLIMT», «Hør briefen») mangler.
- Søkefeltet med ✦ AI mangler i Glimt-kortet.
- Sidelinja til venstre og fanene er riktige.

## Sannsynlig årsak
Oppsettet velges med **Compose `WindowWidthSizeClass.Expanded` (≥ 840 dp)** eller ut fra `orientation == LANDSCAPE`. Den indre Fold-skjermen er ca. 770–800 dp bred (**Medium**) og nesten kvadratisk, så appen faller tilbake til stablet oppsett. Brief-kortet får da høyden som er igjen i en `wrapContentHeight`-rad, ikke sin egen.

## Fiks
1. **Velg delt oppsett slik:**
   ```kotlin
   val wsc = currentWindowAdaptiveInfo().windowSizeClass
   val posture = currentWindowAdaptiveInfo().windowPosture   // eller WindowInfoTracker → FoldingFeature
   val tabletop = posture.isTabletop                         // halvbrettet, hengsel vannrett
   val split = !tabletop && wsc.windowWidthSizeClass != WindowWidthSizeClass.COMPACT   // ≥ 600 dp
           && widthDp >= heightDp * 0.9f                     // ikke smal portrett
   ```
   - `split` → **1c**: venstre Glimt-kort, høyre faner (`Row` med `weight(1f)` / `weight(1f)`, 16 dp mellomrom).
   - `tabletop` → Glimt-kort på øvre halvdel, faner på nedre (deles på hengselen, `FoldingFeature.bounds`).
   - Ellers (sammenbrettet / dekselskjerm / smal portrett) → vanlig mobiloppsett.
   - Ikke bruk `orientation` eller `Expanded` alene.
2. **Glimt-kortet fyller høyden** i delt oppsett (`fillMaxHeight()`), scroller ikke. Innhold ovenfra: Homelab + profilbilde, dato, hilsen, 7° + vær, `Spacer(Modifier.weight(1f))`, **Brief-kortet** og **søkefeltet** nederst.
3. **Brief-kortet** får egen høyde: `heightIn(min = 148.dp)`, innhold `wrapContentHeight`, ingen `clip` som kutter Glimt-figuren (gi figuren 8 dp luft over kanten eller legg den inne i kortet). Viser «KVELDSBRIEF · GLIMT», hovedsetning, «Hør briefen» og «3 nyheter».
4. **Søkefeltet** (56 dp, ✦ AI til høyre) ligger under Brief-kortet i Glimt-kortet. Det skal ikke ligge i lista til høyre.
5. **Høyre kolonne:** fanene står på linje med toppen av Glimt-kortet (24 dp luft øverst), og bare denne kolonnen scroller. Skanneknappen flyter nederst til høyre i høyre kolonne.
6. Bytt oppsett med en gang ved bretting (`WindowInfoTracker.windowLayoutInfo` som `Flow`). Behold valgt fane (`papir_fold_tab`) og scrollposisjon.

## Test (Galaxy Z Fold, fysisk)
- Utbrettet, holdt som på bildet → delt: Glimt-kort venstre med hele Brief og søk, faner høyre.
- Utbrettet og rotert 90° → fortsatt delt hvis bredde ≥ 0,9 × høyde, ellers stablet.
- Halvbrettet på bordet → Glimt øverst, faner nederst, delt på hengselen.
- Sammenbrettet → vanlig mobiloppsett. Brett ut igjen → tilbake til delt uten å miste fanen.
- Pixel Fold og Galaxy Z Fold 5/6/7, lys og mørk modus, stor skriftstørrelse (130 %): Brief-kortet kuttes ikke.
