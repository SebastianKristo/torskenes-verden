// Felles OCR-format (samme fra iPhone, Android og Mac):
// { source, lines:[{text, confidence, bbox:[x,y,w,h]}], rows, full_text, image_size:[w,h], ms }
// bbox normalisert 0–1, origo øverst til venstre. Se shared/schemas/receipt-ocr.schema.json.
import Foundation

public let ocrSource = "mac_vision"

public struct OcrLineOut: Codable, Equatable, Sendable {
    public let text: String
    public let confidence: Double
    public let bbox: [Double]
}

public struct OcrResult: Codable, Equatable, Sendable {
    public let source: String
    public let lines: [OcrLineOut]
    public let rows: [String]
    public let fullText: String
    public let imageSize: [Int]
    public let ms: Int

    enum CodingKeys: String, CodingKey {
        case source, lines, rows, ms
        case fullText = "full_text"
        case imageSize = "image_size"
    }
}

/// Avrunder til `places` desimaler (holder JSON-en kort).
public func roundTo(_ v: Double, places: Int) -> Double {
    let p = pow(10.0, Double(places))
    return (v * p).rounded() / p
}

/// Bygger felles OCR-format av linjer i hele bildets koordinater.
/// `full_text` er radene skilt med linjeskift.
public func buildResult(lines: [OcrLine], width: Int, height: Int, ms: Int) -> OcrResult {
    let ordered = sortReadingOrder(lines)
    let rows = groupRows(ordered)
    let out = ordered.map { l in
        OcrLineOut(
            text: l.text,
            confidence: roundTo(min(1, max(0, l.confidence)), places: 3),
            bbox: l.bbox.array.map { roundTo($0, places: 4) }
        )
    }
    return OcrResult(source: ocrSource, lines: out, rows: rows, fullText: rows.joined(separator: "\n"),
                     imageSize: [width, height], ms: max(0, ms))
}

/// Koder resultatet som JSON (UTF-8, uten escaping av /).
public func encodeResult(_ r: OcrResult, pretty: Bool = false) -> [UInt8] {
    let enc = JSONEncoder()
    enc.outputFormatting = pretty ? [.withoutEscapingSlashes, .prettyPrinted, .sortedKeys] : [.withoutEscapingSlashes]
    guard let data = try? enc.encode(r) else { return Array("{}".utf8) }
    return Array(data)
}

/// JSON av en enkel ordbok (feilmeldinger, /health).
public func jsonBytes(_ obj: [String: Any]) -> [UInt8] {
    guard JSONSerialization.isValidJSONObject(obj),
          let data = try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys, .withoutEscapingSlashes])
    else { return Array("{}".utf8) }
    return Array(data)
}
