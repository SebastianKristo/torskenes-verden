import SwiftUI

/* ---------------- Fanene: brukerens fanelinje (layout.tabBar) og fanene i navigasjonsskallet ----------------
 Fase 4: fra Paper16.swift (prompt 16). Brukerens valg av faner, navn og ikoner beholdes (Q33) og lagres på serveren som før;
 AppShell viser dem i systemets TabView (maks 5 på iPhone, resten under Mer). */

/// En fane i hovedfanelinjen (layout.tabBar.items). Mer står alltid sist og er ikke med her.
struct PaperTabItem: Codable, Hashable, Identifiable {
    var id: String
    var label: String
    var icon: String

    /// Alle fanene som kan ligge i linjen: modulene fra modullisten (navn, ikon og rekkefølge, ModulListe.swift) og snarveiene
    /// til sider inne i en modul (ModulSider.snarveier). Fase 6: ingen egen håndskrevet liste.
    @MainActor static var all: [PaperTabItem] { ModulListe.shared.faner }

    /// Prompt 40: det som kan velges under «Legg til» (Bibel bare for brukere med modulen).
    @MainActor static var selectable: [PaperTabItem] {
        all.filter { (t: PaperTabItem) -> Bool in t.id != "bibel" || Bible37Model.shared.enabled }
    }

    /// Fane-id-ene på serveren (layout.tabBar) er litt annerledes enn i appen.
    static func serverId(_ id: String) -> String {
        switch id {
        case "fsok": return "sok"
        case "avg": return "avganger"
        case "abo": return "abonnementer"
        case "auto4": return "domener"
        default: return id
        }
    }
    /// Id-en i appen for en fane fra serveren (layout.tabBar). Eldre nøkler («rss», «avganger», «huskeliste») er alias for modulen.
    @MainActor static func appId(_ id: String, label: String) -> String? {
        switch id {
        case "sok": return "fsok"
        case "avganger": return "avg"
        case "abonnementer": return "abo"
        case "domener": return label == "Domener/Sporing" ? "auto4" : "domener"
        case "mer": return nil
        default:
            if all.contains(where: { (t: PaperTabItem) -> Bool in t.id == id }) { return id }
            guard let side = ModulSider.appSide(id) else { return nil }
            return all.contains(where: { (t: PaperTabItem) -> Bool in t.id == side }) ? side : nil
        }
    }
    static let defaultIds = ["hjem", "finans", "mat", "auto4", "fsok"]
    @MainActor static var defaults: [PaperTabItem] { defaultIds.compactMap { (id: String) -> PaperTabItem? in all.first { $0.id == id } } }
    static let icons = ["house", "creditcard", "fork.knife", "globe", "shippingbox", "person.2", "tram", "cloud.sun", "newspaper",
                        "magnifyingglass", "square.grid.2x2", "star", "heart", "bolt", "leaf", "map", "chart.bar", "bag", "cart", "calendar", "bubble.left.and.bubble.right"]

    static func loadLocal() -> [PaperTabItem] {
        guard let d = UserDefaults.standard.data(forKey: "fh_tabbar"), let v = try? JSONDecoder().decode([PaperTabItem].self, from: d) else { return [] }
        return v
    }
    static func saveLocal(_ v: [PaperTabItem]) {
        if let d = try? JSONEncoder().encode(v) { UserDefaults.standard.set(d, forKey: "fh_tabbar") }
    }
}

/// Et ikon i fanelinja: SF Symbol-navn (ASCII) eller et tegn som «◎».
struct PaperTabIcon: View {
    let icon: String
    var size: CGFloat = 16
    /// Prompt 24 (claude-code-familie-design.md, «Fanelinje – ikon ved siden av tekst»): ikonboks 18 × 18,
    /// glyf 16 pt, sentrert mot teksten og flyttet 1,5 pt ned. Tegn-ikoner (◎ ◌ ♡ ⋯) i Newsreader 500.
    var body: some View {
        let box: CGFloat = 18
        // Prompt 46: egne SVG-ikoner (Familie → Soner og Helse), strek 1,8 i currentColor (fargen følger fanen).
        if let d = PaperTabIcon.svg46[icon] {
            Fam22GlyphShape(d: d)
                .stroke(style: StrokeStyle(lineWidth: 1.8 * box / 24, lineCap: .round, lineJoin: .round))
                .frame(width: box, height: box)
                .offset(y: 1.5)
        } else if PaperTabIcon.isSymbol(icon) {
            Image(systemName: icon).font(.system(size: size - 2, weight: .semibold))
                .frame(width: box, height: box)
                .offset(y: 1.5)
        } else {
            Text(icon).font(PF.serif(size, medium: true)).lineLimit(1).fixedSize()
                .frame(width: box, height: box)
                .offset(y: 1.5)
        }
    }
    static func isSymbol(_ s: String) -> Bool { s.count > 2 && s.unicodeScalars.allSatisfy { $0.isASCII } }

    /// Prompt 46 (claude-code-familie-ikoner-soner-helse.md, fasit TSV i Mobil Papir App.dc.html): 24 × 24-baner.
    nonisolated static let svg46: [String: String] = [
        "fam46:soner": "M12 15s-3.5-3-3.5-6a3.5 3.5 0 0 1 7 0c0 3-3.5 6-3.5 6zM12 9h.01M5.5 14.2C3.9 14.9 3 15.9 3 17c0 2.2 4 4 9 4s9-1.8 9-4c0-1.1-.9-2.1-2.5-2.8",
        "fam46:helse": "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM7.5 12.5h2.4l1.3-2.6 1.8 5 1.3-2.4h2.2",
    ]
}

extension Store {
    /* ---------- Oppsett fra serveren ---------- */

    /// tabBar og iconTheme fra /api/me/layout.
    func applyPaper16(_ o: [String: Any]) {
        if let tb = o["tabBar"] as? [String: Any] {
            let items = JS.list(tb, "items").compactMap { d -> PaperTabItem? in
                guard let sid = JS.str(d, "id"), let id = PaperTabItem.appId(sid, label: JS.str(d, "label") ?? ""),
                      let base = PaperTabItem.all.first(where: { $0.id == id }) else { return nil }
                let icon = JS.str(d, "icon") ?? base.icon
                return PaperTabItem(id: id, label: JS.str(d, "label") ?? base.label, icon: PaperTabIcon.isSymbol(icon) ? icon : base.icon)
            }
            if !items.isEmpty, let moved = ModulListe.shared.flyttFaner(items) {
                // Fase 6: engangsflytting til navnene i modullisten (Q1–Q12), lagres på serveren som et vanlig valg.
                tabBarItems = Array(moved.prefix(5))
                savePaperLayout(["tabBar": ["items": Store.tabBarBody(tabBarItems)]])
            } else if !items.isEmpty && items != tabBarItems {
                tabBarItems = Array(items.prefix(5))
            }
        }
        if let v = JS.str(o, "iconTheme"), PaperIconTheme.themes.contains(where: { $0.0 == v }), v != iconTheme { iconTheme = v }
        // Prompt 25: fanelinje-stil (NavStyle.swift).
        if let v = JS.str(o, "navStyle"), NavStyle25.ids.contains(v), v != navStyle25 { navStyle25 = v }
    }

    /// Fanene i hovedlinjen (uten Mer), i brukerens rekkefølge.
    var mainTabItems: [PaperTabItem] { tabBarItems.isEmpty ? PaperTabItem.defaults : tabBarItems }

    func setTabBar(_ items: [PaperTabItem]) {
        let v = Array(items.prefix(5))
        tabBarItems = v
        savePaperLayout(["tabBar": ["items": Store.tabBarBody(v)]])
        Haptics.shared.success()
    }

    func resetTabBar() {
        tabBarItems = []
        savePaperLayout(["tabBar": ["items": Store.tabBarBody(PaperTabItem.defaults)]])
        Haptics.shared.select()
    }

    /// Fanene slik serveren vil ha dem (Mer sist, maks 6).
    nonisolated static func tabBarBody(_ v: [PaperTabItem]) -> [[String: String]] {
        var out = v.prefix(5).map { ["id": PaperTabItem.serverId($0.id), "label": $0.label, "icon": $0.icon] }
        out.append(["id": "mer", "label": "Mer", "icon": "ellipsis"])
        return out
    }

    func setIconTheme(_ v: String) {
        iconTheme = v
        savePaperLayout(["iconTheme": v])
        Haptics.shared.select()
    }

    /// Fanene i hovedlinjen slik de vises nå: Hjem bare på startsiden, Domener/Sporing etter «Automatisk»,
    /// Søk bare med den flytende skanneknappen, og Mer alltid sist.
    func mainTabs(floating: Bool, onHome: Bool) -> [(String, String, String)] {
        var out: [(String, String, String)] = []
        for it in mainTabItems {
            var id = it.id
            var label = it.label
            switch it.id {
            case "hjem": if !onHome { continue }
            case "fsok": if !floating { continue }
            case "auto4":
                id = paperTab4
                if label == "Domener/Sporing" { label = id == "sporing" ? "Sporing" : "Domener" }
            default: break
            }
            if out.contains(where: { $0.0 == id }) { continue }
            out.append((id, label, it.icon))
        }
        out.append(("mer", "Mer", "ellipsis"))
        return out
    }

    /// Et trykk på en fane i hovedlinjen: noen faner er egne skjermer (Vær, Nyheter).
    func paperMainTab(_ id: String) {
        switch id {
        case "vaer": openWeather()
        case "nyheter": openNews()
        // Prompt 40: ark/overlegg åpnes som ark, resten navigeres til.
        case "rss": openNews()
        case "brief": Brief34Model.shared.show()
        case "nordlys": System31Model.shared.show()
        case "chat": openChat()
        case "aksjer", "boliger": paperFinGo(id)
        case "domener": paperOpenDomains(from: "hjem")
        // Fase 6: modulene fra modullisten som åpnes i fullskjerm (som i Mer).
        case "media": Media43.shared.show()
        case "studie": Study44.shared.show()
        case "skjold": Skjold76.shared.show()
        default: paperGo(id)
        }
    }
}

/* ---------- Fanene i systemets fanelinje (AppShell) ---------- */

/// En fane i TabView / sidekolonnen.
struct ShellTab: Identifiable, Hashable {
    let id: String
    let title: String
    /// SF Symbol.
    let symbol: String
}

enum ShellTabs {
    static let moreId: String = "mer"
    /// Systemets fanelinje på iPhone har plass til 5 faner (Mer er den siste).
    static let compactMax: Int = 5

    /// Alle fanene i brukerens rekkefølge (layout.tabBar, «Rediger fanelinjen»), Oversikt først og Mer sist.
    @MainActor static func all(_ store: Store) -> [ShellTab] {
        var out: [ShellTab] = []
        for it in store.mainTabItems {
            var id: String = it.id
            var label: String = it.label
            if id == "auto4" {
                id = store.paperTab4
                if label == "Domener/Sporing" { label = id == "sporing" ? "Sporing" : "Domener" }
            }
            // Q1: startsiden heter Oversikt.
            if id == "hjem" && label == "Hjem" { label = "Oversikt" }
            if id == moreId || out.contains(where: { (t: ShellTab) -> Bool in t.id == id }) { continue }
            out.append(ShellTab(id: id, title: label, symbol: symbol(id, it.icon)))
        }
        // Oversikt er alltid med (fanelinja skifter ikke innhold per seksjon, og Hjem-knappen fra prompt 42 finnes ikke i systemets linje).
        if !out.contains(where: { (t: ShellTab) -> Bool in t.id == "hjem" }) {
            out.insert(ShellTab(id: "hjem", title: "Oversikt", symbol: "house"), at: 0)
        }
        out.append(ShellTab(id: moreId, title: "Mer", symbol: "ellipsis.circle"))
        return out
    }

    /// iPhone: de fire første og Mer. Resten ligger under Mer (som før).
    static func compact(_ all: [ShellTab]) -> [ShellTab] {
        let main: [ShellTab] = all.filter { (t: ShellTab) -> Bool in t.id != moreId }
        var out: [ShellTab] = Array(main.prefix(compactMax - 1))
        if let more = all.first(where: { (t: ShellTab) -> Bool in t.id == moreId }) { out.append(more) }
        return out
    }

    /// SF Symbol for fanen: brukerens valg når det er et symbolnavn, ellers fanens standardikon.
    @MainActor static func symbol(_ id: String, _ icon: String) -> String {
        if PaperTabIcon.isSymbol(icon) { return icon }
        if let d = PaperTabItem.all.first(where: { (t: PaperTabItem) -> Bool in t.id == id }) { return d.icon }
        return ModulListe.shared.ikon(id, "square.grid.2x2")
    }

    /// Fanen som er markert for siden som vises (en side som ikke har egen fane, markerer Mer).
    @MainActor static func current(_ store: Store, ids: [String]) -> String {
        let t: String = store.paperTab
        if store.paperInDomains && ids.contains("domener") { return "domener" }
        if store.paperInFinance && t != "abo" && ids.contains("finans") && !ids.contains(t) { return "finans" }
        return ids.contains(t) ? t : moreId
    }

    /// Trykk på en fane. Den markerte fanen igjen = fanens rot (og et nytt trykk scroller til toppen).
    @MainActor static func select(_ id: String, _ store: Store, current: String) {
        if id == current {
            store.nav26TapActive(id)
            return
        }
        Haptics.shared.select()
        if id == "hjem" { Haptic34.back() }
        if id == "domener" && !store.paperInDomains {
            store.paperOpenDomains(from: "hjem")
            return
        }
        // Vær, Nyheter, Brief, Nordlys og Chat åpnes som før (ark/fullskjerm); fanen blir stående.
        store.paperMainTab(id)
    }
}
