import Foundation

/* ---------------- Prompt 44: Glimt-søk (Hjem) – «time 12.5 16:30 kino dune.» ----------------
 Fasit: prompts/prompt-44-pakke/claude-code-glimt-time-dato-tid-tittel.md (QAP.QP i Mobil Papir App.dc.html) og
 claude-code-kalender-glimt-klokkeslett.md. Lokal tolking FØR serveren/Ollama: dato og tid finnes først, og tittelen er
 resten (uansett hvor i teksten den står), ikke «teksten før første tall». Serveren får den lokale tolkningen som hint;
 Ollama skal bare rette tittel/sted, aldri dato og tid.

 Tester (skal passere):
   «time 12.5 16:30 kino dune.»          → Kino dune · 12. mai · 16:30–17:30
   «time hos frisør Nina 24.10 kl 14»    → Frisør Nina · 24. okt · 14:00–14:45
   «tannlege fredag 0930»                → Tannlege · fredag · 09:30–10:30
   «kino 1630 i morgen»                  → Kino · i morgen · 16:30–17:30 */

enum Time44 {
    /// Innledningsord som fjernes fra tittelen.
    static let intro: Set<String> = ["time", "timen", "avtale", "avtalen", "book", "booke", "ny", "nytt", "legg", "til", "sett", "opp", "påminnelse"]
    static let months: [String: Int] = [
        "jan": 1, "januar": 1, "feb": 2, "februar": 2, "mar": 3, "mars": 3, "apr": 4, "april": 4, "mai": 5, "jun": 6, "juni": 6,
        "jul": 7, "juli": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "okt": 10, "oktober": 10,
        "nov": 11, "november": 11, "des": 12, "desember": 12,
    ]
    /// Ukedag → Calendar-weekday (søndag = 1).
    static let weekdays: [String: Int] = [
        // Bare hele navn: «man», «tor» og «fre» er også vanlige ord og navn.
        "søndag": 1, "mandag": 2, "tirsdag": 3, "onsdag": 4, "torsdag": 5, "fredag": 6, "lørdag": 7,
    ]
    /// Kjente typer gir varighet i minutter (ellers 60).
    static let durations: [(String, Int)] = [("frisør", 45), ("barber", 30), ("tannlege", 60), ("lege", 30), ("fastlege", 30),
                                                         ("fysio", 45), ("massasje", 60), ("kino", 60), ("møte", 60)]

    struct Parsed: Equatable {
        var title: String = ""
        var day: Date? = nil
        var start: String = ""
        var end: String = ""
        var hasIntro: Bool = false
    }

    /// Ordene i teksten (tegn i start/slutt fjernet, men punktum/kolon inni beholdes: «12.5», «16:30»).
    static func words(_ s: String) -> [String] {
        s.split(whereSeparator: { $0 == " " || $0 == "\n" || $0 == "\t" }).map { (w: Substring) -> String in
            String(w).trimmingCharacters(in: CharacterSet(charactersIn: ",;!?()«»\"'–-"))
        }.filter { !$0.isEmpty }
    }

    static func stripDot(_ w: String) -> String {
        var x: String = w
        while x.hasSuffix(".") || x.hasSuffix(":") { x.removeLast() }
        return x
    }

    /// «16:30», «16.30» (minutter > 12 eller 00), «1630», «0930», «16h». nil = ikke et klokkeslett.
    static func clock(_ w0: String, afterKl: Bool) -> (Int, Int)? {
        let w: String = stripDot(w0.lowercased())
        if w.hasSuffix("h"), let h = Int(w.dropLast()), (0...23).contains(h) { return (h, 0) }
        for sep in [":", "."] where w.contains(sep) {
            let parts: [String] = w.components(separatedBy: sep)
            guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]), parts[1].count == 2 else { continue }
            guard (0...23).contains(h), (0...59).contains(m) else { continue }
            if sep == ":" || afterKl || m > 12 || m == 0 { return (h, m) }
        }
        if w.count == 4, let n = Int(w), !w.hasPrefix("19"), !w.hasPrefix("20") || afterKl {
            let h: Int = n / 100
            let m: Int = n % 100
            if (0...23).contains(h) && (0...59).contains(m) { return (h, m) }
        }
        if afterKl, let h = Int(w), (0...23).contains(h) { return (h, 0) }
        return nil
    }

    /// «12.5», «12.05», «12/5», «24.10», «12.5.2027». nil = ikke en dato.
    static func dmy(_ w0: String) -> (Int, Int, Int?)? {
        let w: String = stripDot(w0)
        let sep: String = w.contains("/") ? "/" : "."
        let parts: [String] = w.components(separatedBy: sep)
        guard parts.count == 2 || parts.count == 3, let d = Int(parts[0]), let m = Int(parts[1]) else { return nil }
        guard (1...31).contains(d), (1...12).contains(m) else { return nil }
        var y: Int? = nil
        if parts.count == 3, let yy = Int(parts[2]) { y = yy < 100 ? 2000 + yy : yy }
        return (d, m, y)
    }

    static func makeDay(_ d: Int, _ m: Int, _ y: Int?, now: Date) -> Date? {
        let cal: Calendar = Calendar.current
        let today: Date = cal.startOfDay(for: now)
        var c: DateComponents = DateComponents()
        c.day = d
        c.month = m
        c.year = y ?? cal.component(.year, from: now)
        guard var out = cal.date(from: c) else { return nil }
        // Dato uten år som har vært: neste år.
        if y == nil && out < today, let n = cal.date(byAdding: .year, value: 1, to: out) { out = n }
        return out
    }

    static func nextWeekday(_ wd: Int, now: Date) -> Date {
        let cal: Calendar = Calendar.current
        let today: Date = cal.startOfDay(for: now)
        let cur: Int = cal.component(.weekday, from: today)
        let add: Int = (wd - cur + 7) % 7
        return cal.date(byAdding: .day, value: add, to: today) ?? today
    }

    /// Hovedtolkningen. nil når verken dato eller klokkeslett finnes.
    static func parse(_ text: String, now: Date = Date()) -> Parsed? {
        let ws: [String] = words(text)
        if ws.isEmpty { return nil }
        let cal: Calendar = Calendar.current
        var used: Set<Int> = []
        var day: Date? = nil
        var hm: (Int, Int)? = nil
        var i: Int = 0
        while i < ws.count {
            let w: String = ws[i].lowercased()
            let bare: String = stripDot(w)
            if bare == "kl" || bare == "klokka" || bare == "klokken" {
                used.insert(i)
                if i + 1 < ws.count, hm == nil, let c = clock(ws[i + 1], afterKl: true) {
                    hm = c
                    used.insert(i + 1)
                    i += 2
                    continue
                }
            } else if bare == "i", i + 1 < ws.count, day == nil {
                let n: String = stripDot(ws[i + 1].lowercased())
                if n == "dag" || n == "morgen" || n == "overmorgen" {
                    day = cal.date(byAdding: .day, value: n == "dag" ? 0 : (n == "morgen" ? 1 : 2), to: cal.startOfDay(for: now))
                    used.insert(i)
                    used.insert(i + 1)
                    i += 2
                    continue
                }
            } else if bare == "neste", i + 1 < ws.count, day == nil, stripDot(ws[i + 1].lowercased()) == "uke" {
                day = cal.date(byAdding: .day, value: 7, to: cal.startOfDay(for: now))
                used.insert(i)
                used.insert(i + 1)
                i += 2
                continue
            } else if bare == "imorgen" && day == nil {
                day = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: now))
                used.insert(i)
            } else if let wd = weekdays[bare], day == nil {
                day = nextWeekday(wd, now: now)
                used.insert(i)
            } else if day == nil, let d = Int(bare), (1...31).contains(d), i + 1 < ws.count, let m = months[stripDot(ws[i + 1].lowercased())] {
                // «12. mai», «24 oktober»
                day = makeDay(d, m, nil, now: now)
                used.insert(i)
                used.insert(i + 1)
                i += 2
                continue
            } else if hm == nil, let c = clock(w, afterKl: false) {
                hm = c
                used.insert(i)
            } else if day == nil, let x = dmy(w) {
                day = makeDay(x.0, x.1, x.2, now: now)
                used.insert(i)
            }
            i += 1
        }
        // Bare «16» (uten kl) når det finnes en dato og ellers ingen tid.
        if hm == nil && day != nil {
            for (j, w) in ws.enumerated() where !used.contains(j) {
                if let h = Int(stripDot(w)), (6...23).contains(h) {
                    hm = (h, 0)
                    used.insert(j)
                    break
                }
            }
        }
        if day == nil && hm == nil { return nil }
        var r: Parsed = Parsed()
        var rest: [String] = []
        var hasIntro: Bool = false
        for (j, w) in ws.enumerated() where !used.contains(j) {
            let l: String = stripDot(w.lowercased())
            if rest.isEmpty && intro.contains(l) { hasIntro = true; continue }
            if rest.isEmpty && l == "hos" && hasIntro { continue }
            rest.append(w)
        }
        r.hasIntro = hasIntro
        r.title = cleanTitle(rest.joined(separator: " "))
        if day == nil, let h = hm {
            // Bare klokkeslett: i dag, eller i morgen hvis det har vært.
            let today: Date = cal.startOfDay(for: now)
            let at: Date = cal.date(bySettingHour: h.0, minute: h.1, second: 0, of: today) ?? today
            day = at < now ? cal.date(byAdding: .day, value: 1, to: today) : today
        }
        r.day = day
        if let h = hm {
            r.start = String(format: "%02d:%02d", h.0, h.1)
            let mins: Int = duration(r.title)
            let e: Int = (h.0 * 60 + h.1 + mins) % (24 * 60)
            r.end = String(format: "%02d:%02d", e / 60, e % 60)
        }
        return r
    }

    static func duration(_ title: String) -> Int {
        let l: String = title.lowercased()
        for (k, v) in durations where l.contains(k) { return v }
        return 60
    }

    /// Fjern tegn i start og slutt (. , ; : –) og gi stor forbokstav.
    static func cleanTitle(_ s: String) -> String {
        let t: String = s.trimmingCharacters(in: CharacterSet(charactersIn: " .,;:–-").union(.whitespacesAndNewlines))
        guard let f = t.first else { return "" }
        return String(f).uppercased() + t.dropFirst()
    }

    /// Som forhåndsvisningen fra serveren (Quick29Preview). Avtale = innledningsord, eller dato + klokkeslett + tittel.
    static func preview(_ text: String, now: Date = Date()) -> Quick29Preview? {
        guard let r = parse(text, now: now), let d = r.day else { return nil }
        var v: Quick29Preview = Quick29Preview()
        v.ok = true
        v.title = r.title.isEmpty ? "Avtale" : r.title
        v.date = Time44.dayKey(d)
        v.start = r.start
        v.end = r.end
        v.isAppointment = r.hasIntro || (!r.start.isEmpty && !r.title.isEmpty)
        v.why = "lokal"
        return v
    }

    static func dayKey(_ d: Date) -> String {
        let c: DateComponents = Calendar.current.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Serverens forhåndsvisning med lokal fasit: dato og tid fra den lokale tolkningen når de finnes, og tittelen når serveren
    /// ga tom tittel eller «Avtale» (feilen fra prompt 44). nil inn → den lokale.
    static func merge(_ server: Quick29Preview?, _ text: String) -> Quick29Preview? {
        let local: Quick29Preview? = preview(text)
        guard var s = server, s.ok else { return local }
        guard let l = local else { return s }
        let weak: Bool = s.title.isEmpty || s.title.lowercased() == "avtale" || s.title.lowercased() == "time"
        if weak { s.title = l.title }
        if !l.start.isEmpty { s.start = l.start; s.end = l.end }
        if !l.date.isEmpty { s.date = l.date }
        if l.isAppointment { s.isAppointment = true }
        return s
    }
}
