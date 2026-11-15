import SwiftUI
import WidgetKit

/* ---------------- Prompt 43: Media på Hjem (kortet) og data til Media-widgetene ----------------
 Fasit: claude-code-media-widgets.md → «Hjem i appen» og Mobil Papir App.dc.html (Hjem-widgeten «Media»).
 På iOS er h12 allerede Glimt-brief, så Media-kortet har nøkkelen h15. Nytt kort i wiggle-systemet: finnes det ikke i lagret
 rekkefølge, legges det sist (pageCards), og det kan flyttes og skjules som de andre.
 Innhold: «MEDIA · LASTES NED» + «alle ›», tre nedlastinger (navn, episode, %, tynn linje; står fast i gult), skillelinje og
 «KOMMER» med de to neste. Trykk → Media (qBittorrent hvis noe lastes ned, ellers Kommer snart). Skjules automatisk når
 ingenting lastes ned og ingenting kommer de neste 7 dagene (vises dempet i redigeringsmodus). */

/// Skriver Media-dataene til App Group og ber om ny tidslinje (maks hvert 60. sekund).
@MainActor
enum Media43Widget {
    private static var last: Date = .distantPast

    static func write(_ m: Media43) {
        var v: Media43WData = Media43WData()
        v.speed = m.dlSpeed
        v.up = m.upSpeed
        v.active = m.torrents.filter(\.active).count
        v.paused = !m.torrents.isEmpty && m.torrents.allSatisfy { $0.paused || $0.done }
        v.downloads = m.torrents.filter { !$0.done }.prefix(5).map {
            Media43WDownload(name: $0.name, sub: $0.sub, progress: $0.progress, stalled: $0.stalled, hash: $0.hash)
        }
        v.next = m.upcoming.filter { ($0.date ?? .distantPast) > Date() }.prefix(3).map { (it: Media43Item) -> Media43WNext in
            Media43WNext(title: it.title, code: it.kind == "movie" ? "Film" : it.code, when: it.date.map { JS.fmt($0, "EEE HH:mm") } ?? "", poster: it.poster, color: "")
        }
        v.updated = Date().timeIntervalSince1970
        Media43W.store(v)
        if Date().timeIntervalSince(last) > 60 {
            last = Date()
            Media43W.reload()
        }
    }
}

struct Media43HomeCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Media43 { Media43.shared }

    var body: some View {
        let editing: Bool = store.paperEditPage == "hjem"
        let dls: [Media43Torrent] = m.torrents.filter { !$0.done }
        let week: Date = Date().addingTimeInterval(7 * 86_400)
        let next: [Media43Item] = m.upcoming.filter { ($0.date ?? .distantPast) > Date().addingTimeInterval(-3600) && ($0.date ?? .distantFuture) < week }
        let empty: Bool = dls.isEmpty && next.isEmpty
        Group {
            if m.allowed && (!empty || editing) {
                Button {
                    if store.paperTapBlocked { return }
                    m.show(dls.isEmpty ? "kommer" : "qbit")
                } label: {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("MEDIA · LASTES NED").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
                            Spacer()
                            Text("alle ›").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
                        }
                        if empty {
                            Text("Ingenting lastes ned og ingenting kommer de neste 7 dagene. Skjules automatisk.")
                                .font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                        }
                        ForEach(Array(dls.prefix(3))) { (t: Media43Torrent) in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 6) {
                                    Text(t.name).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                                    Spacer(minLength: 4)
                                    Text(t.stalled ? "Står fast" : "\(Int((t.progress * 100).rounded())) %").font(PF.ui(12.5, .bold))
                                        .foregroundStyle(t.stalled ? Color(hex: p.dark ? "#c48a1a" : "#a0671a") : p.ink)
                                }
                                if !t.sub.isEmpty { Text(t.sub).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1) }
                                GeometryReader { (g: GeometryProxy) in
                                    ZStack(alignment: .leading) {
                                        Capsule().fill(p.line)
                                        Capsule().fill(t.stalled ? Color(hex: "#c48a1a") : p.lab).frame(width: g.size.width * CGFloat(Swift.min(1, Swift.max(0, t.progress))))
                                    }
                                }
                                .frame(height: 3)
                            }
                        }
                        if !next.isEmpty {
                            Rectangle().fill(p.line).frame(height: 1)
                            Text("KOMMER").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.mut)
                            ForEach(Array(next.prefix(2))) { (it: Media43Item) in
                                HStack(spacing: 10) {
                                    Media43Poster(url: it.poster, title: it.title, width: 30, height: 44, radius: 6)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(it.title).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                                        Text([it.kind == "movie" ? "Film" : it.code, it.date.map { JS.fmt($0, "EEE HH:mm") } ?? ""].filter { !$0.isEmpty }.joined(separator: " · "))
                                            .font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
                                    }
                                    Spacer(minLength: 0)
                                }
                            }
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .opacity(empty ? 0.65 : 1)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .task(id: store.account?.id ?? "") {
            await m.probe(store)
            guard m.allowed else { return }
            await m.loadTorrents(store)
            await m.loadUpcoming(store)
        }
    }
}
