import SwiftUI
import UIKit

/* ---------------- Prompt 52: «Vær nå»-bakgrunnen følger værtype × tid på døgnet ---------------- */
// Fasit: Homelab.dc.html → bgKey('vaer') og BGSET.vaer_* (og Vaer Bakgrunner.dc.html).
// Værtype fra værsymbolet (MET-symbol fra /api/background eller Hjem-været; WMO-koden i fasiten):
//   torden · snø · regn · tåke · klart · skyet. Tid: morgen 5–9, dag 9–17, kveld 17–21, natt.
// Mangler kombinasjonen, lånes nabotiden (morgen→dag, kveld→natt, natt→kveld, dag→morgen), så dag, så natt, så skyet dag.
// Frie Wikimedia Commons-filer via samme disk-cache som Oslo (Oslo41.fetch). Forrige bilde står til det nye er klart
// (krysstoning 600 ms). Feiler alle, brukes serverens vanlige værbakgrunn (loadBackground).

@MainActor
@Observable
final class Wx52Bg {
    static let shared = Wx52Bg()

    /// Nøkkelen som vises nå («sno_natt» …), til Innstillinger og feilsøking.
    var currentKey: String = ""
    var currentFile: String = ""
    @ObservationIgnored private var ticking: Bool = false
    @ObservationIgnored private var failed: Set<String> = []

    nonisolated static let sets: [String: [String]] = [
        "klart_morgen": ["Sunrise_over_the_sea.jpg", "Golden_hour.jpg"],
        "klart_dag": ["Blue_sky_with_sun.jpg", "Sky_with_clouds.jpg", "Cumulus_clouds_in_fair_weather.jpeg"],
        "klart_kveld": ["Sunset_2007-1.jpg", "Golden_hour.jpg"],
        "klart_natt": ["Starry_night_sky.jpg", "Milky_Way_Night_Sky_Black_Rock_Desert_Nevada.jpg", "Aurora_borealis_above_Lyngenfjorden,_2012_March.jpg", "Night_sky.jpg"],
        "sky_morgen": ["Morning_fog.jpg", "Sun_and_clouds.jpg"],
        "sky_dag": ["Cloudy_Sky_Background.jpg", "Sun_and_clouds.jpg", "Clouds_over_the_Atlantic_Ocean.jpg"],
        "sky_kveld": ["Sunset_2007-1.jpg", "Cloudy_Sky_Background.jpg"],
        "sky_natt": ["Night_sky.jpg", "Winter_night.jpg"],
        "regn_morgen": ["Rain_on_window.jpg", "Heavy_rain.jpg"],
        "regn_dag": ["Heavy_rain.jpg", "Rain_on_window.jpg", "Rain_drops_on_window_02_ies.jpg"],
        "regn_kveld": ["Rain_drops_on_window_02_ies.jpg", "Rain_on_window.jpg"],
        "regn_natt": ["Rain_drops_on_window_02_ies.jpg", "Rain_on_window.jpg"],
        "sno_morgen": ["Snowy_landscape.jpg", "Snow_covered_trees.jpg"],
        "sno_dag": ["Snowy_forest.jpg", "Snow_covered_trees.jpg", "Winter_in_Norway.jpg", "Snowfall.jpg"],
        "sno_kveld": ["Snow_falling.jpg", "Winter_night.jpg"],
        "sno_natt": ["Winter_night.jpg", "Snow_falling.jpg"],
        "torden_dag": ["Thunderstorm.jpg", "Lightning_strike.jpg", "Lightning3.jpg"],
        "torden_natt": ["Lightning3.jpg", "Lightning_strike.jpg", "Thunderstorm.jpg"],
        "take_morgen": ["Morning_fog.jpg", "Foggy_forest.jpg"],
        "take_dag": ["Foggy_forest.jpg", "Fog.jpg", "Morning_fog.jpg"],
        "take_natt": ["Fog.jpg", "Foggy_forest.jpg"],
    ]

    /// Værtype fra MET-symbolet («heavysnowshowers_night», «fog», «clearsky_day» …) eller serverens `weather.kind`.
    nonisolated static func type(_ symbol: String, kind: String = "") -> String {
        let s: String = (symbol + " " + kind).lowercased()
        if s.contains("thunder") || s.contains("torden") { return "torden" }
        if s.contains("snow") || s.contains("snø") { return "sno" }
        if s.contains("rain") || s.contains("sleet") || s.contains("drizzle") || s.contains("regn") { return "regn" }
        if s.contains("fog") || s.contains("tåke") { return "take" }
        if s.contains("clearsky") || s.contains("fair") || s.contains("clear") || s.contains("klart") { return "klart" }
        return "sky"
    }

    /// morgen 5–9, dag 9–17, kveld 17–21, natt.
    nonisolated static func period(_ d: Date) -> String {
        let h: Int = Calendar.current.component(.hour, from: d)
        if h >= 5 && h < 9 { return "morgen" }
        if h >= 9 && h < 17 { return "dag" }
        if h >= 17 && h < 21 { return "kveld" }
        return "natt"
    }

    /// Kombinasjonen som finnes (med lån fra nabotiden), som i fasitens bgKey.
    nonisolated static func key(type ty: String, period td: String) -> String {
        let near: String = td == "morgen" ? "dag" : td == "kveld" ? "natt" : td == "natt" ? "kveld" : "morgen"
        for k in [ty + "_" + td, ty + "_" + near, ty + "_dag", ty + "_natt"] where sets[k] != nil { return k }
        return "sky_dag"
    }

    /// Filene for nøkkelen, rotert per dag.
    nonisolated static func files(_ key: String, now: Date) -> [String] {
        let list: [String] = sets[key] ?? sets["sky_dag"] ?? []
        if list.isEmpty { return [] }
        let day: Int = Int(now.timeIntervalSince1970 / 86400)
        let start: Int = day % list.count
        return Array(list[start...]) + Array(list[..<start])
    }

    /// Kalles fra loadPhotoWindow når bakgrunnen er «Vær nå». false = bruk serverens vanlige værbakgrunn.
    func load(_ store: Store) async -> Bool {
        // Værsymbolet (og gradienten til reserven) fra serveren, uten å laste ned bildet dens.
        let size: (w: Int, dpr: Int) = Store.bgPixelWidth()
        if let d = try? await store.api.callAt("/api", "GET", "/background?type=weather&w=\(size.w)&dpr=\(size.dpr)") {
            let o: [String: Any] = JS.obj(d)
            if JS.str(o, "type") != nil {
                let info: BgInfo = BgInfo(o)
                store.bgInfo = info
                let w: [String: Any]? = JS.dict(o, "weather")
                store.photoWindow = PhotoWindow(["kind": "weather", "url": info.imageUrl, "credit": info.creditText, "gradient": info.gradient,
                                                 "symbol": JS.str(w, "symbol") ?? ""], kind: "weather")
            }
        }
        let ok: Bool = await show(store, Date(), force: true)
        startTicker(store)
        return ok
    }

    private func symbol(_ store: Store) -> String {
        let a: String = store.photoWindow?.symbol ?? ""
        return a.isEmpty ? (store.homeWeather?.symbol ?? "") : a
    }

    @discardableResult
    private func show(_ store: Store, _ now: Date, force: Bool) async -> Bool {
        let k: String = Wx52Bg.key(type: Wx52Bg.type(symbol(store), kind: store.bgInfo?.weatherKind ?? ""), period: Wx52Bg.period(now))
        if !force && k == currentKey && store.photoImage != nil { return true }
        if store.bgPrefs.wifiOnly && !store.onWifi && store.photoImage != nil { return true }
        var list: [String] = Wx52Bg.files(k, now: now).filter { !failed.contains($0) }
        for f in Wx52Bg.files("sky_dag", now: now) where !list.contains(f) && !failed.contains(f) { list.append(f) }
        for f in list {
            guard let img = await Oslo41.fetch(f) else { failed.insert(f); continue }
            guard store.photo == "weather" else { return true }
            currentKey = k
            if f != currentFile || store.photoImage == nil {
                currentFile = f
                // Forrige bilde står til det nye er lastet; så krysstoning.
                withAnimation(.easeInOut(duration: 0.6)) { store.photoImage = img }
                Store.storeBg("weather", img)
            }
            store.photoFailed = false
            return true
        }
        return false
    }

    /// Hvert 10. minutt: nytt tidsrom eller ny værtype gir nytt bilde.
    private func startTicker(_ store: Store) {
        if ticking { return }
        ticking = true
        Task { @MainActor in
            while store.photo == "weather" {
                try? await Task.sleep(nanoseconds: 600_000_000_000)
                if store.photo != "weather" { break }
                await show(store, Date(), force: false)
            }
            ticking = false
        }
    }
}
