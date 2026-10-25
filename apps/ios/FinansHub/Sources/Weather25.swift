import SwiftUI

/* ---------------- Prompt 25: værsiden på Fold og iPad (≥ 700 pt) ----------------
   Fasit: design/Vaer.dc.html med fold (auto ≥ 700) og claude-code-fold-navbar.md. To kolonner (5 : 7), maks 1280
   bred, 24 pt kantmarg og 20 pt mellom kolonnene. Venstre: sted og temperatur (fades ikke ut), time for time og
   10 dager. Høyre: værkartet rett på siden (300 pt, lagvelger og ⤢ Fullskjerm), Yr mot Pent, Vind, Månen og flisene
   i 3 kolonner. Detaljark åpnes som sidepanel til høyre: min(520, 46 %), 16 pt fra kanten, radius 28 og skygge. */

/// Sidepanelet på bred skjerm (dag, mål og Yr mot Pent).
@MainActor
@Observable
final class WxPanel25 {
    static let shared = WxPanel25()
    var ref: WxSheetRef22? = nil
    var compare: Bool = false

    var isOpen: Bool { ref != nil || compare }

    func open(_ r: WxSheetRef22) {
        compare = false
        ref = r
    }

    func openCompare() {
        ref = nil
        compare = true
    }

    func close() {
        ref = nil
        compare = false
    }
}

private struct WxInPanelKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    /// Arket vises i sidepanelet (bred skjerm): × lukker panelet i stedet for dismiss.
    var wxInPanel25: Bool {
        get { self[WxInPanelKey.self] }
        set { self[WxInPanelKey.self] = newValue }
    }
}

/// Innholdet i to kolonner.
struct WxWide25: View {
    @Environment(Store.self) private var store
    let w: WeatherFull
    let width: CGFloat
    @Binding var mode: String
    let open: (String) -> Void
    let openDay: (Int) -> Void
    let compare: () -> Void
    let fullMap: () -> Void

    var body: some View {
        let total: CGFloat = Swift.min(width, 1280) - 48
        let left: CGFloat = Swift.max(240, (total - 20) * 5 / 12)
        let right: CGFloat = Swift.max(280, total - 20 - left)
        ScrollView {
            VStack(spacing: 16) {
                HStack(alignment: .top, spacing: 20) {
                    leftColumn.frame(width: left)
                    rightColumn.frame(width: right)
                }
                footer
            }
            .frame(maxWidth: 1280)
            .padding(.horizontal, 24).padding(.top, 56).padding(.bottom, WxBottomButtons30.height + 16)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .refreshable { await store.loadWeatherFull(force: true) }
    }

    private var leftColumn: some View {
        VStack(spacing: 12) {
            WxHeader22(w: w)
            WxHourCard22(w: w, mode: $mode) { openDay(0) }
            WxDaysCard22(w: w, mode: mode) { i in openDay(i) }
            // Prompt 46: «Glimt · Ukas vær» nederst i venstre kolonne (tomrommet ved detaljkortene til høyre). Skjult i
            // «Rediger kort» = skjult her også. Samme data og tekst som mobilkortet (WxWeek39Model.shared).
            if Vaer41.shared.visible.contains("glimtuka") { WxWeek39Card(w: w) }
        }
    }

    private var rightColumn: some View {
        VStack(spacing: 12) {
            WxInlineMap25(lat: w.lat ?? store.weatherPlaceObj?.lat ?? 59.91, lon: w.lon ?? store.weatherPlaceObj?.lon ?? 10.75, full: fullMap)
            WxCompareCard22(w: w) { compare() }
            WxWindCard22(w: w).onTapGesture { open("wind") }
            WxMoonCard22(w: w).onTapGesture { open("moon") }
            WxTileGrid22(w: w, open: { k in open(k) }, columns: 3)
        }
    }

    private var footer: some View {
        VStack(spacing: 6) {
            Button { store.openLink(w.yrUrl) } label: {
                Text("Data: MET Norge · Se også yr.no ↗").font(.dyn51(size: 12.5)).underline().opacity(0.85).padding(.top, 4)
            }
            .buttonStyle(.plain)
            if w.mock {
                Text("Eksempeldata – serveren fikk ikke kontakt med MET.").font(.dyn51(size: 11.5)).opacity(0.7)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

/// Værkartet rett på siden (Windy), 300 pt høyt, med lagvelger og «⤢ Fullskjerm».
struct WxInlineMap25: View {
    let lat: Double
    let lon: Double
    let full: () -> Void
    @State private var layer: String = "rain"

    private static let layers: [(String, String)] = [("rain", "Nedbør"), ("temp", "Temperatur"), ("wind", "Vind"), ("clouds", "Skyer")]

    var body: some View {
        let shape: RoundedRectangle = RoundedRectangle(cornerRadius: 24, style: .continuous)
        ZStack(alignment: .top) {
            Color(hex: "#0a1423").opacity(0.5)
            WxWebView22(url: WxInlineMap25.url(lat: lat, lon: lon, layer: layer))
            HStack(alignment: .center, spacing: 8) {
                picker
                Spacer(minLength: 4)
                Button { Haptics.shared.tap(); full() } label: {
                    Text("⤢ Fullskjerm").font(.dyn51(size: 12.5, weight: .semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 12).frame(height: 32)
                        .background(Color(hex: "#0a1423").opacity(0.75), in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(10)
        }
        .frame(height: 300)
        .clipShape(shape)
        .overlay(shape.stroke(Color.white.opacity(0.16), lineWidth: 1))
    }

    private var picker: some View {
        HStack(spacing: 2) {
            ForEach(WxInlineMap25.layers, id: \.0) { l in
                let on: Bool = layer == l.0
                Button { Haptics.shared.select(); layer = l.0 } label: {
                    Text(l.1).font(.dyn51(size: 12, weight: .semibold)).lineLimit(1)
                        .foregroundStyle(on ? Color(hex: "#0d1520") : Color.white)
                        .padding(.horizontal, 10).frame(height: 28)
                        .background(on ? Color.white : Color.clear, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(Color(hex: "#0a1423").opacity(0.75), in: Capsule())
    }

    static func url(lat: Double, lon: Double, layer: String) -> URL? {
        let la: String = String(format: "%.4f", lat)
        let lo: String = String(format: "%.4f", lon)
        let s: String = "https://embed.windy.com/embed2.html?lat=\(la)&lon=\(lo)&detailLat=\(la)&detailLon=\(lo)&zoom=7&level=surface&overlay=\(layer)"
            + "&product=ecmwf&menu=&message=true&marker=true&calendar=now&type=map&location=coordinates&metricWind=m%2Fs&metricTemp=%C2%B0C"
        return URL(string: s)
    }
}

/// Sidepanelet til høyre. Trykk på den dempede flaten til venstre lukker det.
struct WxSidePanel25: View {
    @Environment(Store.self) private var store
    let width: CGFloat
    @MainActor private var panel: WxPanel25 { WxPanel25.shared }

    var body: some View {
        let open: Bool = panel.isOpen && store.weatherFull != nil
        ZStack(alignment: .trailing) {
            if open {
                Color.black.opacity(0.18).ignoresSafeArea()
                    .onTapGesture { panel.close() }
                    .transition(.opacity)
                card
                    .frame(width: Swift.min(520, width * 0.46))
                    .frame(maxHeight: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .shadow(color: .black.opacity(0.6), radius: 30, y: 24)
                    .padding(.trailing, 16).padding(.top, 8).padding(.bottom, 16)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.22), value: open)
    }

    @ViewBuilder private var card: some View {
        if let w = store.weatherFull {
            if panel.compare {
                WxCompareSheet22(w: w).environment(\.wxInPanel25, true)
                    .background(Color(hex: "#17191e"))
            } else if let ref = panel.ref {
                WxDetailSheet22(w: w, kind: ref.id, day: ref.day).environment(\.wxInPanel25, true)
                    .id(ref.id + "\(ref.day)")
            }
        }
    }
}
