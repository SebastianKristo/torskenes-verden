# Ruter → «Min reise»: «⇄ Snu»-knappen skal ha samme størrelse som i designet

Vedlegg: `uploads/Screenshot 2026-10-20 at 19.26.02.png` (iOS-appen), `… 19.26.16.png` og `… 19.26.38.png` (designet).
Fasit: `Mobil Papir App.dc.html` → Ruter-kortet «MIN REISE · SEBASTIAN» (`rt.flip`).

I iOS-appen er Snu-knappen lavere og mindre (ca. 28 pt), og den står oppe ved etiketten. I designet er den større og står midt på høyde med etikett + tittel.

## Mål (fra designet)
- **Høyde 36 pt**, `padding: 0 13 pt`, radius 18 (pille).
- Kant 1 pt `--line` (`#ddd5c5`), transparent bakgrunn, tekst `--ink`.
- Tekst «⇄ Snu»: Manrope **700, 12,5 pt**. Pilen er en del av teksten (samme farge og størrelse), med 4 pt avstand før «Snu».
- `flex: none`, så den aldri krymper.
- **Plassering:** høyre side av raden med etikett («MIN REISE · SEBASTIAN») og tittel («Skole → Amagerveien»), **vertikalt sentrert** mot hele blokken (etikett + tittel), ikke toppjustert mot etiketten. Raden: `display:flex; align-items:center; justify-content:space-between; gap:10`.
- Treffflaten utvides til minst 44 × 44 pt uten å endre det synlige (SwiftUI `.contentShape(Rectangle()).frame(minHeight:44)` / Compose `Modifier.minimumInteractiveComponentSize()`).

## SwiftUI
```swift
Button { flip() } label: {
  Text("⇄ Snu").font(.custom("Manrope-Bold", size: 12.5))
    .padding(.horizontal, 13).frame(height: 36)
    .overlay(Capsule().stroke(Color.line, lineWidth: 1))
}
.buttonStyle(.plain).fixedSize()
```
Ikke bruk `.controlSize(.small)` eller `.font(.caption)`, som gir den lave varianten i skjermbildet.

## Test
Legg iOS og designet ved siden av hverandre på iPhone 15/16 Pro: knappen har samme høyde, bredde og tekststørrelse, og står midt på høyde med tittelen.
