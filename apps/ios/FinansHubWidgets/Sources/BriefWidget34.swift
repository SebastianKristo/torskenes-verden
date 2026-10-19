import SwiftUI
import WidgetKit
import AppIntents

/* ---------------- Prompt 34: Glimt-brief-widgets (liten, medium, stor og låseskjerm) ----------------
   Fasit: design/Glimt Brief.dc.html → isWi (iOS) og Glimt Brief Oversikt.dc.html.
   Liten: blå (#22476b), figur + temperatur, «KVELDSBRIEF» og neste avtale. Medium: krem, figur + oppsummering til venstre og
   VÆR / NESTE / NYHET til høyre. Stor: hele briefen (oppsummering, vær med nedbør, 3 avtaler, 2 nyheter).
   Låseskjerm: rektangel (tittel + neste + temperatur), rund (temperatur) og linje. Trykk → finanshub://brief.
   Oppdateres kl. 06:30, 11:00 og 17:00, og ellers hver time. Data: GET /api/brief, så /api/brief/widget, så App Group. */

struct Brief34Entry: TimelineEntry {
    let date: Date
    let brief: Brief34
    let linked: Bool
    /// Figurens positur i denne rammen (widgeten tegnes som stillbilder; iOS animerer overgangen mellom rammene).
    var mood: Glimt34Mood = .idle
    var phase: Double = 0
    /// Det Glimt sier etter et trykk (tom = vanlig oppsummering).
    var bubble: String = ""
}

/* ---------- Trykk på Glimt: figuren vinker og sier det viktigste akkurat nå ---------- */

struct GlimtPoke34Intent: AppIntent {
    static var title: LocalizedStringResource = "Hils på Glimt"
    static var description = IntentDescription("Glimt vinker og forteller det viktigste akkurat nå.")

    func perform() async throws -> some IntentResult {
        let d: UserDefaults = WidgetShared.defaults
        d.set(Date().timeIntervalSince1970, forKey: Brief34Pose.pokeKey)
        d.set(d.integer(forKey: Brief34Pose.tipKey) + 1, forKey: Brief34Pose.tipKey)
        WidgetCenter.shared.reloadTimelines(ofKind: Brief34.widgetKind)
        return .result()
    }
}

enum Brief34Pose {
    static let pokeKey: String = "w.brief34.poke"
    static let tipKey: String = "w.brief34.tip"

    /// Stemningen serveren sender (figure.state), ellers idle.
    static func base(_ b: Brief34) -> Glimt34Mood {
        let m: String = b.mood.lowercased()
        if m == "wave" { return .wave }
        if m == "point" { return .point }
        if m == "talk" { return .talk }
        return .idle
    }

    static func tips(_ b: Brief34) -> [String] {
        var t: [String] = []
        if let e = b.next {
            let when: String = e.day == "i dag" || e.day.isEmpty ? e.time : e.day + " " + e.time
            t.append("Neste: " + e.title + " " + when)
        }
        if !b.temp.isEmpty {
            let c: String = b.cond.isEmpty ? "" : ", " + b.cond
            t.append("Det er " + b.temp + c + " ute")
        }
        if b.rain.prefix(12).contains(where: { (v: Double) -> Bool in v >= 0.2 }) { t.append("Ta med paraply i dag ☂") }
        if let n = b.news.first { t.append(n.source + ": " + n.title) }
        t.append("Hei! Jeg er Glimt ✦")
        return t
    }

    static func bubble(_ b: Brief34) -> String {
        let all: [String] = tips(b)
        let i: Int = WidgetShared.defaults.integer(forKey: tipKey)
        return all[((i % all.count) + all.count) % all.count]
    }

    /// Rammene: etter et trykk vinker Glimt (armen opp og ned) og snakker, så tilbake til ro.
    /// Ellers små skift i positur hvert kvarter, så figuren ikke står helt stille.
    static func entries(_ e: Brief34Entry, poked: Bool) -> [Brief34Entry] {
        let now: Date = Date()
        let rest: Glimt34Mood = base(e.brief)
        var out: [Brief34Entry] = []
        var start: Date = now
        if poked {
            let say: String = bubble(e.brief)
            let wave: [(Double, Glimt34Mood, Double)] = [(0, .wave, 0.225), (0.8, .wave, 0.675), (1.6, .wave, 0.225), (2.4, .wave, 0.675), (3.2, .talk, 0.16)]
            for w in wave {
                out.append(Brief34Entry(date: now.addingTimeInterval(w.0), brief: e.brief, linked: e.linked, mood: w.1, phase: w.2, bubble: say))
            }
            out.append(Brief34Entry(date: now.addingTimeInterval(5), brief: e.brief, linked: e.linked, mood: .idle, phase: 1.3, bubble: say))
            start = now.addingTimeInterval(12)
        }
        let phases: [Double] = [0, 0.65, 1.3, 3.8]
        for (i, ph) in phases.enumerated() {
            let mood: Glimt34Mood = i == 0 ? rest : .idle
            out.append(Brief34Entry(date: start.addingTimeInterval(Double(i) * 900), brief: e.brief, linked: e.linked, mood: mood, phase: ph))
        }
        return out
    }
}

/// Glimt-figuren i widgeten. Trykk → vinker (interaktiv widget, iOS 17).
struct BriefGlimt34: View {
    let e: Brief34Entry
    let size: CGFloat

    var body: some View {
        Button(intent: GlimtPoke34Intent()) {
            Glimt34Figure(size: size, mood: e.mood, t: e.phase)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Hils på Glimt")
    }
}

/// Snakkeboblen Glimt viser etter et trykk.
struct BriefBubble34: View {
    let text: String
    let dark: Bool

    var body: some View {
        Text(text)
            .font(.system(size: 12.5, weight: .bold))
            .foregroundStyle(dark ? Brief34C.blue : Color.white)
            .lineLimit(3)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(dark ? Color.white : Brief34C.blue, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .transition(.scale(scale: 0.6, anchor: .topLeading).combined(with: .opacity))
    }
}

enum Brief34Fetch {
    static func load() async -> Brief34Entry {
        let linked: Bool = !(WidgetShared.token ?? "").isEmpty
        let kind: String = Brief34.kindFor()
        // Hele briefen (med nedbør og avtaler til Stor), ellers den kompakte widget-formen.
        if let d = await Trials32b.request("/api/brief?kind=" + kind), let b = Brief34.parse(d) {
            Brief34.store(d)
            return Brief34Entry(date: Date(), brief: b, linked: linked)
        }
        if let d = await Trials32b.request("/api/brief/widget?size=medium"), let b = Brief34.parse(d) {
            return Brief34Entry(date: Date(), brief: b, linked: linked)
        }
        let b: Brief34 = Brief34.cached ?? Brief34()
        return Brief34Entry(date: Date(), brief: b, linked: linked)
    }

    static func cachedEntry() -> Brief34Entry {
        let linked: Bool = !(WidgetShared.token ?? "").isEmpty
        return Brief34Entry(date: Date(), brief: Brief34.cached ?? Brief34(), linked: linked)
    }

    /// Neste av 06:30, 11:00 og 17:00 (eller om en time, hvis det kommer først).
    static func nextRefresh(_ now: Date = Date()) -> Date {
        let cal: Calendar = Calendar.current
        let slots: [(Int, Int)] = [(6, 30), (11, 0), (17, 0)]
        var best: Date = now.addingTimeInterval(3600)
        for day in 0...1 {
            guard let base = cal.date(byAdding: .day, value: day, to: cal.startOfDay(for: now)) else { continue }
            for s in slots {
                if let d = cal.date(bySettingHour: s.0, minute: s.1, second: 0, of: base), d > now, d < best { best = d }
            }
        }
        return best
    }
}

struct Brief34Provider: TimelineProvider {
    func placeholder(in context: Context) -> Brief34Entry {
        Brief34Entry(date: Date(), brief: Brief34.sample, linked: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (Brief34Entry) -> Void) {
        if context.isPreview { completion(placeholder(in: context)); return }
        Task { completion(await Brief34Fetch.load()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Brief34Entry>) -> Void) {
        Task {
            let poke: Double = WidgetShared.defaults.double(forKey: Brief34Pose.pokeKey)
            let poked: Bool = poke > 0 && Date().timeIntervalSince1970 - poke < 20
            // Etter et trykk: bufret brief, så vinkingen starter med en gang.
            let e: Brief34Entry = poked ? Brief34Fetch.cachedEntry() : await Brief34Fetch.load()
            completion(Timeline(entries: Brief34Pose.entries(e, poked: poked), policy: .after(Brief34Fetch.nextRefresh())))
        }
    }
}

struct BriefWidget34: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Brief34.widgetKind, provider: Brief34Provider()) { (e: Brief34Entry) in
            BriefWidgetView34(entry: e)
        }
        .configurationDisplayName("Glimt-brief")
        .description("Morgen-, dags- og kveldsbrief fra Glimt: vær, neste avtale og nyheter.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

struct BriefWidgetView34: View {
    @Environment(\.widgetFamily) private var family
    let entry: Brief34Entry

    var body: some View {
        content
            .widgetURL(URL(string: "finanshub://brief"))
            .containerBackground(for: .widget) { background }
    }

    @ViewBuilder private var content: some View {
        switch family {
        case .systemMedium: BriefMedium34(b: entry.brief, linked: entry.linked, e: entry)
        case .systemLarge: BriefLarge34(b: entry.brief, linked: entry.linked, e: entry)
        case .accessoryRectangular: BriefRect34(b: entry.brief)
        case .accessoryCircular: BriefCircle34(b: entry.brief)
        case .accessoryInline: BriefInline34(b: entry.brief)
        default: BriefSmall34(b: entry.brief, linked: entry.linked, e: entry)
        }
    }

    @ViewBuilder private var background: some View {
        switch family {
        case .systemSmall: Brief34C.blue
        case .systemMedium, .systemLarge: Brief34C.card
        default: Color.clear
        }
    }
}

/// Liten (2×2): blå, figur + temperatur, «KVELDSBRIEF» og neste avtale.
struct BriefSmall34: View {
    let b: Brief34
    let linked: Bool
    let e: Brief34Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                BriefGlimt34(e: e, size: 30)
                Spacer(minLength: 0)
                Text(b.temp.isEmpty ? "–" : b.temp).font(.custom("Newsreader-Medium", size: 30)).foregroundStyle(Color.white)
            }
            Spacer(minLength: 0)
            if e.bubble.isEmpty {
                Text(b.kick.uppercased()).font(.system(size: 9.5, weight: .semibold, design: .monospaced)).tracking(1.1).foregroundStyle(Brief34C.peach)
                Text(nextTitle).font(.system(size: 13.5, weight: .bold)).foregroundStyle(Color.white).lineLimit(2)
                Text(nextTime).font(.system(size: 11, weight: .semibold, design: .monospaced)).foregroundStyle(Color.white.opacity(0.8))
            } else {
                BriefBubble34(text: e.bubble, dark: true)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var nextTitle: String {
        if !linked { return "Åpne appen og logg inn" }
        return b.next?.title ?? "Fri dag"
    }

    private var nextTime: String {
        guard let e = b.next else { return "" }
        return e.day == "i dag" || e.day.isEmpty ? e.time : e.day + " " + e.time
    }
}

/// Medium (4×2): krem, figur + oppsummering til venstre, VÆR / NESTE / NYHET til høyre.
struct BriefMedium34: View {
    let b: Brief34
    let linked: Bool
    let e: Brief34Entry

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    BriefGlimt34(e: e, size: 26)
                    Text(b.kick.uppercased()).font(.system(size: 9.5, weight: .semibold, design: .monospaced)).tracking(1.1).foregroundStyle(Brief34C.red)
                }
                if e.bubble.isEmpty {
                    Text(summary).font(.custom("Newsreader-Medium", size: 14.5)).foregroundStyle(Brief34C.ink).lineLimit(4)
                } else {
                    BriefBubble34(text: e.bubble, dark: false)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .leading, spacing: 7) {
                BriefKV34(k: "VÆR", v: weather)
                BriefKV34(k: "NESTE", v: b.next == nil ? "Fri" : b.nextLine)
                BriefKV34(k: "NYHET", v: b.news.first?.title ?? "–")
            }
            .frame(width: 118, alignment: .leading)
            .padding(.leading, 10)
            .overlay(alignment: .leading) { Rectangle().fill(Brief34C.line).frame(width: 1) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var summary: String {
        if !linked { return "Åpne appen og logg inn for å få briefen." }
        return b.summary.isEmpty ? "Glimt lager briefen din …" : b.summary
    }

    private var weather: String {
        if b.temp.isEmpty { return "–" }
        return b.cond.isEmpty ? b.temp : b.temp + " · " + b.cond
    }
}

struct BriefKV34: View {
    let k: String
    let v: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(k).font(.system(size: 9.5, weight: .semibold, design: .monospaced)).foregroundStyle(Brief34C.mut2)
            Text(v).font(.system(size: 12.5, weight: .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
        }
    }
}

/// Stor (4×4): oppsummering, vær med nedbør neste 12 t, 3 avtaler og 2 nyheter.
struct BriefLarge34: View {
    let b: Brief34
    let linked: Bool
    let e: Brief34Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("GLIMT · " + b.kick.uppercased()).font(.system(size: 10, weight: .semibold, design: .monospaced)).tracking(1.1).foregroundStyle(Brief34C.red)
                    if e.bubble.isEmpty {
                        Text(largeSummary).font(.custom("Newsreader-Regular", size: 15)).foregroundStyle(Brief34C.ink).lineLimit(4)
                    } else {
                        BriefBubble34(text: e.bubble, dark: false)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                BriefGlimt34(e: e, size: 44)
            }
            BriefLargeWeather34(b: b)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(b.events.prefix(3)) { (e: Brief34Event) in
                    BriefLargeRow34(left: e.time, title: e.title, sub: e.day + (e.place.isEmpty ? "" : " · " + e.place))
                }
                ForEach(b.news.prefix(2)) { (n: Brief34News) in
                    BriefLargeRow34(left: n.source, title: n.title, sub: n.time)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

extension BriefLarge34 {
    var largeSummary: String {
        if !linked { return "Åpne appen og logg inn for å få briefen." }
        return b.summary.isEmpty ? "Glimt lager briefen din …" : b.summary
    }
}

struct BriefLargeWeather34: View {
    let b: Brief34

    var body: some View {
        let vals: [Double] = b.rain.isEmpty ? Array(repeating: 0, count: 12) : Array(b.rain.prefix(12))
        let mx: Double = Swift.max(0.6, vals.max() ?? 0.6)
        HStack(spacing: 12) {
            Brief34WxIcon(icon: b.icon, size: 30, color: Brief34WxIcon.tint(b.icon))
            Text(b.temp.isEmpty ? "–" : b.temp).font(.custom("Newsreader-Medium", size: 28)).foregroundStyle(Color.white)
            HStack(alignment: .bottom, spacing: 2) {
                ForEach(Array(vals.enumerated()), id: \.offset) { (pair: (offset: Int, element: Double)) in
                    BriefRainBar34(frac: Swift.max(0.08, pair.element / mx), wet: pair.element >= 0.2)
                }
            }
            .frame(height: 30)
        }
        .padding(12)
        .background(Brief34C.blue, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct BriefRainBar34: View {
    let frac: Double
    let wet: Bool

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            RoundedRectangle(cornerRadius: 1.5).fill(Color.white.opacity(wet ? 0.9 : 0.3)).frame(height: 30 * CGFloat(Swift.min(1, frac)))
        }
        .frame(maxWidth: .infinity)
    }
}

struct BriefLargeRow34: View {
    let left: String
    let title: String
    let sub: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(left).font(.system(size: 11, weight: .semibold, design: .monospaced)).foregroundStyle(Brief34C.red).frame(width: 40, alignment: .leading)
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.system(size: 13, weight: .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                if !sub.isEmpty { Text(sub).font(.system(size: 11)).foregroundStyle(Brief34C.mut).lineLimit(1) }
            }
        }
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(Brief34C.line).frame(height: 1) }
    }
}

/* ---------- Låseskjerm ---------- */

struct BriefRect34: View {
    let b: Brief34

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(b.lockTitle).font(.system(size: 13, weight: .bold)).lineLimit(1)
            Text(b.nextLine).font(.system(size: 13)).lineLimit(1)
            Text(b.news.first?.title ?? b.cond).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct BriefCircle34: View {
    let b: Brief34

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Image(systemName: Brief34WxIcon.symbol(b.icon)).font(.system(size: 13, weight: .semibold))
                Text(b.temp.isEmpty ? "–" : b.temp).font(.system(size: 15, weight: .bold))
            }
        }
    }
}

struct BriefInline34: View {
    let b: Brief34

    var body: some View {
        Text(inline)
    }

    private var inline: String {
        let t: String = b.temp.isEmpty ? b.kick : b.temp + " · " + b.kick
        guard let e = b.next else { return t }
        return t + " · " + e.title + " " + e.time
    }
}
