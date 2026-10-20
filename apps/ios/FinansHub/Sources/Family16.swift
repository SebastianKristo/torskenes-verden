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
        FamilyLocation.shared.syncZones(zones)
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
        let c = UNMutableNotificationContent()
        c.title = "Familie"
        c.body = eventText(ev)
        c.sound = NotifyModel.currentSound()
        let r = UNNotificationRequest(identifier: "fam-\(ev.id)", content: c, trigger: nil)
        UNUserNotificationCenter.current().add(r)
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

    /// Overvåker sonene med CLCircularRegion (maks 18; iOS tillater 20 per app). Bare når delingen er på.
    func syncZones(_ zones: [FamZone]) {
        for r in manager.monitoredRegions where r.identifier.hasPrefix("fam-") { manager.stopMonitoring(for: r) }
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
        guard r.identifier.hasPrefix("fam-") else { return }
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

/// Toppbildet på Familie: et lite kart i papirfarger.
struct FamilyHeroArt: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: "#3f6b4f"), Color(hex: "#2a4a3a"), Color(hex: "#1d2a24")], startPoint: .topLeading, endPoint: .bottomTrailing)
            GeometryReader { g in
                let w = g.size.width, h = g.size.height
                ForEach(0..<6, id: \.self) { i in
                    Path { p in
                        let y = h * (0.15 + Double(i) * 0.15)
                        p.move(to: CGPoint(x: 0, y: y))
                        p.addCurve(to: CGPoint(x: w, y: y + h * 0.08), control1: CGPoint(x: w * 0.3, y: y - h * 0.1), control2: CGPoint(x: w * 0.7, y: y + h * 0.15))
                    }
                    .stroke(Color.white.opacity(0.08), lineWidth: 1.5)
                }
                Circle().fill(Color(hex: "#f08a76")).frame(width: 14, height: 14).overlay(Circle().stroke(.white, lineWidth: 3)).position(x: w * 0.72, y: h * 0.38)
                Circle().stroke(Color(hex: "#f08a76").opacity(0.5), lineWidth: 2).frame(width: 90, height: 90).position(x: w * 0.72, y: h * 0.38)
            }
        }
    }
}

/// Prompt 22: Familie nøyaktig etter Familie.dc.html. Fanene (Kart, Soner, Helse) ligger i fanelinja nederst,
/// verktøyraden over kartet, Apple Maps (MapKit) i kartet (prompt 24) og egne komponenter (Family22*.swift).
struct FamilyView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var ctl: Fam22MapCtl = Fam22MapCtl()
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    private var tab: String { m.tab }

    var body: some View {
        VStack(spacing: 14) {
            if let e = m.error { errorCard(e) }
            // Prompt 40: Hjemlys (status for husstanden + enkel start), Hjemlys40.swift.
            if tab != "helse" { Hjemlys40Card() }
            if tab != "helse" { mapSection }
            switch tab {
            case "soner":
                Fam22ZonesTab { z in ctl.focusZone(z.coord, radius: z.radius) }
            case "helse":
                Fam22HealthTab()
            default:
                kartTab
            }
        }
        .task { await refreshLoop() }
    }

    private func errorCard(_ e: String) -> some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        return Text(e).font(PF.ui(13)).foregroundStyle(t.lab).fixedSize(horizontal: false, vertical: true)
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
    }

    /// Henter på nytt hvert 30. sekund mens siden er åpen. Første gang zoomes kartet så alle vises.
    private func refreshLoop() async {
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

/// Markøren på kartet: profilbokstav i en sirkel med retning.
struct FamilyPin: View {
    let member: FamMember
    let selected: Bool
    var body: some View {
        ZStack {
            Circle().fill(selected ? Color(hex: "#b23a2a") : Color(hex: "#1b1a17")).frame(width: 36, height: 36)
            Text(member.initial).font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
        }
        .overlay(Circle().stroke(.white, lineWidth: 3))
        .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
    }
}

/// Kort for én person: status, sist sett, fart, batteri, lading, aktivitet, nøyaktighet og helse.
struct FamilyMemberCard: View {
    @Environment(\.paper) private var p
    let member: FamMember
    let selected: Bool
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            VStack(alignment: .leading, spacing: 10) {
                header
                if member.sharing == "on", let pos = member.last { sensors(pos) }
                if let h = member.health { health(h) }
                if selected, member.sharing == "on", let pos = member.last { details(pos) }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(selected ? p.ink : Color.clear, lineWidth: 2))
        }
        .buttonStyle(.plain)
    }

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(p.ink)
                Text(member.initial).font(PF.serif(20, medium: true)).foregroundStyle(p.bg)
            }
            .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 1) {
                Text(member.name).font(PF.serif(19, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                Text(statusLine).font(PF.ui(12.5)).foregroundStyle(member.sharing == "on" ? p.mut : p.lab).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    private var statusLine: String {
        if member.sharing == "paused" { return "Delingen er pauset" }
        if member.sharing == "off" { return "Deler ikke posisjon" }
        guard let pos = member.last else { return "Ingen posisjon ennå" }
        var parts: [String] = []
        if !pos.place.isEmpty { parts.append(pos.place) }
        if let t = pos.ts { parts.append(ago(t)) }
        if member.precision == "approx" { parts.append("omtrentlig") }
        return parts.joined(separator: " · ")
    }

    private func sensors(_ pos: FamPos) -> some View {
        ScrollView(.horizontal, showsIndicators: false) { sensorRow(pos) }
    }

    private func sensorRow(_ pos: FamPos) -> some View {
        HStack(spacing: 6) {
            chip(icon: activityIcon(pos.activity), text: activityName(pos.activity))
            if let s = pos.speed, s > 0.5 { chip(icon: "speedometer", text: "\(Int((s * 3.6).rounded())) km/t") }
            if let b = pos.battery { chip(icon: pos.charging ? "battery.100.bolt" : batteryIcon(b), text: "\(Int(b.rounded())) %") }
            if let a = pos.acc { chip(icon: "scope", text: "±\(Int(a.rounded())) m") }
        }
    }

    /// Valgt person: koordinater, nøyaktighet, sist oppdatert og veibeskrivelse i Kart.
    private func details(_ pos: FamPos) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle().fill(p.line).frame(height: 1)
            HStack(spacing: 8) {
                stat("Koordinater", String(format: "%.4f, %.4f", pos.lat, pos.lon))
                if let a = pos.acc { stat("Nøyaktighet", "±\(Int(a.rounded())) m") }
            }
            HStack(spacing: 8) {
                if let t = pos.ts { stat("Oppdatert", ago(t)) }
                stat("Presisjon", member.precision == "approx" ? "Omtrentlig" : "Nøyaktig")
            }
            if !pos.device.isEmpty { stat("Enhet", pos.device) }
            HStack(spacing: 8) {
                Button {
                    if let u = URL(string: "http://maps.apple.com/?daddr=\(pos.lat),\(pos.lon)&dirflg=d") { UIApplication.shared.open(u) }
                } label: {
                    Text("Veibeskrivelse").font(PF.ui(13.5, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 40)
                        .background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                if member.id != FamilyModel.shared.meId {
                    Button { FamilyModel.shared.ping(member) } label: {
                        Text("Spill av lyd").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 40)
                            .overlay(Capsule().stroke(p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func chip(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 11, weight: .semibold))
            Text(text).font(PF.ui(11.5, .semibold)).fixedSize()
        }
        .foregroundStyle(p.ink)
        .padding(.horizontal, 8).frame(height: 26)
        .background(p.popSel, in: Capsule())
    }

    private func health(_ h: FamHealth) -> some View {
        HStack(spacing: 8) {
            if let s = h.steps { stat("Skritt", n0(s)) }
            if let r = h.restingHr { stat("Hvilepuls", "\(Int(r))") }
            if let s = h.sleepMin { stat("Søvn", "\(Int(s) / 60) t \(Int(s) % 60) m") }
            if let k = h.activeKcal { stat("Aktive kcal", n0(k)) }
        }
    }

    private func stat(_ k: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(k.uppercased()).font(PF.mono(9, bold: false)).foregroundStyle(p.mut).fixedSize()
            Text(v).font(PF.serif(16, medium: true)).foregroundStyle(p.ink).fixedSize()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func ago(_ d: Date) -> String {
        let s = Date().timeIntervalSince(d)
        if s < 90 { return "nå" }
        if s < 3600 { return "\(Int(s / 60)) min siden" }
        if Calendar.current.isDateInToday(d) { return "kl. " + JS.fmt(d, "HH:mm") }
        return JS.fmt(d, "dd.MM HH:mm")
    }

    private func activityIcon(_ a: String) -> String {
        switch a {
        case "walking": return "figure.walk"
        case "running": return "figure.run"
        case "cycling": return "bicycle"
        case "driving": return "car.fill"
        default: return "figure.stand"
        }
    }

    private func activityName(_ a: String) -> String {
        switch a {
        case "walking": return "Går"
        case "running": return "Løper"
        case "cycling": return "Sykler"
        case "driving": return "Kjører"
        default: return "I ro"
        }
    }

    private func batteryIcon(_ b: Double) -> String {
        b > 75 ? "battery.100" : b > 50 ? "battery.75" : b > 25 ? "battery.50" : b > 10 ? "battery.25" : "battery.0"
    }
}

/// Ny eller endret sone: navn, radius, farge og varsel per person.
struct FamilyZoneSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    let zone: FamZone?
    let coord: CLLocationCoordinate2D?
    @State private var name = ""
    @State private var radius: Double = 150
    @State private var color = "#b23a2a"
    @State private var shared: Bool = false
    @MainActor private var m: FamilyModel { FamilyModel.shared }
    private static let colors = ["#b23a2a", "#2f7a4f", "#2f5d8a", "#c27a1a", "#6b4fa0", "#1f7a7a"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(zone == nil ? "Ny sone" : "Rediger sone").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                field
                VStack(alignment: .leading, spacing: 6) {
                    PLabel(text: "Radius · \(Int(radius)) m")
                    Slider(value: $radius, in: 50...2000, step: 25).tint(Color(hex: color))
                }
                VStack(alignment: .leading, spacing: 6) {
                    PLabel(text: "Farge")
                    HStack(spacing: 10) {
                        ForEach(FamilyZoneSheet.colors, id: \.self) { c in
                            Button { color = c } label: {
                                Circle().fill(Color(hex: c)).frame(width: 32, height: 32).overlay(Circle().stroke(p.ink, lineWidth: color == c ? 3 : 0))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if canEdit { FamilyZoneShareRow21(on: $shared) }
                if let z = zone { notifyList(z) }
                if canEdit {
                    HStack(spacing: 8) {
                        if let z = zone {
                            PLineButton(title: "Slett", height: 44) { m.deleteZone(z, store); close() }
                        }
                        PInkButton(title: "Lagre", height: 44, full: true) { save() }
                    }
                } else {
                    Text("Sonen er delt med deg. Bare den som lagde den kan endre eller slette den.")
                        .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(18)
        }
        .onAppear {
            if let z = zone { name = z.name; radius = z.radius; color = z.color; shared = z.shared }
        }
    }

    private var field: some View {
        VStack(alignment: .leading, spacing: 6) {
            PLabel(text: "Navn")
            TextField("F.eks. Hjemme", text: $name).font(PF.serif(20)).foregroundStyle(p.ink)
            Rectangle().fill(p.lab).frame(height: 2)
        }
    }

    private func notifyList(_ z: FamZone) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            PLabel(text: "Varsel per person")
            VStack(spacing: 0) {
                ForEach(Array(m.members.enumerated()), id: \.element.id) { i, mem in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    notifyRow(z, mem)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private func notifyRow(_ z: FamZone, _ mem: FamMember) -> some View {
        let cur = m.zone(z.id)?.notify[mem.id] ?? [false, false]
        let enter = cur.first ?? false
        let leave = cur.count > 1 ? cur[1] : false
        return HStack(spacing: 8) {
            Text(mem.first).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
            Spacer()
            toggle("Kommer", enter) { m.setNotify(z, userId: mem.id, enter: !enter, leave: leave, store) }
            toggle("Forlater", leave) { m.setNotify(z, userId: mem.id, enter: enter, leave: !leave, store) }
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
    }

    private func toggle(_ t: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(12, .semibold)).foregroundStyle(on ? p.onLab : p.ink).fixedSize()
                .padding(.horizontal, 10).frame(height: 30)
                .background(on ? p.lab : p.popSel, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func save() {
        let n = name.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty, let c = coord ?? zone?.coord else { store.flash("Skriv inn et navn på sonen"); return }
        m.saveZone(name: n, coord: c, radius: radius, color: color, id: zone?.id, shared: shared, store)
        close()
    }

    private var canEdit: Bool {
        guard let z = zone else { return true }
        return m.zoneIsMine(z)
    }

    private func close() {
        m.zoneDraft = nil
        m.zoneEdit = nil
        dismiss()
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
                        Image(systemName: k.2).font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
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

/// Helse per person: skritt mot mål, hvilepuls, puls nå, søvn i natt, aktive kalorier og snitt siste 7 dager.
struct FamilyHealthView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { store.paperGo("innst-helse") } label: {
                HStack(spacing: 12) {
                    Image(systemName: "heart.fill").foregroundStyle(p.lab)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Apple Helse").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                        Text("Velg hva du deler med familien. Bare et sammendrag synkes, omtrent hvert 15. minutt.").font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    Text("›").foregroundStyle(p.mut)
                }
                .padding(14)
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
            .buttonStyle(.plain)
            if HealthNoData20.shouldShow(m) { HealthNoData20() }
            let withHealth = m.members.filter { $0.health != nil }
            if withHealth.isEmpty {
                PCard { Text(m.loaded ? "Ingen deler helsedata ennå." : "Henter …").font(PF.ui(13.5)).foregroundStyle(p.mut) }
            }
            ForEach(withHealth) { mem in card(mem) }
        }
    }

    private func card(_ mem: FamMember) -> some View {
        let h = mem.health
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(mem.name).font(PF.serif(19, medium: true)).foregroundStyle(p.ink)
                Spacer()
                if let u = h?.updated { Text(JS.fmt(u, Calendar.current.isDateInToday(u) ? "'i dag' HH:mm" : "dd.MM HH:mm")).font(PF.ui(11.5)).foregroundStyle(p.mut) }
            }
            if let steps = h?.steps { progress("Skritt", n0(steps), "mål 10 000", Swift.min(1, steps / 10000)) }
            if let sleep = h?.sleepMin { progress("Søvn i natt", "\(Int(sleep) / 60) t \(Int(sleep) % 60) m", "mål 8 t", Swift.min(1, sleep / 480)) }
            HStack(spacing: 8) {
                if let r = h?.restingHr { tile("Hvilepuls", "\(Int(r))", "slag/min") }
                if let r = h?.hr { tile("Puls nå", "\(Int(r))", "slag/min") }
                if let k = h?.activeKcal { tile("Aktive kalorier", n0(k), "kcal") }
            }
            if let week = h?.week, !week.isEmpty { weekBars(week) }
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func progress(_ k: String, _ v: String, _ goal: String, _ frac: Double) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline) {
                Text(k.uppercased()).font(PF.mono(9.5)).tracking(1).foregroundStyle(p.mut)
                Spacer()
                Text(goal).font(PF.ui(11.5)).foregroundStyle(p.mut)
            }
            Text(v).font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(p.line)
                    Capsule().fill(frac >= 1 ? p.pos : p.lab).frame(width: g.size.width * frac)
                }
            }
            .frame(height: 6)
        }
    }

    private func tile(_ k: String, _ v: String, _ unit: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(k.uppercased()).font(PF.mono(9)).tracking(0.8).foregroundStyle(p.mut).lineLimit(1).minimumScaleFactor(0.7)
            Text(v).font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
            Text(unit).font(PF.ui(11)).foregroundStyle(p.mut)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func weekBars(_ week: [Double]) -> some View {
        let top = Swift.max(1, week.max() ?? 1)
        let avg = week.reduce(0, +) / Double(week.count)
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("SNITT SISTE 7 DAGER").font(PF.mono(9.5)).tracking(1).foregroundStyle(p.mut)
                Spacer()
                Text("\(n0(avg)) skritt").font(PF.ui(12, .semibold)).foregroundStyle(p.ink)
            }
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(Array(week.suffix(7).enumerated()), id: \.offset) { _, v in
                    RoundedRectangle(cornerRadius: 4, style: .continuous).fill(p.ink.opacity(0.8)).frame(height: Swift.max(4, 54 * v / top))
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 56, alignment: .bottom)
        }
    }
}
