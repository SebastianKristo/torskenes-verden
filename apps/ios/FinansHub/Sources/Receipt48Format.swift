import SwiftUI
import UIKit

// ---------------- Prompt 48: felles kvitteringsformat (shared/schemas/receipt.schema.json) og svaret fra POST /receipts/scan ----------------
// Feltnavn ut er ordrett som i schemaet: merchant, org_number, date, time, currency, items[{description, quantity, unit_price,
// amount}], discounts[{description, amount}] (negative beløp), subtotal, vat[{rate, amount}], total, payment_method,
// category_suggestion (fra brukerens kategoriliste, GET /finans/api/receipts/health → categories). All validering skjer på
// serveren; kontrollen her brukes bare til utkastet som vises lokalt når Glimt ikke svarer.

struct Rc48Item: Codable, Hashable, Identifiable {
    var id: String = UUID().uuidString
    var description: String
    var quantity: Double?
    var unitPrice: Double?
    var amount: Double

    enum CodingKeys: String, CodingKey {
        case description
        case quantity
        case unitPrice = "unit_price"
        case amount
    }

    init(description: String, quantity: Double? = nil, unitPrice: Double? = nil, amount: Double) {
        self.description = description
        self.quantity = quantity
        self.unitPrice = unitPrice
        self.amount = amount
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        description = (try? c.decodeIfPresent(String.self, forKey: .description)) ?? ""
        quantity = try? c.decodeIfPresent(Double.self, forKey: .quantity)
        unitPrice = try? c.decodeIfPresent(Double.self, forKey: .unitPrice)
        amount = (try? c.decodeIfPresent(Double.self, forKey: .amount)) ?? 0
    }
}

struct Rc48Discount: Codable, Hashable, Identifiable {
    var id: String = UUID().uuidString
    var description: String
    var amount: Double

    enum CodingKeys: String, CodingKey {
        case description
        case amount
    }

    init(description: String, amount: Double) {
        self.description = description
        self.amount = amount
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        description = (try? c.decodeIfPresent(String.self, forKey: .description)) ?? ""
        amount = (try? c.decodeIfPresent(Double.self, forKey: .amount)) ?? 0
    }
}

struct Rc48Vat: Codable, Hashable {
    var rate: Double
    var amount: Double
}

/// Felles kvitteringsformat.
struct Rc48Receipt: Codable, Hashable {
    var merchant: String = ""
    var orgNumber: String? = nil
    var date: String = ""
    var time: String? = nil
    var currency: String = "NOK"
    var items: [Rc48Item] = []
    var discounts: [Rc48Discount] = []
    var subtotal: Double? = nil
    var vat: [Rc48Vat] = []
    var total: Double = 0
    var paymentMethod: String? = nil
    var categorySuggestion: String = ""

    enum CodingKeys: String, CodingKey {
        case merchant
        case orgNumber = "org_number"
        case date
        case time
        case currency
        case items
        case discounts
        case subtotal
        case vat
        case total
        case paymentMethod = "payment_method"
        case categorySuggestion = "category_suggestion"
    }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        merchant = (try? c.decodeIfPresent(String.self, forKey: .merchant)) ?? ""
        orgNumber = try? c.decodeIfPresent(String.self, forKey: .orgNumber)
        date = (try? c.decodeIfPresent(String.self, forKey: .date)) ?? ""
        time = try? c.decodeIfPresent(String.self, forKey: .time)
        currency = (try? c.decodeIfPresent(String.self, forKey: .currency)) ?? "NOK"
        items = (try? c.decodeIfPresent([Rc48Item].self, forKey: .items)) ?? []
        discounts = (try? c.decodeIfPresent([Rc48Discount].self, forKey: .discounts)) ?? []
        subtotal = try? c.decodeIfPresent(Double.self, forKey: .subtotal)
        vat = (try? c.decodeIfPresent([Rc48Vat].self, forKey: .vat)) ?? []
        total = (try? c.decodeIfPresent(Double.self, forKey: .total)) ?? 0
        paymentMethod = try? c.decodeIfPresent(String.self, forKey: .paymentMethod)
        categorySuggestion = (try? c.decodeIfPresent(String.self, forKey: .categorySuggestion)) ?? ""
    }

    /// Klippet til grensene i schemaet (rabatter negative, gyldig valuta/klokkeslett, org.nr bare siffer).
    var cleaned: Rc48Receipt {
        var r: Rc48Receipt = self
        r.merchant = String(merchant.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120))
        let org: String = (orgNumber ?? "").filter { (ch: Character) in ch.isNumber }
        r.orgNumber = org.count == 9 ? org : nil
        r.date = date.trimmingCharacters(in: .whitespaces)
        let t: String = (time ?? "").trimmingCharacters(in: .whitespaces)
        r.time = Rc48Check.validTime(t) ? t : nil
        let cur: String = currency.trimmingCharacters(in: .whitespaces).uppercased()
        r.currency = cur.count == 3 && cur.allSatisfy({ (ch: Character) in ch.isASCII && ch.isLetter }) ? cur : "NOK"
        r.items = items.prefix(200).map { (i: Rc48Item) -> Rc48Item in
            var x: Rc48Item = i
            x.description = String(i.description.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
            x.amount = Rc48Check.round2(i.amount)
            return x
        }
        r.discounts = discounts.prefix(50).map { (d: Rc48Discount) -> Rc48Discount in
            var x: Rc48Discount = d
            x.description = String(d.description.trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
            x.amount = -abs(Rc48Check.round2(d.amount))
            return x
        }
        r.vat = Array(vat.prefix(10))
        r.total = Rc48Check.round2(total)
        if let p = paymentMethod?.trimmingCharacters(in: .whitespaces), !p.isEmpty { r.paymentMethod = String(p.prefix(40)) } else { r.paymentMethod = nil }
        r.categorySuggestion = String(categorySuggestion.prefix(80))
        return r
    }

    /// JSON (feltet «device_parse», og «receipt» i rettelsene).
    var json: String? {
        guard let d = try? JSONEncoder().encode(cleaned) else { return nil }
        return String(data: d, encoding: .utf8)
    }

    /// Samme som objekt (for API.call(json:)).
    var object: [String: Any]? {
        guard let s = json, let d = s.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
    }
}

/* ---------- Svaret fra POST /finans/api/receipts/scan og GET /finans/api/receipts/health ---------- */

struct Rc48Step: Decodable, Hashable, Identifiable {
    var step: String
    var name: String?
    var status: String
    var reason: String?
    var ms: Double?
    var engine: String?
    var model: String?
    var confidence: String?
    var error: String?
    var id: String { step }
}

struct Rc48ScanResponse: Decodable {
    var receiptId: String
    var receipt: Rc48Receipt?
    var confidence: String?
    var failedFields: [String]?
    var uncertainFields: [String]?
    var pipeline: [Rc48Step]?
    var used: String?
    var label: String?
    var engine: String?
    var model: String?
    var warnings: [String]?
    var errors: [String]?
    var seconds: Double?
    /// Prompt 51: kilden til butikknavnet (orgnr | known | model | user) og ferdig norsk merkelapp.
    var merchantSource: String?
    var merchantLabel: String?
    /// Prompt 51: den lagrede kvitteringen (receiptOut) – her bare ocr_raw og kilden til butikknavnet.
    var stored: Rc51Detail?

    enum CodingKeys: String, CodingKey {
        case receiptId = "receipt_id"
        case receipt
        case confidence
        case failedFields = "failed_fields"
        case uncertainFields = "uncertain_fields"
        case pipeline
        case used
        case label
        case engine
        case model
        case warnings
        case errors
        case seconds
        case merchantSource = "merchant_source"
        case merchantLabel = "merchant_label"
        case stored
    }

    /// Felt som feilet kontrollen eller er usikre (markeres i skjemaet).
    var flagged: Set<String> {
        var s: Set<String> = Set(failedFields ?? [])
        for f in uncertainFields ?? [] { s.insert(f) }
        if receipt == nil { s.formUnion(["merchant", "date", "total", "items"]) }
        if s.contains("schema") { s.formUnion(["merchant", "date", "total"]) }
        return s
    }
}

struct Rc48HealthSteps: Decodable {
    var deviceParse: Bool?
    var deviceOcr: Bool?
}

struct Rc48Health: Decodable {
    var categories: [String]?
    var steps: Rc48HealthSteps?
}

/* ---------- Merkelapp, kontroll og kategorier ---------- */

enum Rc48Check {
    static func round2(_ v: Double) -> Double { (v * 100).rounded() / 100 }

    /// Merkelappen for veien («iPhone», «Mac», «Glimt», «Gemini»), fra steget som ble brukt i pipeline.
    static func label(_ r: Rc48ScanResponse) -> String {
        switch r.used ?? "" {
        case "A": return "iPhone"
        case "B": return "iPhone + Glimt"
        case "C": return "Mac"
        case "T": return "Glimt"
        case "D": return "Gemini"
        default: return r.label ?? "Ikke tolket"
        }
    }

    static func confidenceText(_ c: String?) -> String {
        switch c ?? "" {
        case "high": return "Sikker"
        case "medium": return "Litt usikker"
        default: return "Usikker – sjekk feltene"
        }
    }

    static func statusText(_ s: String) -> String {
        switch s {
        case "ok": return "besto"
        case "failed": return "feilet kontrollen"
        case "error": return "feil"
        case "skipped": return "hoppet over"
        case "unavailable": return "utilgjengelig"
        case "compare": return "sammenlignet totalen"
        default: return s
        }
    }

    /// Kort tekst per felt som feilet (norsk).
    static func fieldName(_ f: String) -> String {
        switch f {
        case "merchant": return "Butikk"
        case "date": return "Dato"
        case "total": return "Totalsum"
        case "items": return "Varelinjene stemmer ikke med totalen"
        case "vat": return "MVA"
        case "org_number": return "Org.nr."
        case "time": return "Klokkeslett"
        case "discounts": return "Rabatter"
        case "schema": return "Formatet"
        default: return f
        }
    }

    static let day: DateFormatter = {
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Oslo")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func validDate(_ s: String) -> Bool { Receipt47.validDate(s) }

    static func validTime(_ s: String) -> Bool {
        let p: [Substring] = s.split(separator: ":")
        guard s.count == 5, p.count == 2, let h = Int(p[0]), let m = Int(p[1]) else { return false }
        return (0...23).contains(h) && (0...59).contains(m)
    }

    static func itemSum(_ r: Rc48Receipt) -> Double {
        r.items.reduce(0) { (a: Double, i: Rc48Item) in a + i.amount } + r.discounts.reduce(0) { (a: Double, d: Rc48Discount) in a + d.amount }
    }

    /// Lokal kontroll av utkastet (samme hovedregler som serveren: butikk, dato, total > 0, sum ±1 kr).
    static func localFlags(_ r: Rc48Receipt) -> Set<String> {
        var s: Set<String> = []
        if r.merchant.trimmingCharacters(in: .whitespaces).isEmpty { s.insert("merchant") }
        if !validDate(r.date) { s.insert("date") }
        if !(r.total > 0) { s.insert("total") }
        if !r.items.isEmpty && abs(itemSum(r) - r.total) > 1 { s.insert("items") }
        return s
    }

    /// Nærmeste kategori i brukerens liste (eksakt, uten store/små bokstaver, eller den ene inneholder den andre), ellers "".
    static func snap(_ s: String, to cats: [String]) -> String {
        let t: String = s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if t.isEmpty { return "" }
        if let c = cats.first(where: { (c: String) in c.lowercased() == t }) { return c }
        if let c = cats.first(where: { (c: String) in c.lowercased().hasPrefix(t) || t.hasPrefix(c.lowercased()) }) { return c }
        if let c = cats.first(where: { (c: String) in c.lowercased().contains(t) || t.contains(c.lowercased()) }) { return c }
        return ""
    }
}
