import Foundation
import Security

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
enum MacSession {
    // Leses fra bakgrunnstråder (KalNet.send via sessionProvider) og skrives på hovedtråden: lås rundt bufferen,
    // ellers datakappløp på String-en (sporadisk EXC_BAD_ACCESS).
    private static let lock: NSLock = NSLock()
    private static var cachedToken: String? = nil
    private static var loaded: Bool = false

    static var token: String? {
        lock.lock()
        defer { lock.unlock() }
        if !loaded {
            cachedToken = MacKeychain.read("token")
            loaded = true
        }
        let t: String = cachedToken ?? ""
        return t.isEmpty ? nil : t
    }

    static var bases: [String] { UserDefaults.standard.stringArray(forKey: "mac.bases") ?? [] }
    static var user: String { UserDefaults.standard.string(forKey: "mac.user") ?? "" }

    static func install() {
        KalNet.sessionProvider = { () -> ([String], String?) in (MacSession.bases, MacSession.token) }
    }

    static func save(bases: [String], token: String, user: String) {
        MacKeychain.write("token", token)
        lock.lock()
        cachedToken = token
        loaded = true
        lock.unlock()
        UserDefaults.standard.set(bases, forKey: "mac.bases")
        UserDefaults.standard.set(user, forKey: "mac.user")
    }

    static func clear() {
        MacKeychain.delete("token")
        lock.lock()
        cachedToken = nil
        loaded = true
        lock.unlock()
        UserDefaults.standard.removeObject(forKey: "mac.bases")
        UserDefaults.standard.removeObject(forKey: "mac.user")
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

    static func deviceName() -> String {
        let host: String = Host.current().localizedName ?? "Mac"
        return "Kalender (" + host + ")"
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
