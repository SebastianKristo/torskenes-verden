import SwiftUI
import WidgetKit
import AppIntents

/* ---------------- Prompt 40 (tillegg) «Felles»: Hjem-widgeten for Hjemlys med «Start for meg» ----------------
   Fasit: design/Hjemme trygt Varianter.dc.html → Felles (Hjem-widget). Liten og medium på hjemskjermen + låseskjerm (rektangel/rund).
   Viser egen økt («På vei · 8 min» med fremdrift), ellers hvem i husstanden som har Vel fremme på, og knappen «Start for meg»
   (Hjemlys40StartIntent: LiveActivityIntent, starter Hjemlys og Live Activity uten å åpne appen). Data: App Group (w.hjemlys40,
   skrevet av appen) og GET /api/hjemlys med appens token. Ingen posisjon vises noen gang i widgeten. */

struct Hjemlys40Entry: TimelineEntry {
    let date: Date
    let c: Hjemlys40Cache
}

struct Hjemlys40Provider: TimelineProvider {
    func placeholder(in context: Context) -> Hjemlys40Entry {
        var c: Hjemlys40Cache = Hjemlys40Cache()
        c.household = [Hjemlys40CacheMember(name: "Rune", state: "onTheWay", eta: Date().addingTimeInterval(900).timeIntervalSince1970)]
        return Hjemlys40Entry(date: Date(), c: c)
    }

    func getSnapshot(in context: Context, completion: @escaping (Hjemlys40Entry) -> Void) {
        completion(Hjemlys40Entry(date: Date(), c: Hjemlys40Cache.cached))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Hjemlys40Entry>) -> Void) {
        Task {
            var c: Hjemlys40Cache = Hjemlys40Cache.cached
            if let d = await Hjemlys40Net.call("GET", "/hjemlys", nil), let fresh = Hjemlys40Cache.parse(d) {
                c = fresh
                Hjemlys40Cache.write(fresh)
            }
            let now: Date = Date()
            let active: Bool = c.mineActive || c.household.contains { $0.state == "onTheWay" || $0.state == "late" }
            // Aktiv økt: ny rad hvert minutt de neste 30 minuttene (minuttene teller ned); ellers hvert 15. minutt.
            var entries: [Hjemlys40Entry] = []
            let steps: Int = active ? 30 : 1
            var i: Int = 0
            while i < steps {
                entries.append(Hjemlys40Entry(date: now.addingTimeInterval(Double(i) * 60), c: c))
                i += 1
            }
            let next: Date = now.addingTimeInterval(active ? 30 * 60 : 15 * 60)
            completion(Timeline(entries: entries, policy: .after(next)))
        }
    }
}

struct HjemlysWidget40: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "no.kristo.finanshub.hjemlys40", provider: Hjemlys40Provider()) { (e: Hjemlys40Entry) in
            Hjemlys40WidgetView(e: e)
                .containerBackground(for: .widget) { Hjemlys40WidgetBg() }
                .widgetURL(URL(string: "finanshub://hjemlys"))
        }
        .configurationDisplayName("Vel fremme")
        .description("Si fra når du er hjemme – og se hvem i husstanden som er på vei.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
    }
}

struct Hjemlys40WidgetBg: View {
    @Environment(\.widgetRenderingMode) private var mode

    var body: some View {
        if mode == .fullColor {
            LinearGradient(colors: [Hjemlys40Look.c(0x2c3550), Hjemlys40Look.c(0x141826)], startPoint: .top, endPoint: .bottom)
        } else {
            Color.clear
        }
    }
}

struct Hjemlys40WidgetView: View {
    @Environment(\.widgetFamily) private var family
    let e: Hjemlys40Entry

    var body: some View {
        switch family {
        case .accessoryCircular: Hjemlys40WidgetRound(e: e)
        case .accessoryRectangular: Hjemlys40WidgetRect(e: e)
        case .systemMedium: Hjemlys40WidgetMedium(e: e)
        default: Hjemlys40WidgetSmall(e: e)
        }
    }
}

enum Hjemlys40WidgetText {
    static func mine(_ c: Hjemlys40Cache, _ now: Date) -> String {
        if c.mineState == "late" { return "Sen · familien er varslet" }
        if c.mineState == "home" { return "Hjemme ✓" }
        return "På vei · " + Hjemlys40Look.mins(Hjemlys40Look.minutesLeft(c.mineEta, now))
    }

    static func member(_ m: Hjemlys40CacheMember) -> String {
        let first: String = String(m.name.split(separator: " ").first ?? "")
        switch m.state {
        case "late": return first + " · sen"
        case "home": return first + " · hjemme"
        case "onTheWay": return first + " · på vei" + (m.eta > 0 ? " · " + Hjemlys40Look.clock(Date(timeIntervalSince1970: m.eta)) : "")
        default: return first
        }
    }

    static func progress(_ c: Hjemlys40Cache, _ now: Date) -> Double {
        let span: Double = c.mineEta - c.mineStart
        if span <= 0 { return 0 }
        return Swift.min(1, Swift.max(0, (now.timeIntervalSince1970 - c.mineStart) / span))
    }
}

struct Hjemlys40StartButton: View {
    let height: CGFloat

    var body: some View {
        Button(intent: Hjemlys40StartIntent()) {
            Text("Start for meg").font(.system(size: 13, weight: .heavy)).foregroundStyle(Hjemlys40Look.c(0x0d1a12))
                .frame(maxWidth: .infinity).frame(height: height)
                .background(Hjemlys40Look.green, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct Hjemlys40WidgetSmall: View {
    let e: Hjemlys40Entry

    var body: some View {
        let c: Hjemlys40Cache = e.c
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Hjemlys40Dot(size: 16, state: c.mineActive ? c.mineState : "onTheWay")
                Text("Vel fremme").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.white)
            }
            Spacer(minLength: 0)
            if c.mineActive || c.mineState == "home" {
                Text(Hjemlys40WidgetText.mine(c, e.date)).font(.system(size: 17, weight: .bold))
                    .foregroundStyle(c.mineState == "late" ? Hjemlys40Look.red : Hjemlys40Look.green).lineLimit(2).minimumScaleFactor(0.7)
                if c.mineActive {
                    ProgressView(value: Hjemlys40WidgetText.progress(c, e.date)).tint(Hjemlys40Look.green)
                    Button(intent: Hjemlys40HomeIntent(sessionId: c.mineId)) {
                        Text("Jeg er hjemme").font(.system(size: 12.5, weight: .heavy)).foregroundStyle(Hjemlys40Look.c(0x0d1a12))
                            .frame(maxWidth: .infinity).frame(height: 30).background(Hjemlys40Look.green, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            } else {
                if let m = c.household.first(where: { $0.state == "onTheWay" || $0.state == "late" }) {
                    Text(Hjemlys40WidgetText.member(m)).font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.8)).lineLimit(2)
                } else {
                    Text("Et lite lys som står på til du er hjemme.").font(.system(size: 11.5)).foregroundStyle(Color.white.opacity(0.7)).lineLimit(3)
                }
                Hjemlys40StartButton(height: 32)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct Hjemlys40WidgetMedium: View {
    let e: Hjemlys40Entry

    var body: some View {
        let c: Hjemlys40Cache = e.c
        HStack(alignment: .top, spacing: 14) {
            Hjemlys40WidgetSmall(e: e).frame(maxWidth: .infinity)
            VStack(alignment: .leading, spacing: 6) {
                Text("HUSSTANDEN").font(.system(size: 10, weight: .heavy)).tracking(1).foregroundStyle(Color.white.opacity(0.6))
                if c.household.isEmpty {
                    Text("Ingen har Vel fremme på").font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.7))
                }
                ForEach(Array(c.household.prefix(4).enumerated()), id: \.offset) { _, m in
                    HStack(spacing: 6) {
                        Circle().fill(color(m.state)).frame(width: 8, height: 8)
                        Text(Hjemlys40WidgetText.member(m)).font(.system(size: 12)).foregroundStyle(Color.white).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func color(_ s: String) -> Color {
        switch s {
        case "late": return Hjemlys40Look.red
        case "home": return Hjemlys40Look.gold
        case "onTheWay": return Hjemlys40Look.green
        default: return Color.white.opacity(0.3)
        }
    }
}

struct Hjemlys40WidgetRect: View {
    let e: Hjemlys40Entry

    var body: some View {
        let c: Hjemlys40Cache = e.c
        VStack(alignment: .leading, spacing: 2) {
            Text("Vel fremme").font(.system(size: 13, weight: .bold))
            if c.mineActive || c.mineState == "home" {
                Text(Hjemlys40WidgetText.mine(c, e.date)).font(.system(size: 15, weight: .semibold)).lineLimit(1)
            } else if let m = c.household.first(where: { $0.state == "onTheWay" || $0.state == "late" }) {
                Text(Hjemlys40WidgetText.member(m)).font(.system(size: 13)).lineLimit(1)
            } else {
                Text("Trykk for å starte").font(.system(size: 13)).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetAccentable()
    }
}

struct Hjemlys40WidgetRound: View {
    let e: Hjemlys40Entry

    var body: some View {
        let c: Hjemlys40Cache = e.c
        ZStack {
            AccessoryWidgetBackground()
            if c.mineActive {
                Gauge(value: Hjemlys40WidgetText.progress(c, e.date)) {
                    Image(systemName: "house.fill")
                } currentValueLabel: {
                    Text("\(Swift.max(0, Hjemlys40Look.minutesLeft(c.mineEta, e.date)))")
                }
                .gaugeStyle(.accessoryCircular)
            } else {
                Image(systemName: "house.fill").font(.system(size: 20, weight: .semibold))
            }
        }
        .widgetAccentable()
    }
}
