import Foundation
import WidgetKit

/* ---------------- Prompt 51 (IOSPLAT51): plattform – felles for appen og widgetene (App Group) ----------------
 Nett med appens token fra App Group (virker i appen, i widgetene og i App Intents/Siri), offline-køen for skrivinger
 og øyeblikksbildene de nye widgetene viser (Planlegging-saldo og Sjekk inn).

 Offline-køen (Offline51): skrivinger som tåler å vente (gjøremål, handleliste, Sjekk inn) legges i køen når nettet mangler,
 og sendes når appen er på nett igjen (NWPathMonitor i Plat51Host.swift, og når appen blir aktiv). Kvitteringer har sin egen
 kø fra prompt 18 (UploadQueue18.swift). Konfliktregel: siste skriving vinner. Før en PATCH/PUT hentes ressursen; er den endret
 på en annen enhet etter at skrivingen ble lagt i køen, sendes vår endring likevel, men brukeren får et varsel. Er ressursen
 slettet (404), forkastes endringen med varsel. 409 fra serveren = konflikt (varsel, forkastes). Andre 4xx = forkastes med varsel.
 Nett-/serverfeil (0, 5xx) = prøves igjen (maks 20 forsøk). Tidsavbrudd legges aldri i køen (kan ha blitt utført). */

/* ---------- Nett ---------- */

enum Plat51Net {
    struct Reply {
        var data: Data
        /// 0 = ingen adresse svarte (ikke nett, eller serveren er nede).
        var status: Int
        var timedOut: Bool = false
        var ok: Bool { status >= 200 && status < 300 }
    }

    /// Prøver hovedadressen, ekstern og lokal adresse etter tur (WidgetShared.bases). `path` er fra serverens rot (/api/…).
    static func request(_ method: String, _ path: String, body: [String: Any]? = nil, raw: Data? = nil, contentType: String = "application/json",
                        headers: [String: String] = [:], timeout: TimeInterval = 12) async -> Reply {
        guard let token = WidgetShared.token, !token.isEmpty else { return Reply(data: Data(), status: 401) }
        var timedOut: Bool = false
        for base in WidgetShared.bases {
            let b: String = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard let url = URL(string: b + path) else { continue }
            var r: URLRequest = URLRequest(url: url)
            r.httpMethod = method
            r.timeoutInterval = timeout
            r.setValue("application/json", forHTTPHeaderField: "Accept")
            r.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
            for (k, v) in Offline51.extraHeaders() { r.setValue(v, forHTTPHeaderField: k) }
            for (k, v) in headers { r.setValue(v, forHTTPHeaderField: k) }
            if let raw {
                r.setValue(contentType, forHTTPHeaderField: "Content-Type")
                r.httpBody = raw
            } else if let body {
                r.setValue("application/json", forHTTPHeaderField: "Content-Type")
                r.httpBody = try? JSONSerialization.data(withJSONObject: body)
            }
            do {
                let pair: (Data, URLResponse) = try await URLSession.shared.data(for: r)
                let code: Int = (pair.1 as? HTTPURLResponse)?.statusCode ?? 0
                if code > 0 { return Reply(data: pair.0, status: code) }
            } catch let e as URLError {
                if e.code == .timedOut { timedOut = true }
                continue
            } catch {
                continue
            }
        }
        return Reply(data: Data(), status: 0, timedOut: timedOut)
    }

    static func obj(_ d: Data) -> [String: Any] { ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:] }

    static func num(_ o: [String: Any]?, _ k: String) -> Double? {
        switch o?[k] {
        case let n as NSNumber: return n.doubleValue
        case let s as String: return Double(s.replacingOccurrences(of: ",", with: "."))
        default: return nil
        }
    }

    static func str(_ o: [String: Any]?, _ k: String) -> String? {
        switch o?[k] {
        case let s as String: return s.isEmpty ? nil : s
        case let n as NSNumber: return n.stringValue
        default: return nil
        }
    }

    static func list(_ o: [String: Any]?, _ k: String) -> [[String: Any]] {
        (o?[k] as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
    }

    /// «48 312 kr» / «−1 200 kr».
    static func kr(_ v: Double) -> String {
        let f: NumberFormatter = NumberFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        let s: String = f.string(from: NSNumber(value: abs(v))) ?? String(Int(abs(v)))
        return (v < 0 ? "−" : "") + s + " kr"
    }

    /// «2026-10-29» → «29. okt.»
    static func day(_ iso: String) -> String {
        let p: [Substring] = iso.prefix(10).split(separator: "-")
        guard p.count == 3, let m = Int(p[1]), let d = Int(p[2]), (1...12).contains(m) else { return iso }
        let months: [String] = ["jan.", "feb.", "mars", "apr.", "mai", "juni", "juli", "aug.", "sep.", "okt.", "nov.", "des."]
        return "\(d). " + months[m - 1]
    }
}

/* ---------- Offline-kø ---------- */

struct Offline51Item: Codable, Hashable, Identifiable {
    var id: String
    var method: String
    /// Fra serverens rot, f.eks. /api/tasks/12 eller /mat/api/shopping.
    var path: String
    var body: Data?
    var contentType: String
    /// «Gjøremål», «Handleliste», «Sjekk inn».
    var module: String
    /// «Melk» – vises i varsler.
    var label: String
    var queuedAt: Double
    var tries: Int
}

actor Offline51Gate {
    static let shared: Offline51Gate = Offline51Gate()
    private var running: Bool = false

    func begin() -> Bool {
        if running { return false }
        running = true
        return true
    }

    func end() { running = false }
}

enum Offline51 {
    static let key: String = "w.offline51"
    static let noticeKey: String = "w.offline51.notices"
    static let changed: Notification.Name = Notification.Name("no.kristo.finanshub.offline51")

    /// Ekstra headere fra appen (X-Device-Key, SEC51). Settes av Plat51Host; widgetene sender ingen.
    static var extraHeaders: () -> [String: String] = { [:] }

    static var items: [Offline51Item] {
        guard let d = WidgetShared.defaults.data(forKey: key), let v = try? JSONDecoder().decode([Offline51Item].self, from: d) else { return [] }
        return v
    }

    private static func save(_ v: [Offline51Item]) {
        if let d = try? JSONEncoder().encode(v) { WidgetShared.defaults.set(d, forKey: key) }
        NotificationCenter.default.post(name: changed, object: nil)
    }

    static var count: Int { items.count }

    /// Modulen for en skriving som tåler å vente, ellers nil (sendes ikke offline).
    static func module(_ method: String, _ path: String) -> String? {
        let m: String = method.uppercased()
        if m == "GET" || m == "HEAD" { return nil }
        let p: String = path.components(separatedBy: "?").first ?? path
        func match(_ pattern: String) -> Bool { p.range(of: pattern, options: .regularExpression) != nil }
        if match("^/api/tasks(/[0-9]+)?(/subs(/[A-Za-z0-9_-]+)?)?$") { return "Gjøremål" }
        if match("^/(mat/api|api/matplan)/shopping(/[A-Za-z0-9_-]+(/toggle)?)?$") { return "Handleliste" }
        if m == "POST" && match("^/api/family/checkin(/[A-Za-z0-9_-]+/(reply|pickup|seen))?$") { return "Sjekk inn" }
        return nil
    }

    /// Kort tekst fra body til varsler («Melk»).
    static func label(_ body: Data?) -> String {
        guard let body, let o = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] else { return "" }
        for k in ["text", "title", "name"] {
            if let s = o[k] as? String, !s.isEmpty { return String(s.prefix(60)) }
        }
        return ""
    }

    /// Legger skrivingen i køen. Samme PATCH/PUT på samme ressurs erstattes (siste skriving vinner lokalt);
    /// to like «toggle» etter hverandre opphever hverandre. true = lagt i køen.
    @discardableResult
    static func enqueue(method: String, path: String, body: Data?, contentType: String = "application/json", label: String? = nil) -> Bool {
        guard let mod = module(method, path) else { return false }
        if let body, body.count > 256 * 1024 { return false }
        var v: [Offline51Item] = items
        let m: String = method.uppercased()
        if path.hasSuffix("/toggle"), let i = v.lastIndex(where: { $0.path == path && $0.method == m }) {
            v.remove(at: i)
            save(v)
            return true
        }
        var queuedAt: Double = Date().timeIntervalSince1970
        if m == "PATCH" || m == "PUT", let i = v.firstIndex(where: { $0.path == path && $0.method == m }) {
            queuedAt = v[i].queuedAt
            var merged: Data? = body
            // PATCH: slå sammen feltene (nyeste verdi vinner), så to endringer på samme gjøremål blir én.
            if m == "PATCH", let a = v[i].body, let b = body,
               var oa = (try? JSONSerialization.jsonObject(with: a)) as? [String: Any],
               let ob = (try? JSONSerialization.jsonObject(with: b)) as? [String: Any] {
                for (k, x) in ob { oa[k] = x }
                merged = try? JSONSerialization.data(withJSONObject: oa)
            }
            v.remove(at: i)
            v.append(Offline51Item(id: UUID().uuidString, method: m, path: path, body: merged, contentType: contentType, module: mod,
                                   label: label ?? Offline51.label(merged), queuedAt: queuedAt, tries: 0))
            save(v)
            return true
        }
        if m == "DELETE" {
            // Slettet før den ble sendt: fjern ventende endringer på samme ressurs.
            v.removeAll { $0.path == path || $0.path.hasPrefix(path + "/") }
        }
        if v.count >= 200 { v.removeFirst() }
        v.append(Offline51Item(id: UUID().uuidString, method: m, path: path, body: body, contentType: contentType, module: mod,
                               label: label ?? Offline51.label(body), queuedAt: queuedAt, tries: 0))
        save(v)
        return true
    }

    /// Varsler fra siste synk (konflikter og forkastede skrivinger). Appen viser og tømmer dem.
    static func takeNotices() -> [String] {
        let v: [String] = WidgetShared.defaults.stringArray(forKey: noticeKey) ?? []
        if !v.isEmpty { WidgetShared.defaults.removeObject(forKey: noticeKey) }
        return v
    }

    private static func notice(_ s: String) {
        var v: [String] = WidgetShared.defaults.stringArray(forKey: noticeKey) ?? []
        v.append(s)
        WidgetShared.defaults.set(Array(v.suffix(20)), forKey: noticeKey)
    }

    private static func what(_ it: Offline51Item) -> String {
        it.label.isEmpty ? it.module.lowercased() : "«" + it.label + "»"
    }

    /// Siste endring på ressursen (updatedAt/updated_at/updated/at), Unix-sekunder.
    private static func updatedAt(_ o: [String: Any]) -> Double? {
        let root: [String: Any] = (o["task"] as? [String: Any]) ?? (o["item"] as? [String: Any]) ?? o
        for k in ["updatedAt", "updated_at", "updated", "modifiedAt"] {
            if let n = root[k] as? NSNumber {
                let d: Double = n.doubleValue
                return d > 100_000_000_000 ? d / 1000 : d
            }
            if let s = root[k] as? String {
                let f: ISO8601DateFormatter = ISO8601DateFormatter()
                f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let d = f.date(from: s) { return d.timeIntervalSince1970 }
                f.formatOptions = [.withInternetDateTime]
                if let d = f.date(from: s) { return d.timeIntervalSince1970 }
                // SQLite «2026-10-25 18:30:00» (UTC).
                let g: DateFormatter = DateFormatter()
                g.locale = Locale(identifier: "en_US_POSIX")
                g.timeZone = TimeZone(identifier: "UTC")
                g.dateFormat = "yyyy-MM-dd HH:mm:ss"
                if let d = g.date(from: String(s.prefix(19))) { return d.timeIntervalSince1970 }
            }
        }
        return nil
    }

    /// Sender køen i rekkefølge. Returnerer antall sendt. Stopper ved første nettfeil (resten venter).
    @discardableResult
    static func flush() async -> Int {
        guard await Offline51Gate.shared.begin() else { return 0 }
        var sent: Int = 0
        var touched: Set<String> = []
        while let it = items.first {
            let iso: String = ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: it.queuedAt))
            let hdr: [String: String] = ["X-Offline51": "1", "X-Offline51-Queued-At": iso, "Idempotency-Key": it.id]
            // Siste skriving vinner, men si fra når noen andre har endret samme ressurs i mellomtiden.
            if it.method == "PATCH" || it.method == "PUT" {
                let g: Plat51Net.Reply = await Plat51Net.request("GET", it.path, timeout: 10)
                if g.status == 0 { break }
                if g.status == 404 {
                    notice(what(it) + " ble slettet på en annen enhet. Endringen din ble ikke lagret.")
                    drop(it.id)
                    continue
                }
                if g.ok, let u = updatedAt(Plat51Net.obj(g.data)), u > it.queuedAt + 1 {
                    notice(what(it) + " ble også endret på en annen enhet mens du var uten nett. Din endring ble lagret sist.")
                }
            }
            let r: Plat51Net.Reply = await Plat51Net.request(it.method, it.path, raw: it.body, contentType: it.contentType, headers: hdr, timeout: 15)
            if r.ok {
                sent += 1
                touched.insert(it.module)
                drop(it.id)
                continue
            }
            if r.status == 409 {
                notice(what(it) + ": konflikt med en endring på en annen enhet. Sjekk " + it.module.lowercased() + ".")
                drop(it.id)
                continue
            }
            if r.status == 401 { break }
            if r.status >= 400 && r.status < 500 && r.status != 408 && r.status != 429 {
                let msg: String = Plat51Net.str(Plat51Net.obj(r.data), "error") ?? "feil \(r.status)"
                notice(what(it) + " (" + it.module.lowercased() + ") ble ikke lagret: " + msg)
                drop(it.id)
                continue
            }
            // 0, 408, 429, 5xx: prøv igjen senere.
            bump(it.id)
            break
        }
        await Offline51Gate.shared.end()
        if sent > 0 {
            if touched.contains("Gjøremål") { WidgetCenter.shared.reloadTimelines(ofKind: "no.kristo.finanshub.tasks") }
            if touched.contains("Sjekk inn") { WidgetCenter.shared.reloadTimelines(ofKind: Plat51Kinds.checkin) }
        }
        return sent
    }

    private static func drop(_ id: String) {
        var v: [Offline51Item] = items
        v.removeAll { $0.id == id }
        save(v)
    }

    private static func bump(_ id: String) {
        var v: [Offline51Item] = items
        guard let i = v.firstIndex(where: { $0.id == id }) else { return }
        v[i].tries += 1
        if v[i].tries >= 20 {
            notice(what(v[i]) + " (" + v[i].module.lowercased() + ") ble forkastet etter mange forsøk.")
            v.remove(at: i)
        }
        save(v)
    }

    /// Sender skrivingen nå, eller legger den i køen når nettet mangler. Brukes av App Intents og widget-knappene.
    /// Svar: (sendt, lagt i køen, data).
    static func send(_ method: String, _ path: String, _ body: [String: Any], label: String? = nil) async -> (Bool, Bool, Data) {
        // Eldre skrivinger i køen først (rekkefølgen beholdes).
        if count > 0 { _ = await flush() }
        let r: Plat51Net.Reply = await Plat51Net.request(method, path, body: body, timeout: 12)
        if r.ok { return (true, false, r.data) }
        if r.status == 0 && !r.timedOut {
            let raw: Data? = try? JSONSerialization.data(withJSONObject: body)
            if enqueue(method: method, path: path, body: raw, label: label) { return (false, true, Data()) }
        }
        return (false, false, r.data)
    }
}

/* ---------- Widget-typer ---------- */

enum Plat51Kinds {
    static let plan: String = "no.kristo.finanshub.plan51"
    static let checkin: String = "no.kristo.finanshub.checkin51"
    static let packagesLock: String = "no.kristo.finanshub.packages51"
    static let departures: String = "no.kristo.finanshub.departures51"

    static func reloadAll() {
        for k in [plan, checkin, packagesLock, departures] { WidgetCenter.shared.reloadTimelines(ofKind: k) }
    }
}

/* ---------- Planlegging: saldo og prognose (GET /finans/api/fin51/calendar?days=30) ---------- */

struct Plat51PlanSnap: Codable, Hashable {
    var today: Double = 0
    var end: Double = 0
    var lowest: Double = 0
    var lowestDate: String = ""
    var lowestAccount: String = ""
    var out: Double = 0
    var inn: Double = 0
    var count: Int = 0
    /// Summen av kontoene dag for dag (slutten av dagen).
    var series: [Double] = []
    var warning: String = ""
    var nextName: String = ""
    var nextAmount: Double = 0
    var nextDate: String = ""
    var at: Double = 0
    var has: Bool = false

    static let key: String = "w.plan51"

    static var cached: Plat51PlanSnap {
        guard let d = WidgetShared.defaults.data(forKey: key), let v = try? JSONDecoder().decode(Plat51PlanSnap.self, from: d) else { return Plat51PlanSnap() }
        return v
    }

    static func store(_ v: Plat51PlanSnap) {
        if let d = try? JSONEncoder().encode(v) { WidgetShared.defaults.set(d, forKey: key) }
    }

    static func parse(_ d: Data) -> Plat51PlanSnap? {
        let o: [String: Any] = Plat51Net.obj(d)
        let accounts: [[String: Any]] = Plat51Net.list(o, "accounts")
        if accounts.isEmpty && o["days"] == nil { return nil }
        var s: Plat51PlanSnap = Plat51PlanSnap()
        s.has = true
        s.at = Date().timeIntervalSince1970
        var byDate: [String: Double] = [:]
        var dates: [String] = []
        for a in accounts {
            s.today += Plat51Net.num(a, "start") ?? 0
            s.end += Plat51Net.num(a, "end") ?? 0
            for p in Plat51Net.list(a, "series") {
                guard let dt = Plat51Net.str(p, "date") else { continue }
                if byDate[dt] == nil { dates.append(dt) }
                byDate[dt, default: 0] += Plat51Net.num(p, "balance") ?? 0
            }
        }
        s.series = dates.sorted().map { byDate[$0] ?? 0 }
        if let lw = o["lowest"] as? [String: Any] {
            s.lowest = Plat51Net.num(lw, "balance") ?? 0
            s.lowestDate = Plat51Net.str(lw, "date") ?? ""
            s.lowestAccount = Plat51Net.str(lw, "account") ?? ""
        } else {
            s.lowest = s.series.min() ?? s.today
        }
        let t: [String: Any]? = o["total"] as? [String: Any]
        s.out = abs(Plat51Net.num(t, "out") ?? 0)
        s.inn = Plat51Net.num(t, "in") ?? 0
        s.count = Int(Plat51Net.num(t, "count") ?? 0)
        s.warning = ((o["warnings"] as? [Any])?.first as? String) ?? ""
        let today: String = String(ISO8601DateFormatter().string(from: Date()).prefix(10))
        if let next = Plat51Net.list(o, "items").first(where: { (Plat51Net.str($0, "date") ?? "") >= today && (Plat51Net.num($0, "amount") ?? 0) < 0 }) {
            s.nextName = Plat51Net.str(next, "name") ?? ""
            s.nextAmount = Plat51Net.num(next, "amount") ?? 0
            s.nextDate = Plat51Net.str(next, "date") ?? ""
        }
        return s
    }

    static func load() async -> Plat51PlanSnap {
        let r: Plat51Net.Reply = await Plat51Net.request("GET", "/finans/api/fin51/calendar?days=30", timeout: 10)
        if r.ok, let s = parse(r.data) {
            store(s)
            return s
        }
        return cached
    }
}

/* ---------- Sjekk inn (GET /api/family/checkin) ---------- */

struct Plat51Person: Codable, Hashable {
    var id: String
    var name: String
}

struct Plat51CheckinSnap: Codable, Hashable {
    var people: [Plat51Person] = []
    /// «Sjekket inn 19:42»
    var latestTitle: String = ""
    /// «Sett av Ingrid · Bursdag hos Mari»
    var latestSub: String = ""
    var latestAt: Double = 0
    var requests: Int = 0
    /// «Pål ber deg sjekke inn»
    var requestTitle: String = ""
    var suggestion: String = ""
    var at: Double = 0
    var has: Bool = false

    static let key: String = "w.checkin51"

    static var cached: Plat51CheckinSnap {
        guard let d = WidgetShared.defaults.data(forKey: key), let v = try? JSONDecoder().decode(Plat51CheckinSnap.self, from: d) else { return Plat51CheckinSnap() }
        return v
    }

    static func store(_ v: Plat51CheckinSnap) {
        if let d = try? JSONEncoder().encode(v) { WidgetShared.defaults.set(d, forKey: key) }
    }

    static func parse(_ d: Data) -> Plat51CheckinSnap? {
        let o: [String: Any] = Plat51Net.obj(d)
        if o.isEmpty { return nil }
        var s: Plat51CheckinSnap = Plat51CheckinSnap()
        s.has = true
        s.at = Date().timeIntervalSince1970
        s.people = Plat51Net.list(o, "people").compactMap { (p: [String: Any]) -> Plat51Person? in
            guard let id = Plat51Net.str(p, "userId") ?? Plat51Net.str(p, "id") else { return nil }
            return Plat51Person(id: id, name: Plat51Net.str(p, "name") ?? "")
        }
        if let l = o["latest"] as? [String: Any] {
            s.latestTitle = Plat51Net.str(l, "title") ?? "Sjekket inn"
            let place: String = Plat51Net.str(l["place"] as? [String: Any], "label") ?? Plat51Net.str(l["place"] as? [String: Any], "name") ?? ""
            let seen: String = Plat51Net.str(l, "seenText") ?? ""
            s.latestSub = [seen, place].filter { !$0.isEmpty }.joined(separator: " · ")
            s.latestAt = Hjemlys40Look.unix(l["createdAt"]) ?? 0
        }
        let req: [[String: Any]] = Plat51Net.list(o, "requests")
        s.requests = req.count
        s.requestTitle = req.first.flatMap { Plat51Net.str($0, "title") } ?? ""
        if let sg = o["suggestion"] as? [String: Any] { s.suggestion = Plat51Net.str(sg, "title") ?? "" }
        return s
    }

    static func load() async -> Plat51CheckinSnap {
        let r: Plat51Net.Reply = await Plat51Net.request("GET", "/api/family/checkin", timeout: 10)
        if r.ok, let s = parse(r.data) {
            store(s)
            return s
        }
        return cached
    }

    /// «Ingrid og Pål» / «Ingrid, Pål og Mari».
    static func names(_ p: [Plat51Person]) -> String {
        let n: [String] = p.map { String($0.name.split(separator: " ").first ?? "") }.filter { !$0.isEmpty }
        if n.isEmpty { return "familien" }
        if n.count == 1 { return n[0] }
        return n.dropLast().joined(separator: ", ") + " og " + (n.last ?? "")
    }
}
