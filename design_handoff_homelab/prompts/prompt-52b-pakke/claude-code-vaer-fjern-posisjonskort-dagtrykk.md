# Vær: fjern posisjonskortet + fiks trykk på dag (Android)

Fasit: `Vaer.dc.html`. Erstatter kortdelen av `claude-code-vaer-min-posisjon-popup.md`.

## 1. Fjern «Min posisjon»-boksen øverst
- Fjern kortet med «➤ MIN POSISJON / Hovseter / Stort sett klart H/L / 5°» over hovedvisningen. Det skal ikke være noen boks rundt stedet.
- Toppen skal bare ha X-knappen i hjørnet og under den heroen («MIN POSISJON», stedsnavn, temperatur, beskrivelse, H/L, kilde).
- Min posisjon er fortsatt et valg i stedsvelgeren (☰-knappen). Når den er valgt, vises den i heroen.
- Gjelder iOS, Android og web.

## 2. Trykk på en dag i 10-dagerslista åpner ikke dagen (Android)
Forventet: trykk på en rad (I dag, Fre, Lør, Søn …) åpner dagsarket for den dagen (samme som `d.go` i fasiten → `sh` med valgt dag).

Sjekk og rett:
- Raden må være én trykkflate (`Pressable`/`TouchableOpacity` rundt hele raden, ikke bare teksten). Minst 44 px høy.
- Rullecontaineren eller sveip-/drag-håndteringen (kort-rekkefølge, dra-piller, sideveis sveip mellom steder) skal ikke kapre trykket. På Android: ikke `onStartShouldSetResponder → true` / `preventDefault` på touchstart i forelderen. Bruk terskel (f.eks. >10 px bevegelse) før en gest tar over, ellers slipp gjennom som trykk.
- `ScrollView`: sett `keyboardShouldPersistTaps="handled"` og sjekk at `nestedScrollEnabled` ikke blokkerer barn.
- Flytende knapper nederst (kart og ☰) og bunnlinjen ligger over lista. Sørg for at de bare tar trykk på selve knappen (`pointerEvents="box-none"` på wrapperen), og legg inn bunnpadding i lista så siste dag ikke ligger under dem.
- Sjekk at `d.go` faktisk er koblet til i Android-bygget (ingen `Platform.OS === 'ios'`-sperre).
- Gi haptikk ved trykk (samme som ellers i Vær).

## Test
- Android: trykk I dag, Fre, Lør, Søn og en dag nederst i lista. Alle åpner riktig dag.
- Rull lista raskt og slipp. Det skal ikke åpne en dag.
- iOS og web: samme oppførsel som før.
