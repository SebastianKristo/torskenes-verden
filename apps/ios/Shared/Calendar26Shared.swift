import Foundation

/* ---------------- Prompt 26: Kalender, delt mellom appen og widgetene ---------------- */
// Fasit: design/Kalender.dc.html og prompts/prompt-26-pakke/claude-code-kalender.md.
// Data: GET /api/kalender?from=&to= ({events:[…], subjects:{navn: farge}}) og GET /api/widgets/calendar (kompakt).
// Hendelsene leses tolerant: start/end som ISO med eller uten tidssone, bare dato (hele dagen) eller millisekunder.

/// Én hendelse i kalenderen (time, prøve, innlevering, bursdag, skole eller fri).
struct CalEvent26: Hashable, Identifiable {
    var id: String
    var title: String
    var short: String
    var subject: String
    var room: String
    var teacher: String
    var note: String
    var start: Date
    var end: Date
    var allDay: Bool
    /// time, prove, innl, bursdag, skole eller fri.
    var type: String
    /// Farge fra serveren («#2b5d8a»), tom = fagpaletten.
    var color: String
    var source: String
    var url: String
    var mazemap: String
    /// «2026-10-22» (lokal dag).
    var dayKey: String
    /// Minutter etter midnatt, -1 for hele dagen.
    var startMin: Int
    var endMin: Int
    /// Prompt 27: kalenderen hendelsen hører til (timeplan, prover, skole, privat, familie, bursdager), tom = utledes av typen.
    var calendar: String = ""
    /// Bare Google-hendelser fra Privat og Familie kan redigeres og slettes.
    var editable: Bool = false
    var googleId: String = ""
    var recurrence: String = ""
    /// Prompt 31: stedet slik det kom fra kilden (med URL), brukes når hendelsen redigeres.
    var roomFull: String = ""

    var isTest: Bool { type == "prove" || type == "innl" }
    /// Timer og prøver med klokkeslett (det widgetene og nå-kortet viser).
    var isLesson: Bool { (type == "time" || type == "prove") && !allDay && startMin >= 0 }
    var startText: String { Cal26.hm(startMin) }
    var endText: String { Cal26.hm(endMin) }

    /// «08:15–09:45», «Frist 23:59» eller «Hele dagen».
    var timeText: String {
        if type == "innl" { return "Frist " + endText }
        if allDay || startMin < 0 { return "Hele dagen" }
        return startText + "–" + endText
    }

    /// «A-112 · Kari Hansen» (timer) eller «Canvas · Essay …» (andre).
    var subLine: String {
        let second: String = type == "time" ? teacher : note
        return [room, second].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// «A-112 · Kari Hansen» for nå-kort og widgets.
    var roomTeacher: String { [room, teacher].filter { !$0.isEmpty }.joined(separator: " · ") }

    /// Filtergruppen (kalenderen): timeplan, prover, skole, privat, familie eller bursdager.
    var group: String {
        if !calendar.isEmpty { return Cal26.normCal(calendar) }
        if source.lowercased().contains("google") && type != "bursdag" { return "privat" }
        return Cal26.group(type)
    }

    /// Fargen som vises: prøver alltid røde, ellers serverens farge eller fagpaletten.
    func hex(_ user: [String: String] = [:]) -> String {
        if isTest { return Cal26.red }
        if type == "bursdag" { return "#2b5d8a" }
        if type == "skole" || type == "fri" { return color.isEmpty ? "#a8661a" : color }
        if !subject.isEmpty, let c = user[subject], !c.isEmpty { return c }
        if !color.isEmpty { return color }
        return Cal26.subjectHex(subject.isEmpty ? title : subject)
    }

    var json: [String: Any] {
        var o: [String: Any] = ["id": id, "title": title, "short": short, "subject": subject, "room": room, "teacher": teacher,
                                "note": note, "start": Cal26.isoLocal(start), "end": Cal26.isoLocal(end), "allDay": allDay,
                                "type": type, "color": color, "source": source]
        if !url.isEmpty { o["url"] = url }
        if !mazemap.isEmpty { o["mazemap"] = mazemap }
        if !calendar.isEmpty { o["calendar"] = calendar }
        if editable { o["editable"] = true }
        if !googleId.isEmpty { o["googleId"] = googleId }
        return o
    }
}

/// Det widgetene og Hjem-kortet viser (samme regler som `wg` i designet).
struct CalWidgetState26 {
    var kicker: String = "FRI"
    var big: String = "–"
    var title: String = "Ingen timer"
    var sub: String = ""
    var hex: String = "#7a7468"
    var when: String = ""
    /// «I dag · Mandag 19. okt»
    var dayShort: String = ""
    /// «I dag · Mandag 19. oktober»
    var dayLong: String = ""
    var count: String = "0 timer"
    var isToday: Bool = true
    var next3: [CalWItem26] = []
    var all: [CalWItem26] = []
    var exams: [CalWExam26] = []
    var eventId: String = ""
}

struct CalWItem26: Identifiable, Hashable {
    var id: String
    var time: String
    var title: String
    var sub: String
    var hex: String
    var dim: Bool
}

struct CalWExam26: Identifiable, Hashable {
    var id: String
    var title: String
    var inText: String
    var red: Bool
    var day: Int
    var month: String
    var sub: String
}

enum Cal26 {
    static let cacheKey: String = "w.calendar"
    static let widgetKind: String = "no.kristo.finanshub.kalender"
    static let red: String = "#b23a2a"

    static let monthsLong: [String] = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"]
    static let monthsShort: [String] = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]
    /// Søndag først, som Calendar.weekday - 1.
    static let weekdays: [String] = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"]
    /// Mandag først.
    static let weekShort: [String] = ["MAN", "TIR", "ONS", "TOR", "FRE", "LØR", "SØN"]

    /// Fag → (kortnavn, farge, lærer). Fast palett, lik på alle klienter.
    static let subjects: [String: (String, String, String)] = [
        "Matematikk R2": ("Matte R2", "#2b5d8a", "Kari Hansen"),
        "Fysikk 2": ("Fysikk 2", "#2e6f75", "Ola Berg"),
        "Norsk": ("Norsk", "#a8661a", "Ingrid Lie"),
        "Engelsk": ("Engelsk", "#7a3b6b", "John Smith"),
        "Kjemi 2": ("Kjemi 2", "#2f7a4f", "Per Dahl"),
        "Historie": ("Historie", "#6b5a3a", "Anne Moen"),
        "Spansk": ("Spansk", "#c0562a", "Lucía García"),
        "Kroppsøving": ("Gym", "#3f7a6e", "Even Nilsen"),
        "Studietid": ("Studietid", "#7a7468", ""),
    ]

    static let palette: [String] = ["#2b5d8a", "#2e6f75", "#a8661a", "#7a3b6b", "#2f7a4f", "#6b5a3a", "#c0562a", "#3f7a6e", "#5c5850"]

    static func subjectHex(_ s: String) -> String {
        if let v = subjects[s] { return v.1 }
        if s.isEmpty { return "#5c5850" }
        var h: Int = 0
        for u in s.unicodeScalars { h = (h &* 31 &+ Int(u.value)) & 0x7fffffff }
        return palette[h % palette.count]
    }

    /// Kalender-id fra serveren (også korte navn) til timeplan, prover, skole, privat, familie eller bursdager.
    static func normCal(_ raw: String) -> String {
        switch raw.lowercased() {
        case "tt", "timeplan", "time": return "timeplan"
        case "ex", "prover", "prøver", "prove": return "prover"
        case "priv", "privat", "private", "google": return "privat"
        case "fam", "familie", "family": return "familie"
        case "bd", "bursdager", "bursdag", "birthdays": return "bursdager"
        default: return "skole"
        }
    }

    static func group(_ type: String) -> String {
        switch type {
        case "time": return "timeplan"
        case "prove", "innl": return "prover"
        case "bursdag": return "bursdager"
        default: return "skole"
        }
    }

    /* ---------- Datoer ---------- */

    static let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone.current
        c.firstWeekday = 2
        return c
    }()

    static func hm(_ m: Int) -> String {
        if m < 0 { return "" }
        let h: Int = (m / 60) % 24
        let mm: Int = m % 60
        return String(format: "%02d:%02d", h, mm)
    }

    static func minutes(_ d: Date) -> Int {
        let c: DateComponents = cal.dateComponents([.hour, .minute], from: d)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }

    static func key(_ d: Date) -> String {
        let c: DateComponents = cal.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 2000, c.month ?? 1, c.day ?? 1)
    }

    static func day(_ key: String) -> Date {
        let p: [Int] = key.split(separator: "-").compactMap { Int($0) }
        var c = DateComponents()
        c.year = p.count > 0 ? p[0] : 2000
        c.month = p.count > 1 ? p[1] : 1
        c.day = p.count > 2 ? p[2] : 1
        c.hour = 12
        return cal.date(from: c) ?? Date()
    }

    static func add(_ d: Date, _ days: Int) -> Date { cal.date(byAdding: .day, value: days, to: d) ?? d }

    static func startOfDay(_ d: Date) -> Date { cal.startOfDay(for: d) }

    /// Dager fra i dag til `key` (0 = i dag).
    static func daysUntil(_ key: String, from now: Date) -> Int {
        let a: Date = startOfDay(now)
        let b: Date = startOfDay(day(key))
        return cal.dateComponents([.day], from: a, to: b).day ?? 0
    }

    /// 0 = søndag … 6 = lørdag (som getDay() i designet).
    static func jsDay(_ d: Date) -> Int { (cal.component(.weekday, from: d) + 6) % 7 }

    static func cap(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }

    /// «mandag 19. oktober»
    static func dLong(_ d: Date) -> String {
        let m: Int = cal.component(.month, from: d)
        return weekdays[jsDay(d)] + " \(cal.component(.day, from: d)). " + monthsLong[m - 1]
    }

    /// «19. okt»
    static func dShort(_ d: Date) -> String {
        let m: Int = cal.component(.month, from: d)
        return "\(cal.component(.day, from: d)). " + monthsShort[m - 1]
    }

    static func isoWeek(_ d: Date) -> Int { Calendar(identifier: .iso8601).component(.weekOfYear, from: d) }

    /// «1 t 5 min» eller «34 min».
    static func dur(_ x: Int) -> String { x >= 60 ? "\(x / 60) t \(x % 60) min" : "\(x) min" }

    /// «I dag», «I morgen» eller «5 dager».
    static func inText(_ dd: Int) -> String { dd <= 0 ? "I dag" : dd == 1 ? "I morgen" : "\(dd) dager" }

    private static let isoTZ: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let isoTZFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static func local(_ pattern: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = pattern
        return f
    }

    private static let localSec: DateFormatter = local("yyyy-MM-dd'T'HH:mm:ss")
    private static let localMin: DateFormatter = local("yyyy-MM-dd'T'HH:mm")
    private static let localSpace: DateFormatter = local("yyyy-MM-dd HH:mm")
    private static let localDay: DateFormatter = local("yyyy-MM-dd")

    /// Lokal tid uten sone («2026-10-22T10:00:00»), slik bufferen og widgetene leser den.
    static func isoLocal(_ d: Date) -> String { localSec.string(from: d) }

    /// (dato, bare dato?) fra tekst eller tall.
    static func parseDate(_ v: Any?) -> (Date, Bool)? {
        if let n = v as? NSNumber {
            let x: Double = n.doubleValue
            if x > 1e11 { return (Date(timeIntervalSince1970: x / 1000), false) }
            if x > 1e8 { return (Date(timeIntervalSince1970: x), false) }
            return nil
        }
        guard let raw = v as? String else { return nil }
        let s: String = raw.trimmingCharacters(in: .whitespaces)
        if s.isEmpty { return nil }
        if s.count == 10, let d = localDay.date(from: s) { return (d, true) }
        if s.count == 8, !s.contains("-"), let d = local("yyyyMMdd").date(from: s) { return (d, true) }
        if let d = isoTZ.date(from: s) { return (d, false) }
        if let d = isoTZFrac.date(from: s) { return (d, false) }
        let cut: String = String(s.prefix(19))
        if let d = localSec.date(from: cut) { return (d, false) }
        if let d = localMin.date(from: String(s.prefix(16))) { return (d, false) }
        if let d = localSpace.date(from: String(s.prefix(16))) { return (d, false) }
        return nil
    }

    /* ---------- Lesing ---------- */

    private static func str(_ o: [String: Any], _ k: String) -> String {
        if let s = o[k] as? String { return s }
        if let n = o[k] as? NSNumber { return n.stringValue }
        return ""
    }

    private static func bool(_ o: [String: Any], _ k: String) -> Bool? {
        if let b = o[k] as? Bool { return b }
        if let n = o[k] as? NSNumber { return n.intValue != 0 }
        if let s = o[k] as? String { return s == "true" || s == "1" }
        return nil
    }

    static func normType(_ raw: String, title: String, subject: String, allDay: Bool) -> String {
        let t: String = raw.lowercased()
        switch t {
        case "time", "lesson", "timeplan": return "time"
        case "prove", "prøve", "test", "exam": return "prove"
        case "innl", "innlevering", "frist", "deadline": return "innl"
        case "bursdag", "bd", "birthday": return "bursdag"
        case "fri", "planleggingsdag", "holiday": return "fri"
        case "skole", "fam", "school", "google", "familie": return "skole"
        default: break
        }
        let l: String = title.lowercased()
        if l.contains("innlevering") || l.contains("frist") { return "innl" }
        if l.contains("prøve") || l.contains("heldag") || l.contains("muntlig") { return "prove" }
        if allDay && (l.contains("planleggingsdag") || l.hasPrefix("fri") || l.contains(" fri")) { return "fri" }
        if l.contains("bursdag") { return "bursdag" }
        if !subject.isEmpty && !allDay { return "time" }
        return allDay ? "skole" : (subjects[title] != nil ? "time" : "skole")
    }

    static func item(_ o: [String: Any]) -> CalEvent26? {
        let title: String = str(o, "title").isEmpty ? str(o, "summary") : str(o, "title")
        guard !title.isEmpty else { return nil }
        let sRaw: Any? = o["start"] ?? o["startsAt"] ?? o["dtstart"]
        let eRaw: Any? = o["end"] ?? o["endsAt"] ?? o["dtend"]
        let sp: (Date, Bool)? = parseDate(sRaw)
        let ep: (Date, Bool)? = parseDate(eRaw)
        guard let first = sp ?? ep else { return nil }
        let start: Date = first.0
        var allDay: Bool = bool(o, "allDay") ?? bool(o, "all_day") ?? first.1
        var end: Date = ep?.0 ?? start.addingTimeInterval(allDay ? 86_400 : 2_700)
        if end < start { end = start }
        let subject: String = str(o, "subject")
        let type: String = normType(str(o, "type"), title: title, subject: subject, allDay: allDay)
        // Innlevering uten start: fristen er slutten.
        if type == "innl" && sp == nil { allDay = false }
        var short: String = str(o, "short")
        if short.isEmpty { short = subjects[subject]?.0 ?? subjects[title]?.0 ?? title }
        var teacher: String = str(o, "teacher")
        if teacher.isEmpty && type == "time" { teacher = subjects[subject]?.2 ?? "" }
        let roomRaw: String = str(o, "room").isEmpty ? str(o, "location") : str(o, "room")
        // Prompt 31: URL-er (mazemap-lenker fra timeplanen) fjernes fra stedsteksten, så korte visninger aldri blir for brede.
        // Lenken beholdes i mazemap og vises som «Åpne kart ↗» i detaljarket.
        let roomSplit: (String, String) = Cal26.splitUrl31(roomRaw)
        let room: String = roomSplit.0
        let note: String = str(o, "note").isEmpty ? str(o, "description") : str(o, "note")
        var id: String = str(o, "id")
        if id.isEmpty { id = key(start) + "|" + hm(minutes(start)) + "|" + title }
        let sMin: Int = allDay ? -1 : (type == "innl" && sp == nil ? -1 : minutes(start))
        var eMin: Int = allDay ? -1 : minutes(end)
        if !allDay && eMin == 0 && end > start { eMin = 24 * 60 - 1 }
        var ev = CalEvent26(id: id, title: title, short: short, subject: subject, room: room, teacher: teacher, note: note,
                            start: start, end: end, allDay: allDay, type: type, color: str(o, "color"), source: str(o, "source"),
                            url: str(o, "url"), mazemap: str(o, "mazemap").isEmpty ? roomSplit.1 : str(o, "mazemap"), dayKey: key(type == "innl" && sp == nil ? end : start),
                            startMin: sMin, endMin: eMin)
        ev.calendar = str(o, "calendar")
        ev.roomFull = roomRaw
        ev.editable = bool(o, "editable") ?? false
        ev.googleId = str(o, "googleId")
        if let rr = o["recurrence"] as? [Any] {
            ev.recurrence = rr.compactMap { $0 as? String }.joined(separator: ";")
        } else {
            ev.recurrence = str(o, "recurrence")
        }
        return ev
    }

    /// Finner alle hendelser i svaret: {events:[…]} eller (widget-svaret) objekter med title og start/end hvor som helst.
    private static func collect(_ any: Any?, _ out: inout [[String: Any]], depth: Int) {
        if depth > 5 { return }
        if let list = any as? [Any] {
            for x in list { collect(x, &out, depth: depth + 1) }
            return
        }
        guard let o = any as? [String: Any] else { return }
        let hasTitle: Bool = o["title"] != nil || o["summary"] != nil
        let hasTime: Bool = o["start"] != nil || o["end"] != nil
        if hasTitle && hasTime { out.append(o); return }
        for (_, v) in o { collect(v, &out, depth: depth + 1) }
    }

    /// Hendelser (uten duplikater) og fagfarger fra serveren.
    static func parse(_ data: Data) -> (events: [CalEvent26], subjects: [String: String]) {
        let any: Any? = try? JSONSerialization.jsonObject(with: data)
        var raw: [[String: Any]] = []
        if let o = any as? [String: Any], let list = o["events"] as? [Any] {
            raw = list.compactMap { $0 as? [String: Any] }
        } else {
            collect(any, &raw, depth: 0)
        }
        var seen: Set<String> = []
        var out: [CalEvent26] = []
        for r in raw {
            guard let e = item(r) else { continue }
            if seen.contains(e.id) { continue }
            seen.insert(e.id)
            out.append(e)
        }
        var subj: [String: String] = [:]
        if let o = any as? [String: Any], let s = o["subjects"] as? [String: Any] {
            for (k, v) in s { if let c = v as? String { subj[k] = c } }
        }
        out.sort { a, b in a.start < b.start }
        return (out, subj)
    }

    /// Kompakt buffer til widgetene (App Group): samme form som /api/kalender.
    static func compact(_ events: [CalEvent26], from: Date, days: Int) -> Data? {
        let a: String = key(add(startOfDay(from), -1))
        let b: String = key(add(startOfDay(from), days))
        let list: [[String: Any]] = events.filter { $0.dayKey >= a && $0.dayKey <= b }.prefix(400).map { $0.json }
        return try? JSONSerialization.data(withJSONObject: ["events": list])
    }

    /* ---------- Regler per dag ---------- */

    /// Hendelsene en dag: fridager fjerner timene, prøver erstatter timer de overlapper, filtrerte grupper skjules.
    static func on(_ all: [CalEvent26], _ dayKey: String, hidden: Set<String> = []) -> [CalEvent26] {
        var list: [CalEvent26] = all.filter { e in
            if e.dayKey == dayKey { return true }
            // Heldagshendelser over flere dager.
            if e.allDay && e.dayKey < dayKey { return key(e.end.addingTimeInterval(-1)) >= dayKey }
            return false
        }
        if list.contains(where: { $0.type == "fri" && $0.allDay }) {
            list.removeAll { $0.type == "time" }
        }
        let tests: [CalEvent26] = list.filter { $0.type == "prove" && $0.startMin >= 0 }
        for t in tests {
            list.removeAll { l in l.type == "time" && !(l.endMin <= t.startMin || l.startMin >= t.endMin) }
        }
        if !hidden.isEmpty { list.removeAll { hidden.contains($0.group) } }
        list.sort { a, b in a.startMin != b.startMin ? a.startMin < b.startMin : a.title < b.title }
        return list
    }

    /// Kommende prøver og frister, sortert etter dato og klokkeslett.
    static func exams(_ all: [CalEvent26], now: Date) -> [CalEvent26] {
        let today: String = key(now)
        return all.filter { $0.isTest && $0.dayKey >= today }
            .sorted { a, b in a.dayKey != b.dayKey ? a.dayKey < b.dayKey : a.startMin < b.startMin }
    }

    static func examRow(_ e: CalEvent26, now: Date) -> CalWExam26 {
        let dd: Int = daysUntil(e.dayKey, from: now)
        let d: Date = day(e.dayKey)
        let when: String = e.type == "innl" ? "frist " + e.endText : (e.startMin >= 0 ? e.startText + "–" + e.endText : "hele dagen")
        let sub: String = [cap(weekdays[jsDay(d)]), when, e.room].filter { !$0.isEmpty }.joined(separator: " · ")
        return CalWExam26(id: e.id, title: e.title, inText: inText(dd), red: dd <= 7, day: cal.component(.day, from: d),
                          month: monthsShort[cal.component(.month, from: d) - 1].uppercased(), sub: sub)
    }

    /* ---------- Widgets og Hjem-kortet ---------- */

    static func widget(_ all: [CalEvent26], now: Date, colors: [String: String] = [:]) -> CalWidgetState26 {
        let nm: Int = minutes(now)
        var wd: Date = now
        var wl: [CalEvent26] = on(all, key(now)).filter { $0.isLesson }
        var isT: Bool = true
        if !wl.contains(where: { $0.endMin > nm }) {
            isT = false
            for i in 1..<15 {
                let d: Date = add(now, i)
                let l: [CalEvent26] = on(all, key(d)).filter { $0.isLesson }
                if !l.isEmpty { wd = d; wl = l; break }
            }
            if wd == now { wl = [] }
        }
        var cur: CalEvent26? = nil
        if isT { cur = wl.first(where: { nm >= $0.startMin && nm < $0.endMin }) }
        var nx: CalEvent26? = cur
        if nx == nil { nx = isT ? wl.first(where: { $0.startMin > nm }) : wl.first }
        if nx == nil { nx = wl.first }
        var ix: Int = 0
        if let n = nx, let found = wl.firstIndex(where: { $0.id == n.id }) { ix = found }
        let dS: String = cap(weekdays[jsDay(wd)])
        var w = CalWidgetState26()
        w.isToday = isT
        if let n = nx {
            w.kicker = cur != nil ? "NÅ" : isT ? "NESTE TIME" : dS.uppercased()
            w.big = cur != nil ? n.endText : n.startText
            w.title = n.title
            w.sub = n.roomTeacher
            w.hex = n.hex(colors)
            w.eventId = n.id
            if let c = cur { w.when = dur(c.endMin - nm) + " igjen" } else if isT { w.when = "om " + dur(n.startMin - nm) } else { w.when = "første time" }
        }
        let m: Int = cal.component(.month, from: wd) - 1
        let dn: Int = cal.component(.day, from: wd)
        w.dayShort = (isT ? "I dag · " : "") + dS + " \(dn). " + monthsShort[m]
        w.dayLong = (isT ? "I dag · " : "") + dS + " \(dn). " + monthsLong[m]
        w.count = wl.count == 1 ? "1 time" : "\(wl.count) timer"
        let lo: Int = Swift.min(wl.count, ix + 1)
        let hi: Int = Swift.min(wl.count, ix + 4)
        var n3: [CalEvent26] = Array(wl[lo..<hi])
        if n3.isEmpty { n3 = Array(wl.prefix(3)) }
        w.next3 = n3.map { e in CalWItem26(id: e.id, time: e.startText, title: e.short, sub: e.room, hex: e.hex(colors), dim: false) }
        w.all = wl.prefix(5).map { e in
            CalWItem26(id: e.id, time: e.startText + "–" + e.endText, title: e.title, sub: e.roomTeacher, hex: e.hex(colors), dim: isT && e.endMin <= nm)
        }
        w.exams = exams(all, now: now).prefix(2).map { examRow($0, now: now) }
        return w
    }

    /// Tidspunktene widgeten skal tegnes på nytt: start og slutt av hver time i dag og neste skoledag, og midnatt.
    static func refreshDates(_ all: [CalEvent26], now: Date) -> [Date] {
        var out: [Date] = []
        let today: Date = startOfDay(now)
        for i in 0..<3 {
            let d: Date = add(today, i)
            for e in on(all, key(d)).filter({ $0.isLesson }) {
                let s: Date = d.addingTimeInterval(TimeInterval(e.startMin * 60))
                let en: Date = d.addingTimeInterval(TimeInterval(e.endMin * 60))
                out.append(s)
                out.append(en)
                // «34 min igjen» og «om 20 min» telles ned hvert kvarter innimellom.
                var t: Date = s.addingTimeInterval(900)
                while t < en { out.append(t); t = t.addingTimeInterval(900) }
            }
            out.append(add(today, i + 1).addingTimeInterval(30))
        }
        let limit: Date = now.addingTimeInterval(36 * 3600)
        let sorted: [Date] = Array(Set(out)).filter { $0 > now && $0 < limit }.sorted()
        return Array(sorted.prefix(60))
    }

    /* ---------- Demodata (serveren mangler /api/kalender, og forhåndsvisning) ---------- */

    private static let timetable: [Int: [[String]]] = [
        1: [["08:15", "09:45", "Matematikk R2", "A-112", ""], ["10:00", "11:30", "Fysikk 2", "B-204", "Lab B"], ["12:15", "13:45", "Norsk", "A-305", ""], ["14:00", "15:00", "Spansk", "C-210", ""]],
        2: [["08:15", "09:45", "Engelsk", "C-301", ""], ["10:00", "11:30", "Kjemi 2", "B-110", ""], ["12:15", "13:45", "Historie", "A-208", ""]],
        3: [["08:15", "09:45", "Fysikk 2", "B-204", ""], ["10:00", "11:30", "Matematikk R2", "A-112", ""], ["12:15", "13:00", "Studietid", "Biblioteket", ""], ["13:15", "14:45", "Kroppsøving", "Hall 2", "Ta med innesko"]],
        4: [["08:15", "09:45", "Norsk", "A-305", ""], ["10:00", "11:30", "Engelsk", "C-301", ""], ["12:15", "13:45", "Kjemi 2", "B-110", ""], ["14:00", "15:00", "Spansk", "C-210", ""]],
        5: [["08:15", "09:45", "Matematikk R2", "A-112", ""], ["10:00", "11:30", "Historie", "A-208", ""], ["12:15", "13:45", "Fysikk 2", "B-204", "Lab B"]],
    ]

    /// dato, start, slutt, tittel, rom, type, merknad, fag
    private static let special: [[String]] = [
        ["2026-10-22", "10:00", "11:30", "Prøve i engelsk", "C-301", "prove", "Kap. 3–5 · ordbok tillatt", "Engelsk"],
        ["2026-10-28", "", "23:59", "Innlevering historie", "Canvas", "innl", "Essay om den kalde krigen, 1500 ord", "Historie"],
        ["2026-11-06", "08:15", "14:00", "Heldagsprøve R2", "Gymsalen", "prove", "Kalkulator og formelark", "Matematikk R2"],
        ["2026-11-12", "12:15", "13:45", "Muntlig norsk", "A-305", "prove", "Fremføring, 10 min", "Norsk"],
        ["2026-11-04", "", "23:59", "Labrapport fysikk", "Canvas", "innl", "Rapport fra forsøk 4", "Fysikk 2"],
        ["2026-10-22", "18:00", "19:30", "Foreldremøte", "Aula", "skole", "Vg3, alle klasser", ""],
        ["2026-10-30", "", "", "Planleggingsdag", "", "fri", "Ingen undervisning", ""],
    ]

    private static let birthdays: [(String, Int, Int)] = [("Ingrid", 11, 2), ("Pål", 10, 24), ("Kari", 10, 29), ("Emma", 10, 21), ("Rune", 11, 17), ("Jonas", 12, 5)]

    private static func at(_ d: Date, _ t: String) -> Date {
        let p: [Int] = t.split(separator: ":").compactMap { Int($0) }
        let m: Int = (p.first ?? 0) * 60 + (p.count > 1 ? p[1] : 0)
        return startOfDay(d).addingTimeInterval(TimeInterval(m * 60))
    }

    private static func ev(_ id: String, _ title: String, _ subj: String, _ room: String, _ note: String, _ s: Date, _ e: Date,
                           allDay: Bool, type: String, sMin: Int, eMin: Int) -> CalEvent26 {
        let sj: (String, String, String)? = subjects[subj]
        return CalEvent26(id: id, title: title, short: type == "time" ? (sj?.0 ?? title) : title, subject: subj, room: room,
                          teacher: sj?.2 ?? "", note: note, start: s, end: e, allDay: allDay, type: type, color: "",
                          source: type == "bursdag" ? "birthdays" : "ical", url: "", mazemap: "", dayKey: key(s), startMin: sMin, endMin: eMin)
    }

    /// Timeplan for videregående (Vg3) med testtilfellene fra claude-code-kalender.md.
    static func demo(around now: Date) -> [CalEvent26] {
        var out: [CalEvent26] = []
        let today: Date = startOfDay(now)
        for i in -42..<120 {
            let d: Date = add(today, i)
            let wd: Int = jsDay(d)
            let k: String = key(d)
            for r in timetable[wd] ?? [] {
                let s: Date = at(d, r[0])
                let e: Date = at(d, r[1])
                out.append(ev(k + "|" + r[0] + "|" + r[2], r[2], r[2], r[3], r[4], s, e, allDay: false, type: "time",
                              sMin: minutes(s), eMin: minutes(e)))
            }
            let md: (Int, Int) = (cal.component(.month, from: d), cal.component(.day, from: d))
            for b in birthdays where b.1 == md.0 && b.2 == md.1 {
                out.append(ev(k + "|bd|" + b.0, b.0 + " har bursdag", "", "", "", startOfDay(d), add(startOfDay(d), 1),
                              allDay: true, type: "bursdag", sMin: -1, eMin: -1))
            }
        }
        for x in special {
            let d: Date = day(x[0])
            let allDay: Bool = x[1].isEmpty && x[2].isEmpty
            let s: Date = allDay ? startOfDay(d) : at(d, x[1].isEmpty ? x[2] : x[1])
            let e: Date = allDay ? add(startOfDay(d), 1) : at(d, x[2])
            let sMin: Int = x[1].isEmpty ? -1 : minutes(s)
            out.append(ev(x[0] + "|" + (x[1].isEmpty ? "all" : x[1]) + "|" + x[3], x[3], x[7], x[4], x[6], s, e,
                          allDay: allDay, type: x[5], sMin: allDay ? -1 : sMin, eMin: allDay ? -1 : minutes(e)))
        }
        out.sort { a, b in a.start < b.start }
        return out
    }
}

/* ---------- Prompt 31: URL-er i stedsteksten ---------- */

extension Cal26 {
    /// («Pilestredet park 35 U2005», «https://link.mazemap.com/…») fra «Pilestredet park 35 U2005 https://link.mazemap.com/…».
    static func splitUrl31(_ raw: String) -> (String, String) {
        if !raw.contains("http") { return (raw, "") }
        var keep: [String] = []
        var url: String = ""
        for w in raw.split(separator: " ", omittingEmptySubsequences: true) {
            let s: String = String(w)
            if s.hasPrefix("http://") || s.hasPrefix("https://") {
                if url.isEmpty { url = s }
            } else {
                keep.append(s)
            }
        }
        let text: String = keep.joined(separator: " ").trimmingCharacters(in: CharacterSet(charactersIn: " ,·-–\n\t"))
        return (text, url)
    }
}
