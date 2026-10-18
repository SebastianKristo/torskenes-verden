import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import UserNotifications

/* ---------------- Liquid Glass: knapper, fanelinjer og Skann ---------------- */

private let barSpring = Animation.spring(response: 0.45, dampingFraction: 0.68)

extension View {
    /// iOS 26: fanelinja krymper når man scroller ned (Liquid Glass). Eldre iOS: uendret.
    @ViewBuilder func minimizeTabBarOnScroll() -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) { self.tabBarMinimizeBehavior(.onScrollDown) } else { self }
        #else
        self
        #endif
    }

    /// Interaktiv glassknapp med oransje tint (iOS 26), ellers tonet materiale.
    @ViewBuilder func glassCircle(tint: Color) -> some View {
        if DesignStyle.material { self.background(tint, in: Circle()) } else { glassCircleIOS(tint: tint) }
    }

    @ViewBuilder private func glassCircleIOS(tint: Color) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular.tint(tint).interactive(), in: .circle)
        } else {
            self.background(tint.opacity(0.85), in: Circle()).background(.ultraThinMaterial, in: Circle()).overlay(Circle().stroke(.white.opacity(0.25), lineWidth: 1))
        }
        #else
        self.background(tint.opacity(0.85), in: Circle()).background(.ultraThinMaterial, in: Circle()).overlay(Circle().stroke(.white.opacity(0.25), lineWidth: 1))
        #endif
    }

    /// Rund glassflate uten tint (tilbake- og hjemknapper): lys kant og diagonal glans som i designet.
    @ViewBuilder func glassRound() -> some View {
        if DesignStyle.material { self.background(M3.field, in: Circle()) } else { glassRoundIOS() }
    }

    @ViewBuilder private func glassRoundIOS() -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) { self.glassEffect(.regular.interactive(), in: .circle) } else { fallbackRound() }
        #else
        fallbackRound()
        #endif
    }

    func fallbackRound() -> some View {
        self.background(.white.opacity(0.08), in: Circle())
            .background(.ultraThinMaterial, in: Circle())
            .overlay(Circle().fill(LinearGradient(colors: [.white.opacity(0.22), .clear, .white.opacity(0.06)], startPoint: .topLeading, endPoint: .bottomTrailing)).allowsHitTesting(false))
            .overlay(Circle().stroke(.white.opacity(0.24), lineWidth: 1))
    }

    /// Fanelinja krymper til en sirkel når man scroller ned, og utvides når man scroller opp (iOS 18+).
    @MainActor @ViewBuilder func tracksScroll(_ store: Store) -> some View {
        if #available(iOS 18.0, *) {
            self.onScrollGeometryChange(for: CGFloat.self, of: { $0.contentOffset.y }) { old, new in
                if new > old + 8, new > 60, !store.barMini { withAnimation(barSpring) { store.barMini = true } }
                else if new < old - 8, store.barMini { withAnimation(barSpring) { store.barMini = false } }
            }
        } else {
            self
        }
    }
}

/// Knappen vokser litt når den trykkes (1,1×).
struct GlassPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed ? 1.1 : 1).animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, down in if down { Haptics.shared.tap() } }
    }
}

/// Rund glass-tilbakeknapp (44 × 44) med bare ‹-pil.
struct GlassBack: View {
    var label = "Tilbake"
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.left").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white).frame(width: 44, height: 44).contentShape(Circle())
        }
        .buttonStyle(GlassPress()).glassRound().accessibilityLabel(label)
    }
}

/// Rund glassknapp (62 px) med husikon til venstre for fanelinja: tilbake til Homelab.
struct HomeGlassButton: View {
    @Environment(Store.self) private var store
    var size: CGFloat = 62
    var body: some View {
        Button { store.goStart() } label: {
            Image(systemName: "house.fill").font(.system(size: size * 0.32, weight: .semibold)).foregroundStyle(.white).frame(width: size, height: size).contentShape(Circle())
        }
        .buttonStyle(GlassPress()).glassRound().accessibilityLabel("Tilbake til \(store.startLabel)")
    }
}

/// Skanneknappen: trykk = kamera med en gang, hold inne = Bilder / Filer (kan byttes i Innstillinger → Skanning og AI).
struct ScanActions {
    let camera: () -> Void
    let choices: () -> Void
    let photos: () -> Void
    let files: () -> Void
    let tapOpensCamera: Bool
    func tap() { tapOpensCamera ? camera() : choices() }
    func hold() { tapOpensCamera ? choices() : camera() }
}

struct ScanButton: View {
    let scan: ScanActions
    var size: CGFloat = 60
    var body: some View {
        Image(systemName: "doc.viewfinder").font(.system(size: size * 0.4, weight: .semibold)).foregroundStyle(.white)
            .frame(width: size, height: size).contentShape(Circle())
            .glassCircle(tint: .accent)
            .onTapGesture { scan.tap() }
            .onLongPressGesture(minimumDuration: 0.48) { Haptics.shared.tap(); scan.hold() }
            .accessibilityLabel("Skann kvittering")
            .accessibilityHint("Hold inne for å velge fra Bilder eller Filer")
            .accessibilityAddTraits(.isButton)
    }
}

/// «Skann» som egen glass-pille (58 px, oransje glass) som flyter over fanelinja til høyre.
struct ScanPill: View {
    let scan: ScanActions
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "doc.viewfinder").font(.system(size: 18, weight: .semibold))
            Text("Skann").fontWeight(.bold)
        }
        .foregroundStyle(.white).padding(.horizontal, 20).frame(height: 58).contentShape(Capsule())
        .glass(29, tint: Color.accent.opacity(0.5))
        .onTapGesture { scan.tap() }
        .onLongPressGesture(minimumDuration: 0.48) { Haptics.shared.tap(); scan.hold() }
        .accessibilityLabel("Skann kvittering")
        .accessibilityHint("Hold inne for å velge fra Bilder eller Filer")
        .accessibilityAddTraits(.isButton)
    }
}

/* ---------------- Fanelinjer ---------------- */

/// Det fanelinja kan vise: en fane, Homelab-/Finans-knappen («Knapp i linjen») eller handlingen i søkeplassen (Skann / Innstillinger).
enum BarItem: Hashable { case fin(Tab), hl(HlTab), dom(DomTab), home, action }

/// Rund knapp til høyre for fanelinja: Skann i Finans, Innstillinger i Domener.
struct BarAction {
    let title: String
    let icon: String
    var tint: Color = .accent
    let tap: () -> Void
    var hold: (() -> Void)? = nil
}

/// Systemets fanelinje (TabView). På iOS 26 gir den Liquid Glass med dra-effekt: legg fingeren på linja og dra
/// glass-markøren mellom fanene. Linja ligger rett over hjemindikatoren. Handlingen (Skann) står i søkeplassen
/// til høyre i samme rad. På iOS 17 er handlingen en rund knapp over linja.
struct SystemBar<Content: View>: View {
    let items: [BarItem]
    @Binding var selection: BarItem
    var action: BarAction? = nil
    var tint: Color = .accentLight
    let label: (BarItem) -> String
    let icon: (BarItem) -> String
    @ViewBuilder let content: (BarItem) -> Content

    /// Fanebytte gir et lett valg-tikk (Innstillinger → App → Haptikk).
    private var picked: Binding<BarItem> {
        Binding(get: { selection }, set: { v in if v != selection { Haptics.shared.select() }; selection = v })
    }

    var body: some View {
        if #available(iOS 18.0, *) {
            modern.tint(tint).minimizeTabBarOnScroll()
        } else {
            legacy.tint(tint)
        }
    }

    /// Fanene i TabView får en ugjennomsiktig systembakgrunn, så bakgrunnen (med fargede lysflekker når
    /// «Fargebakgrunn» er på) må ligge inne i hver fane, under innholdet.
    private func page(_ it: BarItem) -> some View {
        content(it).background(Backdrop())
    }

    @available(iOS 18.0, *)
    @ViewBuilder private var modern: some View {
        if let a = action {
            TabView(selection: picked) {
                ForEach(items, id: \.self) { it in
                    SwiftUI.Tab(label(it), systemImage: icon(it), value: it) { page(it) }
                }
                SwiftUI.Tab(a.title, systemImage: a.icon, value: BarItem.action, role: .search) { Color.clear }
            }
        } else {
            TabView(selection: picked) {
                ForEach(items, id: \.self) { it in
                    SwiftUI.Tab(label(it), systemImage: icon(it), value: it) { page(it) }
                }
            }
        }
    }

    private var legacy: some View {
        TabView(selection: picked) {
            ForEach(items, id: \.self) { it in
                page(it).tabItem { Label(label(it), systemImage: icon(it)) }.tag(it)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if let a = action {
                Image(systemName: a.icon).font(.system(size: 22, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 58, height: 58).contentShape(Circle())
                    .glassCircle(tint: a.tint)
                    .onTapGesture { a.tap() }
                    .onLongPressGesture(minimumDuration: 0.48) { Haptics.shared.tap(); (a.hold ?? a.tap)() }
                    .accessibilityLabel(a.title).accessibilityAddTraits(.isButton)
                    .padding(.trailing, 16).padding(.bottom, 60)
            }
        }
    }
}

/// Finans: Oversikt, Liste, Budsjett, Søk og Mer, med Skann i søkeplassen.
struct FinTabs: View {
    @Environment(Store.self) private var store
    let scan: ScanActions
    @Binding var photos: [PhotosPickerItem]
    @Binding var files: Bool
    var body: some View {
        let tabs = store.barFinTabs
        let home = store.homeInBar && !store.financeStart
        let items: [BarItem] = (home ? [.home] : []) + tabs.map { BarItem.fin($0) }
        let sel = Binding<BarItem>(
            get: { .fin(store.barTab(tabs)) },
            set: { v in
                switch v {
                case .fin(let t): store.go(t)
                case .home: store.goStart()
                case .action: scan.tap()
                default: break
                }
            })
        let showScan = store.selectedTx == nil && store.module != .imports && store.module != .upload
        SystemBar(items: items, selection: sel,
                  action: showScan ? BarAction(title: "Skann", icon: "doc.viewfinder", tap: scan.tap, hold: scan.hold) : nil,
                  label: { it in if case .fin(let t) = it { return store.tabName(t) }; return store.startLabel },
                  icon: { it in if case .fin(let t) = it { return t.icon }; return "house.fill" }) { it in
            if case .fin(let t) = it {
                if t == .more, let m = store.module, m.isFinance {
                    ModuleView(module: m, scan: scan, photos: $photos, files: $files)
                } else if t == .more, store.module == nil, !tabs.contains(store.tab) {
                    FinanceTab(tab: store.tab)
                } else {
                    FinanceTab(tab: t)
                }
            } else { Color.clear }
        }
    }
}

/// Homelab: Homelab, Finans, Domener og Matplan (rekkefølge, navn og synlighet kan endres).
struct HlTabs: View {
    @Environment(Store.self) private var store
    var body: some View {
        let cur: HlTab = store.module == .tracking ? .trk : .hl
        let sel = Binding<BarItem>(get: { .hl(cur) }, set: { v in if case .hl(let h) = v, h != cur { store.goHl(h) } })
        SystemBar(items: store.hlTabs.map { BarItem.hl($0) }, selection: sel,
                  label: { it in if case .hl(let h) = it { return store.hlName(h) }; return "" },
                  icon: { it in if case .hl(let h) = it { return h.icon }; return "square" }) { it in
            if case .hl(.hl) = it { HomelabView() } else if case .hl(.trk) = it { TrackingView() } else { Color.clear }
        }
    }
}

/// Domener: Trafikk, Besøk, Ytelse og Sikkerhet, med Innstillinger (tannhjul) i søkeplassen.
struct DomTabs: View {
    @Environment(Store.self) private var store
    var body: some View {
        let home = store.homeInBar
        let items: [BarItem] = (home ? [.home] : []) + DomTab.allCases.map { BarItem.dom($0) }
        let sel = Binding<BarItem>(
            get: { .dom(store.domTab) },
            set: { v in
                switch v {
                case .dom(let t): store.domTab = t
                case .home: store.goStart()
                case .action: store.domainManager = true
                default: break
                }
            })
        SystemBar(items: items, selection: sel,
                  action: BarAction(title: "Innstillinger", icon: "gearshape", tint: .domPink, tap: { store.domainManager = true }),
                  tint: .domPink,
                  label: { it in if case .dom(let t) = it { return t.rawValue }; return store.startLabel },
                  icon: { it in if case .dom(let t) = it { return t.icon }; return "house.fill" }) { it in
            if case .dom = it { DomainsView() } else { Color.clear }
        }
    }
}

/// «‹ Homelab» / «‹ Finans» øverst, med profilbildet helt til høyre på samme rad.
struct TopBackRow: View {
    @Environment(Store.self) private var store
    let title: String
    var light = false
    var body: some View {
        HStack(spacing: 10) {
            Button { store.goStart() } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left").font(.system(size: 15, weight: .semibold))
                    Text(title).font(.system(size: 16, weight: .semibold)).lineLimit(1)
                }
                .foregroundStyle(light ? Color(hex: "#1E241C") : .white)
                .padding(.leading, 12).padding(.trailing, 16).frame(height: 44).contentShape(Capsule())
            }
            .buttonStyle(GlassPress())
            .modifier(BackPillBackground(light: light))
            .accessibilityLabel("Tilbake til \(title)")
            Spacer()
            Avatar().environment(\.inTopRow, true)
        }
        .padding(.horizontal, 18).padding(.top, 4).padding(.bottom, 4)
    }
}

private struct BackPillBackground: ViewModifier {
    let light: Bool
    func body(content: Content) -> some View {
        if light {
            content.background(Color.white, in: Capsule()).overlay(Capsule().stroke(Color(hex: "#D9DCD2"), lineWidth: 1))
        } else {
            content.glass(22)
        }
    }
}

private struct InTopRowKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    /// Profilbildet i toppraden. Andre profilbilder på siden skjules mens toppraden vises.
    var inTopRow: Bool {
        get { self[InTopRowKey.self] }
        set { self[InTopRowKey.self] = newValue }
    }
}

/* ---------------- Rot ---------------- */

struct RootView: View {
    @Environment(Store.self) private var store
    @Environment(\.horizontalSizeClass) private var hSize
    @Environment(\.scenePhase) private var phase
    @State private var showCamera = false
    @State private var showPhotos = false
    @State private var showFiles = false
    @State private var showChoices = false
    @State private var photoItems: [PhotosPickerItem] = []

    private var scan: ScanActions {
        ScanActions(camera: { showCamera = true }, choices: { showChoices = true }, photos: { showPhotos = true }, files: { showFiles = true }, tapOpensCamera: store.scanTap == "camera")
    }

    /// Kvittering (standard) eller oppskrift (Skann i Papir med «Oppskrift» valgt).
    private func deliver(_ files: [Store.Upload]) {
        if store.scanTarget == "recipe" { store.scanRecipe(files) } else {
            store.upload(files)
            // Papir: filene havner i køen i Skann-arket.
            if store.paper && !files.isEmpty { store.paperScanOpen = true }
        }
        store.scanTarget = "receipt"
    }

    /// Toasten: over fanelinja i Papir, og «Ikke innlogget» vises aldri når brukeren er innlogget.
    private var toast: String? {
        guard let m = store.message else { return nil }
        if store.loggedIn && m.localizedCaseInsensitiveContains("ikke innlogget") { return nil }
        return m
    }

    private func openPendingScan(_ v: String?) {
        guard let v, store.loggedIn, !store.locked else { return }
        store.pendingScan = nil
        if v == "files" { showFiles = true } else { showCamera = true }
    }

    var body: some View {
        ZStack {
            Backdrop()
            if !store.loggedIn || store.addingAccount {
                if store.paper { PaperLoginView() } else { LoginView() }
            } else if store.onboarding != nil && store.paper {
                PaperOnboardingView()
            } else if store.locked {
                LockView()
            } else if store.original != nil {
                OriginalView()
            } else if store.editing != nil {
                TxEditView(scan: scan)
            } else if store.detail != nil {
                DetailView()
            } else if hSize == .regular && !store.paper {
                // Papir på iPad bruker samme skall som på iPhone, med navigasjonsskinne til venstre.
                PadShell(scan: scan, photos: $photoItems, files: $showFiles)
            } else {
                // Bygges på nytt når designstilen byttes (iOS ↔ Material).
                PhoneShell(scan: scan, photos: $photoItems, files: $showFiles).id(store.designStyle + store.mobileDesign)
            }
            if store.busy { ProgressView().controlSize(.large).padding(30).glass(20) }
            if let msg = toast {
                VStack { Spacer(); Text(msg).font(.subheadline.weight(.semibold)).padding(.horizontal, 18).padding(.vertical, 12).glass(16).padding(.bottom, store.paper ? 96 : 150) }
                    .transition(.opacity).onTapGesture { store.message = nil }
            }
            // «Skjul beløp i appveksleren»: dekker innholdet når appen ikke er aktiv.
            if store.hideSwitcher && phase != .active && store.loggedIn {
                ZStack { Rectangle().fill(.ultraThinMaterial); Image(systemName: "lock.fill").font(.largeTitle).foregroundStyle(.white.opacity(0.8)) }.ignoresSafeArea()
            }
        }
        .edgeSwipeBack(enabled: store.loggedIn && !store.locked && !store.addingAccount && (store.paper ? store.paperCanSwipeBack : store.canSwipeBack)) {
            if store.paper { store.paperBack() } else { store.back() }
        }
        .preferredColorScheme(.dark)
        .tint(.accent)
        .task(id: store.loggedIn) {
            // Sporing: henter status hvert 5. minutt mens appen er åpen og gir lokale varsler (ekte push er ikke bygget).
            UNUserNotificationCenter.current().delegate = NotifyDelegate.shared
            while store.loggedIn && !Task.isCancelled {
                try? await Task.sleep(for: .seconds(300))
                if Task.isCancelled { break }
                if UIApplication.shared.applicationState == .active { await store.pollTracking() }
            }
        }
        .fullScreenCover(isPresented: $showCamera) { CameraView { img in if let img { deliver([.image(img)]) } }.ignoresSafeArea() }
        .photosPicker(isPresented: $showPhotos, selection: $photoItems, maxSelectionCount: 20, matching: .images)
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                var files: [Store.Upload] = []
                for item in items {
                    if let d = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: d) { files.append(.image(img)) }
                }
                photoItems = []
                deliver(files)
            }
        }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.pdf, .jpeg, .heic, .image], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            var files: [Store.Upload] = []
            for url in urls {
                guard url.startAccessingSecurityScopedResource() else { continue }
                defer { url.stopAccessingSecurityScopedResource() }
                guard let d = try? Data(contentsOf: url) else { continue }
                if url.pathExtension.lowercased() == "pdf" { files.append(.pdf(d)) } else if let img = UIImage(data: d) { files.append(.image(img)) }
            }
            deliver(files)
        }
        .confirmationDialog("Legg til kvittering", isPresented: $showChoices, titleVisibility: .visible) {
            Button("Ta bilde") { showCamera = true }
            Button("Velg fra Bilder") { showPhotos = true }
            Button("Velg fil (PDF, JPG, HEIC)") { showFiles = true }
            Button("Avbryt", role: .cancel) {}
        } message: { Text("Filene legges i opplastingskøen, og Gemini leser dem i bakgrunnen.") }
        .sheet(isPresented: Binding(get: { store.menuOpen }, set: { store.menuOpen = $0 })) {
            ProfileMenu().presentationDetents([.medium, .large]).presentationBackground(.ultraThinMaterial)
        }
        .sheet(isPresented: Binding(get: { store.gallery }, set: { store.gallery = $0 })) {
            WidgetGallery().presentationDetents([.large]).presentationBackground(.ultraThinMaterial)
        }
        .sheet(isPresented: Binding(get: { store.domainManager }, set: { store.domainManager = $0 })) {
            DomainManager().presentationDetents([.medium, .large]).presentationBackground(.ultraThinMaterial)
        }
        .sheet(isPresented: Binding(get: { store.matFull }, set: { store.matFull = $0 })) {
            MatWeekView()
        }
        // Nyhetsleseren i den klassiske appen (Papir viser den inne i skallet).
        .fullScreenCover(isPresented: Binding(get: { store.newsOpen && !store.paper }, set: { if !$0 { store.newsOpen = false } })) {
            NewsReaderView(back: { store.newsOpen = false }).environment(\.paper, .night).environment(\.colorScheme, .dark)
        }
        .onChange(of: phase) { _, p in
            if p == .background { store.didEnterBackground() } else if p == .active { store.didBecomeActive() }
        }
        // Skann fra widgeten (AppIntent eller finanshub://scan/...): åpner kameraet eller filvelgeren.
        .onChange(of: store.pendingScan) { _, v in openPendingScan(v) }
        .onReceive(NotificationCenter.default.publisher(for: WidgetShared.scanNotification)) { _ in store.takePendingScan() }
        .onAppear { store.compact = hSize != .regular; store.takePendingScan(); openPendingScan(store.pendingScan) }
        .onChange(of: hSize) { _, v in store.compact = v != .regular }
    }
}

/// iPhone: systemets fanelinje (Liquid Glass) for Homelab, Finans og Domener. Matplan er en egen flate uten fanelinje.
/// Toppraden med «‹ Homelab» vises over modulene. Material-utseendet har egne fanelinjer (MaterialShell).
struct PhoneShell: View {
    @Environment(Store.self) private var store
    let scan: ScanActions
    @Binding var photos: [PhotosPickerItem]
    @Binding var files: Bool
    var body: some View {
        let m = store.module
        let mat = m == .mat
        VStack(spacing: 0) {
            if let t = store.topRowTitle { TopBackRow(title: t) }
            Group {
                if store.paper {
                    PaperShell(scan: scan, photos: $photos, files: $files)
                } else if DesignStyle.material {
                    MaterialShell(scan: scan, photos: $photos, files: $files)
                } else if mat {
                    MatSurface()
                } else if m == .domains {
                    DomTabs()
                } else if m == nil || m?.isFinance == true {
                    FinTabs(scan: scan, photos: $photos, files: $files)
                } else if m == .homelab || m == .tracking {
                    HlTabs()
                } else if let m {
                    ModuleView(module: m, scan: scan, photos: $photos, files: $files)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background { if mat && !store.paper { MatPal.twoA.bg.ignoresSafeArea() } }
    }
}

/// En Finans-fane. Trykk på en rad åpner utgiftsdetaljen.
struct FinanceTab: View {
    @Environment(Store.self) private var store
    var tab: Tab? = nil
    var body: some View {
        switch tab ?? store.tab {
        case .home: if store.selectedTx != nil { TxDetail(back: true) } else { HomeView() }
        case .list: if store.selectedTx != nil { TxDetail(back: true) } else { ListView() }
        case .finn: FinnView()
        case .budget: BudgetView()
        case .search: if store.selectedTx != nil { TxDetail(back: true) } else { SearchView() }
        case .more: MoreView()
        }
    }
}

/// iPad: sidefelt + liste + detalj. Hele sider fyller flaten.
struct PadShell: View {
    @Environment(Store.self) private var store
    let scan: ScanActions
    @Binding var photos: [PhotosPickerItem]
    @Binding var files: Bool
    var body: some View {
        HStack(spacing: 0) {
            Sidebar(scan: scan)
            if let m = store.module {
                ModuleView(module: m, scan: scan, photos: $photos, files: $files).frame(maxWidth: .infinity)
            } else if store.tab == .more {
                MoreView().frame(maxWidth: .infinity)
            } else if store.tab == .finn {
                FinnView().frame(maxWidth: .infinity)
            } else {
                PadMain().frame(maxWidth: .infinity)
                Divider().overlay(.white.opacity(0.1))
                PadDetail().frame(maxWidth: .infinity)
            }
        }
    }
}

struct PadMain: View {
    @Environment(Store.self) private var store
    var body: some View {
        switch store.tab {
        case .home: HomeView()
        case .list: ListView()
        case .finn: FinnView()
        case .budget: BudgetView()
        case .search: SearchView()
        case .more: MoreView()
        }
    }
}

struct PadDetail: View {
    @Environment(Store.self) private var store
    var body: some View {
        if store.tab == .budget { BudgetDetail() } else if store.tab == .search && store.selectedTx == nil { Empty(text: "Velg et treff.") } else { TxDetail(back: false) }
    }
}

/// iPad: sidefelt med husknapp og Skann øverst, fanene, og profilbildet nederst til venstre.
struct Sidebar: View {
    @Environment(Store.self) private var store
    let scan: ScanActions
    var body: some View {
        let finance = store.module == nil || store.module?.isFinance == true
        VStack(spacing: 16) {
            HomeGlassButton(size: 52)
            ScanButton(scan: scan, size: 56)
            if finance {
                ForEach(store.finTabs) { t in
                    let on = (store.module == nil && store.tab == t) || (t == .more && (store.module?.isFinance == true || (store.module == nil && !store.finTabs.contains(store.tab))))
                    item(t.rawValue, t.icon, on) { store.go(t) }
                }
            } else {
                ForEach(store.hlTabs.filter { $0 != .hl }) { t in
                    let on = (t == .mat && store.module == .mat) || (t == .dom && store.module == .domains) || (t == .trk && store.module == .tracking)
                    item(t.label, t.icon, on) { store.goHl(t) }
                }
            }
            if let m = store.module, m.isFinance || m == .settings {
                VStack(spacing: 4) { Image(systemName: m.icon).font(.title3); Text(m.rawValue).font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7) }
                    .frame(width: 70, height: 56).foregroundStyle(Color.accentLight).background(Color.white.opacity(0.16), in: RoundedRectangle(cornerRadius: 16))
            }
            Spacer()
            Avatar()
        }
        .padding(.vertical, 20).frame(width: 96).glass(0)
    }
    private func item(_ label: String, _ icon: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            VStack(spacing: 4) { Image(systemName: icon).font(.title3); Text(label).font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7) }
                .frame(width: 70, height: 56)
                .foregroundStyle(on ? Color.accentLight : .white.opacity(0.85))
                .background(on ? Color.white.opacity(0.16) : .clear, in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }
}

/// Hele sider: Homelab, sidene under Mer, modulene og innstillinger.
struct ModuleView: View {
    @Environment(Store.self) private var store
    @Environment(\.horizontalSizeClass) private var hSize
    let module: Module
    let scan: ScanActions
    @Binding var photos: [PhotosPickerItem]
    @Binding var files: Bool
    var body: some View {
        if module.isFinance && module != .upload && store.selectedTx != nil {
            TxDetail(back: true)
        } else {
            switch module {
            case .homelab: HomelabView()
            case .upload:
                if hSize == .regular {
                    HStack(spacing: 0) {
                        ScanView(scan: scan.camera, photos: $photos, pdf: $files).frame(maxWidth: .infinity)
                        Divider().overlay(.white.opacity(0.1))
                        Group { if store.selectedReceipt != nil { ConfirmView(back: false) } else { Empty(text: "Velg en kvittering.") } }.frame(maxWidth: .infinity)
                    }
                } else if store.selectedReceipt != nil { ConfirmView(back: true) } else { ScanView(scan: scan.camera, photos: $photos, pdf: $files) }
            case .fast: FastView()
            case .accounts: AccountsView()
            case .stocks: StocksMobileView()
            case .reports: ReportsView()
            case .imports: ImportView()
            case .mat: MatSurface()
            case .domains: DomainsView()
            case .sub: SubsMobileView()
            case .folders: FoldersView()
            case .settings: SettingsView()
            case .tracking: TrackingView()
            }
        }
    }
}

/* ---------------- Felles ---------------- */

/// Tittel med rund glass-tilbakeknapp og profilbildet (menyen med Andre OS).
struct ModuleHeader<Trailing: View>: View {
    @Environment(Store.self) private var store
    let title: String
    let back: (() -> Void)?
    let trailing: () -> Trailing
    init(title: String, back: (() -> Void)? = nil, @ViewBuilder trailing: @escaping () -> Trailing) {
        self.title = title; self.back = back; self.trailing = trailing
    }
    var body: some View {
        HStack(spacing: 10) {
            if store.topRowTitle == nil { GlassBack { if let back { back() } else { store.back() } } }
            Text(title).font(.system(size: 28, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
            Spacer()
            trailing()
            Avatar()
        }
        .padding(.top, 6)
    }
}

extension ModuleHeader where Trailing == EmptyView {
    init(title: String, back: (() -> Void)? = nil) { self.init(title: title, back: back, trailing: { EmptyView() }) }
}

/// Profilbildet (eller initialen): trykk åpner menyen, hold inne for raskt kontobytte.
struct Avatar: View {
    @Environment(Store.self) private var store
    @Environment(\.inTopRow) private var inTopRow
    var size: CGFloat = 44
    var body: some View {
        if store.topRowTitle != nil && !inTopRow { EmptyView() } else { button }
    }
    private var button: some View {
        Button { store.menuOpen = true } label: { AvatarImage(size: size) }
            .buttonStyle(.plain).accessibilityLabel("Meny")
            .contextMenu {
                ForEach(store.accounts) { a in
                    Button { if a.id != store.account?.id { store.switchTo(a.id) } } label: {
                        Label("\(a.label) · \(host(a.server))", systemImage: a.id == store.account?.id ? "checkmark.circle.fill" : "person.circle")
                    }
                }
                Button { store.addingAccount = true } label: { Label("Legg til konto", systemImage: "person.badge.plus") }
            }
    }
}

/// Opplastet profilbilde, ellers initialen på glass.
struct AvatarImage: View {
    @Environment(Store.self) private var store
    var size: CGFloat = 44
    var tint: Color? = nil
    var body: some View {
        if let img = store.avatar {
            Image(uiImage: img).resizable().scaledToFill().frame(width: size, height: size).clipShape(Circle()).overlay(Circle().stroke(.white.opacity(0.25), lineWidth: 1))
        } else {
            Text(initial(store.displayName.isEmpty ? "•" : store.displayName)).font(.system(size: size * 0.38, weight: .semibold)).foregroundStyle(tint == nil ? Color.white : Color.ink)
                .frame(width: size, height: size).glass(size / 2, tint: tint)
        }
    }
}

func host(_ url: String) -> String { url.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "") }

/// Menyen bak profilbildet: Homelab, Andre OS (Finans, Mat, Domener), Rediger forsiden og Innstillinger.
struct ProfileMenu: View {
    @Environment(Store.self) private var store
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    AvatarImage(size: 52, tint: .accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(store.displayName).font(.title3.weight(.bold))
                        Text("\(store.account?.username.isEmpty == false ? store.account!.username : "konto") · \(store.me?.role ?? store.account?.role ?? "") · \(store.me?.serverName ?? store.mobileHome?.serverName ?? host(store.base))")
                            .font(.footnote).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
                    }
                }
                row("Homelab", "Dashbord, søk og snarveier", "square.grid.3x3.fill", store.module == .homelab) { store.open(.homelab) }.glass(24)
                SectionLabel(text: "Andre OS")
                VStack(spacing: 0) {
                    row("Finans", "Hjem, liste, budsjett og mer", "banknote", store.module == nil || store.module?.isFinance == true) { store.go(Tab.home) }
                    Divider().overlay(.white.opacity(0.12))
                    row("Mat", "Ukemeny, oppskrifter og handleliste", "fork.knife", store.module == .mat) { store.open(.mat) }
                    Divider().overlay(.white.opacity(0.12))
                    row("Domener", "Trafikk, besøk, ytelse og sikkerhet", "globe", store.module == .domains) { store.open(.domains) }
                    Divider().overlay(.white.opacity(0.12))
                    row("Sporing", "Pakker på vei, henting og varsler", "shippingbox", store.module == .tracking) { store.open(.tracking) }
                    Divider().overlay(.white.opacity(0.12))
                    row("Nyhetsleser", "Siste nytt fra RSS, med ✦ AI-sammendrag", "newspaper", store.newsOpen) { store.menuOpen = false; store.openNews() }
                }
                .glass(24)
                row("Rediger forsiden", "Widgets og fanelinjer", "square.and.pencil", store.editHome) { store.open(.homelab); store.editHome = true }.glass(24)
                if store.accounts.count > 1 {
                    SectionLabel(text: "Kontoer")
                    VStack(spacing: 0) {
                        ForEach(Array(store.accounts.enumerated()), id: \.element.id) { i, a in
                            if i > 0 { Divider().overlay(.white.opacity(0.12)) }
                            row("\(a.label) · \(host(a.server))", nil, "person.circle", a.id == store.account?.id) { if a.id != store.account?.id { store.switchTo(a.id) } }
                        }
                    }
                    .glass(24)
                }
                VStack(spacing: 0) {
                    row("Innstillinger", nil, "gearshape", store.module == .settings) { store.openSub(.settings) }
                    Divider().overlay(.white.opacity(0.12))
                    row("Legg til konto", nil, "person.badge.plus", false) { store.menuOpen = false; store.addingAccount = true }
                }
                .glass(24)
            }
            .padding(20)
        }
        .preferredColorScheme(.dark)
    }
    private func row(_ t: String, _ sub: String?, _ icon: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack(spacing: 14) {
                Image(systemName: icon).frame(width: 24).foregroundStyle(on ? Color.accent : .white.opacity(0.7))
                VStack(alignment: .leading, spacing: 1) {
                    Text(t).fontWeight(on ? .semibold : .regular).lineLimit(1)
                    if let sub { Text(sub).font(.caption).foregroundStyle(.white.opacity(0.6)).lineLimit(1) }
                }
                Spacer()
                if on { Image(systemName: "checkmark").foregroundStyle(Color.accent) }
            }
            .padding(16).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/* ---------------- Innlogging og lås ---------------- */

/// Server, brukernavn og passord → 2FA-kode når kontoen har det → innlogget. Brukes også for «Legg til konto».
struct LoginView: View {
    @Environment(Store.self) private var store
    @State private var server = ""
    @State private var username = ""
    @State private var password = ""
    @State private var code = ""
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Spacer(minLength: 40)
                if store.addingAccount || store.pending != nil {
                    Button { if store.pending != nil { store.cancelTotp(); code = "" } else { store.addingAccount = false } } label: {
                        Label(store.pending != nil ? "Tilbake" : "Avbryt", systemImage: "chevron.left")
                    }
                    .foregroundStyle(Color.accentLight)
                }
                Image(systemName: store.pending != nil ? "lock.shield" : "chart.line.uptrend.xyaxis").font(.title).foregroundStyle(Color.ink)
                    .frame(width: 56, height: 56).background(Color.accent, in: RoundedRectangle(cornerRadius: 18))
                if let p = store.pending {
                    Text("Tofaktor").font(.system(size: 34, weight: .bold))
                    Text("Tofaktor er på for \(p.username.isEmpty ? "kontoen" : p.username). Skriv inn den 6-sifrede koden fra autentiseringsappen.").foregroundStyle(.white.opacity(0.7))
                    TextField("000000", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode).font(.system(size: 26, weight: .semibold, design: .monospaced))
                        .multilineTextAlignment(.center).padding(.horizontal, 18).frame(height: 60).glass(30)
                    Button { store.login(server: p.server, username: p.username, password: p.password, code: code) } label: {
                        Text(store.busy ? "Bekrefter …" : "Bekreft").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 54)
                    }
                    .buttonStyle(.plain).glass(27, tint: .accent).disabled(code.count < 6 || store.busy)
                    Text("Har du mistet telefonen, kan du bruke en gjenopprettingskode.").font(.footnote).foregroundStyle(.white.opacity(0.55))
                    Button("← Tilbake") { store.cancelTotp(); code = "" }.foregroundStyle(Color.accentLight)
                } else {
                    Text(store.addingAccount ? "Legg til konto" : "FinansHub").font(.system(size: 34, weight: .bold))
                    Text("Logg inn på homelab-serveren din med brukernavn og passord. Appen får bare tilgang til økonomidelen.").foregroundStyle(.white.opacity(0.7))
                    TextField("192.168.1.20:8080 eller os.dittdomene.no", text: $server).textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .padding(.horizontal, 18).frame(height: 54).glass(27)
                    TextField("Brukernavn", text: $username).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .padding(.horizontal, 18).frame(height: 54).glass(27)
                    SecureField("Passord", text: $password).textContentType(.password).submitLabel(.go).onSubmit(submit)
                        .padding(.horizontal, 18).frame(height: 54).glass(27)
                    Button(action: submit) { Text(store.busy ? "Logger inn …" : "Logg inn").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 54) }
                        .buttonStyle(.plain).glass(27, tint: .accent).disabled(server.isEmpty || password.isEmpty || store.busy)
                    Text("Nye brukere opprettes av admin i Homelab → Innstillinger → Innlogging.").font(.footnote).foregroundStyle(.white.opacity(0.55))
                }
            }
            .padding(24).frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .onAppear { if !store.addingAccount { server = store.server } }
    }
    private func submit() { store.login(server: server, username: username, password: password) }
}

struct LockView: View {
    @Environment(Store.self) private var store
    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "lock.fill").font(.system(size: 30)).foregroundStyle(Color.ink).frame(width: 72, height: 72).background(Color.accent, in: RoundedRectangle(cornerRadius: 24))
            Text("FinansHub er låst").font(.title.weight(.bold))
            Text(store.displayName).foregroundStyle(.white.opacity(0.7))
            Button { store.unlock() } label: { Label("Lås opp", systemImage: "faceid").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: 320, minHeight: 54) }
                .buttonStyle(.plain).glass(27, tint: .accent)
        }
        .padding(32)
    }
}
