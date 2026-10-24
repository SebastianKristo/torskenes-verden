// Rene geometrifunksjoner: bbox-konvertering, bånd for lange kvitteringer,
// sammenslåing av bånd (deduplisering i overlappen) og rows-gruppering.
// Den samme algoritmen er portert til node-test/logic.mjs – hold dem like.
import Foundation

/// Normalisert rektangel (0–1), origo ØVERST til venstre (felles OCR-format).
public struct BBox: Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var w: Double
    public var h: Double

    public init(x: Double, y: Double, w: Double, h: Double) {
        self.x = x
        self.y = y
        self.w = w
        self.h = h
    }

    public var midY: Double { y + h / 2 }
    public var maxY: Double { y + h }
    public var maxX: Double { x + w }
    public var array: [Double] { [x, y, w, h] }
}

/// Én tekstlinje fra OCR.
public struct OcrLine: Equatable, Sendable {
    public var text: String
    public var confidence: Double
    public var bbox: BBox

    public init(text: String, confidence: Double, bbox: BBox) {
        self.text = text
        self.confidence = confidence
        self.bbox = bbox
    }
}

@inline(__always) func clamp01(_ v: Double) -> Double { min(1, max(0, v)) }

/// Vision gir normaliserte koordinater med origo NEDE til venstre.
/// Ut: origo øverst til venstre, klemt til 0–1: [x, 1 − (y + h), w, h].
public func visionToTopLeft(x: Double, y: Double, width: Double, height: Double) -> BBox {
    let x0 = clamp01(x)
    let x1 = clamp01(x + width)
    let yTop = clamp01(1 - (y + height))
    let yBottom = clamp01(1 - y)
    return BBox(x: x0, y: yTop, w: max(0, x1 - x0), h: max(0, yBottom - yTop))
}

/// Et horisontalt bånd av bildet, i piksler (origo øverst).
public struct BandRange: Equatable, Sendable {
    public let top: Int
    public let height: Int

    public init(top: Int, height: Int) {
        self.top = top
        self.height = height
    }
}

/// Deler et høyt bilde i overlappende bånd.
/// - Bare når høyde > `maxRatio` × bredde (standard 2,5). Ellers ett bånd.
/// - Båndhøyde = `bandRatio` × bredde (minst `minBandHeight`), overlapp = `overlap` × båndhøyde.
/// - Siste bånd legges kant i kant med bunnen (kan da overlappe mer enn 10 %).
public func bandRanges(width: Int, height: Int, maxRatio: Double = 2.5, bandRatio: Double = 2.0,
                       overlap: Double = 0.10, minBandHeight: Int = 400) -> [BandRange] {
    guard width > 0, height > 0 else { return [] }
    if Double(height) <= maxRatio * Double(width) { return [BandRange(top: 0, height: height)] }
    let bandHeight = max(minBandHeight, Int((Double(width) * bandRatio).rounded()))
    if bandHeight >= height { return [BandRange(top: 0, height: height)] }
    let overlapPx = max(1, Int((Double(bandHeight) * overlap).rounded()))
    let step = max(1, bandHeight - overlapPx)
    var out: [BandRange] = []
    var top = 0
    while true {
        if top + bandHeight >= height {
            out.append(BandRange(top: height - bandHeight, height: bandHeight))
            break
        }
        out.append(BandRange(top: top, height: bandHeight))
        top += step
    }
    return out
}

/// Gjør en bbox som er normalisert mot et bånd (origo øverst) om til hele bildet.
public func bandToGlobal(_ b: BBox, band: BandRange, imageHeight: Int) -> BBox {
    let H = Double(max(1, imageHeight))
    let top = Double(band.top)
    let bh = Double(band.height)
    return BBox(x: b.x, y: clamp01((top + b.y * bh) / H), w: b.w, h: min(1, b.h * bh / H))
}

/// Tekst normalisert for sammenligning: små bokstaver, uten mellomrom.
public func normalizeText(_ s: String) -> String {
    String(s.lowercased().filter { !$0.isWhitespace })
}

/// Levenshtein-avstand (antall tegn som må endres).
public func levenshtein(_ a: [Character], _ b: [Character]) -> Int {
    if a.isEmpty { return b.count }
    if b.isEmpty { return a.count }
    var prev = Array(0...b.count)
    var cur = [Int](repeating: 0, count: b.count + 1)
    for i in 1...a.count {
        cur[0] = i
        for j in 1...b.count {
            let cost = a[i - 1] == b[j - 1] ? 0 : 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
        }
        swap(&prev, &cur)
    }
    return prev[b.count]
}

/// Lik tekst etter normalisering, eller nesten lik (høyst ett tegn per fem forskjellig).
public func textsSimilar(_ a: String, _ b: String) -> Bool {
    let na = normalizeText(a)
    let nb = normalizeText(b)
    if na.isEmpty || nb.isEmpty { return na == nb }
    if na == nb { return true }
    let d = levenshtein(Array(na), Array(nb))
    return d <= max(1, max(na.count, nb.count) / 5)
}

/// To linjer (i hele bildets koordinater) er samme linje lest to ganger.
public func isDuplicateLine(_ a: OcrLine, _ b: OcrLine) -> Bool {
    let tolerance = max(a.bbox.h, b.bbox.h) * 0.6
    guard abs(a.bbox.midY - b.bbox.midY) <= tolerance else { return false }
    let xOverlap = min(a.bbox.maxX, b.bbox.maxX) - max(a.bbox.x, b.bbox.x)
    guard xOverlap > 0 else { return false }
    return textsSimilar(a.text, b.text)
}

/// Slår sammen linjer fra overlappende bånd. `perBand[i]` skal allerede være i hele bildets
/// koordinater (se `bandToGlobal`).
/// 1. Midt i hver overlapp går et snitt. Bånd i eier linjer med midtpunkt i (snitt i−1, snitt i].
///    Da forsvinner linjer som er kuttet i kanten av et bånd (de er hele i nabobåndet).
/// 2. Linjer fra nabobånd som likevel er samme linje (lik tekst, nesten samme y, overlapp i x)
///    dedupliseres. Den med høyest konfidens beholdes.
public func mergeBands(_ perBand: [[OcrLine]], bands: [BandRange], imageHeight: Int) -> [OcrLine] {
    guard perBand.count == bands.count, bands.count > 1 else { return perBand.flatMap { $0 } }
    let H = Double(max(1, imageHeight))
    var cuts: [Double] = []
    for i in 0..<(bands.count - 1) {
        let ov0 = Double(bands[i + 1].top)
        let ov1 = Double(bands[i].top + bands[i].height)
        cuts.append(((ov0 + ov1) / 2) / H)
    }
    var kept: [(line: OcrLine, band: Int)] = []
    for (i, lines) in perBand.enumerated() {
        let lo = i == 0 ? -Double.infinity : cuts[i - 1]
        let hi = i == bands.count - 1 ? Double.infinity : cuts[i]
        for l in lines where l.bbox.midY > lo && l.bbox.midY <= hi {
            kept.append((line: l, band: i))
        }
    }
    var drop = Set<Int>()
    for a in 0..<kept.count {
        if drop.contains(a) { continue }
        var b = a + 1
        while b < kept.count {
            if !drop.contains(b), abs(kept[a].band - kept[b].band) == 1,
               isDuplicateLine(kept[a].line, kept[b].line) {
                if kept[b].line.confidence > kept[a].line.confidence {
                    drop.insert(a)
                    break
                }
                drop.insert(b)
            }
            b += 1
        }
    }
    var out: [OcrLine] = []
    for (i, k) in kept.enumerated() where !drop.contains(i) { out.append(k.line) }
    return out
}

/// Sorterer linjer i leserekkefølge: midtpunkt i y, så x.
public func sortReadingOrder(_ lines: [OcrLine]) -> [OcrLine] {
    lines.sorted { ($0.bbox.midY, $0.bbox.x) < ($1.bbox.midY, $1.bbox.x) }
}

private struct RowBucket {
    var top: Double
    var bottom: Double
    var sumHeight: Double
    var members: [OcrLine]

    init(_ l: OcrLine) {
        top = l.bbox.y
        bottom = l.bbox.maxY
        sumHeight = l.bbox.h
        members = [l]
    }

    var meanHeight: Double { sumHeight / Double(max(1, members.count)) }
    var minX: Double { members.map { $0.bbox.x }.min() ?? 0 }

    mutating func add(_ l: OcrLine) {
        top = min(top, l.bbox.y)
        bottom = max(bottom, l.bbox.maxY)
        sumHeight += l.bbox.h
        members.append(l)
    }
}

/// Grupperer linjer til rader: linjer med overlappende y-intervall havner i samme rad
/// (overlappen må være minst `minOverlap` av den laveste av linjehøyden og radens snitthøyde,
/// slik at to naborader som så vidt berører hverandre ikke slås sammen). Radene sorteres
/// ovenfra og ned, linjene i en rad på x, og slås sammen med ett mellomrom.
public func groupRows(_ lines: [OcrLine], minOverlap: Double = 0.5) -> [String] {
    let usable = sortReadingOrder(lines.filter {
        !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    })
    var rows: [RowBucket] = []
    for l in usable {
        var best = -1
        var bestScore = 0.0
        for (i, r) in rows.enumerated() {
            let overlap = min(r.bottom, l.bbox.maxY) - max(r.top, l.bbox.y)
            if overlap <= 0 { continue }
            let ref = min(l.bbox.h, r.meanHeight)
            if ref <= 0 { continue }
            let score = overlap / ref
            if score >= minOverlap && score > bestScore {
                best = i
                bestScore = score
            }
        }
        if best >= 0 { rows[best].add(l) } else { rows.append(RowBucket(l)) }
    }
    rows.sort { ($0.top, $0.minX) < ($1.top, $1.minX) }
    return rows.map { r in
        r.members.sorted { $0.bbox.x < $1.bbox.x }
            .map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }
            .joined(separator: " ")
    }
}

/// Et punkt i normaliserte koordinater (brukes for dokumentkanten).
public struct NPoint: Equatable, Sendable {
    public let x: Double
    public let y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

/// Arealet av en firkant (skolissemetoden), punktene i rekkefølge rundt firkanten.
public func quadArea(_ p: [NPoint]) -> Double {
    guard p.count >= 3 else { return 0 }
    var s = 0.0
    for i in 0..<p.count {
        let a = p[i]
        let b = p[(i + 1) % p.count]
        s += a.x * b.y - b.x * a.y
    }
    return abs(s) / 2
}

/// Skal vi rette opp perspektivet til den funne dokumentkanten?
/// Nei hvis Vision er usikker, hvis firkanten er liten (sannsynligvis feil objekt),
/// eller hvis den nesten dekker hele bildet (allerede beskåret).
public func shouldRectify(confidence: Double, corners: [NPoint],
                          minConfidence: Double = 0.5, minArea: Double = 0.15,
                          maxArea: Double = 0.97) -> Bool {
    guard corners.count == 4, confidence >= minConfidence else { return false }
    let area = quadArea(corners)
    return area >= minArea && area <= maxArea
}
