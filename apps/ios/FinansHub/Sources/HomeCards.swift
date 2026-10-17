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

/// SF Symbol for en MET-symbolkode («partlycloudy_day», «rainshowers_night» …), ellers ut fra teksten.
func weatherSymbol(_ code: String, text: String = "") -> String {
    let c = code.lowercased()
    let night = c.hasSuffix("_night") || c.hasSuffix("_polartwilight")
    if !c.isEmpty {
        if c.contains("thunder") { return "cloud.bolt.rain.fill" }
        if c.contains("snow") { return "cloud.snow.fill" }
        if c.contains("sleet") { return "cloud.sleet.fill" }
        if c.contains("rainshowers") { return night ? "cloud.moon.rain.fill" : "cloud.sun.rain.fill" }
        if c.contains("heavyrain") { return "cloud.heavyrain.fill" }
        if c.contains("rain") { return "cloud.rain.fill" }
        if c.contains("fog") { return "cloud.fog.fill" }
        if c.contains("partlycloudy") || c.contains("fair") { return night ? "cloud.moon.fill" : "cloud.sun.fill" }
        if c.contains("clearsky") { return night ? "moon.stars.fill" : "sun.max.fill" }
        if c.contains("cloudy") { return "cloud.fill" }
    }
    let t = text.lowercased()
    if t.contains("torden") { return "cloud.bolt.rain.fill" }
    if t.contains("snø") || t.contains("sludd") { return "cloud.snow.fill" }
    if t.contains("regn") || t.contains("byger") { return "cloud.rain.fill" }
    if t.contains("tåke") { return "cloud.fog.fill" }
    if t.contains("lettskyet") || t.contains("delvis") || t.contains("halvskyet") { return "cloud.sun.fill" }
    if t.contains("sky") || t.contains("overskyet") { return "cloud.fill" }
    if t.contains("sol") || t.contains("klar") { return "sun.max.fill" }
    return "cloud.sun.fill"
}

private func degText(_ v: Double?) -> String { v.map { "\(Int($0.rounded()))°" } ?? "–" }
private func mmText(_ v: Double) -> String { String(format: v < 10 ? "%.1f" : "%.0f", v).replacingOccurrences(of: ".", with: ",") }

/// Klokke og vær (kompakt, like stort som Pakker-kortet): tid, ikon og temperatur, «føles som», høy/lav,
/// en kort linje, 6 timer, nowcast, de neste 3 dagene og chips for sol, UV og lufttrykk.
struct ClockWeather: View {
    @Environment(Store.self) private var store
    var body: some View {
        let x = store.homeWeather
        let w = store.mobileHome?.weather
        TimelineView(.everyMinute) { ctx in
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(JS.fmt(ctx.date, "HH:mm")).font(.system(size: 46, weight: .light)).monospacedDigit()
                        Text(longDate(ctx.date)).font(.subheadline).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    if x != nil || w != nil {
                        VStack(alignment: .trailing, spacing: 2) {
                            HStack(spacing: 6) {
                                Image(systemName: weatherSymbol(x?.symbol ?? "", text: x?.text ?? w?.text ?? "")).symbolRenderingMode(.multicolor).font(.system(size: 24))
                                Text(degText(x?.temp ?? w?.temp)).font(.system(size: 30, weight: .semibold)).monospacedDigit()
                            }
                            let t = x?.text ?? w?.text ?? ""
                            if !t.isEmpty { Text(t).font(.footnote).foregroundStyle(.white.opacity(0.8)).lineLimit(1) }
                            let extra: [String] = [x?.feels.map { "Føles \(degText($0))" }, (x?.hi ?? w?.max).map { "↑ \(degText($0))" }, (x?.lo ?? w?.min).map { "↓ \(degText($0))" }].compactMap { $0 }
                            if !extra.isEmpty { Text(extra.joined(separator: " · ")).font(.caption).foregroundStyle(.white.opacity(0.6)).lineLimit(1) }
                        }
                    }
                }
                if let x { details(x) }
                Spacer(minLength: 0)
            }
            .padding(18).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).glass(28)
        }
    }

    @ViewBuilder private func details(_ x: WeatherX) -> some View {
        let line: [String] = [x.wind.map { "Vind \(Int($0.rounded())) m/s" + (x.windDir.isEmpty ? "" : " \(x.windDir)") + (x.gust.map { " (kast \(Int($0.rounded())))" } ?? "") },
                    x.precip24.map { "Nedbør \(mmText($0)) mm" }, x.humidity.map { "Fukt \(Int($0.rounded())) %" }].compactMap { $0 }
        if !line.isEmpty { Text(line.joined(separator: " · ")).font(.caption).foregroundStyle(.white.opacity(0.7)).lineLimit(1).minimumScaleFactor(0.8) }
        if !x.hours.isEmpty {
            HStack(spacing: 0) {
                ForEach(Array(x.hours.prefix(6).enumerated()), id: \.offset) { _, h in
                    VStack(spacing: 3) {
                        Text(h.label).font(.caption2).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
                        Image(systemName: weatherSymbol(h.symbol)).symbolRenderingMode(.multicolor).font(.system(size: 16)).frame(height: 18)
                        Text(degText(h.temp)).font(.caption.weight(.semibold)).monospacedDigit()
                        Text(h.mm > 0 ? mmText(h.mm) : " ").font(.system(size: 9)).foregroundStyle(Color(hex: "#8FC1FF"))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.vertical, 6).background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
        }
        if !x.nowcast.isEmpty {
            Label(x.nowcast, systemImage: "umbrella").font(.caption).foregroundStyle(Color.accentLight).lineLimit(2)
        }
        let days = x.days.count > 3 ? Array(x.days.dropFirst().prefix(3)) : x.days
        if !days.isEmpty {
            VStack(spacing: 4) {
                ForEach(Array(days.enumerated()), id: \.offset) { _, d in
                    HStack(spacing: 10) {
                        Text(d.label).font(.caption).frame(width: 52, alignment: .leading).lineLimit(1)
                        Image(systemName: weatherSymbol(d.symbol)).symbolRenderingMode(.multicolor).font(.system(size: 14)).frame(width: 22)
                        Text("\(degText(d.max)) / \(degText(d.min))").font(.caption.weight(.semibold)).monospacedDigit()
                        Spacer()
                        if d.mm > 0 { Text("\(mmText(d.mm)) mm").font(.caption2).foregroundStyle(Color(hex: "#8FC1FF")) }
                    }
                }
            }
        }
        let chipList: [(String, String)?] = [x.sunrise.map { ("sunrise", JS.fmt($0, "HH:mm")) }, x.sunset.map { ("sunset", JS.fmt($0, "HH:mm")) },
                     x.uv.map { ("sun.max", "UV \(Int($0.rounded()))") },
                     x.pressure.map { ("gauge.with.dots.needle.33percent", "\(Int($0.rounded())) hPa" + (x.pressureTrend == "Stigende" ? " ↑" : x.pressureTrend == "Synkende" ? " ↓" : "")) }]
        let chips = chipList.compactMap { $0 }
        if !chips.isEmpty {
            HStack(spacing: 6) {
                ForEach(chips, id: \.0) { icon, t in
                    HStack(spacing: 4) { Image(systemName: icon).font(.system(size: 10)); Text(t).font(.caption2.weight(.semibold)).lineLimit(1) }
                        .foregroundStyle(.white.opacity(0.85)).padding(.horizontal, 8).frame(height: 24).background(.white.opacity(0.1), in: Capsule())
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// «Klokke og vær» på Homelab-hjem: sveip sideveis mellom været og pakkene, med prikker under (kan trykkes).
/// Flyttes og skjules sammen med widgeten «Klokke og vær».
struct HomeCarousel: View {
    @Environment(Store.self) private var store
    @State private var page = 0
    var body: some View {
        VStack(spacing: 10) {
            TabView(selection: $page) {
                ClockWeather().padding(.horizontal, 2).tag(0)
                PackagesCard().padding(.horizontal, 2).tag(1)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: store.homeWeather == nil ? 250 : 400)
            .onChange(of: page) { _, _ in Haptics.shared.select() }
            HStack(spacing: 6) {
                ForEach(0..<2, id: \.self) { i in
                    Capsule().fill(.white.opacity(page == i ? 0.9 : 0.3)).frame(width: page == i ? 18 : 7, height: 7)
                        .frame(height: 24).contentShape(Rectangle())
                        .onTapGesture { withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { page = i } }
                        .accessibilityLabel(i == 0 ? "Klokke og vær" : "Pakker").accessibilityAddTraits(.isButton)
                }
            }
        }
    }
}
