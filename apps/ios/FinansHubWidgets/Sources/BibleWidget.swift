import SwiftUI
import WidgetKit

/* ---------------- Prompt 37: Bibelvers-widgets (liten, medium og låseskjerm) ---------------- */
// Fasit: design/Bibelvers.dc.html (mode=overview → iOS) og claude-code-bibelvers.md.
// Liten (2×2): «BIBELVERS», verset (maks 5 linjer) og ref. Medium (4×2): morgen (fersken) eller kveld (indigo med gyllen glød).
// Låseskjerm rektangulær: «✝︎ Sal 4,9» + 2 linjer. Oppdateres kl. 05, 15 og 17. Leser App Group (w.bible37) som appen skriver.
// Modulen er personlig (standard bare «sebastian»): når den er av, viser widgeten bare at bibelvers ikke er slått på.

private let bvInk: Color = Color(red: 27.0 / 255.0, green: 26.0 / 255.0, blue: 23.0 / 255.0)
private let bvMut: Color = Color(red: 0x8f / 255.0, green: 0x89 / 255.0, blue: 0x7c / 255.0)
private let bvRed: Color = Color(red: 0xb2 / 255.0, green: 0x3a / 255.0, blue: 0x2a / 255.0)
private let bvPaper: Color = Color(red: 0xf3 / 255.0, green: 0xef / 255.0, blue: 0xe6 / 255.0)

private func bvRGB(_ v: Int) -> Color {
    Color(red: Double((v >> 16) & 0xFF) / 255.0, green: Double((v >> 8) & 0xFF) / 255.0, blue: Double(v & 0xFF) / 255.0)
}

struct BibleEntry37: TimelineEntry {
    let date: Date
    let verse: Verse37
    let enabled: Bool
}

struct BibleProvider37: TimelineProvider {
    static let sample: Verse37 = Verse37(ref: "Sal 4,9", text: "I fred vil jeg både legge mig ned og sove; for du, Herre, du alene lar mig bo i tryghet.", period: "evening")

    func placeholder(in context: Context) -> BibleEntry37 {
        BibleEntry37(date: Date(), verse: BibleProvider37.sample, enabled: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (BibleEntry37) -> Void) {
        if context.isPreview { completion(placeholder(in: context)); return }
        completion(entry(Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BibleEntry37>) -> Void) {
        let now: Date = Date()
        let next: Date = Bible37.nextReload(now)
        // To oppføringer: nå, og ved neste periodeskifte (morgen → kveld).
        let entries: [BibleEntry37] = [entry(now), entry(next)]
        completion(Timeline(entries: entries, policy: .after(next.addingTimeInterval(60))))
    }

    private func entry(_ d: Date) -> BibleEntry37 {
        let c: Bible37.Cached = Bible37.cached
        return BibleEntry37(date: d, verse: Bible37.current(d), enabled: c.enabled)
    }
}

struct BibleWidget37: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Bible37.widgetKind, provider: BibleProvider37()) { (e: BibleEntry37) in
            BibleWidgetView37(entry: e)
        }
        .configurationDisplayName("Dagens bibelvers")
        .description("Morgen- og kveldsvers fra Bibelen 1930. Bare for brukere som har bibelvers slått på.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct BibleWidgetView37: View {
    @Environment(\.widgetFamily) private var family
    let entry: BibleEntry37

    var body: some View {
        content
            .widgetURL(URL(string: "finanshub://bibel"))
            .containerBackground(for: .widget) { background }
    }

    @ViewBuilder private var background: some View {
        if family == .accessoryRectangular {
            Color.clear
        } else if family == .systemMedium && entry.enabled {
            BibleMediumBg37(morning: entry.verse.isMorning)
        } else {
            Color.white
        }
    }

    @ViewBuilder private var content: some View {
        if !entry.enabled {
            BibleOff37(rect: family == .accessoryRectangular)
        } else {
            switch family {
            case .accessoryRectangular: BibleRect37(v: entry.verse)
            case .systemMedium: BibleMedium37(v: entry.verse, date: entry.date)
            default: BibleSmall37(v: entry.verse)
            }
        }
    }
}

struct BibleOff37: View {
    let rect: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(rect ? "✝︎ Bibelvers" : "BIBELVERS").font(.system(size: rect ? 13 : 10.5, weight: .semibold, design: .monospaced))
                .foregroundStyle(rect ? Color.primary : bvRed)
            Text("Ikke slått på for denne brukeren. Slå det på i Homelab → Innstillinger → Glimt.")
                .font(.system(size: rect ? 12 : 12.5)).foregroundStyle(rect ? Color.secondary : bvMut)
                .lineLimit(rect ? 2 : 5)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct BibleSmall37: View {
    let v: Verse37

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("BIBELVERS").font(.system(size: 10.5, weight: .semibold, design: .monospaced)).tracking(1.2).foregroundStyle(bvRed)
            Text("«" + v.text + "»").font(.custom("Newsreader-Italic", size: 15)).foregroundStyle(bvInk)
                .lineLimit(5).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
            Text(v.ref).font(.system(size: 12, weight: .bold)).foregroundStyle(bvInk).lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct BibleMediumBg37: View {
    let morning: Bool

    var body: some View {
        ZStack(alignment: .topTrailing) {
            LinearGradient(colors: morning ? [bvRGB(0xfbe9d6), bvRGB(0xf6d6b8)] : [bvRGB(0x1f2b4a), bvRGB(0x2b2350)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(colors: [morning ? Color(red: 1, green: 0.78, blue: 0.47).opacity(0.55) : Color(red: 1, green: 0.9, blue: 0.66).opacity(0.25), .clear],
                           center: .center, startRadius: 0, endRadius: 90)
                .frame(width: 180, height: 180)
                .offset(x: 50, y: -60)
        }
    }
}

struct BibleMedium37: View {
    let v: Verse37
    let date: Date

    var body: some View {
        let m: Bool = v.isMorning
        let fg: Color = m ? bvRGB(0x3b2a1a) : bvPaper
        let lab: Color = m ? bvRed : bvRGB(0xffd9c2)
        let mut: Color = m ? bvRGB(0x8a6a4a) : bvPaper.opacity(0.6)
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(m ? "MORGENVERS" : "KVELDSVERS").font(.system(size: 10.5, weight: .semibold, design: .monospaced)).tracking(1.4).foregroundStyle(lab)
                Spacer(minLength: 6)
                Text(Bible37.dateShort(date)).font(.system(size: 11, weight: .semibold, design: .monospaced)).foregroundStyle(mut)
            }
            Text("«" + v.text + "»").font(.custom("Newsreader-Italic", size: 17)).foregroundStyle(fg)
                .lineLimit(4).minimumScaleFactor(0.75)
            Spacer(minLength: 0)
            Text(v.ref).font(.system(size: 12.5, weight: .bold)).foregroundStyle(fg).lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct BibleRect37: View {
    let v: Verse37

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("✝︎ " + v.ref).font(.system(size: 13, weight: .bold)).lineLimit(1)
            Text(v.text).font(.system(size: 12)).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
