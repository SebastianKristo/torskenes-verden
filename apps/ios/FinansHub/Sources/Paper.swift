import SwiftUI
import PhotosUI
import UIKit

/* ---------------- Papir: felles mobildesign (Mobil Papir App / Mobil Nytt Design 2a) ---------------- */

/// Fargene i Papir, lys og mørk. Mørk Papir er rettet for kontrast: mørk fanelinje (#2a2821) med lys aktiv fane,
/// +-knapp #f08a76 med mørkt ikon og dempet tekst #a39d90 (minst 4,5:1 mot #14130f).
struct PaperPalette {
    let dark: Bool
    let ink, bg, card, line, lab, mut, pos, nav, navInk, navAct, navActInk: Color
    /// Ikonet på +-knappen, nedtrekksmenyen og valgt rad i den.
    let onLab, pop, popSel: Color

    static let light = PaperPalette(dark: false, ink: Color(hex: "#1b1a17"), bg: Color(hex: "#f3efe6"), card: .white, line: Color(hex: "#d8d1c2"),
                                    lab: Color(hex: "#b23a2a"), mut: Color(hex: "#7a7468"), pos: Color(hex: "#2f7a4f"), nav: Color(hex: "#1b1a17"),
                                    navInk: Color(hex: "#b3ada1"), navAct: Color(hex: "#f3efe6"), navActInk: Color(hex: "#1b1a17"),
                                    onLab: .white, pop: Color(hex: "#f3efe6"), popSel: Color(hex: "#e6e0d2"))
    static let night = PaperPalette(dark: true, ink: Color(hex: "#ece7dc"), bg: Color(hex: "#14130f"), card: Color(hex: "#211f19"), line: Color(hex: "#3a372e"),
                                    lab: Color(hex: "#f08a76"), mut: Color(hex: "#a39d90"), pos: Color(hex: "#8fd9a8"), nav: Color(hex: "#2a2821"),
                                    navInk: Color(hex: "#a39d90"), navAct: Color(hex: "#ece7dc"), navActInk: Color(hex: "#14130f"),
                                    onLab: Color(hex: "#1b1a17"), pop: Color(hex: "#2a2821"), popSel: Color(hex: "#3a372e"))

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

/// Papir-appen på iPhone: fotovindu øverst, innhold på papir og en fanelinje nederst. Fanelinja følger stedet:
/// Hjem (Hjem bare på startsiden, Finans, Mat, Sporing, Mer), Finans (Oversikt, Liste, Finn, Mer) og Domener
/// (Oversikt, Publikum, Ytelse, Infra). Innholdet stopper over linja, så ingenting synes bak den.
struct PaperShell: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase
    let scan: ScanActions
    @Binding var photos: [PhotosPickerItem]
    @Binding var files: Bool

    var body: some View {
        // Appen tvinger mørk modus i roten (klassisk design), så systemets valg leses fra skjermen.
        let p = PaperPalette.of(store.paperMode, system: paperSystemScheme(phase))
        GeometryReader { g in
            let bottom = Swift.max(12, g.safeAreaInsets.bottom - 8)
            let showBar = !store.newsOpen && store.dishSel == nil
            ZStack(alignment: .bottom) {
                p.bg.ignoresSafeArea()
                VStack(spacing: 0) {
                    content(p).frame(maxWidth: .infinity, maxHeight: .infinity).clipped()
                    if showBar { Color.clear.frame(height: 62 + bottom - g.safeAreaInsets.bottom + 10) }
                }
                if showBar {
                    PaperTabBar(scan: scan)
                        .padding(.bottom, bottom)
                        .ignoresSafeArea(edges: .bottom)
                }
                if let h = store.paperHint {
                    Text(h).font(PF.ui(12.5, .semibold)).foregroundStyle(p.bg)
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(p.ink, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.trailing, 16).padding(.bottom, bottom + 72)
                        .ignoresSafeArea(edges: .bottom)
                        .transition(.opacity)
                }
            }
            .overlay(alignment: .topTrailing) {
                if store.paperBgOpen && store.paperTab == "hjem" && !store.newsOpen && store.dishSel == nil && store.paperClassic == nil {
                    PaperBgMenu(top: g.safeAreaInsets.top + 62)
                }
            }
        }
        .environment(\.paper, p)
        .animation(.easeOut(duration: 0.16), value: store.paperBgOpen)
        .animation(.easeOut(duration: 0.2), value: store.paperHint)
        .sheet(isPresented: Binding(get: { store.paperScanOpen }, set: { store.paperScanOpen = $0 })) {
            PaperScanSheet(scan: scan, recipe: store.paperTab == "mat") { store.paperScanOpen = false }
                .environment(\.paper, p)
                .presentationDetents([.height(360), .medium])
                .presentationBackground(p.bg)
        }
        .task(id: store.account?.id) {
            await store.loadPhotoWindow()
            if store.mobileHome == nil { await store.loadHome() }
        }
    }

    @ViewBuilder private func content(_ p: PaperPalette) -> some View {
        if store.newsOpen {
            NewsReaderView(back: { store.newsOpen = false }).environment(\.paper, p)
                .environment(\.colorScheme, p.dark ? .dark : .light)
        } else if let id = store.dishSel {
            DishDetailView(id: id, pal: MatPal.paper(p)).environment(\.paper, p)
                .environment(\.colorScheme, p.dark ? .dark : .light)
        } else if let t = store.paperFin {
            classic(back: store.paperFinBackLabel) { FinanceTab(tab: t) }
        } else if store.paperInDomains {
            classic(back: store.paperDomFrom == "mer" ? "Mer" : "Hjem") { DomainsView() }
        } else if let m = store.paperClassic {
            classic(back: m == .tracking ? "Sporing" : nil) { ModuleView(module: m, scan: scan, photos: $photos, files: $files) }
        } else {
            PaperPage().environment(\.colorScheme, p.dark ? .dark : .light)
        }
    }

    /// En side fra den klassiske appen: mørk bakgrunn over papiret. Sidene under Mer har egen tilbakeknapp i toppen;
    /// Finans-sidene og Domener får «‹ …» i Papir-stil.
    private func classic<C: View>(back: String?, @ViewBuilder _ c: () -> C) -> some View {
        VStack(spacing: 0) {
            if let back {
                HStack {
                    Button { store.paperUp() } label: {
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
    }
}

extension Store {
    /// «‹ Mer» / «‹ Hjem» over sidene fra den klassiske appen.
    var paperBackLabel: String {
        switch paperTab {
        case "finans", "fliste", "finn", "fmer": "Finans"
        case "mat": "Mat"
        case "sporing": "Sporing"
        case "hjem": "Hjem"
        default: "Mer"
        }
    }

    /// Klassiske Finans-sider åpnet fra Papir: tilbake til fanen de kom fra.
    var paperFinBackLabel: String {
        switch paperTab {
        case "fliste": "Liste"
        case "finn": "Finn"
        case "fmer": "Mer"
        default: "Oversikt"
        }
    }
}

/// Fanelinja nederst: fanene fordeles jevnt (den aktive tar bare plassen den trenger), og +-knappen står rett etter
/// siste fane. Trykk på + åpner valgarket; hold inne (450 ms) åpner filvelgeren direkte.
struct PaperTabBar: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let scan: ScanActions

    private var tabs: [(String, String, String)] {
        if store.paperInDomains { return [("domener", "Oversikt", "◎"), ("dpub", "Publikum", "◍"), ("dytl", "Ytelse", "⚡"), ("dinf", "Infra", "▤")] }
        if store.paperInFinance { return [("finans", "Oversikt", "◎"), ("fliste", "Liste", "≡"), ("finn", "Finn", "⇄"), ("fmer", "Mer", "⋯")] }
        var t: [(String, String, String)] = []
        if current == "hjem" { t.append(("hjem", "Hjem", "⌂")) }
        t.append(("finans", "Finans", "kr"))
        t.append(("mat", "Mat", "◐"))
        t.append(("sporing", "Sporing", "▣"))
        t.append(("mer", "Mer", "⋯"))
        return t
    }

    private var current: String {
        if store.paperInDomains { return store.paperTab }
        if store.paperInFinance {
            if store.paperFin == .list { return "fliste" }
            if store.paperFin == .finn { return "finn" }
            if store.paperFin == nil && store.paperClassic == nil && Store.paperFinTabs.contains(store.paperTab) { return store.paperTab }
            return "fmer"
        }
        if store.paperTab == "innst" || store.paperClassic != nil { return "mer" }
        return store.paperTab
    }

    var body: some View {
        let cur = current
        HStack(spacing: 2) {
            ForEach(tabs, id: \.0) { t in tab(t.0, t.1, t.2, on: cur == t.0) }
            PaperPlusButton(label: plusLabel, tap: plusTap, hold: plusHold)
                .padding(.leading, 4)
        }
        .padding(.horizontal, 8)
        .frame(height: 62)
        .background(p.nav, in: Capsule())
        .shadow(color: .black.opacity(0.35), radius: 15, y: 10)
        .padding(.horizontal, 12)
    }

    private var plusLabel: String {
        if store.paperInDomains { return "Legg til domene" }
        if store.paperInFinance { return "Legg til kvittering" }
        return store.paperTab == "mat" ? "Skann oppskrift" : "Skann"
    }

    private func plusTap() {
        Haptics.shared.tap()
        if store.paperInDomains { store.domainManager = true; return }
        store.paperScanOpen = true
    }

    private func plusHold() {
        Haptics.shared.tick()
        if store.paperInDomains { store.domainManager = true; return }
        store.scanTarget = store.paperTab == "mat" ? "recipe" : "receipt"
        store.paperHint = "Velg filer å laste opp"
        scan.files()
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(1600))
            store.paperHint = nil
        }
    }

    private func tab(_ id: String, _ name: String, _ icon: String, on: Bool) -> some View {
        Button { tapTab(id, on: on) } label: {
            HStack(spacing: 7) {
                if on { Text(icon).font(PF.serif(16, medium: true)) }
                Text(name).font(PF.ui(12.5, .semibold)).lineLimit(1).minimumScaleFactor(0.75)
            }
            .foregroundStyle(on ? p.navActInk : p.navInk)
            .padding(.horizontal, on ? 16 : 6)
            .frame(maxWidth: on ? nil : .infinity)
            .frame(height: 46)
            .background(on ? p.navAct : Color.clear, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .layoutPriority(on ? 1 : 0)
        .accessibilityLabel(name)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func tapTab(_ id: String, on: Bool) {
        if on {
            if store.paperInner || store.paperFin != nil || store.paperClassic != nil { store.paperBack() }
            return
        }
        store.paperGo(id)
    }
}

/// +-knappen: trykk = valg, hold inne = opplasting med en gang (haptisk tikk og et kort hint).
struct PaperPlusButton: View {
    @Environment(\.paper) private var p
    let label: String
    let tap: () -> Void
    let hold: () -> Void
    @State private var pressed = false

    var body: some View {
        Text("+").font(.system(size: 24, weight: .regular)).foregroundStyle(p.onLab)
            .frame(width: 46, height: 46)
            .background(p.lab, in: Circle())
            .scaleEffect(pressed ? 0.88 : 1)
            .animation(.easeOut(duration: 0.15), value: pressed)
            .contentShape(Circle())
            .onTapGesture { tap() }
            .onLongPressGesture(minimumDuration: 0.45, perform: { hold() }, onPressingChanged: { pressed = $0 })
            .accessibilityLabel(label)
            .accessibilityHint("Trykk for valg, hold inne for å laste opp")
            .accessibilityAddTraits(.isButton)
    }
}

/// Skann-arket: kvittering, oppskrift eller dokument, og køen med det som leses nå.
struct PaperScanSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let scan: ScanActions
    @State var recipe: Bool
    let close: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(title).font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(13)).foregroundStyle(p.mut)
                if !store.paperInFinance {
                    HStack(spacing: 6) {
                        choice("Kvittering", !recipe) { recipe = false }
                        choice("Oppskrift", recipe) { recipe = true }
                    }
                }
                Button { go { scan.camera() } } label: {
                    Text("Kamera").font(PF.ui(15, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 54)
                        .background(p.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
                lineButton("Bilder eller filer") { go { scan.files() } }
                lineButton("Fra Bilder") { go { scan.photos() } }
                queue
            }
            .padding(.horizontal, 18).padding(.top, 22).padding(.bottom, 10)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(p.bg)
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private var title: String { store.paperInFinance ? "Legg til kvittering" : recipe ? "Skann oppskrift" : "Skann" }
    private var sub: String {
        store.paperInFinance ? "Ta bilde, velg filer eller del fra e-post. ✦ Gemini leser i bakgrunnen og kobler mot transaksjonen."
            : "Kvittering, oppskrift eller dokument. ✦ Gemini leser i bakgrunnen."
    }

    @ViewBuilder private var queue: some View {
        let jobs = Array(store.jobs.filter { $0.status != "booked" }.prefix(6))
        if !jobs.isEmpty || store.uploading > 0 {
            PLabel(text: "Kø").padding(.top, 6)
            if store.uploading > 0 {
                Text("Laster opp \(store.uploading) fil\(store.uploading > 1 ? "er" : "") …").font(PF.ui(13)).foregroundStyle(p.mut)
            }
            ForEach(jobs) { j in queueRow(j) }
        }
    }

    private func queueRow(_ j: Job) -> some View {
        let done = j.status == "needs_review" || j.status == "review" || j.status == "done"
        let failed = j.status == "error" || j.status == "failed"
        let pct = Double(Swift.min(100, Swift.max(0, j.progress ?? (done ? 100 : 10)))) / 100
        return VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(j.merchant ?? j.name ?? "Kvittering").font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                Spacer()
                Text(failed ? "Feilet" : done ? "✓ Klar til bekreftelse" : j.status == "pending" ? "I kø" : "✦ Leser … \(Int(pct * 100)) %").font(PF.ui(12)).foregroundStyle(done ? p.pos : p.lab)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(p.line)
                    Capsule().fill(done ? p.pos : p.lab).frame(width: g.size.width * pct)
                }
            }
            .frame(height: 4)
        }
        .padding(12)
        .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
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

/* ---------------- Bakgrunnsvelgeren (egen nedtrekksmeny) ---------------- */

/// Papirfarget panel under bakgrunnspillen: miniatyr, navn, undertekst og ✓, og «+ Eget bilde» nederst.
/// Lukkes ved trykk utenfor. Ikke systemets Menu/contextMenu.
struct PaperBgMenu: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let top: CGFloat
    @State private var item: PhotosPickerItem?

    private let kinds: [(String, String)] = [("cur", "Nåværende"), ("oslo", "Oslo"), ("weather", "Vær nå"), ("planets", "Planeter")]

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.opacity(0.001)
                .ignoresSafeArea()
                .onTapGesture { store.paperBgOpen = false }
            panel
                .padding(.top, top)
                .padding(.trailing, 22)
                .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .topTrailing)))
        }
        .onChange(of: item) { _, it in
            guard let it else { return }
            Task {
                if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { store.uploadPhoto(img) }
                item = nil
                store.paperBgOpen = false
            }
        }
    }

    private var panel: some View {
        VStack(spacing: 2) {
            ForEach(kinds, id: \.0) { k in row(k.0, k.1) }
            if store.photo == "custom" { row("custom", "Eget bilde") }
            Rectangle().fill(p.line).frame(height: 1).padding(.horizontal, 8).padding(.vertical, 2)
            PhotosPicker(selection: $item, matching: .images) {
                HStack(spacing: 10) {
                    Text("+").font(PF.ui(15, .semibold)).foregroundStyle(p.mut)
                        .frame(width: 30, height: 30)
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(p.mut, style: StrokeStyle(lineWidth: 1.5, dash: [3, 3])))
                    Text("Eget bilde").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                    Spacer()
                }
                .padding(.horizontal, 10).frame(height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(6)
        .frame(width: 236)
        .background(p.pop, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.45), radius: 20, y: 16)
    }

    private func row(_ kind: String, _ name: String) -> some View {
        let sel = store.photo == kind
        return Button { pick(kind) } label: {
            HStack(spacing: 10) {
                thumb(kind)
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                    Text(subtitle(kind, sel)).font(PF.ui(11.5, .medium)).foregroundStyle(sel && store.photoFailed ? p.lab : p.mut).lineLimit(2)
                }
                Spacer(minLength: 4)
                if sel { Text("✓").font(PF.ui(13, .bold)).foregroundStyle(p.pos) }
            }
            .padding(.horizontal, 10).frame(minHeight: 50)
            .background(sel ? p.popSel : Color.clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(sel ? .isSelected : [])
    }

    private func pick(_ kind: String) {
        Haptics.shared.select()
        if store.photo == kind && store.photoFailed { store.retryPhoto(); return }
        store.setPhoto(kind)
        store.paperBgOpen = false
    }

    private func subtitle(_ kind: String, _ sel: Bool) -> String {
        if sel && store.photoFailed { return "Fikk ikke lastet bildet · trykk for å prøve igjen" }
        switch kind {
        case "cur": return "Mørk gradient"
        case "oslo": return "Bilde av Oslo"
        case "weather": return "Følger været nå · \(store.weatherWord)"
        case "planets": return "Ny planet hver dag (NASA)"
        default: return "Ditt bilde"
        }
    }

    @ViewBuilder private func thumb(_ kind: String) -> some View {
        let img: UIImage? = store.photo == kind ? store.photoImage : Store.cachedBg(kind)
        ZStack {
            LinearGradient(colors: [Color(hex: "#4a5a6a"), Color(hex: "#1d242c")], startPoint: .top, endPoint: .bottom)
            if let img, kind != "cur" { Image(uiImage: img).resizable().scaledToFill() }
        }
        .frame(width: 30, height: 30)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

extension Store {
    /// «klart», «skyet», «regn» … for «Vær nå».
    var weatherWord: String {
        let s = (photoWindow?.symbol ?? homeWeather?.symbol ?? "").lowercased()
        if s.contains("rain") || s.contains("sleet") || s.contains("regn") { return "regn" }
        if s.contains("snow") || s.contains("snø") { return "snø" }
        if s.contains("fog") || s.contains("tåke") { return "tåke" }
        if s.contains("night") || s.contains("natt") { return "natt" }
        if s.contains("clear") || s.contains("fair") || s.contains("klart") { return "klart" }
        return "skyet"
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
                    .padding(.bottom, 20)
            }
        }
        .scrollIndicators(.hidden)
        .ignoresSafeArea(edges: .top)
        .refreshable { await refresh() }
    }

    @ViewBuilder private var page: some View {
        switch store.paperTab {
        case "finans": PaperFinance()
        case "fliste": PaperFinList()
        case "finn": PaperFinn()
        case "fmer": PaperFinMore()
        case "mat": MatView(pal: MatPal.paper(p), paperMode: true)
        case "sporing": PaperTracking()
        case "mer": PaperMore()
        case "innst": PaperSettings()
        default: PaperHome()
        }
    }

    private func refresh() async {
        switch store.paperTab {
        case "finans", "fmer": await store.loadPaperFinance(force: true)
        case "fliste": try? await store.loadTx()
        case "finn": try? await store.loadFinn()
        case "mat": try? await store.loadWeek(); await store.loadMatExtras()
        case "sporing": try? await store.loadTracking()
        default: await store.loadHome(); await store.loadPhotoWindow()
        }
    }
}

/// Toppbildet med hilsen/tittel, klokke og vær (Hjem), bakgrunnsvelger og profilbilde. Utenfor Hjem står
/// pila øverst til venstre («‹ Hjem»), som går tilbake til startsiden.
struct PaperHero: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let home: Bool

    var body: some View {
        ZStack(alignment: .bottom) {
            background
            // Mørk toning øverst og nederst, så teksten alltid er lesbar.
            LinearGradient(stops: [.init(color: .black.opacity(0.25), location: 0), .init(color: .clear, location: 0.35), .init(color: .black.opacity(0.45), location: 1)],
                           startPoint: .top, endPoint: .bottom)
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
            switch store.weatherWord {
            case "regn": return [Color(hex: "#3d4a57"), Color(hex: "#1f2730")]
            case "snø": return [Color(hex: "#9fb0c0"), Color(hex: "#4f5f70")]
            case "klart": return [Color(hex: "#5d8fc9"), Color(hex: "#d9a86a")]
            default: return [Color(hex: "#6c7a88"), Color(hex: "#323c46")]
            }
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
            } else {
                pill("‹ \(store.paperTab == "innst" ? "Mer" : "Hjem")") { store.paperUp() }
            }
            Spacer()
            if home { pill("\(bgName) ▾") { Haptics.shared.select(); store.paperBgOpen.toggle() } }
            Button { store.paperGo("innst") } label: {
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
        case "fliste": return "\(monthName()) · alle kontoer"
        case "finn": return "Kjøp og salg"
        case "fmer": return "Penger, moduler og data"
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
        case "fliste": return "Liste"
        case "finn": return "Finn"
        case "fmer": return "Mer i Finans"
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
