import SwiftUI
import UIKit

/* ---------------- Prompt 46: Nyheter – egne kategorier, «For deg», favicon, kategori-meny, sammendrag per kategori ----------------
 Spesifikasjon: claude-code-nyheter-egne-kategorier-for-deg.md, -kilder-favicon-dropdown.md, -sammendrag-per-kategori.md og
 -innstillinger-flytt.md. Fasit: Nyhetsleser.dc.html. Samme former som web/PWA (public/js/news.js, mobile-p46.js):
   GET  /api/rss → customCategories:[{id,name,keywords[],icon,order}], interests:[«Oslo», …], feeds[].favicon|icon, settings.catSummary
   POST /api/rss/categories {name, keywords, icon} · DELETE /api/rss/categories/:id (kildene settes til Auto)
   PUT  /api/rss/interests {words}
   GET  /api/rss/summary?cat= → {points:[{text, id|url}] | text, updatedAt, count} | {empty:true}
   PUT  /api/rss/settings {catSummary}
 Kjenner ikke serveren «For deg» eller en egen kategori, hentes «Siste» og sakene filtreres her (interesser / nøkkelord / kilde).
 Innstillingene ligger nå i Innstillinger → Nyheter (News46SettingsPage); Nyheter-siden har bare «…» → Nyhetsinnstillinger. */

struct News46Cat: Identifiable, Hashable {
    var id: String
    var name: String
    var keywords: [String]
}

struct News46Sum: Hashable {
    var points: [(String, String)] = []
    var text: String = ""
    var at: Date = Date()
    var none: Bool = false
    static func == (a: News46Sum, b: News46Sum) -> Bool { a.text == b.text && a.at == b.at && a.points.map { $0.0 } == b.points.map { $0.0 } }
    func hash(into h: inout Hasher) { h.combine(text); h.combine(at) }
}

@MainActor
@Observable
final class News46 {
    static let shared = News46()

    var custom: [News46Cat] = []
    var interests: [String] = []
    var catSummary: Bool = UserDefaults.standard.object(forKey: "news46_catsum") as? Bool ?? true
    var favicons: [String: String] = [:]
    var serverCats: Set<String> = []
    var summaries: [String: News46Sum] = [:]
    var loading: Set<String> = []
    var newName: String = ""
    var newKeywords: String = ""
    var newInterest: String = ""
    var err: String = ""
    @ObservationIgnored private var feedCats: [String: String] = [:]

    /// Fra GET /api/rss (rådata).
    func take(_ o: [String: Any]) {
        serverCats = Set(JS.list(o, "categories").compactMap { JS.str($0, "id") })
        let cc: [[String: Any]] = JS.list(o, "customCategories")
        if !cc.isEmpty || o["customCategories"] != nil {
            custom = cc.compactMap { (c: [String: Any]) -> News46Cat? in
                guard let n = JS.str(c, "name"), !n.isEmpty else { return nil }
                let id: String = JS.str(c, "id") ?? JS.int(c, "id").map { String($0) } ?? ("cc-" + n.lowercased())
                return News46Cat(id: id, name: n, keywords: JS.strings(c, "keywords"))
            }
        }
        if let ints = o["interests"] as? [Any] {
            interests = ints.compactMap { (v: Any) -> String? in (v as? String) ?? JS.str(v as? [String: Any], "word") }
        }
        if let s = JS.dict(o, "settings"), let v = JS.bool(s, "catSummary") { catSummary = v }
        var fav: [String: String] = [:]
        var fc: [String: String] = [:]
        for f in JS.list(o, "feeds") {
            let id: String = JS.str(f, "id") ?? JS.int(f, "id").map { String($0) } ?? ""
            if let u = JS.str(f, "favicon") ?? JS.str(f, "icon") ?? JS.str(f, "fav"), !u.isEmpty { fav[id] = u }
            fc[JS.str(f, "name") ?? ""] = (JS.str(f, "category") ?? "auto").lowercased()
        }
        favicons = fav
        feedCats = fc
    }

    /// For deg og egne kategorier som serveren ikke kjenner: hent «Siste» og filtrer her.
    func isLocal(_ cat: String) -> Bool {
        if serverCats.contains(cat) { return false }
        return cat == "fordeg" || custom.contains { $0.id == cat }
    }

    func filter(_ items: [NewsItem], _ cat: String) -> [NewsItem] {
        func hit(_ x: NewsItem, _ words: [String]) -> Bool {
            let t: String = (x.title + " " + x.excerpt).lowercased()
            return words.contains { (w: String) -> Bool in !w.isEmpty && t.contains(w.lowercased()) }
        }
        if cat == "fordeg" { return Array(items.filter { hit($0, interests) }.prefix(30)) }
        guard let c = custom.first(where: { $0.id == cat }) else { return items }
        return items.filter { (x: NewsItem) -> Bool in feedCats[x.feed] == c.id || x.category == c.id || hit(x, c.keywords) }
    }

    /// Fanelinjen: standard + «For deg» rett etter Siste + egne kategorier.
    func tabs(_ base: [NewsCategory]) -> [NewsCategory] {
        var out: [NewsCategory] = base
        if !out.contains(where: { $0.id == "fordeg" }) {
            let i: Int = (out.firstIndex { $0.id == "siste" } ?? -1) + 1
            out.insert(NewsCategory(id: "fordeg", name: "✦ For deg"), at: Swift.min(i, out.count))
        }
        for c in custom where !out.contains(where: { $0.id == c.id }) { out.append(NewsCategory(id: c.id, name: c.name)) }
        return out
    }

    /// Valg i kildenes kategorimeny (uten Siste og For deg).
    func pickable(_ base: [NewsCategory]) -> [NewsCategory] {
        tabs(base).filter { $0.id != "siste" && $0.id != "fordeg" }
    }

    /* ---------- Sammendrag per kategori ---------- */

    func summary(_ cat: String, _ items: [NewsItem], _ store: Store) async {
        if cat == "siste" || !catSummary || items.count < 3 { return }
        if let s = summaries[cat], Date().timeIntervalSince(s.at) < 1800 { return }
        if loading.contains(cat) { return }
        loading.insert(cat)
        defer { loading.remove(cat) }
        let e: String = cat.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? cat
        var out: News46Sum? = nil
        if let d = try? await store.api.callAt("/api", "GET", "/rss/summary?cat=" + e, timeout: 40) {
            let o: [String: Any] = JS.obj(d)
            let pts: [(String, String)] = ((o["points"] as? [Any]) ?? []).compactMap { (v: Any) -> (String, String)? in
                if let s = v as? String { return (s, "") }
                guard let r = v as? [String: Any], let t = JS.str(r, "text") ?? JS.str(r, "t"), !t.isEmpty else { return nil }
                return (t, JS.str(r, "url") ?? JS.str(r, "id") ?? "")
            }
            let text: String = JS.str(o, "text") ?? ""
            if !pts.isEmpty || !text.isEmpty {
                out = News46Sum(points: pts, text: pts.isEmpty ? text : "", at: JS.date(o["updatedAt"]) ?? Date())
            } else if JS.bool(o, "empty") == true || JS.int(o, "count") == 0 {
                out = News46Sum(none: true)
            }
        }
        // Eldre server: de fire første titlene (ingen tom boks).
        summaries[cat] = out ?? News46Sum(points: items.prefix(4).map { ($0.title, $0.url) }, at: Date())
    }

    func setCatSummary(_ on: Bool, _ store: Store) {
        Haptics.shared.select()
        catSummary = on
        UserDefaults.standard.set(on, forKey: "news46_catsum")
        Task { _ = try? await store.api.callAt("/api", "PUT", "/rss/settings", json: ["catSummary": on], timeout: 10) }
    }

    /* ---------- Egne kategorier og interesser ---------- */

    func addCategory(_ store: Store, _ base: [NewsCategory]) {
        let n: String = newName.trimmingCharacters(in: .whitespaces)
        let taken: [String] = tabs(base).map { $0.name.lowercased().replacingOccurrences(of: "✦ ", with: "") } + ["auto", "for deg"]
        if n.isEmpty { err = "Skriv et navn på kategorien."; return }
        if taken.contains(n.lowercased()) { err = "Det finnes allerede en kategori med det navnet."; return }
        let kw: [String] = newKeywords.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        err = ""
        Haptics.shared.success()
        let body: [String: Any] = ["name": n, "keywords": kw, "icon": "lucide:tag"]
        newName = ""
        newKeywords = ""
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "POST", "/rss/categories", json: body, timeout: 15)
            } catch let e as APIError where e.status != 404 && e.status != 405 {
                self.err = e.message
                return
            } catch {}
            if !self.custom.contains(where: { $0.name.lowercased() == n.lowercased() }) {
                self.custom.append(News46Cat(id: "cc-" + n.lowercased().replacingOccurrences(of: " ", with: "-"), name: n, keywords: kw))
            }
            await store.loadNews()
        }
    }

    func deleteCategory(_ c: News46Cat, _ store: Store) {
        Haptics.shared.warning()
        custom.removeAll { $0.id == c.id }
        if store.newsCat == c.id { store.newsCat = "siste" }
        let enc: String = c.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? c.id
        Task { @MainActor in
            _ = try? await store.api.callAt("/api", "DELETE", "/rss/categories/" + enc, timeout: 15)
            await store.loadNews()
        }
    }

    func addInterest(_ store: Store) {
        let w: String = newInterest.trimmingCharacters(in: .whitespaces)
        newInterest = ""
        guard !w.isEmpty, !interests.contains(where: { $0.lowercased() == w.lowercased() }) else { return }
        setInterests(interests + [w], store)
    }

    func setInterests(_ words: [String], _ store: Store) {
        Haptics.shared.tick()
        interests = Array(words.prefix(40))
        let body: [String: Any] = ["words": interests]
        Task { _ = try? await store.api.callAt("/api", "PUT", "/rss/interests", json: body, timeout: 10) }
    }
}

/* ---------- Sammendragskortet øverst i en kategori ---------- */

struct News46SummaryCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: News46 { News46.shared }
    let cat: String
    let name: String
    let items: [NewsItem]
    let open: (NewsItem) -> Void

    var body: some View {
        Group {
            if cat != "siste" && m.catSummary && items.count >= 3 {
                if let s = m.summaries[cat] {
                    if !s.none && (!s.points.isEmpty || !s.text.isEmpty) { card(s) }
                } else {
                    skeleton
                }
            }
        }
        .task(id: cat + String(items.count)) { await m.summary(cat, items, store) }
    }

    private func card(_ s: News46Sum) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                PLabel(text: "✦ Glimt · " + name.replacingOccurrences(of: "✦ ", with: ""))
                Spacer(minLength: 4)
                Text("oppdatert kl. " + JS.fmt(s.at, "HH:mm")).font(PF.ui(11.5)).foregroundStyle(p.mut)
            }
            if s.points.isEmpty {
                Text(s.text).font(PF.italic(17)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(Array(s.points.prefix(5).enumerated()), id: \.offset) { (pair: (offset: Int, element: (String, String))) in
                    Button { tap(pair.element.1) } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("•").foregroundStyle(p.lab)
                            Text(pair.element.0).font(PF.ui(14.5)).foregroundStyle(p.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                            if target(pair.element.1) != nil { Text("›").foregroundStyle(p.mut) }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .padding(.bottom, 12)
    }

    private var skeleton: some View {
        VStack(alignment: .leading, spacing: 8) {
            PLabel(text: "✦ Glimt · " + name)
            ForEach(0..<3, id: \.self) { (i: Int) in
                RoundedRectangle(cornerRadius: 5).fill(p.line).frame(height: 12).frame(maxWidth: i == 2 ? 180 : .infinity)
            }
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .padding(.bottom, 12)
        .accessibilityLabel("Lager sammendrag")
    }

    private func target(_ ref: String) -> NewsItem? {
        if ref.isEmpty { return nil }
        return items.first { $0.id == ref || $0.url == ref }
    }

    private func tap(_ ref: String) {
        guard let x = target(ref) else { return }
        Haptics.shared.tap()
        open(x)
    }
}

/* ---------- Favicon på kildene ---------- */

/// 34 pt rundet firkant, hvit bakgrunn, tynn kant, ikonet innenfor 6 pt marg. Feiler alt: bokstavene på farget bakgrunn.
struct News46Fav: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: News46 { News46.shared }
    let feed: NewsFeed
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack {
            if let img {
                RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Color.white)
                Image(uiImage: img).resizable().scaledToFit().padding(6)
            } else {
                RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Color(hex: "#6b665c"))
                Text(String(feed.name.prefix(2)).uppercased()).font(PF.ui(10, .bold)).foregroundStyle(.white)
            }
        }
        .frame(width: 34, height: 34)
        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(p.line, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        .opacity(feed.enabled ? 1 : 0.4)
        .task(id: feed.id + (m.favicons[feed.id] ?? "")) {
            let u: String = m.favicons[feed.id] ?? News46Fav.fallback(feed.url)
            if u.isEmpty { return }
            img = await Media46Images.shared.load(u, store)
        }
    }

    /// Domenet uten www./rss./feed(s). → Googles ikon-tjeneste (serveren lagrer sitt eget når den har det).
    nonisolated static func fallback(_ url: String) -> String {
        guard var h = URL(string: url)?.host?.lowercased() else { return "" }
        for pre in ["www.", "rss.", "feeds.", "feed."] where h.hasPrefix(pre) { h = String(h.dropFirst(pre.count)) }
        return "https://www.google.com/s2/favicons?sz=128&domain=" + h
    }
}

/* ---------- Innstillinger → Nyheter ---------- */

struct News46SettingsPage: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: News46 { News46.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            NewsSourcesSheet(embedded: true)
            catSummaryRow
            News46CategoriesSection()
            News46InterestsSection()
        }
        .task { if store.news == nil { await store.loadNews() } }
    }

    private var catSummaryRow: some View {
        Button { m.setCatSummary(!m.catSummary, store) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("✦ Sammendrag per kategori").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                    Text("Glimt lager et eget sammendrag øverst i hver kategori.").font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer(minLength: 6)
                PaperSwitch(on: m.catSummary)
            }
            .padding(14)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct News46CategoriesSection: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: News46 { News46.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            PLabel(text: "Kategorier")
            VStack(spacing: 0) {
                ForEach(Array(m.custom.enumerated()), id: \.element.id) { (pair: (offset: Int, element: News46Cat)) in
                    if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    row(pair.element)
                }
                if m.custom.isEmpty {
                    Text("Ingen egne kategorier ennå.").font(PF.ui(13)).foregroundStyle(p.mut).padding(14).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            VStack(alignment: .leading, spacing: 8) {
                PLabel(text: "+ Ny kategori", color: p.mut)
                field("Navn (påkrevd)", Binding<String>(get: { m.newName }, set: { m.newName = $0 }))
                field("Nøkkelord, kommaseparert (valgfritt)", Binding<String>(get: { m.newKeywords }, set: { m.newKeywords = $0 }))
                if !m.err.isEmpty { Text(m.err).font(PF.ui(12.5)).foregroundStyle(p.lab) }
                PInkButton(title: "Legg til kategori", height: 44, full: true) { m.addCategory(store, (store.news ?? NewsData()).categories) }
            }
        }
    }

    private func row(_ c: News46Cat) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "tag").font(.system(size: 13, weight: .semibold)).foregroundStyle(p.lab)
            VStack(alignment: .leading, spacing: 1) {
                Text(c.name).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                if !c.keywords.isEmpty { Text(c.keywords.joined(separator: ", ")).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1) }
            }
            Spacer(minLength: 4)
            Button { m.deleteCategory(c, store) } label: {
                Image(systemName: "xmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(p.mut).frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Slett " + c.name)
        }
        .padding(.leading, 14).frame(minHeight: 52)
    }

    private func field(_ ph: String, _ b: Binding<String>) -> some View {
        TextField(ph, text: b)
            .font(PF.ui(14.5)).foregroundStyle(p.ink)
            .padding(.horizontal, 12).frame(height: 44)
            .background(p.card, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(p.line, lineWidth: 1))
    }
}

struct News46InterestsSection: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: News46 { News46.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            PLabel(text: "✦ For deg · interesser")
            Flow(spacing: 6) {
                ForEach(m.interests, id: \.self) { (w: String) in
                    HStack(spacing: 6) {
                        Text(w).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                        Button { m.setInterests(m.interests.filter { $0 != w }, store) } label: {
                            Image(systemName: "xmark").font(.system(size: 9, weight: .heavy)).foregroundStyle(p.mut)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Fjern " + w)
                    }
                    .padding(.horizontal, 10).frame(height: 30)
                    .background(p.card, in: Capsule())
                }
            }
            HStack(spacing: 8) {
                TextField("Legg til interesse (f.eks. Elbil)", text: Binding<String>(get: { m.newInterest }, set: { m.newInterest = $0 }))
                    .font(PF.ui(14.5)).foregroundStyle(p.ink).submitLabel(.done).onSubmit { m.addInterest(store) }
                    .padding(.horizontal, 12).frame(height: 44)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(p.line, lineWidth: 1))
                PInkButton(title: "Legg til", height: 44) { m.addInterest(store) }
            }
            Text("«For deg» samler saker som passer interessene dine, rangert av Glimt (lokalt) etter det du leser.")
                .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        }
    }
}
