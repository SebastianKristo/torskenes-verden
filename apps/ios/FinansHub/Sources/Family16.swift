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

    init(_ o: [String: Any]) {
        id = JS.str(o, "userId") ?? JS.str(o, "id") ?? UUID().uuidString
        name = JS.str(o, "name") ?? JS.str(o, "username") ?? "Ukjent"
        username = JS.str(o, "username") ?? ""
        avatarUrl = JS.str(o, "avatarUrl") ?? ""
        sharing = JS.str(o, "sharing") ?? "on"
        precision = JS.str(o, "precision") ?? "exact"
        last = FamPos(JS.dict(o, "last"))
        health = FamHealth(JS.dict(o, "health"))
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

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        name = JS.str(o, "name") ?? "Sone"
        lat = JS.num(o, "lat") ?? 0
        lon = JS.num(o, "lon") ?? 0
        radius = JS.num(o, "radius") ?? 150
        color = JS.str(o, "color") ?? "#b23a2a"
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
    var sharing = UserDefaults.standard.string(forKey: "fh_fam_sharing") ?? "off" {
        didSet { UserDefaults.standard.set(sharing, forKey: "fh_fam_sharing") }
    }
    var precision = UserDefaults.standard.string(forKey: "fh_fam_precision") ?? "exact" {
        didSet { UserDefaults.standard.set(precision, forKey: "fh_fam_precision") }
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
    private var lastEventTs: Double = UserDefaults.standard.double(forKey: "fh_fam_events_since")

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
        members = JS.list(o, "members").map { FamMember($0) }
        zones = JS.list(o, "zones").map { FamZone($0) }
        // Geofencing i iOS: inn og ut av sonene sendes til serveren med en gang, også når appen er lukket.
        FamilyLocation.shared.syncZones(zones)
        events = JS.list(o, "events").map { FamEvent($0) }
        if selected == nil { selected = members.first { $0.last != nil }?.id }
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

    func saveZone(name: String, coord: CLLocationCoordinate2D, radius: Double, color: String, id: String?, _ store: Store) {
        let body: [String: Any] = ["name": name, "lat": coord.latitude, "lon": coord.longitude, "radius": radius, "color": color]
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
        UserDefaults.standard.set(lastEventTs, forKey: "fh_fam_events_since")
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

    @MainActor func attach(_ store: Store) {
        server = store.api.base
        token = store.api.token
    }

    /// Starter delingen etter avtalen (sharing == "on" lokalt). Kalles ved oppstart og når valget endres.
    @MainActor func resume(_ store: Store) {
        attach(store)
        if UserDefaults.standard.string(forKey: "fh_fam_sharing") == "on" {
            start(store, precise: (UserDefaults.standard.string(forKey: "fh_fam_precision") ?? "exact") == "exact")
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
        guard !server.isEmpty, UserDefaults.standard.string(forKey: "fh_fam_sharing") == "on" else { return }
        let dev = UIDevice.current
        var body: [String: Any] = [
            "lat": loc.coordinate.latitude, "lon": loc.coordinate.longitude, "acc": loc.horizontalAccuracy,
            "alt": loc.altitude, "activity": activity, "ts": Int(loc.timestamp.timeIntervalSince1970 * 1000),
            "charging": dev.batteryState == .charging || dev.batteryState == .full,
        ]
        if loc.speed >= 0 { body["speed"] = loc.speed }
        if loc.course >= 0 { body["heading"] = loc.course }
        if dev.batteryLevel >= 0 { body["battery"] = Double(dev.batteryLevel) * 100 }
        body["device"] = "\(dev.model) · iOS \(dev.systemVersion)"
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

struct FamilyView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var camera: MapCameraPosition = .automatic
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    @State private var tab = "kart"

    var body: some View {
        VStack(spacing: 10) {
            tabs
            if let e = m.error { PCard { Text(e).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true) } }
            switch tab {
            case "soner":
                mapCard
                zonesCard
            case "helse":
                FamilyHealthView()
            default:
                mapCard
                mySharing
                people
                eventsCard
            }
        }
        .task {
            await m.load(store)
            if pinned.isEmpty {
                // Ingen posisjoner ennå: vis Oslo i stedet for et tomt verdenskart.
                camera = .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522), latitudinalMeters: 12000, longitudinalMeters: 12000))
            } else {
                focusSelected()
            }
        }
        .sheet(isPresented: Binding(get: { m.addingZone }, set: { m.addingZone = $0 })) {
            FamilyZoneSheet(zone: m.zoneEdit, coord: m.zoneDraft ?? m.zoneEdit?.coord)
                .environment(\.paper, p).presentationDetents([.medium, .large]).presentationBackground(p.bg)
        }
    }

    /* ---------- Faner: Kart, Soner og Helse ---------- */

    private var tabs: some View {
        HStack(spacing: 4) {
            ForEach([("kart", "Kart"), ("soner", "Soner"), ("helse", "Helse")], id: \.0) { t in
                Button { tab = t.0; Haptics.shared.select() } label: {
                    Text(t.1).font(PF.ui(14, .semibold)).foregroundStyle(tab == t.0 ? p.bg : p.ink)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(tab == t.0 ? p.ink : Color.clear, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(p.card, in: Capsule())
    }

    /* ---------- Kart ---------- */

    private var mapCard: some View {
        VStack(spacing: 0) {
            MapReader { proxy in
                Map(position: $camera) {
                    ForEach(m.zones) { z in
                        MapCircle(center: z.coord, radius: z.radius)
                            .stroke(Color(hex: z.color), lineWidth: 2)
                            .foregroundStyle(Color(hex: z.color).opacity(0.18))
                        Annotation(z.name, coordinate: z.coord, anchor: .center) {
                            Text(z.name).font(PF.ui(10.5, .bold)).foregroundStyle(.white).padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color(hex: z.color), in: Capsule())
                        }
                    }
                    MapPolyline(coordinates: m.track.count > 1 ? m.track.map(\.coord) : [])
                        .stroke(Color(hex: "#b23a2a"), lineWidth: 3)
                    ForEach(pinned) { mem in
                        Annotation(mem.first, coordinate: mem.last?.coord ?? CLLocationCoordinate2D(), anchor: .center) {
                            FamilyPin(member: mem, selected: m.selected == mem.id)
                                .onTapGesture {
                                    m.select(mem.id, store)
                                    if let c = mem.last?.coord { focus(c) }
                                }
                        }
                    }
                }
                .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
                .onTapGesture { pt in
                    guard m.zoneDraft == nil, let c = proxy.convert(pt, from: .local) else { return }
                    if zonePickMode {
                        m.zoneDraft = c
                        m.zoneEdit = nil
                        m.addingZone = true
                        zonePickMode = false
                    }
                }
            }
            .frame(height: 300)
            HStack(spacing: 8) {
                Button { zonePickMode.toggle(); Haptics.shared.select() } label: {
                    Text(zonePickMode ? "Trykk på kartet …" : "+ Ny sone").font(PF.ui(13, .semibold))
                        .foregroundStyle(zonePickMode ? p.onLab : p.ink).padding(.horizontal, 14).frame(height: 34)
                        .background(zonePickMode ? p.lab : p.popSel, in: Capsule())
                }
                .buttonStyle(.plain)
                Spacer()
                Button { focusAll() } label: {
                    Text("Vis alle").font(PF.ui(13, .semibold)).foregroundStyle(p.ink).padding(.horizontal, 14).frame(height: 34).overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                Button { Task { await m.load(store) } } label: {
                    Image(systemName: "arrow.clockwise").font(.system(size: 14, weight: .semibold)).foregroundStyle(p.ink).frame(width: 34, height: 34).overlay(Circle().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Oppdater")
            }
            .padding(10)
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 15, y: 10)
    }

    @State private var zonePickMode = false

    private var pinned: [FamMember] { m.members.filter { $0.last != nil && $0.sharing == "on" } }

    private func focus(_ c: CLLocationCoordinate2D) {
        withAnimation(.easeInOut(duration: 0.4)) {
            camera = .region(MKCoordinateRegion(center: c, latitudinalMeters: 1500, longitudinalMeters: 1500))
        }
    }

    private func focusSelected() {
        if let id = m.selected, let pos = m.member(id)?.last { focus(pos.coord) }
    }

    private func focusAll() {
        withAnimation(.easeInOut(duration: 0.4)) { camera = .automatic }
    }

    /* ---------- Min deling ---------- */

    private var mySharing: some View {
        Button { store.paperGo("innst-fam") } label: {
            HStack(spacing: 12) {
                Circle().fill(m.sharing == "on" ? p.pos : m.sharing == "paused" ? Color(hex: "#c27a1a") : p.mut).frame(width: 10, height: 10)
                VStack(alignment: .leading, spacing: 1) {
                    Text(sharingTitle).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                    Text(m.precision == "approx" ? "Omtrentlig posisjon (ca. 1 km)" : "Nøyaktig posisjon").font(PF.ui(12)).foregroundStyle(p.mut)
                }
                Spacer()
                Text("Personvern ›").font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
            }
            .padding(14)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var sharingTitle: String {
        switch m.sharing {
        case "on": return "Du deler posisjonen din"
        case "paused": return "Delingen din er pauset"
        default: return "Du deler ikke posisjonen din"
        }
    }

    /* ---------- Personene ---------- */

    @ViewBuilder private var people: some View {
        PSection(title: "Familien", trailing: "\(m.members.count)")
        if m.members.isEmpty {
            PCard { Text(m.loaded ? "Ingen andre deler ennå. Alle som logger inn på serveren med appen, vises her." : "Henter familien …").font(PF.ui(13.5)).foregroundStyle(p.mut) }
        }
        ForEach(m.members) { mem in
            FamilyMemberCard(member: mem, selected: m.selected == mem.id) {
                m.select(mem.id, store)
                if let c = mem.last?.coord { focus(c) }
            }
        }
    }

    /* ---------- Soner ---------- */

    @ViewBuilder private var zonesCard: some View {
        PSection(title: "Soner", trailing: "\(m.zones.count)")
        if m.zones.isEmpty {
            PCard { Text("Trykk «+ Ny sone» og så på kartet for å lage en sone, f.eks. Hjemme eller Skolen.").font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
        } else {
            VStack(spacing: 0) {
                ForEach(Array(m.zones.enumerated()), id: \.element.id) { i, z in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    Button { m.zoneEdit = z; m.zoneDraft = nil; m.addingZone = true } label: {
                        HStack(spacing: 12) {
                            Circle().fill(Color(hex: z.color)).frame(width: 14, height: 14)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(z.name).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                                Text("Radius \(Int(z.radius)) m · " + notifyText(z)).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer()
                            Text("›").foregroundStyle(p.mut)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 11)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    private func notifyText(_ z: FamZone) -> String {
        let n = z.notify.filter { $0.value.contains(true) }.count
        return n == 0 ? "ingen varsler" : "varsel for \(n) person\(n == 1 ? "" : "er")"
    }

    /* ---------- Hendelser ---------- */

    @ViewBuilder private var eventsCard: some View {
        if !m.events.isEmpty {
            PSection(title: "Hendelser", trailing: "\(m.events.count)")
            VStack(spacing: 0) {
                ForEach(Array(m.events.prefix(20).enumerated()), id: \.element.id) { i, ev in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    HStack(spacing: 10) {
                        Image(systemName: ev.kind == "leave" ? "arrow.up.right.circle" : "arrow.down.left.circle").foregroundStyle(ev.kind == "leave" ? p.lab : p.pos)
                        Text(m.eventText(ev)).font(PF.ui(13.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                        Spacer()
                        Text(ev.ts.map { JS.fmt($0, Calendar.current.isDateInToday($0) ? "HH:mm" : "dd.MM HH:mm") } ?? "").font(PF.ui(11.5)).foregroundStyle(p.mut)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 9)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
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
                if let z = zone { notifyList(z) }
                HStack(spacing: 8) {
                    if let z = zone {
                        PLineButton(title: "Slett", height: 44) { m.deleteZone(z, store); close() }
                    }
                    PInkButton(title: "Lagre", height: 44, full: true) { save() }
                }
            }
            .padding(18)
        }
        .onAppear {
            if let z = zone { name = z.name; radius = z.radius; color = z.color }
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
        m.saveZone(name: n, coord: c, radius: radius, color: color, id: zone?.id, store)
        close()
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
            Text("De andre i familien ser når delingen er pauset eller slått av, men ikke hvor du er.").font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 4)
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
            Button { store.paperGo("innst-fam") } label: {
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
