import Foundation

/* ---------------- Prompt 46: standardkalenderen for nye hendelser (iPhone, iPad, Mac og widgetene) ---------------- */
// Spesifikasjon: claude-code-glimt-kalender-standardkalender.md og claude-code-kalender-ny-hendelse-graa-skjerm.md.
// Serveren har hatt prefs.defaultCalendar (GET /api/kalender/calendars → defaultCalendar + prefs.defaultCalendar,
// PUT /api/kalender/calendars/prefs {defaultCalendar}) siden prompt 33, men appene brukte alltid den første skrivbare
// kalenderen (Personlig). Nå: valgt standardkalender → første skrivbare Google-kalender → Personlig → første skrivbare.
// Brukes av «+», rask time (Glimt) og hold/trykk i rutenettet. Ingen kalender-liste ennå = Personlig («p»), aldri krasj.

enum KalDef46 {
    /// Standardkalenderen fra serverens svar (toppnivå defaultCalendar eller prefs.defaultCalendar). "" = ikke oppgitt.
    static func parse(_ d: Data) -> String {
        guard let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return "" }
        if let v = o["defaultCalendar"] as? String, !v.isEmpty { return v }
        if let p = o["prefs"] as? [String: Any], let v = p["defaultCalendar"] as? String { return v }
        return ""
    }

    static func usable(_ c: KalCal) -> Bool { c.writable && c.hidMenu != true }

    /// Kalenderen nye hendelser havner i.
    static func pick(_ cals: [KalCal], preferred: String) -> String {
        if !preferred.isEmpty {
            let id: String = KalCals39.resolveId(preferred, in: cals)
            if let c = cals.first(where: { (x: KalCal) -> Bool in x.id == id }), usable(c) { return c.id }
        }
        if let g = cals.first(where: { (x: KalCal) -> Bool in usable(x) && (x.source ?? "") == "google" }) { return g.id }
        let p: String = KalCals39.resolveId("p", in: cals)
        if let c = cals.first(where: { (x: KalCal) -> Bool in x.id == p }), usable(c) { return c.id }
        if let c = cals.first(where: { (x: KalCal) -> Bool in usable(x) }) { return c.id }
        return "p"
    }

    /// Navnet til bekreftelsen («Lagt inn i Google»).
    static func name(_ id: String, in cals: [KalCal]) -> String {
        cals.first(where: { (x: KalCal) -> Bool in x.id == id })?.name ?? "Personlig"
    }
}
