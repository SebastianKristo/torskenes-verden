import Foundation

/* ---------------- Q26: skolefeltene fra Homelabs gamle kalender – nå i den delte Kalender-koden ---------------- */
// Den gamle kalenderen i Homelab-appen viste lærer, fag og type på skoletimene, «Prøver og frister» med nedtelling, Nå-kortet
// (NÅ / NESTE TIME / NESTE SKOLEDAG) og en MazeMap-lenke til rommet. Alt kommer fra serveren (GET /api/kalender):
//   teacher, subject, type ('time' | 'prove' | 'innl' | 'bursdag' | 'skole' | 'fri'), mazemap?, recurrence?, daysLeft? (prøver).
// Her ligger bare utvalg og tekst for visningen. Kalender (iPhone/iPad), Homelab (KAL_EMBED) og Mac bruker samme kode.

/// Nå-kortet i Oversikt: NÅ (time, rom, lærer, min igjen, fremdrift), ellers NESTE TIME eller NESTE SKOLEDAG, og neste prøve.
struct KalNowState: Equatable {
    var kicker: String = "FRI"
    var when: String = ""
    var title: String = "Ingen timer"
    var sub: String = ""
    var progress: Double? = nil
    var next: String = ""
    var eventId: String? = nil
    var cal: String = ""
}

enum KalSchool {
    /// GJENTA i Ny hendelse (samme verdier som POST /api/kalender/events {repeat}).
    static let repeats: [(String, String)] = [("none", "Ingen"), ("daily", "Hver dag"), ("weekly", "Hver uke"), ("monthly", "Hver måned")]

    /// Leser skolefeltene når serveren sender dem.
    static func decorate(_ ev: inout KalEvent, _ o: [String: Any]) {
        let te: String = KalParse.str(o, "teacher").trimmingCharacters(in: .whitespacesAndNewlines)
        if !te.isEmpty { ev.teacher = te }
        let su: String = KalParse.str(o, "subject").trimmingCharacters(in: .whitespacesAndNewlines)
        if !su.isEmpty { ev.subject = su }
        let ty: String = KalParse.str(o, "type")
        if !ty.isEmpty { ev.serverType = ty }
        let mz: String = KalParse.str(o, "mazemap")
        if mz.hasPrefix("https://") { ev.mazemap = mz }
        let rr: String = repeatOf(KalParse.str(o, "recurrence") + " " + KalParse.str(o, "repeat"))
        if rr != "none" { ev.repeatRule = rr }
        if let d = KalParse.int(o, "daysLeft") { ev.daysLeft = d }
    }

    /// «RRULE:FREQ=WEEKLY», «weekly» … → daily | weekly | monthly | none.
    static func repeatOf(_ raw: String) -> String {
        let r: String = raw.uppercased()
        if r.contains("DAILY") { return "daily" }
        if r.contains("WEEKLY") { return "weekly" }
        if r.contains("MONTHLY") { return "monthly" }
        return "none"
    }

    static func repeatName(_ r: String?) -> String {
        guard let r else { return "" }
        for x in repeats where x.0 == r && r != "none" { return x.1 }
        return ""
    }

    /* ---------- Hva slags hendelse ---------- */

    /// Prøve eller innlevering (serverens type), ellers fristene appen kjenner igjen selv (kind «frist»).
    static func isTest(_ e: KalEvent) -> Bool {
        if let t = e.serverType { return t == "prove" || t == "innl" }
        return e.kind == "frist"
    }

    static func isDeadline(_ e: KalEvent) -> Bool {
        if let t = e.serverType { return t == "innl" }
        return e.title.lowercased().hasPrefix("frist")
    }

    /// Skoletime (eller prøve med klokkeslett) i timeplanen.
    static func isLesson(_ e: KalEvent) -> Bool {
        guard let t = e.serverType, !e.allDay else { return false }
        return t == "time" || t == "prove"
    }

    /// «Prøve», «Innlevering» eller tom (ved kalendernavnet i detaljarket).
    static func typeName(_ e: KalEvent) -> String {
        switch e.serverType ?? "" {
        case "prove": return "Prøve"
        case "innl": return "Innlevering"
        default: return ""
        }
    }

    /* ---------- Prøver og frister ---------- */

    /// Dager til prøven eller fristen: serverens daysLeft (regnet i Oslo-tid, sendes for prove/innl). Appen regner ikke selv;
    /// mangler feltet, vises ingen nedtelling.
    static func daysLeft(_ e: KalEvent) -> Int? {
        e.daysLeft
    }

    /// «I dag», «I morgen», «12 dager».
    static func inText(_ n: Int) -> String {
        if n <= 0 { return "I dag" }
        if n == 1 { return "I morgen" }
        return String(n) + " dager"
    }

    /// Rød nedtelling den siste uka.
    static func urgent(_ n: Int) -> Bool { n <= 7 }

    /// Kommende prøver og frister, sortert etter dato og klokkeslett (uten FORTS.-kopier og dubletter).
    static func tests(_ all: [KalEvent], today: String) -> [KalEvent] {
        var seen: Set<String> = []
        var out: [KalEvent] = []
        for e in all where !e.cont && e.day >= today && isTest(e) {
            if seen.contains(e.id) { continue }
            seen.insert(e.id)
            out.append(e)
        }
        out.sort { (a: KalEvent, b: KalEvent) -> Bool in
            if a.day != b.day { return a.day < b.day }
            return a.startMin < b.startMin
        }
        return out
    }

    /// «Tirsdag · 08:30–10:00 · A-204» under tittelen i kortet.
    static func testLine(_ e: KalEvent) -> String {
        let d: Date = KalD.date(e.day)
        var when: String = "hele dagen"
        if !e.allDay { when = isDeadline(e) ? "frist " + KalD.hm(e.endMin) : KalD.hm(e.startMin) + "–" + KalD.hm(e.endMin) }
        let parts: [String] = [KalD.cap(KalD.weekdays[KalD.wd(d)]), when, e.loc]
        return parts.filter { (x: String) -> Bool in !x.isEmpty }.joined(separator: " · ")
    }

    /* ---------- Nå-kortet ---------- */

    static func dur(_ x: Int) -> String {
        if x < 60 { return String(x) + " min" }
        let m: Int = x % 60
        return String(x / 60) + " t" + (m > 0 ? " " + String(m) + " min" : "")
    }

    private static func lessons(_ byDay: [String: [KalEvent]], _ key: String) -> [KalEvent] {
        let list: [KalEvent] = (byDay[key] ?? []).filter { (e: KalEvent) -> Bool in isLesson(e) && !e.cont }
        return list.sorted { (a: KalEvent, b: KalEvent) -> Bool in a.startMin < b.startMin }
    }

    private static func roomTeacher(_ e: KalEvent) -> String {
        [e.loc, e.teacher ?? ""].filter { (x: String) -> Bool in !x.isEmpty }.joined(separator: " · ")
    }

    static func nowState(_ byDay: [String: [KalEvent]], today: String, nowMin: Int, tests: [KalEvent]) -> KalNowState {
        let tl: [KalEvent] = lessons(byDay, today)
        let cur: KalEvent? = tl.first { (e: KalEvent) -> Bool in nowMin >= e.startMin && nowMin < e.endMin }
        let nx: KalEvent? = tl.first { (e: KalEvent) -> Bool in e.startMin > nowMin }
        var s: KalNowState = KalNowState()
        if let c = cur {
            s.kicker = "NÅ"
            s.when = KalD.hm(c.startMin) + "–" + KalD.hm(c.endMin)
            s.title = c.title
            s.sub = [roomTeacher(c), String(c.endMin - nowMin) + " min igjen"].filter { (x: String) -> Bool in !x.isEmpty }.joined(separator: " · ")
            let len: Double = Double(Swift.max(1, c.endMin - c.startMin))
            s.progress = Swift.min(1, Swift.max(0, Double(nowMin - c.startMin) / len))
            s.eventId = c.id
            s.cal = c.cal
            if let n = nx {
                s.next = "Deretter: " + n.title + " " + KalD.hm(n.startMin) + (n.loc.isEmpty ? "" : " · " + n.loc)
            } else {
                s.next = "Siste time i dag"
            }
        } else if let n = nx {
            s.kicker = "NESTE TIME"
            s.when = "om " + dur(n.startMin - nowMin)
            s.title = n.title
            s.sub = KalD.hm(n.startMin) + "–" + KalD.hm(n.endMin) + (n.loc.isEmpty ? "" : " · " + n.loc)
            s.eventId = n.id
            s.cal = n.cal
        } else {
            for i in 1..<15 {
                let k: String = KalD.addKey(today, i)
                guard let f = lessons(byDay, k).first else { continue }
                s.kicker = "NESTE SKOLEDAG"
                s.when = KalD.fd(KalD.date(k))
                s.title = f.title
                s.sub = KalD.hm(f.startMin) + "–" + KalD.hm(f.endMin) + (f.loc.isEmpty ? "" : " · " + f.loc) + " · første time"
                s.eventId = f.id
                s.cal = f.cal
                break
            }
        }
        if let x = tests.first {
            var w: String = ""
            if let n = daysLeft(x) { w = " " + (n <= 0 ? "i dag" : n == 1 ? "i morgen" : "om " + String(n) + " dager") }
            s.next = (s.next.isEmpty ? "" : s.next + " · ") + x.title + w
        }
        return s
    }

    /* ---------- Rommet på kart ---------- */

    /// Serverens MazeMap-lenke, ellers MazeMap når rommet ser ut som et skolerom («A-204», Aula, Gym …).
    static func mapURL(_ e: KalEvent) -> URL? {
        if let m = e.mazemap { return URL(string: m) }
        if e.serverType == nil || e.loc.isEmpty { return nil }
        var hit: Bool = e.loc.range(of: "^[A-C]-", options: .regularExpression) != nil
        for w in ["Aula", "Hall", "Gym", "Bibl"] where e.loc.contains(w) { hit = true }
        return hit ? URL(string: "https://use.mazemap.com/") : nil
    }
}
