import SwiftUI
import UIKit

/* ---------------- Prompt 23: Iconify-ikoner via backend (/api/icons/:prefix/:name.svg), tegnet som mal i tekstfargen ---------------- */

/// Én form i ikonet: banen i viewBox-koordinater, fyll og strek. Farge nil = currentColor (tekstfargen).
struct SVGShape23 {
    var path: Path
    var fill: Bool
    var fillColor: Color?
    var stroke: Bool
    var strokeColor: Color?
    var strokeWidth: CGFloat
    var cap: CGLineCap
    var join: CGLineJoin
    var evenOdd: Bool
    var opacity: Double
}

struct SVGIcon23 {
    var box: CGRect
    var shapes: [SVGShape23]
}

/// Baneleser for SVG «d»: M L H V C S Q T A Z (store og små bokstaver), tall med eksponent og sammenpressede bueflagg.
struct SVGPath23 {
    private let b: [UInt8]
    private var i: Int = 0

    init(_ d: String) { b = Array(d.utf8) }

    static func parse(_ d: String) -> Path {
        var p: SVGPath23 = SVGPath23(d)
        return p.run()
    }

    private func isDigit(_ c: UInt8) -> Bool { c >= 48 && c <= 57 }
    private func isLetter(_ c: UInt8) -> Bool { (c >= 65 && c <= 90) || (c >= 97 && c <= 122) }

    private mutating func skip() {
        while i < b.count {
            let c: UInt8 = b[i]
            if c == 32 || c == 44 || c == 9 || c == 10 || c == 13 { i += 1 } else { break }
        }
    }

    private mutating func num() -> CGFloat? {
        skip()
        let start: Int = i
        if i < b.count && (b[i] == 45 || b[i] == 43) { i += 1 }
        var digits: Bool = false
        while i < b.count && isDigit(b[i]) { i += 1; digits = true }
        if i < b.count && b[i] == 46 {
            i += 1
            while i < b.count && isDigit(b[i]) { i += 1; digits = true }
        }
        if digits && i < b.count && (b[i] == 101 || b[i] == 69) {
            var j: Int = i + 1
            if j < b.count && (b[j] == 45 || b[j] == 43) { j += 1 }
            if j < b.count && isDigit(b[j]) {
                i = j
                while i < b.count && isDigit(b[i]) { i += 1 }
            }
        }
        if !digits { i = start; return nil }
        let s: String = String(decoding: b[start..<i], as: UTF8.self)
        guard let v = Double(s) else { return nil }
        return CGFloat(v)
    }

    private mutating func flag() -> Bool? {
        skip()
        guard i < b.count else { return nil }
        if b[i] == 48 { i += 1; return false }
        if b[i] == 49 { i += 1; return true }
        return nil
    }

    private mutating func pt() -> CGPoint? {
        guard let x = num(), let y = num() else { return nil }
        return CGPoint(x: x, y: y)
    }

    mutating func run() -> Path {
        var path: Path = Path()
        var cur: CGPoint = .zero
        var start: CGPoint = .zero
        var lastC: CGPoint? = nil
        var lastQ: CGPoint? = nil
        var cmd: UInt8 = 0
        var guardN: Int = 0
        while guardN < 200_000 {
            guardN += 1
            skip()
            if i >= b.count { break }
            let c: UInt8 = b[i]
            if isLetter(c) {
                cmd = c
                i += 1
                if cmd == 90 || cmd == 122 {
                    path.closeSubpath()
                    cur = start
                    lastC = nil
                    lastQ = nil
                    continue
                }
            } else if cmd == 0 {
                i += 1
                continue
            }
            let rel: Bool = cmd >= 97
            let up: UInt8 = rel ? cmd - 32 : cmd
            let o: CGPoint = rel ? cur : .zero
            var ok: Bool = true
            switch up {
            case 77: // M
                if let p0 = pt() {
                    let p1: CGPoint = CGPoint(x: o.x + p0.x, y: o.y + p0.y)
                    path.move(to: p1)
                    cur = p1
                    start = p1
                    cmd = rel ? 108 : 76
                } else { ok = false }
                lastC = nil; lastQ = nil
            case 76: // L
                if let p0 = pt() {
                    let p1: CGPoint = CGPoint(x: o.x + p0.x, y: o.y + p0.y)
                    path.addLine(to: p1)
                    cur = p1
                } else { ok = false }
                lastC = nil; lastQ = nil
            case 72: // H
                if let x = num() {
                    let p1: CGPoint = CGPoint(x: rel ? cur.x + x : x, y: cur.y)
                    path.addLine(to: p1)
                    cur = p1
                } else { ok = false }
                lastC = nil; lastQ = nil
            case 86: // V
                if let y = num() {
                    let p1: CGPoint = CGPoint(x: cur.x, y: rel ? cur.y + y : y)
                    path.addLine(to: p1)
                    cur = p1
                } else { ok = false }
                lastC = nil; lastQ = nil
            case 67: // C
                if let a = pt(), let bb = pt(), let e = pt() {
                    let c1: CGPoint = CGPoint(x: o.x + a.x, y: o.y + a.y)
                    let c2: CGPoint = CGPoint(x: o.x + bb.x, y: o.y + bb.y)
                    let p1: CGPoint = CGPoint(x: o.x + e.x, y: o.y + e.y)
                    path.addCurve(to: p1, control1: c1, control2: c2)
                    lastC = c2
                    cur = p1
                } else { ok = false }
                lastQ = nil
            case 83: // S
                if let bb = pt(), let e = pt() {
                    let c1: CGPoint = lastC.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                    let c2: CGPoint = CGPoint(x: o.x + bb.x, y: o.y + bb.y)
                    let p1: CGPoint = CGPoint(x: o.x + e.x, y: o.y + e.y)
                    path.addCurve(to: p1, control1: c1, control2: c2)
                    lastC = c2
                    cur = p1
                } else { ok = false }
                lastQ = nil
            case 81: // Q
                if let a = pt(), let e = pt() {
                    let q: CGPoint = CGPoint(x: o.x + a.x, y: o.y + a.y)
                    let p1: CGPoint = CGPoint(x: o.x + e.x, y: o.y + e.y)
                    path.addQuadCurve(to: p1, control: q)
                    lastQ = q
                    cur = p1
                } else { ok = false }
                lastC = nil
            case 84: // T
                if let e = pt() {
                    let q: CGPoint = lastQ.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                    let p1: CGPoint = CGPoint(x: o.x + e.x, y: o.y + e.y)
                    path.addQuadCurve(to: p1, control: q)
                    lastQ = q
                    cur = p1
                } else { ok = false }
                lastC = nil
            case 65: // A
                if let rx = num(), let ry = num(), let rot = num(), let large = flag(), let sweep = flag(), let e = pt() {
                    let p1: CGPoint = CGPoint(x: o.x + e.x, y: o.y + e.y)
                    SVGPath23.arc(&path, from: cur, rx: rx, ry: ry, rotDeg: rot, large: large, sweep: sweep, to: p1)
                    cur = p1
                } else { ok = false }
                lastC = nil; lastQ = nil
            default:
                ok = false
            }
            if !ok {
                // Ukjent eller ødelagt segment: hopp over ett tegn så løkken alltid kommer videre.
                if i < b.count && !isLetter(b[i]) { i += 1 }
                if i >= b.count { break }
            }
        }
        return path
    }

    /// SVG-bue → kubiske Bézier-kurver (SVG 1.1 F.6).
    static func arc(_ path: inout Path, from p0: CGPoint, rx rx0: CGFloat, ry ry0: CGFloat, rotDeg: CGFloat, large: Bool, sweep: Bool, to p1: CGPoint) {
        var rx: Double = abs(Double(rx0))
        var ry: Double = abs(Double(ry0))
        if rx == 0 || ry == 0 || (p0.x == p1.x && p0.y == p1.y) { path.addLine(to: p1); return }
        let phi: Double = Double(rotDeg) * Double.pi / 180
        let cs: Double = cos(phi)
        let sn: Double = sin(phi)
        let dx2: Double = (Double(p0.x) - Double(p1.x)) / 2
        let dy2: Double = (Double(p0.y) - Double(p1.y)) / 2
        let x1p: Double = cs * dx2 + sn * dy2
        let y1p: Double = -sn * dx2 + cs * dy2
        let lam: Double = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lam > 1 { let s: Double = lam.squareRoot(); rx *= s; ry *= s }
        let num: Double = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
        let den: Double = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        let sign: Double = large != sweep ? 1 : -1
        let coef: Double = den == 0 ? 0 : sign * Swift.max(0, num / den).squareRoot()
        let cxp: Double = coef * rx * y1p / ry
        let cyp: Double = -coef * ry * x1p / rx
        let cx: Double = cs * cxp - sn * cyp + (Double(p0.x) + Double(p1.x)) / 2
        let cy: Double = sn * cxp + cs * cyp + (Double(p0.y) + Double(p1.y)) / 2
        let ux: Double = (x1p - cxp) / rx
        let uy: Double = (y1p - cyp) / ry
        let vx: Double = (-x1p - cxp) / rx
        let vy: Double = (-y1p - cyp) / ry
        let th1: Double = atan2(uy, ux)
        var dth: Double = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        if !sweep && dth > 0 { dth -= 2 * Double.pi }
        if sweep && dth < 0 { dth += 2 * Double.pi }
        let segs: Int = Swift.max(1, Int((abs(dth) / (Double.pi / 2)).rounded(.up)))
        let delta: Double = dth / Double(segs)
        let t: Double = 4.0 / 3.0 * tan(delta / 4)
        for k in 0..<segs {
            let a1: Double = th1 + Double(k) * delta
            let a2: Double = a1 + delta
            let e1x: Double = cos(a1)
            let e1y: Double = sin(a1)
            let e2x: Double = cos(a2)
            let e2y: Double = sin(a2)
            let c1: CGPoint = map(e1x - t * e1y, e1y + t * e1x, cx, cy, rx, ry, cs, sn)
            let c2: CGPoint = map(e2x + t * e2y, e2y - t * e2x, cx, cy, rx, ry, cs, sn)
            let end: CGPoint = k == segs - 1 ? p1 : map(e2x, e2y, cx, cy, rx, ry, cs, sn)
            path.addCurve(to: end, control1: c1, control2: c2)
        }
    }

    private static func map(_ ux: Double, _ uy: Double, _ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double, _ cs: Double, _ sn: Double) -> CGPoint {
        let x: Double = cx + rx * cs * ux - ry * sn * uy
        let y: Double = cy + rx * sn * ux + ry * cs * uy
        return CGPoint(x: x, y: y)
    }
}

/// Leser SVG-dokumentet (svg, g, path, circle, ellipse, rect, line, polyline, polygon) med arvede attributter.
final class SVGReader23: NSObject, XMLParserDelegate {
    private var stack: [[String: String]] = []
    private var transforms: [CGAffineTransform] = []
    private var skipDepth: Int = 0
    private(set) var box: CGRect = CGRect(x: 0, y: 0, width: 24, height: 24)
    private(set) var shapes: [SVGShape23] = []

    static func parse(_ data: Data) -> SVGIcon23? {
        let r: SVGReader23 = SVGReader23()
        let x: XMLParser = XMLParser(data: data)
        x.delegate = r
        guard x.parse() || !r.shapes.isEmpty else { return nil }
        if r.shapes.isEmpty { return nil }
        return SVGIcon23(box: r.box, shapes: r.shapes)
    }

    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes a: [String: String] = [:]) {
        let el: String = name.lowercased()
        if skipDepth > 0 || ["defs", "clippath", "mask", "lineargradient", "radialgradient", "pattern", "symbol", "style", "title", "desc", "metadata"].contains(el) {
            skipDepth += 1
            return
        }
        var attrs: [String: String] = stack.last ?? [:]
        // Ikke-arvelige attributter fjernes før de nye legges på.
        for k in ["d", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height", "x1", "y1", "x2", "y2", "points", "transform", "viewBox", "opacity"] { attrs[k] = nil }
        for (k, v) in a { attrs[k] = v }
        if let style = a["style"] {
            for part in style.split(separator: ";") {
                let kv: [Substring] = part.split(separator: ":", maxSplits: 1)
                if kv.count == 2 { attrs[kv[0].trimmingCharacters(in: .whitespaces)] = kv[1].trimmingCharacters(in: .whitespaces) }
            }
        }
        if let o = a["opacity"] { attrs["_op"] = String((Double(attrs["_op"] ?? "1") ?? 1) * (Double(o) ?? 1)) }
        stack.append(attrs)
        let parent: CGAffineTransform = transforms.last ?? .identity
        let own: CGAffineTransform = SVGReader23.transform(a["transform"] ?? "")
        let tf: CGAffineTransform = own.concatenating(parent)
        transforms.append(tf)
        if el == "svg" {
            if let vb = a["viewBox"] ?? a["viewbox"] {
                let n: [CGFloat] = SVGReader23.numbers(vb)
                if n.count == 4 && n[2] > 0 && n[3] > 0 { box = CGRect(x: n[0], y: n[1], width: n[2], height: n[3]) }
            } else if let w = a["width"].flatMap({ Double($0) }), let h = a["height"].flatMap({ Double($0) }), w > 0, h > 0 {
                box = CGRect(x: 0, y: 0, width: w, height: h)
            }
            return
        }
        guard let path = SVGReader23.shapePath(el, a) else { return }
        add(path.applying(tf), attrs)
    }

    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
        if skipDepth > 0 { skipDepth -= 1; return }
        if !stack.isEmpty { stack.removeLast() }
        if !transforms.isEmpty { transforms.removeLast() }
    }

    private func add(_ path: Path, _ attrs: [String: String]) {
        let fillRaw: String = (attrs["fill"] ?? "black").lowercased()
        let strokeRaw: String = (attrs["stroke"] ?? "none").lowercased()
        let fill: Bool = fillRaw != "none" && fillRaw != "transparent"
        let stroke: Bool = strokeRaw != "none" && strokeRaw != "transparent"
        if !fill && !stroke { return }
        let sw: CGFloat = CGFloat(Double(SVGReader23.stripUnit(attrs["stroke-width"] ?? "1")) ?? 1)
        let capRaw: String = attrs["stroke-linecap"] ?? "butt"
        let joinRaw: String = attrs["stroke-linejoin"] ?? "miter"
        let cap: CGLineCap = capRaw == "round" ? .round : capRaw == "square" ? .square : .butt
        let join: CGLineJoin = joinRaw == "round" ? .round : joinRaw == "bevel" ? .bevel : .miter
        let eo: Bool = (attrs["fill-rule"] ?? attrs["clip-rule"] ?? "") == "evenodd"
        let op: Double = Double(attrs["_op"] ?? "1") ?? 1
        let fo: Double = Double(attrs["fill-opacity"] ?? "1") ?? 1
        let shape: SVGShape23 = SVGShape23(path: path, fill: fill, fillColor: SVGReader23.color(fillRaw, alpha: fo), stroke: stroke,
                                           strokeColor: SVGReader23.color(strokeRaw, alpha: 1), strokeWidth: sw, cap: cap, join: join, evenOdd: eo, opacity: op)
        shapes.append(shape)
    }

    static func stripUnit(_ s: String) -> String {
        s.replacingOccurrences(of: "px", with: "").trimmingCharacters(in: .whitespaces)
    }

    static func numbers(_ s: String) -> [CGFloat] {
        var out: [CGFloat] = []
        var cur: String = ""
        for ch in s {
            if ch.isNumber || ch == "." || ch == "e" || (ch == "-" && (cur.isEmpty || cur.hasSuffix("e"))) {
                cur.append(ch)
            } else if ch == "-" {
                if let v = Double(cur) { out.append(CGFloat(v)) }
                cur = "-"
            } else {
                if let v = Double(cur) { out.append(CGFloat(v)) }
                cur = ""
            }
        }
        if let v = Double(cur) { out.append(CGFloat(v)) }
        return out
    }

    static func attr(_ a: [String: String], _ k: String) -> CGFloat {
        CGFloat(Double(stripUnit(a[k] ?? "0")) ?? 0)
    }

    static func shapePath(_ el: String, _ a: [String: String]) -> Path? {
        switch el {
        case "path":
            guard let d = a["d"], !d.isEmpty else { return nil }
            return SVGPath23.parse(d)
        case "circle":
            let r: CGFloat = attr(a, "r")
            guard r > 0 else { return nil }
            return Path(ellipseIn: CGRect(x: attr(a, "cx") - r, y: attr(a, "cy") - r, width: 2 * r, height: 2 * r))
        case "ellipse":
            let rx: CGFloat = attr(a, "rx")
            let ry: CGFloat = attr(a, "ry")
            guard rx > 0, ry > 0 else { return nil }
            return Path(ellipseIn: CGRect(x: attr(a, "cx") - rx, y: attr(a, "cy") - ry, width: 2 * rx, height: 2 * ry))
        case "rect":
            let w: CGFloat = attr(a, "width")
            let h: CGFloat = attr(a, "height")
            guard w > 0, h > 0 else { return nil }
            let rect: CGRect = CGRect(x: attr(a, "x"), y: attr(a, "y"), width: w, height: h)
            var rx: CGFloat = attr(a, "rx")
            var ry: CGFloat = attr(a, "ry")
            if rx == 0 { rx = ry }
            if ry == 0 { ry = rx }
            if rx > 0 { return Path(roundedRect: rect, cornerSize: CGSize(width: Swift.min(rx, w / 2), height: Swift.min(ry, h / 2))) }
            return Path(rect)
        case "line":
            var p: Path = Path()
            p.move(to: CGPoint(x: attr(a, "x1"), y: attr(a, "y1")))
            p.addLine(to: CGPoint(x: attr(a, "x2"), y: attr(a, "y2")))
            return p
        case "polyline", "polygon":
            let n: [CGFloat] = numbers(a["points"] ?? "")
            guard n.count >= 4 else { return nil }
            var p: Path = Path()
            p.move(to: CGPoint(x: n[0], y: n[1]))
            var k: Int = 2
            while k + 1 < n.count {
                p.addLine(to: CGPoint(x: n[k], y: n[k + 1]))
                k += 2
            }
            if el == "polygon" { p.closeSubpath() }
            return p
        default:
            return nil
        }
    }

    /// translate, scale, rotate og matrix (flere etter hverandre).
    static func transform(_ s: String) -> CGAffineTransform {
        if s.isEmpty { return .identity }
        var t: CGAffineTransform = .identity
        let parts: [Substring] = s.split(separator: ")")
        for part in parts {
            let pieces: [Substring] = part.split(separator: "(", maxSplits: 1)
            guard pieces.count == 2 else { continue }
            let name: String = pieces[0].trimmingCharacters(in: CharacterSet(charactersIn: " ,\t\n"))
            let n: [CGFloat] = numbers(String(pieces[1]))
            var m: CGAffineTransform = .identity
            switch name {
            case "translate":
                m = CGAffineTransform(translationX: n.first ?? 0, y: n.count > 1 ? n[1] : 0)
            case "scale":
                let sx: CGFloat = n.first ?? 1
                m = CGAffineTransform(scaleX: sx, y: n.count > 1 ? n[1] : sx)
            case "rotate":
                let ang: CGFloat = (n.first ?? 0) * CGFloat.pi / 180
                if n.count >= 3 {
                    m = CGAffineTransform(translationX: n[1], y: n[2]).rotated(by: ang).translatedBy(x: -n[1], y: -n[2])
                } else {
                    m = CGAffineTransform(rotationAngle: ang)
                }
            case "matrix":
                if n.count == 6 { m = CGAffineTransform(a: n[0], b: n[1], c: n[2], d: n[3], tx: n[4], ty: n[5]) }
            default:
                break
            }
            // Senere transformasjoner virker først (SVG leser fra høyre).
            t = m.concatenating(t)
        }
        return t
    }

    /// #rgb, #rrggbb, white og black. currentColor, gradienter og ukjent gir nil (tekstfargen).
    static func color(_ raw: String, alpha: Double) -> Color? {
        let s: String = raw.trimmingCharacters(in: .whitespaces)
        if s == "white" || s == "#fff" || s == "#ffffff" { return Color.white.opacity(alpha) }
        if s == "black" || s == "#000" || s == "#000000" { return Color.black.opacity(alpha) }
        guard s.hasPrefix("#") else { return nil }
        var hex: String = String(s.dropFirst())
        if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
        guard hex.count == 6, UInt64(hex, radix: 16) != nil else { return nil }
        return Color(hex: "#" + hex).opacity(alpha)
    }
}

/// Sett med egne farger (emoji, logoer, flagg) vises i farger; resten i tekstfargen.
enum IconSets23 {
    static let colorSets: [String] = ["noto", "twemoji", "fluent-emoji", "logos", "flag", "circle-flags"]

    static func colored(_ id: String) -> Bool {
        let prefix: String = String(id.split(separator: ":").first ?? "")
        return colorSets.contains(prefix) || prefix.contains("emoji") || prefix.hasPrefix("flag")
    }

    static let libs: [(String, String)] = [("", "Alle"), ("lucide", "Lucide"), ("material-symbols", "Material Symbols"), ("mdi", "Material Design"), ("ph", "Phosphor"),
                                           ("tabler", "Tabler"), ("heroicons", "Heroicons"), ("fa6-solid", "Font Awesome"), ("ri", "Remix"), ("fluent", "Fluent"),
                                           ("bi", "Bootstrap"), ("iconoir", "Iconoir"), ("carbon", "Carbon"), ("solar", "Solar"), ("mingcute", "MingCute"),
                                           ("streamline", "Streamline"), ("noto", "Noto emoji"), ("twemoji", "Twemoji")]
}

/// SVG-ene hentes én gang fra backend og lagres i Caches (ikoner23/), så de vises også uten nett.
@MainActor
final class IconCache23 {
    static let shared = IconCache23()
    private var mem: [String: SVGIcon23] = [:]
    private var missing: Set<String> = []
    private var inflight: [String: Task<SVGIcon23?, Never>] = [:]

    private func file(_ id: String) -> URL? {
        guard let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.appendingPathComponent("ikoner23", isDirectory: true) else { return nil }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let safe: String = id.replacingOccurrences(of: ":", with: "__").replacingOccurrences(of: "/", with: "_")
        return dir.appendingPathComponent(safe + ".svg")
    }

    func cached(_ id: String) -> SVGIcon23? { mem[id] }

    func icon(_ id: String, _ store: Store) async -> SVGIcon23? {
        if let i = mem[id] { return i }
        if missing.contains(id) { return nil }
        if let t = inflight[id] { return await t.value }
        let parts: [String] = id.split(separator: ":").map(String.init)
        guard parts.count == 2 else { return nil }
        let url: URL? = file(id)
        if let url, let d = try? Data(contentsOf: url), let i = SVGReader23.parse(d) {
            mem[id] = i
            return i
        }
        let api: API = store.api
        let path: String = "/api/icons/\(parts[0])/\(parts[1]).svg"
        let task: Task<SVGIcon23?, Never> = Task { () -> SVGIcon23? in
            guard let d = try? await api.bytes(path) else { return nil }
            guard let i = SVGReader23.parse(d) else { return nil }
            if let url { try? d.write(to: url, options: .atomic) }
            return i
        }
        inflight[id] = task
        let out: SVGIcon23? = await task.value
        inflight[id] = nil
        if let out { mem[id] = out } else { missing.insert(id) }
        return out
    }

    /// Ny innlogging eller ny server: prøv ikonene som manglet på nytt.
    func retryMissing() { missing = [] }

    /// Prompt 24: last ikonene inn i minnet på forhånd (fra disk, ellers backend), så fanene viser dem med en gang.
    func preload(_ ids: [String], _ store: Store) async {
        let todo: [String] = Array(Set(ids.filter { !$0.isEmpty && mem[$0] == nil }))
        if todo.isEmpty { return }
        await withTaskGroup(of: Void.self) { group in
            for id in todo {
                group.addTask { @MainActor in _ = await IconCache23.shared.icon(id, store) }
            }
        }
    }
}

/// Ikonet tegnet i Canvas: fyll og strek i tekstfargen (mal), eller egne farger for emoji- og flaggsett.
struct IconView23: View {
    @Environment(Store.self) private var store
    let id: String
    var size: CGFloat = 16
    var color: Color = .primary
    @State private var icon: SVGIcon23? = nil

    var body: some View {
        // Prompt 24: forhåndslastede ikoner tegnes i første bilde (minnet leses direkte), ikke først når .task er ferdig.
        let shown: SVGIcon23? = icon ?? IconCache23.shared.cached(id)
        Canvas { ctx, sz in
            guard let ic = shown else { return }
            draw(ic, ctx, sz)
        }
        .frame(width: size, height: size)
        .task(id: id) {
            if let c = IconCache23.shared.cached(id) { icon = c; return }
            icon = nil
            icon = await IconCache23.shared.icon(id, store)
        }
        .accessibilityHidden(true)
    }

    private func draw(_ ic: SVGIcon23, _ ctx: GraphicsContext, _ sz: CGSize) {
        let s: CGFloat = Swift.min(sz.width / ic.box.width, sz.height / ic.box.height)
        let dx: CGFloat = (sz.width - ic.box.width * s) / 2 - ic.box.minX * s
        let dy: CGFloat = (sz.height - ic.box.height * s) / 2 - ic.box.minY * s
        let tf: CGAffineTransform = CGAffineTransform(a: s, b: 0, c: 0, d: s, tx: dx, ty: dy)
        let colored: Bool = IconSets23.colored(id)
        for sh in ic.shapes {
            let p: Path = sh.path.applying(tf)
            var c2: GraphicsContext = ctx
            c2.opacity = sh.opacity
            if sh.fill {
                let fc: Color = colored ? (sh.fillColor ?? color) : color
                c2.fill(p, with: .color(fc), style: FillStyle(eoFill: sh.evenOdd))
            }
            if sh.stroke {
                let scol: Color = colored ? (sh.strokeColor ?? color) : color
                c2.stroke(p, with: .color(scol), style: StrokeStyle(lineWidth: sh.strokeWidth * s, lineCap: sh.cap, lineJoin: sh.join))
            }
        }
    }
}
