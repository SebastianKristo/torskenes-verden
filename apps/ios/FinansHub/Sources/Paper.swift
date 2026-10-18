import SwiftUI
import PhotosUI
import UIKit

/* ---------------- Papir: felles mobildesign (Mobil Papir App / Mobil Nytt Design 2a) ---------------- */

/// Fargene i Papir, lys og mørk.
struct PaperPalette {
    let dark: Bool
    let ink, bg, card, line, lab, mut, pos, nav, navInk, navAct, navActInk: Color

    static let light = PaperPalette(dark: false, ink: Color(hex: "#1b1a17"), bg: Color(hex: "#f3efe6"), card: .white, line: Color(hex: "#d8d1c2"),
                                    lab: Color(hex: "#b23a2a"), mut: Color(hex: "#8f897c"), pos: Color(hex: "#2f7a4f"), nav: Color(hex: "#1b1a17"),
                                    navInk: Color(hex: "#a39e92"), navAct: Color(hex: "#f3efe6"), navActInk: Color(hex: "#1b1a17"))
    static let night = PaperPalette(dark: true, ink: Color(hex: "#ece7dc"), bg: Color(hex: "#14130f"), card: Color(hex: "#211f19"), line: Color(hex: "#34322a"),
                                    lab: Color(hex: "#e8705c"), mut: Color(hex: "#8a8578"), pos: Color(hex: "#7fcf9a"), nav: Color(hex: "#ece7dc"),
                                    navInk: Color(hex: "#5e594f"), navAct: Color(hex: "#14130f"), navActInk: Color(hex: "#ece7dc"))

    static func of(_ mode: String, system: ColorScheme) -> PaperPalette {
        switch mode {
        case "lys": return light
        case "mork": return night
        default: return system == .dark ? night : light
        }
    }
}

/// Fontene i Papir: Newsreader (serif), Manrope (tekst) og IBM Plex Mono (etiketter). Faller tilbake til systemfontene.
enum PF {
    static func serif(_ size: CGFloat, medium: Bool = false) -> Font { .custom(medium ? "Newsreader-Medium" : "Newsreader-Regular", size: size) }
    static func italic(_ size: CGFloat) -> Font { .custom("Newsreader-Italic", size: size) }
    static func ui(_ size: CGFloat, _ w: Font.Weight = .regular) -> Font {
        let name: String
        switch w {
        case .medium: name = "Manrope-Medium"
        case .semibold: name = "Manrope-SemiBold"
        case .bold: name = "Manrope-Bold"
        case .heavy, .black: name = "Manrope-ExtraBold"
        default: name = "Manrope-Regular"
        }
        return .custom(name, size: size)
    }
    static func mono(_ size: CGFloat, bold: Bool = true) -> Font { .custom(bold ? "IBMPlexMono-SemiBold" : "IBMPlexMono-Medium", size: size) }
}

private struct PaperPaletteKey: EnvironmentKey { static let defaultValue = PaperPalette.light }
extension EnvironmentValues {
    var paper: PaperPalette {
        get { self[PaperPaletteKey.self] }
        set { self[PaperPaletteKey.self] = newValue }
    }
}

/// Etikett i versaler med mono-font («SISTE NYTT»).
struct PLabel: View {
    @Environment(\.paper) private var p
    let text: String
    var color: Color? = nil
    var size: CGFloat = 10.5
    var body: some View {
        Text(text.uppercased()).font(PF.mono(size)).tracking(1.2).foregroundStyle(color ?? p.lab).lineLimit(1)
    }
}

/// Seksjonstittel med 2 px blekklinje under.
struct PSection: View {
    @Environment(\.paper) private var p
    let title: String
    var trailing: String? = nil
    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                PLabel(text: title)
                Spacer()
                if let trailing { Text(trailing).font(PF.ui(12)).foregroundStyle(p.mut) }
            }
            .padding(.horizontal, 2).padding(.bottom, 6)
            Rectangle().fill(p.ink).frame(height: 2)
        }
        .padding(.top, 4)
    }
}

/// Hvitt kort (mørkt i mørk modus) med 20 pt radius.
struct PCard<C: View>: View {
    @Environment(\.paper) private var p
    var padding: CGFloat = 14
    var radius: CGFloat = 20
    @ViewBuilder let content: () -> C
    var body: some View {
        content().padding(padding).frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/// Knapp med blekk-bakgrunn («Åpne nyhetsleser ›»).
struct PInkButton: View {
    @Environment(\.paper) private var p
    let title: String
    var height: CGFloat = 36
    var full = false
    let act: () -> Void
    var body: some View {
        Button(action: act) {
            Text(title).font(PF.ui(13, .bold)).foregroundStyle(p.bg).padding(.horizontal, 18)
                .frame(maxWidth: full ? .infinity : nil, minHeight: height)
                .background(p.ink, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Knapp med kantlinje.
struct PLineButton: View {
    @Environment(\.paper) private var p
    let title: String
    var height: CGFloat = 36
    var full = false
    let act: () -> Void
    var body: some View {
        Button(action: act) {
            Text(title).font(PF.ui(13, .semibold)).foregroundStyle(p.ink).padding(.horizontal, 16)
                .frame(maxWidth: full ? .infinity : nil, minHeight: height)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Delingsarket for filer (lenker og filer på en rett).
struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [url], applicationActivities: nil) }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

/* ---------------- Skallet ---------------- */

/// Papir-appen på iPhone: fotovindu øverst, innhold på papir og en svart fanelinje som flyter nederst
/// (Hjem, Finans, Mat, Sporing, Mer og +Skann). Sidene fra den klassiske appen vises inne i skallet.
struct PaperShell: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase
    let scan: ScanActions
    @Binding var photos: [PhotosPickerItem]
    @Binding var files: Bool
    @State private var scanSheet = false

    var body: some View {
        // Appen tvinger mørk modus i roten (klassisk design), så systemets valg leses fra skjermen.
        let system = paperSystemScheme(phase)
        let p = PaperPalette.of(store.paperMode, system: system)
        ZStack(alignment: .bottom) {
            p.bg.ignoresSafeArea()
            content(p)
            if !store.newsOpen && store.dishSel == nil { PaperTabBar(scan: { openScan() }).environment(\.paper, p) }
        }
        .environment(\.paper, p)
        .sheet(isPresented: $scanSheet) {
            PaperScanSheet(scan: scan, recipe: store.paperTab == "mat") { scanSheet = false }
                .environment(\.paper, p)
                .presentationDetents([.height(330)])
                .presentationBackground(p.bg)
        }
        .task(id: store.account?.id) {
            await store.loadPhotoWindow()
            if store.mobileHome == nil { await store.loadHome() }
        }
    }

    private func openScan() {
        Haptics.shared.tap()
        scanSheet = true
    }

    @ViewBuilder private func content(_ p: PaperPalette) -> some View {
        if store.newsOpen {
            NewsReaderView(back: { store.newsOpen = false }).environment(\.paper, p)
                .environment(\.colorScheme, p.dark ? .dark : .light)
        } else if let id = store.dishSel {
            DishDetailView(id: id, pal: MatPal.paper(p)).environment(\.paper, p)
                .environment(\.colorScheme, p.dark ? .dark : .light)
        } else if let t = store.paperFin {
            classic(back: "Finans") { FinanceTab(tab: t) }
        } else if let m = store.paperClassic {
            classic(back: m == .tracking ? "Sporing" : nil) { ModuleView(module: m, scan: scan, photos: $photos, files: $files) }
        } else {
            PaperPage().environment(\.colorScheme, p.dark ? .dark : .light)
        }
    }

    /// En side fra den klassiske appen: mørk bakgrunn og plass til fanelinja. Sidene under Mer har egen
    /// tilbakeknapp i toppen; Finans-fanene får «‹ Finans» i Papir-stil.
    private func classic<C: View>(back: String?, @ViewBuilder _ c: () -> C) -> some View {
        VStack(spacing: 0) {
            if let back {
                HStack {
                    Button { store.paperBack() } label: {
                        Text("‹ \(back)").font(PF.ui(13, .semibold)).foregroundStyle(.white).padding(.leading, 10).padding(.trailing, 14).frame(height: 34)
                            .background(Color.white.opacity(0.12), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
                .padding(.horizontal, 18).padding(.top, 4).padding(.bottom, 2)
            }
            c().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background { ZStack { Color(hex: "#14130f"); Backdrop() }.ignoresSafeArea() }
        .environment(\.colorScheme, .dark)
        .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 84) }
    }
}

extension Store {
    /// «‹ Mer» / «‹ Hjem» over sidene fra den klassiske appen.
    var paperBackLabel: String {
        switch paperTab {
        case "finans": "Finans"
        case "mat": "Mat"
        case "sporing": "Sporing"
        case "hjem": "Hjem"
        default: "Mer"
        }
    }
}

/// Den svarte fanelinja som flyter nederst. Den valgte fanen er en lys pille med ikon.
struct PaperTabBar: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let scan: () -> Void
    private let tabs: [(String, String, String)] = [("hjem", "Hjem", "⌂"), ("finans", "Finans", "kr"), ("mat", "Mat", "◐"), ("sporing", "Sporing", "▣"), ("mer", "Mer", "⋯")]

    private var current: String {
        if store.paperFin != nil { return "finans" }
        return store.paperTab == "innst" ? "mer" : store.paperTab
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(tabs, id: \.0) { t in tab(t.0, t.1, t.2) }
            Spacer(minLength: 0)
            Button(action: scan) {
                Image(systemName: "plus").font(.system(size: 20, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 46, height: 46).background(p.lab, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Skann")
        }
        .padding(.horizontal, 8)
        .frame(height: 62)
        .background(p.nav, in: Capsule())
        .shadow(color: .black.opacity(0.35), radius: 15, y: 10)
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    private func tab(_ id: String, _ name: String, _ icon: String) -> some View {
        let on = current == id
        return Button { if on && store.paperTab != "innst" { store.paperBack() } else { store.paperGo(id) } } label: {
            HStack(spacing: 6) {
                if on { Text(icon).font(PF.serif(16, medium: true)) }
                Text(name).font(PF.ui(12.5, .semibold)).lineLimit(1).minimumScaleFactor(0.75)
            }
            .foregroundStyle(on ? p.navActInk : p.navInk)
            .padding(.horizontal, on ? 14 : 7)
            .frame(height: 46)
            .background(on ? p.navAct : Color.clear, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(name)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// «Skann»: kvittering, oppskrift eller dokument. Gemini leser i bakgrunnen.
struct PaperScanSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let scan: ScanActions
    @State var recipe: Bool
    let close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Skann").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
            Text("Kvittering, oppskrift eller dokument. ✦ Gemini leser i bakgrunnen.").font(PF.ui(13)).foregroundStyle(p.mut)
            HStack(spacing: 6) {
                choice("Kvittering", !recipe) { recipe = false }
                choice("Oppskrift", recipe) { recipe = true }
            }
            Button { go { scan.camera() } } label: {
                Text("Kamera").font(PF.ui(15, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 54)
                    .background(p.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
            HStack(spacing: 8) {
                lineButton("Bilder") { go { scan.photos() } }
                lineButton("Filer (PDF)") { go { scan.files() } }
            }
        }
        .padding(.horizontal, 18).padding(.top, 22).padding(.bottom, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(p.bg)
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private func go(_ act: @escaping () -> Void) {
        store.scanTarget = recipe ? "recipe" : "receipt"
        close()
        Task {
            try? await Task.sleep(for: .milliseconds(450))
            act()
        }
    }

    private func choice(_ t: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(13.5, .semibold)).foregroundStyle(on ? p.bg : p.ink).padding(.horizontal, 14).frame(height: 34)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func lineButton(_ t: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 54)
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(p.line, lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/* ---------------- Fotovinduet og sidene ---------------- */

/// Papir-siden for valgt fane: fotovindu (høyere på Hjem) og innhold som overlapper vinduet nederst.
struct PaperPage: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let home = store.paperTab == "hjem"
        ScrollView {
            VStack(spacing: 0) {
                PaperHero(home: home)
                VStack(spacing: 10) { page }
                    .padding(.horizontal, 16)
                    .padding(.top, -23)
                    .padding(.bottom, 110)
            }
        }
        .scrollIndicators(.hidden)
        .ignoresSafeArea(edges: .top)
        .refreshable { await refresh() }
    }

    @ViewBuilder private var page: some View {
        switch store.paperTab {
        case "finans": PaperFinance()
        case "mat": MatView(pal: MatPal.paper(p), paperMode: true)
        case "sporing": PaperTracking()
        case "mer": PaperMore()
        case "innst": PaperSettings()
        default: PaperHome()
        }
    }

    private func refresh() async {
        switch store.paperTab {
        case "finans": await store.loadPaperFinance(force: true)
        case "mat": try? await store.loadWeek(); await store.loadMatExtras()
        case "sporing": try? await store.loadTracking()
        default: await store.loadHome(); await store.loadPhotoWindow()
        }
    }
}

/// Toppbildet med hilsen/tittel, klokke og vær (Hjem), bakgrunnsvelger og profilbilde.
struct PaperHero: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let home: Bool
    @State private var pickBg = false
    @State private var ownItem: PhotosPickerItem?
    @State private var pickOwn = false

    var body: some View {
        ZStack(alignment: .bottom) {
            background
            LinearGradient(colors: [.black.opacity(0.25), .clear, .black.opacity(0.45)], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 6) {
                topRow
                Spacer(minLength: 0)
                bottomRow
            }
            .padding(.horizontal, 22)
            .padding(.top, 58)
            .padding(.bottom, home ? 42 : 34)
        }
        .frame(height: home ? 262 : 212)
        .clipped()
        .confirmationDialog("Bakgrunn", isPresented: $pickBg, titleVisibility: .visible) {
            Button("Nåværende (gradient)") { store.setPhoto("cur") }
            Button("Oslo") { store.setPhoto("oslo") }
            Button("Vær nå") { store.setPhoto("weather") }
            Button("Planeter") { store.setPhoto("planets") }
            Button("Eget bilde …") { pickOwn = true }
            if store.photo == "custom" { Button("Fjern eget bilde", role: .destructive) { store.removePhoto() } }
            Button("Avbryt", role: .cancel) {}
        }
        .photosPicker(isPresented: $pickOwn, selection: $ownItem, matching: .images)
        .onChange(of: ownItem) { _, it in
            guard let it else { return }
            Task {
                if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { store.uploadPhoto(img) }
                ownItem = nil
            }
        }
    }

    @ViewBuilder private var background: some View {
        if let img = store.photoImage, store.photo != "cur" {
            // Overlay på en tom flate: bildet fyller vinduet uten å gjøre siden bredere.
            Color.clear.overlay { Image(uiImage: img).resizable().scaledToFill() }.clipped()
        } else {
            LinearGradient(colors: gradientColors, startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }

    /// Reserve uten bilde: gradient etter været («Vær nå») eller den nåværende blågrå.
    private var gradientColors: [Color] {
        if let c = store.photoWindow?.colors, c.count >= 2, store.photo != "cur" { return c }
        if store.photo == "oslo" { return [Color(hex: "#6f86a0"), Color(hex: "#c9a27a"), Color(hex: "#3a4250")] }
        if store.photo == "weather" {
            let sym = store.photoWindow?.symbol ?? ""
            let s = (sym.isEmpty ? (store.homeWeather?.symbol ?? "") : sym).lowercased()
            if s.contains("rain") || s.contains("sleet") { return [Color(hex: "#3d4a57"), Color(hex: "#1f2730")] }
            if s.contains("snow") { return [Color(hex: "#9fb0c0"), Color(hex: "#4f5f70")] }
            if s.contains("clear") || s.contains("fair") { return [Color(hex: "#5d8fc9"), Color(hex: "#d9a86a")] }
            return [Color(hex: "#6c7a88"), Color(hex: "#323c46")]
        }
        if store.photo == "planets" { return [Color(hex: "#1b1530"), Color(hex: "#5a3a2a")] }
        return [Color(hex: "#4a5a6a"), Color(hex: "#2a3440"), Color(hex: "#1d242c")]
    }

    private var bgName: String {
        switch store.photo {
        case "cur": "Nåværende"
        case "weather": "Vær nå"
        case "planets": "Planeter"
        case "custom": "Eget bilde"
        default: "Oslo"
        }
    }

    private var topRow: some View {
        HStack(spacing: 8) {
            if home {
                Text("Homelab").font(PF.serif(22, medium: true)).foregroundStyle(.white).shadow(color: .black.opacity(0.4), radius: 6)
            } else if store.paperTab == "innst" {
                pill("‹ Mer") { store.paperGo("mer") }
            }
            Spacer()
            if home { pill("\(bgName) ▾") { pickBg = true } }
            Button { store.paperTab = "innst" } label: {
                ZStack {
                    Circle().fill(Color(hex: "#f3efe6"))
                    if let a = store.avatar {
                        Image(uiImage: a).resizable().scaledToFill().clipShape(Circle())
                    } else {
                        Text(String(store.displayName.prefix(1)).uppercased()).font(PF.ui(14, .bold)).foregroundStyle(Color(hex: "#1b1a17"))
                    }
                }
                .frame(width: 38, height: 38)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Innstillinger")
        }
    }

    private func pill(_ t: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(12.5, .semibold)).foregroundStyle(.white).lineLimit(1).padding(.horizontal, 12).frame(height: 34)
                .background(Color(hex: "#1b1a17").opacity(0.55), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private var bottomRow: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 4) {
                Text(kicker).font(PF.italic(15)).opacity(0.9)
                Text(title).font(PF.serif(home ? 40 : 36, medium: true)).lineLimit(2).minimumScaleFactor(0.7).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            if home { weather }
        }
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.35), radius: 7)
    }

    @ViewBuilder private var weather: some View {
        let w = store.homeWeather
        let t = w?.temp ?? store.mobileHome?.weather?.temp
        if let t {
            Button { store.openURL(store.yrURL) } label: {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(Int(t.rounded()))°").font(PF.serif(60))
                    Text("\(w?.text ?? store.mobileHome?.weather?.text ?? "") · \(clock) ›").font(PF.ui(13)).opacity(0.9).lineLimit(1)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Åpne været i Yr")
        }
    }

    private var clock: String {
        let f = DateFormatter(); f.dateFormat = "HH:mm"; return f.string(from: Date())
    }

    private var kicker: String {
        switch store.paperTab {
        case "hjem": return longDate().capitalized(with: Locale(identifier: "nb_NO"))
        case "finans":
            let days = (Calendar.current.range(of: .day, in: .month, for: Date())?.count ?? 30) - Calendar.current.component(.day, from: Date())
            return "\(monthName()) · \(days) dager igjen"
        case "mat": return "Uke \(Calendar(identifier: .iso8601).component(.weekOfYear, from: Date()))"
        case "sporing":
            let items = (store.tracking?.items ?? store.homePackages ?? []).filter { !$0.archived && $0.status != "delivered" }
            let ready = items.filter { $0.status == "ready_for_pickup" }.count
            return "\(items.count) på vei" + (ready > 0 ? " · \(ready) klar" : "")
        case "mer": return "Alle moduler"
        case "innst": return "Konto og utseende"
        default: return ""
        }
    }

    private var title: String {
        switch store.paperTab {
        case "hjem":
            let first = store.displayName.split(separator: " ").first.map(String.init) ?? ""
            return "\(greetingWord()),\n\(first.isEmpty ? "hei" : first)"
        case "finans": return "Finans"
        case "mat": return "Mat"
        case "sporing": return "Sporing"
        case "mer": return "Mer"
        case "innst": return "Innstillinger"
        default: return ""
        }
    }
}

func greetingWord(_ d: Date = Date()) -> String {
    let h = Calendar.current.component(.hour, from: d)
    switch h {
    case 5..<10: return "God morgen"
    case 10..<17: return "God dag"
    case 17..<23: return "God kveld"
    default: return "God natt"
    }
}

func monthName(_ d: Date = Date()) -> String {
    let f = DateFormatter(); f.locale = Locale(identifier: "nb_NO"); f.dateFormat = "LLLL"
    return f.string(from: d).capitalized(with: Locale(identifier: "nb_NO"))
}

/// Systemets lys/mørk-valg (scenePhase gjør at det leses på nytt når appen blir aktiv).
func paperSystemScheme(_ phase: ScenePhase) -> ColorScheme {
    _ = phase
    return UIScreen.main.traitCollection.userInterfaceStyle == .dark ? .dark : .light
}
