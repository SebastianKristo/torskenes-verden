import Foundation
import VisionOCRCore
import XCTest

// Felles fixturer med node-test/logic.test.mjs (Tests/Fixtures/*.json).
private func fixture(_ name: String) throws -> Data {
    let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Fixtures")
        .appendingPathComponent(name)
    return try Data(contentsOf: url)
}

private struct LineFx: Decodable {
    let text: String
    let confidence: Double?
    let bbox: [Double]

    var line: OcrLine {
        OcrLine(text: text, confidence: confidence ?? 1, bbox: BBox(x: bbox[0], y: bbox[1], w: bbox[2], h: bbox[3]))
    }
}

private struct RowsCase: Decodable {
    let name: String
    let lines: [LineFx]
    let rows: [String]
}

private struct VisionCase: Decodable {
    let vision: [Double]
    let top_left: [Double]
}

private struct BandGlobalCase: Decodable {
    let bbox: [Double]
    let band: [Int]
    let image_height: Int
    let global: [Double]
}

private struct BandRangeCase: Decodable {
    let width: Int
    let height: Int
    let bands: [[Int]]
}

private struct BBoxFile: Decodable {
    let vision_to_top_left: [VisionCase]
    let band_to_global: [BandGlobalCase]
    let band_ranges: [BandRangeCase]
}

private struct ExpectedLine: Decodable {
    let text: String
    let confidence: Double
}

private struct MergeCase: Decodable {
    let name: String
    let image_height: Int
    let bands: [[Int]]
    let per_band: [[LineFx]]
    let expected: [ExpectedLine]
    let rows: [String]
}

private func assertNear(_ a: [Double], _ b: [Double], _ msg: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertEqual(a.count, b.count, msg, file: file, line: line)
    for (x, y) in zip(a, b) { XCTAssertEqual(x, y, accuracy: 1e-9, msg, file: file, line: line) }
}

final class GeometryTests: XCTestCase {
    func testRowsFromFixture() throws {
        let cases = try JSONDecoder().decode([RowsCase].self, from: fixture("rows-cases.json"))
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            XCTAssertEqual(groupRows(c.lines.map { $0.line }), c.rows, c.name)
        }
    }

    func testVisionToTopLeftAndBandToGlobal() throws {
        let f = try JSONDecoder().decode(BBoxFile.self, from: fixture("bbox-cases.json"))
        for c in f.vision_to_top_left {
            let b = visionToTopLeft(x: c.vision[0], y: c.vision[1], width: c.vision[2], height: c.vision[3])
            assertNear(b.array, c.top_left, "vision \(c.vision)")
        }
        for c in f.band_to_global {
            let g = bandToGlobal(BBox(x: c.bbox[0], y: c.bbox[1], w: c.bbox[2], h: c.bbox[3]),
                                 band: BandRange(top: c.band[0], height: c.band[1]), imageHeight: c.image_height)
            assertNear(g.array, c.global, "band \(c.band)")
        }
    }

    func testBandRanges() throws {
        let f = try JSONDecoder().decode(BBoxFile.self, from: fixture("bbox-cases.json"))
        for c in f.band_ranges {
            let got = bandRanges(width: c.width, height: c.height).map { [$0.top, $0.height] }
            XCTAssertEqual(got, c.bands, "\(c.width)x\(c.height)")
        }
    }

    func testMergeBands() throws {
        let cases = try JSONDecoder().decode([MergeCase].self, from: fixture("merge-cases.json"))
        for c in cases {
            let bands = c.bands.map { BandRange(top: $0[0], height: $0[1]) }
            let perBand = c.per_band.enumerated().map { i, lines in
                lines.map { fx -> OcrLine in
                    let l = fx.line
                    return OcrLine(text: l.text, confidence: l.confidence,
                                   bbox: bandToGlobal(l.bbox, band: bands[i], imageHeight: c.image_height))
                }
            }
            let merged = sortReadingOrder(mergeBands(perBand, bands: bands, imageHeight: c.image_height))
            XCTAssertEqual(merged.map { $0.text }, c.expected.map { $0.text }, c.name)
            XCTAssertEqual(merged.map { $0.confidence }, c.expected.map { $0.confidence }, c.name)
            XCTAssertEqual(groupRows(merged), c.rows, "\(c.name) (rows)")
        }
    }

    func testTextSimilarity() {
        XCTAssertEqual(levenshtein(Array("kitten"), Array("sitting")), 3)
        XCTAssertTrue(textsSimilar("KAFFE 89,90", "kaffe 89.90"))
        XCTAssertFalse(textsSimilar("MELK", "BRØD"))
        XCTAssertTrue(textsSimilar("", ""))
        XCTAssertFalse(textsSimilar("A", ""))
    }

    func testEmptyInputs() {
        XCTAssertEqual(bandRanges(width: 0, height: 0), [])
        XCTAssertEqual(groupRows([]), [])
        let one = [OcrLine(text: "A", confidence: 1, bbox: BBox(x: 0, y: 0, w: 1, h: 0.1))]
        XCTAssertEqual(mergeBands([one], bands: [BandRange(top: 0, height: 10)], imageHeight: 10), one)
    }

    func testQuadAreaAndRectifyDecision() {
        let full = [NPoint(x: 0, y: 1), NPoint(x: 1, y: 1), NPoint(x: 1, y: 0), NPoint(x: 0, y: 0)]
        XCTAssertEqual(quadArea(full), 1, accuracy: 1e-12)
        let receipt = [NPoint(x: 0.3, y: 0.9), NPoint(x: 0.7, y: 0.9), NPoint(x: 0.7, y: 0.1), NPoint(x: 0.3, y: 0.1)]
        XCTAssertEqual(quadArea(receipt), 0.32, accuracy: 1e-12)
        XCTAssertTrue(shouldRectify(confidence: 0.9, corners: receipt))
        XCTAssertFalse(shouldRectify(confidence: 0.2, corners: receipt), "usikker")
        XCTAssertFalse(shouldRectify(confidence: 0.9, corners: full), "allerede beskåret")
        let tiny = [NPoint(x: 0.4, y: 0.5), NPoint(x: 0.5, y: 0.5), NPoint(x: 0.5, y: 0.4), NPoint(x: 0.4, y: 0.4)]
        XCTAssertFalse(shouldRectify(confidence: 0.9, corners: tiny), "for liten")
    }

    func testBuildResultIsCommonFormat() throws {
        let lines = [
            OcrLine(text: "24,90", confidence: 0.951234, bbox: BBox(x: 0.75, y: 0.205, w: 0.15, h: 0.02)),
            OcrLine(text: "MELK 1L", confidence: 0.97, bbox: BBox(x: 0.05, y: 0.2, w: 0.3, h: 0.02)),
        ]
        let r = buildResult(lines: lines, width: 1200, height: 3000, ms: 412)
        XCTAssertEqual(r.source, "mac_vision")
        XCTAssertEqual(r.rows, ["MELK 1L 24,90"])
        XCTAssertEqual(r.fullText, "MELK 1L 24,90")
        XCTAssertEqual(r.imageSize, [1200, 3000])
        XCTAssertEqual(r.lines.first?.text, "MELK 1L")
        XCTAssertEqual(r.lines.last?.confidence, 0.951)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(encodeResult(r))) as? [String: Any])
        XCTAssertEqual(Set(json.keys), ["source", "lines", "rows", "full_text", "image_size", "ms"])
        let first = try XCTUnwrap((json["lines"] as? [[String: Any]])?.first)
        XCTAssertEqual(Set(first.keys), ["text", "confidence", "bbox"])
        XCTAssertEqual((first["bbox"] as? [Double])?.count, 4)
    }
}
