import Foundation
import Combine

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

/* ---------------- Prompt 47: Innstillinger → Server (ekstern og lokal adresse med standardverdier) ---------------- */
// Spesifikasjon: claude-code-standard-serveradresser.md. Standard: ekstern https://os.smarthjemeksperten.no, lokal http://10.69.1.39:3000
// (KalAuth41.defaultBase / defaultLocal47, Info.plist kan overstyre; serveren kan overstyre via PUBLIC_URL/LOCAL_URL → /api/me/server
// «defaults»). Lagres per enhet (App Group: kal41.external / kal41.local, samme som KalServer41 leser) og synkes til kontoen med
// PUT /api/me/server {external, local, device} – svarer serveren 404/405 (eldre versjon), gjelder adressene bare på denne enheten.
// Brukes av Kalender (iOS) og Kalender for Mac.

enum KalSrv47 {
    /// Serverens standardverdier (fra /api/me/server «defaults»), ellers appens egne.
    static var standardExternal: String {
        let v: String = KalGroup.defaults.string(forKey: "kal47.defExt") ?? ""
        return v.isEmpty ? KalAuth41.defaultBase : v
    }

    static var standardLocal: String {
        let v: String = KalGroup.defaults.string(forKey: "kal47.defLoc") ?? ""
        return v.isEmpty ? KalAuth41.defaultLocal47 : v
    }

    /// Kalles av KalServer41.refresh() med svaret fra GET /api/me/server.
    static func noteServer(_ o: [String: Any]) {
        guard let d = o["defaults"] as? [String: Any] else { return }
        if let e = d["external"] as? String, e.hasPrefix("http") { KalGroup.defaults.set(KalAuth41.trim(e), forKey: "kal47.defExt") }
        if let l = d["local"] as? String, l.hasPrefix("http") { KalGroup.defaults.set(KalAuth41.trim(l), forKey: "kal47.defLoc") }
    }

    /// «https://…» eller «http://…» uten skråstrek til slutt, ellers nil. Uten skjema: lokal IP → http, ellers https.
    static func normalize(_ raw: String) -> String? {
        var s: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return nil }
        if !s.lowercased().hasPrefix("http://") && !s.lowercased().hasPrefix("https://") {
            let first: String = s.components(separatedBy: "/").first ?? ""
            let host: String = first.components(separatedBy: ":").first ?? ""
            s = (KalSrv46.ipv4(host) != nil ? "http://" : "https://") + s
        }
        s = KalAuth41.trim(s)
        guard let u = URL(string: s), let h = u.host, !h.isEmpty else { return nil }
        return s
    }

    /// Svartid i ms, eller nil når adressen ikke svarer innen tidsfristen.
    static func ping(_ base: String, timeout: TimeInterval = 4) async -> Int? {
        let t0: Date = Date()
        let ok: Bool = await KalAuth41.reachable(base, timeout: timeout)
        if !ok { return nil }
        return Swift.max(1, Int(Date().timeIntervalSince(t0) * 1000))
    }

    /// Adressene er endret på en server uten synk (404): refresh() skal ikke overskrive dem med /api/discovery.
    static var localOnly: Bool {
        get { KalGroup.defaults.bool(forKey: "kal47.localOnly") }
        set { KalGroup.defaults.set(newValue, forKey: "kal47.localOnly") }
    }

    static func storeLocally(external: String, local: String) {
        let d: UserDefaults = KalGroup.defaults
        d.set(external, forKey: "kal41.external")
        d.set(local.isEmpty ? [] : [local], forKey: "kal41.local")
    }

    /// Lagrer på enheten og på kontoen. Returnerer en melding til brukeren.
    static func save(external: String, local: String, device: String) async -> String {
        storeLocally(external: external, local: local)
        let body: [String: Any] = ["external": external, "local": local, "device": device]
        do {
            let d: Data = try await KalNet.send("PUT", "/api/me/server", json: body, timeout: 10)
            if let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] { noteServer(o) }
            localOnly = false
            return "Lagret · synkes til dine andre enheter"
        } catch let e as KalNetError {
            if e.status == 404 || e.status == 405 {
                localOnly = true
                return "Lagret på denne enheten (serveren støtter ikke synk ennå)"
            }
            if e.status == 400 { return e.message }
            return "Lagret på denne enheten · fikk ikke synket (" + (e.status == 0 ? "ingen kontakt" : "HTTP " + String(e.status)) + ")"
        } catch {
            return "Lagret på denne enheten"
        }
    }

    /// «Tilbakestill til standard»: begge feltene får standardverdiene (også på kontoen, {reset:true}).
    static func reset(device: String) async -> String {
        storeLocally(external: standardExternal, local: standardLocal)
        localOnly = false
        do {
            let d: Data = try await KalNet.send("PUT", "/api/me/server", json: ["reset": true, "device": device], timeout: 10)
            if let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] {
                noteServer(o)
                let e: String = (o["external"] as? String) ?? ""
                let l: String = (o["local"] as? String) ?? ""
                if e.hasPrefix("http") { storeLocally(external: KalAuth41.trim(e), local: l.hasPrefix("http") ? KalAuth41.trim(l) : standardLocal) }
            }
            return "Tilbakestilt til standard"
        } catch {
            return "Tilbakestilt på denne enheten"
        }
    }
}

/// Feltene og statusen i Innstillinger → Server.
@MainActor
final class KalSrv47Model: ObservableObject {
    static let shared: KalSrv47Model = KalSrv47Model()

    @Published var sheetOpen: Bool = false
    @Published var external: String = ""
    @Published var local: String = ""
    /// nil = ikke testet, -1 = tester, 0 = svarer ikke, ellers ms.
    @Published var extMs: Int? = nil
    @Published var locMs: Int? = nil
    @Published var message: String = ""
    @Published var busy: Bool = false

    /// Fyller feltene (standardverdiene ved første oppstart) og tester begge.
    func load() {
        external = KalServer41.external
        local = KalServer41.local.first ?? KalSrv47.standardLocal
        message = ""
        testBoth()
    }

    func testBoth() {
        test(external: true)
        test(external: false)
    }

    func test(external isExt: Bool) {
        guard let b = KalSrv47.normalize(isExt ? external : local) else {
            if isExt { extMs = 0 } else { locMs = 0 }
            return
        }
        if isExt { extMs = -1 } else { locMs = -1 }
        Task { @MainActor in
            let ms: Int? = await KalSrv47.ping(b, timeout: isExt ? 6 : 1.5)
            if isExt { self.extMs = ms ?? 0 } else { self.locMs = ms ?? 0 }
        }
    }

    func save(device: String) {
        guard let e = KalSrv47.normalize(external) else {
            message = "Ekstern adresse må være en gyldig adresse (https://…)"
            return
        }
        let l: String = KalSrv47.normalize(local) ?? ""
        if !local.trimmingCharacters(in: .whitespaces).isEmpty && l.isEmpty {
            message = "Lokal adresse må være en gyldig adresse (http://…)"
            return
        }
        external = e
        local = l
        busy = true
        Task { @MainActor in
            self.message = await KalSrv47.save(external: e, local: l, device: device)
            self.busy = false
            self.testBoth()
        }
    }

    func reset(device: String) {
        external = KalSrv47.standardExternal
        local = KalSrv47.standardLocal
        busy = true
        Task { @MainActor in
            self.message = await KalSrv47.reset(device: device)
            self.external = KalServer41.external
            self.local = KalServer41.local.first ?? KalSrv47.standardLocal
            self.busy = false
            self.testBoth()
        }
    }

    /// «Svarer · 34 ms» / «Svarer ikke» / «Tester …».
    static func status(_ ms: Int?) -> String {
        guard let ms else { return "Ikke testet" }
        if ms < 0 { return "Tester …" }
        if ms == 0 { return "Svarer ikke" }
        return "Svarer · " + String(ms) + " ms"
    }
}

/* ---------------- Prompt 89 (IOS89): riktig domene, migrering og «Server»-arket før innlogging (Kalender iOS og Mac) ----------------
 Spesifikasjon: claude-code-innlogging-server-tannhjul.md. Standard ekstern adresse: https://os.smarthjemeksperten.no
 (KalAuth41.standardExternal47), lokal uendret http://10.69.1.39:3000.
 – migrate(): lagrede adresser som er nøyaktig den gamle feilstavede standarden skrives om ved oppstart (KalStore.init /
   MacStore.init). Egendefinerte adresser røres ikke.
 – Arket «Server» på innloggingen bruker samme lagring som Innstillinger → Server (KalGroup: kal41.external / kal41.local,
   KalSrv47.storeLocally). Er Kalender innlogget, synkes endringen også til kontoen (KalSrv47.save).
 – health(): «Test tilkobling» kaller GET /api/health. */

enum KalSrv89 {
    /// Den gamle, feilstavede standarden (bare for migreringen).
    static let oldExternal: String = "https://os.smarthjem" + "experten.no"
    static let newExternal: String = "https://os.smarthjemeksperten.no"

    /// Fjerner mellomrom og avsluttende /.
    static func clean(_ raw: String) -> String {
        var s: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        s = s.replacingOccurrences(of: " ", with: "")
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }

    /// Må starte med http:// eller https:// og ha en vert.
    static func valid(_ raw: String) -> Bool {
        let s: String = clean(raw)
        let l: String = s.lowercased()
        if !(l.hasPrefix("http://") || l.hasPrefix("https://")) { return false }
        let h: String = URL(string: s)?.host ?? ""
        return !h.isEmpty
    }

    static func host(_ raw: String) -> String {
        let s: String = clean(raw)
        if let h = URL(string: s)?.host, !h.isEmpty { return h }
        return s
    }

    /* ---------- Migrering ---------- */

    /// Nøyaktig den gamle standarden (mellomrom og avsluttende / tåles) → ny standard, ellers nil.
    static func fixed(_ raw: String) -> String? {
        let s: String = clean(raw)
        if s.isEmpty { return nil }
        return s.lowercased() == oldExternal ? newExternal : nil
    }

    static func fixList(_ list: [String]) -> [String] {
        list.map { (s: String) -> String in fixed(s) ?? s }
    }

    static func migrate() {
        let u: UserDefaults = UserDefaults.standard
        for k in ["kal41.manual", "kal.lastServer"] {
            if let v = u.string(forKey: k), let n = fixed(v) { u.set(n, forKey: k) }
        }
        let g: UserDefaults = KalGroup.defaults
        for k in ["kal41.external", "kal47.defExt", "kal.server"] {
            if let v = g.string(forKey: k), let n = fixed(v) { g.set(n, forKey: k) }
        }
        for k in ["kal.bases", "kal41.local"] {
            if let v = g.stringArray(forKey: k) {
                let n: [String] = fixList(v)
                if n != v { g.set(n, forKey: k) }
            }
        }
    }

    /* ---------- Lagring (samme som Innstillinger → Server) ---------- */

    static var external: String { KalServer41.external }
    static var local: String { KalServer41.local.first ?? KalSrv47.standardLocal }

    /// «Server: os.smarthjemeksperten.no» – domenet fra den eksterne adressen.
    static var displayHost: String {
        let m: String = UserDefaults.standard.string(forKey: "kal41.manual") ?? ""
        return host(m.isEmpty ? external : m)
    }

    /// Lagrer på enheten; innlogget også på kontoen. Returnerer en melding.
    static func save(external e: String, local l: String, loggedIn: Bool, device: String) async -> String {
        let ext: String = clean(e)
        let loc: String = clean(l)
        // Den manuelle adressen prøves først ved innlogging (KalAuth41.candidates); standarden trenger ingen.
        let manual: String = ext.lowercased() == KalSrv47.standardExternal.lowercased() ? "" : ext
        UserDefaults.standard.set(manual, forKey: "kal41.manual")
        if loggedIn { return await KalSrv47.save(external: ext, local: loc, device: device) }
        KalSrv47.storeLocally(external: ext, local: loc)
        return "Lagret · " + host(ext)
    }

    /* ---------- Test tilkobling ---------- */

    /// GET <adresse>/api/health → (true, «Tilkoblet · 34 ms») eller (false, feilmelding).
    static func health(_ raw: String) async -> (ok: Bool, text: String) {
        if !valid(raw) { return (false, "Adressen må starte med http:// eller https://") }
        let s: String = clean(raw)
        guard let url = URL(string: s + "/api/health") else { return (false, "Ugyldig adresse") }
        var r: URLRequest = URLRequest(url: url)
        r.timeoutInterval = KalSrv46.ipv4(host(s)) != nil ? 3 : 8
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        let t0: Date = Date()
        do {
            let pair: (Data, URLResponse) = try await HomelabHTTP.session.data(for: r)
            let code: Int = (pair.1 as? HTTPURLResponse)?.statusCode ?? 0
            let ms: Int = Int(Date().timeIntervalSince(t0) * 1000)
            if code >= 200 && code < 300 { return (true, "Tilkoblet · " + String(ms) + " ms") }
            return (false, "Serveren svarte med HTTP " + String(code))
        } catch let e as URLError {
            if e.code == .timedOut { return (false, "Svarer ikke (tidsavbrudd)") }
            if e.code == .notConnectedToInternet { return (false, "Ingen nettilkobling") }
            return (false, "Får ikke kontakt med " + host(s))
        } catch {
            return (false, "Får ikke kontakt med " + host(s))
        }
    }
}
