import SwiftUI
import WidgetKit

/* ---------------- Prompt 70 (KAL70): Innstillinger → Widgets og kortet «Kalender på hjemskjermen» ---------------- */
// Fasit: claude-code-kalender-neste-release.md.
// - KalWSettings70: hvilke kalendere widgetene viser (standard alle), «Skjul fullførte i dag» og «Legg til widget» (veiledning,
//   iOS har ikke et API for å legge til en widget fra appen). Valgene ligger i App Group-en (KalWPrefs70), og widgetene tegnes
//   på nytt med en gang.
// - KalWIntro70Host: vises én gang etter oppdateringen («Legg til widget» · «Senere»), aldri samtidig med «Nytt i denne versjonen».

enum KalW70 {
    static func reload() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}

struct KalWSettings70: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @State private var off: Set<String> = KalWPrefs70.off
    @State private var hideDone: Bool = KalWPrefs70.hideDone
    @State private var guide: Bool = false

    private var cals: [KalCal] {
        s.cals.uniqueIds().filter { (c: KalCal) -> Bool in c.shown }
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(cals) { (c: KalCal) in
                KalOptionRow(title: c.name, sub: "Vises i widgetene", on: !off.contains(c.id)) { toggle(c.id) }
            }
            KalOptionRow(title: "Skjul fullførte i dag", sub: "Ferdige hendelser forsvinner fra widgetene", on: hideDone) {
                hideDone.toggle()
                KalWPrefs70.hideDone = hideDone
                KalW70.reload()
            }
            KalLinkRow35(title: "Legg til widget", sub: "Hjem-skjerm, låseskjerm og StandBy") { guide = true }
        }
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
        .sheet(isPresented: $guide) {
            KalWGuide70().environment(\.kal, t)
        }
    }

    private func toggle(_ id: String) {
        let show: Bool = off.contains(id)
        KalWPrefs70.set(id, shown: show)
        off = KalWPrefs70.off
        KalW70.reload()
    }
}

/// Veiledning: slik legger du til Kalender-widgeten (iOS lar ikke appen gjøre det selv).
struct KalWGuide70: View {
    @Environment(\.kal) private var t
    @Environment(\.dismiss) private var dismiss

    private let steps: [String] = [
        "Hold inne på et tomt sted på Hjem-skjermen til appene vibrerer.",
        "Trykk på Rediger øverst til venstre og velg Legg til widget (eller + på eldre iOS).",
        "Søk etter Kalender og velg liten, medium eller stor. Trykk Legg til widget.",
    ]

    private let lock: [String] = [
        "Låseskjerm: hold inne på låseskjermen → Tilpass → Låseskjerm → trykk på feltet under klokken → Kalender.",
        "StandBy: lad telefonen liggende på siden, sveip til widgetene og hold inne for å legge til Kalender.",
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                KalLabel(text: "WIDGETS", color: t.red)
                Spacer()
                KalPill(title: "Ferdig") { dismiss() }
            }
            Text("Kalender på hjemskjermen").font(KalFont.serif(26)).foregroundStyle(t.ink)
            ForEach(0..<steps.count, id: \.self) { (i: Int) in
                row(String(i + 1), steps[i])
            }
            Rectangle().fill(t.line2).frame(height: 1)
            ForEach(0..<lock.count, id: \.self) { (i: Int) in
                row("•", lock[i])
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.bg.ignoresSafeArea())
        .presentationDetents([.medium, .large])
    }

    private func row(_ n: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(n).font(KalFont.ui(14, .bold)).foregroundStyle(t.red).frame(width: 16, alignment: .leading)
            Text(text).font(KalFont.ui(14)).foregroundStyle(t.ink).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/* ---------- «Nytt i versjonen»: Kalender på hjemskjermen ---------- */

struct KalWIntro70Host: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @ObservedObject private var m: KalSec51Model = KalSec51Model.shared
    @State private var seen: Bool = KalWPrefs70.introSeen
    @State private var guide: Bool = false

    private var show: Bool { !seen && s.loggedIn && m.whatsNew == nil }

    var body: some View {
        ZStack {
            if show {
                Color.black.opacity(0.35).ignoresSafeArea()
                    .onTapGesture { done() }
                KalWIntro70Card(add: {
                    done()
                    guide = true
                }, later: { done() })
                .padding(.horizontal, 22)
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: show)
        .sheet(isPresented: $guide) {
            KalWGuide70().environment(\.kal, t)
        }
    }

    private func done() {
        KalWPrefs70.introSeen = true
        seen = true
    }
}

struct KalWIntro70Card: View {
    @Environment(\.kal) private var t
    let add: () -> Void
    let later: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            KalLabel(text: "NYTT I DENNE VERSJONEN", color: t.red)
            Text("Kalender på hjemskjermen").font(KalFont.serif(26)).foregroundStyle(t.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text("Hold inne på hjemskjermen og legg til Kalender-widgeten.").font(KalFont.ui(14)).foregroundStyle(t.ink)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Spacer()
                KalPill(title: "Senere", filled: false) { later() }
                KalPill(title: "Legg til widget") { add() }
            }
        }
        .padding(20)
        .frame(maxWidth: 440)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(t.bg))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(t.line, lineWidth: 1))
        .shadow(color: Color.black.opacity(0.2), radius: 18, y: 8)
        .accessibilityElement(children: .contain)
    }
}
