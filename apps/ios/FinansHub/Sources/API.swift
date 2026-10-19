import Foundation
import Security

/// Klient for FinansHub-API-et (/finans/api). Appen snakker aldri med resten av homelab.
struct APIError: LocalizedError {
    let message: String
    let status: Int
    /// Innloggingen krever en 6-sifret kode (2FA).
    var needsTotp = false
    /// Prompt 28: maskinlesbar feilkode fra serveren (f.eks. ollama_down, no_vision, timeout, not_found) og om Gemini kan brukes.
    var code: String? = nil
    var canGemini = false
    var errorDescription: String? { message }
}

struct LoginResult { let token: String; let username: String; let name: String; let role: String }

struct API {
    let base: String
    let token: String?

    private func url(_ path: String, prefix: String = "/finans/api") -> URL { URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + prefix + path)! }

    private func send(_ req: URLRequest, timeout: TimeInterval = 30) async throws -> Data {
        var r = req
        r.timeoutInterval = timeout
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
            let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw APIError(message: (obj?["error"] as? String) ?? "Feil \(code)", status: code, needsTotp: (obj?["needsTotp"] as? Bool) ?? false,
                           code: obj?["code"] as? String, canGemini: (obj?["canGemini"] as? Bool) ?? false)
        }
        return data
    }

    func get<T: Decodable>(_ path: String, as: T.Type = T.self) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await send(URLRequest(url: url(path))))
    }

    @discardableResult
    func call(_ method: String, _ path: String, json: [String: Any]? = nil) async throws -> Data {
        try await callAt("/finans/api", method, path, json: json)
    }

    /// Kall mot en annen modul, f.eks. Homelab (/api) for forside, søk, oppsett og profilbilde.
    @discardableResult
    func callAt(_ prefix: String, _ method: String, _ path: String, json: [String: Any]? = nil, timeout: TimeInterval = 30) async throws -> Data {
        var r = URLRequest(url: url(path, prefix: prefix))
        r.httpMethod = method
        if let json {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        return try await send(r, timeout: timeout)
    }

    /// GET mot en annen modul, f.eks. /domains/api.
    func module<T: Decodable>(_ prefix: String, _ path: String, as: T.Type = T.self, timeout: TimeInterval = 30) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await send(URLRequest(url: url(path, prefix: prefix)), timeout: timeout))
    }

    /// Rådata fra en annen modul (for lister som kan ha to former).
    func raw(_ prefix: String, _ path: String) async throws -> Data {
        try await send(URLRequest(url: url(path, prefix: prefix)))
    }

    /// Svarer serveren i det hele tatt (også med en feilkode)? Brukes for å velge lokal eller ekstern adresse.
    func reachable(timeout: TimeInterval = 1.5) async -> Bool {
        do { _ = try await send(URLRequest(url: url("/me")), timeout: timeout); return true } catch let e as APIError { return e.status > 0 } catch { return false }
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

    /// Fil i et skjema. Uten filnavn sendes den som et vanlig tekstfelt.
    struct Part {
        let name: String; let filename: String; let mime: String; let data: Data
        static func text(_ name: String, _ value: String) -> Part { Part(name: name, filename: "", mime: "", data: Data(value.utf8)) }
    }

    /// Multipart: filer (f.eks. original + nedskalert JPEG + miniatyr) og tekstfelt.
    func upload(_ path: String, parts: [Part], prefix: String = "/finans/api", timeout: TimeInterval = 30) async throws -> Data {
        let boundary = "FinansHub-\(UUID().uuidString)"
        var body = Data()
        for p in parts {
            if p.filename.isEmpty {
                body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(p.name)\"\r\n\r\n".data(using: .utf8)!)
            } else {
                body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(p.name)\"; filename=\"\(p.filename)\"\r\nContent-Type: \(p.mime)\r\n\r\n".data(using: .utf8)!)
            }
            body.append(p.data)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        var r = URLRequest(url: url(path, prefix: prefix))
        r.httpMethod = "POST"
        r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        r.httpBody = body
        return try await send(r, timeout: timeout)
    }

    /// Bytter brukernavn + passord (+ 2FA-kode) mot et token med finans-tilgang.
    /// Kaster APIError(needsTotp: true) når serveren ber om koden.
    /// Prøver /login først og faller tilbake til /auth/token på eldre servere (bare passord).
    static func login(base: String, username: String, password: String, code: String?, device: String, trust: Bool = false) async throws -> LoginResult {
        let api = API(base: base, token: nil)
        var body: [String: Any] = ["password": password, "device": device, "deviceName": device]
        // «Husk denne enheten i 30 dager» (2FA-steget i Papir).
        if trust { body["trust"] = true; body["remember"] = true }
        let user = username.trimmingCharacters(in: .whitespaces)
        if !user.isEmpty { body["username"] = user }
        if let code, !code.isEmpty { body["code"] = code.trimmingCharacters(in: .whitespaces) }
        let data: Data
        do { data = try await api.call("POST", "/login", json: body) } catch let e as APIError where !e.needsTotp && (e.status == 404 || (e.status == 401 && e.message.contains("Ikke innlogget"))) {
            do { data = try await api.call("POST", "/auth/token", json: body) } catch let e2 as APIError where e2.status == 404 {
                throw APIError(message: "Fant ikke FinansHub på \(base) (404). Sjekk adressen, eller oppdater homelab-serveren.", status: 404)
            }
        }
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any], let t = obj["token"] as? String else {
            throw APIError(message: "Uventet svar fra serveren", status: 0)
        }
        let u = obj["user"] as? [String: Any]
        let uname = (u?["username"] as? String) ?? user
        let name = (u?["name"] as? String) ?? (obj["user"] as? String) ?? uname
        return LoginResult(token: t, username: uname, name: name.isEmpty ? "FinansHub" : name, role: (u?["role"] as? String) ?? "admin")
    }

    static func isLocal(_ host: String) -> Bool {
        let p = host.split(separator: ".").compactMap { Int($0) }
        let ip = p.count == 4
        return host == "localhost" || host.hasSuffix(".local") || host.hasSuffix(".lan") || host.hasSuffix(".home.arpa") || !host.contains(".")
            || (ip && (p[0] == 10 || p[0] == 127 || (p[0] == 192 && p[1] == 168) || (p[0] == 172 && (16...31).contains(p[1])) || (p[0] == 100 && (64...127).contains(p[1]))))
    }

    /// Legger til skjema når det mangler: http:// for lokale adresser, ellers https://.
    static func normalize(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        // Fjern sti som «/finans» – appen legger selv til /finans/api.
        let start = s.range(of: "://")?.upperBound ?? s.startIndex
        if let slash = s[start...].firstIndex(of: "/") { s = String(s[..<slash]) }
        let lower = s.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") { return s }
        if s.isEmpty { return s }
        let host = String(lower.split(separator: "/").first ?? "").split(separator: ":").first.map(String.init) ?? ""
        return (isLocal(host) ? "http://" : "https://") + s
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
