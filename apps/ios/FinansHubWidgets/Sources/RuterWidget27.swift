import SwiftUI
import WidgetKit

/* ---------------- Prompt 27: Ruter-widgets (liten, medium, stor og låseskjerm) ---------------- */
// Fasit: 2a «iPhone · WidgetKit» i design/Widgets.dc.html. Standard = stoppene fra Ruter-kortet på Hjem
// (eksisterende widgets bruker StaticConfiguration, så ingen egen konfigurasjon per widget).
// Henter GET /api/widgets/departures, ellers /api/ruter/departures per Hjem-stopp, ellers bufferen fra appen.
// Ny henting hvert 5. min; tidslinjen har én oppføring per minutt imellom med beregnede minutter.
// Trykk åpner finanshub://avganger.

struct RuterEntry27: TimelineEntry {
    let date: Date
    let snap: Ruter27Snapshot?
    let linked: Bool
}

enum RuterFetch27 {
    static func load() async -> (Ruter27Snapshot?, Bool) {
        let linked: Bool = !(WidgetShared.token ?? "").isEmpty
        let now: Date = Date()
        // Uten parametre gir serveren stoppene fra Hjem-kortet (home_departures).
        if let d = await TasksFetch.request("/api/widgets/departures"), let s = Ruter27Shared.parseWidget(d, now: now) {
            Ruter27Shared.saveCache(s)
            return (s, linked)
        }
        // Eldre server: hent hvert Hjem-stopp for seg.
        if let h = Ruter27Shared.home(), !h.stops.isEmpty {
            var stops: [Ruter27Stop] = []
            var devs: [String] = []
            for ref in h.stops.prefix(3) {
                let enc: String = ref.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ref.id
                guard let d = await TasksFetch.request("/api/ruter/departures?stop=\(enc)&n=8") else { continue }
                let r: (Ruter27Stop, [String]) = Ruter27Shared.parseStop(d, id: ref.id, name: ref.name, now: now)
                stops.append(r.0)
                for x in r.1 where !devs.contains(x) { devs.append(x) }
            }
            if stops.contains(where: { !$0.deps.isEmpty }) {
                let s: Ruter27Snapshot = Ruter27Snapshot(stops: stops, deviations: devs, fetched: now)
                Ruter27Shared.saveCache(s)
                return (s, linked)
            }
        }
        return (Ruter27Shared.cache(), linked)
    }
}

struct RuterProvider27: TimelineProvider {
    func placeholder(in context: Context) -> RuterEntry27 {
        RuterEntry27(date: Date(), snap: Ruter27Shared.demo(), linked: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (RuterEntry27) -> Void) {
        if context.isPreview {
            completion(RuterEntry27(date: Date(), snap: Ruter27Shared.demo(), linked: true))
            return
        }
        Task {
            let r: (Ruter27Snapshot?, Bool) = await RuterFetch27.load()
            completion(RuterEntry27(date: Date(), snap: r.0, linked: r.1))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RuterEntry27>) -> Void) {
        Task {
            let r: (Ruter27Snapshot?, Bool) = await RuterFetch27.load()
            let now: Date = Date()
            var entries: [RuterEntry27] = []
            // Én oppføring per minutt de neste 5 minuttene (minuttene regnes ut fra avgangstiden).
            for k in 0..<6 {
                let d: Date = now.addingTimeInterval(Double(k) * 60)
                entries.append(RuterEntry27(date: d, snap: r.0, linked: r.1))
            }
            completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(5 * 60))))
        }
    }
}

struct RuterWidget27: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Ruter27Shared.widgetKind, provider: RuterProvider27()) { e in RuterWidgetView27(entry: e) }
            .configurationDisplayName("Ruter-avganger")
            .description("Sanntid fra stoppene på Ruter-kortet på Hjem.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular])
    }
}

/* ---------- Utseende ---------- */

private func r27Hex(_ hex: String) -> Color {
    var h: String = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
    let v: UInt64 = UInt64(h, radix: 16) ?? 0xE60000
    return Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
}

private func r27Clock(_ d: Date) -> String {
    let f: DateFormatter = DateFormatter()
    f.locale = Locale(identifier: "nb_NO")
    f.dateFormat = "HH:mm"
    return f.string(from: d)
}

private let r27Bg: LinearGradient = LinearGradient(colors: [r27Hex("#3a2a3f"), r27Hex("#1b2236"), r27Hex("#0e1424")], startPoint: .topLeading, endPoint: .bottomTrailing)

struct RuterWidgetView27: View {
    @Environment(\.widgetFamily) private var family
    let entry: RuterEntry27

    var body: some View {
        content
            .widgetURL(URL(string: "finanshub://avganger"))
            .containerBackground(for: .widget) {
                if family == .accessoryCircular || family == .accessoryRectangular { Color.clear } else { r27Bg }
            }
    }

    private var stops: [Ruter27Stop] { entry.snap?.stops ?? [] }

    @ViewBuilder private var content: some View {
        if stops.isEmpty {
            RuterEmpty27(linked: entry.linked, family: family)
        } else {
            switch family {
            case .accessoryCircular: RuterCircle27(stop: stops[0], now: entry.date)
            case .accessoryRectangular: RuterRect27(stop: stops[0], now: entry.date)
            case .systemLarge: RuterLarge27(stops: stops, devs: entry.snap?.deviations ?? [], now: entry.date, fetched: entry.snap?.fetched ?? entry.date)
            case .systemMedium: RuterMedium27(stop: stops[0], now: entry.date)
            default: RuterSmall27(stop: stops[0], now: entry.date)
            }
        }
    }
}

private struct RuterEmpty27: View {
    let linked: Bool
    let family: WidgetFamily

    var body: some View {
        if family == .accessoryCircular {
            Text("—").font(.system(size: 18, weight: .bold))
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("Avganger").font(.system(size: 12, weight: .semibold)).opacity(0.75)
                Spacer(minLength: 0)
                Text(linked ? "Velg stopp på Ruter-kortet på Hjem" : "Åpne appen og logg inn").font(.system(size: 13, weight: .semibold))
            }
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

/// Linjemerket: 24 høyt, minst 32 bredt, radius 6.
private struct RuterBadge27: View {
    let dep: Ruter27Dep
    var height: CGFloat = 24

    var body: some View {
        Text(dep.line).font(.system(size: 12.5, weight: .heavy)).foregroundStyle(Color.white).lineLimit(1).fixedSize()
            .padding(.horizontal, 5)
            .frame(minWidth: 32).frame(height: height)
            .background(r27Hex(dep.color.isEmpty ? Ruter27Shared.fallbackHex(dep.line) : dep.color), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

/// Én rad: merke, destinasjon, «Spor A» og «4 min».
private struct RuterLine27: View {
    let dep: Ruter27Dep
    let now: Date

    var body: some View {
        HStack(spacing: 9) {
            RuterBadge27(dep: dep)
            Text(dep.dest).font(.system(size: 14)).lineLimit(1)
            Spacer(minLength: 4)
            if !dep.platform.isEmpty { Text("Spor \(dep.platform)").font(.system(size: 11.5)).opacity(0.6).lineLimit(1) }
            Text(minText).font(.system(size: 16, weight: .semibold, design: .monospaced)).lineLimit(1).fixedSize()
                .frame(minWidth: 46, alignment: .trailing)
        }
        .padding(.vertical, 6)
    }

    private var minText: String {
        let m: Int = dep.minutes(at: now)
        return m <= 0 ? "nå" : "\(m) min"
    }
}

/// Liten: stopp + klokke, neste avgang stort, «Så 16 min · 26 min».
private struct RuterSmall27: View {
    let stop: Ruter27Stop
    let now: Date

    var body: some View {
        let up: [Ruter27Dep] = stop.upcoming(at: now)
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(stop.name).font(.system(size: 12, weight: .semibold)).opacity(0.75).lineLimit(1)
                Spacer(minLength: 4)
                Text(r27Clock(now)).font(.system(size: 11)).opacity(0.55)
            }
            Spacer(minLength: 0)
            if let f = up.first {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        RuterBadge27(dep: f)
                        Text(f.dest).font(.system(size: 13)).opacity(0.85).lineLimit(1)
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 0) {
                        Text(f.minutes(at: now) <= 0 ? "nå" : "\(f.minutes(at: now))").font(.system(size: 40, weight: .semibold, design: .monospaced))
                            .lineLimit(1).minimumScaleFactor(0.6)
                        if f.minutes(at: now) > 0 { Text(" min").font(.system(size: 15)).opacity(0.6) }
                    }
                    let later: [Ruter27Dep] = Array(up.dropFirst().filter { $0.line == f.line && $0.dest == f.dest }.prefix(2))
                    if !later.isEmpty {
                        Text("Så " + later.map { "\($0.minutes(at: now)) min" }.joined(separator: " · ")).font(.system(size: 12)).opacity(0.65).lineLimit(1)
                    }
                }
            } else {
                Text("Ingen avganger").font(.system(size: 13)).opacity(0.7)
            }
        }
        .foregroundStyle(Color.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// Medium: stoppnavn, «Sanntid · 09:41» og tre avganger.
private struct RuterMedium27: View {
    let stop: Ruter27Stop
    let now: Date

    var body: some View {
        let up: [Ruter27Dep] = Array(stop.upcoming(at: now).prefix(3))
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline) {
                Text(stop.name).font(.system(size: 15, weight: .bold)).lineLimit(1)
                Spacer(minLength: 4)
                Text("Sanntid · \(r27Clock(now))").font(.system(size: 11.5)).opacity(0.6)
            }
            .padding(.bottom, 4)
            if up.isEmpty { Text("Ingen avganger den neste timen.").font(.system(size: 13)).opacity(0.7) }
            ForEach(Array(up.enumerated()), id: \.offset) { pair in
                if pair.offset > 0 { Rectangle().fill(Color.white.opacity(0.12)).frame(height: 1) }
                RuterLine27(dep: pair.element, now: now)
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(Color.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// Stor: «Avganger · Oppdatert 09:41 ↻», to stopp med tre avganger hver, og avvik nederst.
private struct RuterLarge27: View {
    let stops: [Ruter27Stop]
    let devs: [String]
    let now: Date
    let fetched: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text("Avganger").font(.system(size: 16, weight: .bold))
                Spacer(minLength: 4)
                Text("Oppdatert \(r27Clock(fetched)) ↻").font(.system(size: 11.5)).opacity(0.6)
            }
            ForEach(Array(stops.prefix(2).enumerated()), id: \.offset) { pair in
                section(pair.element, first: pair.offset == 0)
            }
            Spacer(minLength: 0)
            if let d = devs.first {
                Text("Avvik: \(d)").font(.system(size: 12.5)).lineLimit(2)
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(r27Hex("#e60000").opacity(0.22), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .foregroundStyle(Color.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    @ViewBuilder private func section(_ s: Ruter27Stop, first: Bool) -> some View {
        let up: [Ruter27Dep] = Array(s.upcoming(at: now).prefix(3))
        Text(s.name.uppercased()).font(.system(size: 12, weight: .semibold)).opacity(0.6).padding(.top, first ? 8 : 10).lineLimit(1)
        if up.isEmpty { Text("Ingen avganger").font(.system(size: 13)).opacity(0.7).padding(.vertical, 6) }
        ForEach(Array(up.enumerated()), id: \.offset) { pair in
            if pair.offset > 0 { Rectangle().fill(Color.white.opacity(0.12)).frame(height: 1) }
            RuterLine27(dep: pair.element, now: now)
        }
    }
}

/// Låseskjerm, sirkel: linje, minutter og «min».
private struct RuterCircle27: View {
    let stop: Ruter27Stop
    let now: Date

    var body: some View {
        let f: Ruter27Dep? = stop.upcoming(at: now).first
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Text(f?.line ?? "–").font(.system(size: 11, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
                Text(f.map { $0.minutes(at: now) <= 0 ? "nå" : "\($0.minutes(at: now))" } ?? "–").font(.system(size: 22, weight: .bold)).lineLimit(1).minimumScaleFactor(0.6)
                Text("min").font(.system(size: 10)).opacity(0.7)
            }
        }
        .widgetAccentable()
    }
}

/// Låseskjerm, rektangel: «T5 Sognsvann» og «3 · 18 · 33 min».
private struct RuterRect27: View {
    let stop: Ruter27Stop
    let now: Date

    var body: some View {
        let up: [Ruter27Dep] = stop.upcoming(at: now)
        let f: Ruter27Dep? = up.first
        let same: [Ruter27Dep] = f.map { x in Array(up.filter { $0.line == x.line && $0.dest == x.dest }.prefix(3)) } ?? []
        VStack(alignment: .leading, spacing: 2) {
            Text(f.map { "\($0.line) \($0.dest)" } ?? stop.name).font(.system(size: 12, weight: .bold)).lineLimit(1).widgetAccentable()
            Text(same.isEmpty ? "Ingen avganger" : same.map { "\($0.minutes(at: now))" }.joined(separator: " · ") + " min")
                .font(.system(size: 18, weight: .semibold, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.6)
            Text(stop.name).font(.system(size: 11)).opacity(0.7).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
