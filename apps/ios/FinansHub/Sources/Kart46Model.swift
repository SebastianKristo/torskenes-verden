import SwiftUI
import UIKit
import MapKit

/* ---------------- Prompt 46: Kart – holdeplasser, kjøretøy i sanntid, mine soner og personer (modell) ----------------
 Spesifikasjon: claude-code-kart-side.md. Fasit: Kart.dc.html (bred ≥ 900 pt = iPad, smalere = mobil).
 Server (DATA46, server/kart46.js) – alle Entur-kall går via serveren med ET-Client-Name:
   GET  /api/kart → {prefs:{z,c,show,md,vz}, zones, people, modes, source, sourceText, tiles:{url,minZoom,maxZoom}}
   GET  /api/kart/stops?bbox=minLat,minLon,maxLat,maxLon → {source, stops:[{id,name,lat,lon,modes}], tooBig?}
   GET  /api/kart/stops/:id/departures → {stop, calls:[{line,mode,to,platform,expected,minutes,delayMin,realtime}]}
   GET  /api/kart/vehicles?zones=… → {vehicles:[{id,line,mode,bearing,lat,lon,destination}], pollMs}
   GET  /api/kart/search?q= → {results:[{id,name,label,lat,lon,modes}]}
   PUT  /api/kart/prefs {z,c,show,md,vz} · POST /api/kart/live {zoneId, on}
 Eldre server (404): demodata lokalt og «DEMO-DATA» øverst. Personer kommer bare fra serveren (samme delingsregler som Familie). */

struct Kart46Zone: Identifiable, Hashable {
    var id: String
    var name: String
    var lat: Double
    var lon: Double
    var radius: Double
    var color: String
    var live: Bool
}

struct Kart46Person: Identifiable, Hashable {
    var id: String
    var name: String
    var color: String
    var lat: Double
    var lon: Double
    var me: Bool
    var zone: String
    var updated: Date?
}

struct Kart46Stop: Identifiable, Hashable {
    var id: String
    var name: String
    var lat: Double
    var lon: Double
    var modes: [String]
}

struct Kart46Vehicle: Identifiable, Hashable {
    var id: String
    var line: String
    var mode: String
    var bearing: Double?
    var lat: Double
    var lon: Double
    var destination: String
}

struct Kart46Call: Identifiable, Hashable {
    var id: Int
    var line: String
    var mode: String
    var to: String
    var platform: String
    var minutes: Int
    var delay: Int
    var realtime: Bool
}

@MainActor
@Observable
final class Kart46 {
    static let shared = Kart46()

    nonisolated static let modes: [(String, String, String)] = [
        ("bus", "Buss", "#c8372d"), ("metro", "T-bane", "#d9661f"), ("tram", "Trikk", "#2b6fb3"), ("rail", "Tog", "#2f7a4f"), ("water", "Båt", "#5b4bb5"),
    ]
    nonisolated static let tileURL: String = "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png"

    var open: Bool = false
    var demo: Bool = false
    var zones: [Kart46Zone] = []
    var people: [Kart46Person] = []
    var stops: [Kart46Stop] = []
    var vehicles: [Kart46Vehicle] = []
    var showStops: Bool = true
    var showVehicles: Bool = true
    var showZones: Bool = true
    var showPeople: Bool = true
    var md: Set<String> = Set(Kart46.modes.map { $0.0 })
    var center: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: 59.9225, longitude: 10.735)
    var zoom: Double = 14
    var zoomHint: String = ""
    var tab: String = "lag"
    var query: String = ""
    var results: [Kart46Stop] = []
    var stop: Kart46Stop? = nil
    var calls: [Kart46Call] = []
    var callsBusy: Bool = false
    /// Økes når kartet skal fly et sted (MKMapView leser fly + flyTo).
    var fly: Int = 0
    var flyTo: CLLocationCoordinate2D? = nil
    var flyZoom: Double = 15

    @ObservationIgnored private var stopsTask: Task<Void, Never>? = nil
    @ObservationIgnored private var poll: Task<Void, Never>? = nil
    @ObservationIgnored private var saveTask: Task<Void, Never>? = nil
    @ObservationIgnored private var searchTask: Task<Void, Never>? = nil

    var sourceText: String { demo ? "DEMO-DATA" : "SANNTID · ENTUR" }
    var liveIds: [String] { zones.filter { $0.live }.map { $0.id } }

    nonisolated static func color(_ mode: String) -> Color { Color(hex: modes.first { $0.0 == mode }?.2 ?? "#c8372d") }
    nonisolated static func name(_ mode: String) -> String { modes.first { $0.0 == mode }?.1 ?? "Buss" }

    /* ---------- Åpne / lukke ---------- */

    func show(_ store: Store, zone: String? = nil) {
        Haptics.shared.tap()
        open = true
        Task { @MainActor in
            await load(store)
            if let zone, let z = zones.first(where: { $0.name.lowercased() == zone.lowercased() || $0.id == zone }) {
                setLive(z, true, store)
                go(z.lat, z.lon, 15)
            }
        }
    }

    func close() {
        open = false
        poll?.cancel()
        poll = nil
        stop = nil
    }

    /* ---------- Last inn ---------- */

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/kart", timeout: 15)
            let o: [String: Any] = JS.obj(d)
            demo = (JS.str(o, "source") ?? "entur") == "demo"
            if let p = JS.dict(o, "prefs") { applyPrefs(p) }
            zones = JS.list(o, "zones").compactMap { Kart46.zone($0) }
            people = JS.list(o, "people").compactMap { Kart46.person($0) }
        } catch {
            demo = true
            if zones.isEmpty { zones = Kart46.demoZones }
        }
        startPolling(store)
    }

    private func applyPrefs(_ p: [String: Any]) {
        if let z = JS.num(p, "z") { zoom = z }
        if let c = p["c"] as? [Any], c.count == 2, let la = (c[0] as? NSNumber)?.doubleValue, let lo = (c[1] as? NSNumber)?.doubleValue {
            center = CLLocationCoordinate2D(latitude: la, longitude: lo)
        }
        if let s = JS.dict(p, "show") {
            showStops = JS.bool(s, "stops") ?? true
            showVehicles = JS.bool(s, "vehicles") ?? true
            showZones = JS.bool(s, "zones") ?? true
            showPeople = JS.bool(s, "people") ?? true
        }
        let m: [String] = JS.strings(p, "md")
        if !m.isEmpty { md = Set(m) }
        fly += 1
        flyTo = center
        flyZoom = zoom
    }

    nonisolated static func zone(_ r: [String: Any]) -> Kart46Zone? {
        guard let la = JS.num(r, "lat"), let lo = JS.num(r, "lon") else { return nil }
        let id: String = JS.str(r, "id") ?? JS.int(r, "id").map { String($0) } ?? UUID().uuidString
        return Kart46Zone(id: id, name: JS.str(r, "name") ?? "Sone", lat: la, lon: lo, radius: JS.num(r, "radius") ?? 200,
                          color: JS.str(r, "color") ?? "#2b5d8a", live: JS.bool(r, "live") ?? false)
    }

    nonisolated static func person(_ r: [String: Any]) -> Kart46Person? {
        guard let la = JS.num(r, "lat"), let lo = JS.num(r, "lon") else { return nil }
        let id: String = JS.str(r, "userId") ?? JS.int(r, "userId").map { String($0) } ?? (JS.str(r, "name") ?? "p")
        return Kart46Person(id: id, name: JS.str(r, "name") ?? "", color: JS.str(r, "color") ?? "#2b5d8a", lat: la, lon: lo,
                            me: JS.bool(r, "self") ?? false, zone: JS.str(r, "zone") ?? "", updated: JS.date(r["updatedAt"]))
    }

    nonisolated static func stopOf(_ r: [String: Any]) -> Kart46Stop? {
        guard let la = JS.num(r, "lat"), let lo = JS.num(r, "lon") else { return nil }
        return Kart46Stop(id: JS.str(r, "id") ?? "", name: JS.str(r, "name") ?? JS.str(r, "label") ?? "", lat: la, lon: lo, modes: JS.strings(r, "modes"))
    }

    /* ---------- Holdeplasser i utsnittet (fra zoom 14) ---------- */

    func regionChanged(_ r: MKCoordinateRegion, _ store: Store) {
        center = r.center
        zoom = Kart46.zoomOf(r)
        savePrefs(store)
        stopsTask?.cancel()
        if zoom < 14 {
            if !stops.isEmpty { stops = [] }
            zoomHint = "Zoom inn for å se holdeplasser"
            return
        }
        zoomHint = ""
        guard showStops else { return }
        stopsTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 400_000_000)
            if Task.isCancelled { return }
            let b: String = String(format: "%.5f,%.5f,%.5f,%.5f", r.center.latitude - r.span.latitudeDelta / 2, r.center.longitude - r.span.longitudeDelta / 2,
                                   r.center.latitude + r.span.latitudeDelta / 2, r.center.longitude + r.span.longitudeDelta / 2)
            guard let d = try? await store.api.callAt("/api", "GET", "/kart/stops?bbox=" + b, timeout: 12) else {
                if demo { stops = Kart46.demoStops }
                return
            }
            let o: [String: Any] = JS.obj(d)
            if JS.bool(o, "tooBig") == true { zoomHint = JS.str(o, "message") ?? "Zoom inn for å se holdeplasser"; return }
            if (JS.str(o, "source") ?? "") == "demo" { demo = true }
            stops = JS.list(o, "stops").compactMap { Kart46.stopOf($0) }
        }
    }

    nonisolated static func zoomOf(_ r: MKCoordinateRegion) -> Double {
        let d: Double = Swift.max(0.0001, r.span.longitudeDelta)
        return Swift.min(18, Swift.max(11, log2(360 / d) + 1))
    }

    nonisolated static func span(_ zoom: Double) -> Double { 360 / pow(2, zoom - 1) }

    /// Holdeplasser for valgte transportmidler.
    var visibleStops: [Kart46Stop] {
        guard showStops else { return [] }
        return stops.filter { (s: Kart46Stop) -> Bool in s.modes.isEmpty || s.modes.contains(where: { md.contains($0) }) }
    }

    var visibleVehicles: [Kart46Vehicle] {
        guard showVehicles else { return [] }
        return vehicles.filter { md.contains($0.mode) }
    }

    /* ---------- Kjøretøy (bare valgte soner, hvert 10. sekund) ---------- */

    func startPolling(_ store: Store) {
        poll?.cancel()
        poll = Task { @MainActor in
            while !Task.isCancelled && self.open {
                await self.loadVehicles(store)
                try? await Task.sleep(nanoseconds: 10_000_000_000)
            }
        }
    }

    private func loadVehicles(_ store: Store) async {
        let ids: [String] = liveIds
        guard showVehicles, !ids.isEmpty else { if !vehicles.isEmpty { vehicles = [] }; return }
        let q: String = ids.joined(separator: ",").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        guard let d = try? await store.api.callAt("/api", "GET", "/kart/vehicles?zones=" + q, timeout: 12) else { return }
        let o: [String: Any] = JS.obj(d)
        vehicles = JS.list(o, "vehicles").compactMap { (r: [String: Any]) -> Kart46Vehicle? in
            guard let la = JS.num(r, "lat"), let lo = JS.num(r, "lon") else { return nil }
            return Kart46Vehicle(id: JS.str(r, "id") ?? UUID().uuidString, line: JS.str(r, "line") ?? "", mode: JS.str(r, "mode") ?? "bus",
                                 bearing: JS.num(r, "bearing"), lat: la, lon: lo, destination: JS.str(r, "destination") ?? "")
        }
    }

    /* ---------- Handlinger ---------- */

    func setLive(_ z: Kart46Zone, _ on: Bool, _ store: Store) {
        Haptics.shared.select()
        if let i = zones.firstIndex(where: { $0.id == z.id }) { zones[i].live = on }
        if on { showVehicles = true; showZones = true }
        Task { @MainActor in
            _ = try? await store.api.callAt("/api", "POST", "/kart/live", json: ["zoneId": z.id, "on": on], timeout: 10)
            await self.loadVehicles(store)
        }
    }

    func toggleMode(_ m: String, _ store: Store) {
        Haptics.shared.select()
        if md.contains(m) { if md.count > 1 { md.remove(m) } } else { md.insert(m) }
        savePrefs(store)
    }

    func setLayer(_ k: String, _ on: Bool, _ store: Store) {
        Haptics.shared.select()
        switch k {
        case "stops": showStops = on
        case "vehicles": showVehicles = on
        case "zones": showZones = on
        default: showPeople = on
        }
        savePrefs(store)
    }

    func go(_ lat: Double, _ lon: Double, _ z: Double = 16) {
        flyTo = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        flyZoom = z
        fly += 1
    }

    func select(_ s: Kart46Stop, _ store: Store) {
        Haptics.shared.tap()
        stop = s
        calls = []
        callsBusy = true
        go(s.lat, s.lon, Swift.max(zoom, 16))
        Task { @MainActor in
            defer { self.callsBusy = false }
            let enc: String = s.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? s.id
            guard let d = try? await store.api.callAt("/api", "GET", "/kart/stops/" + enc + "/departures", timeout: 12) else { return }
            let o: [String: Any] = JS.obj(d)
            self.calls = JS.list(o, "calls").enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Kart46Call in
                let r: [String: Any] = pair.element
                return Kart46Call(id: pair.offset, line: JS.str(r, "line") ?? "", mode: JS.str(r, "mode") ?? "bus", to: JS.str(r, "to") ?? "",
                                  platform: JS.str(r, "platform") ?? "", minutes: JS.int(r, "minutes") ?? 0, delay: JS.int(r, "delayMin") ?? 0,
                                  realtime: JS.bool(r, "realtime") ?? false)
            }
        }
    }

    func search(_ store: Store) {
        searchTask?.cancel()
        let t: String = query.trimmingCharacters(in: .whitespaces)
        if t.count < 2 { results = []; return }
        searchTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 300_000_000)
            if Task.isCancelled { return }
            let e: String = t.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? t
            guard let d = try? await store.api.callAt("/api", "GET", "/kart/search?q=" + e, timeout: 10) else {
                results = Kart46.demoStops.filter { $0.name.lowercased().contains(t.lowercased()) }
                return
            }
            results = JS.list(JS.obj(d), "results").compactMap { Kart46.stopOf($0) }
        }
    }

    private func savePrefs(_ store: Store) {
        saveTask?.cancel()
        let body: [String: Any] = [
            "z": (zoom * 100).rounded() / 100,
            "c": [center.latitude, center.longitude],
            "show": ["stops": showStops, "vehicles": showVehicles, "zones": showZones, "people": showPeople],
            "md": Array(md),
            "vz": liveIds,
        ]
        saveTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            if Task.isCancelled { return }
            _ = try? await store.api.callAt("/api", "PUT", "/kart/prefs", json: body, timeout: 10)
        }
    }

    /* ---------- Demodata (server uten /api/kart) ---------- */

    nonisolated static let demoZones: [Kart46Zone] = [
        Kart46Zone(id: "d1", name: "Hjem", lat: 59.9283, lon: 10.7360, radius: 180, color: "#2b5d8a", live: false),
        Kart46Zone(id: "d2", name: "Skole", lat: 59.9190, lon: 10.7290, radius: 220, color: "#2f7a4f", live: false),
    ]
    nonisolated static let demoStops: [Kart46Stop] = [
        Kart46Stop(id: "NSR:StopPlace:58366", name: "Jernbanetorget", lat: 59.9115, lon: 10.7505, modes: ["metro", "tram", "bus"]),
        Kart46Stop(id: "NSR:StopPlace:58404", name: "Nationaltheatret", lat: 59.9146, lon: 10.7340, modes: ["metro", "rail", "tram"]),
        Kart46Stop(id: "NSR:StopPlace:6505", name: "Bislett", lat: 59.9255, lon: 10.7320, modes: ["tram"]),
        Kart46Stop(id: "NSR:StopPlace:6549", name: "Majorstuen", lat: 59.9298, lon: 10.7151, modes: ["metro", "tram", "bus"]),
        Kart46Stop(id: "NSR:StopPlace:6488", name: "Holbergs plass", lat: 59.9195, lon: 10.7365, modes: ["tram", "bus"]),
    ]
}
