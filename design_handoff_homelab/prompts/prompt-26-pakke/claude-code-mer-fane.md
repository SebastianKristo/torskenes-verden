# Til Claude Code: «Mer» i fanelinjen skal alltid åpne Mer-menyen

## Feil (igjen)
I appen: åpne Mer → **Bursdager** (eller Huskeliste, Sporing, Media, Nyhetsleser, Innstillinger …), og trykk på **Mer** i fanelinjen. Ingenting skjer, eller du blir på undersiden. I designet (`design/Mobil Papir App.dc.html`) går du rett tilbake til Mer-menyen.

## Årsak (typisk)
- Mer-fanen er allerede markert som aktiv (fordi undersiden hører til Mer), og fanelinjen **ignorerer trykk på aktiv fane**. Det er standard i `TabView`/`NavigationBar`, og i egne `if (selected == tab) return`.
- Eller: undersiden er pushet i Mer-fanens egen `NavigationStack`/`NavHost`, og trykket bytter bare til fanen uten å tømme stacken.

## Krav
1. **Trykk på Mer når du er på en underside av Mer → pop til roten av Mer** (Mer-menyen), med vanlig tilbake-animasjon. Historikken for Mer nullstilles.
2. **Trykk på Mer når du allerede er på Mer-menyen** → scroll til toppen.
3. Det samme gjelder **alle** faner, siden dette er vanlig iOS- og Android-oppførsel: trykk på aktiv fane = tilbake til fanens rot, deretter scroll til toppen. For eksempel Finans → Kvitteringer → detalj, trykk på Finans → Oversikt.
4. **Finans → Mer** (`fmer`): Mer-fanen i Finans går til Finans → Mer. På en Finans-underside som ble åpnet fra Finans → Mer, går trykket tilbake til Finans → Mer.
5. Hold inne på fanelinjen (redigering) skal ikke utløse et vanlig trykk. Bruk et eget flagg som nullstilles ved neste `pointerdown`, slik at det ikke «sluker» det neste trykket.

## Implementasjon
- **iOS:** egen `TabView`-selection-binding med `onTapGesture` på samme fane → `path.removeAll()` / `path = NavigationPath()`. For scroll til topp: `ScrollViewReader` + `proxy.scrollTo("top")`.
- **Android Compose:** `onClick = { if (current == tab) navController.popBackStack(tab.startRoute, inclusive = false) else navigate(tab) }`. Scroll til topp: `listState.animateScrollToItem(0)`.
- **Web:** samme logikk i tab-komponenten.

## Test
For hver underside i Mer (Bursdager, Huskeliste, Sporing, Familie og kart, Media, Finans, Nyhetsleser, Innstillinger og underliggende innstillingssider): trykk på Mer, og du skal være i Mer-menyen. Trykk igjen, og menyen scroller til toppen. Test på iPhone, Android og Fold (sidelinje), og i alle tre fanelinje-stilene.
