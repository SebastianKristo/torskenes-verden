import SwiftUI
import UIKit
import WebKit

/* ---------------- Prompt 22: Steder (☰ nede til høyre) og værkart (knappen nede til venstre) ---------------- */

/// «Steder»: søk og legg til (prompt 28: /api/weather/places?q=, reserve /api/weather/search), bytt sted, hold inne og dra for å flytte,
/// sveip mot høyre for å slette. Det siste stedet kan ikke slettes.
struct WxPlacesSheet22: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var q: String = ""
    @State private var hits: [WxPlace] = []
    @State private var busy: Bool = false
    @State private var searched: Bool = false
    /// Prompt 28: nettet eller serveren feilet («Får ikke søkt nå. Prøv igjen.»).
    @State private var failed: Bool = false
    /// Prompt 52: «Steder og søk» åpner med markøren rett i søkefeltet (tastaturet opp), som i Vaer.dc.html.
    @FocusState private var qFocus52: Bool

    var body: some View {
        List {
            Section {
                header
                searchField
                if busy { Text("Søker …").font(.dyn51(size: 13)).foregroundStyle(Color(hex: "#9aa3ae")).plainRow22() }
                if !hits.isEmpty { results }
                if searched && !busy && q.count >= 2 { emptyText }
                Text("MINE STEDER").font(.dyn51(size: 11, weight: .semibold)).tracking(1.32).foregroundStyle(Color(hex: "#9aa3ae"))
                    .plainRow22().padding(.top, 4)
            }
            // Prompt 46: «Min posisjon» fast øverst (kan ikke slettes, flyttes eller sveipes), WeatherLocation.swift.
            Section {
                Vaer46PlaceRow {
                    store.setWeatherPlace(Vaer46.gpsId)
                    Task { await Vaer46.shared.refresh(store, force: true) }
                    dismiss()
                }
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            }
            Section {
                ForEach(store.weatherPlaces) { pl in
                    WxPlaceRow22(pl: pl, on: pl.id == store.weatherPlace) {
                        store.setWeatherPlace(pl.id)
                        dismiss()
                    }
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                        if store.weatherPlaces.count > 1 {
                            Button(role: .destructive) { store.removeWeatherPlace(pl) } label: { Text("Slett") }
                                .tint(Color(hex: "#e5484d"))
                        }
                    }
                }
                .onMove { from, to in store.moveWeatherPlaces(from: from, to: to) }
            }
            Section {
                Text("Hold inne for å flytte · sveip mot høyre for å slette").font(.dyn51(size: 12)).foregroundStyle(Color(hex: "#9aa3ae")).plainRow22()
                Text("Værdata fra Meteorologisk institutt (yr.no, api.met.no). Stedssøk via Open-Meteo og OpenStreetMap.")
                    .font(.dyn51(size: 12)).lineSpacing(4).foregroundStyle(Color(hex: "#9aa3ae")).plainRow22()
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.defaultMinListRowHeight, 1)
        .foregroundStyle(.white)
        .background(Color(hex: "#17191e").ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .task {
            // Litt etter at arket har glidd opp, så tastaturet ikke kolliderer med animasjonen.
            try? await Task.sleep(for: .milliseconds(350))
            qFocus52 = true
        }
        .task(id: q) {
            let t: String = q.trimmingCharacters(in: .whitespaces)
            if t.count < 2 { hits = []; searched = false; busy = false; failed = false; return }
            // Prompt 28: 250 ms debounce, nytt søk (WeatherPlaces.swift) med reserve til det gamle.
            try? await Task.sleep(for: .milliseconds(250))
            if Task.isCancelled { return }
            busy = true
            let res: WxSearch28 = await store.searchWeatherPlaces28(t)
            if Task.isCancelled { return }
            switch res {
            case .hits(let found):
                hits = found
                failed = false
            case .failed:
                hits = []
                failed = true
            }
            busy = false
            searched = true
        }
    }

    /// Ingen treff eller feil (tekstene fra claude-code-vaer-stedssok.md).
    @ViewBuilder private var emptyText: some View {
        let t: String = q.trimmingCharacters(in: .whitespaces)
        if failed {
            Text("Får ikke søkt nå. Prøv igjen.").font(.dyn51(size: 13)).foregroundStyle(Color(hex: "#9aa3ae")).plainRow22()
        } else if hits.isEmpty {
            Text("Fant ingen steder som heter «\(t)»").font(.dyn51(size: 13)).foregroundStyle(Color(hex: "#9aa3ae")).plainRow22()
        }
    }

    private var header: some View {
        HStack {
            Text("Steder").font(.dyn51(size: 24, weight: .bold))
            Spacer()
            // Prompt 40: ✕ som på hovedsiden i Vær.
            VaerCloseButton { dismiss() }
                .buttonStyle(.borderless)
        }
        .plainRow22()
        .padding(.top, 14)
    }

    private var searchField: some View {
        // Prompt 27: ✕ til venstre (SearchField27). Tømming lukker treffene.
        SearchField27(text: $q, placeholder: "Søk etter by eller sted", font: .system(size: 16, weight: .medium), ink: Color.white,
                      placeholderColor: Color(hex: "#9aa3ae"), focus: $qFocus52, onClear: { hits = []; searched = false; busy = false; failed = false }, lead: {
            Glyph22Icon(name: "search", size: 17, color: Color(hex: "#9aa3ae"), stroke: 2.2)
        })
        .padding(.horizontal, 14).frame(height: 46)
        .background(Color(hex: "#262a31"), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .plainRow22()
    }

    private var results: some View {
        VStack(spacing: 0) {
            ForEach(Array(hits.enumerated()), id: \.offset) { pair in
                if pair.offset > 0 { Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1) }
                resultRow(pair.element)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 2)
        .background(Color(hex: "#20232a"), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .plainRow22()
    }

    private func resultRow(_ h: WxPlace) -> some View {
        let have: WxPlace? = store.weatherPlaces.first { p in
            p.name == h.name && abs((p.lat ?? 0) - (h.lat ?? 0)) < 0.05 && abs((p.lon ?? 0) - (h.lon ?? 0)) < 0.05
        }
        let coords: String = (h.lat != nil && h.lon != nil) ? String(format: " · %.2f, %.2f", h.lat ?? 0, h.lon ?? 0) : ""
        return Button {
            if let have { store.setWeatherPlace(have.id) } else { store.addWeatherPlace(h) }
            dismiss()
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(h.name).font(.dyn51(size: 15, weight: .semibold))
                    Text(h.region + coords).font(.dyn51(size: 12.5)).foregroundStyle(Color(hex: "#9aa3ae"))
                }
                Spacer()
                Text(have == nil ? "+ Legg til" : "Vis").font(.dyn51(size: 13, weight: .bold))
                    .foregroundStyle(have == nil ? Color(hex: "#5ec8f2") : Color(hex: "#9aa3ae"))
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
    }
}

extension View {
    /// Rad i Steder-listen uten bakgrunn, skillelinje eller standardinnrykk.
    func plainRow22() -> some View {
        self
            .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}

/// Ett sted: navn og fylke, valgt sted litt lysere. Vanlig trykk velger stedet.
struct WxPlaceRow22: View {
    let pl: WxPlace
    let on: Bool
    let pick: () -> Void

    var body: some View {
        Button(action: pick) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(pl.name).font(.dyn51(size: 16, weight: .semibold))
                    if !pl.region.isEmpty { Text(pl.region).font(.dyn51(size: 12.5)).foregroundStyle(Color(hex: "#c4cbd4")) }
                }
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .background(on ? Color(hex: "#2f3a4c") : Color(hex: "#20232a"), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
    }
}

/* ---------- Værkart ---------- */

/// Værkart i fullskjerm: Windy-innbygging sentrert på stedet, «Ferdig» øverst og lagvelger nederst.
struct WxMapView22: View {
    @Environment(\.dismiss) private var dismiss
    let name: String
    let lat: Double
    let lon: Double
    @State private var layer: String = "rain"

    private static let layers: [(String, String)] = [("rain", "Nedbør"), ("temp", "Temperatur"), ("wind", "Vind"), ("clouds", "Skyer")]

    var body: some View {
        ZStack {
            Color(hex: "#0d1520").ignoresSafeArea()
            WxWebView22(url: url).ignoresSafeArea()
            VStack {
                HStack {
                    // Prompt 40: ✕ øverst til høyre (mørk glass over kartet), bynavnet midt på.
                    Color.clear.frame(width: 44, height: 1)
                    Spacer()
                    Text(name).font(.dyn51(size: 17, weight: .semibold)).foregroundStyle(.white).shadow(color: .black.opacity(0.6), radius: 4, y: 1)
                    Spacer()
                    VaerCloseButton(dark: true) { dismiss() }
                }
                .padding(.horizontal, 16).padding(.top, 8)
                Spacer()
                layerPicker.padding(.bottom, 22)
            }
        }
        .environment(\.colorScheme, .dark)
    }

    /// Prompt 52: glass-pille som kan dras (WeatherGlassBar.swift), samme som temp/regn/vind-bryteren.
    private var layerPicker: some View {
        WxGlass52(value: $layer, items: WxMapView22.layers.map { WxGlass52Item(id: $0.0, label: $0.1) },
                  fontSize: 13.5, height: 38, padH: 14, track: Color.clear, a11y: "Kartlag")
        .padding(1)
        .background(.ultraThinMaterial, in: Capsule())
        .background(Color(hex: "#0a1423").opacity(0.75), in: Capsule())
        .overlay(Capsule().stroke(Color.white.opacity(0.14), lineWidth: 1))
    }

    private var url: URL? {
        let la: String = String(format: "%.4f", lat)
        let lo: String = String(format: "%.4f", lon)
        let s: String = "https://embed.windy.com/embed2.html?lat=\(la)&lon=\(lo)&detailLat=\(la)&detailLon=\(lo)&zoom=7&level=surface&overlay=\(layer)"
            + "&product=ecmwf&menu=&message=true&marker=true&calendar=now&type=map&location=coordinates&metricWind=m%2Fs&metricTemp=%C2%B0C"
        return URL(string: s)
    }
}

/// WKWebView i SwiftUI. Laster bare på nytt når adressen endres (nytt lag).
struct WxWebView22: UIViewRepresentable {
    let url: URL?

    func makeUIView(context: Context) -> WKWebView {
        let cfg: WKWebViewConfiguration = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        let v: WKWebView = WKWebView(frame: .zero, configuration: cfg)
        v.isOpaque = false
        v.backgroundColor = UIColor(red: 13.0 / 255.0, green: 21.0 / 255.0, blue: 32.0 / 255.0, alpha: 1)
        v.scrollView.backgroundColor = v.backgroundColor
        v.scrollView.contentInsetAdjustmentBehavior = .never
        if let url { v.load(URLRequest(url: url)) }
        context.coordinator.last = url
        return v
    }

    func updateUIView(_ v: WKWebView, context: Context) {
        guard let url, url != context.coordinator.last else { return }
        context.coordinator.last = url
        v.load(URLRequest(url: url))
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var last: URL?
    }
}

// MARK: -

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
