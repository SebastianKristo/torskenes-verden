import SwiftUI

/* ---------------- Prompt 22: flisene i to kolonner (Sol, UV, Føles som, Mot i går, Nedbør, Sikt, Luftfuktighet, Lufttrykk) ---------------- */

struct WxTileGrid22: View {
    let w: WeatherFull
    let open: (String) -> Void

    var body: some View {
        let cols: [GridItem] = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
        LazyVGrid(columns: cols, spacing: 12) {
            WxSunTile22(w: w).onTapGesture { open("sun") }
            WxUvTile22(w: w).onTapGesture { open("uv") }
            WxFeelTile22(w: w).onTapGesture { open("feel") }
            WxYesterdayTile22(w: w).onTapGesture { open("yd") }
            WxRainTile22(w: w).onTapGesture { open("rain") }
            WxVisTile22(w: w).onTapGesture { open("vis") }
            WxHumTile22(w: w).onTapGesture { open("hum") }
            WxPressureTile22(w: w).onTapGesture { open("pres") }
        }
    }
}

/// Felles flis: min. 176 pt høy, etikett øverst, innholdet under.
struct WxTile22<C: View>: View {
    let icon: String
    let title: String
    var fillIcon: String? = nil
    var spacing: CGFloat = 6
    var hPad: CGFloat = 16
    @ViewBuilder let content: () -> C

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            WxCardLabel22(icon: icon, text: title, fillIcon: fillIcon).padding(.horizontal, hPad == 0 ? 16 : 0)
            content()
        }
        .padding(.horizontal, hPad).padding(.vertical, 14)
        .frame(maxWidth: .infinity, minHeight: 176, alignment: .topLeading)
        .wxCard22()
        .contentShape(Rectangle())
    }
}

/// Tekst nederst i flisene (14 pt, 600).
struct WxTileFoot22: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 14, weight: .semibold)).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
    }
}

/* ---------- Sol ---------- */

struct WxSunTile22: View {
    let w: WeatherFull
    var body: some View {
        let today: WeatherFull.Day? = w.days.first
        let rise: String = today?.sunrise ?? w.sunrise
        let set: String = today?.sunset ?? w.sunset
        let rh: Double = WxFmt22.hours(rise) ?? 8
        let sh: Double = WxFmt22.hours(set) ?? 18
        let comp: DateComponents = Calendar.current.dateComponents([.hour, .minute], from: Date())
        let nh: Double = Double(comp.hour ?? 12) + Double(comp.minute ?? 0) / 60
        let rising: Bool = nh > sh || nh < rh
        WxTile22(icon: "hSun", title: rising ? "SOLOPPGANG" : "SOLNEDGANG", spacing: 4, hPad: 0) {
            Text(rising ? WxFmt22.hm(rise) : WxFmt22.hm(set)).font(.system(size: 32, weight: .bold)).padding(.horizontal, 16)
            Spacer(minLength: 0)
            WxSunCurve22(rise: rh, set: sh, now: nh).frame(height: 52)
            Text(rising ? "Solnedgang: " + WxFmt22.hm(set) : "Soloppgang: " + WxFmt22.hm(rise))
                .font(.system(size: 13.5, weight: .semibold)).padding(.horizontal, 16)
        }
    }
}

/// Solbanen (SVG 120 × 50, strukket): horisont, kurve og solprikk.
struct WxSunCurve22: View {
    let rise: Double
    let set: Double
    let now: Double

    var body: some View {
        Canvas { ctx, size in
            let sx: CGFloat = size.width / 120.0
            let sy: CGFloat = size.height / 50.0
            let noon: Double = (rise + set) / 2
            let r0: Double = rise
            let eMax: Double = WxSunCurve22.el(noon, noon, r0)
            let eMin: Double = WxSunCurve22.el(noon + 12, noon, r0)
            let span: Double = Swift.max(0.0001, eMax - eMin)
            func yOf(_ h: Double) -> CGFloat { CGFloat(6 + (eMax - WxSunCurve22.el(h, noon, r0)) / span * 40) * sy }
            let hz: CGFloat = yOf(rise)
            var line: Path = Path()
            line.move(to: CGPoint(x: 0, y: hz)); line.addLine(to: CGPoint(x: size.width, y: hz))
            ctx.stroke(line, with: .color(Color.white.opacity(0.45)), lineWidth: 1)
            var curve: Path = Path()
            for k in 0...48 {
                let h: Double = Double(k) / 2
                let pt: CGPoint = CGPoint(x: CGFloat(h / 24 * 120) * sx, y: yOf(h))
                if k == 0 { curve.move(to: pt) } else { curve.addLine(to: pt) }
            }
            ctx.stroke(curve, with: .color(Color.white.opacity(0.55)), lineWidth: 2.2)
            let x: CGFloat = CGFloat(now / 24 * 120) * sx
            let y: CGFloat = yOf(now)
            ctx.fill(Path(ellipseIn: CGRect(x: x - 4.5, y: y - 4.5, width: 9, height: 9)), with: .color(.white))
        }
    }

    static func el(_ h: Double, _ noon: Double, _ rise: Double) -> Double {
        cos(2 * Double.pi * (h - noon) / 24) - cos(2 * Double.pi * (rise - noon) / 24)
    }
}

/* ---------- UV ---------- */

struct WxUvTile22: View {
    let w: WeatherFull
    var body: some View {
        let uv: Int = Int((w.nowHour?.uv ?? w.uv).rounded())
        WxTile22(icon: "hUv", title: "UV-INDEKS") {
            Text("\(uv)").font(.system(size: 32, weight: .bold))
            Text(WxUvTile22.level(Double(uv))).font(.system(size: 18, weight: .bold))
            Spacer(minLength: 0)
            GeometryReader { g in
                let x: CGFloat = CGFloat(Swift.min(11, Double(uv)) / 11) * g.size.width
                ZStack(alignment: .leading) {
                    Capsule().fill(LinearGradient(colors: [Color(hex: "#5bd08a"), Color(hex: "#ffe066"), Color(hex: "#ff9a3d"), Color(hex: "#ff4d6d"), Color(hex: "#c86bff")], startPoint: .leading, endPoint: .trailing))
                        .frame(height: 6)
                    Circle().fill(Color.white).frame(width: 10, height: 10)
                        .overlay(Circle().stroke(Color.black.opacity(0.15), lineWidth: 2))
                        .offset(x: x - 5)
                }
                .frame(maxHeight: .infinity)
            }
            .frame(height: 10)
            WxTileFoot22(text: uv < 3 ? "Lave nivåer hele dagen." : "Bruk solkrem midt på dagen.")
        }
    }

    static func level(_ x: Double) -> String { x < 3 ? "Lav" : x < 6 ? "Moderat" : x < 8 ? "Høy" : x < 11 ? "Svært høy" : "Ekstrem" }
}

/* ---------- Føles som ---------- */

struct WxFeelTile22: View {
    let w: WeatherFull
    var body: some View {
        let diff: Double = w.feels - w.temp
        let txt: String = abs(diff) < 1 ? "Omtrent som den faktiske temperaturen." : diff < 0 ? "Føles kaldere enn faktisk, på grunn av vind." : "Føles varmere enn den faktiske temperaturen."
        WxTile22(icon: "hFeel", title: "FØLES SOM") {
            Text(WxFmt22.deg(w.feels)).font(.system(size: 32, weight: .bold))
            Spacer(minLength: 0)
            WxTileFoot22(text: txt)
        }
    }
}

/* ---------- Mot i går ---------- */

struct WxYesterdayTile22: View {
    let w: WeatherFull
    var body: some View {
        let a: Double? = w.hi ?? w.days.first?.hi
        let b: Double? = w.yHi
        let d: Double = (a ?? 0) - (b ?? 0)
        let big: String = (a == nil || b == nil) ? "–" : (d >= 0 ? "+" : "−") + "\(Int(abs(d).rounded()))°"
        let txt: String = (a == nil || b == nil) ? "Ingen tall for i går." : Int(d.rounded()) == 0 ? "Like varmt som i går" : d > 0 ? "Varmere enn i går" : "Kaldere enn i går"
        WxTile22(icon: "hYd", title: "MOT I GÅR") {
            Text(big).font(.system(size: 32, weight: .bold))
            Text(txt).font(.system(size: 14, weight: .bold)).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Grid(alignment: .leading, horizontalSpacing: 8, verticalSpacing: 2) {
                GridRow {
                    Text("I dag").opacity(0.7)
                    Text("H:" + WxFmt22.degOpt(a))
                }
                GridRow {
                    Text("I går").opacity(0.7)
                    Text("H:" + WxFmt22.degOpt(b))
                }
            }
            .font(.system(size: 13.5, weight: .bold))
        }
    }
}

/* ---------- Nedbør ---------- */

struct WxRainTile22: View {
    let w: WeatherFull
    var body: some View {
        let today: Double = w.days.first?.precipSum ?? w.precipSum
        WxTile22(icon: "drop", title: "NEDBØR", fillIcon: "drop", spacing: 4) {
            Text(WxFmt22.f1(today) + " mm").font(.system(size: 32, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
            Text("I dag").font(.system(size: 18, weight: .bold))
            Spacer(minLength: 0)
            WxTileFoot22(text: next)
        }
    }

    private var next: String {
        let rest: [WeatherFull.Day] = Array(w.days.dropFirst())
        guard let d = rest.first(where: { $0.precipSum >= 0.5 }) else { return "Ingen nedbør ventet de neste dagene." }
        return "Neste ventet er " + WxFmt22.f1(d.precipSum) + " mm " + WxFmt22.weekday(d.date).lowercased() + "."
    }
}

/* ---------- Sikt ---------- */

struct WxVisTile22: View {
    let w: WeatherFull
    var body: some View {
        let km: Double? = w.visibility ?? w.nowHour?.visibility
        let v: Double = km ?? 0
        let big: String = km == nil ? "–" : v >= 30 ? "+\(Int(v.rounded())) km" : v >= 10 ? "\(Int(v.rounded())) km" : WxFmt22.f1(v) + " km"
        let txt: String = km == nil ? "" : v >= 20 ? "Helt klar sikt." : v >= 10 ? "God sikt." : v >= 4 ? "Moderat sikt." : "Dårlig sikt."
        WxTile22(icon: "hVis", title: "SIKT", spacing: 4) {
            Text(big).font(.system(size: 32, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
            Spacer(minLength: 0)
            WxTileFoot22(text: txt)
        }
    }
}

/* ---------- Luftfuktighet ---------- */

struct WxHumTile22: View {
    let w: WeatherFull
    var body: some View {
        let rh: Double? = w.humidity ?? w.nowHour?.humidity
        let dew: Double? = w.dew ?? rh.map { w.temp - (100 - $0) / 5 }
        WxTile22(icon: "hHum", title: "LUFTFUKTIGHET", spacing: 4) {
            Text(rh.map { "\(Int($0.rounded())) %" } ?? "–").font(.system(size: 32, weight: .bold))
            Spacer(minLength: 0)
            WxTileFoot22(text: dew.map { "Duggpunktet er " + WxFmt22.deg($0) + " akkurat nå." } ?? "")
        }
    }
}

/* ---------- Lufttrykk ---------- */

struct WxPressureTile22: View {
    let w: WeatherFull
    var body: some View {
        WxTile22(icon: "hPres", title: "LUFTTRYKK", spacing: 2) {
            WxPressureGauge22(pressure: w.pressure ?? w.nowHour?.pressure, trend: w.pressureTrend).frame(maxWidth: .infinity).frame(height: 118)
        }
    }
}

/// Måleren (SVG 100 × 86): stiplet bue, nål, pil, verdi, hPa og Lavt/Høyt.
struct WxPressureGauge22: View {
    let pressure: Double?
    let trend: String

    var body: some View {
        Canvas { ctx, size in
            let s: CGFloat = Swift.min(size.width / 100.0, size.height / 86.0)
            let ox: CGFloat = (size.width - 100 * s) / 2
            func P(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: ox + x * s, y: y * s) }
            // Stiplet ring (r 38, pathLength 100 med 0,9 / 2,4 i designet).
            let ring: Path = Path(ellipseIn: CGRect(x: ox + 12 * s, y: 12 * s, width: 76 * s, height: 76 * s))
            ctx.stroke(ring, with: .color(Color.white.opacity(0.35)), style: StrokeStyle(lineWidth: 8 * s, dash: [2.15 * s, 5.73 * s]))
            let v: Double = Swift.min(1060, Swift.max(960, pressure ?? 1013))
            let pf: Double = (v - 960) / 100
            let ang: CGFloat = CGFloat(-135 + pf * 270) * .pi / 180
            let c: CGPoint = P(50, 50)
            var needle: Path = Path()
            needle.move(to: P(50, 9)); needle.addLine(to: P(50, 20))
            let rot: CGAffineTransform = CGAffineTransform(translationX: c.x, y: c.y).rotated(by: ang).translatedBy(x: -c.x, y: -c.y)
            ctx.stroke(needle.applying(rot), with: .color(.white), style: StrokeStyle(lineWidth: 3 * s, lineCap: .round))
            let arrow: String = trend == "rising" ? "↑" : trend == "falling" ? "↓" : "→"
            ctx.draw(Text(arrow).font(.system(size: 12 * s, weight: .heavy)).foregroundColor(.white), at: P(50, 36))
            let txt: String = pressure.map { WxPressureGauge22.thousands($0) } ?? "–"
            ctx.draw(Text(txt).font(.system(size: 15 * s, weight: .heavy)).foregroundColor(.white), at: P(50, 51))
            ctx.draw(Text("hPa").font(.system(size: 8 * s, weight: .bold)).foregroundColor(.white), at: P(50, 63))
            ctx.draw(Text("Lavt").font(.system(size: 8 * s, weight: .bold)).foregroundColor(.white), at: P(26, 81))
            ctx.draw(Text("Høyt").font(.system(size: 8 * s, weight: .bold)).foregroundColor(.white), at: P(74, 81))
        }
    }

    /// 1037 → «1 037» (nb-NO).
    static func thousands(_ v: Double) -> String {
        let f: NumberFormatter = NumberFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f.string(from: NSNumber(value: v.rounded())) ?? String(Int(v.rounded()))
    }
}
