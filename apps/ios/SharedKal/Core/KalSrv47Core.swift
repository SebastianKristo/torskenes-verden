import Foundation
import Combine

/* ---------------- Prompt 47: Innstillinger → Server (ekstern og lokal adresse med standardverdier) ---------------- */
// Spesifikasjon: claude-code-standard-serveradresser.md. Standard: ekstern https://os.smarthjemexperten.no, lokal http://10.69.1.39:3000
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
