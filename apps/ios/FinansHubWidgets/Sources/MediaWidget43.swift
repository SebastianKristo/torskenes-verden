import SwiftUI
import WidgetKit
import AppIntents

/* ---------------- Prompt 43: Media-widgets (iOS) – liten, medium, stor og låseskjerm ----------------
 Fasit: design/Media Widgets.dc.html → 1a. Liten: MEDIA, total fart (Newsreader 30), «3 aktive · ↑ 1,2», øverste nedlasting.
 Medium: to nedlastinger til venstre, «NESTE» med plakat til høyre. Stor: fart + Pause alt / Fortsett (AppIntent), tre
 nedlastinger og «KOMMER» med tre. Låseskjerm: rektangel (fart, øverste, neste), sirkel (Gauge med %) og innebygd.
 Tidslinje: hvert 5. min mens noe lastes ned, ellers hver time. Trykk → finanshub://media/qbit (eller /kommer). */

private let mwInk: Color = Color(red: 27.0 / 255.0, green: 26.0 / 255.0, blue: 23.0 / 255.0)
private let mwBg: Color = Color(red: 0.953, green: 0.937, blue: 0.902)
private let mwCard: Color = Color(red: 1.0, green: 0.992, blue: 0.973)
private let mwMut: Color = Color(red: 0.49, green: 0.47, blue: 0.43)
private let mwLab: Color = Color(red: 0.698, green: 0.227, blue: 0.165)
private let mwWarn: Color = Color(red: 0.769, green: 0.541, blue: 0.102)
private let mwLine: Color = Color(red: 0.86, green: 0.84, blue: 0.80)

struct Media43Entry: TimelineEntry {
    let date: Date
    let data: Media43WData
    let linked: Bool
}

struct Media43Provider: TimelineProvider {
    static let sample: Media43WData = Media43WData(
        speed: 12_400_000, up: 1_200_000, active: 3, paused: false,
        downloads: [Media43WDownload(name: "Only Murders in the Building", sub: "S05E09", progress: 0.62, stalled: false, hash: "a"),
                    Media43WDownload(name: "The Bear", sub: "S04E03", progress: 0.31, stalled: false, hash: "b"),
                    Media43WDownload(name: "Shrinking", sub: "S03E08", progress: 0.08, stalled: true, hash: "c")],
        next: [Media43WNext(title: "Severance", code: "S02E10", when: "fre 09:00", poster: "", color: "#2b5d8a"),
               Media43WNext(title: "Slow Horses", code: "S05E02", when: "ons 21:00", poster: "", color: "#7a3b2e"),
               Media43WNext(title: "Dune: Prophecy", code: "Film", when: "lør", poster: "", color: "#8a6a2b")],
        updated: 0)

    func placeholder(in context: Context) -> Media43Entry { Media43Entry(date: Date(), data: Media43Provider.sample, linked: true) }

    func getSnapshot(in context: Context, completion: @escaping (Media43Entry) -> Void) {
        if context.isPreview { completion(placeholder(in: context)); return }
        Task { completion(Media43Entry(date: Date(), data: await Media43W.load(), linked: !(WidgetShared.token ?? "").isEmpty)) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Media43Entry>) -> Void) {
        Task {
            let d: Media43WData = await Media43W.load()
            let e: Media43Entry = Media43Entry(date: Date(), data: d, linked: !(WidgetShared.token ?? "").isEmpty)
            let busy: Bool = d.downloads.contains { $0.progress < 1 && !$0.stalled } && !d.paused
            completion(Timeline(entries: [e], policy: .after(Date().addingTimeInterval(busy ? 300 : 3600))))
        }
    }
}

struct MediaWidget43: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Media43W.kind, provider: Media43Provider()) { (e: Media43Entry) in
            Media43WidgetView(entry: e)
        }
        .configurationDisplayName("Media")
        .description("Nedlastinger i qBittorrent og det som kommer i Sonarr og Radarr. Pause alt i den store.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct MediaLockWidget43: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Media43W.lockKind, provider: Media43Provider()) { (e: Media43Entry) in
            Media43LockView(entry: e)
        }
        .configurationDisplayName("Media · låseskjerm")
        .description("Fart, øverste nedlasting og neste episode.")
        .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

private struct Media43Bar: View {
    let p: Double
    let stalled: Bool
    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            ZStack(alignment: .leading) {
                Capsule().fill(mwLine)
                Capsule().fill(stalled ? mwWarn : mwLab).frame(width: g.size.width * CGFloat(Swift.min(1, Swift.max(0, p))))
            }
        }
        .frame(height: 3)
    }
}

struct Media43WidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Media43Entry

    var body: some View {
        content
            .widgetURL(URL(string: entry.data.downloads.isEmpty ? "finanshub://media/kommer" : "finanshub://media/qbit"))
            .containerBackground(for: .widget) { mwBg }
    }

    @ViewBuilder private var content: some View {
        if !entry.linked {
            VStack(alignment: .leading, spacing: 4) {
                label("MEDIA")
                Text("Logg inn i appen").font(.system(size: 13, weight: .semibold)).foregroundStyle(mwInk)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            switch family {
            case .systemMedium: medium
            case .systemLarge: large
            default: small
            }
        }
    }

    private func label(_ t: String) -> some View {
        Text(t).font(.custom("IBMPlexMono-SemiBold", size: 10)).tracking(1.2).foregroundStyle(mwLab)
    }

    private var speedText: some View {
        let sp: (String, String) = Media43W.speedParts(entry.data.speed)
        return HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text(entry.data.paused ? "Pauset" : sp.0).font(.custom("Newsreader-Medium", size: 30)).foregroundStyle(mwInk).lineLimit(1).minimumScaleFactor(0.6)
            if !entry.data.paused { Text(sp.1).font(.system(size: 12, weight: .semibold)).foregroundStyle(mwMut) }
        }
    }

    private var activeLine: String {
        "\(entry.data.active) aktive · ↑ " + String(format: "%.1f", entry.data.up / 1e6).replacingOccurrences(of: ".", with: ",")
    }

    private func dl(_ d: Media43WDownload) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 4) {
                Text(d.name).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(mwInk).lineLimit(1)
                Spacer(minLength: 2)
                Text(d.stalled ? "Står fast" : "\(Int((d.progress * 100).rounded())) %").font(.system(size: 11.5, weight: .bold)).foregroundStyle(d.stalled ? mwWarn : mwInk)
            }
            if !d.sub.isEmpty { Text(d.sub).font(.system(size: 10.5)).foregroundStyle(mwMut).lineLimit(1) }
            Media43Bar(p: d.progress, stalled: d.stalled)
        }
    }

    private func poster(_ n: Media43WNext, w: CGFloat, h: CGFloat) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Media43WidgetView.color(n.color, n.title))
            Text(String(n.title.prefix(1))).font(.custom("Newsreader-Medium", size: w * 0.45)).foregroundStyle(Color.white.opacity(0.85))
        }
        .frame(width: w, height: h)
    }

    static func color(_ hex: String, _ title: String) -> Color {
        let pal: [Color] = [Color(red: 0.169, green: 0.365, blue: 0.541), Color(red: 0.478, green: 0.231, blue: 0.180), Color(red: 0.184, green: 0.42, blue: 0.29),
                            Color(red: 0.42, green: 0.29, blue: 0.561), Color(red: 0.541, green: 0.416, blue: 0.169)]
        var h: Int = 0
        for u in title.unicodeScalars { h = (h &* 31 &+ Int(u.value)) & 0x7fffffff }
        return pal[h % pal.count]
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 4) {
            label("MEDIA")
            speedText
            Text(activeLine).font(.system(size: 11)).foregroundStyle(mwMut).lineLimit(1)
            Spacer(minLength: 2)
            if let d = entry.data.downloads.first { dl(d) } else { Text("Ingenting lastes ned").font(.system(size: 12)).foregroundStyle(mwMut) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var medium: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    label("MEDIA · LASTES NED")
                    Spacer()
                }
                Text(Media43W.speed(entry.data.speed)).font(.custom("Newsreader-Medium", size: 20)).foregroundStyle(mwInk)
                ForEach(Array(entry.data.downloads.prefix(2).enumerated()), id: \.offset) { (pair: (offset: Int, element: Media43WDownload)) in dl(pair.element) }
                if entry.data.downloads.isEmpty { Text("Ingenting lastes ned").font(.system(size: 12)).foregroundStyle(mwMut) }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let n = entry.data.next.first {
                VStack(alignment: .leading, spacing: 4) {
                    label("NESTE")
                    poster(n, w: 54, h: 78)
                    Text(n.title).font(.system(size: 11.5, weight: .semibold)).foregroundStyle(mwInk).lineLimit(1)
                    Text([n.code, n.when].filter { !$0.isEmpty }.joined(separator: " · ")).font(.system(size: 10)).foregroundStyle(mwMut).lineLimit(1)
                }
                .frame(width: 96, alignment: .leading)
                .padding(8)
                .background(mwCard, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 0) {
                    label("MEDIA · LASTES NED")
                    speedText
                    Text(activeLine).font(.system(size: 11)).foregroundStyle(mwMut)
                }
                Spacer()
                if entry.data.paused {
                    Button(intent: ResumeAllIntent43()) {
                        Text("Fortsett").font(.system(size: 13, weight: .bold)).foregroundStyle(mwBg).padding(.horizontal, 14).frame(height: 34).background(mwInk, in: Capsule())
                    }
                    .buttonStyle(.plain)
                } else {
                    Button(intent: PauseAllIntent43()) {
                        Text("Pause alt").font(.system(size: 13, weight: .bold)).foregroundStyle(mwBg).padding(.horizontal, 14).frame(height: 34).background(mwInk, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            ForEach(Array(entry.data.downloads.prefix(3).enumerated()), id: \.offset) { (pair: (offset: Int, element: Media43WDownload)) in dl(pair.element) }
            if entry.data.downloads.isEmpty { Text("Ingenting lastes ned").font(.system(size: 12)).foregroundStyle(mwMut) }
            Rectangle().fill(mwLine).frame(height: 1)
            label("KOMMER")
            HStack(alignment: .top, spacing: 10) {
                ForEach(Array(entry.data.next.prefix(3).enumerated()), id: \.offset) { (pair: (offset: Int, element: Media43WNext)) in
                    VStack(alignment: .leading, spacing: 3) {
                        poster(pair.element, w: 60, h: 86)
                        Text(pair.element.title).font(.system(size: 11, weight: .semibold)).foregroundStyle(mwInk).lineLimit(1)
                        Text([pair.element.code, pair.element.when].filter { !$0.isEmpty }.joined(separator: " · ")).font(.system(size: 9.5)).foregroundStyle(mwMut).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

struct Media43LockView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Media43Entry

    var body: some View {
        content
            .widgetURL(URL(string: "finanshub://media/qbit"))
            .containerBackground(for: .widget) { Color.clear }
    }

    @ViewBuilder private var content: some View {
        let top: Media43WDownload? = entry.data.downloads.first
        switch family {
        case .accessoryCircular:
            if let top {
                Gauge(value: Swift.min(1, Swift.max(0, top.progress))) {
                    Image(systemName: "arrow.down")
                } currentValueLabel: {
                    Text("\(Int((top.progress * 100).rounded()))")
                }
                .gaugeStyle(.accessoryCircularCapacity)
            } else {
                VStack(spacing: 0) {
                    Image(systemName: "arrow.down.circle").font(.system(size: 14, weight: .semibold))
                    Text("\(entry.data.active)").font(.system(size: 16, weight: .bold))
                }
            }
        case .accessoryInline:
            Text("↓ " + Media43W.speed(entry.data.speed) + " · \(entry.data.active) aktive")
        default:
            VStack(alignment: .leading, spacing: 1) {
                Text("↓ " + Media43W.speed(entry.data.speed)).font(.system(size: 14, weight: .bold)).widgetAccentable()
                if let top { Text(top.name + " · \(Int((top.progress * 100).rounded())) %").font(.system(size: 12)).lineLimit(1) }
                if let n = entry.data.next.first { Text("Neste: " + n.title + " " + n.code).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
