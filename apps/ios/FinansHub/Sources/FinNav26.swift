import SwiftUI

/* ---------------- Prompt 26: rediger Finans-fanelinjen (hold inne på fanelinjen i Finans) ----------------
   Samme ark som for Hjem: gi faner nytt navn, velg ikon, flytt, fjern og legg til (maks 5, Mer står alltid sist),
   stil med forhåndsvisning og «Tilbakestill til standard».
   Lagres i /api/me/layout som finNav = [{key, label?, icon?}] (eldre server: liste med nøkler). Mer lagres ikke.
   Egne endringer gjør profilen «Egendefinert» (serveren setter profile = custom). */

/// Eget navn og ikon for én Finans-fane (tomt = standard).
struct FinNavLabel26: Hashable, Codable {
    var label: String
    var icon: String
}

@MainActor
@Observable
final class FinNav26 {
    static let shared = FinNav26()

    var editing: Bool = false
    /// Egne navn og ikoner per fane-id (oversikt, liste …).
    var labels: [String: FinNavLabel26] = FinNav26.loadLocal() {
        didSet { FinNav26.saveLocal(labels) }
    }

    nonisolated static let standard: [String] = ["oversikt", "liste", "finn", "sok"]

    /// Ikonene som kan velges: tegnene fra Finans og noen SF Symbols.
    nonisolated static let icons: [String] = ["◎", "≡", "⇄", "⌕", "◔", "⎙", "↗", "↻", "▤", "⌂", "★", "♡",
                                              "creditcard", "chart.bar", "chart.pie", "bag", "cart", "doc.text", "building.2", "tag"]

    private static var localKey: String { AcctScope.key("fh_fin_lbl26") }

    private static func loadLocal() -> [String: FinNavLabel26] {
        guard let d = UserDefaults.standard.data(forKey: localKey) else { return [:] }
        let v: [String: FinNavLabel26]? = try? JSONDecoder().decode([String: FinNavLabel26].self, from: d)
        return v ?? [:]
    }

    private static func saveLocal(_ v: [String: FinNavLabel26]) {
        if let d = try? JSONEncoder().encode(v) { UserDefaults.standard.set(d, forKey: localKey) }
    }

    func label(_ id: String) -> String? {
        guard let l = labels[id] else { return nil }
        let t: String = l.label.trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? nil : t
    }

    func icon(_ id: String) -> String? {
        guard let l = labels[id] else { return nil }
        return l.icon.isEmpty ? nil : l.icon
    }

    /// finNav fra /api/me/layout: strenger eller {key, label?, icon?}.
    func apply(_ o: [String: Any], _ store: Store) {
        guard let raw = o["finNav"] as? [Any] else { return }
        let valid: [String] = Store.finNavAll.map(\.id)
        var keys: [String] = []
        var lb: [String: FinNavLabel26] = [:]
        var hasObjects: Bool = false
        for x in raw {
            if let s = x as? String {
                if valid.contains(s) && !keys.contains(s) { keys.append(s) }
            } else if let d = x as? [String: Any] {
                hasObjects = true
                let k: String = JS.str(d, "key") ?? JS.str(d, "id") ?? ""
                guard valid.contains(k), !keys.contains(k) else { continue }
                keys.append(k)
                let l: String = JS.str(d, "label") ?? ""
                let i: String = JS.str(d, "icon") ?? ""
                if !l.isEmpty || !i.isEmpty { lb[k] = FinNavLabel26(label: l, icon: i) }
            }
        }
        if keys.isEmpty { return }
        let next: [String] = Array(keys.prefix(5))
        if next != store.finNav { store.finNav = next }
        if hasObjects && lb != labels { labels = lb }
    }

    /// Body til serveren: [{key, label?, icon?}] uten Mer.
    func body(_ keys: [String]) -> [[String: String]] {
        return keys.prefix(5).map { (k: String) -> [String: String] in
            var o: [String: String] = ["key": k]
            if let l = label(k) { o["label"] = l }
            if let i = icon(k) { o["icon"] = i }
            return o
        }
    }

    /// Lagrer fanelinjen. Eldre server (400 for objekter): bare nøklene. Svært gammel server: finTabs (maks 4).
    func push(_ store: Store) {
        let keys: [String] = store.finNav
        let objs: [[String: String]] = body(keys)
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "PUT", "/me/layout", json: ["finNav": objs])
            } catch {
                _ = try? await store.api.callAt("/api", "PUT", "/me/layout", json: ["finNav": keys])
            }
            if keys.count <= 4 {
                _ = try? await store.api.callAt("/api", "PUT", "/me/layout", json: ["finTabs": keys])
            }
        }
    }

    /// Lagrer fra editoren: rekkefølge, navn og ikon.
    func save(_ rows: [FinNavRow26], _ store: Store) {
        var lb: [String: FinNavLabel26] = [:]
        for r in rows {
            let def: FinNavItem? = Store.finNavAll.first { $0.id == r.id }
            let l: String = r.label.trimmingCharacters(in: .whitespaces)
            let customLabel: String = (l == def?.name || l.isEmpty) ? "" : l
            let customIcon: String = r.icon == def?.icon ? "" : r.icon
            if !customLabel.isEmpty || !customIcon.isEmpty { lb[r.id] = FinNavLabel26(label: customLabel, icon: customIcon) }
        }
        labels = lb
        store.finNav = Array(rows.map(\.id).prefix(5))
        push(store)
        Prof24.shared.profile = "custom"
        Haptics.shared.success()
    }

    func reset(_ store: Store) {
        labels = [:]
        store.finNav = FinNav26.standard
        push(store)
        Haptics.shared.select()
    }
}

/// Én rad i editoren.
struct FinNavRow26: Identifiable, Hashable {
    var id: String
    var label: String
    var icon: String
}

struct FinNavEditor26: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var rows: [FinNavRow26] = []
    @State private var iconFor: String? = nil
    @State private var didReset: Bool = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("FINANS · FANELINJE").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                    Text("\(rows.count) av 5 faner · Mer ligger alltid sist").font(PF.ui(13)).foregroundStyle(p.mut)
                    PLabel(text: "I fanelinja")
                    current
                    NavStylePicker25(items: previewItems).padding(.top, 6)
                    if !unused.isEmpty {
                        PLabel(text: "Legg til")
                        addList
                    }
                    PLineButton(title: "Tilbakestill til standard", height: 44, full: true) {
                        rows = FinNav26.standard.compactMap { (k: String) -> FinNavRow26? in FinNavEditor26.row(k, labels: [:]) }
                        didReset = true
                    }
                }
                .padding(16)
            }
            .background(p.bg.ignoresSafeArea())
            .navigationTitle("Rediger fanelinjen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Avbryt") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Ferdig") { done() }.fontWeight(.semibold)
                }
            }
        }
        .onAppear { load() }
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private var unused: [FinNavItem] {
        Store.finNavAll.filter { (a: FinNavItem) -> Bool in !rows.contains { $0.id == a.id } }
    }

    private var previewItems: [PaperTabItem] {
        rows.map { (r: FinNavRow26) -> PaperTabItem in PaperTabItem(id: r.id, label: r.label, icon: r.icon) }
    }

    static func row(_ k: String, labels: [String: FinNavLabel26]) -> FinNavRow26? {
        guard let d = Store.finNavAll.first(where: { $0.id == k }) else { return nil }
        let l: FinNavLabel26? = labels[k]
        let name: String = (l?.label ?? "").isEmpty ? d.name : (l?.label ?? d.name)
        let ic: String = (l?.icon ?? "").isEmpty ? d.icon : (l?.icon ?? d.icon)
        return FinNavRow26(id: k, label: name, icon: ic)
    }

    private func load() {
        let lb: [String: FinNavLabel26] = FinNav26.shared.labels
        rows = store.finNavItems.map(\.id).compactMap { (k: String) -> FinNavRow26? in FinNavEditor26.row(k, labels: lb) }
    }

    private func done() {
        if didReset && rows.map(\.id) == FinNav26.standard && rows.allSatisfy({ (r: FinNavRow26) -> Bool in FinNavEditor26.row(r.id, labels: [:]) == r }) {
            FinNav26.shared.reset(store)
        } else {
            FinNav26.shared.save(rows, store)
        }
        dismiss()
    }

    private var current: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                rowView(i, r)
            }
            Rectangle().fill(p.line).frame(height: 1)
            HStack(spacing: 12) {
                iconBox("⋯", locked: true)
                Text("Mer").font(PF.ui(15, .semibold)).foregroundStyle(p.mut)
                Spacer()
                Text("Alltid sist").font(PF.ui(12)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func rowView(_ i: Int, _ r: FinNavRow26) -> some View {
        let def: String = Store.finNavAll.first(where: { $0.id == r.id })?.name ?? r.id
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Button { iconFor = iconFor == r.id ? nil : r.id } label: { iconBox(r.icon, locked: false) }
                    .buttonStyle(.plain).accessibilityLabel("Bytt ikon")
                TextField(def, text: labelBinding(i))
                    .font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    .submitLabel(.done)
                Button { move(i, -1) } label: { arrow("▲", i > 0) }.buttonStyle(.plain).disabled(i == 0)
                Button { move(i, 1) } label: { arrow("▼", i < rows.count - 1) }.buttonStyle(.plain).disabled(i == rows.count - 1)
                Button { remove(i) } label: { arrow("−", rows.count > 1) }.buttonStyle(.plain).disabled(rows.count <= 1)
            }
            if iconFor == r.id { iconGrid(i) }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private func iconGrid(_ i: Int) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7), spacing: 6) {
            ForEach(FinNav26.icons, id: \.self) { (name: String) in
                iconChoice(i, name)
            }
        }
    }

    private func iconChoice(_ i: Int, _ name: String) -> some View {
        let on: Bool = rows.indices.contains(i) && rows[i].icon == name
        return Button {
            if rows.indices.contains(i) { rows[i].icon = name }
            iconFor = nil
            Haptics.shared.select()
        } label: {
            NavIcon25(icon: name, size: 16)
                .foregroundStyle(on ? p.onLab : p.ink)
                .frame(width: 38, height: 38)
                .background(on ? p.lab : p.popSel, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var addList: some View {
        VStack(spacing: 0) {
            ForEach(Array(unused.enumerated()), id: \.element.id) { i, it in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                addRow(it)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func addRow(_ it: FinNavItem) -> some View {
        Button { add(it) } label: {
            HStack(spacing: 12) {
                iconBox(it.icon, locked: false)
                Text(it.name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Spacer()
                Text(rows.count >= 5 ? "Fullt" : "+ Legg til").font(PF.ui(13, .semibold)).foregroundStyle(rows.count >= 5 ? p.mut : p.lab)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func labelBinding(_ i: Int) -> Binding<String> {
        Binding<String>(get: { rows.indices.contains(i) ? rows[i].label : "" },
                        set: { (v: String) in if rows.indices.contains(i) { rows[i].label = String(v.prefix(14)) } })
    }

    private func iconBox(_ name: String, locked: Bool) -> some View {
        NavIcon25(icon: name, size: 15)
            .foregroundStyle(Color.white)
            .frame(width: 32, height: 32)
            .background(locked ? p.mut : p.ink, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
    }

    private func arrow(_ t: String, _ on: Bool) -> some View {
        Text(t).font(PF.ui(13, .bold)).foregroundStyle(on ? p.ink : p.line)
            .frame(width: 30, height: 30)
            .background(p.popSel.opacity(on ? 1 : 0.4), in: Circle())
    }

    private func move(_ i: Int, _ d: Int) {
        let j: Int = i + d
        guard rows.indices.contains(i), rows.indices.contains(j) else { return }
        withAnimation(.easeOut(duration: 0.2)) { rows.swapAt(i, j) }
        didReset = false
        Haptics.shared.tick()
    }

    private func remove(_ i: Int) {
        guard rows.count > 1, rows.indices.contains(i) else { return }
        _ = withAnimation(.easeOut(duration: 0.2)) { rows.remove(at: i) }
        didReset = false
        Haptics.shared.tick()
    }

    private func add(_ it: FinNavItem) {
        guard rows.count < 5 else { store.flash("Maks 5 faner. Fjern en først."); return }
        let r: FinNavRow26 = FinNavRow26(id: it.id, label: it.name, icon: it.icon)
        withAnimation(.easeOut(duration: 0.2)) { rows.append(r) }
        didReset = false
        Haptics.shared.tick()
    }
}
