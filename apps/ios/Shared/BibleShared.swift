import Foundation
import WidgetKit

/* ---------------- Prompt 37: Dagens bibelvers – delt mellom appen og widgetene ---------------- */
// prompts/prompt-37-pakke/claude-code-bibelvers.md. Bibelen 1930-oversettelsen (fri bruk). Serveren (SERVER37) har
// GET /api/bible/today?period=morning|evening → {enabled, ref, text, period, date, context:{before[], after[]}, translation}
// og velger ett vers per dag og periode (deterministisk). Modulen er personlig: standard bare for brukeren «sebastian».
// Appen skriver dagens morgen- og kveldsvers og om modulen er på i App Group (w.bible37), og widgetene leser derfra.
// Uten server (404) brukes en liten lokal liste med 1930-vers, bare for «sebastian».

struct Verse37: Hashable {
    var ref: String
    var text: String
    /// morning | evening
    var period: String
    /// «2026-10-19»
    var date: String = ""
    var before: [String] = []
    var after: [String] = []

    var isMorning: Bool { period != "evening" }

    /// «vers» – ref (til Kopier og Del).
    var copyText: String { "«" + text + "» – " + ref }
}

enum Bible37 {
    static let cacheKey: String = "w.bible37"
    static let widgetKind: String = "no.kristo.finanshub.bible37"

    static let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.locale = Locale(identifier: "nb_NO")
        c.timeZone = TimeZone(identifier: "Europe/Oslo") ?? .current
        return c
    }()

    static let wd: [String] = ["søn", "man", "tir", "ons", "tor", "fre", "lør"]
    static let ms: [String] = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]

    /// Morgen 05–15, ellers kveld (som prototypen).
    static func period(_ d: Date = Date()) -> String {
        let h: Int = cal.component(.hour, from: d)
        return (h >= 5 && h < 15) ? "morning" : "evening"
    }

    static func iso(_ d: Date = Date()) -> String {
        let c: DateComponents = cal.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 2026, c.month ?? 1, c.day ?? 1)
    }

    /// «søn 19. okt»
    static func dateShort(_ d: Date = Date()) -> String {
        let w: Int = (cal.component(.weekday, from: d) + 6) % 7
        let m: Int = cal.component(.month, from: d)
        return wd[w] + " \(cal.component(.day, from: d)). " + ms[m - 1]
    }

    /// Neste tidspunkt widgetene skal tegnes på nytt: kl. 05:00 eller 17:00 (og 15:00 når morgen blir kveld).
    static func nextReload(_ now: Date = Date()) -> Date {
        let start: Date = cal.startOfDay(for: now)
        let hours: [Int] = [5, 15, 17, 29]
        for h in hours {
            let t: Date = start.addingTimeInterval(TimeInterval(h * 3600) + 30)
            if t > now { return t }
        }
        return now.addingTimeInterval(3600)
    }

    /* ---------- Lokal reserve (Bibelen 1930) ---------- */

    static let morningLocal: [(String, String)] = [
        ("Klag 3,22–23", "Herrens miskunn er det at det ikke er ute med oss; for hans barmhjertighet har ennu ikke tatt ende; den er ny hver morgen, din trofasthet er stor."),
        ("Sal 118,24", "Dette er den dag som Herren har gjort; la oss fryde og glede oss på den!"),
        ("Fil 4,13", "Alt formår jeg i ham som gjør mig sterk."),
        ("Jes 41,10", "Frykt ikke, for jeg er med dig, se dig ikke engstelig om, for jeg er din Gud; jeg styrker dig, jeg hjelper dig også, jeg holder dig oppe med min rettferdighets høire hånd."),
        ("Sal 23,1", "Herren er min hyrde, mig fattes intet."),
        ("Jes 40,31", "Men de som venter på Herren, får ny kraft, de løfter vingene som ørner; de løper og blir ikke trette, de går og blir ikke mødige."),
        ("Sal 46,2", "Gud er vår tilflukt og styrke, en hjelp i nød, funnet overmåte stor."),
        ("Ordsp 3,5–6", "Sett din lit til Herren av hele ditt hjerte, og stol ikke på din forstand! Kjenn ham på alle dine veier, så skal han gjøre dine stier rette."),
        ("Sal 5,4", "Herre! Om morgenen skal du høre min røst, om morgenen vil jeg legge min sak frem for dig og vente."),
        ("Rom 8,28", "Men vi vet at alle ting samvirker til gode for dem som elsker Gud, dem som efter hans råd er kalt."),
        ("Jos 1,9", "Vær frimodig og sterk! Reddes ikke og forferdes ikke! For Herren din Gud er med dig overalt hvor du går."),
        ("Sal 143,8", "La mig om morgenen høre din miskunnhet, for til dig setter jeg min lit!"),
        ("2 Kor 12,9", "Min nåde er dig nok; for min kraft fullkommes i skrøpelighet."),
        ("Matt 6,34", "Vær derfor ikke bekymret for dagen imorgen! Dagen imorgen skal bekymre sig for sig selv. Hver dag har nok med sin plage."),
    ]

    static let eveningLocal: [(String, String)] = [
        ("Sal 4,9", "I fred vil jeg både legge mig ned og sove; for du, Herre, du alene lar mig bo i tryghet."),
        ("Matt 11,28", "Kom til mig, alle I som strever og har tungt å bære, og jeg vil gi eder hvile!"),
        ("1 Pet 5,7", "Kast all eders sorg på ham! for han har omsorg for eder."),
        ("Joh 14,27", "Fred efterlater jeg eder, min fred gir jeg eder; ikke som verden gir, gir jeg eder. Eders hjerte forferdes ikke og reddes ikke!"),
        ("Sal 121,4", "Se, han som vokter Israel, slumrer ikke og sover ikke."),
        ("Fil 4,7", "Og Guds fred, som overgår all forstand, skal bevare eders hjerter og eders tanker i Kristus Jesus."),
        ("Sal 62,2", "Bare til Gud er min sjel stille; fra ham kommer min frelse."),
        ("Jes 26,3", "Den som har et fast sinn, bevarer du i fred, i fred; for han setter sin lit til dig."),
        ("Sal 3,6", "Jeg la mig ned og sov; jeg våknet, for Herren holder mig oppe."),
        ("2 Tess 3,16", "Men fredens Herre selv gi eder freden alltid og på alle måter! Herren være med eder alle!"),
        ("Sal 16,8", "Jeg setter alltid Herren for mitt åsyn; for han er ved min høire hånd, jeg skal ikke rokkes."),
        ("Rom 15,13", "Men håpets Gud fylle eder med all glede og fred i eders tro, så I kan være rike på håp ved den Hellige Ånds kraft!"),
        ("4 Mos 6,24–26", "Herren velsigne dig og bevare dig! Herren la sitt åsyn lyse over dig og være dig nådig! Herren løfte sitt åsyn på dig og gi dig fred!"),
    ]

    /// Ett vers per dag og periode (dagnummer % antall), `offset` dager fram.
    static func local(_ period: String, _ d: Date = Date(), offset: Int = 0) -> Verse37 {
        let list: [(String, String)] = period == "evening" ? eveningLocal : morningLocal
        let day: Int = (cal.ordinality(of: .day, in: .year, for: d) ?? 1) + offset
        let i: Int = ((day % list.count) + list.count) % list.count
        let v: (String, String) = list[i]
        return Verse37(ref: v.0, text: v.1, period: period, date: iso(d))
    }

    /* ---------- Serversvar ---------- */

    /// {enabled, ref, text, period, date, context:{before[], after[]}} (også {verse:{…}}).
    static func parse(_ d: Data) -> (enabled: Bool?, verse: Verse37?) {
        guard let any = try? JSONSerialization.jsonObject(with: d), let raw = any as? [String: Any] else { return (nil, nil) }
        let o: [String: Any] = (raw["verse"] as? [String: Any]) ?? raw
        let enabled: Bool? = (raw["enabled"] as? Bool) ?? (o["enabled"] as? Bool)
        let ref: String = (o["ref"] as? String) ?? ""
        let text: String = (o["text"] as? String) ?? (o["t"] as? String) ?? ""
        if ref.isEmpty || text.isEmpty { return (enabled, nil) }
        var per: String = (o["period"] as? String) ?? period()
        if per == "morgen" || per == "m" { per = "morning" }
        if per == "kveld" || per == "k" { per = "evening" }
        var v = Verse37(ref: ref, text: text, period: per, date: (o["date"] as? String) ?? iso())
        if let c = (o["context"] as? [String: Any]) ?? (raw["context"] as? [String: Any]) {
            v.before = strings(c["before"])
            v.after = strings(c["after"])
        }
        return (enabled, v)
    }

    private static func strings(_ any: Any?) -> [String] {
        guard let l = any as? [Any] else { return [] }
        var out: [String] = []
        for x in l {
            if let s = x as? String { out.append(s) }
            else if let o = x as? [String: Any], let t = o["text"] as? String {
                let r: String = (o["ref"] as? String) ?? ""
                out.append(r.isEmpty ? t : r + " " + t)
            }
        }
        return out
    }

    /* ---------- App Group ---------- */

    /// Appen skriver om modulen er på og dagens vers (begge perioder), og ber widgetene tegne på nytt.
    static func push(enabled: Bool, morning: Verse37?, evening: Verse37?, streak: Int) {
        var o: [String: Any] = ["on": enabled, "date": iso(), "streak": streak]
        if let m = morning { o["m"] = ["ref": m.ref, "text": m.text] }
        if let e = evening { o["e"] = ["ref": e.ref, "text": e.text] }
        if let d = try? JSONSerialization.data(withJSONObject: o) { WidgetShared.defaults.set(d, forKey: cacheKey) }
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }

    struct Cached {
        var enabled: Bool = false
        var date: String = ""
        var morning: Verse37? = nil
        var evening: Verse37? = nil
        var streak: Int = 0
    }

    static var cached: Cached {
        var c = Cached()
        guard let d = WidgetShared.defaults.data(forKey: cacheKey),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return c }
        c.enabled = (o["on"] as? Bool) ?? false
        c.date = (o["date"] as? String) ?? ""
        c.streak = (o["streak"] as? Int) ?? 0
        if let m = o["m"] as? [String: Any], let r = m["ref"] as? String, let t = m["text"] as? String {
            c.morning = Verse37(ref: r, text: t, period: "morning", date: c.date)
        }
        if let e = o["e"] as? [String: Any], let r = e["ref"] as? String, let t = e["text"] as? String {
            c.evening = Verse37(ref: r, text: t, period: "evening", date: c.date)
        }
        return c
    }

    /// Verset widgeten viser nå: dagens fra bufferet, ellers lokalt (samme dag og periode).
    static func current(_ now: Date = Date()) -> Verse37 {
        let c: Cached = cached
        let per: String = period(now)
        if c.date == iso(now) {
            if per == "morning", let m = c.morning { return m }
            if per == "evening", let e = c.evening { return e }
        }
        return local(per, now)
    }
}
