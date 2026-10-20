import SwiftUI
import UIKit
import CoreLocation

/* ---------------- Prompt 22: Familie nøyaktig etter Familie.dc.html (felles deler) ---------------- */

/// Tokenene for Familie (Papir lys / mørk), nøyaktig som i claude-code-familie-design.md.
struct Fam22Tok {
    let bg: Color
    let card: Color
    let ink: Color
    let mut: Color
    let line: Color
    let lab: Color
    let pos: Color

    static let light: Fam22Tok = Fam22Tok(bg: Color(hex: "#f3efe6"), card: Color.white, ink: Color(hex: "#1b1a17"), mut: Color(hex: "#7a7468"),
                                          line: Color(hex: "#d8d1c2"), lab: Color(hex: "#b23a2a"), pos: Color(hex: "#2f7a4f"))
    static let dark: Fam22Tok = Fam22Tok(bg: Color(hex: "#14130f"), card: Color(hex: "#211f19"), ink: Color(hex: "#f3efe6"), mut: Color(hex: "#8a8578"),
                                         line: Color(hex: "#34312a"), lab: Color(hex: "#f08a76"), pos: Color(hex: "#8fd3a5"))

    static func of(_ p: PaperPalette) -> Fam22Tok { p.dark ? Fam22Tok.dark : Fam22Tok.light }

    /// Faste farger fra designet (uavhengig av tema).
    static let fresh: Color = Color(hex: "#2f7a4f")
    static let stale: Color = Color(hex: "#d9a400")
    static let off: Color = Color(hex: "#9a9488")
    static let black: Color = Color(hex: "#1b1a17")
}

/// Etikett i versaler: Plex Mono 600, 10,5 pt, sperring 0,12 em, `lab`.
struct Fam22Label: View {
    @Environment(\.paper) private var p
    let text: String
    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        Text(text.uppercased()).font(PF.mono(10.5)).tracking(1.26).foregroundStyle(t.lab).lineLimit(1)
            .padding(.horizontal, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/* ---------- Ikonene (SVG-banene fra designet, 24 × 24) ---------- */

enum Fam22Icons {
    static let base: [String] = ["home", "work", "school", "heart", "cabin", "gym", "shop", "ball", "coffee", "tree", "plane", "star", "pin"]
    /// Prompt 42: de 13 fra før + 36 nye innebygde (samme nøkler som serveren, Icons42.swift).
    static let keys: [String] = base + Icons42.extraKeys

    static func name(_ k: String) -> String {
        if let x = Icons42.extra[k] { return x.0 }
        if k.hasPrefix("ify:") { return Icons42.ifyName(k) }
        switch k {
        case "home": return "Hjem"
        case "work": return "Jobb"
        case "school": return "Skole"
        case "heart": return "Familie"
        case "cabin": return "Hytte"
        case "gym": return "Trening"
        case "shop": return "Butikk"
        case "ball": return "Sport"
        case "coffee": return "Kafé"
        case "tree": return "Natur"
        case "plane": return "Reise"
        case "star": return "Favoritt"
        default: return "Sted"
        }
    }

    static func d(_ k: String) -> String {
        if let x = Icons42.extra[k] { return x.1 }
        if k.hasPrefix("ify:"), let p = Icons42.path(k) { return p }
        switch k {
        case "home": return "M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"
        case "work": return "M4 8h16v11H4zM9 8V5h6v3M4 13h16"
        case "school": return "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5"
        case "heart": return "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
        case "cabin": return "M3 20h18M5 20V11l7-6 7 6v9M10 20v-5h4v5"
        case "gym": return "M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"
        case "shop": return "M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0"
        case "ball": return "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18"
        case "coffee": return "M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M11 3v3"
        case "tree": return "M12 3l6 9h-4l4 6H6l4-6H6zM12 18v3"
        case "plane": return "M2 13l20-8-6 16-3-7-7-1z"
        case "star": return "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"
        default: return "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"
        }
    }

    static let refresh: String = "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"

    /// Standardikon etter navn: Hjem, Jobb, Skole, Mormor (Familie), Hytte; ellers Sted.
    static func defaultFor(_ name: String) -> String {
        switch name.trimmingCharacters(in: .whitespaces) {
        case "Hjem": return "home"
        case "Jobb": return "work"
        case "Skole": return "school"
        case "Mormor": return "heart"
        case "Hytta", "Hytte": return "cabin"
        default: return "pin"
        }
    }

    static func valid(_ k: String?) -> String? {
        guard let k else { return nil }
        if keys.contains(k) { return k }
        // Prompt 42: Iconify-ikon («ify:lucide:sailboat») med lagret path-data.
        if k.hasPrefix("ify:"), Icons42.path(k) != nil { return k }
        return nil
    }

    /// De 10 forhåndsvalgte fargene (ZPAL) og fargene nye soner får etter tur (ZC).
    static let palette: [String] = ["#b23a2a", "#d9662a", "#d9a400", "#2f7a4f", "#2e6f75", "#2b5d8a", "#5b4bb5", "#7a3b6b", "#c2417a", "#5c5850"]
    static let draftColors: [String] = ["#b23a2a", "#2b5d8a", "#2f6b45", "#a8661a", "#7a3b6b"]
}

/// Enkel SVG-baneleser (M L H V C S Q T A Z, store og små bokstaver) for ikonene over. Prompt 42: S, Q og T for Lucide/Tabler-ikoner.
struct Fam22PathParser {
    private var toks: [String] = []
    private var i: Int = 0
    private var path: Path = Path()
    private var cur: CGPoint = .zero
    private var start: CGPoint = .zero
    /// Siste kontrollpunkt for S (etter C/S) og T (etter Q/T).
    private var lastC: CGPoint? = nil
    private var lastQ: CGPoint? = nil

    init(_ d: String) { toks = Fam22PathParser.tokenize(d) }

    static func isCmd(_ s: String) -> Bool {
        guard s.count == 1 else { return false }
        return "MmLlHhVvCcSsQqTtAaZz".contains(s)
    }

    static func tokenize(_ d: String) -> [String] {
        var out: [String] = []
        var cur: String = ""
        var hasDot: Bool = false
        for ch in d {
            if ch.isLetter {
                if !cur.isEmpty { out.append(cur); cur = "" }
                out.append(String(ch))
                hasDot = false
            } else if ch == "-" {
                if !cur.isEmpty { out.append(cur) }
                cur = "-"
                hasDot = false
            } else if ch == "." {
                if hasDot {
                    out.append(cur)
                    cur = "."
                } else {
                    cur.append(ch)
                }
                hasDot = true
            } else if ch.isNumber {
                cur.append(ch)
            } else {
                if !cur.isEmpty { out.append(cur); cur = "" }
                hasDot = false
            }
        }
        if !cur.isEmpty { out.append(cur) }
        return out
    }

    private mutating func n() -> CGFloat {
        guard i < toks.count else { return 0 }
        let v: Double = Double(toks[i]) ?? 0
        i += 1
        return CGFloat(v)
    }

    mutating func run() -> Path {
        var cmd: String = "M"
        while i < toks.count {
            if Fam22PathParser.isCmd(toks[i]) {
                cmd = toks[i]
                i += 1
                if cmd == "Z" || cmd == "z" {
                    path.closeSubpath()
                    cur = start
                    continue
                }
            }
            if i >= toks.count || Fam22PathParser.isCmd(toks[i]) { continue }
            let keepC: CGPoint? = lastC, keepQ: CGPoint? = lastQ
            lastC = nil
            lastQ = nil
            switch cmd {
            case "M", "m":
                let x: CGFloat = n(), y: CGFloat = n()
                let pt: CGPoint = cmd == "m" ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                path.move(to: pt)
                cur = pt
                start = pt
                cmd = cmd == "m" ? "l" : "L"
            case "L", "l":
                let x: CGFloat = n(), y: CGFloat = n()
                let pt: CGPoint = cmd == "l" ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                path.addLine(to: pt)
                cur = pt
            case "H", "h":
                let x: CGFloat = n()
                let pt: CGPoint = CGPoint(x: cmd == "h" ? cur.x + x : x, y: cur.y)
                path.addLine(to: pt)
                cur = pt
            case "V", "v":
                let y: CGFloat = n()
                let pt: CGPoint = CGPoint(x: cur.x, y: cmd == "v" ? cur.y + y : y)
                path.addLine(to: pt)
                cur = pt
            case "C", "c":
                let x1: CGFloat = n(), y1: CGFloat = n(), x2: CGFloat = n(), y2: CGFloat = n(), x: CGFloat = n(), y: CGFloat = n()
                let rel: Bool = cmd == "c"
                let c1: CGPoint = rel ? CGPoint(x: cur.x + x1, y: cur.y + y1) : CGPoint(x: x1, y: y1)
                let c2: CGPoint = rel ? CGPoint(x: cur.x + x2, y: cur.y + y2) : CGPoint(x: x2, y: y2)
                let pt: CGPoint = rel ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                path.addCurve(to: pt, control1: c1, control2: c2)
                cur = pt
                lastC = c2
            case "S", "s":
                let x2: CGFloat = n(), y2: CGFloat = n(), x: CGFloat = n(), y: CGFloat = n()
                let rel: Bool = cmd == "s"
                let c1: CGPoint = keepC.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                let c2: CGPoint = rel ? CGPoint(x: cur.x + x2, y: cur.y + y2) : CGPoint(x: x2, y: y2)
                let pt: CGPoint = rel ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                path.addCurve(to: pt, control1: c1, control2: c2)
                cur = pt
                lastC = c2
            case "Q", "q":
                let x1: CGFloat = n(), y1: CGFloat = n(), x: CGFloat = n(), y: CGFloat = n()
                let rel: Bool = cmd == "q"
                let c: CGPoint = rel ? CGPoint(x: cur.x + x1, y: cur.y + y1) : CGPoint(x: x1, y: y1)
                let pt: CGPoint = rel ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                path.addQuadCurve(to: pt, control: c)
                cur = pt
                lastQ = c
            case "T", "t":
                let x: CGFloat = n(), y: CGFloat = n()
                let c: CGPoint = keepQ.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                let pt: CGPoint = cmd == "t" ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                path.addQuadCurve(to: pt, control: c)
                cur = pt
                lastQ = c
            case "A", "a":
                let rx: CGFloat = n(), ry: CGFloat = n(), rot: CGFloat = n(), large: CGFloat = n(), sweep: CGFloat = n(), x: CGFloat = n(), y: CGFloat = n()
                let pt: CGPoint = cmd == "a" ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                arc(rx: rx, ry: ry, rotDeg: rot, large: large != 0, sweep: sweep != 0, to: pt)
                cur = pt
            default:
                i += 1
            }
        }
        return path
    }

    /// SVG-bue → kubiske Bézier-kurver (endepunkt- til senterparametrisering, SVG 1.1 F.6).
    private mutating func arc(rx rx0: CGFloat, ry ry0: CGFloat, rotDeg: CGFloat, large: Bool, sweep: Bool, to p1: CGPoint) {
        let p0: CGPoint = cur
        var rx: Double = abs(Double(rx0)), ry: Double = abs(Double(ry0))
        if rx == 0 || ry == 0 || (p0.x == p1.x && p0.y == p1.y) { path.addLine(to: p1); return }
        let phi: Double = Double(rotDeg) * Double.pi / 180
        let cs: Double = cos(phi), sn: Double = sin(phi)
        let dx2: Double = (Double(p0.x) - Double(p1.x)) / 2, dy2: Double = (Double(p0.y) - Double(p1.y)) / 2
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
        let ux: Double = (x1p - cxp) / rx, uy: Double = (y1p - cyp) / ry
        let vx: Double = (-x1p - cxp) / rx, vy: Double = (-y1p - cyp) / ry
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
            let e1x: Double = cos(a1), e1y: Double = sin(a1)
            let e2x: Double = cos(a2), e2y: Double = sin(a2)
            let c1: CGPoint = Fam22PathParser.map(e1x - t * e1y, e1y + t * e1x, cx, cy, rx, ry, cs, sn)
            let c2: CGPoint = Fam22PathParser.map(e2x + t * e2y, e2y - t * e2x, cx, cy, rx, ry, cs, sn)
            let end: CGPoint = k == segs - 1 ? p1 : Fam22PathParser.map(e2x, e2y, cx, cy, rx, ry, cs, sn)
            path.addCurve(to: end, control1: c1, control2: c2)
        }
    }

    private static func map(_ ux: Double, _ uy: Double, _ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double, _ cs: Double, _ sn: Double) -> CGPoint {
        let x: Double = cx + rx * cs * ux - ry * sn * uy
        let y: Double = cy + rx * sn * ux + ry * cs * uy
        return CGPoint(x: x, y: y)
    }
}

struct Fam22GlyphShape: Shape {
    let d: String
    func path(in rect: CGRect) -> Path {
        var parser: Fam22PathParser = Fam22PathParser(d)
        let base: Path = parser.run()
        let s: CGFloat = Swift.min(rect.width, rect.height) / 24
        let tr: CGAffineTransform = CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: s, y: s)
        return base.applying(tr)
    }
}

/// Ikon med streken fra designet (viewBox 24, stroke-width oppgis i 24-enheter).
struct Fam22Glyph: View {
    let d: String
    let size: CGFloat
    let stroke: CGFloat
    let color: Color
    var body: some View {
        Fam22GlyphShape(d: d)
            .stroke(color, style: StrokeStyle(lineWidth: stroke * size / 24, lineCap: .round, lineJoin: .round))
            .frame(width: size, height: size)
    }
}

/* ---------- Ny sone (utkast) ---------- */

struct Fam22Draft {
    var name: String
    var lat: Double
    var lon: Double
    var radius: Double
    var color: String
    var icon: String?
    var shared: Bool

    var iconKey: String { Fam22Icons.valid(icon) ?? Fam22Icons.defaultFor(name) }
    var coord: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
}

/// Lokal reserve når serveren ennå ikke lagrer ikon (eldre server): sone-id → ikon, per konto.
enum Fam22Local {
    static func icon(_ zoneId: String) -> String? {
        let d: [String: String] = (UserDefaults.standard.dictionary(forKey: AcctScope.key("fh_fam_zone_icons")) as? [String: String]) ?? [:]
        return Fam22Icons.valid(d[zoneId])
    }

    static func setIcon(_ zoneId: String, _ icon: String) {
        var d: [String: String] = (UserDefaults.standard.dictionary(forKey: AcctScope.key("fh_fam_zone_icons")) as? [String: String]) ?? [:]
        d[zoneId] = icon
        UserDefaults.standard.set(d, forKey: AcctScope.key("fh_fam_zone_icons"))
    }
}

/* ---------- Tekst og farger ---------- */

enum Fam22Fmt {
    /// «Nå», «12 min siden», «3 t siden».
    static func ago(_ d: Date?) -> String {
        guard let d else { return "–" }
        let m: Int = Int((Date().timeIntervalSince(d) / 60).rounded())
        if m < 1 { return "Nå" }
        if m < 60 { return "\(m) min siden" }
        return "\(Int((Double(m) / 60).rounded())) t siden"
    }

    static func radius(_ r: Double) -> String {
        if r >= 1000 { return String(format: "%.1f", r / 1000).replacingOccurrences(of: ".", with: ",") + " km" }
        return "\(Int(r.rounded())) m"
    }

    static func kmh(_ pos: FamPos?) -> Int {
        guard let s = pos?.speed, s > 0 else { return 0 }
        return Int((s * 3.6).rounded())
    }

    static func activity(_ pos: FamPos?) -> String {
        let k: Int = kmh(pos)
        switch pos?.activity ?? "" {
        case "walking": return "Går"
        case "running": return "Løper"
        case "cycling": return "Sykler"
        case "driving": return "I bil"
        default:
            if k > 15 { return "I bil" }
            if k > 7 { return "Sykler" }
            if k > 1 { return "Går" }
            return "Står stille"
        }
    }

    static func color(_ mem: FamMember) -> String {
        mem.color.isEmpty ? FamPerson20Build.stableColor(mem.id) : mem.color
    }

    static func ini(_ mem: FamMember) -> String {
        let f: String = FamPerson20Build.firstName(mem.name)
        let s: String = String(f.prefix(2))
        return s.isEmpty ? "?" : s
    }

    static func hav(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> Double {
        CLLocation(latitude: a.latitude, longitude: a.longitude).distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude))
    }

    /// Hex fra en fri farge (ColorPicker).
    static func hex(_ c: Color) -> String {
        let u: UIColor = UIColor(c)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        u.getRed(&r, green: &g, blue: &b, alpha: &a)
        let ri: Int = Swift.max(0, Swift.min(255, Int((r * 255).rounded())))
        let gi: Int = Swift.max(0, Swift.min(255, Int((g * 255).rounded())))
        let bi: Int = Swift.max(0, Swift.min(255, Int((b * 255).rounded())))
        return String(format: "#%02x%02x%02x", ri, gi, bi)
    }
}

/* ---------- Profilbilder ---------- */

/// Profilbilde per person: overstyring (PUT /api/family/photo/:userId), ellers photoUrl / avatarUrl / kontobildet.
/// Mangler alt (404), vises initialer i personens farge.
@MainActor
@Observable
final class Fam22Photos {
    static let shared = Fam22Photos()

    var images: [String: UIImage] = [:]
    private var tried: Set<String> = []

    func image(_ id: String) -> UIImage? { images[id] }

    func reset() { images = [:]; tried = [] }

    private func localKey(_ id: String) -> String { AcctScope.key("fh_fam_photo_" + id) }

    func ensure(_ mem: FamMember, _ store: Store) async {
        if images[mem.id] != nil { return }
        if let d = UserDefaults.standard.data(forKey: localKey(mem.id)), let img = UIImage(data: d) { images[mem.id] = img; return }
        let enc: String = mem.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? mem.id
        var url: String = mem.photoUrl
        if url.isEmpty { url = mem.avatarUrl }
        if url.isEmpty { url = "/api/users/\(enc)/avatar" }
        if tried.contains(url) { return }
        tried.insert(url)
        if let img = await loadImage(store, url) {
            images[mem.id] = img
        } else if mem.id == FamilyModel.shared.meId, let a = store.avatar {
            images[mem.id] = a
        }
    }

    /// Beskjæres til kvadrat (160 px) og lagres for deg. Faller tilbake til lokal lagring når serveren mangler ruten.
    func set(_ id: String, _ raw: UIImage, _ store: Store) {
        let sq: UIImage = raw.squared(160)
        guard let jpeg = sq.jpegData(compressionQuality: 0.82) else { return }
        images[id] = UIImage(data: jpeg) ?? sq
        let enc: String = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        let url: String = "data:image/jpeg;base64," + jpeg.base64EncodedString()
        let key: String = localKey(id)
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "PUT", "/family/photo/\(enc)", json: ["image": url, "photo": url])
                UserDefaults.standard.removeObject(forKey: key)
                store.flash("Profilbilde lagret")
            } catch {
                UserDefaults.standard.set(jpeg, forKey: key)
                store.flash("Profilbilde lagret på denne enheten")
            }
        }
    }

    /// Tilbake til kontobildet.
    func clear(_ mem: FamMember, _ store: Store) {
        images[mem.id] = nil
        UserDefaults.standard.removeObject(forKey: localKey(mem.id))
        tried = []
        let enc: String = mem.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? mem.id
        Task { @MainActor in
            _ = try? await store.api.callAt("/api", "DELETE", "/family/photo/\(enc)")
            var copy: FamMember = mem
            copy.photoUrl = ""
            await self.ensure(copy, store)
        }
    }
}

/// Rund avatar: bilde, ellers initialer (Manrope 800, hvit) på personfarge.
struct Fam22Avatar: View {
    @Environment(Store.self) private var store
    let mem: FamMember
    let size: CGFloat
    let font: CGFloat
    var ini: String? = nil

    var body: some View {
        let img: UIImage? = Fam22Photos.shared.image(mem.id)
        ZStack {
            Circle().fill(Color(hex: Fam22Fmt.color(mem)))
            if let img {
                Image(uiImage: img).resizable().scaledToFill().frame(width: size, height: size).clipShape(Circle())
            } else {
                Text(ini ?? Fam22Fmt.ini(mem)).font(PF.ui(font, .heavy)).foregroundStyle(Color.white).lineLimit(1)
            }
        }
        .frame(width: size, height: size)
        .task(id: mem.id) { await Fam22Photos.shared.ensure(mem, store) }
    }
}

/// Liten fyll-knapp i pilleform (verktøyraden og kortene).
struct Fam22Pill: View {
    let title: String
    let height: CGFloat
    let fg: Color
    let bg: Color
    let border: Color?
    var font: CGFloat = 14
    var full: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(PF.ui(font, .bold)).foregroundStyle(fg).lineLimit(1)
                .padding(.horizontal, 18)
                .frame(maxWidth: full ? .infinity : nil)
                .frame(height: height)
                .background(Capsule().fill(bg))
                .overlay(Capsule().strokeBorder(border ?? Color.clear, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
