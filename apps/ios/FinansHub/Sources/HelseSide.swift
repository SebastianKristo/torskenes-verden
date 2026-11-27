import SwiftUI

/* ---------------- Prompt 57: Helse-siden (bare for brukeren selv) ----------------
 Mer → Helse (modulen «helse» i modullisten) åpner fullskjerm. Data fra GET /api/helse?periode=uke|maned
 (shared/schemas/api/helse.schema.json). Serveren regner ut alt (i natt i Oslo-tid, snitt, trender og tekstene); siden viser feltene.
 Familien ser bare det brukeren deler under Helse og posisjon. */

struct HelseNatt: Decodable, Sendable {
    struct Stadium: Decodable, Sendable { let key: String; let label: String; let min: Int; let text: String }
    let night: String
    let dayText: String
    let bedtime: String?
    let asleepAt: String?
    let wakeAt: String?
    let range: String?
    let asleepText: String
    let inBedText: String?
    let stages: [Stadium]
}

struct HelseOkt: Decodable, Sendable, Identifiable {
    let id: String
    let label: String
    let dayText: String
    let start: String?
    let durationText: String
    let distanceText: String?
    let kcalText: String?
}

struct HelseSerie: Decodable, Sendable { let date: String; let value: Double? }

struct HelseTrend: Decodable, Sendable, Identifiable {
    let key: String
    let label: String
    let serie: [HelseSerie]
    let avgText: String?
    let changeText: String?
    let direction: String?
    var id: String { key }
}

struct HelseSvar: Decodable, Sendable {
    struct IDag: Decodable, Sendable {
        let stepsText: String?
        let distanceText: String?
        let activeKcalText: String?
        let exerciseText: String?
    }
    struct Sovn: Decodable, Sendable {
        let tonight: HelseNatt?
        let last: HelseNatt?
        let avg7Text: String?
        let avg7Nights: Int
    }
    struct Trening: Decodable, Sendable {
        let last: HelseOkt?
        let items: [HelseOkt]
        let totalText: String
    }
    struct Vekt: Decodable, Sendable {
        let kgText: String
        let dayText: String
        let changeText: String?
        let serie: [HelseSerie]
    }
    let periode: String
    let empty: Bool
    let summary: String?
    let today: IDag
    let sleep: Sovn
    let workouts: Trening
    let weight: Vekt?
    let trends: [HelseTrend]
}

@MainActor
@Observable
final class HelseModell {
    static let shared = HelseModell()

    var open: Bool = false
    var periode: String = "uke"
    var data: [String: HelseSvar] = [:]
    var loading: Bool = false
    var error: String? = nil
    /// Serveren har ikke /api/helse ennå (eldre versjon).
    var missing: Bool = false

    var current: HelseSvar? { data[periode] }

    func show() {
        Haptics.shared.tap()
        open = true
    }

    func load(_ store: Store, force: Bool = false) async {
        let p: String = periode
        if data[p] != nil && !force { return }
        loading = true
        defer { loading = false }
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/helse?periode=" + p, timeout: 15)
            data[p] = try JSONDecoder().decode(HelseSvar.self, from: d)
            error = nil
            missing = false
        } catch let e as APIError where e.status == 404 {
            missing = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct HelseHost: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var m: HelseModell { HelseModell.shared }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { m.open }, set: { (v: Bool) in if !v { m.open = false } })) {
                HelseSide()
                    .environment(\.paper, p)
                    .homelabMiljo(store)
                    .edgeSwipeClose30 { m.open = false }
            }
    }
}

extension View {
    func helseHost(_ p: PaperPalette) -> some View { modifier(HelseHost(p: p)) }
}

struct HelseSide: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: HelseModell { HelseModell.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Top50Bar(kicker: "Helse · bare for deg", title: "Helse", back: { m.open = false }) { EmptyView() }
                Picker("Periode", selection: Binding<String>(get: { m.periode }, set: { (v: String) in
                    m.periode = v
                    Task { await m.load(store) }
                })) {
                    Text("Uke").tag("uke")
                    Text("Måned").tag("maned")
                }
                .pickerStyle(.segmented)
            }
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 8)
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    content
                    Text("Bare du ser denne siden. Familien ser bare det du deler under Innstillinger → Husstand → Helse.")
                        .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 16).padding(.bottom, 32)
            }
            .oppfrisk("HelseSide") {
                await HealthSync.shared.syncNow(store.api)
                m.data = [:]
                await m.load(store, force: true)
            }
        }
        .background(p.bg.ignoresSafeArea())
        .task { await m.load(store) }
    }

    @ViewBuilder private var content: some View {
        if m.missing {
            HelseKort(title: "Helse") { Text("Serveren har ikke Helse ennå (oppdater Homelab).").font(PF.ui(14)).foregroundStyle(p.mut) }
        } else if let e = m.error, m.current == nil {
            HelseKort(title: "Helse") { Text("Kunne ikke hente helsedata: \(e)").font(PF.ui(14)).foregroundStyle(p.mut) }
        } else if let d = m.current {
            if d.empty {
                HelseKort(title: "Ingen helsedata ennå") {
                    Text("Slå på Apple Helse under Innstillinger → Husstand → Helse. Søvn, skritt, trening og vekt vises her.")
                        .font(PF.ui(14)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            } else {
                if let s = d.summary { Text(s).font(PF.ui(15)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true) }
                sovn(d.sleep)
                idag(d.today)
                trening(d.workouts)
                vekt(d.weight)
                trender(d)
            }
        } else {
            HelseKort(title: "Helse") { Text("Laster …").font(PF.ui(14)).foregroundStyle(p.mut) }
        }
    }

    private func rad(_ k: String, _ v: String?) -> some View {
        HStack {
            Text(k).font(PF.ui(13.5)).foregroundStyle(p.mut)
            Spacer(minLength: 8)
            Text(v ?? "–").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
        }
        .padding(.vertical, 3)
    }

    private func stor(_ v: String, _ sub: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(v).font(PF.serif(30, medium: true)).foregroundStyle(p.ink)
            Text(sub).font(PF.ui(13)).foregroundStyle(p.mut)
        }
    }

    private func stadieFarge(_ key: String) -> Color {
        switch key {
        case "deep": return DS.category(.blue)
        case "core": return DS.category(.teal)
        case "rem": return DS.category(.purple)
        default: return DS.category(.amber)
        }
    }

    @ViewBuilder private func sovn(_ s: HelseSvar.Sovn) -> some View {
        if let n = s.tonight ?? s.last {
            HelseKort(title: s.tonight != nil ? "Søvn i natt" : "Siste natt") {
                stor(n.asleepText, n.dayText)
                if !n.stages.isEmpty {
                    let total: Int = max(1, n.stages.reduce(0) { $0 + $1.min })
                    GeometryReader { g in
                        HStack(spacing: 2) {
                            ForEach(n.stages, id: \.key) { st in
                                Rectangle().fill(stadieFarge(st.key))
                                    .frame(width: max(2, (g.size.width - 6) * CGFloat(st.min) / CGFloat(total)))
                            }
                        }
                    }
                    .frame(height: 12)
                    .clipShape(Capsule())
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(n.stages.map { "\($0.label) \($0.text)" }.joined(separator: ", "))
                    ForEach(n.stages, id: \.key) { st in
                        HStack(spacing: 6) {
                            RoundedRectangle(cornerRadius: 3).fill(stadieFarge(st.key)).frame(width: 10, height: 10)
                            Text(st.label).font(PF.ui(12.5)).foregroundStyle(p.mut)
                            Spacer(minLength: 4)
                            Text(st.text).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                        }
                    }
                }
                rad("I seng", n.bedtime)
                rad("Sovnet", n.asleepAt)
                rad("Våknet", n.wakeAt)
                rad("Snitt siste \(s.avg7Nights) netter", s.avg7Text)
            }
        } else {
            HelseKort(title: "Søvn") { Text("Ingen søvn registrert ennå.").font(PF.ui(14)).foregroundStyle(p.mut) }
        }
    }

    private func idag(_ t: HelseSvar.IDag) -> some View {
        HelseKort(title: "I dag") {
            stor(t.stepsText ?? "–", "skritt")
            rad("Distanse gått og løpt", t.distanceText)
            rad("Aktiv energi", t.activeKcalText)
            rad("Treningstid", t.exerciseText)
        }
    }

    @ViewBuilder private func trening(_ w: HelseSvar.Trening) -> some View {
        HelseKort(title: "Trening") {
            Text(w.totalText).font(PF.ui(13)).foregroundStyle(p.mut)
            let list: [HelseOkt] = w.items.isEmpty ? (w.last.map { [$0] } ?? []) : Array(w.items.prefix(8))
            if list.isEmpty { Text("Ingen treningsøkter i Apple Helse.").font(PF.ui(14)).foregroundStyle(p.mut) }
            ForEach(list) { o in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(o.label).font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                        Text([o.dayText, o.start.map { "kl. \($0)" }].compactMap { $0 }.joined(separator: " ")).font(PF.ui(12)).foregroundStyle(p.mut)
                    }
                    Spacer(minLength: 8)
                    Text([o.durationText, o.distanceText, o.kcalText].compactMap { $0 }.joined(separator: " · ")).font(PF.ui(12.5)).foregroundStyle(p.mut)
                        .multilineTextAlignment(.trailing)
                }
                .padding(.vertical, 3)
            }
        }
    }

    @ViewBuilder private func vekt(_ v: HelseSvar.Vekt?) -> some View {
        HelseKort(title: "Vekt") {
            if let v {
                stor(v.kgText, "målt \(v.dayText)")
                if let c = v.changeText { Text(c).font(PF.ui(13, .semibold)).foregroundStyle(p.mut) }
                if v.serie.count > 1 { HelseSoyler(serie: v.serie) }
            } else {
                Text("Ingen vekt i Apple Helse.").font(PF.ui(14)).foregroundStyle(p.mut)
            }
        }
    }

    private func trender(_ d: HelseSvar) -> some View {
        HelseKort(title: d.periode == "maned" ? "Trender siste 30 dager" : "Trender siste 7 dager") {
            ForEach(d.trends.filter { $0.avgText != nil }) { t in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(t.label).font(PF.ui(13)).foregroundStyle(p.mut)
                        Text(t.avgText ?? "").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
                        Spacer(minLength: 4)
                        if let c = t.changeText { Text(c).font(PF.ui(12)).foregroundStyle(p.mut) }
                    }
                    HelseSoyler(serie: t.serie)
                }
                .padding(.vertical, 4)
            }
        }
    }
}

/// Søyler for én serie (én farge; tittelen over sier hva det er). Høyden er relativ til største verdi.
struct HelseSoyler: View {
    let serie: [HelseSerie]

    var body: some View {
        let mx: Double = max(1, serie.compactMap { $0.value }.max() ?? 1)
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(Array(serie.enumerated()), id: \.offset) { _, x in
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(x.value == nil ? Color.clear : DS.category(.blue))
                    .frame(height: max(2, CGFloat((x.value ?? 0) / mx) * 36))
                    .frame(maxWidth: .infinity)
            }
        }
        .frame(height: 38, alignment: .bottom)
        .accessibilityHidden(true)
    }
}

/// Kort i Papir-stil med liten overskrift.
struct HelseKort<Content: View>: View {
    @Environment(\.paper) private var p
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased()).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
