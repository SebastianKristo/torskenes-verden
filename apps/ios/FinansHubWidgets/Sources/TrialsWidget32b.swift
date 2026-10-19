import SwiftUI
import WidgetKit
import AppIntents
import UIKit

/* ---------------- Prompt 32: Prøveperiode-widgets (liten, medium og låseskjerm) ---------------- */
// Fasit: design/Proveperiode Widgets.dc.html → «iPhone». Liten: logo + PRØVE · tall 46 pt · «dager igjen» · navn ·
// «Avslutt før …». Medium: ring (dager igjen) og navn · pris til venstre, de to neste og ✓ Avsluttet (AppIntent) + Åpne.
// Låseskjerm: accessoryCircular (gauge med dager) og accessoryRectangular (⏳ navn · dager · pris · Avslutt før).

private let trInk: Color = Color(red: 27.0 / 255.0, green: 26.0 / 255.0, blue: 23.0 / 255.0)
private let trMut: Color = Color(red: 0.541, green: 0.541, blue: 0.557)
private let trRed: Color = Color(red: 0.698, green: 0.227, blue: 0.165)
private let trRing: Color = Color(red: 0.925, green: 0.925, blue: 0.941)
private let trChip: Color = Color(red: 0.949, green: 0.949, blue: 0.969)

private func trColor(_ hex: String) -> Color {
    if hex == "#b23a2a" { return trRed }
    if hex == "#a8661a" { return Color(red: 0.659, green: 0.4, blue: 0.102) }
    return trInk
}

struct TrialsEntry32b: TimelineEntry {
    let date: Date
    let items: [TrialW32b]
    /// Logo-bilder per prøve-id (hentet i provideren; widgeter kan ikke laste bilder selv).
    let logos: [String: Data]
    let linked: Bool
}

enum TrialsFetch32b {
    static func load() async -> TrialsEntry32b {
        let linked: Bool = !(WidgetShared.token ?? "").isEmpty
        var items: [TrialW32b] = []
        if let d = await Trials32b.request("/api/widgets/trials") {
            items = Trials32b.parse(d)
            WidgetShared.defaults.set(d, forKey: Trials32b.cacheKey)
        } else if let d = await Trials32b.request("/finans/api/subscriptions/trials") {
            items = Trials32b.parse(d)
            Trials32b.push(items)
        } else {
            items = Trials32b.cached
        }
        var logos: [String: Data] = [:]
        for t in items.prefix(3) {
            if let d = await logo(t) { logos[t.id] = d }
        }
        return TrialsEntry32b(date: Date(), items: items, logos: logos, linked: linked)
    }

    /// Logoen fra Homelab (bufres i App Group, så den vises uten nett).
    static func logo(_ t: TrialW32b) async -> Data? {
        let key: String = "w.trials32.logo." + Trials32b.domain(t.name)
        if let d = WidgetShared.defaults.data(forKey: key) { return d }
        guard let url = Trials32b.absolute(t.logoPath) else { return nil }
        var r = URLRequest(url: url)
        r.timeoutInterval = 6
        if let tok = WidgetShared.token { r.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization") }
        guard let pair = try? await URLSession.shared.data(for: r), (pair.1 as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        // Bare ekte bilder (og små nok for widgeten).
        guard let img = UIImage(data: pair.0), img.size.width > 1 else { return nil }
        let small: Data? = img.preparingThumbnail(of: CGSize(width: 64, height: 64))?.pngData() ?? pair.0
        if let small { WidgetShared.defaults.set(small, forKey: key) }
        return small
    }
}

struct TrialsProvider32b: TimelineProvider {
    static let sample: [TrialW32b] = {
        let cal: Calendar = Trials32b.cal
        func iso(_ n: Int) -> String {
            let d: Date = cal.date(byAdding: .day, value: n, to: Date()) ?? Date()
            let c: DateComponents = cal.dateComponents([.year, .month, .day], from: d)
            return String(format: "%04d-%02d-%02d", c.year ?? 2026, c.month ?? 1, c.day ?? 1)
        }
        return [TrialW32b(id: "1", name: "Viaplay", end: iso(2), start: iso(-12), price: "149 kr/mnd"),
                TrialW32b(id: "2", name: "Storytel", end: iso(9), start: iso(-5), price: "179 kr/mnd"),
                TrialW32b(id: "3", name: "HBO Max", end: iso(23), start: iso(-7), price: "129 kr/mnd")]
    }()

    func placeholder(in context: Context) -> TrialsEntry32b {
        TrialsEntry32b(date: Date(), items: TrialsProvider32b.sample, logos: [:], linked: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (TrialsEntry32b) -> Void) {
        if context.isPreview { completion(placeholder(in: context)); return }
        Task { completion(await TrialsFetch32b.load()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TrialsEntry32b>) -> Void) {
        Task {
            let e: TrialsEntry32b = await TrialsFetch32b.load()
            // Oppdateres ved midnatt (dager igjen) og ellers hver time.
            let cal: Calendar = Trials32b.cal
            let midnight: Date = cal.startOfDay(for: Date().addingTimeInterval(86_400)).addingTimeInterval(60)
            let hour: Date = Date().addingTimeInterval(3600)
            completion(Timeline(entries: [e], policy: .after(Swift.min(midnight, hour))))
        }
    }
}

struct TrialsWidget32b: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Trials32b.widgetKind, provider: TrialsProvider32b()) { (e: TrialsEntry32b) in
            TrialsWidgetView32b(entry: e)
        }
        .configurationDisplayName("Prøveperioder")
        .description("Prøven som slutter først, dager igjen og prisen etterpå. «Avsluttet» fjerner påminnelsen.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

struct TrialsWidgetView32b: View {
    @Environment(\.widgetFamily) private var family
    let entry: TrialsEntry32b

    var body: some View {
        content
            .widgetURL(URL(string: "finanshub://abo"))
            .containerBackground(for: .widget) {
                if family == .accessoryCircular || family == .accessoryRectangular { Color.clear } else { Color.white }
            }
    }

    @ViewBuilder private var content: some View {
        switch family {
        case .systemMedium: TrialsMedium32b(entry: entry)
        case .accessoryCircular: TrialsCircular32b(entry: entry)
        case .accessoryRectangular: TrialsRect32b(entry: entry)
        default: TrialsSmall32b(entry: entry)
        }
    }
}

/// Logo (eller bokstavmerke) i en avrundet rute.
struct TrialLogo32b: View {
    let t: TrialW32b
    let data: Data?
    let size: CGFloat
    let radius: CGFloat

    var body: some View {
        Group {
            if let data, let img = UIImage(data: data) {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Text(t.initial).font(.system(size: size * 0.5, weight: .heavy)).foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(trRed)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Color.black.opacity(0.06), lineWidth: 1))
    }
}

private struct TrialsEmpty32b: View {
    let linked: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("PRØVEPERIODER").font(.system(size: 11, weight: .bold)).foregroundStyle(trRed)
            Spacer(minLength: 0)
            Text(linked ? "Ingen aktive prøver" : "Åpne appen og logg inn").font(.system(size: 14, weight: .bold)).foregroundStyle(trInk)
            if linked { Text("+ Legg til").font(.system(size: 12, weight: .semibold)).foregroundStyle(trRed) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// Liten (2×2).
private struct TrialsSmall32b: View {
    let entry: TrialsEntry32b

    var body: some View {
        if let t = entry.items.first {
            let c: Color = trColor(t.colorHex())
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    TrialLogo32b(t: t, data: entry.logos[t.id], size: 28, radius: 8)
                    Spacer(minLength: 4)
                    Text("PRØVE").font(.system(size: 11, weight: .bold)).tracking(0.2).foregroundStyle(trRed)
                }
                Spacer(minLength: 0)
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text("\(t.days())").font(.system(size: 46, weight: .bold)).tracking(-1.2).foregroundStyle(c)
                        .lineLimit(1).minimumScaleFactor(0.6)
                    Text(t.unit()).font(.system(size: 13, weight: .semibold)).foregroundStyle(c).lineLimit(1)
                }
                Text(t.name).font(.system(size: 15, weight: .bold)).foregroundStyle(trInk).lineLimit(1)
                Text("Avslutt før " + t.endShort).font(.system(size: 11.5)).foregroundStyle(trMut).lineLimit(1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            TrialsEmpty32b(linked: entry.linked)
        }
    }
}

/// Ring med andel brukt og dager igjen i midten.
private struct TrialRing32b: View {
    let t: TrialW32b
    let size: CGFloat

    var body: some View {
        let c: Color = trColor(t.colorHex())
        ZStack {
            Circle().stroke(trRing, lineWidth: 7)
            Circle().trim(from: 0, to: CGFloat(t.progress()))
                .stroke(c, style: StrokeStyle(lineWidth: 7, lineCap: .butt))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 2) {
                Text("\(t.days())").font(.system(size: 28, weight: .bold)).foregroundStyle(c)
                Text(t.unitShort()).font(.system(size: 10, weight: .semibold)).foregroundStyle(trMut)
            }
        }
        .frame(width: size, height: size)
    }
}

/// Medium (4×2).
private struct TrialsMedium32b: View {
    let entry: TrialsEntry32b

    var body: some View {
        if let t = entry.items.first {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("PRØVEPERIODER").font(.system(size: 11, weight: .bold)).foregroundStyle(trRed)
                    Spacer(minLength: 4)
                    TrialRing32b(t: t, size: 86)
                    Spacer(minLength: 4)
                    Text(t.name + " · " + t.priceText).font(.system(size: 14, weight: .bold)).foregroundStyle(trInk).lineLimit(1)
                }
                .frame(width: 118, alignment: .leading)
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(entry.items.dropFirst().prefix(2)), id: \.id) { (x: TrialW32b) in
                        TrialsRow32b(t: x, data: entry.logos[x.id])
                    }
                    if entry.items.count == 1 {
                        Text("Avslutt før " + t.endShort).font(.system(size: 12)).foregroundStyle(trMut)
                    }
                    Spacer(minLength: 0)
                    HStack(spacing: 6) {
                        Button(intent: TrialDoneIntent32b(trialId: t.id)) {
                            Text("✓ Avsluttet").font(.system(size: 12.5, weight: .bold)).foregroundStyle(Color.white)
                                .frame(maxWidth: .infinity).frame(height: 32)
                                .background(trInk, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        Link(destination: URL(string: "finanshub://abo") ?? URL(fileURLWithPath: "/")) {
                            Text("Åpne").font(.system(size: 12.5, weight: .bold)).foregroundStyle(trInk)
                                .padding(.horizontal, 12).frame(height: 32)
                                .background(trChip, in: Capsule())
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        } else {
            TrialsEmpty32b(linked: entry.linked)
        }
    }
}

private struct TrialsRow32b: View {
    let t: TrialW32b
    let data: Data?

    var body: some View {
        HStack(spacing: 9) {
            TrialLogo32b(t: t, data: data, size: 24, radius: 6)
            VStack(alignment: .leading, spacing: 0) {
                Text(t.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(trInk).lineLimit(1)
                Text(t.endShort).font(.system(size: 11)).foregroundStyle(trMut).lineLimit(1)
            }
            Spacer(minLength: 4)
            Text("\(t.days()) d").font(.system(size: 13, weight: .bold)).foregroundStyle(trColor(t.colorHex()))
        }
    }
}

/// Låseskjerm, rund: gauge med dager igjen.
private struct TrialsCircular32b: View {
    let entry: TrialsEntry32b

    var body: some View {
        if let t = entry.items.first {
            Gauge(value: t.progress(), in: 0...1) {
                Text("⏳")
            } currentValueLabel: {
                VStack(spacing: 0) {
                    Text("\(t.days())").font(.system(size: 20, weight: .bold))
                    Text(t.days() == 1 ? "DAG" : "DAGER").font(.system(size: 7, weight: .semibold))
                }
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .widgetAccentable()
        } else {
            ZStack {
                AccessoryWidgetBackground()
                Text("⏳").font(.system(size: 18))
            }
        }
    }
}

/// Låseskjerm, rektangel: ⏳ navn · dager · pris · «Avslutt før …».
private struct TrialsRect32b: View {
    let entry: TrialsEntry32b

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let t = entry.items.first {
                Text("⏳ " + t.name).font(.system(size: 13, weight: .bold)).lineLimit(1).widgetAccentable()
                Text("\(t.days()) \(t.unit()) · \(t.priceText)").font(.system(size: 12)).lineLimit(1)
                Text("Avslutt før " + t.endShort).font(.system(size: 11)).opacity(0.75).lineLimit(1)
            } else {
                Text("⏳ Prøveperioder").font(.system(size: 13, weight: .bold)).widgetAccentable()
                Text(entry.linked ? "Ingen aktive prøver" : "Åpne appen").font(.system(size: 12)).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
