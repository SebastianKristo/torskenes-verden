import SwiftUI
import UIKit

/* ---------------- Prompt 32: «Rediger fanelinjen» på alle sider med egen fanelinje + Papir-knapper i arket ---------------- */
// Fasit: design/Mobil Papir App.dc.html → SECN, secNav(), ne (arket), navDown. Spesifikasjon: claude-code-fanelinje-alle-sider.md,
// claude-code-fanelinje-ark-knapper.md og claude-code-felles-knapper-ark.md.
// – Domener (Oversikt · Publikum · Ytelse · Infra), Abonnement (Hjem · Innsikt · Historikk), Familie (Kart · Soner · Helse).
// – Hold inne på fanelinjen (eller Innstillinger → Utseende og fanelinje → FANELINJE · ANDRE SIDER) åpner arket.
// – Lagres per side som papir_nav_dom / papir_nav_abo / papir_nav_kart = [{k, n?, ic?}] og synkes med
//   PUT /api/me/layout {secNav: {dom, abo, kart}} (samme som PWA; eldre server svarer 400 → bare på enheten).
// – Arket: «X · FANELINJE» + «Rediger fanelinjen» (Newsreader 26) til venstre, Ferdig (SheetButton30 primary) til høyre,
//   ingen Avbryt. Endringer lagres når arket lukkes (Ferdig, trykk utenfor eller dra ned).

struct Sec32bId: Identifiable {
    let id: String
}

struct Sec32bDef {
    let title: String
    let all: [PaperTabItem]
}

@MainActor
@Observable
final class Nav32b {
    static let shared = Nav32b()

    /// «dom», «abo» eller «kart» når arket er åpent.
    var editing: String? = nil
    /// Økes når en side lagres (så fanelinja tegnes på nytt).
    var tick: Int = 0

    static let defs: [String: Sec32bDef] = [
        "dom": Sec32bDef(title: "DOMENER", all: [PaperTabItem(id: "dom", label: "Oversikt", icon: "◎"), PaperTabItem(id: "pub", label: "Publikum", icon: "◍"),
                                                  PaperTabItem(id: "ytl", label: "Ytelse", icon: "⚡"), PaperTabItem(id: "inf", label: "Infra", icon: "▤")]),
        "abo": Sec32bDef(title: "ABONNEMENT", all: [PaperTabItem(id: "home", label: "Hjem", icon: "house"), PaperTabItem(id: "ins", label: "Innsikt", icon: "chart.bar"),
                                                     PaperTabItem(id: "hist", label: "Historikk", icon: "clock")]),
        "kart": Sec32bDef(title: "FAMILIE", all: [PaperTabItem(id: "kart", label: "Kart", icon: "◎"), PaperTabItem(id: "soner", label: "Soner", icon: "◌"),
                                                  PaperTabItem(id: "helse", label: "Helse", icon: "♡")]),
    ]

    static let icons: [String] = ["⌂", "kr", "◐", "▣", "◎", "◍", "⚡", "▤", "◔", "↺", "↻", "◌", "♡", "◉", "★", "●", "◆", "♪", "✉", "⚑", "≡", "⇄", "☼", "✦",
                                  "house", "chart.bar", "clock", "globe", "map", "heart", "person.2", "creditcard"]

    /// Domener-fanenes id i appen (paperTab) ↔ nøkkelen i secNav.
    static func domTab(_ k: String) -> String {
        switch k { case "pub": return "dpub"; case "ytl": return "dytl"; case "inf": return "dinf"; default: return "domener" }
    }

    private static func storeKey(_ k: String) -> String { "papir_nav_" + k }

    /// Hvilken egen fanelinje siden har (nil = Hjem/Finans eller ingen).
    static func sec(_ store: Store) -> String? {
        if store.paperInDomains { return "dom" }
        if store.paperTab == "abo" { return "abo" }
        if store.paperTab == "familie" { return "kart" }
        return nil
    }

    /// Lagret liste eller standard (navn og ikon fylt inn).
    func items(_ k: String) -> [PaperTabItem] {
        guard let def = Nav32b.defs[k] else { return [] }
        let raw: [[String: Any]] = Nav32b.load(k)
        var out: [PaperTabItem] = []
        for o in raw {
            let key: String = (o["k"] as? String) ?? ""
            guard let d = def.all.first(where: { $0.id == key }), !out.contains(where: { $0.id == key }) else { continue }
            let n: String = (o["n"] as? String) ?? ""
            let ic: String = (o["ic"] as? String) ?? ""
            out.append(PaperTabItem(id: key, label: n.isEmpty ? d.label : n, icon: ic.isEmpty ? d.icon : ic))
        }
        return out.isEmpty ? def.all : Array(out.prefix(def.all.count))
    }

    static func load(_ k: String) -> [[String: Any]] {
        guard let d = UserDefaults.standard.data(forKey: storeKey(k)),
              let any = try? JSONSerialization.jsonObject(with: d) else { return [] }
        return (any as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
    }

    /// Fra GET /api/me/layout: secNav {dom|abo|kart: [{k,n?,ic?}] | null}.
    func take(_ o: [String: Any]) {
        guard let s = (o["secNav"] ?? o["sec_nav"]) as? [String: Any] else { return }
        var changed: Bool = false
        for k in Nav32b.defs.keys {
            if let l = s[k] as? [Any], let d = try? JSONSerialization.data(withJSONObject: l) {
                if UserDefaults.standard.data(forKey: Nav32b.storeKey(k)) != d {
                    UserDefaults.standard.set(d, forKey: Nav32b.storeKey(k))
                    changed = true
                }
            } else if s[k] is NSNull {
                UserDefaults.standard.removeObject(forKey: Nav32b.storeKey(k))
                changed = true
            }
        }
        if changed { tick += 1 }
    }

    func save(_ k: String, _ rows: [PaperTabItem], _ store: Store) {
        guard let def = Nav32b.defs[k] else { return }
        let isDefault: Bool = rows == def.all
        if isDefault {
            UserDefaults.standard.removeObject(forKey: Nav32b.storeKey(k))
        } else {
            var list: [[String: String]] = []
            for r in rows {
                let d: PaperTabItem? = def.all.first { $0.id == r.id }
                var o: [String: String] = ["k": r.id]
                let n: String = r.label.trimmingCharacters(in: .whitespaces)
                if !n.isEmpty && n != d?.label { o["n"] = n }
                if r.icon != d?.icon { o["ic"] = r.icon }
                list.append(o)
            }
            if let data = try? JSONSerialization.data(withJSONObject: list) { UserDefaults.standard.set(data, forKey: Nav32b.storeKey(k)) }
        }
        tick += 1
        push(store)
    }

    func reset(_ k: String, _ store: Store) {
        UserDefaults.standard.removeObject(forKey: Nav32b.storeKey(k))
        tick += 1
        push(store)
    }

    private func push(_ store: Store) {
        var all: [String: Any] = [:]
        for k in Nav32b.defs.keys {
            let l: [[String: Any]] = Nav32b.load(k)
            all[k] = l.isEmpty ? NSNull() : l
        }
        let body: [String: Any] = ["secNav": all]
        Task { @MainActor in _ = try? await store.api.callAt("/api", "PUT", "/me/layout", json: body) }
    }

    /// Fanene i PaperTabBar for siden (id i appen, navn, ikon).
    func tabs(_ k: String) -> [(String, String, String)] {
        let _ = tick
        return items(k).map { (it: PaperTabItem) -> (String, String, String) in
            switch k {
            case "dom": return (Nav32b.domTab(it.id), it.label, it.icon)
            case "abo": return ("abo:" + it.id, it.label, it.icon)
            default: return ("fam:" + it.id, it.label, it.icon)
            }
        }
    }
}

/* ---------- Felles redigeringsark (Hjem, Finans, Domener, Abonnement, Familie) ---------- */

struct TabEditor32b: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    let kicker: String
    let max: Int
    /// Hjem og Finans: «Mer ligger alltid sist» og ⋯ i forhåndsvisningen.
    let hasMore: Bool
    let all: [PaperTabItem]
    let defaults: [PaperTabItem]
    let icons: [String]
    let initial: [PaperTabItem]
    let save: ([PaperTabItem]) -> Void
    let reset: () -> Void
    @State private var rows: [PaperTabItem] = []
    @State private var iconFor: String? = nil
    @State private var loaded: Bool = false
    @State private var didReset: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                TabEditorHead32b(kicker: kicker) { dismiss() }
                Text(countText).font(PF.ui(12.5)).foregroundStyle(p.mut)
                TabEditorRows32b(rows: $rows, iconFor: $iconFor, all: all, icons: icons, max: max)
                NavStylePicker25(items: rows, showMore: hasMore).padding(.top, 6)
                TabEditorAdds32b(rows: $rows, all: all, max: max)
                PLineButton(title: "Tilbakestill til standard", height: 44, full: true) {
                    rows = defaults
                    didReset = true
                    Haptics.shared.select()
                }
            }
            .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onAppear {
            if !loaded { rows = initial; loaded = true }
        }
        .onChange(of: rows) { (_: [PaperTabItem], _: [PaperTabItem]) in
            if rows != defaults { didReset = false }
        }
        // Endringer lagres når arket lukkes, uansett hvordan (Ferdig, trykk utenfor, dra ned).
        .onDisappear {
            if !loaded || rows.isEmpty { return }
            if rows == initial && !didReset { return }
            if didReset && rows == defaults { reset() } else { save(rows) }
        }
    }

    private var countText: String {
        let base: String = "\(rows.count) av \(max) faner"
        return hasMore ? base + " · Mer ligger alltid sist" : base
    }
}

/// Hentelinje, etikett og tittel til venstre, Ferdig-pillen til høyre (ingen Avbryt, ikke iOS-systemknapper).
struct TabEditorHead32b: View {
    @Environment(\.paper) private var p
    let kicker: String
    let done: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Capsule().fill(p.line).frame(width: 40, height: 5).frame(maxWidth: .infinity)
            HStack(alignment: .bottom, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(kicker).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                    Text("Rediger fanelinjen").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                }
                Spacer(minLength: 8)
                SheetButton30(kind: .primary, title: "Ferdig", action: done)
            }
        }
    }
}

struct TabEditorRows32b: View {
    @Environment(\.paper) private var p
    @Binding var rows: [PaperTabItem]
    @Binding var iconFor: String?
    let all: [PaperTabItem]
    let icons: [String]
    let max: Int

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                row(i, r)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func row(_ i: Int, _ r: PaperTabItem) -> some View {
        let def: String = all.first(where: { $0.id == r.id })?.label ?? r.id
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Button { iconFor = iconFor == r.id ? nil : r.id } label: {
                    NavIcon25(icon: r.icon, size: 16).foregroundStyle(p.ink)
                        .frame(width: 40, height: 40)
                        .background(p.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Velg ikon for " + r.label)
                TextField(def, text: label(i))
                    .font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    .submitLabel(.done)
                    .padding(.horizontal, 12).frame(height: 40)
                    .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                Button { move(i) } label: {
                    Text("↑").font(PF.ui(16, .bold)).foregroundStyle(i > 0 ? p.ink : p.line)
                        .frame(width: 40, height: 40)
                        .overlay(Circle().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(i == 0)
                .accessibilityLabel("Flytt " + r.label + " til venstre")
                Button { remove(i) } label: {
                    Text("−").font(PF.ui(20, .bold)).foregroundStyle(rows.count > 1 ? p.lab : p.line)
                        .frame(width: 32, height: 40)
                }
                .buttonStyle(.plain)
                .disabled(rows.count <= 1)
                .accessibilityLabel("Fjern " + r.label)
            }
            if iconFor == r.id { grid(i) }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
    }

    private func grid(_ i: Int) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7), spacing: 6) {
            ForEach(icons, id: \.self) { (name: String) in
                let on: Bool = rows.indices.contains(i) && rows[i].icon == name
                Button {
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
        }
    }

    private func label(_ i: Int) -> Binding<String> {
        Binding<String>(get: { rows.indices.contains(i) ? rows[i].label : "" },
                        set: { (v: String) in if rows.indices.contains(i) { rows[i].label = String(v.prefix(14)) } })
    }

    private func move(_ i: Int) {
        guard i > 0, rows.indices.contains(i) else { return }
        withAnimation(.easeOut(duration: 0.2)) { rows.swapAt(i, i - 1) }
        Haptics.shared.tick()
    }

    private func remove(_ i: Int) {
        guard rows.count > 1, rows.indices.contains(i) else { return }
        _ = withAnimation(.easeOut(duration: 0.2)) { rows.remove(at: i) }
        Haptics.shared.tick()
    }
}

/// LEGG TIL: chips «+ Domener», «+ Media» … for fanene som ikke er i linja.
struct TabEditorAdds32b: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Binding var rows: [PaperTabItem]
    let all: [PaperTabItem]
    let max: Int

    var body: some View {
        let unused: [PaperTabItem] = all.filter { (a: PaperTabItem) -> Bool in !rows.contains { $0.id == a.id } }
        if !unused.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                PLabel(text: "Legg til", color: p.mut)
                Flow(spacing: 6) {
                    ForEach(unused) { (it: PaperTabItem) in
                        Button { add(it) } label: {
                            HStack(spacing: 6) {
                                NavIcon25(icon: it.icon, size: 13).foregroundStyle(p.ink)
                                Text("+ " + it.label).font(PF.ui(13, .semibold)).foregroundStyle(rows.count >= max ? p.mut : p.ink)
                            }
                            .padding(.horizontal, 12).frame(height: 36)
                            .background(p.card, in: Capsule())
                            .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.top, 4)
        }
    }

    private func add(_ it: PaperTabItem) {
        guard rows.count < max else { store.flash("Maks \(max) faner. Fjern en først."); return }
        withAnimation(.easeOut(duration: 0.2)) { rows.append(it) }
        Haptics.shared.tick()
    }
}

/* ---------- Arkene for hver fanelinje ---------- */

/// Domener, Abonnement og Familie.
struct SecTabEditor32b: View {
    @Environment(Store.self) private var store
    let k: String

    var body: some View {
        let def: Sec32bDef = Nav32b.defs[k] ?? Sec32bDef(title: "", all: [])
        TabEditor32b(kicker: def.title + " · FANELINJE", max: def.all.count, hasMore: false, all: def.all, defaults: def.all,
                     icons: Nav32b.icons, initial: Nav32b.shared.items(k),
                     save: { (rows: [PaperTabItem]) in Nav32b.shared.save(k, rows, store) },
                     reset: { Nav32b.shared.reset(k, store) })
    }
}

/// Hjem (hovedlinja): opptil 5 faner + Mer.
struct HomeTabEditor32b: View {
    @Environment(Store.self) private var store

    var body: some View {
        TabEditor32b(kicker: "HJEM · FANELINJE", max: 5, hasMore: true, all: PaperTabItem.all, defaults: PaperTabItem.defaults,
                     icons: PaperTabItem.icons, initial: store.mainTabItems,
                     save: { (rows: [PaperTabItem]) in store.setTabBar(rows) },
                     reset: { store.resetTabBar() })
    }
}

/// Finans: opptil 5 faner + Mer, egne navn og ikoner (FinNav26).
struct FinTabEditor32b: View {
    @Environment(Store.self) private var store

    private var all: [PaperTabItem] {
        Store.finNavAll.map { (f: FinNavItem) -> PaperTabItem in PaperTabItem(id: f.id, label: f.name, icon: f.icon) }
    }

    private var defaults: [PaperTabItem] {
        FinNav26.standard.compactMap { (k: String) -> PaperTabItem? in
            guard let f = Store.finNavAll.first(where: { $0.id == k }) else { return nil }
            return PaperTabItem(id: f.id, label: f.name, icon: f.icon)
        }
    }

    private var initial: [PaperTabItem] {
        let lb: [String: FinNavLabel26] = FinNav26.shared.labels
        return store.finNavItems.map(\.id).compactMap { (k: String) -> PaperTabItem? in
            guard let r = FinNavEditor26.row(k, labels: lb) else { return nil }
            return PaperTabItem(id: r.id, label: r.label, icon: r.icon)
        }
    }

    var body: some View {
        TabEditor32b(kicker: "FINANS · FANELINJE", max: 5, hasMore: true, all: all, defaults: defaults,
                     icons: FinNav26.icons, initial: initial,
                     save: { (rows: [PaperTabItem]) in
                         FinNav26.shared.save(rows.map { (r: PaperTabItem) -> FinNavRow26 in FinNavRow26(id: r.id, label: r.label, icon: r.icon) }, store)
                     },
                     reset: { FinNav26.shared.reset(store) })
    }
}

/* ---------- Innstillinger → Utseende og fanelinje ---------- */

struct Nav32bSettingsGroup: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var n: Nav32b { Nav32b.shared }

    var body: some View {
        let _ = n.tick
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Fanelinje").padding(.leading, 4).padding(.top, 14)
            PaperLinkList(rows: [
                PaperLinkRow(name: "Hjem", sub: store.mainTabItems.map(\.label).joined(separator: " · "), value: "Rediger ›", valueColor: p.lab, icon: "dock.rectangle") { store.tabBarEditing = true },
                PaperLinkRow(name: "Finans", sub: store.finNavItems.map(\.name).joined(separator: " · "), value: "Rediger ›", valueColor: p.lab, icon: "creditcard") { FinNav26.shared.editing = true },
            ])
            PLabel(text: "Fanelinje · andre sider").padding(.leading, 4).padding(.top, 14)
            PaperLinkList(rows: [
                PaperLinkRow(name: "Domener", sub: names("dom"), value: "Rediger ›", valueColor: p.lab, icon: "globe") { n.editing = "dom" },
                PaperLinkRow(name: "Abonnement", sub: names("abo"), value: "Rediger ›", valueColor: p.lab, icon: "repeat") { n.editing = "abo" },
                PaperLinkRow(name: "Familie", sub: names("kart"), value: "Rediger ›", valueColor: p.lab, icon: "person.2") { n.editing = "kart" },
            ])
            Text("Hold inne på fanelinjen på siden for å åpne det samme arket. Stilen (tekst eller ikoner) er felles for hele appen.")
                .font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 4).padding(.top, 4)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func names(_ k: String) -> String { n.items(k).map(\.label).joined(separator: " · ") }
}
