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

struct Boot: Decodable {
    let settings: Settings
    let categories: [Category]
    let accounts: [Account]
    let reviewCount: Int
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
    var role: String?
    var totp: Bool?
    var totpEnabled: Bool?
    var version: String?
    var twoFactor: Bool? { totp ?? totpEnabled }
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
