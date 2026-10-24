import SwiftUI
import UIKit
import UserNotifications
import CoreLocation

/* ---------------- Prompt 50: varsler for Sjekk inn og geofencing per område (FAMIOS50) ----------------
   Varsler: serveren legger innsjekker i køen (/api/notify/pending, data.kind = checkin.checkin | checkin.request |
   checkin.pickup | checkin.reply | checkin.reminder | health.request) og sender sanntid `family {kind:'checkin'}`.
   Mottakeren svarer med ett trykk fra varselet: 👍 / Ring / Hent → POST /api/family/checkin/:id/reply.
   «Hent meg» (priority high, kanal sjekkinn-hast) er tidskritisk (interruptionLevel .timeSensitive) når appen har
   tillatelsen (entitlement + brukerens valg); ellers et vanlig varsel – og alltid med lyd, også i stille timer.
   Geofencing: én CLCircularRegion per område fra GET /api/family/places/regions (maks 20 totalt, Hjem og Skole først,
   så nærmeste). Hentes på nytt ved sanntid `family {kind:'places'}`, ellers høyst hvert 15. min. */

enum Fam50Notify {
    nonisolated static let catCheckin: String = "fam50.checkin"
    nonisolated static let catRequest: String = "fam50.request"
    nonisolated static let catPickup: String = "fam50.pickup"
    nonisolated static let actOk: String = "fam50.ok"
    nonisolated static let actCall: String = "fam50.call"
    nonisolated static let actPickup: String = "fam50.pickup"
    nonisolated static let actCheckin: String = "fam50.checkin"
    private nonisolated static let postedKey: String = "fam50_notify_posted"

    nonisolated static func categories() -> [UNNotificationCategory] {
        let ok: UNNotificationAction = UNNotificationAction(identifier: actOk, title: "👍", options: [])
        let okAll: UNNotificationAction = UNNotificationAction(identifier: actOk, title: "👍 Alt bra", options: [])
        let call: UNNotificationAction = UNNotificationAction(identifier: actCall, title: "Ring", options: [.foreground])
        let pickup: UNNotificationAction = UNNotificationAction(identifier: actPickup, title: "Hent", options: [.foreground])
        let checkin: UNNotificationAction = UNNotificationAction(identifier: actCheckin, title: "Sjekk inn", options: [.foreground])
        return [
            UNNotificationCategory(identifier: catCheckin, actions: [ok, call, pickup], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: catRequest, actions: [okAll, checkin], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: catPickup, actions: [pickup, call], intentIdentifiers: [], options: []),
        ]
    }

    /// Varsler fra køen som skal vises her (med handlinger) i stedet for som vanlig kø-varsel.
    nonisolated static func wants(_ data: [String: Any]?) -> Bool {
        let k: String = (data?["kind"] as? String) ?? ""
        return k.hasPrefix("checkin.") || k == "health.request"
    }

    private nonisolated static func posted(_ tag: String) -> Bool {
        let seen: [String] = UserDefaults.standard.stringArray(forKey: postedKey) ?? []
        if seen.contains(tag) { return true }
        UserDefaults.standard.set(Array((seen + [tag]).suffix(200)), forKey: postedKey)
        return false
    }

    /// Et element fra /api/notify/pending: {id, title, body, url, tag, category, data}.
    nonisolated static func postPending(_ it: [String: Any]) {
        let data: [String: Any] = (it["data"] as? [String: Any]) ?? [:]
        let tag: String = (it["tag"] as? String) ?? ("q-" + String(describing: it["id"] ?? UUID().uuidString))
        post(title: (it["title"] as? String) ?? "Familie", body: (it["body"] as? String) ?? "", data: data, tag: tag)
    }

    /// Lokalt varsel med riktige handlinger. Samme tag vises bare én gang (kø + sanntid).
    nonisolated static func post(title: String, body: String, data: [String: Any], tag: String) {
        if posted(tag) { return }
        let kind: String = (data["kind"] as? String) ?? ""
        let high: Bool = kind == "checkin.pickup" || (data["priority"] as? String) == "high"
        guard NotifyModel.allowed(nil) else { return }
        if !high && !NotifyModel.allowed("familie") { return }
        let c: UNMutableNotificationContent = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.threadIdentifier = "sjekkinn"
        switch kind {
        case "checkin.checkin": c.categoryIdentifier = catCheckin
        case "checkin.request": c.categoryIdentifier = catRequest
        case "checkin.pickup": c.categoryIdentifier = catPickup
        default: break
        }
        var info: [String: Any] = ["fam50": kind]
        if let v = data["checkinId"] { info["checkinId"] = String(describing: v) }
        if let v = data["from"] as? String { info["from"] = v }
        if let v = data["fromName"] as? String { info["fromName"] = v }
        if let v = data["lat"] as? NSNumber { info["lat"] = v.doubleValue }
        if let v = data["lon"] as? NSNumber { info["lon"] = v.doubleValue }
        c.userInfo = info
        c.sound = high ? UNNotificationSound.default : NotifyModel.currentSound()
        if high { c.relevanceScore = 1 }
        let id: String = "fam50-" + tag
        UNUserNotificationCenter.current().getNotificationSettings { (s: UNNotificationSettings) in
            // Tidskritisk bare når appen har tillatelsen (entitlement); ellers et vanlig varsel.
            if high && s.timeSensitiveSetting == .enabled { c.interruptionLevel = .timeSensitive }
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil)) { (_: Error?) in }
        }
    }

    /* ---------- Trykk og handlinger ---------- */

    /// Fra Notify31.handle. true = varselet var vårt.
    nonisolated static func handle(_ response: UNNotificationResponse) -> Bool {
        let info: [AnyHashable: Any] = response.notification.request.content.userInfo
        guard let kind = info["fam50"] as? String else { return false }
        let action: String = response.actionIdentifier
        let id: String = (info["checkinId"] as? String) ?? ""
        let from: String = (info["from"] as? String) ?? ""
        let lat: Double? = info["lat"] as? Double
        let lon: Double? = info["lon"] as? Double
        Task { @MainActor in
            await Fam50Notify.act(kind: kind, action: action, id: id, from: from, lat: lat, lon: lon)
        }
        return true
    }

    /// → svaret fra serveren ({checkin, answer?, call?:{phone}}), nil ved feil.
    @MainActor private static func reply(_ id: String, _ r: String) async -> [String: Any]? {
        guard !id.isEmpty else { return nil }
        if let s = Notify31.store, s.loggedIn {
            return await Fam50Model.shared.reply(s, id, r)
        }
        guard let api = HealthSync.backgroundAPI() else { return nil }
        var b: [String: Any] = ["reply": r]
        if r == "ok", let l = Fam50Locator.shared.last, Date().timeIntervalSince(l.timestamp) < 15 * 60 {
            b["lat"] = l.coordinate.latitude
            b["lon"] = l.coordinate.longitude
        }
        guard let d = try? await api.callAt("/api", "POST", "/family/checkin/" + Fam50Model.enc(id) + "/reply", json: b, timeout: 20) else { return nil }
        return JS.obj(d)
    }

    @MainActor private static func act(kind: String, action: String, id: String, from: String, lat: Double?, lon: Double?) async {
        switch action {
        case actOk:
            let ok: Bool = await reply(id, "ok") != nil
            if !ok { LocalNotify.post("Sjekk inn", "Fikk ikke sendt 👍. Åpne appen og prøv igjen.", id: "fam50-err-" + id, group: nil) }
        case actCall:
            let o: [String: Any]? = await reply(id, "call")
            let server: String = JS.str(JS.dict(o, "call"), "phone") ?? ""
            let num: String = server.isEmpty ? Fam50Phone.get(from) : server
            if !num.isEmpty { Fam50Phone.open(num, sms: false) } else { openPerson(from) }
        case actPickup:
            _ = await reply(id, "pickup")
            if let lat, let lon, let u = URL(string: String(format: "https://maps.apple.com/?daddr=%.6f,%.6f", lat, lon)) {
                _ = await UIApplication.shared.open(u)
            } else {
                openPerson(from)
            }
        case actCheckin:
            openCheckin(requestId: id, from: from)
        default:
            if kind == "health.request" { Notify31.store?.paperGo("innst-helse"); return }
            if kind == "checkin.request" { openCheckin(requestId: id, from: from); return }
            if kind == "checkin.pickup" && !from.isEmpty { openPerson(from); return }
            openCheckin(requestId: nil, from: "")
        }
    }

    @MainActor static func openCheckin(requestId: String?, from: String) {
        guard let s = Notify31.store else { return }
        s.paperGo("familie")
        FamilyModel.shared.tab = "hjemlys"
        Fam50Nav.shared.reset()
        if let requestId, !requestId.isEmpty, !from.isEmpty {
            let d: Fam50Draft = Fam50Draft.shared
            d.requestId = requestId
            d.requestFrom = from
            d.to = [from]
        }
        Task { await Fam50Model.shared.loadCheckin(s) }
    }

    @MainActor static func openPerson(_ userId: String) {
        guard let s = Notify31.store else { return }
        s.paperGo("familie")
        FamilyModel.shared.tab = "kart"
        Fam50Nav.shared.stack = userId.isEmpty ? [] : [.person(userId)]
    }

    /* ---------- Sanntid (WebSocket «family») ---------- */

    /// true = meldingen er håndtert her (steder og innsjekker); ellers gjør Realtime som før.
    @MainActor static func realtime(_ o: [String: Any], _ store: Store) -> Bool {
        switch JS.str(o, "kind") ?? "" {
        case "places":
            Task {
                await Fam50Fence.shared.sync(force: true)
                await Fam50Model.shared.loadPlaces(store)
                await Fam50School.shared.load(store)
                await MinReise41.shared.loadZones(store)
                await FamilyModel.shared.load(store)
            }
            return true
        case "checkin":
            let id: String = JS.str(o, "id") ?? ""
            let act: String = JS.str(o, "action") ?? ""
            if act == "new" && !id.isEmpty { Task { await incoming(id, store) } }
            if act == "reply", let who = JS.str(o, "from"), who != FamilyModel.shared.meId {
                let r: String = JS.str(o, "reply") ?? ""
                let text: String = r == "ok" ? ": 👍" : (r == "call" ? " ringer deg" : (r == "pickup" ? " kommer og henter deg" : " svarte"))
                store.flash(Fam50Model.shared.name(who) + text)
            }
            Fam50Model.shared.refreshSoon(store, checkin: true)
            return true
        default:
            // Posisjoner o.l.: Familie-siden hentes på nytt bare når den er åpen.
            if store.paperTab == "familie" { Fam50Model.shared.refreshSoon(store) }
            return false
        }
    }

    /// Ny innsjekk/forespørsel til deg mens appen er åpen: samme varsel som fra køen (vises én gang).
    @MainActor private static func incoming(_ id: String, _ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/family/checkin/" + Fam50Model.enc(id), timeout: 12) else { return }
        guard let raw = JS.dict(JS.obj(d), "checkin") else { return }
        let c: Fam50Checkin = Fam50Checkin(raw)
        if c.mine || !c.to.contains(where: { $0.mini.isSelf }) { return }
        let name: String = c.from.first
        let title: String
        switch c.kind {
        case "request": title = name + " ber deg sjekke inn"
        case "pickup": title = name + ": Hent meg"
        default: title = name + " sjekket inn"
        }
        let body: String = [c.kind == "pickup" ? "" : c.text, c.placeLabel].filter { !$0.isEmpty }.joined(separator: " · ")
        var data: [String: Any] = ["kind": "checkin." + c.kind, "checkinId": c.id, "from": c.from.userId, "fromName": name]
        if c.kind == "pickup" {
            data["priority"] = "high"
            if let la = c.lat, let lo = c.lon { data["lat"] = NSNumber(value: la); data["lon"] = NSNumber(value: lo) }
        }
        post(title: title, body: body.isEmpty ? "Trykk for å se" : body, data: data, tag: "checkin-" + c.id)
    }
}

/* ---------- Geofencing: én region per område ---------- */

@MainActor
final class Fam50Fence {
    static let shared = Fam50Fence()

    private var lastSync: Date = Date.distantPast
    private var version: Double = -1
    private var ids: [String] = []
    /// Serveren mangler /places/regions → de gamle sonene (FamilyLocation.syncZones).
    private(set) var unsupported: Bool = false

    /// Fra FamilyModel.apply (hvert 30. s): henter regionene høyst hvert 15. min, ellers ved endring (sanntid).
    func kick(_ zones: [FamZone]) {
        if unsupported { FamilyLocation.shared.syncZones(zones); return }
        Task { @MainActor in
            await self.sync(force: false)
            if self.unsupported { FamilyLocation.shared.syncZones(zones) }
        }
    }

    func sync(force: Bool) async {
        let loc: FamilyLocation = FamilyLocation.shared
        guard loc.running50, let api = loc.api50 else {
            loc.applyRegions50([])
            ids = []
            return
        }
        if !force && Date().timeIntervalSince(lastSync) < 15 * 60 && version >= 0 { return }
        lastSync = Date()
        var q: String = ""
        if let l = loc.last50 { q = String(format: "?lat=%.6f&lon=%.6f", l.coordinate.latitude, l.coordinate.longitude) }
        let o: [String: Any]
        do {
            let d: Data = try await api.callAt("/api", "GET", "/family/places/regions" + q, timeout: 20)
            o = JS.obj(d)
        } catch let e as APIError {
            if e.status == 404 { unsupported = true }
            return
        } catch {
            return
        }
        // Min reise (MinReise41Geo) overvåker skoleområdene selv: de telles med i taket på 20 og hoppes over her.
        let school: [String] = MinReise41Geo.shared.monitoredIds
        let budget: Int = Swift.max(0, 20 - school.count)
        var list: [Fam50Region] = []
        for r in JS.list(o, "regions") {
            let area: String = JS.str(r, "areaId") ?? ""
            if school.contains(area) { continue }
            guard let la = JS.num(r, "lat"), let lo = JS.num(r, "lon"), let id = JS.str(r, "id") else { continue }
            list.append(Fam50Region(id: id, lat: la, lon: lo, radius: JS.num(r, "radius_m") ?? 150))
            if list.count >= budget { break }
        }
        let v: Double = JS.num(o, "version") ?? 0
        let newIds: [String] = list.map { $0.id + "@" + String(Int($0.radius)) + String(format: "%.5f%.5f", $0.lat, $0.lon) }
        if newIds == ids && v == version { return }
        ids = newIds
        version = v
        loc.applyRegions50(list)
    }
}

struct Fam50Region {
    let id: String
    let lat: Double
    let lon: Double
    let radius: Double
}
