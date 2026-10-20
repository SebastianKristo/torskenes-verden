import Foundation

/* ---------------- Prompt 33: Kalender-appen ↔ Homelab-appen ↔ widgetene (App Group) ---------------- */
// Denne fila er med i tre targets: FinansHub (Homelab-appen), Kalender og KalenderWidgets.
// Den bruker bare Foundation (ingen UIApplication), så den virker også i widget-utvidelsen.
//
// Nøkler i App Group-en group.no.kristo.finanshub:
//   kal.hl.server / kal.hl.bases / kal.hl.token / kal.hl.user / kal.hl.for / kal.hl.at
//       Skrevet av Homelab-appen: et eget app-token for Kalender (POST /api/tokens/companion {app:'kalender'}).
//       kal.hl.for = fingeravtrykk av Homelab-kontoens token, så Homelab vet når det må lages nytt.
//   kal.server / kal.bases / kal.token / kal.user
//       Kalender-appens egen innlogging (fra innloggingsskjermen eller kopiert fra kal.hl.*). Widgetene bruker denne.
//   kal.snapshot
//       Siste hendelser, kalendere og vær (JSON, KalSnapshot) som widgetene viser uten nett.

enum KalGroup {
    static let baseGroup: String = "group.no.kristo.finanshub"
    /// Prompt 41: Mac-appen og Mac-widgetene (med Team ID-prefiks).
    static let macGroupSuffix: String = "group.no.kristo.kalender"

    /// Gruppen som virker på denne installasjonen (AltStore/SideStore kan gi den nytt navn via ALTAppGroups).
    static let group: String? = KalGroup.resolve()

    /// true når App Group-en er tilgjengelig (sideloading kan fjerne den).
    static var linked: Bool { group != nil }

    static var defaults: UserDefaults {
        if let g = group, let d = UserDefaults(suiteName: g) { return d }
        return UserDefaults.standard
    }

    private static func resolve() -> String? {
        #if os(macOS)
        // Mac-appen har tokenet i Nøkkelringen. På macOS 15+ gir oppslag i gruppe-containere appen ikke er signert for en
        // systemdialog («… vil få tilgang til data fra andre apper») – derfor ingen gruppe uten Team ID.
        // Prompt 41: widgetene på Mac trenger App Group-en <TeamID>.group.no.kristo.kalender. Den brukes bare når appen er
        // signert med et team (Info.plist KalTeam41 = $(DEVELOPMENT_TEAM)); ad hoc-bygg (CI) rører den aldri.
        let team: String = ((Bundle.main.object(forInfoDictionaryKey: "KalTeam41") as? String) ?? "").trimmingCharacters(in: .whitespaces)
        if team.isEmpty || team.contains("$") { return nil }
        let g: String = team + "." + macGroupSuffix
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: g) != nil ? g : nil
        #else
        var cands: [String] = []
        var bundles: [Bundle] = [Bundle.main]
        let url: URL = Bundle.main.bundleURL
        if url.pathExtension == "appex" {
            let parentURL: URL = url.deletingLastPathComponent().deletingLastPathComponent()
            if let parent = Bundle(url: parentURL) { bundles.append(parent) }
        }
        for b in bundles {
            let list: [String] = (b.object(forInfoDictionaryKey: "ALTAppGroups") as? [String]) ?? []
            for g in list where !g.isEmpty && !cands.contains(g) { cands.append(g) }
        }
        if !cands.contains(baseGroup) { cands.append(baseGroup) }
        for b in bundles {
            guard var id = b.bundleIdentifier else { continue }
            if id.hasSuffix(".widgets") { id = String(id.dropLast(".widgets".count)) }
            let g: String = "group." + id
            if !cands.contains(g) { cands.append(g) }
        }
        let fm: FileManager = FileManager.default
        for g in cands where fm.containerURL(forSecurityApplicationGroupIdentifier: g) != nil { return g }
        return nil
        #endif
    }

    /// Stabilt fingeravtrykk (FNV-1a), ikke selve tokenet.
    static func fingerprint(_ s: String) -> String {
        var h: UInt64 = 0xcbf29ce484222325
        for b in s.utf8 {
            h ^= UInt64(b)
            h = h &* 0x100000001b3
        }
        return String(h, radix: 16)
    }

    /* ---------- Fra Homelab-appen (companion-token) ---------- */

    static var homelabToken: String? {
        let t: String = defaults.string(forKey: "kal.hl.token") ?? ""
        return t.isEmpty ? nil : t
    }

    static var homelabBases: [String] { defaults.stringArray(forKey: "kal.hl.bases") ?? [] }
    static var homelabUser: String { defaults.string(forKey: "kal.hl.user") ?? "" }
    static var homelabFor: String { defaults.string(forKey: "kal.hl.for") ?? "" }

    /// Homelab-appen skriver serveradressene og et eget token for Kalender.
    static func saveHomelab(bases: [String], token: String, user: String, accountToken: String) {
        let d: UserDefaults = defaults
        d.set(clean(bases), forKey: "kal.hl.bases")
        d.set(clean(bases).first ?? "", forKey: "kal.hl.server")
        d.set(token, forKey: "kal.hl.token")
        d.set(user, forKey: "kal.hl.user")
        d.set(fingerprint(accountToken), forKey: "kal.hl.for")
        d.set(Date().timeIntervalSince1970, forKey: "kal.hl.at")
    }

    static func clearHomelab() {
        let d: UserDefaults = defaults
        for k in ["kal.hl.server", "kal.hl.bases", "kal.hl.token", "kal.hl.user", "kal.hl.for", "kal.hl.at"] { d.removeObject(forKey: k) }
    }

    /* ---------- Kalender-appens egen innlogging (leses av widgetene) ---------- */

    static var token: String? {
        let t: String = defaults.string(forKey: "kal.token") ?? ""
        return t.isEmpty ? nil : t
    }

    static var bases: [String] { defaults.stringArray(forKey: "kal.bases") ?? [] }
    static var user: String { defaults.string(forKey: "kal.user") ?? "" }
    /// «homelab» når innloggingen kom fra Homelab-appen, ellers «login».
    static var via: String { defaults.string(forKey: "kal.via") ?? "" }

    static func saveSession(bases: [String], token: String, user: String, via: String) {
        let d: UserDefaults = defaults
        let old: String = d.string(forKey: "kal.token") ?? ""
        if old != token { d.removeObject(forKey: "kal.snapshot") }
        d.set(clean(bases), forKey: "kal.bases")
        d.set(clean(bases).first ?? "", forKey: "kal.server")
        d.set(token, forKey: "kal.token")
        d.set(user, forKey: "kal.user")
        d.set(via, forKey: "kal.via")
    }

    static func clearSession() {
        let d: UserDefaults = defaults
        for k in ["kal.server", "kal.bases", "kal.token", "kal.user", "kal.via", "kal.snapshot"] { d.removeObject(forKey: k) }
    }

    /* ---------- Buffer for widgetene ---------- */

    static var snapshotData: Data? {
        get { defaults.data(forKey: "kal.snapshot") }
        set { defaults.set(newValue, forKey: "kal.snapshot") }
    }

    private static func clean(_ list: [String]) -> [String] {
        var out: [String] = []
        for raw in list {
            var s: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            while s.hasSuffix("/") { s.removeLast() }
            if !s.isEmpty && !out.contains(s) { out.append(s) }
        }
        return out
    }
}
