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
    var weatherPlaceObj: WxPlace? { weatherPlaces.first { $0.id == weatherPlace } }

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

/// Stedsvelgeren nederst i værappen: egne steder (rulles sideveis), hold inne for å fjerne, + for å søke.
struct WxPlaceBar: View {
    @Environment(Store.self) private var store
    @State private var searching = false
    @State private var editing = false

    var body: some View {
        HStack(spacing: 6) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(store.weatherPlaces) { pl in chip(pl) }
                }
                .padding(.horizontal, 2)
            }
            Button {
                Haptics.shared.tap()
                if editing { editing = false } else { searching = true }
            } label: {
                Image(systemName: editing ? "checkmark" : "plus").font(.system(size: 15, weight: .bold)).foregroundStyle(Color(hex: "#1b2a40"))
                    .frame(width: 34, height: 34).background(Color.white, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(editing ? "Ferdig" : "Legg til sted")
        }
        .padding(6)
        .background(.ultraThinMaterial, in: Capsule())
        .padding(.horizontal, 14)
        .padding(.bottom, 18)
        .sheet(isPresented: $searching) { WxPlaceSearch().presentationDetents([.medium, .large]) }
        .task { await store.loadWeatherPlaces() }
    }

    private func chip(_ pl: WxPlace) -> some View {
        let on = store.weatherPlace == pl.id
        return HStack(spacing: 4) {
            Text(pl.name).font(PF.ui(13, .semibold)).fixedSize()
            if editing {
                Button { store.removeWeatherPlace(pl) } label: { Image(systemName: "xmark.circle.fill").font(.system(size: 13)) }
                    .buttonStyle(.plain).accessibilityLabel("Fjern \(pl.name)")
            }
        }
        .foregroundStyle(on ? Color(hex: "#1b2a40") : .white)
        .padding(.horizontal, 12).frame(height: 34)
        .background(on ? Color.white : Color.white.opacity(0.16), in: Capsule())
        .contentShape(Capsule())
        .onTapGesture { if !editing { store.setWeatherPlace(pl.id) } }
        .onLongPressGesture(minimumDuration: 0.5) { Haptics.shared.tick(); editing = true }
    }
}

/// Søk etter steder (Kartverket / Open-Meteo via serveren).
struct WxPlaceSearch: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var q = ""
    @State private var hits: [WxPlace] = []
    @State private var busy = false
    @FocusState private var focus: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Legg til sted").font(PF.serif(24, medium: true))
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Søk etter sted, f.eks. Lillehammer", text: $q).font(PF.ui(15)).focused($focus).autocorrectionDisabled().submitLabel(.search)
                if busy { ProgressView() }
            }
            .padding(.horizontal, 14).frame(height: 46)
            .background(Color.primary.opacity(0.08), in: Capsule())
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(hits.enumerated()), id: \.offset) { i, h in
                        if i > 0 { Divider() }
                        Button { store.addWeatherPlace(h); dismiss() } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(h.name).font(PF.ui(15, .semibold))
                                    if !h.region.isEmpty { Text(h.region).font(PF.ui(12)).foregroundStyle(.secondary) }
                                }
                                Spacer()
                                Text("+ Legg til").font(PF.ui(13, .semibold)).foregroundStyle(Color(hex: "#b23a2a"))
                            }
                            .padding(.vertical, 11).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    if hits.isEmpty && q.count >= 2 && !busy { Text("Fant ingen steder.").font(PF.ui(13)).foregroundStyle(.secondary).padding(.vertical, 12) }
                }
            }
        }
        .padding(18)
        .onAppear { focus = true }
        .task(id: q) {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            busy = true
            hits = await store.searchWeatherPlaces(q)
            busy = false
        }
    }
}
