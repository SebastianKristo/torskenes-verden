import SwiftUI

/* ---------------- Prompt 33: Kalender – toppfeltet og visningsvelgeren ---------------- */
// Liten rød linje (år / uke / ukedag) og stor tittel. Trykk på tittelen zoomer ut. ☰ åpner Kalendere.
// Høyre: ‹ › (forrige/neste), I dag (bare når man ikke ser i dag) og søk. Pille: År · Mnd · Uke · 3 d · Dag · Liste.

struct KalHead {
    let kicker: String
    let title: String
    let inToday: Bool
    let nav: Bool
}

enum KalHeadText {
    static func range(_ a: Date, _ b: Date) -> String {
        if KalD.month(a) == KalD.month(b) {
            return String(KalD.dayOfMonth(a)) + ".–" + String(KalD.dayOfMonth(b)) + ". " + KalD.monthsShort[KalD.month(b) - 1]
        }
        return String(KalD.dayOfMonth(a)) + ". " + KalD.monthsShort[KalD.month(a) - 1] + "–" + String(KalD.dayOfMonth(b)) + ". " + KalD.monthsShort[KalD.month(b) - 1]
    }

    @MainActor static func make(_ s: KalStore) -> KalHead {
        let A: Date = KalD.date(s.anchor)
        let T: Date = KalD.today()
        let wk: Int = KalD.isoWeek(A)
        switch s.view {
        case "mnd":
            let same: Bool = KalD.month(A) == KalD.month(T) && KalD.year(A) == KalD.year(T)
            return KalHead(kicker: String(KalD.year(A)), title: KalD.cap(KalD.months[KalD.month(A) - 1]), inToday: same, nav: true)
        case "uke":
            // Prompt 35: «Uken starter» (mandag/søndag).
            let m0: Date = KalWeek35.start(A)
            let inT: Bool = KalD.key(KalWeek35.start(T)) == KalD.key(m0)
            return KalHead(kicker: "UKE " + String(KalWeek35.weekNo(m0)) + " · " + String(KalD.year(m0)), title: range(m0, KalD.add(m0, 6)), inToday: inT, nav: true)
        case "3d":
            let inT: Bool = T >= A && T <= KalD.add(A, 2)
            return KalHead(kicker: "UKE " + String(wk), title: range(A, KalD.add(A, 2)), inToday: inT, nav: true)
        case "dag":
            let k: String = KalD.weekdays[KalD.wd(A)].uppercased() + " · UKE " + String(wk)
            let title: String = String(KalD.dayOfMonth(A)) + ". " + KalD.months[KalD.month(A) - 1]
            return KalHead(kicker: k, title: title, inToday: s.anchor == KalD.todayKey(), nav: true)
        case "ar":
            return KalHead(kicker: "ÅR", title: String(KalD.year(A)), inToday: KalD.year(A) == KalD.year(T), nav: true)
        default:
            return KalHead(kicker: "NESTE 6 UKER", title: "Agenda", inToday: true, nav: false)
        }
    }
}

struct KalHeader: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    var body: some View {
        let h: KalHead = KalHeadText.make(s)
        VStack(spacing: 10) {
            HStack(alignment: .bottom, spacing: 8) {
                menuButton
                Button(action: { s.zoomOut() }) {
                    // Prompt 35: tittelen gir plass (min-width 0 + ellipsis), ikke knappene.
                    VStack(alignment: .leading, spacing: 3) {
                        Text(h.kicker).font(KalFont.mono(10.5)).tracking(1.3).foregroundStyle(t.acc).lineLimit(1)
                        Text(h.title).font(KalFont.serif(32)).foregroundStyle(t.ink).lineLimit(1).minimumScaleFactor(0.7).truncationMode(.tail)
                    }
                    .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .layoutPriority(0)
                .accessibilityLabel(h.title + ", zoom ut")
                // Prompt 35: rekkefølge I dag · ‹ · › · søk. Knappegruppen har fast bredde (flex: none).
                HStack(spacing: 5) {
                    if !h.inToday { KalTodayPill35 { s.goToday() } }
                    if h.nav {
                        KalRoundIcon(name: "chevron.left", label: "Forrige") { s.step(-1) }
                        KalRoundIcon(name: "chevron.right", label: "Neste") { s.step(1) }
                    }
                    KalRoundIcon(name: "magnifyingglass", label: "Søk") {
                        s.query = ""
                        s.searchCal = nil
                        withAnimation(.easeOut(duration: 0.2)) { s.searchOpen = true }
                    }
                }
                .fixedSize()
                .layoutPriority(2)
                .padding(.bottom, 1)
            }
            KalViewPicker()
        }
        .padding(.horizontal, 14)
        .padding(.top, 2)
        .padding(.bottom, 8)
    }

    private var menuButton: some View {
        Button(action: {
            KalHaptic.tap()
            withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3)) { s.drawerOpen = true }
        }) {
            Image(systemName: "line.3.horizontal").font(.system(size: 19, weight: .semibold))
                .foregroundStyle(t.ink)
                .frame(width: 34, height: 44)
        }
        .buttonStyle(.plain)
        .padding(.leading, -4)
        .accessibilityLabel("Kalendere")
    }
}

/// Rund ikonknapp (34 pt, treffflate 44).
struct KalRoundIcon: View {
    @Environment(\.kal) private var t
    let name: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: name).font(.system(size: 14, weight: .bold))
                .foregroundStyle(t.ink)
                .frame(width: 34, height: 34)
                .background(Circle().fill(t.chip))
                .frame(width: 38, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct KalViewOpt: Identifiable, Hashable {
    let id: String
    let name: String
}

struct KalViewPicker: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    static let views: [KalViewOpt] = [KalViewOpt(id: "ar", name: "År"), KalViewOpt(id: "mnd", name: "Mnd"), KalViewOpt(id: "uke", name: "Uke"),
                                      KalViewOpt(id: "3d", name: "3 d"), KalViewOpt(id: "dag", name: "Dag"), KalViewOpt(id: "liste", name: "Liste")]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(KalViewPicker.views) { (v: KalViewOpt) in
                Button(action: { s.go(view: v.id) }) {
                    Text(v.name).font(KalFont.ui(12.5, .bold))
                        .foregroundStyle(s.view == v.id ? t.ink : t.mut)
                        .frame(maxWidth: .infinity)
                        .frame(height: 32)
                        .background(pill(v.id))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(v.name)
                .accessibilityAddTraits(s.view == v.id ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Capsule().fill(t.chip))
    }

    @ViewBuilder private func pill(_ id: String) -> some View {
        if s.view == id {
            Capsule().fill(t.card).shadow(color: Color.black.opacity(0.14), radius: 1.5, y: 1)
        } else {
            Capsule().fill(Color.clear)
        }
    }
}

/// Prompt 35: «I dag» er en pille (ikke en ikonknapp): ingen fast bredde, nowrap, 34 høy, padding 0 13, radius 17, mørk med lys tekst.
struct KalTodayPill35: View {
    @Environment(\.kal) private var t
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text("I dag")
                .font(KalFont.ui(12.5, .bold))
                .lineLimit(1)
                .fixedSize()
                .foregroundStyle(t.bg)
                .padding(.horizontal, 13)
                .frame(height: 34)
                .background(Capsule().fill(t.ink))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .fixedSize()
        .accessibilityLabel("I dag")
    }
}
