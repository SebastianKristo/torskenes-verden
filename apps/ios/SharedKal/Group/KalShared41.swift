import Foundation
import Security

/* ---------------- Prompt 41: delt enhets-token for «Fortsett som» (Homelab → Kalender) ---------------- */
// Denne fila er med i FinansHub (Homelab), Kalender, KalenderWidgets og KalenderMac (SharedKal/Group).
// Homelab-appen kaller KalShared41.save(...) når den er innlogget og KalShared41.clear() ved utlogging.
// Lagring: delt Nøkkelring (service no.kristo.shared.homelab, account device, access group fra Info.plist-nøkkelen
// KalKeychainGroup41 = $(AppIdentifierPrefix)no.kristo.shared – krever Team ID og keychain-access-groups i begge apper),
// og alltid også hl41.device i Nøkkelringen med App Group-en som tilgangsgruppe (KalGroup.setSecretData, virker ved sideloading).
// Opprydding H2: hl41.device lå før i klartekst i App Group-UserDefaults; den flyttes ved oppstart (KalGroup.migrateSecrets).
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

    // Opprydding H2: bare en tynn innpakning rundt den delte hjelperen (SharedKeychain/Nokkelring.swift), som alltid skriver
    // med kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly. Eldre elementer skrives på nytt av KalGroup.migrateSecrets().
    static func read(_ account: String, group: String? = nil, service svc: String = KalKeychain41.service) -> Data? {
        Nokkelring.read(account, service: svc, group: group)
    }

    @discardableResult
    static func write(_ account: String, _ data: Data, group: String? = nil, service svc: String = KalKeychain41.service) -> Bool {
        Nokkelring.write(account, data, service: svc, group: group)
    }

    static func delete(_ account: String, group: String? = nil, service svc: String = KalKeychain41.service) {
        Nokkelring.delete(account, service: svc, group: group)
    }
}

/* ---------- Delt enhets-token (Homelab skriver, Kalender leser) ---------- */

enum KalShared41 {
    #if os(macOS)
    /// Prompt 43: på Mac leses den delte Nøkkelringen bare i bakgrunnen (preload43) – en nøkkelring-dialog på hovedtråden
    /// låser appen. Hovedtråden bruker det som ble lest.
    private static let macLock: NSLock = NSLock()
    private static var macCache: Data? = nil

    /// Leser den delte Nøkkelringen utenfor hovedtråden og husker svaret.
    static func preload43() async {
        guard let g = KalKeychain41.sharedGroup else { return }
        let d: Data? = await Task.detached(priority: .utility) { () -> Data? in
            KalKeychain41.read("device", group: g, service: KalKeychain41.sharedService)
        }.value
        macLock.lock()
        macCache = d
        macLock.unlock()
    }
    #else
    static func preload43() async {}
    #endif

    private static func sharedKeychainData() -> Data? {
        guard let g = KalKeychain41.sharedGroup else { return nil }
        #if os(macOS)
        if Thread.isMainThread {
            macLock.lock()
            defer { macLock.unlock() }
            return macCache
        }
        #endif
        return KalKeychain41.read("device", group: g, service: KalKeychain41.sharedService)
    }

    /// Leser enhets-tokenet: delt Nøkkelring først, så App Group-en.
    static func device() -> KalDevice41? {
        if let d = sharedKeychainData(),
           let v = try? JSONDecoder().decode(KalDevice41.self, from: d), v.valid {
            return v
        }
        if let d = KalGroup.secretData("hl41.device"),
           let v = try? JSONDecoder().decode(KalDevice41.self, from: d), v.valid {
            return v
        }
        return nil
    }

    /// Kalles av Homelab-appen når den er innlogget (kortlivet token fra serveren).
    static func save(_ d: KalDevice41) {
        guard let data = try? JSONEncoder().encode(d) else { return }
        if let g = KalKeychain41.sharedGroup { KalKeychain41.write("device", data, group: g, service: KalKeychain41.sharedService) }
        KalGroup.setSecretData("hl41.device", data)
    }

    /// Kalles av Homelab ved utlogging.
    static func clear() {
        if let g = KalKeychain41.sharedGroup { KalKeychain41.delete("device", group: g, service: KalKeychain41.sharedService) }
        KalGroup.setSecretData("hl41.device", nil)
    }
}

