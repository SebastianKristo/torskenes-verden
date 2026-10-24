import Foundation
import Security

/* ---------------- Prompt 51 (SEC51/QA51): faste enhetsnøkler ---------------- */
// • X-Device-Key: tilfeldig nøkkel (32 byte, base64url) som serveren husker (som hash) når enheten er godkjent.
//   Sendes på alle kall til egen server (API.send), så innlogging/token og Innstillinger → Sikkerhet kjenner igjen enheten.
// • X-Device-Id: installasjons-id for feature flags (GET /api/flags). Aldri en sikkerhetsfaktor.
// Begge ligger i nøkkelringen med «denne enheten» (følger ikke med i sikkerhetskopi til en annen telefon).

enum Device51 {
    /// 16–128 tegn [A-Za-z0-9_-] (serverens KEY_RE). Lages én gang.
    nonisolated static let key: String = Device51.loadOrCreate("sec51_device_key") { Device51.randomKey() }
    /// 8–64 tegn [A-Za-z0-9_-].
    nonisolated static let installId: String = Device51.loadOrCreate("qa51_device_id") {
        "ios" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }

    nonisolated private static func loadOrCreate(_ name: String, _ make: () -> String) -> String {
        if let v = Keychain.get(name), valid(v) { return v }
        let v: String = make()
        Keychain.set(name, v)
        return v
    }

    nonisolated private static func valid(_ s: String) -> Bool {
        guard s.count >= 8 && s.count <= 128 else { return false }
        return s.unicodeScalars.allSatisfy { (c: Unicode.Scalar) -> Bool in
            CharacterSet.alphanumerics.contains(c) && c.isASCII || c == "-" || c == "_"
        }
    }

    nonisolated private static func randomKey() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
            return "k" + UUID().uuidString.replacingOccurrences(of: "-", with: "") + UUID().uuidString.replacingOccurrences(of: "-", with: "")
        }
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// Maskinvare-id (f.eks. «iPhone15,2») – ikke enhetens navn, som ofte inneholder brukerens navn.
    nonisolated static var machine: String {
        var u = utsname()
        uname(&u)
        let s: String = withUnsafeBytes(of: &u.machine) { (raw: UnsafeRawBufferPointer) -> String in
            String(decoding: raw.prefix(while: { $0 != 0 }), as: UTF8.self)
        }
        return s.isEmpty ? "iPhone" : s
    }

    nonisolated static var osVersion: String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "iOS \(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }

    nonisolated static var release: String {
        let v: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let b: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        return "finanshub-ios@\(v)+\(b)"
    }
}

/// 403 {code:'DEVICE_APPROVAL_REQUIRED', approvalId, pollKey, statusUrl, finishUrl, expiresAt, device} fra innloggingen.
/// pollKey vises aldri – den sendes bare som X-Approval-Key til statusUrl/finishUrl.
struct DeviceApproval51 {
    let id: String
    let pollKey: String
    let statusUrl: String
    let finishUrl: String
    let device: String
    let expires: Date?

    nonisolated static func parse(_ o: [String: Any]?) -> DeviceApproval51? {
        guard let o, let id = JS.str(o, "approvalId"), let key = JS.str(o, "pollKey") else { return nil }
        let status: String = JS.str(o, "statusUrl") ?? "/api/security51/approvals/\(id)/status"
        let finish: String = JS.str(o, "finishUrl") ?? "/api/security51/approvals/\(id)/finish"
        // Bare relative stier på samme server (aldri en annen vert fra svaret).
        guard status.hasPrefix("/"), finish.hasPrefix("/"), !status.hasPrefix("//"), !finish.hasPrefix("//") else { return nil }
        return DeviceApproval51(id: id, pollKey: key, statusUrl: status, finishUrl: finish, device: JS.str(o, "device") ?? "",
                                expires: Sec51Fmt.date(JS.str(o, "expiresAt")))
    }
}

enum Sec51Fmt {
    nonisolated static func date(_ s: String?) -> Date? {
        guard let s, !s.isEmpty else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }

    nonisolated static func time(_ d: Date?) -> String {
        guard let d else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = Calendar.current.isDateInToday(d) ? "HH:mm" : "d. MMM HH:mm"
        return f.string(from: d)
    }
}
