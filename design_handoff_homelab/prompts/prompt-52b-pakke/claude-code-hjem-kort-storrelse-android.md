# Hjem: kortene blir for store på Android (iPhone er riktig)

Fasit: iPhone-bygget og Hjem-designet. Android skal se likt ut.

Symptom (skjermbilde 05.11): Avgang-kortet (45 Majorstuen, «4 min») er nesten dobbelt så høyt som Bursdag-kortet ved siden av, med stort tomrom i midten. Finans og Familie blir også høyere enn de skal. Tekst virker større enn på iPhone.

## Regel
Små kort i 2-kolonne-rutenettet har **fast høyde** (samme som iPhone, f.eks. 168 dp for liten, 2 × 168 + gap for høy). Høyden skal aldri komme fra innholdet eller fra nabokortet.

## Sannsynlige årsaker og fiks
1. **Strekk i raden.** Raden bruker `flexDirection:'row'` med standard `alignItems:'stretch'`, og ett kort har `flex:1`/`flexGrow` på et indre mellomrom (Avgang: luft mellom stasjonsnavn og «4 min»). På Android regnes høyden annerledes og spacer-en vokser.
   → Sett `alignItems:'flex-start'` på raden og gi hvert kort eksplisitt `height`. Spacer-en kan bruke `flex:1` bare inne i et kort med fast høyde.
2. **`aspectRatio` + prosentbredde.** Android runder kolonnebredden ulikt. Bruk utregnet bredde: `(skjermbredde − 2×side − gap) / 2` fra `useWindowDimensions`, og fast høyde.
3. **Font-skalering.** Android-systemets skriftstørrelse forstørrer teksten (og dermed kortene). Sett `maxFontSizeMultiplier={1.15}` på tekst i Hjem-kortene (eller `allowFontScaling={false}` på store tall som «4», «−43 658», «5°»). Tekst skal få ellipsis i stedet for å presse kortet større.
4. **Fontfallback.** Serif-fonten (Newsreader) og Manrope må være lastet på Android. Faller den tilbake til systemfont, blir linjehøyden større. Sjekk at fontene er med i Android-bygget og at `fontFamily`-navnene stemmer (Android bruker filnavnet).
5. **`includeFontPadding`.** Sett `includeFontPadding:false` og `textAlignVertical:'center'` på Android, ellers får hver tekstlinje ekstra luft.
6. **Lineheight.** Oppgi `lineHeight` eksplisitt (i dp) på alle tekststiler i kortene, som på iOS.

## Masonry
Brukes det et masonry-oppsett der høye og lave kort fyller to kolonner, skal høyden per korttype komme fra en tabell (liten/høy/bred), ikke fra målt innhold.

## Test
- Samme telefonbredde (f.eks. 393 dp): Hjem på Android og iPhone side ved side skal ha like store kort.
- Android med skriftstørrelse «Stor»: kortene beholder størrelsen, tekst kortes av med «…».
- Avgang-kortet har samme høyde som Bursdag-kortet når begge er små.
