import SwiftUI
import UIKit
import CoreLocation

/* ---------------- Prompt 41: Ruter → Min reise (forhåndsruter skole ⇄ Amagerveien), skolesoner og kortet på Hjem ----------------
   Spesifikasjon: prompts/prompt-41-pakke/claude-code-ruter-forhandsruter-sebastian.md. Fasit: Mobil Papir App.dc.html → Ruter
   (MIN REISE · SEBASTIAN) og Hjem (MIN REISE · FORLOT SKOLEN HH:MM), vedlegg/min-reise-hjem.png.
   API (SERVER41, klienten tåler 404 – da vises ingenting):
     GET /api/ruter/my-routes → {routes:[…], homeCard:'over'|'instead'|'off'}   (kortet vises bare når brukeren har ruter)
     PUT /api/ruter/settings {homeCard} · POST/DELETE /api/ruter/journey/hide (skjult per tur)
     GET  /api/ruter/my-trip?dir=auto|toHome|toSchool → {dir, from, to, options:[{legs:[{mode, line?, from, to, dep, arr, aimed,
          expected, delayMin, walkMin, meters}], dep, arr, minutes, preferred, badges[]}], alert?:{text, walk:{minutes, km, catches}, homeAt}, updatedAt}
     GET/POST/DELETE /api/ruter/school-zones  [{id, name, lat, lon, radius}]
     POST /api/ruter/left-school {at} · GET /api/ruter/journey → aktiv «forlot skolen»-hendelse (utløper hjemme / etter 90 min)
   Geofence (CLCircularRegion) per skolesone, maks 10 her (iOS tillater 20 totalt). «Forlot skolen» = ute av alle skolesonene i
   ≥ 2 min, hverdager 07–18, ikke innen 10 min etter at du kom. Posisjonen brukes bare til dette og sendes ikke; serveren får
   bare tidspunktet. Kortet på Hjem vises bare når hendelsen finnes, og kan sveipes bort (skjult per tur: papir_rt_hide). */

struct MinReise41Leg: Hashable, Identifiable {
    var id: String { mode + line + from + depText }
    var mode: String
    var line: String
    var from: String
    var to: String
    var dep: Date?
    var arr: Date?
    var aimed: Date?
    var delayMin: Int
    var walkMin: Int
    var meters: Int

    var depText: String { dep.map { Hjemlys40Look.clock($0) } ?? "" }
    var isWalk: Bool { mode == "foot" || mode == "walk" || mode == "gå" }
    var minutes: Int {
        guard let a = dep, let b = arr else { return walkMin }
        return Swift.max(1, Int((b.timeIntervalSince(a) / 60).rounded()))
    }

    /// «Gå 6» · «Trikk 9 min» · «45». Hele etiketten lages her (ikke tekst rundt en verdi), så mellomrommet aldri mangler.
    var chip: String {
        if isWalk { return "Gå " + String(walkMin > 0 ? walkMin : minutes) }
        switch mode {
        case "tram": return "Trikk " + String(minutes) + " min"
        case "metro": return "T-bane " + (line.isEmpty ? String(minutes) + " min" : line)
        case "rail": return "Tog " + (line.isEmpty ? String(minutes) + " min" : line)
        default: return line.isEmpty ? "Buss " + String(minutes) + " min" : line
        }
    }

    var modeName: String {
        if isWalk { return "Gå" }
        switch mode {
        case "tram": return "Trikk"
        case "metro": return "T-bane"
        case "rail": return "Tog"
        default: return "Buss"
        }
    }
}

struct MinReise41Option: Hashable, Identifiable {
    var id: String { (dep.map { String($0.timeIntervalSince1970) } ?? "") + legs.map(\.chip).joined() }
    var legs: [MinReise41Leg]
    var dep: Date?
    var arr: Date?
    var minutes: Int
    var preferred: Bool
    var badges: [String]
}

struct MinReise41Alert: Hashable {
    var text: String
    /// Serverens ferdige tekster: hele forklaringen og den korte linja på Hjem.
    var body: String = ""
    var short: String = ""
    var walkMin: Int
    var km: Double
    var catches: String
    var homeAt: Date?
}

struct MinReise41Zone: Hashable, Identifiable {
    var id: String
    var name: String
    var lat: Double
    var lon: Double
    var radius: Double
}

@MainActor
@Observable
final class MinReise41 {
    static let shared = MinReise41()

    /// false = serveren har ikke Min reise (404) eller brukeren har ingen forhåndsruter.
    var enabled: Bool = false
    var loaded: Bool = false
    var dir: String = "auto"
    var resolvedDir: String = ""
    var from: String = ""
    var to: String = ""
    var options: [MinReise41Option] = []
    var alert: MinReise41Alert? = nil
    var updatedAt: Date? = nil
    var busy: Bool = false
    var err: String = ""
    var open: String? = nil
    var zones: [MinReise41Zone] = []
    var addingZone: Bool = false
    /// over | instead | off
    var homeCard: String = UserDefaults.standard.string(forKey: "papir_rt_homecard") ?? "over" {
        didSet { UserDefaults.standard.set(homeCard, forKey: "papir_rt_homecard") }
    }
    /// Aktiv «forlot skolen»-hendelse.
    var leftAt: Date? = nil
    var hiddenFor: String = UserDefaults.standard.string(forKey: "papir_rt_hide") ?? ""
    /// Prompt 45: antall anbefalte reiser som vises (1 · 2 · 3, standard 2), per bruker (ruter/settings recoCount).
    var recoCount: Int = {
        let v: Int = UserDefaults.standard.integer(forKey: "papir_rt_reco")
        return (1...3).contains(v) ? v : 2
    }()
    /// De N første forslagene – nøyaktig N rader, færre hvis det ikke finnes flere (ingen plassholdere).
    var shown: [MinReise41Option] { Array(options.prefix(recoCount)) }
    var toast: Bool = false
    @ObservationIgnored private var lastLoad: Date = .distantPast
    @ObservationIgnored private var hideBefore: String = ""

    /* ---------- Lasting ---------- */

    func load(_ store: Store, force: Bool = false) async {
        if !force && Date().timeIntervalSince(lastLoad) < 20 && loaded { return }
        lastLoad = Date()
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/ruter/my-routes", timeout: 12)
            let o: [String: Any] = JS.obj(d)
            let routes: [[String: Any]] = JS.list(o, "routes")
            let arr: [Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [Any]) ?? []
            enabled = !routes.isEmpty || !arr.isEmpty
            if let h = JS.str(o, "homeCard"), ["over", "instead", "off"].contains(h) { homeCard = h }
            takeReco(JS.int(o, "recoCount"))
        } catch {
            enabled = false
            loaded = true
            return
        }
        loaded = true
        guard enabled else { return }
        await trip(store)
        await loadJourney(store)
        await loadZones(store)
    }

    func trip(_ store: Store) async {
        busy = true
        defer { busy = false }
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/ruter/my-trip?dir=" + dir, timeout: 20)
            parse(JS.obj(d))
            err = ""
        } catch let e as APIError {
            err = e.status == 0 ? "Fikk ikke kontakt med Entur." : e.message
        } catch {
            err = error.localizedDescription
        }
    }

    private func parse(_ o: [String: Any]) {
        resolvedDir = JS.str(o, "dir") ?? ""
        takeReco(JS.int(o, "recoCount"))
        from = MinReise41.place(o["from"])
        to = MinReise41.place(o["to"])
        options = JS.list(o, "options").map { (x: [String: Any]) -> MinReise41Option in
            let legs: [MinReise41Leg] = JS.list(x, "legs").map { (l: [String: Any]) -> MinReise41Leg in
                MinReise41Leg(mode: (JS.str(l, "mode") ?? "bus").lowercased(), line: JS.str(l, "line") ?? JS.str(JS.dict(l, "line"), "publicCode") ?? "",
                              from: MinReise41.place(l["from"]), to: MinReise41.place(l["to"]),
                              dep: Hjemlys40Session.date(l["expected"] ?? l["dep"]) ?? Hjemlys40Session.date(l["dep"]),
                              arr: Hjemlys40Session.date(l["arr"]), aimed: Hjemlys40Session.date(l["aimed"]),
                              delayMin: JS.int(l, "delayMin") ?? 0, walkMin: JS.int(l, "walkMin") ?? 0, meters: JS.int(l, "meters") ?? 0)
            }
            return MinReise41Option(legs: legs, dep: Hjemlys40Session.date(x["dep"]), arr: Hjemlys40Session.date(x["arr"]),
                                    minutes: JS.int(x, "minutes") ?? 0, preferred: JS.bool(x, "preferred") ?? false, badges: JS.strings(x, "badges"))
        }
        if let a = JS.dict(o, "alert") {
            let w: [String: Any]? = JS.dict(a, "walk")
            alert = MinReise41Alert(text: JS.str(a, "text") ?? "", body: JS.str(a, "body") ?? "", short: JS.str(a, "short") ?? "",
                                    walkMin: JS.int(w, "minutes") ?? 0, km: JS.num(w, "km") ?? 0,
                                    catches: JS.str(w, "catches") ?? "", homeAt: Hjemlys40Session.date(a["homeAt"]))
        } else {
            alert = nil
        }
        updatedAt = Hjemlys40Session.date(o["updatedAt"]) ?? Date()
    }

    nonisolated static func place(_ v: Any?) -> String {
        if let s = v as? String { return s }
        if let d = v as? [String: Any] { return (d["name"] as? String) ?? (d["label"] as? String) ?? "" }
        return ""
    }

    func flip(_ store: Store) {
        Haptics.shared.select()
        let cur: String = resolvedDir.isEmpty ? (Calendar.current.component(.hour, from: Date()) < 12 ? "toSchool" : "toHome") : resolvedDir
        dir = cur == "toHome" ? "toSchool" : "toHome"
        open = nil
        Task { await trip(store) }
    }

    /// «Skole → Amagerveien».
    var title: String {
        if !from.isEmpty || !to.isEmpty { return (from.isEmpty ? "Skole" : from) + " → " + (to.isEmpty ? "Amagerveien" : to) }
        let toHome: Bool = (resolvedDir.isEmpty ? (Calendar.current.component(.hour, from: Date()) >= 12) : resolvedDir == "toHome")
        return toHome ? "Skole → Amagerveien" : "Amagerveien → Skole"
    }

    /* ---------- «Forlot skolen» og kortet på Hjem ---------- */

    func loadJourney(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/ruter/journey", timeout: 10) else { leftAt = nil; return }
        let o: [String: Any] = JS.obj(d)
        let j: [String: Any] = JS.dict(o, "journey") ?? o
        let active: Bool = JS.bool(j, "active") ?? JS.bool(o, "active") ?? true
        let at: Date? = Hjemlys40Session.date(j["leftSchoolAt"] ?? j["leftAt"] ?? j["left_school_at"] ?? j["at"])
        let ended: Bool = Hjemlys40Session.date(j["endedAt"] ?? j["homeAt"]) != nil
        leftAt = active && !ended ? at : nil
        // Skjult på en annen enhet (samme tur).
        if JS.bool(j, "hidden") == true, leftAt != nil { hiddenFor = hideKey }
        // Reisen hjem kommer med hendelsen (samme form som my-trip).
        if let t = JS.dict(j, "trip"), leftAt != nil { parse(t) }
    }

    var hideKey: String { leftAt.map { String(Int($0.timeIntervalSince1970)) } ?? "" }

    /// Kortet på Hjem: bare når hendelsen finnes, < 90 min, ikke skjult for denne turen, og minst én avgang ikke har gått.
    var showOnHome: Bool {
        guard enabled, homeCard != "off", let at = leftAt else { return false }
        if Date().timeIntervalSince(at) > 90 * 60 { return false }
        if hiddenFor == hideKey { return false }
        if Hjemlys40Model.shared.mine?.state == "home" { return false }
        if !options.isEmpty && !options.contains(where: { ($0.dep ?? .distantFuture) > Date().addingTimeInterval(-5 * 60) }) { return false }
        return true
    }

    func hide(_ store: Store) {
        hideBefore = hiddenFor
        hiddenFor = hideKey
        UserDefaults.standard.set(hiddenFor, forKey: "papir_rt_hide")
        Task { _ = try? await store.api.callAt("/api", "POST", "/ruter/journey/hide", json: [:], timeout: 10) }
        withAnimation(.easeOut(duration: 0.25)) { toast = true }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 4_500_000_000)
            withAnimation(.easeOut(duration: 0.25)) { self.toast = false }
        }
    }

    func undo(_ store: Store) {
        Haptics.shared.tap()
        hiddenFor = hideBefore
        UserDefaults.standard.set(hiddenFor, forKey: "papir_rt_hide")
        Task { _ = try? await store.api.callAt("/api", "DELETE", "/ruter/journey/hide", timeout: 10) }
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { toast = false }
    }

    private func takeReco(_ v: Int?) {
        guard let v, (1...3).contains(v), v != recoCount else { return }
        recoCount = v
        UserDefaults.standard.set(v, forKey: "papir_rt_reco")
    }

    /// Prompt 45: 1 · 2 · 3 (lett haptikk), lagres per bruker på serveren (tåler 404 på eldre server).
    func setReco(_ v: Int, _ store: Store) {
        guard (1...3).contains(v), v != recoCount else { return }
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.2)) { recoCount = v }
        UserDefaults.standard.set(v, forKey: "papir_rt_reco")
        Task { _ = try? await store.api.callAt("/api", "PUT", "/ruter/settings", json: ["recoCount": v], timeout: 10) }
    }

    func setHomeCard(_ v: String, _ store: Store) {
        Haptics.shared.select()
        homeCard = v
        Task { _ = try? await store.api.callAt("/api", "PUT", "/ruter/settings", json: ["homeCard": v], timeout: 10) }
    }

    /* ---------- Skolesoner ---------- */

    func loadZones(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/ruter/school-zones", timeout: 10) else { return }
        var raw: [[String: Any]] = JS.list(JS.obj(d), "zones")
        if raw.isEmpty, let arr = (try? JSONSerialization.jsonObject(with: d)) as? [[String: Any]] { raw = arr }
        zones = raw.compactMap { (z: [String: Any]) -> MinReise41Zone? in
            guard let la = JS.num(z, "lat"), let lo = JS.num(z, "lon") else { return nil }
            return MinReise41Zone(id: JS.str(z, "id") ?? (JS.int(z, "id").map { String($0) } ?? UUID().uuidString), name: JS.str(z, "name") ?? "Skole",
                                  lat: la, lon: lo, radius: JS.num(z, "radius") ?? JS.num(z, "radius_m") ?? 150)
        }
        MinReise41Geo.shared.monitor(zones, store)
    }

    func addZone(_ store: Store, name: String, coord: CLLocationCoordinate2D, radius: Double) {
        let body: [String: Any] = ["name": name.isEmpty ? "Skole" : name, "lat": coord.latitude, "lon": coord.longitude, "radius_m": Int(radius)]
        Task {
            do {
                _ = try await store.api.callAt("/api", "POST", "/ruter/school-zones", json: body, timeout: 12)
                Haptics.shared.success()
                await self.loadZones(store)
            } catch {
                store.flash("Fikk ikke lagret skolesonen")
            }
        }
    }

    func deleteZone(_ z: MinReise41Zone, _ store: Store) {
        guard zones.count > 1 else { store.flash("Den siste skolesonen kan ikke slettes"); return }
        Haptics.shared.warning()
        zones.removeAll { $0.id == z.id }
        let enc: String = z.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? z.id
        Task {
            _ = try? await store.api.callAt("/api", "DELETE", "/ruter/school-zones/" + enc, timeout: 10)
            await self.loadZones(store)
        }
    }

    /// Kalles av geofencen: serveren lager «forlot skolen»-hendelsen og svarer med reisen.
    func leftSchool(_ at: Date, _ store: Store) async {
        let iso: String = ISO8601DateFormatter().string(from: at)
        _ = try? await store.api.callAt("/api", "POST", "/ruter/left-school", json: ["at": iso], timeout: 15)
        leftAt = at
        await trip(store)
    }
}

/* ---------- Geofence for skolesonene ---------- */

final class MinReise41Geo: NSObject, CLLocationManagerDelegate {
    static let shared = MinReise41Geo()
    static let prefix: String = "school41-"

    private let manager: CLLocationManager = CLLocationManager()
    private var zones: [MinReise41Zone] = []
    private var exitAt: Date? = nil
    private var enteredAt: Date? = nil
    private var watching: Bool = false
    private weak var store: Store? = nil
    /// Prompt 50: id-ene (område-id fra Steder) som har egen region her.
    private(set) var monitoredIds: [String] = []

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    @MainActor func monitor(_ list: [MinReise41Zone], _ s: Store) {
        store = s
        zones = Array(list.prefix(10))
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }
        for r in manager.monitoredRegions where r.identifier.hasPrefix(MinReise41Geo.prefix) { manager.stopMonitoring(for: r) }
        let st: CLAuthorizationStatus = manager.authorizationStatus
        monitoredIds = []
        guard st == .authorizedAlways else { return }
        // Prompt 50: skoleområdene kommer nå fra Familie › Steder; de telles med i taket på 20 regioner (Fam50Fence).
        monitoredIds = zones.map { $0.id }
        for z in zones {
            let reg: CLCircularRegion = CLCircularRegion(center: CLLocationCoordinate2D(latitude: z.lat, longitude: z.lon),
                                                         radius: Swift.min(Swift.max(z.radius, 50), 300), identifier: MinReise41Geo.prefix + z.id)
            reg.notifyOnEntry = true
            reg.notifyOnExit = true
            manager.startMonitoring(for: reg)
        }
    }

    private func inside(_ loc: CLLocation) -> Bool {
        zones.contains { (z: MinReise41Zone) -> Bool in
            loc.distance(from: CLLocation(latitude: z.lat, longitude: z.lon)) <= Swift.max(z.radius, 50) + 20
        }
    }

    func locationManager(_ m: CLLocationManager, didEnterRegion region: CLRegion) {
        guard region.identifier.hasPrefix(MinReise41Geo.prefix) else { return }
        if enteredAt == nil || exitAt != nil { enteredAt = Date() }
        exitAt = nil
        stopWatching()
    }

    /// Ut av en sone: følg posisjonen i 2 min (bakgrunnsmodus «location»). Er du fortsatt ute av alle sonene, sendes tidspunktet.
    func locationManager(_ m: CLLocationManager, didExitRegion region: CLRegion) {
        guard region.identifier.hasPrefix(MinReise41Geo.prefix) else { return }
        exitAt = Date()
        if watching { return }
        watching = true
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = false
        manager.startUpdatingLocation()
        // Stopp uansett etter 5 min.
        DispatchQueue.main.asyncAfter(deadline: .now() + 300) { [weak self] in self?.stopWatching() }
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard watching, let loc = locations.last, let out = exitAt else { return }
        if inside(loc) {
            exitAt = nil
            stopWatching()
            return
        }
        if Date().timeIntervalSince(out) < 120 { return }
        stopWatching()
        guard MinReise41Geo.allowed(out, enteredAt: enteredAt) else { return }
        let at: Date = out
        Task { @MainActor in
            guard let s = self.store else { return }
            await MinReise41.shared.leftSchool(at, s)
        }
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {}

    private func stopWatching() {
        if !watching { return }
        watching = false
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
    }

    /// Hverdager 07–18, og ikke innen 10 min etter at du kom.
    static func allowed(_ at: Date, enteredAt: Date?) -> Bool {
        let cal: Calendar = Calendar.current
        let wd: Int = cal.component(.weekday, from: at)
        if wd == 1 || wd == 7 { return false }
        let h: Int = cal.component(.hour, from: at)
        if h < 7 || h >= 18 { return false }
        if let e = enteredAt, at.timeIntervalSince(e) < 10 * 60 { return false }
        return true
    }
}
