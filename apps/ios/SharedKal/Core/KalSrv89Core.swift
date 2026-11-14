import Foundation

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
            let pair: (Data, URLResponse) = try await URLSession.shared.data(for: r)
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
