import Foundation
import SwiftUI

/* ---------------- Brukerskille (prompt 21) ---------------- */
// Alt som er personlig og lagres på telefonen (familie- og helsevalg, opplastingskøen, widget-cachen) får nøkkel
// per konto. Da sendes ikke posisjon eller helse til en annen konto etter kontobytte, og køen lastes bare opp
// for kontoen som la filen i den.

/// Hvilken konto som er i bruk, som en stabil nøkkel («server|brukernavn»). Overlever ny innlogging på samme konto.
enum AcctScope {
    /// Settes av Store ved oppstart og kontobytte. Leses også i bakgrunnen (HealthKit, posisjon).
    static var current: String = AcctScope.fromKeychain()

    /// Nøklene som før var felles for hele telefonen.
    static let scopedKeys: [String] = [
        "fh_fam_sharing", "fh_fam_precision", "fh_share_battery", "fh_fam_events_since",
        "fh_health_master", "fh_health_share", "fh_health_sent",
    ]

    static func scope(server: String, username: String) -> String {
        let s: String = server.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return s + "|" + username.lowercased()
    }

    /// «fh_fam_sharing» → «fh_fam_sharing@https://server|sebastian». Uten konto: bare grunnøkkelen.
    static func key(_ base: String) -> String {
        let c: String = current
        return c.isEmpty ? base : base + "@" + c
    }

    /// Kontoen som er aktiv, lest rett fra nøkkelringen (samme valg som HealthSync.backgroundAPI).
    static func fromKeychain() -> String {
        guard let raw = Keychain.get("accounts"), let d = raw.data(using: .utf8),
              let list = try? JSONDecoder().decode([LoginAccount].self, from: d), !list.isEmpty else { return "" }
        let active: String? = Keychain.get("active")
        let a: LoginAccount = list.first { $0.id == active } ?? list[0]
        return AcctScope.scope(server: a.server, username: a.username)
    }

    /// Engangsflytting: de gamle felles verdiene gis til kontoen bare når det finnes én konto. Med flere kontoer
    /// vet vi ikke hvem som slo på delingen, så da slettes de (alt er av som standard).
    static func migrate(accountCount: Int) {
        let ud = UserDefaults.standard
        if ud.bool(forKey: "fh_scope21_done") { return }
        let c: String = current
        for k in scopedKeys {
            guard let v = ud.object(forKey: k) else { continue }
            if accountCount == 1 && !c.isEmpty && ud.object(forKey: k + "@" + c) == nil {
                ud.set(v, forKey: k + "@" + c)
            }
            ud.removeObject(forKey: k)
        }
        ud.set(true, forKey: "fh_scope21_done")
    }
}

extension AcctScope {
    /// Utlogging: slett kontoens familie- og helsevalg på telefonen. Serveren har sine egne valg.
    static func forget(_ scope: String) {
        if scope.isEmpty { return }
        let ud = UserDefaults.standard
        for k in scopedKeys { ud.removeObject(forKey: k + "@" + scope) }
    }

    /// Eget bakgrunnsbilde er personlig: fjern det fra bufferen ved kontobytte.
    static func clearPersonalCaches() {
        guard let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return }
        for name in ["papir-bg-custom.jpg", "papir-bg-prev-custom.jpg"] {
            try? FileManager.default.removeItem(at: dir.appendingPathComponent(name))
        }
        UserDefaults.standard.removeObject(forKey: "fh_bg_url_custom")
        UserDefaults.standard.removeObject(forKey: "fh_bg_prev_custom")
    }
}

extension LoginAccount {
    var scopeKey: String { AcctScope.scope(server: server, username: username) }
}

extension Store {
    /// Kalles etter kontobytte, innlogging og utlogging: ny nøkkel, tomme cacher fra forrige konto,
    /// og familie/helse lest på nytt for den nye kontoen.
    func applyAccountScope21() {
        let next: String = account?.scopeKey ?? ""
        let changed: Bool = next != AcctScope.current
        AcctScope.current = next
        if !changed { return }
        AcctScope.clearPersonalCaches()
        if photo == "custom" { photoImage = nil }
        bgPreviews["custom"] = nil
        FamilyModel.shared.resetForAccount()
        HealthSync.shared.reloadForAccount()
        resetSharedModels21()
        FamilyLocation.shared.stop()
        if loggedIn { FamilyLocation.shared.resume(self) }
    }

    /// Modellene som lever hele appens levetid (singletons) holder data fra forrige konto i minnet. Tøm dem,
    /// og fjern lokale kopier som ikke har nøkkel per konto (stopp og avkryssede abonnementer).
    private func resetSharedModels21() {
        let t: TasksModel = TasksModel.shared
        t.items = []; t.members = []; t.lists = []; t.loaded = false; t.error = nil
        let r: RuterModel = RuterModel.shared
        r.stops = []; r.departures = [:]; r.selected = nil; r.updated = nil; r.error = nil; r.results = []
        UserDefaults.standard.removeObject(forKey: "fh_ruter_stops")
        let pos: PositionsModel20 = PositionsModel20.shared
        pos.people = []; pos.loaded = false
        let ai: AiSettingsModel = AiSettingsModel.shared
        ai.health = [:]; ai.settings = [:]; ai.results = [:]; ai.log = []
        let sel: TrackSelect = TrackSelect.shared
        sel.ids = []; sel.active = false; sel.archived = []; sel.archivedLoaded = false
        UserDefaults.standard.removeObject(forKey: "fh_subs_done")
    }

    /// Kvitteringene i køen som hører til kontoen som er i bruk. Eldre elementer uten konto vises bare når
    /// telefonen har én konto (da er det åpenbart hvem de tilhører).
    var myPendingUploads: [PendingUpload] {
        let me: String = account?.scopeKey ?? ""
        let single: Bool = accounts.count <= 1
        return pendingUploads.filter { item in
            if let a = item.accountId, !a.isEmpty { return a == me }
            return single
        }
    }
}
