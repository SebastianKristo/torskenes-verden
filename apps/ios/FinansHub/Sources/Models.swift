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
    /// «✦ Analyser på nytt med Gemini»: feilet, lav sikkerhet eller usikker Ollama. reason = hvorfor ikke.
    var canReanalyze: Bool? = nil
    var reanalyzeReason: String? = nil
    var engine: String? = nil
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
    var canReanalyze: Bool? = nil
}

struct MealDay: Decodable, Identifiable, Hashable {
    let date: String
    let weekday: String?
    let name: String?
    let cost: Double?
    let source: String?
    let cook: String?
    let fixed: Bool?
    var dishId: FlexID? = nil
    var today: Bool? = nil
    var tag: String? = nil
    var bestCook: String? = nil
    var ingredients: [String]? = nil
    var id: String { date }
}

/// En rett i Matplan (ingredienser og fremgangsmåte).
struct Dish: Decodable, Identifiable, Hashable {
    let id: FlexID
    let name: String
    var src: String? = nil
    var ing: [String]? = nil
    var steps: [String]? = nil
    var cost: Double? = nil
    /// Mat (prompt 13): mappe, kilde, bilde, lenker og filer, tid og porsjoner.
    var folderId: String? = nil
    var sourceUrl: String? = nil
    var image: String? = nil
    var links: [DishLink] = []
    var time: String? = nil
    var servings: String? = nil

    enum K: String, CodingKey { case id, name, src, ing, ingredients, steps, cost, folderId, sourceUrl, image, links, time, servings }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = (try? c.decode(FlexID.self, forKey: .id)) ?? FlexID(UUID().uuidString)
        name = (try? c.decode(String.self, forKey: .name)) ?? ""
        src = try? c.decode(String.self, forKey: .src)
        let a = (try? c.decode([FlexText].self, forKey: .ing))?.map(\.value)
        let b = (try? c.decode([FlexText].self, forKey: .ingredients))?.map(\.value)
        ing = (a?.isEmpty == false ? a : b) ?? a
        steps = (try? c.decode([FlexText].self, forKey: .steps))?.map(\.value)
        cost = (try? c.decode(FlexNum.self, forKey: .cost))?.value
        let f = (try? c.decode(FlexID.self, forKey: .folderId))?.value
        folderId = (f?.isEmpty ?? true) ? nil : f
        sourceUrl = try? c.decode(String.self, forKey: .sourceUrl)
        image = try? c.decode(String.self, forKey: .image)
        links = (try? c.decode([DishLink].self, forKey: .links)) ?? []
        let t = (try? c.decode(FlexID.self, forKey: .time))?.value
        time = (t?.isEmpty ?? true) ? nil : t
        let s = (try? c.decode(FlexID.self, forKey: .servings))?.value
        servings = (s?.isEmpty ?? true) ? nil : s
    }
}

/// Tekst i en liste som kan komme som "…" eller {text|name|step: "…"}.
struct FlexText: Decodable, Hashable {
    let value: String
    enum K: String, CodingKey { case text, name, step, title }
    init(from d: Decoder) throws {
        if let s = try? d.singleValueContainer().decode(String.self) { value = s; return }
        let c = try d.container(keyedBy: K.self)
        value = (try? c.decode(String.self, forKey: .text)) ?? (try? c.decode(String.self, forKey: .name)) ?? (try? c.decode(String.self, forKey: .step)) ?? (try? c.decode(String.self, forKey: .title)) ?? ""
    }
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
    var end: String? = nil
    var week: Int? = nil
    var dishes: [Dish]? = nil
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
    var subcategory: String?
    /// Kategorien er laget av AI (vises med ✦).
    var aiCategory = false
    /// «Kategori › Underkategori».
    var categoryPath: String? { category.map { c in (aiCategory ? "✦ " : "") + (subcategory.map { "\(c) › \($0)" } ?? c) } }

    enum K: String, CodingKey { case id, description, date, amount, paidBy, split, domain, aiShort, category, subcategory, categoryPath, categoryLabel, categoryAi, aiCategory }
    private struct Named: Decodable { var name: String? }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        description = try? c.decode(String.self, forKey: .description)
        date = try? c.decode(String.self, forKey: .date)
        amount = try? c.decode(Double.self, forKey: .amount)
        paidBy = try? c.decode(String.self, forKey: .paidBy)
        split = try? c.decode(String.self, forKey: .split)
        domain = try? c.decode(String.self, forKey: .domain)
        aiShort = try? c.decode(String.self, forKey: .aiShort)
        // «category» kan være et navn, et objekt eller «Kategori › Underkategori».
        let raw = (try? c.decode(String.self, forKey: .categoryPath)) ?? (try? c.decode(String.self, forKey: .categoryLabel)) ?? (try? c.decode(String.self, forKey: .category)) ?? (try? c.decode(Named.self, forKey: .category))?.name
        let parts = (raw ?? "").components(separatedBy: "›").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        category = parts.first
        subcategory = (try? c.decode(String.self, forKey: .subcategory)) ?? (parts.count > 1 ? parts[1] : nil)
        aiCategory = (try? c.decode(Bool.self, forKey: .categoryAi)) ?? (try? c.decode(Bool.self, forKey: .aiCategory)) ?? false
    }
}

/// Boligkategori med underkategorier (GET /finans/api/boliger/categories).
struct BoligCategory: Decodable, Identifiable, Hashable {
    let id: Int
    var name: String
    var ai: Bool
    var children: [BoligCategory]
    enum K: String, CodingKey { case id, name, ai, createdByAi, children, subcategories }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        name = (try? c.decode(String.self, forKey: .name)) ?? ""
        ai = (try? c.decode(Bool.self, forKey: .ai)) ?? (try? c.decode(Bool.self, forKey: .createdByAi)) ?? false
        children = (try? c.decode([BoligCategory].self, forKey: .children)) ?? (try? c.decode([BoligCategory].self, forKey: .subcategories)) ?? []
    }
}
struct BoligCats: Decodable { var categories: [BoligCategory] }
struct Installment: Decodable, Hashable { var label: String?; var due: String?; var amount: Double?; var paid: Bool?; var paidAt: FlexDate?; var isPaid: Bool { paid == true || paidAt?.date != nil } }
struct Project: Decodable, Hashable { var id: FlexID?; var name: String?; var vendor: String?; var budget: Double?; var spent: Double?; var installments: [Installment]? }
struct Bill: Decodable, Hashable { var name: String?; var category: String?; var freq: String?; var payer: String?; var lastPaid: String?; var nextDue: String?; var amount: Double? }
struct CatSum: Decodable, Hashable {
    var name: String?; var amount: Double?
    /// Fordeling på underkategorier.
    var children: [CatSum]?
    /// Serveren sender {name, sum, subs: [{name, sum}]}; eldre servere amount og children.
    enum K: String, CodingKey { case name, amount, sum, subs, children, subcategories }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        name = try? c.decode(String.self, forKey: .name)
        amount = (try? c.decode(Double.self, forKey: .sum)) ?? (try? c.decode(Double.self, forKey: .amount))
        children = [K.subs, .children, .subcategories].lazy.compactMap { try? c.decode([CatSum].self, forKey: $0) }.first
    }
}

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

struct FinnStep: Decodable, Hashable {
    var t: String?; var done: Bool?; var date: String?
    enum K: String, CodingKey { case t, title, done, date }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        t = (try? c.decode(String.self, forKey: .t)) ?? (try? c.decode(String.self, forKey: .title))
        done = try? c.decode(Bool.self, forKey: .done)
        date = try? c.decode(String.self, forKey: .date)
    }
}
struct FinnDeal: Decodable, Identifiable, Hashable {
    let id: Int
    var role: String?
    var item: String?
    var counterpart: String?
    var date: String?
    var amount: Double?
    var steps: [FinnStep]?
    var done: Bool?
    /// Finn-koden, forsidebildet (egne bilder eller annonsens), sammendraget og ev. steg 1–4 fra serveren.
    var code: String?
    var image: String?
    var summary: String?
    var stage: Int?
    var next: String?
    /// Lagret finn.no-lenke til annonsen.
    var adUrl: String?

    enum K: String, CodingKey { case id, role, item, title, counterpart, date, amount, steps, done, code, finnCode, finnkode, order_id, image, cover, thumb, summary, stage, next, adUrl }
    /// «summary» er {text, emails, receipts …} fra serveren, eller ren tekst.
    struct SummaryText: Decodable { var text: String? }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = (try? c.decode(Int.self, forKey: .id)) ?? 0
        role = try? c.decode(String.self, forKey: .role)
        item = (try? c.decode(String.self, forKey: .item)) ?? (try? c.decode(String.self, forKey: .title))
        counterpart = try? c.decode(String.self, forKey: .counterpart)
        date = try? c.decode(String.self, forKey: .date)
        amount = try? c.decode(Double.self, forKey: .amount)
        steps = try? c.decode([FinnStep].self, forKey: .steps)
        done = try? c.decode(Bool.self, forKey: .done)
        code = [K.code, .finnCode, .finnkode, .order_id].lazy.compactMap { (try? c.decode(FlexID.self, forKey: $0))?.value }.first { !$0.isEmpty }
        image = [K.image, .cover, .thumb].lazy.compactMap { try? c.decode(String.self, forKey: $0) }.first { !$0.isEmpty }
        summary = (try? c.decode(String.self, forKey: .summary)) ?? (try? c.decode(SummaryText.self, forKey: .summary))?.text.flatMap { $0.isEmpty ? nil : $0 }
        adUrl = try? c.decode(String.self, forKey: .adUrl)
        stage = (try? c.decode(Int.self, forKey: .stage)).flatMap { (1...4).contains($0) ? $0 : nil }
        next = try? c.decode(String.self, forKey: .next)
    }

    var sold: Bool { role == "sold" }
    /// Betalt → Sendt → Mottatt → Godkjent ved kjøp, Solgt → Sendt → Levert → Utbetalt ved salg.
    var points: [String] { sold ? ["Solgt", "Sendt", "Levert", "Utbetalt"] : ["Betalt", "Sendt", "Mottatt", "Godkjent"] }
    /// Hvor langt handelen har kommet (1–4): serverens «stage», ellers tolkes stegene.
    var level: Int {
        if let stage { return stage }
        if done == true { return 4 }
        let ok = (steps ?? []).filter { $0.done == true }.compactMap { $0.t?.lowercased() }.joined(separator: " ")
        func has(_ words: [String]) -> Bool { words.contains { ok.contains($0) } }
        if has(["godkjent", "utbetalt", "fullført"]) { return 4 }
        if has(["levert", "mottatt", "hentet"]) { return 3 }
        if has(["sendt", "på vei"]) { return 2 }
        return 1
    }
    var finished: Bool { level >= 4 }
    var status: String { finished ? "Fullført" : points[level - 1] }
    var nextText: String {
        next ?? (sold ? ["Send pakken innen 5 dager", "Venter på levering", "Utbetaling innen 1 dag", "Fullført"]
                      : ["Venter på at selger sender", "Pakken er på vei til deg", "Godkjenn varen innen 24 t", "Fullført"])[level - 1]
    }
}
struct FinnList: Decodable { var items: [FinnDeal]; var bought: Double?; var sold: Double?; var ongoing: Int? }

struct FinnAd: Decodable, Hashable {
    var url: String?; var title: String?; var price: Double?; var place: String?; var description: String?; var images: [String]; var saved: String?
    enum K: String, CodingKey { case url, title, price, place, location, description, images, saved, fetched, created }
    private struct Img: Decodable { var url: String? }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        url = try? c.decode(String.self, forKey: .url)
        title = try? c.decode(String.self, forKey: .title)
        price = try? c.decode(Double.self, forKey: .price)
        place = (try? c.decode(String.self, forKey: .place)) ?? (try? c.decode(String.self, forKey: .location))
        description = try? c.decode(String.self, forKey: .description)
        images = (try? c.decode([String].self, forKey: .images)) ?? ((try? c.decode([Img].self, forKey: .images)) ?? []).compactMap(\.url)
        saved = (try? c.decode(String.self, forKey: .saved)) ?? (try? c.decode(String.self, forKey: .fetched)) ?? (try? c.decode(String.self, forKey: .created))
    }
}
struct FinnFile: Decodable, Identifiable, Hashable {
    var id: String; var name: String; var mime: String?; var url: String?; var thumb: String?
    enum K: String, CodingKey { case id, name, filename, mime, url, thumb }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = (try? c.decode(FlexID.self, forKey: .id))?.value ?? UUID().uuidString
        name = (try? c.decode(String.self, forKey: .name)) ?? (try? c.decode(String.self, forKey: .filename)) ?? "fil"
        mime = try? c.decode(String.self, forKey: .mime)
        url = try? c.decode(String.self, forKey: .url)
        thumb = try? c.decode(String.self, forKey: .thumb)
    }
}
struct FinnMail: Decodable, Identifiable, Hashable {
    var id: String; var date: String?; var from: String?; var subject: String?; var snippet: String?; var body: String?
    enum K: String, CodingKey { case id, date, from, subject, snippet, body, text }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = (try? c.decode(FlexID.self, forKey: .id))?.value ?? UUID().uuidString
        date = try? c.decode(String.self, forKey: .date)
        from = try? c.decode(String.self, forKey: .from)
        subject = try? c.decode(String.self, forKey: .subject)
        snippet = try? c.decode(String.self, forKey: .snippet)
        body = (try? c.decode(String.self, forKey: .body)) ?? (try? c.decode(String.self, forKey: .text))
    }
}
struct FinnLine: Decodable, Hashable {
    var label: String; var amount: Double
    enum K: String, CodingKey { case label, l, description, amount, v }
    init(label: String, amount: Double) { self.label = label; self.amount = amount }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        label = [K.label, .l, .description].lazy.compactMap { try? c.decode(String.self, forKey: $0) }.first ?? ""
        amount = (try? c.decode(Double.self, forKey: .amount)) ?? (try? c.decode(Double.self, forKey: .v)) ?? 0
    }
}
/// GET /finans/api/finn/:id – handelen med annonse, kvitteringer, e-poster og bilder.
/// Sendingen i en Finn-handel (GET /finn/:id → shipment). Tidspunkt kan være millisekunder eller ISO-tekst.
struct FinnShipment: Decodable {
    struct Ev: Decodable {
        var date: String?; var status: String?; var location: String?
        enum K: String, CodingKey { case ts, status, location }
        init(from d: Decoder) throws {
            let c = try d.container(keyedBy: K.self)
            if let n = (try? c.decode(FlexNum.self, forKey: .ts))?.value, n > 1e8 {
                date = isoDay(Date(timeIntervalSince1970: n > 1e11 ? n / 1000 : n))
            } else { date = try? c.decode(String.self, forKey: .ts) }
            status = try? c.decode(String.self, forKey: .status); location = try? c.decode(String.self, forKey: .location)
        }
    }
    var trackingNo: String?; var statusText: String?; var eta: String?; var pickupPoint: String?; var events: [Ev]
    enum K: String, CodingKey { case trackingNo, statusText, eta, pickupPoint, events }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        trackingNo = try? c.decode(String.self, forKey: .trackingNo); statusText = try? c.decode(String.self, forKey: .statusText)
        eta = try? c.decode(String.self, forKey: .eta); pickupPoint = try? c.decode(String.self, forKey: .pickupPoint)
        events = (try? c.decode([Ev].self, forKey: .events)) ?? []
    }
}

struct FinnDetail: Decodable {
    var deal: FinnDeal
    var ad: FinnAd?
    var receipts: [FinnFile]
    var emails: [FinnMail]
    var photos: [FinnFile]
    var summary: String?
    var lines: [FinnLine]
    /// Kvitteringen: total og «Betalt»/«Utbetalt» fra serveren; annonselenken serveren har funnet i e-postene.
    var total: Double?
    var totalLabel: String?
    var adUrlGuess: String?
    /// Fiks ferdig: sendingen fra Sporing (status og hendelser vises i tidslinjen).
    var shipment: FinnShipment?
    enum K: String, CodingKey { case deal, ad, receipts, emails, photos, lines, receipt, adUrlGuess, shipment }
    /// {lines: [{l, v}], total, totalLabel}
    private struct Paper: Decodable { var lines: [FinnLine]?; var total: Double?; var totalLabel: String? }
    init(deal: FinnDeal) { self.deal = deal; ad = nil; receipts = []; emails = []; photos = []; summary = deal.summary; lines = [] }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        // Handelen kan ligge under «deal» eller på toppnivå.
        deal = try (try? c.decode(FinnDeal.self, forKey: .deal)) ?? FinnDeal(from: d)
        ad = try? c.decode(FinnAd.self, forKey: .ad)
        receipts = (try? c.decode([FinnFile].self, forKey: .receipts)) ?? []
        emails = (try? c.decode([FinnMail].self, forKey: .emails)) ?? []
        photos = (try? c.decode([FinnFile].self, forKey: .photos)) ?? []
        summary = deal.summary
        let paper = try? c.decode(Paper.self, forKey: .receipt)
        lines = (try? c.decode([FinnLine].self, forKey: .lines)) ?? paper?.lines ?? []
        total = paper?.total
        totalLabel = paper?.totalLabel
        adUrlGuess = try? c.decode(String.self, forKey: .adUrlGuess)
        shipment = try? c.decode(FinnShipment.self, forKey: .shipment)
    }
    /// Bildene i karusellen: egne bilder først, så annonsens.
    var images: [String] { photos.compactMap { $0.url ?? $0.thumb } + (ad?.images ?? []) }
}

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

let domainSources = [("cloudflare", "Cloudflare"), ("tunnel", "Cloudflare Tunnel"), ("plausible", "Plausible"), ("umami", "Umami"), ("uptime", "Bare oppetid og SSL")]
func sourceName(_ s: String?) -> String { domainSources.first { $0.0 == s }?.1 ?? (s ?? "–") }
struct NamedVal: Decodable, Hashable {
    var name: String?
    var path: String?
    var pct: Double?
    var count: Double?
    var label: String { name ?? path ?? "–" }
    var value: Double { pct ?? count ?? 0 }
}
struct CountryVal: Decodable, Hashable { var iso2: String?; var iso3n: FlexID?; var name: String?; var visitors: Double?; var threats: Double? }
struct SeriesPoint: Decodable, Hashable { var t: String?; var requests: Double?; var cached: Double?; var visitors: Double? }
struct LiveNow: Decodable, Hashable { var visitors: Double?; var requests: Double?; var mb: Double?; var spark: [Double]? }
struct Ttfb: Decodable, Hashable { var p50: Double?; var p95: Double? }
struct ThreatEvent: Decodable, Hashable { var time: String?; var action: String?; var country: String?; var ip: String?; var path: String? }
struct Threats: Decodable, Hashable { var total: Double?; var types: [NamedVal]?; var events: [ThreatEvent]? }
struct SecuritySettings: Decodable, Hashable { var sslMode: String?; var alwaysHttps: Bool?; var minTls: String?; var dnssec: Bool?; var botFight: Bool?; var certExpires: String? }
struct DnsRecord: Decodable, Hashable { var type: String?; var name: String?; var content: String?; var proxied: Bool? }

/// Avkodes felt for felt: ett felt med uventet form (f.eks. null i uptime90 for dager uten måling)
/// skal ikke gi «Uventet svar fra serveren» for hele Domener-siden.
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
    var registrar: String?
    var nameServers: [String]?
    var source: String?
    var ip: String?

    enum K: String, CodingKey { case name, status, plan, mock, requests, visitors, pageviews, cachedPct, bytes, uptimePct, sslExpires, renews, series, live, countries, devices, browsers, statusCodes, ttfb, originMs, errorPct, http, tls, threats, security, topPages, referrers, uptime90, dns, registrar, nameServers, source, ip }

    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        name = try? c.decode(String.self, forKey: .name)
        status = try? c.decode(String.self, forKey: .status)
        plan = try? c.decode(String.self, forKey: .plan)
        mock = try? c.decode(Bool.self, forKey: .mock)
        requests = (try? c.decode(FlexNum.self, forKey: .requests))?.value
        visitors = (try? c.decode(FlexNum.self, forKey: .visitors))?.value
        pageviews = (try? c.decode(FlexNum.self, forKey: .pageviews))?.value
        cachedPct = (try? c.decode(FlexNum.self, forKey: .cachedPct))?.value
        bytes = (try? c.decode(FlexNum.self, forKey: .bytes))?.value
        uptimePct = (try? c.decode(FlexNum.self, forKey: .uptimePct))?.value
        sslExpires = try? c.decode(String.self, forKey: .sslExpires)
        renews = try? c.decode(String.self, forKey: .renews)
        series = try? c.decode([SeriesPoint].self, forKey: .series)
        live = try? c.decode(LiveNow.self, forKey: .live)
        countries = try? c.decode([CountryVal].self, forKey: .countries)
        devices = try? c.decode([NamedVal].self, forKey: .devices)
        browsers = try? c.decode([NamedVal].self, forKey: .browsers)
        statusCodes = (try? c.decode([String: FlexNum].self, forKey: .statusCodes))?.compactMapValues { $0.value }
        ttfb = try? c.decode(Ttfb.self, forKey: .ttfb)
        originMs = (try? c.decode(FlexNum.self, forKey: .originMs))?.value
        errorPct = (try? c.decode(FlexNum.self, forKey: .errorPct))?.value
        http = try? c.decode([NamedVal].self, forKey: .http)
        tls = try? c.decode([NamedVal].self, forKey: .tls)
        threats = try? c.decode(Threats.self, forKey: .threats)
        security = try? c.decode(SecuritySettings.self, forKey: .security)
        topPages = try? c.decode([NamedVal].self, forKey: .topPages)
        referrers = try? c.decode([NamedVal].self, forKey: .referrers)
        uptime90 = (try? c.decode([Double?].self, forKey: .uptime90))?.map { $0 ?? -1 }
        dns = try? c.decode([DnsRecord].self, forKey: .dns)
        registrar = try? c.decode(String.self, forKey: .registrar)
        nameServers = try? c.decode([String].self, forKey: .nameServers)
        source = try? c.decode(String.self, forKey: .source)
        ip = try? c.decode(String.self, forKey: .ip)
    }
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
    var line: String; var color: String?; var min: Int?; var time: String?; var to: String?
    enum K: String, CodingKey { case line, color, min, time, to }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        line = (try? c.decode(FlexID.self, forKey: .line))?.value ?? ""
        color = try? c.decode(String.self, forKey: .color); time = try? c.decode(String.self, forKey: .time)
        to = try? c.decode(String.self, forKey: .to)
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
    /// Egne navn på fanene: «hl.dom», «fin.bud» osv. Tomt = standardnavnet.
    var names: [String: String] = [:]
    /// Tilbake til startsiden: «arrow» (pil øverst, standard) eller «bar» (knapp i fanelinja).
    var backStyle = "arrow"
    /// Matplan: light | dark | system
    var matTheme = "light"
    /// Startside: homelab | fin-hjem | fin-liste | fin-budsjett (nil = ikke lagret på serveren)
    var start: String? = nil

    static let sections = ["clock", "search", "links", "os", "srv", "ruter"]
    static let hlAll = ["hl", "home", "trk", "dom", "mat"]
    static let finAll = ["home", "list", "finn", "bud", "ai", "mer"]
    /// Kan ikke skjules.
    static let fixedHl: Set<String> = ["hl", "home"]
    static let fixedFin: Set<String> = ["home", "mer"]
    /// Budsjett er skjult som fane (ligger øverst under Mer); Finn har tatt plassen (prompt 10).
    static let standard = HomeLayout(sec: sections, hlTabs: hlAll, finTabs: finAll, hide: ["srv": true, "ruter": true, "bud": true])

    func visible(_ id: String) -> Bool { hide[id] != true }

    /// Nye ID-er som ikke finnes i lagret oppsett legges sist; ukjente fjernes.
    static func fix(_ saved: [String]?, _ all: [String]) -> [String] {
        var out: [String] = []
        for x in saved ?? [] where all.contains(x) && !out.contains(x) { out.append(x) }
        for x in all where !out.contains(x) { out.append(x) }
        return out
    }

    var json: [String: Any] {
        var o: [String: Any] = ["sec": sec, "hlTabs": hlTabs, "finTabs": finTabs, "hide": hide, "names": names, "backStyle": backStyle, "matTheme": matTheme]
        if let start { o["start"] = start }
        return o
    }

    /// Fra serveren: {mobile: {...}} eller {sec, hlTabs, finTabs, hide}.
    static func from(json obj: Any?) -> HomeLayout? {
        guard let o = obj as? [String: Any] else { return nil }
        let m = (o["mobile"] as? [String: Any]) ?? o
        guard m["sec"] != nil || m["hlTabs"] != nil || m["finTabs"] != nil else { return nil }
        var hide = HomeLayout.standard.hide
        for (k, v) in (m["hide"] as? [String: Any]) ?? [:] { if let b = v as? Bool { hide[k] = b } }
        // Eldre oppsett uten Finn-fanen: Finn tar plassen til Budsjett, og Budsjett skjules.
        var fin = ((m["finTabs"] as? [String]) ?? []).filter { finAll.contains($0) }
        if !fin.isEmpty && !fin.contains("finn") {
            let at = fin.firstIndex(of: "bud") ?? fin.firstIndex(of: "ai") ?? fin.count
            fin.insert("finn", at: at)
            hide["bud"] = true
        }
        // Eldre oppsett uten Sporing: fanen settes inn foran Domener (samme som PWA-en).
        var hl = ((m["hlTabs"] as? [String]) ?? []).filter { hlAll.contains($0) }
        if !hl.isEmpty && !hl.contains("trk") { hl.insert("trk", at: hl.firstIndex(of: "dom") ?? hl.count) }
        var l = HomeLayout(sec: fix(m["sec"] as? [String], sections), hlTabs: fix(hl, hlAll), finTabs: fix(fin, finAll), hide: hide)
        for (k, v) in (m["names"] as? [String: Any]) ?? [:] {
            if let n = v as? String, !n.trimmingCharacters(in: .whitespaces).isEmpty { l.names[k] = String(n.prefix(30)) }
        }
        if let b = m["backStyle"] as? String, ["arrow", "bar"].contains(b) { l.backStyle = b }
        if let t = m["matTheme"] as? String, ["light", "dark", "system"].contains(t) { l.matTheme = t }
        if let st = m["start"] as? String, ["homelab", "fin-hjem", "fin-liste", "fin-budsjett"].contains(st) { l.start = st }
        return l
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
struct StoreHit: Decodable, Hashable { var name: String?; var count: Int?; var last: String? }
/// Svar fra ✦ AI-søk (POST /search/ai) eller vanlig søk (GET /search?q=).
struct AiAnswer: Decodable {
    var q: String?
    var answer: String?
    var hits: [AiHit]?
    var engine: String?
    var suggestions: [String]?
    var followUps: [String]?
    var mode: String?
    var summary: String?
    var stores: [StoreHit]?
    var aiUnavailable: Bool?
    /// Vanlig søk ga treff for 1–2 ord, så AI ble ikke brukt («✦ Spør AI likevel» sender force).
    var plainFirst: Bool?
    var notice: String?
    var text: String? { (answer ?? "").isEmpty ? summary : answer }
}
struct SuggestGroup: Decodable, Hashable { var title: String; var items: [String] }
struct SuggestGroups: Decodable { var groups: [SuggestGroup] }

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
