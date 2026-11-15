import Foundation

/* ---------------- Felles feiltype for alle kall mot Homelab-serveren ---------------- */
// Fase 4 (C-ios §2.3, §9): én feiltype for APIClient, Homelab-appen (APIError er et alias), widgetene, klokka og
// Kalender (KalNetError følger samme protokoll og tolker svaret med samme hjelper).
// Serverens feilform er {error, code, reason?, …} (shared/schemas/common/error.schema.json, server/http/errors.js).
// Bare Foundation: virker i app-utvidelser, på watchOS og på macOS.

/// Det alle feiltypene mot serveren kan svare på (HomelabError, KalNetError).
protocol HomelabFailure: Error {
    var status: Int { get }
    var code: String? { get }
    var message: String { get }
}

extension HomelabFailure {
    /// 401 med TOKEN_EXPIRED: app-tokenet er utløpt (180 dager uten bruk, Q23). Appen går til utlogget tilstand.
    var isTokenExpired: Bool { status == 401 && code == HomelabError.tokenExpiredCode }
    /// 401 HOMELAB_AUTH / TOKEN_EXPIRED (ikke feil passord ved innlogging, LOGIN_FAILED).
    var isUnauthorized: Bool { status == 401 && code != "LOGIN_FAILED" }
    /// Forespørselen nådde aldri serveren (ingen statuskode).
    var isTransport: Bool { status == 0 }
    var isNotFound: Bool { status == 404 }
}

struct HomelabError: LocalizedError, HomelabFailure, Sendable {
    /// Norsk tekst som kan vises til brukeren (serverens `error`, eller vår egen ved nettverksfeil).
    var message: String
    /// HTTP-status. 0 = nådde ikke serveren.
    var status: Int
    /// Innloggingen krever en 6-sifret kode (2FA).
    var needsTotp: Bool
    /// Serverens maskinlesbare kode (SNAKE_CASE, f.eks. NOT_FOUND, TOKEN_EXPIRED). Eldre koder med små bokstaver finnes ennå.
    var code: String?
    /// Prompt 28: Gemini kan brukes i stedet (AI-kall).
    var canGemini: Bool
    /// Ved 401: none | invalid | expired.
    var reason: String?
    /// URLError-koden når forespørselen ikke nådde fram (status 0), ellers nil.
    var transportCode: Int?
    /// Hele feilkroppen (for felt som bare én skjerm bruker, f.eks. godkjenning av ny enhet).
    var body: Data?

    init(message: String = "Ukjent feil", status: Int = 0, needsTotp: Bool = false, code: String? = nil, canGemini: Bool = false,
         reason: String? = nil, transportCode: Int? = nil, body: Data? = nil) {
        self.message = message
        self.status = status
        self.needsTotp = needsTotp
        self.code = code
        self.canGemini = canGemini
        self.reason = reason
        self.transportCode = transportCode
        self.body = body
    }

    var errorDescription: String? { message }

    static let tokenExpiredCode: String = "TOKEN_EXPIRED"

    /// Feilkroppen som ordbok (tom når den ikke er JSON).
    var bodyObject: [String: Any] {
        guard let body, let o = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] else { return [:] }
        return o
    }

    /// Feltene i serverens feilsvar. Godtar også eldre `kode` (prompt 50).
    struct Fields: Sendable {
        var error: String?
        var code: String?
        var reason: String?
        var needsTotp: Bool
        var canGemini: Bool
    }

    static func fields(_ data: Data) -> Fields {
        let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
        let code: String? = (o["code"] as? String) ?? (o["kode"] as? String)
        return Fields(error: o["error"] as? String, code: code, reason: o["reason"] as? String,
                      needsTotp: (o["needsTotp"] as? Bool) ?? false, canGemini: (o["canGemini"] as? Bool) ?? false)
    }

    /// Et svar med status ≥ 400.
    static func server(status: Int, data: Data) -> HomelabError {
        let f: Fields = fields(data)
        let msg: String = (f.error?.isEmpty == false ? f.error : nil) ?? ("Feil " + String(status))
        return HomelabError(message: msg, status: status, needsTotp: f.needsTotp, code: f.code, canGemini: f.canGemini,
                            reason: f.reason, body: data)
    }

    /// Forespørselen nådde ikke serveren. Samme norske tekster som appen har brukt siden prompt 41/48.
    static func transport(_ e: URLError, host: String) -> HomelabError {
        let raw: Int = e.code.rawValue
        switch e.code {
        case .unsupportedURL, .badURL:
            return HomelabError(message: "Ugyldig serveradresse. Sjekk adressen.", transportCode: raw)
        case .cannotFindHost, .dnsLookupFailed:
            return HomelabError(message: "Fant ikke serveren " + host + ". Sjekk adressen.", transportCode: raw)
        case .cannotConnectToHost, .networkConnectionLost, .notConnectedToInternet:
            return HomelabError(message: "Fikk ikke kontakt med " + host + ". Er du på samme nett, og stemmer http/https og port?", transportCode: raw)
        case .timedOut:
            // Prompt 48: code «timeout» (status 0) skiller tidsavbrudd fra manglende nett.
            return HomelabError(message: "Serveren svarte ikke i tide.", code: "timeout", transportCode: raw)
        case .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate, .serverCertificateNotYetValid:
            return HomelabError(message: "HTTPS-feil. Bruk http:// på lokalt nett, eller installer sertifikatet.", transportCode: raw)
        case .appTransportSecurityRequiresSecureConnection:
            return HomelabError(message: "iOS krever https for denne adressen. Bruk en lokal IP eller https.", transportCode: raw)
        default:
            return HomelabError(message: e.localizedDescription, transportCode: raw)
        }
    }

    /// Feil som betyr at forespørselen aldri ble sendt (ikke tidsavbrudd): kan legges i en kø og sendes senere.
    var neverSent: Bool {
        guard let c = transportCode else { return false }
        let unsent: [URLError.Code] = [.notConnectedToInternet, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed]
        return unsent.contains(URLError.Code(rawValue: c))
    }
}
