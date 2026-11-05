import SwiftUI
import UIKit

/* ---------------- Prompt 73 (NEWS73): lagre artikler offline ---------------- */
// claude-code-nyheter-lagre-artikkel.md, fasit «Lagre og logo.dc.html» 1c (artikkel med lagre-knapp) og 1d (fanen Lagret).
// Serveren henter hele artikkelen (ikke RSS-sammendraget) og bildene: /api/news/saved (per bruker, synkes med web).
// Appen lagrer i tillegg en lokal kopi (GET /api/news/saved/:id?offline=1, bildene som data:-URI-er) i Application Support,
// så lagrede artikler kan leses uten nett. Teksten vises som egne blokker (ingen WebView, ingen HTML).

struct News73Item: Identifiable, Hashable {
    var id: String
    var url: String
    var title: String
    var lead: String
    var source: String
    var status: String
    var statusText: String
    var savedAt: Date?
    var updatedAt: String
    var words: Int
    var images: Int

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        url = JS.str(o, "url") ?? ""
        title = JS.str(o, "title") ?? ""
        lead = JS.str(o, "lead") ?? ""
        source = JS.str(o, "source") ?? ""
        status = JS.str(o, "status") ?? "pending"
        statusText = JS.str(o, "statusText") ?? "Laster ned…"
        savedAt = JS.date(o["savedAt"])
        updatedAt = JS.str(o, "updatedAt") ?? ""
        words = JS.int(o, "words") ?? 0
        images = JS.int(o, "images") ?? 0
    }

    var host: String { (URL(string: url)?.host ?? "").replacingOccurrences(of: "www.", with: "") }
    var dotColor: Color {
        if status == "ok" { return Color(hex: "#3d7a4f") }
        if status == "pending" { return Color(hex: "#8f897c") }
        return Color(hex: "#a86a12")
    }
}

struct News73Block: Identifiable {
    var id: Int
    var kind: String
    var text: String
    var src: String
    var cap: String
}

struct News73Doc {
    var item: News73Item
    var author: String
    var published: Date?
    var image: String
    var blocks: [News73Block]

    init(_ o: [String: Any]) {
        item = News73Item(o)
        author = JS.str(o, "author") ?? ""
        published = JS.date(o["published"])
        image = JS.str(o, "image") ?? ""
        let raw: [[String: Any]] = JS.list(o, "blocks")
        var out: [News73Block] = []
        for (i, b) in raw.enumerated() {
            let blk = News73Block(id: i, kind: JS.str(b, "t") ?? "p", text: JS.str(b, "x") ?? "", src: JS.str(b, "src") ?? "", cap: JS.str(b, "cap") ?? "")
            out.append(blk)
        }
        blocks = out
    }
}

/// Bilde fra data:-URI (offline-kopien).
enum News73Img {
    static func image(_ src: String) -> UIImage? {
        guard src.hasPrefix("data:image/"), let comma = src.firstIndex(of: ",") else { return nil }
        let b64: String = String(src[src.index(after: comma)...])
        guard let d = Data(base64Encoded: b64) else { return nil }
        return UIImage(data: d)
    }
}

@MainActor
@Observable
final class News73Model {
    static let shared = News73Model()

    var items: [News73Item] = []
    var loaded: Bool = false
    var offline: Bool = false
    var open: News73Item? = nil
    var docs: [String: News73Doc] = [:]
    var toast: String = ""
    var showTab: Bool = false
    @ObservationIgnored private var polls: Int = 0
    @ObservationIgnored private var started: Bool = false

    /* ---------- Lokal lagring ---------- */

    private var dir: URL {
        let base: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
        let d: URL = base.appendingPathComponent("news73", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
    private func file(_ id: String) -> URL {
        let safe: String = id.filter { $0.isLetter || $0.isNumber || $0 == "-" }
        return dir.appendingPathComponent("\(safe).json")
    }
    private var listFile: URL { dir.appendingPathComponent("list.json") }

    private func readLocalList() {
        guard let d = try? Data(contentsOf: listFile) else { return }
        items = JS.list(JS.obj(d), "items").map(News73Item.init)
    }
    private func readLocalDoc(_ id: String) -> News73Doc? {
        guard let d = try? Data(contentsOf: file(id)) else { return nil }
        return News73Doc(JS.obj(d))
    }

    /* ---------- Synk ---------- */

    func isSaved(_ url: String) -> Bool { items.contains { $0.url == url } }
    func item(for url: String) -> News73Item? { items.first { $0.url == url } }

    func start(_ store: Store) {
        if !started { started = true; readLocalList() }
        Task { await load(store) }
    }

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/news/saved", timeout: 20)
            items = JS.list(JS.obj(d), "items").map(News73Item.init)
            try? d.write(to: listFile, options: .atomic)
            offline = false
            loaded = true
            await syncDocs(store)
        } catch {
            if !started { readLocalList() }
            offline = true
            loaded = true
        }
        if items.contains(where: { $0.status == "pending" }) && polls < 30 {
            polls += 1
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            await load(store)
        } else {
            polls = 0
        }
    }

    /// Henter offline-kopien av artikler som er ferdige og ikke ligger lokalt (eller er endret), og rydder bort slettede.
    private func syncDocs(_ store: Store) async {
        let ids: Set<String> = Set(items.map(\.id))
        if let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) {
            for f in files where f.lastPathComponent != "list.json" {
                let id: String = f.deletingPathExtension().lastPathComponent
                if !ids.contains(id) { try? FileManager.default.removeItem(at: f) }
            }
        }
        for it in items where it.status != "pending" {
            let local: News73Doc? = docs[it.id] ?? readLocalDoc(it.id)
            if let l = local, l.item.updatedAt == it.updatedAt { docs[it.id] = l; continue }
            await fetchDoc(it.id, store)
        }
    }

    private func fetchDoc(_ id: String, _ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/news/saved/\(id)?offline=1", timeout: 60)
            try? d.write(to: file(id), options: .atomic)
            docs[id] = News73Doc(JS.obj(d))
        } catch {
            if let l = readLocalDoc(id) { docs[id] = l }
        }
    }

    func doc(_ id: String, _ store: Store) async -> News73Doc? {
        if let d = docs[id] { return d }
        if let l = readLocalDoc(id) { docs[id] = l; return l }
        await fetchDoc(id, store)
        return docs[id]
    }

    func save(_ x: NewsItem, _ store: Store) {
        if isSaved(x.url) { return }
        let seed: [String: Any] = ["id": "tmp-\(UUID().uuidString)", "url": x.url, "title": x.title, "source": x.feed, "status": "pending", "statusText": "Laster ned…"]
        var tmp = News73Item(seed)
        tmp.savedAt = Date()
        items.insert(tmp, at: 0)
        let tmpId: String = tmp.id
        flash("Lagret · lastes ned for lesing uten nett")
        Haptics.shared.tap()
        let body: [String: Any] = ["url": x.url, "title": x.title, "lead": x.excerpt, "description": x.excerpt, "image": x.image, "source": x.feed]
        Task {
            do {
                _ = try await store.api.callAt("/api", "POST", "/news/saved", json: body, timeout: 30)
            } catch {
                items.removeAll { $0.id == tmpId }
                flash("Fikk ikke lagret artikkelen")
                return
            }
            await load(store)
        }
    }

    func remove(_ id: String, _ store: Store) {
        items.removeAll { $0.id == id }
        docs[id] = nil
        try? FileManager.default.removeItem(at: file(id))
        if open?.id == id { open = nil }
        flash("Fjernet fra Lagret")
        Task {
            do { _ = try await store.api.callAt("/api", "DELETE", "/news/saved/\(id)", timeout: 20) } catch { }
            await load(store)
        }
    }

    func toggle(_ x: NewsItem, _ store: Store) {
        if let it = item(for: x.url) { remove(it.id, store) } else { save(x, store) }
    }

    func retry(_ id: String, _ store: Store) {
        if let i = items.firstIndex(where: { $0.id == id }) { items[i].status = "pending"; items[i].statusText = "Laster ned…" }
        docs[id] = nil
        Task {
            do { _ = try await store.api.callAt("/api", "POST", "/news/saved/\(id)/retry", json: [:], timeout: 20) } catch { flash("Fikk ikke prøvd på nytt") }
            await load(store)
        }
    }

    func flash(_ t: String) {
        toast = t
        Task {
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if toast == t { toast = "" }
        }
    }
}

/* ---------------- Visninger ---------------- */

/// «Lagret 28. okt.».
enum News73Fmt {
    static func day(_ d: Date?) -> String { JS.fmt(d, "d. MMM") }
    static func n(_ v: Int) -> String {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.numberStyle = .decimal
        return f.string(from: NSNumber(value: v)) ?? "\(v)"
    }
}

/// Bokmerket øverst i artikkelvisningen (1c): rund knapp, fylt når saken er lagret.
struct News73BookmarkButton: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let item: NewsItem

    var body: some View {
        let on: Bool = News73Model.shared.isSaved(item.url)
        Button { News73Model.shared.toggle(item, store) } label: {
            Image(systemName: on ? "bookmark.fill" : "bookmark")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(on ? p.bg : p.ink)
                .frame(width: 44, height: 44)
                .background(on ? p.ink : p.card, in: Circle())
                .overlay(Circle().stroke(on ? p.ink : p.line, lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(on ? "Fjern fra lagret" : "Lagre artikkel")
    }
}

/// «Lagret 28. okt.» / «Laster ned…» / «Kun sammendrag» med «Prøv å laste ned på nytt».
struct News73Banner: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let it: News73Item
    var words: Int? = nil

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Text(mark).font(PF.ui(13, .bold)).foregroundStyle(markFg)
                .frame(width: 28, height: 28).background(markBg, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(14)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                if it.status == "summary" || it.status == "error" {
                    Button { News73Model.shared.retry(it.id, store) } label: {
                        Text("Prøv å laste ned på nytt").font(PF.ui(13, .semibold)).foregroundStyle(p.ink)
                            .padding(.horizontal, 12).frame(height: 32).overlay(Capsule().stroke(p.line, lineWidth: 1)).contentShape(Capsule())
                    }
                    .buttonStyle(.plain).padding(.top, 6)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
    }

    private var mark: String { it.status == "ok" ? "✓" : it.status == "pending" ? "…" : "!" }
    private var markFg: Color { it.status == "pending" ? p.ink : p.bg }
    private var markBg: Color { it.status == "pending" ? p.line : it.status == "ok" ? p.ink : Color(hex: "#a86a12") }
    private var title: String {
        if it.status == "ok" { return "Lagret \(News73Fmt.day(it.savedAt))" }
        if it.status == "pending" { return "Laster ned…" }
        return it.statusText
    }
    private var sub: String {
        if it.status == "pending" { return "Hele artikkelen hentes fra \(it.host)" }
        if it.status != "ok" { return "Fant ikke hele teksten hos \(it.host). Tittel, ingress og lenke er lagret." }
        let w: String = News73Fmt.n(words ?? it.words)
        let img: String = it.images > 0 ? ", \(it.images) \(it.images == 1 ? "bilde" : "bilder")" : ""
        return "Hele artikkelen (\(w) ord\(img)) er lastet ned fra \(it.host) · kan leses uten nett"
    }
}

/// Fanen «Lagret» (1d): kilde, tittel, status med prikk og bilde 84 × 84. Sveip for å fjerne.
struct News73SavedList: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var q: String = ""

    var body: some View {
        let m = News73Model.shared
        let list: [News73Item] = filtered(m.items)
        List {
            search.listRowBackground(Color.clear).listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 12, leading: 22, bottom: 4, trailing: 22))
            if m.items.isEmpty {
                empty.listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
            ForEach(list) { it in
                row(it)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 22, bottom: 0, trailing: 22))
                    .listRowSeparatorTint(p.line)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) { News73Model.shared.remove(it.id, store) } label: { Label("Fjern fra lagret", systemImage: "bookmark.slash") }
                    }
                    .contextMenu {
                        Button { store.openLink(it.url) } label: { Label("Åpne original", systemImage: "safari") }
                        Button(role: .destructive) { News73Model.shared.remove(it.id, store) } label: { Label("Fjern fra lagret", systemImage: "bookmark.slash") }
                    }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .refreshable { await News73Model.shared.load(store) }
    }

    private func filtered(_ all: [News73Item]) -> [News73Item] {
        let t: String = q.trimmingCharacters(in: .whitespaces).lowercased()
        if t.isEmpty { return all }
        return all.filter { ($0.title + " " + $0.source + " " + $0.lead).lowercased().contains(t) }
    }

    private var search: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.mut)
            TextField("Søk i lagrede artikler", text: $q).font(PF.ui(15)).foregroundStyle(p.ink).submitLabel(.search)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
            if !q.isEmpty {
                Button { q = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(p.mut) }
                    .buttonStyle(.plain).accessibilityLabel("Tøm")
            }
        }
        .padding(.horizontal, 16).frame(height: 44)
        .background(p.card, in: Capsule())
        .overlay(Capsule().stroke(p.line, lineWidth: 1))
    }

    private var empty: some View {
        VStack(spacing: 6) {
            Text("Ingen lagrede artikler ennå").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            Text("Trykk på bokmerket i en sak, eller hold inne og velg «Lagre». Hele artikkelen lastes ned og kan leses uten nett.")
                .font(PF.ui(14)).foregroundStyle(p.mut).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 40)
    }

    private func row(_ it: News73Item) -> some View {
        Button { Haptics.shared.tap(); News73Model.shared.open = it } label: {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(it.source.uppercased()).font(PF.mono(10.5)).tracking(1).foregroundStyle(p.mut).lineLimit(1)
                    Text(it.title).font(PF.serif(19, medium: true)).foregroundStyle(p.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 6) {
                        Circle().fill(it.dotColor).frame(width: 7, height: 7)
                        Text(it.statusText).font(PF.ui(12.5, .semibold)).foregroundStyle(it.dotColor)
                    }
                    .padding(.top, 3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                News73Thumb(id: it.id, source: it.source)
            }
            .padding(.vertical, 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Åpner den lagrede kopien")
    }
}

/// Bildet til en lagret artikkel fra den lokale kopien, ellers kildefarge og initialer.
struct News73Thumb: View {
    let id: String
    let source: String
    var size: CGFloat = 84

    var body: some View {
        let src: String = News73Model.shared.docs[id]?.image ?? ""
        ZStack {
            NewsLook27.color(source)
            Text(NewsLook27.initials(source)).font(PF.ui(14, .heavy)).foregroundStyle(Color.white)
            if let img = News73Img.image(src) {
                Image(uiImage: img).resizable().scaledToFill()
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// Leservisningen for en lagret artikkel (samme typografi som Nyhetsleser). Leser alltid den lokale kopien.
struct News73Reader: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let it: News73Item
    let close: () -> Void
    @State private var doc: News73Doc? = nil
    @State private var busy: Bool = true

    var body: some View {
        VStack(spacing: 0) {
            top
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    head
                    News73Banner(it: cur, words: doc?.item.words)
                    if busy && doc == nil {
                        Text("Åpner den lagrede kopien …").font(PF.ui(15)).foregroundStyle(p.mut)
                    }
                    if let d = doc {
                        ForEach(d.blocks) { b in block(b) }
                    }
                    origButton
                    Button { News73Model.shared.remove(it.id, store); close() } label: {
                        Text("Fjern fra lagret").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
                            .padding(.horizontal, 16).frame(height: 40).overlay(Capsule().stroke(p.line, lineWidth: 1)).contentShape(Capsule())
                    }
                    .buttonStyle(.plain).frame(maxWidth: .infinity)
                }
                .frame(maxWidth: 720)
                .padding(.horizontal, 22).padding(.top, 8).padding(.bottom, 40)
                .frame(maxWidth: .infinity)
            }
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .task(id: it.id) { await load() }
    }

    private var cur: News73Item { News73Model.shared.items.first { $0.id == it.id } ?? it }

    private func load() async {
        busy = true
        doc = await News73Model.shared.doc(it.id, store)
        busy = false
    }

    private var top: some View {
        HStack(spacing: 8) {
            Button { Haptic34.back(); close() } label: {
                Text("‹ Lagret").font(PF.ui(14, .semibold)).foregroundStyle(p.ink).padding(.leading, 12).padding(.trailing, 16).frame(height: 44)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1)).contentShape(Capsule())
            }
            .buttonStyle(.plain)
            Spacer()
            if let u = URL(string: it.url) {
                ShareLink(item: u, subject: Text(it.title)) {
                    Image(systemName: "square.and.arrow.up").font(.system(size: 16, weight: .semibold)).foregroundStyle(p.ink)
                        .frame(width: 44, height: 44).background(p.card, in: Circle()).overlay(Circle().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Del")
            }
        }
        .padding(.horizontal, 22).padding(.top, 12).padding(.bottom, 8)
    }

    @ViewBuilder private var head: some View {
        let label: String = [cur.source, JS.fmt(doc?.published, "d. MMM")].filter { !$0.isEmpty }.joined(separator: " · ")
        Text(label.uppercased()).font(PF.mono(11)).tracking(1.3).foregroundStyle(p.lab).lineLimit(1)
        Text(cur.title).font(PF.serif(32, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
        if !cur.lead.isEmpty {
            Text(cur.lead).font(PF.serif(17)).foregroundStyle(p.mut).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
        }
        if let d = doc, !d.author.isEmpty {
            Text(d.author).font(PF.ui(13)).foregroundStyle(p.mut)
        }
        if let d = doc, let img = News73Img.image(d.image), !d.blocks.contains(where: { $0.src == d.image }) {
            Image(uiImage: img).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    @ViewBuilder private func block(_ b: News73Block) -> some View {
        switch b.kind {
        case "h":
            Text(b.text).font(PF.serif(21, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true).padding(.top, 6)
        case "quote":
            Text(b.text).font(PF.italic(18)).foregroundStyle(p.ink).lineSpacing(4).fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 14).overlay(alignment: .leading) { Rectangle().fill(p.lab).frame(width: 3) }
        case "li":
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("•").font(PF.serif(18)).foregroundStyle(p.mut)
                Text(b.text).font(PF.serif(18)).foregroundStyle(p.ink).lineSpacing(5).fixedSize(horizontal: false, vertical: true)
            }
        case "img":
            imageBlock(b)
        case "pre":
            Text(b.text).font(PF.mono(13, bold: false)).foregroundStyle(p.ink).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(p.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        default:
            Text(b.text).font(PF.serif(18)).foregroundStyle(p.ink).lineSpacing(6).fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder private func imageBlock(_ b: News73Block) -> some View {
        if let img = News73Img.image(b.src) {
            VStack(alignment: .leading, spacing: 6) {
                Image(uiImage: img).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                if !b.cap.isEmpty { Text(b.cap).font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
            }
        }
    }

    private var origButton: some View {
        Button { store.openLink(it.url) } label: {
            Text("Åpne original ↗").font(PF.ui(15, .bold)).foregroundStyle(p.bg)
                .frame(maxWidth: .infinity, minHeight: 50).background(p.ink, in: Capsule()).contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Toast nederst («Lagret · lastes ned for lesing uten nett» / «Fjernet fra Lagret»).
struct News73Toast: View {
    @Environment(\.paper) private var p

    var body: some View {
        let t: String = News73Model.shared.toast
        if !t.isEmpty {
            Text(t).font(PF.ui(14, .semibold)).foregroundStyle(p.bg).lineLimit(1)
                .padding(.horizontal, 18).padding(.vertical, 12).background(p.ink, in: Capsule())
                .padding(.bottom, 30)
                .transition(.opacity)
                .allowsHitTesting(false)
        }
    }
}
