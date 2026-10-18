import Foundation
import SwiftUI
import UIKit

/* ---------------- Nyhetsleser, fotovindu og Mat: modeller (prompt 13) ---------------- */

struct NewsItem: Identifiable, Hashable {
    var id: String
    var feedId: String
    var feed: String
    var title: String
    var url: String
    var published: Date?
    var category: String
    var image: String
    var excerpt: String
    var ai: Bool

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        feedId = JS.str(o, "feedId") ?? ""
        feed = JS.str(o, "feed") ?? JS.str(o, "source") ?? ""
        title = JS.str(o, "title") ?? ""
        url = JS.str(o, "url") ?? JS.str(o, "link") ?? ""
        published = JS.date(o["published"] ?? o["date"])
        let fixed = JS.str(o, "category") ?? ""
        let aiCat = JS.str(o, "aiCategory") ?? JS.str(o, "ai_category") ?? ""
        category = fixed.isEmpty ? aiCat : fixed
        ai = JS.bool(o, "ai") ?? (fixed.isEmpty && !aiCat.isEmpty)
        image = JS.str(o, "image") ?? ""
        excerpt = JS.str(o, "excerpt") ?? JS.str(o, "summary") ?? ""
    }

    /// «09:12» i dag, ellers «18.10».
    var timeText: String {
        guard let d = published else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = Calendar.current.isDateInToday(d) ? "HH:mm" : "dd.MM"
        return f.string(from: d)
    }

    /// Forkortelse av kilden til merket i lista («NRK», «VG», «E24»).
    var short: String {
        let w = feed.split(separator: " ").first.map(String.init) ?? feed
        return String(w.prefix(4)).uppercased()
    }
}

struct NewsFeed: Identifiable, Hashable {
    var id: String
    var name: String
    var url: String
    var category: String
    var enabled: Bool
    var count: Int
    var lastError: String

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        name = JS.str(o, "name") ?? ""
        url = JS.str(o, "url") ?? ""
        category = JS.str(o, "category") ?? "auto"
        enabled = JS.bool(o, "enabled") ?? true
        count = JS.int(o, "count") ?? 0
        lastError = JS.str(o, "lastError") ?? ""
    }
}

struct NewsCategory: Identifiable, Hashable {
    var id: String
    var name: String
}

struct NewsData {
    var items: [NewsItem] = []
    var feeds: [NewsFeed] = []
    var aiSummary = true
    var aiCategorize = true
    var digest = ""
    var digestAt: Date?
    var categories: [NewsCategory] = NewsData.standardCategories

    static let standardCategories: [NewsCategory] = [
        NewsCategory(id: "siste", name: "Siste"), NewsCategory(id: "norge", name: "Norge"), NewsCategory(id: "verden", name: "Verden"),
        NewsCategory(id: "okonomi", name: "Økonomi"), NewsCategory(id: "sport", name: "Sport"), NewsCategory(id: "teknologi", name: "Teknologi"),
        NewsCategory(id: "kultur", name: "Kultur"),
    ]

    init() {}
    init(_ o: [String: Any]) {
        items = JS.list(o, "items").map(NewsItem.init)
        feeds = JS.list(o, "feeds").map(NewsFeed.init)
        let s = JS.dict(o, "settings")
        aiSummary = JS.bool(s, "aiSummary") ?? true
        aiCategorize = JS.bool(s, "aiCategorize") ?? true
        let d = JS.dict(o, "digest")
        digest = JS.str(d, "text") ?? ""
        digestAt = JS.date(d?["at"])
        let cats = JS.list(o, "categories").compactMap { c -> NewsCategory? in
            guard let id = JS.str(c, "id") else { return nil }
            return NewsCategory(id: id, name: JS.str(c, "name") ?? id.capitalized)
        }
        if !cats.isEmpty { categories = cats }
    }

    func name(of cat: String) -> String {
        categories.first { $0.id == cat.lowercased() }?.name ?? cat.capitalized
    }
}

/// Bakgrunnen i fotovinduet på Papir-forsiden.
struct PhotoWindow: Equatable {
    var kind: String
    var url: String
    var credit: String
    var gradient: String
    var symbol: String

    init(_ o: [String: Any], kind k: String) {
        kind = JS.str(o, "kind") ?? k
        url = JS.str(o, "url") ?? ""
        credit = JS.str(o, "credit") ?? ""
        gradient = JS.str(o, "gradient") ?? ""
        symbol = JS.str(o, "symbol") ?? ""
    }

    /// Fargene i CSS-gradienten fra serveren («linear-gradient(170deg,#4a5a6a,#2a3440)»).
    var colors: [Color] {
        guard let re = try? NSRegularExpression(pattern: "#[0-9a-fA-F]{6}\\b|#[0-9a-fA-F]{3}\\b") else { return [] }
        let ns = gradient as NSString
        return re.matches(in: gradient, range: NSRange(location: 0, length: ns.length)).map { Color(hex: ns.substring(with: $0.range)) }
    }

    /// iOS kan ikke vise SVG som bilde; da brukes gradienten.
    var hasBitmap: Bool { !url.isEmpty && !url.lowercased().hasSuffix(".svg") }
}

/* ---------- Mat ---------- */

struct MatFolder: Identifiable, Hashable {
    var id: String
    var name: String
    var sort: Int
    var count: Int
    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        name = JS.str(o, "name") ?? ""
        sort = JS.int(o, "sort") ?? 0
        count = JS.int(o, "count") ?? 0
    }
}

/// Lenke eller fil på en rett («Pizzadeig-kalkulator.xlsx»).
struct DishLink: Decodable, Hashable, Identifiable {
    var id: String
    var title: String
    var url: String
    var fileUrl: String
    var kind: String

    enum K: String, CodingKey { case id, title, url, fileUrl, kind }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = (try? c.decode(FlexID.self, forKey: .id))?.value ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        url = (try? c.decode(String.self, forKey: .url)) ?? ""
        fileUrl = (try? c.decode(String.self, forKey: .fileUrl)) ?? ""
        kind = (try? c.decode(String.self, forKey: .kind)) ?? "link"
    }

    var label: String {
        if !title.isEmpty { return title }
        if !url.isEmpty { return host(url) }
        return "Fil"
    }

    var kindName: String {
        switch kind {
        case "sheet": "Regneark"
        case "pdf": "PDF"
        case "video": "Video"
        case "doc": "Dokument"
        case "image": "Bilde"
        default: "Lenke"
        }
    }

    var icon: String {
        switch kind {
        case "sheet": "tablecells"
        case "pdf": "doc.richtext"
        case "video": "play.rectangle"
        case "doc": "doc.text"
        case "image": "photo"
        default: "link"
        }
    }

    var tint: Color {
        switch kind {
        case "sheet": Color(hex: "#2F7A4F")
        case "pdf": Color(hex: "#C8553D")
        case "video": Color(hex: "#D7263D")
        case "doc": Color(hex: "#2F5D8A")
        case "image": Color(hex: "#5B4A8A")
        default: Color(hex: "#6B665C")
        }
    }
}

/// Forhåndsvisning av en oppskrift hentet fra en nettside (før den lagres).
struct RecipePreview {
    var raw: [String: Any]
    var name: String
    var image: String
    var time: String
    var servings: String
    var ingredients: [String]
    var steps: [String]
    var sourceUrl: String
    var folderSuggestion: String
    var method: String

    init(_ o: [String: Any]) {
        raw = o
        name = JS.str(o, "name") ?? ""
        image = JS.str(o, "image") ?? ""
        time = JS.str(o, "time") ?? ""
        servings = JS.str(o, "servings") ?? ""
        ingredients = JS.strings(o, "ingredients")
        steps = JS.strings(o, "steps")
        sourceUrl = JS.str(o, "sourceUrl") ?? ""
        folderSuggestion = JS.str(o, "folderSuggestion") ?? ""
        method = JS.str(o, "method") ?? ""
    }

    var methodText: String {
        switch method {
        case "jsonld": "Lest fra oppskriftsdata på siden"
        case "microdata": "Lest fra merkingen på siden"
        case "ai": "✦ Lest av AI"
        default: ""
        }
    }
}

struct RecipeJob: Identifiable, Hashable {
    var id: String
    var status: String
    var error: String
    var dishId: String
    var name: String
    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        status = JS.str(o, "status") ?? "queued"
        error = JS.str(o, "error") ?? ""
        dishId = JS.str(o, "dishId") ?? ""
        name = JS.str(o, "name") ?? ""
    }
    var active: Bool { status == "queued" || status == "reading" }
    var statusText: String {
        switch status {
        case "queued": "I kø"
        case "reading": "✦ Leser …"
        case "done": "Ferdig"
        case "error": error.isEmpty ? "Feilet" : error
        default: status
        }
    }
}
