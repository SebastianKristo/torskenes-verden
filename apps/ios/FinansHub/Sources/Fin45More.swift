import SwiftUI
import UIKit

/* ---------------- Prompt 45: Finans → Mer i samme design som Mer-menyen (claude-code-finans-mer-samme-design.md) ----------------
 Fasit: Mer Ny.dc.html med mode="finans" (Mobil Papir App.dc.html → siden fmer).
 – «Søk i moduler», seksjonstittel FINANS, fire store kort (2 × 2, iPad 4 i rad): Saldo (disponibelt, kontoer) · Budsjett (% brukt,
   dager igjen) · Kvitteringer (til gjennomgang) · Faste trekk (neste trekk). Verktøy-liste: Aksjer, Finn, Boliger, Abonnement,
   Transaksjoner, Kontoer, Import, Rapporter (+ Søk og Hjem når de ikke står i fanelinja). Innstillinger-rad nederst.
 – Samme wiggle: hold inne → Store · Lave, − skjuler, «Vis N skjulte», Ferdig. Lave = alt i listen.
 – Skjulte lagres separat fra hoved-Mer (FinHidden30: papir_fm_hidden lokalt + finance_more_hidden per bruker), rekkefølgen som før
   (FinTileOrder20). Tall fra ekte data. Det gamle rutenettet med fliser (PaperFinMoreGrid) brukes ikke lenger. */

@MainActor
@Observable
final class Fin45More {
    static let shared = Fin45More()
    static let bigKeys: [String] = ["saldo", "budsjett", "kvitt", "faste"]

    var query: String = ""
    var size: String = UserDefaults.standard.string(forKey: AcctScope.key("papir_fmer_tsz")) ?? "stor"
    var low: Bool { size == "lav" }

    func setSize(_ v: String) {
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.2)) { size = v }
        UserDefaults.standard.set(v, forKey: AcctScope.key("papir_fmer_tsz"))
    }

    func take(_ o: [String: Any]) {
        if let v = o["papir_fmer_tsz"] as? String, v == "stor" || v == "lav" { size = v }
    }

    func hit(_ r: More28Row) -> Bool {
        let q: String = query.trimmingCharacters(in: .whitespaces)
        if q.isEmpty { return true }
        return (r.name + " " + r.sub).range(of: q, options: [.caseInsensitive, .diacriticInsensitive]) != nil
    }
}

enum Fin45 {
    static func kr(_ v: Double) -> String { "\(neg0(v)) kr" }

    /// Alle radene (store kort først), med ekte undertekster.
    @MainActor static func rows(_ store: Store) -> [More28Row] {
        var out: [More28Row] = []
        let s: Summary? = store.summary
        let accounts: [Account] = store.boot?.accounts ?? []
        let total: Double = accounts.reduce(0) { $0 + $1.balance }
        let review: Int = store.reviewCount ?? s?.review.count ?? store.boot?.reviewCount ?? 0
        out.append(More28Row(id: "saldo", name: "Saldo", sub: store.boot == nil ? "Kontoer" : kr(total) + " · \(accounts.count) kontoer", icon: "creditcard") { store.paperFinGo("kontoer") })
        out.append(More28Row(id: "budsjett", name: "Budsjett", sub: budgetSub(s), icon: "chart.pie") { store.paperFinGo("budsjett") })
        out.append(More28Row(id: "kvitt", name: "Kvitteringer", sub: review > 0 ? "\(review) til gjennomgang" : "Ingen i kø", icon: "doc.text.viewfinder") { store.paperFinGo("kvitt") })
        out.append(More28Row(id: "faste", name: "Faste trekk", sub: fixedSub(store), icon: "repeat") { store.paperOpen(.fast) })
        out.append(More28Row(id: "aksjer", name: "Aksjer", sub: store.stocksX?.valueText ?? "Trading 212", icon: "chart.line.uptrend.xyaxis") { store.paperFinGo("aksjer") })
        if !store.finNav.contains("finn") {
            out.append(More28Row(id: "finn", name: "Finn", sub: "Kjøp og salg", icon: "arrow.left.arrow.right") { store.paperGo("finn") })
        }
        out.append(More28Row(id: "boliger", name: "Boliger", sub: "Utgifter og regninger", icon: "house") { store.paperFinGo("boliger") })
        out.append(More28Row(id: "abo", name: "Abonnement", sub: store.subsX.map { kr($0.monthly) + "/mnd" } ?? "Subscription OS", icon: "arrow.triangle.2.circlepath") { store.paperGo("abo") })
        if !store.finNav.contains("liste") {
            out.append(More28Row(id: "fliste", name: "Transaksjoner", sub: "Alle transaksjoner", icon: "list.bullet") { store.paperGo("fliste") })
        }
        out.append(More28Row(id: "kontoer", name: "Kontoer", sub: store.boot == nil ? "Banker og kort" : "\(accounts.count) kontoer", icon: "building.columns") { store.paperFinGo("kontoer") })
        out.append(More28Row(id: "import", name: "Import", sub: "Bank, Excel og Finn", icon: "square.and.arrow.down") { store.paperOpen(.imports) })
        out.append(More28Row(id: "rapp", name: "Rapporter", sub: "Måned og år", icon: "chart.bar") { store.paperOpen(.reports) })
        // Prompt 51 (IOSFEAT51): Planlegging – sparemål, faste trekk fremover, skatt, priser og abonnementsjeger (Plan51*.swift).
        out.append(More28Row(id: "plan51", name: "Planlegging", sub: "Sparemål, saldoprognose, skatt og priser", icon: "calendar.badge.clock") { Plan51.shared.show() })
        if !store.finNav.contains("sok") {
            out.append(More28Row(id: "fsok", name: "Søk", sub: "Transaksjoner og kvitteringer · ✦ AI", icon: "magnifyingglass") { store.paperGo("fsok") })
        }
        if !store.mainTabItems.contains(where: { $0.id == "hjem" }) {
            out.append(More28Row(id: "hjem", name: "Hjem", sub: "Pakker, avganger og widgets", icon: "house.fill") { store.paperGo("hjem") })
        }
        out.append(More28Row(id: "innst", name: "Innstillinger", sub: "Fanelinje, kontoer og tema", icon: "gearshape") { store.paperGo("innst") })
        return out
    }

    static func budgetSub(_ s: Summary?) -> String {
        guard let s, s.budgetTotal > 0 else { return "Ingen budsjett" }
        let pct: Int = Int((s.budgetUsed / s.budgetTotal * 100).rounded())
        return "\(pct) % brukt · \(s.daysLeft) dager igjen"
    }

    @MainActor static func fixedSub(_ store: Store) -> String {
        guard let list = store.recurring else { return "Neste 30 dager" }
        let active: [Recurring] = list.filter(\.isActive)
        if active.isEmpty { return "Ingen faste trekk" }
        let next: Recurring? = active.filter { ($0.next ?? "") >= JS.fmt(Date(), "yyyy-MM-dd") }.min { ($0.next ?? "") < ($1.next ?? "") }
        if let n = next, let d = n.next {
            let day: String = d.count >= 10 ? String(d.dropFirst(8).prefix(2)) + "." + String(d.dropFirst(5).prefix(2)) : d
            return "Neste: " + n.name + " · " + day
        }
        return "\(active.count) aktive"
    }

    /// Levende innhold i de store kortene.
    @MainActor static func live(_ k: String, _ store: Store) -> More44Live {
        let s: Summary? = store.summary
        switch k {
        case "saldo":
            let a: [Account] = store.boot?.accounts ?? []
            let total: Double = a.reduce(0) { $0 + $1.balance }
            return More44Live(key: k, kicker: "Disponibelt", value: store.boot == nil ? "–" : kr(total), sub: "\(a.count) kontoer", line: kr(total))
        case "budsjett":
            guard let s, s.budgetTotal > 0 else { return More44Live(key: k, value: "Ingen budsjett", line: "Ingen budsjett") }
            let pct: Int = Int((s.budgetUsed / s.budgetTotal * 100).rounded())
            return More44Live(key: k, kicker: "Brukt", value: "\(pct) %", sub: "\(s.daysLeft) dager igjen", big: true, line: budgetSub(s))
        case "kvitt":
            let n: Int = store.reviewCount ?? s?.review.count ?? store.boot?.reviewCount ?? 0
            return More44Live(key: k, kicker: "", value: "\(n)", sub: "til gjennomgang", big: true, line: "\(n) til gjennomgang")
        default:
            let t: String = fixedSub(store)
            return More44Live(key: k, kicker: "", value: t.replacingOccurrences(of: "Neste: ", with: ""), sub: t.hasPrefix("Neste") ? "Neste trekk" : "", line: t)
        }
    }

    @MainActor static func load(_ store: Store) async {
        await store.loadPaperFinance()
        if store.subsX == nil { try? await store.loadSubs() }
        if store.stocksX == nil { await store.loadStocksQuiet() }
        if store.reviewCount == nil { await store.loadPaperFinance15() }
        if store.recurring == nil, let d = try? await store.api.call("GET", "/recurring"), let list: [Recurring] = try? store.decodeList(d) {
            store.recurring = list
        }
    }
}

/// Finans → Mer (Papir), prompt 45.
struct PaperFinMore45: View {
    @Environment(Store.self) private var store
    @MainActor private var n: Fin45More { Fin45More.shared }
    @State private var order: [String] = FinTileOrder20.load()

    private var editing: Bool { store.paperEditPage == "fmer" }

    var body: some View {
        let all: [More28Row] = sorted(Fin45.rows(store))
        let vis: [More28Row] = all.filter { $0.id != FinHidden30.locked && !FinHidden30.shared.isHidden($0.id) && n.hit($0) }
        let hidden: [More28Row] = all.filter { FinHidden30.shared.isHidden($0.id) }
        VStack(alignment: .leading, spacing: 10) {
            Fin45Search()
            Fin45Body(visible: vis, editing: editing, enter: start, hide: hide, commit: commit)
            if let s = all.first(where: { $0.id == FinHidden30.locked }), n.hit(s) { Fin45SettingsRow(row: s, editing: editing) }
            if editing && !hidden.isEmpty { Fin45ShowHidden(count: hidden.count) { showAll(hidden) } }
            if !editing && vis.isEmpty && !n.query.isEmpty { Fin45Empty(query: n.query) }
        }
        .onAppear { order = FinTileOrder20.load() }
        .onDisappear { if editing { store.paperEditPage = nil } }
        .task { await Fin45.load(store) }
    }

    private func sorted(_ list: [More28Row]) -> [More28Row] {
        var out: [More28Row] = []
        for id in order { if let r = list.first(where: { $0.id == id }), !out.contains(where: { $0.id == id }) { out.append(r) } }
        for r in list where !out.contains(where: { $0.id == r.id }) { out.append(r) }
        return out
    }

    private func start() {
        guard !editing else { return }
        FinHidden30.shared.showHidden = false
        store.enterPaperEdit("fmer")
    }

    private func hide(_ k: String) {
        if k == FinHidden30.locked { return }
        FinHidden30.shared.hide(k, store)
    }

    private func commit(_ visible: [String]) {
        let full: [String] = sorted(Fin45.rows(store)).map(\.id)
        let next: [String] = Wiggle43.merge(full, visible: visible)
        guard next != order else { return }
        Haptics.shared.tick()
        order = next
        FinTileOrder20.save(next, store)
    }

    private func showAll(_ list: [More28Row]) {
        Haptics.shared.tick()
        for r in list { FinHidden30.shared.show(r.id, store) }
    }
}

struct Fin45Body: View {
    @Environment(\.paperWide) private var wide
    @MainActor private var n: Fin45More { Fin45More.shared }
    let visible: [More28Row]
    let editing: Bool
    let enter: () -> Void
    let hide: (String) -> Void
    let commit: ([String]) -> Void

    var body: some View {
        let big: [More28Row] = visible.filter { Fin45More.bigKeys.contains($0.id) }
        let tools: [More28Row] = n.low ? visible : visible.filter { !Fin45More.bigKeys.contains($0.id) }
        VStack(alignment: .leading, spacing: 10) {
            if !n.low || editing { Fin45Header(title: n.low ? "" : "FINANS", editing: editing) }
            if !n.low && !big.isEmpty { Fin45Tiles(rows: big, columns: wide ? 4 : 2, editing: editing, enter: enter, hide: hide, commit: commit) }
            if !n.low && !tools.isEmpty { More44Label(text: "VERKTØY").padding(.top, 8) }
            if !tools.isEmpty { Fin45Tools(rows: tools, columns: wide ? 2 : 1, editing: editing, enter: enter, hide: hide, commit: commit) }
        }
    }
}

struct Fin45Header: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var n: Fin45More { Fin45More.shared }
    let title: String
    let editing: Bool

    var body: some View {
        HStack(spacing: 8) {
            if !title.isEmpty { More44Label(text: title) }
            Spacer(minLength: 6)
            if editing {
                sizePicker
                Button { store.exitPaperEdit() } label: {
                    Text("Ferdig").font(PF.ui(12.5, .bold)).foregroundStyle(p.bg)
                        .padding(.horizontal, 12).frame(height: 30)
                        .background(p.ink, in: Capsule())
                        .frame(minHeight: 44).contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(minHeight: 30)
    }

    private var sizePicker: some View {
        HStack(spacing: 0) {
            seg("stor", "Store")
            seg("lav", "Lave")
        }
        .padding(3)
        .background(More44.chipBg(p), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func seg(_ k: String, _ label: String) -> some View {
        let on: Bool = n.size == k
        return Button { n.setSize(k) } label: {
            Text(label).font(PF.ui(12, .bold)).foregroundStyle(p.ink)
                .padding(.horizontal, 10).frame(height: 28)
                .background(on ? p.card : Color.clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

struct Fin45Search: View {
    @Environment(\.paper) private var p
    @MainActor private var n: Fin45More { Fin45More.shared }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.mut)
            TextField("Søk i moduler", text: Binding<String>(get: { n.query }, set: { n.query = $0 }))
                .font(PF.ui(15, .medium)).foregroundStyle(p.ink)
                .submitLabel(.search)
                .autocorrectionDisabled()
            if !n.query.isEmpty {
                Button { n.query = "" } label: {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 16)).foregroundStyle(p.mut)
                        .frame(width: 32, height: 32).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Tøm søket")
            }
        }
        .padding(.horizontal, 16).frame(height: 46)
        .background(p.card, in: Capsule())
        .shadow(color: Color.black.opacity(0.16), radius: 13, y: 10)
        .padding(.bottom, 6)
    }
}

struct Fin45Tiles: View {
    @Environment(Store.self) private var store
    let rows: [More28Row]
    let columns: Int
    let editing: Bool
    let enter: () -> Void
    let hide: (String) -> Void
    let commit: ([String]) -> Void

    var body: some View {
        WiggleReorderList(
            keys: rows.map(\.id),
            editing: editing,
            columns: columns,
            spacing: 10,
            label: { (k: String) in rows.first { $0.id == k }?.name ?? k },
            hide: { (k: String) in hide(k) },
            enter: { enter() },
            commit: { (o: [String]) in commit(o) },
            content: { (k: String) in tile(k) },
            accessory: { (_: String) in EmptyView() }
        )
    }

    @ViewBuilder private func tile(_ k: String) -> some View {
        if let r = rows.first(where: { $0.id == k }) {
            Fin45Tile(row: r, live: Fin45.live(k, store), editing: editing)
        }
    }
}

struct Fin45Tile: View {
    @Environment(\.paper) private var p
    let row: More28Row
    let live: More44Live
    let editing: Bool

    var body: some View {
        Button { if !editing { row.act() } } label: {
            VStack(alignment: .leading, spacing: 0) {
                More44TileTop(row: row)
                Spacer(minLength: 6)
                More44TileValue(live: live)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 150, maxHeight: 150, alignment: .topLeading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(row.name + ". " + live.line)
    }
}

struct Fin45Tools: View {
    let rows: [More28Row]
    let columns: Int
    let editing: Bool
    let enter: () -> Void
    let hide: (String) -> Void
    let commit: ([String]) -> Void

    var body: some View {
        WiggleReorderList(
            keys: rows.map(\.id),
            editing: editing,
            columns: columns,
            spacing: editing || columns > 1 ? 8 : 0,
            label: { (k: String) in rows.first { $0.id == k }?.name ?? k },
            hide: { (k: String) in hide(k) },
            enter: { enter() },
            commit: { (o: [String]) in commit(o) },
            content: { (k: String) in cell(k) },
            accessory: { (_: String) in EmptyView() }
        )
        .modifier(More44Card(on: single))
    }

    private var single: Bool { !editing && columns == 1 }

    @ViewBuilder private func cell(_ k: String) -> some View {
        if let r = rows.first(where: { $0.id == k }) {
            Fin45ToolRow(row: r, first: r.id == rows.first?.id, card: !single, editing: editing)
        }
    }
}

struct Fin45ToolRow: View {
    @Environment(\.paper) private var p
    let row: More28Row
    let first: Bool
    let card: Bool
    let editing: Bool

    var body: some View {
        Button { if !editing { row.act() } } label: {
            More44ToolRowContent(row: row, sub: row.sub)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .frame(maxWidth: .infinity, minHeight: 62, alignment: .leading)
                .background(card ? p.card : Color.clear, in: RoundedRectangle(cornerRadius: card ? 18 : 0, style: .continuous))
                .overlay(alignment: .top) { if !first && !card { Rectangle().fill(p.line.opacity(0.6)).frame(height: 1) } }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(row.name + ". " + row.sub)
    }
}

struct Fin45SettingsRow: View {
    @Environment(\.paper) private var p
    let row: More28Row
    let editing: Bool

    var body: some View {
        Button { if !editing { row.act() } } label: {
            HStack(spacing: 12) {
                Image(systemName: "gearshape").font(.system(size: 16, weight: .semibold)).foregroundStyle(p.ink)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Innstillinger").font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                    Text(row.sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).frame(maxWidth: .infinity, minHeight: 60)
            .background(More44.chipBg(p), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, 4)
    }
}

struct Fin45ShowHidden: View {
    @Environment(\.paper) private var p
    let count: Int
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text("Vis \(count) skjulte").font(PF.ui(13, .bold)).foregroundStyle(p.lab)
                .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct Fin45Empty: View {
    @Environment(\.paper) private var p
    let query: String

    var body: some View {
        Text("Ingen moduler heter «\(query)».").font(PF.ui(13.5)).foregroundStyle(p.mut)
            .frame(maxWidth: .infinity).padding(.vertical, 14)
    }
}
