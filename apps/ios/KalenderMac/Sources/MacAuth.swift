import Foundation
import Security
import os

/// Prompt 43: logglinjer for feilsøking av frysing: `log stream --level debug --predicate 'subsystem BEGINSWITH "no.kristo.kalender"'`.
enum MacLog43 {
    static let app: Logger = Logger(subsystem: "no.kristo.kalender.mac", category: "app")
}

/* ---------------- Prompt 34: Kalender for Mac – innlogging (Nøkkelringen) ---------------- */
// Tokenet ligger i Nøkkelringen (kGenSecClassGenericPassword, service no.kristo.kalender.mac), adressene og navnet i UserDefaults.
// KalNet.sessionProvider peker hit, så alle kall i SharedKal bruker Mac-innloggingen.

enum MacKeychain {
    static let service: String = "no.kristo.kalender.mac"

    static func read(_ account: String) -> String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef? = nil
        let st: OSStatus = SecItemCopyMatching(q as CFDictionary, &out)
        guard st == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    @discardableResult
    static func write(_ account: String, _ value: String) -> Bool {
        let data: Data = Data(value.utf8)
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let upd: [String: Any] = [kSecValueData as String: data]
        let st: OSStatus = SecItemUpdate(base as CFDictionary, upd as CFDictionary)
        if st == errSecSuccess { return true }
        var add: [String: Any] = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    static func delete(_ account: String) {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(q as CFDictionary)
    }
}

/// Mac-innloggingen: token i Nøkkelringen, adresser og navn i UserDefaults.
///
/// Prompt 43 (Mac fryser ved oppstart): `token` leste Nøkkelringen synkront første gang den ble brukt – og første bruk var
/// på hovedtråden (MacStore.shared → `loggedIn`, menylinje-etiketten). Appen er ad hoc-signert, så hver ny versjon har en ny
/// signatur, og macOS spør da «Kalender vil bruke konfidensiell informasjon i nøkkelringen». Dialogen havner ofte bak
/// vinduet, og `SecItemCopyMatching` venter på svaret: hovedtråden står, appen fryser. `save` (også fra syncServers ved
/// hver aktivering) skrev Nøkkelringen på hovedtråden med samme effekt, og låsen rundt lesingen holdt hovedtråden fast mens
/// en bakgrunnstråd ventet på dialogen.
/// Nå: hovedtråden leser bare bufferen (aldri Nøkkelringen). Lesing skjer i bakgrunnen (`load()` ved oppstart, eller
/// `tokenBlocking()` fra nettkall som allerede går utenfor hovedtråden). Skriving/sletting går i en egen seriell kø.
enum MacSession {
    // Leses fra bakgrunnstråder (KalNet.send via sessionProvider) og skrives på hovedtråden: lås rundt bufferen,
    // ellers datakappløp på String-en (sporadisk EXC_BAD_ACCESS). Låsen holdes bare et øyeblikk – aldri mens Nøkkelringen svarer.
    private static let lock: NSLock = NSLock()
    /// Serialiserer selve Nøkkelring-lesingen (bare bakgrunnstråder venter på den).
    private static let loadLock: NSLock = NSLock()
    /// Skriving og sletting i Nøkkelringen, i rekkefølge, utenfor hovedtråden.
    private static let keychainQueue: DispatchQueue = DispatchQueue(label: "no.kristo.kalender.mac.keychain43", qos: .utility)
    private static var cachedToken: String? = nil
    private static var loaded: Bool = false

    /// Bufferen. Trygg på hovedtråden: rører aldri Nøkkelringen. nil til `load()` er ferdig (eller ikke innlogget).
    static var token: String? {
        lock.lock()
        defer { lock.unlock() }
        let t: String = cachedToken ?? ""
        return t.isEmpty ? nil : t
    }

    /// Er Nøkkelringen lest (eller tokenet satt av innloggingen)?
    static var isLoaded: Bool {
        lock.lock()
        defer { lock.unlock() }
        return loaded
    }

    /// Prompt 43: «har en lagret innlogging» uten å røre Nøkkelringen (adressene lagres sammen med tokenet og slettes ved utlogging).
    static var hasLogin: Bool { !bases.isEmpty }

    static var bases: [String] { UserDefaults.standard.stringArray(forKey: "mac.bases") ?? [] }
    static var user: String { UserDefaults.standard.string(forKey: "mac.user") ?? "" }

    /// Leser Nøkkelringen på denne tråden hvis det ikke er gjort ennå. På hovedtråden: bare bufferen.
    static func tokenBlocking() -> String? {
        if Thread.isMainThread { return token }
        loadLock.lock()
        defer { loadLock.unlock() }
        if isLoaded { return token }
        // Prompt 44: kopien i appens sandkasse først (ingen nøkkelring-dialog etter en oppdatering), så Nøkkelringen.
        var t: String? = MacTokenFile44.read()
        if t == nil {
            t = MacKeychain.read("token")
            if let k = t { MacTokenFile44.write(k) }
        }
        lock.lock()
        if !loaded {
            cachedToken = t
            loaded = true
        }
        lock.unlock()
        return token
    }

    /// Leser tokenet i bakgrunnen (oppstart). Hovedtråden er fri mens en eventuell nøkkelring-dialog venter på svar.
    static func load() async -> String? {
        if isLoaded { return token }
        MacLog43.app.debug("Nøkkelring: leser tokenet i bakgrunnen")
        let t: String? = await Task.detached(priority: .userInitiated) { () -> String? in MacSession.tokenBlocking() }.value
        MacLog43.app.debug("Nøkkelring: ferdig (\(t == nil ? "tomt" : "funnet", privacy: .public))")
        return t
    }

    static func install() {
        KalNet.sessionProvider = { () -> ([String], String?) in (MacSession.bases, MacSession.tokenBlocking()) }
        // Prompt 44: nytt token fra fornyelsen (KalAuthGate44) lagres her (adressen som virket først).
        KalAuthGate44.saver = { (n: KalSession41) -> Void in
            var b: [String] = [n.base]
            for x in MacSession.bases where !b.contains(x) { b.append(x) }
            MacSession.save(bases: b, token: n.token, user: n.user.isEmpty ? MacSession.user : n.user)
        }
    }

    static func save(bases: [String], token: String, user: String) {
        lock.lock()
        cachedToken = token
        loaded = true
        lock.unlock()
        UserDefaults.standard.set(bases, forKey: "mac.bases")
        UserDefaults.standard.set(user, forKey: "mac.user")
        keychainQueue.async {
            MacKeychain.write("token", token)
            MacTokenFile44.write(token)
        }
    }

    /// Prompt 43: bare adressene (lokal/ekstern fra Homelab) – tokenet skrives ikke på nytt.
    static func saveBases(_ bases: [String]) {
        if bases.isEmpty { return }
        UserDefaults.standard.set(bases, forKey: "mac.bases")
    }

    static func clear() {
        lock.lock()
        cachedToken = nil
        loaded = true
        lock.unlock()
        UserDefaults.standard.removeObject(forKey: "mac.bases")
        UserDefaults.standard.removeObject(forKey: "mac.user")
        keychainQueue.async {
            MacKeychain.delete("token")
            MacTokenFile44.clear()
        }
    }
}

/// Prompt 44: «jeg blir logget ut» på Mac – årsak: appen er ad hoc-signert, så hver oppdatering (MacUpdater43) har en ny
/// signatur. Nøkkelringen spør da på nytt («Kalender vil bruke konfidensiell informasjon …»), og avvises/lukkes dialogen
/// gir lesingen nil → «Logg inn på nytt». Kopien av tokenet ligger nå også i appens egen sandkasse-mappe
/// (~/Library/Containers/no.kristo.kalender.mac/…/Application Support/Kalender/session44, tilgang 0600), som overlever
/// oppdateringer. Bare app-tokenet (kan trekkes tilbake under Innstillinger → Enheter), aldri passordet.
enum MacTokenFile44 {
    private static var url: URL? {
        guard let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let d: URL = dir.appendingPathComponent("Kalender", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        return d.appendingPathComponent("session44")
    }

    static func read() -> String? {
        guard let u = url, let d = try? Data(contentsOf: u), let s = String(data: d, encoding: .utf8) else { return nil }
        let t: String = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    static func write(_ token: String) {
        guard let u = url else { return }
        try? Data(token.utf8).write(to: u, options: [.atomic])
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: u.path)
    }

    static func clear() {
        guard let u = url else { return }
        try? FileManager.default.removeItem(at: u)
    }
}

enum MacAuth {
    static func isLocal(_ host: String) -> Bool {
        let p: [Int] = host.split(separator: ".").compactMap { (x: Substring) -> Int? in Int(x) }
        if host == "localhost" || host.hasSuffix(".local") || host.hasSuffix(".lan") || host.hasSuffix(".home.arpa") || !host.contains(".") { return true }
        if p.count != 4 { return false }
        if p[0] == 10 || p[0] == 127 { return true }
        if p[0] == 192 && p[1] == 168 { return true }
        if p[0] == 172 && p[1] >= 16 && p[1] <= 31 { return true }
        return p[0] == 100 && p[1] >= 64 && p[1] <= 127
    }

    /// http:// for lokale adresser, https:// ellers. Fjerner sti og skråstrek.
    static func normalize(_ raw: String) -> String {
        var s: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        let start: String.Index = s.range(of: "://")?.upperBound ?? s.startIndex
        if let slash = s[start...].firstIndex(of: "/") { s = String(s[..<slash]) }
        let lower: String = s.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") || s.isEmpty { return s }
        let hostPort: String = String(lower.split(separator: "/").first ?? "")
        let host: String = String(hostPort.split(separator: ":").first ?? "")
        return (isLocal(host) ? "http://" : "https://") + s
    }

    struct Result {
        let token: String
        let user: String
    }

    struct Failure: Error {
        let message: String
        let needsCode: Bool
    }

    /// Prompt 44: eget, stabilt navn per installasjon (Host.current() kunne blokkere hovedtråden med navneoppslag).
    static func deviceName() -> String {
        "Kalender (" + KalDev44.name + ")"
    }

    /// POST /finans/api/login {username, password, code?, device} → {token, user} (samme flyt som Homelab-appene).
    static func login(base: String, username: String, password: String, code: String) async throws -> Result {
        let dev: String = deviceName()
        var body: [String: Any] = ["password": password, "device": dev, "deviceName": dev]
        let u: String = username.trimmingCharacters(in: .whitespaces)
        if !u.isEmpty { body["username"] = u }
        let c: String = code.trimmingCharacters(in: .whitespaces)
        if !c.isEmpty { body["code"] = c }
        let data: Data
        do {
            data = try await KalNet.send("POST", "/finans/api/login", json: body, timeout: 20, bases: [base], token: nil)
        } catch let e as KalNetError {
            if e.status == 404 {
                do {
                    data = try await KalNet.send("POST", "/finans/api/auth/token", json: body, timeout: 20, bases: [base], token: nil)
                } catch let e2 as KalNetError {
                    let msg: String = e2.status == 404 ? "Fant ikke Homelab på " + base + " (404)." : e2.message
                    throw Failure(message: msg, needsCode: false)
                }
            } else {
                let needs: Bool = e.needsTotp || e.message.lowercased().contains("kode")
                throw Failure(message: e.message, needsCode: needs)
            }
        }
        let obj: [String: Any] = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
        if (obj["needsTotp"] as? Bool) == true { throw Failure(message: "Skriv inn koden fra autentiseringsappen.", needsCode: true) }
        guard let token = obj["token"] as? String else { throw Failure(message: "Uventet svar fra serveren", needsCode: false) }
        let user: [String: Any] = (obj["user"] as? [String: Any]) ?? [:]
        let name: String = (user["name"] as? String) ?? (user["username"] as? String) ?? u
        return Result(token: token, user: name)
    }
}
