import SwiftUI
import WidgetKit
import AppIntents

/* ---------------- Prompt 51 (IOSPLAT51): nye widgets ----------------
 – Planlegging · saldo (liten, medium, låseskjerm): saldo nå, laveste de neste 30 dagene og prognosen som strek
   (GET /finans/api/fin51/calendar?days=30, Plat51PlanSnap i Plat51Shared.swift).
 – Sjekk inn (liten, medium, låseskjerm): siste innsjekk («Sett av Ingrid»), forespørsler, og knappene «Er framme»,
   «Hent meg» og «På vei hjem» (App Intents – virker uten å åpne appen; uten nett går innsjekken i offline-køen).
 – Pakker · låseskjerm (rektangel, rund, linje): fra den felles /api/mobile/widgets-tidslinjen (WProvider).
 – Avganger · live (medium, stor, låseskjerm): nedtelling som går av seg selv, og «Følg» som starter Live Activity
   «Bussen kommer om 3 min» (BusFollow51Intent).
 Alle har VoiceOver-tekst (accessibilityLabel på hele widgeten der innholdet er tall og ikoner). */

enum Plat51W {
    static let accent: Color = Color(red: 1, green: 0.478, blue: 0.239)
    static let accentLight: Color = Color(red: 1, green: 0.69, blue: 0.541)
    static let positive: Color = Color(red: 0.482, green: 0.89, blue: 0.627)
    static let warn: Color = Color(red: 1, green: 0.42, blue: 0.42)

    static func hex(_ hex: String, _ fallback: UInt64 = 0xFF7A3D) -> Color {
        var h: String = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
        let v: UInt64 = UInt64(h, radix: 16) ?? fallback
        return Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }

    static func link(_ page: String) -> URL { URL(string: "finanshub://" + page) ?? URL(string: "finanshub://home")! }

    static var linked: Bool { !(WidgetShared.token ?? "").isEmpty }

    /// «18:42»
    static func clock(_ t: Double) -> String {
        if t <= 0 { return "" }
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = "HH:mm"
        return f.string(from: Date(timeIntervalSince1970: t))
    }
}

/// Mørk bakgrunn som resten av FinansHub-widgetene.
struct Plat51Back: View {
    var tint: Color? = nil
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.13, green: 0.12, blue: 0.17), Color(red: 0.06, green: 0.07, blue: 0.11)], startPoint: .topLeading, endPoint: .bottomTrailing)
            if let tint { tint.opacity(0.2) }
        }
    }
}

struct Plat51NotLinked: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "person.crop.circle.badge.exclamationmark").font(.system(size: 20)).foregroundStyle(Plat51W.accentLight)
            Text("Åpne FinansHub-appen").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.white)
            Text("Logg inn én gang, så henter widgeten data.").font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.6))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/* ---------- Planlegging · saldo ---------- */

struct Plat51PlanEntry: TimelineEntry {
    let date: Date
    let snap: Plat51PlanSnap
    let linked: Bool
}

struct Plat51PlanProvider: TimelineProvider {
    static var sample: Plat51PlanSnap {
        var s: Plat51PlanSnap = Plat51PlanSnap()
        s.has = true
        s.today = 48_312
        s.end = 31_870
        s.lowest = 12_400
        s.lowestDate = "2026-11-19"
        s.out = 21_442
        s.series = [48_312, 47_900, 46_100, 44_000, 40_200, 38_000, 36_500, 30_100, 22_000, 12_400, 34_000, 31_870]
        s.nextName = "Strøm"
        s.nextAmount = -1_240
        s.nextDate = "2026-10-28"
        return s
    }

    func placeholder(in context: Context) -> Plat51PlanEntry { Plat51PlanEntry(date: Date(), snap: Plat51PlanProvider.sample, linked: true) }

    func getSnapshot(in context: Context, completion: @escaping (Plat51PlanEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        Task {
            let s: Plat51PlanSnap = await Plat51PlanSnap.load()
            completion(Plat51PlanEntry(date: Date(), snap: s, linked: Plat51W.linked))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Plat51PlanEntry>) -> Void) {
        Task {
            let s: Plat51PlanSnap = await Plat51PlanSnap.load()
            let next: Date = Date().addingTimeInterval(30 * 60)
            completion(Timeline(entries: [Plat51PlanEntry(date: Date(), snap: s, linked: Plat51W.linked)], policy: .after(next)))
        }
    }
}

struct Plat51PlanWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Plat51Kinds.plan, provider: Plat51PlanProvider()) { (e: Plat51PlanEntry) in
            Plat51PlanView(entry: e)
        }
        .configurationDisplayName("Planlegging · saldo")
        .description("Saldoen nå og den laveste de neste 30 dagene.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

/// Prognosen som strek (sum av kontoene dag for dag).
struct Plat51Spark: View {
    let values: [Double]
    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let lo: Double = values.min() ?? 0
            let hi: Double = values.max() ?? 1
            let span: Double = Swift.max(1, hi - lo)
            Path { (p: inout Path) in
                for (i, v) in values.enumerated() {
                    let x: CGFloat = values.count > 1 ? g.size.width * CGFloat(i) / CGFloat(values.count - 1) : 0
                    let y: CGFloat = g.size.height * CGFloat(1 - (v - lo) / span)
                    if i == 0 { p.move(to: CGPoint(x: x, y: y)) } else { p.addLine(to: CGPoint(x: x, y: y)) }
                }
            }
            .stroke(Plat51W.accent, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        }
        .accessibilityHidden(true)
    }
}

struct Plat51PlanView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Plat51PlanEntry

    private var s: Plat51PlanSnap { entry.snap }

    private var voice: String {
        var t: String = "Saldo " + Plat51Net.kr(s.today)
        if !s.lowestDate.isEmpty { t += ". Laveste " + Plat51Net.kr(s.lowest) + " " + Plat51Net.day(s.lowestDate) }
        return t
    }

    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                Text("Saldo " + Plat51Net.kr(s.today))
            case .accessoryRectangular:
                rect
            default:
                home
            }
        }
        .widgetURL(Plat51W.link("planlegging/kal"))
        .containerBackground(for: .widget) { Plat51Back(tint: s.lowest < 0 ? Plat51W.warn : nil) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(voice)
    }

    private var rect: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("Saldo").font(.system(size: 11, weight: .semibold)).widgetAccentable()
            Text(Plat51Net.kr(s.today)).font(.system(size: 17, weight: .bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            Text(s.lowestDate.isEmpty ? "Ingen prognose" : "Lavest " + Plat51Net.kr(s.lowest) + " · " + Plat51Net.day(s.lowestDate))
                .font(.system(size: 11)).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var home: some View {
        if !entry.linked {
            Plat51NotLinked()
        } else if !s.has {
            VStack(alignment: .leading, spacing: 4) {
                Text("Planlegging").font(.system(size: 13, weight: .semibold))
                Spacer(minLength: 0)
                Text("Ingen saldo ennå").font(.footnote).foregroundStyle(Color.white.opacity(0.6))
            }
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else if family == .systemSmall {
            small
        } else {
            medium
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Saldo").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.white.opacity(0.75))
            Text(Plat51Net.kr(s.today)).font(.system(size: 24, weight: .semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
            Plat51Spark(values: s.series).frame(height: 28).padding(.vertical, 6)
            Spacer(minLength: 0)
            Text("Lavest " + Plat51Net.kr(s.lowest)).font(.system(size: 12, weight: .semibold))
                .foregroundStyle(s.lowest < 0 ? Plat51W.warn : Plat51W.accentLight).lineLimit(1).minimumScaleFactor(0.7)
            if !s.lowestDate.isEmpty {
                Text(Plat51Net.day(s.lowestDate)).font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.6))
            }
        }
        .foregroundStyle(Color.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var medium: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Saldo nå").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.white.opacity(0.75))
                Text(Plat51Net.kr(s.today)).font(.system(size: 26, weight: .semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                Text("Om 30 dager " + Plat51Net.kr(s.end)).font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.7)).lineLimit(1)
                Spacer(minLength: 0)
                if !s.nextName.isEmpty {
                    Text("Neste: " + s.nextName + " " + Plat51Net.kr(abs(s.nextAmount))).font(.system(size: 12, weight: .medium)).lineLimit(1)
                    Text(Plat51Net.day(s.nextDate)).font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.6))
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                Plat51Spark(values: s.series).frame(maxHeight: .infinity)
                Text("Lavest " + Plat51Net.kr(s.lowest) + (s.lowestDate.isEmpty ? "" : " · " + Plat51Net.day(s.lowestDate)))
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(s.lowest < 0 ? Plat51W.warn : Plat51W.accentLight).lineLimit(1).minimumScaleFactor(0.7)
            }
        }
        .foregroundStyle(Color.white)
    }
}

/* ---------- Sjekk inn ---------- */

struct Plat51CheckinEntry: TimelineEntry {
    let date: Date
    let snap: Plat51CheckinSnap
    let linked: Bool
}

struct Plat51CheckinProvider: TimelineProvider {
    func placeholder(in context: Context) -> Plat51CheckinEntry {
        var s: Plat51CheckinSnap = Plat51CheckinSnap()
        s.has = true
        s.latestTitle = "Sjekket inn 19:42"
        s.latestSub = "Sett av Ingrid · Bursdag hos Mari"
        s.people = [Plat51Person(id: "1", name: "Ingrid"), Plat51Person(id: "2", name: "Pål")]
        return Plat51CheckinEntry(date: Date(), snap: s, linked: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (Plat51CheckinEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        Task {
            let s: Plat51CheckinSnap = await Plat51CheckinSnap.load()
            completion(Plat51CheckinEntry(date: Date(), snap: s, linked: Plat51W.linked))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Plat51CheckinEntry>) -> Void) {
        Task {
            let s: Plat51CheckinSnap = await Plat51CheckinSnap.load()
            completion(Timeline(entries: [Plat51CheckinEntry(date: Date(), snap: s, linked: Plat51W.linked)], policy: .after(Date().addingTimeInterval(15 * 60))))
        }
    }
}

struct Plat51CheckinWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Plat51Kinds.checkin, provider: Plat51CheckinProvider()) { (e: Plat51CheckinEntry) in
            Plat51CheckinView(entry: e)
        }
        .configurationDisplayName("Sjekk inn")
        .description("Sjekk inn, «Hent meg» og «På vei hjem» med ett trykk.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
    }
}

/// Knapp i widgeten (App Intent, iOS 17).
struct Plat51Pill: View {
    let icon: String
    let text: String
    var tint: Color = Color.white.opacity(0.14)
    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 12, weight: .semibold))
            Text(text).font(.system(size: 12, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.7)
        }
        .foregroundStyle(Color.white)
        .frame(maxWidth: .infinity, minHeight: 32)
        .background(tint, in: Capsule())
    }
}

struct Plat51CheckinView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Plat51CheckinEntry

    private var s: Plat51CheckinSnap { entry.snap }

    private var status: String {
        if s.requests > 0 { return s.requestTitle.isEmpty ? "Noen ber deg sjekke inn" : s.requestTitle }
        return s.latestTitle.isEmpty ? "Ikke sjekket inn i dag" : s.latestTitle
    }

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    Image(systemName: s.requests > 0 ? "exclamationmark.bubble.fill" : "checkmark.message.fill").font(.system(size: 20, weight: .semibold))
                }
                .accessibilityLabel(status)
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text("Sjekk inn").font(.system(size: 11, weight: .semibold)).widgetAccentable()
                    Text(status).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    Text(s.latestSub.isEmpty ? "Trykk for å sjekke inn" : s.latestSub).font(.system(size: 11)).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
            default:
                if entry.linked { home } else { Plat51NotLinked() }
            }
        }
        .widgetURL(Plat51W.link("familie"))
        .containerBackground(for: .widget) { Plat51Back(tint: s.requests > 0 ? Plat51W.accent : nil) }
    }

    private var home: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Sjekk inn").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.white.opacity(0.75))
                Text(status).font(.system(size: 14, weight: .semibold)).lineLimit(family == .systemSmall ? 2 : 1)
                if family != .systemSmall && !s.latestSub.isEmpty {
                    Text(s.latestSub).font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.6)).lineLimit(1)
                }
            }
            .accessibilityElement(children: .combine)
            Spacer(minLength: 0)
            if family == .systemSmall {
                Button(intent: CheckIn51Intent(kind: .arrived)) { Plat51Pill(icon: "checkmark", text: "Er framme", tint: Plat51W.positive.opacity(0.35)) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Sjekk inn: er framme")
                Button(intent: PickMe51Intent()) { Plat51Pill(icon: "car.fill", text: "Hent meg", tint: Plat51W.accent.opacity(0.45)) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Hent meg")
            } else {
                HStack(spacing: 6) {
                    Button(intent: CheckIn51Intent(kind: .arrived)) { Plat51Pill(icon: "checkmark", text: "Er framme", tint: Plat51W.positive.opacity(0.35)) }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Sjekk inn: er framme")
                    Button(intent: PickMe51Intent()) { Plat51Pill(icon: "car.fill", text: "Hent meg", tint: Plat51W.accent.opacity(0.45)) }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Hent meg")
                    Button(intent: Hjemlys40StartIntent()) { Plat51Pill(icon: "house.fill", text: "På vei hjem") }
                        .buttonStyle(.plain)
                        .accessibilityLabel("På vei hjem")
                }
            }
        }
        .foregroundStyle(Color.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/* ---------- Pakker · låseskjerm ---------- */

struct Plat51PackagesLockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Plat51Kinds.packagesLock, provider: WProvider()) { (e: WEntry) in
            Plat51PackagesLockView(entry: e)
        }
        .configurationDisplayName("Pakker · låseskjerm")
        .description("Pakker på vei og klar for henting.")
        .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

struct Plat51PackagesLockView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WEntry

    private var ready: Int { entry.data.packages.filter { $0.ready }.count }

    private var summary: String {
        let n: Int = entry.data.packagesActive
        if n == 0 { return "Ingen pakker på vei" }
        return ready > 0 ? "\(n) på vei · \(ready) klar" : "\(n) på vei"
    }

    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                Text(summary)
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 0) {
                        Image(systemName: ready > 0 ? "shippingbox.fill" : "shippingbox").font(.system(size: 14, weight: .semibold))
                        Text("\(entry.data.packagesActive)").font(.system(size: 16, weight: .bold)).monospacedDigit()
                    }
                }
            default:
                VStack(alignment: .leading, spacing: 1) {
                    Text("Pakker · " + summary).font(.system(size: 11, weight: .semibold)).widgetAccentable().lineLimit(1)
                    if let p = entry.data.packages.first {
                        Text(p.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                        Text(p.statusText.isEmpty ? p.carrierName : p.statusText).font(.system(size: 11)).lineLimit(1)
                    } else {
                        Text("Ingenting på vei").font(.system(size: 13)).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .widgetURL(Plat51W.link("tracking"))
        .containerBackground(for: .widget) { Color.clear }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Pakker: " + summary)
    }
}

/* ---------- Avganger · live ---------- */

struct Plat51DepEntry: TimelineEntry {
    let date: Date
    let snap: Ruter27Snapshot?
    let linked: Bool
}

struct Plat51DepProvider: TimelineProvider {
    func placeholder(in context: Context) -> Plat51DepEntry { Plat51DepEntry(date: Date(), snap: Ruter27Shared.demo(), linked: true) }

    func getSnapshot(in context: Context, completion: @escaping (Plat51DepEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        Task {
            let s: Ruter27Snapshot? = await Plat51Bus.load()
            completion(Plat51DepEntry(date: Date(), snap: s, linked: Plat51W.linked))
        }
    }

    /// Én oppføring per minutt i 10 minutter (avganger som har gått, forsvinner); nedtellingen går av seg selv.
    func getTimeline(in context: Context, completion: @escaping (Timeline<Plat51DepEntry>) -> Void) {
        Task {
            let s: Ruter27Snapshot? = await Plat51Bus.load()
            let now: Date = Date()
            let linked: Bool = Plat51W.linked
            let entries: [Plat51DepEntry] = (0..<10).map { (i: Int) -> Plat51DepEntry in
                Plat51DepEntry(date: now.addingTimeInterval(Double(i) * 60), snap: s, linked: linked)
            }
            completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(10 * 60))))
        }
    }
}

struct Plat51DeparturesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Plat51Kinds.departures, provider: Plat51DepProvider()) { (e: Plat51DepEntry) in
            Plat51DepView(entry: e)
        }
        .configurationDisplayName("Avganger · live")
        .description("Nedtelling til de neste avgangene. «Følg» viser bussen på låseskjermen.")
        .supportedFamilies([.systemMedium, .systemLarge, .accessoryRectangular])
    }
}

struct Plat51DepRow: View {
    let stop: String
    let dep: Ruter27Dep
    let now: Date
    var follow: Bool = true

    var body: some View {
        HStack(spacing: 8) {
            Text(dep.line).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.white).lineLimit(1).minimumScaleFactor(0.6)
                .frame(minWidth: 30, minHeight: 24).padding(.horizontal, 4)
                .background(Plat51W.hex(dep.color.isEmpty ? Ruter27Shared.fallbackHex(dep.line) : dep.color), in: RoundedRectangle(cornerRadius: 6))
            Text(dep.dest).font(.system(size: 13)).lineLimit(1)
            Spacer(minLength: 4)
            Plat51Countdown(at: dep.expected, now: now).font(.system(size: 13, weight: .semibold)).monospacedDigit()
            if follow {
                Button(intent: BusFollow51Intent(stop: stop, line: dep.line, dest: dep.dest, at: dep.expected.timeIntervalSince1970, color: dep.color)) {
                    Image(systemName: "bell.badge").font(.system(size: 12, weight: .semibold)).frame(width: 30, height: 26)
                        .background(Color.white.opacity(0.14), in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Følg " + dep.line + " " + dep.dest + " på låseskjermen")
            }
        }
        .accessibilityElement(children: .contain)
    }
}

/// «3 min» som teller ned av seg selv (under 10 min: mm:ss), «nå» når den har gått.
struct Plat51Countdown: View {
    let at: Date
    let now: Date
    var body: some View {
        let left: TimeInterval = at.timeIntervalSince(now)
        if left <= 30 {
            Text("nå")
        } else if left < 600 {
            Text(timerInterval: now...at, countsDown: true)
        } else {
            Text("\(Int(left / 60)) min")
        }
    }
}

struct Plat51DepView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Plat51DepEntry

    private var stops: [Ruter27Stop] { entry.snap?.stops ?? [] }

    var body: some View {
        Group {
            if family == .accessoryRectangular {
                rect
            } else if !entry.linked {
                Plat51NotLinked()
            } else {
                home
            }
        }
        .widgetURL(Plat51W.link("avganger"))
        .containerBackground(for: .widget) { Plat51Back() }
    }

    @ViewBuilder private var rect: some View {
        if let stop = stops.first, let d = stop.upcoming(at: entry.date).first {
            VStack(alignment: .leading, spacing: 1) {
                Text(stop.name).font(.system(size: 11, weight: .semibold)).widgetAccentable().lineLimit(1)
                Text(d.line + " " + d.dest).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                Plat51Countdown(at: d.expected, now: entry.date).font(.system(size: 13, weight: .bold)).monospacedDigit()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        } else {
            Text("Ingen avganger").font(.system(size: 13))
        }
    }

    private var home: some View {
        VStack(alignment: .leading, spacing: 6) {
            if stops.isEmpty {
                Text("Avganger").font(.system(size: 13, weight: .semibold))
                Spacer(minLength: 0)
                Text("Legg til stopp under Avganger i appen.").font(.footnote).foregroundStyle(Color.white.opacity(0.6))
                Spacer(minLength: 0)
            } else {
                ForEach(stops.prefix(family == .systemLarge ? 2 : 1), id: \.self) { (stop: Ruter27Stop) in
                    Text(stop.name).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.white.opacity(0.75)).lineLimit(1)
                    ForEach(stop.upcoming(at: entry.date).prefix(family == .systemLarge ? 4 : 3), id: \.self) { (d: Ruter27Dep) in
                        Plat51DepRow(stop: stop.name, dep: d, now: entry.date)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .foregroundStyle(Color.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
