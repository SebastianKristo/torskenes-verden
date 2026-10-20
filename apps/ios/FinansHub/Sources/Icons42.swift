import SwiftUI
import Foundation

/* ---------------- Prompt 42: velg hvilket som helst ikon for en sone (ikonsøk) ---------------- */
// claude-code-familie-soner-uten-kart.md: søkefelt («Søk i ikoner, f.eks. båt, kirke, ski …»), 18 vanlige ikoner + «Vis alle»
// (50 innebygde, samme nøkler som serveren: ZONE_ICONS + ZONE_ICONS42), «N treff» / «Ingen ikoner heter …», og søk i Lucide og
// Tabler via Iconify (api.iconify.design). Norske ord oversettes først (båt → boat, kirke → church …). Valgt Iconify-ikon lagres
// som «ify:lucide:sailboat» med path-data (icp), så sonen vises uten nett og likt på iOS, Android og web.
// Sist brukte ikoner vises først. Bokstav/emoji som ikon er ikke støttet av serveren ennå.

enum Icons42 {
    /// De 36 nye innebygde ikonene (nøkkel → (norsk navn, SVG-bane i viewBox 24)).
    static let extraKeys: [String] = ["car", "bus", "train", "bike", "boat", "hospital", "doctor", "pill", "church", "book", "music", "film", "food", "cart", "fuel", "bolt", "paw", "baby", "swim", "ski", "tent", "mountain", "beach", "sun", "gift", "cake", "game", "laptop", "tool", "key", "bed", "flag", "bell", "camera", "anchor", "leaf"]
    static let extra: [String: (String, String)] = [
        "car": ("Bil", "M3 13l2-5h14l2 5v4H3zM6 17v2M18 17v2M6.9 13.5a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0M15.9 13.5a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0"),
        "bus": ("Buss", "M5 4h14v13H5zM5 11h14M8 17v2M16 17v2M7.9 14a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0M14.9 14a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0"),
        "train": ("Tog", "M7 3h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM5 10h14M9 21l1.5-4M15 21l-1.5-4"),
        "bike": ("Sykkel", "M2 17a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M15 17a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M5.5 17L9 10h6l3.5 7M12 17L9 10M14 6h2l1 4"),
        "boat": ("Båt", "M3 17l2 3h14l2-3zM12 3v14M12 4l6 10H12M12 7l-5 7h5"),
        "hospital": ("Sykehus", "M4 21V6h16v15M2 21h20M12 9v6M9 12h6M9 21v-3h6v3"),
        "doctor": ("Lege", "M6 3v6a6 6 0 0 0 12 0V3M12 15v2a4 4 0 0 0 8 0v-3M18.5 12.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0"),
        "pill": ("Medisin", "M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7zM7 10l7 7"),
        "church": ("Kirke", "M12 2v5M10 4h4M6 21V11l6-4 6 4v10M3 21h18M10 21v-5h4v5"),
        "book": ("Bok", "M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 19V5M20 19v2H6"),
        "music": ("Musikk", "M9 18V5l11-2v13M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M14 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"),
        "film": ("Kino", "M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"),
        "food": ("Mat", "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-3 5-3 8h3v10"),
        "cart": ("Handel", "M3 4h2l2.5 11h11L21 7H6.5M7.5 19a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M15.5 19a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0"),
        "fuel": ("Bensin", "M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 8l3 3v6a2 2 0 0 0 4 0V9l-3-3"),
        "bolt": ("Strøm", "M13 2L4 14h7l-1 8 9-12h-7z"),
        "paw": ("Dyr", "M5.2 9a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0M10.2 6a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0M15.2 9a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0M12 12c-3 0-6 4-6 6.5S8 21 12 19.5 18 21 18 18.5 15 12 12 12z"),
        "baby": ("Barn", "M8 8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M5 21a7 7 0 0 1 14 0M10 8h0M14 8h0"),
        "swim": ("Svømming", "M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M8 15l3-6 4 2 2-3M15.2 5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0"),
        "ski": ("Ski", "M4 20l16-6M7 7l5 4-2 4M14 10l3 3M13.2 4.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0"),
        "tent": ("Telt", "M3 20L12 4l9 16zM12 4v16M8.5 20L12 13l3.5 7"),
        "mountain": ("Fjell", "M2 20L9 7l4 6 2-3 7 10zM7.5 10l2 2 2-2"),
        "beach": ("Strand", "M3 21h18M12 21L8 9M4 9a8 8 0 0 1 14-3zM8 9l5-1"),
        "sun": ("Sol", "M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"),
        "gift": ("Gave", "M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C10 4 7 4 7 6s3 2 5 2zM12 8c2-4 5-4 5-2s-3 2-5 2z"),
        "cake": ("Bursdag", "M4 21v-8h16v8M2 21h20M4 16c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 4 0M12 13V9M12 6c-1-1.5 0-3 0-3s1 1.5 0 3z"),
        "game": ("Spill", "M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.5H9A4 4 0 0 1 2 13v-1a4 4 0 0 1 4-4zM7 11v3M5.5 12.5h3M15.4 12a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0M17.4 14a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0"),
        "laptop": ("Jobb-PC", "M4 5h16v11H4zM2 19h20"),
        "tool": ("Verksted", "M14.5 5.5a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 0-5-5l3 3-2 2z"),
        "key": ("Nøkkel", "M4 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M11 12l9-9M16 7l3 3M18 5l2 2"),
        "bed": ("Overnatting", "M3 20V6M3 16h18v4M21 16v-4a3 3 0 0 0-3-3h-8v7M5 11.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0"),
        "flag": ("Flagg", "M5 21V4M5 4h11l-2 4 2 4H5"),
        "bell": ("Varsel", "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"),
        "camera": ("Foto", "M4 7h3l2-3h6l2 3h3v12H4zM8.5 13a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0"),
        "anchor": ("Havn", "M10 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M12 7v14M8 11h8M5 14a7 7 0 0 0 14 0"),
        "leaf": ("Hage", "M5 19c0-9 6-14 15-14 0 9-5 15-14 15zM5 19l8-8"),
    ]

    /// Norske søkeord og synonymer for de innebygde ikonene.
    static let words: [String: [String]] = [
        "home": ["hjem", "hus", "bolig"], "work": ["jobb", "arbeid", "kontor"], "school": ["skole", "barnehage", "universitet"],
        "heart": ["familie", "mormor", "farmor", "hjerte", "venn"], "cabin": ["hytte", "fritidsbolig"], "gym": ["trening", "treningssenter", "styrke"],
        "shop": ["butikk", "shopping", "senter"], "ball": ["sport", "fotball", "idrett", "bane"], "coffee": ["kafé", "kafe", "kaffe"],
        "tree": ["natur", "skog", "park", "tur"], "plane": ["reise", "fly", "flyplass", "ferie"], "star": ["favoritt", "stjerne"], "pin": ["sted", "plass"],
        "car": ["bil", "parkering", "garasje"], "bus": ["buss", "holdeplass"], "train": ["tog", "stasjon", "trikk", "t-bane"], "bike": ["sykkel"],
        "boat": ["båt", "seilbåt", "ferje", "brygge"], "hospital": ["sykehus", "legevakt"], "doctor": ["lege", "helse", "tannlege"], "pill": ["medisin", "apotek"],
        "church": ["kirke", "kapell", "moske"], "book": ["bok", "bibliotek", "lesing"], "music": ["musikk", "korps", "kor", "konsert"], "film": ["kino", "film", "teater"],
        "food": ["mat", "restaurant", "middag"], "cart": ["handel", "dagligvare", "matbutikk"], "fuel": ["bensin", "drivstoff", "lading"], "bolt": ["strøm", "lading", "elbil"],
        "paw": ["dyr", "hund", "katt", "stall", "hest"], "baby": ["barn", "baby", "barnehage"], "swim": ["svømming", "badeland", "basseng", "bading"],
        "ski": ["ski", "skiløype", "slalåm", "alpint"], "tent": ["telt", "camping"], "mountain": ["fjell", "topptur"], "beach": ["strand", "sjø", "bading"],
        "sun": ["sol", "sommer"], "gift": ["gave", "jul", "høytid"], "cake": ["bursdag", "kake", "fest"], "game": ["spill", "gaming"],
        "laptop": ["data", "pc", "hjemmekontor"], "tool": ["verksted", "verktøy", "bygg"], "key": ["nøkkel", "utleie", "airbnb"], "bed": ["overnatting", "hotell", "seng"],
        "flag": ["flagg", "mål", "17. mai"], "bell": ["varsel", "klokke"], "camera": ["foto", "kamera"], "anchor": ["havn", "anker", "marina"], "leaf": ["hage", "kolonihage", "blomster"],
    ]

    /// Norsk → engelsk før Iconify-søket.
    static let english: [String: String] = [
        "båt": "boat", "seilbåt": "sailboat", "ferje": "ship", "kirke": "church", "hytte": "cabin", "trening": "barbell", "ski": "ski", "skole": "school",
        "jobb": "briefcase", "kontor": "building", "butikk": "store", "sykehus": "hospital", "lege": "stethoscope", "tannlege": "dental", "tog": "train",
        "trikk": "tram", "buss": "bus", "bil": "car", "fly": "plane", "flyplass": "plane", "strand": "beach", "fjell": "mountain", "skog": "trees",
        "hage": "flower", "blomst": "flower", "fotball": "ball", "svømming": "swim", "bading": "swim", "kafé": "coffee", "kafe": "coffee", "kaffe": "coffee",
        "mat": "utensils", "restaurant": "utensils", "bursdag": "cake", "kake": "cake", "gave": "gift", "hund": "dog", "katt": "cat", "hest": "horse",
        "musikk": "music", "kino": "film", "teater": "theater", "bibliotek": "library", "bok": "book", "hjem": "home", "hus": "house", "sol": "sun",
        "hav": "waves", "havn": "anchor", "sykkel": "bike", "telt": "tent", "camping": "tent", "bensin": "fuel", "lading": "plug", "strøm": "bolt",
        "barnehage": "baby", "barn": "baby", "venn": "users", "venner": "users", "familie": "users", "mormor": "heart", "farmor": "heart",
        "medisin": "pill", "apotek": "pill", "fest": "party", "spill": "gamepad", "nøkkel": "key", "hotell": "bed", "flagg": "flag", "kamera": "camera",
        "foto": "camera", "jul": "gift", "snø": "snowflake", "is": "ice-cream", "pizza": "pizza", "golf": "golf", "tennis": "tennis", "bowling": "bowling",
        "klatring": "mountain", "fiske": "fish", "verksted": "wrench", "garasje": "garage", "parkering": "parking", "stall": "horse", "gård": "barn",
    ]

    /* ---------- path-data for Iconify-ikoner (lagres lokalt) ---------- */

    private static let pathsKey: String = "fh_icons42_paths"
    private static let recentKey: String = "fh_icons42_recent"

    static func path(_ k: String) -> String? {
        let d: [String: String] = (UserDefaults.standard.dictionary(forKey: pathsKey) as? [String: String]) ?? [:]
        return d[k]
    }

    static func store(_ k: String, _ p: String) {
        var d: [String: String] = (UserDefaults.standard.dictionary(forKey: pathsKey) as? [String: String]) ?? [:]
        if d[k] == p { return }
        d[k] = p
        UserDefaults.standard.set(d, forKey: pathsKey)
    }

    /// «ify:lucide:sailboat» → «Sailboat».
    static func ifyName(_ k: String) -> String {
        let n: String = String(k.split(separator: ":").last ?? "")
        let t: String = n.replacingOccurrences(of: "-", with: " ")
        return t.prefix(1).uppercased() + String(t.dropFirst())
    }

    static var recent: [String] {
        (UserDefaults.standard.array(forKey: recentKey) as? [String]) ?? []
    }

    static func used(_ k: String) {
        var r: [String] = recent.filter { $0 != k }
        r.insert(k, at: 0)
        UserDefaults.standard.set(Array(r.prefix(12)), forKey: recentKey)
    }

    /// De innebygde: sist brukte først, ellers standardrekkefølgen.
    static func ordered() -> [String] {
        let all: [String] = Fam22Icons.keys
        let rec: [String] = recent.filter { all.contains($0) }
        return rec + all.filter { !rec.contains($0) }
    }

    /// Treff blant de innebygde (norsk navn, synonymer eller nøkkel).
    static func matches(_ q: String) -> [String] {
        let s: String = q.lowercased().trimmingCharacters(in: .whitespaces)
        if s.isEmpty { return ordered() }
        return ordered().filter { (k: String) -> Bool in
            if k.contains(s) || Fam22Icons.name(k).lowercased().contains(s) { return true }
            return (words[k] ?? []).contains { $0.contains(s) }
        }
    }

    static func translate(_ q: String) -> String {
        let s: String = q.lowercased().trimmingCharacters(in: .whitespaces)
        return english[s] ?? s
    }

    /* ---------- SVG-kropp fra Iconify → én SVG-bane ---------- */

    static func pathFrom(body: String) -> String {
        var out: [String] = []
        let tags: [String] = matchesOf(#"<(path|circle|ellipse|rect|line|polyline|polygon)\b[^>]*>"#, body)
        for t in tags {
            if t.hasPrefix("<path") {
                if let d = attr(t, "d") { out.append(d) }
            } else if t.hasPrefix("<circle") {
                let cx: Double = num(t, "cx"), cy: Double = num(t, "cy"), r: Double = num(t, "r")
                if r > 0 { out.append(circle(cx, cy, r, r)) }
            } else if t.hasPrefix("<ellipse") {
                let cx: Double = num(t, "cx"), cy: Double = num(t, "cy"), rx: Double = num(t, "rx"), ry: Double = num(t, "ry")
                if rx > 0 && ry > 0 { out.append(circle(cx, cy, rx, ry)) }
            } else if t.hasPrefix("<rect") {
                let x: Double = num(t, "x"), y: Double = num(t, "y"), w: Double = num(t, "width"), h: Double = num(t, "height")
                if w > 0 && h > 0 { out.append("M\(f(x)) \(f(y))h\(f(w))v\(f(h))h\(f(-w))z") }
            } else if t.hasPrefix("<line") {
                out.append("M\(f(num(t, "x1"))) \(f(num(t, "y1")))L\(f(num(t, "x2"))) \(f(num(t, "y2")))")
            } else if t.hasPrefix("<polyline") || t.hasPrefix("<polygon") {
                if let pts = attr(t, "points") {
                    let n: [String] = pts.split(whereSeparator: { $0 == " " || $0 == "," }).map(String.init)
                    var s: String = ""
                    var i: Int = 0
                    while i + 1 < n.count { s += (i == 0 ? "M" : "L") + n[i] + " " + n[i + 1]; i += 2 }
                    if t.hasPrefix("<polygon") { s += "z" }
                    if !s.isEmpty { out.append(s) }
                }
            }
        }
        return out.joined()
    }

    private static func f(_ v: Double) -> String {
        let r: Double = (v * 100).rounded() / 100
        return r == r.rounded() ? String(Int(r)) : String(r)
    }

    private static func circle(_ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double) -> String {
        "M\(f(cx - rx)) \(f(cy))a\(f(rx)) \(f(ry)) 0 1 0 \(f(2 * rx)) 0a\(f(rx)) \(f(ry)) 0 1 0 \(f(-2 * rx)) 0"
    }

    private static func matchesOf(_ pattern: String, _ s: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return [] }
        let ns: NSString = s as NSString
        return re.matches(in: s, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range) }
    }

    private static func attr(_ tag: String, _ name: String) -> String? {
        guard let re = try? NSRegularExpression(pattern: "\\s" + name + "=\"([^\"]*)\"") else { return nil }
        let ns: NSString = tag as NSString
        guard let m = re.firstMatch(in: tag, range: NSRange(location: 0, length: ns.length)), m.numberOfRanges > 1 else { return nil }
        return ns.substring(with: m.range(at: 1))
    }

    private static func num(_ tag: String, _ name: String) -> Double { Double(attr(tag, name) ?? "") ?? 0 }
}

/* ---------- Iconify-søk (Lucide + Tabler) ---------- */

@MainActor
@Observable
final class IconSearch42 {
    var hits: [(String, String)] = []
    var busy: Bool = false
    var searched: String = ""
    var failed: Bool = false
    private var task: Task<Void, Never>? = nil

    /// Søker med 350 ms pause etter siste tastetrykk. Under 2 tegn: ingen Iconify-søk.
    func search(_ q: String) {
        task?.cancel()
        let s: String = q.trimmingCharacters(in: .whitespaces)
        if s.count < 2 { hits = []; searched = ""; busy = false; failed = false; return }
        let en: String = Icons42.translate(s)
        busy = true
        task = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 350_000_000)
            if Task.isCancelled { return }
            let r: [(String, String)]? = await IconSearch42.fetch(en)
            if Task.isCancelled { return }
            self.busy = false
            self.searched = en
            self.failed = r == nil
            self.hits = r ?? []
        }
    }

    /// GET /search?query=…&prefixes=lucide,tabler, så /<prefix>.json?icons=… for path-data. nil = ingen nett / feil.
    nonisolated static func fetch(_ q: String) async -> [(String, String)]? {
        let enc: String = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
        guard let u = URL(string: "https://api.iconify.design/search?query=" + enc + "&prefixes=lucide,tabler&limit=48") else { return nil }
        guard let res = try? await URLSession.shared.data(from: u),
              let o = (try? JSONSerialization.jsonObject(with: res.0)) as? [String: Any] else { return nil }
        let names: [String] = Array(((o["icons"] as? [String]) ?? []).prefix(36))
        if names.isEmpty { return [] }
        var byPrefix: [String: [String]] = [:]
        for n in names {
            let parts: [Substring] = n.split(separator: ":")
            guard parts.count == 2 else { continue }
            byPrefix[String(parts[0]), default: []].append(String(parts[1]))
        }
        var paths: [String: String] = [:]
        for (prefix, list) in byPrefix {
            let icons: String = list.joined(separator: ",")
            guard let iu = URL(string: "https://api.iconify.design/" + prefix + ".json?icons=" + icons),
                  let rr = try? await URLSession.shared.data(from: iu),
                  let oo = (try? JSONSerialization.jsonObject(with: rr.0)) as? [String: Any],
                  let ic = oo["icons"] as? [String: Any] else { continue }
            for (name, v) in ic {
                guard let body = (v as? [String: Any])?["body"] as? String else { continue }
                let p: String = Icons42.pathFrom(body: body)
                if !p.isEmpty { paths[prefix + ":" + name] = p }
            }
        }
        return names.compactMap { (n: String) -> (String, String)? in
            guard let p = paths[n] else { return nil }
            return ("ify:" + n, p)
        }
    }
}

/// Ikonvelgeren: søkefelt, 18 vanlige + «Vis alle», og treff fra Lucide og Tabler.
struct IconPicker42: View {
    @Environment(\.paper) private var p
    let selected: String
    let color: String
    let cell: CGFloat
    let glyph: CGFloat
    let pick: (String) -> Void
    @State private var q: String = ""
    @State private var all: Bool = false
    @State private var s: IconSearch42 = IconSearch42()

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        let list: [String] = Icons42.matches(q)
        let shown: [String] = q.isEmpty && !all ? Array(list.prefix(18)) : list
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 13, weight: .semibold)).foregroundStyle(t.mut)
                TextField("Søk i ikoner, f.eks. båt, kirke, ski …", text: $q)
                    .font(PF.ui(13.5)).foregroundStyle(t.ink)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .submitLabel(.search)
                if !q.isEmpty {
                    Button { q = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(t.mut) }
                        .buttonStyle(.plain).accessibilityLabel("Tøm søket")
                }
            }
            .padding(.horizontal, 12).frame(height: 38)
            .background(RoundedRectangle(cornerRadius: 12).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(t.line, lineWidth: 1))
            if !q.isEmpty {
                Text(list.isEmpty ? "Ingen ikoner heter «\(q)» her" : "\(list.count) treff")
                    .font(PF.ui(12)).foregroundStyle(t.mut)
            }
            grid(t, shown.map { ($0, Fam22Icons.d($0)) })
            if q.isEmpty {
                Button { withAnimation(.easeOut(duration: 0.2)) { all.toggle() } } label: {
                    Text(all ? "Vis færre" : "Vis alle (\(list.count))").font(PF.ui(12.5, .bold)).foregroundStyle(t.ink)
                }
                .buttonStyle(.plain)
            }
            if !q.isEmpty {
                if s.busy {
                    Text("Søker i Lucide og Tabler …").font(PF.ui(12)).foregroundStyle(t.mut)
                } else if s.failed {
                    Text("Fikk ikke kontakt med ikonbiblioteket. De innebygde ikonene virker uten nett.").font(PF.ui(12)).foregroundStyle(t.mut)
                        .fixedSize(horizontal: false, vertical: true)
                } else if !s.searched.isEmpty {
                    Text(s.hits.isEmpty ? "Ingen treff i Lucide og Tabler · søkte «\(s.searched)»" : "\(s.hits.count) fra Lucide og Tabler · søkte «\(s.searched)»")
                        .font(PF.ui(12)).foregroundStyle(t.mut)
                    if !s.hits.isEmpty { grid(t, s.hits) }
                }
            }
        }
        .onChange(of: q) { (_: String, v: String) in s.search(v) }
    }

    private func grid(_ t: Fam22Tok, _ items: [(String, String)]) -> some View {
        let cols: [GridItem] = [GridItem(.adaptive(minimum: cell), spacing: 6)]
        return LazyVGrid(columns: cols, spacing: 6) {
            ForEach(items, id: \.0) { it in cellView(t, it.0, it.1) }
        }
    }

    private func cellView(_ t: Fam22Tok, _ k: String, _ d: String) -> some View {
        let on: Bool = k == selected
        let c: Color = Color(hex: color)
        return Button {
            if k.hasPrefix("ify:") { Icons42.store(k, d) }
            Icons42.used(k)
            Haptics.shared.select()
            pick(k)
        } label: {
            Fam22Glyph(d: d, size: glyph, stroke: 1.9, color: on ? Color.white : t.ink)
                .frame(maxWidth: .infinity)
                .frame(height: cell)
                .background(RoundedRectangle(cornerRadius: 12).fill(on ? c : Color.clear))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(on ? c : t.line, lineWidth: 2))
                .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Fam22Icons.name(k))
    }
}
