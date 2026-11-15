import Foundation
import Security

/// Fase 4: Homelab-appens feiltype er den felles HomelabError (SharedNet/HomelabError.swift). Navnet APIError beholdes for de
/// mange stedene som fanger den. Godkjenning av ny enhet (403 DEVICE_APPROVAL_REQUIRED) leses fra feilkroppen (DeviceKeys.swift).
typealias APIError = HomelabError

struct LoginResult { let token: String; let username: String; let name: String; let role: String }

/// Homelab-appens fasade over APIClient (SharedNet/APIClient.swift): adressen og tokenet til kontoen som er aktiv, enhetsnøkkelen
/// og offline-køen. Alle kall går gjennom APIClient (felles URLSession, feiltolking og TOKEN_EXPIRED → utlogging i Store).
struct API {
    let base: String
    let token: String?

    /// Prompt 85: en adresse iOS ikke kan tolke (skrivefeil i porten, «http://10.0.0.5:30 00», «http://[::1») ga nil og krasj
    /// ved tvungen utpakking – også ved hver oppstart når adressen var lagret som lokal adresse. Nå: en adresse URLSession
    /// avviser (unsupportedURL) → vanlig feilmelding «Ugyldig serveradresse».
    static let badURL85: URL = URL(string: "ugyldig://adresse") ?? URL(fileURLWithPath: "/ugyldig-adresse")

    /// Konteksten for APIClient: adresse, token og (prompt 51, SEC51) den faste enhetsnøkkelen, så serveren kjenner igjen en
    /// godkjent enhet (DeviceKeys.swift).
    var context: APIContext { APIContext(base: base, token: token, headers: ["X-Device-Key": Device51.key]) }

    private func url(_ path: String, prefix: String = "/finans/api") -> URL {
        URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + prefix + path) ?? API.badURL85
    }

    private func send(_ req: URLRequest, timeout: TimeInterval = 30) async throws -> Data {
        do {
            return try await APIClient.shared.data(for: req, context: context, timeout: timeout)
        } catch let e as HomelabError where e.neverSent {
            // Prompt 51 (IOSPLAT51): forespørselen nådde aldri serveren → skrivinger som tåler å vente (gjøremål, handleliste,
            // Sjekk inn) legges i offline-køen og sendes når nettet er tilbake (PlatformHost.swift). Aldri ved tidsavbrudd.
            var r: URLRequest = req
            r.timeoutInterval = timeout
            if r.value(forHTTPHeaderField: "Accept") == nil { r.setValue("application/json", forHTTPHeaderField: "Accept") }
            if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
            if r.value(forHTTPHeaderField: "X-Device-Key") == nil { r.setValue(Device51.key, forHTTPHeaderField: "X-Device-Key") }
            if Plat51Queue.offer(r, base: base) {
                throw APIError(message: Plat51Queue.message, status: 0, code: Plat51Queue.queuedCode)
            }
            throw e
        }
    }

    /// Fase 4: typet GET mot en DTO fra kontrakten (SharedNet/APIModels.swift), dekodet i APIClient (utenfor main actor).
    /// Eksempel: `let me: MeDTO = try await store.api.fetch(MeDTO.self, "/api/me")`.
    func fetch<T: Decodable & Sendable>(_ type: T.Type, _ path: String, timeout: TimeInterval = 30) async throws -> T {
        let d: Data = try await send(URLRequest(url: url(path, prefix: "")), timeout: timeout)
        return try APIClient.decode(type, from: d)
    }

    /// Fase 4: typet POST/PUT/PATCH med en Encodable kropp. Stien er fra serverens rot («/api/dates/parse»).
    func fetch<B: Encodable & Sendable, T: Decodable & Sendable>(_ type: T.Type, _ method: String, _ path: String, body: B,
                                                                 timeout: TimeInterval = 30) async throws -> T {
        var r: URLRequest = URLRequest(url: url(path, prefix: ""))
        r.httpMethod = method
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONEncoder().encode(body)
        let d: Data = try await send(r, timeout: timeout)
        return try APIClient.decode(type, from: d)
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

    /// Prompt 51: kall mot en sti fra serverens rot (f.eks. statusUrl/finishUrl fra godkjenningen) med egne headere
    /// (X-Approval-Key, X-Device-Id, X-Client-Platform).
    @discardableResult
    func send51(_ method: String, _ path: String, headers: [String: String] = [:], json: [String: Any]? = nil, timeout: TimeInterval = 20) async throws -> Data {
        guard path.hasPrefix("/"), let u = URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path) else {
            throw APIError(message: "Ugyldig adresse", status: 0)
        }
        var r = URLRequest(url: u)
        r.httpMethod = method
        for (k, v) in headers { r.setValue(v, forHTTPHeaderField: k) }
        if let json {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        return try await send(r, timeout: timeout)
    }

    /// Prompt 51 (IOSFEAT51): rå body fra serverens rot, f.eks. bildet til PUT /finans/api/fin51/goals/:id/image.
    @discardableResult
    func sendRaw51(_ method: String, _ path: String, body: Data, contentType: String, timeout: TimeInterval = 60) async throws -> Data {
        guard path.hasPrefix("/"), let u = URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path) else {
            throw APIError(message: "Ugyldig adresse", status: 0)
        }
        var r = URLRequest(url: u)
        r.httpMethod = method
        r.setValue(contentType, forHTTPHeaderField: "Content-Type")
        r.httpBody = body
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
        let full: URL = URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path) ?? API.badURL85
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

    /// Fase 4: regelen ligger i SharedNet/ServerAddress.swift (fasit shared/testvektorer/serveradresse.json, Q39).
    static func isLocal(_ host: String) -> Bool { ServerAddress.isLocal(host) }

    /// Legger til skjema når det mangler (http:// for lokale adresser, ellers https://) og fjerner sti og / til slutt.
    static func normalize(_ raw: String) -> String { ServerAddress.normalize(raw) ?? "" }
}

/// Token og serveradresse lagres i Nøkkelringen (tjenesten «finanshub», bare denne enheten). Fase 4: via den delte hjelperen
/// Nokkelring (SharedKeychain/Nokkelring.swift), som alltid skriver med kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly.
enum Keychain {
    static let service: String = "finanshub"
    static func set(_ key: String, _ value: String?) { Nokkelring.writeString(key, value, service: service) }
    static func get(_ key: String) -> String? { Nokkelring.readString(key, service: service) }
}
