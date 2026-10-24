// config.json i ~/Library/Application Support/vision-ocr/ (600-rettigheter, skrevet av install.sh).
import Foundation

public struct ServiceConfig: Codable, Equatable, Sendable {
    /// Mac mini-ens LAN-adresse. Aldri 0.0.0.0 eller 127.x.
    public var bindIP: String
    public var port: Int
    /// Hemmelig nøkkel (Bearer). Minst 32 tegn.
    public var key: String
    /// Tillatte avsender-IP-er (standard Glimt-serveren 10.69.1.39).
    public var allow: [String]
    public var maxBytes: Int?
    public var timeoutSeconds: Int?
    public var languages: [String]?
    public var languageCorrection: Bool?
    public var maxConnections: Int?

    enum CodingKeys: String, CodingKey {
        case port, key, allow, languages
        case bindIP = "bind_ip"
        case maxBytes = "max_bytes"
        case timeoutSeconds = "timeout_seconds"
        case languageCorrection = "language_correction"
        case maxConnections = "max_connections"
    }

    public init(bindIP: String = "10.69.1.173", port: Int = 8765, key: String, allow: [String] = ["10.69.1.39"],
                maxBytes: Int? = nil, timeoutSeconds: Int? = nil, languages: [String]? = nil,
                languageCorrection: Bool? = nil, maxConnections: Int? = nil) {
        self.bindIP = bindIP
        self.port = port
        self.key = key
        self.allow = allow
        self.maxBytes = maxBytes
        self.timeoutSeconds = timeoutSeconds
        self.languages = languages
        self.languageCorrection = languageCorrection
        self.maxConnections = maxConnections
    }

    /// Maks bildestørrelse (standard 20 MB).
    public var effectiveMaxBytes: Int { min(max(maxBytes ?? 20 * 1024 * 1024, 64 * 1024), 100 * 1024 * 1024) }
    /// Tidsavbrudd i sekunder for lesing av forespørselen, venting i køen og selve OCR-jobben (standard 60).
    public var effectiveTimeout: Int { min(max(timeoutSeconds ?? 60, 5), 600) }
    public var effectiveLanguageCorrection: Bool { languageCorrection ?? true }
    /// Samtidige tilkoblinger (OCR kjøres likevel én om gangen).
    public var effectiveMaxConnections: Int { min(max(maxConnections ?? 8, 1), 64) }
    /// Maks kroppsstørrelse: base64 i JSON er ~4/3 av bildet, pluss litt til multipart-hode.
    public var effectiveMaxBody: Int { effectiveMaxBytes / 3 * 4 + 64 * 1024 }
}

public func loadConfig(path: String) throws -> ServiceConfig {
    let data = try Data(contentsOf: URL(fileURLWithPath: path))
    return try JSONDecoder().decode(ServiceConfig.self, from: data)
}

/// Feil i konfigurasjonen (tom liste = gyldig).
public func validateConfig(_ c: ServiceConfig) -> [String] {
    var errors: [String] = []
    if let ip = parseIPv4(c.bindIP) {
        if ip == 0 { errors.append("bind_ip kan ikke være 0.0.0.0 – bruk Mac mini-ens LAN-adresse (f.eks. 10.69.1.173).") }
        if (ip >> 24) == 127 { errors.append("bind_ip kan ikke være 127.x – Glimt-serveren er en annen maskin og når den ikke.") }
    } else {
        errors.append("bind_ip «\(c.bindIP)» er ikke en gyldig IPv4-adresse.")
    }
    if c.port < 1 || c.port > 65535 { errors.append("port må være 1–65535.") }
    if c.key.count < 32 { errors.append("key må være minst 32 tegn (install.sh lager en med openssl rand -hex 32).") }
    if c.allow.isEmpty {
        errors.append("allow kan ikke være tom (standard: [\"10.69.1.39\"]).")
    } else if IPAllowList(c.allow) == nil {
        errors.append("allow inneholder en ugyldig adresse (bruk IPv4, eller nett med minst /\(IPAllowList.minPrefix)).")
    }
    return errors
}
