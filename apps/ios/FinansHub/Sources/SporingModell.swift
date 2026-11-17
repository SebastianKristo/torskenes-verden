import SwiftUI

/* ---------------- Struktur: iOS – Sporing ut av Store (AUDIT §6, samme mønster som DomenerModell) ----------------
 Sendingene, valgene på Sporing-siden og kallene mot /api/tracking bor her. Store eier modellen (store.sporing) og har
 videresendende egenskaper (store.tracking, store.homePackages, store.trkSel, store.trkFilter, store.trkChecking, store.trkTab,
 store.trkSettings, store.trkOrder, store.paperTrackFull, store.trackAddOpen) og metoder (loadTracking, pollTracking,
 addTracking … i Tracking.swift, refreshTracking22 i TrackCarriers.swift), så skjermene virker som før. Modellen injiseres
 sammen med Store (homelabMiljo), så nye visninger kan lese den med @Environment(SporingModell.self).
 Kallene får Store som parameter (api, run, flash, account). */

@MainActor
@Observable
final class SporingModell {
    var tracking: TrackingData? = nil
    /// De 2 viktigste pakkene på Homelab-hjem (fra /mobile/home, oppdateres av Sporing).
    var homePackages: [Shipment]? = nil
    /// Åpen sending (kortet er utvidet med tidslinjen).
    var sel: String? = nil
    /// active | pickup | out | done
    var filter: String = "active"
    var checking: Bool = false
    /// Sporing i Papir: Aktive | Klar for henting | På vei | Registrert | Levert | Alle
    var tab: String = "Aktive"
    /// «Varsler og kilder» i Papir-sporing.
    var settings: Bool = false
    /// Rekkefølgen på Sporing-kortene (lagres per bruker i layout.trkOrder).
    var order: [String] = UserDefaults.standard.stringArray(forKey: "fh_trk_order") ?? ["add", "shipments", "notify", "carriers"] {
        didSet { UserDefaults.standard.set(order, forKey: "fh_trk_order") }
    }
    /// «Alt om sporing»: den klassiske Sporing-siden med kilder, varsler og transportører.
    var full: Bool = false
    /// «Ny sending»-arket (den flytende knappen på Sporing).
    var addOpen: Bool = false

    func load(_ store: Store) async throws {
        let t: TrackingData = TrackingData.parse(try await store.api.callAt("/api", "GET", "/tracking"))
        tracking = t
        notify(t, store)
    }

    /// Henter status i bakgrunnen (forsiden, åpen app hvert 5. minutt). Feil vises ikke.
    func poll(_ store: Store) async {
        guard store.loggedIn, !store.locked, let d = try? await store.api.callAt("/api", "GET", "/tracking", timeout: 15) else { return }
        let t: TrackingData = TrackingData.parse(d)
        tracking = t
        homePackages = t.top(2)
        notify(t, store)
    }

    func add(no: String, name: String, carrier: String?, out: Bool, carrierOverride: String?, _ store: Store) {
        let n: String = no.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { store.flash("Skriv inn et sporingsnummer"); return }
        store.run {
            var body: [String: Any] = ["trackingNo": n, "direction": out ? "out" : "in"]
            let nm: String = name.trimmingCharacters(in: .whitespacesAndNewlines)
            if !nm.isEmpty { body["name"] = nm }
            if let carrier, carrier != "other" { body["carrier"] = carrier }
            // Prompt 26: valgt tjeneste overstyrer gjenkjenningen (eldre server leser bare carrier).
            if let ov = carrierOverride, !ov.isEmpty {
                body["carrierOverride"] = ov
                if ov != "parcelsapp" { body["carrier"] = ov }
            }
            let d: Data = try await store.api.callAt("/api", "POST", "/tracking", json: body, timeout: 30)
            let o: [String: Any] = JS.obj(d)
            if let item = JS.dict(o, "item") { self.sel = Shipment(item).id }
            try await self.load(store)
            self.filter = out ? "out" : "active"
            store.flash(JS.str(o, "message") ?? "Sendingen spores")
        }
    }

    func archive(_ s: Shipment, _ on: Bool, _ store: Store) {
        store.run {
            try await store.api.callAt("/api", "PATCH", "/tracking/\(s.id)", json: ["archived": on])
            if on { self.sel = nil }
            try await self.load(store)
            store.flash(on ? "\(s.name) er arkivert" : "\(s.name) er hentet tilbake")
        }
    }

    func delete(_ s: Shipment, _ store: Store) {
        store.run {
            try await store.api.callAt("/api", "DELETE", "/tracking/\(s.id)")
            self.sel = nil
            try await self.load(store)
            store.flash("\(s.name) er slettet")
        }
    }

    /// «Sjekk nå»: leser e-post og Finn, og henter status hos transportørene.
    func check(_ store: Store) {
        guard !checking else { return }
        checking = true
        store.run {
            defer { self.checking = false }
            let d: Data = try await store.api.callAt("/api", "POST", "/tracking/check", timeout: 60)
            let o: [String: Any] = JS.obj(d)
            if o["items"] != nil { let t: TrackingData = TrackingData(o); self.tracking = t; self.notify(t, store) } else { try await self.load(store) }
            store.flash(JS.str(o, "message") ?? "Sporing er oppdatert")
        }
    }

    func setPref(_ k: String, _ on: Bool, _ store: Store) {
        tracking?.prefs[k] = on
        store.run { try await store.api.callAt("/api", "PUT", "/tracking/prefs", json: [k: on]) }
    }

    /// k: finn | email | autoArchive
    func setSource(_ k: String, _ on: Bool, _ store: Store) {
        if k == "finn" { tracking?.finn.on = on } else if k == "autoArchive" { tracking?.autoArchive.on = on } else { tracking?.email.on = on }
        store.run { try await store.api.callAt("/api", "PUT", "/tracking/sources", json: [k: on]) }
    }

    /// Pull-to-refresh og «Sjekk nå»: be serveren hente status hos fraktselskapene nå (POST /api/tracking/refresh).
    /// Q19: ingen omvei om /tracking/check ved 404 lenger; serveren har ruten, og /api/version sier fra om en for gammel server.
    func refresh(_ store: Store) async {
        checking = true
        defer { checking = false }
        do {
            let d: Data = try await store.api.callAt("/api", "POST", "/tracking/refresh", timeout: 60)
            let o: [String: Any] = JS.obj(d)
            if o["items"] != nil {
                let t: TrackingData = TrackingData(o)
                tracking = t
                notify(t, store)
                return
            }
        } catch {
            store.flash("Kunne ikke oppdatere sporingen: \(error.localizedDescription)")
        }
        try? await load(store)
    }

    /// Lokale varsler for nye hendelser (serverens varselliste, ellers statusendringer til «Klar for henting» og «Levert»).
    /// Første gang huskes bare det som finnes, så det ikke kommer en bølge av gamle varsler.
    func notify(_ t: TrackingData, _ store: Store) {
        let key: String = "fh_trk_seen_" + (store.account?.id ?? "")
        let first: Bool = UserDefaults.standard.object(forKey: key) == nil
        var seen: [String] = UserDefaults.standard.stringArray(forKey: key) ?? []
        var fresh: [(String, String, String)] = []
        if let notices = t.notices {
            for n in notices.reversed() where !seen.contains("n:" + n.id) {
                seen.append("n:" + n.id)
                let title: String = ["pickup": "Klar for henting", "delivered": "Levert", "out": "Ute for levering", "delayed": "Forsinket", "found": "Ny sending"][n.kind] ?? "Sporing"
                fresh.append((title, n.text, "trk-n-" + n.id))
            }
        }
        // Statusendringer (også når serveren ikke sender varsellisten).
        for s in t.items where !s.archived && (s.ready || s.done) {
            let k: String = "s:\(s.id):\(s.status)"
            guard !seen.contains(k) else { continue }
            seen.append(k)
            if t.notices != nil { continue }
            let want: Bool = s.ready ? (t.prefs["pickup"] ?? true) : (t.prefs["delivered"] ?? true)
            guard want else { continue }
            fresh.append(s.ready ? ("Klar for henting", "\(s.name)" + (s.pickupPoint.isEmpty ? "" : " hos \(s.pickupPoint)"), "trk-\(s.id)-pickup")
                                 : ("Levert", "\(s.name) er levert", "trk-\(s.id)-delivered"))
        }
        UserDefaults.standard.set(Array(seen.suffix(400)), forKey: key)
        guard !first, !fresh.isEmpty else { return }
        for f in fresh.suffix(3) { LocalNotify.post(f.0, f.1, id: f.2, group: "pakker") }
        Haptics.shared.package()
    }
}
