import SwiftUI

/* ---------------- Prompt 32: Vær – «Forhold» med egne visninger for nedbør og vind ---------------- */
// Fasit: design/Vaer.dc.html → isT/isR/isW, timer (hrs) og dager (days). Spesifikasjon: claude-code-vaer-forhold-moduser.md.
// Bryteren ☁ / 💧 / 🌬 bytter både timeraden og dagslisten. Timecellene er alltid 142 pt høye, tittel 20 og undertittel 17,
// så kortet står på samme sted når man bytter.

enum Wx32b {
    static let rain: Color = Color(hex: "#5ad1ff")
    static let wind: Color = Color(hex: "#3fd0e0")
    static let gust: Color = Color(hex: "#3fd0e0").opacity(0.28)
    static let cellH: CGFloat = 142
    static let cellW: CGFloat = 56

    static func subtitle(_ mode: String) -> String {
        switch mode {
        case "rain": return "Nedbør (mm) · Sjanse"
        case "wind": return "Vind (m/s) · Kast"
        default: return "Temperatur (°C)"
        }
    }

    static func mm(_ v: Double) -> String {
        if v <= 0 { return "" }
        if v < 10 { return String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",") }
        return String(Int(v.rounded()))
    }
}

/* ---------- Timer: nedbør ---------- */

/// Avrundet søyle (30×62, radius 9) med stiplede linjer på 1/3 og 2/3, fylt nedenfra (0–3 mm = 0–100 %).
struct WxRainHourCell32b: View {
    let h: WeatherFull.Hour
    let first: Bool

    var body: some View {
        let f: CGFloat = CGFloat(Swift.min(1, Swift.max(0, h.precip / 3)))
        VStack(spacing: 8) {
            Text(first ? "Nå" : h.hour).font(.dyn51(size: 14, weight: first ? .heavy : .bold))
            ZStack(alignment: .bottom) {
                RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Color.white.opacity(0.12))
                RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Wx32b.rain).frame(height: 62 * f)
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    WxDash32b()
                    Spacer(minLength: 0)
                    WxDash32b()
                    Spacer(minLength: 0)
                }
            }
            .frame(width: 30, height: 62)
            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            Text(Wx32b.mm(h.precip)).font(.dyn51(size: 13, weight: .bold)).frame(minHeight: 15)
            Text("\(Int(h.precipProb)) %").font(.dyn51(size: 11, weight: .bold)).foregroundStyle(Color(hex: "#9fe0ff"))
        }
        .padding(.vertical, 4)
        .frame(width: Wx32b.cellW, height: Wx32b.cellH, alignment: .top)
    }
}

struct WxDash32b: View {
    var body: some View {
        Line32b().stroke(Color.white.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [3, 3])).frame(height: 1)
    }
}

struct Line32b: Shape {
    func path(in rect: CGRect) -> Path {
        var p: Path = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}

/* ---------- Timer: vind ---------- */

/// Fart (stort tall) · «m/s» · «kast N», og under en sammenhengende linje for fart med område for kast på tvers av timene.
struct WxWindHours32b: View {
    let hours: [WeatherFull.Hour]

    var body: some View {
        let top: Double = Swift.max(4, (hours.map { Swift.max($0.gust, $0.wind) }.max() ?? 4) * 1.1)
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                ForEach(Array(hours.enumerated()), id: \.element.id) { pair in
                    WxWindHourCell32b(h: pair.element, first: pair.offset == 0)
                }
            }
            WxWindGraph32b(speed: hours.map(\.wind), gust: hours.map(\.gust), top: top, step: Wx32b.cellW)
                .frame(width: Wx32b.cellW * CGFloat(hours.count), height: 44)
                .padding(.top, -50)
        }
    }
}

struct WxWindHourCell32b: View {
    let h: WeatherFull.Hour
    let first: Bool

    var body: some View {
        VStack(spacing: 4) {
            Text(first ? "Nå" : h.hour).font(.dyn51(size: 14, weight: first ? .heavy : .bold))
            Text(String(Int(h.wind.rounded()))).font(.dyn51(size: 24, weight: .bold)).padding(.top, 4)
            Text("m/s").font(.dyn51(size: 11, weight: .semibold)).opacity(0.8)
            Text("kast " + String(Int(h.gust.rounded()))).font(.dyn51(size: 11, weight: .bold)).foregroundStyle(Color(hex: "#9fe0ff"))
        }
        .padding(.vertical, 4)
        .frame(width: Wx32b.cellW, height: Wx32b.cellH, alignment: .top)
    }
}

/// Linje (fart, 3 pt) og område (kast). Fast strektykkelse uansett størrelse.
struct WxWindGraph32b: View {
    let speed: [Double]
    let gust: [Double]
    let top: Double
    let step: CGFloat

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let hgt: CGFloat = g.size.height
            let n: Int = speed.count
            let dx: CGFloat = n > 1 ? (g.size.width - step) / CGFloat(n - 1) : 0
            let x0: CGFloat = step / 2
            ZStack {
                WxArea32b(values: gust, top: top, x0: x0, dx: dx, h: hgt).fill(Wx32b.gust)
                WxPoly32b(values: speed, top: top, x0: x0, dx: dx, h: hgt)
                    .stroke(Wx32b.wind, style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
            }
        }
    }
}

struct WxPoly32b: Shape {
    let values: [Double]
    let top: Double
    let x0: CGFloat
    let dx: CGFloat
    let h: CGFloat

    func path(in rect: CGRect) -> Path {
        var p: Path = Path()
        for (i, v) in values.enumerated() {
            let pt: CGPoint = CGPoint(x: x0 + CGFloat(i) * dx, y: h - CGFloat(v / top) * h)
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        return p
    }
}

struct WxArea32b: Shape {
    let values: [Double]
    let top: Double
    let x0: CGFloat
    let dx: CGFloat
    let h: CGFloat

    func path(in rect: CGRect) -> Path {
        var p: Path = Path()
        if values.isEmpty { return p }
        p.move(to: CGPoint(x: x0, y: h))
        for (i, v) in values.enumerated() {
            p.addLine(to: CGPoint(x: x0 + CGFloat(i) * dx, y: h - CGFloat(v / top) * h))
        }
        p.addLine(to: CGPoint(x: x0 + CGFloat(values.count - 1) * dx, y: h))
        p.closeSubpath()
        return p
    }
}

/* ---------- Dager: nedbør ---------- */

/// 12 små søyler (2 timer hver, 0–4 mm = full), 06–18 litt lysere, nå med hvit ramme i dag. Så total mm og 💧 sjanse.
struct WxRainDayRow32b: View {
    let d: WeatherFull.Day
    let hours: [WeatherFull.Hour]
    let today: Bool

    var body: some View {
        let nowH: Int = Calendar.current.component(.hour, from: Date())
        HStack(spacing: 8) {
            Text(today ? "I dag" : WxFmt22.weekday(d.date)).font(.dyn51(size: 17, weight: .bold)).frame(width: 52, alignment: .leading)
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(0..<12, id: \.self) { (i: Int) in
                    bar(i, now: today && nowH / 2 == i)
                }
            }
            .frame(height: 28)
            .frame(maxWidth: .infinity)
            Text(d.precipSum > 0 ? Wx32b.mm(d.precipSum) + " mm" : "0 mm").font(.dyn51(size: 14, weight: .bold))
                .opacity(d.precipSum > 0 ? 1 : 0.5).frame(width: 52, alignment: .trailing)
            Text((d.precipProb >= 30 ? "💧 " : "") + "\(Int(d.precipProb)) %").font(.dyn51(size: 12.5, weight: .bold))
                .foregroundStyle(d.precipProb >= 30 ? Color(hex: "#9fe0ff") : Color.white.opacity(0.55))
                .frame(width: 58, alignment: .trailing)
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private func mm(_ i: Int) -> Double {
        let a: Int = i * 2
        return hours.filter { (h: WeatherFull.Hour) -> Bool in h.hourInt == a || h.hourInt == a + 1 }.map(\.precip).reduce(0, +)
    }

    private func bar(_ i: Int, now: Bool) -> some View {
        let f: CGFloat = CGFloat(Swift.min(1, mm(i) / 4))
        let day: Bool = i >= 3 && i < 9
        return ZStack(alignment: .bottom) {
            RoundedRectangle(cornerRadius: 3, style: .continuous).fill(Color.white.opacity(day ? 0.2 : 0.12))
            RoundedRectangle(cornerRadius: 3, style: .continuous).fill(Wx32b.rain).frame(height: Swift.max(f > 0 ? 3 : 0, 28 * f))
        }
        .frame(maxWidth: .infinity)
        .frame(height: 28)
        .overlay(RoundedRectangle(cornerRadius: 3, style: .continuous).stroke(now ? Color.white : Color.clear, lineWidth: 1.5))
    }
}

/* ---------- Dager: vind ---------- */

/// Minigraf for døgnet (fart som linje, kast som område, 06–18 litt lysere), prikk på nå i dag, og «min–maks kast».
struct WxWindDayRow32b: View {
    let d: WeatherFull.Day
    let hours: [WeatherFull.Hour]
    let today: Bool

    var body: some View {
        let gusts: [Double] = hours.map(\.gust)
        let lo: Int = Int((gusts.min() ?? 0).rounded())
        let hi: Int = Int((gusts.max() ?? d.windMax).rounded())
        HStack(spacing: 8) {
            Text(today ? "I dag" : WxFmt22.weekday(d.date)).font(.dyn51(size: 17, weight: .bold)).frame(width: 52, alignment: .leading)
            WxWindMini32b(hours: hours, today: today)
                .frame(height: 30)
                .frame(maxWidth: .infinity)
            Text("\(lo)–\(hi) m/s").font(.dyn51(size: 14, weight: .bold)).frame(width: 84, alignment: .trailing)
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

struct WxWindMini32b: View {
    let hours: [WeatherFull.Hour]
    let today: Bool

    var body: some View {
        let top: Double = Swift.max(4, (hours.map { Swift.max($0.gust, $0.wind) }.max() ?? 4) * 1.1)
        GeometryReader { (g: GeometryProxy) in
            let w: CGFloat = g.size.width
            let h: CGFloat = g.size.height
            let n: Int = Swift.max(1, hours.count)
            let dx: CGFloat = n > 1 ? w / CGFloat(n - 1) : 0
            let nowH: Int = Calendar.current.component(.hour, from: Date())
            let idx: Int? = today ? hours.firstIndex(where: { $0.hourInt == nowH }) : nil
            ZStack(alignment: .topLeading) {
                Rectangle().fill(Color.white.opacity(0.07))
                    .frame(width: w * 0.5, height: h)
                    .offset(x: w * 0.25)
                WxArea32b(values: hours.map(\.gust), top: top, x0: 0, dx: dx, h: h).fill(Wx32b.gust)
                WxPoly32b(values: hours.map(\.wind), top: top, x0: 0, dx: dx, h: h)
                    .stroke(Wx32b.wind, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round, dash: today ? [4, 3] : []))
                if let i = idx {
                    let v: Double = hours[i].wind
                    Circle().fill(Color.white).frame(width: 8, height: 8)
                        .offset(x: CGFloat(i) * dx - 4, y: h - CGFloat(v / top) * h - 4)
                }
            }
        }
    }
}
