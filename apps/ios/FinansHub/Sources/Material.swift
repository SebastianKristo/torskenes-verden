import SwiftUI
import PhotosUI

/* ---------------- Android-utseende på iPhone (Material 3 Expressive) ---------------- */

/// Tonal palett fra frøfargen #FF7A3D (samme som Android-appen).
enum M3 {
    static let surface = Color(hex: "#19120E")
    static let card = Color(hex: "#261E19")
    static let field = Color(hex: "#31281F")
    static let primary = Color(hex: "#FFB68A")
    static let onPrimary = Color(hex: "#532200")
    static let primaryContainer = Color(hex: "#763300")
    static let onPrimaryContainer = Color(hex: "#FFDBC8")
    static let secondaryContainer = Color(hex: "#5D4033")
    static let onSurface = Color(hex: "#F0DFD7")
    static let onSurfaceVariant = Color(hex: "#D8C2B8")
}

/// iPhone med Material-utseendet: samme skjermer og data, men navigasjonslinje med pillemarkør og utvidet Skann-knapp.
struct MaterialShell: View {
    @Environment(Store.self) private var store
    let scan: ScanActions
    @Binding var photos: [PhotosPickerItem]
    @Binding var files: Bool
    var body: some View {
        let m = store.module
        let finance = m == nil || m?.isFinance == true
        Group {
            if m == .mat {
                MatSurface()
            } else if m == .domains {
                DomainsView().safeAreaInset(edge: .bottom) { domBar }
            } else if finance {
                Group {
                    if let m { ModuleView(module: m, scan: scan, photos: $photos, files: $files) } else { FinanceTab() }
                }
                .safeAreaInset(edge: .bottom) { finBar }
                .overlay(alignment: .bottomTrailing) {
                    if store.selectedTx == nil && m != .imports && m != .upload {
                        HStack(spacing: 10) {
                            Image(systemName: "doc.viewfinder").font(.system(size: 18, weight: .semibold))
                            Text("Skann").fontWeight(.semibold)
                        }
                        .foregroundStyle(M3.onPrimaryContainer).padding(.horizontal, 20).frame(height: 56)
                        .background(M3.primaryContainer, in: RoundedRectangle(cornerRadius: 16))
                        .shadow(color: .black.opacity(0.35), radius: 8, y: 3)
                        .contentShape(RoundedRectangle(cornerRadius: 16))
                        .onTapGesture { scan.tap() }
                        .onLongPressGesture(minimumDuration: 0.48) { Haptics.shared.tap(); scan.hold() }
                        .accessibilityLabel("Skann kvittering").accessibilityAddTraits(.isButton)
                        .padding(.trailing, 16).padding(.bottom, 96)
                    }
                }
            } else if m == .homelab || m == .tracking {
                Group { if m == .tracking { TrackingView() } else { HomelabView() } }.safeAreaInset(edge: .bottom) { hlBar }
            } else if let m {
                ModuleView(module: m, scan: scan, photos: $photos, files: $files)
            }
        }
    }

    private var finBar: some View {
        let cur: Tab = store.module?.isFinance == true || !store.finTabs.contains(store.tab) ? .more : store.tab
        var items: [(String, String, Bool, () -> Void)] = []
        if store.homeInBar && !store.financeStart { items.append((store.startLabel, "house.fill", false, { store.goStart() })) }
        for t in store.finTabs { items.append((store.tabName(t), t.icon, t == cur, { store.go(t) })) }
        return M3NavBar(items: items, divider: store.homeInBar && !store.financeStart)
    }

    private var hlBar: some View {
        M3NavBar(items: store.hlTabs.map { h -> (String, String, Bool, () -> Void) in (store.hlName(h), h.icon, h == (store.module == .tracking ? HlTab.trk : HlTab.hl), { store.goHl(h) }) }, divider: false)
    }

    private var domBar: some View {
        var items: [(String, String, Bool, () -> Void)] = []
        if store.homeInBar { items.append((store.startLabel, "house.fill", false, { store.goStart() })) }
        for t in DomTab.allCases { items.append((t.rawValue, t.icon, store.domTab == t, { store.domTab = t })) }
        return M3NavBar(items: items, divider: store.homeInBar, accent: Color(hex: "#FFB1C8"), indicator: Color(hex: "#7B2949"))
    }
}

/// Material 3-navigasjonslinje: ikon i pillemarkør og etikett under. «Hjem» står først, skilt med en tynn strek.
struct M3NavBar: View {
    let items: [(String, String, Bool, () -> Void)]
    var divider = false
    var accent: Color = M3.primary
    var indicator: Color = M3.secondaryContainer
    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { i, it in
                if divider && i == 1 { Rectangle().fill(Color.skinFg.opacity(0.16)).frame(width: 1, height: 32) }
                Button { if !it.2 { Haptics.shared.select() }; it.3() } label: {
                    VStack(spacing: 4) {
                        Image(systemName: it.1).font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(it.2 ? M3.onPrimaryContainer : M3.onSurfaceVariant)
                            .frame(width: 60, height: 32).background(it.2 ? indicator : .clear, in: Capsule())
                        Text(it.0).font(.system(size: 12, weight: it.2 ? .bold : .medium)).foregroundStyle(it.2 ? M3.onSurface : M3.onSurfaceVariant).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(it.2 ? .isSelected : [])
            }
        }
        .padding(.top, 10).padding(.bottom, 8)
        .background(M3.card.ignoresSafeArea(edges: .bottom))
        .tint(accent)
    }
}
