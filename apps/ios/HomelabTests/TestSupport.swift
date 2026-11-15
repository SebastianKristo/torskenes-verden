import Foundation
import XCTest

/* ---------------- Felles for HomelabTests ---------------- */
// Testene leser fasiten rett fra repoet (shared/testvektorer, shared/schemas/eksempler) via #filePath, så det finnes bare én
// kopi. Simulatoren leser filer på maskinen som kjører testene.

enum Repo {
    /// Rotmappa i repoet (apps/ios/HomelabTests/TestSupport.swift → ../../..).
    static let root: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()

    static func url(_ relative: String) -> URL { root.appendingPathComponent(relative) }

    static func data(_ relative: String) throws -> Data { try Data(contentsOf: url(relative)) }

    /// Vektorene i shared/testvektorer/<navn>.json.
    static func vectors(_ name: String) throws -> [[String: Any]] {
        let d: Data = try data("shared/testvektorer/" + name + ".json")
        let o: [String: Any] = (try JSONSerialization.jsonObject(with: d) as? [String: Any]) ?? [:]
        return (o["vektorer"] as? [[String: Any]]) ?? []
    }
}

enum TestClock {
    /// Testene regner i Oslo-tid (Q20) uansett tidssone på maskinen. Kalles før noe leser Calendar.current.
    static func useOslo() {
        if let tz = TimeZone(identifier: "Europe/Oslo") { NSTimeZone.default = tz }
    }

    /// «2026-11-16T10:00:00+01:00» → Date.
    static func date(_ iso: String) -> Date? {
        let f: ISO8601DateFormatter = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: iso) { return d }
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: iso)
    }
}
