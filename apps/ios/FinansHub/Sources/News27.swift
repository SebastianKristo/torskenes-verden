import SwiftUI
import UIKit

/* ---------------- Prompt 27: Nyhetsleser med bilde i listen og artikkelvisning i appen ---------------- */
// Fasit: design/Nyhetsleser.dc.html og prompts/prompt-27-pakke/claude-code-nyheter-artikkel.md.
// Listen: bilde 76 × 76 til høyre (ellers kildefarge + initialer). Trykk åpner saken i appen:
// 16:9-bilde, KATEGORI · KILDE, tittel, «I dag 09:12 · ca. 3 min å lese», ✦ AI-sammendrag med 3 punkter,
// «Les hele saken hos NRK ↗», Del og «Mer om …». GET /api/rss/article?url= (cache per URL på serveren).

/// Kildefarge og initialer når saken ikke har bilde.
enum NewsLook27 {
    static func color(_ source: String) -> Color {
        let s: String = source.lowercased()
        if s.hasPrefix("nrk") { return Color(hex: "#c4161c") }
        if s.hasPrefix("vg") { return Color(hex: "#d0021b") }
        if s.hasPrefix("e24") { return Color(hex: "#1f3c5a") }
        if s.hasPrefix("aftenposten") { return Color(hex: "#1b1a17") }
        if s.hasPrefix("dagbladet") { return Color(hex: "#b5121b") }
        if s.hasPrefix("tek") { return Color(hex: "#2e6f75") }
        let palette: [String] = ["#2b5d8a", "#2e6f75", "#a8661a", "#5c5850", "#6b3fa0", "#2f7a4f"]
        var h: Int = 0
        for u in s.unicodeScalars { h = (h &* 31 &+ Int(u.value)) & 0x7fffffff }
        return Color(hex: palette[h % palette.count])
    }

    static func initials(_ source: String) -> String {
        let w: String = source.split(separator: " ").first.map(String.init) ?? source
        return String(w.prefix(3)).uppercased()
    }
}

/// Bilde fra nett (cover) med kildefarge og initialer som reserve.
struct NewsThumb27: View {
    let image: String
    let source: String
    var width: CGFloat = 76
    var height: CGFloat = 76
    var radius: CGFloat = 12
    var initialsSize: CGFloat = 13

    var body: some View {
        ZStack {
            NewsLook27.color(source)
            Text(NewsLook27.initials(source)).font(PF.ui(initialsSize, .heavy)).foregroundStyle(Color.white)
            if let u = URL(string: image), image.hasPrefix("http") {
                AsyncImage(url: u) { phase in
                    if let img = phase.image {
                        img.resizable().scaledToFill()
                    } else {
                        Color.clear
                    }
                }
            }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/// Én sak i listen: (kategori), tittel, «kilde · tid» og bildet til høyre.
struct NewsRow27: View {
    @Environment(\.paper) private var p
    let item: NewsItem
    let category: String?
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 3) {
                    if let c = category { Text(c.uppercased()).font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab).lineLimit(1) }
                    Text(item.title).font(PF.ui(15)).foregroundStyle(p.ink).lineSpacing(2).multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(item.feed) · \(item.timeText)\(item.ai ? " · ✦ AI" : "")").font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                NewsThumb27(image: item.image, source: item.feed)
            }
            .padding(.vertical, 12)
            .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct NewsArticle27: Equatable {
    var url: String
    var title: String
    var source: String
    var category: String
    var image: String
    var published: Date?
    var readMin: Int?
    var summary: String
    var points: [String]
    var aiNote: String
    var related: [NewsItem]

    init(_ o: [String: Any]) {
        url = JS.str(o, "url") ?? ""
        title = JS.str(o, "title") ?? ""
        source = JS.str(o, "source") ?? JS.str(o, "feed") ?? ""
        category = JS.str(o, "category") ?? ""
        image = JS.str(o, "image") ?? ""
        published = JS.date(o["published"])
        readMin = JS.int(o, "readMin")
        summary = JS.str(o, "summary") ?? ""
        points = JS.strings(o, "points")
        aiNote = JS.str(o, "aiNote") ?? ""
        related = JS.list(o, "related").map(NewsItem.init)
    }

    static func == (a: NewsArticle27, b: NewsArticle27) -> Bool { a.url == b.url && a.summary == b.summary }
}

/// Artikkelvisningen (fullskjerm over nyhetsleseren).
struct NewsArticleView27: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let start: NewsItem
    let catName: (String) -> String
    let close: () -> Void
    @State private var item: NewsItem? = nil
    @State private var art: NewsArticle27? = nil
    @State private var busy: Bool = true
    @State private var failed: Bool = false

    private var cur: NewsItem { item ?? start }

    var body: some View {
        VStack(spacing: 0) {
            top
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        Color.clear.frame(height: 0).id("art27top")
                        hero
                        Text("\(catName(category).uppercased()) · \(source.uppercased())").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab).lineLimit(1)
                        Text(title).font(PF.serif(28, medium: true)).foregroundStyle(p.ink).lineSpacing(1).fixedSize(horizontal: false, vertical: true)
                        Text(meta).font(PF.ui(13)).foregroundStyle(p.mut)
                        summaryCard
                        readButton
                        related
                    }
                    .frame(maxWidth: 720)
                    .padding(.horizontal, 18).padding(.top, 4).padding(.bottom, 36)
                    .frame(maxWidth: .infinity)
                }
                .onChange(of: cur.url) { _, _ in proxy.scrollTo("art27top", anchor: .top) }
            }
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .task(id: cur.url) { await load() }
    }

    /* ---------- Felt (artikkelsvaret først, ellers saken fra listen) ---------- */

    private var title: String { (art?.title).flatMap { $0.isEmpty ? nil : $0 } ?? cur.title }
    private var source: String { (art?.source).flatMap { $0.isEmpty ? nil : $0 } ?? cur.feed }
    private var category: String { (art?.category).flatMap { $0.isEmpty ? nil : $0 } ?? cur.category }
    private var image: String { (art?.image).flatMap { $0.isEmpty ? nil : $0 } ?? cur.image }
    private var url: String { (art?.url).flatMap { $0.isEmpty ? nil : $0 } ?? cur.url }

    /// «I dag 09:12 · ca. 3 min å lese».
    private var meta: String {
        var parts: [String] = []
        if let d = art?.published ?? cur.published {
            let f: DateFormatter = DateFormatter()
            f.locale = Locale(identifier: "nb_NO")
            if Calendar.current.isDateInToday(d) { f.dateFormat = "'I dag' HH:mm" }
            else if Calendar.current.isDateInYesterday(d) { f.dateFormat = "'I går' HH:mm" }
            else { f.dateFormat = "d. MMM HH:mm" }
            parts.append(f.string(from: d))
        }
        if let m = art?.readMin, m > 0 { parts.append("ca. \(m) min å lese") }
        return parts.joined(separator: " · ")
    }

    /* ---------- Deler ---------- */

    private var top: some View {
        HStack(spacing: 8) {
            Button(action: close) {
                Text("‹ Siste nytt").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).padding(.leading, 12).padding(.trailing, 16).frame(height: 40)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1)).contentShape(Capsule())
            }
            .buttonStyle(.plain)
            Spacer()
            if let u = URL(string: url) {
                ShareLink(item: u, subject: Text(title)) {
                    Text("Del").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).padding(.horizontal, 16).frame(height: 40)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1)).contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 8)
    }

    private var hero: some View {
        GeometryReader { g in
            NewsThumb27(image: image, source: source, width: g.size.width, height: g.size.width * 9 / 16, radius: 18, initialsSize: 28)
        }
        .aspectRatio(16 / 9, contentMode: .fit)
    }

    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            PLabel(text: "✦ AI-sammendrag")
            if busy && art == nil {
                Text("Leser saken …").font(PF.ui(15)).foregroundStyle(p.mut)
            } else if let a = art, !a.summary.isEmpty {
                Text(a.summary).font(PF.serif(19)).foregroundStyle(p.ink).lineSpacing(4).fixedSize(horizontal: false, vertical: true)
                if !a.points.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(a.points.prefix(3).enumerated()), id: \.offset) { pair in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text("\(pair.offset + 1)").font(PF.ui(14.5, .heavy)).foregroundStyle(p.lab)
                                Text(pair.element).font(PF.ui(14.5)).foregroundStyle(p.ink).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .padding(.top, 10)
                    .overlay(alignment: .top) { Rectangle().fill(p.line).frame(height: 1) }
                }
                Text(a.aiNote.isEmpty ? "✦ Laget av AI fra saken. Kan inneholde feil." : "✦ " + a.aiNote).font(PF.ui(12)).foregroundStyle(p.mut)
            } else {
                Text(failed ? "Fikk ikke laget sammendrag av saken." : (cur.excerpt.isEmpty ? "Ingen sammendrag for denne saken." : cur.excerpt))
                    .font(PF.ui(14.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var readButton: some View {
        Button { store.openLink(url) } label: {
            Text("Les hele saken hos \(source.isEmpty ? "kilden" : source) ↗").font(PF.ui(15, .bold)).foregroundStyle(p.bg).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(p.ink, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var related: some View {
        let list: [NewsItem] = Array(relatedItems.prefix(5))
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                PLabel(text: "Mer om \(catName(category))").padding(.top, 12).padding(.bottom, 6)
                Rectangle().fill(p.ink).frame(height: 2)
                ForEach(list) { x in
                    Button { item = x; art = nil } label: {
                        HStack(spacing: 14) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(x.title).font(PF.ui(15)).foregroundStyle(p.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                                Text("\(x.feed) · \(x.timeText)").font(PF.ui(12)).foregroundStyle(p.mut)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            NewsThumb27(image: x.image, source: x.feed, width: 64, height: 64, initialsSize: 12)
                        }
                        .padding(.vertical, 12)
                        .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /// «Mer om …»: fra artikkelsvaret, ellers saker i samme kategori i listen.
    private var relatedItems: [NewsItem] {
        if let r = art?.related, !r.isEmpty { return r.filter { $0.url != cur.url } }
        let all: [NewsItem] = store.news?.items ?? []
        return all.filter { $0.category == cur.category && $0.url != cur.url }
    }

    private func load() async {
        busy = true
        failed = false
        let u: String = cur.url
        let enc: String = u.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? u
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/rss/article?url=\(enc)", timeout: 60)
            if u != cur.url { return }
            art = NewsArticle27(JS.obj(d))
        } catch {
            if u == cur.url { failed = true }
        }
        if u == cur.url { busy = false }
    }
}
