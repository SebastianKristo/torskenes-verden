import SwiftUI

/* ---------------- Prompt 26: trykk på aktiv fane går til fanens rot (claude-code-mer-fane.md) ----------------
   Første trykk på en fane som allerede er markert: tilbake til roten av fanen (f.eks. Mer → Bursdager → Mer-menyen).
   Neste trykk når du står på roten: scroll til toppen (PaperPage lytter på topTick).
   Hold inne på fanelinjen åpner redigering. Klikket som kommer når fingeren slippes, slukes én gang (holdAt),
   så det neste vanlige trykket virker som normalt. */

@MainActor
@Observable
final class Nav26 {
    static let shared = Nav26()

    /// Økes når siden skal scrolles til toppen.
    var topTick: Int = 0
    /// Når fanelinjen sist ble holdt inne (redigering). Nullstilles av første trykk etterpå.
    @ObservationIgnored var holdAt: Date = .distantPast

    func scrollTop() {
        topTick += 1
    }

    func markHold() {
        holdAt = Date()
    }

    /// true én gang rett etter et langt trykk: det trykket skal ikke navigere.
    func consumeHold() -> Bool {
        let fresh: Bool = Date().timeIntervalSince(holdAt) < 1.2
        holdAt = .distantPast
        return fresh
    }
}

extension Store {
    /// Papir-siden som er roten til fanen `id` i fanelinjen.
    func nav26RootTab(_ id: String) -> String {
        return id
    }

    /// Står vi på roten av fanen, uten noe åpent oppå?
    func nav26AtRoot(_ id: String) -> Bool {
        if paperEditPage != nil || newsOpen || dishSel != nil || paperInner || paperTrackFull { return false }
        if paperTab == "boliger" && folder != nil { return false }
        // Budsjett og Kontoer er sider fra den klassiske appen: roten er selve siden.
        if id == "budsjett" { return paperFin == .budget }
        if id == "kontoer" { return paperClassic == .accounts }
        if paperFin != nil || paperClassic != nil { return false }
        return paperTab == nav26RootTab(id)
    }

    /// Trykk på fanen som allerede er markert.
    func nav26TapActive(_ id: String) {
        if nav26AtRoot(id) {
            Haptics.shared.select()
            Nav26.shared.scrollTop()
            return
        }
        nav26GoRoot(id)
    }

    /// Tøm det som er åpent og gå til roten av fanen (historikken for fanen nullstilles).
    func nav26GoRoot(_ id: String) {
        dishSel = nil
        paperEditPage = nil
        if paperInDomains {
            paperGo(id)
            return
        }
        if paperInFinance {
            if id == "fmer" {
                paperGo("fmer")
            } else {
                paperFinGo(id)
            }
            return
        }
        paperMainTab(id)
    }

    /// Finans → Mer: første trykk går til Finans → Mer, neste scroller til toppen.
    func nav26FinMore() {
        if paperTab == "fmer" && nav26AtRoot("fmer") {
            Haptics.shared.select()
            Nav26.shared.scrollTop()
            return
        }
        nav23FinMore()
    }
}
