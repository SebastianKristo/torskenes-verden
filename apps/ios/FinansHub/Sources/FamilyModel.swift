import SwiftUI
import MapKit
import CoreLocation
import CoreMotion
import UIKit
import UserNotifications

/* ---------------- Familie og kart (prompt 16) ---------------- */

struct FamPos: Hashable {
    var lat: Double
    var lon: Double
    var acc: Double?
    var speed: Double?
    var heading: Double?
    var ts: Date?
    var battery: Double?
    var charging: Bool
    var activity: String
    var place: String
    var device: String

    init?(_ o: [String: Any]?) {
        guard let o, let la = JS.num(o, "lat"), let lo = JS.num(o, "lon") else { return nil }
        lat = la; lon = lo
        acc = JS.num(o, "acc"); speed = JS.num(o, "speed"); heading = JS.num(o, "heading")
        ts = JS.date(o["ts"])
        battery = JS.num(o, "battery")
        charging = JS.bool(o, "charging") ?? false
        activity = JS.str(o, "activity") ?? ""
        place = JS.str(o, "place") ?? ""
        device = JS.str(o, "device") ?? ""
    }

    var coord: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
}

struct FamHealth: Hashable {
    var steps: Double?
    var restingHr: Double?
    var hr: Double?
    var sleepMin: Double?
    var activeKcal: Double?
    var week: [Double]
    var updated: Date?

    init?(_ raw: [String: Any]?) {
        guard let raw, !raw.isEmpty else { return nil }
        // Serveren gir {today: {…}, week, updatedAt}; eldre form har feltene direkte.
        let o = JS.dict(raw, "today") ?? raw
        steps = JS.num(o, "steps"); restingHr = JS.num(o, "restingHr"); hr = JS.num(o, "hr")
        sleepMin = JS.num(o, "sleepMin") ?? JS.num(o, "sleep"); activeKcal = JS.num(o, "activeKcal")
        week = JS.list(raw, "week").compactMap { JS.num($0, "steps") }
        updated = JS.date(raw["updatedAt"]) ?? JS.date(o["ts"])
    }
}

struct FamMember: Identifiable, Hashable {
    var id: String
    var name: String
    var username: String
    var avatarUrl: String
    var sharing: String
    var precision: String
    var last: FamPos?
    var health: FamHealth?
    /// Personens egen farge fra Familie (prompt 20). Tom = lages fra paletten.
    var color: String
    /// Prompt 22: profilbildet du har valgt for personen (eller kontobildet). Tom = avatarUrl / initialer.
    var photoUrl: String = ""
    /// Prompt 24: én person = én oppføring. Enhetene til personen, hvilken som er kilde, og om kilden er valgt manuelt.
    var devices: [FamDevice] = []
    var sourceDevice: String = ""
    var deviceCount: Int = 0
    var sourceManual: Bool = false

    init(_ o: [String: Any]) {
        id = JS.str(o, "userId") ?? JS.str(o, "id") ?? UUID().uuidString
        photoUrl = JS.str(o, "photoUrl") ?? ""
        name = JS.str(o, "name") ?? JS.str(o, "username") ?? "Ukjent"
        username = JS.str(o, "username") ?? ""
        avatarUrl = JS.str(o, "avatarUrl") ?? ""
        sharing = JS.str(o, "sharing") ?? "on"
        precision = JS.str(o, "precision") ?? "exact"
        last = FamPos(JS.dict(o, "last"))
        health = FamHealth(JS.dict(o, "health"))
        color = JS.str(o, "color") ?? JS.str(o, "farge") ?? ""
        let devs: [FamDevice] = JS.list(o, "devices").map { FamDevice($0) }
        devices = devs
        let srcDict: [String: Any]? = JS.dict(o, "sourceDevice")
        let src: String = JS.str(o, "sourceDevice") ?? JS.str(srcDict, "id") ?? (devs.first(where: { $0.isSource })?.id ?? "")
        sourceDevice = src
        deviceCount = JS.int(o, "deviceCount") ?? devs.count
        sourceManual = JS.bool(o, "sourceManual") ?? JS.bool(srcDict, "manual") ?? false
    }

    var initial: String { String(name.prefix(1)).uppercased() }
    var first: String { name.split(separator: " ").first.map(String.init) ?? name }
}

struct FamZone: Identifiable, Hashable {
    var id: String
    var name: String
    var lat: Double
    var lon: Double
    var radius: Double
    var color: String
    /// userId → (enter, leave) for den som ser på.
    var notify: [String: [Bool]]
    /// Prompt 21: sonen er delt med familien (standard av), hvem som lagde den, og om den er din.
    var shared: Bool = false
    var createdBy: String = ""
    var mineFlag: Bool? = nil
    /// Prompt 22: ikon-nøkkel (home, work, …). Mangler feltet, brukes lokal reserve eller standard etter navn.
    var icon: String = "pin"

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        shared = JS.bool(o, "shared") ?? false
        createdBy = JS.str(o, "created_by") ?? JS.str(o, "createdBy") ?? JS.str(o, "owner") ?? ""
        mineFlag = JS.bool(o, "mine")
        name = JS.str(o, "name") ?? "Sone"
        lat = JS.num(o, "lat") ?? 0
        lon = JS.num(o, "lon") ?? 0
        radius = JS.num(o, "radius") ?? 150
        color = JS.str(o, "color") ?? "#b23a2a"
        let zid: String = id
        let zname: String = name
        // Prompt 42: Iconify-ikoner kommer med path-data (icp), som lagres lokalt så ikonet vises uten nett.
        if let ic = JS.str(o, "icon"), let icp = JS.str(o, "icp"), ic.hasPrefix("ify:") { Icons42.store(ic, icp) }
        icon = Fam22Icons.valid(JS.str(o, "icon")) ?? Fam22Local.icon(zid) ?? Fam22Icons.defaultFor(zname)
        var n: [String: [Bool]] = [:]
        if let d = o["notify"] as? [String: Any] {
            for (k, v) in d {
                if let x = v as? [String: Any] { n[k] = [JS.bool(x, "enter") ?? false, JS.bool(x, "leave") ?? false] }
            }
        }
        notify = n
    }

    var coord: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
}

struct FamEvent: Identifiable, Hashable {
    var id: String
    var userId: String
    var zoneId: String
    var kind: String
    var ts: Date?
    var text: String
    var name: String
    var zoneName: String

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        userId = JS.str(o, "userId") ?? ""
        zoneId = JS.str(o, "zoneId") ?? ""
        kind = JS.str(o, "kind") ?? ""
        ts = JS.date(o["ts"])
        text = JS.str(o, "text") ?? ""
        name = JS.str(o, "name") ?? ""
        zoneName = JS.str(o, "zone") ?? ""
    }
}

/* ---------- Data ---------- */

@MainActor
@Observable
final class FamilyModel {
    static let shared = FamilyModel()

    var meId = ""
    /// Fanen i Familie (Kart, Soner eller Helse). Velges i fanelinja nederst (prompt 21).
    var tab: String = "kart"
    // Prompt 21: valgene lagres per konto (AcctScope), og deling er av som standard.
    var sharing: String = UserDefaults.standard.string(forKey: AcctScope.key("fh_fam_sharing")) ?? "off" {
        didSet { UserDefaults.standard.set(sharing, forKey: AcctScope.key("fh_fam_sharing")) }
    }
    var precision: String = UserDefaults.standard.string(forKey: AcctScope.key("fh_fam_precision")) ?? "exact" {
        didSet { UserDefaults.standard.set(precision, forKey: AcctScope.key("fh_fam_precision")) }
    }
    var members: [FamMember] = []
    var zones: [FamZone] = []
    var events: [FamEvent] = []
    var selected: String?
    var track: [FamPos] = []
    var loaded = false
    var error: String?
    var zoneDraft: CLLocationCoordinate2D?
    var zoneEdit: FamZone?
    var addingZone = false
    /// Prompt 22: siste posisjoner per person (spor på kartet), plassering og utkast til ny sone, og sonen som redigeres.
    var trails: [String: [CLLocationCoordinate2D]] = [:]
    var placing22 = false
    var draft22: Fam22Draft?
    var editZone22: String?
    /// Lagring av soneendringer samles (fri fargevelger sender mange endringer).
    var zoneSave22: [String: Task<Void, Never>] = [:]
    private var lastEventTs: Double = UserDefaults.standard.double(forKey: AcctScope.key("fh_fam_events_since"))

    /// Kontobytte: tøm alt fra forrige konto og les valgene for den nye.
    func resetForAccount() {
        members = []; zones = []; events = []; selected = nil; track = []
        loaded = false; error = nil; zoneDraft = nil; zoneEdit = nil; addingZone = false
        trails = [:]; placing22 = false; draft22 = nil; editZone22 = nil
        Fam22Photos.shared.reset()
        Fam50Model.shared.resetForAccount()
        meId = ""
        sharing = UserDefaults.standard.string(forKey: AcctScope.key("fh_fam_sharing")) ?? "off"
        precision = UserDefaults.standard.string(forKey: AcctScope.key("fh_fam_precision")) ?? "exact"
        lastEventTs = UserDefaults.standard.double(forKey: AcctScope.key("fh_fam_events_since"))
    }

    func member(_ id: String) -> FamMember? { members.first { $0.id == id } }
    func zone(_ id: String) -> FamZone? { zones.first { $0.id == id } }

    func load(_ store: Store) async {
        pingStore = store
        FamilyLocation.shared.attach(store)
        do {
            let d = try await store.api.callAt("/api", "GET", "/family", timeout: 20)
            apply(JS.obj(d))
            error = nil
        } catch let e as APIError {
            error = e.status == 404 ? "Familie finnes ikke på serveren ennå. Oppdater homelab." : e.message
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
        if let s = selected { await loadTrack(s, store) }
    }

    func apply(_ o: [String: Any]) {
        if let me = JS.dict(o, "me") {
            meId = JS.str(me, "userId") ?? meId
            if let v = JS.str(me, "sharing") { sharing = v }
            if let v = JS.str(me, "precision") { precision = v }
            if let sh = JS.dict(me, "shareHealth") { HealthSync.shared.applyServer(sh) }
        }
        members = Fam24Group.merge(JS.list(o, "members").map { FamMember($0) })
        for mem in members {
            guard let c = mem.last?.coord else { continue }
            var t: [CLLocationCoordinate2D] = trails[mem.id] ?? []
            if let l = t.last, abs(l.latitude - c.latitude) < 0.000001, abs(l.longitude - c.longitude) < 0.000001 { continue }
            t.append(c)
            if t.count > 31 { t.removeFirst(t.count - 31) }
            trails[mem.id] = t
        }
        zones = JS.list(o, "zones").map { FamZone($0) }
        // Geofencing i iOS: inn og ut av sonene sendes til serveren med en gang, også når appen er lukket.
        // Prompt 50: én region per område fra /api/family/places/regions (FamilyGeofence.swift); eldre server: sonene.
        Fam50Fence.shared.kick(zones)
        events = JS.list(o, "events").map { FamEvent($0) }
        // Prompt 22: ingen person er valgt fra start (som i designet); en valgt person som ikke lenger finnes, nullstilles.
        if let s = selected, !members.contains(where: { $0.id == s }) { selected = nil }
    }

    func loadTrack(_ id: String, _ store: Store) async {
        let e = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        guard let d = try? await store.api.callAt("/api", "GET", "/family/track/\(e)?hours=24") else { track = []; return }
        let raw = (try? JSONSerialization.jsonObject(with: d)) as? [Any] ?? JS.list(JS.obj(d), "points")
        track = raw.compactMap { $0 as? [String: Any] }.compactMap { FamPos($0) }
    }

    func select(_ id: String, _ store: Store) {
        Haptics.shared.select()
        selected = id
        Task { await loadTrack(id, store) }
    }

    /* ---------- Egen deling ---------- */

    func setSharing(_ v: String, _ store: Store) {
        sharing = v
        Haptics.shared.select()
        putMe(["sharing": v], store)
        if v == "on" { FamilyLocation.shared.start(store, precise: precision == "exact") } else { FamilyLocation.shared.stop() }
    }

    func setPrecision(_ v: String, _ store: Store) {
        precision = v
        Haptics.shared.select()
        putMe(["precision": v], store)
        if sharing == "on" { FamilyLocation.shared.start(store, precise: v == "exact") }
    }

    func putMe(_ body: [String: Any], _ store: Store) {
        Task { _ = try? await store.api.callAt("/api", "PUT", "/family/me", json: body) }
    }

    /* ---------- Soner ---------- */

    /// Bare den som lagde sonen kan endre eller slette den. Eldre servere uten eier: alle soner regnes som egne.
    func zoneIsMine(_ z: FamZone) -> Bool {
        if let f = z.mineFlag { return f }
        if z.createdBy.isEmpty || meId.isEmpty { return true }
        return z.createdBy == meId
    }

    func saveZone(name: String, coord: CLLocationCoordinate2D, radius: Double, color: String, id: String?, shared: Bool = false, icon: String? = nil, _ store: Store) {
        var body: [String: Any] = ["name": name, "lat": coord.latitude, "lon": coord.longitude, "radius": radius, "color": color, "shared": shared]
        if let icon { body["icon"] = icon }
        Task {
            do {
                if let id {
                    let e = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
                    _ = try await store.api.callAt("/api", "PATCH", "/family/zones/\(e)", json: body)
                } else {
                    _ = try await store.api.callAt("/api", "POST", "/family/zones", json: body)
                }
                store.flash(id == nil ? "Sonen «\(name)» er lagt til" : "Sonen er lagret")
                await self.load(store)
            } catch {
                store.flash("Kunne ikke lagre sonen: \(error.localizedDescription)")
            }
        }
    }

    func deleteZone(_ z: FamZone, _ store: Store) {
        zones.removeAll { $0.id == z.id }
        let e = z.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? z.id
        Task { _ = try? await store.api.callAt("/api", "DELETE", "/family/zones/\(e)") }
    }

    func setNotify(_ z: FamZone, userId: String, enter: Bool, leave: Bool, _ store: Store) {
        if let i = zones.firstIndex(where: { $0.id == z.id }) { zones[i].notify[userId] = [enter, leave] }
        let e = z.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? z.id
        let body: [String: Any] = ["userId": userId, "enter": enter, "leave": leave]
        Task { _ = try? await store.api.callAt("/api", "PUT", "/family/zones/\(e)/notify", json: body) }
        if enter || leave { UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in } }
    }

    /* ---------- «Spill av lyd» på en annens telefon ---------- */

    var pingStore: Store?

    func ping(_ mem: FamMember) {
        guard let store = pingStore else { return }
        Haptics.shared.tap()
        let e = mem.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? mem.id
        Task { @MainActor in
            do {
                let d = try await store.api.callAt("/api", "POST", "/family/ping/\(e)")
                let ok = JS.bool(JS.obj(d), "delivered") ?? false
                store.flash(ok ? "\(mem.first) sin telefon spiller lyd nå" : "Sendt. \(mem.first) får lyden neste gang appen er tilkoblet.")
            } catch {
                store.flash("Kunne ikke nå \(mem.first): \(error.localizedDescription)")
            }
        }
    }

    /* ---------- Hendelser (soner) ---------- */

    /// Nye hendelser siden sist: vises som lokale varsler (når appen er åpen eller vekkes i bakgrunnen).
    func pollEvents(_ api: API) async {
        let since = Int(lastEventTs)
        guard let d = try? await api.callAt("/api", "GET", "/family/events?since=\(since)") else { return }
        let raw = (try? JSONSerialization.jsonObject(with: d)) as? [Any] ?? JS.list(JS.obj(d), "events")
        let list = raw.compactMap { $0 as? [String: Any] }.map { FamEvent($0) }
        var newest = lastEventTs
        for ev in list {
            let t = (ev.ts?.timeIntervalSince1970 ?? 0) * 1000
            if t <= lastEventTs { continue }
            newest = Swift.max(newest, t)
            if lastEventTs > 0 { notify(ev) }
        }
        lastEventTs = newest > 0 ? newest : Date().timeIntervalSince1970 * 1000
        UserDefaults.standard.set(lastEventTs, forKey: AcctScope.key("fh_fam_events_since"))
    }

    private func notify(_ ev: FamEvent) {
        guard NotifyModel.allowed("familie") else { return }
        // Prompt 45: hovedbryter, person og sone (mottakerens valg), og soneikonet i varselet (ZoneAlerts.swift).
        guard Zone45.shared.allows(person: ev.userId, zone: ev.zoneId) else { return }
        let z: FamZone? = zone(ev.zoneId)
        let title: String = z?.name ?? (ev.zoneName.isEmpty ? "Familie" : ev.zoneName)
        Zone45Notify.post(id: "fam-\(ev.id)", zoneId: ev.zoneId, title: title, body: eventText(ev),
                          icon: z?.icon ?? "pin", color: z?.color ?? "#2f6b4a")
    }

    func eventText(_ ev: FamEvent) -> String {
        if !ev.text.isEmpty { return ev.text }
        let who = member(ev.userId)?.first ?? (ev.name.isEmpty ? "Noen" : ev.name)
        let z = zone(ev.zoneId)?.name ?? (ev.zoneName.isEmpty ? "en sone" : ev.zoneName)
        return ev.kind == "leave" ? "\(who) forlot \(z)" : "\(who) kom til \(z)"
    }
}

/* ---------- Posisjon og sensorer (deles bare når brukeren har slått det på) ---------- */

/// Henter posisjon (mer sjelden i bakgrunnen med «betydelige endringer»), aktivitet fra CoreMotion og batteri,
/// og sender til /api/family/location høyst hvert 60. sekund eller etter 100 m.
final class FamilyLocation: NSObject, CLLocationManagerDelegate {
    static let shared = FamilyLocation()

    private let manager = CLLocationManager()
    private let motion = CMMotionActivityManager()
    private var activity = "still"
    private var lastSent: CLLocation?
    private var lastSentAt = Date.distantPast
    private var server = ""
    private var token: String?
    private var running = false
    private(set) var lastFix: Date?

    override init() {
        super.init()
        manager.delegate = self
        manager.pausesLocationUpdatesAutomatically = true
        manager.activityType = .other
    }

    var status: CLAuthorizationStatus { manager.authorizationStatus }

    /// Kontoen posisjonen sendes til (AcctScope-nøkkelen da delingen ble startet).
    private var boundScope: String = ""

    @MainActor func attach(_ store: Store) {
        server = store.api.base
        token = store.api.token
        boundScope = store.account?.scopeKey ?? ""
    }

    /// Starter delingen etter avtalen (sharing == "on" lokalt). Kalles ved oppstart og når valget endres.
    @MainActor func resume(_ store: Store) {
        attach(store)
        if UserDefaults.standard.string(forKey: AcctScope.key("fh_fam_sharing")) == "on" {
            start(store, precise: (UserDefaults.standard.string(forKey: AcctScope.key("fh_fam_precision")) ?? "exact") == "exact")
        }
    }

    @MainActor func start(_ store: Store, precise: Bool) {
        attach(store)
        manager.desiredAccuracy = precise ? kCLLocationAccuracyNearestTenMeters : kCLLocationAccuracyKilometer
        manager.distanceFilter = precise ? 50 : 500
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .denied, .restricted: return
        default: break
        }
        UIDevice.current.isBatteryMonitoringEnabled = true
        if CLLocationManager.significantLocationChangeMonitoringAvailable() { manager.startMonitoringSignificantLocationChanges() }
        if manager.authorizationStatus == .authorizedAlways { manager.allowsBackgroundLocationUpdates = true }
        manager.startUpdatingLocation()
        if CMMotionActivityManager.isActivityAvailable() && !running {
            motion.startActivityUpdates(to: .main) { [weak self] a in
                guard let self, let a else { return }
                self.activity = a.automotive ? "driving" : a.cycling ? "cycling" : a.running ? "running" : a.walking ? "walking" : "still"
            }
        }
        running = true
    }

    func requestAlways() { manager.requestAlwaysAuthorization() }

    func stop() {
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
        motion.stopActivityUpdates()
        running = false
    }

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        guard running else { return }
        if m.authorizationStatus == .authorizedAlways { m.allowsBackgroundLocationUpdates = true }
        if m.authorizationStatus == .authorizedAlways || m.authorizationStatus == .authorizedWhenInUse { m.startUpdatingLocation() }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last, loc.horizontalAccuracy >= 0 else { return }
        lastFix = Date()
        let far = lastSent.map { loc.distance(from: $0) > 100 } ?? true
        guard far || Date().timeIntervalSince(lastSentAt) > 60 else { return }
        lastSent = loc
        lastSentAt = Date()
        let act = activity
        Task { @MainActor in self.send(loc, activity: act) }
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {}

    /* ---------- Geofencing (soner) ---------- */

    /// Prompt 50: delingen er på (regionene registreres bare da), API-et og siste sendte posisjon (nærmeste steder).
    var running50: Bool { running }
    var api50: API? { server.isEmpty ? nil : API(base: server, token: token) }
    var last50: CLLocation? { lastSent ?? manager.location }

    /// Prompt 50: én CLCircularRegion per område (fam50-<stedId>:<områdeId>). Erstatter de gamle sone-regionene (fam-).
    func applyRegions50(_ list: [Fam50Region]) {
        for r in manager.monitoredRegions where r.identifier.hasPrefix("fam-") || r.identifier.hasPrefix("fam50-") { manager.stopMonitoring(for: r) }
        guard running, CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }
        let maxR: Double = manager.maximumRegionMonitoringDistance
        for x in list.prefix(20) {
            let radius: Double = Swift.min(Swift.max(x.radius, 25), maxR)
            let r: CLCircularRegion = CLCircularRegion(center: CLLocationCoordinate2D(latitude: x.lat, longitude: x.lon), radius: radius, identifier: "fam50-" + x.id)
            r.notifyOnEntry = true
            r.notifyOnExit = true
            manager.startMonitoring(for: r)
        }
    }

    /// Overvåker sonene med CLCircularRegion (maks 18; iOS tillater 20 per app). Bare når delingen er på.
    /// Prompt 50: brukes bare mot eldre server uten /api/family/places/regions.
    func syncZones(_ zones: [FamZone]) {
        for r in manager.monitoredRegions where r.identifier.hasPrefix("fam-") || r.identifier.hasPrefix("fam50-") { manager.stopMonitoring(for: r) }
        guard running, CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }
        let maxR = manager.maximumRegionMonitoringDistance
        for z in zones.prefix(18) {
            let radius = Swift.min(Swift.max(z.radius, 50), maxR)
            let r = CLCircularRegion(center: z.coord, radius: radius, identifier: "fam-" + z.id)
            r.notifyOnEntry = true
            r.notifyOnExit = true
            manager.startMonitoring(for: r)
        }
    }

    func locationManager(_ m: CLLocationManager, didEnterRegion region: CLRegion) { regionChanged(region) }
    func locationManager(_ m: CLLocationManager, didExitRegion region: CLRegion) { regionChanged(region) }

    /// Inn eller ut av en sone: hent en fersk posisjon og send den uten å vente på de vanlige 60 sekundene.
    private func regionChanged(_ r: CLRegion) {
        // Prompt 50: også områdene (fam50-) og skoleområdene i Min reise (school41-).
        guard r.identifier.hasPrefix("fam-") || r.identifier.hasPrefix("fam50-") || r.identifier.hasPrefix("school41-") else { return }
        if r.identifier.hasPrefix("school41-") && !running { return }
        lastSentAt = .distantPast
        lastSent = nil
        manager.requestLocation()
    }

    @MainActor private func send(_ loc: CLLocation, activity: String) {
        // Prompt 21: bare for kontoen som slo på delingen (og som fortsatt er den aktive).
        guard !server.isEmpty, !boundScope.isEmpty, boundScope == AcctScope.current,
              UserDefaults.standard.string(forKey: "fh_fam_sharing@" + boundScope) == "on" else { return }
        let dev = UIDevice.current
        // «Batteri og bevegelse» (Innstillinger → App → Helse og posisjon): av = uten batteri og aktivitet.
        let extras: Bool = (UserDefaults.standard.object(forKey: AcctScope.key("fh_share_battery")) as? Bool) ?? true
        var body: [String: Any] = [
            "lat": loc.coordinate.latitude, "lon": loc.coordinate.longitude, "acc": loc.horizontalAccuracy,
            "alt": loc.altitude, "activity": extras ? activity : "still", "ts": Int(loc.timestamp.timeIntervalSince1970 * 1000),
        ]
        if extras { body["charging"] = dev.batteryState == .charging || dev.batteryState == .full }
        if loc.speed >= 0 { body["speed"] = loc.speed }
        if loc.course >= 0 { body["heading"] = loc.course }
        if extras && dev.batteryLevel >= 0 { body["battery"] = Double(dev.batteryLevel) * 100 }
        body["device"] = "\(dev.model) · iOS \(dev.systemVersion)"
        // Prompt 24: én person = én oppføring. Fast id per installasjon, så serveren kan slå sammen enhetene.
        body["deviceId"] = Fam24Device.installId
        body["platform"] = "ios"
        let api = API(base: server, token: token)
        let app = UIApplication.shared
        let task = app.applicationState != .active ? app.beginBackgroundTask(withName: "familie-posisjon", expirationHandler: nil) : .invalid
        Task { @MainActor in
            _ = try? await api.callAt("/api", "POST", "/family/location", json: body, timeout: 20)
            await FamilyModel.shared.pollEvents(api)
            if task != .invalid { app.endBackgroundTask(task) }
        }
    }
}

/* ---------- Skjermene ---------- */

/// Prompt 22: Familie nøyaktig etter Familie.dc.html. Fanene (Kart, Soner, Helse) ligger i fanelinja nederst,
/// verktøyraden over kartet, Apple Maps (MapKit) i kartet (prompt 24) og egne komponenter (Family22*.swift).
struct FamilyView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var ctl: Fam22MapCtl = Fam22MapCtl()
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    private var tab: String { m.tab }
    /// Prompt 45: brettet modus (iPad) – kart til venstre (56 %, står stille), innholdet til høyre scroller (FamilyModel.swift, wideBody45).
    @Environment(\.paperWide) private var wide45

    var body: some View {
        Group {
            if wide45 { wideBody45 } else { phoneBody45 }
        }
        .overlay(alignment: .top) { Zone45Banner() }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: Zone45.shared.banner)
        .task { await refreshLoop() }
        .task { await Hjemlys40Model.shared.load(store) }
    }

    /// Prompt 45: to kolonner, 24 pt mellom. Kartet (med knapperaden over) står til venstre i alle fanene; i Soner viser det
    /// alle sonene og nye soner plasseres rett i kartet. Trykk på en person til høyre zoomer kartet (ingen sidebytte).
    private var wideBody45: some View {
        GeometryReader { (g: GeometryProxy) in
            HStack(alignment: .top, spacing: 24) {
                VStack(spacing: 12) {
                    Fam22Toolbar(placing: m.placing22, place: togglePlacing, fit: fitAll, refresh: refresh)
                    Fam22MapCard(zones: mapZones, pins: mapPins, trails: tab == "soner" ? [] : mapTrails, placing: m.placing22,
                                 liveOn: liveOn, liveText: liveText, ctl: ctl, fit: fitAll, onPin: { id in pickWide45(id) },
                                 onPlace: { c in place(c) }, height: Swift.max(460, g.size.height - 64))
                }
                .frame(width: Swift.max(320, (g.size.width - 24) * 0.56))
                ScrollView {
                    VStack(spacing: 14) { rightColumn45 }
                        .padding(.bottom, 24)
                }
                .scrollIndicators(.hidden)
                .frame(minWidth: 300, maxWidth: .infinity)
            }
        }
    }

    @ViewBuilder private var rightColumn45: some View {
        if let e = m.error { errorCard(e) }
        if tab == "kart" { VelFremmeStatus42() }
        if tab == "soner" {
            Zone45Card()
            ZonesAddRow42(placing: m.placing22, start: startZone, cancel: cancelZone)
        }
        tabContent45
    }

    @ViewBuilder private var tabContent45: some View {
        switch tab {
        case "hjemlys": Hjemlys41Tab()
        case "soner":
            Fam22ZonesTab { z in
                ctl.focusZone(z.coord, radius: z.radius)
            }
        case "helse": Fam22HealthTab()
        default: kartTab
        }
    }

    /// Trykk på en pin: personens kort åpnes øverst i høyre kolonne (Kart-fanen).
    private func pickWide45(_ id: String) {
        if tab != "kart" { m.tab = "kart" }
        pick(id)
    }

    private var phoneBody45: some View {
        VStack(spacing: 14) {
            if let e = m.error { errorCard(e) }
            // Prompt 42: ingen Vel fremme-kort (tidligere Hjemlys) øverst på Kart – bare en liten statuslinje mens en økt pågår
            // (FamilyArrivals.swift). Vel fremme startes fra fanen Vel fremme.
            if tab == "kart" { VelFremmeStatus42() }
            // Prompt 42: kartet og verktøyraden bare på Kart. Soner viser kartet midlertidig mens en ny sone plasseres/redigeres.
            if tab == "kart" { mapSection }
            if tab == "soner" {
                // Prompt 45: «Posisjonsvarsler» med hovedbryter og bryter per person (ZoneAlerts.swift).
                Zone45Card()
                ZonesAddRow42(placing: m.placing22, start: startZone, cancel: cancelZone)
                if m.placing22 || m.draft22 != nil { zoneMap }
            }
            switch tab {
            // Prompt 41: Familie → Hjemlys – start, si fra, velg personer, klar, aktiv og sendt (HjemlysSharingViews.swift).
            // Prompt 42: heter Vel fremme.
            case "hjemlys":
                Hjemlys41Tab()
            case "soner":
                // Prompt 42: «Vis på kart» åpner Kart-fanen sentrert på sonen.
                Fam22ZonesTab { z in
                    m.tab = "kart"
                    ctl.focusZone(z.coord, radius: z.radius)
                }
            case "helse":
                Fam22HealthTab()
            default:
                kartTab
            }
        }
        // Prompt 42: bare Kart-fanen har verktøyraden delvis over toppbildet; de andre fanene starter 16 pt under bildet.
        .padding(.top, tab == "kart" ? 0 : 39)
    }

    private func errorCard(_ e: String) -> some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        return Text(e).font(PF.ui(13)).foregroundStyle(t.lab).fixedSize(horizontal: false, vertical: true)
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
    }

    /// Henter på nytt hvert 30. sekund mens siden er åpen. Første gang zoomes kartet så alle vises.
    private func refreshLoop() async {
        // Prompt 50: når serveren får /api/family/people50, byttes det til det nye designet (FamilyPage.swift).
        await Fam50Model.shared.loadPeople(store)
        await m.load(store)
        for mem in m.members { await Fam22Photos.shared.ensure(mem, store) }
        if !ctl.fitted { ctl.fitted = true; ctl.fit(pinned.compactMap { $0.last?.coord }) }
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 30_000_000_000)
            if Task.isCancelled { break }
            await m.load(store)
        }
    }

    /* ---------- Verktøyrad og kart ---------- */

    @ViewBuilder private var mapSection: some View {
        Fam22Toolbar(placing: m.placing22, place: togglePlacing, fit: fitAll, refresh: refresh)
        Fam22MapCard(zones: mapZones, pins: mapPins, trails: mapTrails, placing: m.placing22, liveOn: liveOn, liveText: liveText,
                     ctl: ctl, fit: fitAll, onPin: { id in pick(id) }, onPlace: { c in place(c) })
    }

    private var pinned: [FamMember] { m.members.filter { Fam22Where.shareOk($0) } }

    private var liveOn: Bool { m.sharing == "on" }
    private var liveText: String { m.sharing == "on" ? "Sanntid · din GPS er på" : "Sanntid · din deling er av" }

    private var mapZones: [Fam22MapZone] {
        var out: [Fam22MapZone] = m.zones.map { (z: FamZone) -> Fam22MapZone in
            Fam22MapZone(id: z.id, coord: z.coord, radius: z.radius, color: z.color, icon: z.icon, name: z.name, draft: false)
        }
        if let d = m.draft22 {
            out.append(Fam22MapZone(id: "draft", coord: d.coord, radius: d.radius, color: d.color, icon: d.iconKey, name: d.name, draft: true))
        }
        return out
    }

    private var mapPins: [Fam22MapPin] {
        pinned.compactMap { (mem: FamMember) -> Fam22MapPin? in
            guard let pos = mem.last else { return nil }
            let isMe: Bool = mem.id == m.meId
            return Fam22MapPin(id: mem.id, coord: pos.coord, color: Color(hex: Fam22Fmt.color(mem)),
                               ini: isMe ? "Du" : Fam22Fmt.ini(mem), photo: Fam22Photos.shared.image(mem.id),
                               selected: m.selected == mem.id, speed: Fam22Fmt.kmh(pos))
        }
    }

    private var mapTrails: [Fam22Trail] {
        pinned.compactMap { (mem: FamMember) -> Fam22Trail? in
            let coords: [CLLocationCoordinate2D]
            if m.selected == mem.id && m.track.count > 1 {
                coords = m.track.suffix(31).map(\.coord)
            } else {
                coords = m.trails[mem.id] ?? []
            }
            guard coords.count > 1 else { return nil }
            return Fam22Trail(id: mem.id, color: Fam22Fmt.color(mem), coords: coords)
        }
    }

    /// Prompt 42: kartet i Soner (plasseringsmodus) uten verktøyraden «Vis alle / ↻».
    @ViewBuilder private var zoneMap: some View {
        Fam22MapCard(zones: mapZones, pins: mapPins, trails: [], placing: m.placing22, liveOn: liveOn, liveText: liveText,
                     ctl: ctl, fit: fitAll, onPin: { id in pick(id) }, onPlace: { c in place(c) })
    }

    private func startZone() {
        Haptics.shared.select()
        m.draft22 = nil
        m.placing22 = true
    }

    private func cancelZone() {
        Haptics.shared.select()
        m.placing22 = false
        m.draft22 = nil
    }

    private func togglePlacing() {
        Haptics.shared.select()
        m.draft22 = nil
        m.placing22.toggle()
    }

    private func place(_ c: CLLocationCoordinate2D) {
        Haptics.shared.tap()
        let color: String = Fam22Icons.draftColors[m.zones.count % Fam22Icons.draftColors.count]
        m.draft22 = Fam22Draft(name: "", lat: c.latitude, lon: c.longitude, radius: 200, color: color, icon: nil, shared: false)
        m.placing22 = false
        m.tab = "soner"
    }

    private func fitAll() { ctl.fit(pinned.compactMap { $0.last?.coord }) }

    private func refresh() {
        Haptics.shared.tap()
        Task {
            await m.load(store)
            store.flash("Posisjoner oppdatert")
        }
    }

    private func pick(_ id: String) {
        m.select(id, store)
        if let c = m.member(id)?.last?.coord { ctl.focusPerson(c) }
    }

    /* ---------- Kart-fanen ---------- */

    @ViewBuilder private var kartTab: some View {
        if let id = m.selected, let mem = m.member(id), Fam22Where.shareOk(mem) {
            Fam22PersonCard(mem: mem) { m.selected = nil; m.track = [] }
        }
        if !m.loaded && m.members.isEmpty {
            errorCardMuted("Henter familien …")
        } else {
            Fam22PeopleList(members: orderedMembers, meId: m.meId) { mem in pick(mem.id) }
        }
        if m.loaded && othersSharing.isEmpty {
            // Prompt 21: deling er av som standard. Bare de som selv slår på deling, vises med posisjon.
            FamilyEmptyShare21()
        }
        if !m.events.isEmpty { Fam22Events(events: m.events) }
        Fam22MyShare()
    }

    private func errorCardMuted(_ s: String) -> some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        return Text(s).font(PF.ui(13.5)).foregroundStyle(t.mut)
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
    }

    /// Deg først, så de andre.
    private var orderedMembers: [FamMember] {
        let me: [FamMember] = m.members.filter { $0.id == m.meId }
        let rest: [FamMember] = m.members.filter { $0.id != m.meId }
        return me + rest
    }

    private var othersSharing: [FamMember] {
        m.members.filter { $0.id != m.meId && $0.sharing == "on" }
    }
}

/// Innstillinger → Familie og helse: deling (på, pause, av), nøyaktig eller omtrentlig, posisjonstilgang og Apple Helse.
struct FamilySettingsView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: FamilyModel { FamilyModel.shared }
    @MainActor private var h: HealthSync { HealthSync.shared }
    @State private var tick = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Deling av posisjon").padding(.leading, 4).padding(.top, 6)
            segment([("on", "På"), ("paused", "Pause"), ("off", "Av")], m.sharing) { m.setSharing($0, store) }
            Text("Av som standard. Bare de du deler med ser hvor du er, og helse vises aldri når delingen er av eller pauset.").font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 4)
                .fixedSize(horizontal: false, vertical: true)
            PLabel(text: "Hvor nøyaktig").padding(.leading, 4).padding(.top, 14)
            segment([("exact", "Nøyaktig"), ("approx", "Omtrentlig (ca. 1 km)")], m.precision) { m.setPrecision($0, store) }
            PLabel(text: "Tilgang").padding(.leading, 4).padding(.top, 14)
            PaperLinkList(rows: [
                PaperLinkRow(name: "Posisjon", sub: locationText, value: FamilyLocation.shared.status == .authorizedAlways ? "Alltid" : "Endre ›", icon: "location") { askAlways() },
                PaperLinkRow(name: "Varsler for soner", sub: "Når noen kommer til eller forlater en sone", value: "Slå på ›", icon: "bell") {
                    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
                },
            ])
            PLabel(text: "Apple Helse").padding(.leading, 4).padding(.top, 14)
            healthCard
        }
        .onAppear { tick += 1 }
    }

    private var locationText: String {
        switch FamilyLocation.shared.status {
        case .authorizedAlways: return "Deles også når appen er lukket"
        case .authorizedWhenInUse: return "Bare når appen er åpen · trykk for «Alltid»"
        case .denied, .restricted: return "Avslått · slå på i iOS-innstillingene"
        default: return "Ikke spurt ennå"
        }
    }

    private func askAlways() {
        let st = FamilyLocation.shared.status
        if st == .denied || st == .restricted {
            if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
        } else if st == .notDetermined {
            FamilyLocation.shared.start(store, precise: m.precision == "exact")
        } else {
            FamilyLocation.shared.requestAlways()
        }
    }

    private var healthCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !h.available {
                Text("Apple Helse finnes ikke på denne enheten.").font(PF.ui(13)).foregroundStyle(p.mut).padding(14)
            } else {
                ForEach(Array(HealthSync.kinds.enumerated()), id: \.element.0) { i, k in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    HStack {
                        Image(systemName: k.2).font(.dyn51(size: 14, weight: .semibold)).foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(PaperIconTheme.color(store.iconTheme, i), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        Text(k.1).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                        Spacer()
                        let on = h.share[k.0] ?? false
                        Button { h.setShare(k.0, !on, store) } label: { PaperSwitch(on: on) }
                            .buttonStyle(.plain)
                            .accessibilityLabel(k.1)
                            .accessibilityValue(on ? "På" : "Av")
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                }
                Rectangle().fill(p.line).frame(height: 1)
                VStack(alignment: .leading, spacing: 8) {
                    Text(h.statusText).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    PInkButton(title: "Send helsedata nå", height: 40, full: true) { Task { await h.syncNow(store.api) } }
                }
                .padding(14)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.top, 8)
    }

    private func segment(_ opts: [(String, String)], _ cur: String, _ pick: @escaping (String) -> Void) -> some View {
        HStack(spacing: 4) {
            ForEach(opts, id: \.0) { k, n in
                let on = cur == k
                Button { pick(k) } label: {
                    Text(n).font(PF.ui(13, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(on ? p.ink : Color.clear, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(p.card, in: Capsule())
        .padding(.top, 8)
    }
}

/* ---------- Helse (fanen i Familie) ---------- */
