import SwiftUI
import Charts

/* ---------------- Værappen (Vaer.dc.html): trykk på temperaturen på Hjem ---------------- */

/// GET /api/weather/full: nå, i dag, i går, 48 timer, 7 dager, månen og neste regn (Open-Meteo, cache 10 min på serveren).
struct WeatherFull {
    struct Hour: Identifiable, Hashable {
        let t: String
        let temp: Double
        let feels: Double
        let code: Int
        let isDay: Bool
        let precipProb: Double
        let precip: Double
        let wind: Double
        let gust: Double
        let windDir: Double?
        var id: String { t }
        var date: Date { WeatherFull.parse(t) ?? Date() }
        var hour: String { t.count >= 13 ? String(t.dropFirst(11).prefix(2)) : "" }
    }
    struct Day: Identifiable, Hashable {
        let date: String
        let hi: Double
        let lo: Double
        let code: Int
        let precipProb: Double
        let precipSum: Double
        let sunrise: String
        let sunset: String
        let uvMax: Double
        let windMax: Double
        var id: String { date }
    }

    var placeId = "oslo"
    var placeName = "Oslo"
    var mock = false
    var temp: Double = 0
    var feels: Double = 0
    var code = 0
    var text = ""
    var isDay = true
    var wind: Double = 0
    var gust: Double = 0
    var windDir: Double?
    var humidity: Double?
    var dew: Double?
    var pressure: Double?
    var pressureTrend = "steady"
    var visibility: Double?
    var uv: Double = 0
    var hi: Double?
    var lo: Double?
    var sunrise = ""
    var sunset = ""
    var daylight: Int?
    var precipSum: Double = 0
    var yHi: Double?
    var yLo: Double?
    var hours: [Hour] = []
    var days: [Day] = []
    var moonIllum: Double = 0
    var moonPhase: Double = 0
    var moonName = ""
    var nextFull = ""
    var nextNew = ""
    var nextRainT: String?
    var nextRainMm: Double?
    var kind = "cloudy"
    var yrUrl = "https://www.yr.no/"

    init() {}
    init(_ o: [String: Any]) {
        let pl = JS.dict(o, "place")
        placeId = JS.str(pl, "id") ?? "oslo"
        placeName = JS.str(pl, "name") ?? "Oslo"
        mock = JS.bool(o, "mock") ?? false
        let c = JS.dict(o, "current")
        temp = JS.num(c, "temp") ?? 0
        feels = JS.num(c, "feels") ?? temp
        code = JS.int(c, "code") ?? 0
        text = JS.str(c, "text") ?? ""
        isDay = JS.bool(c, "isDay") ?? true
        wind = JS.num(c, "wind") ?? 0
        gust = JS.num(c, "gust") ?? 0
        windDir = JS.num(c, "windDir")
        humidity = JS.num(c, "humidity")
        dew = JS.num(c, "dew")
        pressure = JS.num(c, "pressure")
        pressureTrend = JS.str(c, "pressureTrend") ?? "steady"
        visibility = JS.num(c, "visibility")
        uv = JS.num(c, "uv") ?? 0
        let t = JS.dict(o, "today")
        hi = JS.num(t, "hi")
        lo = JS.num(t, "lo")
        sunrise = JS.str(t, "sunrise") ?? ""
        sunset = JS.str(t, "sunset") ?? ""
        daylight = JS.int(t, "daylight")
        precipSum = JS.num(t, "precipSum") ?? 0
        let y = JS.dict(o, "yesterday")
        yHi = JS.num(y, "hi")
        yLo = JS.num(y, "lo")
        hours = JS.list(o, "hours").map { h in
            Hour(t: JS.str(h, "t") ?? "", temp: JS.num(h, "temp") ?? 0, feels: JS.num(h, "feels") ?? JS.num(h, "temp") ?? 0, code: JS.int(h, "code") ?? 0,
                 isDay: JS.bool(h, "isDay") ?? true, precipProb: JS.num(h, "precipProb") ?? 0, precip: JS.num(h, "precip") ?? 0,
                 wind: JS.num(h, "wind") ?? 0, gust: JS.num(h, "gust") ?? 0, windDir: JS.num(h, "windDir"))
        }
        days = JS.list(o, "days").map { d in
            Day(date: JS.str(d, "date") ?? "", hi: JS.num(d, "hi") ?? 0, lo: JS.num(d, "lo") ?? 0, code: JS.int(d, "code") ?? 0,
                precipProb: JS.num(d, "precipProb") ?? 0, precipSum: JS.num(d, "precipSum") ?? 0, sunrise: JS.str(d, "sunrise") ?? "",
                sunset: JS.str(d, "sunset") ?? "", uvMax: JS.num(d, "uvMax") ?? 0, windMax: JS.num(d, "windMax") ?? 0)
        }
        let m = JS.dict(o, "moon")
        moonIllum = JS.num(m, "illum") ?? 0
        moonPhase = JS.num(m, "phase") ?? 0
        moonName = JS.str(m, "name") ?? ""
        nextFull = JS.str(m, "nextFull") ?? ""
        nextNew = JS.str(m, "nextNew") ?? ""
        let nr = JS.dict(o, "nextRain")
        nextRainT = JS.str(nr, "t")
        nextRainMm = JS.num(nr, "mm")
        kind = JS.str(o, "kind") ?? "cloudy"
        yrUrl = JS.str(o, "yrUrl") ?? "https://www.yr.no/"
    }

    static func parse(_ s: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Oslo")
        f.dateFormat = s.count > 16 ? "yyyy-MM-dd'T'HH:mm:ss" : "yyyy-MM-dd'T'HH:mm"
        return f.date(from: s)
    }

    /// De neste 24 timene fra nå.
    var next24: [Hour] {
        let now = Date().addingTimeInterval(-3600)
        return Array(hours.filter { $0.date >= now }.prefix(24))
    }

    func hours(on day: String) -> [Hour] { hours.filter { $0.t.hasPrefix(day) } }
}

/// WMO-kode → SF Symbol.
func wxSymbol(_ code: Int, day: Bool = true) -> String {
    switch code {
    case 0: return day ? "sun.max.fill" : "moon.stars.fill"
    case 1, 2: return day ? "cloud.sun.fill" : "cloud.moon.fill"
    case 3: return "cloud.fill"
    case 45, 48: return "cloud.fog.fill"
    case 51, 53, 55, 56, 57: return "cloud.drizzle.fill"
    case 65, 67, 82: return "cloud.heavyrain.fill"
    case 61, 63, 66, 80, 81: return "cloud.rain.fill"
    case 71, 73, 75, 77, 85, 86: return "cloud.snow.fill"
    case 95, 96, 99: return "cloud.bolt.rain.fill"
    default: return "cloud.fill"
    }
}

private func deg(_ v: Double) -> String { "\(Int(v.rounded()))°" }
private func comma(_ v: Double, _ d: Int = 1) -> String { String(format: "%.\(d)f", v).replacingOccurrences(of: ".", with: ",") }

extension Store {
    func loadWeatherFull(force: Bool = false) async {
        if !force, let w = weatherFull, w.placeId == weatherPlace { return }
        weatherBusy = true
        defer { weatherBusy = false }
        do {
            let q = weatherPlaceObj?.query ?? "place=\(weatherPlace)"
            let d = try await api.callAt("/api", "GET", "/weather/full?\(q)&source=met", timeout: 20)
            weatherFull = WeatherFull(JS.obj(d))
        } catch let e as APIError {
            message = e.status == 404 ? "Værappen finnes ikke på serveren ennå. Oppdater homelab." : e.message
        } catch {
            message = error.localizedDescription
        }
    }

    func openWeather() {
        if paperTapBlocked { return }
        Haptics.shared.tap()
        weatherOpen = true
        Task { await self.loadWeatherFull() }
    }

    func setWeatherPlace(_ id: String) {
        Haptics.shared.select()
        weatherPlace = id
        Task { await self.loadWeatherFull(force: true) }
    }
}

/* ---------- Skjermen ---------- */

struct PaperWeatherView: View {
    @Environment(Store.self) private var store
    @State private var mode = "temp"
    @State private var compact = false
    @State private var sheetDay: String?
    @State private var comparing = false


    var body: some View {
        ZStack(alignment: .top) {
            sky.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 12) {
                    offsetReader
                    if let w = store.weatherFull {
                        header(w)
                        hourCard(w)
                        daysCard(w)
                        WxWindTile(w: w)
                        WxMoonTile(w: w)
                        tiles(w)
                        Button { comparing = true } label: {
                            HStack {
                                Image(systemName: "chart.xyaxis.line")
                                Text("Sammenlign Yr og Storm").font(PF.ui(14, .semibold))
                                Spacer()
                                Text("›")
                            }
                            .padding(.horizontal, 16).frame(minHeight: 50)
                            .background(Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        Button { store.openLink(w.yrUrl) } label: {
                            Text("Data: MET Norge · Åpne i yr.no ↗").font(PF.ui(12.5, .semibold)).foregroundStyle(.white.opacity(0.85)).padding(.vertical, 10)
                        }
                        .buttonStyle(.plain)
                        if w.mock { Text("Eksempeldata – serveren fikk ikke kontakt med MET.").font(PF.ui(11.5)).foregroundStyle(.white.opacity(0.7)) }
                    } else {
                        ProgressView().tint(.white).padding(.top, 160)
                    }
                }
                .padding(.horizontal, 16).padding(.top, 54).padding(.bottom, 90)
            }
            .coordinateSpace(name: "wxscroll")
            .onPreferenceChange(PaperScrollKey.self) { v in
                let c = v < -150
                if c != compact { withAnimation(.easeOut(duration: 0.2)) { compact = c } }
            }
            .refreshable { await store.loadWeatherFull(force: true) }
            topBar
            VStack { Spacer(); WxPlaceBar() }
        }
        .foregroundStyle(.white)
        .environment(\.colorScheme, .dark)
        .sheet(item: Binding(get: { sheetDay.map { WxDayRef(id: $0) } }, set: { sheetDay = $0?.id })) { ref in
            if let w = store.weatherFull { WxConditionsSheet(w: w, day: ref.id).presentationDetents([.large]) }
        }
        .sheet(isPresented: $comparing) {
            WxCompareSheet(place: store.weatherFull?.placeId ?? "oslo").presentationDetents([.large])
        }
        .task { await store.loadWeatherFull() }
    }

    private var offsetReader: some View {
        GeometryReader { g in Color.clear.preference(key: PaperScrollKey.self, value: g.frame(in: .named("wxscroll")).minY) }.frame(height: 0)
    }

    private var sky: some View {
        let k = store.weatherFull?.kind ?? "cloudy"
        let c: [Color]
        switch k {
        case "clear": c = [Color(hex: "#2f6fb5"), Color(hex: "#6fa9e0"), Color(hex: "#a9cdee")]
        case "night": c = [Color(hex: "#0b1428"), Color(hex: "#1b2a4d"), Color(hex: "#2c3d66")]
        case "rain": c = [Color(hex: "#2e3a48"), Color(hex: "#4a5868"), Color(hex: "#68778a")]
        case "snow": c = [Color(hex: "#6f8399"), Color(hex: "#9fb2c5"), Color(hex: "#c9d6e2")]
        case "fog": c = [Color(hex: "#6c757e"), Color(hex: "#8f989f"), Color(hex: "#b1b8be")]
        default: c = [Color(hex: "#3f5368"), Color(hex: "#5f7489"), Color(hex: "#8798aa")]
        }
        return ZStack(alignment: .top) {
            LinearGradient(colors: c, startPoint: .top, endPoint: .bottom)
            if k == "clear" {
                RadialGradient(colors: [Color(hex: "#ffe7a3").opacity(0.55), .clear], center: .top, startRadius: 10, endRadius: 320).frame(height: 420)
            }
        }
    }

    private var topBar: some View {
        HStack {
            Button { store.weatherOpen = false } label: {
                Text("‹ Hjem").font(PF.ui(13, .semibold)).foregroundStyle(.white).padding(.horizontal, 12).frame(height: 34)
                    .background(Color.black.opacity(0.25), in: Capsule())
            }
            .buttonStyle(.plain)
            Spacer()
            if compact, let w = store.weatherFull {
                VStack(spacing: 0) {
                    Text(w.placeName).font(PF.ui(14, .bold))
                    Text("\(deg(w.temp)) | \(w.text)").font(PF.ui(12)).opacity(0.85)
                }
                .transition(.opacity)
            }
            Spacer()
            Color.clear.frame(width: 70, height: 34)
        }
        .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 6)
        .background(compact ? AnyShapeStyle(.ultraThinMaterial) : AnyShapeStyle(Color.clear))
    }

    private func header(_ w: WeatherFull) -> some View {
        VStack(spacing: 2) {
            Text(w.placeId == "pos" ? "MIN POSISJON" : "VÆRET I").font(PF.mono(11)).tracking(1.4).opacity(0.85)
            Text(w.placeName).font(PF.serif(32, medium: true))
            Text(deg(w.temp)).font(PF.serif(96)).lineLimit(1)
            Text(w.text).font(PF.ui(17, .semibold))
            Text("H:\(w.hi.map(deg) ?? "–")  L:\(w.lo.map(deg) ?? "–")  · Føles som \(deg(w.feels))").font(PF.ui(14)).opacity(0.9)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 20).padding(.bottom, 10)
        .opacity(compact ? 0 : 1)
    }

    /* ---------- Neste 24 timer ---------- */

    private func hourCard(_ w: WeatherFull) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Button { Haptics.shared.tap(); sheetDay = String(isoDay(Date())) } label: {
                    HStack(spacing: 6) {
                        Text("Forhold ›").font(PF.ui(13.5, .bold))
                        Text(modeTitle).font(PF.ui(12)).opacity(0.75)
                    }
                }
                .buttonStyle(.plain)
                Spacer()
                HStack(spacing: 4) {
                    modeButton("temp", "thermometer.medium")
                    modeButton("rain", "drop.fill")
                    modeButton("wind", "wind")
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(Array(w.next24.enumerated()), id: \.element.id) { i, h in hourCell(h, first: i == 0) }
                }
            }
        }
        .padding(14)
        .background(Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var modeTitle: String { mode == "rain" ? "Nedbørssjanse" : mode == "wind" ? "Vind m/s" : "Temperatur" }

    private func modeButton(_ m: String, _ icon: String) -> some View {
        Button { Haptics.shared.select(); mode = m } label: {
            Image(systemName: icon).font(.system(size: 13, weight: .semibold)).frame(width: 32, height: 30)
                .background(mode == m ? Color.white.opacity(0.3) : Color.clear, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(m == "rain" ? "Nedbør" : m == "wind" ? "Vind" : "Temperatur")
    }

    private func hourCell(_ h: WeatherFull.Hour, first: Bool) -> some View {
        VStack(spacing: 6) {
            Text(first ? "Nå" : h.hour).font(PF.ui(12.5, .semibold)).opacity(0.85)
            Image(systemName: wxSymbol(h.code, day: h.isDay)).symbolRenderingMode(.multicolor).font(.system(size: 20)).frame(height: 24)
            Text(h.precipProb >= 20 ? "\(Int(h.precipProb)) %" : " ").font(PF.ui(10.5, .bold)).foregroundStyle(Color(hex: "#9fd3ff"))
            Text(cellValue(h)).font(PF.ui(15, .semibold))
        }
        .frame(minWidth: 40)
    }

    private func cellValue(_ h: WeatherFull.Hour) -> String {
        switch mode {
        case "rain": return "\(Int(h.precipProb)) %"
        case "wind": return comma(h.wind, 0)
        default: return deg(h.temp)
        }
    }

    /* ---------- 7 dager ---------- */

    private func daysCard(_ w: WeatherFull) -> some View {
        let lo = w.days.map(\.lo).min() ?? 0
        let hi = w.days.map(\.hi).max() ?? 1
        return VStack(alignment: .leading, spacing: 0) {
            Text("7 DAGER").font(PF.mono(11)).tracking(1.2).opacity(0.75).padding(.bottom, 6)
            ForEach(Array(w.days.enumerated()), id: \.element.id) { i, d in
                if i > 0 { Rectangle().fill(Color.white.opacity(0.18)).frame(height: 1) }
                Button { Haptics.shared.tap(); sheetDay = d.date } label: {
                    WxDayRow(d: d, today: i == 0, now: i == 0 ? w.temp : nil, lo: lo, hi: hi)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    /* ---------- Fliser i to kolonner ---------- */

    private func tiles(_ w: WeatherFull) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            WxSunTile(w: w)
            WxUvTile(uv: w.uv)
            WxTextTile(title: "FØLES SOM", icon: "thermometer.medium", big: deg(w.feels), text: feelsText(w))
            WxTextTile(title: "MOT I GÅR", icon: "clock.arrow.circlepath", big: yesterdayBig(w), text: yesterdayText(w))
            WxTextTile(title: "NEDBØR", icon: "drop.fill", big: comma(w.precipSum) + " mm", text: rainText(w))
            WxTextTile(title: "SIKT", icon: "eye.fill", big: w.visibility.map { comma($0, 0) + " km" } ?? "–", text: visText(w))
            WxTextTile(title: "LUFTFUKTIGHET", icon: "humidity.fill", big: w.humidity.map { "\(Int($0)) %" } ?? "–", text: w.dew.map { "Duggpunktet er \(deg($0)) akkurat nå." } ?? "")
            WxPressureTile(pressure: w.pressure, trend: w.pressureTrend)
        }
    }

    private func feelsText(_ w: WeatherFull) -> String {
        let d = w.feels - w.temp
        if d <= -2 { return "Vinden gjør at det føles kaldere." }
        if d >= 2 { return "Luftfuktigheten gjør at det føles varmere." }
        return "Omtrent som den faktiske temperaturen."
    }

    private func yesterdayBig(_ w: WeatherFull) -> String {
        guard let a = w.hi, let b = w.yHi else { return "–" }
        let d = a - b
        return abs(d) < 0.5 ? "Likt" : (d > 0 ? "+" : "−") + deg(abs(d))
    }

    private func yesterdayText(_ w: WeatherFull) -> String {
        guard let a = w.hi, let b = w.yHi else { return "Ingen tall for i går." }
        return "I dag H:\(deg(a)) · i går H:\(deg(b))"
    }

    private func rainText(_ w: WeatherFull) -> String {
        guard let t = w.nextRainT, let mm = w.nextRainMm else { return "Ikke noe regn ventet de neste dagene." }
        let h = t.count >= 16 ? String(t.dropFirst(11).prefix(5)) : t
        let day = t.hasPrefix(isoDay(Date())) ? "i dag" : "fra \(ddmm(String(t.prefix(10))))"
        return "Neste nedbør \(day) kl. \(h) (\(comma(mm)) mm)."
    }

    private func visText(_ w: WeatherFull) -> String {
        guard let v = w.visibility else { return "" }
        return v >= 10 ? "Helt klar sikt." : v >= 4 ? "God sikt." : "Nedsatt sikt."
    }

}

private struct WxDayRef: Identifiable { let id: String }

/// En dag: navn, ikon og nedbørssjanse, lav, søyle (min–maks av uka) med prikk for nå, høy.
struct WxDayRow: View {
    let d: WeatherFull.Day
    let today: Bool
    let now: Double?
    let lo: Double
    let hi: Double

    var body: some View {
        HStack(spacing: 10) {
            Text(today ? "I dag" : dayName).font(PF.ui(15, .semibold)).frame(width: 52, alignment: .leading)
            VStack(spacing: 0) {
                Image(systemName: wxSymbol(d.code)).symbolRenderingMode(.multicolor).font(.system(size: 18))
                if d.precipProb >= 20 { Text("\(Int(d.precipProb)) %").font(PF.ui(10, .bold)).foregroundStyle(Color(hex: "#9fd3ff")) }
            }
            .frame(width: 36)
            Text(deg(d.lo)).font(PF.ui(15)).opacity(0.75).frame(width: 36, alignment: .trailing)
            bar
            Text(deg(d.hi)).font(PF.ui(15, .semibold)).frame(width: 36, alignment: .leading)
        }
        .padding(.vertical, 9)
        .contentShape(Rectangle())
    }

    private var dayName: String {
        guard let date = parseDay(d.date) else { return d.date }
        let f = DateFormatter(); f.locale = Locale(identifier: "nb_NO"); f.dateFormat = "EEE"
        return f.string(from: date).capitalized.replacingOccurrences(of: ".", with: "")
    }

    private var bar: some View {
        GeometryReader { g in
            let span = Swift.max(1, hi - lo)
            let x0 = CGFloat((d.lo - lo) / span) * g.size.width
            let x1 = CGFloat((d.hi - lo) / span) * g.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.18))
                Capsule().fill(LinearGradient(colors: [Color(hex: "#8fd3ff"), Color(hex: "#ffd36b"), Color(hex: "#ff9a5a")], startPoint: .leading, endPoint: .trailing))
                    .frame(width: Swift.max(6, x1 - x0)).offset(x: x0)
                if let now {
                    Circle().fill(Color.white).frame(width: 7, height: 7)
                        .overlay(Circle().stroke(Color.black.opacity(0.35), lineWidth: 1))
                        .offset(x: CGFloat((now - lo) / span) * g.size.width - 3.5)
                }
            }
            .frame(height: 5)
            .frame(maxHeight: .infinity)
        }
        .frame(height: 20)
    }
}

/// Felles flis: etikett med ikon øverst.
struct WxTile<C: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: () -> C
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                Image(systemName: icon).font(.system(size: 11, weight: .bold))
                Text(title).font(PF.mono(10.5)).tracking(1)
            }
            .opacity(0.75)
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
        .background(Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct WxTextTile: View {
    let title: String
    let icon: String
    let big: String
    let text: String
    var body: some View {
        WxTile(title: title, icon: icon) {
            Text(big).font(PF.serif(30, medium: true)).lineLimit(1).minimumScaleFactor(0.6)
            Spacer(minLength: 0)
            Text(text).font(PF.ui(12.5)).opacity(0.85).fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Vind: rader for vind, kast og retning, og kompass.
struct WxWindTile: View {
    let w: WeatherFull
    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 5) { Image(systemName: "wind").font(.system(size: 11, weight: .bold)); Text("VIND").font(PF.mono(10.5)).tracking(1) }.opacity(0.75)
                row("Vind", "\(comma(w.wind)) m/s")
                row("Vindkast", "\(comma(w.gust)) m/s")
                row("Retning", w.windDir.map { "\(Int($0))° \(compass($0))" } ?? "–")
            }
            Compass(dir: w.windDir ?? 0, speed: w.wind).frame(width: 110, height: 110)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func row(_ a: String, _ b: String) -> some View {
        VStack(spacing: 6) {
            HStack { Text(a).font(PF.ui(14)); Spacer(); Text(b).font(PF.ui(14, .semibold)).opacity(0.85) }
            Rectangle().fill(Color.white.opacity(0.18)).frame(height: 1)
        }
    }

    private func compass(_ d: Double) -> String {
        let names = ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"]
        return names[Int(((d + 22.5).truncatingRemainder(dividingBy: 360)) / 45) % 8]
    }
}

private struct Compass: View {
    let dir: Double
    let speed: Double
    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.35), style: StrokeStyle(lineWidth: 6, dash: [1, 3]))
            VStack { Text("N").font(PF.ui(10, .heavy)); Spacer(); Text("S").font(PF.ui(10, .heavy)).opacity(0.75) }.padding(4)
            HStack { Text("V").font(PF.ui(10, .heavy)).opacity(0.75); Spacer(); Text("Ø").font(PF.ui(10, .heavy)).opacity(0.75) }.padding(4)
            Capsule().fill(Color.white).frame(width: 3, height: 76).rotationEffect(.degrees(dir))
            Circle().fill(Color(hex: "#14325a").opacity(0.75)).frame(width: 44, height: 44)
            VStack(spacing: 0) {
                Text(comma(speed, 0)).font(PF.ui(15, .heavy))
                Text("m/s").font(PF.ui(8.5, .bold))
            }
        }
    }
}

/// Måne: belyst andel, neste fullmåne og nymåne, og månebilde.
struct WxMoonTile: View {
    let w: WeatherFull
    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 5) { Image(systemName: "moon.fill").font(.system(size: 11, weight: .bold)); Text(w.moonName.uppercased()).font(PF.mono(10.5)).tracking(1) }.opacity(0.75)
                row("Belyst", "\(Int(w.moonIllum)) %")
                row("Neste fullmåne", ddmm(w.nextFull))
                row("Neste nymåne", ddmm(w.nextNew))
            }
            MoonDisc(phase: w.moonPhase).frame(width: 76, height: 76)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func row(_ a: String, _ b: String) -> some View {
        VStack(spacing: 6) {
            HStack { Text(a).font(PF.ui(14)); Spacer(); Text(b).font(PF.ui(14, .semibold)).opacity(0.85) }
            Rectangle().fill(Color.white.opacity(0.18)).frame(height: 1)
        }
    }
}

/// Månen tegnet med en skygge som flyttes etter fasen (0 = ny, 0,5 = full).
private struct MoonDisc: View {
    let phase: Double
    var body: some View {
        GeometryReader { g in
            let s = g.size.width
            let lit = 1 - abs(phase - 0.5) * 2
            let shift = CGFloat(phase < 0.5 ? -1 : 1) * s * CGFloat(lit)
            ZStack {
                Circle().fill(Color(hex: "#f1ead6"))
                Circle().fill(Color(hex: "#14284a")).offset(x: shift)
            }
            .frame(width: s, height: s)
            .clipShape(Circle())
        }
    }
}

/// Soloppgang og solnedgang: solkurve over døgnet med horisont og solprikk.
struct WxSunTile: View {
    let w: WeatherFull
    var body: some View {
        let rise = WeatherFull.parse(w.sunrise)
        let set = WeatherFull.parse(w.sunset)
        let now = Date()
        let afterSet = set.map { now > $0 } ?? false
        WxTile(title: afterSet ? "SOLOPPGANG" : "SOLNEDGANG", icon: afterSet ? "sunrise.fill" : "sunset.fill") {
            Text(afterSet ? hm(w.days.dropFirst().first?.sunrise ?? w.sunrise) : hm(w.sunset)).font(PF.serif(30, medium: true))
            SunCurve(rise: rise, set: set).frame(height: 44)
            Text(afterSet ? "Solnedgang \(hm(w.sunset))" : "Soloppgang \(hm(w.sunrise))" + (w.daylight.map { " · \($0 / 60) t \($0 % 60) min lys" } ?? ""))
                .font(PF.ui(12)).opacity(0.85).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func hm(_ s: String) -> String { s.count >= 16 ? String(s.dropFirst(11).prefix(5)) : "–" }
}

private struct SunCurve: View {
    let rise: Date?
    let set: Date?
    var body: some View {
        GeometryReader { g in
            let wd = g.size.width, h = g.size.height
            let hz = h * 0.62
            let start = Calendar.current.startOfDay(for: Date())
            let frac = CGFloat(Date().timeIntervalSince(start) / 86400)
            let amp = h * 0.36
            let y: (CGFloat) -> CGFloat = { f in
                let a = Double(f) * 2 * Double.pi - Double.pi / 2
                return hz - CGFloat(sin(a)) * amp
            }
            ZStack {
                Path { p in
                    p.move(to: CGPoint(x: 0, y: y(0)))
                    for i in 1...48 { let f = CGFloat(i) / 48; p.addLine(to: CGPoint(x: f * wd, y: y(f))) }
                }
                .stroke(Color.white.opacity(0.6), lineWidth: 2)
                Rectangle().fill(Color.white.opacity(0.45)).frame(height: 1).position(x: wd / 2, y: hz)
                Circle().fill(Color.white).frame(width: 9, height: 9).position(x: frac * wd, y: y(frac))
            }
        }
    }
}

/// UV-indeks med fargeskala.
struct WxUvTile: View {
    let uv: Double
    var body: some View {
        WxTile(title: "UV-INDEKS", icon: "sun.max.fill") {
            Text("\(Int(uv.rounded()))").font(PF.serif(30, medium: true))
            Text(level).font(PF.ui(14, .semibold))
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(LinearGradient(colors: [Color(hex: "#5bd16b"), Color(hex: "#f5d33b"), Color(hex: "#f59a3b"), Color(hex: "#e5484d"), Color(hex: "#a855f7")], startPoint: .leading, endPoint: .trailing))
                    Circle().fill(Color.white).frame(width: 9, height: 9).offset(x: CGFloat(Swift.min(11, uv) / 11) * (g.size.width - 9))
                }
            }
            .frame(height: 9)
            Text(tip).font(PF.ui(12)).opacity(0.85).fixedSize(horizontal: false, vertical: true)
        }
    }

    private var level: String { uv < 3 ? "Lav" : uv < 6 ? "Moderat" : uv < 8 ? "Høy" : uv < 11 ? "Svært høy" : "Ekstrem" }
    private var tip: String { uv < 3 ? "Ingen solbeskyttelse trengs." : "Bruk solkrem midt på dagen." }
}

/// Lufttrykk: skala fra lavt til høyt med trend ↑↓.
struct WxPressureTile: View {
    let pressure: Double?
    let trend: String
    var body: some View {
        WxTile(title: "LUFTTRYKK", icon: "gauge.with.dots.needle.33percent") {
            ZStack {
                Circle().trim(from: 0.125, to: 0.875).stroke(Color.white.opacity(0.35), style: StrokeStyle(lineWidth: 7, dash: [1, 3]))
                    .rotationEffect(.degrees(90))
                Capsule().fill(Color.white).frame(width: 3, height: 12).offset(y: -38).rotationEffect(.degrees(angle))
                VStack(spacing: 0) {
                    Text(trend == "rising" ? "↑" : trend == "falling" ? "↓" : "→").font(PF.ui(12, .heavy))
                    Text(pressure.map { "\(Int($0))" } ?? "–").font(PF.ui(16, .heavy))
                    Text("hPa").font(PF.ui(9, .bold))
                }
            }
            .frame(width: 96, height: 96)
            .frame(maxWidth: .infinity)
        }
    }

    /// 960–1060 hPa over 270°.
    private var angle: Double {
        let v = Swift.min(1060, Swift.max(960, pressure ?? 1013))
        return (v - 960) / 100 * 270 - 135
    }
}

/* ---------- «Forhold»-arket ---------- */

struct WxConditionsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let w: WeatherFull
    @State var day: String
    @State private var feels = false

    init(w: WeatherFull, day: String) {
        self.w = w
        _day = State(initialValue: day)
    }

    var body: some View {
        let hrs = w.hours(on: day)
        let d = w.days.first { $0.date == day }
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Button { dismiss() } label: {
                        Text("×").font(.system(size: 20, weight: .semibold)).frame(width: 34, height: 34).background(Color.white.opacity(0.12), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Lukk")
                    Spacer()
                    Text("Forhold").font(PF.ui(16, .bold))
                    Spacer()
                    Color.clear.frame(width: 34, height: 34)
                }
                dayPicker
                Text(longDay(day)).font(PF.ui(13)).opacity(0.75)
                if let d {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(deg(d.hi)).font(PF.serif(40, medium: true))
                        Image(systemName: wxSymbol(d.code)).symbolRenderingMode(.multicolor).font(.system(size: 26))
                        Spacer()
                        Text("H:\(deg(d.hi)) L:\(deg(d.lo))").font(PF.ui(14, .semibold)).opacity(0.85)
                    }
                }
                Picker("Visning", selection: $feels) {
                    Text("Faktisk").tag(false)
                    Text("Føles som").tag(true)
                }
                .pickerStyle(.segmented)
                if hrs.count > 1 {
                    WxTempChart(hours: hrs, feels: feels).frame(height: 200)
                    Text("SJANSE FOR NEDBØR").font(PF.mono(10.5)).tracking(1).opacity(0.75).padding(.top, 6)
                    WxRainChart(hours: hrs).frame(height: 130)
                } else {
                    Text("Ingen timevarsel for denne dagen.").font(PF.ui(13.5)).opacity(0.75)
                }
            }
            .padding(18)
        }
        .foregroundStyle(.white)
        .background(Color(hex: "#17191e"))
        .environment(\.colorScheme, .dark)
    }

    private var dayPicker: some View {
        HStack(spacing: 4) {
            ForEach(w.days) { d in
                let on = d.date == day
                Button { Haptics.shared.select(); day = d.date } label: {
                    VStack(spacing: 2) {
                        Text(short(d.date)).font(PF.ui(11, .semibold)).opacity(0.75)
                        Text(String(d.date.suffix(2))).font(PF.ui(15, .bold)).foregroundStyle(on ? Color(hex: "#17191e") : .white)
                            .frame(width: 32, height: 32).background(on ? Color.white : Color.clear, in: Circle())
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func short(_ s: String) -> String {
        guard let date = parseDay(s) else { return "" }
        let f = DateFormatter(); f.locale = Locale(identifier: "nb_NO"); f.dateFormat = "EEEEE"
        return f.string(from: date).uppercased()
    }

    private func longDay(_ s: String) -> String {
        guard let date = parseDay(s) else { return s }
        let f = DateFormatter(); f.locale = Locale(identifier: "nb_NO"); f.dateFormat = "EEEE d. MMMM"
        return f.string(from: date).capitalized(with: Locale(identifier: "nb_NO"))
    }
}

/// Temperaturgraf: passerte timer prikket, kommende heltrukket, med fyll under.
struct WxTempChart: View {
    let hours: [WeatherFull.Hour]
    let feels: Bool

    var body: some View {
        let now = Date()
        let past = hours.filter { $0.date <= now.addingTimeInterval(3600) }
        let coming = hours.filter { $0.date >= now.addingTimeInterval(-3600) }
        Chart {
            ForEach(hours) { h in
                AreaMark(x: .value("Tid", h.date), y: .value("Temp", value(h)))
                    .foregroundStyle(LinearGradient(colors: [Color(hex: "#5ec8d8").opacity(0.45), Color(hex: "#2b6ea8").opacity(0.15)], startPoint: .top, endPoint: .bottom))
                    .interpolationMethod(.catmullRom)
            }
            ForEach(past) { h in
                LineMark(x: .value("Tid", h.date), y: .value("Temp", value(h)), series: .value("Del", "før"))
                    .foregroundStyle(Color(hex: "#7fd6e3").opacity(0.7))
                    .lineStyle(StrokeStyle(lineWidth: 2, dash: [3, 3]))
                    .interpolationMethod(.catmullRom)
            }
            ForEach(coming) { h in
                LineMark(x: .value("Tid", h.date), y: .value("Temp", value(h)), series: .value("Del", "etter"))
                    .foregroundStyle(Color(hex: "#7fd6e3"))
                    .lineStyle(StrokeStyle(lineWidth: 2.5))
                    .interpolationMethod(.catmullRom)
            }
            RuleMark(x: .value("Nå", now)).foregroundStyle(Color.white.opacity(0.5)).lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
        }
        .chartYAxis { AxisMarks(position: .trailing) { _ in AxisGridLine().foregroundStyle(Color.white.opacity(0.12)); AxisValueLabel() } }
        .chartXAxis { AxisMarks(values: .stride(by: .hour, count: 6)) { _ in AxisValueLabel(format: .dateTime.hour()) } }
    }

    private func value(_ h: WeatherFull.Hour) -> Double { feels ? h.feels : h.temp }
}

/// Søyler for sjanse for nedbør per time.
struct WxRainChart: View {
    let hours: [WeatherFull.Hour]
    var body: some View {
        Chart {
            ForEach(hours) { h in
                BarMark(x: .value("Tid", h.date, unit: .hour), y: .value("Sjanse", h.precipProb))
                    .foregroundStyle(Color(hex: "#5aa9ff"))
            }
        }
        .chartYScale(domain: 0...100)
        .chartYAxis { AxisMarks(position: .trailing, values: [0, 50, 100]) { _ in AxisGridLine().foregroundStyle(Color.white.opacity(0.12)); AxisValueLabel() } }
        .chartXAxis { AxisMarks(values: .stride(by: .hour, count: 6)) { _ in AxisValueLabel(format: .dateTime.hour()) } }
    }
}


/* ---------- Yr mot Storm (ECMWF) ---------- */

/// Neste 24 timer (temperatur som to linjer og nedbør som søyler) og 7 dager med avvik i maks og hvor enige de er.
/// Storm har ikke åpent API, så ECMWF fra Open-Meteo brukes som nærmeste kilde (GET /api/weather/compare).
struct WxCompareSheet: View {
    @Environment(Store.self) private var store
    let place: String
    @State private var hours: [WxCmpHour] = []
    @State private var days: [WxCmpDay] = []
    @State private var agreement: Double?
    @State private var placeName = ""
    @State private var error: String?
    @State private var loaded = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Yr mot Storm").font(PF.serif(28, medium: true))
                Text(placeName.isEmpty ? "Neste 24 timer og 7 dager" : "\(placeName) · neste 24 timer og 7 dager").font(PF.ui(13)).opacity(0.8)
                if let error { Text(error).font(PF.ui(13)).foregroundStyle(Color(hex: "#f08a76")) }
                if !loaded { ProgressView().tint(.white).frame(maxWidth: .infinity).padding(40) }
                if !hours.isEmpty { chartCard }
                if !days.isEmpty { tableCard }
                Text("Yr: api.met.no. Storm har ikke et åpent API, så ECMWF (Open-Meteo) brukes som nærmeste kilde.")
                    .font(PF.ui(11.5)).opacity(0.7).fixedSize(horizontal: false, vertical: true)
            }
            .padding(20)
        }
        .foregroundStyle(.white)
        .background(LinearGradient(colors: [Color(hex: "#2b4f7a"), Color(hex: "#162438")], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .task { await load() }
    }

    private var chartCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 14) {
                legend(Color(hex: "#7fd6e3"), "Yr")
                legend(Color(hex: "#f2b36b"), "Storm (ECMWF)")
                Spacer()
                if let a = agreement { Text("Enighet \(Int(a.rounded())) %").font(PF.ui(12, .semibold)) }
            }
            Chart {
                ForEach(hours) { h in
                    BarMark(x: .value("Tid", h.t), y: .value("mm", h.yrMm), width: .ratio(0.4))
                        .foregroundStyle(Color(hex: "#7fd6e3").opacity(0.35))
                        .position(by: .value("Kilde", "Yr"))
                    BarMark(x: .value("Tid", h.t), y: .value("mm", h.ecMm), width: .ratio(0.4))
                        .foregroundStyle(Color(hex: "#f2b36b").opacity(0.35))
                        .position(by: .value("Kilde", "Storm"))
                }
            }
            .frame(height: 60)
            .chartYAxis(.hidden)
            .chartXAxis(.hidden)
            Chart {
                ForEach(hours) { h in
                    LineMark(x: .value("Tid", h.t), y: .value("Temp", h.yrTemp), series: .value("Kilde", "Yr"))
                        .foregroundStyle(Color(hex: "#7fd6e3")).interpolationMethod(.catmullRom)
                }
                ForEach(hours) { h in
                    LineMark(x: .value("Tid", h.t), y: .value("Temp", h.ecTemp), series: .value("Kilde", "Storm"))
                        .foregroundStyle(Color(hex: "#f2b36b")).interpolationMethod(.catmullRom)
                }
            }
            .frame(height: 160)
            .chartXAxis { AxisMarks(values: .stride(by: .hour, count: 6)) { _ in AxisValueLabel(format: .dateTime.hour()) } }
            .chartYAxis { AxisMarks(position: .trailing) { _ in AxisGridLine().foregroundStyle(Color.white.opacity(0.12)); AxisValueLabel() } }
        }
        .padding(14)
        .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func legend(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 5) {
            Capsule().fill(c).frame(width: 14, height: 4)
            Text(t).font(PF.ui(12, .semibold))
        }
    }

    private var tableCard: some View {
        VStack(spacing: 0) {
            HStack {
                Text("DAG").frame(maxWidth: .infinity, alignment: .leading)
                Text("YR").frame(width: 70, alignment: .trailing)
                Text("STORM").frame(width: 70, alignment: .trailing)
                Text("ENIG").frame(width: 50, alignment: .trailing)
            }
            .font(PF.mono(10)).opacity(0.7).padding(.horizontal, 14).padding(.vertical, 10)
            ForEach(days) { d in
                Rectangle().fill(Color.white.opacity(0.12)).frame(height: 1)
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(d.label).font(PF.ui(14, .semibold))
                        if abs(d.diffHi) >= 1 { Text(String(format: "%+.0f° i maks", d.diffHi)).font(PF.ui(11)).foregroundStyle(abs(d.diffHi) >= 3 ? Color(hex: "#f08a76") : Color.white.opacity(0.7)) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text("\(Int(d.yrHi.rounded()))° / \(Int(d.yrLo.rounded()))°").font(PF.ui(13)).frame(width: 70, alignment: .trailing)
                    Text("\(Int(d.ecHi.rounded()))° / \(Int(d.ecLo.rounded()))°").font(PF.ui(13)).frame(width: 70, alignment: .trailing)
                    Text("\(Int(d.agree.rounded())) %").font(PF.ui(13, .semibold)).foregroundStyle(d.agree >= 75 ? Color(hex: "#8fd9a8") : d.agree >= 50 ? Color.white : Color(hex: "#f08a76"))
                        .frame(width: 50, alignment: .trailing)
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
            }
        }
        .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func load() async {
        let e = place.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? place
        do {
            let d = try await store.api.callAt("/api", "GET", "/weather/compare?place=\(e)", timeout: 20)
            let o = JS.obj(d)
            placeName = JS.str(JS.dict(o, "place"), "name") ?? ""
            hours = JS.list(o, "hours").compactMap { WxCmpHour($0) }
            days = JS.list(o, "days").compactMap { WxCmpDay($0) }
            agreement = JS.num(o, "agreement")
            error = nil
        } catch let e as APIError {
            error = e.status == 404 ? "Sammenligningen finnes ikke på serveren ennå. Oppdater homelab." : e.message
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }
}

struct WxCmpHour: Identifiable {
    let t: Date
    let yrTemp, ecTemp, yrMm, ecMm: Double
    var id: Date { t }
    init?(_ o: [String: Any]) {
        guard let t = JS.date(o["t"]) else { return nil }
        self.t = t
        let y = JS.dict(o, "yr"), e = JS.dict(o, "ecmwf")
        yrTemp = JS.num(y, "temp") ?? 0; ecTemp = JS.num(e, "temp") ?? 0
        yrMm = JS.num(y, "mm") ?? 0; ecMm = JS.num(e, "mm") ?? 0
    }
}

struct WxCmpDay: Identifiable {
    let date: String
    let yrHi, yrLo, ecHi, ecLo, diffHi, agree: Double
    var id: String { date }
    init?(_ o: [String: Any]) {
        guard let d = JS.str(o, "date") else { return nil }
        date = d
        let y = JS.dict(o, "yr"), e = JS.dict(o, "ecmwf")
        yrHi = JS.num(y, "hi") ?? 0; yrLo = JS.num(y, "lo") ?? 0
        ecHi = JS.num(e, "hi") ?? 0; ecLo = JS.num(e, "lo") ?? 0
        diffHi = JS.num(o, "diffHi") ?? (yrHi - ecHi)
        agree = JS.num(o, "agree") ?? 0
    }
    var label: String {
        guard let d = parseDay(date) else { return date }
        if Calendar.current.isDateInToday(d) { return "I dag" }
        return JS.fmt(d, "EEE d.").capitalized(with: Locale(identifier: "nb_NO"))
    }
}
