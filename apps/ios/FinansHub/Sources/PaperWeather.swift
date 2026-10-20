import SwiftUI

/* ---------------- Værappen (Vaer.dc.html): trykk på temperaturen på Hjem ---------------- */
// Prompt 22: siden følger designet nøyaktig. Systemfonten (SF Pro) brukes bare her. Kartknapp nede til venstre,
// ☰ (Steder) nede til høyre, animert bakgrunn, kortet «Yr og Pent» og detaljark for alle kortene.
// Visningene ligger i Weather22*.swift, ikonene i Glyphs22.swift.

/// GET /api/weather/full: nå, i dag, i går, timer, 7 dager, månen, neste regn og (prompt 22) compare med Pent.
struct WeatherFull {
    struct Hour: Identifiable, Hashable {
        var t: String = ""
        var temp: Double = 0
        var feels: Double = 0
        var code: Int = 0
        var isDay: Bool = true
        var precipProb: Double = 0
        var precip: Double = 0
        var wind: Double = 0
        var gust: Double = 0
        var windDir: Double? = nil
        /// Prompt 22: timedata for detaljarkene (MET). nil fra eldre servere.
        var humidity: Double? = nil
        var uv: Double? = nil
        /// Sikt i km.
        var visibility: Double? = nil
        var pressure: Double? = nil
        var id: String { t }
        var date: Date { WeatherFull.parse(t) ?? Date() }
        var hour: String { t.count >= 13 ? String(t.dropFirst(11).prefix(2)) : "" }
        var hourInt: Int { Int(hour) ?? 0 }
        var day: String { String(t.prefix(10)) }

        init() {}
        init(_ h: [String: Any]) {
            t = JS.str(h, "t") ?? JS.str(h, "time") ?? ""
            let tp: Double = JS.num(h, "temp") ?? 0
            temp = tp
            feels = JS.num(h, "feels") ?? JS.num(h, "apparent") ?? tp
            code = JS.int(h, "code") ?? 0
            isDay = JS.bool(h, "isDay") ?? true
            precipProb = JS.num(h, "precipProb") ?? JS.num(h, "pp") ?? 0
            precip = JS.num(h, "precip") ?? JS.num(h, "mm") ?? 0
            wind = JS.num(h, "wind") ?? 0
            gust = JS.num(h, "gust") ?? JS.num(h, "gusts") ?? 0
            windDir = JS.num(h, "windDir")
            humidity = JS.num(h, "humidity") ?? JS.num(h, "rh")
            uv = JS.num(h, "uv") ?? JS.num(h, "uvIndex")
            pressure = JS.num(h, "pressure") ?? JS.num(h, "pres")
            let vis: Double? = JS.num(h, "visibility") ?? JS.num(h, "vis")
            // Meter fra Open-Meteo, km fra serveren.
            if let v = vis { visibility = v > 200 ? v / 1000.0 : v }
        }
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
    var lat: Double?
    var lon: Double?
    /// Prompt 22: Yr mot Pent. nil = ikke hentet ennå (eller eldre server: hentes fra /weather/compare).
    var compare: WxCompare22?
    /// 0 = henter, 1 = klar, 2 = Pent svarte ikke.
    var compareState: Int = 0
    var loadedAt: Date = Date()

    init() {}
    init(_ o: [String: Any]) {
        let pl = JS.dict(o, "place")
        placeId = JS.str(pl, "id") ?? "oslo"
        placeName = JS.str(pl, "name") ?? "Oslo"
        lat = JS.num(pl, "lat")
        lon = JS.num(pl, "lon")
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
        hours = WeatherFull.mergeHours(o)
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
        if let cmp = WxCompare22(fromFull: JS.dict(o, "compare")) {
            compare = cmp
            compareState = 1
        }
    }

    /// Timene fra «hours» og (prompt 22) eventuelle lengre lister («hours7», «hourly», «hoursAll»), slått sammen per time.
    static func mergeHours(_ o: [String: Any]) -> [Hour] {
        var byT: [String: Hour] = [:]
        let keys: [String] = ["hoursAll", "hours7", "hourly", "hours"]
        for k in keys {
            for h in JS.list(o, k) {
                let x: Hour = Hour(h)
                if x.t.count < 13 { continue }
                let key: String = String(x.t.prefix(13))
                if var old = byT[key] {
                    // Senere liste (hours) vinner for grunnfeltene, men behold ekstra felt fra den lange listen.
                    var n: Hour = x
                    if n.humidity == nil { n.humidity = old.humidity }
                    if n.uv == nil { n.uv = old.uv }
                    if n.visibility == nil { n.visibility = old.visibility }
                    if n.pressure == nil { n.pressure = old.pressure }
                    old = n
                    byT[key] = old
                } else {
                    byT[key] = x
                }
            }
        }
        let all: [Hour] = Array(byT.values)
        return all.sorted { $0.t < $1.t }
    }

    static func parse(_ s: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Oslo")
        f.dateFormat = s.count > 16 ? "yyyy-MM-dd'T'HH:mm:ss" : "yyyy-MM-dd'T'HH:mm"
        return f.date(from: String(s.prefix(19)))
    }

    /// De neste 24 timene fra nå (designet: første time som slutter etter nå).
    var next24: [Hour] {
        let now = Date().addingTimeInterval(-3600)
        return Array(hours.filter { $0.date > now }.prefix(24))
    }

    func hours(on day: String) -> [Hour] { hours.filter { $0.t.hasPrefix(day) } }

    /// Timen nærmest nå (for lufttrykktrenden og «nå»-markøren).
    var nowHour: Hour? { next24.first }
}

/// WMO-kode → SF Symbol (brukes av Hjem og widgets via andre filer; beholdt).
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

extension Store {
    func loadWeatherFull(force: Bool = false) async {
        if !force, let w = weatherFull, w.placeId == weatherPlace { return }
        weatherBusy = true
        defer { weatherBusy = false }
        do {
            let q = weatherPlaceObj?.query ?? "place=\(weatherPlace)"
            let d = try await api.callAt("/api", "GET", "/weather/full?\(q)&source=met&compare=1", timeout: 20)
            let raw41: [String: Any] = JS.obj(d)
            var w: WeatherFull = WeatherFull(raw41)
            // Prompt 41: Skiføre (bare når serveren sender det, dvs. snø ≥ 15 cm og ikke slått av).
            Vaer41.shared.skiData = Ski41(JS.dict(raw41, "ski"))
            w.loadedAt = Date()
            weatherFull = w
            if w.compare == nil { await loadWeatherCompare22(w.placeId) }
        } catch let e as APIError {
            message = e.status == 404 ? "Værappen finnes ikke på serveren ennå. Oppdater homelab." : e.message
        } catch {
            message = error.localizedDescription
        }
    }

    /// Eldre server uten compare i /weather/full: hent /weather/compare og gjør det om til samme form.
    func loadWeatherCompare22(_ placeId: String) async {
        let e: String = placeId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? placeId
        var cmp: WxCompare22? = nil
        if let d = try? await api.callAt("/api", "GET", "/weather/compare?place=\(e)", timeout: 20) {
            cmp = WxCompare22(legacy: JS.obj(d))
        }
        guard var w = weatherFull, w.placeId == placeId else { return }
        w.compare = cmp
        w.compareState = cmp == nil ? 2 : 1
        weatherFull = w
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

/// Hvilket detaljark som er åpent: «forhold» (temperatur) eller et kort (uv, feel, yd, rain, vis, hum, pres, wind, sun, moon).
struct WxSheetRef22: Identifiable {
    let id: String
    let day: Int
}

struct PaperWeatherView: View {
    @Environment(Store.self) private var store
    @State private var mode: String = "temp"
    @State private var scroll: CGFloat = 0
    @State private var sheet: WxSheetRef22?
    @State private var comparing: Bool = false
    @State private var places: Bool = false
    @State private var map: Bool = false
    /// Prompt 25: to kolonner og sidepanel når bredden er minst 700 pt (Weather25.swift).
    @State private var wide: Bool = false

    var body: some View {
        let w: WeatherFull? = store.weatherFull
        let code: Int = w?.code ?? 2
        let night: Bool = !(w?.isDay ?? WxFmt22.dayByClock())
        GeometryReader { g in
            let isWide: Bool = g.size.width >= 700
            ZStack(alignment: .top) {
                // Prompt 28: ny himmel og væranimasjon (Weather28Fx.swift / Weather28Sim.swift).
                WxSky28(code: code, night: night).ignoresSafeArea()
                fx(w, code: code, night: night)
                // Prompt 40: snøfall i julemodus når det snør eller er minus («Snø i Vær og brief»).
                if Glimt40Weather.snowy(code: code, temp: w?.temp ?? 5) { Glimt40Snow(count: 22).ignoresSafeArea() }
                if isWide, let w {
                    WxWide25(w: w, width: g.size.width, mode: $mode, open: { k in open(k) }, openDay: { i in openDay(i) },
                             compare: { openCompare() }, fullMap: { map = true })
                } else {
                    scrollBody(w)
                }
                WxTopBar22(w: w, scrolled: isWide ? false : scroll > 200)
                // Prompt 30: to flytende glassknapper nær bunnen (ingen linje).
                WxBottomButtons30(map: { Haptics.shared.tap(); map = true }, places: { Haptics.shared.tap(); places = true })
                if isWide { WxSidePanel25(width: g.size.width) }
            }
            .frame(width: g.size.width, height: g.size.height)
            .onAppear { wide = isWide }
            .onChange(of: isWide) { _, v in
                wide = v
                if !v { WxPanel25.shared.close() }
            }
        }
        .onDisappear { WxPanel25.shared.close() }
        .foregroundStyle(.white)
        .environment(\.colorScheme, .dark)
        .sheet(item: $sheet) { ref in
            if let w = store.weatherFull {
                WxDetailSheet22(w: w, kind: ref.id, day: ref.day).presentationDetents([.large]).presentationBackground(Color(hex: "#17191e"))
            }
        }
        // Prompt 30: Yr mot Storm i fullskjerm (Ferdig-pille øverst til høyre, kantsveip lukker).
        .fullScreenCover(isPresented: $comparing) {
            if let w = store.weatherFull {
                WxCompareSheet22(w: w).edgeSwipeClose30 { comparing = false }
            }
        }
        .sheet(isPresented: $places) {
            WxPlacesSheet22().presentationDetents([.large]).presentationBackground(Color(hex: "#17191e"))
        }
        .fullScreenCover(isPresented: $map) {
            WxMapView22(name: w?.placeName ?? store.weatherPlaceObj?.name ?? "Kart", lat: w?.lat ?? store.weatherPlaceObj?.lat ?? 59.91,
                        lon: w?.lon ?? store.weatherPlaceObj?.lon ?? 10.75)
        }
        // Prompt 30: ett lett haptisk tikk når et ark, kartet, Steder eller Yr mot Storm lukkes (ikke ved åpning).
        .dismissHaptic30(sheet != nil)
        .dismissHaptic30(comparing)
        .dismissHaptic30(places)
        .dismissHaptic30(map)
        .dismissHaptic30(WxPanel25.shared.isOpen)
        .task {
            await store.loadWeatherFull()
            await store.loadWeatherPlaces()
            await Vaer41.shared.load(store)
        }
        // Prompt 41: «Rediger Vær» (rekkefølge, vis/skjul, Glimt øverst/nederst, Skiføre av/på).
        .sheet(isPresented: Binding<Bool>(get: { Vaer41.shared.sheet }, set: { (v: Bool) in if !v { Vaer41.shared.done(store) } })) {
            Vaer41Sheet().presentationDetents([.medium, .large]).presentationBackground(Color(hex: "#17191e"))
        }
    }

    private func scrollBody(_ w: WeatherFull?) -> some View {
        ScrollView {
            VStack(spacing: 12) {
                GeometryReader { g in
                    Color.clear.preference(key: PaperScrollKey.self, value: g.frame(in: .named("wxscroll")).minY)
                }
                .frame(height: 0)
                if let w {
                    content(w)
                } else {
                    ProgressView().tint(.white).padding(.top, 160)
                }
            }
            .padding(.horizontal, 16).padding(.top, 56).padding(.bottom, WxBottomButtons30.height + 16)
        }
        .scrollIndicators(.hidden)
        .coordinateSpace(name: "wxscroll")
        .onPreferenceChange(PaperScrollKey.self) { v in
            let s: CGFloat = Swift.max(0, -v)
            if abs(s - scroll) > 2 { Vaer41.shared.lastScroll = Date() }
            if abs(s - scroll) > 8 { scroll = s }
        }
        .refreshable { await store.loadWeatherFull(force: true) }
    }

    @ViewBuilder private func content(_ w: WeatherFull) -> some View {
        // Prompt 41: kortene i brukerens rekkefølge, skjulte kort borte, og Skiføre når det er snø (Vaer41.swift).
        // Hold inne et kort (0,6 s) eller «Rediger kort» nederst for å redigere. Scroll virker hele tiden.
        ForEach(Array(Vaer41.shared.visible.enumerated()), id: \.element) { (pair: (offset: Int, element: String)) in
            card41(pair.element, w).vaer41Wiggle(pair.offset)
        }
        Vaer41EditButton().padding(.top, 6)
        Button { store.openLink(w.yrUrl) } label: {
            Text("Data: MET Norge · Se også yr.no ↗").font(.system(size: 12.5)).underline().opacity(0.85).padding(.top, 4)
        }
        .buttonStyle(.plain)
        if w.mock {
            Text("Eksempeldata – serveren fikk ikke kontakt med MET.").font(.system(size: 11.5)).opacity(0.7)
        }
    }

    @ViewBuilder private func card41(_ k: String, _ w: WeatherFull) -> some View {
        switch k {
        case "na": WxHeader22(w: w).opacity(Double(Swift.max(0, 1 - scroll / 220)))
        case "ski": if let s = Vaer41.shared.skiData { Vaer41SkiCard(s: s) }
        case "timer": WxHourCard22(w: w, mode: $mode) { openDay(0) }
        case "dager10": WxDaysCard22(w: w, mode: mode) { i in openDay(i) }
        case "yrstorm": WxCompareCard22(w: w) { openCompare() }
        case "vind": WxWindCard22(w: w).onTapGesture { open("wind") }
        case "mane": WxMoonCard22(w: w).onTapGesture { open("moon") }
        case "detaljer": WxTileGrid22(w: w) { k in open(k) }
        // Prompt 39: Glimt-personlighetene oppsummerer ukas vær og sammenligner med forrige uke (WxWeek39.swift).
        case "glimtuka": WxWeek39Card(w: w)
        default: EmptyView()
        }
    }

    /// Prompt 28: animasjonen får soloppgang/-nedgang for i dag (sunF).
    private func fx(_ w: WeatherFull?, code: Int, night: Bool) -> some View {
        let cfg: WxFxCfg28 = WxFxCfg28.from(code: code, night: night)
        let rise: Date? = WeatherFull.parse(w?.sunrise ?? "")
        let set: Date? = WeatherFull.parse(w?.sunset ?? "")
        return WxFx28(cfg: cfg, sunrise: rise, sunset: set).ignoresSafeArea()
    }

    private func open(_ k: String) {
        Haptics.shared.tap()
        if wide { WxPanel25.shared.open(WxSheetRef22(id: k, day: 0)) } else { sheet = WxSheetRef22(id: k, day: 0) }
    }

    /// «Forhold» for en dag: sidepanel på bred skjerm, ellers ark.
    private func openDay(_ i: Int) {
        if wide { Haptics.shared.tap(); WxPanel25.shared.open(WxSheetRef22(id: "forhold", day: i)) } else { sheet = WxSheetRef22(id: "forhold", day: i) }
    }

    /// Prompt 30: alltid fullskjerm (også på bred skjerm, innholdet maks 760 pt midtstilt).
    private func openCompare() {
        Haptics.shared.tap()
        comparing = true
    }
}
