import SwiftUI
import UIKit

/* ---------------- Prompt 34: innhold under fanelinjen og haptikk på tilbake-knapper ----------------
   Fasit: design/Mobil Papir App.dc.html → scroll-containeren (scRef: margin-bottom 0, padding-bottom 112 px) og hapBack().
   prompts/prompt-34-pakke/claude-code-innhold-under-navbar.md + claude-code-haptikk-tilbake.md.

   Innhold: PaperShell legger ikke lenger en tom rad under innholdet. I stedet får innholdet en safeAreaInset med samme
   høyde som fanelinjen, så ScrollView-ene scroller under den svevende linja og skann-knappen (og hjemstreken), mens siste
   kort fortsatt kan scrolles helt opp over linja. Bare selve pillen har mørk bakgrunn; ingen stripe bak den.

   Haptikk: én lett impuls (UIImpactFeedbackGenerator .light) ved alle tilbake-handlinger: ‹ Hjem / ‹ Finans,
   ‹ Alle innstillinger, Chat ‹, Hjem-fanen fra en annen side, sveip tilbake (når siden lukkes), Vær ✕, AI-kontroll Ferdig.
   Debounce 120 ms, så knapp + navigering aldri gir to. Følger Varsler og haptikk → Haptikk (av = ingen). */

/// Tom plass nederst som tilsvarer fanelinjen (0 = ingen fanelinje).
struct Nav34BarSpace: View {
    let height: CGFloat

    var body: some View {
        Color.clear
            .frame(height: Swift.max(0, height))
            .allowsHitTesting(false)
    }
}

enum Haptic34 {
    nonisolated(unsafe) private static var last: Date = .distantPast

    /// Lett impuls for «tilbake». To kall innen 120 ms gir bare én.
    static func back() {
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
