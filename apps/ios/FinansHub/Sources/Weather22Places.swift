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

    var body: some View {
        List {
            Section {
                header
                searchField
                if busy { Text("Søker …").font(.system(size: 13)).foregroundStyle(Color(hex: "#9aa3ae")).plainRow22() }
                if !hits.isEmpty { results }
                if searched && !busy && q.count >= 2 { emptyText }
                Text("MINE STEDER").font(.system(size: 11, weight: .semibold)).tracking(1.32).foregroundStyle(Color(hex: "#9aa3ae"))
                    .plainRow22().padding(.top, 4)
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
                Text("Hold inne for å flytte · sveip mot høyre for å slette").font(.system(size: 12)).foregroundStyle(Color(hex: "#9aa3ae")).plainRow22()
                Text("Værdata fra Meteorologisk institutt (yr.no, api.met.no). Stedssøk via Open-Meteo og OpenStreetMap.")
                    .font(.system(size: 12)).lineSpacing(4).foregroundStyle(Color(hex: "#9aa3ae")).plainRow22()
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.defaultMinListRowHeight, 1)
        .foregroundStyle(.white)
        .background(Color(hex: "#17191e").ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .task(id: q) {
            let t: String = q.trimmingCharacters(in: .whitespaces)
            if t.count < 2 { hits = []; searched = false; busy = false; failed = false; return }
            // Prompt 28: 250 ms debounce, nytt søk (Weather28Places.swift) med reserve til det gamle.
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
            Text("Får ikke søkt nå. Prøv igjen.").font(.system(size: 13)).foregroundStyle(Color(hex: "#9aa3ae")).plainRow22()
        } else if hits.isEmpty {
            Text("Fant ingen steder som heter «\(t)»").font(.system(size: 13)).foregroundStyle(Color(hex: "#9aa3ae")).plainRow22()
        }
    }

    private var header: some View {
        HStack {
            Text("Steder").font(.system(size: 24, weight: .bold))
            Spacer()
            Button { dismiss() } label: {
                Text("Ferdig").font(.system(size: 13.5, weight: .bold)).foregroundStyle(Color(hex: "#17191e"))
                    .padding(.horizontal, 16).frame(height: 38).background(Color.white, in: Capsule())
            }
            .buttonStyle(.borderless)
        }
        .plainRow22()
        .padding(.top, 14)
    }

    private var searchField: some View {
        // Prompt 27: ✕ til venstre (SearchField27). Tømming lukker treffene.
        SearchField27(text: $q, placeholder: "Søk etter by eller sted", font: .system(size: 16, weight: .medium), ink: Color.white,
                      placeholderColor: Color(hex: "#9aa3ae"), onClear: { hits = []; searched = false; busy = false; failed = false }, lead: {
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
                    Text(h.name).font(.system(size: 15, weight: .semibold))
                    Text(h.region + coords).font(.system(size: 12.5)).foregroundStyle(Color(hex: "#9aa3ae"))
                }
                Spacer()
                Text(have == nil ? "+ Legg til" : "Vis").font(.system(size: 13, weight: .bold))
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
                    Text(pl.name).font(.system(size: 16, weight: .semibold))
                    if !pl.region.isEmpty { Text(pl.region).font(.system(size: 12.5)).foregroundStyle(Color(hex: "#c4cbd4")) }
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
                    Button { dismiss() } label: {
                        Text("Ferdig").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                            .padding(.horizontal, 16).frame(height: 40)
                            .background(.ultraThinMaterial, in: Capsule())
                            .background(Color(hex: "#0a1423").opacity(0.7), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    Spacer()
                    Text(name).font(.system(size: 17, weight: .semibold)).foregroundStyle(.white).shadow(color: .black.opacity(0.6), radius: 4, y: 1)
                    Spacer()
                    Color.clear.frame(width: 72, height: 1)
                }
                .padding(.horizontal, 16).padding(.top, 8)
                Spacer()
                layerPicker.padding(.bottom, 22)
            }
        }
        .environment(\.colorScheme, .dark)
    }

    private var layerPicker: some View {
        HStack(spacing: 2) {
            ForEach(WxMapView22.layers, id: \.0) { l in
                let on: Bool = layer == l.0
                Button { Haptics.shared.select(); layer = l.0 } label: {
                    Text(l.1).font(.system(size: 13.5, weight: .semibold)).lineLimit(1)
                        .foregroundStyle(on ? Color(hex: "#0d1520") : Color.white)
                        .padding(.horizontal, 14).frame(height: 38)
                        .background(on ? Color.white : Color.clear, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
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
