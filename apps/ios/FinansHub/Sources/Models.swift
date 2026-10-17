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

/* ---------- Formatering (norsk, minus som −) ---------- */

private let nb = Locale(identifier: "nb_NO")
private func fmt(_ v: Double, _ d: Int) -> String {
    let f = NumberFormatter()
    f.locale = nb; f.numberStyle = .decimal; f.minimumFractionDigits = d; f.maximumFractionDigits = d
    return (f.string(from: NSNumber(value: abs(v))) ?? "\(v)").replacingOccurrences(of: "\u{00a0}", with: " ")
}
func n2(_ v: Double) -> String { fmt(v, 2) }
func n0(_ v: Double) -> String { fmt(v, 0) }
func signed(_ v: Double) -> String { (v < 0 ? "−" : "+") + n2(v) }
func neg0(_ v: Double) -> String { (v < 0 ? "−" : "") + n0(v) }
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
}
