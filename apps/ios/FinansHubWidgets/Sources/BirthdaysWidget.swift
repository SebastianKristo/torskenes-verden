import SwiftUI
import WidgetKit

/* ---------------- Prompt 24: Bursdager-widget (liten, medium og låseskjerm) ---------------- */
// Fasit: «WIDGETS PÅ TELEFONEN» i design/Bursdager.dc.html. Henter GET /api/widgets/birthdays (faller tilbake
// til /api/birthdays og til siste bufrede svar). Oppdateres ved midnatt og når appen endrer bursdager.

struct BirthdaysEntry: TimelineEntry {
    let date: Date
    let items: [BirthdayW24]
    let linked: Bool
}

enum BirthdaysFetch {
    static func load() async -> (data: Data?, linked: Bool) {
        let linked: Bool = !(WidgetShared.token ?? "").isEmpty
        var data: Data? = await TasksFetch.request("/api/widgets/birthdays")
        if data == nil { data = await TasksFetch.request("/api/birthdays") }
        if let data {
            WidgetShared.defaults.set(data, forKey: BirthdayShared24.cacheKey)
        } else {
            data = WidgetShared.defaults.data(forKey: BirthdayShared24.cacheKey)
        }
        return (data, linked)
    }

    static var sample: [BirthdayW24] {
        let raw: [[String: Any]] = [
            ["id": "1", "name": "Ingrid", "month": 11, "day": 2, "year": 1985, "relation": "familie", "source": "google"],
            ["id": "2", "name": "Rune", "month": 11, "day": 17, "year": 1962, "relation": "familie", "source": "ha"],
            ["id": "3", "name": "Cybele", "month": 1, "day": 9, "year": 2005, "relation": "venn", "source": "local"],
        ]
        return raw.compactMap { BirthdayShared24.item($0) }.sorted { $0.daysLeft < $1.daysLeft }
    }
}

struct BirthdaysProvider: TimelineProvider {
    func placeholder(in context: Context) -> BirthdaysEntry {
        BirthdaysEntry(date: Date(), items: BirthdaysFetch.sample, linked: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (BirthdaysEntry) -> Void) {
        if context.isPreview {
            completion(BirthdaysEntry(date: Date(), items: BirthdaysFetch.sample, linked: true))
            return
        }
        Task {
            let r = await BirthdaysFetch.load()
            let items: [BirthdayW24] = r.data.map { BirthdayShared24.parse($0) } ?? []
            completion(BirthdaysEntry(date: Date(), items: items, linked: r.linked))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BirthdaysEntry>) -> Void) {
        Task {
            let r = await BirthdaysFetch.load()
            let now = Date()
            let cal = Calendar.current
            let midnight: Date = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: now)) ?? now.addingTimeInterval(86_400)
            var entries: [BirthdaysEntry] = []
            entries.append(BirthdaysEntry(date: now, items: r.data.map { BirthdayShared24.parse($0, now: now) } ?? [], linked: r.linked))
            // Ved midnatt regnes «dager igjen» ut på nytt fra samme data, også uten nett.
            let atMidnight: Date = midnight.addingTimeInterval(60)
            entries.append(BirthdaysEntry(date: atMidnight, items: r.data.map { BirthdayShared24.parse($0, now: atMidnight) } ?? [], linked: r.linked))
            let next: Date = Swift.min(now.addingTimeInterval(3 * 3600), atMidnight.addingTimeInterval(60))
            completion(Timeline(entries: entries, policy: .after(next)))
        }
    }
}

struct BirthdaysWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: BirthdayShared24.widgetKind, provider: BirthdaysProvider()) { e in BirthdaysWidgetView(entry: e) }
            .configurationDisplayName("Bursdager")
            .description("Neste bursdag og de tre neste.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

/* ---------- Utseende ---------- */

private let bdInk = Color(red: 0.106, green: 0.102, blue: 0.09)       // #1b1a17
private let bdLab = Color(red: 0.698, green: 0.227, blue: 0.165)      // #b23a2a
private let bdMut = Color(red: 0.478, green: 0.455, blue: 0.408)      // #7a7468
private let bdPaper = Color(red: 1, green: 1, blue: 1).opacity(0.94)

private func bdColor(_ hex: String) -> Color {
    var h: String = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
    let v: UInt64 = UInt64(h, radix: 16) ?? 0x5C5850
    return Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
}

struct BirthdaysWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: BirthdaysEntry

    var body: some View {
        content
            .widgetURL(URL(string: "finanshub://bursdager"))
            .containerBackground(for: .widget) {
                if family == .accessoryRectangular { Color.clear } else { bdPaper }
            }
    }

    @ViewBuilder private var content: some View {
        switch family {
        case .accessoryRectangular: BirthdaysLockView(entry: entry)
        case .systemMedium: BirthdaysMediumView(entry: entry)
        default: BirthdaysSmallView(entry: entry)
        }
    }
}

/// «NESTE BURSDAG», dager igjen stort, navn og «Fyller 41 · 2. nov».
private struct BirthdaysSmallView: View {
    let entry: BirthdaysEntry

    var body: some View {
        let first: BirthdayW24? = entry.items.first
        let same: [BirthdayW24] = first.map { f in entry.items.filter { $0.daysLeft == f.daysLeft } } ?? []
        VStack(alignment: .leading, spacing: 0) {
            Text(first?.daysLeft == 0 ? "BURSDAG I DAG" : "NESTE BURSDAG")
                .font(.system(size: 9.5, weight: .semibold, design: .monospaced)).tracking(0.9).foregroundStyle(bdLab)
            if !entry.linked {
                Text("Åpne appen og logg inn").font(.system(size: 12)).foregroundStyle(bdMut).padding(.top, 6)
            } else if let f = first {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(f.daysLeft == 0 ? "I dag" : "\(f.daysLeft)").font(.system(size: 40, weight: .medium, design: .serif)).foregroundStyle(bdLab)
                        .lineLimit(1).minimumScaleFactor(0.6)
                    if f.daysLeft > 0 {
                        Text(f.daysLeft == 1 ? "dag" : "dager").font(.system(size: 12, weight: .bold)).foregroundStyle(bdMut)
                    }
                }
                .padding(.top, 4)
                Spacer(minLength: 0)
                Text(same.map(\.name).joined(separator: " og ")).font(.system(size: 15, weight: .heavy)).foregroundStyle(bdInk).lineLimit(1)
                Text(subText(f)).font(.system(size: 11.5)).foregroundStyle(bdMut).lineLimit(1)
            } else {
                Spacer(minLength: 0)
                Text("Ingen bursdager ennå").font(.system(size: 13, weight: .semibold)).foregroundStyle(bdInk)
                Text("Legg til i appen").font(.system(size: 11.5)).foregroundStyle(bdMut)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func subText(_ f: BirthdayW24) -> String {
        if let a = f.age { return "Fyller \(a) · \(f.shortDate)" }
        return f.shortDate
    }
}

/// «Bursdager» og de tre neste med avatar, dato og alder og «om N d».
private struct BirthdaysMediumView: View {
    let entry: BirthdaysEntry

    var body: some View {
        let soon: Int = entry.items.filter { $0.daysLeft <= 30 }.count
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("Bursdager").font(.system(size: 17, weight: .medium, design: .serif)).foregroundStyle(bdInk)
                Spacer()
                Text("\(soon) NESTE 30 D").font(.system(size: 9.5, weight: .semibold, design: .monospaced)).tracking(0.8).foregroundStyle(bdLab)
            }
            if !entry.linked {
                Text("Åpne appen og logg inn").font(.system(size: 12)).foregroundStyle(bdMut)
            } else if entry.items.isEmpty {
                Text("Ingen bursdager ennå. Legg til i appen.").font(.system(size: 12)).foregroundStyle(bdMut)
            }
            ForEach(entry.items.prefix(3), id: \.id) { b in
                BirthdayWidgetRow(b: b)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct BirthdayWidgetRow: View {
    let b: BirthdayW24

    var body: some View {
        HStack(spacing: 9) {
            Text(b.initials).font(.system(size: 10, weight: .heavy)).foregroundStyle(.white)
                .frame(width: 26, height: 26).background(bdColor(b.colorHex), in: Circle())
            VStack(alignment: .leading, spacing: 0) {
                Text(b.name).font(.system(size: 13, weight: .bold)).foregroundStyle(bdInk).lineLimit(1)
                Text(sub).font(.system(size: 11)).foregroundStyle(bdMut).lineLimit(1)
            }
            Spacer(minLength: 4)
            Text(b.whenText).font(.system(size: 14, weight: .medium, design: .serif)).foregroundStyle(b.daysLeft <= 7 ? bdLab : bdInk)
        }
    }

    private var sub: String {
        if let a = b.age { return "\(b.shortDate) · \(a) år" }
        return b.shortDate
    }
}

/// Låseskjermen: neste navn og dager igjen.
private struct BirthdaysLockView: View {
    let entry: BirthdaysEntry

    var body: some View {
        let first: BirthdayW24? = entry.items.first
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Image(systemName: "gift.fill").font(.system(size: 11, weight: .semibold))
                Text(first?.daysLeft == 0 ? "BURSDAG I DAG" : "NESTE BURSDAG").font(.system(size: 11, weight: .semibold))
            }
            .widgetAccentable()
            if let f = first {
                Text(f.name).font(.system(size: 15, weight: .bold)).lineLimit(1)
                Text(f.daysLeft == 0 ? f.shortDate : "\(f.whenText) · \(f.shortDate)").font(.system(size: 12)).lineLimit(1)
            } else {
                Text(entry.linked ? "Ingen bursdager" : "Åpne appen").font(.system(size: 13, weight: .semibold)).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
