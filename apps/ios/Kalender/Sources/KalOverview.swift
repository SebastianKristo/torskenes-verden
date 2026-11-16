import SwiftUI

/* ---------------- Q26: Oversikt – kortsiden fra Homelabs gamle kalender (Mer → Kalender) i den delte Kalenderen ---------------- */
// Kortene: Nå-kort (A), Prøver og frister med nedtelling (B), Kalendere (C), Kalender med Uke/Måned/Liste (D) og Widgets (E).
// Rediger: ▲ ▼ flytter, − skjuler, «SKJULT · + …» henter tilbake, Tilbakestill. Valgene er de samme layoutfeltene som før
// (kalOrder, kalHidden i GET/PUT /api/me/layout), så rekkefølgen følger brukeren mellom enhetene. Åpnes fra sidemenyen
// (Oversikt) og med kalender://oversikt.

@MainActor
@Observable
final class KalOverviewModel {
    static let shared: KalOverviewModel = KalOverviewModel()

    nonisolated static let cardKeys: [String] = ["A", "B", "C", "D", "E"]
    nonisolated static let cardNames: [String: String] = ["A": "Nå-kort", "B": "Prøver og frister", "C": "Kalendere", "D": "Kalender", "E": "Widgets"]
    nonisolated private static let localKey: String = "kal.cards"

    var order: [String] = KalOverviewModel.cardKeys
    var hidden: Set<String> = []
    var editing: Bool = false
    @ObservationIgnored private var read: Bool = false

    init() {
        if let o = UserDefaults.standard.dictionary(forKey: KalOverviewModel.localKey) { apply(o) }
    }

    var visible: [String] { order.filter { (k: String) -> Bool in !hidden.contains(k) } }

    nonisolated static func fullOrder(_ o: [String]) -> [String] {
        var out: [String] = []
        for k in o where cardKeys.contains(k) && !out.contains(k) { out.append(k) }
        for k in cardKeys where !out.contains(k) { out.append(k) }
        return out
    }

    /// kalOrder (liste) og kalHidden (liste eller {A: true}) fra profilen.
    func apply(_ o: [String: Any]) {
        if let ord = o["kalOrder"] as? [String], !ord.isEmpty { order = KalOverviewModel.fullOrder(ord) }
        if let h = o["kalHidden"] as? [String] {
            hidden = Set(h.filter { (k: String) -> Bool in KalOverviewModel.cardKeys.contains(k) })
        } else if let h = o["kalHidden"] as? [String: Any] {
            var out: Set<String> = []
            for (k, v) in h where KalOverviewModel.cardKeys.contains(k) && ((v as? Bool) ?? false) { out.insert(k) }
            hidden = out
        }
    }

    /// Profilen vinner over det lokale (samme regel som i Homelab).
    func load() async {
        if read { return }
        guard let d = try? await KalNet.get("/api/me/layout", timeout: 10) else { return }
        read = true
        let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        apply(o)
        saveLocal()
    }

    private func saveLocal() {
        let o: [String: Any] = ["kalOrder": order, "kalHidden": Array(hidden).sorted()]
        UserDefaults.standard.set(o, forKey: KalOverviewModel.localKey)
    }

    private func save() {
        saveLocal()
        let body: [String: Any] = ["kalOrder": order, "kalHidden": Array(hidden).sorted()]
        Task { _ = try? await KalNet.send("PUT", "/api/me/layout", json: body, timeout: 15) }
    }

    func move(_ k: String, _ dir: Int) {
        var o: [String] = KalOverviewModel.fullOrder(order)
        guard let i = o.firstIndex(of: k) else { return }
        let j: Int = i + dir
        guard j >= 0, j < o.count else { return }
        o.swapAt(i, j)
        KalHaptic.tap()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { order = o }
        save()
    }

    /// Skjuler et kort. Minst ett kort må være synlig.
    func hide(_ k: String) {
        if visible.count <= 1 { return }
        KalHaptic.tap()
        withAnimation(.easeOut(duration: 0.2)) { _ = hidden.insert(k) }
        save()
    }

    func show(_ k: String) {
        KalHaptic.tap()
        withAnimation(.easeOut(duration: 0.2)) { _ = hidden.remove(k) }
        save()
    }

    /// Tilbakestill: alle kort synlige og standard rekkefølge.
    func reset() {
        KalHaptic.tap()
        withAnimation(.easeOut(duration: 0.2)) {
            order = KalOverviewModel.cardKeys
            hidden = []
        }
        save()
    }
}

extension KalStore {
    /// Lukker Oversikt og viser hendelsen (Dag + detaljarket).
    func openFromOverview(_ id: String) {
        guard let e = event(id) else { return }
        KalHaptic.tap()
        overviewOpen = false
        KalOverviewModel.shared.editing = false
        view = "dag"
        anchor = e.day
        detId = e.id
    }

    /// Lukker Oversikt og bytter visning (kortet Kalender).
    func viewFromOverview(_ v: String) {
        KalHaptic.tap()
        overviewOpen = false
        KalOverviewModel.shared.editing = false
        view = v
        anchor = KalD.todayKey()
        Task { await load() }
    }
}

/* ---------- Siden ---------- */

struct KalOverviewView: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @MainActor private var m: KalOverviewModel { KalOverviewModel.shared }

    var body: some View {
        VStack(spacing: 0) {
            top
            ScrollView {
                TimelineView(.everyMinute) { ctx in
                    KalOverviewBody(now: ctx.date)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 30)
            }
            .scrollIndicators(.hidden)
        }
        .background(t.bg.ignoresSafeArea())
        .task { await m.load() }
    }

    private var top: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Button(action: {
                    KalHaptic.tap()
                    m.editing = false
                    s.overviewOpen = false
                }) {
                    Text("‹ Kalender").font(KalFont.ui(15, .semibold)).foregroundStyle(t.ink).frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                Spacer()
                KalPill(title: m.editing ? "Ferdig" : "Rediger", filled: m.editing) {
                    withAnimation(.easeOut(duration: 0.2)) { m.editing.toggle() }
                }
            }
            Text("Oversikt").font(KalFont.serif(34)).foregroundStyle(t.ink)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }
}

struct KalOverviewBody: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalOverviewModel { KalOverviewModel.shared }
    let now: Date

    var body: some View {
        let vis: [String] = m.visible
        VStack(spacing: 14) {
            if m.editing {
                KalOverviewEditBar()
                if !m.hidden.isEmpty { KalOverviewHiddenRow() }
            }
            ForEach(Array(vis.enumerated()), id: \.element) { pair in
                KalOverviewCard(key: pair.element, index: pair.offset, count: vis.count) { card(pair.element) }
            }
        }
    }

    @ViewBuilder private func card(_ k: String) -> some View {
        switch k {
        case "A": KalNowCard(now: now)
        case "B": KalTestsCard()
        case "C": KalCalsCard()
        case "D": KalViewsCard()
        default: KalWidgetsCard()
        }
    }
}

/// «Flytt med ▲ ▼ · skjul med −» og Tilbakestill.
struct KalOverviewEditBar: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalOverviewModel { KalOverviewModel.shared }

    var body: some View {
        HStack(spacing: 6) {
            Text("Flytt med ▲ ▼ · skjul med −").font(KalFont.ui(13.5, .semibold)).foregroundStyle(t.bg)
                .lineLimit(1).minimumScaleFactor(0.75)
            Spacer(minLength: 4)
            Button(action: { m.reset() }) {
                Text("Tilbakestill").font(KalFont.ui(12.5, .semibold)).foregroundStyle(t.bg).padding(.horizontal, 12).frame(minHeight: 44)
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 16).padding(.trailing, 6)
        .background(Capsule().fill(t.ink))
    }
}

/// «SKJULT · + Nå-kort · + Widgets …»: et trykk tar kortet tilbake.
struct KalOverviewHiddenRow: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalOverviewModel { KalOverviewModel.shared }

    var body: some View {
        let hid: [String] = KalOverviewModel.cardKeys.filter { (k: String) -> Bool in m.hidden.contains(k) }
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                KalLabel(text: "SKJULT")
                ForEach(hid, id: \.self) { (k: String) in
                    Button(action: { m.show(k) }) {
                        Text("+ " + (KalOverviewModel.cardNames[k] ?? k)).font(KalFont.ui(12.5, .semibold)).foregroundStyle(t.ink)
                            .padding(.horizontal, 12).frame(minHeight: 36)
                            .overlay(Capsule().strokeBorder(t.line, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Vis " + (KalOverviewModel.cardNames[k] ?? k))
                }
            }
            .padding(.vertical, 4)
        }
    }
}

/// Ett kort: i Rediger stiplet ramme, ▲ ▼ − øverst til høyre, og innholdet er sperret.
struct KalOverviewCard<C: View>: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalOverviewModel { KalOverviewModel.shared }
    let key: String
    let index: Int
    let count: Int
    @ViewBuilder let content: () -> C

    var body: some View {
        content()
            .allowsHitTesting(!m.editing)
            .overlay {
                if m.editing {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .strokeBorder(t.line, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                }
            }
            .overlay(alignment: .topTrailing) {
                if m.editing { controls.padding(6) }
            }
    }

    private var controls: some View {
        HStack(spacing: 4) {
            button("▲", "Flytt " + name + " opp", index > 0) { m.move(key, -1) }
            button("▼", "Flytt " + name + " ned", index < count - 1) { m.move(key, 1) }
            button("−", "Skjul " + name, count > 1) { m.hide(key) }
        }
    }

    private var name: String { KalOverviewModel.cardNames[key] ?? key }

    private func button(_ sym: String, _ label: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(sym).font(KalFont.ui(14, .bold)).foregroundStyle(t.bg)
                .frame(width: 36, height: 36)
                .background(Circle().fill(t.ink))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!on)
        .opacity(on ? 1 : 0.35)
        .accessibilityLabel(label)
    }
}

/* ---------- A: Nå-kort ---------- */

struct KalNowCard: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let now: Date

    var body: some View {
        let today: String = KalD.key(now)
        let tests: [KalEvent] = KalSchool.tests(s.all, today: today)
        let st: KalNowState = KalSchool.nowState(s.byDay, today: today, nowMin: KalD.minutes(now), tests: tests)
        let c: KalCal? = s.cal(st.cal)
        Button(action: { if let id = st.eventId { s.openFromOverview(id) } }) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(st.kicker).font(KalFont.mono(10.5)).tracking(1.2).foregroundStyle(t.bg).opacity(0.8).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(st.when).font(KalFont.mono(11)).foregroundStyle(t.bg).opacity(0.75).lineLimit(1)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(st.title).font(KalFont.serif(28)).foregroundStyle(t.bg).lineLimit(2)
                    if !st.sub.isEmpty {
                        Text(st.sub).font(KalFont.ui(13.5)).foregroundStyle(t.bg).opacity(0.85).lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 16)
                .overlay(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3).fill(st.eventId == nil ? t.mut : t.calColor(c)).frame(width: 6)
                }
                if let pr = st.progress { bar(pr) }
                if !st.next.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Rectangle().fill(t.bg.opacity(0.16)).frame(height: 1)
                        Text(st.next).font(KalFont.ui(13)).foregroundStyle(t.bg).opacity(0.85).lineLimit(2)
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(t.ink))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(st.kicker + ", " + st.title + (st.sub.isEmpty ? "" : ", " + st.sub))
    }

    private func bar(_ v: Double) -> some View {
        GeometryReader { (g: GeometryProxy) in
            ZStack(alignment: .leading) {
                Capsule().fill(t.bg.opacity(0.18))
                Capsule().fill(t.red).frame(width: g.size.width * CGFloat(v))
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

/* ---------- B: Prøver og frister ---------- */

struct KalTestsCard: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    var body: some View {
        let today: String = KalD.todayKey()
        let list: [KalEvent] = KalSchool.tests(s.all, today: today)
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                KalLabel(text: "PRØVER OG FRISTER", color: t.acc)
                Spacer()
                Text(String(list.count)).font(KalFont.mono(10.5)).foregroundStyle(t.mut)
            }
            .padding(.horizontal, 4).padding(.top, 4)
            VStack(spacing: 0) {
                if list.isEmpty {
                    Text(s.updated == nil ? "Henter …" : "Ingen kommende prøver eller frister.").font(KalFont.ui(14)).foregroundStyle(t.mut)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 16)
                }
                ForEach(Array(list.prefix(8).enumerated()), id: \.element.id) { pair in
                    if pair.offset > 0 { Rectangle().fill(t.line2).frame(height: 1) }
                    KalTestRow(e: pair.element, today: today)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(t.card))
        }
    }
}

struct KalTestRow: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let e: KalEvent
    let today: String

    var body: some View {
        // Nedtellingen kommer fra serveren (daysLeft); uten den vises ingen nedtelling.
        let n: Int? = KalSchool.daysLeft(e)
        let red: Bool = n.map { (x: Int) -> Bool in KalSchool.urgent(x) } ?? false
        let when: String = n.map { (x: Int) -> String in KalSchool.inText(x) } ?? ""
        let d: Date = KalD.date(e.day)
        Button(action: { s.openFromOverview(e.id) }) {
            HStack(spacing: 12) {
                VStack(spacing: 3) {
                    Text(String(KalD.dayOfMonth(d))).font(KalFont.serif(24)).foregroundStyle(t.ink)
                    Text(KalD.monthsShort[KalD.month(d) - 1].uppercased()).font(KalFont.mono(9.5)).tracking(0.8).foregroundStyle(t.mut)
                }
                .frame(width: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.title).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink).lineLimit(1)
                    Text(KalSchool.testLine(e)).font(KalFont.ui(12.5)).foregroundStyle(t.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                if !when.isEmpty {
                    Text(when).font(KalFont.ui(11.5, .bold)).foregroundStyle(red ? Color.white : t.ink).lineLimit(1)
                        .padding(.horizontal, 9).padding(.vertical, 4)
                        .background(Capsule().fill(red ? t.red : t.chip))
                }
            }
            .padding(.vertical, 8)
            .frame(minHeight: 58)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(e.title + ", " + KalSchool.testLine(e) + (when.isEmpty ? "" : ", " + when))
    }
}

/* ---------- C: Kalendere ---------- */

struct KalCalsCard: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    var body: some View {
        Button(action: {
            KalHaptic.tap()
            s.cals39Open = true
        }) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Kalendere").font(KalFont.ui(15, .bold)).foregroundStyle(t.ink)
                    Text("Skolens iCal · Google Kalender · Bursdager").font(KalFont.ui(12.5)).foregroundStyle(t.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text("Innstillinger ›").font(KalFont.ui(13, .semibold)).foregroundStyle(t.mut)
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(t.card))
        }
        .buttonStyle(.plain)
    }
}

/* ---------- D: Kalender (Uke · Måned · Liste) ---------- */

struct KalViewsCard: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    private let views: [(String, String)] = [("uke", "Uke"), ("mnd", "Måned"), ("liste", "Liste"), ("dag", "Dag")]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            KalLabel(text: "KALENDER")
            Text("Timeplanen hentes fra skolens iCal-lenke og oppdateres hver time. Trykk på en time for rom, lærer og påminnelse.")
                .font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            KalFlow(spacing: 6) {
                ForEach(views, id: \.0) { (v: (String, String)) in
                    KalChip(title: v.1, on: s.view == v.0) { s.viewFromOverview(v.0) }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(t.card))
    }
}

/* ---------- E: Widgets ---------- */

struct KalWidgetsCard: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            KalLabel(text: "WIDGETS")
            Text(KalEmbed84.on
                 ? "Kalender-widgeten legges til fra Hjem-skjermen: hold inne, trykk + og velg Homelab. Den viser neste time og prøvene."
                 : "Kalender-widgetene legges til fra Hjem-skjermen: hold inne, trykk + og velg Kalender.")
                .font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            // Q26: i Homelab vises forhåndsvisningene av widgetene (som på den gamle kalendersiden).
            if let preview = KalEmbed84.shared.widgetPreview {
                preview()
            }
            if !KalEmbed84.on {
                Button(action: {
                    KalHaptic.tap()
                    s.overviewOpen = false
                    s.settingsOpen = true
                }) {
                    Text("Widget-innstillinger ›").font(KalFont.ui(13, .semibold)).foregroundStyle(t.ink).frame(minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(t.card))
    }
}
