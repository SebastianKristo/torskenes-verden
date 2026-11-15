import SwiftUI
import UIKit

/* ---------------- Prompt 23: rute-nøkkel og «Mer» som følger modulen ---------------- */

extension Store {
    /// Én tekst som beskriver siden som vises nå (Papir-fane, modul, underside og det som er åpent inne på siden).
    /// Sveip tilbake og scrollposisjonen bruker den til å kjenne igjen sider (Nav23Swipe.swift).
    var nav23Key: String {
        var k: [String] = []
        k.append("p:" + paperTab)
        k.append(module?.rawValue ?? "-")
        k.append(paperFin?.key ?? "-")
        k.append(settingsPage ?? "-")
        k.append(String(folder?.id ?? 0))
        k.append(trkSel ?? "-")
        k.append(stockScreen)
        k.append(selectedReceipt ?? "-")
        k.append(String(finnSel ?? 0))
        k.append(String(selectedTx ?? 0))
        k.append(String(paperTxId ?? 0))
        k.append(dishSel ?? "-")
        k.append(paperEditPage ?? "-")
        k.append(newsOpen ? "n" : "-")
        k.append(paperTrackFull ? "t" : "-")
        k.append(detail != nil ? "d" : "-")
        k.append(editing != nil ? "e" : "-")
        k.append(original != nil ? "o" : "-")
        // Prompt 50: undersidene i Familie (Kart, Personside, Sted …), så sveipet viser riktig side bak.
        if paperTab == "familie" { k.append(Fam50Nav.shared.key) }
        return k.joined(separator: "|")
    }

    /// Finans-undersider uten egen fane i linja (Aksjer, Kvitteringer, Budsjett, Kontoer …): «Mer» er markert,
    /// og et trykk på «Mer» åpner Finans → Mer, ikke appens globale Mer.
    func nav23FinMore() {
        if paperTapBlocked { return }
        if paperTab == "fmer" && paperClassic == nil && paperFin == nil && !paperInner { return }
        selectedReceipt = nil
        stockScreen = "ov"
        paperGo("fmer")
    }
}

extension Store {
    /// Aksjer: ingen skann-knapp (FAB eller + i linja).
    var nav23NoScan: Bool { paperTab == "aksjer" || paperClassic == .stocks || (paperTab == "mer" && paperClassic == nil && paperFin == nil) || scanHiddenOnHome41 }

    /// Aksjer, Boliger og Kvitteringer åpnet fra Finans → Mer (ikke egen fane): sveip og ‹ går til Finans → Mer.
    var nav23SubOfFinMore: Bool {
        if paperInner { return false }
        switch paperTab {
        case "aksjer": return !finNav.contains("aksjer")
        case "boliger": return folder == nil && !finNav.contains("boliger")
        case "kvitt": return !finNav.contains("kvitteringer")
        default: return false
        }
    }
}

// ---- Tidligere Nav26.swift ----

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

// ---- Tidligere Nav34.swift ----

/* ---------------- Prompt 34: innhold under fanelinjen og haptikk på tilbake-knapper ----------------
   Fasit: design/Mobil Papir App.dc.html → scroll-containeren (scRef: margin-bottom 0, padding-bottom 112 px) og hapBack().
   prompts/prompt-34-pakke/claude-code-innhold-under-navbar.md + claude-code-haptikk-tilbake.md.

   Innhold: PaperShell legger ikke lenger en tom rad under innholdet. I stedet får innholdet en safeAreaInset med samme
   høyde som fanelinjen, så ScrollView-ene scroller under den svevende linja og skann-knappen (og hjemstreken), mens siste
   kort fortsatt kan scrolles helt opp over linja. Bare selve pillen har mørk bakgrunn; ingen stripe bak den.

   Haptikk: én lett impuls (UIImpactFeedbackGenerator .light) ved alle tilbake-handlinger: ‹ Hjem / ‹ Finans,
   ‹ Alle innstillinger, Chat ‹, Hjem-fanen fra en annen side, sveip tilbake (når siden lukkes), Vær ✕, AI-kontroll Ferdig.
   Debounce 120 ms, så knapp + navigering aldri gir to. Følger Varsler og haptikk → Haptikk (av = ingen). */

enum Haptic34 {
    nonisolated(unsafe) private static var last: Date = .distantPast

    /// Lett impuls for «tilbake». To kall innen 120 ms gir bare én.
    static func back() {
        Pg52.markBack() // prompt 52: retningen på sideanimasjonen (PageAnimation.swift)
        let h: Haptics = Haptics.shared
        guard h.on, h.taps else { return }
        let now: Date = Date()
        if now.timeIntervalSince(last) < 0.12 { return }
        last = now
        fire(.light)
    }

    /// true like etter en tilbake-impuls (andre haptikk i samme trykk hoppes over).
    static var recent: Bool { Date().timeIntervalSince(last) < 0.15 }

    /// Sveip tilbake: impulsen kommer når siden lukkes. Navigeringen kjører ~250 ms senere og skal ikke gi en til.
    static func backSwipe() {
        back()
        last = Date().addingTimeInterval(0.4)
    }

    /// Lett tikk (guide-steg i Glimt-briefen, valg i AI-kontroll).
    static func light() {
        let h: Haptics = Haptics.shared
        guard h.on, h.taps else { return }
        fire(.light)
    }

    /// To korte tikk («✦ Kvittering lest»).
    static func double() {
        let h: Haptics = Haptics.shared
        guard h.on, h.done else { return }
        fire(.light)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 90_000_000)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    private static func fire(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        if Thread.isMainThread {
            MainActor.assumeIsolated { UIImpactFeedbackGenerator(style: style).impactOccurred() }
        } else {
            Task { @MainActor in UIImpactFeedbackGenerator(style: style).impactOccurred() }
        }
    }
}
