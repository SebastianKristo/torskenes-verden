# FEIL: wiggle-redigering virker på Android, men ikke i iOS-appen

Ønske 2026-10-21: «wiggle mode redigering på mobil funker på android meni ikke ios appen»
Fasit: `Mobil Papir App.dc.html` → `edVals()` (`down/move/up`, `save`). Android-appen oppfører seg riktig og er referansen for funksjonen.
Bygger på `claude-code-wiggle-krasj-ios.md` (prompt 37) og `claude-code-wiggle-scroll-ios.md` (prompt 41). Sjekk at de fiksene faktisk ligger i iOS-koden, og ikke bare i Android.

## Gjelder alle wiggle-moduser i iOS-appen
Hjem, Finans → Mer, Mat, Sporing, Abonnementer, Yr/Storm-siden og andre steder med «hold inne for å redigere».

## 0. Fasit som virker: Subscription OS (2026-10-21)
Ønske: «tilbake med wiggle redigering for info jeg får scrollet med wiggle redigering på ios i subscription os siden.»
- **På iOS virker wiggle + scroll på Subscription OS-siden.** Bruk den koden som mal for de andre sidene i stedet for å finne opp noe nytt.
- Sammenlign Subscription OS med Hjem, Finans → Mer, Mat og Sporing, og se etter forskjeller i:
  1. **Gester:** hvordan hold-for-løft er lagt på (`.simultaneousGesture` / `.draggable` / `onLongPressGesture`) og om Hjem bruker `.gesture`/`DragGesture(minimumDistance: 0)` som spiser scroll.
  2. **Scroll-container:** `ScrollView` vs. `List`, og om `.scrollDisabled` settes for tidlig på Hjem (før kortet faktisk er løftet).
  3. **Modus-tilstand:** felles `EditState` på siden (Subscription OS) vs. `@State` per kort.
  4. **Wiggle-animasjon:** `rotationEffect` på et lag (riktig) vs. endring av `frame`/layout (gir hakk og stjålne gester).
  5. **id-er:** stabile `ForEach(id: \.key)` vs. indeks.
- Flytt det som er felles ut i én komponent, f.eks. `WiggleReorderList<Item>` (SwiftUI) med samme oppførsel overalt: hold 0,3 s = løft, sveip = scroll, «–» skjul, «Rediger widget». Bytt Hjem, Finans → Mer, Mat og Sporing til den.
- Test hver side på fysisk iPhone etter byttet: scroll opp/ned i redigeringsmodus, løft og flytt, lagre.

## 1. Finn ut hvor det stopper (logg det)
Legg inn `Logger(subsystem: "papir", category: "wiggle")` med én linje per steg, og test på fysisk iPhone:
1. `longPress.began` – registreres holdet i det hele tatt?
2. `edit.enter` – slås redigeringsmodus på (`isEditing = true`)?
3. `drag.lift` / `drag.move` / `drag.drop` – løftes og flyttes kortet?
4. `save` – lagres ny rekkefølge og skjulte kort?

Det første steget som mangler, er feilen. Vanlige årsaker per steg under.

## 2. Holdet starter ikke redigering
- **`.contextMenu` eller `Button` på kortet tar long-press først.** iOS gir long-press til kontekstmenyen og til knappens trykk-tilstand før din `onLongPressGesture`. Fjern `.contextMenu` fra kortene på sider med wiggle, og legg holdet med `.simultaneousGesture(LongPressGesture(minimumDuration: 0.5).onEnded { enterEdit() })`. Kortets vanlige trykk blir `.onTapGesture` som er av når `isEditing` er på.
- **`ScrollView` spiser holdet.** Holdet må ligge på kortet med `.simultaneousGesture`, ikke `.gesture` og ikke `.highPriorityGesture`.
- **Android-koden bruker et signal iOS ikke sender** (f.eks. web-`contextmenu`-hendelse eller `onLongClick` i en delt komponent). På iOS må holdet være en egen `LongPressGesture`.
- Haptikk: `UIImpactFeedbackGenerator(style: .medium).impactOccurred()` når modus slås på. Ikke `navigator.vibrate` eller Android-API i delt kode; det finnes ikke på iOS og kan kaste feil som stopper resten.

## 3. Modus slås på, men ingenting skjer på skjermen
- Tilstanden må ligge i én `@Observable`/`@StateObject` per side (`EditState`), ikke i en `@State` inne i hvert kort. Ellers vet bare kortet du holdt på at modus er på.
- Wiggle: `.rotationEffect(.degrees(isEditing ? (i.isMultiple(of: 2) ? 0.45 : -0.45) : 0))` med `.animation(.easeInOut(duration: 0.3).repeatForever(autoreverses: true), value: isEditing)`. Slå av når «Reduser bevegelse» er på (vis bare minus-merke og pillene).
- Minus-merke, «Rediger widget» og verktøylinja (+ og ✓) skal vises; innholdet får 64 pt luft øverst (`claude-code-wiggle-verktoylinje.md`).

## 4. Kortet kan ikke flyttes
Følg `claude-code-wiggle-scroll-ios.md`: sveip = scroll, hold 0,3 s = løft, så dra.
- Foretrukket: `.draggable(card.id)` + `.dropDestination(for: String.self)` per kort i `LazyVStack` (iOS 16+).
- Alternativ: `LongPressGesture(0.3).sequenced(before: DragGesture())` som `.simultaneousGesture`, og `.scrollDisabled(isDragging)` bare etter løft.
- Stabil `id` på kortene (`ForEach(cards, id: \.key)`), ikke indeks. Indeks som id gir krasj og kort oppå hverandre når rekkefølgen endres.
- Flytt i arrayet med `move(fromOffsets:toOffset:)` inne i `withAnimation(.spring(duration: 0.25))`. Ikke endre arrayet mens `ForEach` itererer (krasjen fra prompt 37).

## 5. Endringene lagres ikke
- Lagre samme struktur som Android: `papir_layout = {o: [...], h: [...]}` og `papir_wopt` per bruker og enhet, og synk med serveren.
- Lagre ved slipp og ved ✓, ikke bare ved `onDisappear`.
- Les inn ved oppstart før første tegning, så rekkefølgen ikke hopper.

## Test (fysisk iPhone, ikke bare simulator)
- Hold på et kort på Hjem 0,5 s → haptikk → alle kort vugger, minus og «Rediger widget» vises.
- Sveip opp og ned i redigeringsmodus → siden scroller, ingenting flytter seg.
- Hold 0,3 s og dra Avganger under Sporing → de andre glir unna → slipp → ✓ → lukk og åpne appen → rekkefølgen står.
- Skjul et kort med minus, legg det tilbake med +.
- Samme test i Finans → Mer, Mat, Sporing og Abonnementer.
- iPhone SE og 15 Pro, med og uten «Reduser bevegelse».
