import SwiftUI
import UIKit

/* ---------------- Prompt 30: SMB-veiviser «Sett opp nettverksdisk» (bare admin) ---------------- */
// Samme flyt som web/PWA (public/js/smb-wizard.js): Finn server → Logg inn → Velg delt mappe → Velg mappe → Test og lagre.
// API (server/smb-browse.js, app-token med finance:write fra admin):
//   POST /api/smb/discover → [{host, ip, name?}]          POST /api/smb/probe {host} → {ok, host, ip?, message?}
//   POST /api/smb/shares {host, user, password, domain} → {shares:[{name, comment}], protocol}
//   POST /api/smb/browse {…, share, path, protocol} → [{name, type}]   POST /api/smb/mkdir {…, name} → {ok, path}
//   POST /api/smb/test {…} → {ok, writable, message, mbps?}   POST /api/smb/save {…, use:[finans|system]} → {ok, label, …}
// Passordet holdes bare i minnet her (sendes med hvert kall) og nullstilles når arket lukkes.

struct Smb30Server: Identifiable, Equatable {
    var id: String { host + "|" + ip }
    var host: String
    var ip: String
    var name: String

    var title: String { name.isEmpty ? host : name }
    var sub: String {
        var parts: [String] = []
        if !name.isEmpty && name != host { parts.append(host) }
        if !ip.isEmpty && ip != host { parts.append(ip) }
        return parts.joined(separator: " · ")
    }
}

struct Smb30Share: Identifiable, Equatable {
    var id: String { name }
    var name: String
    var comment: String
}

struct Smb30Error: Equatable {
    var message: String
    var kind: String

    /// Forslag under feilmeldingen.
    var hints: [String] { Smb30Model.hints(kind) }
}

struct Smb30Test: Equatable {
    var ok: Bool
    var writable: Bool
    var message: String
}

@MainActor
@Observable
final class Smb30Model {
    static let shared = Smb30Model()
    nonisolated static let steps: [String] = ["Finn server", "Logg inn", "Velg delt mappe", "Velg mappe", "Test og lagre"]

    var open: Bool = false
    var step: Int = 0
    var servers: [Smb30Server] = []
    var scanning: Bool = false
    var manual: String = ""
    var probeFail: String = ""
    var server: Smb30Server = Smb30Server(host: "", ip: "", name: "")
    var user: String = ""
    var password: String = ""
    var domain: String = ""
    var guest: Bool = false
    var shares: [Smb30Share] = []
    var proto: String = "SMB3"
    var share: String = ""
    var path: [String] = []
    var dirs: [String]? = nil
    var newDir: String = ""
    var showNewDir: Bool = false
    var test: Smb30Test? = nil
    var testing: Bool = false
    var useFinans: Bool = false
    var useSystem: Bool = true
    var encrypted: Bool = true
    var busy: Bool = false
    var error: Smb30Error? = nil
    var doneLabel: String = ""

    /// Åpner veiviseren. finans/system: forhåndsvalgt bruk. encrypted: om systembackupen krypteres.
    func start(finans: Bool, system: Bool, encrypted: Bool, _ store: Store) {
        reset()
        useFinans = finans
        useSystem = system
        self.encrypted = encrypted
        open = true
        Task { await scan(store) }
    }

    func reset() {
        step = 0; servers = []; scanning = false; manual = ""; probeFail = ""; server = Smb30Server(host: "", ip: "", name: "")
        user = ""; password = ""; domain = ""; guest = false; shares = []; proto = "SMB3"; share = ""; path = []; dirs = nil
        newDir = ""; showNewDir = false; test = nil; testing = false; busy = false; error = nil; doneLabel = ""
    }

    func close() {
        password = ""
        open = false
    }

    var label: String {
        let base: String = "//" + server.host + "/" + share
        return path.isEmpty ? base : base + "/" + path.joined(separator: "/")
    }

    /* ---------- Kall ---------- */

    private func cred() -> [String: Any] {
        ["host": server.host, "user": guest ? "" : user, "password": guest ? "" : password, "domain": guest ? "" : domain]
    }
    private func target(_ p: [String]) -> [String: Any] {
        var o: [String: Any] = cred()
        o["share"] = share
        o["path"] = p.joined(separator: "/")
        o["protocol"] = proto
        return o
    }
    private func post(_ path: String, _ body: [String: Any], timeout: TimeInterval = 40, _ store: Store) async throws -> Data {
        try await store.api.callAt("/api", "POST", "/smb" + path, json: body, timeout: timeout)
    }
    private func fail(_ e: Error) -> Smb30Error {
        if let a = e as? APIError {
            if a.status == 404 { return Smb30Error(message: "Serveren har ikke veiviseren ennå. Oppdater Homelab.", kind: "") }
            if a.status == 403 { return Smb30Error(message: "Bare administrator kan sette opp nettverksdisk.", kind: "") }
            return Smb30Error(message: a.message, kind: Smb30Model.kindOf(a.message))
        }
        return Smb30Error(message: e.localizedDescription, kind: "")
    }

    func scan(_ store: Store) async {
        scanning = true
        error = nil
        defer { scanning = false }
        do {
            let d: Data = try await post("/discover", [:], timeout: 20, store)
            let any: Any? = try? JSONSerialization.jsonObject(with: d)
            let rows: [[String: Any]] = (any as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
            servers = rows.compactMap { o in
                guard let h = JS.str(o, "host") else { return nil }
                return Smb30Server(host: h, ip: JS.str(o, "ip") ?? "", name: JS.str(o, "name") ?? "")
            }
        } catch {
            self.error = fail(error)
        }
    }

    func pick(_ s: Smb30Server) {
        server = s
        error = nil
        probeFail = ""
        shares = []
        go(1)
    }

    func checkManual(force: Bool, _ store: Store) async {
        let v: String = manual.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\\", with: "").replacingOccurrences(of: "smb://", with: "")
        let host: String = v.split(separator: "/").first.map(String.init) ?? ""
        if host.isEmpty {
            error = Smb30Error(message: "Skriv IP-adressen (for eksempel 192.168.1.20) eller navnet på serveren.", kind: "")
            return
        }
        if force { pick(Smb30Server(host: host.lowercased(), ip: "", name: "")); return }
        busy = true
        error = nil
        probeFail = ""
        defer { busy = false }
        do {
            let o: [String: Any] = JS.obj(try await post("/probe", ["host": host], timeout: 15, store))
            if JS.bool(o, "ok") == true {
                pick(Smb30Server(host: JS.str(o, "host") ?? host, ip: JS.str(o, "ip") ?? "", name: ""))
            } else {
                probeFail = JS.str(o, "host") ?? host
                error = Smb30Error(message: JS.str(o, "message") ?? "Fant ikke serveren.", kind: "host")
            }
        } catch {
            self.error = fail(error)
        }
    }

    func login(guest g: Bool, _ store: Store) async {
        guest = g
        if !g && user.trimmingCharacters(in: .whitespaces).isEmpty {
            error = Smb30Error(message: "Skriv brukernavnet, eller trykk «Gjest».", kind: "")
            return
        }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let o: [String: Any] = JS.obj(try await post("/shares", cred(), store))
            shares = JS.list(o, "shares").map { Smb30Share(name: JS.str($0, "name") ?? "", comment: JS.str($0, "comment") ?? "") }.filter { !$0.name.isEmpty }
            proto = JS.str(o, "protocol") == "SMB2" ? "SMB2" : "SMB3"
            Haptics.shared.select()
            go(2)
        } catch {
            self.error = fail(error)
            Haptics.shared.error()
        }
    }

    func choose(_ s: Smb30Share, _ store: Store) {
        share = s.name
        path = []
        dirs = nil
        step = 3
        Task { await openDir([], store) }
    }

    func openDir(_ p: [String], _ store: Store) async {
        busy = true
        error = nil
        showNewDir = false
        defer { busy = false }
        do {
            let d: Data = try await post("/browse", target(p), store)
            let any: Any? = try? JSONSerialization.jsonObject(with: d)
            let rows: [[String: Any]] = (any as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
            dirs = rows.compactMap { JS.str($0, "name") }
            path = p
        } catch {
            self.error = fail(error)
        }
    }

    func makeDir(_ store: Store) async {
        let n: String = newDir.trimmingCharacters(in: .whitespaces)
        if !Smb30Model.validName(n) {
            error = Smb30Error(message: "Ugyldig mappenavn. Bruk bokstaver, tall, mellomrom og . _ - ( ) (ikke / \\ \" ' ; eller ..).", kind: "")
            return
        }
        busy = true
        error = nil
        var body: [String: Any] = target(path)
        body["name"] = n
        do {
            _ = try await post("/mkdir", body, store)
            busy = false
            newDir = ""
            await openDir(path + [n], store)
        } catch {
            busy = false
            self.error = fail(error)
        }
    }

    func runTest(_ store: Store) async {
        testing = true
        test = nil
        error = nil
        defer { testing = false }
        do {
            let o: [String: Any] = JS.obj(try await post("/test", target(path), timeout: 90, store))
            test = Smb30Test(ok: JS.bool(o, "ok") ?? false, writable: JS.bool(o, "writable") ?? false, message: JS.str(o, "message") ?? "")
        } catch {
            let f: Smb30Error = fail(error)
            test = Smb30Test(ok: false, writable: false, message: f.message)
        }
    }

    func save(_ store: Store) async {
        var use: [String] = []
        if useFinans { use.append("finans") }
        if useSystem { use.append("system") }
        if use.isEmpty { error = Smb30Error(message: "Velg hva nettverksdisken skal brukes til.", kind: ""); return }
        busy = true
        error = nil
        defer { busy = false }
        var body: [String: Any] = target(path)
        body["use"] = use
        do {
            let o: [String: Any] = JS.obj(try await post("/save", body, timeout: 60, store))
            doneLabel = JS.str(o, "label") ?? label
            password = ""
            Haptics.shared.success()
            await Backup29Model.shared.load(store)
        } catch {
            self.error = fail(error)
            Haptics.shared.error()
        }
    }

    /* ---------- Navigasjon ---------- */

    func go(_ s: Int) {
        error = nil
        if s == 4 { test = nil }
        step = s
    }

    func back(_ store: Store) {
        if !doneLabel.isEmpty { close(); return }
        if step == 0 { close(); return }
        if step == 3 && !path.isEmpty {
            let up: [String] = Array(path.dropLast())
            Task { await openDir(up, store) }
            return
        }
        if step == 3 { dirs = nil }
        go(step - 1)
    }

    /* ---------- Hjelpere ---------- */

    /// Samme regel som serveren (SMB_SEG): bokstaver, tall, mellomrom og . _ - ( ) + , = @ # ~ !
    nonisolated static func validName(_ n: String) -> Bool {
        if n.isEmpty || n.count > 120 { return false }
        if n.hasPrefix(" ") || n.hasSuffix(" ") { return false }
        if n.allSatisfy({ $0 == "." }) { return false }
        let extra: Set<Character> = [" ", ".", "_", "-", "(", ")", "+", ",", "=", "@", "#", "~", "!"]
        return n.allSatisfy { c in c.isLetter || c.isNumber || extra.contains(c) }
    }

    nonisolated static func kindOf(_ msg: String) -> String {
        let m: String = msg.lowercased()
        if m.contains("brukernavn eller passord") || m.contains("kontoen er låst") { return "auth" }
        if m.contains("smb-versjon") { return "proto" }
        if m.contains("ingen tilgang") || m.contains("skrivetilgang") { return "access" }
        if m.contains("fant ikke serveren") || m.contains("fant ikke smb") { return "host" }
        if m.contains("fant ikke den delte") { return "share" }
        if m.contains("fant ikke mappen") { return "notfound" }
        if m.contains("smbclient") { return "missing" }
        return ""
    }

    nonisolated static func hints(_ kind: String) -> [String] {
        switch kind {
        case "host":
            return ["Sjekk at IP-adressen eller navnet er riktig, og at NAS-en er på.",
                    "Slå på SMB på NAS-en – Synology: Kontrollpanel → Filtjenester → SMB. QNAP: Nettverks- og filtjenester → Win/Mac/NFS.",
                    "NAS-en og Homelab-serveren må være på samme hjemmenett."]
        case "auth":
            return ["Bruk en bruker som finnes på NAS-en.", "Prøv «Gjest» hvis den delte mappen er åpen for alle."]
        case "access":
            return ["Gi brukeren lese- og skrivetilgang til den delte mappen på NAS-en.", "Eller logg inn med en annen bruker."]
        case "proto":
            return ["Slå på SMB3 (eller minst SMB2) på NAS-en. SMB1 støttes ikke."]
        case "share", "notfound":
            return ["Gå tilbake og velg en annen mappe."]
        case "missing":
            return ["Installer smbclient på serveren: apt install smbclient."]
        default:
            return []
        }
    }
}
