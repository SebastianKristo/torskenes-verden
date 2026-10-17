import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

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
        Button { store.open(.homelab) } label: {
            Image(systemName: "house.fill").font(.system(size: size * 0.32, weight: .semibold)).foregroundStyle(.white).frame(width: size, height: size).contentShape(Circle())
        }
        .buttonStyle(GlassPress()).glassRound().accessibilityLabel("Tilbake til Homelab")
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
            .onLongPressGesture(minimumDuration: 0.48) { UIImpactFeedbackGenerator(style: .medium).impactOccurred(); scan.hold() }
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
        .onLongPressGesture(minimumDuration: 0.48) { UIImpactFeedbackGenerator(style: .medium).impactOccurred(); scan.hold() }
        .accessibilityLabel("Skann kvittering")
        .accessibilityHint("Hold inne for å velge fra Bilder eller Filer")
        .accessibilityAddTraits(.isButton)
    }
}

/// Fanelinja i Finans: husknappen til venstre og en glasskapsel over resten av bredden, med en glassmarkør som glir med fjæring.
struct FinBar: View {
    @Environment(Store.self) private var store
    @Namespace private var ns
    var body: some View {
        let current: Tab? = store.module == nil ? store.tab : (store.module?.isFinance == true ? .more : nil)
        HStack(spacing: 10) {
            HomeGlassButton()
            if store.barMini, let c = current {
                Button { withAnimation(barSpring) { store.barMini = false } } label: {
                    Image(systemName: c.icon).font(.system(size: 20, weight: .semibold)).foregroundStyle(Color.accentLight).frame(width: 62, height: 62).contentShape(Circle())
                }
                .buttonStyle(GlassPress()).glassRound().accessibilityLabel("Vis fanelinja")
                Spacer(minLength: 0)
            } else {
                HStack(spacing: 0) {
                    ForEach(store.finTabs) { t in
                        Button { store.go(t) } label: {
                            VStack(spacing: 2) {
                                Image(systemName: t.icon).font(.system(size: 18, weight: .semibold))
                                Text(t.rawValue).font(.system(size: 10.5, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
                            }
                            .foregroundStyle(t == current ? Color.accentLight : .white.opacity(0.85))
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background { if t == current { Capsule().fill(.white.opacity(0.16)).matchedGeometryEffect(id: "pill", in: ns) } }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(GlassPress())
                    }
                }
                .padding(5).frame(height: 62).glass(31)
                .animation(barSpring, value: current)
            }
        }
        .padding(.horizontal, 14).padding(.bottom, 4)
    }
}

/// Fanelinja på Homelab: Homelab, Finans, Domener og Matplan (rekkefølgen kan endres).
struct HlBar: View {
    @Environment(Store.self) private var store
    @Namespace private var ns
    var body: some View {
        let current: HlTab? = store.module == .homelab ? .hl : store.module == .mat ? .mat : store.module == .domains ? .dom : nil
        HStack(spacing: 0) {
            ForEach(store.hlTabs) { t in
                Button { store.goHl(t) } label: {
                    VStack(spacing: 2) {
                        Image(systemName: t.icon).font(.system(size: 18, weight: .semibold))
                        Text(t.label).font(.system(size: 10.5, weight: .semibold)).lineLimit(1)
                    }
                    .foregroundStyle(t == current ? Color.accentLight : .white.opacity(0.85))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background { if t == current { Capsule().fill(.white.opacity(0.16)).matchedGeometryEffect(id: "pill", in: ns) } }
                    .contentShape(Rectangle())
                }
                .buttonStyle(GlassPress())
            }
        }
        .padding(5).frame(height: 62).glass(31)
        .animation(barSpring, value: current)
        .padding(.horizontal, 14).padding(.bottom, 4)
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

    var body: some View {
        ZStack {
            Backdrop()
            if !store.loggedIn || store.addingAccount {
                LoginView()
            } else if store.locked {
                LockView()
            } else if store.original != nil {
                OriginalView()
            } else if store.editing != nil {
                TxEditView(scan: scan)
            } else if store.detail != nil {
                DetailView()
            } else if hSize == .regular {
                PadShell(scan: scan, photos: $photoItems, files: $showFiles)
            } else {
                PhoneShell(scan: scan, photos: $photoItems, files: $showFiles)
            }
            if store.busy { ProgressView().controlSize(.large).padding(30).glass(20) }
            if let msg = store.message {
                VStack { Spacer(); Text(msg).font(.subheadline.weight(.semibold)).padding(.horizontal, 18).padding(.vertical, 12).glass(16).padding(.bottom, 150) }
                    .transition(.opacity).onTapGesture { store.message = nil }
            }
            // «Skjul beløp i appveksleren»: dekker innholdet når appen ikke er aktiv.
            if store.hideSwitcher && phase != .active && store.loggedIn {
                ZStack { Rectangle().fill(.ultraThinMaterial); Image(systemName: "lock.fill").font(.largeTitle).foregroundStyle(.white.opacity(0.8)) }.ignoresSafeArea()
            }
        }
        .preferredColorScheme(.dark)
        .tint(.accent)
        .fullScreenCover(isPresented: $showCamera) { CameraView { img in if let img { store.upload(image: img) } }.ignoresSafeArea() }
        .photosPicker(isPresented: $showPhotos, selection: $photoItems, maxSelectionCount: 20, matching: .images)
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                var files: [Store.Upload] = []
                for item in items {
                    if let d = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: d) { files.append(.image(img)) }
                }
                photoItems = []
                store.upload(files)
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
            store.upload(files)
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
        .onChange(of: phase) { _, p in
            if p == .background { store.didEnterBackground() } else if p == .active { store.didBecomeActive() }
        }
    }
}

/// iPhone: innholdet går helt ut til kanten under en egen glass-fanelinje. Skann flyter over fanelinja til høyre.
struct PhoneShell: View {
    @Environment(Store.self) private var store
    let scan: ScanActions
    @Binding var photos: [PhotosPickerItem]
    @Binding var files: Bool
    var body: some View {
        let m = store.module
        let finance = m == nil || m?.isFinance == true
        let showScan = finance && store.selectedTx == nil && !(m == nil && store.tab == .search) && m != .imports && m != .upload
        Group {
            if let m { ModuleView(module: m, scan: scan, photos: $photos, files: $files) } else { FinanceTab() }
        }
        .safeAreaInset(edge: .bottom) {
            if finance { FinBar() } else if m == .homelab || m == .mat { HlBar() } else if m == .domains { DomTabBar() }
        }
        .overlay(alignment: .bottomTrailing) {
            if showScan { ScanPill(scan: scan).padding(.trailing, 18).padding(.bottom, 84) }
        }
    }
}

/// Finans-fanene. Trykk på en rad åpner utgiftsdetaljen.
struct FinanceTab: View {
    @Environment(Store.self) private var store
    var body: some View {
        switch store.tab {
        case .home: if store.selectedTx != nil { TxDetail(back: true) } else { HomeView() }
        case .list: if store.selectedTx != nil { TxDetail(back: true) } else { ListView() }
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
                    let on = (store.module == nil && store.tab == t) || (t == .more && store.module?.isFinance == true)
                    item(t.rawValue, t.icon, on) { store.go(t) }
                }
            } else {
                ForEach(store.hlTabs.filter { $0 != .hl }) { t in
                    let on = (t == .mat && store.module == .mat) || (t == .dom && store.module == .domains)
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
            case .stocks: StocksView()
            case .reports: ReportsView()
            case .imports: ImportView()
            case .mat: MatView()
            case .domains: DomainsView()
            case .sub: SubView()
            case .folders: FoldersView()
            case .finn: FinnView()
            case .settings: SettingsView()
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
            GlassBack { if let back { back() } else { store.back() } }
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
    var size: CGFloat = 44
    var body: some View {
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

/// Menyen bak profilbildet: Homelab, Andre OS (Finans, Matplan, Domener), Rediger forsiden og Innstillinger.
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
                    row("Matplan", "Ukemeny, kokk og handleliste", "fork.knife", store.module == .mat) { store.open(.mat) }
                    Divider().overlay(.white.opacity(0.12))
                    row("Domener", "Trafikk, besøk, ytelse og sikkerhet", "globe", store.module == .domains) { store.open(.domains) }
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

/// Domener: fanelinja byttes ut med Trafikk, Besøk, Ytelse og Sikkerhet (rosa aksent), med husknappen til venstre.
struct DomTabBar: View {
    @Environment(Store.self) private var store
    @Namespace private var ns
    var body: some View {
        HStack(spacing: 10) {
            HomeGlassButton()
            HStack(spacing: 0) {
                ForEach(DomTab.allCases) { t in
                    Button { store.domTab = t } label: {
                        VStack(spacing: 2) { Image(systemName: t.icon).font(.system(size: 19)); Text(t.rawValue).font(.system(size: 10.5, weight: .semibold)).lineLimit(1) }
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .foregroundStyle(store.domTab == t ? Color.domPink : .white.opacity(0.85))
                            .background { if store.domTab == t { Capsule().fill(.white.opacity(0.14)).matchedGeometryEffect(id: "pill", in: ns) } }
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(GlassPress())
                }
            }
            .padding(5).frame(height: 62).glass(31)
            .animation(barSpring, value: store.domTab)
        }
        .padding(.horizontal, 14).padding(.bottom, 4)
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
