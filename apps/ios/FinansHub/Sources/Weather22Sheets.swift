import SwiftUI

/* ---------------- Prompt 22: detaljark for alle kort og «Forhold» (Vaer.dc.html → ms / sh) ---------------- */
// Tittel i midten, × øverst til høyre, 7-dagers velger, dato, stor verdi, graf for dagen (00–24, «nå» i dag),
// skala for UV og et «Om …»-kort. Sol og Månen viser en liste for 7 dager i stedet for graf.

/// Felles ramme for arkene: mørk bakgrunn (#17191e), tittel og ×.
struct WxSheetFrame22<C: View>: View {
    let title: String
    @ViewBuilder let content: () -> C
    @Environment(\.dismiss) private var dismiss
    @Environment(\.wxInPanel25) private var inPanel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                ZStack {
                    Text(title).font(.dyn51(size: 18, weight: .bold)).frame(maxWidth: .infinity)
                    HStack {
                        Spacer()
                        // Prompt 40: samme ✕ som hovedsiden i Vær (Vaer40.swift).
                        VaerCloseButton { if inPanel { WxPanel25.shared.close() } else { dismiss() } }
                    }
                }
                content()
            }
            .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 30)
        }
        .scrollIndicators(.hidden)
        .foregroundStyle(.white)
        .background(Color(hex: "#17191e").ignoresSafeArea())
        .environment(\.colorScheme, .dark)
    }
}

/// Dagvelgeren: bokstav over dato i en sirkel (valgt = #5ec8f2).
struct WxDayPicker22: View {
    let days: [String]
    @Binding var sel: Int

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(days.enumerated()), id: \.offset) { pair in
                let on: Bool = pair.offset == sel
                Button { Haptics.shared.select(); sel = pair.offset } label: {
                    VStack(spacing: 6) {
                        Text(WxFmt22.letter(pair.element)).font(.dyn51(size: 12, weight: .heavy)).opacity(0.8)
                        Text(WxFmt22.dayNum(pair.element)).font(.dyn51(size: 17, weight: .bold))
                            .foregroundStyle(on ? Color(hex: "#0d2233") : Color.white)
                            .frame(width: 38, height: 38)
                            .background(on ? Color(hex: "#5ec8f2") : Color.clear, in: Circle())
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// Datoen under velgeren med skillelinje.
struct WxSheetDate22: View {
    let text: String
    var body: some View {
        VStack(spacing: 10) {
            Text(text).font(.dyn51(size: 16, weight: .semibold)).frame(maxWidth: .infinity)
            Rectangle().fill(Color(hex: "#2a2d34")).frame(height: 1)
        }
    }
}

/// «Om …»-kortet.
struct WxAbout22: View {
    let title: String
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Om " + title).font(.dyn51(size: 15, weight: .bold))
            Text(text).font(.dyn51(size: 14)).lineSpacing(5).foregroundStyle(Color(hex: "#c7ccd4")).fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(hex: "#20232a"), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/* ---------- Velger riktig ark ---------- */

struct WxDetailSheet22: View {
    let w: WeatherFull
    let kind: String
    let day: Int

    var body: some View {
        if kind == "forhold" {
            WxForholdSheet22(w: w, day: day)
        } else {
            WxMetricSheet22(w: w, kind: kind, day: day)
        }
    }
}

/* ---------- Data for én dag ---------- */

enum WxSeries22 {
    /// 24 verdier (00–23) for dagen; nil der timen mangler.
    static func values(_ w: WeatherFull, _ day: String, _ f: (WeatherFull.Hour) -> Double?) -> [Double?] {
        var out: [Double?] = Array(repeating: nil, count: 24)
        for h in w.hours(on: day) {
            let i: Int = h.hourInt
            if i >= 0 && i < 24 { out[i] = f(h) }
        }
        return out
    }

    /// Dagen før (yyyy-MM-dd).
    static func previous(_ day: String) -> String {
        guard let d = parseDay(day), let p = Calendar.current.date(byAdding: .day, value: -1, to: d) else { return day }
        return isoDay(p)
    }

    static func nowHour() -> Int { Calendar.current.component(.hour, from: Date()) }
}

/* ---------- Kortarkene (UV, Føles som, Mot i går, Nedbør, Sikt, Luftfuktighet, Lufttrykk, Vind, Sol, Månen) ---------- */

struct WxMetricSheet22: View {
    let w: WeatherFull
    let kind: String
    @State private var sel: Int

    init(w: WeatherFull, kind: String, day: Int) {
        self.w = w
        self.kind = kind
        _sel = State(initialValue: day)
    }

    var body: some View {
        let days: [String] = Array(w.days.prefix(7)).map(\.date)
        let m: WxMetric22 = WxMetric22(kind: kind)
        let di: Int = Swift.min(sel, Swift.max(0, days.count - 1))
        let day: String = days.isEmpty ? isoDay(Date()) : days[di]
        WxSheetFrame22(title: m.title) {
            WxDayPicker22(days: days, sel: $sel)
            WxSheetDate22(text: WxFmt22.longDate(day))
            if kind == "sun" || kind == "moon" {
                WxListPart22(w: w, kind: kind, sel: $sel)
            } else {
                WxChartPart22(w: w, m: m, day: day, today: di == 0)
            }
            if !m.scale.isEmpty { WxScale22(items: m.scale) }
            WxAbout22(title: m.title, text: m.about)
        }
    }
}

/// Oppsettet per kort (M i designet).
struct WxMetric22 {
    let kind: String
    var title: String = ""
    var bar: Bool = false
    var about: String = ""
    var line2Label: String = ""
    var minV: Double? = nil
    var maxV: Double? = nil
    var maxF: Double = 1
    var scale: [WxScaleItem22] = []

    init(kind: String) {
        self.kind = kind
        switch kind {
        case "uv":
            title = "UV-indeks"; bar = true; minV = 0; maxF = 11
            about = "UV-indeksen måler styrken på solens ultrafiolette stråling. Fra 3 og oppover bør du bruke solkrem, solbriller og skygge midt på dagen. Verdien er beregnet for skyfri himmel."
            scale = [WxScaleItem22(a: "0–2", b: "Lav", c: "#6fdc8c"), WxScaleItem22(a: "3–5", b: "Moderat", c: "#ffd34d"), WxScaleItem22(a: "6–7", b: "Høy", c: "#ff9a3d"),
                     WxScaleItem22(a: "8–10", b: "Svært høy", c: "#f2555a"), WxScaleItem22(a: "11+", b: "Ekstrem", c: "#b36bff")]
        case "feel":
            title = "Føles som"; line2Label = "Faktisk"
            about = "«Føles som» tar med vindens nedkjølende effekt (vindavkjøling) og luftfuktighet. Kald vind gjør at det føles kaldere enn termometeret viser."
        case "yd":
            title = "Mot i går"; line2Label = "Dagen før"
            about = "Sammenligner temperaturen time for time med dagen før. Den stiplede linjen er dagen før."
        case "rain":
            title = "Nedbør"; bar = true; minV = 0; maxF = 2
            about = "Viser forventet nedbørsmengde per time i millimeter. Under 0,5 mm per time er lett regn, over 4 mm er kraftig regn. Prosenten er sannsynligheten for nedbør."
        case "vis":
            title = "Sikt"; minV = 0
            about = "Sikt er hvor langt du kan se tydelig. Tåke, dis, nedbør og forurensning reduserer sikten. Over 10 km regnes som god sikt."
        case "hum":
            title = "Luftfuktighet"; minV = 0; maxV = 100
            about = "Relativ luftfuktighet er hvor mye vanndamp luften inneholder, sammenlignet med det maksimale ved samme temperatur. Duggpunktet er temperaturen der dugg eller tåke dannes."
        case "pres":
            title = "Lufttrykk"
            about = "Lufttrykket er redusert til havnivå. Stigende trykk betyr ofte bedre vær, synkende trykk kan bety at lavtrykk og nedbør er på vei. Normalt er cirka 1013 hPa."
        case "wind":
            title = "Vind"; line2Label = "Vindkast"; minV = 0
            about = "Gjennomsnittlig vind i 10 meters høyde. Vindkast er de sterkeste kortvarige vindstøtene. Over 10,8 m/s er liten kuling, over 20,8 m/s er sterk kuling."
        case "sun":
            title = "Sol"
            about = "Soloppgang og solnedgang for valgt sted. Dagslengden er tiden mellom soloppgang og solnedgang."
        default:
            title = "Månen"
            about = "Månefasen gjentas hver 29,5 dag. Belyst andel er hvor stor del av månen som er opplyst sett fra jorda."
        }
    }

    /// Verdien med enhet.
    func fmt(_ x: Double) -> String {
        switch kind {
        case "uv": return String(Int(x.rounded()))
        case "feel", "yd": return WxFmt22.deg(x)
        case "rain": return WxFmt22.f1(x) + " mm"
        case "vis": return (x >= 10 ? String(Int(x.rounded())) : WxFmt22.f1(x)) + " km"
        case "hum": return "\(Int(x.rounded())) %"
        case "pres": return WxPressureGauge22.thousands(x) + " hPa"
        default: return WxFmt22.f1(x) + " m/s"
        }
    }

    /// Etiketten på rutenettet (uten enhet).
    func gridLabel(_ x: Double) -> String {
        let f: String = fmt(x)
        let units: [String] = [" hPa", " mm", " m/s", " km"]
        var out: String = f
        for u in units { out = out.replacingOccurrences(of: u, with: "") }
        return out
    }

    func color(_ x: Double) -> Color {
        if kind != "uv" { return Color(hex: "#5ec8f2") }
        if x < 3 { return Color(hex: "#6fdc8c") }
        if x < 6 { return Color(hex: "#ffd34d") }
        if x < 8 { return Color(hex: "#ff9a3d") }
        if x < 11 { return Color(hex: "#f2555a") }
        return Color(hex: "#b36bff")
    }

    func values(_ w: WeatherFull, _ day: String) -> [Double?] {
        switch kind {
        case "uv": return WxSeries22.values(w, day) { $0.uv }
        case "feel": return WxSeries22.values(w, day) { $0.feels }
        case "yd": return WxSeries22.values(w, day) { $0.temp }
        case "rain": return WxSeries22.values(w, day) { $0.precip }
        case "vis": return WxSeries22.values(w, day) { $0.visibility }
        case "hum": return WxSeries22.values(w, day) { $0.humidity }
        case "pres": return WxSeries22.values(w, day) { $0.pressure }
        default: return WxSeries22.values(w, day) { $0.wind }
        }
    }

    func values2(_ w: WeatherFull, _ day: String) -> [Double?] {
        switch kind {
        case "feel": return WxSeries22.values(w, day) { $0.temp }
        case "yd": return WxSeries22.values(w, WxSeries22.previous(day)) { $0.temp }
        case "wind": return WxSeries22.values(w, day) { $0.gust }
        default: return []
        }
    }
}

struct WxScaleItem22 {
    let a: String
    let b: String
    let c: String
}

/// Skalaen for UV: fem fargefelt og etiketter.
struct WxScale22: View {
    let items: [WxScaleItem22]
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Skala").font(.dyn51(size: 15, weight: .bold))
            HStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.offset) { pair in
                    Rectangle().fill(Color(hex: pair.element.c))
                }
            }
            .frame(height: 8)
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
            HStack(alignment: .top, spacing: 4) {
                ForEach(Array(items.enumerated()), id: \.offset) { pair in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(pair.element.a).font(.dyn51(size: 12.5, weight: .bold))
                        Text(pair.element.b).font(.dyn51(size: 11.5)).foregroundStyle(Color(hex: "#9aa0aa"))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(14)
        .background(Color(hex: "#20232a"), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// Stor verdi, undertekst og graf for valgt dag.
struct WxChartPart22: View {
    let w: WeatherFull
    let m: WxMetric22
    let day: String
    let today: Bool

    var body: some View {
        let vv: [Double?] = m.values(w, day)
        let v2: [Double?] = m.values2(w, day)
        let have: [Double] = vv.compactMap { $0 }
        VStack(alignment: .leading, spacing: 14) {
            if have.isEmpty {
                Text("Ingen timedata for denne dagen ennå.").font(.dyn51(size: 14)).foregroundStyle(Color(hex: "#9aa0aa"))
            } else {
                head(vv, have)
                VStack(alignment: .leading, spacing: 6) {
                    Rectangle().fill(Color(hex: "#2a2d34")).frame(height: 1)
                    WxChart22(spec: spec(vv, v2, have)).padding(.vertical, 4)
                    if !m.line2Label.isEmpty { legend }
                    Rectangle().fill(Color(hex: "#2a2d34")).frame(height: 1)
                }
            }
        }
    }

    private func head(_ vv: [Double?], _ have: [Double]) -> some View {
        let nowH: Int = WxSeries22.nowHour()
        let mx: Double = have.max() ?? 0
        let mn: Double = have.min() ?? 0
        let imx: Int = vv.firstIndex(where: { $0 == mx }) ?? 0
        let imn: Int = vv.firstIndex(where: { $0 == mn }) ?? 0
        let cur: Double = (today ? vv[nowH] : nil) ?? mx
        let big: String = m.fmt(today ? cur : mx)
        var sub: String = ""
        if m.kind == "uv" { sub += WxUvTile22.level(today ? cur : mx) + " · " }
        sub += (today ? "Nå" : "Høyest") + " · maks " + m.fmt(mx) + " kl. " + String(format: "%02d", imx)
        if !m.bar { sub += " · min " + m.fmt(mn) }
        if m.kind == "rain" {
            let pp: [Double] = WxSeries22.values(w, day) { $0.precipProb }.compactMap { $0 }
            sub += " · \(Int(pp.max() ?? 0)) % sjanse"
        }
        _ = imn
        return VStack(alignment: .leading, spacing: 2) {
            Text(big).font(.dyn51(size: 34, weight: .semibold))
            Text(sub).font(.dyn51(size: 14)).foregroundStyle(Color(hex: "#9aa0aa")).fixedSize(horizontal: false, vertical: true)
        }
    }

    private var legend: some View {
        HStack(spacing: 14) {
            HStack(spacing: 6) {
                Capsule().fill(Color(hex: "#5ec8f2")).frame(width: 16, height: 3)
                Text(m.title)
            }
            HStack(spacing: 6) {
                Rectangle().stroke(style: StrokeStyle(lineWidth: 2, dash: [3, 2])).foregroundStyle(Color(hex: "#9aa0aa")).frame(width: 16, height: 1)
                Text(m.line2Label)
            }
        }
        .font(.dyn51(size: 12, weight: .bold)).foregroundStyle(Color(hex: "#9aa0aa")).padding(.top, 2)
    }

    /// Samme regler som msVals i designet: W 296, HT 150, X(i) = 4 + i/23·(W−8), Y(x) = 8 + (1 − (x−lo)/(hi−lo))·HT.
    private func spec(_ vv: [Double?], _ v2: [Double?], _ have: [Double]) -> WxChartSpec22 {
        let all: [Double] = have + v2.compactMap { $0 }
        let mn: Double = all.min() ?? 0
        let mx: Double = all.max() ?? 1
        var lo: Double = m.minV ?? floor(mn - (mx - mn) * 0.15 - 0.5)
        var hi: Double = m.maxV ?? Swift.max(lo + m.maxF, ceil(mx + (mx - mn) * 0.15 + 0.5))
        if hi - lo < 1 { hi = lo + 1 }
        if lo > mn { lo = mn }
        let W: Double = 296
        let HT: Double = 150
        let range: Double = hi - lo
        func X(_ i: Int) -> CGFloat { CGFloat(4 + Double(i) / 23 * (W - 8)) }
        func Y(_ x: Double) -> CGFloat { CGFloat(8 + (1 - (x - lo) / range) * HT) }
        var s: WxChartSpec22 = WxChartSpec22()
        s.grid = [0, 1, 2, 3].map { q -> WxTick22 in
            let val: Double = lo + range * Double(q) / 3
            return WxTick22(pos: Y(val), text: m.gridLabel(val))
        }
        let nowH: Int = WxSeries22.nowHour()
        if m.bar {
            var bars: [WxBar22] = []
            for (i, v) in vv.enumerated() {
                guard let x = v else { continue }
                let h: Double = Swift.max(1.5, (x - lo) / range * HT)
                let c: Color = today && i < nowH ? Color.white.opacity(0.25) : m.color(x)
                bars.append(WxBar22(x: X(i) - 4.5, y: CGFloat(8 + HT - h), w: 9, h: CGFloat(h), color: c))
            }
            s.bars = bars
        } else {
            let pts: [CGPoint?] = vv.enumerated().map { pair -> CGPoint? in
                guard let x = pair.element else { return nil }
                return CGPoint(x: X(pair.offset), y: Y(x))
            }
            s.line = pts
            s.areaPoints = pts.compactMap { $0 }
            s.areaBottom = CGFloat(8 + HT)
            if !v2.isEmpty {
                s.line2 = v2.enumerated().map { pair -> CGPoint? in
                    guard let x = pair.element else { return nil }
                    return CGPoint(x: X(pair.offset), y: Y(x))
                }
            }
        }
        if today {
            s.nowX = X(nowH)
            if let c = vv[nowH] { s.nowY = Y(c) }
        }
        s.xTicks = [0, 6, 12, 18].map { WxTick22(pos: X($0), text: String(format: "%02d", $0)) }
        return s
    }
}

/// Sol og Månen: rader for 7 dager (valgt dag uthevet), stor verdi over.
struct WxListPart22: View {
    let w: WeatherFull
    let kind: String
    @Binding var sel: Int

    var body: some View {
        let days: [WeatherFull.Day] = Array(w.days.prefix(7))
        let di: Int = Swift.min(sel, Swift.max(0, days.count - 1))
        VStack(alignment: .leading, spacing: 14) {
            if !days.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text(big(days[di])).font(.dyn51(size: 34, weight: .semibold))
                    Text(sub(days[di])).font(.dyn51(size: 14)).foregroundStyle(Color(hex: "#9aa0aa"))
                }
            }
            VStack(spacing: 0) {
                ForEach(Array(days.enumerated()), id: \.element.id) { pair in
                    if pair.offset > 0 { Rectangle().fill(Color(hex: "#2a2d34")).frame(height: 1) }
                    row(pair.element, pair.offset)
                }
            }
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Color(hex: "#20232a"), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private func row(_ d: WeatherFull.Day, _ i: Int) -> some View {
        let on: Bool = i == sel
        let a: String = i == 0 ? "I dag" : WxFmt22.weekday(d.date)
        return Button { Haptics.shared.select(); sel = i } label: {
            HStack(spacing: 10) {
                Text(a).font(.dyn51(size: 15, weight: .bold)).frame(width: 52, alignment: .leading)
                Text(colB(d)).font(.dyn51(size: 15, weight: .semibold)).frame(maxWidth: .infinity, alignment: .leading)
                Text(colC(d)).font(.dyn51(size: 15, weight: .semibold)).foregroundStyle(Color(hex: "#bfe6ff"))
                Text(colE(d)).font(.dyn51(size: 13)).foregroundStyle(Color(hex: "#9aa0aa")).lineLimit(1)
            }
            .padding(.horizontal, 8).padding(.vertical, 12)
            .background(on ? Color(red: 94.0 / 255.0, green: 200.0 / 255.0, blue: 242.0 / 255.0).opacity(0.16) : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func age(_ d: WeatherFull.Day) -> Double {
        let date: Date = WeatherFull.parse(d.date + "T22:00") ?? Date()
        return WxFmt22.moonAge(date)
    }

    private func length(_ d: WeatherFull.Day) -> String {
        guard let a = WeatherFull.parse(d.sunrise), let b = WeatherFull.parse(d.sunset) else { return "–" }
        let m: Int = Int((b.timeIntervalSince(a) / 60).rounded())
        return "\(m / 60) t \(m % 60) min"
    }

    private func big(_ d: WeatherFull.Day) -> String {
        if kind == "sun" { return WxFmt22.hm(d.sunrise) + " – " + WxFmt22.hm(d.sunset) }
        return WxFmt22.moonName(age(d))
    }

    private func sub(_ d: WeatherFull.Day) -> String {
        if kind == "sun" { return "Dagslengde " + length(d) }
        return "Belyst \(Int((WxFmt22.moonIllum(age(d)) * 100).rounded())) %"
    }

    private func colB(_ d: WeatherFull.Day) -> String { kind == "sun" ? "↑ " + WxFmt22.hm(d.sunrise) : WxFmt22.moonName(age(d)) }
    private func colC(_ d: WeatherFull.Day) -> String { kind == "sun" ? "↓ " + WxFmt22.hm(d.sunset) : "\(Int((WxFmt22.moonIllum(age(d)) * 100).rounded())) %" }
    private func colE(_ d: WeatherFull.Day) -> String { kind == "sun" ? length(d) : "" }
}

/* ---------- «Forhold» (temperatur og nedbørssjanse) ---------- */

struct WxForholdSheet22: View {
    let w: WeatherFull
    @State private var sel: Int
    @State private var feel: Bool = false

    init(w: WeatherFull, day: Int) {
        self.w = w
        _sel = State(initialValue: day)
    }

    var body: some View {
        let days: [WeatherFull.Day] = Array(w.days.prefix(7))
        let di: Int = Swift.min(sel, Swift.max(0, days.count - 1))
        let d: WeatherFull.Day? = days.isEmpty ? nil : days[di]
        WxSheetFrame22(title: "Forhold") {
            WxDayPicker22(days: days.map(\.date), sel: $sel)
            if let d {
                WxSheetDate22(text: WxFmt22.longDate(d.date, year: true))
                WxForholdBody22(w: w, d: d, today: di == 0, feel: $feel)
            }
        }
    }
}

struct WxForholdBody22: View {
    let w: WeatherFull
    let d: WeatherFull.Day
    let today: Bool
    @Binding var feel: Bool

    var body: some View {
        let k: String = WxFmt22.icon(d.code, night: false)
        let raw: [Double?] = WxSeries22.values(w, d.date) { feel ? $0.feels : $0.temp }
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(WxFmt22.deg(today ? w.temp : d.hi)).font(.dyn51(size: 40, weight: .bold))
                        Glyph22Icon(name: k, size: 34, color: WxFmt22.iconColor(k), stroke: 1.8)
                    }
                    Text("H:" + WxFmt22.deg(d.hi) + " L:" + WxFmt22.deg(d.lo)).font(.dyn51(size: 15, weight: .semibold)).opacity(0.6)
                }
                Spacer()
                Text(WxFmt22.desc(d.code)).font(.dyn51(size: 13)).opacity(0.6)
            }
            VStack(spacing: 0) {
                Rectangle().fill(Color(hex: "#2a2d34")).frame(height: 1)
                iconsRow.padding(.top, 8).padding(.bottom, 6)
                if raw.compactMap({ $0 }).count >= 2 {
                    WxChart22(spec: tempSpec(raw))
                } else {
                    Text("Ingen timevarsel for denne dagen.").font(.dyn51(size: 13.5)).opacity(0.75).padding(.vertical, 20)
                }
                Rectangle().fill(Color(hex: "#2a2d34")).frame(height: 1).padding(.top, 8)
            }
            toggle
            Text(feel ? "Hvordan temperaturen føles med vind og fuktighet." : "Den faktiske temperaturen.").font(.dyn51(size: 14)).opacity(0.65).padding(.horizontal, 6)
            VStack(alignment: .leading, spacing: 0) {
                Text("Sjanse for nedbør").font(.dyn51(size: 22, weight: .heavy))
                Text("Dagens sjanse: \(Int(d.precipProb)) %").font(.dyn51(size: 15)).opacity(0.6)
            }
            .padding(.top, 8)
            VStack(spacing: 0) {
                Rectangle().fill(Color(hex: "#2a2d34")).frame(height: 1)
                WxChart22(spec: rainSpec())
            }
        }
    }

    private var iconsRow: some View {
        HStack(spacing: 0) {
            ForEach(0..<12, id: \.self) { k in
                let h: Int = k * 2
                let hour: WeatherFull.Hour? = w.hours(on: d.date).first(where: { $0.hourInt == h })
                let key: String = WxFmt22.icon(hour?.code ?? d.code, night: h < 7 || h > 19)
                Glyph22Icon(name: key, size: 20, color: WxFmt22.iconColor(key), stroke: 1.8).frame(maxWidth: .infinity)
            }
        }
        .padding(.trailing, 36)
    }

    /// Prompt 52: samme glass-pille med dra som temp/regn/vind-bryteren (WxGlass52.swift).
    private var toggle: some View {
        WxGlass52(value: Binding<String>(get: { feel ? "feel" : "real" }, set: { (v: String) in feel = v == "feel" }),
                  items: [WxGlass52Item(id: "real", label: "Faktisk"), WxGlass52Item(id: "feel", label: "Føles som")],
                  fontSize: 15, height: 40, equalWidth: 136, track: Color(hex: "#24272e"), a11y: "Temperatur")
            .frame(maxWidth: .infinity)
    }

    private func seg(_ t: String, _ f: Bool) -> some View {
        Button { Haptics.shared.select(); feel = f } label: {
            Text(t).font(.dyn51(size: 15, weight: .bold)).foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 40)
                .background(feel == f ? Color(hex: "#4a4e57") : Color.clear, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    /// Indeksen for nå i dag (0 for andre dager).
    private var cut: Int { today ? Swift.min(23, Swift.max(0, WxSeries22.nowHour())) : 0 }

    /// Temperaturgrafen (336 × 196, W 300, HT 170): passerte timer stiplet, kommende heltrukket, H og L merket.
    private func tempSpec(_ raw: [Double?]) -> WxChartSpec22 {
        // Fyll hull med nærmeste verdi, så linjen går hele døgnet.
        var v: [Double] = []
        var last: Double = raw.compactMap { $0 }.first ?? 0
        for x in raw { if let x { last = x }; v.append(last) }
        let mn: Double = v.min() ?? 0
        let mx: Double = v.max() ?? 1
        let ylo: Double = floor((mn - 2) / 3) * 3
        let yhi: Double = ceil((mx + 2) / 3) * 3
        let W: Double = 300
        let HT: Double = 170
        let range: Double = Swift.max(1, yhi - ylo)
        func X(_ i: Int) -> CGFloat { CGFloat(Double(i) / 23 * W) }
        func Y(_ t: Double) -> CGFloat { CGFloat(HT - (t - ylo) / range * HT) }
        let pts: [CGPoint] = v.enumerated().map { CGPoint(x: X($0.offset), y: Y($0.element)) }
        var s: WxChartSpec22 = WxChartSpec22()
        s.vbW = 336
        s.vbH = 196
        var grid: [WxTick22] = []
        var t: Double = ylo
        while t <= yhi + 0.001 {
            grid.append(WxTick22(pos: Y(t), text: "\(Int(t))°"))
            t += 3
        }
        s.grid = grid
        s.lineColor = Color(hex: "#5ec8d8")
        s.areaPoints = pts
        s.areaBottom = CGFloat(HT)
        s.areaGradient = true
        if cut > 0 { s.past = Array(pts.prefix(cut + 1)) }
        s.line = pts.dropFirst(cut).map { Optional($0) }
        s.nowX = X(cut)
        s.nowTop = 0
        s.nowBottom = 170
        s.nowColor = Color(hex: "#9aa0aa")
        s.nowDash = [3, 3]
        if !today { s.nowX = nil }
        let iH: Int = v.firstIndex(of: mx) ?? 0
        let iL: Int = v.firstIndex(of: mn) ?? 0
        s.marks = [WxMark22(x: X(iH), y: Y(mx), text: "H"), WxMark22(x: X(iL), y: Y(mn), text: "L")]
        s.xTicks = [0, 6, 12, 18].map { WxTick22(pos: X($0) + 2, text: String(format: "%02d", $0)) }
        s.xTickY = 188
        return s
    }

    /// Søyler for nedbørssjanse (336 × 150): y = 130 − q/100 · 124.
    private func rainSpec() -> WxChartSpec22 {
        let pp: [Double?] = WxSeries22.values(w, d.date) { $0.precipProb }
        func X(_ i: Int) -> CGFloat { CGFloat(Double(i) / 23 * 300) }
        var s: WxChartSpec22 = WxChartSpec22()
        s.vbW = 336
        s.vbH = 150
        s.grid = [0, 25, 50, 75, 100].map { q -> WxTick22 in WxTick22(pos: CGFloat(130 - Double(q) / 100 * 124), text: "\(q) %") }
        var bars: [WxBar22] = []
        for (i, v) in pp.enumerated() {
            let q: Double = v ?? 0
            let h: Double = Swift.max(1, q / 100 * 124)
            let c: Color = today && i < cut ? Color(hex: "#3a5d74") : Color(hex: "#5ec8f2")
            bars.append(WxBar22(x: X(i) - 4.5, y: CGFloat(130 - h), w: 9, h: CGFloat(h), color: c))
        }
        s.bars = bars
        s.xTicks = [0, 6, 12, 18].map { WxTick22(pos: X($0) + 2, text: String(format: "%02d", $0)) }
        s.xTickY = 146
        return s
    }
}

/* ---------- «Yr mot Pent» (time for time og hele uka) ---------- */

struct WxCompareSheet22: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.wxInPanel25) private var inPanel
    let w: WeatherFull

    /// Prompt 39: «Yr mot Storm» er nå 2a (duell på himmel) med wiggle-redigering (WxCmp39.swift). Den gamle visningen er beholdt som `legacy`.
    var body: some View {
        WxCmp39Page(w: w, topPad: inPanel ? 14 : 12) {
            if inPanel { WxPanel25.shared.close() } else { dismiss() }
        }
    }

    private var legacy: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center, spacing: 10) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Yr mot Storm").font(.dyn51(size: 30, weight: .bold))
                        Text(w.placeName).font(.dyn51(size: 13)).foregroundStyle(Color(hex: "#9aa3ae"))
                    }
                    Spacer()
                    // Prompt 30: felles Ferdig-pille (hvit på mørk flate), lett haptikk ved lukking.
                    // Prompt 40: ✕ i stedet for «Ferdig» (samme knapp som hovedsiden i Vær).
                    VaerCloseButton {
                        if inPanel { WxPanel25.shared.close() } else { dismiss() }
                    }
                }
                if let c = w.compare {
                    agreeCard(c)
                    if !c.hours.isEmpty { chartCard(c) }
                    VStack(spacing: 0) {
                        WxCompareTable22(c: c, rows: 7, line: Color.white.opacity(0.08), header: 1)
                    }
                    .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 4)
                    .background(Color(hex: "#20232a"), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                } else {
                    Text(w.compareState == 2 ? "Storm svarte ikke. Prøv igjen senere." : "Henter Storm-data …").font(.dyn51(size: 13)).foregroundStyle(Color(hex: "#9aa3ae"))
                }
                HStack(spacing: 8) {
                    link("Åpne yr.no ↗", w.yrUrl)
                    link("Åpne storm.no ↗", "https://www.storm.no/")
                }
                Text("Yr er MET Norway (api.met.no). Storm (StormGeo) har ikke et åpent API, så Storm-kolonnen viser ECMWF-modellen fra Open-Meteo, som er nærmeste åpne kilde. Avvik er forskjellen i makstemperatur.")
                    .font(.dyn51(size: 12)).lineSpacing(4).foregroundStyle(Color(hex: "#9aa3ae")).fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 16).padding(.top, inPanel ? 14 : 48).padding(.bottom, 30)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .foregroundStyle(.white)
        .background(Color(hex: "#17191e").ignoresSafeArea())
        .environment(\.colorScheme, .dark)
    }

    private func agreeCard(_ c: WxCompare22) -> some View {
        HStack(spacing: 12) {
            Circle().fill(c.color).frame(width: 12, height: 12)
            VStack(alignment: .leading, spacing: 1) {
                Text(c.title).font(.dyn51(size: 15, weight: .bold))
                Text(c.subtitle).font(.dyn51(size: 12.5)).foregroundStyle(Color(hex: "#9aa3ae"))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .background(Color(hex: "#20232a"), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func chartCard(_ c: WxCompare22) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("NESTE 24 TIMER").font(.dyn51(size: 11, weight: .semibold)).tracking(1.32).foregroundStyle(Color(hex: "#9aa3ae"))
                Spacer()
                HStack(spacing: 12) {
                    legend("#5ec8f2", "Yr", logo: "YrLogo")
                    legend("#ff8a3d", "Storm", logo: "StormLogo")
                }
                .font(.dyn51(size: 12, weight: .bold))
            }
            WxCompareChart22(hours: next24(c))
            Text("Søyler viser nedbør per time. Yr til venstre, Storm til høyre.").font(.dyn51(size: 11.5)).foregroundStyle(Color(hex: "#9aa3ae"))
        }
        .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 10)
        .background(Color(hex: "#20232a"), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    /// De neste 24 timene: Yr fra timevarselet (eller compare), Pent fra compare.
    private func next24(_ c: WxCompare22) -> [WxCompare22.Hour] {
        let hrs: [WeatherFull.Hour] = w.next24
        if hrs.isEmpty { return Array(c.hours.prefix(24)) }
        return hrs.map { h -> WxCompare22.Hour in
            let k: String = String(h.t.prefix(13))
            let m: WxCompare22.Hour? = c.hours.first(where: { $0.t.hasPrefix(k) })
            return WxCompare22.Hour(t: h.t, yr: h.temp, pent: m?.pent, yrMm: h.precip, pentMm: m?.pentMm ?? 0)
        }
    }

    private func legend(_ c: String, _ t: String, logo: String) -> some View {
        HStack(spacing: 5) {
            WxLogo30(asset: logo, size: 16)
            Capsule().fill(Color(hex: c)).frame(width: 14, height: 3)
            Text(t)
        }
    }

    private func link(_ t: String, _ url: String) -> some View {
        Button { store.openLink(url) } label: {
            Text(t).font(.dyn51(size: 13, weight: .bold)).foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 42)
                .background(Color(hex: "#20232a"), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Grafen Yr (blå) mot Pent (oransje) med nedbørssøyler (SVG 300 × 170).
struct WxCompareChart22: View {
    let hours: [WxCompare22.Hour]

    var body: some View {
        WxChart22(spec: spec)
    }

    private var spec: WxChartSpec22 {
        let n: Int = hours.count
        let all: [Double] = hours.flatMap { h -> [Double] in [h.yr, h.pent].compactMap { $0 } }
        let lo: Double = floor(((all.min() ?? 0) - 1) / 2) * 2
        let hi: Double = ceil(((all.max() ?? 1) + 1) / 2) * 2
        let range: Double = Swift.max(1, hi - lo)
        func X(_ k: Int) -> CGFloat { CGFloat(22 + Double(k) / Double(Swift.max(1, n - 1)) * 278) }
        func Y(_ v: Double) -> CGFloat { CGFloat(10 + (1 - (v - lo) / range) * 110) }
        let pm: Double = Swift.max(2, hours.map { Swift.max($0.yrMm, $0.pentMm) }.max() ?? 0)
        var s: WxChartSpec22 = WxChartSpec22()
        s.vbW = 300
        s.vbH = 170
        s.gridX0 = 22
        s.gridX1 = 300
        s.gridLabelX = 0
        s.gridLabelSize = 9
        s.gridColor = Color.white.opacity(0.08)
        var grid: [WxTick22] = []
        let step: Double = Swift.max(2, (((hi - lo) / 4 / 2).rounded()) * 2)
        var v: Double = lo
        while v <= hi + 0.001 {
            grid.append(WxTick22(pos: Y(v), text: "\(Int(v))°"))
            v += step
        }
        s.grid = grid
        var bars: [WxBar22] = []
        for (k, h) in hours.enumerated() {
            if h.yrMm > 0 {
                let bh: Double = Swift.max(2, h.yrMm / pm * 30)
                bars.append(WxBar22(x: X(k) - 4.5, y: CGFloat(152 - bh), w: 4, h: CGFloat(bh), color: Color(hex: "#5ec8f2")))
            }
            if h.pentMm > 0 {
                let bh: Double = Swift.max(2, h.pentMm / pm * 30)
                bars.append(WxBar22(x: X(k) + 0.5, y: CGFloat(152 - bh), w: 4, h: CGFloat(bh), color: Color(hex: "#ff8a3d")))
            }
        }
        s.bars = bars
        s.lineWidth = 2.5
        s.extra = hours.enumerated().map { pair -> CGPoint? in pair.element.pent.map { CGPoint(x: X(pair.offset), y: Y($0)) } }
        s.line = hours.enumerated().map { pair -> CGPoint? in pair.element.yr.map { CGPoint(x: X(pair.offset), y: Y($0)) } }
        s.xTicks = hours.enumerated().compactMap { pair -> WxTick22? in
            pair.offset % 4 == 0 ? WxTick22(pos: X(pair.offset) - 5, text: String(pair.element.t.dropFirst(11).prefix(2))) : nil
        }
        s.xTickY = 168
        return s
    }
}
