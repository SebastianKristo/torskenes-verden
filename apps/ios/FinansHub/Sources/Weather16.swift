import SwiftUI

/* ---------------- Vær: egne steder (MET/yr.no via serveren) ---------------- */

struct WxPlace: Identifiable, Hashable, Codable {
    var id: String
    var name: String
    var lat: Double?
    var lon: Double?
    var region: String = ""

    static let defaults: [WxPlace] = [
        WxPlace(id: "oslo", name: "Oslo", lat: 59.9139, lon: 10.7522, region: "Oslo"),
        WxPlace(id: "bergen", name: "Bergen", lat: 60.3913, lon: 5.3221, region: "Vestland"),
        WxPlace(id: "trondheim", name: "Trondheim", lat: 63.4305, lon: 10.3951, region: "Trøndelag"),
        WxPlace(id: "tromso", name: "Tromsø", lat: 69.6492, lon: 18.9553, region: "Troms"),
    ]

    static func loadLocal() -> [WxPlace] {
        guard let d = UserDefaults.standard.data(forKey: "fh_wx_places"), let v = try? JSONDecoder().decode([WxPlace].self, from: d), !v.isEmpty else { return defaults }
        return v
    }
    static func saveLocal(_ v: [WxPlace]) {
        if let d = try? JSONEncoder().encode(v) { UserDefaults.standard.set(d, forKey: "fh_wx_places") }
    }

    init(id: String, name: String, lat: Double?, lon: Double?, region: String = "") {
        self.id = id; self.name = name; self.lat = lat; self.lon = lon; self.region = region
    }

    init?(_ o: [String: Any]) {
        guard let n = JS.str(o, "name") else { return nil }
        let la = JS.num(o, "lat"), lo = JS.num(o, "lon")
        id = JS.str(o, "id") ?? (la.map { String(format: "%.4f,%.4f", $0, lo ?? 0) } ?? n.lowercased())
        name = n; lat = la; lon = lo
        region = JS.str(o, "region") ?? JS.str(o, "county") ?? ""
    }

    /// Spørringen til /api/weather/full: standardstedene med navn, egne steder med koordinater.
    var query: String {
        if ["oslo", "bergen", "trondheim", "tromso"].contains(id) { return "place=\(id)" }
        guard let la = lat, let lo = lon else { return "place=\(id)" }
        let n = name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? name
        return String(format: "lat=%.4f&lon=%.4f", la, lo) + "&name=\(n)"
    }
}

extension Store {
    /// Prompt 46: «__gps» = Min posisjon (koordinatene fra telefonen, Vaer46.swift). Uten posisjon ennå: første lagrede sted,
    /// men valget beholdes.
    var weatherPlaceObj: WxPlace? {
        if weatherPlace == Vaer46.gpsId { return Vaer46.shared.place ?? weatherPlaces.first }
        return weatherPlaces.first { $0.id == weatherPlace }
    }

    func loadWeatherPlaces() async {
        guard let d = try? await api.callAt("/api", "GET", "/weather/places") else { return }
        let raw = (try? JSONSerialization.jsonObject(with: d)) as? [Any] ?? JS.list(JS.obj(d), "places")
        let list = raw.compactMap { $0 as? [String: Any] }.compactMap { WxPlace($0) }
        if !list.isEmpty && list != weatherPlaces { weatherPlaces = list }
    }

    func searchWeatherPlaces(_ q: String) async -> [WxPlace] {
        let t = q.trimmingCharacters(in: .whitespaces)
        guard t.count >= 2 else { return [] }
        let e = t.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? t
        guard let d = try? await api.callAt("/api", "GET", "/weather/search?q=\(e)", timeout: 15) else { return [] }
        let raw = (try? JSONSerialization.jsonObject(with: d)) as? [Any] ?? JS.list(JS.obj(d), "items")
        return raw.compactMap { $0 as? [String: Any] }.compactMap { WxPlace($0) }
    }

    func addWeatherPlace(_ pl: WxPlace) {
        if weatherPlaces.contains(where: { $0.id == pl.id || ($0.name == pl.name && $0.region == pl.region) }) { setWeatherPlace(pl.id); return }
        weatherPlaces.append(pl)
        Haptics.shared.success()
        setWeatherPlace(pl.id)
        var body: [String: Any] = ["name": pl.name, "region": pl.region]
        if let la = pl.lat { body["lat"] = la }
        if let lo = pl.lon { body["lon"] = lo }
        Task {
            if let d = try? await self.api.callAt("/api", "POST", "/weather/places", json: body), let saved = WxPlace(JS.obj(d)) {
                // Serveren gir stedet en egen id; behold valget.
                if let i = self.weatherPlaces.firstIndex(where: { $0.id == pl.id }), saved.id != pl.id {
                    self.weatherPlaces[i] = saved
                    if self.weatherPlace == pl.id { self.weatherPlace = saved.id }
                }
            }
        }
    }

    func removeWeatherPlace(_ pl: WxPlace) {
        guard weatherPlaces.count > 1 else { flash("Du må ha minst ett sted."); return }
        weatherPlaces.removeAll { $0.id == pl.id }
        Haptics.shared.tick()
        if weatherPlace == pl.id, let first = weatherPlaces.first { setWeatherPlace(first.id) }
        let id = pl.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? pl.id
        Task { _ = try? await self.api.callAt("/api", "DELETE", "/weather/places/\(id)") }
    }
}

extension Store {
    /// Prompt 22: hold inne og dra i Steder. Lagres lokalt og (hvis serveren støtter det) per bruker.
    func moveWeatherPlaces(from: IndexSet, to: Int) {
        var list: [WxPlace] = weatherPlaces
        list.move(fromOffsets: from, toOffset: to)
        weatherPlaces = list
        Haptics.shared.tick()
        let ids: [String] = list.map(\.id)
        Task { _ = try? await self.api.callAt("/api", "PUT", "/weather/places/order", json: ["ids": ids]) }
    }
}
