import Foundation

/* ---------------- Prompt 44: Glimt forstår klokkeslett uten «kl.» (Kalender, iPhone/iPad/Mac) ---------------- */
// Spesifikasjon: claude-code-kalender-glimt-klokkeslett.md og claude-code-glimt-time-dato-tid-tittel.md. Fasit: parse(txt).
// Kjøres lokalt FØR KalQuick.parse (og før teksten sendes til Ollama): skriver om tidsformene til «16:00» som tolkeren kjenner.
//   1600 · 0930 · kl1600 → 16:00 / 09:30      16h · 16t → 16:00      16-17 → 16:00-17:00      16-17:30 → 16:00-17:30
//   frittstående 6–23 («frisør 16») → kl 16 når det ikke finnes annen tid      «25. okt 2026»: året røres ikke.
// Tittelen beholder store bokstaver fra teksten («time hos frisør Nina» → «Frisør Nina»).

enum KalTime44 {
    private static let months: String = "jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des"

    static func normalize(_ raw: String) -> String {
        var s: String = " " + raw + " "
        // kl1600 / kl. 1600 / klokka 0930
        s = rx("\\b(kl\\.?|klokka|klokken)\\s*([01]\\d|2[0-3])([0-5]\\d)\\b", s, "kl $2:$3")
        // 16-17:30 og 16-17 (begge 0–23, slutt etter start, ikke en del av en dato)
        s = interval(s)
        // 1600 / 0930 (ikke år etter et månedsnavn, ikke del av 25.10.2026)
        s = fourDigits(s)
        // 16h / 16t (ikke «i 2 t», som er varighet)
        s = suffixHour(s)
        // «frisør 16»: frittstående 6–23 når det ikke finnes annen tid
        if !hasTime(s) { s = bareHour(s) }
        return s.trimmingCharacters(in: .whitespaces)
    }

    /// Finnes det allerede et klokkeslett (16:00, kl 16, 14.30 med minutter > 12)?
    static func hasTime(_ s: String) -> Bool {
        if test("\\b\\d{1,2}:\\d{2}\\b", s) { return true }
        if test("\\b(kl\\.?|klokka|klokken)\\s*\\d", s) { return true }
        for m in matches("\\b(\\d{1,2})\\.(\\d{2})\\b", s) {
            let b: Int = Int(m.g(2)) ?? 0
            if b > 12 && b < 60 { return true }
        }
        return false
    }

    private static func interval(_ s0: String) -> String {
        var s: String = s0
        for m in matches("(^|[^\\d.:/])(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})(?:[.:](\\d{2}))?(?![\\d.:/])", s).reversed() {
            let a: Int = Int(m.g(2)) ?? 99
            let b: Int = Int(m.g(3)) ?? 99
            let mm: String = m.g(4)
            if a > 23 || b > 23 || b <= a { continue }
            let rep: String = m.g(1) + pad(a) + ":00-" + pad(b) + ":" + (mm.isEmpty ? "00" : mm)
            s = replaceRange(s, m.range, rep)
        }
        return s
    }

    private static func fourDigits(_ s0: String) -> String {
        var s: String = s0
        for m in matches("(^|[^\\d.:/,])([01]\\d|2[0-3])([0-5]\\d)(?![\\d.:/])", s).reversed() {
            let before: String = prefix(s, m.range.location)
            // «25. okt 2026», «oktober 2026»: året.
            if test("(" + months + ")[a-zæøå]*\\.?\\s*$", before) { continue }
            let rep: String = m.g(1) + m.g(2) + ":" + m.g(3)
            s = replaceRange(s, m.range, rep)
        }
        return s
    }

    private static func suffixHour(_ s0: String) -> String {
        var s: String = s0
        for m in matches("(^|[^\\d.:/])(\\d{1,2})\\s?(h|t)(?![a-zæøå\\d])", s).reversed() {
            let a: Int = Int(m.g(2)) ?? 99
            if a > 23 { continue }
            let before: String = prefix(s, m.range.location + (m.g(1) as NSString).length)
            if test("\\bi\\s*$", before) { continue }
            s = replaceRange(s, m.range, m.g(1) + pad(a) + ":00")
        }
        return s
    }

    private static func bareHour(_ s0: String) -> String {
        for m in matches("(^|\\s)(\\d{1,2})(?=[\\s,.!?]*$|\\s)", s0) {
            let a: Int = Int(m.g(2)) ?? 0
            if a < 6 || a > 23 { continue }
            let loc: Int = m.range.location + (m.g(1) as NSString).length
            let before: String = prefix(s0, loc)
            let after: String = (s0 as NSString).substring(from: loc + (m.g(2) as NSString).length)
            // «den 16», «i 2 timer», «varsle 30 min før», «16. okt», «16 okt» er ikke klokkeslett.
            if test("\\b(den|i|om|varsle|varsel|påminn|nr|uke|rom)\\s*$", before) { continue }
            if test("^\\s*\\.?\\s*(" + months + "|min|minutter|timer|time|dag|dager|uke|uker|år|kr|%)", after) { continue }
            if test("^[.:/]\\d", after) { continue }
            return replaceRange(s0, NSRange(location: loc, length: (m.g(2) as NSString).length), "kl " + String(a))
        }
        return s0
    }

    /* ---------- Tittel med store bokstaver fra teksten ---------- */

    /// «frisør nina» + «time hos frisør Nina 24.10 kl 14» → «Frisør Nina».
    static func restore(_ title: String, _ original: String) -> String {
        if title == "Ny hendelse" || title.isEmpty { return title }
        let orig: [String] = original.split(whereSeparator: { (c: Character) -> Bool in c == " " || c == "\n" }).map { (x: Substring) -> String in String(x) }
        var used: Set<Int> = []
        var out: [String] = []
        for w in title.split(separator: " ") {
            let lw: String = w.lowercased()
            var hit: String = String(w)
            for (i, o) in orig.enumerated() where !used.contains(i) {
                let core: String = o.trimmingCharacters(in: CharacterSet(charactersIn: ".,;:–-!?«»\"()"))
                if core.lowercased() == lw {
                    hit = core
                    used.insert(i)
                    break
                }
            }
            out.append(hit)
        }
        let t: String = out.joined(separator: " ")
        guard let f = t.first else { return title }
        return String(f).uppercased() + t.dropFirst()
    }

    /* ---------- Hjelpere ---------- */

    struct M {
        let range: NSRange
        let groups: [String]
        func g(_ i: Int) -> String { i < groups.count ? groups[i] : "" }
    }

    static func matches(_ pattern: String, _ s: String) -> [M] {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        let ns: NSString = s as NSString
        return re.matches(in: s, options: [], range: NSRange(location: 0, length: ns.length)).map { (r: NSTextCheckingResult) -> M in
            var g: [String] = []
            for i in 0..<r.numberOfRanges {
                let x: NSRange = r.range(at: i)
                g.append(x.location == NSNotFound ? "" : ns.substring(with: x))
            }
            return M(range: r.range, groups: g)
        }
    }

    static func test(_ pattern: String, _ s: String) -> Bool { !matches(pattern, s).isEmpty }

    private static func rx(_ pattern: String, _ s: String, _ tpl: String) -> String {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return s }
        let ns: NSString = s as NSString
        return re.stringByReplacingMatches(in: s, options: [], range: NSRange(location: 0, length: ns.length), withTemplate: tpl)
    }

    private static func replaceRange(_ s: String, _ r: NSRange, _ with: String) -> String {
        (s as NSString).replacingCharacters(in: r, with: with)
    }

    private static func prefix(_ s: String, _ n: Int) -> String {
        (s as NSString).substring(to: Swift.max(0, Swift.min(n, (s as NSString).length)))
    }

    private static func pad(_ n: Int) -> String { n < 10 ? "0" + String(n) : String(n) }
}
