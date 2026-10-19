import SwiftUI

/* ---------------- Prompt 28: stedssøk og bunnlinje i Vær (claude-code-vaer-stedssok.md) ----------------
   Søket går mot GET /api/weather/places?q= (Open-Meteo + foldet tekst + Nominatim på serveren) og svarer
   [{name, sub, lat, lon, country, source}]. Eldre server: 404, eller lagrede steder uten `sub`/`source` → det gamle
   /api/weather/search brukes. Bunnlinjen har kart (venstre) og steder (høyre), frostet, full bredde. */

/// Resultatet av et stedssøk: treff, eller at nettet/serveren feilet.
enum WxSearch28 {
    case hits([WxPlace])
    case failed
}

extension Store {
    func searchWeatherPlaces28(_ q: String) async -> WxSearch28 {
        let t: String = q.trimmingCharacters(in: .whitespaces)
        if t.count < 2 { return .hits([]) }
        var allowed: CharacterSet = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&+=?#")
        let e: String = t.addingPercentEncoding(withAllowedCharacters: allowed) ?? t
        do {
            let d: Data = try await api.callAt("/api", "GET", "/weather/places?q=\(e)", timeout: 15)
            if let list = Store.wxParseSearch28(d) { return .hits(list) }
        } catch let err as APIError {
            if err.status != 404 { return .failed }
        } catch {
            return .failed
        }
        return await legacyWeatherSearch28(e)
    }

    /// Det gamle søket (/api/weather/search) for servere uten prompt 28.
    private func legacyWeatherSearch28(_ e: String) async -> WxSearch28 {
        guard let d = try? await api.callAt("/api", "GET", "/weather/search?q=\(e)", timeout: 15) else { return .failed }
        let raw: [Any] = (try? JSONSerialization.jsonObject(with: d)) as? [Any] ?? JS.list(JS.obj(d), "items")
        let list: [WxPlace] = raw.compactMap { $0 as? [String: Any] }.compactMap { WxPlace($0) }
        return .hits(list)
    }

    /// Nytt format: liste (eller {results}) der treffene har `sub` eller `source`. nil = ikke nytt format.
    static func wxParseSearch28(_ d: Data) -> [WxPlace]? {
        let json: Any? = try? JSONSerialization.jsonObject(with: d)
        var raw: [Any] = []
        if let a = json as? [Any] {
            raw = a
        } else if let o = json as? [String: Any], let a = o["results"] as? [Any] {
            raw = a
        } else {
            return nil
        }
        let items: [[String: Any]] = raw.compactMap { $0 as? [String: Any] }
        if items.isEmpty { return [] }
        let isNew: Bool = items.contains { $0["sub"] != nil || $0["source"] != nil }
        if !isNew { return nil }
        return items.compactMap { wxPlace28($0) }
    }

    private static func wxPlace28(_ o: [String: Any]) -> WxPlace? {
        guard let n = JS.str(o, "name"), !n.isEmpty, let la = JS.num(o, "lat"), let lo = JS.num(o, "lon") else { return nil }
        let country: String = JS.str(o, "country") ?? ""
        var sub: String = JS.str(o, "sub") ?? JS.str(o, "region") ?? ""
        if sub.isEmpty { sub = country }
        let id: String = String(format: "%.4f,%.4f", la, lo)
        return WxPlace(id: id, name: n, lat: la, lon: lo, region: sub)
    }
}

/// Bunnlinjen: frostet (rgba(10,20,35,.32) + blur), 1 pt hvit 14 %-kant øverst, ikoner 24 pt i 48×48 treffflate.
struct WxBottomBar28: View {
    let map: () -> Void
    let places: () -> Void

    /// Høyden over safe area (6 + 48 + 8). Innholdet får minst så mye bunnpadding.
    static let height: CGFloat = 62

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            row
                .background(alignment: .top) { WxBarBackground28() }
        }
    }

    private var row: some View {
        HStack(spacing: 10) {
            button("map", stroke: 2, label: "Værkart", act: map)
            Spacer(minLength: 0)
            button("menu", stroke: 2.2, label: "Steder og søk", act: places)
        }
        .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 8)
        .frame(maxWidth: .infinity)
    }

    private func button(_ icon: String, stroke: CGFloat, label: String, act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Glyph22Icon(name: icon, size: 24, color: .white, stroke: stroke)
                .frame(width: 48, height: 48)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Bakgrunnen til bunnlinjen; går helt ned i safe area.
struct WxBarBackground28: View {
    var body: some View {
        ZStack(alignment: .top) {
            Rectangle().fill(.ultraThinMaterial)
            Color(hex: "#0a1423").opacity(0.32)
            Rectangle().fill(Color.white.opacity(0.14)).frame(height: 1)
        }
        .ignoresSafeArea(edges: .bottom)
    }
}
