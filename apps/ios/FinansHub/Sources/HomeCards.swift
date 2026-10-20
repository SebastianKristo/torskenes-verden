import SwiftUI

/* ---------------- Homelab-hjem: karusell med klokke og vær + pakker ---------------- */

/// Ekstrafeltene i været (MET Locationforecast + Nowcast + Sunrise). Alt er valgfritt, så eldre servere virker fortsatt.
struct WeatherX: Hashable {
    struct Hour: Hashable { var label: String; var symbol: String; var temp: Double?; var mm: Double }
    struct Day: Hashable { var label: String; var symbol: String; var min: Double?; var max: Double?; var mm: Double }
    var place = ""
    var temp: Double?
    var text = ""
    var symbol = ""
    var feels: Double?
    var hi: Double?
    var lo: Double?
    var wind: Double?
    var gust: Double?
    var windDir = ""
    var precipNow: Double?
    var precip24: Double?
    var humidity: Double?
    var dew: Double?
    var uv: Double?
    var pressure: Double?
    var pressureTrend = ""
    var visibility = ""
    var sunrise: Date?
    var sunset: Date?
    var dayLength = ""
    var nowcast = ""
    var hours: [Hour] = []
    var days: [Day] = []

    init(_ o: [String: Any]) {
        place = JS.str(o, "place") ?? ""
        temp = JS.num(o, "temp")
        text = JS.str(o, "text") ?? ""
        symbol = JS.str(o, "symbol") ?? JS.str(o, "code") ?? ""
        feels = JS.num(o, "feels")
        hi = JS.num(o, "hi") ?? JS.num(o, "max")
        lo = JS.num(o, "lo") ?? JS.num(o, "min")
        // Vind kan være et tall (m/s) eller et objekt {speed, gust, dir}; detaljene ligger også i windInfo og flate felt.
        let w = JS.dict(o, "wind") ?? JS.dict(o, "windInfo")
        wind = JS.num(o, "wind") ?? JS.num(w, "speed")
        gust = JS.num(o, "windGust") ?? JS.num(w, "gust")
        windDir = JS.str(o, "windDirText") ?? JS.str(w, "dirText") ?? WeatherX.compass(JS.num(o, "windDir") ?? JS.num(w, "dir"))
        precipNow = JS.num(o, "precipNow") ?? JS.num(o, "precip")
        precip24 = JS.num(o, "precip24")
        humidity = JS.num(o, "humidity")
        dew = JS.num(o, "dew")
        uv = JS.num(o, "uv")
        pressure = JS.num(o, "pressure")
        pressureTrend = JS.str(o, "pressureTrend") ?? ""
        if let n = o["visibility"] as? NSNumber { visibility = "\(n.intValue) km" } else { visibility = JS.str(o, "visibility") ?? "" }
        sunrise = JS.date(o["sunrise"])
        sunset = JS.date(o["sunset"])
        if let t = JS.str(o, "dayLengthText") { dayLength = t } else if let m = o["dayLength"] as? NSNumber { dayLength = "\(m.intValue / 60) t \(m.intValue % 60) m" } else { dayLength = JS.str(o, "dayLength") ?? "" }
        nowcast = JS.str(JS.dict(o, "nowcast"), "text") ?? JS.str(o, "nowcast") ?? ""
        hours = JS.list(o, "hours").map { h -> Hour in
            var l = JS.str(h, "label") ?? JS.str(h, "t") ?? ""
            if l.contains("T"), let d = JS.date(l) { l = JS.fmt(d, "HH") }
            return Hour(label: l, symbol: JS.str(h, "symbol") ?? "", temp: JS.num(h, "temp"), mm: JS.num(h, "mm") ?? JS.num(h, "precip") ?? 0)
        }
        days = JS.list(o, "days").map { d -> Day in
            let date = JS.str(d, "date") ?? ""
            let label = JS.str(d, "label") ?? parseDay(date).map { JS.fmt($0, "EEE").capitalized } ?? date
            return Day(label: label, symbol: JS.str(d, "symbol") ?? "", min: JS.num(d, "min"), max: JS.num(d, "max"), mm: JS.num(d, "mm") ?? 0)
        }
    }

    static func compass(_ deg: Double?) -> String {
        guard let deg else { return "" }
        let n = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"]
        return n[Int(((deg.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360) + 22.5) / 45) % 8]
    }
}
