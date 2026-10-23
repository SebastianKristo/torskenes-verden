import Foundation

/* ---------------- Prompt 46: serveradressen appen er logget inn med (Mac-oppdatering, interne Docker-adresser) ---------------- */
// Spesifikasjon: claude-code-mac-oppdatering-intern-ip.md.
// Årsak: serveren rapporterte containerens egen adresse (172.18.0.3, Docker-nettet) som «lokal adresse» i /api/me/server.
// Uten ekstern adresse la «Bytt automatisk» den først i adresselista, og Oppdateringer brukte den første adressen – Mac-en kan
// aldri nå den, og sjekken sto og ventet. Nå:
//   - Adresser i 172.16.0.0/12 og 127.0.0.0/8 (og 169.254/16) forkastes fra lista (unntatt adressen man selv logget inn med).
//   - Oppdateringssjekken går mot adressen appen er logget inn med, 15 s per forsøk, med domenet i teksten.
//   - URL-er i manifestet: relative løses mot serveradressen, og en intern/annen IP byttes ut med serveradressen
//     (fila sjekkes uansett mot SHA-256 fra serveren).

enum KalSrv46 {
    /// Tidsavbrudd per forsøk (sjekk og nedlasting uten data).
    static let timeout: TimeInterval = 15

    /// IPv4-adressen i verten, eller nil (domenenavn).
    static func ipv4(_ host: String) -> [Int]? {
        let p: [Substring] = host.split(separator: ".")
        if p.count != 4 { return nil }
        var out: [Int] = []
        for x in p {
            guard let n = Int(x), n >= 0, n <= 255 else { return nil }
            out.append(n)
        }
        return out
    }

    /// Docker-nett, loopback og link-local: kan aldri nås fra en annen maskin.
    static func isContainerIP(_ host: String) -> Bool {
        let h: String = host.lowercased()
        if h == "localhost" { return true }
        guard let ip = ipv4(h) else { return false }
        if ip[0] == 127 { return true }
        if ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31 { return true }
        if ip[0] == 169 && ip[1] == 254 { return true }
        return false
    }

    /// Private/interne adresser (10/8, 172.16/12, 127/8) – brukes i manifest-URL-er bare hvis det er samme vert som serveradressen.
    static func isInternalIP(_ host: String) -> Bool {
        if isContainerIP(host) { return true }
        guard let ip = ipv4(host.lowercased()) else { return false }
        return ip[0] == 10
    }

    static func host(_ base: String) -> String {
        let b: String = base.hasPrefix("http") ? base : "https://" + base
        return URL(string: b)?.host ?? ""
    }

    /// Fjerner container-/loopback-adresser (unntatt den man logget inn med) og dubletter. Rekkefølgen beholdes.
    static func clean(_ bases: [String], keep login: String = "") -> [String] {
        let lg: String = login.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        var out: [String] = []
        for b0 in bases {
            let b: String = b0.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            if b.isEmpty || out.contains(b) { continue }
            if b != lg && isContainerIP(host(b)) { continue }
            out.append(b)
        }
        return out
    }

    /// Adressen oppdateringen sjekkes mot: den man logget inn med, ellers første brukbare i lista.
    static func pick(login: String, bases: [String]) -> String {
        let lg: String = login.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if !lg.isEmpty { return lg }
        return clean(bases).first ?? ""
    }

    /// «home.kristo.no» (aldri en intern IP når det finnes et domene i lista).
    static func display(_ base: String, others: [String] = []) -> String {
        let h: String = host(base)
        if !h.isEmpty && !isInternalIP(h) { return h }
        for o in others {
            let x: String = host(o)
            if !x.isEmpty && !isInternalIP(x) { return x }
        }
        return h.isEmpty ? "serveren" : h
    }

    /// Manifest-URL: relativ → mot serveradressen. Absolutt med intern/annen IP-vert → samme sti mot serveradressen.
    static func resolve(_ raw: String, base: String) -> String {
        let b: String = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let v: String = raw.trimmingCharacters(in: .whitespaces)
        if v.isEmpty { return v }
        if !v.lowercased().hasPrefix("http") {
            return b + (v.hasPrefix("/") ? v : "/" + v)
        }
        guard let u = URLComponents(string: v), let h = u.host else { return v }
        let bh: String = host(b)
        if h == bh || !isInternalIP(h) { return v }
        var path: String = u.percentEncodedPath
        if let q = u.percentEncodedQuery { path += "?" + q }
        return b + path
    }

    /// Kort feiltekst for «Vis detaljer»: URL og feilkode.
    static func details(url: String, status: Int, error: String) -> String {
        var s: String = "URL: " + url
        s += "\nFeilkode: " + (status == 0 ? "ingen svar (tidsavbrudd eller ingen forbindelse)" : String(status))
        if !error.isEmpty { s += "\n" + error }
        return s
    }
}
