import Foundation

/* ---------------- APIClient: ett nettverkslag mot Homelab-serveren ---------------- */
// Fase 4 (C-ios §2.3, §9). Før: struct API (Homelab), enum KalNet (Kalender/Mac/widgets) og 40 filer med egen
// URLSession.shared. Nå:
//   – HomelabHTTP.session: den felles URLSession-konfigurasjonen (brukes også for bilder og tredjepart).
//   – APIClient (actor): sender, tolker feil til HomelabError og dekoder Codable-DTO-ene (APIModels.swift) utenfor main actor.
//   – APIContext: adresse (lokal eller ekstern, valgt med pickBase) og tokenet fra Nøkkelringen. Klienten lagrer ikke tokenet selv.
//   – 401 TOKEN_EXPIRED → APIClient.tokenExpiredNotification (appen går til utlogget tilstand).
//   – /api/version → ServerCompat («Oppdater serveren» / «Oppdater appen», Q19).
// Homelab-appens `API` (FinansHub/Sources/API.swift) er en tynn fasade over denne. Bare Foundation.

enum HomelabHTTP {
    /// Felles konfigurasjon for alle kall fra appene, widgetene og klokka. Samme cookie-lager og buffer som URLSession.shared.
    static let session: URLSession = {
        let c: URLSessionConfiguration = URLSessionConfiguration.default
        c.httpAdditionalHeaders = ["Accept-Language": "nb-NO, nb;q=0.9, no;q=0.8"]
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }()
}

/// Hvor og som hvem et kall går: adressen (uten / til slutt) og tokenet (Bearer). Ekstra headere legges på hvert kall.
struct APIContext: Sendable, Equatable {
    var base: String
    var token: String?
    var headers: [String: String]

    init(base: String, token: String? = nil, headers: [String: String] = [:]) {
        self.base = base
        self.token = token
        self.headers = headers
    }

    /// Adressen for en sti. Stien kan ha prefiks (/api/…, /finans/api/…). nil når adressen ikke kan tolkes.
    func url(_ path: String, prefix: String = "") -> URL? {
        let trimmed: String = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: trimmed + prefix + path)
    }
}

/// Om serveren og appen passer sammen (GET /api/version, Q19).
enum ServerCompat: Equatable, Sendable {
    case unknown
    case ok
    /// Serveren er eldre enn appen trenger.
    case updateServer(String)
    /// Appen er eldre enn serveren svarer riktig for (minClient).
    case updateApp(String)

    var message: String? {
        switch self {
        case .unknown, .ok: return nil
        case .updateServer(let s), .updateApp(let s): return s
        }
    }
}

/// Versjonsnummer «4.0», «4.73.1» sammenlignet tall for tall (manglende ledd = 0).
struct AppVersion: Comparable, Sendable {
    let parts: [Int]

    init(_ s: String) {
        let core: Substring = s.split(separator: "-").first ?? Substring(s)
        var p: [Int] = core.split(separator: ".").map { (x: Substring) -> Int in Int(x) ?? 0 }
        while p.count < 3 { p.append(0) }
        parts = p
    }

    static func < (a: AppVersion, b: AppVersion) -> Bool {
        let n: Int = Swift.max(a.parts.count, b.parts.count)
        for i in 0..<n {
            let x: Int = i < a.parts.count ? a.parts[i] : 0
            let y: Int = i < b.parts.count ? b.parts[i] : 0
            if x != y { return x < y }
        }
        return false
    }

    static func == (a: AppVersion, b: AppVersion) -> Bool { !(a < b) && !(b < a) }

    /// Appens egen versjon (MARKETING_VERSION).
    static var current: String { (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "0.0.0" }
}

actor APIClient {
    static let shared: APIClient = APIClient()

    /// Sendes (på main) når serveren svarer 401 TOKEN_EXPIRED. userInfo["token"] er tokenet som ble avvist.
    static let tokenExpiredNotification: Notification.Name = Notification.Name("no.kristo.homelab.tokenExpired")

    /// Kontraktversjonen appen er skrevet mot (shared/schemas/endpoints.json, `contract`).
    static let contractVersion: Int = 1

    nonisolated let session: URLSession

    init(session: URLSession = HomelabHTTP.session) {
        self.session = session
    }

    /* ---------- Sending ---------- */

    /// Sender forespørselen med tokenet og headerne fra konteksten. Kaster HomelabError ved nettverksfeil og status ≥ 400.
    func data(for request: URLRequest, context: APIContext, timeout: TimeInterval? = nil) async throws -> Data {
        var r: URLRequest = request
        if let timeout { r.timeoutInterval = timeout }
        if r.value(forHTTPHeaderField: "Accept") == nil { r.setValue("application/json", forHTTPHeaderField: "Accept") }
        if let token = context.token { r.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        for (k, v) in context.headers where r.value(forHTTPHeaderField: k) == nil { r.setValue(v, forHTTPHeaderField: k) }
        let pair: (Data, URLResponse)
        do {
            pair = try await session.data(for: r)
        } catch let e as URLError {
            throw HomelabError.transport(e, host: r.url?.host ?? context.base)
        }
        let code: Int = (pair.1 as? HTTPURLResponse)?.statusCode ?? 0
        if code >= 400 {
            let err: HomelabError = HomelabError.server(status: code, data: pair.0)
            if err.isTokenExpired, let t = context.token, !t.isEmpty { APIClient.announceExpired(t) }
            throw err
        }
        return pair.0
    }

    /// Rå kropp for en metode og sti. `json` er ferdig kodet JSON (JSONSerialization eller JSONEncoder).
    func send(_ method: String, _ path: String, prefix: String = "", json: Data? = nil, context: APIContext,
              timeout: TimeInterval = 30) async throws -> Data {
        guard let u = context.url(path, prefix: prefix) else { throw HomelabError(message: "Ugyldig serveradresse. Sjekk adressen.") }
        var r: URLRequest = URLRequest(url: u)
        r.httpMethod = method
        if let json {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = json
        }
        return try await data(for: r, context: context, timeout: timeout)
    }

    /// GET og dekoding til en DTO. Dekodingen skjer her (i aktøren), ikke på main actor.
    func get<T: Decodable & Sendable>(_ type: T.Type, _ path: String, prefix: String = "", context: APIContext,
                                      timeout: TimeInterval = 30) async throws -> T {
        let d: Data = try await send("GET", path, prefix: prefix, context: context, timeout: timeout)
        return try APIClient.decode(type, from: d)
    }

    /// POST/PUT/PATCH med en Encodable kropp og et dekodet svar.
    func send<B: Encodable & Sendable, T: Decodable & Sendable>(_ type: T.Type, _ method: String, _ path: String, prefix: String = "",
                                                                body: B, context: APIContext, timeout: TimeInterval = 30) async throws -> T {
        let json: Data = try JSONEncoder().encode(body)
        let d: Data = try await send(method, path, prefix: prefix, json: json, context: context, timeout: timeout)
        return try APIClient.decode(type, from: d)
    }

    /// Dekoder et svar. Feil blir HomelabError med en tekst som kan vises («Uventet svar fra serveren»).
    nonisolated static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw HomelabError(message: "Uventet svar fra serveren", status: 0, code: "DECODE_FAILED", body: data)
        }
    }

    /* ---------- Adressevalg (lokal eller ekstern) ---------- */

    /// Svarer serveren i det hele tatt (også med en feilkode)? Samme prøve som appene har brukt: GET /finans/api/me.
    func reachable(_ base: String, token: String?, timeout: TimeInterval = 1.5, path: String = "/finans/api/me") async -> Bool {
        do {
            _ = try await send("GET", path, context: APIContext(base: base, token: token), timeout: timeout)
            return true
        } catch let e as HomelabError {
            return e.status > 0
        } catch {
            return false
        }
    }

    /// Lokal adresse når den svarer (og brukeren vil bruke den hjemme), ellers ekstern. → (adresse, er lokal)
    func pickBase(local: String, external: String, preferLocal: Bool, token: String?) async -> (base: String, isLocal: Bool) {
        if preferLocal, !local.isEmpty, await reachable(local, token: token) { return (local, true) }
        let host: String = URL(string: external)?.host ?? ""
        return (external, ServerAddress.isLocal(host))
    }

    /* ---------- Versjon (Q19) ---------- */

    /// GET /api/version → om appen og serveren passer sammen. Nettverksfeil gir .unknown (ingen melding).
    func compatibility(base: String, appVersion: String = AppVersion.current) async -> ServerCompat {
        do {
            let d: Data = try await send("GET", "/api/version", context: APIContext(base: base), timeout: 8)
            let v: VersionDTO? = try? JSONDecoder().decode(VersionDTO.self, from: d)
            return APIClient.compatibility(v, appVersion: appVersion)
        } catch let e as HomelabError {
            // 404: serveren har ikke versjonssjekken i det hele tatt (eldre enn Fase 2).
            return e.status == 404 ? APIClient.compatibility(nil, appVersion: appVersion) : .unknown
        } catch {
            return .unknown
        }
    }

    /// Ren regel (også for testene). nil = serveren har ikke minClient/contract.
    nonisolated static func compatibility(_ v: VersionDTO?, appVersion: String) -> ServerCompat {
        guard let v else { return .updateServer("Serveren er for gammel for denne appen. Oppdater serveren.") }
        if v.contract < APIClient.contractVersion { return .updateServer("Serveren er for gammel for denne appen. Oppdater serveren.") }
        if AppVersion(appVersion) < AppVersion(v.minClient) {
            return .updateApp("Appen er for gammel for serveren (krever " + v.minClient + "). Oppdater appen.")
        }
        return .ok
    }

    /* ---------- Utløpt token ---------- */

    nonisolated static func announceExpired(_ token: String) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: APIClient.tokenExpiredNotification, object: nil, userInfo: ["token": token])
        }
    }
}
