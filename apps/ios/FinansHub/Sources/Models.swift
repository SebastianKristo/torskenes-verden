import Foundation
import SwiftUI

struct Settings: Decodable {
    var name: String
    var provider: String
    var fallback: Bool
    var autoCat: Bool
    var n80: Bool
    var n100: Bool
    var nRc: Bool
    var minConf: Int
}

struct Category: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let color: String
    let kind: String
}

struct Account: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let type: String
    let last4: String?
    let balance: Double
}

struct Goal: Decodable, Hashable { var id: Int?; var name: String?; var saved: Double?; var target: Double?; var color: String? }
struct Rule: Decodable, Hashable { var id: Int?; var pattern: String?; var category: String? }

struct Boot: Decodable {
    let settings: Settings
    let categories: [Category]
    let accounts: [Account]
    let reviewCount: Int
    var goals: [Goal]? = nil
    var rules: [Rule]? = nil
}

struct Tx: Decodable, Identifiable, Hashable {
    let id: Int
    let date: String
    let amount: Double
    let description: String
    let category: String
    let categoryId: Int?
    let color: String
    let account: String
    let note: String
    let receipt: String?
    var aiShort: String? = nil
    var aiLong: String? = nil
    var domain: String? = nil
    var lines: [Line]? = nil
    var folder: String? = nil
    var folderId: Int? = nil
    var accountId: Int? = nil
    var receiptId: FlexID? = nil
    var merchant: String? = nil
}

struct TxPage: Decodable { let items: [Tx] }

struct Line: Decodable, Hashable { let description: String?; let amount: Double }
struct Extraction: Decodable, Hashable { let lines: [Line]? }

struct Receipt: Decodable, Identifiable, Hashable {
    let id: String
    let status: String
    let provider: String?
    let seconds: Double?
    let merchant: String?
    let date: String?
    let total: Double?
    let categoryId: Int?
    let accountId: Int?
    let confidence: Double?
    let flag: String?
    let error: String?
    let mime: String?
    let file: String?
    let thumb: String?
    let extraction: Extraction?
    let match: Tx?
    var aiShort: String? = nil
    var domain: String? = nil
}

struct Budget: Decodable, Identifiable, Hashable {
    let categoryId: Int
    let category: String
    let color: String
    let budget: Double
    let used: Double
    var count: Int? = nil
    var topMerchant: String? = nil
    var prevUsed: Double? = nil
    var id: Int { categoryId }
}

struct Summary: Decodable {
    let month: String
    let from: String
    let to: String
    let daysLeft: Int
    let inn: Double
    let ut: Double
    let budgetTotal: Double
    let budgetUsed: Double
    let left: Double
    let savedYear: Double
    let yearGoal: Double
    let budgets: [Budget]
    let recent: [Tx]
    let review: [Receipt]
    var innMonthly: [Double]? = nil
}

struct Job: Decodable, Identifiable, Hashable {
    let id: String
    let name: String?
    let status: String
    let progress: Int?
    let merchant: String?
    let total: Double?
}

struct MealDay: Decodable, Identifiable, Hashable {
    let date: String
    let weekday: String?
    let name: String?
    let cost: Double?
    let source: String?
    let cook: String?
    let fixed: Bool?
    var id: String { date }
}

struct ShopItem: Decodable, Identifiable, Hashable {
    let id: String
    let text: String
    let done: Bool
    enum K: String, CodingKey { case id, text, done }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? String((try? c.decode(Int.self, forKey: .id)) ?? 0)
        text = (try? c.decode(String.self, forKey: .text)) ?? ""
        done = (try? c.decode(Bool.self, forKey: .done)) ?? false
    }
}

struct Week: Decodable {
    let start: String?
    let days: [MealDay]
    let cooks: [String]?
    let shopping: [ShopItem]?
    let weekCost: Double?
    let auto: Bool?
}

/* ---------- Fleksible typer ---------- */

/// ID som kan komme som tall eller tekst.
struct FlexID: Decodable, Hashable, CustomStringConvertible {
    let value: String
    init(_ v: String) { value = v }
    init(from d: Decoder) throws {
        let c = try d.singleValueContainer()
        if let i = try? c.decode(Int.self) { value = String(i) } else { value = (try? c.decode(String.self)) ?? "" }
    }
    var description: String { value }
}

/// Tidspunkt som kan komme som millisekunder eller ISO-tekst.
struct FlexDate: Decodable, Hashable {
    let date: Date?
    init(from d: Decoder) throws {
        let c = try d.singleValueContainer()
        if let n = try? c.decode(Double.self) { date = n > 0 ? Date(timeIntervalSince1970: n > 1e11 ? n / 1000 : n) : nil }
        else if let s = try? c.decode(String.self) { date = ISO8601DateFormatter().date(from: s) ?? parseIsoDay(s) }
        else { date = nil }
    }
}
private func parseIsoDay(_ s: String) -> Date? { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.date(from: String(s.prefix(10))) }

/* ---------- Bruker og moduler ---------- */

struct Me: Decodable {
    var username: String?
    var name: String?
    var displayName: String?
    var role: String?
    var totp: Bool?
    var totpEnabled: Bool?
    var version: String?
    var avatarUrl: String?
    var serverName: String?
    var isMainAdmin: Bool?
    var twoFactor: Bool? { totp ?? totpEnabled }
    var label: String? { displayName ?? name }
}

struct Sub: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    var plan: String?
    var price: Double?
    var cycle: String?
    var nextDate: String?
    var usageNote: String?
    var lowUse: Bool?
    var active: Bool?
    var domain: String?
    var aiShort: String?
    var monthly: Double?
}
struct SubList: Decodable { var items: [Sub]; var monthly: Double?; var yearly: Double?; var lowUse: Double? }

struct Member: Decodable, Hashable {
    var id: FlexID?
    var name: String?
    var username: String?
    var role: String?
    var display: String { name ?? username ?? "?" }
}
struct Balance: Decodable, Hashable { var name: String?; var paid: Double?; var balance: Double? }
struct Entry: Decodable, Identifiable, Hashable {
    let id: Int
    var description: String?
    var date: String?
    var amount: Double?
    var paidBy: String?
    var split: String?
    var domain: String?
    var aiShort: String?
    var category: String?
}
struct Installment: Decodable, Hashable { var label: String?; var due: String?; var amount: Double?; var paid: Bool?; var paidAt: FlexDate?; var isPaid: Bool { paid == true || paidAt?.date != nil } }
struct Project: Decodable, Hashable { var id: FlexID?; var name: String?; var vendor: String?; var budget: Double?; var spent: Double?; var installments: [Installment]? }
struct Bill: Decodable, Hashable { var name: String?; var category: String?; var freq: String?; var payer: String?; var lastPaid: String?; var nextDue: String?; var amount: Double? }
struct CatSum: Decodable, Hashable { var name: String?; var amount: Double? }

/// Delt mappe (bolig, hytte, felles). Listen og detaljen kommer fra samme form; detaljen har flere felt.
struct Folder: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    var type: String?
    var address: String?
    var members: [Member]?
    var total: Double?
    var count: Int?
    var myRole: String?
    var role: String?
    var balances: [Balance]?
    var entries: [Entry]?
    var projects: [Project]?
    var bills: [Bill]?
    var categories: [CatSum]?
    var access: String? { myRole ?? role }
    var readOnly: Bool { access == "viewer" || access == "view" }
}

struct FinnStep: Decodable, Hashable { var t: String?; var done: Bool? }
struct FinnDeal: Decodable, Identifiable, Hashable {
    let id: Int
    var role: String?
    var item: String?
    var counterpart: String?
    var date: String?
    var amount: Double?
    var steps: [FinnStep]?
    var done: Bool?
}
struct FinnList: Decodable { var items: [FinnDeal]; var bought: Double?; var sold: Double?; var ongoing: Int? }

struct TokenInfo: Decodable, Identifiable, Hashable {
    let id: FlexID
    var name: String?
    var scopes: [String]?
    var created: FlexDate?
    var lastUsed: FlexDate?
    var last_used: FlexDate?
    var expires: FlexDate?
    var expiresAt: FlexDate?
}

/* ---------- Domener ---------- */

struct DomainRef: Decodable, Identifiable, Hashable { var id: FlexID?; let name: String; var source: String?; var key: String { name } }
struct NamedVal: Decodable, Hashable {
    var name: String?
    var path: String?
    var pct: Double?
    var count: Double?
    var label: String { name ?? path ?? "–" }
    var value: Double { pct ?? count ?? 0 }
}
struct CountryVal: Decodable, Hashable { var iso2: String?; var name: String?; var visitors: Double?; var threats: Double? }
struct SeriesPoint: Decodable, Hashable { var t: String?; var requests: Double?; var cached: Double?; var visitors: Double? }
struct LiveNow: Decodable, Hashable { var visitors: Double?; var requests: Double?; var mb: Double?; var spark: [Double]? }
struct Ttfb: Decodable, Hashable { var p50: Double?; var p95: Double? }
struct ThreatEvent: Decodable, Hashable { var time: String?; var action: String?; var country: String?; var ip: String?; var path: String? }
struct Threats: Decodable, Hashable { var total: Double?; var types: [NamedVal]?; var events: [ThreatEvent]? }
struct SecuritySettings: Decodable, Hashable { var sslMode: String?; var alwaysHttps: Bool?; var minTls: String?; var dnssec: Bool?; var botFight: Bool?; var certExpires: String? }
struct DnsRecord: Decodable, Hashable { var type: String?; var name: String?; var content: String?; var proxied: Bool? }

struct Analytics: Decodable {
    var name: String?
    var status: String?
    var plan: String?
    var mock: Bool?
    var requests: Double?
    var visitors: Double?
    var pageviews: Double?
    var cachedPct: Double?
    var bytes: Double?
    var uptimePct: Double?
    var sslExpires: String?
    var renews: String?
    var series: [SeriesPoint]?
    var live: LiveNow?
    var countries: [CountryVal]?
    var devices: [NamedVal]?
    var browsers: [NamedVal]?
    var statusCodes: [String: Double]?
    var ttfb: Ttfb?
    var originMs: Double?
    var errorPct: Double?
    var http: [NamedVal]?
    var tls: [NamedVal]?
    var threats: Threats?
    var security: SecuritySettings?
    var topPages: [NamedVal]?
    var referrers: [NamedVal]?
    var uptime90: [Double]?
    var dns: [DnsRecord]?
}

/* ---------- Formatering (norsk, minus som −) ---------- */

/// «Skjul beløp til jeg trykker»: beløp vises som prikker mens dette er på.
@Observable
final class Privacy {
    static let shared = Privacy()
    var hidden = false
}

private let nb = Locale(identifier: "nb_NO")
private func fmt(_ v: Double, _ d: Int) -> String {
    let f = NumberFormatter()
    f.locale = nb; f.numberStyle = .decimal; f.minimumFractionDigits = d; f.maximumFractionDigits = d
    return (f.string(from: NSNumber(value: abs(v))) ?? "\(v)").replacingOccurrences(of: "\u{00a0}", with: " ").replacingOccurrences(of: "\u{202f}", with: " ")
}
private let mask = "•••"
func n2(_ v: Double) -> String { Privacy.shared.hidden ? mask : fmt(v, 2) }
func n0(_ v: Double) -> String { Privacy.shared.hidden ? mask : fmt(v, 0) }
func signed(_ v: Double) -> String { Privacy.shared.hidden ? mask : (v < 0 ? "−" : "+") + n2(v) }
func neg0(_ v: Double) -> String { Privacy.shared.hidden ? mask : (v < 0 ? "−" : "") + n0(v) }
/// Tall som ikke er beløp (besøk, forespørsler) skjules aldri.
func count(_ v: Double) -> String {
    if v >= 1_000_000 { return String(format: "%.1f", v / 1_000_000).replacingOccurrences(of: ".", with: ",") + " mill." }
    if v >= 10_000 { return String(format: "%.1f", v / 1000).replacingOccurrences(of: ".", with: ",") + " k" }
    return fmt(v, 0)
}
func pct(_ v: Double) -> String { String(format: "%.1f %%", v).replacingOccurrences(of: ".", with: ",") }
func ddmm(_ d: String?) -> String {
    guard let d, d.count >= 10 else { return "–" }
    let c = Array(d)
    return "\(c[8])\(c[9]).\(c[5])\(c[6])"
}
private func date(_ s: String) -> Date? { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = nb; return f.date(from: s) }
func dayLabel(_ s: String) -> String {
    guard let d = date(s) else { return s }
    let f = DateFormatter(); f.locale = nb; f.dateFormat = "EEEE d. MMM"
    return f.string(from: d).capitalized(with: nb)
}
func monthLabel(_ m: String) -> String {
    guard let d = date(m + "-15") else { return m }
    let f = DateFormatter(); f.locale = nb; f.dateFormat = "LLLL"
    return f.string(from: d).capitalized(with: nb)
}
func initial(_ s: String) -> String { s.first(where: { $0.isLetter || $0.isNumber }).map { String($0).uppercased() } ?? "•" }

extension Color {
    init(hex: String) {
        let v = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0xA0A0AA
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
    static let accent = Color(hex: "#FF7A3D")
    static let accentLight = Color(hex: "#FFB08A")
    static let positive = Color(hex: "#9FE3C6")
    static let ink = Color(hex: "#1A0C04")
    static let paper = Color(hex: "#ECE8E0")
    /// Domener: mørkt glass med rosa aksent.
    static let domPink = Color(hex: "#FF9EBE")
    static let domRed = Color(hex: "#FF8A80")
}


/* ---------- Tall og tekst som kan komme i flere former ---------- */

/// Tall som kan komme som tall eller tekst.
struct FlexNum: Decodable, Hashable {
    let value: Double?
    init(from d: Decoder) throws {
        let c = try d.singleValueContainer()
        if let n = try? c.decode(Double.self) { value = n } else if let s = try? c.decode(String.self) { value = Double(s.replacingOccurrences(of: ",", with: ".")) } else { value = nil }
    }
}

/* ---------- Homelab (mobil forside) ---------- */

struct Weather: Decodable, Hashable {
    var place: String?; var temp: Double?; var text: String?; var wind: Double?; var max: Double?; var min: Double?
    enum K: String, CodingKey { case place, temp, text, wind, max, min }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        place = try? c.decode(String.self, forKey: .place); text = try? c.decode(String.self, forKey: .text)
        temp = (try? c.decode(FlexNum.self, forKey: .temp))?.value; wind = (try? c.decode(FlexNum.self, forKey: .wind))?.value
        max = (try? c.decode(FlexNum.self, forKey: .max))?.value; min = (try? c.decode(FlexNum.self, forKey: .min))?.value
    }
}

struct Shortcut: Decodable, Hashable {
    var name: String; var url: String; var local: Bool
    enum K: String, CodingKey { case name, url, local }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        name = (try? c.decode(String.self, forKey: .name)) ?? ""; url = (try? c.decode(String.self, forKey: .url)) ?? ""; local = (try? c.decode(Bool.self, forKey: .local)) ?? false
    }
}

struct Departure: Decodable, Hashable {
    var line: String; var color: String?; var min: Int?; var time: String?
    enum K: String, CodingKey { case line, color, min, time }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        line = (try? c.decode(FlexID.self, forKey: .line))?.value ?? ""
        color = try? c.decode(String.self, forKey: .color); time = try? c.decode(String.self, forKey: .time)
        min = (try? c.decode(FlexNum.self, forKey: .min))?.value.map { Int($0) }
    }
}

struct RuterLine: Decodable, Hashable {
    var from: String; var to: String; var departures: [Departure]
    enum K: String, CodingKey { case from, to, departures }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        from = (try? c.decode(String.self, forKey: .from)) ?? ""; to = (try? c.decode(String.self, forKey: .to)) ?? ""
        departures = (try? c.decode([Departure].self, forKey: .departures)) ?? []
    }
}

struct ServerStatus: Decodable, Hashable {
    var cpu: Double?; var mem: Double?; var disk: Double?; var temp: Double?; var uptimeText: String?
    enum K: String, CodingKey { case cpu, mem, disk, temp, uptime, uptimeText }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        cpu = (try? c.decode(FlexNum.self, forKey: .cpu))?.value; mem = (try? c.decode(FlexNum.self, forKey: .mem))?.value
        disk = (try? c.decode(FlexNum.self, forKey: .disk))?.value; temp = (try? c.decode(FlexNum.self, forKey: .temp))?.value
        if let t = try? c.decode(String.self, forKey: .uptimeText) { uptimeText = t }
        else if let t = try? c.decode(String.self, forKey: .uptime) { uptimeText = t }
        else if let sec = (try? c.decode(FlexNum.self, forKey: .uptime))?.value {
            let dd = Int(sec / 86400), hh = Int(sec.truncatingRemainder(dividingBy: 86400) / 3600)
            uptimeText = dd > 0 ? "\(dd) d \(hh) t" : "\(hh) t"
        } else { uptimeText = nil }
    }
}

/// Oppsettet av mobilforsiden (per bruker og enhet): rekkefølge og synlighet for widgets og faner.
struct HomeLayout: Codable, Equatable {
    var sec: [String]
    var hlTabs: [String]
    var finTabs: [String]
    var hide: [String: Bool]

    static let sections = ["clock", "search", "links", "os", "srv", "ruter"]
    static let hlAll = ["hl", "home", "dom", "mat"]
    static let finAll = ["home", "list", "bud", "ai", "mer"]
    /// Kan ikke skjules.
    static let fixedHl: Set<String> = ["hl", "home"]
    static let fixedFin: Set<String> = ["home", "mer"]
    static let standard = HomeLayout(sec: sections, hlTabs: hlAll, finTabs: finAll, hide: ["srv": true, "ruter": true])

    func visible(_ id: String) -> Bool { hide[id] != true }

    /// Nye ID-er som ikke finnes i lagret oppsett legges sist; ukjente fjernes.
    static func fix(_ saved: [String]?, _ all: [String]) -> [String] {
        var out: [String] = []
        for x in saved ?? [] where all.contains(x) && !out.contains(x) { out.append(x) }
        for x in all where !out.contains(x) { out.append(x) }
        return out
    }

    var json: [String: Any] { ["sec": sec, "hlTabs": hlTabs, "finTabs": finTabs, "hide": hide] }

    /// Fra serveren: {mobile: {...}} eller {sec, hlTabs, finTabs, hide}.
    static func from(json obj: Any?) -> HomeLayout? {
        guard let o = obj as? [String: Any] else { return nil }
        let m = (o["mobile"] as? [String: Any]) ?? o
        guard m["sec"] != nil || m["hlTabs"] != nil || m["finTabs"] != nil else { return nil }
        var hide = HomeLayout.standard.hide
        for (k, v) in (m["hide"] as? [String: Any]) ?? [:] { if let b = v as? Bool { hide[k] = b } }
        return HomeLayout(sec: fix(m["sec"] as? [String], sections), hlTabs: fix(m["hlTabs"] as? [String], hlAll), finTabs: fix(m["finTabs"] as? [String], finAll), hide: hide)
    }
}

struct MobileHome: Decodable {
    var name: String?; var serverName: String?; var avatarUrl: String?; var greeting: String?
    var weather: Weather?; var shortcuts: [Shortcut]; var ruter: [RuterLine]; var serverStatus: ServerStatus?
    enum K: String, CodingKey { case name, serverName, avatarUrl, greeting, weather, shortcuts, ruter, serverStatus }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        name = try? c.decode(String.self, forKey: .name); serverName = try? c.decode(String.self, forKey: .serverName)
        avatarUrl = try? c.decode(String.self, forKey: .avatarUrl); greeting = try? c.decode(String.self, forKey: .greeting)
        weather = try? c.decode(Weather.self, forKey: .weather); serverStatus = try? c.decode(ServerStatus.self, forKey: .serverStatus)
        shortcuts = (try? c.decode([Shortcut].self, forKey: .shortcuts)) ?? []
        ruter = (try? c.decode([RuterLine].self, forKey: .ruter)) ?? []
    }
}

/// Liste med tekster: ["…"], [{q}] eller {items|suggestions|history: […]}.
func parseStrings(_ d: Data) -> [String] {
    let obj = try? JSONSerialization.jsonObject(with: d)
    let arr: [Any] = (obj as? [Any]) ?? ((obj as? [String: Any]).flatMap { ($0["items"] ?? $0["suggestions"] ?? $0["history"]) as? [Any] }) ?? []
    return arr.compactMap { v -> String? in
        if let s = v as? String { return s }
        if let o = v as? [String: Any] { return (o["q"] ?? o["query"] ?? o["text"]) as? String }
        if let a = v as? [Any] { return a.first as? String }
        return nil
    }.filter { !$0.isEmpty }
}

/* ---------- Mer: sidene fra nettsiden ---------- */

struct Recurring: Decodable, Identifiable, Hashable {
    let id: Int
    var name: String
    var amount: Double
    var interval: String?
    var day: Int?
    var active: Bool?
    var category: String?
    var next: String?
    var isActive: Bool { active ?? true }
    /// Omregnet til per måned.
    var monthly: Double {
        let a = abs(amount)
        switch interval ?? "monthly" {
        case "yearly", "year", "annual": return a / 12
        case "weekly", "week": return a * 52 / 12
        case "quarterly": return a / 3
        default: return a
        }
    }
}

struct StockSummary: Decodable, Hashable { var total: Double?; var invested: Double?; var value: Double?; var result: Double?; var cash: Double?; var realized: Double? }
struct Position: Decodable, Hashable { var ticker: String?; var symbol: String?; var name: String?; var quantity: Double?; var avg: Double?; var price: Double?; var value: Double?; var pl: Double?; var plPct: Double?; var dayPct: Double? }
struct HistPoint: Decodable, Hashable { var date: String?; var value: Double? }
struct StockOrder: Decodable, Hashable { var symbol: String?; var side: String?; var quantity: Double?; var value: Double?; var price: Double?; var date: String? }
struct Dividend: Decodable, Hashable { var symbol: String?; var amount: Double?; var date: String? }
struct Stocks: Decodable {
    var configured: Bool?; var status: String?; var error: String?; var env: String?; var mock: Bool?
    var summary: StockSummary?; var positions: [Position]?; var history: [HistPoint]?; var orders: [StockOrder]?; var dividends: [Dividend]?
}

struct CatAmount: Decodable, Hashable { var category: String?; var color: String?; var amount: Double? }
struct MerchantAmount: Decodable, Hashable { var name: String?; var amount: Double?; var count: Int? }
struct MonthInOut: Decodable, Hashable { var month: String?; var inn: Double?; var ut: Double? }
struct Report: Decodable { var mode: String?; var total: Double?; var byCategory: [CatAmount]?; var merchants: [MerchantAmount]?; var months: [MonthInOut]? }

struct ImportRow: Decodable, Hashable { var date: String?; var description: String?; var raw: String?; var amount: Double?; var category: String?; var domain: String?; var aiShort: String?; var duplicate: Bool? }
struct ImportResult: Decodable { var rows: [ImportRow]?; var imported: Int?; var skipped: Int?; var errors: [String]? }

struct AiHit: Decodable, Hashable { var type: String?; var txId: Int?; var description: String?; var date: String?; var amount: Double?; var source: String?; var reason: String? }
struct AiAnswer: Decodable { var q: String?; var answer: String?; var hits: [AiHit]?; var engine: String?; var suggestions: [String]? }

/// Original kvittering og bankrad for en transaksjon (GET /transactions/:id/original).
struct OriginalFile: Hashable { let mime: String?; let fileUrl: String? }
struct BankRowInfo: Hashable { let rows: [DetailRow]; let raw: String }
struct Original: Hashable {
    let receipt: OriginalFile?
    let bank: BankRowInfo?
    static func parse(_ d: Data) -> Original {
        let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] ?? [:]
        let r = o["receipt"] as? [String: Any]
        let b = o["bankRow"] as? [String: Any]
        var bank: BankRowInfo? = nil
        if let b {
            func s(_ k: String) -> String? { (b[k] as? String).flatMap { $0.isEmpty ? nil : $0 } }
            var rows: [DetailRow] = []
            rows.append(DetailRow(k: "Dato", v: ddmmyyyy(s("bookingDate"))))
            rows.append(DetailRow(k: "Rentedato", v: ddmmyyyy(s("valueDate"))))
            if let x = s("description") { rows.append(DetailRow(k: "Forklaring", v: x)) }
            if let a = (b["amount"] as? NSNumber)?.doubleValue { rows.append(DetailRow(k: a < 0 ? "Ut" : "Inn", v: "\(n2(a)) kr")) }
            if let x = s("account") { rows.append(DetailRow(k: "Konto", v: x)) }
            if let x = s("source") { rows.append(DetailRow(k: "Bank", v: x)) }
            if let x = s("archiveReference") { rows.append(DetailRow(k: "Arkivref.", v: x)) }
            let rawObj = b["raw"]
            var raw = ""
            if let t = rawObj as? String { raw = t }
            else if let rawObj, JSONSerialization.isValidJSONObject(rawObj), let j = try? JSONSerialization.data(withJSONObject: rawObj, options: [.prettyPrinted, .sortedKeys]) { raw = String(data: j, encoding: .utf8) ?? "" }
            if raw.isEmpty, let j = try? JSONSerialization.data(withJSONObject: b, options: [.prettyPrinted, .sortedKeys]) { raw = String(data: j, encoding: .utf8) ?? "" }
            bank = BankRowInfo(rows: rows, raw: raw)
        }
        return Original(receipt: r.map { OriginalFile(mime: $0["mime"] as? String, fileUrl: ($0["fileUrl"] ?? $0["file"]) as? String) }, bank: bank)
    }
}

/// En rad på en Mer-side åpner en detaljside med felt og tilhørende transaksjoner.
struct DetailRow: Hashable { let k: String; let v: String }
struct DetailGroup: Hashable { let title: String; let rows: [DetailRow] }
struct DetailInfo: Hashable {
    let title: String
    var sub: String? = nil
    var value: String? = nil
    var valueSub: String? = nil
    var groups: [DetailGroup] = []
    var txQuery: String? = nil
}

/// Skjema for ny eller endret transaksjon.
struct TxDraft: Hashable {
    var id: Int?
    var income: Bool
    var description: String
    var amount: String
    var date: Date
    var categoryId: Int?
    var accountId: Int?
    var folderId: Int?
    var note: String
    var receipt: String?
}

func ddmmyyyy(_ d: String?) -> String {
    guard let d, d.count >= 10 else { return "–" }
    let c = Array(d)
    return "\(c[8])\(c[9]).\(c[5])\(c[6]).\(c[0])\(c[1])\(c[2])\(c[3])"
}

func longDate(_ d: Date = Date()) -> String {
    let f = DateFormatter(); f.locale = Locale(identifier: "nb_NO"); f.dateFormat = "EEEE d. MMMM"
    return f.string(from: d).capitalized(with: Locale(identifier: "nb_NO"))
}
