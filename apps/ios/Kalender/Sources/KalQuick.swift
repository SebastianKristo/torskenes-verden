import Foundation

/* ---------------- Prompt 33: Kalender – lokal tolking av «frisør 14.30 25.10» (parse() / QP i fasiten) ---------------- */
// Virker uten nett. Klokkeslett 14.30, 14:30, kl 9, 14.30–15.15 · dato 25.10, 25.10.27, 25. okt, i dag/i morgen/overmorgen/i kveld,
// fredag, neste fredag · varighet «i 2 timer»/«i 45 min» · varsel «varsle 30 min før»/«påminn meg 1 dag før» · kalender gjettes fra ord.
// «14.30 25.09»: tall med minutter > 12 eller kolon = tid, dag > 23 = dato. To tvetydige tall gir først tid, så dato.
// Uten dato: i dag, eller i morgen hvis tiden har passert. Uten tid: heldagshendelse.

struct KalParsed: Equatable {
    var title: String
    var cal: String
    var day: String
    var s: Int?
    var e: Int?
    var rem: Int?
    var src: String
    var allDay: Bool { s == nil }
}

/// En treff fra NSRegularExpression: grupper (nil når gruppen ikke var med) og hele treffet.
struct KalRxMatch {
    let whole: String
    let groups: [String?]

    func g(_ i: Int) -> String? { i < groups.count ? groups[i] : nil }
}

enum KalRx {
    static func first(_ pattern: String, _ s: String) -> KalRxMatch? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let ns: NSString = s as NSString
        guard let m = re.firstMatch(in: s, options: [], range: NSRange(location: 0, length: ns.length)) else { return nil }
        return make(m, ns)
    }

    static func all(_ pattern: String, _ s: String) -> [KalRxMatch] {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        let ns: NSString = s as NSString
        let list: [NSTextCheckingResult] = re.matches(in: s, options: [], range: NSRange(location: 0, length: ns.length))
        return list.map { (m: NSTextCheckingResult) -> KalRxMatch in make(m, ns) }
    }

    private static func make(_ m: NSTextCheckingResult, _ ns: NSString) -> KalRxMatch {
        var groups: [String?] = []
        for i in 0..<m.numberOfRanges {
            let r: NSRange = m.range(at: i)
            groups.append(r.location == NSNotFound ? nil : ns.substring(with: r))
        }
        return KalRxMatch(whole: ns.substring(with: m.range), groups: groups)
    }

    static func test(_ pattern: String, _ s: String) -> Bool { first(pattern, s) != nil }

    static func replace(_ pattern: String, _ s: String, with: String) -> String {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return s }
        let ns: NSString = s as NSString
        return re.stringByReplacingMatches(in: s, options: [], range: NSRange(location: 0, length: ns.length), withTemplate: with)
    }

    /// Erstatter første forekomst av en ren tekst.
    static func cut(_ s: String, _ part: String) -> String {
        guard let r = s.range(of: part) else { return s }
        return s.replacingCharacters(in: r, with: " ")
    }
}

enum KalQuick {
    static let monthKeys: [String] = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]

    /// Spørsmål til Glimt (slutter på «?» eller starter med hva/når/hvem/hvor/finn/oppsummer/har jeg …).
    static func isQuestion(_ t: String) -> Bool {
        let s: String = t.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if s.hasSuffix("?") { return true }
        // Prompt 35: også engelsk («what's on tomorrow»).
        return KalRx.test("^(hva|når|hvem|hvor|hvordan|hvilke|hvilken|har jeg|er jeg|finn|oppsummer|kan jeg|skal jeg|blir det|what|when|whats|do i|is there)\\b", s)
    }

    static func makeDate(_ y: Int, _ m: Int, _ d: Int) -> Date? {
        var c: DateComponents = DateComponents()
        c.year = y
        c.month = m
        c.day = d
        guard let date = KalD.cal.date(from: c) else { return nil }
        // Ugyldige datoer (31.02) avvises.
        if KalD.dayOfMonth(date) != d { return nil }
        return date
    }

    /// Prompt 44: standard varighet fra Innstillinger (rød + / Glimt uten slutt-tid). Settes av appen.
    nonisolated(unsafe) static var defDur44: Int = 60
    /// Prompt 44: kjente typer gir varighet («frisør» 45 min).
    static let typeDur44: [(String, Int)] = [("frisør", 45), ("legetime", 30), ("lege", 30), ("fysio", 45), ("tannlege", 60), ("massasje", 60)]

    static func parse(_ txt: String, defaultRem: Int?, now: Date = Date()) -> KalParsed {
        let T: Date = KalD.cal.startOfDay(for: now)
        let nowMin: Int = KalD.minutes(now)
        // Prompt 44: 1600, kl1600, 16h, 16-17 og «frisør 16» skrives om til 16:00 før tolkingen.
        let txt44: String = KalTime44.normalize(txt)
        // Prompt 35: tegnsetting rundt dag-ord («i morgen?», «i morgen,») skal ikke hindre treff.
        let cleaned: String = txt44.replacingOccurrences(of: "[?!;«»\"“”]|,(?![0-9])", with: " ", options: .regularExpression)
        let lowered: String = cleaned.lowercased().replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        var s: String = " " + lowered + " "
        var date: Date? = nil
        var time: Int? = nil
        var end: Int? = nil
        var rem: Int? = nil
        var remSet: Bool = false
        var dur: Int? = nil

        // 25. okt (2027)
        if let m = KalRx.first("(\\d{1,2})\\.?\\s+(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)[a-zæøå]*\\.?(\\s+\\d{4})?", s) {
            let mo: Int = (monthKeys.firstIndex(of: m.g(2) ?? "") ?? 0) + 1
            let dd: Int = Int(m.g(1) ?? "1") ?? 1
            let yTxt: String = (m.g(3) ?? "").trimmingCharacters(in: .whitespaces)
            let y: Int = Int(yTxt) ?? KalD.year(T)
            if var d = makeDate(y, mo, dd) {
                if yTxt.isEmpty && d < T, let d2 = makeDate(y + 1, mo, dd) { d = d2 }
                date = d
            }
            s = KalRx.cut(s, m.whole)
        }
        // varsle 30 min før / påminn meg 1 dag før
        if let m = KalRx.first("(?:påminn(?:else)?|varsle?|varsel)\\s*(?:meg\\s*)?(\\d+)\\s*(min|minutter|t|time|timer|dag|dager|døgn)\\s*før", s) {
            // Maks 30 dager: «varsle 99999999999999 dager før» skal ikke gi heltallsoverflyt (krasj).
            let n: Int = Swift.min(Int(m.g(1) ?? "0") ?? 0, 43_200)
            let unit: String = m.g(2) ?? "min"
            rem = unit.hasPrefix("d") ? n * 1440 : unit.hasPrefix("t") ? n * 60 : n
            remSet = true
            s = KalRx.cut(s, m.whole)
        }
        // i 2 timer / i 45 min
        if let m = KalRx.first("\\bi\\s+(\\d+(?:[.,]5)?)\\s*(t|timer|time|min|minutter)\\b", s) {
            // Int(Double) krasjer for tall utenfor Int-området: maks 24 timer.
            let n: Double = Swift.min(Double((m.g(1) ?? "1").replacingOccurrences(of: ",", with: ".")) ?? 1, 1440)
            dur = (m.g(2) ?? "t").hasPrefix("m") ? Int(n) : Int(n * 60)
            s = KalRx.cut(s, m.whole)
        }
        // 14.30–15.15
        if let m = KalRx.first("\\b(\\d{1,2})[.:](\\d{2})\\s*[-–]\\s*(\\d{1,2})[.:](\\d{2})\\b", s) {
            let a: Int = (Int(m.g(1) ?? "0") ?? 0) * 60 + (Int(m.g(2) ?? "0") ?? 0)
            let b: Int = (Int(m.g(3) ?? "0") ?? 0) * 60 + (Int(m.g(4) ?? "0") ?? 0)
            time = a
            end = b
            s = KalRx.cut(s, m.whole)
        }
        // kl 9 / klokka 14.30
        if time == nil, let m = KalRx.first("\\b(?:kl\\.?|klokka|klokken)\\s*(\\d{1,2})(?:[.:](\\d{2}))?\\b", s) {
            time = (Int(m.g(1) ?? "0") ?? 0) * 60 + (Int(m.g(2) ?? "0") ?? 0)
            s = KalRx.cut(s, m.whole)
        }
        // Tall som 14.30 og 25.10(.27)
        let tokens: [KalRxMatch] = KalRx.all("\\b(\\d{1,2})[.:/](\\d{1,2})(?:[./](\\d{2,4}))?\\b", s)
        var classes: [String] = []
        for t in tokens {
            let a: Int = Int(t.g(1) ?? "0") ?? 0
            let b: Int = Int(t.g(2) ?? "0") ?? 0
            if t.g(3) != nil { classes.append("d") }
            else if t.whole.contains(":") { classes.append("t") }
            else if a > 23 { classes.append("d") }
            else if b > 12 { classes.append("t") }
            else { classes.append("") }
        }
        func applyDate(_ t: KalRxMatch) {
            let a: Int = Int(t.g(1) ?? "0") ?? 0
            let b: Int = Int(t.g(2) ?? "0") ?? 0
            if date != nil || b < 1 || b > 12 { return }
            var y: Int = KalD.year(T)
            let yRaw: String = t.g(3) ?? ""
            if let yy = Int(yRaw) { y = yy < 100 ? 2000 + yy : yy }
            guard var d = makeDate(y, b, a) else { return }
            if yRaw.isEmpty && d < T, let d2 = makeDate(y + 1, b, a) { d = d2 }
            date = d
            s = KalRx.cut(s, t.whole)
        }
        func applyTime(_ t: KalRxMatch) {
            if time != nil { return }
            let a: Int = Int(t.g(1) ?? "0") ?? 0
            let b: Int = Int(t.g(2) ?? "0") ?? 0
            if a > 23 || b > 59 { return }
            time = a * 60 + b
            s = KalRx.cut(s, t.whole)
        }
        for i in 0..<tokens.count {
            if classes[i] == "d" { applyDate(tokens[i]) }
            if classes[i] == "t" { applyTime(tokens[i]) }
        }
        for i in 0..<tokens.count where classes[i].isEmpty {
            if time == nil { applyTime(tokens[i]) } else { applyDate(tokens[i]) }
        }
        // i dag / i morgen / overmorgen / i kveld
        let words: [(String, Int)] = [("i overmorgen", 2), ("overimorgen", 2), ("overmorgen", 2), ("i morgen", 1), ("imorgen", 1), ("i morra", 1),
                                      ("imorra", 1), ("tomorrow", 1), ("i dag", 0), ("idag", 0), ("i kveld", 0), ("today", 0)]
        for (w, n) in words where date == nil && s.contains(" " + w + " ") {
            date = KalD.add(T, n)
            s = KalRx.cut(s, " " + w + " ")
            if w == "i kveld" && time == nil { time = 19 * 60 }
        }
        // (neste) fredag
        if date == nil, let m = KalRx.first("\\b(neste\\s+)?(?:på\\s+)?(søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag)\\b", s) {
            let w: Int = KalD.weekdays.firstIndex(of: m.g(2) ?? "") ?? 0
            var df: Int = (w - KalD.wd(T) + 7) % 7
            if df == 0 { df = 7 }
            if m.g(1) != nil && df < 7 { df += 7 }
            date = KalD.add(T, df)
            s = KalRx.cut(s, m.whole)
        }
        let cal: String = KalCals.guess(lowered)
        // Prompt 44: tittelen er det som er igjen, med store bokstaver fra teksten («Frisør Nina»).
        let title: String = KalTime44.restore(cleanTitle(s), txt)
        let finalDate: Date
        if let date { finalDate = date } else if let time, time <= nowMin { finalDate = KalD.add(T, 1) } else { finalDate = T }
        if dur == nil, let hit = typeDur44.first(where: { (x: (String, Int)) -> Bool in lowered.contains(x.0) }) { dur = hit.1 }
        if let time, end == nil { end = time + (dur ?? defDur44) }
        if !remSet { rem = time == nil ? nil : defaultRem }
        if let tt = time, let ee = end, ee <= tt { end = Swift.min(1439, tt + 60) }
        return KalParsed(title: title, cal: cal, day: KalD.key(finalDate), s: time, e: time == nil ? nil : Swift.min(1439, end ?? 0), rem: rem,
                         src: txt.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// Fjerner «legg til», «time hos» og løse småord.
    static func cleanTitle(_ raw: String) -> String {
        var t: String = raw
        t = KalRx.replace("^\\s*(legg\\s+(til|inn)|lag|ny|opprett|sett\\s+opp|book|booke)\\s+", t, with: " ")
        t = KalRx.replace("^\\s*(en\\s+|et\\s+)?(time|avtale|hendelse)\\s+(hos|på|til|med)\\s+", t, with: " ")
        t = KalRx.replace("^\\s*(en\\s+|et\\s+)?(time|avtale|hendelse)\\s+", t, with: " ")
        for _ in 0..<3 {
            t = KalRx.replace("\\s(den|kl\\.?|klokka|fra|på|i|til|og)\\s*$", t, with: " ")
            t = KalRx.replace("^\\s*(den|kl\\.?|på)\\s", t, with: " ")
        }
        t = KalRx.replace("[,.:;]+\\s*$", t, with: "")
        t = KalRx.replace("\\s+", t, with: " ").trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? "Ny hendelse" : KalD.cap(t)
    }
}
