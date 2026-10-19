import Foundation

/* ---------------- Prompt 36: Kalender – Google Kalender (hovedkalender + flere Google-kalendere) ---------------- */
// Felles for iPhone-appen og Mac-appen (ren Foundation, kompileres også i widget-utvidelsen).
// GET /api/kalender/calendars/google → {connected, configured, email, main:{id,name}|null,
//   calendars:[{id:'primary'|'<id>', googleId, name, primary, color, writable, access, main, shown, appId}]}
// PUT /api/kalender/calendars/google {main?, show?:[googleId…]} → samme (400 når main ikke er skrivbar, 409 uten kobling).
// Innloggingen skjer i Homelab: POST /api/birthdays/google/start gir en engangs-URL (2 min) som åpnes i nettleseren.

struct KalGCal36: Identifiable, Hashable {
    /// 'primary' eller Google-id-en.
    let id: String
    let googleId: String
    let name: String
    let primary: Bool
    /// «#rrggbb» fra Google, eller tom.
    let color: String
    let writable: Bool
    let access: String
    let main: Bool
    let shown: Bool
    /// Kalender-id-en i appen ('g-…') når den vises.
    let appId: String
}

struct KalGoogle36 {
    var connected: Bool = false
    var configured: Bool = false
    var email: String = ""
    var mainId: String = ""
    var mainName: String = ""
    var calendars: [KalGCal36] = []
    var error: String = ""

    /// Skrivbare kalendere (kan være hovedkalender), primary først.
    var writable: [KalGCal36] {
        let w: [KalGCal36] = calendars.filter { (c: KalGCal36) -> Bool in c.writable }
        let p: [KalGCal36] = w.filter { (c: KalGCal36) -> Bool in c.primary }
        let rest: [KalGCal36] = w.filter { (c: KalGCal36) -> Bool in !c.primary }
        return p + rest
    }

    /// De andre kalenderne (ikke hovedkalenderen) som kan vises som egne kalendere.
    var others: [KalGCal36] {
        calendars.filter { (c: KalGCal36) -> Bool in !c.main }
    }

    /// Google-id-ene som vises nå (show-lista til PUT).
    var shownIds: [String] {
        calendars.filter { (c: KalGCal36) -> Bool in c.shown && !c.main }.map { (c: KalGCal36) -> String in c.googleId }
    }
}

enum KalGoogleAPI36 {
    static func parse(_ d: Data) -> KalGoogle36 {
        var out: KalGoogle36 = KalGoogle36()
        let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        out.connected = KalParse.bool(o, "connected") ?? false
        out.configured = KalParse.bool(o, "configured") ?? false
        out.email = KalParse.str(o, "email")
        if let m = o["main"] as? [String: Any] {
            out.mainId = KalParse.str(m, "id")
            out.mainName = KalParse.str(m, "name")
        }
        var seen: Set<String> = []
        for c in KalParse.list(o, "calendars") {
            let id: String = KalParse.str(c, "id")
            if id.isEmpty || seen.contains(id) { continue }
            seen.insert(id)
            var gid: String = KalParse.str(c, "googleId")
            if gid.isEmpty { gid = id }
            var name: String = KalParse.str(c, "name")
            if name.isEmpty { name = gid }
            var color: String = KalParse.str(c, "color")
            if !(color.count == 7 && color.hasPrefix("#")) { color = "" }
            out.calendars.append(KalGCal36(id: id, googleId: gid, name: name, primary: KalParse.bool(c, "primary") ?? false,
                                           color: color, writable: KalParse.bool(c, "writable") ?? false,
                                           access: KalParse.str(c, "access"), main: KalParse.bool(c, "main") ?? false,
                                           shown: KalParse.bool(c, "shown") ?? false, appId: KalParse.str(c, "appId")))
        }
        return out
    }

    /// Oversikten. Feil havner i .error (404 = serveren er for gammel).
    static func fetch() async -> KalGoogle36 {
        do {
            let d: Data = try await KalNet.get("/api/kalender/calendars/google", timeout: 20)
            return parse(d)
        } catch let e as KalNetError {
            var out: KalGoogle36 = KalGoogle36()
            out.error = e.status == 404 ? "Serveren støtter ikke Google-kalendere ennå. Oppdater Homelab." : e.message
            return out
        } catch {
            var out: KalGoogle36 = KalGoogle36()
            out.error = error.localizedDescription
            return out
        }
    }

    /// PUT {main?, show?}. → (ny oversikt, feilmelding). Ved feil er oversikten nil.
    static func put(main: String?, show: [String]?) async -> (KalGoogle36?, String) {
        var body: [String: Any] = [:]
        if let main { body["main"] = main }
        if let show { body["show"] = show }
        do {
            let d: Data = try await KalNet.send("PUT", "/api/kalender/calendars/google", json: body, timeout: 25)
            return (parse(d), "")
        } catch let e as KalNetError {
            return (nil, e.message)
        } catch {
            return (nil, error.localizedDescription)
        }
    }

    /// Engangs-URL til Google-innloggingen i Homelab (nettleseren). nil = fikk ikke laget den.
    static func loginURL(returnTo: String = "/") async -> URL? {
        let bases: [String] = KalNet.session().0
        guard let base = bases.first?.trimmingCharacters(in: CharacterSet(charactersIn: "/")), !base.isEmpty else { return nil }
        guard let d = try? await KalNet.send("POST", "/api/birthdays/google/start", json: ["return": returnTo], timeout: 15) else {
            return URL(string: base)
        }
        let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        let path: String = KalParse.str(o, "url")
        if path.hasPrefix("http") { return URL(string: path) }
        if path.hasPrefix("/") { return URL(string: base + path) }
        return URL(string: base)
    }

    /// Tekst under en kalender i lista.
    static func accessText(_ c: KalGCal36) -> String {
        if !c.writable { return "Bare lesing" }
        if c.access == "owner" { return "Eier" }
        return "Kan redigere"
    }
}
