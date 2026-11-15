import SwiftUI
import UIKit

/* ---------------- Navigasjonsskallet: TabView + NavigationStack per fane (fase 4) ----------------
 C-ios H1–H3, H16, Q33. Før: rot-ZStack med if/else (Shell.swift), egen fanelinje (PaperTabBar/PaperRail) som skiftet innhold
 per seksjon, og et eget kantsveip med skjermbilde (EdgeSwipeBack). Nå:
 – iPhone: systemets TabView med opptil 5 faner (brukerens valg fra «Rediger fanelinjen», Oversikt først, «Mer» sist).
 – iPad: NavigationSplitView med alle fanene i sidekolonnen (iOS 17), eller TabView med .sidebarAdaptable (iOS 18+).
 – Hver fane har en NavigationStack(path:). Sidene er fortsatt tilstandsstyrt (Store.paperTab, module, detail …), så ShellRouter
   speiler rute-nøkkelen (Store.shellPageKey) inn i stakken: ny side = push, tilbakeknapp i siden = pop, og systemets sveip
   tilbake kaller sidens egen tilbake-handling (ShellRouter.back). Bare øverste side tegnes levende; sidene under viser
   skjermbildet fra ShellHistory (som før), så sveipet viser riktig side bak.
 – Fanelinja skifter ikke innhold per seksjon: Finans, Domener, Abonnement og Familie har sine faner i en segmentert velger
   nederst på siden (ShellSectionBar).
 – Nye skjermer (bølge 2) kan bruke systemets navigasjonslinje med .shellSystemNavigationBar() og .navigationTitle(…). */

/// Plassen sidene tidligere holdt av til den egne skinnen på iPad (108 pt). Sidekolonnen i NavigationSplitView tar nå sin egen plass.
enum ShellMetrics {
    static let railInset: CGFloat = 0
    /// Høyden på segmentvelgeren for seksjonsfanene (ShellSectionBar), for knapper som ligger over den.
    static let sectionBarHeight: CGFloat = 48
}

/// En side i stakken. Nøkkelen er Store.shellPageKey for siden.
struct ShellRoute: Hashable {
    let key: String
}

@MainActor
@Observable
final class ShellRouter {
    static let shared: ShellRouter = ShellRouter()

    /// Stakken for fanen som vises (de andre fanene står på roten, som før).
    private(set) var path: [ShellRoute] = []
    /// Fanen stakken hører til.
    private(set) var tab: String = ""
    /// Rotsiden i fanen (skjermbildet bak første side).
    private(set) var rootKey: String = ""
    @ObservationIgnored private var popping: Bool = false

    /// Ruten skiftet (tilstandsstyrt navigasjon). root = siden har ingen tilbake (rot i fanen).
    func sync(from old: String, to key: String, root: Bool, tab: String) {
        if old != key { ShellHistory.shared.didChange(from: old, to: key, root: root) }
        if tab != self.tab {
            self.tab = tab
            rootKey = key
            set([], animated: false)
            popping = false
            return
        }
        if root || key == rootKey {
            rootKey = key
            if !path.isEmpty { set([], animated: !popping) }
            popping = false
            return
        }
        if let i = path.firstIndex(where: { (r: ShellRoute) -> Bool in r.key == key }) {
            // Tilbake (knapp i siden eller systemets sveip): alt over siden fjernes.
            if i < path.count - 1 { set(Array(path[...i]), animated: !popping) }
            popping = false
            return
        }
        if popping {
            // Sveipet tilbake landet på en annen side enn den under: bytt ut øverste side uten ny animasjon.
            var p: [ShellRoute] = path
            if p.isEmpty { p = [ShellRoute(key: key)] } else { p[p.count - 1] = ShellRoute(key: key) }
            set(p, animated: false)
            popping = false
            return
        }
        var p: [ShellRoute] = path
        p.append(ShellRoute(key: key))
        // Som historikken før: høyst 10 sider bak.
        if p.count > 10 { p.removeFirst(p.count - 10) }
        set(p, animated: true)
    }

    /// Stakken fra NavigationStack (systemets sveip eller tilbakeknapp): en side færre → sidens egen tilbake-handling.
    func stackChanged(_ new: [ShellRoute], _ store: Store) {
        if new.count < path.count {
            path = new
            popping = true
            ShellRouter.back(store)
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(700))
                self.popping = false
            }
        } else {
            path = new
        }
    }

    private func set(_ p: [ShellRoute], animated: Bool) {
        if p == path { return }
        if animated {
            path = p
        } else {
            var tr: Transaction = Transaction()
            tr.disablesAnimations = true
            withTransaction(tr) { path = p }
        }
    }

    /// Det sveipet tilbake gjør: lukker skjermene som lå over alt (original, redigering, detalj), ellers sidens egen tilbake.
    static func back(_ store: Store) {
        Haptic34.backSwipe()
        if store.original != nil { store.original = nil; return }
        if store.editing != nil { store.editing = nil; return }
        if store.detail != nil { store.detail = nil; return }
        store.nav50SwipeBack()
    }
}

extension Store {
    /// Ingen tilbake: rotsiden i fanen.
    var shellIsRoot: Bool { !nav50CanSwipe && detail == nil && editing == nil && original == nil }

    /// Rute-nøkkelen for stakken. På brett er valg i en liste (detalj i kolonnen ved siden av) ikke en ny side.
    var shellPageKey: String {
        if !Layout45.shared.wide { return nav23Key }
        var k: [String] = ["p:" + paperTab, module?.rawValue ?? "-", paperFin?.key ?? "-", settingsPage ?? "-", String(folder?.id ?? 0),
                           stockScreen, dishSel ?? "-", paperEditPage ?? "-", newsOpen ? "n" : "-", paperTrackFull ? "t" : "-",
                           detail != nil ? "d" : "-", editing != nil ? "e" : "-", original != nil ? "o" : "-"]
        if paperTab == "familie" { k.append(Fam50Nav.shared.key) }
        return k.joined(separator: "|")
    }

    /// Systemets fanelinje vises (samme regel som den gamle: ikke i Innstillinger, Gjøremål, Nyheter, fullskjerm …).
    var shellTabBarShown: Bool { nav42BarShown && detail == nil && editing == nil && original == nil }
}

/* ---------- Fanene (TabView / NavigationSplitView) ---------- */

/// Rotvisningen for innlogget bruker. `page` er den levende siden (PaperShell.content).
struct AppTabs<Page: View>: View {
    @Environment(Store.self) private var store
    @Environment(\.horizontalSizeClass) private var hsc
    let scan: () -> Void
    @ViewBuilder let page: () -> Page

    var body: some View {
        let regular: Bool = hsc == .regular
        let all: [ShellTab] = ShellTabs.all(store)
        let tabs: [ShellTab] = regular ? all : ShellTabs.compact(all)
        let cur: String = ShellTabs.current(store, ids: tabs.map { (t: ShellTab) -> String in t.id })
        let sel: Binding<String> = Binding<String>(get: { cur }, set: { (v: String) in ShellTabs.select(v, store, current: cur) })
        Group {
            if #available(iOS 18.0, *) {
                ShellTabView18(tabs: tabs, selection: sel, current: cur, page: page)
            } else {
                if regular {
                    ShellSplitView(tabs: tabs, selection: sel, current: cur, scan: scan, page: page)
                } else {
                    ShellTabView17(tabs: tabs, selection: sel, current: cur, page: page)
                }
            }
        }
        .onChange(of: store.shellPageKey) { (old: String, new: String) in
            ShellRouter.shared.sync(from: old, to: new, root: store.shellIsRoot, tab: cur)
        }
        .onChange(of: cur) { (_: String, new: String) in
            ShellRouter.shared.sync(from: store.shellPageKey, to: store.shellPageKey, root: true, tab: new)
        }
        .onAppear {
            ShellRouter.shared.sync(from: store.shellPageKey, to: store.shellPageKey, root: store.shellIsRoot, tab: cur)
        }
        .background(ShellTouchCapture(key: store.shellPageKey).frame(width: 0, height: 0))
    }
}

/// iOS 17 på iPhone: TabView med .tabItem.
struct ShellTabView17<Page: View>: View {
    let tabs: [ShellTab]
    let selection: Binding<String>
    let current: String
    let page: () -> Page

    var body: some View {
        TabView(selection: selection) {
            ForEach(tabs) { (t: ShellTab) in
                ShellStack(tabId: t.id, current: current, page: page)
                    .tabItem { Label(t.title, systemImage: t.symbol) }
                    .tag(t.id)
            }
        }
    }
}

/// iOS 18+: TabView med Tab-API-et. Brett: .sidebarAdaptable (sidekolonne eller faner øverst, som brukeren velger).
@available(iOS 18.0, *)
struct ShellTabView18<Page: View>: View {
    let tabs: [ShellTab]
    let selection: Binding<String>
    let current: String
    let page: () -> Page

    var body: some View {
        TabView(selection: selection) {
            ForEach(tabs) { (t: ShellTab) in
                SwiftUI.Tab(t.title, systemImage: t.symbol, value: t.id) {
                    ShellStack(tabId: t.id, current: current, page: page)
                }
            }
        }
        .tabViewStyle(.sidebarAdaptable)
    }
}

/// iOS 17 på iPad: sidekolonne med fanene (og Skann) og stakken til høyre.
struct ShellSplitView<Page: View>: View {
    @Environment(\.paper) private var p
    let tabs: [ShellTab]
    let selection: Binding<String>
    let current: String
    let scan: () -> Void
    let page: () -> Page

    var body: some View {
        let sidebarSel: Binding<String?> = Binding<String?>(get: { selection.wrappedValue }, set: { (v: String?) in if let v { selection.wrappedValue = v } })
        NavigationSplitView {
            List(selection: sidebarSel) {
                ForEach(tabs) { (t: ShellTab) in
                    Label(t.title, systemImage: t.symbol).tag(t.id)
                }
                Section {
                    Button(action: scan) { Label("Skann", systemImage: "viewfinder") }
                }
            }
            .navigationTitle("Homelab")
        } detail: {
            ShellStack(tabId: current, current: current, page: page)
        }
        .tint(p.lab)
    }
}

/* ---------- Stakken i én fane ---------- */

struct ShellStack<Page: View>: View {
    @Environment(Store.self) private var store
    let tabId: String
    let current: String
    let page: () -> Page

    var body: some View {
        let router: ShellRouter = ShellRouter.shared
        let active: Bool = tabId == current && router.tab == current
        let path: Binding<[ShellRoute]> = Binding<[ShellRoute]>(
            get: { active ? router.path : [] },
            set: { (v: [ShellRoute]) in if active { router.stackChanged(v, store) } })
        NavigationStack(path: path) {
            ShellPageView(live: tabId == current && (!active || router.path.isEmpty), key: tabId == current ? router.rootKey : "", page: page)
                .navigationDestination(for: ShellRoute.self) { (r: ShellRoute) in
                    ShellPageView(live: active && router.path.last == r, key: r.key, page: page)
                }
        }
    }
}

/// Én side i stakken: den levende siden øverst, ellers skjermbildet av siden (eller papirfargen).
struct ShellPageView<Page: View>: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let live: Bool
    let key: String
    let page: () -> Page
    @State private var systemBar: Bool = false

    var body: some View {
        Group {
            if live {
                page()
            } else if let snap = ShellHistory.shared.snapshot(for: key) {
                ShellSnapshotHost(view: snap).ignoresSafeArea().allowsHitTesting(false)
            } else {
                p.bg.ignoresSafeArea()
            }
        }
        .onPreferenceChange(ShellNavBarKey.self) { (v: Bool) in if v != systemBar { systemBar = v } }
        .toolbar(systemBar && live ? .visible : .hidden, for: .navigationBar)
        .toolbar(store.shellTabBarShown ? .visible : .hidden, for: .tabBar)
    }
}

/* ---------- Seksjonsfanene (Finans, Domener, Abonnement, Familie) ---------- */

/// Segmentert velger nederst på siden for fanene i en seksjon. Samme valg og samme redigering som den gamle seksjonslinja
/// (NavTabEditor.swift, FinNav26.swift), men fanelinja nederst er den samme overalt (Q33).
struct ShellSectionBar: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    static func visible(_ store: Store) -> Bool {
        store.paperInDomains || store.paperTab == "abo" || store.paperTab == "familie" || store.paperInFinance
    }

    private var items: [ShellTab] {
        var raw: [(String, String, String)] = []
        if store.paperInDomains {
            raw = Nav32b.shared.tabs("dom")
        } else if store.paperTab == "abo" {
            raw = Nav32b.shared.tabs("abo")
        } else if store.paperTab == "familie" {
            raw = Nav32b.shared.tabs("kart")
        } else {
            for f in store.finNavItems { raw.append((f.page, f.name, f.icon)) }
            if !raw.contains(where: { (t: (String, String, String)) -> Bool in t.0 == "fsok" }) { raw.append(("fsok", "Søk", "magnifyingglass")) }
            raw.append(("fmer", "Mer", "ellipsis"))
        }
        return raw.map { (t: (String, String, String)) -> ShellTab in ShellTab(id: t.0, title: t.1, symbol: t.2) }
    }

    private var current: String {
        if store.paperInDomains { return store.paperTab }
        if store.paperTab == "abo" { return "abo:" + store.subTab }
        if store.paperTab == "familie" { return "fam:" + FamilyModel.shared.tab }
        let c: String = store.paperFinCurrent
        return items.contains(where: { (t: ShellTab) -> Bool in t.id == c }) ? c : "fmer"
    }

    var body: some View {
        let list: [ShellTab] = items
        let cur: String = current
        HStack(spacing: 8) {
            Picker("Seksjon", selection: Binding<String>(get: { cur }, set: { (v: String) in tap(v, current: cur) })) {
                ForEach(list) { (t: ShellTab) in Text(t.title).tag(t.id) }
            }
            .pickerStyle(.segmented)
            Button(action: edit) {
                Image(systemName: "slider.horizontal.3").frame(width: 44, height: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(p.mut)
            .accessibilityLabel("Rediger fanene")
        }
        .padding(.horizontal, 12)
        .frame(height: ShellMetrics.sectionBarHeight)
        .background(.bar)
    }

    private func edit() {
        Haptics.shared.tick()
        if store.paperInFinance && !store.paperInDomains && store.paperTab != "abo" {
            FinNav26.shared.editing = true
            return
        }
        if let sec = Nav32b.sec(store) { Nav32b.shared.editing = sec }
    }

    private func tap(_ id: String, current: String) {
        if id.hasPrefix("abo:") {
            Haptics.shared.select()
            store.subTab = String(id.dropFirst(4))
            return
        }
        if id.hasPrefix("fam:") {
            Haptics.shared.select()
            FamilyModel.shared.tab = String(id.dropFirst(4))
            // Prompt 50: fanen åpnes på roten (undersidene lukkes).
            Fam50Nav.shared.reset()
            return
        }
        if id == "mer" && store.paperTab == "familie" { store.paperMainTab("mer"); return }
        if id == "fmer" && store.paperInFinance { store.nav26FinMore(); return }
        if id == current { store.nav26TapActive(id); return }
        Haptics.shared.select()
        if !store.paperInFinance && !store.paperInDomains { store.paperMainTab(id); return }
        store.paperFinGo(id)
    }
}

/* ---------- Systemets navigasjonslinje (bølge 2) ---------- */

struct ShellNavBarKey: PreferenceKey {
    static let defaultValue: Bool = false
    static func reduce(value: inout Bool, nextValue: () -> Bool) { value = value || nextValue() }
}

extension View {
    /// Viser systemets navigasjonslinje for siden (tittel med .navigationTitle, knapper med .toolbar). Uten denne er linja
    /// skjult, fordi de eldre sidene har sitt eget toppfelt.
    func shellSystemNavigationBar(_ on: Bool = true) -> some View {
        preference(key: ShellNavBarKey.self, value: on)
    }
}

/* ---------- Sveip tilbake med skjult navigasjonslinje ---------- */

// Systemets sveip tilbake slås av når navigasjonslinja er skjult. Gesten får lov så lenge det finnes en side å gå tilbake til.
extension UINavigationController: UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        if gestureRecognizer === interactivePopGestureRecognizer { return viewControllers.count > 1 }
        return true
    }
}

/* ---------- Skjermbilde av siden ved berøring (for siden bak i stakken) ---------- */

/// Tar et skjermbilde av siden i det brukeren berører skjermen (før trykket rekker å bytte side), som før (prompt 23).
/// Gjenkjenneren tar aldri imot berøringer selv, så den forstyrrer ingen gester.
struct ShellTouchCapture: UIViewRepresentable {
    let key: String

    func makeCoordinator() -> ShellTouchCoordinator { ShellTouchCoordinator() }

    func makeUIView(context: Context) -> ShellTouchHost {
        let v: ShellTouchHost = ShellTouchHost()
        v.coordinator = context.coordinator
        v.isUserInteractionEnabled = false
        return v
    }

    func updateUIView(_ v: ShellTouchHost, context: Context) {
        context.coordinator.key = key
    }

    static func dismantleUIView(_ v: ShellTouchHost, coordinator: ShellTouchCoordinator) { coordinator.detach() }
}

final class ShellTouchHost: UIView {
    weak var coordinator: ShellTouchCoordinator?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if let w = window { coordinator?.attach(to: w) } else { coordinator?.detach() }
    }
}

@MainActor
final class ShellTouchCoordinator: NSObject, UIGestureRecognizerDelegate {
    var key: String = ""
    private var recognizer: UITapGestureRecognizer?
    private weak var win: UIWindow?

    func attach(to w: UIWindow) {
        ShellHistory.shared.window = w
        if win === w, recognizer != nil { return }
        detach()
        let g: UITapGestureRecognizer = UITapGestureRecognizer(target: nil, action: nil)
        g.cancelsTouchesInView = false
        g.delaysTouchesBegan = false
        g.delaysTouchesEnded = false
        g.delegate = self
        w.addGestureRecognizer(g)
        recognizer = g
        win = w
    }

    func detach() {
        if let g = recognizer { g.view?.removeGestureRecognizer(g) }
        recognizer = nil
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // Ikke mens et ark ligger over appen (da tas ingen skjermbilder av siden bak).
        if win?.rootViewController?.presentedViewController == nil { ShellHistory.shared.capture(key: key) }
        return false
    }
}

/* ---------- «Oppdater serveren» / «Oppdater appen» (Q19) ---------- */

struct ShellCompatBanner: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        if let msg = store.serverCompat.message {
            Label(msg, systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                .font(PF.ui(13, .semibold))
                .foregroundStyle(p.onLab)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(p.lab, in: RoundedRectangle(cornerRadius: DS.Radius.md, style: .continuous))
                .padding(.horizontal, 16)
                .accessibilityAddTraits(.isStaticText)
        }
    }
}
