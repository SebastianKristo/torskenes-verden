import SwiftUI

/* ---------------- Prompt 22: værsiden – formatering og Yr mot Pent ---------------- */

/// Små hjelpere med samme regler som logikken i Vaer.dc.html.
enum WxFmt22 {
    static let weekdays: [String] = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"]
    static let letters: [String] = ["S", "M", "T", "O", "T", "F", "L"]
    static let d16: [String] = ["N", "NNØ", "NØ", "ØNØ", "Ø", "ØSØ", "SØ", "SSØ", "S", "SSV", "SV", "VSV", "V", "VNV", "NV", "NNV"]

    /// Mens data hentes: dag mellom 07 og 18.
    static func dayByClock() -> Bool {
        let h: Int = Calendar.current.component(.hour, from: Date())
        return h >= 7 && h < 18
    }

    static func deg(_ v: Double) -> String { "\(Int(v.rounded()))°" }
    static func degOpt(_ v: Double?) -> String { v.map { deg($0) } ?? "–" }

    /// 1 desimal med komma, uten «,0».
    static func f1(_ v: Double) -> String {
        let r: Double = (v * 10).rounded() / 10
        if r == r.rounded() { return String(Int(r)) }
        return String(format: "%.1f", r).replacingOccurrences(of: ".", with: ",")
    }

    static func desc(_ c: Int) -> String {
        if c == 0 { return "Klart" }
        if c <= 2 { return "Delvis skyet" }
        if c == 3 { return "Overskyet" }
        if c <= 48 { return "Tåke" }
        if c <= 57 { return "Yr" }
        if c <= 67 { return "Regn" }
        if c <= 77 { return "Snø" }
        if c <= 82 { return "Regnbyger" }
        if c <= 86 { return "Snøbyger" }
        return "Torden"
    }

    /// Ikonnøkkel (ICN i designet): sun, moon, part, cloud, fog, rain, snow, storm.
    static func icon(_ c: Int, night: Bool) -> String {
        if c <= 1 { return night ? "moon" : "sun" }
        if c <= 2 { return night ? "moon" : "part" }
        if c == 3 { return "cloud" }
        if c <= 48 { return "fog" }
        if c <= 67 || (c >= 80 && c <= 82) { return "rain" }
        if c <= 86 { return "snow" }
        return "storm"
    }

    /// Fargen på ikonet (ICC i designet).
    static func iconColor(_ k: String) -> Color {
        switch k {
        case "sun": return Color(hex: "#ffd36b")
        case "moon": return Color(hex: "#f2f2f2")
        case "part": return Color(hex: "#ffe7a8")
        case "rain": return Color(hex: "#bfe6ff")
        case "fog": return Color(hex: "#e6ecf3")
        case "storm": return Color(hex: "#ffd36b")
        default: return Color.white
        }
    }

    static func weekday(_ day: String) -> String {
        guard let d = parseDay(day) else { return "" }
        let i: Int = Calendar(identifier: .gregorian).component(.weekday, from: d) - 1
        return weekdays[Swift.max(0, Swift.min(6, i))]
    }

    static func letter(_ day: String) -> String {
        guard let d = parseDay(day) else { return "" }
        let i: Int = Calendar(identifier: .gregorian).component(.weekday, from: d) - 1
        return letters[Swift.max(0, Swift.min(6, i))]
    }

    static func dayNum(_ day: String) -> String {
        guard let d = parseDay(day) else { return "" }
        return String(Calendar(identifier: .gregorian).component(.day, from: d))
    }

    /// «Søndag 18. oktober» (med år når year = true).
    static func longDate(_ day: String, year: Bool = false) -> String {
        guard let d = parseDay(day) else { return day }
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = year ? "EEEE d. MMMM yyyy" : "EEEE d. MMMM"
        let s: String = f.string(from: d)
        return s.prefix(1).uppercased() + String(s.dropFirst())
    }

    /// «HH:mm» fra «yyyy-MM-ddTHH:mm».
    static func hm(_ s: String) -> String { s.count >= 16 ? String(s.dropFirst(11).prefix(5)) : "–" }

    /// Timer som desimaltall (08:30 → 8,5).
    static func hours(_ s: String) -> Double? {
        guard s.count >= 16 else { return nil }
        let h: Double = Double(String(s.dropFirst(11).prefix(2))) ?? 0
        let m: Double = Double(String(s.dropFirst(14).prefix(2))) ?? 0
        return h + m / 60
    }

    /* ---------- Månen (samme formel som designet) ---------- */

    /// Alder i døgn (0–29,53) for tidspunktet.
    static func moonAge(_ d: Date) -> Double {
        let days: Double = d.timeIntervalSince1970 / 86400.0
        let a: Double = (days - 6.8).truncatingRemainder(dividingBy: 29.53)
        return a < 0 ? a + 29.53 : a
    }

    static func moonIllum(_ age: Double) -> Double { (1 - cos(2 * Double.pi * age / 29.53)) / 2 }

    static func moonName(_ age: Double) -> String {
        if age < 1.8 { return "Nymåne" }
        if age < 7.4 { return "Voksende sigd" }
        if age < 9.2 { return "Første kvarter" }
        if age < 14 { return "Voksende måne" }
        if age < 15.6 { return "Fullmåne" }
        if age < 21.2 { return "Avtagende måne" }
        if age < 23 { return "Siste kvarter" }
        if age < 27.7 { return "Avtagende sigd" }
        return "Nymåne"
    }
}

/// Yr mot Pent: enighet, dager side om side og timer. Pent = StormGeo/ECMWF via Open-Meteo (models=ecmwf_ifs025).
struct WxCompare22 {
    struct Side {
        var code: Int? = nil
        var max: Double? = nil
        var min: Double? = nil
        var precip: Double? = nil
    }
    struct Day: Identifiable {
        var date: String
        var yr: Side
        var pent: Side
        var diff: Double?
        var id: String { date }
    }
    struct Hour: Identifiable {
        var t: String
        var yr: Double?
        var pent: Double?
        var yrMm: Double
        var pentMm: Double
        var id: String { t }
    }

    var agreement: String = ""
    var avgDiff: Double? = nil
    var days: [Day] = []
    var hours: [Hour] = []

    /// Pent-temperatur for timen (nøkkel «yyyy-MM-ddTHH»).
    func pentTemp(_ t: String) -> Double? {
        let k: String = String(t.prefix(13))
        return hours.first(where: { $0.t.hasPrefix(k) })?.pent
    }

    /// Snittavviket i makstemperatur (fra serveren, ellers regnet ut).
    var avg: Double {
        if let a = avgDiff { return abs(a) }
        let ds: [Double] = days.compactMap { d -> Double? in
            if let y = d.yr.max, let p = d.pent.max { return abs(y - p) }
            if let x = d.diff { return abs(x) }
            return nil
        }
        if ds.isEmpty { return 0 }
        return ds.reduce(0, +) / Double(ds.count)
    }

    /// good | mid | bad
    var level: String {
        if ["good", "mid", "bad"].contains(agreement) { return agreement }
        let a: Double = avg
        return a < 1.5 ? "good" : a < 3 ? "mid" : "bad"
    }

    var color: Color {
        switch level {
        case "good": return Color(hex: "#6fdc8c")
        case "mid": return Color(hex: "#ffb347")
        default: return Color(hex: "#f26b5e")
        }
    }

    var title: String {
        switch level {
        case "good": return "Yr og Pent er enige"
        case "mid": return "Litt uenige · " + WxFmt22.f1(avg) + "° i snitt"
        default: return "Uenige · " + WxFmt22.f1(avg) + "° i snitt"
        }
    }

    var subtitle: String { "Snitt avvik i makstemperatur: " + WxFmt22.f1(avg) + "° over \(days.count) dager" }

    /* ---------- Lesing ---------- */

    /// Kode fra et felt som kan være WMO-tall, MET-symbol («partlycloudy_day») eller ikonnøkkel («rain»).
    static func code(_ o: [String: Any]?) -> Int? {
        if let c = JS.int(o, "code") { return c }
        guard let s = JS.str(o, "icon") ?? JS.str(o, "symbol") else { return nil }
        if let n = Int(s) { return n }
        let v: String = s.lowercased()
        if v.contains("thunder") || v == "storm" { return 95 }
        if v.contains("heavysnow") { return 75 }
        if v.contains("snowshowers") { return 85 }
        if v.contains("snow") { return 73 }
        if v.contains("sleet") { return 67 }
        if v.contains("heavyrain") { return 65 }
        if v.contains("rainshowers") { return 81 }
        if v.contains("lightrain") { return 61 }
        if v.contains("rain") { return 63 }
        if v.contains("fog") { return 45 }
        if v.hasPrefix("cloud") { return 3 }
        if v.contains("partlycloudy") || v == "part" { return 2 }
        if v.contains("fair") { return 1 }
        return 0
    }

    static func side(_ o: [String: Any]?) -> Side {
        var s: Side = Side()
        s.code = code(o)
        s.max = JS.num(o, "max") ?? JS.num(o, "hi")
        s.min = JS.num(o, "min") ?? JS.num(o, "lo")
        s.precip = JS.num(o, "precip") ?? JS.num(o, "mm")
        return s
    }

    /// Tall eller objekt med temp → temperatur.
    static func temp(_ v: Any?) -> Double? {
        if let n = v as? NSNumber { return n.doubleValue }
        if let d = v as? [String: Any] { return JS.num(d, "temp") ?? JS.num(d, "t") }
        return nil
    }

    static func mm(_ v: Any?) -> Double {
        if let d = v as? [String: Any] { return JS.num(d, "mm") ?? JS.num(d, "precip") ?? 0 }
        return 0
    }

    /// compare fra /api/weather/full (prompt 22-kontrakten).
    init?(fromFull o: [String: Any]?) {
        guard let o else { return nil }
        agreement = JS.str(o, "agreement") ?? ""
        avgDiff = JS.num(o, "avgDiff")
        days = JS.list(o, "days").compactMap { d -> Day? in
            guard let date = JS.str(d, "date") else { return nil }
            return Day(date: date, yr: WxCompare22.side(JS.dict(d, "yr")), pent: WxCompare22.side(JS.dict(d, "pent")), diff: JS.num(d, "diff"))
        }
        hours = JS.list(o, "hours").compactMap { h -> Hour? in
            guard let t = JS.str(h, "time") ?? JS.str(h, "t") else { return nil }
            return Hour(t: t, yr: WxCompare22.temp(h["yr"]), pent: WxCompare22.temp(h["pent"]), yrMm: WxCompare22.mm(h["yr"]), pentMm: WxCompare22.mm(h["pent"]))
        }
        if days.isEmpty && hours.isEmpty { return nil }
    }

    /// Eldre /api/weather/compare: {hours:[{t, yr:{temp,mm}, ecmwf:{temp,mm}}], days:[{date, yr:{hi,lo,mm}, ecmwf:{…}, diffHi}]}.
    init?(legacy o: [String: Any]) {
        days = JS.list(o, "days").compactMap { d -> Day? in
            guard let date = JS.str(d, "date") else { return nil }
            return Day(date: date, yr: WxCompare22.side(JS.dict(d, "yr")), pent: WxCompare22.side(JS.dict(d, "ecmwf") ?? JS.dict(d, "pent")), diff: JS.num(d, "diffHi") ?? JS.num(d, "diff"))
        }
        hours = JS.list(o, "hours").compactMap { h -> Hour? in
            guard let raw = JS.str(h, "t") ?? JS.str(h, "time") else { return nil }
            let pentRaw: Any? = h["ecmwf"] ?? h["pent"]
            return Hour(t: WxCompare22.localKey(raw), yr: WxCompare22.temp(h["yr"]), pent: WxCompare22.temp(pentRaw), yrMm: WxCompare22.mm(h["yr"]), pentMm: WxCompare22.mm(pentRaw))
        }
        if days.isEmpty && hours.isEmpty { return nil }
    }

    /// ISO med sone («…Z») → lokal nøkkel «yyyy-MM-ddTHH:mm» i Oslo-tid; lokal tekst beholdes.
    static func localKey(_ s: String) -> String {
        if !(s.hasSuffix("Z") || s.contains("+")) { return s }
        guard let d = JS.date(s) else { return s }
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Oslo")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return f.string(from: d)
    }
}
