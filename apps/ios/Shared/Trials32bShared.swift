import Foundation
import AppIntents
import WidgetKit

/* ---------------- Prompt 32: Prøveperioder – delt mellom appen og widgetene ---------------- */
// Fasit: design/Proveperiode Widgets.dc.html (trwVals / renderVals) og claude-code-proveperiode-widgets.md.
// Data: GET /api/widgets/trials (kompakt: neste prøve + de neste, dager igjen, fremdrift, pris, logo, cancelUrl),
// ellers GET /finans/api/subscriptions/trials. «Avsluttet»: POST /api/widgets/trials/:id {status:'cancelled'}
// (faller tilbake til PATCH /finans/api/subscriptions/trials/:id). Appen legger siste liste i App Group (w.trials32).

struct TrialW32b: Hashable, Identifiable {
    var id: String
    var name: String
    /// «2026-11-01»
    var end: String
    /// «2026-10-18», tom = 14 dager før slutt.
    var start: String = ""
    /// «149 kr/mnd» eller «gratis».
    var price: String = ""
    var logo: String = ""
    var cancelUrl: String = ""

    /// Dager igjen fra i dag (0 = slutter i dag).
    func days(_ now: Date = Date()) -> Int {
        guard let e = Trials32b.date(end) else { return 0 }
        let cal: Calendar = Trials32b.cal
        let a: Date = cal.startOfDay(for: now)
        let b: Date = cal.startOfDay(for: e)
        return Swift.max(0, cal.dateComponents([.day], from: a, to: b).day ?? 0)
    }

    /// Andel av prøven som er brukt (4–100 %).
    func progress(_ now: Date = Date()) -> Double {
        guard let e = Trials32b.date(end) else { return 0.04 }
        let s: Date = Trials32b.date(start) ?? e.addingTimeInterval(-14 * 86_400)
        let tot: Double = Swift.max(1, (e.timeIntervalSince(s) / 86_400).rounded())
        let dd: Double = Double(days(now))
        return Swift.max(0.04, Swift.min(1, (tot - dd) / tot))
    }

    /// ≤ 2 dager rød, ≤ 7 oransje, ellers tekstfarge («» = tekstfarge).
    func colorHex(_ now: Date = Date()) -> String {
        let d: Int = days(now)
        if d <= 2 { return "#b23a2a" }
        if d <= 7 { return "#a8661a" }
        return ""
    }

    func unit(_ now: Date = Date()) -> String { days(now) == 1 ? "dag igjen" : "dager igjen" }
    func unitShort(_ now: Date = Date()) -> String { days(now) == 1 ? "dag" : "dager" }

    /// «fre 1. nov»
    var endShort: String {
        guard let e = Trials32b.date(end) else { return end }
        let cal: Calendar = Trials32b.cal
        let wd: Int = (cal.component(.weekday, from: e) + 6) % 7
        let m: Int = cal.component(.month, from: e)
        return Trials32b.wd[wd] + " \(cal.component(.day, from: e)). " + Trials32b.ms[m - 1]
    }

    var priceText: String { price.isEmpty ? "gratis" : price }

    /// Logo-adressen: serverens felt, ellers logo-oppslaget på Homelab etter tjenestens domene.
    var logoPath: String {
        if !logo.isEmpty { return logo }
        return "/finans/api/logo/" + Trials32b.domain(name)
    }

    var initial: String { String(name.prefix(1)).uppercased() }
}

enum Trials32b {
    static let cacheKey: String = "w.trials32"
    static let widgetKind: String = "no.kristo.finanshub.trials32"

    static let wd: [String] = ["søn", "man", "tir", "ons", "tor", "fre", "lør"]
    static let ms: [String] = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]

    static let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.locale = Locale(identifier: "nb_NO")
        c.timeZone = TimeZone(identifier: "Europe/Oslo") ?? .current
        return c
    }()

    static func date(_ s: String) -> Date? {
        if s.count < 10 { return nil }
        let p: [Int] = String(s.prefix(10)).split(separator: "-").compactMap { Int($0) }
        if p.count < 3 { return nil }
        var c = DateComponents()
        c.year = p[0]; c.month = p[1]; c.day = p[2]; c.hour = 12
        return cal.date(from: c)
    }

    static let domains: [String: String] = [
        "viaplay": "viaplay.no", "netflix": "netflix.com", "hbo max": "max.com", "max": "max.com", "disney+": "disneyplus.com",
        "spotify": "spotify.com", "tv 2 play": "tv2.no", "storytel": "storytel.com", "bookbeat": "bookbeat.com",
        "youtube premium": "youtube.com", "audible": "audible.com", "strava": "strava.com", "tidal": "tidal.com",
        "apple tv+": "tv.apple.com", "amazon prime": "primevideo.com", "chatgpt": "openai.com",
    ]

    static func domain(_ name: String) -> String {
        let k: String = name.lowercased().trimmingCharacters(in: .whitespaces)
        if let d = domains[k] { return d }
        return k.replacingOccurrences(of: " ", with: "") + ".com"
    }

    private static func s(_ o: [String: Any], _ keys: [String]) -> String {
        for k in keys {
            if let v = o[k] as? String, !v.isEmpty { return v }
            if let n = o[k] as? NSNumber { return n.stringValue }
        }
        return ""
    }

    /// Godtar {items|trials|next+rest} eller en ren liste, med felt fra både widget-API-et og trials-tabellen.
    static func parse(_ d: Data) -> [TrialW32b] {
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        var rows: [[String: Any]] = (any as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
        if let o = any as? [String: Any] {
            for k in ["items", "trials", "active"] {
                if rows.isEmpty, let l = o[k] as? [Any] { rows = l.compactMap { $0 as? [String: Any] } }
            }
            if rows.isEmpty {
                if let n = o["next"] as? [String: Any] { rows.append(n) }
                for x in (o["rest"] as? [Any]) ?? [] { if let r = x as? [String: Any] { rows.append(r) } }
            }
        }
        var out: [TrialW32b] = []
        for o in rows {
            let status: String = s(o, ["status"])
            if !status.isEmpty && status != "active" { continue }
            if (o["done"] as? Bool) == true || (o["kept"] as? Bool) == true { continue }
            let id: String = s(o, ["id"])
            let name: String = s(o, ["n", "name", "service"])
            let end: String = String(s(o, ["end", "ends_at", "endsAt"]).prefix(10))
            if id.isEmpty || name.isEmpty || end.count < 10 { continue }
            var t = TrialW32b(id: id, name: name, end: end)
            t.start = String(s(o, ["start", "starts_at", "startsAt", "created_at"]).prefix(10))
            if let n = (o["p"] ?? o["price_after"] ?? o["priceAfter"] ?? o["price"]) as? NSNumber {
                t.price = "\(Int(n.doubleValue.rounded())) kr/mnd"
            } else {
                t.price = s(o, ["priceText", "p", "price_after", "priceAfter", "price"])
                if !t.price.isEmpty && !t.price.contains("kr") && Double(t.price) != nil { t.price += " kr/mnd" }
            }
            t.logo = s(o, ["logo", "logoUrl", "lg"])
            t.cancelUrl = s(o, ["cancelUrl", "cancel_url"])
            out.append(t)
        }
        let now: Date = Date()
        return out.filter { (t: TrialW32b) -> Bool in
            guard let e = date(t.end) else { return false }
            return cal.startOfDay(for: e) >= cal.startOfDay(for: now)
        }.sorted { (a: TrialW32b, b: TrialW32b) -> Bool in a.end < b.end }
    }

    /// Appen skriver listen etter hver henting/endring og ber widgetene tegne på nytt.
    static func push(_ list: [TrialW32b]) {
        var rows: [[String: Any]] = []
        for t in list {
            let r: [String: Any] = ["id": t.id, "n": t.name, "end": t.end, "start": t.start, "priceText": t.price, "logo": t.logo, "cancelUrl": t.cancelUrl]
            rows.append(r)
        }
        if let d = try? JSONSerialization.data(withJSONObject: ["items": rows]) { WidgetShared.defaults.set(d, forKey: cacheKey) }
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }

    static var cached: [TrialW32b] {
        guard let d = WidgetShared.defaults.data(forKey: cacheKey) else { return [] }
        return parse(d)
    }

    /// Fjerner en prøve fra bufferet med en gang (widgeten oppdateres også uten nett).
    static func dropCached(_ id: String) {
        let rest: [TrialW32b] = cached.filter { $0.id != id }
        var rows: [[String: Any]] = []
        for t in rest {
            let r: [String: Any] = ["id": t.id, "n": t.name, "end": t.end, "start": t.start, "priceText": t.price, "logo": t.logo, "cancelUrl": t.cancelUrl]
            rows.append(r)
        }
        if let d = try? JSONSerialization.data(withJSONObject: ["items": rows]) { WidgetShared.defaults.set(d, forKey: cacheKey) }
    }

    /// Kall mot serveren med app-tokenet (samme adresser som de andre widgetene).
    static func request(_ path: String, method: String = "GET", body: [String: Any]? = nil) async -> Data? {
        guard let token = WidgetShared.token, !token.isEmpty else { return nil }
        for base in WidgetShared.bases {
            let trimmed: String = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard let url = URL(string: trimmed + path) else { continue }
            var r = URLRequest(url: url)
            r.httpMethod = method
            r.timeoutInterval = 8
            r.setValue("application/json", forHTTPHeaderField: "Accept")
            r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            if let body {
                r.setValue("application/json", forHTTPHeaderField: "Content-Type")
                r.httpBody = try? JSONSerialization.data(withJSONObject: body)
            }
            if let pair = try? await URLSession.shared.data(for: r), let code = (pair.1 as? HTTPURLResponse)?.statusCode, code < 400 { return pair.0 }
        }
        return nil
    }

    /// Full adresse for en relativ sti (logoer).
    static func absolute(_ path: String) -> URL? {
        if path.hasPrefix("http://") || path.hasPrefix("https://") { return URL(string: path) }
        guard let base = WidgetShared.bases.first else { return nil }
        let trimmed: String = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: trimmed + (path.hasPrefix("/") ? path : "/" + path))
    }

    /// Markerer prøven som avsluttet på serveren.
    static func markCancelled(_ id: String) async -> Bool {
        let enc: String = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        if await request("/api/widgets/trials/" + enc, method: "POST", body: ["status": "cancelled", "action": "cancelled"]) != nil { return true }
        return await request("/finans/api/subscriptions/trials/" + enc, method: "PATCH", body: ["status": "cancelled"]) != nil
    }
}

/// «✓ Avsluttet» rett i widgeten (interaktiv widget, iOS 17+).
struct TrialDoneIntent32b: AppIntent {
    static var title: LocalizedStringResource = "Prøveperiode avsluttet"
    static var description = IntentDescription("Markerer prøveperioden som avsluttet og fjerner påminnelsene.")

    @Parameter(title: "Prøve")
    var trialId: String

    init() { trialId = "" }
    init(trialId: String) { self.trialId = trialId }

    func perform() async throws -> some IntentResult {
        if trialId.isEmpty { return .result() }
        Trials32b.dropCached(trialId)
        _ = await Trials32b.markCancelled(trialId)
        WidgetCenter.shared.reloadTimelines(ofKind: Trials32b.widgetKind)
        return .result()
    }
}
