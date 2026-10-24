import SwiftUI
import UIKit
import CryptoKit

/* ---------------- Prompt 50: Media – plakater og bilder med en gang (claude-code-media-bilder-raskt.md) ----------------
 Serveren (SRVMEDIA50) sender `poster` som signert /api/media/bilde/…?w=320&v=… og ved siden av
 `posterImg {url, hash, w, h, srcset, widths, version}` / `fanartImg`. Her:
 – Media50Reg: husker posterImg/fanartImg per plakat-URL når listene tolkes (Media43Model), så alle eksisterende
   Media43Poster-kall får plassholder og riktig bredde uten nye parametre.
 – Thumb50: ThumbHash → UIImage (port av public/js/thumbhash50.js, samme format som evanw/thumbhash). Tegnes med én gang,
   i plakatens farger – ingen grå bokser og ingen hopp (fast 2:3-ramme).
 – Img50Cache: minne (NSCache) + disk (Caches/img50, ≥ 300 MB, eldste slettes først). URL-ene har versjon (v=), så en
   endret plakat får ny nøkkel, og den gamle brukes aldri. Uten nett vises plakatene fra disken.
 – Riktig bredde: 320 i listene, 640 på detaljsiden (`big`), fanart 640/1280. Forhåndslasting av de neste 2 radene. */

/// posterImg / fanartImg fra serveren.
struct Media50Img: Hashable {
    var url: String
    var hash: String = ""
    var w: Int = 320
    var h: Int = 480
    var widths: [Int] = []
    /// bredde → ferdig signert URL (fra srcset).
    var src: [Int: String] = [:]
    var version: String = ""

    /// URL for ønsket bredde: nærmeste som er ≥ want, ellers den største. Uten srcset: bytt w= i url.
    func url(for want: Int) -> String {
        if !src.isEmpty {
            let ws: [Int] = src.keys.sorted()
            let pick: Int = ws.first(where: { $0 >= want }) ?? (ws.last ?? w)
            return src[pick] ?? url
        }
        return Media50Img.withW(url, want)
    }

    nonisolated static func withW(_ u: String, _ w: Int) -> String {
        guard let r = u.range(of: "([?&])w=[0-9]+", options: .regularExpression) else { return u }
        let lead: String = String(u[r].prefix(1))
        return u.replacingCharacters(in: r, with: lead + "w=\(w)")
    }

    nonisolated static func parse(_ o: [String: Any]?) -> Media50Img? {
        guard let o, let u = JS.str(o, "url") else { return nil }
        var m: Media50Img = Media50Img(url: u)
        m.hash = JS.str(o, "hash") ?? ""
        m.w = JS.int(o, "w") ?? 320
        m.h = JS.int(o, "h") ?? Int(Double(m.w) * 1.5)
        m.widths = (o["widths"] as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue } ?? []
        m.version = JS.str(o, "version") ?? ""
        // srcset: «<url> 160w, <url> 320w, …» (URL-ene har ikke mellomrom).
        for part in (JS.str(o, "srcset") ?? "").components(separatedBy: ", ") {
            let bits: [String] = part.trimmingCharacters(in: .whitespaces).components(separatedBy: " ")
            guard bits.count == 2, bits[1].hasSuffix("w"), let w = Int(bits[1].dropLast()) else { continue }
            m.src[w] = bits[0]
        }
        return m
    }
}

/// Plakat-URL → posterImg/fanartImg. Fylles når listene tolkes (trådsikker, tolkingen er nonisolated).
final class Media50Reg: @unchecked Sendable {
    static let shared = Media50Reg()
    private let lock = NSLock()
    private var map: [String: Media50Img] = [:]

    func put(_ key: String, _ v: Media50Img) {
        lock.lock(); defer { lock.unlock() }
        if map.count > 4000 { map.removeAll() }
        map[key] = v
    }

    func get(_ key: String) -> Media50Img? {
        if key.isEmpty { return nil }
        lock.lock(); defer { lock.unlock() }
        return map[key]
    }

    /// Leser posterImg/fanartImg i ett element (og i `series`/`movie` inni det). Kalles fra Media43Model.
    nonisolated static func take(_ r: [String: Any]?) {
        guard let r else { return }
        for (k, img) in [("poster", "posterImg"), ("fanart", "fanartImg")] {
            guard let m = Media50Img.parse(JS.dict(r, img)) else { continue }
            Media50Reg.shared.put(m.url, m)
            if let s = JS.str(r, k), s != m.url { Media50Reg.shared.put(s, m) }
        }
        if let s = JS.dict(r, "series") { take(s) }
        if let s = JS.dict(r, "movie") { take(s) }
    }
}

/* ---------- ThumbHash ---------- */

enum Thumb50 {
    private static let cache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 1500
        return c
    }()

    /// base64-ThumbHash → liten uskarp UIImage (maks 32 px). nil ved ugyldig hash.
    static func image(_ b64: String) -> UIImage? {
        if b64.isEmpty { return nil }
        if let i = cache.object(forKey: b64 as NSString) { return i }
        guard let d = Data(base64Encoded: b64), d.count >= 5 else { return nil }
        guard let res = decode([UInt8](d)), let img = makeImage(res.0, res.1, res.2) else { return nil }
        cache.setObject(img, forKey: b64 as NSString)
        return img
    }

    private static func makeImage(_ w: Int, _ h: Int, _ rgba: [UInt8]) -> UIImage? {
        guard w > 0, h > 0, rgba.count == w * h * 4 else { return nil }
        guard let prov = CGDataProvider(data: Data(rgba) as CFData) else { return nil }
        let info: CGBitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue)
        guard let cg = CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                               space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: info, provider: prov,
                               decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { return nil }
        return UIImage(cgImage: cg)
    }

    nonisolated static func aspect(_ hash: [UInt8]) -> Double {
        let header: Int = Int(hash[3])
        let hasAlpha: Bool = (Int(hash[2]) & 0x80) != 0
        let isLandscape: Bool = (Int(hash[4]) & 0x80) != 0
        let lx: Int = isLandscape ? (hasAlpha ? 5 : 7) : (header & 7)
        let ly: Int = isLandscape ? (header & 7) : (hasAlpha ? 5 : 7)
        return ly == 0 ? 1 : Double(lx) / Double(ly)
    }

    /// Port av thumbHashToRGBA (evanw/thumbhash, MIT) – samme som public/js/thumbhash50.js.
    nonisolated static func decode(_ hash: [UInt8]) -> (Int, Int, [UInt8])? {
        if hash.count < 5 { return nil }
        let header24: Int = Int(hash[0]) | (Int(hash[1]) << 8) | (Int(hash[2]) << 16)
        let header16: Int = Int(hash[3]) | (Int(hash[4]) << 8)
        let lDc: Double = Double(header24 & 63) / 63
        let pDc: Double = Double((header24 >> 6) & 63) / 31.5 - 1
        let qDc: Double = Double((header24 >> 12) & 63) / 31.5 - 1
        let lScale: Double = Double((header24 >> 18) & 31) / 31
        let hasAlpha: Bool = (header24 >> 23) != 0
        let pScale: Double = Double((header16 >> 3) & 63) / 63
        let qScale: Double = Double((header16 >> 9) & 63) / 63
        let isLandscape: Bool = (header16 >> 15) != 0
        let lx: Int = Swift.max(3, isLandscape ? (hasAlpha ? 5 : 7) : (header16 & 7))
        let ly: Int = Swift.max(3, isLandscape ? (header16 & 7) : (hasAlpha ? 5 : 7))
        if hasAlpha && hash.count < 6 { return nil }
        let aDc: Double = hasAlpha ? Double(Int(hash[5]) & 15) / 15 : 1
        let aScale: Double = hasAlpha ? Double(Int(hash[5]) >> 4) / 15 : 0
        let acStart: Int = hasAlpha ? 6 : 5
        var acIndex: Int = 0
        func channel(_ nx: Int, _ ny: Int, _ scale: Double) -> [Double] {
            var ac: [Double] = []
            for cy in 0..<ny {
                var cx: Int = cy > 0 ? 0 : 1
                while cx * ny < nx * (ny - cy) {
                    let bi: Int = acStart + (acIndex >> 1)
                    let byte: Int = bi < hash.count ? Int(hash[bi]) : 0
                    let v: Int = (byte >> ((acIndex & 1) << 2)) & 15
                    ac.append((Double(v) / 7.5 - 1) * scale)
                    acIndex += 1
                    cx += 1
                }
            }
            return ac
        }
        let lAc: [Double] = channel(lx, ly, lScale)
        let pAc: [Double] = channel(3, 3, pScale * 1.25)
        let qAc: [Double] = channel(3, 3, qScale * 1.25)
        let aAc: [Double] = hasAlpha ? channel(5, 5, aScale) : []
        let ratio: Double = aspect(hash)
        let w: Int = Int((ratio > 1 ? 32 : 32 * ratio).rounded())
        let h: Int = Int((ratio > 1 ? 32 / ratio : 32).rounded())
        if w <= 0 || h <= 0 || w > 64 || h > 64 { return nil }
        var rgba: [UInt8] = [UInt8](repeating: 0, count: w * h * 4)
        let nfx: Int = Swift.max(lx, hasAlpha ? 5 : 3)
        let nfy: Int = Swift.max(ly, hasAlpha ? 5 : 3)
        var fx: [Double] = [Double](repeating: 0, count: nfx)
        var fy: [Double] = [Double](repeating: 0, count: nfy)
        var i: Int = 0
        for y in 0..<h {
            for x in 0..<w {
                var l: Double = lDc, p: Double = pDc, q: Double = qDc, a: Double = aDc
                for cx in 0..<nfx { fx[cx] = cos(Double.pi / Double(w) * (Double(x) + 0.5) * Double(cx)) }
                for cy in 0..<nfy { fy[cy] = cos(Double.pi / Double(h) * (Double(y) + 0.5) * Double(cy)) }
                var j: Int = 0
                for cy in 0..<ly {
                    let fy2: Double = fy[cy] * 2
                    var cx: Int = cy > 0 ? 0 : 1
                    while cx * ly < lx * (ly - cy) {
                        if j < lAc.count { l += lAc[j] * fx[cx] * fy2 }
                        j += 1; cx += 1
                    }
                }
                j = 0
                for cy in 0..<3 {
                    let fy2: Double = fy[cy] * 2
                    var cx: Int = cy > 0 ? 0 : 1
                    while cx < 3 - cy {
                        let f: Double = fx[cx] * fy2
                        if j < pAc.count { p += pAc[j] * f; q += qAc[j] * f }
                        j += 1; cx += 1
                    }
                }
                if hasAlpha {
                    j = 0
                    for cy in 0..<5 {
                        let fy2: Double = fy[cy] * 2
                        var cx: Int = cy > 0 ? 0 : 1
                        while cx < 5 - cy {
                            if j < aAc.count { a += aAc[j] * fx[cx] * fy2 }
                            j += 1; cx += 1
                        }
                    }
                }
                let b: Double = l - 2.0 / 3.0 * p
                let r: Double = (3 * l - b + q) / 2
                let g: Double = r - q
                rgba[i] = byte(r); rgba[i + 1] = byte(g); rgba[i + 2] = byte(b); rgba[i + 3] = byte(a)
                i += 4
            }
        }
        return (w, h, rgba)
    }

    nonisolated private static func byte(_ v: Double) -> UInt8 {
        UInt8(Swift.max(0, Swift.min(255, 255 * Swift.min(1, v))))
    }
}

/* ---------- Bildecache: minne + disk (≥ 300 MB) ---------- */

final class Img50Cache: @unchecked Sendable {
    static let shared = Img50Cache()
    let mem: NSCache<NSString, UIImage> = NSCache<NSString, UIImage>()
    private let dir: URL
    private let io: DispatchQueue = DispatchQueue(label: "img50.disk", qos: .utility)
    private let lock = NSLock()
    private var inflight: [String: Task<UIImage?, Never>] = [:]
    private var failed: [String: Date] = [:]
    nonisolated static let maxBytes: Int = 320 * 1024 * 1024

    init() {
        mem.countLimit = 600
        mem.totalCostLimit = 96 * 1024 * 1024
        let base: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
        dir = base.appendingPathComponent("img50", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        io.asyncAfter(deadline: .now() + 8) { [dir] in Img50Cache.trim(dir) }
    }

    /// Nøkkelen er URL-en uten signatur (uid/sig) – versjonen (v=) og bredden (w=) er med, så en ny plakat får ny nøkkel.
    nonisolated static func key(_ url: String) -> String {
        guard var c = URLComponents(string: url) else { return url }
        c.queryItems = c.queryItems?.filter { $0.name != "uid" && $0.name != "sig" }
        if c.queryItems?.isEmpty == true { c.queryItems = nil }
        return c.string ?? url
    }

    func memory(_ url: String) -> UIImage? {
        if url.isEmpty { return nil }
        return mem.object(forKey: Img50Cache.key(url) as NSString)
    }

    private func file(_ k: String) -> URL {
        let h: String = SHA256.hash(data: Data(k.utf8)).map { String(format: "%02x", $0) }.joined()
        return dir.appendingPathComponent(String(h.prefix(40)))
    }

    private func remember(_ k: String, _ img: UIImage) {
        let cost: Int = Int(img.size.width * img.size.height * img.scale * img.scale * 4)
        mem.setObject(img, forKey: k as NSString, cost: cost)
    }

    /// Minne → disk → nett. `api` gir Bearer for /api-stier (signerte URL-er virker også uten).
    func load(_ url: String, api: API) async -> UIImage? {
        if url.isEmpty { return nil }
        let k: String = Img50Cache.key(url)
        if let i = mem.object(forKey: k as NSString) { return i }
        guard let t = begin(url, k, api) else { return nil }
        let img: UIImage? = await t.value
        end(k, ok: img != nil)
        return img
    }

    /// Felles nedlasting per nøkkel (liste + forhåndslasting samtidig gir ett kall). nil = feilet nylig.
    private func begin(_ url: String, _ k: String, _ api: API) -> Task<UIImage?, Never>? {
        lock.lock(); defer { lock.unlock() }
        if let f = failed[k], Date().timeIntervalSince(f) < 60 { return nil }
        if let cur = inflight[k] { return cur }
        let t: Task<UIImage?, Never> = Task.detached(priority: .userInitiated) { () -> UIImage? in
            await Img50Cache.shared.fetch(url, k, api)
        }
        inflight[k] = t
        return t
    }

    private func end(_ k: String, ok: Bool) {
        lock.lock(); defer { lock.unlock() }
        inflight[k] = nil
        if ok { failed[k] = nil } else { failed[k] = Date() }
    }

    fileprivate func fetch(_ url: String, _ k: String, _ api: API) async -> UIImage? {
        let f: URL = file(k)
        if let d = try? Data(contentsOf: f), let img = Img50Cache.decode(d) {
            remember(k, img)
            io.async { try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: f.path) }
            return img
        }
        var data: Data? = nil
        if url.hasPrefix("/") {
            data = try? await api.bytes(url)
        } else if let u = URL(string: url), u.scheme == "https" || u.scheme == "http" {
            data = try? await URLSession.shared.data(from: u).0
        }
        guard let data, let img = Img50Cache.decode(data) else { return nil }
        remember(k, img)
        io.async { try? data.write(to: f, options: .atomic) }
        return img
    }

    /// Dekoder og forbereder bildet for visning utenfor hovedtråden (ingen hakking ved rask scrolling).
    nonisolated static func decode(_ d: Data) -> UIImage? {
        guard let img = UIImage(data: d) else { return nil }
        return img.preparingForDisplay() ?? img
    }

    /// Sletter de eldste filene til disken er under grensen.
    nonisolated static func trim(_ dir: URL) {
        let fm: FileManager = FileManager.default
        let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey]
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: keys) else { return }
        var rows: [(URL, Int, Date)] = []
        var total: Int = 0
        for u in files {
            let v: URLResourceValues? = try? u.resourceValues(forKeys: Set(keys))
            let s: Int = v?.fileSize ?? 0
            total += s
            rows.append((u, s, v?.contentModificationDate ?? .distantPast))
        }
        if total <= maxBytes { return }
        for r in rows.sorted(by: { $0.2 < $1.2 }) {
            try? fm.removeItem(at: r.0)
            total -= r.1
            if total <= maxBytes * 9 / 10 { break }
        }
    }

    /// Forhåndslasting (lav prioritet): bare disk/nett, ingenting tegnes.
    func prefetch(_ urls: [String], api: API) {
        for u in urls where !u.isEmpty && memory(u) == nil {
            Task.detached(priority: .utility) { _ = await Img50Cache.shared.load(u, api: api) }
        }
    }
}

/* ---------- Visning ---------- */

/// Plassholder fra ThumbHash (plakatens farger) eller ingenting.
struct Media50Placeholder: View {
    let url: String

    var body: some View {
        if let m = Media50Reg.shared.get(url), let ph = Thumb50.image(m.hash) {
            Image(uiImage: ph).resizable().interpolation(.medium).scaledToFill()
        }
    }
}

/// Bilde fra Homelab/TMDB med disk- og minnecache. `want` = ønsket bredde (320 liste, 640 detalj, fanart 640/1280).
struct Media50Remote: View {
    @Environment(Store.self) private var store
    let url: String
    let want: Int
    @State private var img: UIImage?

    init(url: String, want: Int) {
        self.url = url
        self.want = want
        let u: String = Media50Remote.pick(url, want)
        // Fra minnet med en gang (ingen blink når man scroller tilbake). Detalj: 320-versjonen fra listen mens 640 lastes.
        let first: UIImage? = Img50Cache.shared.memory(u) ?? (want > 320 ? Img50Cache.shared.memory(Media50Remote.pick(url, 320)) : nil)
        _img = State(initialValue: first)
    }

    nonisolated static func pick(_ url: String, _ want: Int) -> String {
        guard let m = Media50Reg.shared.get(url) else { return url }
        return m.url(for: want)
    }

    var body: some View {
        ZStack {
            if let img { Image(uiImage: img).resizable().scaledToFill().transition(.opacity) } else { Color.clear }
        }
        .task(id: url + "#\(want)", priority: .userInitiated) {
            let u: String = Media50Remote.pick(url, want)
            if let c = Img50Cache.shared.memory(u) { img = c; return }
            let had: Bool = img != nil
            let i: UIImage? = await Img50Cache.shared.load(u, api: store.api)
            if Task.isCancelled { return }
            if let i {
                if had { img = i } else { withAnimation(.easeOut(duration: 0.18)) { img = i } }
            } else if u != url, img == nil {
                // Eldre server / bilde-endepunktet feilet: prøv adressen fra listen.
                if let j = await Img50Cache.shared.load(url, api: store.api) { withAnimation(.easeOut(duration: 0.18)) { img = j } }
            }
        }
    }
}

enum Media50Prefetch {
    /// Plakatene for de neste `rows` radene etter element `i` i et rutenett med `cols` kolonner.
    @MainActor static func ahead(_ posters: [String], from i: Int, cols: Int, rows: Int = 2, want: Int = 320, _ store: Store) {
        let start: Int = i + 1
        let end: Int = Swift.min(posters.count, start + Swift.max(1, cols) * (rows + 1))
        if start >= end { return }
        let urls: [String] = posters[start..<end].map { Media50Remote.pick($0, want) }
        Img50Cache.shared.prefetch(urls, api: store.api)
    }
}
