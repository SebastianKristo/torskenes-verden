import Foundation

/* ---------------- Prompt 24: Bursdager, delt mellom appen og widgetene ---------------- */
// Appen og widgetene leser samme svar: GET /api/widgets/birthdays (kompakt) eller GET /api/birthdays.
// Feltene følger kontrakten: {id, name, month, day, year, age, nextDate, daysLeft, relation, reminderDays, source, avatarUrl}.

/// Én bursdag slik widgetene og Hjem-kortet viser den.
struct BirthdayW24: Hashable {
    var id: String
    var name: String
    var month: Int
    var day: Int
    var year: Int?
    /// Alderen personen fyller neste gang (nil uten fødselsår).
    var age: Int?
    var daysLeft: Int
    var relation: String
    var source: String
    var avatarUrl: String

    /// «IN» for «Ingrid Nilsen», «R» for «Rune».
    var initials: String {
        let parts: [Substring] = name.split(separator: " ")
        let letters: [String] = parts.prefix(2).compactMap { $0.first.map { String($0) } }
        let s: String = letters.joined().uppercased()
        return s.isEmpty ? "?" : s
    }

    /// «2. nov»
    var shortDate: String {
        let m: Int = Swift.max(1, Swift.min(12, month))
        return "\(day). \(BirthdayShared24.monthsShort[m - 1])"
    }

    /// «I dag», «I morgen», «om 15 d»
    var whenText: String {
        if daysLeft <= 0 { return "I dag" }
        if daysLeft == 1 { return "I morgen" }
        return "om \(daysLeft) d"
    }

    /// Avatarfargen etter hvem det er (Familie, Venn, Jobb, Annet).
    var colorHex: String { BirthdayShared24.relationHex(relation) }
}

enum BirthdayShared24 {
    static let cacheKey: String = "w.birthdays"
    static let widgetKind: String = "no.kristo.finanshub.birthdays"

    static let monthsShort: [String] = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]
    static let monthsLong: [String] = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"]
    static let weekdays: [String] = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"]

    static func relationHex(_ r: String) -> String {
        switch r.lowercased() {
        case "familie": return "#b23a2a"
        case "venn": return "#2b5d8a"
        case "jobb": return "#2e6f75"
        case "annet": return "#a8661a"
        default: return "#5c5850"
        }
    }

    /// Neste dato for måned/dag (i dag teller som i dag). 29. februar faller på 28. februar i vanlige år.
    static func nextDate(month: Int, day: Int, from now: Date = Date()) -> Date {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone.current
        let today: Date = cal.startOfDay(for: now)
        let y: Int = cal.component(.year, from: today)
        func make(_ year: Int) -> Date {
            var c = DateComponents()
            c.year = year
            c.month = month
            c.day = day
            if let d = cal.date(from: c), cal.component(.month, from: d) == month { return d }
            c.day = Swift.max(1, day - 1)
            return cal.date(from: c) ?? today
        }
        let thisYear: Date = make(y)
        return thisYear < today ? make(y + 1) : thisYear
    }

    static func daysUntil(_ d: Date, from now: Date = Date()) -> Int {
        let cal = Calendar(identifier: .gregorian)
        let a: Date = cal.startOfDay(for: now)
        let b: Date = cal.startOfDay(for: d)
        return cal.dateComponents([.day], from: a, to: b).day ?? 0
    }

    private static func int(_ o: [String: Any], _ k: String) -> Int? {
        if let n = o[k] as? NSNumber { return n.intValue }
        if let s = o[k] as? String { return Int(s) }
        return nil
    }

    private static func str(_ o: [String: Any], _ k: String) -> String? {
        if let s = o[k] as? String, !s.isEmpty { return s }
        if let n = o[k] as? NSNumber { return n.stringValue }
        return nil
    }

    /// Én bursdag fra JSON. Dager igjen og alder regnes ut lokalt når serveren ikke sender dem.
    static func item(_ o: [String: Any], now: Date = Date()) -> BirthdayW24? {
        var month: Int = int(o, "month") ?? 0
        var day: Int = int(o, "day") ?? 0
        // Eldre form: «date»: «11-02» eller «1985-11-02».
        if month == 0 || day == 0, let d = str(o, "date") {
            let p: [Int] = d.split(separator: "-").compactMap { Int($0) }
            if p.count == 3 { month = p[1]; day = p[2] } else if p.count == 2 { month = p[0]; day = p[1] }
        }
        guard month >= 1, month <= 12, day >= 1, day <= 31 else { return nil }
        let name: String = str(o, "name") ?? "–"
        let year: Int? = int(o, "year")
        let next: Date = nextDate(month: month, day: day, from: now)
        // Lokal utregning, så tallet stemmer også når svaret er bufret fra i går.
        let days: Int = daysUntil(next, from: now)
        var age: Int? = nil
        if let year, year > 1800 {
            age = Calendar(identifier: .gregorian).component(.year, from: next) - year
        }
        let id: String = str(o, "id") ?? "\(name)-\(month)-\(day)"
        return BirthdayW24(id: id, name: name, month: month, day: day, year: year, age: age, daysLeft: days,
                           relation: str(o, "relation") ?? "annet", source: str(o, "source") ?? "local", avatarUrl: str(o, "avatarUrl") ?? "")
    }

    /// Lista sortert etter dager igjen. Godtar {items:[…]}, {next3:[…]}, {upcoming:[…]} og en ren liste.
    static func parse(_ data: Data, now: Date = Date()) -> [BirthdayW24] {
        let any: Any? = try? JSONSerialization.jsonObject(with: data)
        var raw: [[String: Any]] = []
        if let list = any as? [Any] {
            raw = list.compactMap { $0 as? [String: Any] }
        } else if let o = any as? [String: Any] {
            for k in ["items", "next3", "upcoming", "birthdays"] {
                if let list = o[k] as? [Any] { raw = list.compactMap { $0 as? [String: Any] }; break }
            }
            if raw.isEmpty, let n = o["next"] as? [String: Any] { raw = [n] }
        }
        let items: [BirthdayW24] = raw.compactMap { item($0, now: now) }
        return items.sorted { a, b in a.daysLeft != b.daysLeft ? a.daysLeft < b.daysLeft : a.name < b.name }
    }

    /// Kompakt form som appen legger i App Group, så widgetene har noe å vise uten nett.
    static func compact(_ items: [BirthdayW24]) -> Data? {
        let list: [[String: Any]] = items.prefix(6).map { b in
            var o: [String: Any] = ["id": b.id, "name": b.name, "month": b.month, "day": b.day, "relation": b.relation, "source": b.source]
            if let y = b.year { o["year"] = y }
            return o
        }
        return try? JSONSerialization.data(withJSONObject: ["items": list])
    }
}
