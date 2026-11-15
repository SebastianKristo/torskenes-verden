import SwiftUI
import UIKit

/* ---------------- Prompt 44: sveip mellom måneder åpner ikke uke, hold inne / trykk for ny hendelse ---------------- */
// Fasit: Kalender App.dc.html → te / swClk (klikk innen 450 ms etter et sveip stoppes), newOn(k) (hold 480 ms) og tap i
// tidsrutenettet (floor(min/30)*30). Spesifikasjon: claude-code-kalender-sveip-maned.md og claude-code-kalender-hold-dag-ny.md.
// Årsak (iPhone/iPad): dagcellen var en Button. Et kort, horisontalt sveip som slapp innenfor knappens sporingsflate
// ga både månedsbytte (sveipet) og trykk på dagen (Button) – uke-visningen åpnet seg. Nå: sveipet merkes så snart fingeren
// har flyttet seg mer enn 12 pt, og trykk/hold innen 450 ms etter et sveip ignoreres.

@MainActor
enum KalSwipe44 {
    /// Sist fingeren flyttet seg mer enn 12 pt (sveip), eller et langt trykk ble utløst.
    static var at: Date = .distantPast

    static func mark() { at = Date() }

    /// true rett etter et sveip (450 ms): trykket skal ikke åpne noe.
    static var recent: Bool { Date().timeIntervalSince(at) < 0.45 }

    /// Lett vibrasjon for hold inne.
    static func hold() {
        let g: UIImpactFeedbackGenerator = UIImpactFeedbackGenerator(style: .medium)
        g.impactOccurred()
    }
}

/// Trykk på tom plass i tidsrutenettet: ny hendelse på klokkeslettet, avrundet ned til halvtime (21:10 → 21:00–22:00).
/// (Hold inne i rutenettet er ikke med: et langt trykk og et trykk på samme flate ga to ark etter hverandre.)
struct KalSlotTap44: ViewModifier {
    let day: String
    let hourH: CGFloat

    func body(content: Content) -> some View {
        content
            .contentShape(Rectangle())
            .onTapGesture(coordinateSpace: .local) { (p: CGPoint) in tap(p.y) }
    }

    private func minutes(_ y: CGFloat, step: Int) -> Int {
        let raw: Int = Int((y / hourH) * 60)
        let m: Int = (raw / step) * step
        return Swift.max(0, Swift.min(23 * 60 + 30, m))
    }

    @MainActor private func tap(_ y: CGFloat) {
        if KalSwipe44.recent { return }
        KalStore.shared.newOn44(day: day, at: minutes(y, step: 30))
    }
}
