// Minimal HTTP/1.1: tolking av forespørselshode, multipart/form-data, JSON med base64 og svar.
// Bare det tjenesten trenger: én forespørsel per tilkobling, Content-Length påkrevd (ingen chunked).
import Foundation

public struct RequestHead: Equatable, Sendable {
    public let method: String
    public let path: String
    public let query: String
    /// Feltnavn med små bokstaver.
    public let headers: [String: String]

    public init(method: String, path: String, query: String, headers: [String: String]) {
        self.method = method
        self.path = path
        self.query = query
        self.headers = headers
    }
}

/// Søker etter `needle` i `hay` fra `start`. Gir posisjonen eller nil.
public func indexOf(_ needle: [UInt8], in hay: [UInt8], from start: Int = 0) -> Int? {
    let n = needle.count
    let h = hay.count
    guard n > 0, h >= n else { return nil }
    let last = h - n
    var i = max(0, start)
    guard i <= last else { return nil }
    let first = needle[0]
    while i <= last {
        if hay[i] == first {
            var j = 1
            while j < n && hay[i + j] == needle[j] { j += 1 }
            if j == n { return i }
        }
        i += 1
    }
    return nil
}

private let crlfcrlf: [UInt8] = [13, 10, 13, 10]

/// Posisjonen rett etter `\r\n\r\n` (der kroppen begynner), eller nil.
public func findHeaderEnd(_ buf: [UInt8]) -> Int? {
    guard let i = indexOf(crlfcrlf, in: buf) else { return nil }
    return i + 4
}

/// Tolker forespørselslinje og hode (uten den avsluttende tomme linjen er også greit).
public func parseRequestHead(_ bytes: [UInt8]) -> RequestHead? {
    let text = String(decoding: bytes, as: UTF8.self)
    let lines = text.components(separatedBy: "\r\n")
    guard let requestLine = lines.first else { return nil }
    let parts = requestLine.split(separator: " ", omittingEmptySubsequences: true)
    guard parts.count == 3, parts[2].hasPrefix("HTTP/1.") else { return nil }
    let method = String(parts[0])
    guard !method.isEmpty, method.allSatisfy({ $0.isASCII && $0.isUppercase }) else { return nil }
    let target = String(parts[1])
    guard target.hasPrefix("/") else { return nil }
    var path = target
    var query = ""
    if let q = target.firstIndex(of: "?") {
        path = String(target[..<q])
        query = String(target[target.index(after: q)...])
    }
    var headers: [String: String] = [:]
    for line in lines.dropFirst() {
        if line.isEmpty { continue }
        guard let colon = line.firstIndex(of: ":") else { return nil }
        let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
        let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return nil }
        if let old = headers[name] { headers[name] = old + ", " + value } else { headers[name] = value }
    }
    return RequestHead(method: method, path: path, query: query, headers: headers)
}

/// Parametre fra en spørrestreng («crop=0&x=1»). Ingen prosent-dekoding av betydning her.
public func parseQuery(_ q: String) -> [String: String] {
    var out: [String: String] = [:]
    for pair in q.split(separator: "&") {
        let kv = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
        let k = String(kv[0]).lowercased()
        let v = kv.count > 1 ? String(kv[1]) : ""
        if !k.isEmpty { out[k] = v.removingPercentEncoding ?? v }
    }
    return out
}

/// «0/false/nei/no/off» → false, «1/true/ja/yes/on» → true, ellers nil.
public func parseBoolOption(_ s: String?) -> Bool? {
    guard let v = s?.trimmingCharacters(in: .whitespaces).lowercased() else { return nil }
    switch v {
    case "0", "false", "nei", "no", "off": return false
    case "1", "true", "ja", "yes", "on": return true
    default: return nil
    }
}

/// Medietypen uten parametre, med små bokstaver («multipart/form-data»).
public func mediaType(_ contentType: String?) -> String {
    guard let ct = contentType else { return "" }
    let base = ct.split(separator: ";", maxSplits: 1).first.map(String.init) ?? ""
    return base.trimmingCharacters(in: .whitespaces).lowercased()
}

/// Parameter fra et hodefelt («boundary», «name», «filename»), med eller uten anførselstegn.
public func headerParameter(_ value: String, _ name: String) -> String? {
    var i = value.startIndex
    let wanted = name.lowercased()
    // Går gjennom «; key=value»-delene og respekterer anførselstegn.
    while i < value.endIndex {
        guard let semi = value[i...].firstIndex(of: ";") else { return nil }
        var j = value.index(after: semi)
        while j < value.endIndex, value[j] == " " || value[j] == "\t" { j = value.index(after: j) }
        guard let eq = value[j...].firstIndex(of: "=") else { return nil }
        let key = value[j..<eq].trimmingCharacters(in: .whitespaces).lowercased()
        var k = value.index(after: eq)
        var result = ""
        if k < value.endIndex, value[k] == "\"" {
            k = value.index(after: k)
            while k < value.endIndex, value[k] != "\"" {
                if value[k] == "\\", value.index(after: k) < value.endIndex { k = value.index(after: k) }
                result.append(value[k])
                k = value.index(after: k)
            }
            if k < value.endIndex { k = value.index(after: k) }
        } else {
            while k < value.endIndex, value[k] != ";" {
                result.append(value[k])
                k = value.index(after: k)
            }
            result = result.trimmingCharacters(in: .whitespaces)
        }
        if key == wanted { return result }
        i = k
    }
    return nil
}

public struct MultipartPart: Equatable, Sendable {
    public let name: String?
    public let filename: String?
    public let contentType: String?
    public let data: [UInt8]
}

/// Tolker multipart/form-data. Nil hvis kroppen ikke har riktig form.
public func parseMultipart(_ body: [UInt8], boundary: String) -> [MultipartPart]? {
    guard !boundary.isEmpty, boundary.count <= 200 else { return nil }
    let delim = Array("--\(boundary)".utf8)
    let nextDelim: [UInt8] = [13, 10] + delim
    guard var p = indexOf(delim, in: body) else { return nil }
    var parts: [MultipartPart] = []
    while true {
        var start = p + delim.count
        // «--» etter skilletegnet betyr slutt.
        if start + 1 < body.count, body[start] == 45, body[start + 1] == 45 { break }
        // Hopp over evt. mellomrom og CRLF etter skilletegnet.
        while start < body.count, body[start] == 32 || body[start] == 9 { start += 1 }
        if start + 1 < body.count, body[start] == 13, body[start + 1] == 10 { start += 2 }
        guard let end = indexOf(nextDelim, in: body, from: start) else { return nil }
        let raw = Array(body[start..<end])
        // Del uten hodefelt begynner rett på CRLF.
        let headText: String
        let contentStart: Int
        if raw.count >= 2, raw[0] == 13, raw[1] == 10 {
            headText = ""
            contentStart = 2
        } else {
            guard let hEnd = findHeaderEnd(raw) else { return nil }
            headText = String(decoding: raw[0..<(hEnd - 4)], as: UTF8.self)
            contentStart = hEnd
        }
        var disposition = ""
        var ctype: String?
        for line in headText.components(separatedBy: "\r\n") {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let key = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            let val = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            if key == "content-disposition" { disposition = val }
            if key == "content-type" { ctype = val }
        }
        parts.append(MultipartPart(
            name: headerParameter(disposition, "name"),
            filename: headerParameter(disposition, "filename"),
            contentType: ctype,
            data: Array(raw[contentStart...])
        ))
        p = end + 2
        if parts.count > 50 { return nil }
    }
    return parts
}

public struct UploadedImage: Sendable {
    public let data: Data
    /// Dokumentsegmentering + perspektivkorrigering (standard på).
    public let crop: Bool
}

public enum UploadError: Error, Equatable, Sendable {
    case unsupportedMediaType
    case noImage
    case badBase64
    case badJSON
    case badMultipart

    /// Feilmelding på norsk (sendes til klienten).
    public var message: String {
        switch self {
        case .unsupportedMediaType: return "Bruk multipart/form-data (feltet image), application/json ({\"image_base64\": …}) eller image/*."
        case .noImage: return "Fant ikke noe bilde i forespørselen (feltet image eller image_base64)."
        case .badBase64: return "image_base64 er ikke gyldig base64."
        case .badJSON: return "Ugyldig JSON."
        case .badMultipart: return "Ugyldig multipart/form-data."
        }
    }

    public var status: Int { self == .unsupportedMediaType ? 415 : 400 }
}

/// Fjerner «data:image/jpeg;base64,»-prefiks og dekoder.
public func decodeBase64Image(_ s: String) -> Data? {
    var v = s.trimmingCharacters(in: .whitespacesAndNewlines)
    if v.hasPrefix("data:"), let comma = v.firstIndex(of: ",") { v = String(v[v.index(after: comma)...]) }
    guard !v.isEmpty, let d = Data(base64Encoded: v, options: .ignoreUnknownCharacters), !d.isEmpty else { return nil }
    return d
}

/// Henter bildet fra kroppen: multipart (feltet `image`, ellers første fil), JSON
/// (`image_base64` eller `image`) eller rå `image/*` / `application/octet-stream`.
/// Valget `crop` kan stå i spørrestrengen, som multipart-felt eller i JSON.
public func extractUpload(contentType: String?, query: String, body: [UInt8]) -> Result<UploadedImage, UploadError> {
    var crop = parseBoolOption(parseQuery(query)["crop"]) ?? true
    let type = mediaType(contentType)
    if type == "multipart/form-data" {
        guard let ct = contentType, let boundary = headerParameter(ct, "boundary"),
              let parts = parseMultipart(body, boundary: boundary) else { return .failure(.badMultipart) }
        if let c = parts.first(where: { $0.name == "crop" }),
           let b = parseBoolOption(String(decoding: c.data, as: UTF8.self)) { crop = b }
        if let part = parts.first(where: { $0.name == "image" && !$0.data.isEmpty }) {
            return .success(UploadedImage(data: Data(part.data), crop: crop))
        }
        if let part = parts.first(where: { $0.name == "image_base64" && !$0.data.isEmpty }) {
            guard let d = decodeBase64Image(String(decoding: part.data, as: UTF8.self)) else { return .failure(.badBase64) }
            return .success(UploadedImage(data: d, crop: crop))
        }
        if let part = parts.first(where: { $0.filename != nil && !$0.data.isEmpty }) {
            return .success(UploadedImage(data: Data(part.data), crop: crop))
        }
        return .failure(.noImage)
    }
    if type == "application/json" {
        guard let obj = try? JSONSerialization.jsonObject(with: Data(body)), let dict = obj as? [String: Any]
        else { return .failure(.badJSON) }
        if let c = dict["crop"] as? Bool { crop = c } else if let c = dict["crop"] as? String, let b = parseBoolOption(c) { crop = b }
        guard let s = (dict["image_base64"] as? String) ?? (dict["image"] as? String) else { return .failure(.noImage) }
        guard let d = decodeBase64Image(s) else { return .failure(.badBase64) }
        return .success(UploadedImage(data: d, crop: crop))
    }
    if type.hasPrefix("image/") || type == "application/octet-stream" {
        guard !body.isEmpty else { return .failure(.noImage) }
        return .success(UploadedImage(data: Data(body), crop: crop))
    }
    return .failure(.unsupportedMediaType)
}

/// Kjenner igjen JPEG, PNG, HEIC/HEIF (ftyp), TIFF, GIF og WebP på de første bytene.
public func looksLikeImage(_ b: [UInt8]) -> Bool {
    if b.count >= 3, b[0] == 0xFF, b[1] == 0xD8, b[2] == 0xFF { return true }
    if b.count >= 8, b[0] == 0x89, b[1] == 0x50, b[2] == 0x4E, b[3] == 0x47 { return true }
    if b.count >= 12, b[4] == 0x66, b[5] == 0x74, b[6] == 0x79, b[7] == 0x70 { return true }
    if b.count >= 4, (b[0] == 0x49 && b[1] == 0x49 && b[2] == 0x2A) || (b[0] == 0x4D && b[1] == 0x4D && b[3] == 0x2A) { return true }
    if b.count >= 4, b[0] == 0x47, b[1] == 0x49, b[2] == 0x46 { return true }
    if b.count >= 12, b[0] == 0x52, b[1] == 0x49, b[2] == 0x46, b[3] == 0x46, b[8] == 0x57, b[9] == 0x45 { return true }
    return false
}

public func reasonPhrase(_ status: Int) -> String {
    switch status {
    case 100: return "Continue"
    case 200: return "OK"
    case 400: return "Bad Request"
    case 401: return "Unauthorized"
    case 403: return "Forbidden"
    case 404: return "Not Found"
    case 405: return "Method Not Allowed"
    case 408: return "Request Timeout"
    case 411: return "Length Required"
    case 413: return "Payload Too Large"
    case 415: return "Unsupported Media Type"
    case 422: return "Unprocessable Entity"
    case 431: return "Request Header Fields Too Large"
    case 500: return "Internal Server Error"
    case 503: return "Service Unavailable"
    case 504: return "Gateway Timeout"
    default: return "Status"
    }
}

/// Et komplett HTTP-svar. Tilkoblingen lukkes alltid etterpå.
public func httpResponse(status: Int, body: [UInt8], contentType: String = "application/json; charset=utf-8",
                         extraHeaders: [(String, String)] = []) -> [UInt8] {
    var head = "HTTP/1.1 \(status) \(reasonPhrase(status))\r\n"
    head += "Content-Type: \(contentType)\r\n"
    head += "Content-Length: \(body.count)\r\n"
    head += "Connection: close\r\n"
    head += "Cache-Control: no-store\r\n"
    head += "X-Content-Type-Options: nosniff\r\n"
    for (k, v) in extraHeaders {
        // Ingen linjeskift i hodeverdier.
        let clean = v.replacingOccurrences(of: "\r", with: " ").replacingOccurrences(of: "\n", with: " ")
        head += "\(k): \(clean)\r\n"
    }
    head += "\r\n"
    return Array(head.utf8) + body
}

/// JSON-feilsvar `{"error": "..."}`.
public func errorResponse(_ status: Int, _ message: String, extraHeaders: [(String, String)] = []) -> [UInt8] {
    httpResponse(status: status, body: jsonBytes(["error": message]), extraHeaders: extraHeaders)
}
