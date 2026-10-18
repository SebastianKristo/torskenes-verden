import SwiftUI
import UIKit

/* ---------------- Prompt 24: Boliger – data (Boliger.dc.html, claude-code-boliger-lik.md) ----------------
   Leser /finans/api/folders (liste) og /finans/api/folders/:id (detalj) selv, så Boliger-siden kan vise alle
   boligene som piller, toppbildet per bolig og «Rediger bolig» uten å endre Folder-modellen. */

/// De sju fargene i «Rediger bolig» (designet: HC).
enum Bol24Pal {
    static let colors: [String] = ["#2f6b45", "#2b5d8a", "#b23a2a", "#a8661a", "#7a3b6b", "#2e6f75", "#5c5850"]
}

struct Bol24Member: Identifiable, Hashable {
    var id: Int
    var name: String
    var role: String
    var you: Bool

    init(_ o: [String: Any]) {
        id = JS.int(o, "id") ?? 0
        name = JS.str(o, "name") ?? "Ukjent"
        role = JS.str(o, "role") ?? "editor"
        you = JS.bool(o, "you") ?? false
    }

    /// Eier · Kan laste opp · Kan se (designet), lagret som owner / editor / viewer.
    var roleName: String {
        switch role {
        case "owner": return "Eier"
        case "viewer": return "Kan se"
        default: return "Kan laste opp"
        }
    }

    var roleDesc: String {
        switch role {
        case "owner": return "Full tilgang, kan invitere og slette"
        case "viewer": return "Ser oversikt og kvitteringer"
        default: return "Legger til kvitteringer og utgifter"
        }
    }
}

struct Bol24Entry: Identifiable, Hashable {
    var id: Int
    var description: String
    var date: String
    var amount: Double
    var paidBy: String
    var category: String
    var categoryId: Int?
    var color: String
    var status: String
    var pending: Bool
    var receiptId: String
    var aiShort: String

    init(_ o: [String: Any]) {
        id = JS.int(o, "id") ?? 0
        description = JS.str(o, "description") ?? "Utgift"
        date = JS.str(o, "date") ?? ""
        amount = JS.num(o, "amount") ?? 0
        paidBy = JS.str(o, "paidBy") ?? ""
        category = JS.str(o, "category") ?? "Annet"
        categoryId = JS.int(o, "categoryId")
        color = JS.str(o, "color") ?? "#7a7468"
        status = JS.str(o, "status") ?? "ok"
        pending = JS.bool(o, "pending") ?? false
        receiptId = JS.str(o, "receiptId") ?? ""
        aiShort = JS.str(o, "aiShort") ?? ""
    }

    var review: Bool { status == "review" || pending }
    var month: String { String(date.prefix(7)) }
}

struct Bol24Cat: Identifiable, Hashable {
    var id: Int
    var name: String
    var color: String
}

struct Bol24Home: Identifiable, Hashable {
    var id: Int
    var name: String
    var address: String
    var color: String
    var budget: Double?
    var background: String
    var backgroundUrl: String
    var reviewCount: Int
    var role: String
    var autoCat: Bool
    var notify: Bool
    var members: [Bol24Member] = []
    var entries: [Bol24Entry] = []
    var cats: [Bol24Cat] = []
    var detail: Bool = false

    init(_ o: [String: Any], index: Int) {
        id = JS.int(o, "id") ?? 0
        name = JS.str(o, "name") ?? "Bolig"
        address = JS.str(o, "address") ?? ""
        color = JS.str(o, "color") ?? Bol24Pal.colors[index % Bol24Pal.colors.count]
        budget = JS.num(o, "budget")
        background = JS.str(o, "background") ?? ""
        backgroundUrl = JS.str(o, "backgroundUrl") ?? ""
        reviewCount = JS.int(o, "review") ?? 0
        role = JS.str(o, "role") ?? "editor"
        autoCat = JS.bool(o, "autoCat") ?? true
        notify = JS.bool(o, "notify") ?? true
        members = JS.list(o, "members").map { Bol24Member($0) }
        if o["entries"] != nil {
            detail = true
            entries = JS.list(o, "entries").map { Bol24Entry($0) }
            var cs: [Bol24Cat] = []
            for c in JS.list(o, "catTree") where !(JS.bool(c, "sub") ?? false) {
                cs.append(Bol24Cat(id: JS.int(c, "id") ?? 0, name: JS.str(c, "label") ?? "Annet", color: JS.str(c, "color") ?? "#7a7468"))
            }
            cats = cs
        }
    }

    var initial: String { String(name.prefix(1)).uppercased() }
    var canEdit: Bool { role != "viewer" }
    var isOwner: Bool { role == "owner" }

    /// color | preset:stromstad | upload:<id>. Ikke satt: Strømstad i navn eller adresse gir Strømstad-bildet.
    var bgKind: String {
        if !background.isEmpty { return background }
        let t: String = (name + " " + address).lowercased()
        if t.contains("strømstad") || t.contains("stromstad") { return "preset:stromstad" }
        return "color"
    }

    func spent(_ month: String) -> Double {
        entries.filter { $0.month == month && !$0.pending }.reduce(0) { $0 + $1.amount }
    }
}

@MainActor
@Observable
final class Bol24Model {
    static let shared = Bol24Model()
    static let monthNames: [String] = ["Januar", "Februar", "Mars", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Desember"]
    static let monthShort: [String] = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"]

    var homes: [Bol24Home] = []
    var cur: Int? = UserDefaults.standard.object(forKey: "fh_bol24_cur") as? Int {
        didSet { UserDefaults.standard.set(cur, forKey: "fh_bol24_cur") }
    }
    var tab: String = "ov"
    /// Utgifter-fanen: kategorifilter («Alle» eller kategorinavn) og søk.
    var filter: String = "Alle"
    var query: String = ""
    var loaded: Bool = false
    var error: String? = nil
    /// Toppbildet for valgt bolig (nil = vanlig toppbilde) og nøkkelen som styrer krysstoningen.
    var heroImage: UIImage? = nil
    var heroKey: String = ""
    private var uploads: [String: UIImage] = [:]

    var home: Bol24Home? {
        if let c = cur, let h = homes.first(where: { $0.id == c }) { return h }
        return homes.first
    }

    static var thisMonth: String { String(isoDay(Date()).prefix(7)) }

    static func monthKey(_ offset: Int) -> String {
        let d: Date = Calendar.current.date(byAdding: .month, value: offset, to: Date()) ?? Date()
        return String(isoDay(d).prefix(7))
    }

    static func monthIndex(_ key: String) -> Int {
        let parts: [Substring] = key.split(separator: "-")
        guard parts.count >= 2, let m = Int(parts[1]) else { return 0 }
        return Swift.max(0, Swift.min(11, m - 1))
    }

    /// «Strømstad · Leiligheten»: navnene på boligene under tittelen.
    var kicker: String {
        if homes.isEmpty { return "Utgifter, prosjekter og regninger" }
        return homes.map(\.name).joined(separator: " · ")
    }

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.call("GET", "/folders")
            let any: Any? = try? JSONSerialization.jsonObject(with: d)
            var rows: [[String: Any]] = []
            if let list = any as? [Any] { rows = list.compactMap { $0 as? [String: Any] } } else { rows = JS.list(any as? [String: Any], "items") }
            var out: [Bol24Home] = []
            for (i, r) in rows.enumerated() {
                var h: Bol24Home = Bol24Home(r, index: i)
                if let old = homes.first(where: { $0.id == h.id }), old.detail, !h.detail {
                    h.entries = old.entries
                    h.cats = old.cats
                    h.detail = true
                    if h.members.isEmpty { h.members = old.members }
                }
                out.append(h)
            }
            homes = out
            error = nil
        } catch let e as APIError {
            error = e.message
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
        if let c = cur, !homes.contains(where: { $0.id == c }) { cur = homes.first?.id }
        if cur == nil { cur = homes.first?.id }
        store.uploadFolder = home?.id
        await refreshHero(store)
        for h in homes { await loadDetail(h.id, store) }
    }

    func loadDetail(_ id: Int, _ store: Store) async {
        guard let d = try? await store.api.call("GET", "/folders/\(id)") else { return }
        apply(JS.obj(d))
    }

    /// Svaret fra en endring (PATCH/POST gir hele boligen tilbake).
    func apply(_ o: [String: Any]) {
        guard let id = JS.int(o, "id"), let i = homes.firstIndex(where: { $0.id == id }) else { return }
        var h: Bol24Home = Bol24Home(o, index: i)
        if !h.detail {
            h.entries = homes[i].entries
            h.cats = homes[i].cats
            h.detail = homes[i].detail
        }
        if h.background.isEmpty { h.background = homes[i].background }
        if h.backgroundUrl.isEmpty { h.backgroundUrl = homes[i].backgroundUrl }
        homes[i] = h
    }

    func select(_ id: Int, _ store: Store) {
        if cur == id { return }
        Haptics.shared.select()
        cur = id
        store.uploadFolder = id
        Task { await refreshHero(store) }
    }

    /* ---------- Toppbildet ---------- */

    func refreshHero(_ store: Store) async {
        guard let h = home else { setHero(nil, ""); return }
        let kind: String = h.bgKind
        if kind == "preset:stromstad" {
            setHero(UIImage(named: "Stromstad"), "s\(h.id)")
            return
        }
        if kind.hasPrefix("upload:") {
            let key: String = "\(h.id)|\(kind)"
            if let img = uploads[key] { setHero(img, key); return }
            let path: String = h.backgroundUrl.isEmpty ? "/finans/api/folders/\(h.id)/bg" : h.backgroundUrl
            if let d = try? await store.api.bytes(path.hasPrefix("/") ? path : "/" + path), let img = UIImage(data: d) {
                uploads[key] = img
                if home?.id == h.id { setHero(img, key) }
            } else if home?.id == h.id {
                setHero(nil, "c\(h.id)")
            }
            return
        }
        setHero(nil, "c\(h.id)")
    }

    func uploaded(_ id: Int, _ kind: String) -> UIImage? { uploads["\(id)|\(kind)"] }

    func remember(_ id: Int, _ kind: String, _ img: UIImage) { uploads["\(id)|\(kind)"] = img }

    private func setHero(_ img: UIImage?, _ key: String) {
        withAnimation(.easeInOut(duration: 0.2)) {
            heroImage = img
            heroKey = key
        }
    }

    /* ---------- Endringer ---------- */

    func patch(_ id: Int, _ body: [String: Any], _ store: Store, done: String? = nil) async -> Bool {
        do {
            let d: Data = try await store.api.call("PATCH", "/folders/\(id)", json: body)
            apply(JS.obj(d))
            if let done { store.flash(done) }
            await refreshHero(store)
            return true
        } catch {
            store.flash("Kunne ikke lagre: \(error.localizedDescription)")
            return false
        }
    }

    /// Eget bilde: skaleres til 1200 px og sendes som base64 (PUT /folders/:id/bg).
    func uploadBackground(_ id: Int, _ image: UIImage, _ store: Store) async -> Bool {
        let small: UIImage = image.scaled(max: 1200)
        guard let jpg = small.jpegData(compressionQuality: 0.82) else { return false }
        let b64: String = jpg.base64EncodedString()
        let body: [String: Any] = ["image": "data:image/jpeg;base64," + b64, "base64": b64, "mime": "image/jpeg"]
        do {
            let d: Data = try await store.api.call("PUT", "/folders/\(id)/bg", json: body)
            let o: [String: Any] = JS.obj(d)
            let kind: String = JS.str(o, "background") ?? "upload:\(Int(Date().timeIntervalSince1970))"
            if let i = homes.firstIndex(where: { $0.id == id }) {
                homes[i].background = kind
                if let u = JS.str(o, "backgroundUrl") { homes[i].backgroundUrl = u }
            }
            remember(id, kind, small)
            apply(o)
            await refreshHero(store)
            return true
        } catch let e as APIError where e.status == 404 {
            store.flash("Serveren støtter ikke egne bilder ennå. Oppdater homelab.")
            return false
        } catch {
            store.flash("Kunne ikke laste opp bildet: \(error.localizedDescription)")
            return false
        }
    }

    func create(name: String, address: String, budget: Double?, _ store: Store) async {
        do {
            let d: Data = try await store.api.call("POST", "/folders", json: ["name": name, "address": address, "type": "Bolig"])
            let o: [String: Any] = JS.obj(d)
            let id: Int? = JS.int(o, "id")
            if let id, let budget {
                _ = try? await store.api.call("PATCH", "/folders/\(id)", json: ["budget": budget])
            }
            await load(store)
            if let id { select(id, store) }
            tab = "ov"
            store.flash("\(name) er opprettet")
        } catch {
            store.flash("Kunne ikke opprette boligen: \(error.localizedDescription)")
        }
    }

    func delete(_ id: Int, _ store: Store) async {
        do {
            _ = try await store.api.call("DELETE", "/folders/\(id)")
            let name: String = homes.first(where: { $0.id == id })?.name ?? "Boligen"
            homes.removeAll { $0.id == id }
            cur = homes.first?.id
            tab = "ov"
            await refreshHero(store)
            store.flash("\(name) er slettet")
        } catch {
            store.flash("Kunne ikke slette: \(error.localizedDescription)")
        }
    }

    /// Utgift: kategori, status (Godkjenn) eller sletting. Svaret er hele boligen.
    func entry(_ hid: Int, _ eid: Int, _ body: [String: Any], _ store: Store, done: String? = nil) async {
        do {
            let d: Data = try await store.api.call("PATCH", "/folders/\(hid)/entries/\(eid)", json: body)
            apply(JS.obj(d))
            if let done { store.flash(done) }
        } catch {
            store.flash("Kunne ikke lagre: \(error.localizedDescription)")
        }
    }

    func deleteEntry(_ hid: Int, _ eid: Int, _ store: Store) async {
        do {
            let d: Data = try await store.api.call("DELETE", "/folders/\(hid)/entries/\(eid)")
            apply(JS.obj(d))
            store.flash("Utgiften er slettet")
        } catch {
            store.flash("Kunne ikke slette: \(error.localizedDescription)")
        }
    }

    func approveAll(_ hid: Int, _ store: Store) async {
        guard let h = homes.first(where: { $0.id == hid }) else { return }
        let ids: [Int] = h.entries.filter { $0.status == "review" && !$0.pending }.map(\.id)
        for id in ids { _ = try? await store.api.call("PATCH", "/folders/\(hid)/entries/\(id)", json: ["status": "ok"]) }
        await loadDetail(hid, store)
        store.flash("Alle er godkjent")
    }

    func addEntry(_ hid: Int, text: String, amount: Double, categoryId: Int?, _ store: Store) async {
        var body: [String: Any] = ["description": text, "amount": amount]
        if let categoryId { body["categoryId"] = categoryId }
        do {
            let d: Data = try await store.api.call("POST", "/folders/\(hid)/entries", json: body)
            apply(JS.obj(d))
            store.flash("Lagt til i \(homes.first(where: { $0.id == hid })?.name ?? "boligen")")
        } catch {
            store.flash("Kunne ikke legge til: \(error.localizedDescription)")
        }
    }

    func setRole(_ hid: Int, _ mid: Int, _ role: String, _ store: Store) async {
        do {
            let d: Data = try await store.api.call("PATCH", "/folders/\(hid)/members/\(mid)", json: ["role": role])
            apply(JS.obj(d))
        } catch {
            store.flash("Kunne ikke endre rollen: \(error.localizedDescription)")
        }
    }

    func removeMember(_ hid: Int, _ m: Bol24Member, _ store: Store) async {
        do {
            let d: Data = try await store.api.call("DELETE", "/folders/\(hid)/members/\(m.id)")
            apply(JS.obj(d))
            store.flash("\(m.name) har ikke lenger tilgang")
        } catch {
            store.flash("Kunne ikke fjerne: \(error.localizedDescription)")
        }
    }

    func invite(_ hid: Int, _ who: String, role: String, _ store: Store) async {
        do {
            let d: Data
            do {
                d = try await store.api.call("POST", "/folders/\(hid)/members", json: ["username": who, "role": role])
            } catch let e as APIError where e.status == 400 {
                // Ingen bruker med det navnet: legg til en navngitt person (eldre /invite).
                d = try await store.api.call("POST", "/folders/\(hid)/invite", json: ["members": [who]])
            }
            apply(JS.obj(d))
            store.flash("Invitasjon sendt til \(who)")
        } catch {
            store.flash("Kunne ikke invitere: \(error.localizedDescription)")
        }
    }
}

/// Beløp som i designet: «13 890 kr».
func bol24kr(_ v: Double) -> String { neg0(v) + " kr" }
