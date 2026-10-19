import Foundation
import SwiftUI

/* ---------------- Prompt 33: Kalender-appen – felles modeller (appen + KalenderWidgets) ---------------- */
// Fasit: design/Kalender App.dc.html (CALS, THM, WXP, seed, renderVals). Datoer er lokale «YYYY-MM-DD», tider minutter etter midnatt.

/// Én hendelse slik Kalender-appen viser den.
struct KalEvent: Identifiable, Hashable, Codable {
    var id: String
    var title: String
    /// Kalenderen i appen (id fra /api/kalender/calendars, eller p/j/s/f/h/b lokalt).
    var cal: String
    /// Første dag «YYYY-MM-DD».
    var day: String
    /// Start/slutt i minutter. nil = hele dagen.
    var s: Int?
    var e: Int?
    /// Antall dager for heldagshendelser over flere dager.
    var days: Int = 1
    var loc: String = ""
    /// Varsel i minutter før start. nil = ingen.
    var rem: Int?
    /// «frist», «bursdag» eller tom.
    var kind: String = ""
    /// Teksten Glimt fikk («Lagt til av Glimt …»).
    var src: String = ""
    var editable: Bool = false
    /// Kalender-id-en på serveren (privat, familie, timeplan …).
    var serverCal: String = ""
    var note: String = ""
    /// Lagt til lokalt og ikke lagret på serveren ennå.
    var pending: Bool = false
    /// Kopi for dag 2, 3 … av en hendelse over flere dager («FORTS.»).
    var cont: Bool = false

    var allDay: Bool { s == nil }
    var startMin: Int { s ?? 0 }
    var endMin: Int { e ?? ((s ?? 0) + 60) }
}

/// En kalender i sidemenyen.
struct KalCal: Identifiable, Hashable, Codable {
    var id: String
    var name: String
    var hex: String
    /// Lysere tekstfarge i mørkt tema.
    var lightHex: String
    /// Mørkere tekstfarge i lyst tema.
    var textHex: String
    var on: Bool = true
    var count: Int = 0
    var writable: Bool = true
    var local: Bool = false
    /// Prompt 35: skjult fra menyen (Rediger → Skjul fra menyen). nil = serveren sender ikke feltet.
    var hidMenu: Bool? = nil
    /// Prompt 35: builtin | own | ical | ha | google | caldav
    var source: String? = nil
    /// Prompt 35: merket ved navnet («Abonnement», «HA» …).
    var badge: String? = nil
    /// Prompt 35: innebygd kalender (kan ikke fjernes).
    var builtin: Bool? = nil
}

/// Vær for én dag.
struct KalWxDay: Hashable, Codable {
    var day: String
    /// sol, delvis, sky, regn, sno, torden
    var kind: String
    var hi: Int
    var lo: Int
}

/// Det appen skriver til App Group og widgetene leser.
struct KalSnapshot: Codable {
    var events: [KalEvent] = []
    var cals: [KalCal] = []
    var wx: [KalWxDay] = []
    var updated: Double = 0
}

enum KalD {
    static let cal: Calendar = {
        var c: Calendar = Calendar(identifier: .gregorian)
        c.locale = Locale(identifier: "nb_NO")
        c.timeZone = TimeZone.current
        c.firstWeekday = 2
        c.minimumDaysInFirstWeek = 4
        return c
    }()

    static let months: [String] = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"]
    static let monthsShort: [String] = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]
    /// Søndag først (som JS getDay()).
    static let weekdays: [String] = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"]
    static let weekdaysShort: [String] = ["søn", "man", "tir", "ons", "tor", "fre", "lør"]
    /// Mandag først.
    static let letters: [String] = ["M", "T", "O", "T", "F", "L", "S"]

    static func pad(_ n: Int) -> String { n < 10 ? "0" + String(n) : String(n) }

    static func key(_ d: Date) -> String {
        let c: DateComponents = cal.dateComponents([.year, .month, .day], from: d)
        return String(c.year ?? 2026) + "-" + pad(c.month ?? 1) + "-" + pad(c.day ?? 1)
    }

    static func date(_ key: String) -> Date {
        let p: [Substring] = key.prefix(10).split(separator: "-")
        var c: DateComponents = DateComponents()
        if p.count == 3 {
            c.year = Int(p[0])
            c.month = Int(p[1])
            c.day = Int(p[2])
        }
        c.hour = 0
        return cal.date(from: c) ?? Date()
    }

    static func valid(_ key: String) -> Bool {
        let p: [Substring] = key.split(separator: "-")
        return key.count == 10 && p.count == 3 && Int(p[0]) != nil && Int(p[1]) != nil && Int(p[2]) != nil
    }

    static func today() -> Date { cal.startOfDay(for: Date()) }
    static func todayKey() -> String { key(Date()) }

    static func add(_ d: Date, _ n: Int) -> Date { cal.date(byAdding: .day, value: n, to: d) ?? d }
    static func addKey(_ k: String, _ n: Int) -> String { key(add(date(k), n)) }
    static func addMonths(_ d: Date, _ n: Int) -> Date { cal.date(byAdding: .month, value: n, to: d) ?? d }

    /// 0 = søndag … 6 = lørdag.
    static func wd(_ d: Date) -> Int { cal.component(.weekday, from: d) - 1 }
    /// 0 = mandag … 6 = søndag.
    static func wdMon(_ d: Date) -> Int { (wd(d) + 6) % 7 }

    static func monday(_ d: Date) -> Date { add(cal.startOfDay(for: d), -wdMon(d)) }

    static func isoWeek(_ d: Date) -> Int { Calendar(identifier: .iso8601).component(.weekOfYear, from: d) }

    static func year(_ d: Date) -> Int { cal.component(.year, from: d) }
    static func month(_ d: Date) -> Int { cal.component(.month, from: d) }
    static func dayOfMonth(_ d: Date) -> Int { cal.component(.day, from: d) }

    static func firstOfMonth(_ d: Date) -> Date {
        let c: DateComponents = cal.dateComponents([.year, .month], from: d)
        return cal.date(from: c) ?? d
    }

    static func daysInMonth(_ d: Date) -> Int { cal.range(of: .day, in: .month, for: d)?.count ?? 30 }

    static func daysBetween(_ a: String, _ b: String) -> Int {
        let x: Date = date(a)
        let y: Date = date(b)
        return cal.dateComponents([.day], from: x, to: y).day ?? 0
    }

    static func minutesNow() -> Int {
        let c: DateComponents = cal.dateComponents([.hour, .minute], from: Date())
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }

    static func minutes(_ d: Date) -> Int {
        let c: DateComponents = cal.dateComponents([.hour, .minute], from: d)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }

    /// «14:30»
    static func hm(_ m: Int) -> String {
        let x: Int = ((m % 1440) + 1440) % 1440
        return pad(x / 60) + ":" + pad(x % 60)
    }

    static func cap(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }

    /// «Tir. 21. okt»
    static func dl(_ d: Date) -> String {
        cap(weekdaysShort[wd(d)]) + ". " + String(dayOfMonth(d)) + ". " + monthsShort[month(d) - 1]
    }

    /// «tirsdag 21. oktober»
    static func fd(_ d: Date) -> String {
        weekdays[wd(d)] + " " + String(dayOfMonth(d)) + ". " + months[month(d) - 1]
    }

    /// Tidspunktet for hendelsen som Date.
    static func at(_ dayKey: String, _ minutes: Int) -> Date {
        date(dayKey).addingTimeInterval(TimeInterval(minutes * 60))
    }

    /// «Ingen varsel», «10 min før», «1 t før», «1 dag før».
    static func remLabel(_ r: Int?) -> String {
        guard let r else { return "Ingen varsel" }
        if r >= 1440 { return String(r / 1440) + " dag før" }
        if r >= 60 { return String(r / 60) + " t før" }
        return String(r) + " min før"
    }

    static let remOptions: [(Int?, String)] = [(nil, "Ingen"), (10, "10 min"), (30, "30 min"), (60, "1 t"), (1440, "1 dag")]
}

/* ---------- Kalendere og farger ---------- */

enum KalCals {
    /// Faste kalendere når serveren ikke har /api/kalender/calendars (404): samme som CALS i fasiten.
    static let defaults: [KalCal] = [
        KalCal(id: "p", name: "Personlig", hex: "#b23a2a", lightHex: "#f29a8a", textHex: "#8a2a1d"),
        KalCal(id: "j", name: "Jobb", hex: "#2b5d8a", lightHex: "#9cc2ee", textHex: "#1f4568"),
        KalCal(id: "s", name: "Studie", hex: "#2f7a4f", lightHex: "#8fd4a8", textHex: "#235c3b"),
        KalCal(id: "f", name: "Familie", hex: "#a8661a", lightHex: "#ecbb74", textHex: "#7a4a12"),
        KalCal(id: "h", name: "Helse", hex: "#3d7f8a", lightHex: "#8fcdd6", textHex: "#2a5c64"),
        KalCal(id: "b", name: "Bursdager", hex: "#8a3fa0", lightHex: "#d6a8e6", textHex: "#6a2f7c", writable: false),
    ]

    /// Fargevalg for egne kalendere.
    static let palette: [String] = ["#b23a2a", "#2b5d8a", "#2f7a4f", "#a8661a", "#3d7f8a", "#8a3fa0", "#5b5f97", "#9a4a6b", "#4f6b2f", "#6b665c"]

    /// Ordene som gir hver av de faste kalenderne (guessCal i fasiten).
    static func guess(_ text: String) -> String {
        let s: String = text.lowercased()
        if has(s, ["lege", "tannlege", "fysio", "trening", "sats", "helse", "vaksine", "psykolog"]) { return "h" }
        if has(s, ["forelesning", "eksamen", "frist", "oblig", "innlevering", "kollokvie", "studie"]) { return "s" }
        if has(s, ["møte", "jobb", "kunde", "standup", "presentasjon"]) { return "j" }
        if s.contains("bursdag") || s.range(of: "\\d+\\s*år\\b", options: .regularExpression) != nil { return "b" }
        if has(s, ["mormor", "morfar", "farmor", "farfar", "familie", "hytta", "foreldremøte", "fotball"]) { return "f" }
        return "p"
    }

    private static func has(_ s: String, _ words: [String]) -> Bool {
        for w in words where s.contains(w) { return true }
        return false
    }

    /// Når serveren ikke sender kalender-id-er for visningen: serverens kalendere → p/j/s/f/h/b.
    static func fallback(serverCal: String, type: String, title: String) -> String {
        let c: String = serverCal.lowercased()
        let t: String = type.lowercased()
        if c == "bursdager" || t == "bursdag" { return "b" }
        if c == "timeplan" || c == "prover" || c == "skole" || c == "canvas" || t == "time" || t == "prove" || t == "innl" { return "s" }
        if c == "familie" { return "f" }
        if c == "jobb" || c == "work" { return "j" }
        if c == "helse" || c == "health" { return "h" }
        let g: String = guess(title)
        return g == "b" ? "p" : g
    }

    /// Lysere variant (mørkt tema) for kalendere fra serveren uten kjent farge.
    static func lighter(_ hex: String) -> String { mix(hex, "#ffffff", 0.5) }
    static func darker(_ hex: String) -> String { mix(hex, "#000000", 0.22) }

    static func mix(_ a: String, _ b: String, _ t: Double) -> String {
        let x: (Double, Double, Double) = rgb(a)
        let y: (Double, Double, Double) = rgb(b)
        let r: Double = x.0 + (y.0 - x.0) * t
        let g: Double = x.1 + (y.1 - x.1) * t
        let bl: Double = x.2 + (y.2 - x.2) * t
        return "#" + h2(r) + h2(g) + h2(bl)
    }

    private static func h2(_ v: Double) -> String {
        let n: Int = Swift.max(0, Swift.min(255, Int((v * 255).rounded())))
        let s: String = String(n, radix: 16)
        return s.count == 1 ? "0" + s : s
    }

    static func rgb(_ hex: String) -> (Double, Double, Double) {
        var h: String = hex.trimmingCharacters(in: CharacterSet(charactersIn: "# "))
        if h.count == 3 {
            var o: String = ""
            for ch in h { o.append(ch); o.append(ch) }
            h = o
        }
        let v: UInt64 = UInt64(h.prefix(6), radix: 16) ?? 0xb23a2a
        let r: Double = Double((v >> 16) & 0xFF) / 255.0
        let g: Double = Double((v >> 8) & 0xFF) / 255.0
        let b: Double = Double(v & 0xFF) / 255.0
        return (r, g, b)
    }

    /// Kjente navn får fasitens farger; ellers beregnes lys/mørk tekst.
    static func make(id: String, name: String, hex: String) -> KalCal {
        let low: String = name.lowercased()
        for d in defaults where d.name.lowercased() == low || d.id == id {
            var c: KalCal = d
            c.id = id
            c.name = name
            if !hex.isEmpty && hex.lowercased() != d.hex { c.hex = hex; c.lightHex = lighter(hex); c.textHex = darker(hex) }
            return c
        }
        let h: String = hex.isEmpty ? "#6b665c" : hex
        return KalCal(id: id, name: name, hex: h, lightHex: lighter(h), textHex: darker(h))
    }
}

extension Color {
    /// «#b23a2a» → Color.
    init(kalHex: String, opacity: Double = 1) {
        let c: (Double, Double, Double) = KalCals.rgb(kalHex)
        self.init(.sRGB, red: c.0, green: c.1, blue: c.2, opacity: opacity)
    }
}

/* ---------- Vær ---------- */

enum KalWx {
    static let text: [String: String] = ["sol": "Sol", "delvis": "Delvis skyet", "sky": "Skyet", "regn": "Regn", "sno": "Snø", "torden": "Torden"]

    /// WMO-kode (Open-Meteo) → sol/delvis/sky/regn/sno/torden (wkd i fasiten).
    static func kind(wmo c: Int) -> String {
        if c <= 1 { return "sol" }
        if c == 2 { return "delvis" }
        if (c >= 51 && c <= 67) || (c >= 80 && c <= 82) { return "regn" }
        if (c >= 71 && c <= 77) || c == 85 || c == 86 { return "sno" }
        if c >= 95 { return "torden" }
        return "sky"
    }

    /// MET-symbol («partlycloudy_day», «rain») eller fritekst → kind.
    static func kind(symbol raw: String) -> String {
        let c: String = raw.lowercased()
        if c.isEmpty { return "sky" }
        if c.contains("thunder") || c.contains("torden") { return "torden" }
        if c.contains("snow") || c.contains("sleet") || c.contains("snø") || c == "sno" { return "sno" }
        if c.contains("rain") || c.contains("regn") || c.contains("shower") { return "regn" }
        if c.contains("partly") || c.contains("fair") || c.contains("delvis") { return "delvis" }
        if c.contains("clear") || c.contains("sun") || c == "sol" { return "sol" }
        return "sky"
    }

    static func symbol(_ kind: String) -> String {
        switch kind {
        case "sol": return "sun.max"
        case "delvis": return "cloud.sun"
        case "regn": return "cloud.rain"
        case "sno": return "cloud.snow"
        case "torden": return "cloud.bolt"
        default: return "cloud"
        }
    }

    static func color(_ kind: String, mut: Color) -> Color {
        if kind == "sol" { return Color(kalHex: "#b8860b") }
        if kind == "regn" { return Color(kalHex: "#2b5d8a") }
        return mut
    }
}

/* ---------- Lesing av serverens svar ---------- */

enum KalParse {
    static func str(_ o: [String: Any], _ k: String) -> String {
        if let s = o[k] as? String { return s }
        if let n = o[k] as? NSNumber { return n.stringValue }
        return ""
    }

    static func int(_ o: [String: Any], _ k: String) -> Int? {
        if let n = o[k] as? NSNumber { return n.intValue }
        if let s = o[k] as? String { return Int(s) }
        return nil
    }

    static func dbl(_ o: [String: Any], _ k: String) -> Double? {
        if let n = o[k] as? NSNumber { return n.doubleValue }
        if let s = o[k] as? String { return Double(s.replacingOccurrences(of: ",", with: ".")) }
        return nil
    }

    static func bool(_ o: [String: Any], _ k: String) -> Bool? {
        if let b = o[k] as? Bool { return b }
        if let n = o[k] as? NSNumber { return n.intValue != 0 }
        if let s = o[k] as? String { return s == "true" || s == "1" }
        return nil
    }

    static func list(_ any: Any?, _ key: String) -> [[String: Any]] {
        if let a = any as? [Any] { return a.compactMap { $0 as? [String: Any] } }
        if let o = any as? [String: Any], let a = o[key] as? [Any] { return a.compactMap { $0 as? [String: Any] } }
        return []
    }

    private static let isoA: ISO8601DateFormatter = {
        let f: ISO8601DateFormatter = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let isoB: ISO8601DateFormatter = {
        let f: ISO8601DateFormatter = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let localF: DateFormatter = {
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return f
    }()

    /// ISO med sone, lokal «2026-10-21T14:30» eller millisekunder.
    static func time(_ v: Any?) -> Date? {
        if let n = v as? NSNumber {
            let x: Double = n.doubleValue
            if x > 1e11 { return Date(timeIntervalSince1970: x / 1000) }
            if x > 1e8 { return Date(timeIntervalSince1970: x) }
            return nil
        }
        guard let s = v as? String, s.count > 10 else { return nil }
        if let d = isoA.date(from: s) { return d }
        if let d = isoB.date(from: s) { return d }
        return localF.date(from: String(s.prefix(16)))
    }

    /// «14:30» → 870.
    static func hmMin(_ v: Any?) -> Int? {
        if let n = v as? NSNumber { return n.intValue }
        guard let s = v as? String else { return nil }
        let p: [Substring] = s.split(separator: ":")
        guard p.count >= 2, let h = Int(p[0]), let m = Int(p[1].prefix(2)) else { return nil }
        return h * 60 + m
    }

    /// Serverens reminder («none», «15m», «1h», «day») eller minutter.
    static func reminder(_ o: [String: Any]) -> Int? {
        if let m = int(o, "remindMinutes") ?? int(o, "remMin") { return m > 0 ? m : nil }
        if let n = o["rem"] as? NSNumber { return n.intValue > 0 ? n.intValue : nil }
        switch str(o, "reminder") {
        case "10m": return 10
        case "15m": return 15
        case "30m": return 30
        case "1h": return 60
        case "day", "1d": return 1440
        default: return nil
        }
    }

    /// Én hendelse fra /api/kalender (eller widgets/assist-svar). calIds = kalenderne som finnes i appen.
    static func event(_ o: [String: Any], calIds: Set<String>) -> KalEvent? {
        let title: String = str(o, "title").isEmpty ? str(o, "t") : str(o, "title")
        if title.isEmpty { return nil }
        let type: String = str(o, "type")
        let serverCal: String = str(o, "calendar")
        let explicitAll: Bool? = bool(o, "allDay") ?? bool(o, "all")
        var day: String = str(o, "date")
        if day.isEmpty { day = str(o, "d") }
        var s: Int? = nil
        var e: Int? = nil
        var days: Int = 1
        let startRaw: Any? = o["start"]
        let endRaw: Any? = o["end"]
        let startT: Date? = time(startRaw)
        let endT: Date? = time(endRaw)
        if explicitAll == true || (startT == nil && (o["s"] == nil || o["s"] is NSNull)) {
            if day.isEmpty, let sd = startRaw as? String, sd.count >= 10 { day = String(sd.prefix(10)) }
            if let ed = endRaw as? String, ed.count == 10, KalD.valid(day) {
                days = Swift.max(1, KalD.daysBetween(day, ed))
            }
            if let n = int(o, "days"), n > 1 { days = n }
            if type == "innl", let et = endT {
                // Innlevering med klokkeslett: fristen er slutten.
                day = KalD.key(et)
            }
        } else if let st = startT {
            day = KalD.key(st)
            s = KalD.minutes(st)
            if let et = endT {
                let m: Int = KalD.minutes(et)
                e = KalD.key(et) == day ? Swift.max(m, (s ?? 0) + 5) : 1440
            } else {
                e = (s ?? 0) + 60
            }
        } else {
            s = hmMin(o["s"])
            e = hmMin(o["e"])
            if s != nil && e == nil { e = (s ?? 0) + 60 }
        }
        guard KalD.valid(day) else { return nil }
        var cal: String = str(o, "cal")
        if cal.isEmpty { cal = serverCal }
        if !calIds.contains(cal) { cal = KalCals.fallback(serverCal: serverCal, type: type, title: title) }
        var kind: String = str(o, "kind")
        if kind.isEmpty {
            if type == "prove" || type == "innl" || title.lowercased().hasPrefix("frist") { kind = "frist" }
            else if type == "bursdag" { kind = "bursdag" }
        }
        var id: String = str(o, "id")
        if id.isEmpty { id = day + "|" + String(s ?? -1) + "|" + title }
        var loc: String = str(o, "room")
        if loc.isEmpty { loc = str(o, "location") }
        if loc.isEmpty { loc = str(o, "loc") }
        if let r = loc.range(of: "http") { loc = String(loc[..<r.lowerBound]).trimmingCharacters(in: CharacterSet(charactersIn: " ,·-")) }
        var ev: KalEvent = KalEvent(id: id, title: title, cal: cal, day: day, s: s, e: e)
        ev.days = days
        ev.loc = loc
        ev.rem = reminder(o)
        ev.kind = kind
        ev.src = str(o, "src").isEmpty ? str(o, "origin") : str(o, "src")
        if ev.src.hasPrefix("AI") { ev.src = "" }
        ev.editable = bool(o, "editable") ?? false
        ev.serverCal = serverCal
        ev.note = str(o, "note")
        return ev
    }

    static func events(_ data: Data, calIds: Set<String>) -> [KalEvent] {
        let any: Any? = try? JSONSerialization.jsonObject(with: data)
        let raw: [[String: Any]] = list(any, "events")
        var seen: Set<String> = []
        var out: [KalEvent] = []
        for r in raw {
            guard let ev = event(r, calIds: calIds) else { continue }
            if seen.contains(ev.id) { continue }
            seen.insert(ev.id)
            out.append(ev)
        }
        out.sort { (a: KalEvent, b: KalEvent) -> Bool in
            if a.day != b.day { return a.day < b.day }
            return (a.s ?? -1) < (b.s ?? -1)
        }
        return out
    }

    /// GET /api/kalender/calendars → [{id, name, color, visible|enabled, count|count30, writable, local}].
    static func calendars(_ data: Data) -> [KalCal] {
        let any: Any? = try? JSONSerialization.jsonObject(with: data)
        let raw: [[String: Any]] = list(any, "calendars")
        var out: [KalCal] = []
        for o in raw {
            let id: String = str(o, "id")
            if id.isEmpty { continue }
            var name: String = str(o, "name")
            if name.isEmpty { name = str(o, "title") }
            var hex: String = str(o, "color")
            if hex.isEmpty { hex = str(o, "hex") }
            var c: KalCal = KalCals.make(id: id, name: name.isEmpty ? id : name, hex: hex)
            c.on = bool(o, "visible") ?? bool(o, "enabled") ?? bool(o, "on") ?? true
            c.count = int(o, "count") ?? int(o, "count30") ?? int(o, "next30") ?? 0
            c.writable = bool(o, "writable") ?? true
            c.local = bool(o, "local") ?? bool(o, "custom") ?? false
            // Prompt 35: hidMenu, source, badge og builtin (mangler på eldre servere).
            c.hidMenu = bool(o, "hidMenu")
            let src: String = str(o, "source")
            c.source = src.isEmpty ? nil : src
            let badge: String = str(o, "badge")
            c.badge = badge.isEmpty ? nil : badge
            c.builtin = bool(o, "builtin")
            let lt: String = str(o, "lightColor")
            let tx: String = str(o, "textColor")
            if !lt.isEmpty && !tx.isEmpty && lt.lowercased() != hex.lowercased() {
                c.lightHex = lt
                c.textHex = tx
            } else if !hex.isEmpty && c.hex.lowercased() == hex.lowercased() && KalCals.defaults.first(where: { (d: KalCal) -> Bool in d.hex == c.hex }) == nil {
                c = KalTone35.apply(c, hex: hex)
            }
            out.append(c)
        }
        return out
    }

    /// GET /api/kalender/weather → {days:[{date, icon|symbol|code, max|hi, min|lo}]} eller {"YYYY-MM-DD": {...}}.
    static func weather(_ data: Data) -> [KalWxDay] {
        let any: Any? = try? JSONSerialization.jsonObject(with: data)
        var rows: [[String: Any]] = list(any, "days")
        if rows.isEmpty { rows = list(any, "weather") }
        if rows.isEmpty, let o = any as? [String: Any] {
            for (k, v) in o {
                guard KalD.valid(k), var d = v as? [String: Any] else { continue }
                d["date"] = k
                rows.append(d)
            }
        }
        var out: [KalWxDay] = []
        for o in rows {
            var day: String = str(o, "date")
            if day.isEmpty { day = str(o, "day") }
            guard KalD.valid(String(day.prefix(10))) else { continue }
            day = String(day.prefix(10))
            let kind: String
            if let wmo = int(o, "code") ?? int(o, "wmo") ?? int(o, "weather_code") {
                kind = KalWx.kind(wmo: wmo)
            } else {
                var sym: String = str(o, "kind")
                if sym.isEmpty { sym = str(o, "icon") }
                if sym.isEmpty { sym = str(o, "symbol") }
                kind = KalWx.text[sym] != nil ? sym : KalWx.kind(symbol: sym)
            }
            let hi: Double = dbl(o, "max") ?? dbl(o, "hi") ?? dbl(o, "tmax") ?? 0
            let lo: Double = dbl(o, "min") ?? dbl(o, "lo") ?? dbl(o, "tmin") ?? 0
            out.append(KalWxDay(day: day, kind: kind, hi: Int(hi.rounded()), lo: Int(lo.rounded())))
        }
        out.sort { (a: KalWxDay, b: KalWxDay) -> Bool in a.day < b.day }
        return out
    }

    /// Open-Meteo (reserve når serveren ikke har vær-endepunktet): daily.time / weather_code / temperature_2m_max / _min.
    static func openMeteo(_ data: Data) -> [KalWxDay] {
        guard let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let d = o["daily"] as? [String: Any],
              let times = d["time"] as? [Any] else { return [] }
        let codes: [Any] = (d["weather_code"] as? [Any]) ?? (d["weathercode"] as? [Any]) ?? []
        let hi: [Any] = (d["temperature_2m_max"] as? [Any]) ?? []
        let lo: [Any] = (d["temperature_2m_min"] as? [Any]) ?? []
        var out: [KalWxDay] = []
        for i in 0..<times.count {
            guard let t = times[i] as? String else { continue }
            let c: Int = i < codes.count ? ((codes[i] as? NSNumber)?.intValue ?? 3) : 3
            let h: Double = i < hi.count ? ((hi[i] as? NSNumber)?.doubleValue ?? 0) : 0
            let l: Double = i < lo.count ? ((lo[i] as? NSNumber)?.doubleValue ?? 0) : 0
            out.append(KalWxDay(day: t, kind: KalWx.kind(wmo: c), hi: Int(h.rounded()), lo: Int(l.rounded())))
        }
        return out
    }
}
