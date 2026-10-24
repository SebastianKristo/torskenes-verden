import SwiftUI
import UIKit
import Vision
import CoreImage

// ---------------- Prompt 48: OCR på iPhonen i felles OCR-format (shared/schemas/receipt-ocr.schema.json) ----------------
// ReceiptOcrScanner.extractText(from:) → ReceiptOcrResult {source:"ios_vision", lines[{text, confidence, bbox}], rows, full_text,
// image_size, ms}. Samme regler som Mac-tjenesten (tools/vision-ocr) og serveren (server/receipts48/normalize.js rows48):
// – bbox = [x, y, w, h] normalisert 0–1 med origo ØVERST til venstre (Vision har origo nede til venstre: y = 1 − maxY).
// – rows: linjer med overlappende y-intervall (overlapp ≥ 50 % av den laveste linjens høyde), sortert på x, slått sammen med
//   ett mellomrom. Linjer uten bbox blir egne rader til slutt.
// – Forbehandling: bildet tegnes oppreist (EXIF-orientering), og for bilder som IKKE kommer fra dokumentskanneren
//   (VNDocumentCameraViewController retter allerede opp) prøves VNDetectDocumentSegmentationRequest + CIPerspectiveCorrection.
//   bbox og image_size gjelder bildet etter forbehandlingen, og det er det bildet som lastes opp.
// – Lange kvitteringer (høyde > 2,5 × bredde) leses i overlappende bånd (10 %), og hver linje eies av ett bånd.
// – Språk: se Rc48Lang (nb-NO hvis Vision støtter det, ellers dansk/svensk for æ/ø/å + en-US).
// Kjøres bare når bryteren «Les teksten på iPhone» er på (av som standard, Receipt48Flow.swift).

/// Én tekstlinje (felles OCR-format).
struct ReceiptOcrLine: Codable, Hashable {
    var text: String
    var confidence: Double?
    var bbox: [Double]?
}

/// Felles OCR-format. Feltnavnene ut er ordrett som i schemaet (full_text, image_size).
struct ReceiptOcrResult: Codable, Hashable {
    var source: String
    var lines: [ReceiptOcrLine]
    var rows: [String]
    var fullText: String
    var imageSize: [Double]?
    var ms: Double?

    enum CodingKeys: String, CodingKey {
        case source
        case lines
        case rows
        case fullText = "full_text"
        case imageSize = "image_size"
        case ms
    }

    /// JSON-feltet «device_ocr» til POST /finans/api/receipts/scan.
    var json: String? {
        guard let d = try? JSONEncoder().encode(self) else { return nil }
        return String(data: d, encoding: .utf8)
    }

    var hasText: Bool { !rows.isEmpty || !fullText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

/* ---------- Rene funksjoner (samme regler som serveren og Mac-tjenesten) ---------- */

enum Rc48Geo {
    static func clamp01(_ v: Double) -> Double { min(1, max(0, v)) }
    static func round4(_ v: Double) -> Double { (v * 10_000).rounded() / 10_000 }

    /// Vision (normalisert, origo nede til venstre) → [x, y, w, h] med origo øverst til venstre, klemt til 0–1.
    static func topLeft(x: Double, y: Double, width: Double, height: Double) -> [Double] {
        let x0: Double = clamp01(x)
        let x1: Double = clamp01(x + width)
        let yTop: Double = clamp01(1 - (y + height))
        let yBottom: Double = clamp01(1 - y)
        return [round4(x0), round4(yTop), round4(max(0, x1 - x0)), round4(max(0, yBottom - yTop))]
    }

    static func topLeft(_ r: CGRect) -> [Double] {
        topLeft(x: Double(r.minX), y: Double(r.minY), width: Double(r.width), height: Double(r.height))
    }

    /// bbox normalisert mot et bånd (origo øverst) → hele bildet.
    static func bandToGlobal(_ b: [Double], top: Int, height: Int, imageHeight: Int) -> [Double] {
        let H: Double = Double(max(1, imageHeight))
        let bh: Double = Double(height)
        let y: Double = clamp01((Double(top) + b[1] * bh) / H)
        let h: Double = min(1, b[3] * bh / H)
        return [b[0], round4(y), b[2], round4(h)]
    }

    /// Overlappende bånd for høye bilder: bare når høyde > 2,5 × bredde. Båndhøyde 2 × bredde (minst 400 px), 10 % overlapp.
    static func bands(width: Int, height: Int) -> [(top: Int, height: Int)] {
        guard width > 0, height > 0 else { return [] }
        if Double(height) <= 2.5 * Double(width) { return [(top: 0, height: height)] }
        let bandHeight: Int = max(400, width * 2)
        if bandHeight >= height { return [(top: 0, height: height)] }
        let overlap: Int = max(1, Int((Double(bandHeight) * 0.10).rounded()))
        let step: Int = max(1, bandHeight - overlap)
        var out: [(top: Int, height: Int)] = []
        var top: Int = 0
        while true {
            if top + bandHeight >= height {
                out.append((top: height - bandHeight, height: bandHeight))
                break
            }
            out.append((top: top, height: bandHeight))
            top += step
        }
        return out
    }

    /// Snittlinjene midt i hver overlapp (normalisert mot hele bildet). Bånd i eier linjer med midtpunkt i (snitt i−1, snitt i].
    static func cuts(_ bands: [(top: Int, height: Int)], imageHeight: Int) -> [Double] {
        let H: Double = Double(max(1, imageHeight))
        var out: [Double] = []
        if bands.count < 2 { return out }
        for i in 0..<(bands.count - 1) {
            let a: Double = Double(bands[i + 1].top)
            let b: Double = Double(bands[i].top + bands[i].height)
            out.append(((a + b) / 2) / H)
        }
        return out
    }

    /// Radgruppering (som rows48 på serveren).
    static func rows(_ lines: [ReceiptOcrLine]) -> [String] {
        struct Piece { let t: String; let x: Double; let top: Double; let bot: Double; let h: Double; let i: Int }
        struct Group { var parts: [Piece]; var top: Double; var bot: Double; var minH: Double; let i: Int }
        var boxed: [Piece] = []
        var loose: [String] = []
        for (i, l) in lines.enumerated() {
            let t: String = l.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if t.isEmpty { continue }
            if let b = l.bbox, b.count == 4, b.allSatisfy({ (v: Double) in v.isFinite }) {
                boxed.append(Piece(t: t, x: b[0], top: b[1], bot: b[1] + b[3], h: b[3], i: i))
            } else {
                loose.append(t)
            }
        }
        boxed.sort { (a: Piece, b: Piece) -> Bool in
            let ma: Double = (a.top + a.bot) / 2
            let mb: Double = (b.top + b.bot) / 2
            if ma != mb { return ma < mb }
            if a.x != b.x { return a.x < b.x }
            return a.i < b.i
        }
        var groups: [Group] = []
        for w in boxed {
            let wh: Double = w.h > 0 ? w.h : 1e-9
            let hit: Int? = groups.firstIndex { (g: Group) -> Bool in
                min(g.bot, w.bot) - max(g.top, w.top) >= 0.5 * min(g.minH, wh)
            }
            if let k = hit {
                groups[k].parts.append(w)
                groups[k].top = min(groups[k].top, w.top)
                groups[k].bot = max(groups[k].bot, w.bot)
                groups[k].minH = min(groups[k].minH, w.h)
            } else {
                groups.append(Group(parts: [w], top: w.top, bot: w.bot, minH: w.h, i: groups.count))
            }
        }
        groups.sort { (a: Group, b: Group) -> Bool in a.top != b.top ? a.top < b.top : a.i < b.i }
        let out: [String] = groups.map { (g: Group) -> String in
            // Stabil sortering på x (lik x: rekkefølgen linjene kom inn i raden, som på serveren).
            let parts: [(offset: Int, element: Piece)] = g.parts.enumerated().sorted { (a: (offset: Int, element: Piece), b: (offset: Int, element: Piece)) -> Bool in
                a.element.x != b.element.x ? a.element.x < b.element.x : a.offset < b.offset
            }
            return parts.map { (p: (offset: Int, element: Piece)) in p.element.t }.joined(separator: " ")
        }
        return out + loose
    }

    /// Skolissemetoden: arealet av firkanten (punktene i rekkefølge rundt).
    static func quadArea(_ p: [CGPoint]) -> Double {
        guard p.count >= 3 else { return 0 }
        var s: Double = 0
        for i in 0..<p.count {
            let a: CGPoint = p[i]
            let b: CGPoint = p[(i + 1) % p.count]
            s += Double(a.x * b.y - b.x * a.y)
        }
        return abs(s) / 2
    }

    /// Rette opp perspektivet? Nei hvis Vision er usikker, firkanten er liten (feil objekt) eller dekker nesten hele bildet.
    static func shouldRectify(confidence: Double, corners: [CGPoint]) -> Bool {
        guard corners.count == 4, confidence >= 0.5 else { return false }
        let a: Double = quadArea(corners)
        return a >= 0.15 && a <= 0.97
    }
}

/// Språkvalget for VNRecognizeTextRequest (samme regel som Mac-tjenesten, tools/vision-ocr/Sources/VisionOCRCore/Languages.swift).
struct Rc48Lang: Equatable {
    let languages: [String]
    let norwegian: Bool
    let note: String

    static let norwegianCandidates: [String] = ["nb-NO", "nb", "no-NO", "no", "nn-NO", "nn"]
    /// Reserve uten norsk: dansk og svensk har æ/ø/å (og ä/ö), engelsk tar resten.
    static let fallbackCandidates: [String] = ["da-DK", "sv-SE", "en-US"]
    /// Ord som ofte står på norske kvitteringer (brukes bare når språkkorrigering er på).
    static let customWords: [String] = ["TOTAL", "SUM", "Å BETALE", "BETALT", "KVITTERING", "PANT", "RABATT", "MVA", "ORG.NR",
                                        "BANKAXEPT", "VISA", "MASTERCARD", "VIPPS", "KONTANT", "TIPS", "DRIKKEPENGER", "ANTALL", "STK",
                                        "KR", "NOK", "TRUMF", "COOP", "REMA", "KIWI", "MENY", "EXTRA", "OBS", "SPAR", "JOKER", "BRØD",
                                        "MELK", "SMØR", "OST", "KJØTT", "FISK", "GRØNNSAKER", "FRUKT", "ØL", "VARER"]

    private static func canon(_ s: String) -> String { s.replacingOccurrences(of: "_", with: "-").lowercased() }
    private static func lookup(_ code: String, _ supported: [String]) -> String? {
        let c: String = canon(code)
        return supported.first { (s: String) in canon(s) == c }
    }

    static func choose(supported: [String]) -> Rc48Lang {
        for n in norwegianCandidates {
            if let code = lookup(n, supported) {
                var langs: [String] = [code]
                if let en = lookup("en-US", supported) { langs.append(en) }
                return Rc48Lang(languages: langs, norwegian: true, note: "Norsk er støttet av Vision")
            }
        }
        var fb: [String] = []
        for f in fallbackCandidates {
            if let code = lookup(f, supported), !fb.contains(code) { fb.append(code) }
        }
        if !fb.isEmpty {
            return Rc48Lang(languages: fb, norwegian: false, note: "Norsk er ikke støttet av Vision på denne iOS-versjonen – bruker " + fb.joined(separator: ", "))
        }
        return Rc48Lang(languages: ["en-US"], norwegian: false, note: "Verken norsk, dansk eller svensk er støttet – bruker en-US (æ/ø/å kan bli lest feil)")
    }

    /// Valget på denne enheten (leses én gang).
    static let current: Rc48Lang = {
        let r: VNRecognizeTextRequest = VNRecognizeTextRequest()
        r.recognitionLevel = .accurate
        let have: [String] = (try? r.supportedRecognitionLanguages()) ?? []
        return choose(supported: have)
    }()
}

/* ---------- Forbehandling ---------- */

enum Rc48Prep {
    static let ci: CIContext = CIContext(options: nil)
    /// Største side før OCR og opplasting (12 MP-bilder er greie; 48 MP skaleres ned).
    static let maxSide: CGFloat = 4096
    /// Flere sider fra skanneren slås sammen til ett høyt bilde, men ikke høyere enn dette.
    static let maxStitchHeight: CGFloat = 16_000

    /// Bildet tegnet oppreist (EXIF-orienteringen brukt) i piksler, høyst maxSide.
    static func upright(_ img: UIImage) -> UIImage {
        let px: CGSize = CGSize(width: img.size.width * img.scale, height: img.size.height * img.scale)
        let s: CGFloat = min(1, maxSide / max(px.width, px.height, 1))
        if img.imageOrientation == .up, s >= 1, img.cgImage != nil { return img }
        let target: CGSize = CGSize(width: (px.width * s).rounded(), height: (px.height * s).rounded())
        let f: UIGraphicsImageRendererFormat = UIGraphicsImageRendererFormat()
        f.scale = 1
        return UIGraphicsImageRenderer(size: target, format: f).image { (_: UIGraphicsImageRendererContext) in
            img.draw(in: CGRect(origin: .zero, size: target))
        }
    }

    /// Oppreist + (for bilder som ikke er fra dokumentskanneren) rettet perspektiv og beskåret. Kjøres utenfor hovedtråden.
    static func prepared(_ img: UIImage, rectify: Bool) async -> UIImage {
        let up: UIImage = upright(img)
        if !rectify { return up }
        guard let cg = up.cgImage else { return up }
        let out: CGImage? = await Task.detached(priority: .userInitiated) { () -> CGImage? in Rc48Prep.rectified(cg) }.value
        guard let out else { return up }
        return UIImage(cgImage: out)
    }

    /// VNDetectDocumentSegmentationRequest + CIPerspectiveCorrection. nil = ingen sikker dokumentkant (bruk bildet som det er).
    static func rectified(_ cg: CGImage) -> CGImage? {
        let req: VNDetectDocumentSegmentationRequest = VNDetectDocumentSegmentationRequest()
        let h: VNImageRequestHandler = VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:])
        do { try h.perform([req]) } catch { return nil }
        guard let o = req.results?.first else { return nil }
        let corners: [CGPoint] = [o.topLeft, o.topRight, o.bottomRight, o.bottomLeft]
        guard Rc48Geo.shouldRectify(confidence: Double(o.confidence), corners: corners) else { return nil }
        let W: CGFloat = CGFloat(cg.width)
        let H: CGFloat = CGFloat(cg.height)
        // Vision og Core Image har begge origo nede til venstre.
        func vec(_ p: CGPoint) -> CIVector { CIVector(x: p.x * W, y: p.y * H) }
        guard let f = CIFilter(name: "CIPerspectiveCorrection") else { return nil }
        f.setValue(CIImage(cgImage: cg), forKey: kCIInputImageKey)
        f.setValue(vec(o.topLeft), forKey: "inputTopLeft")
        f.setValue(vec(o.topRight), forKey: "inputTopRight")
        f.setValue(vec(o.bottomRight), forKey: "inputBottomRight")
        f.setValue(vec(o.bottomLeft), forKey: "inputBottomLeft")
        guard let out = f.outputImage, out.extent.width >= 200, out.extent.height >= 200 else { return nil }
        return ci.createCGImage(out, from: out.extent)
    }

    /// Flere sider (én lang kvittering) → ett høyt bilde med felles bredde. nil = for høyt (sendes som PDF i stedet).
    static func stitch(_ imgs: [UIImage]) -> UIImage? {
        let ups: [UIImage] = imgs.map { (i: UIImage) in upright(i) }
        guard let first = ups.first else { return nil }
        if ups.count == 1 { return first }
        let width: CGFloat = min(1800, ups.map { (i: UIImage) in i.size.width * i.scale }.max() ?? 1200)
        let heights: [CGFloat] = ups.map { (i: UIImage) -> CGFloat in
            let w: CGFloat = max(1, i.size.width * i.scale)
            return ((i.size.height * i.scale) * width / w).rounded()
        }
        let total: CGFloat = heights.reduce(0, +)
        if total > maxStitchHeight { return nil }
        let f: UIGraphicsImageRendererFormat = UIGraphicsImageRendererFormat()
        f.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: total), format: f).image { (ctx: UIGraphicsImageRendererContext) in
            UIColor.white.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: total))
            var y: CGFloat = 0
            for (i, img) in ups.enumerated() {
                img.draw(in: CGRect(x: 0, y: y, width: width, height: heights[i]))
                y += heights[i]
            }
        }
    }
}

/* ---------- OCR ---------- */

final class ReceiptOcrScanner {
    static let shared: ReceiptOcrScanner = ReceiptOcrScanner()

    enum Failure: Error {
        case noImage
        case noText
    }

    /// Leser teksten i et (helst ferdig forbehandlet) bilde. Aldri på hovedtråden.
    func extractText(from image: UIImage) async throws -> ReceiptOcrResult {
        let up: UIImage = Rc48Prep.upright(image)
        guard let cg = up.cgImage else { throw Failure.noImage }
        let lang: Rc48Lang = Rc48Lang.current
        let r: ReceiptOcrResult = await Task.detached(priority: .userInitiated) { () -> ReceiptOcrResult in
            ReceiptOcrScanner.recognize(cg, lang: lang)
        }.value
        if !r.hasText { throw Failure.noText }
        return r
    }

    static func recognize(_ cg: CGImage, lang: Rc48Lang) -> ReceiptOcrResult {
        let t0: Date = Date()
        let W: Int = cg.width
        let H: Int = cg.height
        let bands: [(top: Int, height: Int)] = Rc48Geo.bands(width: W, height: H)
        var lines: [ReceiptOcrLine] = []
        if bands.count <= 1 {
            lines = page(cg, lang: lang)
        } else {
            let cuts: [Double] = Rc48Geo.cuts(bands, imageHeight: H)
            for (i, b) in bands.enumerated() {
                guard let part = cg.cropping(to: CGRect(x: 0, y: b.top, width: W, height: b.height)) else { continue }
                let lo: Double = i == 0 ? -Double.infinity : cuts[i - 1]
                let hi: Double = i == bands.count - 1 ? Double.infinity : cuts[i]
                for l in page(part, lang: lang) {
                    guard let bb = l.bbox else { continue }
                    let g: [Double] = Rc48Geo.bandToGlobal(bb, top: b.top, height: b.height, imageHeight: H)
                    let mid: Double = g[1] + g[3] / 2
                    if mid > lo && mid <= hi { lines.append(ReceiptOcrLine(text: l.text, confidence: l.confidence, bbox: g)) }
                }
            }
        }
        lines = Array(lines.prefix(3000))
        let rows: [String] = Rc48Geo.rows(lines).prefix(2000).map { (s: String) in String(s.prefix(2000)) }
        let full: String = String(rows.joined(separator: "\n").prefix(60_000))
        let ms: Double = (Date().timeIntervalSince(t0) * 1000).rounded()
        return ReceiptOcrResult(source: "ios_vision", lines: lines, rows: rows, fullText: full, imageSize: [Double(W), Double(H)], ms: ms)
    }

    /// Én Vision-lesing: .accurate, språkkorrigering på, språk fra Rc48Lang.
    private static func page(_ cg: CGImage, lang: Rc48Lang) -> [ReceiptOcrLine] {
        let req: VNRecognizeTextRequest = VNRecognizeTextRequest()
        req.recognitionLevel = .accurate
        req.usesLanguageCorrection = true
        req.recognitionLanguages = lang.languages
        req.customWords = Rc48Lang.customWords
        let handler: VNImageRequestHandler = VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:])
        do { try handler.perform([req]) } catch { return [] }
        let obs: [VNRecognizedTextObservation] = req.results ?? []
        return obs.compactMap { (o: VNRecognizedTextObservation) -> ReceiptOcrLine? in
            guard let c = o.topCandidates(1).first else { return nil }
            let t: String = c.string.trimmingCharacters(in: .whitespacesAndNewlines)
            if t.isEmpty { return nil }
            let conf: Double = Rc48Geo.round4(Rc48Geo.clamp01(Double(c.confidence)))
            return ReceiptOcrLine(text: String(t.prefix(1000)), confidence: conf, bbox: Rc48Geo.topLeft(o.boundingBox))
        }
    }
}
