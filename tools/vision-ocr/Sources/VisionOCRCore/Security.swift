// Tilgangskontroll: Bearer-nøkkel (konstant-tid sammenligning) og tillatelsesliste for avsender-IP.
// Begge må være oppfylt. Feil gir 403 (IP) eller 401 (nøkkel) uten detaljer.
import Foundation

/// Sammenligner to strenger på konstant tid (avhenger bare av lengden, ikke av innholdet).
/// Tom streng godtas aldri.
public func constantTimeEquals(_ provided: String, _ expected: String) -> Bool {
    let a = Array(provided.utf8)
    let b = Array(expected.utf8)
    var diff: UInt8 = a.count == b.count ? 0 : 1
    let n = max(a.count, b.count)
    var i = 0
    while i < n {
        let x: UInt8 = i < a.count ? a[i] : 0
        let y: UInt8 = i < b.count ? b[i] : 0
        diff |= x ^ y
        i += 1
    }
    return diff == 0 && !a.isEmpty && !b.isEmpty
}

/// Henter nøkkelen fra `Authorization: Bearer <nøkkel>`. Nil hvis feltet mangler eller har feil form.
public func bearerToken(from header: String?) -> String? {
    guard let raw = header?.trimmingCharacters(in: .whitespaces) else { return nil }
    let prefix = "bearer "
    guard raw.count > prefix.count, raw.lowercased().hasPrefix(prefix) else { return nil }
    let token = String(raw.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
    return token.isEmpty ? nil : token
}

/// IPv4 «a.b.c.d» → tall. Nil ved ugyldig adresse.
public func parseIPv4(_ s: String) -> UInt32? {
    let parts = s.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count == 4 else { return nil }
    var v: UInt32 = 0
    for p in parts {
        guard !p.isEmpty, p.count <= 3, p.allSatisfy({ $0.isASCII && $0.isNumber }),
              let n = UInt32(p), n <= 255 else { return nil }
        v = (v << 8) | n
    }
    return v
}

/// Tillatelsesliste: enkeltadresser («10.69.1.39») eller nett («10.69.1.0/24», minst /16).
public struct IPAllowList: Sendable, Equatable {
    public struct Entry: Sendable, Equatable {
        public let network: UInt32
        public let mask: UInt32
    }

    public static let minPrefix = 16
    public let entries: [Entry]

    /// Nil hvis lista er tom eller én oppføring er ugyldig.
    public init?(_ items: [String]) {
        var out: [Entry] = []
        for raw in items {
            let item = raw.trimmingCharacters(in: .whitespaces)
            guard let e = IPAllowList.parseEntry(item) else { return nil }
            out.append(e)
        }
        guard !out.isEmpty else { return nil }
        entries = out
    }

    public static func parseEntry(_ item: String) -> Entry? {
        let pieces = item.split(separator: "/", omittingEmptySubsequences: false)
        guard pieces.count == 1 || pieces.count == 2, let ip = parseIPv4(String(pieces[0])) else { return nil }
        var prefix = 32
        if pieces.count == 2 {
            guard pieces[1].allSatisfy({ $0.isASCII && $0.isNumber }), let p = Int(pieces[1]),
                  p >= minPrefix, p <= 32 else { return nil }
            prefix = p
        }
        let mask: UInt32 = prefix == 32 ? UInt32.max : ~(UInt32.max >> UInt32(prefix))
        return Entry(network: ip & mask, mask: mask)
    }

    /// Godtar «10.69.1.39» og IPv4-tilordnet IPv6 («::ffff:10.69.1.39»).
    public func allows(_ address: String) -> Bool {
        var a = address
        if a.lowercased().hasPrefix("::ffff:") { a = String(a.dropFirst(7)) }
        guard let ip = parseIPv4(a) else { return false }
        return entries.contains { (ip & $0.mask) == $0.network }
    }
}

/// IPv4 som tall (vertsrekkefølge) → «a.b.c.d».
public func formatIPv4(_ v: UInt32) -> String {
    "\((v >> 24) & 255).\((v >> 16) & 255).\((v >> 8) & 255).\(v & 255)"
}
