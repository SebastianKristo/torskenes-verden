import SwiftUI

/* ---------------- Prompt 40: Nyheter – egen Glimt-side med langt sammendrag, kilder og bilder ----------------
   prompts/prompt-40-pakke/claude-code-nyheter-glimt-side.md, fasit Nyhetsleser.dc.html (gl, glArts, glRun, glLocal, glVals),
   Glimt Brief.dc.html (openNews) og Mobil Papir App.dc.html (briefNews, rssGl).
   Veier inn: Now Brief → Nyheter-kortet «✦ Glimt-sammendrag ›» (lukker briefen, åpner Nyhetsleseren rett på Glimt-siden), og
   det øverste kortet i Nyhetsleseren («Les hele sammendraget med kilder og bilder ›»). «‹ Nyheter» går tilbake.
   Siden: «‹ Nyheter», «▶ Les opp» og «Innhold»; kicker «✦ GLIMT · NYHETSOPPSUMMERING», tittel, meta (dato · saker · kilder ·
   kort/langt), ingress i kursiv serif, seksjoner med referansebrikker [n] (åpner saken), bilder fra sakene (første 16:9, resten 3:2,
   «Bilde fra saken [n] · NRK»), KILDER-liste og fot «Laget av Glimt kl. 09:20 fra kildene du har valgt …».
   API (SERVER40): POST /api/news/glimt {sources?, ids?, length:'kort'|'lang'} → {title, lead, sections:[{h, text, refs}],
   refs:[{n, title, source, url, image, time}], images:[{url, ref, alt}], sources:[{id, name, count, on}], updatedAt};
   GET /api/news/glimt/sources. Feiler det (404/nett): lokalt sammendrag av titlene, gruppert per tema. */

struct News40Ref: Hashable, Identifiable {
    var id: Int { n }
    var n: Int
    var title: String
    var source: String
    var url: String
    var image: String
    var time: String
}

struct News40Section: Hashable {
    var h: String
    var text: String
    var refs: [Int]
}

struct News40Source: Hashable, Identifiable {
    var id: String
    var name: String
    var count: Int
    var on: Bool
}

struct News40Digest: Hashable {
    var title: String = "Dette skjer i dag"
    var lead: String = ""
    var sections: [News40Section] = []
    var refs: [News40Ref] = []
    /// ref-nummer → bilde-URL
    var images: [Int: String] = [:]
    var sources: [News40Source] = []
    var updatedAt: Date? = nil
    var local: Bool = false
}

@MainActor
@Observable
final class News40Model {
    static let shared = News40Model()

    var open: Bool = false
    var busy: Bool = false
    var digest: News40Digest? = nil
    var length: String = UserDefaults.standard.string(forKey: "hl_rss_glimt_len") ?? "kort"
    /// Valgte kilder (tom = alle).
    var picked: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "hl_rss_glimt") ?? [])
    var sources: [News40Source] = []
    var contentOpen: Bool = false

    /// Fra Now Brief: lukk briefen, åpne Nyhetsleseren og så Glimt-siden (etter at briefen har gått ned).
    func openFromBrief(_ store: Store) {
        Haptic30.light()
        Brief34Model.shared.close()
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)
            store.openNews()
            try? await Task.sleep(nanoseconds: 350_000_000)
            self.show(store)
        }
    }

    func show(_ store: Store) {
        open = true
        if digest == nil { Task { await self.load(store) } }
    }

    func load(_ store: Store) async {
        busy = true
        defer { busy = false }
        if sources.isEmpty, let d = try? await store.api.callAt("/api", "GET", "/news/glimt/sources", timeout: 15) {
            var raw: [[String: Any]] = JS.list(JS.obj(d), "sources")
            if raw.isEmpty, let arr = (try? JSONSerialization.jsonObject(with: d)) as? [[String: Any]] { raw = arr }
            sources = News40Model.parseSources(raw)
        }
        var body: [String: Any] = ["length": length]
        if !picked.isEmpty { body["sources"] = Array(picked) }
        do {
            let d: Data = try await store.api.callAt("/api", "POST", "/news/glimt", json: body, timeout: 90)
            digest = News40Model.parse(JS.obj(d))
            if let s = digest?.sources, !s.isEmpty { sources = s }
        } catch {
            digest = local(store)
        }
    }

    func setLength(_ l: String, _ store: Store) {
        length = l
        UserDefaults.standard.set(l, forKey: "hl_rss_glimt_len")
    }

    func toggle(_ id: String) {
        if picked.contains(id) { picked.remove(id) } else { picked.insert(id) }
        UserDefaults.standard.set(Array(picked), forKey: "hl_rss_glimt")
        Haptic30.light()
    }

    func run(_ store: Store) {
        contentOpen = false
        digest = nil
        Task { await self.load(store) }
    }

    /// Antall saker som matcher valgene (fra kildene).
    var matching: Int {
        let list: [News40Source] = picked.isEmpty ? sources : sources.filter { picked.contains($0.id) }
        return Swift.min(30, list.map(\.count).reduce(0, +))
    }

    nonisolated static func parseSources(_ raw: [[String: Any]]) -> [News40Source] {
        raw.map { (x: [String: Any]) -> News40Source in
            News40Source(id: JS.str(x, "id") ?? JS.str(x, "name") ?? "", name: JS.str(x, "name") ?? "", count: JS.int(x, "count") ?? 0, on: JS.bool(x, "on") ?? true)
        }
        .filter { !$0.id.isEmpty }
    }

    nonisolated static func parse(_ o: [String: Any]) -> News40Digest {
        var g: News40Digest = News40Digest()
        g.title = JS.str(o, "title") ?? "Dette skjer i dag"
        g.lead = Fin40Ask.clean(JS.str(o, "lead") ?? JS.str(o, "ingress") ?? "")
        g.sections = JS.list(o, "sections").map { (s: [String: Any]) -> News40Section in
            let refs: [Int] = ((s["refs"] as? [Any]) ?? []).compactMap { ($0 as? NSNumber)?.intValue }
            return News40Section(h: JS.str(s, "h") ?? JS.str(s, "title") ?? "", text: Fin40Ask.clean(JS.str(s, "text") ?? ""), refs: refs)
        }
        g.refs = JS.list(o, "refs").map { (r: [String: Any]) -> News40Ref in
            News40Ref(n: JS.int(r, "n") ?? 0, title: JS.str(r, "title") ?? "", source: JS.str(r, "source") ?? "", url: JS.str(r, "url") ?? "",
                      image: JS.str(r, "image") ?? "", time: JS.str(r, "time") ?? "")
        }
        for im in JS.list(o, "images") {
            if let n = JS.int(im, "ref"), let u = JS.str(im, "url"), !u.isEmpty { g.images[n] = u }
        }
        for r in g.refs where !r.image.isEmpty && g.images[r.n] == nil { g.images[r.n] = r.image }
        g.sources = parseSources(JS.list(o, "sources"))
        g.updatedAt = Hjemlys40Session.date(o["updatedAt"])
        return g
    }

    /// Reserve: titlene gruppert per tema, med referanser.
    func local(_ store: Store) -> News40Digest {
        let data: NewsData = store.news ?? NewsData()
        var g: News40Digest = News40Digest()
        g.local = true
        g.updatedAt = Date()
        let items: [NewsItem] = Array(data.items.filter { picked.isEmpty || picked.contains($0.feedId) || picked.contains($0.feed) }.prefix(length == "lang" ? 30 : 14))
        for (i, x) in items.enumerated() {
            g.refs.append(News40Ref(n: i + 1, title: x.title, source: x.feed, url: x.url, image: x.image, time: ""))
            if !x.image.isEmpty { g.images[i + 1] = x.image }
        }
        let cats: [NewsCategory] = data.categories.filter { $0.id != "siste" }
        for c in cats {
            let idx: [Int] = items.enumerated().filter { $0.element.category == c.id }.map { $0.offset + 1 }
            if idx.isEmpty { continue }
            let text: String = idx.prefix(4).map { (n: Int) -> String in
                let r: News40Ref = g.refs[n - 1]
                return r.source + " melder: " + r.title + "."
            }.joined(separator: " ")
            g.sections.append(News40Section(h: c.name, text: text, refs: Array(idx.prefix(4))))
        }
        if g.sections.isEmpty && !items.isEmpty {
            g.sections.append(News40Section(h: "Siste", text: items.prefix(5).map { $0.title + "." }.joined(separator: " "), refs: Array(1...Swift.min(5, items.count))))
        }
        g.lead = items.isEmpty ? "Ingen saker fra kildene du har valgt ennå." : "Glimt fikk ikke laget et langt sammendrag nå, så her er de viktigste sakene samlet per tema."
        return g
    }

    /// Teksten som leses opp.
    var speech: String {
        guard let g = digest else { return "" }
        return ([g.title, g.lead] + g.sections.map { $0.h + ". " + $0.text }).joined(separator: " ")
    }
}

/* ---------- Siden ---------- */

struct News40Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: News40Model { News40Model.shared }

    var body: some View {
        VStack(spacing: 0) {
            top
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if m.busy && m.digest == nil {
                        HStack(spacing: 10) {
                            ProgressView()
                            Text("Glimt leser sakene …").font(PF.ui(14)).foregroundStyle(p.mut)
                        }
                        .padding(.top, 30)
                    }
                    if let g = m.digest { News40Body(g: g) }
                }
                .padding(.horizontal, 18).padding(.top, 10).padding(.bottom, 40)
            }
            .refreshable { await m.load(store) }
        }
        .background(p.bg.ignoresSafeArea())
        .sheet(isPresented: Binding<Bool>(get: { m.contentOpen }, set: { (v: Bool) in m.contentOpen = v })) {
            News40ContentSheet().environment(\.paper, p).presentationDetents([.medium, .large])
        }
        .onDisappear { Glimt35Voice.shared.stop() }
    }

    private var top: some View {
        HStack(spacing: 8) {
            Button { Haptic34.back(); m.open = false } label: {
                Text("‹ Nyheter").font(PF.ui(13, .semibold)).foregroundStyle(p.ink).padding(.leading, 10).padding(.trailing, 14).frame(height: 36)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1)).contentShape(Capsule())
            }
            .buttonStyle(.plain)
            Spacer()
            Button {
                if Glimt35Voice.shared.speaking != nil { Glimt35Voice.shared.stop() } else {
                    Glimt35Voice.shared.say(m.speech, char: Glimt35Model.shared.cfg.host, store, force: true)
                }
            } label: {
                Text(Glimt35Voice.shared.speaking != nil ? "■ Stopp" : "▶ Les opp").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                    .padding(.horizontal, 14).frame(height: 36).background(p.card, in: Capsule())
            }
            .buttonStyle(.plain)
            Button { m.contentOpen = true } label: {
                Text("Innhold").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 14).frame(height: 36).background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 18).padding(.top, 14).padding(.bottom, 8)
    }
}

struct News40Body: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: News40Model { News40Model.shared }
    let g: News40Digest

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("✦ GLIMT · NYHETSOPPSUMMERING").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
                Text(g.title).font(PF.serif(32, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                Text(meta).font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
            if !g.lead.isEmpty {
                Text(g.lead).font(PF.italic(19)).foregroundStyle(p.ink).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
            }
            ForEach(Array(g.sections.enumerated()), id: \.offset) { i, s in
                News40SectionView(s: s, index: i, g: g)
            }
            if !usedRefs.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Text("KILDER").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.mut).padding(.bottom, 6)
                    ForEach(usedRefs) { (r: News40Ref) in News40RefRow(r: r, image: g.images[r.n]) }
                }
            }
            Text(foot).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        }
    }

    private var usedRefs: [News40Ref] {
        let used: Set<Int> = Set(g.sections.flatMap(\.refs))
        return g.refs.filter { used.contains($0.n) }
    }

    private var meta: String {
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = "EEEE d. MMMM"
        let srcs: Int = Set(usedRefs.map(\.source)).count
        return [f.string(from: g.updatedAt ?? Date()), "\(usedRefs.count) saker", "\(srcs) kilder", m.length == "lang" ? "langt" : "kort"].joined(separator: " · ")
    }

    private var foot: String {
        let f: DateFormatter = DateFormatter()
        f.dateFormat = "HH:mm"
        return "Laget av Glimt kl. " + f.string(from: g.updatedAt ?? Date()) + " fra kildene du har valgt. Trykk på et tall for å lese saken."
    }
}

struct News40SectionView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: News40Model { News40Model.shared }
    let s: News40Section
    let index: Int
    let g: News40Digest

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !s.h.isEmpty { Text(s.h).font(PF.serif(22, medium: true)).foregroundStyle(p.ink) }
            Text(s.text).font(PF.ui(15)).foregroundStyle(p.ink).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
            if !s.refs.isEmpty {
                HStack(spacing: 6) {
                    ForEach(s.refs, id: \.self) { (n: Int) in
                        Button { openRef(n) } label: {
                            Text("[\(n)]").font(PF.mono(12)).foregroundStyle(p.lab)
                                .padding(.horizontal, 7).frame(height: 24)
                                .background(p.card, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Kilde \(n)")
                    }
                }
            }
            if showImage, let n = s.refs.first(where: { g.images[$0] != nil }), let raw = g.images[n], let u = URL(string: raw) {
                VStack(alignment: .leading, spacing: 4) {
                    AsyncImage(url: u) { (img: Image) in img.resizable().scaledToFill() } placeholder: { p.card }
                        .aspectRatio(index == 0 ? 16.0 / 9.0 : 3.0 / 2.0, contentMode: .fit)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    Text("Bilde fra saken [\(n)]" + source(n)).font(PF.ui(11.5)).foregroundStyle(p.mut)
                }
            }
        }
    }

    /// Kort: bilder i de tre første seksjonene, langt: i alle.
    private var showImage: Bool { m.length == "lang" || index < 3 }

    private func source(_ n: Int) -> String {
        let s: String = g.refs.first(where: { $0.n == n })?.source ?? ""
        return s.isEmpty ? "" : " · " + s
    }

    private func openRef(_ n: Int) {
        Haptic30.light()
        guard let r = g.refs.first(where: { $0.n == n }), !r.url.isEmpty else { return }
        store.openLink(r.url)
    }
}

struct News40RefRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let r: News40Ref
    let image: String?

    var body: some View {
        Button { store.openLink(r.url) } label: {
            HStack(spacing: 10) {
                Text("[\(r.n)]").font(PF.mono(12)).foregroundStyle(p.lab).frame(width: 30, alignment: .leading)
                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous).fill(p.card)
                    if let s = image, let u = URL(string: s) {
                        AsyncImage(url: u) { (img: Image) in img.resizable().scaledToFill() } placeholder: { Color.clear }
                    }
                }
                .frame(width: 48, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text(r.title).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).lineLimit(2).multilineTextAlignment(.leading)
                    Text([r.source, r.time].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(11.5)).foregroundStyle(p.mut)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 8)
            .overlay(alignment: .top) { Rectangle().fill(p.line).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// «Innhold»: kilder (chips), lengde, og «✦ Lag sammendrag (N saker)».
struct News40ContentSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: News40Model { News40Model.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Innhold").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                Text("KILDER").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut)
                let cols: [GridItem] = [GridItem(.adaptive(minimum: 110), spacing: 6)]
                LazyVGrid(columns: cols, alignment: .leading, spacing: 6) {
                    ForEach(m.sources) { (s: News40Source) in
                        let on: Bool = m.picked.isEmpty || m.picked.contains(s.id)
                        Button { m.toggle(s.id) } label: {
                            Text(s.name + (s.count > 0 ? " · \(s.count)" : "")).font(PF.ui(13, .bold)).foregroundStyle(on ? p.bg : p.ink)
                                .lineLimit(1).padding(.horizontal, 12).frame(height: 34).frame(maxWidth: .infinity)
                                .background(on ? p.ink : p.card, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                if m.sources.isEmpty {
                    Text("Alle kildene i Nyhetsleseren brukes.").font(PF.ui(13)).foregroundStyle(p.mut)
                }
                Text("LENGDE").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut)
                Picker("Lengde", selection: Binding<String>(get: { m.length }, set: { (v: String) in m.setLength(v, store) })) {
                    Text("Kort").tag("kort")
                    Text("Lang").tag("lang")
                }
                .pickerStyle(.segmented)
                Tfa40Primary(title: "✦ Lag sammendrag" + (m.matching > 0 ? " (\(m.matching) saker)" : "")) { m.run(store) }
            }
            .padding(20)
        }
        .background(p.bg.ignoresSafeArea())
    }
}

/// Inngangen øverst i Nyhetsleseren.
struct News40Entry: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        Button { Haptic30.light(); News40Model.shared.show(store) } label: {
            Text("Les hele sammendraget med kilder og bilder ›").font(PF.ui(13.5, .bold)).foregroundStyle(p.lab)
                .frame(maxWidth: .infinity, alignment: .leading).frame(height: 36)
        }
        .buttonStyle(.plain)
    }
}
