import Foundation
import AppIntents

/* ---------------- Delt mellom appen og widgetene (App Group) ---------------- */

/// App Group som appen og widget-utvidelsen deler. Appen skriver serveradressen og app-tokenet hit,
/// og widgetene henter GET /api/mobile/widgets med dem.
enum WidgetShared {
    static let baseGroup = "group.no.kristo.finanshub"
    static let kind = "no.kristo.finanshub"

    /// Gruppen som faktisk virker på denne installasjonen. AltStore og SideStore gir gruppen nytt navn
    /// (f.eks. group.no.kristo.finanshub.TEAMID) og skriver det i Info.plist som «ALTAppGroups».
    /// Sideloadly og egen signering kan også endre bundle-ID-en. Vi prøver alle kandidatene og velger
    /// den første som systemet faktisk gir oss en delt mappe for.
    static let group: String? = resolveGroup()

    /// true når appen og widgetene deler lagring. Uten det kan widgetene ikke se innloggingen.
    static var linked: Bool { group != nil }

    static var defaults: UserDefaults {
        if let g = group, let d = UserDefaults(suiteName: g) { return d }
        return .standard
    }

    private static func resolveGroup() -> String? {
        var cands: [String] = []
        func add(_ v: String?) { if let v, !v.isEmpty, !cands.contains(v) { cands.append(v) } }
        // Appen selv, og appen som eier utvidelsen (…/FinansHub.app/PlugIns/X.appex → FinansHub.app).
        var bundles: [Bundle] = [Bundle.main]
        let url = Bundle.main.bundleURL
        if url.pathExtension == "appex", let parent = Bundle(url: url.deletingLastPathComponent().deletingLastPathComponent()) {
            bundles.append(parent)
        }
        for b in bundles {
            for g in (b.object(forInfoDictionaryKey: "ALTAppGroups") as? [String]) ?? [] { add(g) }
        }
        add(baseGroup)
        for b in bundles {
            if var id = b.bundleIdentifier {
                if id.hasSuffix(".widgets") { id = String(id.dropLast(".widgets".count)) }
                add("group." + id)
            }
        }
        let fm = FileManager.default
        for g in cands where fm.containerURL(forSecurityApplicationGroupIdentifier: g) != nil { return g }
        return nil
    }

    /// Adressene i rekkefølgen widgeten prøver dem: hovedadressen, ekstern og lokal.
    static func save(server: String, external: String, local: String, token: String?) {
        let d = defaults
        // Prompt 21: ny konto (eller ny innlogging) → tøm svarene fra forrige konto, så widgeten aldri viser
        // en annen brukers data mens den venter på første henting.
        let old: String? = d.string(forKey: "w.token")
        if old != token { clearCaches() }
        d.set(server, forKey: "w.server")
        d.set(external, forKey: "w.external")
        d.set(local, forKey: "w.local")
        d.set(token, forKey: "w.token")
    }

    static func clear() {
        let d = defaults
        for k in ["w.server", "w.external", "w.local", "w.token"] { d.removeObject(forKey: k) }
        clearCaches()
    }

    /// Bufrede svar for alle widgetene (finans, huskeliste og familie).
    static func clearCaches() {
        let d = defaults
        for k in ["w.cache", "w.tasks", "w.family", "w.birthdays", "w.calendar"] { d.removeObject(forKey: k) }
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
