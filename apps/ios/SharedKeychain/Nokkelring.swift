import Foundation
import Security

/* ---------------- Delt Nøkkelring-hjelper (alle mål: Homelab, widgetene, Kalender, Mac og klokka) ---------------- */
// Opprydding H2 (AUDIT §10, C-ios §7 S1–S3). Én liten hjelper for generiske passord (kSecClassGenericPassword):
// - Alltid kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly: widgetene kan lese etter første opplåsing, og verdiene
//   følger ikke med i sikkerhetskopier til en annen enhet.
// - Delt tilgangsgruppe = App Group-identifikatoren (group.no.kristo.finanshub, eller navnet AltStore/SideStore gir den).
//   På iOS er en App Group også en keychain-tilgangsgruppe, så det trengs ingen keychain-access-groups-rettighet (som
//   sideloading ikke kan levere uten Team ID). Avviser systemet gruppen (errSecMissingEntitlement), brukes appens egen
//   Nøkkelring uten gruppe. Aldri UserDefaults.
// Bare Foundation og Security: virker i app-utvidelser og på watchOS/macOS.

enum Nokkelring {
    /// Tjenesten for tokenene som før lå i klartekst i App Group-UserDefaults (w.token, kal.token, kal.hl.token, hl41.device).
    static let groupService: String = "no.kristo.shared.group"

    /// Tilgangen alle elementer skrives med.
    static let accessible: CFString = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

    /// Gruppen står ikke i rettighetene (f.eks. sideloading uten App Group).
    static let missingEntitlement: OSStatus = -34018

    private static func query(_ account: String, service: String, group: String?) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let group, !group.isEmpty { q[kSecAttrAccessGroup as String] = group }
        return q
    }

    private static func readOne(_ account: String, service: String, group: String?) -> Data? {
        var q: [String: Any] = query(account, service: service, group: group)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef? = nil
        let st: OSStatus = SecItemCopyMatching(q as CFDictionary, &out)
        guard st == errSecSuccess, let d = out as? Data else { return nil }
        return d
    }

    /// Oppdaterer (verdi og tilgang) eller legger til. Godtar systemet ikke endringen, slettes elementet og skrives på nytt.
    private static func writeOne(_ account: String, _ data: Data, service: String, group: String?) -> OSStatus {
        let q: [String: Any] = query(account, service: service, group: group)
        #if os(macOS)
        // Mac (fil-basert nøkkelring, ad hoc-signert): bare verdien oppdateres, som før. Sletting av et element appen ikke
        // lenger er betrodd for, gir en nøkkelring-dialog. Tilgangen skrives på nytt i MacSession (les → slett → skriv).
        let upd: [String: Any] = [kSecValueData as String: data]
        let st: OSStatus = SecItemUpdate(q as CFDictionary, upd as CFDictionary)
        if st != errSecItemNotFound { return st }
        #else
        let upd: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: accessible]
        let st: OSStatus = SecItemUpdate(q as CFDictionary, upd as CFDictionary)
        if st == errSecSuccess { return st }
        if st == errSecInteractionNotAllowed || st == missingEntitlement { return st }
        if st != errSecItemNotFound { SecItemDelete(q as CFDictionary) }
        #endif
        var add: [String: Any] = q
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = accessible
        return SecItemAdd(add as CFDictionary, nil)
    }

    /// Leser fra gruppen først, så fra appens egen Nøkkelring (reserven når gruppen ikke var tilgjengelig ved skriving).
    static func read(_ account: String, service: String, group: String? = nil) -> Data? {
        if let group, !group.isEmpty, let d = readOne(account, service: service, group: group) { return d }
        return readOne(account, service: service, group: nil)
    }

    /// Skriver til gruppen; avviser systemet gruppen, til appens egen Nøkkelring. Aldri UserDefaults.
    @discardableResult
    static func write(_ account: String, _ data: Data, service: String, group: String? = nil) -> Bool {
        if let group, !group.isEmpty {
            let st: OSStatus = writeOne(account, data, service: service, group: group)
            if st == errSecSuccess { return true }
            // Låst før første opplåsing: prøv igjen senere i stedet for å legge verdien et annet sted.
            if st == errSecInteractionNotAllowed { return false }
        }
        return writeOne(account, data, service: service, group: nil) == errSecSuccess
    }

    /// Sletter i gruppen og i appens egen Nøkkelring.
    static func delete(_ account: String, service: String, group: String? = nil) {
        if let group, !group.isEmpty { SecItemDelete(query(account, service: service, group: group) as CFDictionary) }
        SecItemDelete(query(account, service: service, group: nil) as CFDictionary)
    }

    static func readString(_ account: String, service: String, group: String? = nil) -> String? {
        guard let d = read(account, service: service, group: group), let s = String(data: d, encoding: .utf8) else { return nil }
        return s.isEmpty ? nil : s
    }

    /// nil eller tom streng sletter.
    @discardableResult
    static func writeString(_ account: String, _ value: String?, service: String, group: String? = nil) -> Bool {
        guard let value, !value.isEmpty else {
            delete(account, service: service, group: group)
            return true
        }
        return write(account, Data(value.utf8), service: service, group: group)
    }

    /* ---------- Migrering ---------- */

    /// S3: les → slett → skriv på nytt med `accessible` (ett element). false = fantes ikke eller kunne ikke skrives.
    @discardableResult
    static func rewrite(_ account: String, service: String, group: String? = nil) -> Bool {
        guard let data = readOne(account, service: service, group: group) else { return false }
        let base: [String: Any] = query(account, service: service, group: group)
        SecItemDelete(base as CFDictionary)
        var add: [String: Any] = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = accessible
        if SecItemAdd(add as CFDictionary, nil) == errSecSuccess { return true }
        // Gjenopprett verdien heller enn å miste den.
        add.removeValue(forKey: kSecAttrAccessible as String)
        SecItemAdd(add as CFDictionary, nil)
        return false
    }

    /// Flytter en gammel verdi fra UserDefaults (App Group) til Nøkkelringen og sletter den fra UserDefaults når skrivingen
    /// lyktes. En verdi i UserDefaults er alltid den nyeste (ny kode skriver aldri dit), så den overskriver Nøkkelringen.
    /// false = skrivingen feilet (f.eks. låst før første opplåsing); verdien blir liggende til neste forsøk.
    @discardableResult
    static func migrate(defaultsKey: String, from d: UserDefaults, service: String, group: String?) -> Bool {
        guard let old = d.object(forKey: defaultsKey) else { return true }
        var data: Data? = nil
        if let s = old as? String, !s.isEmpty { data = Data(s.utf8) }
        if let b = old as? Data, !b.isEmpty { data = b }
        guard let v = data else {
            d.removeObject(forKey: defaultsKey)
            return true
        }
        if !write(defaultsKey, v, service: service, group: group) { return false }
        d.removeObject(forKey: defaultsKey)
        return true
    }

    /// S3: elementer skrevet med en annen tilgang (kSecAttrAccessibleAfterFirstUnlock uten ThisDeviceOnly) leses, slettes
    /// og skrives på nytt med `accessible`. Kjøres én gang per tjeneste (merket i appens egne UserDefaults – ingen hemmelighet).
    static func migrateAccessible(service: String) {
        let flag: String = "nokkelring.tdo." + service
        if UserDefaults.standard.bool(forKey: flag) { return }
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll,
        ]
        var out: CFTypeRef? = nil
        let st: OSStatus = SecItemCopyMatching(q as CFDictionary, &out)
        if st == errSecItemNotFound {
            UserDefaults.standard.set(true, forKey: flag)
            return
        }
        guard st == errSecSuccess, let items = out as? [[String: Any]] else { return }
        var ok: Bool = true
        for item in items {
            guard let account = item[kSecAttrAccount as String] as? String else { continue }
            let cur: String = (item[kSecAttrAccessible as String] as? String) ?? ""
            if cur == (accessible as String) { continue }
            let group: String? = item[kSecAttrAccessGroup as String] as? String
            guard let data = readOne(account, service: service, group: group) else { ok = false; continue }
            let base: [String: Any] = query(account, service: service, group: group)
            SecItemDelete(base as CFDictionary)
            var add: [String: Any] = base
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = accessible
            if SecItemAdd(add as CFDictionary, nil) != errSecSuccess {
                // Gjenopprett verdien (med den gamle tilgangen) heller enn å miste den.
                if cur.isEmpty {
                    add.removeValue(forKey: kSecAttrAccessible as String)
                } else {
                    add[kSecAttrAccessible as String] = cur as CFString
                }
                SecItemAdd(add as CFDictionary, nil)
                ok = false
            }
        }
        if ok { UserDefaults.standard.set(true, forKey: flag) }
    }
}
