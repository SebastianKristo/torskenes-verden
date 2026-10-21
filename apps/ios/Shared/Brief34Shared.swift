import SwiftUI
import Foundation

/* ---------------- Prompt 34: Glimt-brief – delt mellom appen og widgetene ----------------
   Fasit: design/Glimt Brief.dc.html (mode page | card | ios) og Glimt Brief Oversikt.dc.html.
   prompts/prompt-34-pakke/claude-code-glimt-brief.md.
   Data: GET /api/brief?kind=morning|day|evening → {title, summary, weather{now, hi, lo, cond, rain12h[], vsYesterday, sunset},
   events[], news[], generatedAt, mood?}. Widget-endepunkt: GET /api/brief/widget?size=… (kompakt form, leses av samme parse). Appen legger siste brief i
   App Group (w.brief34), så widgetene har noe å vise uten nett. Figuren (Glimt34Figure) er vektor i SwiftUI med tilstandene
   idle, talk, point og wave; i widgetene er den stillestående. */

enum Brief34C {
    static func rgb(_ v: UInt32, _ a: Double = 1) -> Color {
        Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255, opacity: a)
    }
    static let blue: Color = rgb(0x22476b)
    static let blue2: Color = rgb(0x2e5a7f)
    static let ink: Color = rgb(0x1b1a17)
    static let paper: Color = rgb(0xf3efe6)
    static let card: Color = rgb(0xfffdf8)
    static let red: Color = rgb(0xb23a2a)
    static let mut: Color = rgb(0x6b665c)
    static let mut2: Color = rgb(0xa39d90)
    static let line: Color = rgb(0xe6dfd1)
    static let peach: Color = rgb(0xffc7b8)
    static let star: Color = rgb(0xff7a52)
    static let ringColors: [Color] = [rgb(0xb23a2a), rgb(0xe8794a), rgb(0xf2c14e), rgb(0x3fbf9a), rgb(0x7a5ad6), rgb(0xb23a2a)]
}

struct Brief34Event: Hashable, Identifiable {
    var id: String
    var title: String
    /// «15:15»
    var time: String
    /// «i dag» / «i morgen»
    var day: String
    var place: String
    var color: String
    /// «2026-10-19» (åpner Kalender på dagen)
    var date: String
}

struct Brief34News: Hashable, Identifiable {
    var id: String { url + title }
    var source: String
    var title: String
    var url: String
    var time: String
}

struct Brief34: Hashable {
    /// morning | day | evening
    var kind: String = ""
    var title: String = ""
    var summary: String = ""
    var temp: String = ""
    var cond: String = ""
    var place: String = "Oslo"
    var hi: String = ""
    var lo: String = ""
    /// Weather-ikon: sol | delvis | sky | regn | sno
    var icon: String = "delvis"
    var rain: [Double] = []
    var vsYesterday: String = ""
    var sunset: String = ""
    var events: [Brief34Event] = []
    var news: [Brief34News] = []
    var generatedAt: Date? = nil
    /// Figurens stemning fra serveren (glad, regn, travel …). Tom = idle.
    var mood: String = ""
    var sources: String = ""
    /// Prompt 34 (SERVER34): ferdig bunntekst («Laget av Glimt 20:31 · Vær: MET Norge · Nyheter: NRK, VG»).
    var footer: String = ""
    /// «NESTE OM 40 MIN» fra serveren (next.label).
    var nextServer: String = ""
    /// Chips fra serveren (ellers regnet ut).
    var chipsServer: [String] = []

    /// Morgenbrief før 11, Dagsbrief 11–17, Kveldsbrief etter 17.
    static func kickFor(_ d: Date = Date()) -> String {
        let h: Int = Calendar.current.component(.hour, from: d)
        if h < 11 { return "Morgenbrief" }
        if h < 17 { return "Dagsbrief" }
        return "Kveldsbrief"
    }

    static func kindFor(_ d: Date = Date()) -> String {
        let h: Int = Calendar.current.component(.hour, from: d)
        if h < 11 { return "morning" }
        if h < 17 { return "day" }
        return "evening"
    }

    var kick: String {
        switch kind {
        case "morning": return "Morgenbrief"
        case "day": return "Dagsbrief"
        case "evening": return "Kveldsbrief"
        // Prompt 35: Nattbrief (22:30, av som standard).
        case "night": return "Nattbrief"
        default: return title.isEmpty ? Brief34.kickFor() : title
        }
    }

    var next: Brief34Event? { events.first }

    /// «Oslo · lettskyet»
    var placeLine: String { cond.isEmpty ? place : place + " · " + cond }
    /// «↑9° ↓4°»
    var hiLo: String {
        let h: String = "↑" + hi
        return h + " ↓" + lo
    }
    /// «✦ Kveldsbrief · 8°»
    var lockTitle: String {
        let k: String = "✦ " + kick
        return temp.isEmpty ? k : k + " · " + temp
    }
    /// «Tannlege 15:15» / «Kalenderen er fri»
    var nextLine: String {
        guard let e = events.first else { return "Kalenderen er fri" }
        return e.title + " " + e.time
    }

    /// «NESTE OM 40 MIN» / «NESTE I MORGEN 06:15» / «FRI».
    var nextLabel: String {
        if !nextServer.isEmpty { return nextServer.uppercased() }
        guard let e = next else { return "FRI" }
        if e.day == "i dag" || e.day.isEmpty, let mins = Brief34.minutesUntil(e.time) {
            if mins < 60 { return "NESTE OM " + String(mins) + " MIN" }
            return "NESTE OM " + String(Int((Double(mins) / 60).rounded())) + " T"
        }
        return ("NESTE " + e.day + " " + e.time).uppercased()
    }

    static func minutesUntil(_ hm: String) -> Int? {
        let p: [Int] = hm.split(separator: ":").compactMap { Int($0) }
        guard p.count == 2 else { return nil }
        let c: DateComponents = Calendar.current.dateComponents([.hour, .minute], from: Date())
        let now: Int = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        let m: Int = p[0] * 60 + p[1] - now
        return m >= 0 ? m : nil
    }

    /// Chips på Hjem-kortet: «8° lettskyet · Tannlege 15:15 · 3 nyheter».
    var chips: [String] {
        if !chipsServer.isEmpty { return chipsServer }
        var out: [String] = []
        if !temp.isEmpty { out.append((temp + " " + cond).trimmingCharacters(in: .whitespaces)) }
        if let e = next { out.append(e.title + " " + e.time) } else { out.append("Fri") }
        if !news.isEmpty { out.append(String(news.count) + " nyheter") }
        return out
    }

    var madeAt: String {
        guard let g = generatedAt else { return "" }
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = "HH:mm"
        return f.string(from: g)
    }

    /* ---------- Lesing ---------- */

    private static func s(_ o: [String: Any]?, _ keys: [String]) -> String {
        for k in keys {
            if let v = o?[k] as? String, !v.isEmpty { return v }
            if let n = o?[k] as? NSNumber { return n.stringValue }
        }
        return ""
    }

    private static func n(_ o: [String: Any]?, _ k: String) -> Double? {
        if let v = o?[k] as? NSNumber { return v.doubleValue }
        if let v = o?[k] as? String { return Double(v.replacingOccurrences(of: ",", with: ".").replacingOccurrences(of: "°", with: "")) }
        return nil
    }

    private static func deg(_ o: [String: Any]?, _ k: String) -> String {
        if let v = n(o, k) { return String(Int(v.rounded())) + "°" }
        let t: String = s(o, [k])
        return t.isEmpty || t.hasSuffix("°") ? t : t + "°"
    }

    static func icon(_ cond: String, code: Int?) -> String {
        if let c = code {
            if c <= 1 { return "sol" }
            if c == 2 { return "delvis" }
            if (c >= 51 && c <= 67) || (c >= 80 && c <= 82) { return "regn" }
            if (c >= 71 && c <= 77) || c == 85 || c == 86 { return "sno" }
            return "sky"
        }
        let t: String = cond.lowercased()
        if t.contains("regn") || t.contains("byge") { return "regn" }
        if t.contains("snø") { return "sno" }
        if t.contains("klar") || t.contains("sol") { return "sol" }
        if t.contains("lett") || t.contains("delvis") { return "delvis" }
        return "sky"
    }

    /// Serverens ikonnavn (clear, partly, cloudy, fog, drizzle, rain, sleet, snow, thunder) → sol | delvis | sky | regn | sno.
    static func iconName(_ ic: String) -> String {
        switch ic.lowercased() {
        case "clear", "sol", "sun": return "sol"
        case "partly", "delvis": return "delvis"
        case "drizzle", "rain", "thunder", "regn": return "regn"
        case "sleet", "snow", "sno": return "sno"
        default: return "sky"
        }
    }

    static func parse(_ d: Data) -> Brief34? {
        guard let any = try? JSONSerialization.jsonObject(with: d), var o = any as? [String: Any] else { return nil }
        if let inner = o["brief"] as? [String: Any] { o = inner }
        var b: Brief34 = Brief34()
        b.kind = s(o, ["kind"])
        b.title = s(o, ["title"])
        b.summary = s(o, ["summary", "text"]).replacingOccurrences(of: "**", with: "")
        let fig: [String: Any] = (o["figure"] as? [String: Any]) ?? [:]
        b.mood = s(fig, ["state"]).isEmpty ? s(o, ["mood", "state"]) : s(fig, ["state"])
        b.footer = s(o, ["footer"])
        b.sources = s(o, ["sources"])
        b.chipsServer = ((o["chips"] as? [Any]) ?? []).compactMap { $0 as? String }
        b.nextServer = s(o["next"] as? [String: Any], ["label"])
        // /api/brief har weather{now:{temp, cond, code, icon}}; /api/brief/widget har temp, cond og icon øverst.
        let w: [String: Any] = (o["weather"] as? [String: Any]) ?? o
        let now: [String: Any] = (w["now"] as? [String: Any]) ?? w
        b.temp = deg(now, "temp")
        if b.temp.isEmpty && !(w["now"] is [String: Any]) { b.temp = deg(w, "now") }
        b.hi = deg(w, "hi")
        b.lo = deg(w, "lo")
        b.cond = s(now, ["cond", "text", "condition"]).isEmpty ? s(w, ["cond", "text"]) : s(now, ["cond", "text", "condition"])
        b.place = s(w, ["place", "location"]).isEmpty ? "Oslo" : s(w, ["place", "location"])
        let code: Int? = n(now, "code").map { Int($0) }
        let ic: String = s(now, ["icon"])
        b.icon = ic.isEmpty ? Brief34.icon(b.cond, code: code) : Brief34.iconName(ic)
        b.rain = ((w["rain12h"] as? [Any]) ?? (w["rain"] as? [Any]) ?? []).compactMap { (v: Any) -> Double? in
            if let x = v as? NSNumber { return x.doubleValue }
            if let x = v as? [String: Any] { return n(x, "mm") ?? n(x, "v") }
            return nil
        }
        b.vsYesterday = s(w, ["vsYesterday", "compare"])
        if let vy = w["vsYesterday"] as? [String: Any] { b.vsYesterday = s(vy, ["text"]) }
        if let v = n(w, "vsYesterday"), w["vsYesterday"] is NSNumber {
            let r: Int = Int(v.rounded())
            let dir: String = r < 0 ? "kaldere" : "varmere"
            b.vsYesterday = r == 0 ? "Like varmt som i går" : String(abs(r)) + " grader " + dir + " enn i går"
        }
        b.sunset = s(w, ["sunset"])
        if b.sunset.count > 5, let t = b.sunset.split(separator: "T").last { b.sunset = String(t.prefix(5)) }
        let evs: [[String: Any]] = ((o["events"] as? [Any]) ?? []).compactMap { $0 as? [String: Any] }
        b.events = evs.enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Brief34Event in
            let e: [String: Any] = pair.element
            var tm: String = s(e, ["time", "tm", "start"])
            if tm.count > 5, let t = tm.split(separator: "T").last { tm = String(t.prefix(5)) }
            let eid: String = s(e, ["id"]).isEmpty ? String(pair.offset) : s(e, ["id"])
            return Brief34Event(id: eid, title: s(e, ["title", "t"]), time: tm, day: s(e, ["day", "d"]).lowercased(),
                                place: s(e, ["place", "location", "loc"]), color: s(e, ["color", "c"]), date: String(s(e, ["date", "start"]).prefix(10)))
        }
        // Widget-formen: next{title, time} i stedet for events[].
        if b.events.isEmpty, let nx = o["next"] as? [String: Any], !s(nx, ["title"]).isEmpty {
            b.events = [Brief34Event(id: "next", title: s(nx, ["title"]), time: s(nx, ["time"]), day: "", place: "", color: "", date: "")]
        }
        var nws: [[String: Any]] = ((o["news"] as? [Any]) ?? []).compactMap { $0 as? [String: Any] }
        if nws.isEmpty, let one = o["news"] as? [String: Any] { nws = [one] }
        b.news = nws.map { (x: [String: Any]) -> Brief34News in
            var tm: String = s(x, ["timeLabel", "time", "tm"])
            if tm.isEmpty, let p = s(x, ["published", "at"]).split(separator: "T").last { tm = String(p.prefix(5)) }
            return Brief34News(source: s(x, ["source", "s", "feed"]), title: s(x, ["title", "t"]), url: s(x, ["url", "u", "link"]), time: tm)
        }
        let g: String = s(o, ["generatedAt", "at"])
        if !g.isEmpty {
            let f: ISO8601DateFormatter = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            b.generatedAt = f.date(from: g) ?? ISO8601DateFormatter().date(from: g)
        } else if let ms = n(o, "generatedAt") {
            b.generatedAt = Date(timeIntervalSince1970: ms > 1e11 ? ms / 1000 : ms)
        }
        if b.summary.isEmpty && b.temp.isEmpty && b.events.isEmpty { return nil }
        return b
    }

    static let cacheKey: String = "w.brief34"
    static let widgetKind: String = "no.kristo.finanshub.brief34"

    static var cached: Brief34? {
        guard let d = WidgetShared.defaults.data(forKey: cacheKey) else { return nil }
        return parse(d)
    }

    static func store(_ d: Data) {
        WidgetShared.defaults.set(d, forKey: cacheKey)
    }

    static let sample: Brief34 = {
        var b: Brief34 = Brief34()
        b.kind = kindFor()
        b.summary = "Lettskyet og 8° i Oslo, regn fra ca. 20. Neste er Tannlege kl. 15:15. Ta med paraply."
        b.temp = "8°"; b.cond = "lettskyet"; b.hi = "9°"; b.lo = "4°"; b.icon = "delvis"
        b.rain = [0, 0, 0, 0.1, 0, 0, 0.4, 0.9, 1.2, 0.6, 0.1, 0]
        b.events = [Brief34Event(id: "1", title: "Tannlege", time: "15:15", day: "i dag", place: "Tannhelse Bislett", color: "#3d7f8a", date: "")]
        b.news = [Brief34News(source: "NRK", title: "Kraftig regn ventes på Østlandet i kveld", url: "https://www.nrk.no", time: "19:17")]
        return b
    }()
}

/* ---------- Glimt-figuren ---------- */

/// idle · talk (munnen beveger seg, ringen spinner raskere) · point (armen peker) · wave (vinker).
enum Glimt34Mood: String {
    case idle, talk, point, wave
}

/// Figuren i én ramme. t = sekunder (TimelineView i appen, 0 i widgetene). Høyde = size × 1,12.
struct Glimt34Figure: View {
    let size: CGFloat
    var mood: Glimt34Mood = .idle
    var lean: Double = 0
    var t: Double = 0
    var still: Bool = false
    /// Prompt 44: beholderen (Glimt44Brief34Stack) står for svevet, så pynten følger figuren.
    var carried44: Bool = false

    var body: some View {
        let s: CGFloat = size
        let bob: CGFloat = (still || carried44) ? 0 : CGFloat(-2.5 + 2.5 * cos(t * 2 * .pi / 2.6))
        ZStack(alignment: .topLeading) {
            Glimt34Arm(size: s, left: true, angle: armAngle)
            Glimt34Arm(size: s, left: false, angle: 12)
            Glimt34Ring(size: s, angle: ringAngle)
                .offset(x: 0, y: s * 0.14)
            Glimt34Face(size: s * 0.84, blink: blink, talk: talkScale)
                .offset(x: s * 0.08, y: s * 0.22)
            Glimt34Star(size: s * 0.2, phase: still ? 0.5 : t)
                .offset(x: s * 0.4, y: -s * 0.02)
        }
        .frame(width: s, height: s * 1.12, alignment: .topLeading)
        .rotationEffect(.degrees(lean))
        .offset(y: bob)
        .accessibilityLabel("Glimt")
    }

    private var armAngle: Double {
        if mood == .point { return -28 }
        if still { return 10 }
        let speed: Double = mood == .wave ? 0.9 : 1.6
        return 9 + 19 * sin(t * 2 * .pi / speed)
    }

    private var ringAngle: Double {
        if still { return 0 }
        let period: Double = mood == .talk ? 1.6 : 6
        return (t.truncatingRemainder(dividingBy: period) / period) * 360
    }

    /// Øynene lukkes et øyeblikk hvert 4. sekund.
    private var blink: CGFloat {
        if still { return 1 }
        let p: Double = t.truncatingRemainder(dividingBy: 4) / 4
        return p > 0.92 && p < 0.98 ? 0.1 : 1
    }

    private var talkScale: CGFloat {
        if mood != .talk || still { return 1 }
        return CGFloat(0.725 + 0.275 * sin(t * 2 * .pi / 0.32))
    }
}

/// Regnbueringen (roterer sakte).
struct Glimt34Ring: View {
    let size: CGFloat
    let angle: Double

    var body: some View {
        let w: CGFloat = Swift.max(2.5, size * 0.07)
        Circle()
            .strokeBorder(AngularGradient(colors: Brief34C.ringColors, center: .center), lineWidth: w)
            .rotationEffect(.degrees(angle))
            .frame(width: size, height: size)
    }
}

/// Krem fjes med øyne som blunker, rosa kinn og rød munn.
struct Glimt34Face: View {
    let size: CGFloat
    let blink: CGFloat
    let talk: CGFloat

    var body: some View {
        let u: CGFloat = size / 0.84
        ZStack(alignment: .topLeading) {
            Circle().fill(Brief34C.card)
                .overlay(Circle().strokeBorder(Brief34C.ink.opacity(0.06), lineWidth: Swift.max(1, u * 0.03)))
            Glimt34Eye(w: u * 0.1, h: u * 0.14, blink: blink).offset(x: size * 0.27, y: size * 0.36)
            Glimt34Eye(w: u * 0.1, h: u * 0.14, blink: blink).offset(x: size * 0.73 - u * 0.1, y: size * 0.36)
            Ellipse().fill(Brief34C.rgb(0xe8794a, 0.35)).frame(width: u * 0.1, height: u * 0.06).offset(x: size * 0.16, y: size * 0.56)
            Ellipse().fill(Brief34C.rgb(0xe8794a, 0.35)).frame(width: u * 0.1, height: u * 0.06).offset(x: size * 0.84 - u * 0.1, y: size * 0.56)
            Glimt34Mouth(w: u * 0.22, h: u * 0.12, talk: talk).offset(x: size * 0.5 - u * 0.11, y: size * 0.6)
        }
        .frame(width: size, height: size, alignment: .topLeading)
    }
}

struct Glimt34Eye: View {
    let w: CGFloat
    let h: CGFloat
    let blink: CGFloat

    var body: some View {
        RoundedRectangle(cornerRadius: w * 0.6, style: .continuous)
            .fill(Brief34C.ink)
            .frame(width: w, height: h)
            .scaleEffect(x: 1, y: blink, anchor: .center)
    }
}

/// Halvsirkel-munn (avrundet nederst); «snakker» ved å skalere i høyden fra toppen.
struct Glimt34Mouth: View {
    let w: CGFloat
    let h: CGFloat
    let talk: CGFloat

    var body: some View {
        UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: h, bottomTrailingRadius: h, topTrailingRadius: 0, style: .continuous)
            .fill(Brief34C.red)
            .frame(width: w, height: h)
            .scaleEffect(x: 1, y: talk, anchor: .top)
    }
}

/// Armene: venstre vinker (eller peker), høyre hviler.
struct Glimt34Arm: View {
    let size: CGFloat
    let left: Bool
    let angle: Double

    var body: some View {
        let w: CGFloat = size * (left ? 0.22 : 0.2)
        let h: CGFloat = size * 0.1
        Capsule().fill(Brief34C.ink)
            .frame(width: w, height: h)
            .rotationEffect(.degrees(angle), anchor: left ? UnitPoint(x: 0.9, y: 0.5) : .center)
            .offset(x: left ? -size * 0.06 : size * 1.06 - w, y: size * (left ? 0.56 : 0.6))
    }
}

/// Stjernen over hodet som glitrer.
struct Glimt34Star: View {
    let size: CGFloat
    let phase: Double

    var body: some View {
        let p: Double = (sin(phase * 2 * .pi / 1.8) + 1) / 2
        Glimt34StarShape()
            .fill(Brief34C.star)
            .frame(width: size, height: size)
            .scaleEffect(CGFloat(0.6 + 0.5 * p))
            .rotationEffect(.degrees(45 * p))
            .opacity(0.3 + 0.7 * p)
    }
}

/// Fireuddet stjerne (M12 1.5c.6 4.9 4.6 8.9 9.5 9.5v2c-4.9.6-8.9 4.6-9.5 9.5 … i 24-ruter).
struct Glimt34StarShape: Shape {
    func path(in r: CGRect) -> Path {
        let cx: CGFloat = r.midX
        let cy: CGFloat = r.midY
        let a: CGFloat = r.width / 2
        let k: CGFloat = a * 0.18
        var p: Path = Path()
        p.move(to: CGPoint(x: cx, y: cy - a))
        p.addQuadCurve(to: CGPoint(x: cx + a, y: cy), control: CGPoint(x: cx + k, y: cy - k))
        p.addQuadCurve(to: CGPoint(x: cx, y: cy + a), control: CGPoint(x: cx + k, y: cy + k))
        p.addQuadCurve(to: CGPoint(x: cx - a, y: cy), control: CGPoint(x: cx - k, y: cy + k))
        p.addQuadCurve(to: CGPoint(x: cx, y: cy - a), control: CGPoint(x: cx - k, y: cy - k))
        p.closeSubpath()
        return p
    }
}

/* ---------- Vær-ikon (samme stier som fasiten, enkle former) ---------- */

struct Brief34WxIcon: View {
    let icon: String
    let size: CGFloat
    var color: Color = Color.white

    var body: some View {
        Image(systemName: Brief34WxIcon.symbol(icon))
            .font(.system(size: size * 0.8, weight: .regular))
            .symbolRenderingMode(.hierarchical)
            .foregroundStyle(color)
            .frame(width: size, height: size)
    }

    static func symbol(_ i: String) -> String {
        switch i {
        case "sol": return "sun.max"
        case "delvis": return "cloud.sun"
        case "regn": return "cloud.rain"
        case "sno": return "cloud.snow"
        default: return "cloud"
        }
    }

    static func tint(_ i: String) -> Color {
        switch i {
        case "sol": return Brief34C.rgb(0xffd27a)
        case "regn": return Brief34C.rgb(0x9cc8ff)
        case "delvis": return Brief34C.rgb(0xffd27a)
        default: return Brief34C.rgb(0xe6eef7)
        }
    }
}
