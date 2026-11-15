import Foundation

/* ---------------- Modulene i modullisten ↔ sidene i appen ----------------
 Fase 6: navn, ikon og rekkefølge kommer fra modullisten (SharedNet/Moduler.swift, ModulListe.swift). Her står bare hvilken side
 i appen (Store.paperGo / paperMainTab) en modul åpner, og de interne nøklene appen har brukt før (fane-id-er i layout.tabBar,
 nøkler i Mer), som beholdes som alias, så lagrede oppsett virker. Ren Foundation: HomelabTests kompilerer fila og sjekker at
 alle iOS-modulene i shared/schemas/moduler.json har en side her (test/ios-moduler.test.js sjekker det samme uten Xcode). */

enum ModulSider {
    /// Modul-id → siden i appen.
    static let side: [String: String] = [
        "oversikt": "hjem",
        "chat": "chat",
        "brief": "brief",
        "mat": "mat",
        "gjoremal": "huske",
        "familie": "familie",
        "kalender": "kalender",
        "vaer": "vaer",
        "reise": "avg",
        "sporing": "sporing",
        "finans": "finans",
        "media": "media",
        "nyheter": "nyheter",
        "studie": "studie",
        "bibel": "bibel",
        "skjold": "skjold",
        "domener": "domener",
    ]

    /// Eldre nøkler for samme modul (fanelinja, Mer, serverens tabBar) → modul-id.
    static let alias: [String: String] = [
        "dash": "oversikt",
        "start": "oversikt",
        "huskeliste": "gjoremal",
        "avganger": "reise",
        "ruter": "reise",
        "rss": "nyheter",
        "nyhetsleser": "nyheter",
        "okonomi": "finans",
        "smarthjem": "oversikt",
    ]

    /// Snarveier i fanelinja som ikke er egne moduler (sider inne i en modul, eller verktøy). Navnene følger ordlisten.
    static let snarveier: [(id: String, navn: String, ikon: String)] = [
        ("auto4", "Domener/Sporing", "square.grid.2x2"),
        ("aksjer", "Aksjer", "chart.line.uptrend.xyaxis"),
        ("boliger", "Boliger", "building.2"),
        ("abo", "Faste betalinger", "repeat"),
        ("fsok", "Glimt", "sparkle.magnifyingglass"),
        ("bursdag", "Bursdager", "gift"),
        ("nordlys", "Nordlys", "sparkle"),
        ("innst", "Innstillinger", "gearshape"),
    ]

    /// Modul-id for en side eller en eldre nøkkel («huske» → «gjoremal», «avg» → «reise», «rss» → «nyheter»). nil = ikke en modul.
    static func modulId(_ key: String) -> String? {
        if side[key] != nil { return key }
        if let a = alias[key] { return a }
        for (m, s) in side where s == key { return m }
        return nil
    }

    /// Siden i appen for en modul-id (eller en eldre nøkkel).
    static func appSide(_ key: String) -> String? {
        guard let m = modulId(key) else { return nil }
        return side[m]
    }

    /// Navnene fanelinja hadde før modullisten (Q1–Q12). En fane med et av disse navnene har ikke fått eget navn av brukeren,
    /// og får navnet fra modullisten ved engangsflyttingen (ModulListe.flyttFaner).
    static let gamleNavn: Set<String> = [
        "Hjem", "Finans", "Avganger", "Abonnementer", "Abonnement", "Subscription OS", "Søk", "Now Brief", "Nyhetsleser",
        "Huskeliste", "Dashboard",
    ]
}
