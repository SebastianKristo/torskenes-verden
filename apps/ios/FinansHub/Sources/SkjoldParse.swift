import SwiftUI
import UIKit

/* ---------------- Prompt 76 (SKJIOS): Skjold Lab – lesing av serverens svar, cache og homografi ----------------
 Svarene leses romslig (tall eller tekst for id, camelCase eller snake_case), så appen tåler små avvik fra SKJSRV. */

extension Skjold76 {
    /// Liste fra et svar som enten er en tabell eller {items|cabinets|categories|free: […]}.
    nonisolated static func rows(_ d: Data, _ key: String) -> [[String: Any]] {
        let raw: Any? = try? JSONSerialization.jsonObject(with: d)
        if let a = raw as? [Any] { return a.compactMap { $0 as? [String: Any] } }
        let o: [String: Any] = (raw as? [String: Any]) ?? [:]
        for k in [key, "items", "cabinets", "categories", "free"] {
            let l: [[String: Any]] = JS.list(o, k)
            if !l.isEmpty { return l }
        }
        return []
    }

    nonisolated static func enc(_ s: String) -> String {
        var ok: CharacterSet = CharacterSet.urlQueryAllowed
        ok.remove(charactersIn: "&=+?#")
        return s.addingPercentEncoding(withAllowedCharacters: ok) ?? s
    }

    /// 12 → «12», 1.5 → «1,5».
    nonisolated static func num(_ v: Double) -> String {
        if v == v.rounded() { return String(Int(v)) }
        return String(format: "%.2f", v).replacingOccurrences(of: "0+$", with: "", options: .regularExpression).replacingOccurrences(of: ".", with: ",")
    }

    /// Id-en tilbake til serveren: tall når den er et tall.
    nonisolated static func idv(_ s: String) -> Any { Int(s).map { $0 as Any } ?? s }

    nonisolated static func locBody(_ l: Skj76Loc) -> [String: Any] {
        var b: [String: Any] = ["cabinetId": idv(l.cabinetId), "row": l.row, "col": l.col]
        b["compartment"] = l.comp.map { $0 as Any } ?? NSNull()
        return b
    }

    nonisolated static func suggestText(_ v: Any) -> Skj76Suggest? {
        if let s = v as? String { return Skj76Suggest(text: s) }
        guard let o = v as? [String: Any], let t = JS.str(o, "text") ?? JS.str(o, "name") ?? JS.str(o, "label") else { return nil }
        let isPart: Bool = (JS.str(o, "kind") ?? "part") == "part"
        return Skj76Suggest(text: t, sub: JS.str(o, "sub") ?? "", partId: isPart ? (JS.str(o, "id") ?? "") : "")
    }

    /// Filnavn eller sti → sti fra serverens rot (/api/skjold/files/<navn>).
    nonisolated static func path(_ s: String?) -> String {
        guard let s, !s.isEmpty else { return "" }
        if s.hasPrefix("/") || s.hasPrefix("http") { return s }
        if s.hasPrefix("api/") { return "/" + s }
        return Skjold76.prefix + Skjold76.root + "/files/" + s
    }

    nonisolated static func point(_ o: [String: Any]?) -> CGPoint? {
        guard let x = JS.num(o, "x"), let y = JS.num(o, "y") else { return nil }
        return CGPoint(x: x, y: y)
    }

    nonisolated static func cabinet(_ o: [String: Any]) -> Skj76Cabinet {
        var c: Skj76Cabinet = Skj76Cabinet(id: JS.str(o, "id") ?? "")
        c.name = JS.str(o, "name") ?? "Skap"
        c.rows = Swift.max(1, JS.int(o, "rows") ?? 12)
        c.cols = Swift.max(1, JS.int(o, "cols") ?? 5)
        c.kind = JS.str(o, "kind") ?? "kjøpt"
        c.photoUrl = path(JS.str(o, "photoUrl") ?? JS.str(o, "photo"))
        c.thumbUrl = path(JS.str(o, "thumbUrl"))
        let k: [String: Any]? = JS.dict(o, "corners") ?? JS.dict(o, "photo_corners")
        let pts: [CGPoint] = ["tl", "tr", "br", "bl"].compactMap { point(JS.dict(k, $0)) }
        c.corners = pts.count == 4 ? pts : []
        let n: [String: Any]? = JS.dict(o, "counts")
        c.parts = JS.int(n, "parts") ?? 0
        c.used = JS.int(n, "usedDrawers") ?? 0
        return c
    }

    nonisolated static func map(_ o: [String: Any]) -> Skj76Map {
        var m: Skj76Map = Skj76Map(rows: Swift.max(1, JS.int(o, "rows") ?? 12), cols: Swift.max(1, JS.int(o, "cols") ?? 5))
        for d in JS.list(o, "drawers") {
            guard let r = JS.int(d, "row"), let c = JS.int(d, "col") else { continue }
            var x: Skj76Drawer = Skj76Drawer(row: r, col: c)
            // «label» er alltid satt (standard «R4·S2»); egen etikett ligger i «customLabel» (null = ingen).
            x.label = d.keys.contains("customLabel") ? (JS.str(d, "customLabel") ?? "") : (JS.str(d, "label") ?? "")
            x.comps = Swift.max(1, JS.int(d, "compartments") ?? 1)
            x.color = JS.str(d, "color") ?? ""
            x.parts = JS.list(d, "parts").map { (p: [String: Any]) -> Skj76Mini in
                Skj76Mini(id: JS.str(p, "id") ?? UUID().uuidString, name: JS.str(p, "name") ?? "", thumbUrl: path(JS.str(p, "thumbUrl")), qty: JS.num(p, "qty") ?? 0)
            }
            x.count = JS.int(d, "count") ?? x.parts.count
            x.spanR = Swift.min(4, Swift.max(1, JS.int(d, "spanR") ?? JS.int(d, "span_r") ?? 1))
            x.spanC = Swift.min(4, Swift.max(1, JS.int(d, "spanC") ?? JS.int(d, "span_c") ?? 1))
            x.coveredBy = JS.str(d, "coveredBy") ?? JS.str(d, "covered_by") ?? ""
            m.drawers["\(r)-\(c)"] = x
        }
        return m
    }

    nonisolated static func part(_ o: [String: Any]) -> Skj76Part {
        var p: Skj76Part = Skj76Part(id: JS.str(o, "id") ?? "")
        p.name = JS.str(o, "name") ?? ""
        p.category = JS.str(o, "category") ?? ""
        p.desc = JS.str(o, "description") ?? ""
        p.specs = specs(o["specs"])
        p.qty = JS.num(o, "qty") ?? 0
        p.unit = JS.str(o, "unit") ?? "stk"
        p.minQty = JS.num(o, "minQty") ?? JS.num(o, "min_qty") ?? 0
        p.tags = tags(o["tags"])
        p.loc = loc(JS.dict(o, "location"))
        p.thumbUrl = path(JS.str(o, "thumbUrl"))
        p.photos = photos(o)
        if p.thumbUrl.isEmpty { p.thumbUrl = p.photos.first?.thumb ?? "" }
        p.url = JS.str(o, "url") ?? ""
        p.price = JS.num(o, "price")
        p.supplier = JS.str(o, "supplier") ?? ""
        return p
    }

    nonisolated static func specs(_ v: Any?) -> [Skj76Spec] {
        var raw: [String: Any]? = v as? [String: Any]
        if raw == nil, let s = v as? String, let d = s.data(using: .utf8) { raw = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] }
        guard let o = raw else { return [] }
        let order: [String] = ["verdi", "toleranse", "pakke", "spenning", "effekt", "størrelse", "lengde", "materiale"]
        let keys: [String] = o.keys.sorted { (a: String, b: String) -> Bool in
            let ia: Int = order.firstIndex(of: a) ?? 99
            let ib: Int = order.firstIndex(of: b) ?? 99
            return ia == ib ? a < b : ia < ib
        }
        return keys.map { Skj76Spec(k: $0, v: JS.str(o, $0) ?? "") }
    }

    nonisolated static func tags(_ v: Any?) -> [String] {
        if let a = v as? [Any] { return a.compactMap { $0 as? String } }
        if let s = v as? String {
            if let d = s.data(using: .utf8), let a = (try? JSONSerialization.jsonObject(with: d)) as? [Any] { return a.compactMap { $0 as? String } }
            return s.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        }
        return []
    }

    nonisolated static func loc(_ o: [String: Any]?) -> Skj76Loc? {
        guard let o, let r = JS.int(o, "row"), let c = JS.int(o, "col") else { return nil }
        let name: String = JS.str(o, "cabinet") ?? "Skap"
        let comp: Int? = JS.int(o, "compartment")
        let fallback: String = name + " · Rad \(r) · Skuff \(c)" + (comp.map { " · Rom \($0)" } ?? "")
        return Skj76Loc(cabinetId: JS.str(o, "cabinetId") ?? "", cabinet: name, row: r, col: c, comp: comp, text: JS.str(o, "text") ?? fallback)
    }

    nonisolated static func hist(_ o: [String: Any]) -> Skj76Hist {
        let a: String = JS.str(o, "action") ?? ""
        let from: [String: Any]? = JS.dict(o, "from")
        let to: [String: Any]? = JS.dict(o, "to")
        var t: String = a.prefix(1).uppercased() + a.dropFirst()
        if a == "antall", let f = JS.num(from, "qty"), let n = JS.num(to, "qty") { t = "Antall " + num(f) + " → " + num(n) }
        if a == "flyttet" {
            let f: String = JS.str(from, "short") ?? JS.str(from, "text") ?? JS.int(from, "row").map { r in "\(r)-\(JS.int(from, "col") ?? 0)" } ?? "uten plass"
            let n: String = JS.str(to, "short") ?? JS.str(to, "text") ?? JS.int(to, "row").map { r in "\(r)-\(JS.int(to, "col") ?? 0)" } ?? "uten plass"
            t = "Flyttet " + f + " → " + n
        }
        return Skj76Hist(id: JS.str(o, "id") ?? UUID().uuidString, action: a, at: JS.date(o["at"]), text: t)
    }

    nonisolated static func photos(_ o: [String: Any]) -> [Skj76Photo] {
        let raw: [Any] = (o["photoUrls"] as? [Any]) ?? (o["photos"] as? [Any]) ?? []
        return raw.compactMap { (v: Any) -> Skj76Photo? in
            if let s = v as? String { return Skj76Photo(url: path(s), thumb: path(s)) }
            guard let d = v as? [String: Any] else { return nil }
            let u: String = path(JS.str(d, "url") ?? JS.str(d, "file") ?? JS.str(d, "name"))
            if u.isEmpty { return nil }
            let t: String = path(JS.str(d, "thumbUrl") ?? JS.str(d, "thumb"))
            return Skj76Photo(url: u, thumb: t.isEmpty ? u : t)
        }
    }
}

/* ---------- Offline-cache (Caches/skjold76/<konto>/<nøkkel>.json) ---------- */

enum Skj76Cache {
    static func dir() -> URL? {
        guard let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        let scope: String = AcctScope.current.isEmpty ? "anon" : String(AcctScope.current.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) ? Character($0) : "_" })
        let u: URL = base.appendingPathComponent("skjold76", isDirectory: true).appendingPathComponent(scope, isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }

    static func put(_ key: String, _ d: Data) {
        guard let u = dir()?.appendingPathComponent(key + ".json") else { return }
        try? d.write(to: u, options: .atomic)
    }

    static func get(_ key: String) -> Data? {
        guard let u = dir()?.appendingPathComponent(key + ".json") else { return nil }
        return try? Data(contentsOf: u)
    }
}

/* ---------- Perspektiv: homografi fra rutenettet (bredde × høyde) til skapets 4 hjørner i bildet ----------
 CGAffineTransform holder ikke (parallellogram), så ProjectionTransform får hele 3×3-matrisen (Heckbert, kvadrat → firkant). */

struct Skj76Homography {
    /// X = (a·u + b·v + c) / (g·u + h·v + 1), Y = (d·u + e·v + f) / (g·u + h·v + 1), u og v i 0–1.
    var a: CGFloat, b: CGFloat, c: CGFloat
    var d: CGFloat, e: CGFloat, f: CGFloat
    var g: CGFloat, h: CGFloat

    /// q = [tl, tr, br, bl] i bildets punkter.
    static func square(to q: [CGPoint]) -> Skj76Homography? {
        guard q.count == 4 else { return nil }
        let p0: CGPoint = q[0], p1: CGPoint = q[1], p2: CGPoint = q[2], p3: CGPoint = q[3]
        let sx: CGFloat = p0.x - p1.x + p2.x - p3.x
        let sy: CGFloat = p0.y - p1.y + p2.y - p3.y
        if abs(sx) < 1e-9 && abs(sy) < 1e-9 {
            return Skj76Homography(a: p1.x - p0.x, b: p3.x - p0.x, c: p0.x, d: p1.y - p0.y, e: p3.y - p0.y, f: p0.y, g: 0, h: 0)
        }
        let dx1: CGFloat = p1.x - p2.x, dx2: CGFloat = p3.x - p2.x
        let dy1: CGFloat = p1.y - p2.y, dy2: CGFloat = p3.y - p2.y
        let den: CGFloat = dx1 * dy2 - dx2 * dy1
        if abs(den) < 1e-9 { return nil }
        let g: CGFloat = (sx * dy2 - dx2 * sy) / den
        let h: CGFloat = (dx1 * sy - sx * dy1) / den
        let a: CGFloat = p1.x - p0.x + g * p1.x
        let b: CGFloat = p3.x - p0.x + h * p3.x
        let d: CGFloat = p1.y - p0.y + g * p1.y
        let e: CGFloat = p3.y - p0.y + h * p3.y
        return Skj76Homography(a: a, b: b, c: p0.x, d: d, e: e, f: p0.y, g: g, h: h)
    }

    func apply(_ u: CGFloat, _ v: CGFloat) -> CGPoint {
        let w: CGFloat = g * u + h * v + 1
        return CGPoint(x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w)
    }

    /// Bildepunkt → (u, v) i 0–1 (for trykk på bildet).
    func invert(_ p: CGPoint) -> CGPoint? {
        // Løs a·u + b·v + c = X·(g·u + h·v + 1) og tilsvarende for Y (2×2).
        let m11: CGFloat = a - p.x * g, m12: CGFloat = b - p.x * h
        let m21: CGFloat = d - p.y * g, m22: CGFloat = e - p.y * h
        let r1: CGFloat = p.x - c, r2: CGFloat = p.y - f
        let det: CGFloat = m11 * m22 - m12 * m21
        if abs(det) < 1e-9 { return nil }
        return CGPoint(x: (r1 * m22 - m12 * r2) / det, y: (m11 * r2 - m21 * r1) / det)
    }

    /// Projeksjon for en visning på w × h punkter med origo øverst til venstre (radvektor-form, som CSS matrix3d).
    func projection(_ w: CGFloat, _ hgt: CGFloat) -> ProjectionTransform {
        var t: ProjectionTransform = ProjectionTransform()
        t.m11 = a / w
        t.m12 = d / w
        t.m13 = g / w
        t.m21 = b / hgt
        t.m22 = e / hgt
        t.m23 = h / hgt
        t.m31 = c
        t.m32 = f
        t.m33 = 1
        return t
    }
}
