import SwiftUI
import UIKit

/* ---------------- Prompt 76 (SKJIOS): Skjold Lab – sorteringssystem for deler ----------------
 Kontrakt: CONTRACT76.md. Skap med sorteringsskuffer (Hovedskap 12 rader × 5 skuffer, Raaco 150-01), deler med bilde,
 antall, specs og plassering «Hovedskap · Rad 4 · Skuff 2 · Rom 1». Rad 1 er øverst og skuff 1 til venstre (kort «4-2»).
 Server (SKJSRV, server/skjold76), alt per bruker, under /api/skjold:
   GET /cabinets · POST /cabinets · PATCH/DELETE /cabinets/:id (409 med deler, ?move=<id|none>)
   POST /cabinets/:id/photo (multipart file) · PUT /cabinets/:id/corners {tl,tr,br,bl} · DELETE /cabinets/:id/photo
   GET /cabinets/:id/map · PUT /cabinets/:id/drawers/:row/:col {label,compartments,color}
   GET /parts?q=&category=&cabinet=&row=&col=&low=1&limit=&offset= → {items, total} · GET/POST/PATCH/DELETE /parts(/:id)
   POST /parts/:id/restore · POST /parts/:id/move → {occupied} · POST /parts/:id/qty {delta|set}
   POST /parts/:id/photos (multipart) · DELETE /parts/:id/photos/:n · GET /files/:name (eier-sjekk, med app-token)
   GET /categories · GET /suggest?q= · GET /free · GET /labels?cabinet= (HTML for utskrift)
 Offline: siste svar (liste, skap og kart) caches i Caches/skjold76 per konto, så søk virker uten nett. Endringer krever nett. */

struct Skj76Spec: Identifiable, Hashable {
    var id: UUID = UUID()
    var k: String
    var v: String
}

struct Skj76Photo: Hashable {
    var url: String
    var thumb: String
}

struct Skj76Loc: Hashable {
    var cabinetId: String
    var cabinet: String
    var row: Int
    var col: Int
    var comp: Int?
    var text: String

    /// «4-2»
    var short: String { "\(row)-\(col)" }
}

struct Skj76Part: Identifiable, Hashable {
    var id: String
    var name: String = ""
    var category: String = ""
    var desc: String = ""
    var specs: [Skj76Spec] = []
    var qty: Double = 0
    var unit: String = "stk"
    var minQty: Double = 0
    var tags: [String] = []
    var loc: Skj76Loc? = nil
    var thumbUrl: String = ""
    var photos: [Skj76Photo] = []
    var url: String = ""
    var price: Double? = nil
    var supplier: String = ""

    var low: Bool { minQty > 0 && qty <= minQty }
    var qtyText: String { Skjold76.num(qty) + " " + unit }
    var specLine: String { specs.map { $0.v }.filter { !$0.isEmpty }.joined(separator: " · ") }
    var locText: String { loc?.text ?? "Uten plass" }
}

struct Skj76Cabinet: Identifiable, Hashable {
    var id: String
    var name: String = "Skap"
    var rows: Int = 12
    var cols: Int = 5
    var kind: String = "kjøpt"
    var photoUrl: String = ""
    var thumbUrl: String = ""
    /// tl, tr, br, bl normalisert 0–1 (tom = ingen hjørner).
    var corners: [CGPoint] = []
    var parts: Int = 0
    var used: Int = 0
}

/// Én hendelse i historikken (opprettet, flyttet, antall, endret, slettet).
struct Skj76Hist: Identifiable, Hashable {
    var id: String
    var action: String
    var at: Date?
    var text: String
}

/// Forslag i søkefeltet: en del (åpnes direkte) eller en kategori/tekst.
struct Skj76Suggest: Hashable {
    var text: String
    var sub: String = ""
    var partId: String = ""
}

struct Skj76Cat: Identifiable, Hashable {
    var id: String
    var count: Int
}

struct Skj76Mini: Identifiable, Hashable {
    var id: String
    var name: String
    var thumbUrl: String
    var qty: Double
}

struct Skj76Drawer: Hashable {
    var row: Int
    var col: Int
    var label: String = ""
    var comps: Int = 1
    var color: String = ""
    var count: Int = 0
    var parts: [Skj76Mini] = []

    /// Etiketten, ellers standard «R4·S2».
    var title: String { label.isEmpty ? "R\(row)·S\(col)" : label }
}

struct Skj76Map: Hashable {
    var rows: Int
    var cols: Int
    var drawers: [String: Skj76Drawer] = [:]

    func drawer(_ r: Int, _ c: Int) -> Skj76Drawer { drawers["\(r)-\(c)"] ?? Skj76Drawer(row: r, col: c) }
}

/// Én av arkene på Skjold Lab-siden (ett ark om gangen).
enum Skj76Sheet: Identifiable, Hashable {
    case part(String)
    case edit(String)
    case move(String)
    case setup(String)
    case drawer(String, Int, Int)
    case labels(String)
    /// Prompt 77: «Rydd opp med Glimt» (tom = alle delene) og Glimt-innstillingene (⚙).
    case tidy([String])
    case ai
    /// Prompt 78: LED-oppsett for et skap og kalibreringsveiviseren (Skjold78*.swift).
    case leds(String)
    case calibrate(String)

    var id: String {
        switch self {
        case .part(let i): return "p" + i
        case .edit(let i): return "e" + i
        case .move(let i): return "m" + i
        case .setup(let i): return "s" + i
        case .drawer(let c, let r, let k): return "d\(c)-\(r)-\(k)"
        case .labels(let c): return "l" + c
        case .tidy(let ids): return "t\(ids.count)-" + (ids.first ?? "")
        case .ai: return "ai"
        case .leds(let c): return "led" + c
        case .calibrate(let c): return "kal" + c
        }
    }
}

@MainActor
@Observable
final class Skjold76 {
    static let shared = Skjold76()

    var open: Bool = false
    var cabinets: [Skj76Cabinet] = []
    var cabinetId: String = ""
    var maps: [String: Skj76Map] = [:]
    var query: String = ""
    var suggestions: [Skj76Suggest] = []
    var items: [Skj76Part] = []
    var total: Int = 0
    var category: String = ""
    var lowOnly: Bool = false
    var categories: [Skj76Cat] = []
    var loading: Bool = false
    var offline: Bool = false
    var missing: Bool = false
    var toast: String = ""
    var undoText: String = ""
    var sheet: Skj76Sheet? = nil
    /// Delen som er uthevet i tegningen (siste trykk eller søketreff).
    var focus: Skj76Loc? = nil
    /// Øker ved hver ny utheving, så pulsen starter på nytt.
    var pulse: Int = 0
    /// «Tegning» eller «Bilde».
    var photoMode: Bool = false
    var details: [String: Skj76Part] = [:]
    var history: [String: [Skj76Hist]] = [:]
    /// Plassering for «Ny del i denne skuffen».
    var preset: Skj76Loc? = nil
    @ObservationIgnored private var searchTask: Task<Void, Never>? = nil
    @ObservationIgnored private var undoTask: Task<Void, Never>? = nil
    @ObservationIgnored private var undoAction: (() -> Void)? = nil
    @ObservationIgnored private var all: [Skj76Part] = []

    nonisolated static let prefix: String = "/api"
    nonisolated static let root: String = "/skjold"
    nonisolated static let netMsg: String = "Endringer krever nett. Prøv igjen når du er tilkoblet."

    var cabinet: Skj76Cabinet? { cabinets.first { $0.id == cabinetId } ?? cabinets.first }
    var merSub: String {
        if cabinets.isEmpty { return "Deler, skuffer og skap" }
        let n: Int = cabinets.reduce(0) { $0 + $1.parts }
        return n == 1 ? "1 del i \(cabinets.count) skap" : "\(n) deler i \(cabinets.count) skap"
    }

    func show(part: String? = nil) {
        Haptics.shared.tap()
        open = true
        if let part, !part.isEmpty { sheet = .part(part) }
    }

    /// finanshub://skjold, …/del/<id> (Glimt-kort og felles søk) og …/skap/<id>/4-2 (QR på etikettene).
    func link(_ url: URL) {
        let parts: [String] = url.pathComponents.filter { $0 != "/" }
        let kind: String = parts.first?.lowercased() ?? ""
        if kind == "del", parts.count > 1 { show(part: parts[1]); return }
        if kind == "skap", parts.count > 1 {
            show()
            cabinetId = parts[1]
            let rc: [Int] = (parts.count > 2 ? parts[2] : "").split(separator: "-").compactMap { Int($0) }
            if rc.count == 2 { sheet = .drawer(parts[1], rc[0], rc[1]) }
            return
        }
        show(part: kind.isEmpty ? nil : parts.first)
    }

    /* ---------- Lasting ---------- */

    func load(_ store: Store) async {
        await loadCabinets(store)
        await loadCategories(store)
        await search(store)
        if let c = cabinet { await loadMap(c.id, store) }
    }

    func loadCabinets(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "GET", Skjold76.root + "/cabinets", timeout: 15)
            Skj76Cache.put("cabinets", d)
            apply(cabinets: d)
            offline = false
            missing = false
        } catch let e as APIError where e.status == 404 {
            missing = true
        } catch {
            if let d = Skj76Cache.get("cabinets") { apply(cabinets: d) }
            offline = true
        }
    }

    private func apply(cabinets d: Data) {
        cabinets = Skjold76.rows(d, "items").map { Skjold76.cabinet($0) }
        if cabinet?.id != cabinetId { cabinetId = cabinets.first?.id ?? "" }
    }

    func loadMap(_ id: String, _ store: Store) async {
        if id.isEmpty { return }
        let path: String = Skjold76.root + "/cabinets/\(id)/map"
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "GET", path, timeout: 15)
            Skj76Cache.put("map-" + id, d)
            maps[id] = Skjold76.map(JS.obj(d))
        } catch {
            if let d = Skj76Cache.get("map-" + id) { maps[id] = Skjold76.map(JS.obj(d)) }
        }
    }

    func loadCategories(_ store: Store) async {
        guard let d = try? await store.api.callAt(Skjold76.prefix, "GET", Skjold76.root + "/categories", timeout: 15) else { return }
        categories = Skjold76.rows(d, "items").map { (o: [String: Any]) -> Skj76Cat in
            Skj76Cat(id: JS.str(o, "category") ?? JS.str(o, "name") ?? "", count: JS.int(o, "count") ?? JS.int(o, "n") ?? 0)
        }.filter { !$0.id.isEmpty }
    }

    /* ---------- Søk ---------- */

    func typed(_ store: Store) {
        searchTask?.cancel()
        searchTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 220_000_000)
            if Task.isCancelled { return }
            await self.suggest(store)
            await self.search(store)
        }
    }

    func suggest(_ store: Store) async {
        let q: String = query.trimmingCharacters(in: .whitespaces)
        if q.isEmpty { suggestions = []; return }
        let path: String = Skjold76.root + "/suggest?q=" + Skjold76.enc(q)
        guard let d = try? await store.api.callAt(Skjold76.prefix, "GET", path, timeout: 8) else {
            suggestions = Array(Skjold76.local(all, q).prefix(8).map { Skj76Suggest(text: $0.name, sub: $0.locText, partId: $0.id) })
            return
        }
        let raw: Any? = try? JSONSerialization.jsonObject(with: d)
        let list: [Any] = (raw as? [Any]) ?? ((raw as? [String: Any])?["items"] as? [Any]) ?? []
        suggestions = Array(list.compactMap { Skjold76.suggestText($0) }.prefix(8))
    }

    func search(_ store: Store) async {
        loading = true
        defer { loading = false }
        let q: String = query.trimmingCharacters(in: .whitespaces)
        var path: String = Skjold76.root + "/parts?limit=500"
        if !q.isEmpty { path += "&q=" + Skjold76.enc(q) }
        if !category.isEmpty { path += "&category=" + Skjold76.enc(category) }
        if lowOnly { path += "&low=1" }
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "GET", path, timeout: 15)
            let o: [String: Any] = JS.obj(d)
            items = JS.list(o, "items").map { Skjold76.part($0) }
            total = JS.int(o, "total") ?? items.count
            // Beste treff utheves i tegningen mens man skriver.
            if !q.isEmpty, let l = items.first?.loc { highlight(l) }
            if q.isEmpty && category.isEmpty && !lowOnly {
                Skj76Cache.put("parts", d)
                all = items
            }
            offline = false
        } catch let e as APIError where e.status == 404 {
            missing = true
        } catch {
            offline = true
            searchOffline()
        }
    }

    /// Uten nett: søk i siste hentede liste.
    func searchOffline() {
        if all.isEmpty, let d = Skj76Cache.get("parts") {
            all = JS.list(JS.obj(d), "items").map { Skjold76.part($0) }
        }
        var list: [Skj76Part] = query.isEmpty ? all : Skjold76.local(all, query)
        if !category.isEmpty { list = list.filter { $0.category == category } }
        if lowOnly { list = list.filter { $0.low } }
        items = list
        total = list.count
    }

    /// Lokalt søk: små/store bokstaver og æøå likt, prefiks per ord, «10k» treffer «10kΩ» og «10 k».
    nonisolated static func local(_ list: [Skj76Part], _ q: String) -> [Skj76Part] {
        let words: [String] = fold(q).split(separator: " ").map(String.init)
        if words.isEmpty { return list }
        let hits: [Skj76Part] = list.filter { (p: Skj76Part) -> Bool in
            let hay: String = fold(hayText(p))
            let tight: String = hay.replacingOccurrences(of: " ", with: "")
            return words.allSatisfy { hay.contains($0) || tight.contains($0) }
        }
        let first: String = fold(q)
        return hits.sorted { (a: Skj76Part, b: Skj76Part) -> Bool in rank(a, first) < rank(b, first) }
    }

    nonisolated static func rank(_ p: Skj76Part, _ q: String) -> Int {
        let n: String = fold(p.name)
        if n == q { return 0 }
        if n.hasPrefix(q) { return 1 }
        return 2
    }

    nonisolated static func hayText(_ p: Skj76Part) -> String {
        let specs: String = p.specs.map { $0.k + " " + $0.v }.joined(separator: " ")
        return [p.name, p.category, p.desc, specs, p.tags.joined(separator: " "), p.locText].joined(separator: " ")
    }

    nonisolated static func fold(_ s: String) -> String {
        let l: String = s.lowercased()
            .replacingOccurrences(of: "æ", with: "ae").replacingOccurrences(of: "ø", with: "o").replacingOccurrences(of: "å", with: "a")
        return l.folding(options: [.diacriticInsensitive], locale: Locale(identifier: "nb_NO"))
    }

    /* ---------- Del ---------- */

    func part(_ id: String) -> Skj76Part? { details[id] ?? items.first { $0.id == id } ?? all.first { $0.id == id } }

    func loadPart(_ id: String, _ store: Store) async {
        guard let d = try? await store.api.callAt(Skjold76.prefix, "GET", Skjold76.root + "/parts/\(id)", timeout: 15) else { return }
        let o: [String: Any] = JS.obj(d)
        let x: Skj76Part = Skjold76.part(JS.dict(o, "part") ?? JS.dict(o, "item") ?? o)
        details[id] = x
        history[id] = JS.list(o, "history").map { Skjold76.hist($0) }
        replace(x)
    }

    /// Angrer én hendelse (POST /history/:id/undo).
    func undoHistory(_ h: Skj76Hist, part id: String, _ store: Store) async {
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/history/\(h.id)/undo", json: [:], timeout: 15)
            Haptics.shared.success()
            flash("Angret")
            await loadPart(id, store)
            await refresh(store)
        } catch { fail(error) }
    }

    private func replace(_ x: Skj76Part) {
        if let i = items.firstIndex(where: { $0.id == x.id }) { items[i] = x }
        if let i = all.firstIndex(where: { $0.id == x.id }) { all[i] = x }
        details[x.id] = x
    }

    /// Velger delen: uthever skuffen i tegningen og åpner detaljen.
    func pick(_ p: Skj76Part) {
        Haptics.shared.tap()
        if let l = p.loc { highlight(l) }
        sheet = .part(p.id)
    }

    func highlight(_ l: Skj76Loc) {
        if !l.cabinetId.isEmpty { cabinetId = l.cabinetId }
        focus = l
        pulse += 1
    }

    /// Lagrer ny eller endret del. Svarer med id-en, eller nil ved feil.
    func save(_ id: String, _ body: [String: Any], _ store: Store) async -> String? {
        let method: String = id.isEmpty ? "POST" : "PATCH"
        let path: String = Skjold76.root + "/parts" + (id.isEmpty ? "" : "/\(id)")
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, method, path, json: body, timeout: 20)
            let o: [String: Any] = JS.obj(d)
            let x: Skj76Part = Skjold76.part(JS.dict(o, "part") ?? JS.dict(o, "item") ?? o)
            replace(x)
            Haptics.shared.success()
            flash(id.isEmpty ? "Delen er lagt til" : "Endringene er lagret")
            await refresh(store)
            return x.id.isEmpty ? id : x.id
        } catch {
            fail(error)
            return nil
        }
    }

    func qty(_ p: Skj76Part, delta: Double, _ store: Store) {
        var x: Skj76Part = p
        x.qty = Swift.max(0, p.qty + delta)
        replace(x)
        Haptics.shared.tick()
        let shown: Skj76Part = x
        Task { @MainActor in
            do {
                let d: Data = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/parts/\(p.id)/qty", json: ["delta": delta], timeout: 15)
                let o: [String: Any] = JS.obj(d)
                if let pd = JS.dict(o, "part") {
                    self.replace(Skjold76.part(pd))
                } else if let q = JS.num(o, "qty") {
                    var y: Skj76Part = shown
                    y.qty = q
                    self.replace(y)
                }
            } catch {
                self.replace(p)
                self.fail(error)
            }
        }
    }

    /// Flytter delen. Angre i 10 s flytter den tilbake.
    func move(_ p: Skj76Part, to l: Skj76Loc, _ store: Store) async {
        let from: Skj76Loc? = p.loc
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/parts/\(p.id)/move", json: Skjold76.locBody(l), timeout: 15)
            let o: [String: Any] = JS.obj(d)
            let others: [String] = JS.list(o, "occupied").compactMap { JS.str($0, "name") }
            Haptics.shared.success()
            highlight(l)
            let msg: String = "Flyttet til " + l.short + (others.isEmpty ? "" : " · deler skuff med " + others.prefix(2).joined(separator: ", "))
            offerUndo(msg) { [weak self] in
                guard let self else { return }
                Task { @MainActor in await self.moveBack(p.id, from, store) }
            }
            await loadPart(p.id, store)
            await refresh(store)
        } catch {
            fail(error)
        }
    }

    private func moveBack(_ id: String, _ from: Skj76Loc?, _ store: Store) async {
        let body: [String: Any] = from.map { Skjold76.locBody($0) } ?? ["cabinetId": NSNull(), "row": NSNull(), "col": NSNull(), "compartment": NSNull()]
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/parts/\(id)/move", json: body, timeout: 15)
            if let from { highlight(from) }
            flash("Flyttingen er angret")
            await loadPart(id, store)
            await refresh(store)
        } catch { fail(error) }
    }

    /// Fjerner plasseringen («Uten plass»).
    func unplace(_ p: Skj76Part, _ store: Store) async {
        let body: [String: Any] = ["cabinetId": NSNull(), "row": NSNull(), "col": NSNull(), "compartment": NSNull()]
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/parts/\(p.id)/move", json: body, timeout: 15)
            focus = nil
            await loadPart(p.id, store)
            await refresh(store)
        } catch { fail(error) }
    }

    /// Myk sletting (30 dager på serveren). Angre i 10 s.
    func delete(_ p: Skj76Part, _ store: Store) async {
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "DELETE", Skjold76.root + "/parts/\(p.id)", timeout: 15)
            Haptics.shared.warning()
            items.removeAll { $0.id == p.id }
            all.removeAll { $0.id == p.id }
            sheet = nil
            offerUndo("«" + p.name + "» er slettet") { [weak self] in
                guard let self else { return }
                Task { @MainActor in
                    _ = try? await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/parts/\(p.id)/restore", json: [:], timeout: 15)
                    self.flash("Delen er tilbake")
                    await self.refresh(store)
                }
            }
            await refresh(store)
        } catch { fail(error) }
    }

    func refresh(_ store: Store) async {
        await search(store)
        await loadCabinets(store)
        await loadCategories(store)
        if let c = cabinet { await loadMap(c.id, store) }
    }

    /// Første tomme skuff (GET /free), helst i valgt skap.
    func free(_ prefer: String, _ store: Store) async -> Skj76Loc? {
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "GET", Skjold76.root + "/free", timeout: 15)
            let rows: [[String: Any]] = Skjold76.rows(d, "items")
            let mine: [[String: Any]] = rows.filter { (JS.str($0, "cabinetId") ?? JS.str($0, "id") ?? "") == prefer }
            for c in mine + rows {
                if let l = Skjold76.firstFree(c) { return l }
            }
            flash("Ingen ledige skuffer")
        } catch { fail(error) }
        return nil
    }

    nonisolated static func firstFree(_ c: [String: Any]) -> Skj76Loc? {
        let cid: String = JS.str(c, "cabinetId") ?? JS.str(c, "id") ?? ""
        let name: String = JS.str(c, "name") ?? JS.str(c, "cabinet") ?? "Skap"
        let list: [[String: Any]] = JS.list(c, "free") + JS.list(c, "drawers") + JS.list(c, "empty")
        guard let f = list.first, let r = JS.int(f, "row"), let k = JS.int(f, "col") else { return nil }
        return Skj76Loc(cabinetId: cid, cabinet: name, row: r, col: k, comp: nil, text: name + " · Rad \(r) · Skuff \(k)")
    }

    /* ---------- Bilder ---------- */

    func uploadPartPhoto(_ id: String, _ img: UIImage, _ store: Store) async {
        guard let data = Skjold76.jpeg(img) else { return }
        do {
            let part: API.Part = API.Part(name: "file", filename: "del.jpg", mime: "image/jpeg", data: data)
            _ = try await store.api.upload(Skjold76.root + "/parts/\(id)/photos", parts: [part], prefix: Skjold76.prefix, timeout: 90)
            Haptics.shared.success()
            await loadPart(id, store)
        } catch { fail(error) }
    }

    func deletePartPhoto(_ id: String, _ n: Int, _ store: Store) async {
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "DELETE", Skjold76.root + "/parts/\(id)/photos/\(n)", timeout: 15)
            await loadPart(id, store)
        } catch { fail(error) }
    }

    /// Nedskalert JPEG (maks 1600 px) før opplasting; serveren striper EXIF og lager miniatyr.
    nonisolated static func jpeg(_ img: UIImage) -> Data? {
        let side: CGFloat = Swift.max(img.size.width, img.size.height)
        let s: CGFloat = side > 1600 ? 1600 / side : 1
        let size: CGSize = CGSize(width: (img.size.width * s).rounded(), height: (img.size.height * s).rounded())
        let fmt: UIGraphicsImageRendererFormat = UIGraphicsImageRendererFormat()
        fmt.scale = 1
        let out: UIImage = UIGraphicsImageRenderer(size: size, format: fmt).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
        return out.jpegData(compressionQuality: 0.85)
    }

    /* ---------- Melding og angre ---------- */

    func flash(_ t: String) {
        toast = t
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if self.toast == t { self.toast = "" }
        }
    }

    func fail(_ e: Error) {
        Haptics.shared.warning()
        if let a = e as? APIError, a.status == 0 { flash(Skjold76.netMsg); return }
        flash((e as? APIError)?.message ?? e.localizedDescription)
    }

    func offerUndo(_ text: String, _ act: @escaping () -> Void) {
        undoTask?.cancel()
        undoText = text
        undoAction = act
        undoTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 10_000_000_000)
            if Task.isCancelled { return }
            self.undoText = ""
            self.undoAction = nil
        }
    }

    func undo() {
        undoTask?.cancel()
        let a: (() -> Void)? = undoAction
        undoAction = nil
        undoText = ""
        a?()
    }
}
