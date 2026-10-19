import SwiftUI
import WidgetKit

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
            let e: Brief34Entry = await Brief34Fetch.load()
            completion(Timeline(entries: [e], policy: .after(Brief34Fetch.nextRefresh())))
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
        case .systemMedium: BriefMedium34(b: entry.brief, linked: entry.linked)
        case .systemLarge: BriefLarge34(b: entry.brief, linked: entry.linked)
        case .accessoryRectangular: BriefRect34(b: entry.brief)
        case .accessoryCircular: BriefCircle34(b: entry.brief)
        case .accessoryInline: BriefInline34(b: entry.brief)
        default: BriefSmall34(b: entry.brief, linked: entry.linked)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Glimt34Figure(size: 30, still: true)
                Spacer(minLength: 0)
                Text(b.temp.isEmpty ? "–" : b.temp).font(.custom("Newsreader-Medium", size: 30)).foregroundStyle(Color.white)
            }
            Spacer(minLength: 0)
            Text(b.kick.uppercased()).font(.system(size: 9.5, weight: .semibold, design: .monospaced)).tracking(1.1).foregroundStyle(Brief34C.peach)
            Text(nextTitle).font(.system(size: 13.5, weight: .bold)).foregroundStyle(Color.white).lineLimit(2)
            Text(nextTime).font(.system(size: 11, weight: .semibold, design: .monospaced)).foregroundStyle(Color.white.opacity(0.8))
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

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Glimt34Figure(size: 26, still: true)
                    Text(b.kick.uppercased()).font(.system(size: 9.5, weight: .semibold, design: .monospaced)).tracking(1.1).foregroundStyle(Brief34C.red)
                }
                Text(summary).font(.custom("Newsreader-Medium", size: 14.5)).foregroundStyle(Brief34C.ink).lineLimit(4)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("GLIMT · " + b.kick.uppercased()).font(.system(size: 10, weight: .semibold, design: .monospaced)).tracking(1.1).foregroundStyle(Brief34C.red)
                    Text(linked ? (b.summary.isEmpty ? "Glimt lager briefen din …" : b.summary) : "Åpne appen og logg inn for å få briefen.")
                        .font(.custom("Newsreader-Regular", size: 15)).foregroundStyle(Brief34C.ink).lineLimit(4)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Glimt34Figure(size: 44, still: true)
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
