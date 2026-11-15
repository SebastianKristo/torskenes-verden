import Foundation

/* ---------------- Serveradressen: normalisering og lokalt nett ---------------- */
// Fasit: shared/testvektorer/serveradresse.json (F-logikk L8, Q39). Dette må skje på enheten før appen har kontakt med
// serveren, så regelen er et av unntakene i CLAUDE.md og testes av HomelabTests (ServerAddressTests) mot fila.
// Brukes av API.normalize/isLocal (Homelab-appen) og APIClient.pickBase. Bare Foundation, uten DNS-oppslag.

enum ServerAddress {
    /// Ny standard ekstern adresse.
    static let defaultExternal: String = "https://os.smarthjemeksperten.no"
    /// Den gamle, feilstavede standardadressen (delt opp, så et søk etter stavemåten bare treffer migreringen).
    static let legacyExternal: String = "https://os.smarthjem" + "experten.no"

    /// Det brukeren skrev → skjema + vert (+ port), uten sti og uten / til slutt. nil når den er tom.
    static func normalize(_ raw: String) -> String? {
        var s: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        if s.isEmpty { return nil }
        if s.lowercased() == legacyExternal { return defaultExternal }
        // Sti fjernes («/finans», «/finans/api»): appen legger selv til stiene.
        let start: String.Index = s.range(of: "://")?.upperBound ?? s.startIndex
        if let slash = s[start...].firstIndex(of: "/") { s = String(s[..<slash]) }
        if s.isEmpty { return nil }
        let lower: String = s.lowercased()
        if lower.hasPrefix("http://") { return "http://" + String(s.dropFirst(7)) }
        if lower.hasPrefix("https://") { return "https://" + String(s.dropFirst(8)) }
        return (isLocal(host(of: s)) ? "http://" : "https://") + s
    }

    /// Verten i en adresse med eller uten skjema («[::1]:3000» → «::1», «nas.local:3000» → «nas.local»).
    static func host(of address: String) -> String {
        var s: String = address
        if let r = s.range(of: "://") { s = String(s[r.upperBound...]) }
        if let slash = s.firstIndex(of: "/") { s = String(s[..<slash]) }
        if s.hasPrefix("[") {
            if let end = s.firstIndex(of: "]") { return String(s[s.index(after: s.startIndex)..<end]).lowercased() }
            return String(s.dropFirst()).lowercased()
        }
        // Mer enn ett kolon uten klammer = IPv6 uten port.
        if s.filter({ (c: Character) -> Bool in c == ":" }).count > 1 { return s.lowercased() }
        return (s.split(separator: ":").first.map(String.init) ?? s).lowercased()
    }

    /// IPv4 som fire tall 0–255, ellers nil.
    static func ipv4(_ host: String) -> [Int]? {
        let parts: [Substring] = host.split(separator: ".", omittingEmptySubsequences: false)
        if parts.count != 4 { return nil }
        var out: [Int] = []
        for p in parts {
            guard !p.isEmpty, p.count <= 3, let n = Int(p), (0...255).contains(n) else { return nil }
            out.append(n)
        }
        return out
    }

    /// Lokalt nett (da er http tillatt): localhost, loopback, privat IPv4, link-local, CGNAT (Tailscale), IPv6 ULA og
    /// link-local, navn uten punktum og .local / .lan / .home.arpa / .internal.
    static func isLocal(_ rawHost: String) -> Bool {
        let h: String = rawHost.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        if h.isEmpty { return false }
        if h == "localhost" || h == "::1" { return true }
        if let p = ipv4(h) {
            if p[0] == 10 || p[0] == 127 { return true }
            if p[0] == 172 && (16...31).contains(p[1]) { return true }
            if p[0] == 192 && p[1] == 168 { return true }
            if p[0] == 169 && p[1] == 254 { return true }
            if p[0] == 100 && (64...127).contains(p[1]) { return true }
            return false
        }
        if h.contains(":") {
            // IPv6: fe80::/10 (link-local) og fc00::/7 (ULA).
            let first: String = h.split(separator: ":", omittingEmptySubsequences: false).first.map(String.init) ?? ""
            guard let v = Int(first, radix: 16) else { return false }
            return (v & 0xffc0) == 0xfe80 || (v & 0xfe00) == 0xfc00
        }
        if !h.contains(".") { return true }
        let suffixes: [String] = [".local", ".lan", ".home.arpa", ".internal"]
        return suffixes.contains { (s: String) -> Bool in h.hasSuffix(s) }
    }

    /// Klartekst (http) bare på lokalt nett. false for tom adresse.
    static func isAllowed(_ raw: String) -> Bool {
        guard let n = normalize(raw) else { return false }
        if n.lowercased().hasPrefix("https://") { return true }
        return isLocal(host(of: n))
    }

    /// «Pålitelig enhet» (docs/sikkerhet.md): bare 10/8, 172.16/12 og 192.168/16 – strengere enn isLocal.
    static func isTrustedDeviceIP(_ host: String) -> Bool {
        guard let p = ipv4(host) else { return false }
        return p[0] == 10 || (p[0] == 172 && (16...31).contains(p[1])) || (p[0] == 192 && p[1] == 168)
    }
}
