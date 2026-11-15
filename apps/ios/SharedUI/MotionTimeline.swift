import SwiftUI

/* ---------------- Evige animasjoner som respekterer «Reduser bevegelse» ---------------- */
// Fase 4 (C-ios H11): 16 TimelineView(.animation) gikk uten pause når brukeren har slått på Reduser bevegelse.
// MotionTimeline er samme TimelineView, men står stille (viser ett bilde) når accessibilityReduceMotion er på.
// Delt mellom Homelab, widgetene, Kalender og Mac (SharedUI i project.yml).

struct MotionTimeline<Content: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Minste tid mellom bildene (nil = skjermens takt).
    let interval: Double?
    /// Egen pause i tillegg (f.eks. når animasjonen er ferdig).
    let paused: Bool
    let content: (TimelineViewDefaultContext) -> Content

    init(interval: Double? = nil, paused: Bool = false, @ViewBuilder content: @escaping (TimelineViewDefaultContext) -> Content) {
        self.interval = interval
        self.paused = paused
        self.content = content
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: interval, paused: paused || reduceMotion)) { (ctx: TimelineViewDefaultContext) in
            content(ctx)
        }
    }
}
