import Foundation
import Security

/* ---------------- Prompt 41: delt enhets-token for «Fortsett som» (Homelab → Kalender) ---------------- */
// Denne fila er med i FinansHub (Homelab), Kalender, KalenderWidgets og KalenderMac (SharedKal/Group).
// Homelab-appen kaller KalShared41.save(...) når den er innlogget og KalShared41.clear() ved utlogging.
// Lagring: delt Nøkkelring (service no.kristo.shared.homelab, account device, access group fra Info.plist-nøkkelen
// KalKeychainGroup41 = $(AppIdentifierPrefix)no.kristo.shared – krever Team ID og keychain-access-groups i begge apper),
// og alltid også App Group-nøkkelen hl41.device (group.no.kristo.finanshub, virker ved sideloading).
// Verdi: JSON {token, user, name, bases:[…], exp} der exp er sekunder siden 1970 (0 = ukjent).

/// Enhets-tokenet Homelab deler for «Fortsett som».
struct KalDevice41: Codable {
    var token: String
    var user: String
    var name: String
    var bases: [String]
    /// Utløper (sekunder siden 1970). 0 = ukjent.
    var exp: Double

    var valid: Bool { !token.isEmpty && (exp == 0 || exp > Date().timeIntervalSince1970) }
    var display: String { name.isEmpty ? user : name }
}

enum KalKeychain41 {
    static let service: String = "no.kristo.kalender.auth41"
    /// Delt med Homelab-appen (samme Team ID og keychain-access-groups).
    static let sharedService: String = "no.kristo.shared.homelab"

    /// $(AppIdentifierPrefix)no.kristo.shared fra Info.plist (KalKeychainGroup41). Tom/uutvidet = ikke satt opp.
    static var sharedGroup: String? {
        let v: String = (Bundle.main.object(forInfoDictionaryKey: "KalKeychainGroup41") as? String) ?? ""
        if v.isEmpty || v.contains("$(") || v.hasPrefix(".") { return nil }
        // Uten Team ID blir $(AppIdentifierPrefix) tom: da finnes ingen delt gruppe.
        if !v.contains(".no.kristo.") { return nil }
        return v
    }

    static func read(_ account: String, group: String? = nil, service svc: String = KalKeychain41.service) -> Data? {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: svc,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        if let group { q[kSecAttrAccessGroup as String] = group }
        var out: CFTypeRef? = nil
        let st: OSStatus = SecItemCopyMatching(q as CFDictionary, &out)
        guard st == errSecSuccess, let d = out as? Data else { return nil }
        return d
    }

    @discardableResult
    static func write(_ account: String, _ data: Data, group: String? = nil, service svc: String = KalKeychain41.service) -> Bool {
        var base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: svc,
            kSecAttrAccount as String: account,
        ]
        if let group { base[kSecAttrAccessGroup as String] = group }
        let upd: [String: Any] = [kSecValueData as String: data]
        if SecItemUpdate(base as CFDictionary, upd as CFDictionary) == errSecSuccess { return true }
        var add: [String: Any] = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    static func delete(_ account: String, group: String? = nil, service svc: String = KalKeychain41.service) {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: svc,
            kSecAttrAccount as String: account,
        ]
        if let group { q[kSecAttrAccessGroup as String] = group }
        SecItemDelete(q as CFDictionary)
    }
}

/* ---------- Delt enhets-token (Homelab skriver, Kalender leser) ---------- */

enum KalShared41 {
    /// Leser enhets-tokenet: delt Nøkkelring først, så App Group-en.
    static func device() -> KalDevice41? {
        if let g = KalKeychain41.sharedGroup,
           let d = KalKeychain41.read("device", group: g, service: KalKeychain41.sharedService),
           let v = try? JSONDecoder().decode(KalDevice41.self, from: d), v.valid {
            return v
        }
        if let d = KalGroup.defaults.data(forKey: "hl41.device"),
           let v = try? JSONDecoder().decode(KalDevice41.self, from: d), v.valid {
            return v
        }
        return nil
    }

    /// Kalles av Homelab-appen når den er innlogget (kortlivet token fra serveren).
    static func save(_ d: KalDevice41) {
        guard let data = try? JSONEncoder().encode(d) else { return }
        if let g = KalKeychain41.sharedGroup { KalKeychain41.write("device", data, group: g, service: KalKeychain41.sharedService) }
        KalGroup.defaults.set(data, forKey: "hl41.device")
    }

    /// Kalles av Homelab ved utlogging.
    static func clear() {
        if let g = KalKeychain41.sharedGroup { KalKeychain41.delete("device", group: g, service: KalKeychain41.sharedService) }
        KalGroup.defaults.removeObject(forKey: "hl41.device")
    }
}

