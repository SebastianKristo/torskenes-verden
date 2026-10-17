import Foundation
import Security

/// Klient for FinansHub-API-et (/finans/api). Appen snakker aldri med resten av homelab.
struct APIError: LocalizedError {
    let message: String
    let status: Int
    var errorDescription: String? { message }
}

struct API {
    let base: String
    let token: String?

    private func url(_ path: String, prefix: String = "/finans/api") -> URL { URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + prefix + path)! }

    private func send(_ req: URLRequest) async throws -> Data {
        var r = req
        r.timeoutInterval = 30
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let data: Data, res: URLResponse
        do { (data, res) = try await URLSession.shared.data(for: r) } catch let e as URLError {
            let host = r.url?.host ?? base
            switch e.code {
            case .cannotFindHost, .dnsLookupFailed: throw APIError(message: "Fant ikke serveren \(host). Sjekk adressen.", status: 0)
            case .cannotConnectToHost, .networkConnectionLost, .notConnectedToInternet:
                throw APIError(message: "Fikk ikke kontakt med \(host). Er du på samme nett, og stemmer http/https og port?", status: 0)
            case .timedOut: throw APIError(message: "Serveren svarte ikke i tide.", status: 0)
            case .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate, .serverCertificateNotYetValid:
                throw APIError(message: "HTTPS-feil. Bruk http:// på lokalt nett, eller installer sertifikatet.", status: 0)
            case .appTransportSecurityRequiresSecureConnection:
                throw APIError(message: "iOS krever https for denne adressen. Bruk en lokal IP eller https.", status: 0)
            default: throw APIError(message: e.localizedDescription, status: 0)
            }
        }
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        if code >= 400 {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError(message: msg ?? "Feil \(code)", status: code)
        }
        return data
    }

    func get<T: Decodable>(_ path: String, as: T.Type = T.self) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await send(URLRequest(url: url(path))))
    }

    @discardableResult
    func call(_ method: String, _ path: String, json: [String: Any]? = nil) async throws -> Data {
        var r = URLRequest(url: url(path))
        r.httpMethod = method
        if let json {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        return try await send(r)
    }

    func mat<T: Decodable>(_ path: String, as: T.Type = T.self) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await send(URLRequest(url: url(path, prefix: "/mat/api"))))
    }

    @discardableResult
    func matCall(_ method: String, _ path: String, json: [String: Any] = [:]) async throws -> Data {
        var r = URLRequest(url: url(path, prefix: "/mat/api"))
        r.httpMethod = method
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: json)
        return try await send(r)
    }

    func bytes(_ path: String) async throws -> Data {
        let full = URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path)!
        return try await send(URLRequest(url: full))
    }

    struct Part { let name: String; let filename: String; let mime: String; let data: Data }

    /// Multipart: original + nedskalert JPEG til AI + miniatyrbilde.
    func upload(_ path: String, parts: [Part]) async throws -> Data {
        let boundary = "FinansHub-\(UUID().uuidString)"
        var body = Data()
        for p in parts {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(p.name)\"; filename=\"\(p.filename)\"\r\nContent-Type: \(p.mime)\r\n\r\n".data(using: .utf8)!)
            body.append(p.data)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        var r = URLRequest(url: url(path))
        r.httpMethod = "POST"
        r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        r.httpBody = body
        return try await send(r)
    }

    /// Bytter passord mot et token som bare gir tilgang til FinansHub.
    /// Prøver /login først og faller tilbake til /auth/token på eldre servere.
    static func login(base: String, password: String, device: String) async throws -> String {
        let api = API(base: base, token: nil)
        let body: [String: Any] = ["password": password, "device": device, "deviceName": device]
        let data: Data
        do { data = try await api.call("POST", "/login", json: body) } catch let e as APIError where e.status == 404 {
            do { data = try await api.call("POST", "/auth/token", json: body) } catch let e2 as APIError where e2.status == 404 {
                throw APIError(message: "Fant ikke FinansHub på \(base) (404). Sjekk adressen, eller oppdater homelab-serveren.", status: 404)
            }
        }
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any], let t = obj["token"] as? String else {
            throw APIError(message: "Uventet svar fra serveren", status: 0)
        }
        return t
    }

    /// Legger til skjema når det mangler: http:// for lokale adresser, ellers https://.
    static func normalize(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        let lower = s.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") { return s }
        let host = String(lower.split(separator: "/").first ?? "").split(separator: ":").first.map(String.init) ?? ""
        let p = host.split(separator: ".").compactMap { Int($0) }
        let ip = p.count == 4
        let local = host == "localhost" || host.hasSuffix(".local") || host.hasSuffix(".lan") || host.hasSuffix(".home.arpa") || !host.contains(".")
            || (ip && (p[0] == 10 || p[0] == 127 || (p[0] == 192 && p[1] == 168) || (p[0] == 172 && (16...31).contains(p[1])) || (p[0] == 100 && (64...127).contains(p[1]))))
        return (local ? "http://" : "https://") + s
    }
}

/// Token og serveradresse lagres i nøkkelringen.
enum Keychain {
    static func set(_ key: String, _ value: String?) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "finanshub", kSecAttrAccount as String: key]
        SecItemDelete(q as CFDictionary)
        guard let value else { return }
        var add = q
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
    static func get(_ key: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "finanshub", kSecAttrAccount as String: key,
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
}
