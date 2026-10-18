import SwiftUI

/* ---------------- Prompt 24: profiler (Innstillinger → PROFIL) ----------------
   Standard · Finans + Boliger · Boliger-profil. Hver profil er et ferdig sett med startRoute, homeNav og finNav,
   lagret i /api/me/layout (profile, startRoute, homeNav, finNav) og synket mellom enheter.
   Finans + Boliger: appen åpner i Finans → Boliger, Boliger og Finans-fanene er rotsider (ingen tilbakeknapp),
   domene-pillen vises i toppbildet på Boliger, og «‹ Boliger» går tilbake fra Domener. */

struct Prof24Def: Hashable {
    let key: String
    let name: String
    let sub: String
    var startRoute: String
    var homeNav: [String]
    var finNav: [String]
}

@MainActor
@Observable
final class Prof24 {
    static let shared = Prof24()

    var profile: String = UserDefaults.standard.string(forKey: AcctScope.key("fh_profile24")) ?? "standard" {
        didSet { UserDefaults.standard.set(profile, forKey: AcctScope.key("fh_profile24")) }
    }
    var startRoute: String = UserDefaults.standard.string(forKey: AcctScope.key("fh_start24")) ?? "hjem" {
        didSet { UserDefaults.standard.set(startRoute, forKey: AcctScope.key("fh_start24")) }
    }
    var defs: [Prof24Def] = Prof24.builtIn
    private var startedFor: String = ""
    private var bootAt: Date = Date()

    static let builtIn: [Prof24Def] = [
        Prof24Def(key: "standard", name: "Standard", sub: "Hjem, Finans, Mat og Mer · vanlige Finans-faner",
                  startRoute: "hjem", homeNav: PaperTabItem.defaultIds, finNav: ["oversikt", "liste", "finn", "sok"]),
        Prof24Def(key: "finans_boliger", name: "Finans + Boliger", sub: "Åpner i Boliger · Boliger, Søk, Liste, Oversikt, Kvitteringer · Hjem under Mer",
                  startRoute: "finans/boliger", homeNav: ["finans"], finNav: ["boliger", "sok", "liste", "oversikt", "kvitteringer"]),
        Prof24Def(key: "boliger", name: "Boliger-profil", sub: "Bare Finans og Domener, med Boliger først",
                  startRoute: "hjem", homeNav: ["finans", "domener"], finNav: ["boliger", "kvitteringer", "oversikt", "sok"]),
    ]

    func def(_ key: String) -> Prof24Def? { defs.first { $0.key == key } }

    /// GET /api/me/profiles: de ferdige oppsettene fra serveren. Eldre server (404): de innebygde.
    func loadDefs(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/me/profiles", timeout: 15) else { return }
        let o: [String: Any] = JS.obj(d)
        var out: [Prof24Def] = []
        for b in Prof24.builtIn {
            var x: Prof24Def = b
            if let s = JS.dict(o, b.key) {
                if let r = JS.str(s, "startRoute") { x.startRoute = r }
                let h: [String] = JS.strings(s, "homeNav")
                if !h.isEmpty { x.homeNav = h }
                let f: [String] = JS.strings(s, "finNav")
                if !f.isEmpty { x.finNav = f }
            }
            out.append(x)
        }
        defs = out
        if let c = JS.str(o, "current"), ["standard", "finans_boliger", "boliger", "custom"].contains(c), c != profile { profile = c }
    }

    /// profile og startRoute fra /api/me/layout.
    func apply(_ o: [String: Any], _ store: Store) {
        if let v = JS.str(o, "profile"), ["standard", "finans_boliger", "boliger", "custom"].contains(v), v != profile { profile = v }
        if let r = JS.str(o, "startRoute"), r != startRoute { startRoute = r }
        goStart(store)
    }

    /// Første gang etter oppstart (per konto): åpne startsiden til profilen.
    func goStart(_ store: Store) {
        let acct: String = AcctScope.current
        if startedFor == acct { return }
        // Bare rett etter oppstart (oppsettet fra serveren kan komme litt etter), aldri midt i bruk.
        if Date().timeIntervalSince(bootAt) > 12 || store.paperTab != "hjem" { startedFor = acct; return }
        if startRoute == "finans/boliger" {
            startedFor = acct
            store.paperFinGo("boliger")
        }
    }

    /// Velg en profil: faner, Finans-faner og startside settes, og alt lagres per bruker.
    func pick(_ key: String, _ store: Store) {
        guard let d = def(key) else { return }
        profile = key
        startRoute = d.startRoute
        UserDefaults.standard.set(key == "boliger", forKey: "fh_bol_profile")
        let std: [String] = PaperTabItem.defaultIds
        if d.homeNav == std {
            store.resetTabBar()
        } else {
            let items: [PaperTabItem] = d.homeNav.compactMap { (id: String) -> PaperTabItem? in
                guard let app = PaperTabItem.appId(id, label: "") else { return nil }
                return PaperTabItem.all.first { $0.id == app }
            }
            if !items.isEmpty { store.setTabBar(items) }
        }
        store.setFinNav(d.finNav)
        store.savePaperLayout(["profile": key, "startRoute": d.startRoute, "homeNav": d.homeNav, "finNav": d.finNav])
        if d.startRoute == "finans/boliger" {
            store.paperFinGo("boliger")
            store.flash("Profil valgt · appen åpner i Boliger")
        } else {
            store.flash(key == "standard" ? "Standard-oppsett er tilbake" : "Profil valgt")
        }
    }

    /// Profilen som er valgt, eller «custom» når fanene er endret etter valget.
    func current(_ store: Store) -> String {
        guard let d = def(profile) else { return profile }
        let fin: [String] = store.finNavItems.map(\.id)
        if Array(d.finNav.prefix(5)) != fin { return "custom" }
        return profile
    }
}

extension Store {
    var prof24FinBol: Bool { Prof24.shared.profile == "finans_boliger" }

    /// Rotsider i Finans + Boliger: Finans-fanene og Finans → Mer. Der vises ingen tilbakeknapp.
    var prof24IsRoot: Bool {
        guard prof24FinBol else { return false }
        if paperInner || paperFin != nil || paperClassic != nil { return false }
        if paperTab == "boliger" { return folder == nil }
        if paperTab == "fmer" { return true }
        return finNavItems.map(\.page).contains(paperTab)
    }

    /// «‹ Boliger» i stedet for «‹ Hjem» når Boliger er rot (også på Domener).
    var prof24UpLabel: String {
        if prof24FinBol && (paperInDomains || paperUpLabel == "Hjem") { return "Boliger" }
        return paperUpLabel
    }

    /// Tilbake til rotsiden: Boliger i Finans + Boliger, ellers Hjem.
    func prof24GoRoot() {
        if prof24FinBol { paperFinGo("boliger") } else { paperGo("hjem") }
    }

    /// Domene-pillen i toppbildet: bare på Boliger i Finans + Boliger.
    var prof24DomainPill: Bool { prof24FinBol && paperTab == "boliger" && folder == nil }

    /// Ved oppstart og kontobytte: ferdige oppsett fra serveren og startsiden.
    func prof24Boot() async {
        Prof24.shared.goStart(self)
        await Prof24.shared.loadDefs(self)
    }

    /// Radene i Innstillinger → PROFIL.
    func prof24Rows(_ p: PaperPalette) -> [PaperLinkRow] {
        let m: Prof24 = Prof24.shared
        let cur: String = m.current(self)
        var rows: [PaperLinkRow] = m.defs.map { (d: Prof24Def) -> PaperLinkRow in
            let on: Bool = cur == d.key
            return PaperLinkRow(name: d.name, sub: d.sub, value: on ? "✓ Valgt" : "Velg", valueColor: on ? p.pos : p.mut, icon: "person.2") {
                m.pick(d.key, self)
            }
        }
        if cur == "custom" {
            rows.append(PaperLinkRow(name: "Egendefinert", sub: "Fanene er endret etter at profilen ble valgt", value: "✓ Valgt", valueColor: p.pos, icon: "slider.horizontal.3") {})
        }
        return rows
    }
}
