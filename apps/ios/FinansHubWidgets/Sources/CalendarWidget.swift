import SwiftUI
import WidgetKit

/* ---------------- Prompt 26: Kalender-widget (liten, medium og stor) ---------------- */
// Fasit: «WIDGETS PÅ TELEFONEN» i design/Kalender.dc.html. Henter GET /api/widgets/calendar, faller tilbake til
// GET /api/kalender og til bufferen appen legger i App Group. Tidslinjen har én oppføring ved start og slutt av
// hver time (og hvert kvarter innimellom for nedtellingen), pluss midnatt. Trykk åpner finanshub://kalender.

struct CalendarEntry26: TimelineEntry {
    let date: Date
    let events: [CalEvent26]
    let linked: Bool
}

enum CalendarFetch26 {
    static func load() async -> (events: [CalEvent26], linked: Bool) {
        let linked: Bool = !(WidgetShared.token ?? "").isEmpty
        let now: Date = Date()
        let from: String = Cal26.key(now)
        let to: String = Cal26.key(Cal26.add(now, 21))
        var events: [CalEvent26] = []
        if let d = await TasksFetch.request("/api/widgets/calendar") {
            events = Cal26.parse(d).events
        }
        // Widget-svaret har bare i dag og neste skoledag: hent hele perioden når det ikke ga noe.
        if events.isEmpty, let d = await TasksFetch.request("/api/kalender?from=\(from)&to=\(to)") {
            events = Cal26.parse(d).events
        }
        if !events.isEmpty {
            // Bufferen fra appen kan ha flere dager enn widget-svaret; den beholdes hvis den er rikere.
            let cached: [CalEvent26] = cachedEvents()
            if cached.count > events.count && cached.contains(where: { $0.dayKey >= from }) {
                events = merged(events, cached)
            }
            if let c = Cal26.compact(events, from: now, days: 21) { WidgetShared.defaults.set(c, forKey: Cal26.cacheKey) }
        } else {
            events = cachedEvents()
        }
        return (events, linked)
    }

    static func cachedEvents() -> [CalEvent26] {
        guard let d = WidgetShared.defaults.data(forKey: Cal26.cacheKey) else { return [] }
        return Cal26.parse(d).events
    }

    /// Ferske hendelser fra serveren erstatter dagene de dekker; bufferen fyller resten.
    static func merged(_ fresh: [CalEvent26], _ cached: [CalEvent26]) -> [CalEvent26] {
        let days: Set<String> = Set(fresh.map { $0.dayKey })
        var out: [CalEvent26] = fresh
        for e in cached where !days.contains(e.dayKey) { out.append(e) }
        out.sort { a, b in a.start < b.start }
        return out
    }
}

struct CalendarProvider26: TimelineProvider {
    func placeholder(in context: Context) -> CalendarEntry26 {
        CalendarEntry26(date: Date(), events: Cal26.demo(around: Date()), linked: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (CalendarEntry26) -> Void) {
        if context.isPreview {
            completion(CalendarEntry26(date: Date(), events: Cal26.demo(around: Date()), linked: true))
            return
        }
        Task {
            let r = await CalendarFetch26.load()
            completion(CalendarEntry26(date: Date(), events: r.events, linked: r.linked))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CalendarEntry26>) -> Void) {
        Task {
            let r = await CalendarFetch26.load()
            let now: Date = Date()
            var entries: [CalendarEntry26] = [CalendarEntry26(date: now, events: r.events, linked: r.linked)]
            for d in Cal26.refreshDates(r.events, now: now) {
                entries.append(CalendarEntry26(date: d, events: r.events, linked: r.linked))
            }
            // Ny henting hver time (serveren henter iCal på nytt hver time).
            let next: Date = now.addingTimeInterval(3600)
            completion(Timeline(entries: entries, policy: .after(next)))
        }
    }
}

struct CalendarWidget26: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Cal26.widgetKind, provider: CalendarProvider26()) { e in CalendarWidgetView26(entry: e) }
            .configurationDisplayName("Kalender")
            .description("Neste time, dagens timeplan og prøver og frister.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct CalendarWidgetView26: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    let entry: CalendarEntry26

    private var pal: Cal26WPal { scheme == .dark ? Cal26WPal.iosDark : Cal26WPal.iosLight }

    var body: some View {
        content
            .widgetURL(URL(string: "finanshub://kalender"))
            .containerBackground(for: .widget) { pal.bg }
    }

    @ViewBuilder private var content: some View {
        if !entry.linked && entry.events.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("KALENDER").font(.system(size: 10, weight: .heavy)).tracking(0.8).foregroundStyle(pal.acc)
                Spacer(minLength: 0)
                Text("Åpne appen og logg inn").font(.system(size: 13, weight: .semibold)).foregroundStyle(pal.fg)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            sized
        }
    }

    @ViewBuilder private var sized: some View {
        let w: CalWidgetState26 = Cal26.widget(entry.events, now: entry.date)
        switch family {
        case .systemLarge: Cal26WLarge(w: w, pal: pal, links: true)
        case .systemMedium: Cal26WMedium(w: w, pal: pal, links: true)
        default: Cal26WSmall(w: w, pal: pal)
        }
    }
}
