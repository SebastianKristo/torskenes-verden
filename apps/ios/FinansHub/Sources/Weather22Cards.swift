import SwiftUI

/* ---------------- Prompt 22: kortene på værsiden (Vaer.dc.html) ---------------- */
// Systemfont (.system) bare her. Kort: radius 24, hvit 16 % og 1 pt kant i hvit 16 %.

extension View {
    /// Glasskortet i designet (rgba(255,255,255,.16) med kant i samme farge).
    func wxCard22(_ radius: CGFloat = 24) -> some View {
        self
            .background(Color.white.opacity(0.16), in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Color.white.opacity(0.16), lineWidth: 1))
    }
}

/// Etikett med ikon øverst i kortene («VIND», «UV-INDEKS» …): 12 pt, 800, sperret, 70 %.
struct WxCardLabel22: View {
    let icon: String
    let text: String
    var fillIcon: String? = nil
    var body: some View {
        HStack(spacing: 6) {
            ZStack {
                Glyph22Icon(name: icon, size: 15, color: .white, stroke: 2)
                if let f = fillIcon { Glyph22Icon(name: f, size: 15, color: .white, fill: true) }
            }
            Text(text).font(.system(size: 12, weight: .heavy)).tracking(0.96)
        }
        .opacity(0.7)
    }
}

/* ---------- Toppen og knappene nederst ---------- */

struct WxTopBar22: View {
    @Environment(Store.self) private var store
    let w: WeatherFull?
    let scrolled: Bool

    var body: some View {
        HStack(alignment: .center) {
            // Prompt 32: ingen «‹ Hjem»; tom plass (42 pt) så bynavnet holder seg midtstilt (claude-code-vaer-lukk-x.md).
            Color.clear.frame(width: 42, height: 42)
            Spacer(minLength: 4)
            VStack(spacing: 0) {
                Text(w?.placeName ?? "").font(.system(size: 17, weight: .bold))
                Text(centerLine).font(.system(size: 13)).opacity(0.9)
            }
            .lineLimit(1)
            .opacity(scrolled ? 1 : 0)
            .animation(.easeOut(duration: 0.2), value: scrolled)
            Spacer(minLength: 4)
            // ✕ Lukk: rund 42 pt glass, hvitt kryss 17 pt, lett haptikk. Kilden står nå under H/L (WxHeader22).
            // Prompt 40: felles VaerCloseButton (Vaer40.swift), samme i alle ark.
            VaerCloseButton { store.weatherOpen = false }
        }
        .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 8)
        // Prompt 40: glass-stripe bak statuslinja og topplinja når man har scrollet (samme opasitet som bynavnet).
        .background { Vaer40TopGlass(visible: scrolled) }
    }

    private var centerLine: String {
        guard let w else { return "" }
        return WxFmt22.deg(w.temp) + " | " + WxFmt22.desc(w.code)
    }

    private var source: String {
        guard let w else { return "Henter …" }
        if w.mock { return "Eksempeldata" }
        return "MET Norway · yr.no · " + JS.fmt(w.loadedAt, "HH:mm")
    }
}

// Prompt 28: de runde knappene (WxBottomButtons22) er erstattet av bunnlinjen WxBottomBar28 (Weather28Places.swift).

/* ---------- Toppteksten ---------- */

struct WxHeader22: View {
    let w: WeatherFull
    var body: some View {
        VStack(spacing: 0) {
            Text(w.placeId == "pos" ? "MIN POSISJON" : "VÆRET I").font(.system(size: 12, weight: .heavy)).tracking(1.92).opacity(0.85)
            Text(w.placeName).font(.system(size: 36, weight: .medium)).lineLimit(1).minimumScaleFactor(0.6)
            Text(WxFmt22.deg(w.temp)).font(.system(size: 112, weight: .ultraLight)).tracking(-4.48)
                .padding(.leading, 22).padding(.top, 2).lineLimit(1)
            Text(WxFmt22.desc(w.code)).font(.system(size: 19, weight: .bold)).padding(.top, 4)
            Text("H:\(WxFmt22.degOpt(w.hi))  L:\(WxFmt22.degOpt(w.lo))").font(.system(size: 16, weight: .semibold)).opacity(0.9)
            // Prompt 32: kilden og tiden flyttet hit fra toppraden.
            Text(w.mock ? "Eksempeldata" : "MET Norway · yr.no · " + JS.fmt(w.loadedAt, "HH:mm"))
                .font(.system(size: 11.5)).opacity(0.7).padding(.top, 4)
        }
        .shadow(color: Color.black.opacity(0.18), radius: 10, y: 2)
        .frame(maxWidth: .infinity)
        .padding(.top, 6).padding(.bottom, 26)
    }
}

/* ---------- Time for time ---------- */

struct WxHourCard22: View {
    let w: WeatherFull
    @Binding var mode: String
    let openToday: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Button(action: openToday) {
                    // Prompt 32: fast høyde på tittel (20) og undertittel (17, én linje), så kortet ikke flytter seg ved bytte.
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Forhold ›").font(.system(size: 16, weight: .bold)).frame(height: 20)
                        Text(title).font(.system(size: 12.5)).foregroundStyle(Color(hex: "#9fe0ff")).lineLimit(1).truncationMode(.tail).frame(height: 17)
                    }
                }
                .buttonStyle(.plain)
                Spacer()
                HStack(spacing: 2) {
                    modeButton("temp", "part", "Temperatur")
                    modeButton("rain", "drop", "Nedbør")
                    modeButton("wind", "wind", "Vind")
                }
                .padding(3)
                .background(Color.black.opacity(0.18), in: Capsule())
            }
            .padding(.horizontal, 16)
            ScrollView(.horizontal, showsIndicators: false) {
                // Prompt 32: egne timevisninger for nedbør og vind (Weather32.swift); cellene er alltid 142 pt høye.
                Group {
                    if mode == "wind" {
                        WxWindHours32b(hours: w.next24)
                    } else {
                        HStack(spacing: 0) {
                            ForEach(Array(w.next24.enumerated()), id: \.element.id) { pair in
                                if mode == "rain" {
                                    WxRainHourCell32b(h: pair.element, first: pair.offset == 0)
                                } else {
                                    WxHourCell22(h: pair.element, first: pair.offset == 0, mode: mode, pent: w.compare?.pentTemp(pair.element.t))
                                        .frame(height: Wx32b.cellH, alignment: .top)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 8)
            }
        }
        .padding(.top, 14).padding(.bottom, 12)
        .wxCard22()
    }

    private var title: String { Wx32b.subtitle(mode) }

    private func modeButton(_ m: String, _ icon: String, _ label: String) -> some View {
        Button { Haptics.shared.select(); mode = m } label: {
            Glyph22Icon(name: icon, size: 18, color: .white, stroke: 1.9)
                .frame(width: 44, height: 30)
                .background(mode == m ? Color.white.opacity(0.28) : Color.clear, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Én time: klokkeslett, ikon, nedbørssjanse, verdi og Pent-temperaturen i oransje under.
struct WxHourCell22: View {
    let h: WeatherFull.Hour
    let first: Bool
    let mode: String
    let pent: Double?

    var body: some View {
        let k: String = WxFmt22.icon(h.code, night: !h.isDay)
        VStack(spacing: 8) {
            Text(first ? "Nå" : h.hour).font(.system(size: 14, weight: first ? .heavy : .bold))
            Glyph22Icon(name: k, size: 28, color: WxFmt22.iconColor(k), stroke: 1.8)
            Text(h.precipProb >= 20 ? "\(Int(h.precipProb)) %" : " ").font(.system(size: 11, weight: .bold)).foregroundStyle(Color(hex: "#9fe0ff"))
                .frame(minHeight: 13)
            Text(value).font(.system(size: 17, weight: .bold))
            Text(pentText).font(.system(size: 12.5, weight: .bold)).foregroundStyle(Color(hex: "#ffb27a")).frame(minHeight: 15)
        }
        .padding(.vertical, 4)
        .frame(width: 56)
    }

    private var value: String {
        switch mode {
        case "rain": return "\(Int(h.precipProb)) %"
        case "wind": return String(Int(h.wind.rounded()))
        default: return WxFmt22.deg(h.temp)
        }
    }

    private var pentText: String {
        guard mode == "temp", let p = pent else { return " " }
        return WxFmt22.deg(p)
    }
}

/* ---------- 7 dager ---------- */

struct WxDaysCard22: View {
    let w: WeatherFull
    /// Prompt 32: ☁ / 💧 / 🌬 i «Forhold» bytter også dagslisten.
    var mode: String = "temp"
    let open: (Int) -> Void

    var body: some View {
        let ds: [WeatherFull.Day] = Array(w.days.prefix(7))
        let lo: Double = ds.map(\.lo).min() ?? 0
        let hi: Double = ds.map(\.hi).max() ?? 1
        VStack(spacing: 0) {
            ForEach(Array(ds.enumerated()), id: \.element.id) { pair in
                if pair.offset > 0 { Rectangle().fill(Color.white.opacity(0.18)).frame(height: 1) }
                Button { Haptics.shared.tap(); open(pair.offset) } label: {
                    dayRow(pair.element, today: pair.offset == 0, lo: lo, hi: hi)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 4)
        .wxCard22()
    }

    @ViewBuilder private func dayRow(_ d: WeatherFull.Day, today: Bool, lo: Double, hi: Double) -> some View {
        if mode == "rain" {
            WxRainDayRow32b(d: d, hours: w.hours.filter { (h: WeatherFull.Hour) -> Bool in h.day == d.date }, today: today)
        } else if mode == "wind" {
            WxWindDayRow32b(d: d, hours: w.hours.filter { (h: WeatherFull.Hour) -> Bool in h.day == d.date }, today: today)
        } else {
            WxDayRow22(d: d, today: today, now: w.temp, lo: lo, hi: hi)
        }
    }
}

struct WxDayRow22: View {
    let d: WeatherFull.Day
    let today: Bool
    let now: Double
    let lo: Double
    let hi: Double

    var body: some View {
        let k: String = WxFmt22.icon(d.code, night: false)
        HStack(spacing: 8) {
            Text(today ? "I dag" : WxFmt22.weekday(d.date)).font(.system(size: 17, weight: .bold)).frame(width: 52, alignment: .leading)
            VStack(spacing: 1) {
                Glyph22Icon(name: k, size: 24, color: WxFmt22.iconColor(k), stroke: 1.8)
                if d.precipProb >= 30 {
                    Text("\(Int(d.precipProb)) %").font(.system(size: 10.5, weight: .heavy)).foregroundStyle(Color(hex: "#9fe0ff"))
                }
            }
            .frame(width: 40)
            Text(WxFmt22.deg(d.lo)).font(.system(size: 17, weight: .bold)).foregroundStyle(Color(hex: "#bfe6ff")).frame(width: 38, alignment: .trailing)
            WxDayBar22(lo: d.lo, hi: d.hi, min: lo, max: hi, now: today ? now : nil)
            Text(WxFmt22.deg(d.hi)).font(.system(size: 17, weight: .bold)).frame(width: 38, alignment: .trailing)
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

/// Søylen mellom laveste og høyeste temperatur i uka, med prikk for nå i dag.
struct WxDayBar22: View {
    let lo: Double
    let hi: Double
    let min: Double
    let max: Double
    let now: Double?

    var body: some View {
        GeometryReader { g in
            let span: Double = Swift.max(1, max - min)
            let wd: CGFloat = g.size.width
            let x0: CGFloat = CGFloat((lo - min) / span) * wd
            let bw: CGFloat = Swift.max(wd * 0.08, CGFloat((hi - lo) / span) * wd)
            ZStack(alignment: .leading) {
                Capsule().fill(Color.black.opacity(0.18)).frame(height: 6)
                Capsule().fill(LinearGradient(colors: [Color(hex: "#7fd6f5"), Color(hex: "#a6e3b0"), Color(hex: "#ffd36b")], startPoint: .leading, endPoint: .trailing))
                    .frame(width: bw, height: 6).offset(x: x0)
                if let n = now {
                    let nx: CGFloat = CGFloat(Swift.min(1, Swift.max(0, (n - min) / span))) * wd
                    Circle().fill(Color.white).frame(width: 12, height: 12)
                        .overlay(Circle().stroke(Color(red: 40.0 / 255.0, green: 90.0 / 255.0, blue: 150.0 / 255.0).opacity(0.6), lineWidth: 2))
                        .offset(x: nx - 6)
                }
            }
            .frame(maxHeight: .infinity)
        }
        .frame(height: 12)
    }
}

/* ---------- Yr og Storm (prompt 30: «Pent» heter Storm i alt som vises) ---------- */

struct WxCompareCard22: View {
    let w: WeatherFull
    let open: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                // Prompt 30: ekte logoer (assets YrLogo/StormLogo), to overlappende sirkler på 30 pt.
                HStack(spacing: -8) {
                    WxLogo30(asset: "YrLogo", size: 30)
                    WxLogo30(asset: "StormLogo", size: 30)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text("Yr og Storm").font(.system(size: 16, weight: .bold))
                    HStack(spacing: 6) {
                        Circle().fill(dotColor).frame(width: 8, height: 8)
                        Text(statusText).font(.system(size: 12.5)).opacity(0.85)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.bottom, 10)
            if let c = w.compare, !c.days.isEmpty {
                WxCompareTable22(c: c, rows: 4, line: Color.white.opacity(0.18), header: 0.8)
            } else if w.compareState == 0 {
                Text("Henter Storm …").font(.system(size: 13)).opacity(0.75).padding(.top, 8).padding(.bottom, 10)
            }
            Rectangle().fill(Color.white.opacity(0.18)).frame(height: 1)
            Button(action: open) {
                HStack {
                    Text("Time for time og hele uka").font(.system(size: 14, weight: .semibold))
                    Spacer()
                    Text("›").opacity(0.7)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 6)
        .wxCard22()
        // Prompt 30: hele kortet (logoer, enighet, tabellen og lenken) åpner Yr mot Storm i fullskjerm.
        .contentShape(Rectangle())
        .onTapGesture { open() }
        .accessibilityAddTraits(.isButton)
    }

    private var dotColor: Color { w.compare?.color ?? Color(hex: "#9aa3ae") }

    private var statusText: String {
        if let c = w.compare { return c.title }
        return w.compareState == 2 ? "Storm svarte ikke" : "Henter …"
    }

    private func badge(_ t: String, _ c: String) -> some View {
        Text(t).font(.system(size: 11, weight: .heavy))
            .frame(width: 28, height: 28)
            .background(Color(hex: c), in: Circle())
            .overlay(Circle().stroke(Color.white.opacity(0.7), lineWidth: 2))
    }
}

/// Tabellen Yr | Storm | Avvik, brukt både på kortet (4 dager) og i arket (alle dager).
struct WxCompareTable22: View {
    let c: WxCompare22
    let rows: Int
    let line: Color
    let header: Double

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Color.clear.frame(width: 44, height: 1)
                WxLogoLabel30(asset: "YrLogo", text: "YR", color: Color(hex: "#7fd6f5"))
                WxLogoLabel30(asset: "StormLogo", text: "STORM", color: Color(hex: "#ffb27a"))
                Text("AVVIK").frame(width: 44, alignment: .trailing)
            }
            .font(.system(size: 11, weight: .heavy)).tracking(0.88).opacity(header)
            .padding(.bottom, 6)
            ForEach(Array(c.days.prefix(rows).enumerated()), id: \.element.id) { pair in
                Rectangle().fill(line).frame(height: 1)
                WxCompareRow22(d: pair.element, first: pair.offset == 0)
            }
        }
    }
}

struct WxCompareRow22: View {
    let d: WxCompare22.Day
    let first: Bool

    var body: some View {
        HStack(spacing: 8) {
            Text(label).font(.system(size: 15, weight: .bold)).frame(width: 44, alignment: .leading)
            side(d.yr)
            side(d.pent)
            Text(diffText).font(.system(size: 12, weight: .heavy)).lineLimit(1)
                .padding(.horizontal, 7).padding(.vertical, 3)
                .background(diffBg, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .frame(width: 44, alignment: .trailing)
        }
        .padding(.vertical, 9)
    }

    private var label: String {
        if let day = parseDay(d.date), Calendar.current.isDateInToday(day) { return "I dag" }
        return first && parseDay(d.date) == nil ? "I dag" : WxFmt22.weekday(d.date)
    }

    private func side(_ s: WxCompare22.Side) -> some View {
        let k: String = WxFmt22.icon(s.code ?? 3, night: false)
        let t: String = WxFmt22.degOpt(s.max) + " / " + WxFmt22.degOpt(s.min)
        let p: String = s.precip.map { WxFmt22.f1($0) + " mm" } ?? "–"
        return HStack(spacing: 6) {
            if s.code != nil { Glyph22Icon(name: k, size: 22, color: WxFmt22.iconColor(k), stroke: 1.8) }
            VStack(alignment: .leading, spacing: 0) {
                Text(t).font(.system(size: 14.5, weight: .bold)).lineLimit(1).minimumScaleFactor(0.8)
                Text(p).font(.system(size: 11.5)).foregroundStyle(Color(hex: "#9fe0ff")).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var diff: Int? {
        if let y = d.yr.max, let p = d.pent.max { return Int((y - p).rounded()) }
        return d.diff.map { Int($0.rounded()) }
    }

    private var diffText: String {
        guard let x = diff else { return "–" }
        return (x > 0 ? "+" : "") + "\(x)°"
    }

    private var diffBg: Color {
        guard let x = diff, abs(x) >= 2 else { return Color.white.opacity(0.1) }
        if abs(x) < 4 { return Color(red: 1, green: 179.0 / 255.0, blue: 71.0 / 255.0).opacity(0.3) }
        return Color(red: 242.0 / 255.0, green: 107.0 / 255.0, blue: 94.0 / 255.0).opacity(0.4)
    }
}

/* ---------- Vind ---------- */

struct WxWindCard22: View {
    let w: WeatherFull
    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                WxCardLabel22(icon: "wind", text: "VIND").padding(.bottom, 6)
                WxRow22(a: "Vind", b: WxFmt22.f1(w.wind) + " m/s", top: false)
                WxRow22(a: "Kast", b: WxFmt22.f1(w.gust) + " m/s", top: true)
                WxRow22(a: "Retning", b: dirText, top: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            WxCompass22(dir: w.windDir ?? 0, speed: WxFmt22.f1(w.wind)).frame(width: 128, height: 128)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .wxCard22()
        .contentShape(Rectangle())
    }

    private var dirText: String {
        guard let d = w.windDir else { return "–" }
        let i: Int = Int((d / 22.5).rounded()) % 16
        return "\(Int(d.rounded()))° " + WxFmt22.d16[Swift.max(0, i)]
    }
}

/// Rad i Vind og Månen: navn til venstre, verdi i #bfe6ff til høyre, linje i hvit 20 % over (unntatt første).
struct WxRow22: View {
    let a: String
    let b: String
    let top: Bool
    var body: some View {
        VStack(spacing: 0) {
            if top { Rectangle().fill(Color.white.opacity(0.2)).frame(height: 1) }
            HStack(spacing: 8) {
                Text(a).font(.system(size: 15.5, weight: .bold))
                Spacer(minLength: 4)
                Text(b).font(.system(size: 15.5, weight: .bold)).foregroundStyle(Color(hex: "#bfe6ff")).lineLimit(1)
            }
            .padding(.vertical, 10)
        }
    }
}

/// Kompasset (SVG 100 × 100 i designet), tegnet i Canvas.
struct WxCompass22: View {
    let dir: Double
    let speed: String

    var body: some View {
        Canvas { ctx, size in
            let s: CGFloat = size.width / 100.0
            let ring: Path = Path(ellipseIn: CGRect(x: 8 * s, y: 8 * s, width: 84 * s, height: 84 * s))
            ctx.stroke(ring, with: .color(Color.white.opacity(0.35)), style: StrokeStyle(lineWidth: 7 * s, dash: [0.8 * s, 2.5 * s]))
            let lbl: [(String, CGFloat, CGFloat, Double)] = [("N", 50, 9, 1), ("Ø", 91, 50, 0.75), ("S", 50, 94, 0.75), ("V", 9, 50, 0.75)]
            for l in lbl {
                ctx.draw(Text(l.0).font(.system(size: 8 * s, weight: .heavy)).foregroundColor(Color.white.opacity(l.3)), at: CGPoint(x: l.1 * s, y: l.2 * s))
            }
            var arrow: Path = Path()
            arrow.addEllipse(in: CGRect(x: 46.8 * s, y: 8.8 * s, width: 6.4 * s, height: 6.4 * s))
            var lines: Path = Path()
            lines.move(to: CGPoint(x: 50 * s, y: 15 * s)); lines.addLine(to: CGPoint(x: 50 * s, y: 34 * s))
            lines.move(to: CGPoint(x: 50 * s, y: 66 * s)); lines.addLine(to: CGPoint(x: 50 * s, y: 86 * s))
            lines.move(to: CGPoint(x: 45 * s, y: 80 * s)); lines.addLine(to: CGPoint(x: 50 * s, y: 89 * s)); lines.addLine(to: CGPoint(x: 55 * s, y: 80 * s))
            let c: CGPoint = CGPoint(x: 50 * s, y: 50 * s)
            let rot: CGAffineTransform = CGAffineTransform(translationX: c.x, y: c.y).rotated(by: CGFloat(dir) * .pi / 180).translatedBy(x: -c.x, y: -c.y)
            ctx.fill(arrow.applying(rot), with: .color(.white))
            ctx.stroke(lines.applying(rot), with: .color(.white), style: StrokeStyle(lineWidth: 2 * s, lineJoin: .round))
            ctx.fill(Path(ellipseIn: CGRect(x: 31 * s, y: 31 * s, width: 38 * s, height: 38 * s)), with: .color(Color(red: 20.0 / 255.0, green: 50.0 / 255.0, blue: 90.0 / 255.0).opacity(0.35)))
            ctx.draw(Text(speed).font(.system(size: 14 * s, weight: .heavy)).foregroundColor(.white), at: CGPoint(x: 50 * s, y: 46 * s))
            ctx.draw(Text("m/s").font(.system(size: 7.5 * s, weight: .bold)).foregroundColor(.white), at: CGPoint(x: 50 * s, y: 58.5 * s))
        }
    }
}

/* ---------- Månen ---------- */

struct WxMoonCard22: View {
    let w: WeatherFull
    var body: some View {
        let age: Double = WxFmt22.moonAge(Date())
        let ill: Double = WxFmt22.moonIllum(age)
        let toFull: Int = Int(((14.77 - age).truncatingRemainder(dividingBy: 29.53) + 29.53).truncatingRemainder(dividingBy: 29.53).rounded())
        let toNew: Int = Int((29.53 - age).rounded())
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                WxCardLabel22(icon: "hMoonRing", text: moonTitle(age).uppercased(), fillIcon: "hMoonFill").padding(.bottom, 6)
                WxRow22(a: "Belyst", b: "\(Int((ill * 100).rounded())) %", top: false)
                WxRow22(a: "Neste fullmåne", b: toFull <= 0 ? "I dag" : "\(toFull) dager", top: true)
                WxRow22(a: "Neste nymåne", b: "\(toNew) dager", top: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            WxMoonDisc22(age: age).frame(width: 120, height: 120)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .wxCard22()
        .contentShape(Rectangle())
    }

    /// Designet bruker «Avtagende sigd» helt til nymåne på kortet.
    private func moonTitle(_ age: Double) -> String {
        let n: String = WxFmt22.moonName(age)
        return age >= 27.7 ? "Avtagende sigd" : n
    }
}

/// Månebildet (SVG 56 × 56): mørk skive, opplyst del og fire kratere.
struct WxMoonDisc22: View {
    let age: Double

    var body: some View {
        Canvas { ctx, size in
            let s: CGFloat = size.width / 56.0
            ctx.fill(Path(ellipseIn: CGRect(x: 4 * s, y: 4 * s, width: 48 * s, height: 48 * s)), with: .color(Color(red: 20.0 / 255.0, green: 40.0 / 255.0, blue: 70.0 / 255.0).opacity(0.55)))
            let lit: Path = WxMoonDisc22.litPath(age: age, cx: 28 * s, cy: 28 * s, r: 24 * s)
            ctx.fill(lit, with: .color(Color(hex: "#e9eef5")))
            let crater: Color = Color(red: 120.0 / 255.0, green: 140.0 / 255.0, blue: 170.0 / 255.0)
            let cs: [(CGFloat, CGFloat, CGFloat, Double)] = [(20, 20, 3, 0.25), (33, 33, 4.5, 0.22), (34, 18, 2, 0.25), (22, 38, 2.4, 0.2)]
            for c in cs {
                ctx.fill(Path(ellipseIn: CGRect(x: (c.0 - c.2) * s, y: (c.1 - c.2) * s, width: c.2 * 2 * s, height: c.2 * 2 * s)), with: .color(crater.opacity(c.3)))
            }
        }
    }

    /// Samme form som `lit` i designet: halvsirkel på den opplyste siden og en halv ellipse (rx = |1 − 2·belyst|·r) tilbake.
    static func litPath(age: Double, cx: CGFloat, cy: CGFloat, r: CGFloat) -> Path {
        let ill: Double = WxFmt22.moonIllum(age)
        let wax: Bool = age < 14.77
        let kx: CGFloat = CGFloat(abs(1 - 2 * ill)) * r
        let outer: CGFloat = wax ? 1 : -1
        let innerSweep: Bool = (ill > 0.5) == wax
        let inner: CGFloat = innerSweep ? -1 : 1
        let k: CGFloat = 0.5523
        var p: Path = Path()
        p.move(to: CGPoint(x: cx, y: cy - r))
        p.addCurve(to: CGPoint(x: cx + outer * r, y: cy), control1: CGPoint(x: cx + outer * r * k, y: cy - r), control2: CGPoint(x: cx + outer * r, y: cy - r * k))
        p.addCurve(to: CGPoint(x: cx, y: cy + r), control1: CGPoint(x: cx + outer * r, y: cy + r * k), control2: CGPoint(x: cx + outer * r * k, y: cy + r))
        p.addCurve(to: CGPoint(x: cx + inner * kx, y: cy), control1: CGPoint(x: cx + inner * kx * k, y: cy + r), control2: CGPoint(x: cx + inner * kx, y: cy + r * k))
        p.addCurve(to: CGPoint(x: cx, y: cy - r), control1: CGPoint(x: cx + inner * kx, y: cy - r * k), control2: CGPoint(x: cx + inner * kx * k, y: cy - r))
        p.closeSubpath()
        return p
    }
}
