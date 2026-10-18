import Foundation
import WidgetKit

/* ---------------- Data fra GET /api/mobile/widgets ---------------- */

private func str(_ o: [String: Any]?, _ k: String) -> String? {
    guard let v = o?[k] else { return nil }
    if let s = v as? String { return s.isEmpty ? nil : s }
    if let n = v as? NSNumber { return n.stringValue }
    return nil
}
private func num(_ o: [String: Any]?, _ k: String) -> Double? {
    guard let v = o?[k] else { return nil }
    if let n = v as? NSNumber { return n.doubleValue }
    if let s = v as? String { return Double(s.replacingOccurrences(of: ",", with: ".")) }
    return nil
}
private func dict(_ o: [String: Any]?, _ k: String) -> [String: Any]? { o?[k] as? [String: Any] }
private func list(_ o: [String: Any]?, _ k: String) -> [[String: Any]] { (o?[k] as? [Any])?.compactMap { $0 as? [String: Any] } ?? [] }

struct WWeather {
    struct Hour { var t: String; var symbol: String; var temp: Double? }
    var temp: Double?
    var symbol = ""
    var desc = ""
    var hi: Double?
    var lo: Double?
    var feels: Double?
    var place = ""
    var hours: [Hour] = []
    init?(_ o: [String: Any]?) {
        guard let o else { return nil }
        temp = num(o, "temp")
        symbol = str(o, "symbol") ?? ""
        desc = str(o, "desc") ?? str(o, "text") ?? ""
        hi = num(o, "hi")
        lo = num(o, "lo")
        feels = num(o, "feels")
        place = str(o, "place") ?? "Vær"
        hours = list(o, "hours").map { h in
            var t = str(h, "t") ?? ""
            if t.count > 5, let r = t.range(of: "T") { t = String(t[r.upperBound...].prefix(2)) }
            return Hour(t: t, symbol: str(h, "symbol") ?? "", temp: num(h, "temp"))
        }
    }
}

struct WPackage: Identifiable {
    var id: String
    var name: String
    var carrier: String
    var carrierName: String
    var status: String
    var statusText: String
    var step: Int
    var eta: String
    var ready: Bool { status == "ready_for_pickup" }
}

struct WBudgetRow { var name: String; var spent: Double; var limit: Double; var color: String }
struct WTx { var merchant: String; var amount: Double }
struct WStock { var ticker: String; var changePct: Double }
struct WFinn { var title: String; var step: String; var status: String }
struct WDue { var title: String; var amount: Double?; var date: String }

struct WidgetData {
    var updated: Date?
    var weather: WWeather?
    var packages: [WPackage] = []
    var packagesActive = 0
    var budgetMonth = ""
    var spent: Double?
    var limit: Double?
    var pct: Double?
    var budgetTop: [WBudgetRow] = []
    var balance: Double?
    var recent: [WTx] = []
    var toReview = 0
    var nextName = ""
    var nextAmount: Double?
    var nextDate = ""
    var nextDays: Int?
    var stockValue: Double?
    var stockChange: Double?
    var stockPct: Double?
    var stockTop: [WStock] = []
    var domTotal = 0
    var domUp = 0
    var domDown = 0
    var mealToday = ""
    var mealCook = ""
    var mealTomorrow = ""
    var finnActive = 0
    var finnNet: Double?
    var finnItems: [WFinn] = []
    var bolig = ""
    var boligDue: [WDue] = []

    static let sample: WidgetData = {
        var d = WidgetData()
        var hours: [[String: Any]] = []
        for (t, v) in [("00", 6), ("01", 6), ("02", 5), ("03", 5), ("04", 4), ("05", 4)] {
            let h: [String: Any] = ["t": t, "temp": v]
            hours.append(h)
        }
        let w: [String: Any] = ["temp": 6, "symbol": "lightrain", "desc": "Lett regn", "hi": 9, "lo": 4, "place": "Oslo", "hours": hours]
        d.weather = WWeather(w)
        d.packages = [WPackage(id: "1", name: "Komplett · skjerm", carrier: "postnord", carrierName: "PostNord", status: "ready_for_pickup", statusText: "Klar for henting", step: 3, eta: ""),
                      WPackage(id: "2", name: "iPhone 14 Pro", carrier: "posten", carrierName: "Posten", status: "in_transit", statusText: "I transport", step: 2, eta: "I morgen")]
        d.packagesActive = 5
        d.budgetMonth = "oktober"; d.spent = 18420; d.limit = 24000; d.pct = 77
        d.balance = 48312
        d.recent = [WTx(merchant: "REMA 1000 Bislett", amount: -386.5), WTx(merchant: "Circle K Lading", amount: -612.4), WTx(merchant: "Lønn", amount: 32000)]
        d.toReview = 2
        d.nextName = "Spotify"; d.nextAmount = 239; d.nextDate = "2026-10-21"; d.nextDays = 3
        d.stockValue = 84210; d.stockPct = 1.8
        d.domTotal = 2; d.domUp = 2
        d.mealToday = "Fiskesuppe"; d.mealCook = "Ingrid"; d.mealTomorrow = "Taco"
        d.finnActive = 2; d.finnNet = 12300
        d.finnItems = [WFinn(title: "iPhone 14 Pro", step: "Sendt", status: "Godkjenn innen 24 t"), WFinn(title: "PS5 + 2 kontroller", step: "Solgt", status: "Send innen 19.10")]
        d.bolig = "Hytta"; d.boligDue = [WDue(title: "Strøm", amount: 1240, date: "2026-10-20")]
        return d
    }()

    init() {}

    /// «2026-10» → «oktober».
    static func monthName(_ s: String) -> String {
        let names = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"]
        let p = s.split(separator: "-")
        if p.count >= 2, let m = Int(p[1]), (1...12).contains(m) { return names[m - 1] }
        return s
    }

    init(json: Data) {
        let o = ((try? JSONSerialization.jsonObject(with: json)) as? [String: Any]) ?? [:]
        if let u = str(o, "updatedAt") { updated = ISO8601DateFormatter().date(from: u) }
        weather = WWeather(dict(o, "weather"))
        let p = dict(o, "packages")
        packages = list(p, "items").map { i in
            WPackage(id: str(i, "id") ?? UUID().uuidString, name: str(i, "name") ?? "Pakke", carrier: str(i, "carrier") ?? "other",
                     carrierName: str(i, "carrierName") ?? "", status: str(i, "status") ?? "unknown", statusText: str(i, "statusText") ?? "",
                     step: Int(num(i, "step") ?? 0), eta: str(i, "eta") ?? "")
        }
        packagesActive = Int(num(p, "active") ?? Double(packages.count))
        let b = dict(o, "budget")
        budgetMonth = WidgetData.monthName(str(b, "month") ?? "")
        spent = num(b, "spent"); limit = num(b, "limit"); pct = num(b, "pct")
        budgetTop = list(b, "top").map { WBudgetRow(name: str($0, "name") ?? "", spent: num($0, "spent") ?? 0, limit: num($0, "limit") ?? 0, color: str($0, "color") ?? "#FF7A3D") }
        let f = dict(o, "finance")
        balance = num(f, "balance")
        recent = list(f, "recent").map { WTx(merchant: str($0, "merchant") ?? "–", amount: num($0, "amount") ?? 0) }
        toReview = Int(num(f, "toReview") ?? 0)
        let n = dict(o, "nextCharge")
        nextName = str(n, "name") ?? ""; nextAmount = num(n, "amount"); nextDate = str(n, "date") ?? ""; nextDays = num(n, "daysLeft").map { Int($0) }
        let s = dict(o, "stocks")
        stockValue = num(s, "value"); stockChange = num(s, "change"); stockPct = num(s, "changePct")
        stockTop = list(s, "top").map { WStock(ticker: str($0, "ticker") ?? str($0, "name") ?? "", changePct: num($0, "changePct") ?? 0) }
        let dm = dict(o, "domains")
        domTotal = Int(num(dm, "total") ?? 0); domUp = Int(num(dm, "up") ?? 0); domDown = Int(num(dm, "down") ?? 0)
        let m = dict(o, "matplan")
        mealToday = str(dict(m, "today"), "dish") ?? ""; mealCook = str(dict(m, "today"), "cook") ?? ""; mealTomorrow = str(dict(m, "tomorrow"), "dish") ?? ""
        let fi = dict(o, "finn")
        finnActive = Int(num(fi, "active") ?? 0); finnNet = num(fi, "netYear")
        finnItems = list(fi, "items").map { i in
            let role = str(i, "role") ?? ""
            let label = role == "sold" ? "Solgt" : (role == "bought" ? "Kjøpt" : (str(i, "step") ?? ""))
            return WFinn(title: str(i, "title") ?? "", step: label, status: str(i, "status") ?? "")
        }
        let bo = dict(o, "boliger")
        bolig = str(bo, "name") ?? ""
        boligDue = list(bo, "dueSoon").map { WDue(title: str($0, "title") ?? "", amount: num($0, "amount"), date: str($0, "date") ?? "") }
    }
}

/* ---------------- Henting ---------------- */

enum WidgetFetch {
    /// Prøver adressene etter tur. Faller tilbake til siste lagrede svar.
    static func load() async -> (WidgetData, Bool) {
        guard let token = WidgetShared.token, !token.isEmpty else { return (WidgetData(), false) }
        for base in WidgetShared.bases {
            let trimmed = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard let url = URL(string: trimmed + "/api/mobile/widgets") else { continue }
            var r = URLRequest(url: url)
            r.timeoutInterval = 8
            r.setValue("application/json", forHTTPHeaderField: "Accept")
            r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            if let pair = try? await URLSession.shared.data(for: r), (pair.1 as? HTTPURLResponse)?.statusCode == 200 {
                let data = pair.0
                WidgetShared.cache = data
                return (WidgetData(json: data), true)
            }
        }
        if let c = WidgetShared.cache { return (WidgetData(json: c), true) }
        return (WidgetData(), true)
    }
}

struct WEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
    /// false = ikke logget inn i appen ennå.
    let linked: Bool
}

/// Én felles timeline for alle widgetene: henter hvert 15. minutt.
struct WProvider: TimelineProvider {
    func placeholder(in context: Context) -> WEntry { WEntry(date: Date(), data: .sample, linked: true) }

    func getSnapshot(in context: Context, completion: @escaping (WEntry) -> Void) {
        if context.isPreview { completion(WEntry(date: Date(), data: .sample, linked: true)); return }
        Task {
            let (d, linked) = await WidgetFetch.load()
            completion(WEntry(date: Date(), data: d, linked: linked))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WEntry>) -> Void) {
        Task {
            let (d, linked) = await WidgetFetch.load()
            let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
            completion(Timeline(entries: [WEntry(date: Date(), data: d, linked: linked)], policy: .after(next)))
        }
    }
}
