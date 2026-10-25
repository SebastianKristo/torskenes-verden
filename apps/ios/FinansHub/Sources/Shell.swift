import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import UserNotifications

/* ---------------- Knapper og Skann ---------------- */

extension View {
    /// Rund knappeflate (tilbake og små handlinger): Papir-kort med tynn kant.
    @ViewBuilder func glassRound() -> some View {
        if let p = PaperSkin.palette { self.background(p.card, in: Circle()).overlay(Circle().stroke(p.line, lineWidth: 1)) }
        else { self.background(Color.skinFg.opacity(0.08), in: Circle()) }
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
            Image(systemName: "chevron.left").font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.skinFg).frame(width: 44, height: 44).contentShape(Circle())
        }
        .buttonStyle(GlassPress()).glassRound().accessibilityLabel(label)
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

/* ---------------- Rot ---------------- */

struct RootView: View {
    @Environment(Store.self) private var store
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
            if !files.isEmpty && store.paperTab != "kvitt" { store.paperScanOpen = true }
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
        let pal = PaperPalette.of(store.paperMode, system: paperSystemScheme(phase))
        // Papir på alle skjermer (prompt 42: det klassiske Liquid Glass-designet er slettet).
        let _ = PaperSkin.use(pal)
        ZStack {
            Backdrop()
            if !store.loggedIn || store.addingAccount {
                PaperLoginView()
            } else if store.onboarding != nil {
                PaperOnboardingView()
            } else if store.locked {
                LockView()
            } else if store.original != nil {
                OriginalView()
            } else if store.editing != nil {
                TxEditView(scan: scan)
            } else if store.detail != nil {
                DetailView()
            } else {
                // iPhone og iPad: Papir-skallet (på iPad med navigasjonsskinne til venstre).
                PaperShell(scan: scan, photos: $photoItems, files: $showFiles)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            if store.busy { ProgressView().controlSize(.large).padding(30).glass(20) }
            if let msg = toast {
                VStack { Spacer(); Text(msg).font(.subheadline.weight(.semibold)).padding(.horizontal, 18).padding(.vertical, 12).glass(16).padding(.bottom, 96) }
                    .transition(.opacity).onTapGesture { store.message = nil }
            }
            // «Skjul beløp i appveksleren»: dekker innholdet når appen ikke er aktiv.
            if store.hideSwitcher && phase != .active && store.loggedIn {
                ZStack { Rectangle().fill(.ultraThinMaterial); Image(systemName: "lock.fill").font(.largeTitle).foregroundStyle(Color.skinFg.opacity(0.8)) }.ignoresSafeArea()
            }
        }
        // Prompt 50: sveipet virker på alle sider med tilbakeknapp (nav50CanSwipe, Nav50Back.swift).
        .edgeSwipeBack(enabled: store.loggedIn && !store.locked && !store.addingAccount && store.nav50CanSwipe) {
            store.nav50SwipeBack()
        }
        // Papir følger valget lys/mørk (eller systemet).
        .preferredColorScheme(pal.dark ? .dark : .light)
        .tint(pal.lab)
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
        } message: { Text("Filene legges i opplastingskøen, og Glimt leser dem lokalt i bakgrunnen.") }
        .sheet(isPresented: Binding(get: { store.menuOpen }, set: { store.menuOpen = $0 })) {
            ProfileMenu().presentationDetents([.medium, .large]).skinSheetBackground()
        }
        .sheet(isPresented: Binding(get: { store.domainManager }, set: { store.domainManager = $0 })) {
            DomainManager().presentationDetents([.medium, .large]).skinSheetBackground()
        }
        .sheet(isPresented: Binding(get: { store.matFull }, set: { store.matFull = $0 })) {
            MatWeekView()
        }
        .onChange(of: phase) { _, p in
            if p == .background { store.didEnterBackground() } else if p == .active { store.didBecomeActive() }
        }
        // Skann fra widgeten (AppIntent eller finanshub://scan/...): åpner kameraet eller filvelgeren.
        .onChange(of: store.pendingScan) { _, v in openPendingScan(v) }
        .onReceive(NotificationCenter.default.publisher(for: WidgetShared.scanNotification)) { _ in store.takePendingScan() }
        .onAppear { store.takePendingScan(); openPendingScan(store.pendingScan) }
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

/// Hele sider inne i Papir: sidene under Mer, modulene og innstillinger. Homelab og Mat er egne Papir-sider (paperClassic).
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
            case .homelab, .mat: EmptyView()
            case .upload:
                if hSize == .regular {
                    HStack(spacing: 0) {
                        ScanView(scan: scan.camera, photos: $photos, pdf: $files).frame(maxWidth: .infinity)
                        Divider().overlay(Color.skinFg.opacity(0.1))
                        Group { if store.selectedReceipt != nil { ConfirmView(back: false) } else { Empty(text: "Velg en kvittering.") } }.frame(maxWidth: .infinity)
                    }
                } else if store.selectedReceipt != nil { ConfirmView(back: true) } else { ScanView(scan: scan.camera, photos: $photos, pdf: $files) }
            case .fast: FastView()
            case .accounts: AccountsView()
            case .stocks: StocksMobileView()
            case .reports: ReportsView()
            case .imports: ImportView()
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
            Image(uiImage: img).resizable().scaledToFill().frame(width: size, height: size).clipShape(Circle()).overlay(Circle().stroke(Color.skinFg.opacity(0.25), lineWidth: 1))
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
                            .font(.footnote).foregroundStyle(Color.skinFg.opacity(0.65)).lineLimit(1)
                    }
                }
                row("Homelab", "Dashbord, søk og snarveier", "square.grid.3x3.fill", store.module == .homelab) { store.open(.homelab) }.glass(24)
                SectionLabel(text: "Andre OS")
                VStack(spacing: 0) {
                    row("Finans", "Hjem, liste, budsjett og mer", "banknote", store.module == nil || store.module?.isFinance == true) { store.go(Tab.home) }
                    Divider().overlay(Color.skinFg.opacity(0.12))
                    row("Mat", "Ukemeny, oppskrifter og handleliste", "fork.knife", store.module == .mat) { store.open(.mat) }
                    Divider().overlay(Color.skinFg.opacity(0.12))
                    row("Domener", "Trafikk, besøk, ytelse og sikkerhet", "globe", store.module == .domains) { store.open(.domains) }
                    Divider().overlay(Color.skinFg.opacity(0.12))
                    row("Sporing", "Pakker på vei, henting og varsler", "shippingbox", store.module == .tracking) { store.open(.tracking) }
                    Divider().overlay(Color.skinFg.opacity(0.12))
                    row("Nyhetsleser", "Siste nytt fra RSS, med ✦ AI-sammendrag", "newspaper", store.newsOpen) { store.menuOpen = false; store.openNews() }
                }
                .glass(24)
                if store.accounts.count > 1 {
                    SectionLabel(text: "Kontoer")
                    VStack(spacing: 0) {
                        ForEach(Array(store.accounts.enumerated()), id: \.element.id) { i, a in
                            if i > 0 { Divider().overlay(Color.skinFg.opacity(0.12)) }
                            row("\(a.label) · \(host(a.server))", nil, "person.circle", a.id == store.account?.id) { if a.id != store.account?.id { store.switchTo(a.id) } }
                        }
                    }
                    .glass(24)
                }
                VStack(spacing: 0) {
                    row("Innstillinger", nil, "gearshape", store.module == .settings) { store.openSub(.settings) }
                    Divider().overlay(Color.skinFg.opacity(0.12))
                    row("Legg til konto", nil, "person.badge.plus", false) { store.menuOpen = false; store.addingAccount = true }
                }
                .glass(24)
            }
            .padding(20)
        }
        .skinScheme()
    }
    private func row(_ t: String, _ sub: String?, _ icon: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack(spacing: 14) {
                Image(systemName: icon).frame(width: 24).foregroundStyle(on ? Color.accent : Color.skinFg.opacity(0.7))
                VStack(alignment: .leading, spacing: 1) {
                    Text(t).fontWeight(on ? .semibold : .regular).lineLimit(1)
                    if let sub { Text(sub).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)).lineLimit(1) }
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

struct LockView: View {
    @Environment(Store.self) private var store
    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "lock.fill").font(.system(size: 30)).foregroundStyle(Color.ink).frame(width: 72, height: 72).background(Color.accent, in: RoundedRectangle(cornerRadius: 24))
            Text("FinansHub er låst").font(.title.weight(.bold))
            Text(store.displayName).foregroundStyle(Color.skinFg.opacity(0.7))
            Button { store.unlock() } label: { Label("Lås opp", systemImage: "faceid").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: 320, minHeight: 54) }
                .buttonStyle(.plain).glass(27, tint: .accent)
        }
        .padding(32)
    }
}
