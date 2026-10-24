import Foundation
import VisionOCRCore
import XCTest

final class SecurityTests: XCTestCase {
    func testConstantTimeEquals() {
        let key = String(repeating: "ab", count: 32)
        XCTAssertTrue(constantTimeEquals(key, key))
        XCTAssertFalse(constantTimeEquals(key + "x", key))
        XCTAssertFalse(constantTimeEquals(String(key.dropLast()), key))
        XCTAssertFalse(constantTimeEquals(String(key.dropLast()) + "c", key))
        XCTAssertFalse(constantTimeEquals("", ""))
        XCTAssertFalse(constantTimeEquals("", key))
    }

    func testBearerToken() {
        XCTAssertEqual(bearerToken(from: "Bearer abc123"), "abc123")
        XCTAssertEqual(bearerToken(from: "bearer   abc123  "), "abc123")
        XCTAssertNil(bearerToken(from: "Basic abc123"))
        XCTAssertNil(bearerToken(from: "Bearer "))
        XCTAssertNil(bearerToken(from: nil))
    }

    func testAllowList() throws {
        let list = try XCTUnwrap(IPAllowList(["10.69.1.39"]))
        XCTAssertTrue(list.allows("10.69.1.39"))
        XCTAssertTrue(list.allows("::ffff:10.69.1.39"))
        XCTAssertFalse(list.allows("10.69.1.38"))
        XCTAssertFalse(list.allows("10.69.1.173"))
        XCTAssertFalse(list.allows("127.0.0.1"))
        XCTAssertFalse(list.allows("tull"))

        let net = try XCTUnwrap(IPAllowList(["10.69.1.0/24", "192.168.1.30"]))
        XCTAssertTrue(net.allows("10.69.1.200"))
        XCTAssertFalse(net.allows("10.69.2.1"))
        XCTAssertTrue(net.allows("192.168.1.30"))

        XCTAssertNil(IPAllowList([]))
        XCTAssertNil(IPAllowList(["0.0.0.0/0"]), "for vidt nett")
        XCTAssertNil(IPAllowList(["10.0.0.0/8"]), "for vidt nett")
        XCTAssertNil(IPAllowList(["10.69.1.300"]))
        XCTAssertNil(IPAllowList(["10.69.1"]))
    }

    func testIPv4() {
        XCTAssertEqual(parseIPv4("10.69.1.39"), 0x0A45_0127)
        XCTAssertEqual(formatIPv4(0x0A45_0127), "10.69.1.39")
        XCTAssertNil(parseIPv4("1.2.3.4.5"))
        XCTAssertNil(parseIPv4("1..3.4"))
        XCTAssertNil(parseIPv4("+1.2.3.4"))
    }

    func testConfigValidation() {
        let key = String(repeating: "f", count: 64)
        XCTAssertEqual(validateConfig(ServiceConfig(key: key)), [])
        XCTAssertFalse(validateConfig(ServiceConfig(bindIP: "0.0.0.0", key: key)).isEmpty)
        XCTAssertFalse(validateConfig(ServiceConfig(bindIP: "127.0.0.1", key: key)).isEmpty)
        XCTAssertFalse(validateConfig(ServiceConfig(key: "kort")).isEmpty)
        XCTAssertFalse(validateConfig(ServiceConfig(key: key, allow: [])).isEmpty)
        XCTAssertFalse(validateConfig(ServiceConfig(port: 0, key: key)).isEmpty)
    }

    func testConfigDecodingAndDefaults() throws {
        let json = #"{"bind_ip":"10.69.1.173","port":8765,"key":"\#(String(repeating: "a", count: 64))","allow":["10.69.1.39"]}"#
        let c = try JSONDecoder().decode(ServiceConfig.self, from: Data(json.utf8))
        XCTAssertEqual(c.bindIP, "10.69.1.173")
        XCTAssertEqual(c.effectiveMaxBytes, 20 * 1024 * 1024)
        XCTAssertEqual(c.effectiveTimeout, 60)
        XCTAssertTrue(c.effectiveLanguageCorrection)
        XCTAssertGreaterThan(c.effectiveMaxBody, c.effectiveMaxBytes)
    }
}

final class LanguageTests: XCTestCase {
    func testNorwegianPreferred() {
        let c = chooseLanguages(supported: ["en-US", "fr-FR", "nb-NO", "da-DK"])
        XCTAssertEqual(c.languages, ["nb-NO", "en-US"])
        XCTAssertTrue(c.norwegian)
    }

    func testNorwegianVariantSpelling() {
        let c = chooseLanguages(supported: ["en-US", "no_NO"])
        XCTAssertEqual(c.languages, ["no_NO", "en-US"])
        XCTAssertTrue(c.norwegian)
    }

    func testFallbackCombination() {
        let c = chooseLanguages(supported: ["en-US", "fr-FR", "de-DE", "sv-SE", "da-DK"])
        XCTAssertEqual(c.languages, ["da-DK", "sv-SE", "en-US"])
        XCTAssertFalse(c.norwegian)
    }

    func testOnlyEnglish() {
        let c = chooseLanguages(supported: ["en-US", "fr-FR", "de-DE"])
        XCTAssertEqual(c.languages, ["en-US"])
        XCTAssertFalse(c.norwegian)
        XCTAssertEqual(chooseLanguages(supported: []).languages, ["en-US"])
    }

    func testOverride() {
        let c = chooseLanguages(supported: ["en-US", "sv-SE"], override: ["sv-SE", "xx-XX"])
        XCTAssertEqual(c.languages, ["sv-SE"])
        let fallback = chooseLanguages(supported: ["en-US"], override: ["xx-XX"])
        XCTAssertEqual(fallback.languages, ["en-US"])
    }
}

final class HTTPTests: XCTestCase {
    func testRequestHead() throws {
        let raw = "POST /ocr?crop=0 HTTP/1.1\r\nHost: 10.69.1.173:8765\r\nAuthorization: Bearer k\r\nContent-Length: 12\r\n\r\n"
        let bytes = Array(raw.utf8) + Array("body".utf8)
        let end = try XCTUnwrap(findHeaderEnd(bytes))
        XCTAssertEqual(end, raw.utf8.count)
        let head = try XCTUnwrap(parseRequestHead(Array(bytes[0..<end])))
        XCTAssertEqual(head.method, "POST")
        XCTAssertEqual(head.path, "/ocr")
        XCTAssertEqual(head.query, "crop=0")
        XCTAssertEqual(head.headers["authorization"], "Bearer k")
        XCTAssertEqual(head.headers["content-length"], "12")
        XCTAssertNil(parseRequestHead(Array("tull\r\n\r\n".utf8)))
        XCTAssertNil(parseRequestHead(Array("GET http://x/ HTTP/1.1\r\n\r\n".utf8)))
    }

    func testHeaderParameter() {
        XCTAssertEqual(headerParameter("multipart/form-data; boundary=----abc", "boundary"), "----abc")
        XCTAssertEqual(headerParameter("multipart/form-data; boundary=\"a;b\"", "boundary"), "a;b")
        XCTAssertEqual(headerParameter("form-data; name=\"image\"; filename=\"k.jpg\"", "name"), "image")
        XCTAssertEqual(headerParameter("form-data; name=\"image\"; filename=\"k.jpg\"", "filename"), "k.jpg")
        XCTAssertNil(headerParameter("form-data; name=\"image\"", "filename"))
    }

    private func multipartBody(boundary: String, image: [UInt8]) -> [UInt8] {
        var b: [UInt8] = []
        b += Array("--\(boundary)\r\nContent-Disposition: form-data; name=\"crop\"\r\n\r\nnei\r\n".utf8)
        b += Array("--\(boundary)\r\nContent-Disposition: form-data; name=\"image\"; filename=\"k.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8)
        b += image
        b += Array("\r\n--\(boundary)--\r\n".utf8)
        return b
    }

    func testMultipartUpload() throws {
        // Bildedata som inneholder CRLF og bindestreker skal komme ut uendret.
        let image: [UInt8] = [0xFF, 0xD8, 0xFF, 0x0D, 0x0A, 0x2D, 0x2D, 0x00, 0x42]
        let boundary = "----WebKitFormBoundaryX"
        let body = multipartBody(boundary: boundary, image: image)
        let parts = try XCTUnwrap(parseMultipart(body, boundary: boundary))
        XCTAssertEqual(parts.count, 2)
        XCTAssertEqual(parts[1].name, "image")
        XCTAssertEqual(parts[1].filename, "k.jpg")
        XCTAssertEqual(parts[1].data, image)

        let result = extractUpload(contentType: "multipart/form-data; boundary=\(boundary)", query: "", body: body)
        guard case .success(let up) = result else { return XCTFail("forventet bilde") }
        XCTAssertEqual(Array(up.data), image)
        XCTAssertFalse(up.crop)
    }

    func testJSONUpload() {
        let image: [UInt8] = [0x89, 0x50, 0x4E, 0x47, 1, 2, 3]
        let b64 = Data(image).base64EncodedString()
        let body = Array(#"{"image_base64":"data:image/png;base64,\#(b64)"}"#.utf8)
        guard case .success(let up) = extractUpload(contentType: "application/json", query: "", body: body) else {
            return XCTFail("forventet bilde")
        }
        XCTAssertEqual(Array(up.data), image)
        XCTAssertTrue(up.crop)

        let noImage = extractUpload(contentType: "application/json", query: "", body: Array("{}".utf8))
        XCTAssertEqual(noImage.failureValue, .noImage)
        let bad = extractUpload(contentType: "application/json", query: "", body: Array("{".utf8))
        XCTAssertEqual(bad.failureValue, .badJSON)
    }

    func testRawUploadAndUnsupported() {
        guard case .success(let up) = extractUpload(contentType: "image/heic", query: "crop=0", body: [1, 2, 3]) else {
            return XCTFail("forventet bilde")
        }
        XCTAssertFalse(up.crop)
        XCTAssertEqual(extractUpload(contentType: "text/plain", query: "", body: [1]).failureValue, .unsupportedMediaType)
        XCTAssertEqual(UploadError.unsupportedMediaType.status, 415)
    }

    func testResponse() {
        let r = String(decoding: errorResponse(401, "unauthorized"), as: UTF8.self)
        XCTAssertTrue(r.hasPrefix("HTTP/1.1 401 Unauthorized\r\n"))
        XCTAssertTrue(r.contains("Content-Length: 24\r\n"))
        XCTAssertTrue(r.contains("Connection: close\r\n"))
        XCTAssertTrue(r.hasSuffix("\r\n\r\n{\"error\":\"unauthorized\"}"))
        let inj = String(decoding: httpResponse(status: 200, body: [], extraHeaders: [("X-A", "a\r\nX-B: b")]), as: UTF8.self)
        XCTAssertFalse(inj.contains("\r\nX-B"))
    }

    func testLooksLikeImage() {
        XCTAssertTrue(looksLikeImage([0xFF, 0xD8, 0xFF, 0xE0]))
        XCTAssertTrue(looksLikeImage([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]))
        XCTAssertFalse(looksLikeImage(Array("hei".utf8)))
    }
}

private extension Result {
    var failureValue: Failure? {
        if case .failure(let e) = self { return e }
        return nil
    }
}
