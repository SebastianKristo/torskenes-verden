import Foundation
import SwiftUI
import UIKit
import LocalAuthentication
import Network

/// Fanene i Finans. Mer samler resten av sidene fra nettsiden.
enum Tab: String, CaseIterable, Identifiable {
    case home = "Oversikt", list = "Liste", finn = "Finn", budget = "Budsjett", search = "Søk", more = "Mer"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .home: "house"
        case .list: "list.bullet"
        case .finn: "bag"
        case .budget: "chart.pie"
        case .search: "sparkle.magnifyingglass"
        case .more: "square.grid.2x2"
        }
    }
    /// ID-en som lagres i oppsettet (finTabs).
    var key: String {
        switch self {
        case .home: "home"
        case .list: "list"
        case .finn: "finn"
        case .budget: "bud"
        case .search: "ai"
        case .more: "mer"
        }
    }
    static func from(key: String) -> Tab? { allCases.first { $0.key == key } }
}

/// Skjermer som fyller hele vinduet: Homelab, sidene under Mer, modulene og innstillinger.
enum Module: String, CaseIterable, Identifiable {
    case homelab = "Homelab", upload = "Kvitteringer", fast = "Faste utgifter", accounts = "Kontoer", stocks = "Aksjer", reports = "Rapporter", imports = "Import"
    case mat = "Mat", domains = "Domener", sub = "Subscription OS", folders = "Boliger", settings = "Innstillinger", tracking = "Sporing"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .homelab: "square.grid.3x3.fill"
        case .upload: "doc.text.viewfinder"
        case .fast: "repeat"
        case .accounts: "building.columns"
        case .stocks: "chart.line.uptrend.xyaxis"
        case .reports: "chart.bar"
        case .imports: "square.and.arrow.down"
        case .mat: "fork.knife"
        case .domains: "globe"
        case .sub: "arrow.triangle.2.circlepath"
        case .folders: "folder.badge.person.crop"
        case .settings: "gearshape"
        case .tracking: "shippingbox"
        }
    }
    /// Sider under Mer: fanelinja for Finans vises, med Mer markert.
    var isFinance: Bool { [.upload, .fast, .accounts, .stocks, .reports, .imports, .sub, .folders].contains(self) }
    static let others: [Module] = [.mat, .domains]
}

/// Fanene på Homelab: Homelab, Finans, Mat, Sporing og Domener.
enum HlTab: String, CaseIterable, Identifiable {
    case hl, home, dom, mat, trk
    var id: String { rawValue }
    var label: String { switch self { case .hl: "Homelab"; case .home: "Finans"; case .dom: "Domener"; case .mat: "Mat"; case .trk: "Sporing" } }
    var icon: String { switch self { case .hl: "square.grid.3x3.fill"; case .home: "banknote"; case .dom: "globe"; case .mat: "fork.knife"; case .trk: "shippingbox" } }
}

/// Hvor man er: en Finans-fane eller en hel side.
enum Place: Equatable { case tab(Tab), module(Module) }

enum DomTab: String, CaseIterable, Identifiable {
    case traffic = "Trafikk", visits = "Besøk", perf = "Ytelse", security = "Sikkerhet"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .traffic: "chart.xyaxis.line"
        case .visits: "globe.europe.africa"
        case .perf: "speedometer"
        case .security: "shield.lefthalf.filled"
        }
    }
}

/// En innlogget konto. Flere kan være logget inn samtidig; hver har egne data, tokens og varsler.
struct LoginAccount: Codable, Identifiable, Hashable {
    var id: String
    var server: String
    var username: String
    var name: String
    var role: String
    var token: String
    var local: String
    var external: String
    var label: String { name.isEmpty ? (username.isEmpty ? "Konto" : username) : name }
}

struct PendingLogin { let server: String; let username: String; let password: String }

struct DomainToday { let name: String; let visitors: Double }

/// Designstil per enhet: «ios» (Liquid Glass) eller «material» (Android-utseende, Material 3). Leses av byggeklossene (glass(), Backdrop).
enum DesignStyle {
    /// Brukerens valg i Klassisk (iOS-glass eller Material).
    static var materialChoice = UserDefaults.standard.string(forKey: "fh_design") == "material"
    /// Material-farger brukes aldri inne i Papir; der gjelder Papir-paletten på alle skjermer.
    static var material: Bool {
        get { PaperSkin.palette == nil && materialChoice }
        set { materialChoice = newValue }
    }
}

@MainActor
@Observable
final class Store {
    /* ---------- Kontoer (nøkkelringen) ---------- */

    private(set) var accounts: [LoginAccount] = Store.loadAccounts()
    private(set) var activeId: String? = Keychain.get("active")
    var account: LoginAccount? { accounts.first { $0.id == activeId } ?? accounts.first }
    var loggedIn: Bool { account != nil }
    var server: String { account?.server ?? Keychain.get("server") ?? "" }
    var displayName: String {
        if let n = me?.label, !n.isEmpty { return n }
        if let n = mobileHome?.name, !n.isEmpty { return n }
        if let a = account, !a.name.isEmpty { return a.name }
        return boot?.settings.name ?? ""
    }
    private(set) var base = ""
    /// Skann fra widgeten eller en deep link: «camera» eller «files». RootView åpner riktig velger.
    var pendingScan: String?
    private(set) var route = "–"
    private(set) var lastSync: Date?
    var addingAccount = false
    private(set) var pending: PendingLogin?

    /* ---------- Tilstand ---------- */

    var tab: Tab = .home
    var module: Module?
    @ObservationIgnored private var backTo: Place?
    var boot: Boot?
    var summary: Summary?
    var me: Me?
    var txs: [Tx]?
    var receipts: [Receipt]?
    var query = ""
    var filter = ""
    var selectedTx: Int?
    var selectedBudget: Int?
    var selectedReceipt: String?
    var busy = false
    var message: String?
    var jobs: [Job] = []
    var uploading = 0
    var menuOpen = false
    var settingsPage: String?
    /// Fanelinja krymper til en sirkel når man scroller ned (iOS 18+).
    var barMini = false
    /// iPhone (kompakt bredde): toppraden med «‹ Homelab» brukes bare her.
    var compact = true
    /// «Administrer domener» (arket bak tannhjulet i Domener).
    var domainManager = false
    /// Matplan: valgt dag (indeks 0–6), nil = i dag. «Se hele uka» viser hele uka og alle retter.
    var matDay: Int?
    var matFull = false

    /* ---------- Homelab ---------- */

    var mobileHome: MobileHome?
    var homeError: String?
    private(set) var layout: HomeLayout = .standard
    var editHome = false
    var gallery = false
    var history: [String] = []
    var suggestions: [String] = []
    var todayMeal: String?
    var domainToday: DomainToday?
    private(set) var avatar: UIImage?
    @ObservationIgnored private var suggestTask: Task<Void, Never>?

    /* ---------- Finans: søk, redigering, originaler og Mer ---------- */

    var ai: AiAnswer?
    var aiQuery = ""
    var aiBusy = false
    var aiHistory: [String] = []
    /// Melding når AI-søket falt tilbake til vanlig søk.
    var aiNote: String?
    /// Forslag før søk: Butikker, Varer i kvitteringer, Beløp og perioder.
    var suggestGroups: [SuggestGroup] = []
    var editing: TxDraft?
    var original: Original?
    var originalTab = "receipt"
    var detail: DetailInfo?
    var detailTx: [Tx]?
    var recurring: [Recurring]?
    var stocks: Stocks?
    var stockPeriod = "1M"
    var report: Report?
    var reportYear = false
    var importFiles: [(name: String, data: Data)] = []
    var importText = ""
    var importResult: ImportResult?

    var week: Week?
    var subs: SubList?
    var folders: [Folder]?
    var folder: Folder?
    var finn: FinnList?
    /// Finn: åpen handel (id), detaljen og opplasting/henting som pågår.
    var finnSel: Int?
    var finnDetail: FinnDetail?
    /// receipts | photos | emails | ad mens det lastes opp eller hentes.
    var finnBusy: String?
    /// Boliger: kategoriene og «Legg i bolig» (målet for skann mens man står i en bolig; nil = boligen som er åpen).
    var boligCats: [BoligCategory] = []
    var uploadFolder: Int?
    var tokens: [TokenInfo]?
    var tokenError: String?
    var newToken: String?
    var domains: [DomainRef]?
    var domain: String?
    var analytics: Analytics?
    var domTab: DomTab = .traffic
    var domRange = "24h"
    var moduleError: String?

    /* ---------- Sporing, vær, aksjer og abonnement (prompt 11) ---------- */

    var tracking: TrackingData?
    /// De 2 viktigste pakkene på Homelab-hjem (fra /mobile/home, oppdateres av Sporing).
    var homePackages: [Shipment]?
    var homeWeather: WeatherX?
    /// Åpen sending (kortet er utvidet med tidslinjen).
    var trkSel: String?
    /// active | pickup | out | done
    var trkFilter = "active"
    var trkChecking = false
    var stocksX: StocksX?
    /// ov | det | tx (Portefølje, Aksjedetaljer, Transaksjoner)
    var stockScreen = "ov"
    var stockSel: String?
    /// Detaljen ble åpnet fra Transaksjoner (tilbake går dit).
    var stockFrom: String?
    var subsX: SubsX?
    /// home | ins | hist
    var subTab = "home"
    /// «Fra transaksjoner» i +-panelet (nil = laster).
    var subCandidates: [SubCandidate]?

    /* ---------- Papir, nyhetsleser, fotovindu og Mat (prompt 13) ---------- */

    /// klassisk | papir. Lagres per bruker på serveren (layout.mobileDesign) og lokalt.
    /// Ny installasjon (ingen kontoer i nøkkelringen): Papir er standard.
    var mobileDesign = UserDefaults.standard.string(forKey: "fh_mobile_design") ?? (Store.freshInstall ? "papir" : "klassisk") {
        didSet { UserDefaults.standard.set(mobileDesign, forKey: "fh_mobile_design") }
    }
    /// auto | lys | mork
    var paperMode = UserDefaults.standard.string(forKey: "fh_paper_mode") ?? "auto" {
        didSet { UserDefaults.standard.set(paperMode, forKey: "fh_paper_mode") }
    }
    /// cur | oslo | weather | planets | custom
    var photo = UserDefaults.standard.string(forKey: "fh_photo") ?? "oslo" {
        didSet { UserDefaults.standard.set(photo, forKey: "fh_photo") }
    }
    /// Papir-fanen: hjem | finans | mat | sporing | mer
    var paperTab = "hjem"
    /// En Finans-fane fra den klassiske appen, åpnet fra Papir (Liste, Budsjett, Søk, Finn, Oversikt).
    var paperFin: Tab?
    /// «Alt om sporing»: den klassiske Sporing-siden med kilder, varsler og transportører.
    var paperTrackFull = false
    var photoWindow: PhotoWindow?
    var photoImage: UIImage?

    /* ---------- Papir, prompt 14 ---------- */

    /// Bakgrunnsvelgeren på Hjem (egen nedtrekksmeny).
    var paperBgOpen = false
    /// Bildet til bakgrunnen kunne ikke lastes (vises i menyen: «trykk for å prøve igjen»).
    var photoFailed = false
    /// Kort hint over +-knappen («Velg filer å laste opp»).
    var paperHint: String?
    /// Skann-arket i Papir (åpnes av +-knappen).
    var paperScanOpen = false
    /// Onboarding etter første innlogging (0–2), nil = vises ikke.
    var onboarding: Int?
    /// Sporing i Papir: Aktive | Klar for henting | På vei | Registrert | Levert | Alle
    var trkTab = "Aktive"
    /// «Varsler og kilder» i Papir-sporing.
    var trkSettings = false
    /// Rekkefølgen på Sporing-kortene (lagres per bruker i layout.trkOrder).
    var trkOrder: [String] = UserDefaults.standard.stringArray(forKey: "fh_trk_order") ?? ["add", "shipments", "notify", "carriers"] {
        didSet { UserDefaults.standard.set(trkOrder, forKey: "fh_trk_order") }
    }
    /// Finn i Papir: Alle | På vei | Kjøpt | Solgt | Fullført
    var finnSeg = "Alle"
    /// Abonnementet som redigeres (arket), og om arket er åpent for et nytt abonnement.
    var subEdit: SubItem?
    var subNew = false

    /* ---------- Papir, prompt 15 ---------- */

    /// Tilpassede sider: rekkefølge og skjulte kort per side (layout.pages). Lokal kopi til serveren har svart.
    var paperPages: [String: PaperPageLayout] = PaperPageLayout.loadLocal() {
        didSet { PaperPageLayout.saveLocal(paperPages) }
    }
    /// Siden som er i redigeringsmodus (hold inne et kort), nil = ingen.
    var paperEditPage: String?
    /// Finans-fanelinjen i Papir (opptil 4 av oversikt, liste, finn, sok, budsjett …). Mer er alltid sist.
    var finNav: [String] = UserDefaults.standard.stringArray(forKey: "fh_fin_nav") ?? ["oversikt", "liste", "finn", "sok"] {
        didSet { UserDefaults.standard.set(finNav, forKey: "fh_fin_nav") }
    }
    /// Fjerde fane: auto (Domener, eller Sporing når pakker er på vei) | domener | sporing
    var fourthTab = UserDefaults.standard.string(forKey: "fh_fourth_tab") ?? "auto" {
        didSet { UserDefaults.standard.set(fourthTab, forKey: "fh_fourth_tab") }
    }
    /// Skanneknappen: float (flyter over linjen, søk i linjen) | inline (+ i linjen)
    var fabMode = UserDefaults.standard.string(forKey: "fh_fab") ?? "float" {
        didSet { UserDefaults.standard.set(fabMode, forKey: "fh_fab") }
    }
    /// Værappen (trykk på temperaturen på Hjem).
    var weatherOpen = false
    var weatherFull: WeatherFull?
    var weatherPlace = UserDefaults.standard.string(forKey: "fh_wx_place") ?? "oslo" {
        didSet { UserDefaults.standard.set(weatherPlace, forKey: "fh_wx_place") }
    }
    var weatherBusy = false
    /// Detaljvisning for en transaksjon i Papir (Finans → Liste → trykk på en rad).
    var paperTxId: Int?
    var txDetail: PaperTxData?
    /// Kvitteringer til gjennomgang (banneret på Finans → Oversikt).
    var reviewCount: Int?
    /// De 15 siste transaksjonene (Finans → Oversikt).
    var recent15: [Tx]?
    /// Domener i Papir: «Alle domener» (kort per domene) og tallene for hvert domene.
    var domAllMode = false
    var domAll: [String: Analytics] = [:]
    /// «Ny sending»-arket (den flytende knappen på Sporing).
    var trackAddOpen = false

    /* ---------- Papir, prompt 16 ---------- */

    /// Hovedfanelinjen i Papir (layout.tabBar): fanene, navnene og ikonene brukeren har valgt. Tom = standard.
    var tabBarItems: [PaperTabItem] = PaperTabItem.loadLocal() {
        didSet { PaperTabItem.saveLocal(tabBarItems) }
    }
    /// Arket for å redigere fanelinjen (hold inne på linjen, eller Innstillinger → Fanelinje).
    var tabBarEditing = false
    /// Fargetema for ikonene i Innstillinger: standard | varm | kjolig | mono | fargerik
    var iconTheme = UserDefaults.standard.string(forKey: "fh_icon_theme") ?? "standard" {
        didSet { UserDefaults.standard.set(iconTheme, forKey: "fh_icon_theme") }
    }
    /// Legg til abonnement (den røde +-sirkelen i fanelinja på Subscription OS).
    var subAdding = false
    /// Værstedene til brukeren (/api/weather/places). Standard: Oslo, Bergen, Trondheim og Tromsø.
    var weatherPlaces: [WxPlace] = WxPlace.loadLocal() {
        didSet { WxPlace.saveLocal(weatherPlaces) }
    }

    /// Ingen kontoer og ikke noe eldre token: appen er nyinstallert.
    nonisolated static var freshInstall: Bool {
        if UserDefaults.standard.object(forKey: "fh_installed_before") != nil { return false }
        return Keychain.get("accounts") == nil && Keychain.get("token") == nil
    }
    var news: NewsData?
    var homeNews: [NewsItem] = []
    var newsOpen = false
    var newsCat = "siste"
    var newsBusy = false
    /// Koordinatene til været på forsiden (for Yr-lenken).
    var weatherLat: Double?
    var weatherLon: Double?
    /// Skann fra Papir: «receipt» eller «recipe». Kamera, Bilder og Filer sender bildet hit.
    var scanTarget = "receipt"
    var matFolders: [MatFolder] = []
    /// Valgt mappe i Mat (nil = alle).
    var matFolder: String?
    var recipeJobs: [RecipeJob] = []
    var recipePreview: RecipePreview?
    var recipeBusy = false
    /// Åpen rett i Mat (id).
    var dishSel: String?
    var matImport = false
    /// Fil fra en rett som skal åpnes i delingsarket.
    var sharedFile: URL?

    /* ---------- Valg (UserDefaults) ---------- */

    /// Fargeflekker bak glasset.
    var colorBg = UserDefaults.standard.object(forKey: "fh_ios_bg") as? Bool ?? true { didSet { UserDefaults.standard.set(colorBg, forKey: "fh_ios_bg") } }
    var lockEnabled = UserDefaults.standard.bool(forKey: "fh_lock") { didSet { UserDefaults.standard.set(lockEnabled, forKey: "fh_lock") } }
    var lockAfter = UserDefaults.standard.integer(forKey: "fh_lock_after") { didSet { UserDefaults.standard.set(lockAfter, forKey: "fh_lock_after") } }
    var hideSwitcher = UserDefaults.standard.bool(forKey: "fh_hide_switcher") { didSet { UserDefaults.standard.set(hideSwitcher, forKey: "fh_hide_switcher") } }
    var hideAmounts = UserDefaults.standard.bool(forKey: "fh_hide_amounts") { didSet { UserDefaults.standard.set(hideAmounts, forKey: "fh_hide_amounts"); Privacy.shared.hidden = hideAmounts } }
    /// homelab | home | list | budget. Lagres også i oppsettet på serveren (layout.mobile.start).
    var startPage = UserDefaults.standard.string(forKey: "fh_start") ?? "homelab" {
        didSet {
            UserDefaults.standard.set(startPage, forKey: "fh_start")
            var l = layout; l.start = Store.startKey(startPage)
            if l != layout { saveLayout(l) }
        }
    }
    /// ios | material (per enhet)
    var designStyle = UserDefaults.standard.string(forKey: "fh_design") ?? "ios" {
        didSet { UserDefaults.standard.set(designStyle, forKey: "fh_design"); DesignStyle.material = designStyle == "material" }
    }
    /// ai | plain
    var searchMode = UserDefaults.standard.string(forKey: "fh_search_mode") ?? "ai" { didSet { UserDefaults.standard.set(searchMode, forKey: "fh_search_mode") } }
    /// «camera»: trykk åpner kameraet, hold inne viser valg. «choices»: omvendt.
    var scanTap = UserDefaults.standard.string(forKey: "fh_scan_tap") ?? "camera" { didSet { UserDefaults.standard.set(scanTap, forKey: "fh_scan_tap") } }
    var autoCrop = UserDefaults.standard.object(forKey: "fh_auto_crop") as? Bool ?? true { didSet { UserDefaults.standard.set(autoCrop, forKey: "fh_auto_crop") } }
    var keepOriginal = UserDefaults.standard.object(forKey: "fh_keep_original") as? Bool ?? true { didSet { UserDefaults.standard.set(keepOriginal, forKey: "fh_keep_original") } }
    var wifiOnly = UserDefaults.standard.bool(forKey: "fh_wifi_only") { didSet { UserDefaults.standard.set(wifiOnly, forKey: "fh_wifi_only") } }
    var useLocal = UserDefaults.standard.object(forKey: "fh_use_local") as? Bool ?? true { didSet { UserDefaults.standard.set(useLocal, forKey: "fh_use_local") } }
    var nSub = UserDefaults.standard.object(forKey: "fh_n_sub") as? Bool ?? true { didSet { UserDefaults.standard.set(nSub, forKey: "fh_n_sub") } }
    var nDomain = UserDefaults.standard.object(forKey: "fh_n_domain") as? Bool ?? true { didSet { UserDefaults.standard.set(nDomain, forKey: "fh_n_domain") } }
    var nWeekly = UserDefaults.standard.bool(forKey: "fh_n_weekly") { didSet { UserDefaults.standard.set(nWeekly, forKey: "fh_n_weekly") } }

    /* ---------- Lås ---------- */

    var locked = false
    @ObservationIgnored private var backgroundAt: Date?

    @ObservationIgnored private var logos: [String: UIImage] = [:]
    @ObservationIgnored private var polling = false
    @ObservationIgnored private let monitor = NWPathMonitor()
    private(set) var onWifi = true
    /// «Venter på opplasting»: kvitteringer som ikke kom fram. Lagres på disk (UploadQueue18.swift) og lastes opp når nettet er tilbake.
    var pendingUploads: [PendingUpload] = PendingQueue.load()
    @ObservationIgnored var pendingBusy = false

    var api: API { API(base: base.isEmpty ? (account?.server ?? "") : base, token: account?.token) }

    init() {
        base = account?.server ?? ""
        applyStart()
        locked = loggedIn && lockEnabled
        Privacy.shared.hidden = hideAmounts
        layout = localLayout()
        monitor.pathUpdateHandler = { [weak self] path in
            let wifi = path.usesInterfaceType(.wifi) || path.usesInterfaceType(.wiredEthernet)
            let up = path.status == .satisfied
            Task { @MainActor in
                self?.onWifi = wifi
                // Nettet er tilbake: last opp det som venter.
                if up { await self?.flushPending() }
            }
        }
        monitor.start(queue: DispatchQueue(label: "finanshub.net"))
    }

    /// Startsiden: Homelab (standard) eller en av Finans-fanene.
    private func applyStart() {
        switch startPage {
        case "list": module = nil; tab = .list
        case "budget": module = nil; tab = .budget
        case "home": module = nil; tab = .home
        default: module = .homelab; tab = .home
        }
    }

    nonisolated private static func loadAccounts() -> [LoginAccount] {
        if let raw = Keychain.get("accounts"), let d = raw.data(using: .utf8), let list = try? JSONDecoder().decode([LoginAccount].self, from: d) { return list }
        // Eldre versjon: én server og ett token.
        guard let server = Keychain.get("server"), let token = Keychain.get("token") else { return [] }
        let a = LoginAccount(id: UUID().uuidString, server: server, username: "", name: "", role: "admin", token: token, local: "", external: "")
        if let d = try? JSONEncoder().encode([a]) { Keychain.set("accounts", String(data: d, encoding: .utf8)); Keychain.set("active", a.id) }
        Keychain.set("token", nil)
        return [a]
    }

    private func saveAccounts() {
        if let d = try? JSONEncoder().encode(accounts) { Keychain.set("accounts", String(data: d, encoding: .utf8)) }
        Keychain.set("active", activeId)
    }

    func run(_ work: @escaping () async throws -> Void) {
        Task {
            do { try await work() } catch let e as APIError where e.status == 401 && loggedIn && !e.needsTotp {
                expired()
            } catch { message = error.localizedDescription; Haptics.shared.error() }
        }
    }

    func flash(_ text: String) {
        let bad = ["Kunne ikke", "Fikk ikke", "Feil", "Skriv inn", "Ugyldig"].contains { text.hasPrefix($0) }
        if bad { Haptics.shared.error() } else { Haptics.shared.success() }
        message = text
        Task { try? await Task.sleep(for: .seconds(2)); if message == text { message = nil } }
    }

    /* ---------- Lås ---------- */

    func didEnterBackground() { backgroundAt = Date() }
    /// Bare etter at appen har vært i bakgrunnen (Face ID-dialogen gjør den bare inaktiv, så avbryt gir ingen løkke).
    func didBecomeActive() {
        takePendingScan()
        guard let at = backgroundAt else { return }
        backgroundAt = nil
        if hideAmounts { Privacy.shared.hidden = true }
        if loggedIn, lockEnabled, Date().timeIntervalSince(at) >= Double(lockAfter * 60) { locked = true; unlock() }
    }

    /// Face ID / Touch ID med kode som reserve.
    func unlock() {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else { locked = false; return }
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Lås opp FinansHub") { ok, _ in
            Task { @MainActor in if ok { self.locked = false } }
        }
    }

    /* ---------- Innlogging og kontoer ---------- */

    func login(server raw: String, username: String, password: String, code: String? = nil, trust: Bool = false) {
        run {
            self.busy = true
            defer { self.busy = false }
            let srv = API.normalize(raw)
            guard !srv.isEmpty else { self.message = "Skriv inn serveradressen"; return }
            let r: LoginResult
            do {
                r = try await API.login(base: srv, username: username, password: password, code: code, device: UIDevice.current.name, trust: trust)
            } catch let e as APIError where e.needsTotp {
                if self.pending != nil, let code, !code.isEmpty { self.message = e.message }
                self.pending = PendingLogin(server: srv, username: username, password: password)
                return
            }
            self.pending = nil
            // Første innlogging på en ny installasjon: onboarding i tre steg (design, bakgrunn, tilgang).
            let firstEver = Store.freshInstall
            UserDefaults.standard.set(true, forKey: "fh_installed_before")
            if firstEver && !UserDefaults.standard.bool(forKey: "fh_onboarded") { self.onboarding = 0 }
            Keychain.set("server", srv)
            let same = self.accounts.first { $0.server == srv && $0.username.lowercased() == r.username.lowercased() }
            let acc = LoginAccount(id: same?.id ?? UUID().uuidString, server: srv, username: r.username, name: r.name, role: r.role, token: r.token, local: same?.local ?? "", external: same?.external ?? "")
            self.accounts = self.accounts.filter { $0.id != acc.id } + [acc]
            self.addingAccount = false
            self.switchTo(acc.id)
            self.flash("Logget inn som \(r.name)")
        }
    }

    func cancelTotp() { pending = nil }

    func switchTo(_ id: String) {
        activeId = id
        saveAccounts()
        clearData()
        base = account?.server ?? ""
        menuOpen = false
        backTo = nil
        applyStart()
        layout = localLayout()
        refresh()
    }

    func logout(_ id: String? = nil) {
        guard let a = accounts.first(where: { $0.id == (id ?? activeId) }) else { return }
        run {
            _ = try? await API(base: a.server, token: a.token).call("POST", "/auth/logout")
            self.remove(a.id)
        }
    }

    func logoutOthers() {
        let others = accounts.filter { $0.id != activeId }
        run {
            for a in others { _ = try? await API(base: a.server, token: a.token).call("POST", "/auth/logout") }
            self.accounts = self.accounts.filter { $0.id == self.activeId }
            self.saveAccounts()
            self.flash("Andre kontoer er logget ut")
        }
    }

    private func remove(_ id: String) {
        accounts.removeAll { $0.id == id }
        defer { syncWidgets() }
        if activeId == id {
            activeId = accounts.first?.id
            clearData()
            base = account?.server ?? ""
            layout = localLayout()
            if loggedIn { refresh() }
        }
        saveAccounts()
    }

    private func expired() {
        let name = account?.label ?? ""
        if let a = account { remove(a.id) }
        message = "Innloggingen for \(name) er utløpt. Logg inn igjen."
    }

    private func clearData() {
        boot = nil; summary = nil; me = nil; txs = nil; receipts = nil; jobs = []; selectedTx = nil; selectedReceipt = nil
        week = nil; subs = nil; folders = nil; folder = nil; finn = nil; finnSel = nil; finnDetail = nil; boligCats = []; uploadFolder = nil; tokens = nil; domains = nil; analytics = nil; domain = nil
        mobileHome = nil; homeError = nil; history = []; suggestions = []; todayMeal = nil; domainToday = nil; avatar = nil
        ai = nil; aiHistory = []; aiNote = nil; suggestGroups = []; editing = nil; original = nil; detail = nil; detailTx = nil; matDay = nil
        recurring = nil; stocks = nil; report = nil; importResult = nil; importFiles = []; importText = ""
        editHome = false
        logos = [:]
    }

    func updateAddresses(local: String, external: String) {
        guard var a = account else { return }
        a.local = local.trimmingCharacters(in: .whitespaces).isEmpty ? "" : API.normalize(local)
        a.external = external.trimmingCharacters(in: .whitespaces).isEmpty ? "" : API.normalize(external)
        accounts = accounts.map { $0.id == a.id ? a : $0 }
        saveAccounts()
        refresh()
    }

    /// Lokal adresse når den svarer (og «Bruk lokal adresse hjemme» er på), ellers ekstern.
    private func resolveBase() async {
        guard let a = account else { return }
        if useLocal, !a.local.isEmpty, await API(base: a.local, token: a.token).reachable() { base = a.local; route = "Lokal"; return }
        base = a.external.isEmpty ? a.server : a.external
        let host = URL(string: base)?.host ?? ""
        route = API.isLocal(host) ? "Lokal" : "Ekstern"
    }

    func testConnection(_ raw: String) {
        run {
            let u = API.normalize(raw.isEmpty ? self.base : raw)
            let t0 = Date()
            let ok = await API(base: u, token: self.account?.token).reachable(timeout: 5)
            let ms = Int(Date().timeIntervalSince(t0) * 1000)
            self.flash(ok ? "Svar fra \(u.replacingOccurrences(of: "http://", with: "").replacingOccurrences(of: "https://", with: "")) på \(ms) ms" : "Fikk ikke kontakt med \(u)")
        }
    }

    /* ---------- Data ---------- */

    func reload() async throws {
        await resolveBase()
        syncWidgets()
        boot = try await api.get("/bootstrap")
        summary = try? await api.get("/summary", as: Summary.self)
        await loadMe()
        lastSync = Date()
        if !pendingUploads.isEmpty { Task { await self.flushPending() } }
        if let m = module { try await load(m) } else { try await loadTab(tab) }
        if module != .homelab { Task { await self.loadHome() } }
    }

    func refresh() { run { try await self.reload() } }

    private func loadMe() async {
        var m = try? await api.get("/me", as: Me.self)
        // Profilbilde og servernavn kommer fra Homelab hvis FinansHub ikke sender dem.
        if m?.avatarUrl == nil, let hl = try? await api.module("/api", "/me", as: Me.self) {
            if var cur = m {
                cur.avatarUrl = hl.avatarUrl
                if cur.serverName == nil { cur.serverName = hl.serverName }
                if cur.displayName == nil { cur.displayName = hl.displayName }
                m = cur
            } else { m = hl }
        }
        me = m
        if let m, let a = account, let u = m.username, !u.isEmpty, a.username != u || a.name != (m.label ?? a.name) {
            var n = a; n.username = u; n.name = m.label ?? a.name; n.role = m.role ?? a.role
            accounts = accounts.map { $0.id == n.id ? n : $0 }
            saveAccounts()
        }
        await loadAvatar(m?.avatarUrl ?? mobileHome?.avatarUrl)
    }

    private func loadAvatar(_ url: String?) async {
        guard let url, !url.isEmpty else { avatar = nil; return }
        avatar = await image(url)
    }

    private func load(_ m: Module) async throws {
        moduleError = nil
        do {
            switch m {
            case .homelab: await loadHome()
            case .upload: try await loadReceipts(); await loadJobs()
            case .fast: let list: [Recurring] = try await decodeList(api.call("GET", "/recurring")); recurring = list
            case .accounts: boot = try await api.get("/bootstrap")
            case .stocks:
                let d = try await api.call("GET", "/stocks")
                stocks = try? JSONDecoder().decode(Stocks.self, from: d)
                stocksX = StocksX.parse(d)
            case .reports: try await loadReport()
            case .imports: break
            case .mat: try await loadWeek(); await loadMatExtras()
            case .sub: try await loadSubs()
            case .folders: let list: [Folder] = try await decodeList(api.call("GET", "/folders")); folders = list
            case .domains: try await loadDomains()
            case .settings: break
            case .tracking: try await loadTracking()
            }
        } catch let e as APIError where e.status == 401 || e.status == 403 || e.status == 404 {
            moduleError = e.status == 404 ? "\(m.rawValue) finnes ikke på serveren ennå. Oppdater homelab." : "\(m.rawValue) er ikke tilgjengelig for denne kontoen (\(e.message))."
        } catch is DecodingError {
            moduleError = "Uventet svar fra serveren for \(m.rawValue)."
        }
    }

    private func loadTab(_ t: Tab) async throws {
        switch t {
        case .home: summary = try await api.get("/summary")
        case .list, .budget: if txs == nil || t == .list { try await loadTx() }
        case .finn: try await loadFinn()
        case .search: await loadAiHistory(); if suggestGroups.isEmpty { await loadSuggestGroups() }
        case .more: await loadMore()
        }
    }

    /// Lister kan komme som [..] eller {items: [..]}.
    func decodeList<T: Decodable>(_ d: Data) throws -> [T] {
        if let list = try? JSONDecoder().decode([T].self, from: d) { return list }
        return try JSONDecoder().decode(ItemsWrap<T>.self, from: d).items
    }

    /// Fanebytte i Finans (fanelinja, menyen). Ingen egen tilbakevei.
    func go(_ t: Tab) {
        if t != tab || module != nil { selectedTx = nil }
        if t == .finn || t != tab { finnSel = nil; finnDetail = nil }
        backTo = nil
        tab = t
        module = nil
        menuOpen = false
        editHome = false
        detail = nil
        barMini = false
        run { try await self.loadTab(t) }
    }

    /// Hel side (Homelab, modul, innstillinger). nil = Finans-fanene.
    func open(_ m: Module?) {
        backTo = nil
        menuOpen = false
        if m != module { selectedTx = nil; detail = nil; editing = nil; original = nil }
        module = m
        barMini = false
        if m != .homelab { editHome = false }
        if m != .folders { folder = nil }
        if m != .tracking { trkSel = nil }
        if m != .stocks { stockScreen = "ov"; stockSel = nil }
        if m != nil { finnSel = nil; finnDetail = nil }
        guard let m else { return }
        if m == .settings { settingsPage = nil }
        run { try await self.load(m) }
    }

    /// Underside (f.eks. fra Mer): tilbakeknappen fører hit igjen.
    func openSub(_ m: Module) {
        let from = place
        open(m)
        backTo = from
    }

    /// Dra ned for å oppdatere på en hel side.
    func reloadModule() async { if let m = module { try? await load(m) } }

    var place: Place { module.map { .module($0) } ?? .tab(tab) }

    /// Tilbake: lukker det som er åpent, ellers til forrige side (undersider av Mer → Mer, resten → Homelab).
    func back() {
        if original != nil { original = nil; return }
        if editing != nil { editing = nil; return }
        if detail != nil { detail = nil; detailTx = nil; return }
        if editHome { editHome = false; return }
        if module == .settings, settingsPage != nil { settingsPage = nil; return }
        if module == .folders, folder != nil { folder = nil; return }
        if module == .tracking, trkSel != nil { trkSel = nil; return }
        if module == .stocks, stockScreen != "ov" { stockScreen = stockScreen == "det" && stockFrom == "tx" ? "tx" : "ov"; stockFrom = nil; return }
        if finnSel != nil { finnSel = nil; finnDetail = nil; return }
        if module == .upload, selectedReceipt != nil { selectedReceipt = nil; return }
        if selectedTx != nil { selectedTx = nil; return }
        // Budsjett og Finn uten egen fane ligger under Mer.
        let underMore = module?.isFinance == true || (module == nil && !finTabs.contains(tab))
        guard let target = backTo ?? (underMore ? .tab(.more) : nil) else { goStart(); return }
        switch target {
        case .tab(let t): go(t)
        case .module(let m): open(m)
        }
    }

    /* ---------- Startside, toppraden og fanelinjene ---------- */

    static func startKey(_ p: String) -> String { ["home": "fin-hjem", "list": "fin-liste", "budget": "fin-budsjett"][p] ?? "homelab" }
    static func startPage(fromKey k: String) -> String { ["fin-hjem": "home", "fin-liste": "list", "fin-budsjett": "budget"][k] ?? "homelab" }

    /// Finans som startside: appen åpner der, og Homelab ligger bak profilbildet.
    var financeStart: Bool { startPage != "homelab" }
    var startTab: Tab { startPage == "list" ? .list : startPage == "budget" ? .budget : .home }
    var startLabel: String { financeStart ? "Finans" : "Homelab" }
    func goStart() { if financeStart { go(startTab) } else { open(.homelab) } }

    /// «‹ Homelab» / «‹ Finans» øverst (med profilbildet til høyre på samme rad). nil = ingen topprad.
    var topRowTitle: String? {
        guard compact, mobileDesign != "papir", editing == nil, detail == nil, original == nil, !editHome else { return nil }
        if let m = module {
            switch m {
            case .domains, .mat: return startLabel
            case .homelab, .tracking: return financeStart ? "Finans" : nil
            default: return nil
            }
        }
        // Finn åpnet fra Mer (uten egen fane) har egen tilbakeknapp.
        if tab == .finn && (finnSel != nil || !finTabs.contains(.finn)) { return nil }
        return financeStart || selectedTx != nil ? nil : "Homelab"
    }
    /// Sveip fra venstre kant går tilbake overalt der det finnes en tilbakepil (ikke på startsiden).
    var canSwipeBack: Bool {
        if original != nil || editing != nil || detail != nil || editHome { return true }
        if let m = module { return m != .homelab || financeStart }
        if selectedTx != nil || finnSel != nil || !finTabs.contains(tab) { return true }
        return !financeStart
    }

    /// «Knapp i linjen»: Homelab-/Finans-knappen ligger i fanelinja i stedet for pilen øverst.
    var homeInBar: Bool { false }

    /// Finans-fanene i systemets fanelinje på iPhone: høyst fire, fordi Skann ligger i søkeplassen til høyre.
    /// Søk faller ut først (det finnes også under Mer), og Oversikt og Mer blir alltid med.
    var barFinTabs: [Tab] {
        var t = finTabs
        let max = homeInBar && !financeStart ? 3 : 4
        if t.count > max, let i = t.firstIndex(of: .search) { t.remove(at: i) }
        while t.count > max, let i = t.lastIndex(where: { $0 != .more && $0 != .home }) { t.remove(at: i) }
        return t
    }
    /// Fanen som er markert: sider under Mer, og faner som ikke får plass, markerer Mer.
    func barTab(_ tabs: [Tab]) -> Tab { module?.isFinance == true || !tabs.contains(tab) ? .more : tab }

    func tabName(_ t: Tab) -> String { layout.names["fin." + t.key] ?? t.rawValue }
    func hlName(_ h: HlTab) -> String { layout.names["hl." + h.rawValue] ?? h.label }
    /// Nytt navn på en fane (tomt = standardnavnet). key: «hl.dom», «fin.bud» …
    func rename(_ key: String, _ name: String) {
        var l = layout
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if n.isEmpty { l.names[key] = nil } else { l.names[key] = String(n.prefix(30)) }
        saveLayout(l)
    }
    func setBackStyle(_ b: String) { var l = layout; l.backStyle = b; saveLayout(l) }
    func setMatTheme(_ t: String) { var l = layout; l.matTheme = t; saveLayout(l) }

    /// Homelab-fane: Homelab, Finans (Oversikt), Domener eller Matplan.
    func goHl(_ h: HlTab) {
        switch h {
        case .hl: open(.homelab)
        case .home: go(Tab.home)
        case .dom: open(.domains)
        case .mat: open(.mat)
        case .trk: open(.tracking)
        }
    }

    func loadTx() async throws {
        var q: [String] = []
        if !query.isEmpty, let e = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { q.append("q=\(e)") }
        if !filter.isEmpty { q.append("type=\(filter)") }
        txs = (try await api.get("/transactions?" + q.joined(separator: "&"), as: TxPage.self)).items
    }
    func search() { run { try await self.loadTx() } }

    func loadReceipts() async throws {
        let list: [Receipt] = try await api.get("/receipts?status=queue")
        receipts = list
        if selectedReceipt == nil || !list.contains(where: { $0.id == selectedReceipt }) {
            if UIDevice.current.userInterfaceIdiom == .pad { selectedReceipt = list.first(where: { $0.status == "needs_review" })?.id }
            else if selectedReceipt != nil { selectedReceipt = nil }
        }
        // Følg med mens AI-en leser.
        if list.contains(where: { $0.status == "pending" || $0.status == "processing" }) {
            Task { try? await Task.sleep(for: .seconds(2)); try? await self.loadReceipts() }
        }
    }

    func update(_ id: String, _ field: String, _ value: Any?) {
        run {
            let d = try await self.api.call("PATCH", "/receipts/\(id)", json: [field: value ?? NSNull()])
            let r = try JSONDecoder().decode(Receipt.self, from: d)
            self.receipts = self.receipts?.map { $0.id == id ? r : $0 }
        }
    }

    func book(_ id: String) { receiptAction(id, "book", "Bokført ✓") }
    func reject(_ id: String) { receiptAction(id, "reject", "Kvittering avvist") }
    private func receiptAction(_ id: String, _ action: String, _ done: String) {
        run {
            try await self.api.call("POST", "/receipts/\(id)/\(action)")
            self.selectedReceipt = self.receipts?.first(where: { $0.id != id && $0.status == "needs_review" })?.id
            try await self.loadReceipts()
            self.boot = try await self.api.get("/bootstrap")
            self.summary = try await self.api.get("/summary")
            self.flash(done)
        }
    }

    func setCategory(tx: Int, category: Int) {
        run {
            try await self.api.call("PATCH", "/transactions/\(tx)", json: ["categoryId": category])
            try await self.loadTx()
            self.summary = try await self.api.get("/summary")
            self.flash("Kategori endret")
        }
    }

    func save(_ key: String, _ value: Any) {
        run {
            try await self.api.call("PUT", "/settings", json: [key: value])
            self.boot = try await self.api.get("/bootstrap")
        }
    }

    /* ---------- Homelab: forside, søk og oppsett ---------- */

    func loadHome() async {
        homeError = nil
        // Feil her logger aldri ut: finans-tokenet kan være gyldig selv om en eldre server ikke kjenner forsiden.
        do {
            let d = try await api.callAt("/api", "GET", "/mobile/home")
            mobileHome = try JSONDecoder().decode(MobileHome.self, from: d)
            let raw = JS.obj(d)
            homeWeather = JS.dict(raw, "weather").map(WeatherX.init)
            if raw["packages"] != nil { homePackages = JS.list(raw, "packages").map(Shipment.init) }
            applyPaperHome(raw)
            if UserDefaults.standard.string(forKey: layoutKey) == nil, let l = HomeLayout.from(json: ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any])?["layout"]) { layout = l }
        } catch let e as APIError {
            homeError = e.status == 404 ? "Homelab-forsiden finnes ikke på serveren ennå. Oppdater homelab." : (e.status == 401 || e.status == 403) ? "Homelab godtar ikke app-tokenet ennå. Oppdater homelab-serveren." : e.message
        } catch { homeError = "Uventet svar fra Homelab." }
        if summary == nil { summary = try? await api.get("/summary", as: Summary.self) }
        if let d = try? await api.callAt("/api", "GET", "/me/layout") { applyPaperLayout(JS.obj(d)) }
        if UserDefaults.standard.string(forKey: layoutKey) == nil, let d = try? await api.callAt("/api", "GET", "/me/layout"), let l = HomeLayout.from(json: try? JSONSerialization.jsonObject(with: d)) {
            layout = l
            if let st = l.start, Store.startPage(fromKey: st) != startPage { startPage = Store.startPage(fromKey: st) }
        }
        if let d = try? await api.callAt("/api", "GET", "/search/history") { history = parseStrings(d) }
        if let w = try? await api.mat("/week", as: Week.self) { todayMeal = w.days.first { $0.date == isoDay(Date()) }?.name }
        if let d = try? await api.raw("/domains/api", "/domains"), let list: [DomainRef] = try? decodeList(d), let first = list.first {
            let enc = first.name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? first.name
            if let a = try? await api.module("/domains/api", "/\(enc)/analytics?range=today", as: Analytics.self) { domainToday = DomainToday(name: first.name, visitors: a.visitors ?? 0) }
        }
        if avatar == nil { await loadAvatar(me?.avatarUrl ?? mobileHome?.avatarUrl) }
        await pollTracking()
    }

    private var layoutKey: String { "fh_layout_" + (account?.id ?? "") }

    private func localLayout() -> HomeLayout {
        guard let raw = UserDefaults.standard.string(forKey: layoutKey), let d = raw.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: d) else { return .standard }
        return HomeLayout.from(json: obj) ?? .standard
    }

    /// Lagres lokalt (per bruker og enhet) og på serveren.
    func saveLayout(_ l: HomeLayout) {
        layout = l
        if let d = try? JSONSerialization.data(withJSONObject: l.json) { UserDefaults.standard.set(String(data: d, encoding: .utf8), forKey: layoutKey) }
        let body: [String: Any] = ["mobile": l.json]
        Task { _ = try? await self.api.callAt("/api", "PUT", "/me/layout", json: body) }
    }

    func setHidden(_ id: String, _ hidden: Bool) { var l = layout; l.hide[id] = hidden; saveLayout(l) }

    /// Flytter en widget eller fane ett hakk opp (-1) eller ned (+1). list: sec | hlTabs | finTabs.
    func move(_ list: String, _ id: String, _ dir: Int) {
        var l = layout
        func mv(_ a: inout [String]) {
            guard let i = a.firstIndex(of: id) else { return }
            let j = i + dir
            guard j >= 0, j < a.count else { return }
            a.swapAt(i, j)
        }
        switch list {
        case "sec": mv(&l.sec)
        case "hlTabs": mv(&l.hlTabs)
        default: mv(&l.finTabs)
        }
        saveLayout(l)
    }

    func resetLayout() { saveLayout(.standard) }

    /// Synlige faner (faste kan ikke skjules).
    var finTabs: [Tab] { layout.finTabs.filter { HomeLayout.fixedFin.contains($0) || layout.visible($0) }.compactMap(Tab.from(key:)) }
    var hlTabs: [HlTab] { layout.hlTabs.filter { HomeLayout.fixedHl.contains($0) || layout.visible($0) }.compactMap { HlTab(rawValue: $0) } }

    /// Google-forslag mens man skriver (150 ms debounce, via serveren).
    func suggest(_ q: String) {
        suggestTask?.cancel()
        let t = q.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { suggestions = []; return }
        suggestTask = Task {
            try? await Task.sleep(for: .milliseconds(150))
            if Task.isCancelled { return }
            let enc = t.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? t
            if let d = try? await api.callAt("/api", "GET", "/search/suggest?q=\(enc)", timeout: 3), !Task.isCancelled { suggestions = Array(parseStrings(d).prefix(8)) }
        }
    }

    /// Adressen som skal åpnes: adresser (f.eks. vg.no) åpnes direkte, resten søkes på Google. Lagres i historikken.
    func googleURL(_ q: String) -> URL? {
        let t = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return nil }
        history = [t] + history.filter { $0 != t }
        suggestions = []
        Task { _ = try? await self.api.callAt("/api", "POST", "/search/history", json: ["q": t]) }
        if t.hasPrefix("http://") || t.hasPrefix("https://") { return URL(string: t) }
        if !t.contains(" "), t.range(of: #"^[\w-]+(\.[\w-]+)+(:\d+)?(/\S*)?$"#, options: .regularExpression) != nil { return URL(string: "https://" + t) }
        let enc = t.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? t
        return URL(string: "https://www.google.com/search?q=" + enc)
    }

    func removeHistory(_ q: String) {
        history.removeAll { $0 == q }
        let enc = q.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? q
        Task { _ = try? await self.api.callAt("/api", "DELETE", "/search/history/\(enc)") }
    }

    func clearHistory() {
        history = []
        Task { _ = try? await self.api.callAt("/api", "DELETE", "/search/history") }
        flash("Søkehistorikken er tømt")
    }

    /* ---------- Profilbilde ---------- */

    /// Beskjæres til kvadrat, skaleres til 256 × 256 og lagres som JPEG (kvalitet 0,85).
    func uploadAvatar(_ img: UIImage) {
        run {
            self.busy = true
            defer { self.busy = false }
            guard let jpeg = img.squared(256).jpegData(compressionQuality: 0.85) else { return }
            _ = try await self.api.upload("/me/avatar", parts: [API.Part(name: "file", filename: "avatar.jpg", mime: "image/jpeg", data: jpeg)], prefix: "/api")
            self.avatar = UIImage(data: jpeg)
            await self.loadMe()
            self.flash("Profilbildet er oppdatert")
        }
    }

    func removeAvatar() {
        run {
            try await self.api.callAt("/api", "DELETE", "/me/avatar")
            self.avatar = nil
            await self.loadMe()
            self.flash("Profilbildet er fjernet")
        }
    }

    /* ---------- ✦ AI-søk ---------- */

    /// ✦ AI-søk, eller vanlig søk (GET /search) når det er valgt eller AI-motoren er av eller ikke svarer.
    /// force: «✦ Spør AI likevel» (serveren svarer ellers med vanlig søk for 1–2 ord som gir treff).
    func ask(_ q: String, force: Bool = false) {
        let t = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        aiQuery = t
        aiBusy = true
        aiNote = nil
        run {
            defer { self.aiBusy = false }
            if self.searchMode == "plain" && !force {
                try await self.plainSearch(t)
            } else {
                do {
                    // ✦ AI er på: kjør AI-søket med en gang (force), også for korte søk.
                    let body: [String: Any] = ["q": t, "force": true]
                    let d = try await self.api.callAt("/finans/api", "POST", "/search/ai", json: body, timeout: 25)
                    let raw = JS.obj(d)
                    let r = try JSONDecoder().decode(AiAnswer.self, from: d)
                    if let kind = JS.str(raw, "aiErrorKind"), !kind.isEmpty {
                        // Tydelig årsak: nøkkel mangler, ingen tilgang, tidsavbrudd, modellfeil, kvote eller nett.
                        self.aiNote = "✦ AI: " + (JS.str(raw, "aiErrorText") ?? "AI-motoren feilet (\(kind)).")
                        if (r.hits ?? []).isEmpty { try await self.plainSearch(t) } else { self.ai = r }
                    } else if r.aiUnavailable == true {
                        self.aiNote = (JS.str(raw, "aiErrorText") ?? "AI-motoren er av eller nede.") + " Viser vanlig søk."
                        try await self.plainSearch(t)
                    } else { self.ai = r }
                } catch let e as APIError where e.status == 401 && !e.needsTotp {
                    throw e
                } catch let e as APIError {
                    self.aiNote = "✦ AI svarte ikke: \(e.message). Viser vanlig søk."
                    try await self.plainSearch(t)
                } catch {
                    self.aiNote = "✦ AI svarte ikke: \(error.localizedDescription). Viser vanlig søk."
                    try await self.plainSearch(t)
                }
            }
            self.aiHistory = Array(([t] + self.aiHistory.filter { $0 != t }).prefix(20))
            await self.loadAiHistory()
        }
    }

    /// Vanlig søk i butikknavn, kategorier, notater og varelinjene i kvitteringene.
    func plainSearch(_ q: String) async throws {
        let enc = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
        do {
            ai = try JSONDecoder().decode(AiAnswer.self, from: try await api.call("GET", "/search?q=\(enc)"))
        } catch let e as APIError where e.status == 404 {
            // Eldre server uten vanlig søk: søk i transaksjonslisten.
            let page = try await api.get("/transactions?limit=30&q=\(enc)", as: TxPage.self)
            ai = AiAnswer(q: q, answer: page.items.isEmpty ? "Fant ingen treff." : "\(page.items.count) treff i transaksjonene.",
                          hits: page.items.map { AiHit(type: "tx", txId: $0.id, description: $0.description, date: $0.date, amount: $0.amount, source: nil, reason: "Butikk · \($0.description)") },
                          mode: "plain")
        }
    }

    func loadSuggestGroups() async {
        if let d = try? await api.call("GET", "/search/suggestions"), let g = try? JSONDecoder().decode(SuggestGroups.self, from: d) { suggestGroups = g.groups.filter { !$0.items.isEmpty } }
    }

    private func loadAiHistory() async {
        if let d = try? await api.call("GET", "/search/history") { let list = parseStrings(d); if !list.isEmpty || aiHistory.isEmpty { aiHistory = Array(list.prefix(20)) } }
    }

    func clearAiHistory() { aiHistory = []; Task { _ = try? await self.api.call("DELETE", "/search/history") } }

    /// Alle transaksjoner som er lastet (liste, siste, detaljlister).
    var txPool: [Tx] { (txs ?? []) + (summary?.recent ?? []) + (detailTx ?? []) }

    /// Åpner transaksjonen fra et treff (søk, Mer-detaljer). hint = beskrivelsen, brukes til å finne den.
    func showTx(_ id: Int, hint: String? = nil) {
        detail = nil
        run {
            if !self.txPool.contains(where: { $0.id == id }), let hint, let e = hint.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
               let page = try? await self.api.get("/transactions?limit=50&q=\(e)", as: TxPage.self), let t = page.items.first(where: { $0.id == id }) {
                self.txs = (self.txs ?? []).filter { $0.id != id } + [t]
            }
            self.selectedTx = id
        }
    }

    /* ---------- Transaksjoner: legg til, rediger, slett ---------- */

    func newTx() {
        if folders == nil { run { let list: [Folder] = try await self.decodeList(self.api.call("GET", "/folders")); self.folders = list } }
        editing = TxDraft(id: nil, income: false, description: "", amount: "", date: Date(), categoryId: nil, accountId: boot?.accounts.first?.id, folderId: nil, note: "", receipt: nil)
    }

    func editTx(_ t: Tx) {
        if folders == nil { run { let list: [Folder] = try await self.decodeList(self.api.call("GET", "/folders")); self.folders = list } }
        let amount = String(format: "%.2f", abs(t.amount)).replacingOccurrences(of: ".", with: ",")
        editing = TxDraft(id: t.id, income: t.amount > 0, description: t.description, amount: amount, date: parseDay(t.date) ?? Date(), categoryId: t.categoryId,
                          accountId: t.accountId, folderId: t.folderId ?? folders?.first(where: { $0.name == t.folder })?.id, note: t.note, receipt: t.receipt)
    }

    func saveTx(_ d: TxDraft) {
        let a = Double(d.amount.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "\u{00a0}", with: "").replacingOccurrences(of: ",", with: "."))
        guard !d.description.trimmingCharacters(in: .whitespaces).isEmpty, let a, a != 0 else { flash("Skriv beskrivelse og beløp"); return }
        run {
            self.busy = true
            defer { self.busy = false }
            let body: [String: Any] = ["type": d.income ? "income" : "expense", "description": d.description.trimmingCharacters(in: .whitespaces), "amount": abs(a),
                                       "date": isoDay(d.date), "note": d.note, "categoryId": orNull(d.categoryId), "accountId": orNull(d.accountId), "folderId": orNull(d.folderId)]
            let res: Data
            if let id = d.id { res = try await self.api.call("PATCH", "/transactions/\(id)", json: body) } else { res = try await self.api.call("POST", "/transactions", json: body) }
            let id = ((try? JSONSerialization.jsonObject(with: res)) as? [String: Any]).flatMap { ($0["id"] as? Int) ?? (($0["tx"] as? [String: Any])?["id"] as? Int) } ?? d.id
            self.editing = nil
            try await self.loadTx()
            self.summary = try? await self.api.get("/summary", as: Summary.self)
            if let id { self.selectedTx = id }
            self.flash(d.id == nil ? "Transaksjon lagt til" : "Endringer lagret")
        }
    }

    func deleteTx(_ id: Int) {
        run {
            try await self.api.call("DELETE", "/transactions/\(id)")
            self.editing = nil
            self.selectedTx = nil
            self.txs = self.txs?.filter { $0.id != id }
            self.summary = try? await self.api.get("/summary", as: Summary.self)
            self.flash("Transaksjonen er slettet")
        }
    }

    /* ---------- Original kvittering og banktransaksjon ---------- */

    func openOriginal(_ txId: Int, _ tab: String) {
        originalTab = tab
        run { self.original = Original.parse(try await self.api.call("GET", "/transactions/\(txId)/original")) }
    }

    func bytes(_ path: String) async -> Data? { try? await api.bytes(path) }

    /// «Last ned»: lagres i appens mappe, som vises i Filer → På min iPhone → FinansHub.
    func saveToFiles(_ data: Data, name: String) {
        guard let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        do { try data.write(to: dir.appendingPathComponent(name)); flash("Lagret i Filer → FinansHub") } catch { message = error.localizedDescription }
    }

    /* ---------- Mer ---------- */

    private func loadMore() async {
        if let b = try? await api.get("/bootstrap", as: Boot.self) { boot = b }
        if let d = try? await api.call("GET", "/recurring"), let list: [Recurring] = try? decodeList(d) { recurring = list }
        if let s = try? await api.get("/subscriptions", as: SubList.self) { subs = s }
        if let d = try? await api.call("GET", "/folders"), let list: [Folder] = try? decodeList(d) { folders = list }
        if let f = try? await api.get("/finn", as: FinnList.self) { finn = f }
        if let s = try? await api.get("/stocks", as: Stocks.self) { stocks = s }
    }

    func openDetail(_ info: DetailInfo) {
        detail = info
        detailTx = nil
        guard let q = info.txQuery, let e = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return }
        run { self.detailTx = (try await self.api.get("/transactions?limit=30&q=\(e)", as: TxPage.self)).items }
    }

    func setRecurring(_ r: Recurring, active: Bool) {
        run {
            try await self.api.call("PATCH", "/recurring/\(r.id)", json: ["active": active])
            let list: [Recurring] = try await self.decodeList(self.api.call("GET", "/recurring"))
            self.recurring = list
        }
    }

    func syncStocks() {
        run {
            self.busy = true
            defer { self.busy = false }
            let d = try await self.api.call("POST", "/stocks/sync")
            self.stocks = try? JSONDecoder().decode(Stocks.self, from: d)
            self.stocksX = StocksX.parse(d)
            self.flash("Synket med Trading 212")
        }
    }

    private func loadReport() async throws { report = try await api.get("/reports?mode=" + (reportYear ? "year" : "month"), as: Report.self) }
    func pickReportYear(_ y: Bool) { reportYear = y; report = nil; run { try await self.loadReport() } }

    /// Kontoutskrift: filer (CSV, XLSX, tekst) og/eller innlimt tekst → forhåndsvisning → importer.
    func runImport(commit: Bool) {
        guard !importFiles.isEmpty || !importText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { flash("Velg filer eller lim inn tekst"); return }
        run {
            self.busy = true
            defer { self.busy = false }
            var parts = self.importFiles.map { API.Part(name: "files", filename: $0.name, mime: "application/octet-stream", data: $0.data) }
            if !self.importText.isEmpty { parts.append(.text("text", self.importText)) }
            let r = try JSONDecoder().decode(ImportResult.self, from: try await self.api.upload("/import" + (commit ? "?commit=1" : ""), parts: parts))
            self.importResult = r
            if commit {
                self.flash("\(r.imported ?? 0) poster importert")
                self.importFiles = []; self.importText = ""; self.importResult = nil; self.txs = nil
                self.summary = try? await self.api.get("/summary", as: Summary.self)
            }
        }
    }

    /* ---------- Opplasting ---------- */

    enum Upload { case image(UIImage), pdf(Data) }
    private var canUpload: Bool { !wifiOnly || onWifi }
    var canUploadNow: Bool { canUpload }
    /// Samme deler som en vanlig opplasting (original, JPEG til AI-en og miniatyr). Brukes av køen.
    func uploadParts(_ image: UIImage) -> [API.Part] { imageParts(image) }

    /// Flere filer legges i kø og lastes opp én og én; AI-en leser dem i bakgrunnen på serveren.
    func upload(_ files: [Upload]) {
        guard !files.isEmpty else { return }
        // Skann/opplasting inne i en bolig: kvitteringen havner i valgt bolig, og AI velger kategori og underkategori.
        if module == .folders || paperTab == "boliger", editing == nil, let bolig = uploadFolder ?? folder?.id { uploadToFolder(bolig, files); return }
        // Fra «Legg ved kvittering» i skjemaet: bli stående, kvitteringen kobles når den bokføres.
        if editing != nil { flash("Kvitteringen er lagt i opplastingskøen") } else if module != .upload { openSub(.upload) }
        guard canUpload else {
            for f in files { enqueuePending(f, folder: nil, error: "Venter på Wi-Fi") }
            flash("\(files.count) kvittering(er) venter på Wi-Fi")
            return
        }
        uploading += files.count
        Task {
            for f in files {
                do {
                    switch f {
                    case .image(let img): try await self.sendImage(img)
                    case .pdf(let d): try await self.finishUpload([API.Part(name: "file", filename: "kvittering.pdf", mime: "application/pdf", data: d)])
                    }
                } catch let e as APIError where e.status == 0 || e.status >= 500 {
                    // Uten nett, tapt forbindelse eller serverfeil: legg i «Venter på opplasting».
                    self.enqueuePending(f, folder: nil, error: e.message)
                    self.flash("Ingen forbindelse – kvitteringen venter på opplasting")
                } catch let e as URLError {
                    self.enqueuePending(f, folder: nil, error: e.localizedDescription)
                    self.flash("Ingen forbindelse – kvitteringen venter på opplasting")
                } catch { self.message = error.localizedDescription }
                self.uploading = max(0, self.uploading - 1)
            }
            try? await self.loadReceipts()
            await self.loadJobs()
        }
    }
    func upload(image: UIImage) { upload([.image(image)]) }
    func upload(pdf: Data) { upload([.pdf(pdf)]) }

    func loadJobs() async {
        if let j = try? await api.get("/receipts/jobs", as: [Job].self) { jobs = j }
        let active = jobs.contains { $0.status == "pending" || $0.status == "processing" }
        if (active || uploading > 0) && !polling {
            polling = true
            Task {
                try? await Task.sleep(for: .seconds(2))
                self.polling = false
                await self.loadJobs()
                if !self.jobs.contains(where: { $0.status == "pending" || $0.status == "processing" }) {
                    try? await self.loadReceipts()
                    self.summary = try? await self.api.get("/summary", as: Summary.self)
                }
            }
        }
    }

    func logo(_ domain: String?) async -> UIImage? {
        guard let domain, !domain.isEmpty else { return nil }
        if let l = logos[domain] { return l }
        let enc = domain.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? domain
        let img = await image("/finans/api/logo/\(enc)")
        if let img { logos[domain] = img }
        return img
    }

    /// Originalen lastes opp (med mindre «Lagre originalbildet» er av), sammen med en 1600 px JPEG til AI-en og et miniatyrbilde.
    private func sendImage(_ image: UIImage) async throws {
        let parts = imageParts(image)
        if !parts.isEmpty { try await finishUpload(parts) }
    }

    private func imageParts(_ image: UIImage) -> [API.Part] {
        let scan = image.scaled(max: 1600).jpegData(compressionQuality: 0.85)
        guard let file = keepOriginal ? image.jpegData(compressionQuality: 0.92) : (scan ?? image.jpegData(compressionQuality: 0.92)) else { return [] }
        var parts = [API.Part(name: "file", filename: "kvittering.jpg", mime: "image/jpeg", data: file)]
        if let scan { parts.append(.init(name: "scan", filename: "scan.jpg", mime: "image/jpeg", data: scan)) }
        if let t = image.scaled(max: 240).jpegData(compressionQuality: 0.75) { parts.append(.init(name: "thumb", filename: "thumb.jpg", mime: "image/jpeg", data: t)) }
        return parts
    }

    /// POST /folders/:id/receipts: samme felt som /receipts.
    func uploadToFolder(_ id: Int, _ files: [Upload]) {
        let name = folders?.first(where: { $0.id == id })?.name ?? folder?.name ?? "boligen"
        flash(files.count == 1 ? "Kvitteringen lastes opp til \(name)" : "\(files.count) kvitteringer lastes opp til \(name)")
        uploading += files.count
        Task {
            for f in files {
                let parts: [API.Part]
                switch f {
                case .image(let img): parts = self.imageParts(img)
                case .pdf(let d): parts = [API.Part(name: "file", filename: "kvittering.pdf", mime: "application/pdf", data: d)]
                }
                do { if !parts.isEmpty { _ = try await self.api.upload("/folders/\(id)/receipts", parts: parts) } }
                catch let e as APIError where e.status == 0 || e.status >= 500 { self.enqueuePending(f, folder: id, error: e.message) }
                catch let e as URLError { self.enqueuePending(f, folder: id, error: e.localizedDescription) }
                catch { self.message = error.localizedDescription }
                self.uploading = max(0, self.uploading - 1)
            }
            if let open = self.folder?.id, let f = try? await self.api.get("/folders/\(open)", as: Folder.self) { self.folder = f }
        }
    }

    private func finishUpload(_ parts: [API.Part]) async throws {
        let d = try await api.upload("/receipts", parts: parts)
        if selectedReceipt == nil, let r = try? JSONDecoder().decode(Receipt.self, from: d), UIDevice.current.userInterfaceIdiom == .pad { selectedReceipt = r.id }
        await loadJobs()
    }

    func image(_ path: String) async -> UIImage? {
        guard let d = try? await api.bytes(path) else { return nil }
        return UIImage(data: d)
    }

    /* ---------- Matplan ---------- */

    func loadWeek() async throws { week = try await api.mat("/week", as: Week.self) }
    func planWeek() {
        run {
            self.busy = true
            defer { self.busy = false }
            try await self.api.matCall("POST", "/plan", json: ["scope": "week"])
            try await self.loadWeek()
            self.flash("Ny ukeplan klar ✦")
        }
    }
    func planDay(_ date: String) { run { try await self.api.matCall("POST", "/plan", json: ["scope": "day", "date": date]); try await self.loadWeek() } }
    func setCook(_ date: String, _ cook: String) { run { try await self.api.matCall("PATCH", "/day/\(date)", json: ["cook": cook]); try await self.loadWeek() } }
    func toggleFixed(_ d: MealDay) { run { try await self.api.matCall("PATCH", "/day/\(d.date)", json: ["fixed": !(d.fixed ?? false)]); try await self.loadWeek() } }
    func toggleShop(_ id: String) { run { try await self.api.matCall("POST", "/shopping/\(id)/toggle"); try await self.loadWeek() } }
    /// Legger ingrediensene som mangler i handlelisten (ukas retter ligger der fra før).
    func addToShop(_ items: [String]) {
        let have = Set((week?.shopping ?? []).map { $0.text.lowercased() })
        let add = items.filter { !have.contains($0.lowercased()) }
        guard !add.isEmpty else { flash("Alt ligger allerede i handlelisten"); return }
        run {
            for t in add {
                var j: [String: Any] = ["text": t]
                if let st = self.week?.start { j["start"] = st }
                try await self.api.matCall("POST", "/shopping", json: j)
            }
            try await self.loadWeek()
            self.flash("\(add.count) lagt i handlelisten")
        }
    }

    /* ---------- Subscription OS ---------- */

    func addSub(name: String, plan: String, price: String, cycle: String, next: String) {
        run {
            let p = price.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: ".")
            try await self.api.call("POST", "/subscriptions", json: ["name": name, "plan": plan, "price": p, "cycle": cycle, "nextDate": next])
            try await self.loadSubs()
            self.flash("\(name) lagt til")
        }
    }
    func setSubActive(_ s: Sub, _ active: Bool) {
        run {
            try await self.api.call("PATCH", "/subscriptions/\(s.id)", json: ["active": active])
            try await self.loadSubs()
        }
    }

    /* ---------- Boliger (delte mapper) ---------- */

    func openFolder(_ id: Int?) {
        uploadFolder = nil
        guard let id else { folder = nil; return }
        run { self.folder = try await self.api.get("/folders/\(id)") }
    }
    /// Boligkategorier med underkategorier (Innstillinger → Boliger på PC). Tom liste på eldre servere.
    func loadBoligCategories() async {
        // {categories: [...], options, aiNew} (eldre form: [..] eller {items: [..]}).
        guard let d = try? await api.call("GET", "/boliger/categories") else { return }
        if let w = try? JSONDecoder().decode(BoligCats.self, from: d) { boligCats = w.categories }
        else if let list: [BoligCategory] = try? decodeList(d) { boligCats = list }
    }
    /// targetId: «Legg i bolig» (nil = boligen som er åpen). categoryId: nil = AI velger kategori og underkategori.
    func addFolderEntry(_ desc: String, _ amount: String, paidBy: String?, targetId: Int? = nil, categoryId: Int? = nil) {
        guard let f = folder else { return }
        let id = targetId ?? f.id
        run {
            var body: [String: Any] = ["description": desc, "amount": amount.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: ".")]
            if let paidBy { body["paidBy"] = paidBy }
            if let categoryId { body["categoryId"] = categoryId }
            let d = try await self.api.call("POST", "/folders/\(id)/entries", json: body)
            let res = try JSONDecoder().decode(Folder.self, from: d)
            // Lagt i en annen bolig: den åpne boligen lastes på nytt.
            if id == f.id { self.folder = res } else { self.folder = try await self.api.get("/folders/\(f.id)") }
            let list: [Folder] = try await self.decodeList(self.api.call("GET", "/folders")); self.folders = list
            self.flash("Lagt til i \(res.name)")
        }
    }

    /* ---------- Finn ---------- */

    func loadFinn() async throws {
        finn = try await api.get("/finn")
        if finnSel != nil { await loadFinnDetail() }
    }

    /// Åpner handelen: listedataene vises med en gang, detaljen (annonse, kvitteringer, e-poster, bilder) hentes etterpå.
    func openFinn(_ id: Int) {
        finnSel = id
        if let d = finn?.items.first(where: { $0.id == id }) { finnDetail = FinnDetail(deal: d) } else { finnDetail = nil }
        Task { await loadFinnDetail() }
    }

    /// GET /finn/:id. 404 (eldre server) beholder listedataene.
    func loadFinnDetail() async {
        guard let id = finnSel else { return }
        do {
            let d = try await api.get("/finn/\(id)", as: FinnDetail.self)
            if finnSel == id { finnDetail = d }
        } catch let e as APIError where e.status == 404 {
        } catch let e as APIError where e.status == 401 && loggedIn && !e.needsTotp {
            expired()
        } catch {}
    }

    /// Svaret fra opplasting, sletting og henting er hele handelen.
    private func setFinnDetail(_ d: Data, _ id: Int) async {
        if let full = try? JSONDecoder().decode(FinnDetail.self, from: d), full.deal.id == id {
            if finnSel == id { finnDetail = full }
        } else { await loadFinnDetail() }
    }

    /// kind: receipts | photos | emails. Kvitteringer og bilder går til POST /finn/:id/files med kind (receipt | photo),
    /// e-poster (.eml) til POST /finn/:id/emails. Filene ligger i feltet «file».
    func finnUpload(_ kind: String, _ files: [(name: String, mime: String, data: Data)]) {
        guard let id = finnSel, !files.isEmpty else { return }
        run {
            self.finnBusy = kind
            defer { self.finnBusy = nil }
            var parts = files.map { API.Part(name: "file", filename: $0.name, mime: $0.mime, data: $0.data) }
            let d: Data
            do {
                if kind == "emails" {
                    d = try await self.api.upload("/finn/\(id)/emails", parts: parts)
                } else {
                    parts.append(.text("kind", kind == "photos" ? "photo" : "receipt"))
                    d = try await self.api.upload("/finn/\(id)/files", parts: parts)
                }
            } catch let e as APIError where e.status == 404 {
                self.message = "Serveren støtter ikke opplasting til Finn-handler ennå. Oppdater homelab."
                return
            }
            await self.setFinnDetail(d, id)
            if let f = try? await self.api.get("/finn", as: FinnList.self) { self.finn = f }
            self.flash(kind == "photos" ? (files.count == 1 ? "1 bilde lagt til" : "\(files.count) bilder lagt til") : kind == "emails" ? "E-posten er lagt ved" : "Kvitteringen er lagt ved")
        }
    }

    /// Kvitteringer og bilder er filer i handelen; e-postene har egen rute.
    func finnRemove(_ kind: String, _ fileId: String) {
        guard let id = finnSel else { return }
        run {
            let d = try await self.api.call("DELETE", "/finn/\(id)/\(kind == "emails" ? "emails" : "files")/\(fileId)")
            await self.setFinnDetail(d, id)
        }
    }

    /// ✦ Hent annonsen (tittel, pris, sted, beskrivelse og bilder). url trengs bare når handelen mangler lenke og Finn-kode.
    func finnFetchAd(_ url: String? = nil) {
        guard let id = finnSel, finnBusy == nil else { return }
        run {
            self.finnBusy = "ad"
            defer { self.finnBusy = nil }
            var body: [String: Any] = [:]
            if let url, !url.trimmingCharacters(in: .whitespaces).isEmpty { body["url"] = url.trimmingCharacters(in: .whitespaces) }
            let d: Data
            do { d = try await self.api.call("POST", "/finn/\(id)/ad", json: body) } catch let e as APIError where e.status == 404 {
                self.message = "Serveren kan ikke hente annonser ennå. Oppdater homelab."
                return
            }
            await self.setFinnDetail(d, id)
            let msg = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any])?["message"] as? String
            self.flash(msg ?? "✦ Annonsen er lagret")
        }
    }

    /* ---------- Domener ---------- */

    private func loadDomains() async throws {
        let list: [DomainRef] = try await decodeList(api.raw("/domains/api", "/domains"))
        domains = list
        if domain == nil || !list.contains(where: { $0.name == domain }) { domain = list.first?.name }
        try await loadAnalytics()
    }

    private func loadAnalytics() async throws {
        guard let d = domain else { analytics = nil; return }
        let enc = d.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? d
        analytics = try await api.module("/domains/api", "/\(enc)/analytics?range=\(domRange)", as: Analytics.self)
    }

    func pickDomain(_ name: String) { domain = name; analytics = nil; run { try await self.loadAnalytics() } }

    /// Samme liste som i Homelab. API-token for Plausible/Umami legges inn på web.
    func addDomain(_ name: String, source: String) {
        let n = name.trimmingCharacters(in: .whitespaces).lowercased().replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
        guard !n.isEmpty else { flash("Skriv domenet"); return }
        run {
            self.busy = true
            defer { self.busy = false }
            try await self.api.callAt("/domains/api", "POST", "/domains", json: ["name": n, "source": source])
            self.domain = n
            try await self.loadDomains()
            self.flash("\(n) er lagt til")
        }
    }

    func removeDomain(_ d: DomainRef) {
        guard let id = d.id?.value else { return }
        run {
            try await self.api.callAt("/domains/api", "DELETE", "/domains/\(id)")
            if self.domain == d.name { self.domain = nil }
            try await self.loadDomains()
            self.flash("\(d.name) er fjernet")
        }
    }

    /// Landene til verdenskartet (world-atlas 110m), fra serveren eller jsDelivr som reserve. Hentes én gang.
    @ObservationIgnored private var mapCache: [MapCountry]?
    func worldMap() async -> [MapCountry] {
        if let m = mapCache { return m }
        var data = try? await api.raw("/domains/api", "/vendor/countries-110m.json")
        if data.flatMap({ MapCountry.parse($0) })?.isEmpty != false, let u = URL(string: "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json") {
            data = try? await URLSession.shared.data(from: u).0
        }
        let list = data.flatMap { MapCountry.parse($0) } ?? []
        if !list.isEmpty { mapCache = list }
        return list
    }
    func setRange(_ r: String) { domRange = r; run { try await self.loadAnalytics() } }
    func reloadDomain() { run { try await self.loadDomains(); self.flash("Oppdatert fra Cloudflare") } }

    /* ---------- API-tokens ---------- */

    func loadTokens() {
        tokenError = nil
        run {
            do { let list: [TokenInfo] = try await self.decodeList(self.api.call("GET", "/tokens")); self.tokens = list } catch let e as APIError {
                self.tokens = []
                self.tokenError = (e.status == 401 || e.status == 403) ? "Tokens kan bare administreres fra FinansHub i nettleseren for denne kontoen." : e.message
            }
        }
    }

    func createToken(name: String, scopes: [String], days: Int?) {
        run {
            var body: [String: Any] = ["name": name, "scopes": scopes]
            if let days { body["expiresDays"] = days; body["expires"] = days }
            let d = try await self.api.call("POST", "/tokens", json: body)
            self.newToken = (try JSONSerialization.jsonObject(with: d) as? [String: Any])?["token"] as? String
            self.loadTokens()
        }
    }

    func revokeToken(_ id: String) { run { try await self.api.call("DELETE", "/tokens/\(id)"); self.flash("Token trukket tilbake"); self.loadTokens() } }

    /* ---------- Data og lagring ---------- */

    func clearCache() { logos = [:]; URLCache.shared.removeAllCachedResponses(); flash("Hurtigbuffer tømt") }

    /// Alle transaksjoner som CSV (semikolon, UTF-8 med BOM) i en midlertidig fil for delingsarket.
    func exportCsv() async -> URL? {
        busy = true
        defer { busy = false }
        do {
            let all = try await api.get("/transactions?limit=100000", as: TxPage.self).items
            func esc(_ s: String) -> String { s.contains(";") || s.contains("\"") || s.contains("\n") ? "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\"" : s }
            var csv = "\u{FEFF}Dato;Beskrivelse;Beløp;Kategori;Konto;Notat\r\n"
            for t in all { csv += [t.date, esc(t.description), String(t.amount).replacingOccurrences(of: ".", with: ","), esc(t.category), esc(t.account), esc(t.note)].joined(separator: ";") + "\r\n" }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("finanshub-transaksjoner.csv")
            try csv.write(to: url, atomically: true, encoding: .utf8)
            return url
        } catch { message = error.localizedDescription; return nil }
    }
}

/// Liste pakket som {items: [..]}.
struct ItemsWrap<T: Decodable>: Decodable { let items: [T] }

/// nil blir JSON null.
func orNull(_ v: Any?) -> Any { v ?? NSNull() }

func isoDay(_ d: Date) -> String { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f.string(from: d) }
func parseDay(_ s: String) -> Date? { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f.date(from: String(s.prefix(10))) }

extension UIImage {
    /// Tegner bildet på nytt, noe som også retter orienteringen fra kameraet.
    func scaled(max: CGFloat) -> UIImage {
        let s = min(1, max / Swift.max(size.width, size.height))
        let target = CGSize(width: (size.width * s).rounded(), height: (size.height * s).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }

    /// Midtstilt kvadrat i side × side punkter (profilbilde).
    func squared(_ side: CGFloat) -> UIImage {
        let s = Swift.max(side / size.width, side / size.height)
        let w = size.width * s, h = size.height * s
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
            draw(in: CGRect(x: (side - w) / 2, y: (side - h) / 2, width: w, height: h))
        }
    }
}
