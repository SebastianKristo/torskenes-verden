import SwiftUI
import UIKit

/* ---------------- Prompt 51 (IOSFEAT51): Finans → Planlegging – data ----------------
 Server: /finans/api/fin51/… ($S/SERVER51-API.md, FIN51). Web-fasit: public/finans/js/plan51.js.
 Fanene: Sparemål (med «rund opp») · Kalender (faste utgifter + saldoprognose dag for dag) · Skatt (fradragsposter, eksport) ·
 Priser (prishistorikk fra kvitteringslinjer, billigste butikk) · Abonnementsjeger (prisøkning, doble, ubrukte, oppsigelsestekst).
 Åpnes fra Finans → Mer → Planlegging, dyplenken finanshub://planlegging[/spar|kal|skatt|pris|jakt] og varsler med /finans/plan51. */

struct Goal51: Identifiable {
    let id: Int
    var name: String = ""
    var color: String = "#2f7a4f"
    var note: String = ""
    var target: Double = 0
    var saved: Double = 0
    var pct: Double = 0
    var deadline: String = ""
    var deadlineLabel: String = ""
    var status: String = "no_deadline"
    var statusText: String = ""
    var pace: Double = 0
    var perMonth: Double = 0
    var accountId: Int? = nil
    var account: String = ""
    var followsAccount: Bool = false
    var imageUrl: String = ""

    nonisolated static func parse(_ o: [String: Any]) -> Goal51 {
        var g: Goal51 = Goal51(id: JS.int(o, "id") ?? 0)
        g.name = JS.str(o, "name") ?? ""
        g.color = JS.str(o, "color") ?? "#2f7a4f"
        g.note = JS.str(o, "note") ?? ""
        g.target = JS.num(o, "target") ?? 0
        g.saved = JS.num(o, "saved") ?? 0
        g.pct = JS.num(o, "pct") ?? 0
        g.deadline = JS.str(o, "deadline") ?? ""
        g.deadlineLabel = JS.str(o, "deadlineLabel") ?? ""
        g.status = JS.str(o, "status") ?? "no_deadline"
        g.statusText = JS.str(o, "statusText") ?? ""
        g.pace = JS.num(o, "pace") ?? 0
        g.perMonth = JS.num(o, "perMonth") ?? 0
        g.accountId = JS.int(o, "accountId")
        g.account = JS.str(o, "account") ?? ""
        g.followsAccount = JS.bool(o, "followsAccount") ?? false
        g.imageUrl = JS.str(o, "imageUrl") ?? ""
        return g
    }

    var statusLabel: (String, F51Tone) {
        switch status {
        case "done": return ("Nådd", .ok)
        case "on_track": return ("I rute", .ok)
        case "behind": return ("Bak skjema", .warn)
        case "overdue": return ("Fristen er ute", .warn)
        default: return ("Uten frist", .mut)
        }
    }
}

struct RoundUp51 {
    var step: Int = 10
    var steps: [Int] = [5, 10, 20, 50, 100]
    var from: String = ""
    var until: String = ""
    var count: Int = 0
    var amount: Double = 0
    var text: String = ""
    var goalId: Int? = nil
    var sample: [Sample51] = []

    struct Sample51: Identifiable {
        let id: Int
        let date: String
        let name: String
        let amount: Double
        let roundUp: Double
    }

    nonisolated static func parse(_ o: [String: Any]?) -> RoundUp51 {
        var r: RoundUp51 = RoundUp51()
        guard let o else { return r }
        r.step = JS.int(o, "step") ?? 10
        let st: [Int] = ((o["steps"] as? [Any]) ?? []).compactMap { ($0 as? NSNumber)?.intValue }
        if !st.isEmpty { r.steps = st }
        r.from = JS.str(o, "from") ?? ""
        r.until = JS.str(o, "until") ?? ""
        r.count = JS.int(o, "count") ?? 0
        r.amount = JS.num(o, "amount") ?? 0
        r.text = JS.str(o, "text") ?? ""
        r.goalId = JS.int(o, "goalId")
        r.sample = JS.list(o, "sample").enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Sample51 in
            let s: [String: Any] = pair.element
            return Sample51(id: pair.offset, date: JS.str(s, "date") ?? "", name: JS.str(s, "name") ?? "",
                            amount: JS.num(s, "amount") ?? 0, roundUp: JS.num(s, "roundUp") ?? 0)
        }
        return r
    }
}

struct Acc51: Identifiable {
    let id: Int
    let name: String
    let type: String
    let balance: Double
}

struct Goals51 {
    var items: [Goal51] = []
    var saved: Double = 0
    var target: Double = 0
    var pct: Double = 0
    var roundUp: RoundUp51 = RoundUp51()
    var accounts: [Acc51] = []

    nonisolated static func parse(_ o: [String: Any]) -> Goals51 {
        var g: Goals51 = Goals51()
        g.items = JS.list(o, "items").map { Goal51.parse($0) }
        let t: [String: Any]? = JS.dict(o, "totals")
        g.saved = JS.num(t, "saved") ?? 0
        g.target = JS.num(t, "target") ?? 0
        g.pct = JS.num(t, "pct") ?? 0
        g.roundUp = RoundUp51.parse(JS.dict(o, "roundUp"))
        g.accounts = JS.list(o, "accounts").map { (a: [String: Any]) -> Acc51 in
            Acc51(id: JS.int(a, "id") ?? 0, name: JS.str(a, "name") ?? "", type: JS.str(a, "type") ?? "", balance: JS.num(a, "balance") ?? 0)
        }
        return g
    }
}

/* ---------- Kalender ---------- */

struct CalItem51: Identifiable {
    let id: Int
    let date: String
    let kind: String
    let name: String
    let amount: Double
    let accountId: Int?
    let account: String

    var kindLabel: String {
        switch kind {
        case "sub": return "Abonnement"
        case "recurring": return "Fast utgift"
        case "detected": return "Funnet"
        case "income": return "Inntekt"
        default: return ""
        }
    }
}

struct CalDay51: Identifiable {
    var id: String { date }
    let date: String
    let label: String
    let today: Bool
    let items: [CalItem51]
}

struct CalAcc51: Identifiable {
    let id: Int
    let name: String
    let type: String
    let start: Double
    let end: Double
    let series: [(String, Double)]
}

struct Cal51 {
    var from: String = ""
    var to: String = ""
    var days: [CalDay51] = []
    var accounts: [CalAcc51] = []
    var out: Double = 0
    var inn: Double = 0
    var count: Int = 0
    var lowestText: String = ""
    var lowestNeg: Bool = false
    var warnings: [String] = []
    var unassigned: String = ""

    nonisolated static func parse(_ o: [String: Any]) -> Cal51 {
        var c: Cal51 = Cal51()
        c.from = JS.str(o, "from") ?? ""
        c.to = JS.str(o, "to") ?? ""
        var n: Int = 0
        c.days = JS.list(o, "days").map { (d: [String: Any]) -> CalDay51 in
            let its: [CalItem51] = JS.list(d, "items").map { (i: [String: Any]) -> CalItem51 in
                n += 1
                return CalItem51(id: n, date: JS.str(i, "date") ?? "", kind: JS.str(i, "kind") ?? "", name: JS.str(i, "name") ?? "",
                                 amount: JS.num(i, "amount") ?? 0, accountId: JS.int(i, "accountId"), account: JS.str(i, "account") ?? "")
            }
            return CalDay51(date: JS.str(d, "date") ?? "", label: JS.str(d, "label") ?? "", today: JS.bool(d, "today") ?? false, items: its)
        }
        c.accounts = JS.list(o, "accounts").map { (a: [String: Any]) -> CalAcc51 in
            let s: [(String, Double)] = JS.list(a, "series").map { (JS.str($0, "date") ?? "", JS.num($0, "balance") ?? 0) }
            return CalAcc51(id: JS.int(a, "id") ?? 0, name: JS.str(a, "name") ?? "", type: JS.str(a, "type") ?? "",
                            start: JS.num(a, "start") ?? 0, end: JS.num(a, "end") ?? 0, series: s)
        }
        let t: [String: Any]? = JS.dict(o, "total")
        c.out = JS.num(t, "out") ?? 0
        c.inn = JS.num(t, "in") ?? 0
        c.count = JS.int(t, "count") ?? 0
        if let l = JS.dict(o, "lowest") {
            let b: Double = JS.num(l, "balance") ?? 0
            c.lowestNeg = b < 0
            let accName: String = JS.str(l, "account") ?? ""
            let when: String = F51.dl(JS.str(l, "date"))
            let tail: String = accName.isEmpty ? "" : " (" + accName + ")"
            c.lowestText = "Lavest " + F51.kr(b) + " " + when + tail
        }
        c.warnings = JS.strings(o, "warnings")
        c.unassigned = JS.str(JS.dict(o, "unassigned"), "text") ?? ""
        return c
    }

    /// Saldo dag for dag for valgt konto, eller summen av alle unntatt kredittkort.
    func series(_ acc: Int?) -> [(String, Double)] {
        if let acc, let a = accounts.first(where: { $0.id == acc }) { return a.series }
        let use: [CalAcc51] = accounts.filter { $0.type != "credit" }
        guard let first = accounts.first else { return [] }
        return first.series.enumerated().map { (pair: (offset: Int, element: (String, Double))) -> (String, Double) in
            let i: Int = pair.offset
            let sum: Double = use.reduce(0) { (s: Double, a: CalAcc51) -> Double in s + (i < a.series.count ? a.series[i].1 : 0) }
            return (pair.element.0, sum)
        }
    }

    func start(_ acc: Int?) -> Double {
        if let acc, let a = accounts.first(where: { $0.id == acc }) { return a.start }
        return accounts.filter { $0.type != "credit" }.reduce(0) { $0 + $1.start }
    }
}

/* ---------- Skatt ---------- */

struct TaxItem51: Identifiable {
    var id: String { key }
    let key: String
    let title: String
    let kind: String
    let basis: Double
    let deduction: Double
    let value: Double
    let source: String
    let note: String
    let missing: String
    let orgs: String
    let sources: [(String, String, Double)]

    var sourceLabel: (String, F51Tone) {
        switch source {
        case "transaksjoner": return ("Fra transaksjonene", .ok)
        case "registrert": return ("Registrert av deg", .ok)
        case "anslag": return ("Anslag", .warn)
        default: return ("Ikke funnet", .mut)
        }
    }
}

struct Tax51 {
    var year: Int = 0
    var items: [TaxItem51] = []
    var deduction: Double = 0
    var value: Double = 0
    var reminder: String = ""
    var reminderUrl: String = ""
    var disclaimer: String = ""
    var ratesNote: String = ""
    var profile: [String: Any] = [:]

    nonisolated static func parse(_ o: [String: Any]) -> Tax51 {
        var t: Tax51 = Tax51()
        t.year = JS.int(o, "year") ?? 0
        t.items = JS.list(o, "items").map { (i: [String: Any]) -> TaxItem51 in
            let orgs: String = JS.list(i, "orgs").map { (g: [String: Any]) -> String in
                let counts: Bool = JS.bool(g, "counts") ?? true
                let org: String = JS.str(g, "org") ?? ""
                let amt: String = F51.kr(JS.num(g, "amount") ?? 0)
                let tail: String = counts ? "" : " (under 500 kr)"
                return org + " " + amt + tail
            }.joined(separator: " · ")
            let src: [(String, String, Double)] = JS.list(i, "sources").map { (JS.str($0, "date") ?? "", JS.str($0, "name") ?? "", JS.num($0, "amount") ?? 0) }
            return TaxItem51(key: JS.str(i, "key") ?? UUID().uuidString, title: JS.str(i, "title") ?? "", kind: JS.str(i, "kind") ?? "fradrag",
                             basis: JS.num(i, "basis") ?? 0, deduction: JS.num(i, "deduction") ?? 0, value: JS.num(i, "value") ?? 0,
                             source: JS.str(i, "source") ?? "mangler", note: JS.str(i, "note") ?? "", missing: JS.str(i, "missing") ?? "",
                             orgs: orgs, sources: src)
        }
        let tot: [String: Any]? = JS.dict(o, "total")
        t.deduction = JS.num(tot, "deduction") ?? 0
        t.value = JS.num(tot, "value") ?? 0
        let r: [String: Any]? = JS.dict(o, "reminder")
        if JS.bool(r, "show") == true {
            t.reminder = JS.str(r, "text") ?? ""
            t.reminderUrl = JS.str(r, "url") ?? ""
        }
        t.disclaimer = JS.str(o, "disclaimer") ?? ""
        t.ratesNote = JS.str(o, "ratesNote") ?? ""
        t.profile = JS.dict(o, "profile") ?? [:]
        return t
    }
}

/* ---------- Priser ---------- */

struct PriceStore51: Identifiable {
    var id: String { store }
    let store: String
    let last: Double
    let lastDate: String
    let min: Double
    let count: Int
}

struct PriceItem51: Identifiable {
    var id: String { key }
    let key: String
    let name: String
    let unit: String
    let count: Int
    let lastPrice: Double
    let lastStore: String
    let changePct: Double
    let changeText: String
    let cheapest: String
    let stores: [PriceStore51]

    nonisolated static func parse(_ i: [String: Any]) -> PriceItem51 {
        let last: [String: Any]? = JS.dict(i, "last")
        var ch: String = ""
        if let c = JS.dict(i, "cheapest") {
            let st: String = JS.str(c, "store") ?? ""
            let pr: String = F51.kr(JS.num(c, "price") ?? 0, 2)
            let sv: Int = JS.int(c, "savingPct") ?? 0
            ch = "Billigst: " + st + " " + pr + " (−\(sv) %)"
        }
        let st: [PriceStore51] = JS.list(i, "stores").map { (s: [String: Any]) -> PriceStore51 in
            PriceStore51(store: JS.str(s, "store") ?? "", last: JS.num(s, "last") ?? 0, lastDate: JS.str(s, "lastDate") ?? "",
                         min: JS.num(s, "min") ?? 0, count: JS.int(s, "count") ?? 0)
        }
        return PriceItem51(key: JS.str(i, "key") ?? "", name: JS.str(i, "name") ?? "", unit: JS.str(i, "unit") ?? "stk",
                           count: JS.int(i, "count") ?? 0, lastPrice: JS.num(last, "price") ?? 0, lastStore: JS.str(last, "store") ?? "",
                           changePct: JS.num(i, "changePct") ?? 0, changeText: JS.str(i, "changeText") ?? "", cheapest: ch, stores: st)
    }
}

struct Prices51 {
    var items: [PriceItem51] = []
    var basketText: String = ""
    var basket: [(String, String, String)] = []
    var receipts: Int = 0
    var count: Int = 0
    var raised: Int = 0

    nonisolated static func parse(_ o: [String: Any]) -> Prices51 {
        var p: Prices51 = Prices51()
        p.items = JS.list(o, "items").map { PriceItem51.parse($0) }
        let b: [String: Any]? = JS.dict(o, "basket")
        p.basketText = JS.str(b, "text") ?? ""
        let stores: [[String: Any]] = JS.list(b, "stores")
        let first: Double = JS.num(stores.first, "index") ?? 0
        p.basket = stores.enumerated().map { (pair: (offset: Int, element: [String: Any])) -> (String, String, String) in
            let s: [String: Any] = pair.element
            let sub: String = "\(JS.int(s, "items") ?? 0) varer sammenlignet · billigst på \(JS.int(s, "cheapestFor") ?? 0)"
            let v: String = pair.offset == 0 ? "billigst" : "+\(Int(((JS.num(s, "index") ?? 0) - first).rounded())) %"
            return (JS.str(s, "store") ?? "", sub, v)
        }
        p.receipts = JS.int(o, "receipts") ?? 0
        p.count = JS.int(o, "count") ?? 0
        p.raised = JS.int(o, "raised") ?? 0
        return p
    }
}

/* ---------- Abonnementsjeger ---------- */

struct Finding51: Identifiable {
    var id: String { key }
    let key: String
    let kind: String
    let title: String
    let text: String
    let saving: Double
    let subId: Int?

    var label: (String, F51Tone) {
        switch kind {
        case "price_up": return ("Prisøkning", .warn)
        case "double": return ("Dobbelt", .warn)
        default: return ("Ubrukt", .mut)
        }
    }
}

struct Hunter51 {
    var findings: [Finding51] = []
    var weeks: Int = 6
    var monthly: Double = 0
    var yearly: Double = 0
    var dismissed: Int = 0
    var text: String = ""
    var note: String = ""

    nonisolated static func parse(_ o: [String: Any]) -> Hunter51 {
        var h: Hunter51 = Hunter51()
        h.findings = JS.list(o, "findings").map { (f: [String: Any]) -> Finding51 in
            var sid: Int? = JS.int(f, "subId")
            if sid == nil, let ids = f["subIds"] as? [Any], let last = ids.last as? NSNumber { sid = last.intValue }
            return Finding51(key: JS.str(f, "key") ?? UUID().uuidString, kind: JS.str(f, "kind") ?? "", title: JS.str(f, "title") ?? (JS.str(f, "name") ?? ""),
                             text: JS.str(f, "text") ?? "", saving: JS.num(f, "saving") ?? 0, subId: sid)
        }
        h.weeks = JS.int(o, "weeks") ?? 6
        let s: [String: Any]? = JS.dict(o, "summary")
        h.monthly = JS.num(s, "monthlySaving") ?? 0
        h.yearly = JS.num(s, "yearlySaving") ?? 0
        h.dismissed = JS.int(s, "dismissed") ?? 0
        h.text = JS.str(s, "text") ?? ""
        h.note = JS.str(JS.dict(o, "signals"), "note") ?? ""
        return h
    }
}

struct Draft51 {
    let key: String
    var busy: Bool = true
    var subject: String = ""
    var text: String = ""
    var engine: String = ""
    var model: String = ""
    var notice: String = ""
    var note: String = ""
}

/* ---------- Modellen ---------- */

@MainActor
@Observable
final class Plan51 {
    static let shared = Plan51()
    static let tabs: [(String, String)] = [("spar", "Sparemål"), ("kal", "Kalender"), ("skatt", "Skatt"), ("pris", "Priser"), ("jakt", "Abonnementsjeger")]

    var open: Bool = false
    var tab: String = UserDefaults.standard.string(forKey: "fin51_tab") ?? "spar"
    var goals: Goals51? = nil
    var cal: Cal51? = nil
    var tax: Tax51? = nil
    var prices: Prices51? = nil
    var hunter: Hunter51? = nil
    var errors: [String: String] = [:]
    var busy: Set<String> = []
    var toast: String = ""

    // Valg på fanene (som web).
    var days: Int = 30
    var acc: Int? = nil
    var year: Int? = nil
    var q: String = ""
    var sort: String = "change"
    var weeks: Int = 6
    var openPrice: String? = nil
    var pricePoints: [String: [(String, String, Double)]] = [:]
    var draft: Draft51? = nil
    /// Skjema: nytt mål (0) eller endre (id).
    var editing: Int? = nil
    var depositFor: Goal51? = nil
    var export: F51File? = nil

    func show(_ t: String? = nil) {
        if let t, Plan51.tabs.contains(where: { $0.0 == t }) { tab = t }
        Haptics.shared.tap()
        open = true
    }

    func pick(_ t: String, _ store: Store) {
        tab = t
        UserDefaults.standard.set(t, forKey: "fin51_tab")
        Task { await load(store) }
    }

    func flash(_ t: String) {
        toast = t
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_800_000_000)
            if self.toast == t { self.toast = "" }
        }
    }

    private func get(_ store: Store, _ path: String) async throws -> [String: Any] {
        let d: Data = try await store.api.callAt("/finans/api", "GET", path, timeout: 30)
        return JS.obj(d)
    }

    @discardableResult
    func send(_ store: Store, _ method: String, _ path: String, _ body: [String: Any]? = nil) async -> [String: Any]? {
        do {
            let d: Data = try await store.api.callAt("/finans/api", method, path, json: body, timeout: 60)
            return JS.obj(d)
        } catch {
            flash(F51.err(error))
            return nil
        }
    }

    func load(_ store: Store, force: Bool = false) async {
        let t: String = tab
        if busy.contains(t) { return }
        if !force && has(t) { return }
        busy.insert(t)
        errors[t] = nil
        defer { busy.remove(t) }
        do {
            switch t {
            case "spar": goals = Goals51.parse(try await get(store, "/fin51/goals"))
            case "kal": cal = Cal51.parse(try await get(store, "/fin51/calendar?days=\(days)"))
            case "skatt":
                let path: String = year.map { "/fin51/tax?year=\($0)" } ?? "/fin51/tax"
                let v: Tax51 = Tax51.parse(try await get(store, path))
                tax = v
                if year == nil { year = v.year }
            case "pris":
                let enc: String = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
                prices = Prices51.parse(try await get(store, "/fin51/prices?sort=\(sort)" + (q.isEmpty ? "" : "&q=" + enc)))
            default: hunter = Hunter51.parse(try await get(store, "/fin51/hunter?weeks=\(weeks)"))
            }
        } catch {
            errors[t] = F51.err(error)
        }
    }

    func has(_ t: String) -> Bool {
        switch t {
        case "spar": return goals != nil
        case "kal": return cal != nil
        case "skatt": return tax != nil
        case "pris": return prices != nil
        default: return hunter != nil
        }
    }

    func reload(_ store: Store) async { await load(store, force: true) }

    /* ---------- Sparemål ---------- */

    func saveGoal(_ store: Store, id: Int?, name: String, target: String, saved: String, deadline: Date?, color: String, accountId: Int?) async -> Bool {
        let n: String = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty, let t = F51.num(target), t > 0 else { flash("Navn og målbeløp må fylles ut"); return false }
        var b: [String: Any] = ["name": n, "target": t, "color": color]
        b["deadline"] = deadline.map { JS.fmt($0, "yyyy-MM-dd") as Any } ?? NSNull()
        b["accountId"] = accountId.map { $0 as Any } ?? NSNull()
        if id == nil, let s = F51.num(saved), s > 0 { b["saved"] = s }
        let r: [String: Any]?
        if let id { r = await send(store, "PATCH", "/fin51/goals/\(id)", b) } else { r = await send(store, "POST", "/fin51/goals", b) }
        guard r != nil else { return false }
        flash(id == nil ? "Sparemålet er laget" : "Lagret")
        await reload(store)
        return true
    }

    func deleteGoal(_ g: Goal51, _ store: Store) async {
        guard await send(store, "DELETE", "/fin51/goals/\(g.id)") != nil else { return }
        flash("Sparemålet er slettet")
        await reload(store)
    }

    func deposit(_ g: Goal51, _ amount: String, _ store: Store) async -> Bool {
        guard let a = F51.num(amount), a != 0 else { flash("Skriv et beløp"); return false }
        guard await send(store, "POST", "/fin51/goals/\(g.id)/deposit", ["amount": a]) != nil else { return false }
        flash(a > 0 ? F51.kr(a, a.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 2) + " satt inn" : F51.kr(-a) + " tatt ut")
        await reload(store)
        return true
    }

    func setImage(_ g: Goal51, _ data: Data, _ store: Store) async {
        var jpg: Data = data
        if let img = UIImage(data: data) {
            let side: CGFloat = Swift.max(img.size.width, img.size.height)
            let s: CGFloat = side > 1600 ? 1600 / side : 1
            let size: CGSize = CGSize(width: img.size.width * s, height: img.size.height * s)
            let small: UIImage = UIGraphicsImageRenderer(size: size).image { (_: UIGraphicsImageRendererContext) in img.draw(in: CGRect(origin: .zero, size: size)) }
            jpg = small.jpegData(compressionQuality: 0.85) ?? data
        }
        guard jpg.count <= 4 * 1024 * 1024 else { flash("Bildet kan være maks 4 MB"); return }
        do {
            try await store.api.sendRaw51("PUT", "/finans/api/fin51/goals/\(g.id)/image", body: jpg, contentType: "image/jpeg")
            flash("Bildet er lagret")
            await reload(store)
        } catch {
            flash(F51.err(error))
        }
    }

    func deleteImage(_ g: Goal51, _ store: Store) async {
        guard await send(store, "DELETE", "/fin51/goals/\(g.id)/image") != nil else { return }
        await reload(store)
    }

    func setRoundStep(_ v: Int, _ store: Store) async {
        guard await send(store, "PUT", "/fin51/roundup", ["step": v]) != nil else { return }
        await reload(store)
    }

    func setRoundGoal(_ v: Int, _ store: Store) async {
        guard await send(store, "PUT", "/fin51/roundup", ["goalId": v]) != nil else { return }
        await reload(store)
    }

    func applyRound(_ store: Store) async {
        var b: [String: Any] = [:]
        if let g = goals?.roundUp.goalId ?? goals?.items.first?.id { b["goalId"] = g }
        guard let r = await send(store, "POST", "/fin51/roundup/apply", b) else { return }
        let ap: [String: Any]? = JS.dict(r, "applied")
        let name: String = JS.str(JS.dict(r, "goal"), "name") ?? ""
        let amt: String = F51.kr(JS.num(ap, "amount") ?? 0, 2)
        let fallback: String = amt + " satt inn på «" + name + "»"
        flash(JS.str(ap, "transferHint") ?? fallback)
        await reload(store)
    }

    /* ---------- Skatt ---------- */

    func saveTax(_ store: Store, _ b: [String: Any]) async {
        guard await send(store, "PUT", "/fin51/tax/profile", b) != nil else { return }
        flash("Lagret")
        await reload(store)
    }

    func exportTax(_ store: Store, html: Bool) async {
        let y: Int = tax?.year ?? year ?? Calendar.current.component(.year, from: Date()) - 1
        let path: String = "/finans/api/fin51/tax/export." + (html ? "html" : "csv") + "?year=\(y)"
        do {
            let d: Data = try await store.api.bytes(path)
            guard let u = F51.temp(d, "Skattehjelp-\(y)." + (html ? "html" : "csv")) else { flash("Fikk ikke lagret filen"); return }
            export = F51File(id: u.lastPathComponent, url: u)
        } catch {
            flash(F51.err(error))
        }
    }

    /* ---------- Priser ---------- */

    func togglePrice(_ key: String, _ store: Store) async {
        if openPrice == key { openPrice = nil; return }
        openPrice = key
        if pricePoints[key] != nil { return }
        let enc: String = key.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? key
        guard let o = try? await get(store, "/fin51/prices/item?key=" + enc) else { return }
        pricePoints[key] = JS.list(o, "points").map { (JS.str($0, "date") ?? "", JS.str($0, "store") ?? "", JS.num($0, "price") ?? 0) }
    }

    /* ---------- Abonnementsjeger ---------- */

    func used(_ f: Finding51, _ store: Store) async {
        guard let id = f.subId, await send(store, "POST", "/fin51/hunter/used", ["subId": id]) != nil else { return }
        flash("Merket som brukt")
        await reload(store)
    }

    func dismiss(_ f: Finding51, _ store: Store) async {
        guard await send(store, "POST", "/fin51/hunter/dismiss", ["key": f.key]) != nil else { return }
        await reload(store)
    }

    func undismiss(_ store: Store) async {
        guard await send(store, "DELETE", "/fin51/hunter/dismiss") != nil else { return }
        await reload(store)
    }

    func writeDraft(_ f: Finding51, _ store: Store) async {
        guard let id = f.subId else { return }
        draft = Draft51(key: f.key)
        guard let r = await send(store, "POST", "/fin51/hunter/draft", ["subId": id]) else { draft = nil; return }
        var d: Draft51 = Draft51(key: f.key, busy: false)
        d.subject = JS.str(r, "subject") ?? ""
        d.text = JS.str(r, "text") ?? ""
        d.engine = JS.str(r, "engine") ?? ""
        d.model = JS.str(r, "model") ?? ""
        d.notice = JS.str(r, "notice") ?? ""
        d.note = JS.str(r, "note") ?? ""
        if draft?.key == f.key { draft = d }
    }

    func copyDraft() {
        guard let d = draft else { return }
        UIPasteboard.general.string = d.subject + "\n\n" + d.text
        Haptics.shared.tick()
        flash("Kopiert – lim inn i e-post eller kontaktskjema")
    }
}
