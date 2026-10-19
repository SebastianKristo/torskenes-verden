import Foundation

/* ---------------- Prompt 35: Kalender – felles for iOS-appen, widgetene og Mac-appen ---------------- */
// • KalWeek35: «Uken starter» (mandag/søndag) – brukes av måned, år, uke, ukenummer-kolonnen og widgetene.
//   Ukenummer er alltid ISO 8601 (mandag-start); en søndagsrad får nummeret til mandagen etter.
// • KalDay35: felles parseDay() for Glimt («hva skjer i morgen?», «imorgen», «i morra», «tomorrow», «fredag», «25.10»).
//   Fiks: spørsmålet normaliseres først (små bokstaver, uten ? ! . , : ; « » "), så «i morgen?» ikke faller tilbake til i dag.
// • KalTone35: de 12 kalenderfargene og tekstfargene (tx = 28 % mot svart, lt = 45 % mot hvit).
// • KalCalAPI35: /api/kalender/calendars (hidMenu, source, badge), PATCH farge/synlig/hidMenu, iCal-abonnement, Home Assistant
//   og prefs (weekStart, openView, defaultDuration, timelineStart, varsler). Tåler at serveren mangler feltene/endepunktene.

enum KalWeek35 {
    private static var cache: Bool? = nil

    /// true når uken starter på søndag (App Group-nøkkel kal.weekStart = «sun»).
    static var sunday: Bool {
        if let c = cache { return c }
        let v: Bool = KalGroup.defaults.string(forKey: "kal.weekStart") == "sun"
        cache = v
        return v
    }

    /// «mon» | «sun»
    static var raw: String { sunday ? "sun" : "mon" }

    static func set(_ v: String) {
        let sun: Bool = v == "sun" || v == "son" || v == "søn"
        KalGroup.defaults.set(sun ? "sun" : "mon", forKey: "kal.weekStart")
        cache = sun
    }

    /// Leses på nytt (widget-utvidelsen ved hver tidslinje).
    static func reload() { cache = nil }

    /// Kolonnen dagen har i en uke-rad (0 … 6).
    static func col(_ d: Date) -> Int { sunday ? KalD.wd(d) : KalD.wdMon(d) }

    /// Første dag i uka dagen ligger i.
    static func start(_ d: Date) -> Date { KalD.add(KalD.cal.startOfDay(for: d), -col(d)) }

    /// Bokstavene over kolonnene.
    static var letters: [String] { sunday ? ["S", "M", "T", "O", "T", "F", "L"] : KalD.letters }

    /// Korte ukedager over kolonnene («MAN» … eller «SØN» først).
    static var shortNames: [String] {
        var out: [String] = []
        for i in 0..<7 {
            let idx: Int = sunday ? i : (i + 1) % 7
            out.append(KalD.weekdaysShort[idx])
        }
        return out
    }

    /// true når kolonne i er søndag.
    static func isSunday(_ i: Int) -> Bool { sunday ? i == 0 : i == 6 }

    /// ISO-ukenummeret for en rad som starter på rowStart.
    static func weekNo(_ rowStart: Date) -> Int { KalD.isoWeek(sunday ? KalD.add(rowStart, 1) : rowStart) }

    /// Antall rader måneden trenger.
    static func rows(_ month: Date) -> Int {
        let first: Date = KalD.firstOfMonth(month)
        return (col(first) + KalD.daysInMonth(first) + 6) / 7
    }
}

/* ---------- Felles dag-tolking ---------- */

enum KalDay35 {
    private static func re(_ pattern: String) -> NSRegularExpression? {
        try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    }

    private static func replace(_ pattern: String, _ s: String, _ with: String) -> String {
        guard let r = re(pattern) else { return s }
        let ns: NSString = s as NSString
        return r.stringByReplacingMatches(in: s, options: [], range: NSRange(location: 0, length: ns.length), withTemplate: with)
    }

    /// Gruppene i første treff (nil for grupper som ikke var med).
    private static func groups(_ pattern: String, _ s: String) -> [String?]? {
        guard let r = re(pattern) else { return nil }
        let ns: NSString = s as NSString
        guard let m = r.firstMatch(in: s, options: [], range: NSRange(location: 0, length: ns.length)) else { return nil }
        var out: [String?] = []
        for i in 0..<m.numberOfRanges {
            let rg: NSRange = m.range(at: i)
            out.append(rg.location == NSNotFound ? nil : ns.substring(with: rg))
        }
        return out
    }

    /// Små bokstaver, uten ? ! , ; « » " og uten punktum/kolon som ikke står mellom tall (25.10 og 14:30 beholdes),
    /// mellomrom slått sammen og en blank på hver side: « hva skjer i morgen ».
    static func norm(_ q: String) -> String {
        var s: String = q.lowercased()
        s = s.replacingOccurrences(of: "’", with: "'")
        s = replace("[?!,;«»\"“”()]", s, " ")
        s = replace("(?<![0-9])[.:]|[.:](?![0-9])", s, " ")
        s = replace("\\s+", s, " ")
        return " " + s.trimmingCharacters(in: .whitespaces) + " "
    }

    /// Dag-ordene og antall dager fra i dag (lengste først).
    static let words: [(String, Int)] = [
        ("i overimorgen", 2), ("overimorgen", 2), ("i overmorgen", 2), ("overmorgen", 2), ("day after tomorrow", 2),
        ("i morgen", 1), ("imorgen", 1), ("i morra", 1), ("imorra", 1), ("i morgo", 1), ("imorgo", 1), ("tomorrow", 1),
        ("i dag", 0), ("idag", 0), ("i kveld", 0), ("ikveld", 0), ("i natt", 0), ("inatt", 0), ("today", 0), ("tonight", 0),
        ("i går", -1), ("igår", -1), ("yesterday", -1),
    ]

    /// Antall dager fra i dag for dag-ordet i teksten, eller nil.
    static func offset(_ q: String) -> Int? {
        let n: String = norm(q)
        for (w, d) in words where n.contains(" " + w + " ") { return d }
        return nil
    }

    static let weekdaysEn: [String] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    static let monthKeys: [String] = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]

    private static func makeDate(_ y: Int, _ m: Int, _ d: Int) -> Date? {
        var c: DateComponents = DateComponents()
        c.year = y
        c.month = m
        c.day = d
        guard let date = KalD.cal.date(from: c) else { return nil }
        if KalD.dayOfMonth(date) != d { return nil }
        return date
    }

    /// Dagen teksten gjelder som «YYYY-MM-DD», eller nil. Rekkefølge: dag-ord, (neste) ukedag, «25. okt», «25.10(.27)».
    static func parseDay(_ q: String, now: Date = Date()) -> String? {
        let T: Date = KalD.cal.startOfDay(for: now)
        if let d = offset(q) { return KalD.key(KalD.add(T, d)) }
        let n: String = norm(q)
        let wdPattern: String = "(?<![a-zæøå])(neste\\s+|next\\s+)?(?:på\\s+|on\\s+)?(søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|sunday|monday|tuesday|wednesday|thursday|friday|saturday)"
        if let g = groups(wdPattern, n) {
            let name: String = (g.count > 2 ? g[2] : nil) ?? ""
            var w: Int = KalD.weekdays.firstIndex(of: name) ?? -1
            if w < 0 { w = weekdaysEn.firstIndex(of: name) ?? 0 }
            var df: Int = (w - KalD.wd(T) + 7) % 7
            if df == 0 { df = 7 }
            let next: Bool = g.count > 1 && g[1] != nil
            if next && df < 7 { df += 7 }
            return KalD.key(KalD.add(T, df))
        }
        if let g = groups("(\\d{1,2})\\.?\\s*(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)[a-zæøå]*(\\s+\\d{4})?", n) {
            let dd: Int = Int((g.count > 1 ? g[1] : nil) ?? "1") ?? 1
            let mo: Int = (monthKeys.firstIndex(of: (g.count > 2 ? g[2] : nil) ?? "") ?? 0) + 1
            let yTxt: String = ((g.count > 3 ? g[3] : nil) ?? "").trimmingCharacters(in: .whitespaces)
            if let d = makeDate(Int(yTxt) ?? KalD.year(T), mo, dd) { return KalD.key(d) }
        }
        if let g = groups("(?<![0-9])(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2,4}))?(?![0-9])", n) {
            let dd: Int = Int((g.count > 1 ? g[1] : nil) ?? "1") ?? 1
            let mo: Int = Int((g.count > 2 ? g[2] : nil) ?? "1") ?? 1
            var y: Int = KalD.year(T)
            if let yy = Int((g.count > 3 ? g[3] : nil) ?? "") { y = yy < 100 ? 2000 + yy : yy }
            if mo >= 1 && mo <= 12, let d = makeDate(y, mo, dd) { return KalD.key(d) }
        }
        return nil
    }

    /// «hva skjer i morgen?», «i morgen?», «what's on tomorrow»: et spørsmål om hva som skjer en dag.
    static func isDayQuestion(_ q: String) -> Bool {
        let n: String = norm(q)
        if n.contains(" hva skjer ") || n.contains(" hva har jeg ") || n.contains(" what's on ") || n.contains(" whats on ")
            || n.contains(" what is on ") || n.contains(" what do i have ") || n.contains(" agenda ") || n.contains(" plan ") {
            return true
        }
        // Bare et dag-ord (med småord): «i morgen?», «og i morgen da?»
        guard offset(q) != nil else { return false }
        var rest: String = n
        for (w, _) in words { rest = rest.replacingOccurrences(of: " " + w + " ", with: " ") }
        let filler: Set<String> = ["og", "da", "hva", "med", "enn", "så", "på", "for", "what", "about", "and", "then", "skjer", "har", "jeg"]
        let left: [Substring] = rest.split(separator: " ").filter { (x: Substring) -> Bool in !filler.contains(String(x)) }
        return left.isEmpty
    }
}

/* ---------- Farger ---------- */

enum KalTone35 {
    /// Fargevalget i fasiten (SWC).
    static let swatches: [String] = ["#b23a2a", "#e8794a", "#a8661a", "#c9a227", "#2f7a4f", "#3d7f8a",
                                     "#2b5d8a", "#5b4fc4", "#8a3fa0", "#c2477a", "#6b665c", "#1b1a17"]

    /// Ny farge med utregnede tekstfarger (tx 28 % mot svart, lt 45 % mot hvit).
    static func apply(_ c: KalCal, hex: String) -> KalCal {
        var x: KalCal = c
        x.hex = hex
        x.textHex = KalCals.mix(hex, "#000000", 0.28)
        x.lightHex = KalCals.mix(hex, "#ffffff", 0.45)
        return x
    }

    /// Farge nummer i for en ny kalender (spres over paletten).
    static func pick(_ i: Int) -> String { swatches[((i * 3) % swatches.count + swatches.count) % swatches.count] }

    /// Navn gjettet fra domenet i en iCal-lenke («https://www.fotball.no/x.ics» → «Fotball»).
    static func guessName(_ url: String) -> String {
        guard let r = url.range(of: "//") else { return "" }
        var host: String = String(url[r.upperBound...])
        if let slash = host.firstIndex(of: "/") { host = String(host[..<slash]) }
        if host.hasPrefix("www.") { host = String(host.dropFirst(4)) }
        let first: String = host.split(separator: ".").first.map { (x: Substring) -> String in String(x) } ?? ""
        return KalD.cap(first)
    }

    static func validURL(_ s: String) -> Bool {
        let t: String = s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return t.hasPrefix("webcal://") || t.hasPrefix("https://") || t.hasPrefix("http://")
    }
}

extension KalCal {
    /// Ikke skjult fra menyen (Rediger → Skjul fra menyen).
    var inMenu: Bool { !(hidMenu ?? false) }
    /// Vises i visningene: slått på og ikke skjult fra menyen.
    var shown: Bool { on && inMenu }
    /// Kan fjernes (×): egne, iCal og Home Assistant – ikke de innebygde.
    var removable: Bool {
        if local { return true }
        let src: String = source ?? ""
        if src == "builtin" { return false }
        if ["own", "ical", "ha", "google", "caldav"].contains(src) { return true }
        return builtin == false
    }
    /// Merket ved navnet («Abonnement», «HA», …).
    var badgeText: String {
        if let b = badge, !b.isEmpty { return b }
        switch source ?? "" {
        case "ical": return "Abonnement"
        case "ha": return "HA"
        case "google": return "Google"
        case "caldav": return "iCloud"
        default: return ""
        }
    }
}

/* ---------- Server ---------- */

struct KalHaEntity35: Identifiable, Hashable {
    let id: String
    let name: String
    let added: Bool
}

struct KalHaList35 {
    var connected: Bool = false
    var entities: [KalHaEntity35] = []
    var error: String = ""
}

/// Svaret fra GET /api/kalender/calendars: kalenderne og prefs (verdiene som tekst).
struct KalCalsResult35 {
    var cals: [KalCal] = []
    var prefs: [String: String] = [:]
}

enum KalCalAPI35 {
    /// nil = serveren har ikke endepunktet (faste kalendere lokalt).
    static func fetch() async -> KalCalsResult35? {
        guard let d = try? await KalNet.get("/api/kalender/calendars") else { return nil }
        let list: [KalCal] = KalParse.calendars(d)
        if list.isEmpty { return nil }
        var out: KalCalsResult35 = KalCalsResult35()
        out.cals = list
        if let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any], let p = o["prefs"] as? [String: Any] {
            out.prefs = stringify(p)
        }
        return out
    }

    static func stringify(_ p: [String: Any]) -> [String: String] {
        var out: [String: String] = [:]
        for (k, v) in p {
            if let b = v as? Bool { out[k] = b ? "true" : "false" }
            else if let s = v as? String { out[k] = s }
            else if let n = v as? NSNumber { out[k] = n.stringValue }
        }
        return out
    }

    /// Én kalender fra {calendar:{…}}, {calendars:[…]} eller selve objektet.
    static func one(_ d: Data) -> KalCal? {
        let obj: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        var row: [String: Any] = obj
        if let inner = obj["calendar"] as? [String: Any] { row = inner }
        if row["id"] == nil { return KalParse.calendars(d).first }
        guard let data = try? JSONSerialization.data(withJSONObject: ["calendars": [row]]) else { return nil }
        return KalParse.calendars(data).first
    }

    /// true når svaret på PATCH inneholder feltet (serveren kjenner det).
    static func echoes(_ d: Data, _ key: String) -> Bool {
        let obj: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        if let inner = obj["calendar"] as? [String: Any] { return inner[key] != nil }
        return obj[key] != nil
    }

    /// PATCH /api/kalender/calendars/:id {color?, visible?, hidMenu?}. → svaret, eller nil ved feil.
    static func patch(_ id: String, _ body: [String: Any]) async -> Data? {
        try? await KalNet.send("PATCH", "/api/kalender/calendars/" + KalNet.enc(id), json: body)
    }

    /// POST /api/kalender/calendars/ical {url, name?, color?} → 201 {calendar}.
    static func addIcal(url: String, name: String, color: String) async throws -> KalCal? {
        var body: [String: Any] = ["url": url.trimmingCharacters(in: .whitespacesAndNewlines), "color": color]
        let n: String = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !n.isEmpty { body["name"] = n }
        let d: Data = try await KalNet.send("POST", "/api/kalender/calendars/ical", json: body, timeout: 30)
        return one(d)
    }

    /// GET /api/kalender/ha/calendars → {connected, entities:[{entity_id, name, added}]}.
    static func haList() async -> KalHaList35 {
        var out: KalHaList35 = KalHaList35()
        do {
            let d: Data = try await KalNet.get("/api/kalender/ha/calendars", timeout: 20)
            let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
            out.connected = KalParse.bool(o, "connected") ?? false
            for e in KalParse.list(o, "entities") {
                let id: String = KalParse.str(e, "entity_id").isEmpty ? KalParse.str(e, "id") : KalParse.str(e, "entity_id")
                if id.isEmpty { continue }
                let name: String = KalParse.str(e, "name")
                out.entities.append(KalHaEntity35(id: id, name: name.isEmpty ? id : name, added: KalParse.bool(e, "added") ?? false))
            }
            if !out.connected && out.entities.isEmpty { out.error = "Home Assistant er ikke koblet til. Legg inn adresse og token i Homelab → Integrasjoner." }
        } catch let e as KalNetError {
            out.error = e.status == 404 ? "Serveren støtter ikke Home Assistant-kalendere ennå." : e.message
        } catch {
            out.error = error.localizedDescription
        }
        return out
    }

    /// POST /api/kalender/calendars/ha {entities:[entity_id…], colors:{entity_id: hex}} → {calendars}.
    static func addHa(_ ids: [String], colors: [String: String]) async throws -> [KalCal] {
        let d: Data = try await KalNet.send("POST", "/api/kalender/calendars/ha", json: ["entities": ids, "colors": colors], timeout: 30)
        return KalParse.calendars(d)
    }

    /// DELETE /api/kalender/calendars/:id (egne, iCal og HA).
    static func remove(_ id: String) async throws {
        _ = try await KalNet.send("DELETE", "/api/kalender/calendars/" + KalNet.enc(id))
    }

    /// PUT /api/kalender/calendars/prefs (delvis).
    static func putPrefs(_ body: [String: Any]) async {
        _ = try? await KalNet.send("PUT", "/api/kalender/calendars/prefs", json: body)
    }

    /// Standardvarsel (minutter, -1 = ingen) ↔ serverens defaultReminder.
    static func remToServer(_ m: Int) -> String {
        if m < 0 { return "none" }
        if m >= 1440 { return "1d" }
        if m >= 60 { return "1h" }
        if m >= 30 { return "30m" }
        return "10m"
    }

    static func remFromServer(_ s: String) -> Int? {
        switch s {
        case "none": return -1
        case "10m": return 10
        case "15m": return 15
        case "30m": return 30
        case "1h": return 60
        case "1d", "day": return 1440
        default: return nil
        }
    }
}
