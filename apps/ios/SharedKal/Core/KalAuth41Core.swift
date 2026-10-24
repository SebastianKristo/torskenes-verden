import Foundation
import Security
import CryptoKit

/* ---------------- Prompt 41: Kalender – innlogging med Homelab (PKCE), «Fortsett som», innlogging uten adresse ---------------- */
// Brukes av Kalender (iOS), Kalender for Mac og (lesing av delt enhets-token) Homelab-appen via SharedKal/Group.
// Fasit: Kalender App.dc.html → auVals (start · wait · err · pw) og linkRows (Server, Logg ut).
//
// 1. «Fortsett som …»: Homelab legger et kortlivet enhets-token i delt Nøkkelring (keychain-access-group
//    $(AppIdentifierPrefix)no.kristo.shared, krever Team ID) og/eller i App Group-en (KalShared41.save). Kalender bytter det
//    mot et eget token: POST /api/auth/device-exchange {device_token, app:"kalender"} → {token, refresh?, user}.
// 2. «Logg inn med Homelab-appen»: state + code_verifier lagres i Nøkkelringen FØR app-byttet (appen kan bli drept), så åpnes
//    https://home.kristo.no/app-auth?client=kalender&redirect=kalender://auth&state=…&cc=… (universal link) eller
//    homelab://app-auth?… (fungerer uten entitlements). Homelab godkjenner (Face ID), kaller POST /api/auth/app-code og åpner
//    kalender://auth?code=…&state=…(&server=…). Kalender sjekker state og bytter code + verifier: POST /api/auth/token.
// 3. Ingen adresse ved innlogging: https://os.smarthjemexperten.no (prompt 47) som standard, adressene fra Homelab (App Group) og /api/discovery.

struct KalSession41 {
    let token: String
    let refresh: String
    let user: String
    let base: String
}

struct KalAuth41Error: Error {
    let message: String
    /// 0 = fikk ikke kontakt, ellers HTTP-koden.
    let status: Int
}

/// Venter på svar fra Homelab (lagret i Nøkkelringen mens Homelab er åpen).
struct KalPending41: Codable {
    var state: String
    var verifier: String
    var at: Double
    var base: String
}

enum KalAuth41 {
    /// Prompt 47: standardadressene (claude-code-standard-serveradresser.md). Info.plist kan overstyre.
    static let standardExternal47: String = "https://os.smarthjemexperten.no"
    static let standardLocal47: String = "http://10.69.1.39:3000"

    /// Standardadressen appen leveres med (Info.plist KalDefaultServer41 kan overstyre).
    static var defaultBase: String {
        let v: String = (Bundle.main.object(forInfoDictionaryKey: "KalDefaultServer41") as? String) ?? ""
        if v.hasPrefix("http://") || v.hasPrefix("https://") { return trim(v) }
        return standardExternal47
    }

    /// Prompt 47: standard lokal adresse (Info.plist KalDefaultLocal47 kan overstyre).
    static var defaultLocal47: String {
        let v: String = (Bundle.main.object(forInfoDictionaryKey: "KalDefaultLocal47") as? String) ?? ""
        if v.hasPrefix("http://") || v.hasPrefix("https://") { return trim(v) }
        return standardLocal47
    }

    static let client: String = "kalender"
    static let redirect: String = "kalender://auth"
    /// Svaret må komme innen 60 s (koden fra Homelab er engangs og gyldig ≤ 60 s).
    static let timeout: Double = 60

    static func trim(_ s: String) -> String {
        var out: String = s.trimmingCharacters(in: .whitespacesAndNewlines)
        while out.hasSuffix("/") { out.removeLast() }
        return out
    }

    /* ---------- PKCE ---------- */

    static func random(_ bytes: Int) -> String {
        var b: [UInt8] = [UInt8](repeating: 0, count: bytes)
        let st: OSStatus = SecRandomCopyBytes(kSecRandomDefault, bytes, &b)
        if st != errSecSuccess {
            for i in 0..<bytes { b[i] = UInt8.random(in: 0...255) }
        }
        return b64url(Data(b))
    }

    static func b64url(_ d: Data) -> String {
        d.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    static func challenge(_ verifier: String) -> String {
        let h: SHA256.Digest = SHA256.hash(data: Data(verifier.utf8))
        return b64url(Data(h))
    }

    /// Ny forespørsel: lagres i Nøkkelringen før Homelab åpnes.
    /// Prompt 44: «Åpne Homelab igjen» lagde en ny state hver gang – godkjente man den første forespørselen som allerede
    /// lå i Homelab, passet svaret ikke («state») og innloggingen feilet. Nå gjenbrukes en fersk forespørsel (< 5 min),
    /// og de tre siste huskes, så svaret på hvilken som helst av dem godtas.
    static func begin(base: String) -> KalPending41 {
        let now: Double = Date().timeIntervalSince1970
        var list: [KalPending41] = pendingList().filter { (p: KalPending41) -> Bool in now - p.at < 900 }
        if let last = list.last, now - last.at < 300, last.base == base { return last }
        let p: KalPending41 = KalPending41(state: random(18), verifier: random(32), at: now, base: base)
        list.append(p)
        if list.count > 3 { list = Array(list.suffix(3)) }
        savePending(list)
        return p
    }

    private static func savePending(_ list: [KalPending41]) {
        guard let d = try? JSONEncoder().encode(list) else { return }
        #if os(macOS)
        // Prompt 43: på Mac i appens egne (sandkasse-)innstillinger – Nøkkelringen på hovedtråden kan vente på en dialog.
        UserDefaults.standard.set(d, forKey: "kal44.pending")
        #else
        KalKeychain41.write("pending44", d)
        #endif
    }

    static func pendingList() -> [KalPending41] {
        #if os(macOS)
        let d: Data? = UserDefaults.standard.data(forKey: "kal44.pending")
        #else
        let d: Data? = KalKeychain41.read("pending44")
        #endif
        if let d, let list = try? JSONDecoder().decode([KalPending41].self, from: d) { return list }
        // Eldre versjon (én forespørsel).
        #if os(macOS)
        guard let o = UserDefaults.standard.data(forKey: "kal43.pending") else { return [] }
        #else
        guard let o = KalKeychain41.read("pending") else { return [] }
        #endif
        if let one = try? JSONDecoder().decode(KalPending41.self, from: o) { return [one] }
        return []
    }

    /// Den siste forespørselen (eller den som passer state).
    static func pending(state: String? = nil) -> KalPending41? {
        let list: [KalPending41] = pendingList()
        if let state { return list.last { (p: KalPending41) -> Bool in p.state == state } }
        return list.last
    }

    static func clearPending() {
        #if os(macOS)
        UserDefaults.standard.removeObject(forKey: "kal43.pending")
        UserDefaults.standard.removeObject(forKey: "kal44.pending")
        #else
        KalKeychain41.delete("pending")
        KalKeychain41.delete("pending44")
        #endif
    }

    static func query(_ p: KalPending41) -> String {
        "client=" + client + "&redirect=" + enc(redirect) + "&state=" + enc(p.state) + "&cc=" + enc(challenge(p.verifier)) + "&cc_method=S256"
    }

    /// Universal link (Homelab fanger den med Associated Domains / App Links; uten appen åpnes web-godkjenningen).
    static func universalURL(_ p: KalPending41) -> URL? { URL(string: "https://home.kristo.no/app-auth?" + query(p)) }
    /// Eget URL-skjema – virker uten entitlements.
    static func schemeURL(_ p: KalPending41) -> URL? { URL(string: "homelab://app-auth?" + query(p)) }
    /// Web-godkjenning på serveren (Homelab ikke installert).
    static func webURL(_ p: KalPending41, base: String) -> URL? { URL(string: trim(base) + "/app-auth?" + query(p)) }

    static func enc(_ s: String) -> String {
        var allowed: CharacterSet = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    /* ---------- Adresser ---------- */

    /// Adressene som prøves (uten å spørre brukeren): manuell, fra Homelab, forrige økt, lokal/ekstern fra serveren, standard.
    static func candidates(extra: [String] = []) -> [String] {
        var raw: [String] = []
        let manual: String = UserDefaults.standard.string(forKey: "kal41.manual") ?? ""
        if !manual.isEmpty { raw.append(manual) }
        raw.append(contentsOf: extra)
        raw.append(contentsOf: KalGroup.homelabBases)
        if let d = KalShared41.device() { raw.append(contentsOf: d.bases) }
        raw.append(contentsOf: KalServer41.ordered())
        raw.append(contentsOf: KalGroup.bases)
        let last: String = UserDefaults.standard.string(forKey: "kal.lastServer") ?? ""
        if !last.isEmpty { raw.append(last) }
        raw.append(defaultBase)
        // Prompt 47: standard lokal adresse til slutt (5G: ekstern først, så den svarer raskt; hjemme velger choose() lokal).
        raw.append(defaultLocal47)
        var out: [String] = []
        for r in raw {
            let s: String = trim(r)
            if s.hasPrefix("http://") || s.hasPrefix("https://"), !out.contains(s) { out.append(s) }
        }
        return out
    }

    /// Svarer serveren i det hele tatt (alle HTTP-svar teller)? Brukes for å velge adresse uten å spørre.
    static func reachable(_ base: String, timeout: TimeInterval) async -> Bool {
        guard let url = URL(string: trim(base) + "/api/discovery") else { return false }
        var r: URLRequest = URLRequest(url: url)
        r.timeoutInterval = timeout
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let pair = try? await URLSession.shared.data(for: r) else { return false }
        return pair.1 is HTTPURLResponse
    }

    static func firstReachable(_ list: [String]) async -> String? {
        for b in list {
            let ok: Bool = await reachable(b, timeout: 5)
            if ok { return b }
        }
        return nil
    }

    /* ---------- Kall ---------- */

    static func post(_ base: String, _ path: String, _ body: [String: Any], token: String? = nil) async throws -> [String: Any] {
        do {
            let d: Data = try await KalNet.send("POST", path, json: body, timeout: 20, bases: [base], token: token)
            return ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        } catch let e as KalNetError {
            throw KalAuth41Error(message: e.message, status: e.status)
        }
    }

    static func session(_ o: [String: Any], base: String) throws -> KalSession41 {
        guard let token = o["token"] as? String, !token.isEmpty else {
            throw KalAuth41Error(message: "Uventet svar fra Homelab.", status: 502)
        }
        var name: String = ""
        if let u = o["user"] as? [String: Any] {
            name = (u["name"] as? String) ?? (u["displayName"] as? String) ?? (u["username"] as? String) ?? ""
        } else if let u = o["user"] as? String {
            name = u
        }
        return KalSession41(token: token, refresh: (o["refresh"] as? String) ?? "", user: name, base: base)
    }

    /// kalender://auth?code=…&state=… → tokens. Sjekker state mot Nøkkelringen.
    static func exchange(code: String, state: String, server: String?) async throws -> KalSession41 {
        if pendingList().isEmpty { throw KalAuth41Error(message: "Innloggingen er utløpt. Prøv igjen.", status: -1) }
        guard let p = pending(state: state) else { throw KalAuth41Error(message: "Svaret fra Homelab passet ikke (state). Prøv igjen.", status: -1) }
        // Prompt 44: koden fra Homelab er selv gyldig i 60 s (serveren sjekker). Appens egen grense var 90 s fra man trykket
        // – brukte man lenger tid i Homelab (Face ID, innlogging der først), feilet svaret. Nå: 15 min.
        if Date().timeIntervalSince1970 - p.at > 900 {
            clearPending()
            throw KalAuth41Error(message: "Innloggingen er utløpt. Prøv igjen.", status: -1)
        }
        var bases: [String] = []
        if let server, server.hasPrefix("http://") || server.hasPrefix("https://") { bases.append(trim(server)) }
        if !p.base.isEmpty && !bases.contains(p.base) { bases.append(p.base) }
        for b in candidates() where !bases.contains(b) { bases.append(b) }
        // Prompt 44: eget enhetsnavn (ellers «iPhone» for alle, og innlogging på én enhet logget ut de andre).
        let body: [String: Any] = ["code": code, "code_verifier": p.verifier, "client": client, "redirect": redirect, "device": KalDev44.name]
        var last: KalAuth41Error = KalAuth41Error(message: "Får ikke kontakt med Homelab", status: 0)
        for b in bases.prefix(4) {
            do {
                let o: [String: Any] = try await post(b, "/api/auth/token", body)
                clearPending()
                return try session(o, base: b)
            } catch let e as KalAuth41Error {
                last = e
                // Serveren svarte (feil kode/utløpt): ikke prøv neste adresse.
                if e.status != 0 { break }
            }
        }
        clearPending()
        throw last
    }

    /// «Fortsett som»: enhets-tokenet fra Homelab → eget token for Kalender.
    static func deviceExchange(_ d: KalDevice41) async throws -> KalSession41 {
        var bases: [String] = d.bases.map { (s: String) -> String in trim(s) }
        for b in candidates() where !bases.contains(b) { bases.append(b) }
        var last: KalAuth41Error = KalAuth41Error(message: "Får ikke kontakt med Homelab", status: 0)
        for b in bases.prefix(4) {
            do {
                let o: [String: Any] = try await post(b, "/api/auth/device-exchange", ["device_token": d.token, "app": client, "device": KalDev44.name])
                var s: KalSession41 = try session(o, base: b)
                if s.user.isEmpty { s = KalSession41(token: s.token, refresh: s.refresh, user: d.display, base: b) }
                return s
            } catch let e as KalAuth41Error {
                last = e
                if e.status != 0 { break }
            }
        }
        throw last
    }

    /// Feiltekstene fra spesifikasjonen.
    static func message(_ e: KalAuth41Error) -> String {
        if e.status == 0 { return "Får ikke kontakt med Homelab." }
        if e.status == -1 { return e.message }
        if e.status == 401 || e.status == 403 { return "Innloggingen ble avvist i Homelab." }
        if e.status == 404 { return "Homelab-serveren kjenner ikke denne innloggingen ennå (404). Oppdater serveren, eller bruk brukernavn og passord." }
        return e.message + " (HTTP " + String(e.status) + ")"
    }
}

/* ---------- Lokal og ekstern adresse (Innstillinger → Server, lesbar i Kalender) ---------- */

enum KalServer41 {
    /// Prompt 47: uten lagrede adresser (ny installasjon, eldre server) gjelder standardverdiene.
    static var local: [String] {
        let v: [String] = KalGroup.defaults.stringArray(forKey: "kal41.local") ?? []
        return v.isEmpty ? [KalAuth41.defaultLocal47] : v
    }
    static var external: String {
        let v: String = KalGroup.defaults.string(forKey: "kal41.external") ?? ""
        return v.isEmpty ? KalAuth41.defaultBase : v
    }
    static var auto: Bool { (KalGroup.defaults.object(forKey: "kal41.auto") as? Bool) ?? true }
    /// «Lokal» eller «Ekstern» (sist valgt).
    static var now: String { KalGroup.defaults.string(forKey: "kal41.now") ?? "" }

    static func ordered() -> [String] {
        var out: [String] = []
        let ext: String = external
        if now == "Lokal" { out.append(contentsOf: local) }
        if !ext.isEmpty { out.append(ext) }
        if now != "Lokal" { out.append(contentsOf: local) }
        return out
    }

    /// Henter adressene (GET /api/me/server, ellers /api/discovery) og lagrer dem. nil = serveren har ikke endepunktene.
    @discardableResult
    static func refresh() async -> Bool {
        var loc: [String] = []
        var ext: String = ""
        var au: Bool = true
        var found: Bool = false
        if let d = try? await KalNet.get("/api/me/server", timeout: 8),
           let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] {
            if let l = o["local"] as? String, !l.isEmpty { loc.append(l) }
            if let l = o["local"] as? [String] { loc.append(contentsOf: l) }
            ext = (o["external"] as? String) ?? ""
            au = (o["auto"] as? Bool) ?? true
            found = !loc.isEmpty || !ext.isEmpty
            KalSrv47.noteServer(o)
        }
        if !found, let d = try? await KalNet.get("/api/discovery", timeout: 8),
           let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] {
            if let l = o["local"] as? [String] { loc.append(contentsOf: l) }
            if let l = o["local"] as? String, !l.isEmpty { loc.append(l) }
            ext = (o["external"] as? String) ?? ""
            found = !loc.isEmpty || !ext.isEmpty
        }
        if !found { return false }
        // Prompt 47: adressene ble endret i Innstillinger → Server mot en server uten synk – behold dem.
        if KalSrv47.localOnly { return true }
        // Prompt 46: containerens egen adresse (Docker-nett 172.16/12, loopback) kan aldri nås fra telefonen/Mac-en – forkastes.
        let cleanLoc: [String] = loc.map { (s: String) -> String in KalAuth41.trim(s) }.filter { (s: String) -> Bool in
            s.hasPrefix("http") && !KalSrv46.isContainerIP(KalSrv46.host(s))
        }
        if KalSrv46.isContainerIP(KalSrv46.host(ext)) { ext = "" }
        let d: UserDefaults = KalGroup.defaults
        d.set(cleanLoc, forKey: "kal41.local")
        d.set(KalAuth41.trim(ext), forKey: "kal41.external")
        d.set(au, forKey: "kal41.auto")
        return true
    }

    /// Bytt automatisk: lokal når den svarer innen 1,5 s (prompt 47, før 300 ms), ellers ekstern. Returnerer adressene i rekkefølge.
    static func choose() async -> [String] {
        let loc: [String] = local
        let ext: String = external
        if loc.isEmpty && ext.isEmpty { return [] }
        var useLocal: Bool = false
        if auto || ext.isEmpty {
            for l in loc {
                let t0: Date = Date()
                if await KalAuth41.reachable(l, timeout: 1.5), Date().timeIntervalSince(t0) < 1.5 || ext.isEmpty {
                    useLocal = true
                    break
                }
            }
        }
        KalGroup.defaults.set(useLocal ? "Lokal" : "Ekstern", forKey: "kal41.now")
        return ordered()
    }

    /// «Lokal: 10.69.1.39:3000 · ekstern: os.smarthjemexperten.no · hentes fra Homelab»
    static func summary() -> String {
        func host(_ s: String) -> String {
            var x: String = s
            if let r = x.range(of: "://") { x = String(x[r.upperBound...]) }
            return x
        }
        var parts: [String] = []
        if let l = local.first { parts.append("Lokal: " + host(l)) }
        if !external.isEmpty { parts.append((parts.isEmpty ? "Ekstern: " : "ekstern: ") + host(external)) }
        if parts.isEmpty {
            let b: [String] = KalNet.session().0
            if let f = b.first { parts.append(host(f)) }
        }
        if !now.isEmpty && auto { parts.append("nå: " + now) }
        parts.append("hentes fra Homelab")
        return parts.joined(separator: " · ")
    }
}
