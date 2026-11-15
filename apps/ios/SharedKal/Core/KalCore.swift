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
    /// Prompt 37: fagfargen serveren har gitt hendelsen (subjectColor), «#rrggbb».
    var subjectHex: String? = nil
    /// Prompt 37: full adresse og koordinater (Glimt-lagte hendelser: address + map {lat, lon}).
    var address: String? = nil
    var lat: Double? = nil
    var lon: Double? = nil
    /// Prompt 42: trekk fra Abonnementer (Finans). nil for alle andre hendelser.
    var ab42: KalAb42Info? = nil
    /// Prompt 44: Media-utgivelse (status fra Media, «Åpne i Media»), deltakere, gjentakelse og versjon (etag) for Rediger.
    var media44: KalMedia44? = nil
    var att44: [KalAtt44]? = nil
    var rec44: Bool? = nil
    var etag44: String? = nil

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
    /// Prompt 39: kilde, merke, varsel, brief, URL … (fire kalendere). nil i eldre buffere.
    var p39: KalCalInfo39? = nil
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
    /// Faste kalendere når serveren ikke har /api/kalender/calendars (404).
    /// Prompt 39: bare de fire (CALS i Kalender App.dc.html): Personlig · Bursdager · Skole · Helligdager.
    static let defaults: [KalCal] = [
        KalCal(id: "p", name: "Personlig", hex: "#b23a2a", lightHex: "#f29a8a", textHex: "#8a2a1d"),
        KalCal(id: "b", name: "Bursdager", hex: "#8a3fa0", lightHex: "#d6a8e6", textHex: "#6a2f7c", writable: false),
        KalCal(id: "s", name: "Skole", hex: "#2f7a4f", lightHex: "#8fd4a8", textHex: "#235c3b"),
        KalCals39.holidayCal(),
    ]

    /// Fargevalg for egne kalendere.
    static let palette: [String] = ["#b23a2a", "#2b5d8a", "#2f7a4f", "#a8661a", "#3d7f8a", "#8a3fa0", "#5b5f97", "#9a4a6b", "#4f6b2f", "#6b665c"]

    /// Ordene som gir hver av de faste kalenderne (guessCal i fasiten).
    /// Prompt 39: bare fire kalendere – helse, jobb og familie havner i Personlig (CNORM i fasiten).
    static func guess(_ text: String) -> String {
        let s: String = text.lowercased()
        if has(s, ["forelesning", "eksamen", "frist", "oblig", "innlevering", "kollokvie", "studie"]) { return "s" }
        if s.contains("bursdag") || s.range(of: "\\d+\\s*år\\b", options: .regularExpression) != nil { return "b" }
        return "p"
    }

    private static func has(_ s: String, _ words: [String]) -> Bool {
        for w in words where s.contains(w) { return true }
        return false
    }

    /// Når serveren ikke sender kalender-id-er for visningen: serverens kalendere → p/s/b (prompt 39: fire kalendere).
    static func fallback(serverCal: String, type: String, title: String) -> String {
        let c: String = serverCal.lowercased()
        let t: String = type.lowercased()
        if c == "bursdager" || t == "bursdag" { return "b" }
        if c == "timeplan" || c == "prover" || c == "skole" || c == "canvas" || t == "time" || t == "prove" || t == "innl" { return "s" }
        if c == "helligdager" || t == "helligdag" { return "h" }
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
        // Maks 30 dager (varseltidspunktet regnes ut med m * 60 – et absurd tall fra en kilde skal ikke gi overflyt).
        if let m = int(o, "remindMinutes") ?? int(o, "remMin") { return m > 0 ? Swift.min(m, 43_200) : nil }
        if let n = o["rem"] as? NSNumber { return n.intValue > 0 ? Swift.min(n.intValue, 43_200) : nil }
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
                days = Swift.min(366, Swift.max(1, KalD.daysBetween(day, ed)))
            }
            if let n = int(o, "days"), n > 1 { days = Swift.min(n, 366) }
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
        // Prompt 39: appCalendar (serverens kalender i appen) først – før ble den oversett, og «timeplan» ga en ekstra Studie.
        var cal: String = str(o, "appCalendar")
        if cal.isEmpty || !calIds.contains(cal) {
            let c2: String = str(o, "cal")
            if !c2.isEmpty && (cal.isEmpty || calIds.contains(c2)) { cal = c2 }
        }
        if cal.isEmpty { cal = serverCal }
        if !calIds.contains(cal) { cal = KalCals39.resolve(cal, calIds: calIds, serverCal: serverCal, type: type, title: title) }
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
        KalEv37.decorate(&ev, o)
        // Prompt 42: Abonnementer (trekkdatoer fra Finans): beløp, konto, logo, merke TREKK / PRØVE / ÅRLIG.
        KalAb42.decorate(&ev, o)
        // Prompt 44: Media-status, deltakere, gjentakelse og etag.
        KalEv44.decorate(&ev, o)
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
        var seen: Set<String> = []
        for o in raw {
            let id: String = str(o, "id")
            // Samme id to ganger ville gitt dupliserte id-er i ForEach (sidemenyen).
            if id.isEmpty || seen.contains(id) { continue }
            seen.insert(id)
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
            c.p39 = KalCals39.info(o)
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
        // Prompt 39: migration-feltet. Sammenslåingen til fire skjer i KalCals39.fromServer (hele lista, ikke enkeltsvar).
        KalCals39.readMigration(any)
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
}

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
        KalRx45.re(pattern)
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
        // Prompt 39: fire kalendere (+ egne), uten duplikater.
        let list: [KalCal] = KalCals39.fromServer(KalParse.calendars(d))
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
                if id.isEmpty || out.entities.contains(where: { (x: KalHaEntity35) -> Bool in x.id == id }) { continue }
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

/* ---------- Unike id-er (ForEach) ---------- */

extension Array where Element == KalEvent {
    /// Første forekomst av hver id. Flerdagshendelser ligger på hver dag med samme id, og samlet over flere dager
    /// (Glimt-kort, søk) ga det dupliserte id-er i ForEach – udefinert oppførsel som kan krasje SwiftUI.
    func uniqueIds() -> [KalEvent] {
        var seen: Set<String> = []
        var out: [KalEvent] = []
        for e in self where !seen.contains(e.id) {
            seen.insert(e.id)
            out.append(e)
        }
        return out
    }
}

extension Array where Element == KalCal {
    /// Første forekomst av hver kalender-id.
    func uniqueIds() -> [KalCal] {
        var seen: Set<String> = []
        var out: [KalCal] = []
        for c in self where !seen.contains(c.id) {
            seen.insert(c.id)
            out.append(c)
        }
        return out
    }
}

/* ---------------- Prompt 37: Kalender – felles for iOS-appen, widgetene og Mac-appen ---------------- */
// Fasit: design/Kalender App.dc.html (prompt-37-pakke) → fagKey(), CC(), FAGP, ask() (blokken før «neste»), geoFor(), mapOf().
// • KalEv37: nye felt fra serveren – subjectColor, address, map {lat, lon}, kind «trial» (prøveperioder fra Subscription OS).
// • KalFag37: egen farge per fag i Studie (emnekode «MEK1300» eller første ord etter «Frist:/Prøve ·/Eksamen …»).
//   8 farger, nye fag får neste ledige. Tildeling og egne valg lagres i App Group (widgetene får samme) og i profilen på
//   serveren (PUT /api/me/layout {subjectColors:{fag: hex}} – flettes per nøkkel), så fargen er lik på alle enheter.
// • KalSchool37: «Neste prøve på skolen» er en skoleprøve i Studie, aldri «Viaplay-prøven slutter». Skole-ordene avgrenser
//   til Studie og er ikke søkeord. Søkeord: stoppord ut, ingen «-en/-et»-stripping, og alle ordene må treffe.
// • KalPlace37: stedet i teksten Glimt legger inn («hos Nina frisør», «på Majorstuen legesenter», «Hoffsveien 4»).
// • KalGeoCache37: geokoding-cachen (treff permanent, bomtreff {fail} prøves igjen etter 1 t) og forsøksrekkefølgen.

private enum KalRx37 {
    static func re(_ p: String, _ ci: Bool = true) -> NSRegularExpression? {
        KalRx45.re(p, caseInsensitive: ci)
    }

    static func test(_ p: String, _ s: String, _ ci: Bool = true) -> Bool {
        guard let r = re(p, ci) else { return false }
        let range: NSRange = NSRange(s.startIndex..<s.endIndex, in: s)
        return r.firstMatch(in: s, options: [], range: range) != nil
    }

    /// Første gruppe (eller hele treffet når gruppe 1 mangler).
    static func first(_ p: String, _ s: String, _ ci: Bool = true) -> String? {
        guard let r = re(p, ci) else { return nil }
        let range: NSRange = NSRange(s.startIndex..<s.endIndex, in: s)
        guard let m = r.firstMatch(in: s, options: [], range: range) else { return nil }
        let idx: Int = m.numberOfRanges > 1 ? 1 : 0
        guard let rr = Range(m.range(at: idx), in: s) else { return nil }
        return String(s[rr])
    }

    static func replace(_ p: String, _ s: String, _ with: String, _ ci: Bool = true) -> String {
        guard let r = re(p, ci) else { return s }
        let range: NSRange = NSRange(s.startIndex..<s.endIndex, in: s)
        return r.stringByReplacingMatches(in: s, options: [], range: range, withTemplate: with)
    }
}

/* ---------- Nye felt på hendelsen ---------- */

enum KalEv37 {
    /// Leser subjectColor, address, map {lat, lon, url}, lat/lon og kind «trial» fra serverens hendelse.
    static func decorate(_ ev: inout KalEvent, _ o: [String: Any]) {
        let sc: String = KalParse.str(o, "subjectColor")
        if KalRx37.test("^#[0-9a-f]{6}$", sc) { ev.subjectHex = sc.lowercased() }
        let addr: String = KalParse.str(o, "address")
        if !addr.isEmpty { ev.address = addr }
        var la: Double? = KalParse.dbl(o, "lat")
        var lo: Double? = KalParse.dbl(o, "lon")
        if let m = o["map"] as? [String: Any] {
            if la == nil { la = KalParse.dbl(m, "lat") }
            if lo == nil { lo = KalParse.dbl(m, "lon") ?? KalParse.dbl(m, "lng") }
        }
        if let la, let lo, abs(la) <= 90, abs(lo) <= 180, !(la == 0 && lo == 0) {
            ev.lat = la
            ev.lon = lo
        }
        let src: String = KalParse.str(o, "source").lowercased()
        let cal: String = KalParse.str(o, "calendar").lowercased()
        if ev.kind != "trial" && (src == "trials" || cal == "trials" || KalParse.str(o, "type") == "trial") { ev.kind = "trial" }
    }
}

/* ---------- Farge per fag ---------- */

struct KalFagRow37: Identifiable, Hashable {
    let key: String
    let label: String
    let hex: String
    let own: Bool
    var id: String { key }
}

enum KalFag37 {
    /// FAGP i fasiten: [c, tx (lyst tema), lt (mørkt tema)].
    static let palette: [[String]] = [
        ["#2f7a4f", "#235c3b", "#8fd4a8"], ["#2b5d8a", "#1f4568", "#9cc2ee"], ["#a8661a", "#7a4a12", "#ecbb74"],
        ["#8a3fa0", "#6a2f7c", "#d6a8e6"], ["#3d7f8a", "#2a5c64", "#8fcdd6"], ["#c2477a", "#8f2f58", "#f0a6c4"],
        ["#5b4fc4", "#40368f", "#b3abf2"], ["#7a8a2a", "#55611c", "#c9d685"],
    ]

    /// Kalender-id-er og serverkalendere som er Studie (eller timeplan-integrasjonen).
    static let studyIds: Set<String> = ["s", "studie", "timeplan", "prover", "skole", "canvas", "study"]

    /// Appene setter denne til true (widgetene skriver ikke til serveren).
    static var pushEnabled: Bool = false

    private static let lock: NSLock = NSLock()
    private static var idxCache: [String: Int]? = nil
    private static var hexCache: [String: String]? = nil
    private static var queued: [String: Any] = [:]
    private static var flushing: Bool = false
    private static let idxKey: String = "kal.fag37.idx"
    private static let hexKey: String = "kal.fag37.hex"

    /// MEK1300 / «TRE 1400» → «TRE1400»; ellers første ord etter «Frist: / Prøve · / Eksamen / Forelesning …» (små bokstaver).
    static func key(_ title: String) -> String {
        if let m = KalRx37.first("\\b([A-ZÆØÅ]{2,5}\\s?\\d{3,4})\\b", title, false) {
            return m.replacingOccurrences(of: " ", with: "")
        }
        let rest: String = KalRx37.replace("^(Frist:|Prøve ·|Prøve:|Eksamen|Forelesning|Øving|Lab|Seminar)\\s*", title.trimmingCharacters(in: .whitespaces), "")
        let parts: [Substring] = rest.split { (ch: Character) -> Bool in ch == " " || ch == "·" || ch == "–" || ch == "-" }
        guard let w = parts.first else { return "" }
        let low: String = String(w).lowercased()
        let clean: String = low.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        return clean.count >= 2 ? clean : ""
    }

    /// Visningsnavnet i Innstillinger → Fag («MEK1300», «Fysikk»).
    static func label(_ key: String) -> String {
        if KalRx37.test("\\d", key) { return key.uppercased() }
        return key.prefix(1).uppercased() + key.dropFirst()
    }

    static func isStudy(_ e: KalEvent, _ c: KalCal?) -> Bool {
        if KalSchool37.isTrialEvent(e) { return false }
        if studyIds.contains(e.cal.lowercased()) || studyIds.contains(e.serverCal.lowercased()) { return true }
        let n: String = (c?.name ?? "").lowercased()
        return n == "studie" || n == "skole" || n == "timeplan"
    }

    /// Kalenderen med fagfargen lagt på (bare hendelser i Studie). Sidemenyen og filteret bruker fortsatt kalenderens egen farge.
    static func tint(_ c: KalCal?, _ e: KalEvent) -> KalCal? {
        guard let base = c else { return c }
        if !isStudy(e, base) { return base }
        let k: String = key(e.title)
        if let h = e.subjectHex, k.isEmpty || own(k) == nil { return apply(base, h) }
        if k.isEmpty { return base }
        return apply(base, hex(k))
    }

    /// Fargen faget har (eget valg, eller fast tildelt fra paletten).
    static func hex(_ k: String) -> String {
        if let o = own(k) { return o }
        let i: Int = index(k)
        return palette[i % palette.count][0]
    }

    static func own(_ k: String) -> String? {
        lock.lock()
        defer { lock.unlock() }
        loadLocked()
        return hexCache?[k]
    }

    private static func loadLocked() {
        if idxCache == nil {
            idxCache = (KalGroup.defaults.dictionary(forKey: idxKey) as? [String: Int]) ?? [:]
        }
        if hexCache == nil {
            hexCache = (KalGroup.defaults.dictionary(forKey: hexKey) as? [String: String]) ?? [:]
        }
    }

    /// Fast plass i paletten. Nye fag får neste ledige farge og beholder den.
    static func index(_ k: String) -> Int {
        lock.lock()
        loadLocked()
        var map: [String: Int] = idxCache ?? [:]
        if let i = map[k] {
            lock.unlock()
            return i
        }
        let used: Set<Int> = Set(map.values.map { (v: Int) -> Int in v % palette.count })
        var next: Int = map.count % palette.count
        for i in 0..<palette.count where !used.contains(i) {
            next = i
            break
        }
        map[k] = next
        idxCache = map
        KalGroup.defaults.set(map, forKey: idxKey)
        let push: Bool = pushEnabled && hexCache?[k] == nil
        lock.unlock()
        if push { queue(k, palette[next][0]) }
        return next
    }

    static func apply(_ c: KalCal, _ hex: String) -> KalCal {
        var x: KalCal = c
        let h: String = hex.lowercased()
        if let p = palette.first(where: { (row: [String]) -> Bool in row[0] == h }) {
            x.hex = p[0]
            x.textHex = p[1]
            x.lightHex = p[2]
            return x
        }
        x.hex = h
        x.textHex = KalCals.mix(h, "#000000", 0.28)
        x.lightHex = KalCals.mix(h, "#ffffff", 0.45)
        return x
    }

    /// Brukerens eget valg (nil = tilbake til fast palettfarge). Lagres lokalt og i profilen.
    static func set(_ k: String, _ hexValue: String?) {
        if k.isEmpty { return }
        lock.lock()
        loadLocked()
        var map: [String: String] = hexCache ?? [:]
        if let h = hexValue { map[k] = h.lowercased() } else { map.removeValue(forKey: k) }
        hexCache = map
        KalGroup.defaults.set(map, forKey: hexKey)
        lock.unlock()
        if let h = hexValue { queue(k, h.lowercased()) } else { queue(k, NSNull()) }
    }

    /// Fagene i hendelsene (Innstillinger → Kalendere → Studie → Fag).
    static func rows(_ events: [KalEvent], cal: (String) -> KalCal?) -> [KalFagRow37] {
        var seen: Set<String> = []
        var out: [KalFagRow37] = []
        for e in events where isStudy(e, cal(e.cal)) {
            let k: String = key(e.title)
            if k.isEmpty || seen.contains(k) { continue }
            seen.insert(k)
            out.append(KalFagRow37(key: k, label: label(k), hex: hex(k), own: own(k) != nil))
        }
        return out.sorted { (a: KalFagRow37, b: KalFagRow37) -> Bool in a.label.lowercased() < b.label.lowercased() }
    }

    /// Henter subjectColors fra profilen (GET /api/me/layout). Serverens valg vinner, så alle enheter blir like.
    static func pull() async {
        guard let d = try? await KalNet.get("/api/me/layout") else { return }
        guard let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return }
        guard let sc = o["subjectColors"] as? [String: Any] else { return }
        merge(sc)
    }

    /// Synkron (NSLock kan ikke brukes direkte i async-funksjoner).
    private static func merge(_ sc: [String: Any]) {
        lock.lock()
        loadLocked()
        var map: [String: String] = hexCache ?? [:]
        for (k, v) in sc {
            guard let h = v as? String, KalRx37.test("^#[0-9a-f]{6}$", h) else { continue }
            map[k] = h.lowercased()
            // Web lagrer fagnavn («Fysikk»); appene bruker små bokstaver for ord-nøkler.
            if k.lowercased() != k { map[k.lowercased()] = h.lowercased() }
        }
        hexCache = map
        KalGroup.defaults.set(map, forKey: hexKey)
        lock.unlock()
    }

    private static func queue(_ k: String, _ v: Any) {
        if !pushEnabled || k.count > 40 { return }
        lock.lock()
        queued[k] = v
        let start: Bool = !flushing
        flushing = true
        lock.unlock()
        if !start { return }
        Task.detached {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            await KalFag37.flush()
        }
    }

    private static func flush() async {
        let body: [String: Any] = takeQueued()
        if body.isEmpty { return }
        _ = try? await KalNet.send("PUT", "/api/me/layout", json: ["subjectColors": body])
    }

    private static func takeQueued() -> [String: Any] {
        lock.lock()
        let body: [String: Any] = queued
        queued = [:]
        flushing = false
        lock.unlock()
        return body
    }
}

/* ---------- «Neste prøve på skolen» ---------- */

struct KalSchoolAnswer37 {
    var steps: [String] = []
    var text: String = ""
    var cards: [KalEvent] = []
}

enum KalSchool37 {
    /// Prøveperiode: går til Subscription OS / prøveperioder, ikke kalendersøk.
    static func isTrialQ(_ ql: String) -> Bool {
        KalRx37.test("prøveperiode|prøvetid|gratis ?periode|abonnement|trial|viaplay|netflix|hbo|disney|spotify|storytel|tv ?2 play", ql)
    }

    /// Skolekontekst: avgrenser til Studie og er ikke et søkeord.
    static func isSchoolQ(_ ql: String) -> Bool {
        KalRx37.test(" (skole|skolen|skola|universitet|universitetet|uni|uio|ntnu|oslomet|høgskole|høgskolen|studie|studiet|studier|klassen|fag|faget) ", ql)
    }

    /// Skoleprøve.
    static func isTestQ(_ ql: String) -> Bool {
        KalRx37.test(" (prøve|prøva|prøven|prøver|prøvene|eksamen|eksamenen|eksamener|test|testen|quiz|quizen|midtveis|midtveiseksamen|tentamen|heldagsprøve|heldagsprøven) ", ql)
    }

    /// «Neste eksamen» (uten prøve/test i spørsmålet).
    static func isExamQ(_ ql: String) -> Bool {
        KalRx37.test(" (eksamen|eksamenen|eksamener|midtveiseksamen) ", ql) && !KalRx37.test(" (prøve|prøva|prøven|prøver|test|testen|quiz) ", ql)
    }

    /// «Viaplay-prøven slutter», prøveperioder og abonnementer (kind «trial»).
    static func isTrialEvent(_ e: KalEvent) -> Bool {
        if e.kind == "trial" || e.serverCal.lowercased() == "trials" || e.cal.lowercased() == "trials" { return true }
        return KalRx37.test("prøven slutter|prøveperiode|prøvetid|abonnement|gratisperiode", e.title)
    }

    static func isTestEvent(_ e: KalEvent) -> Bool {
        if isTrialEvent(e) { return false }
        if e.kind == "prove" || e.kind == "eksamen" { return true }
        return KalRx37.test("prøve|eksamen|\\btest\\b|quiz|midtveis|tentamen", e.title)
    }

    /// «Prøve · Fysikk 2» → «prøve i Fysikk 2», «Eksamen IN2010» → «eksamen i IN2010».
    static func what(_ t: String) -> String {
        var s: String = KalRx37.replace("^Prøve ·\\s*", t, "prøve i ")
        s = KalRx37.replace("^Prøve:\\s*", s, "prøve i ")
        s = KalRx37.replace("^Eksamen\\s+", s, "eksamen i ")
        return s
    }

    /// nil = ikke en skoleprøve-spørsmål (eller et prøveperiode-spørsmål).
    static func answer(_ ql: String, up: [KalEvent], cal: (String) -> KalCal?, rel: (String) -> String, tk: String) -> KalSchoolAnswer37? {
        if !isTestQ(ql) || isTrialQ(ql) { return nil }
        let school: Bool = isSchoolQ(ql)
        let found: [KalEvent] = up.filter { (e: KalEvent) -> Bool in
            if !isTestEvent(e) { return false }
            return KalFag37.isStudy(e, cal(e.cal)) || !school
        }.uniqueIds()
        // «Neste eksamen»: eksamener først (ellers alle prøver).
        let examQ: Bool = isExamQ(ql)
        let exams: [KalEvent] = found.filter { (e: KalEvent) -> Bool in e.kind == "eksamen" || KalRx37.test("eksamen", e.title) }
        let useExams: Bool = examQ && !exams.isEmpty
        let list: [KalEvent] = useExams ? exams : found
        let noun: String = useExams ? "eksamen" : "prøve"
        var a: KalSchoolAnswer37 = KalSchoolAnswer37()
        if let m = list.first {
            let days: Int = KalD.daysBetween(tk, m.day)
            let n: Int = list.count
            a.steps = ["Ser i Studie-kalenderen", "Fant " + String(n) + (n == 1 ? " " + noun : " prøver/eksamener")]
            var t: String = "Neste " + noun + (school ? " på skolen" : "") + " er " + what(m.title) + " " + rel(m.day)
            if !m.allDay { t += " kl. " + KalD.hm(m.startMin) }
            if !m.loc.isEmpty { t += ", " + m.loc }
            t += "."
            if days > 1 { t += " Det er om " + String(days) + " dager." }
            if n > 1 {
                let rest: [String] = list.dropFirst().prefix(2).map { (e: KalEvent) -> String in
                    KalRx37.replace("^Prøve ·\\s*", e.title, "") + " " + rel(e.day)
                }
                t += " Etter det: " + rest.joined(separator: ", ") + "."
            }
            a.text = t
            a.cards = Array(list.prefix(3))
            return a
        }
        let nf: KalEvent? = up.first { (e: KalEvent) -> Bool in e.kind == "frist" && !isTrialEvent(e) && KalFag37.isStudy(e, cal(e.cal)) }
        a.steps = ["Ser i Studie-kalenderen", "Ingen prøver funnet"]
        a.text = "Jeg finner ingen prøver eller eksamener i Studie-kalenderen."
        if let nf { a.text += " Neste frist er " + KalRx37.replace("^Frist:\\s*", nf.title, "") + " " + rel(nf.day) + "." }
        a.cards = nf.map { (e: KalEvent) -> [KalEvent] in [e] } ?? []
        return a
    }

    /// Stoppord for «når er neste …» – også skole-ordene (kontekst, ikke søkeord).
    static let stop: Set<String> = ["når", "er", "neste", "min", "mitt", "mine", "har", "jeg", "skal", "må", "time", "timen", "timer",
                                    "hos", "til", "på", "i", "en", "et", "ei", "den", "det", "avtale", "avtalen", "hva", "meg", "kommer", "blir", "om",
                                    "skole", "skolen", "skola", "universitet", "universitetet", "uni", "studie", "studiet", "studier", "klassen",
                                    "høgskole", "høgskolen", "uio", "ntnu", "oslomet", "fag", "faget"]

    /// «når er neste frisørtime» → ["frisør"]. Ingen «-en/-et»-stripping (det ga «skol» og «prøv»).
    static func terms(_ q: String) -> [String] {
        let cleaned: String = KalRx37.replace("[?!.,:;«»\"]", q.lowercased(), " ")
        var out: [String] = []
        for raw in cleaned.split(separator: " ") {
            let w: String = String(raw)
            if w.count < 3 || stop.contains(w) { continue }
            let t: String = KalRx37.replace("(timen|timer|time|avtalen|avtale|økta|økt)$", w, "")
            if t.count >= 3 && !stop.contains(t) { out.append(t) }
        }
        return out
    }

    /// Ordstamme-treff: hele ordet, eller felles begynnelse på minst 4 tegn begge veier («frisøren» ↔ «frisør»).
    static func hit(_ hay: String, _ w: String) -> Bool {
        if hay.contains(w) { return true }
        let words: [Substring] = hay.split { (c: Character) -> Bool in !(c.isLetter || c.isNumber) }
        let need: Int = Swift.max(4, w.count - 2)
        let wp: String = String(w.prefix(need))
        for x in words where x.count >= 4 {
            let xs: String = String(x)
            if w.hasPrefix(xs) { return true }
            if wp.count >= 4 && xs.hasPrefix(wp) { return true }
        }
        return false
    }

    /// Alle søkeordene må treffe.
    static func all(_ hay: String, _ terms: [String]) -> Bool {
        terms.allSatisfy { (w: String) -> Bool in hit(hay, w) }
    }
}

/* ---------- Sted i teksten ---------- */

enum KalPlace37 {
    private static let notPlace: Set<String> = ["kl", "klokka", "klokken", "i", "på", "fra", "til", "og", "med", "om", "den", "neste", "denne",
                                                "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag", "morgen", "dag", "kveld",
                                                "januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober",
                                                "november", "desember", "varsle", "varsel", "påminn", "for", "før", "etter", "uke", "uka", "ca"]

    /// Stedet Glimt fant i teksten, eller tom.
    static func extract(_ text: String) -> String {
        let t: String = text.replacingOccurrences(of: "\n", with: " ")
        if let a = KalRx37.first("adresse\\s*:\\s*([^.;\\n]{4,80})", text) {
            return a.trimmingCharacters(in: .whitespaces)
        }
        let street: String = "([A-Za-zÆØÅæøåé.\\-]+(?:veien|vegen|vei|veg|gata|gate|gaten|plass|plassen|allé|alle|stien|bakken|svingen|ringen|torget|torg|kaia|brygge|terrasse)\\s+\\d{1,4}[A-Za-z]?\\b(?:\\s*,\\s*\\d{4}\\s+[A-ZÆØÅ][a-zæøå]+)?)"
        if let s = KalRx37.first(street, t) {
            let v: String = s.trimmingCharacters(in: .whitespaces)
            return v.prefix(1).uppercased() + v.dropFirst()
        }
        for trigger in ["hos", "på", "ved"] {
            if let p = after(trigger, t) { return p }
        }
        return ""
    }

    /// «hos Nina frisør» → «Nina frisør». Første ord med stor forbokstav, så opptil to ord til (ingen tall, dager eller tidsord).
    private static func after(_ trigger: String, _ t: String) -> String? {
        let words: [String] = t.split(separator: " ").map { (s: Substring) -> String in String(s) }
        var i: Int = 0
        while i < words.count {
            if words[i].lowercased() == trigger, i + 1 < words.count {
                let first: String = words[i + 1].trimmingCharacters(in: CharacterSet(charactersIn: ",.;:!?«»\""))
                if let ch = first.first, ch.isUppercase, ch.isLetter, !notPlace.contains(first.lowercased()) {
                    var out: [String] = [first]
                    var j: Int = i + 2
                    while j < words.count && out.count < 3 {
                        let raw: String = words[j]
                        let w: String = raw.trimmingCharacters(in: CharacterSet(charactersIn: ",.;:!?«»\""))
                        let letters: Bool = !w.isEmpty && w.allSatisfy { (c: Character) -> Bool in c.isLetter || c == "-" }
                        if !letters || notPlace.contains(w.lowercased()) { break }
                        out.append(w)
                        if raw.hasSuffix(",") || raw.hasSuffix(".") { break }
                        j += 1
                    }
                    return out.joined(separator: " ")
                }
            }
            i += 1
        }
        return nil
    }
}

/* ---------- Geokoding-cache ---------- */

struct KalGeoHit37: Codable, Hashable {
    var la: Double? = nil
    var lo: Double? = nil
    /// Etiketten «Gate husnr, bydel» (ikke rå display_name).
    var a: String? = nil
    /// Bomtreff: tidspunktet (sekunder siden 1970). Prøves igjen etter 1 t.
    var fail: Double? = nil

    var ok: Bool { la != nil && lo != nil }
}

enum KalGeoCache37 {
    private static let key: String = "kal.geo37"
    private static let lock: NSLock = NSLock()
    private static var cache: [String: KalGeoHit37]? = nil

    static func all() -> [String: KalGeoHit37] {
        lock.lock()
        defer { lock.unlock() }
        if let c = cache { return c }
        var out: [String: KalGeoHit37] = [:]
        if let d = KalGroup.defaults.data(forKey: key), let m = try? JSONDecoder().decode([String: KalGeoHit37].self, from: d) { out = m }
        cache = out
        return out
    }

    /// Treff, eller nil (ukjent eller bom). retry = true når stedet bør slås opp (ukjent, eller bom eldre enn 1 t).
    static func lookup(_ loc: String) -> (hit: KalGeoHit37?, retry: Bool) {
        let k: String = norm(loc)
        if k.isEmpty { return (nil, false) }
        guard let h = all()[k] else { return (nil, true) }
        if h.ok { return (h, false) }
        let age: Double = Date().timeIntervalSince1970 - (h.fail ?? 0)
        return (nil, age > 3600)
    }

    static func store(_ loc: String, _ hit: KalGeoHit37) {
        let k: String = norm(loc)
        if k.isEmpty { return }
        lock.lock()
        var m: [String: KalGeoHit37] = cache ?? [:]
        if cache == nil, let d = KalGroup.defaults.data(forKey: key), let old = try? JSONDecoder().decode([String: KalGeoHit37].self, from: d) { m = old }
        m[k] = hit
        if m.count > 400 {
            // Bomtreff ryddes først.
            for (kk, v) in m where !v.ok { m.removeValue(forKey: kk) }
        }
        cache = m
        if let d = try? JSONEncoder().encode(m) { KalGroup.defaults.set(d, forKey: key) }
        lock.unlock()
    }

    static func norm(_ loc: String) -> String {
        loc.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// Rekkefølgen: stedet → «…, Oslo» → delen etter komma + by → uten første ledd.
    static func tries(_ loc: String, city: String = "Oslo") -> [String] {
        let l: String = loc.trimmingCharacters(in: .whitespacesAndNewlines)
        if l.count < 3 { return [] }
        let lastPart: String = (l.split(separator: ",").last.map { (s: Substring) -> String in String(s) } ?? "").trimmingCharacters(in: .whitespaces)
        let noFirst: String = KalRx37.replace("^[^,]*,\\s*", l, "")
        var out: [String] = []
        let cands: [String] = [l, l + ", " + city, lastPart + ", " + city, noFirst]
        for c in cands where c.count > 2 && !out.contains(c) { out.append(c) }
        return out
    }

    /// «Hoffsveien 4, Sofienlund» fra adressedelene, ellers navnet + område, ellers det brukeren skrev.
    static func label(road: String?, number: String?, area: String?, name: String?, fallback: String) -> String {
        let ar: String = area ?? ""
        if let r = road, !r.isEmpty {
            var s: String = r
            if let n = number, !n.isEmpty { s += " " + n }
            if !ar.isEmpty { s += ", " + ar }
            return s
        }
        if let n = name, !n.isEmpty { return ar.isEmpty || ar == n ? n : n + ", " + ar }
        return fallback
    }

    /// Apple Kart / Google Maps (veibeskrivelse) for et treff.
    static func appleURL(_ loc: String, _ h: KalGeoHit37) -> URL? {
        let q: String = loc.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "https://maps.apple.com/?q=" + q + "&ll=" + String(h.la ?? 0) + "," + String(h.lo ?? 0))
    }

    static func directionsURL(_ h: KalGeoHit37, apple: Bool) -> URL? {
        if apple { return URL(string: "https://maps.apple.com/?daddr=" + String(h.la ?? 0) + "," + String(h.lo ?? 0) + "&dirflg=r") }
        return URL(string: "https://www.google.com/maps/dir/?api=1&destination=" + String(h.la ?? 0) + "," + String(h.lo ?? 0))
    }
}
