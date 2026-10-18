import Foundation
import AppIntents

/* ---------------- Delt mellom appen og widgetene (App Group) ---------------- */

/// App Group som appen og widget-utvidelsen deler. Appen skriver serveradressen og app-tokenet hit,
/// og widgetene henter GET /api/mobile/widgets med dem.
enum WidgetShared {
    static let group = "group.no.kristo.finanshub"
    static let kind = "no.kristo.finanshub"

    static var defaults: UserDefaults { UserDefaults(suiteName: group) ?? .standard }

    /// Adressene i rekkefølgen widgeten prøver dem: hovedadressen, ekstern og lokal.
    static func save(server: String, external: String, local: String, token: String?) {
        let d = defaults
        d.set(server, forKey: "w.server")
        d.set(external, forKey: "w.external")
        d.set(local, forKey: "w.local")
        d.set(token, forKey: "w.token")
    }

    static func clear() {
        let d = defaults
        for k in ["w.server", "w.external", "w.local", "w.token", "w.cache"] { d.removeObject(forKey: k) }
    }

    static var token: String? { defaults.string(forKey: "w.token") }

    static var bases: [String] {
        let d = defaults
        var out: [String] = []
        for k in ["w.server", "w.external", "w.local"] {
            if let v = d.string(forKey: k), !v.isEmpty, !out.contains(v) { out.append(v) }
        }
        return out
    }

    /// Siste svar, så widgeten har noe å vise når serveren ikke svarer.
    static var cache: Data? {
        get { defaults.data(forKey: "w.cache") }
        set { defaults.set(newValue, forKey: "w.cache") }
    }

    /// Skann fra widgeten: «camera» eller «files». Appen leser og tømmer den når den blir aktiv.
    static var pendingScan: String? {
        get { defaults.string(forKey: "w.scan") }
        set { defaults.set(newValue, forKey: "w.scan") }
    }

    static let scanNotification = Notification.Name("FinansHubPendingScan")
}

/// «Skann → Kamera» fra widgeten: åpner appen rett i kameraet.
struct ScanCameraIntent: AppIntent {
    static var title: LocalizedStringResource = "Skann kvittering med kamera"
    static var description = IntentDescription("Åpner FinansHub i kameraet for å ta bilde av en kvittering.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        WidgetShared.pendingScan = "camera"
        NotificationCenter.default.post(name: WidgetShared.scanNotification, object: nil)
        return .result()
    }
}

/// «Skann → Filer» fra widgeten: åpner appen i filvelgeren.
struct ScanFilesIntent: AppIntent {
    static var title: LocalizedStringResource = "Last opp kvittering fra Filer"
    static var description = IntentDescription("Åpner FinansHub i filvelgeren for PDF og bilder.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        WidgetShared.pendingScan = "files"
        NotificationCenter.default.post(name: WidgetShared.scanNotification, object: nil)
        return .result()
    }
}
