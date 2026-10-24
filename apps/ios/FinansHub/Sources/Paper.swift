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
    @Environment(\.horizontalSizeClass) private var hsc45
    let scan: ScanActions
    @Binding var photos: [PhotosPickerItem]
    @Binding var files: Bool

    var body: some View {
        // Appen tvinger mørk modus i roten (klassisk design), så systemets valg leses fra skjermen.
        let p = PaperPalette.of(store.paperMode, system: paperSystemScheme(phase))
        GeometryReader { g in
            // Prompt 45: én felles regel for brettoppsett (≥ 700 pt og ikke kompakt), Layout45.swift. Før: bredde ≥ 600 her.
            let wide = Layout45.mode(width: g.size.width, hsc: hsc45) == .wide
            let bottom = Swift.max(12, g.safeAreaInsets.bottom - 8)
            // Prompt 28: med tastaturet oppe (safe area-bunnen er da tastaturet) står fanelinja 8 pt over tastaturet,
            // og FAB-en følger med (claude-code-sok-tastatur.md).
            let kb28: Bool = g.safeAreaInsets.bottom > 120
            let shift: CGFloat = kb28 ? -8 : g.safeAreaInsets.bottom - bottom
            // Prompt 24: Ruter-visningen er fullskjerm uten fanelinje og skann-knapp.
            // Prompt 32: Innstillinger og undersidene har heller ingen fanelinje eller skann-knapp (Settings32.swift).
            // Prompt 37: Gjøremål har heller ingen fanelinje (tilbake med ‹ Mer eller kantsveip), Tasks37Model.swift.
            // Prompt 41: Bursdager har heller ingen fanelinje eller skanneknapp (Birthdays41.swift).
            // Prompt 42: samme regel brukes av Hjem-knappen (NavHome42.swift), så den ligger i Store.nav42BarShown.
            let showBar = store.nav42BarShown
            // Prompt 45: på iPad har Gjøremål samme sidelinje som Hjem (claude-code-gjoremal-fold-navbar-glimt.md).
            let rail45: Bool = wide && (showBar || store.inTasks37)
            // Prompt 23: ingen skann-knapp på Aksjer.
            // Prompt 45: i brettet modus ligger skann-knappen i sidelinja – ingen flytende knapp i tillegg.
            let fab = !wide && showBar && store.fabMode == "float" && store.paperTab != "abo" && store.paperTab != "familie" && !store.nav23NoScan
            ZStack(alignment: wide ? .topLeading : .bottom) {
                p.bg.ignoresSafeArea()
                VStack(spacing: 0) {
                    // Ikke .clipped(): da kuttes fotovinduet ved safe area, og statuslinja får papirfarge i stedet for bildet.
                    // Prompt 22: FinansHub-sidene bruker «Lys hovedbok» (lys-tokens) som standard (Theme22.swift).
                    content(store.finPalette22(p)).environment(\.paper, store.finPalette22(p)).frame(maxWidth: .infinity, maxHeight: .infinity)
                        // Sidene fra den klassiske appen skal ikke ligge under skinnen på bred skjerm.
                        .padding(.leading, rail45 && (store.paperClassic != nil || store.paperFin != nil) ? 108 : 0)
                        // Prompt 34: innholdet går helt ned bak fanelinjen og skann-knappen (claude-code-innhold-under-navbar.md).
                        // Tidligere sto en Color.clear-rad her, så scroll-innholdet stoppet over linja og bakgrunnen ble en flat stripe.
                        // safeAreaInset gir scroll-visningene luft nederst, men de tegner fortsatt under linja (Nav34.swift).
                        .safeAreaInset(edge: .bottom, spacing: 0) { Nav34BarSpace(height: showBar && !wide ? 62 - shift + 10 : 0) }
                }
                if rail45 {
                    PaperTabBar(scan: scan, rail: true)
                        .padding(.leading, 12)
                        .padding(.vertical, 12)
                } else if showBar {
                    // ZStack-en slutter ved safe area-bunnen, så linja flyttes ned dit den skal stå:
                    // max(12, inset − 8) pt over skjermkanten.
                    // Prompt 42: 1d – rutenettet med Hjem og modulene over fanelinja (NavHome42.swift).
                    if NavHome42.shared.modPick && NavHome42.shared.value == "1d" {
                        NavModGrid42().offset(y: shift)
                    }
                    PaperTabBar(scan: scan, rail: false)
                        .offset(y: shift)
                }
                if let h = store.paperHint {
                    Text(h).font(PF.ui(12.5, .semibold)).foregroundStyle(p.bg)
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(p.ink, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                        .padding(.trailing, 16).padding(.bottom, fab ? (wide ? 96 : 158) : 72)
                        .offset(y: shift)
                        .transition(.opacity)
                }
            }
            .overlay(alignment: .bottom) {
                // Prompt 37: Gjøremål uten fanelinje – «Ny oppgave …» og den runde ✦-knappen (Glimt) helt nede:
                // max(18, safe area + 8) over skjermkanten, og rett over tastaturet når det er oppe. Skjules mens et ark er åpent.
                if !wide && store.inTasks37 && TaskDock22.shared.cur != Tasks32b.archId && !Tasks37UI.shared.anySheet {
                    HStack(alignment: .center, spacing: 10) {
                        TaskDockField22(ownButton: false)
                        Task37GlimtButton()
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, kb28 ? 8 : (g.safeAreaInsets.bottom < 10 ? 18 : 8))
                    // Prompt 40: baren og ✦ løftes rett over tastaturet (8 pt luft) med samme måling som Chat (Kb32b),
                    // og glir opp/ned sammen med tastaturet. Lista bak blir stående.
                    .keyboardLift32b(gap: 8)
                    .ignoresSafeArea(.keyboard)
                    .animation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.24), value: Kb32b.shared.frame)
                    .transition(.opacity)
                }
                // Prompt 45: iPad – «Ny oppgave …» og ✦ (Glimt) nederst i oppgavekolonnen, til høyre for sidelinja og
                // listekolonnen og til venstre for Glimt-/detaljkolonnen (Tasks43Wide.swift). Følger tastaturet.
                if wide && store.inTasks37 && TaskDock22.shared.cur != Tasks32b.archId && !Tasks37UI.shared.anySheet {
                    Tasks45WideDock(width: g.size.width, kb: kb28, safeBottom: g.safeAreaInsets.bottom)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if fab {
                    // Prompt 43: i Domener ligger Glimt nå som en rad i domenekortet (Domains43.swift) – ingen rund knapp der.
                    Group {
                        if !store.paperInDomains { PaperFab(tap: fabTap, hold: fabHold) }
                    }
                        .padding(.trailing, wide ? 24 : 18)
                        .padding(.bottom, wide ? Swift.max(0, 24 - bottom) : 62 + 14)
                        .offset(y: shift)
                }
            }
            .overlay(alignment: .topTrailing) {
                // Prompt 29: samme bakgrunnsmeny fra pillen i toppen av Innstillinger.
                if store.paperBgOpen && (store.paperTab == "hjem" || store.paperTab == "innst") && !store.newsOpen && store.dishSel == nil && store.paperClassic == nil {
                    PaperBgMenu(top: g.safeAreaInsets.top + 62)
                }
            }
            .overlay(alignment: .top) {
                // Prompt 29: «✦ Legger til i kalenderen …» og banneret «✓ Nina frisør · …» over hele appen (Quick29Views.swift).
                Quick29Overlay()
            }
            // Prompt 38: usynlig lag som lukker AI-svarboblen ved trykk utenfor og fanger trykket (Assist38.swift).
            .overlay { Assist38Catcher() }
            // Prompt 41: svar-pillen vokser til fullskjerm og blir Chat (Search41Pull.swift).
            .overlay { Pull41Overlay() }
            .environment(\.paperWide, wide)
            .environment(\.layoutMode45, wide ? .wide : .compact)
            .onAppear { Layout45.shared.set(wide) }
            .onChange(of: wide) { (_: Bool, v: Bool) in Layout45.shared.set(v) }
        }
        .environment(\.paper, p)
        .animation(.easeOut(duration: 0.16), value: store.paperBgOpen)
        .animation(.easeOut(duration: 0.2), value: store.paperHint)
        .sheet(isPresented: Binding(get: { store.paperScanOpen }, set: { store.paperScanOpen = $0 })) {
            PaperScanSheet(scan: scan, recipe: store.paperTab == "mat") { store.paperScanOpen = false }
                .environment(\.paper, p)
                .presentationDetents([.height(360), .medium])
                .sheetEdge30(p.bg)
        }
        // Prompt 47: bekreftelsesarket for kvitteringer tolket på iPhonen og «✦ Leser …»-pillen (Receipt47Views.swift).
        .receipt47Host(p)
        .sheet(isPresented: Binding(get: { store.trackAddOpen }, set: { store.trackAddOpen = $0 })) {
            PaperNewShipmentSheet()
                .environment(\.paper, p)
                .presentationDetents([.medium, .large])
                .sheetEdge30(p.bg)
        }
        // Prompt 32: samme Papir-ark (Ferdig-pille, ingen Avbryt) for Hjem, Finans, Domener, Abonnement og Familie (Nav32.swift).
        // Prompt 42: Innstillinger → Tilpass → Fanelinje → Hjem-knapp (NavHome42.swift).
        .sheet(isPresented: Binding(get: { NavHome42.shared.picking }, set: { NavHome42.shared.picking = $0 })) {
            NavHomeSheet42()
                .environment(\.paper, p)
                .presentationDetents([.large])
                .presentationDragIndicator(.hidden)
                .sheetEdge30(p.bg)
        }
        .sheet(isPresented: Binding(get: { store.tabBarEditing }, set: { store.tabBarEditing = $0 })) {
            HomeTabEditor32b()
                .environment(\.paper, p)
                .presentationDetents([.large])
                .presentationDragIndicator(.hidden)
                .sheetEdge30(p.bg)
        }
        // Prompt 26: «Rediger fanelinjen» for Finans (hold inne på fanelinjen i Finans).
        .sheet(isPresented: Binding(get: { FinNav26.shared.editing }, set: { FinNav26.shared.editing = $0 })) {
            FinTabEditor32b()
                .environment(\.paper, p)
                .presentationDetents([.large])
                .presentationDragIndicator(.hidden)
                .sheetEdge30(p.bg)
        }
        .sheet(item: Binding<Sec32bId?>(get: { Nav32b.shared.editing.map { Sec32bId(id: $0) } }, set: { Nav32b.shared.editing = $0?.id })) { (s: Sec32bId) in
            SecTabEditor32b(k: s.id)
                .environment(\.paper, p)
                .presentationDetents([.large])
                .presentationDragIndicator(.hidden)
                .sheetEdge30(p.bg)
        }
        // Prompt 37: mens briefen er åpen, vises Vær fra briefen selv (Brief35Page), så den legges over briefen.
        .fullScreenCover(isPresented: Binding(get: { store.weatherOpen && !Brief34Model.shared.open }, set: { store.weatherOpen = $0 })) {
            // Prompt 30: kantsveip fra venstre lukker Vær (fullskjerm har ikke appens egen tilbakegest).
            PaperWeatherView().vaer46Keeper().edgeSwipeClose30 { store.weatherOpen = false }
        }
        .dismissHaptic30(store.weatherOpen)
        // Prompt 31: System-siden «Nordlys OS» i fullskjerm, varsel-trykk og prøve-varsler (System31.swift).
        .system31Host(p)
        // Prompt 34: AI-kontroll i fullskjerm (AiCtl34Page.swift) og Glimt-briefen (Brief34Page.swift).
        .aiCtl34Host(p)
        .brief34Host(p)
        // Prompt 35: Innstillinger → GLIMT → Glimt i fullskjerm (Glimt35Settings.swift).
        .glimt35Host(p)
        // Prompt 40: Hjemlys – start (1a/1c), mottakerskjerm når noen er sen, og Glimt-samtalen (1b).
        .hjemlys40Host(p)
        // Prompt 43: Media i fullskjerm (Mer → Media, Hjem-kortet, widgetene og magnet:-lenker), Media43Views.swift.
        .media43Host(p)
        // Prompt 46: Kart i fullskjerm (Mer → Kart, side-nøkkel tkart), Kart46Views.swift.
        .kart46Host(p, store)
        // Prompt 43: Innstillinger → Widgets (galleriet), Widgets43.swift.
        .widgets43Host(p)
        // Prompt 44: Logger (Innstillinger → Server), Studie → Dokumenter og «Logget inn som X · Gå ut» (Logs44/Study44/Konto44.swift).
        .hosts44(p)
        .task(id: store.account?.id) {
            Realtime.shared.connect(store)
            await AppMeta.shared.load(store)
            await AppMeta.shared.load24(store)
            // Prompt 24: ikonene i Nyhetsleser lastes på forhånd og profilen (startside og faner) leses.
            Task { await NewsIcons23.shared.preload(store) }
            await store.prof24Boot()
            await store.loadPhotoWindow()
            if store.mobileHome == nil { await store.loadHome() }
            if store.tracking == nil { try? await store.loadTracking() }
        }
    }

    /// Den flytende knappen: «Ny sending» på Sporing, ellers skann-arket (Legg til domene i Domener).
    /// Den flytende knappen: trykk åpner kameraet med en gang, hold inne gir valgarket.
    private func fabTap() {
        Haptics.shared.tap()
        if store.paperInDomains { store.domainManager = true; return }
        if store.paperTab == "sporing" && store.paperClassic == nil { store.trackAddOpen = true; return }
        if store.paperTab == "huske" && store.paperClassic == nil { TaskDock22.shared.submit(store); return }
        if store.paperTab == "abo" { store.subAdding = true; return }
        store.scanTarget = store.paperTab == "mat" ? "recipe" : "receipt"
        scan.camera()
    }

    private func fabHold() {
        Haptics.shared.tick()
        if store.paperInDomains { store.domainManager = true; return }
        if store.paperTab == "sporing" && store.paperClassic == nil { store.trackAddOpen = true; return }
        if store.paperTab == "huske" && store.paperClassic == nil { TaskDock22.shared.focusTick += 1; return }
        if store.paperTab == "abo" { store.subAdding = true; return }
        store.paperScanOpen = true
    }

    @ViewBuilder private func content(_ p: PaperPalette) -> some View {
        if store.newsOpen {
            NewsReaderView(back: { Haptic34.back(); store.newsOpen = false }).environment(\.paper, p)
                .environment(\.colorScheme, p.dark ? .dark : .light)
        } else if let id = store.dishSel {
            DishDetailView(id: id, pal: MatPal.paper(p)).environment(\.paper, p)
                .environment(\.colorScheme, p.dark ? .dark : .light)
        } else if let t = store.paperFin {
            classic(back: store.paperFinBackLabel) { FinanceTab(tab: t) }
        } else if let m = store.paperClassic {
            classic(back: m == .tracking ? "Sporing" : nil) { ModuleView(module: m, scan: scan, photos: $photos, files: $files) }
        } else if store.ruter24Full {
            RuterView24()
        } else if store.full27 {
            // Prompt 27: Kalender v2 og Chat i fullskjerm (Calendar27Page.swift, Chat27Page.swift).
            if store.paperTab == "chat" { Chat27Page() } else { Cal27Page() }
        } else {
            PaperPage().environment(\.colorScheme, p.dark ? .dark : .light)
        }
    }

    /// En side fra den klassiske appen, tegnet med Papir-fargene (PaperSkin). Sidene under Mer har egen tilbakeknapp i toppen;
    /// Finans-sidene og Domener får «‹ …» i Papir-stil.
    private func classic<C: View>(back: String?, @ViewBuilder _ c: () -> C) -> some View {
        let p = PaperSkin.palette ?? PaperPalette.light
        return VStack(spacing: 0) {
            if let back {
                HStack {
                    Button { store.paperUp() } label: {
                        Text("‹ \(back)").font(PF.ui(13, .semibold)).foregroundStyle(p.ink).padding(.leading, 10).padding(.trailing, 14).frame(height: 34)
                            .background(p.card, in: Capsule())
                            .overlay(Capsule().stroke(p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
                .padding(.horizontal, 18).padding(.top, 4).padding(.bottom, 2)
            }
            c().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background { p.bg.ignoresSafeArea() }
        .environment(\.colorScheme, p.dark ? .dark : .light)
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

/// Fanelinja nederst (eller skinnen til venstre på bred skjerm): fanene fordeles jevnt (den aktive tar bare plassen
/// den trenger). Hjem: Hjem (bare på startsiden), Finans, Mat, fjerde fane (Domener/Sporing), Søk og Mer. Finans:
/// brukerens valg (opptil 4) og Mer. Domener: Oversikt, Publikum, Ytelse og Infra. Med «I linjen» står + sist;
/// med den flytende skanneknappen står Søk rett før Mer.
struct PaperTabBar: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let scan: ScanActions
    var rail = false

    private var floating: Bool { store.fabMode == "float" }

    private var tabs: [(String, String, String)] {
        // Prompt 32: Domener, Abonnement og Familie følger brukerens valg fra «Rediger fanelinjen» (Nav32.swift).
        if store.paperInDomains { return Nav32b.shared.tabs("dom") }
        // Subscription OS: Hjem, Innsikt og Historikk i linja (med den røde +-sirkelen).
        if store.paperTab == "abo" { return Nav32b.shared.tabs("abo") }
        // Prompt 21: Familie har Kart, Soner og Helse i linja (som Subscription OS).
        // Prompt 42: Kart · Soner · Helse · Vel fremme, uten «⋯ Mer» (tilbake med «‹ Hjem» øverst eller Hjem-knappen).
        if store.paperTab == "familie" { return Nav32b.shared.tabs("kart") }
        var t: [(String, String, String)] = []
        if store.paperInFinance {
            for f in store.finNavItems { t.append((f.page, f.name, f.icon)) }
            if floating && !t.contains(where: { $0.0 == "fsok" }) { t.append(("fsok", "Søk", "⌕")) }
            t.append(("fmer", "Mer", "⋯"))
            return t
        }
        let main: [(String, String, String)] = store.mainTabs(floating: floating, onHome: store.paperTab == "hjem" && store.paperClassic == nil)
        // Prompt 42: med Hjem-knapp (1a/1b/1c) tas Hjem-fanen ut av lista (NavHome42.swift).
        if !rail && NavHome42.shared.dropsHomeTab { return main.filter { $0.0 != "hjem" } }
        return main
    }

    private var current: String {
        if store.paperInDomains { return store.paperTab }
        if store.paperTab == "abo" { return "abo:" + store.subTab }
        if store.paperTab == "familie" { return "fam:" + FamilyModel.shared.tab }
        if store.paperInFinance {
            let c = store.paperFinCurrent
            let ids = tabs.map(\.0)
            return ids.contains(c) ? c : "fmer"
        }
        if store.paperTab == "innst" || store.paperTab == "profil" || store.paperTab.hasPrefix("innst-") || store.paperClassic != nil { return "mer" }
        // Sider som ikke står i linja (f.eks. Sporing når fjerde fane er Domener) markerer Mer.
        let ids = store.mainTabs(floating: floating, onHome: store.paperTab == "hjem").map(\.0)
        return ids.contains(store.paperTab) ? store.paperTab : "mer"
    }

    /// Hovedlinja kan redigeres (hold inne); Finans-, Domener- og abonnementslinjene følger siden.
    private var editable: Bool { !store.paperInFinance && !store.paperInDomains && store.paperTab != "abo" && store.paperTab != "familie" }

    var body: some View {
        let cur = current
        if rail {
            // Prompt 45: skann-knappen (skann-ikon) ligger alltid i sidelinja (ikke flytende), skjules på sider der den ikke
            // hører hjemme og mens man redigerer – da står + / ↺ / ✓ der i stedet (Layout45.swift).
            PaperRail(tabs: tabs, current: cur, showPlus: !Layout45.scanHidden(store), tapTab: { id, on in tapTab(id, on: on) }, plusTap: plusTap, plusHold: plusHold,
                      style: store.navStyle25, showHome: !store.paperIsHome25, goHome: { store.paperGoHome25() },
                      editPage: store.paperEditPage, scanLabel: plusLabel)
        } else {
            // Prompt 42: Hjem-knappen etter valget i Tilpass → Fanelinje → Hjem-knapp (NavHome42.swift).
            let nh: String = NavHome42.shared.value
            let list: [(String, String, String)] = tabs
            let mid: Int = list.count / 2
            HStack(spacing: 12) {
                if nh == "1a" { NavHomeRound42() }
                HStack(spacing: 2) {
                    if nh == "1b" { NavHomeFirst42() }
                    if nh == "1d" { NavModSlot42() }
                    ForEach(Array(list.enumerated()), id: \.offset) { i, t in
                        if nh == "1c" && i == mid { NavHomeMid42() }
                        tab(t.0, t.1, t.2, on: cur == t.0)
                    }
                    if nh == "1c" && list.isEmpty { NavHomeMid42() }
                    if (!floating && store.paperTab != "familie" && !store.nav23NoScan) || store.paperTab == "abo" {
                        PaperPlusButton(label: plusLabel, tap: plusTap, hold: plusHold, glyph: store.paperInDomains ? "✦" : "+")
                            .padding(.leading, 4)
                    }
                }
                .padding(.horizontal, 8)
                .frame(height: 62)
                .background(p.nav, in: Capsule())
                .shadow(color: .black.opacity(0.35), radius: 15, y: 10)
                .simultaneousGesture(LongPressGesture(minimumDuration: 0.55).onEnded { _ in
                    // Prompt 26: Finans har egen editor (FinNav26.swift). Klikket når fingeren slippes slukes én gang.
                    if store.paperInFinance && !store.paperInDomains && store.paperTab != "abo" {
                        Nav26.shared.markHold()
                        Haptics.shared.tick()
                        FinNav26.shared.editing = true
                        return
                    }
                    // Prompt 32: egne fanelinjer (Domener, Abonnement, Familie) får samme ark.
                    if let sec = Nav32b.sec(store) {
                        Nav26.shared.markHold()
                        Haptics.shared.tick()
                        Nav32b.shared.editing = sec
                        return
                    }
                    guard editable else { return }
                    Nav26.shared.markHold()
                    Haptics.shared.tick()
                    store.tabBarEditing = true
                })
            }
            .padding(.horizontal, 12)
        }
    }

    private var plusLabel: String {
        if store.paperTab == "abo" { return "Legg til abonnement" }
        if store.paperInDomains { return "Glimt · oppsummering av domenene" }
        if store.paperInFinance { return "Legg til kvittering" }
        return store.paperTab == "mat" ? "Skann oppskrift" : "Skann"
    }

    /// Trykk: kameraet åpnes med en gang (i Mat som oppskrift). Hold inne: arket med Kvittering, Oppskrift, Bilder og Fil.
    private func plusTap() {
        Haptics.shared.tap()
        if store.paperTab == "abo" { store.subAdding = true; return }
        // Prompt 45: i sidelinja erstatter knappen den flytende «Ny sending» på Sporing.
        if rail && store.paperTab == "sporing" && store.paperClassic == nil { store.trackAddOpen = true; return }
        if store.paperInDomains { Dom38Glimt.shared.tap(store); return }
        store.scanTarget = store.paperTab == "mat" ? "recipe" : "receipt"
        scan.camera()
    }

    private func plusHold() {
        Haptics.shared.tick()
        if store.paperTab == "abo" { store.subAdding = true; return }
        if store.paperInDomains { Dom38Glimt.shared.tap(store); return }
        store.paperScanOpen = true
    }

    private func tab(_ id: String, _ name: String, _ icon: String, on: Bool) -> some View {
        // Prompt 25: stilen (Tekst / Bare ikoner / Ikoner + navn på valgt) tegnes i NavStyle25.swift.
        let style: String = store.navStyle25
        return Button { tapTab(id, on: on) } label: {
            NavTabLabel25(name: name, icon: icon, on: on, style: style)
        }
        .buttonStyle(.plain)
        .layoutPriority(on && style != "icons" ? 1 : 0)
        .accessibilityLabel(name)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func tapTab(_ id: String, on: Bool) {
        // Prompt 26: trykket som kommer når fingeren slippes etter hold inne, navigerer ikke (bare én gang).
        if Nav26.shared.consumeHold() { return }
        if id.hasPrefix("abo:") {
            Haptics.shared.select()
            store.subTab = String(id.dropFirst(4))
            return
        }
        if id.hasPrefix("fam:") {
            Haptics.shared.select()
            FamilyModel.shared.tab = String(id.dropFirst(4))
            return
        }
        if id == "mer" && store.paperTab == "familie" { store.paperMainTab("mer"); return }
        // Prompt 23: «Mer» på en Finans-underside åpner Finans → Mer (ikke den globale Mer, og ikke tilbake).
        if id == "fmer" && store.paperInFinance { store.nav26FinMore(); return }
        // Prompt 26: aktiv fane → fanens rot, og et nytt trykk scroller til toppen (Nav26.swift).
        if on { store.nav26TapActive(id); return }
        if id == "domener" && !store.paperInDomains { store.paperOpenDomains(from: "hjem"); return }
        // Prompt 34: Hjem-fanen fra en annen side er en tilbake-handling (lett impuls).
        if id == "hjem" { Haptic34.back() }
        if !store.paperInFinance && !store.paperInDomains { store.paperMainTab(id); return }
        store.paperFinGo(id)
    }
}

/// +-knappen: trykk = valg, hold inne = opplasting med en gang (haptisk tikk og et kort hint).
struct PaperPlusButton: View {
    @Environment(\.paper) private var p
    let label: String
    let tap: () -> Void
    let hold: () -> Void
    /// Prompt 38: «✦» (Glimt) i Domener.
    var glyph: String = "+"
    @State private var pressed = false

    var body: some View {
        Text(glyph).font(.system(size: glyph == "+" ? 24 : 20, weight: glyph == "+" ? .regular : .bold)).foregroundStyle(p.onLab)
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
                Button { go(recipe: false) { scan.camera() } } label: {
                    Text("Kvittering").font(PF.ui(15, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 54)
                        .background(p.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
                if !store.paperInFinance {
                    lineButton("Oppskrift") { go(recipe: true) { scan.camera() } }
                }
                lineButton("Bilder") { go(recipe: recipe) { scan.photos() } }
                lineButton("Fil") { go(recipe: recipe) { scan.files() } }
                queue
            }
            .padding(.horizontal, 18).padding(.top, 22).padding(.bottom, 10)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(p.bg)
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private var title: String {
        if store.paperTab == "boliger", let f = store.folder { return "Skann til \(f.name)" }
        return store.paperInFinance ? "Legg til kvittering" : "Skann"
    }
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
        // Kvitteringer som ikke kom fram (uten nett eller serverfeil) venter her og lastes opp av seg selv.
        PendingUploadsList()
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

    private func go(recipe r: Bool, _ act: @escaping () -> Void) {
        store.scanTarget = r ? "recipe" : "receipt"
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
            // Prompt 46: Google Photos-album under «Eget bilde» (GPhoto46.swift).
            GPhoto46Row()
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

/// Papir-siden for valgt fane: fotovindu (høyere på Hjem) og innhold som overlapper vinduet nederst (23 pt).
/// Innholdet scroller aldri opp over bildet: så snart brukeren scroller, klippes det ved headerens nederste kant.
struct PaperPage: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.paperWide) private var wide
    @State private var scrolled = false
    @Environment(\.accessibilityReduceMotion) private var reduce46

    var body: some View {
        if wide {
            wide46
        } else {
            page46
        }
    }

    /// Prompt 46 (claude-code-hjem-overgang-smooth-ipad-fold.md): på iPad holdes Hjem (1c) i minnet og tegnes alltid under
    /// modulen. Overgangen er bare transform + opacity: modulen skalerer ned (0,92) og tones ut, Hjem tones inn fra 1,03.
    /// Ingen layout-animasjon, ingen animert blur, og Hjem bygges ikke på nytt (widgetene viser det de har).
    /// Fjær 0,38/0,86 (≈ 340 ms); «Reduser bevegelse»: bare crossfade 200 ms.
    private var wide46: some View {
        let onHome: Bool = store.paperTab == "hjem"
        let out: AnyTransition = reduce46 ? AnyTransition.opacity : AnyTransition.asymmetric(insertion: .opacity, removal: AnyTransition.scale(scale: 0.92).combined(with: .opacity))
        return ZStack {
            Home45Wide()
                .opacity(onHome ? 1 : 0)
                .scaleEffect(onHome || reduce46 ? 1 : 1.03)
                .allowsHitTesting(onHome)
                .accessibilityHidden(!onHome)
            if !onHome {
                page46
                    .transition(out)
            }
        }
        .animation(reduce46 ? .easeInOut(duration: 0.2) : .spring(response: 0.38, dampingFraction: 0.86), value: onHome)
    }

    @ViewBuilder private var page46: some View {
        // Prompt 45: Hjem på iPad (brettet modus) er 1c – Glimt-kort til venstre, faner til høyre (Home45Wide.swift).
        if wide && store.paperTab == "hjem" {
            Color.clear // prompt 46: Hjem ligger alltid under (wide46)
        } else if wide && store.paperTab == "familie" {
            // Prompt 45: Familie på iPad – kartet står stille til venstre, bare høyre kolonne scroller (Family16.swift).
            VStack(spacing: 0) {
                PaperHero(home: false)
                FamilyView()
                    .padding(.leading, 108 + 16)
                    .padding(.trailing, 16)
                    .padding(.top, 14)
                    .padding(.bottom, 12)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
            .ignoresSafeArea(edges: .top)
        } else {
            scrollPage
        }
    }

    @ViewBuilder private var scrollPage: some View {
        let home = store.paperTab == "hjem"
        // Prompt 43: Gjøremål på iPad bruker hele bredden (tre kolonner, Tasks43Wide.swift).
        // Prompt 45: Familie på brettet skjerm har ingen maksbredde (Family16.swift, wideBody45).
        // Prompt 46: Bibel på iPad bruker maks 1100 pt (to kolonner, Bible46.swift).
        let maxW: CGFloat = wide ? (home ? 960 : (store.paperTab == "huske" || store.paperTab == "finans" || store.paperTab == "familie" ? 1500 : (store.paperTab == "bibel" ? 1100 : 720))) : .infinity
        VStack(spacing: 0) {
            PaperHero(home: home)
            // Prompt 25: ScrollViewReader for «Ta meg dit →» (Settings25.swift).
            ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    GeometryReader { g in
                        Color.clear.preference(key: PaperScrollKey.self, value: g.frame(in: .named("ppage")).minY)
                    }
                    .frame(height: 0)
                    .id("nav26top")
                    VStack(spacing: wide ? 12 : 10) { page }
                        // Prompt 30: 64 pt luft øverst i redigeringsmodus, så ＋ / ✓ aldri dekker søkefeltet eller minus-merket.
                        .padding(.top, Wiggle30.topPad(store))
                        .animation(Wiggle30.anim, value: Wiggle30.topPad(store))
                        .frame(maxWidth: maxW)
                        .padding(.horizontal, 16)
                        .frame(maxWidth: .infinity)
                        .padding(.leading, wide ? 108 : 0)
                        // Prompt 32: Innstillinger har ingen fanelinje eller skann-knapp: 28 pt + safe area nederst.
                        // Prompt 37: Gjøremål – plass til feltet nederst (60 + bunnmarg + 16).
                        // Prompt 45: også på iPad ligger «Ny oppgave …» + ✦ nederst i oppgavekolonnen.
                        .padding(.bottom, bottomPad45)
                }
            }
            .coordinateSpace(name: "ppage")
            .scrollIndicators(.hidden)
            // Prompt 37: ingen scroll mens et kort dras (gesten og scroll kjempet om samme berøring); auto-scroll nær kantene.
            .scrollDisabled(Drag37.shared.active)
            .background(Drag37Viewport())
            .onChange(of: Drag37.shared.scrollTick) { _, _ in
                let k: String = Drag37.shared.scrollTarget
                let top: Bool = Drag37.shared.scrollTop
                if !k.isEmpty { withAnimation(.easeOut(duration: 0.35)) { proxy.scrollTo("card37-" + k, anchor: top ? .top : .bottom) } }
            }
            // Ny side (eller ny bolig, transaksjon …) åpner alltid helt øverst.
            .id(pageKey)
            .onPreferenceChange(PaperScrollKey.self) { v in
                let s = v < -1
                if s != scrolled { scrolled = s }
            }
            .mask(
                VStack(spacing: 0) {
                    // Prompt 32: i redigeringsmodus klippes innholdet under ＋ / ✓, så kortene aldri glir bak knappene.
                    Color.clear.frame(height: scrolled ? (Wiggle30.topPad(store) > 0 ? Wiggle30.clipEdit : (store.inBible39 ? 36 : 23)) : 0)
                    // Prompt 34: masken går langt under rammen, så kortene synes bak fanelinjen og hjemstreken.
                    Color.black.padding(.bottom, -400)
                }
            )
            // Prompt 40: Bibel-siden går 36 pt opp i bakgrunnen (de andre sidene 23 pt). Kortet har egen skygge og runde hjørner.
            // Prompt 45: Gjøremål har ikke bakgrunnsbilde, og innholdet overlapper ikke toppen (ingen negativ marg).
            .padding(.top, topShift45)
            // Prompt 28: pillene i redigeringsmodus ligger over listen, utenfor scroll-innholdet (Wiggle28.swift).
            .edit28Layer(p)
            .overlay(alignment: .top) { Mer30Pills() }
            .refreshable { await refresh() }
            // Prompt 26: nytt trykk på aktiv fane på roten scroller til toppen (Nav26.swift).
            .onChange(of: Nav26.shared.topTick) { _, _ in
                withAnimation(.easeOut(duration: 0.3)) { proxy.scrollTo("nav26top", anchor: .top) }
            }
            .task(id: "\(pageKey)#\(Set25Focus.shared.tick)") { await scrollToFocus25(proxy) }
            }
        }
        .ignoresSafeArea(edges: .top)
    }

    private var bottomPad45: CGFloat {
        if store.inSettings32b { return 28 }
        if store.inBible39 || store.inBirthdays41 { return 24 }
        if store.inTasks37 { return 124 }
        if store.fabMode == "float" && !wide { return 112 }
        return 20
    }

    private var topShift45: CGFloat {
        if store.inBible39 { return -36 }
        if store.paperTab == "huske" { return 0 }
        return -23
    }

    /// Scroller til raden som skal fremheves (midt på skjermen).
    private func scrollToFocus25(_ proxy: ScrollViewProxy) async {
        guard let t = Set25Focus.shared.target else { return }
        try? await Task.sleep(nanoseconds: 350_000_000)
        if Task.isCancelled { return }
        withAnimation(.easeInOut(duration: 0.35)) { proxy.scrollTo(Set25Focus.rowId(t), anchor: .center) }
    }

    private var pageKey: String {
        "\(store.paperTab)|\(store.paperTxId ?? 0)|\(store.folder?.id ?? 0)|\(store.subTab)"
    }

    @ViewBuilder private var page: some View {
        switch store.paperTab {
        case "finans": PaperFinance()
        case "fliste": PaperFinList()
        case "finn": PaperFinn()
        // Prompt 45: Finans → Mer i samme design som Mer (Fin45More.swift). PaperFinMoreGrid brukes ikke lenger.
        case "fmer": PaperFinMore45()
        case "fsok": PaperFinSearch()
        case "ftx": PaperTxDetailView()
        case "abo": PaperSubs()
        case "mat": MatView(pal: MatPal.paper(p))
        case "sporing": PaperTracking()
        // Prompt 44: Mer med levende kort, Store · Lave og wiggle uten «Rediger» (More44.swift).
        case "mer": PaperMore44()
        case "bursdag": BirthdaysPage24()
        case "kalender": Cal26Page()
        case "innst": PaperSettings17()
        case "huske": PaperTasksView()
        // Prompt 37: Bibel-siden (Mer → Bibel, bare med modulen).
        case "bibel": Bible37Page()
        case "domener", "dpub", "dytl", "dinf": PaperDomains()
        case "aksjer": Stocks23Page()
        case "kvitt": Receipts23Page()
        case "boliger": PaperBoliger()
        case "familie": FamilyView()
        case "avg": PaperDepartures()
        case "profil": PaperProfile()
        // Prompt 39: «Utseende» er en del av «Tilpass»; gamle lenker til innst-ut havner der (Settings39.swift).
        case "innst-ut", "innst-tilpass": Tilpass39Page()
        case "innst-appprofil": AppProfile39Page()
        case "innst-fam": FamilySettingsView()
        case "innst-helse": HealthPosSettings20()
        // Prompt 42: Innstillinger → Helse (Familie) → Home Assistant · Mobilapp (Health42.swift).
        case "innst-hahelse": HaHealthPage42()
        case let t where t.hasPrefix("innst-"): PaperSettingsSub(key: String(t.dropFirst(6)))
        default: PaperHome()
        }
    }

    private func refresh() async {
        switch store.paperTab {
        case "finans", "fmer": await store.loadPaperFinance(force: true); await store.loadPaperFinance15()
        case "fliste": try? await store.loadTx()
        case "finn": try? await store.loadFinn()
        case "abo": try? await store.loadSubs()
        case "mat": try? await store.loadWeek(); await store.loadMatExtras()
        case "sporing": await store.refreshTracking22()
        case "domener", "dpub", "dytl", "dinf": store.reloadDomain(); if store.domAllMode { await store.loadDomAll() }
        case "ftx": if let id = store.paperTxId { store.openPaperTx(id) }
        case "boliger": await Bol24Model.shared.load(store)
        case "kalender": await Cal26Model.shared.load(store, force: true)
        case "bibel": await Bible37Model.shared.load(store, force: true)
        default: await store.loadHome(); await store.loadPhotoWindow()
        }
    }
}

/// Toppbildet med hilsen/tittel, klokke og vær (Hjem), bakgrunnsvelger og profilbilde. Utenfor Hjem står
/// pila øverst til venstre («‹ Hjem»), som går tilbake til startsiden.
struct PaperHero: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.paperWide) private var wide
    let home: Bool

    /// Prompt 45: Gjøremål har ikke bakgrunnsbilde – Papir-bakgrunnen og mørk tekst, som Nordlys (claude-code-gjoremal-uten-bakgrunn.md).
    private var plain45: Bool { store.paperTab == "huske" && store.paperClassic == nil && store.paperFin == nil }
    private var ink45: Color { plain45 ? p.ink : store.heroInk }

    var body: some View {
        ZStack(alignment: .bottom) {
            if plain45 {
                p.bg
            } else {
                background
                // Prompt 24: bakgrunnen til valgt bolig (Boliger24Hero.swift).
                if store.paperTab == "boliger" && store.folder == nil { Bol24HeroLayer() }
                // Mørk toning øverst og nederst, så teksten alltid er lesbar.
                LinearGradient(stops: [.init(color: .black.opacity(0.25), location: 0), .init(color: .clear, location: 0.35), .init(color: .black.opacity(0.45), location: 1)],
                               startPoint: .top, endPoint: .bottom)
            }
            VStack(alignment: .leading, spacing: 6) {
                topRow
                Spacer(minLength: 0)
                bottomRow
            }
            .padding(.leading, wide ? 130 : 22)
            .padding(.trailing, 22)
            .padding(.top, topInset + 10)
            // Prompt 40: på Bibel overlapper første kort hero med 36 pt, så tittelen flyttes like mye opp (minst 12 pt luft).
            .padding(.bottom, home ? 36 : (store.inBible39 ? 47 : (plain45 ? 12 : 34)))
        }
        .frame(height: (home ? (wide ? 230 : 172) : (plain45 ? 132 : 154)) + topInset)
        // Prompt 41: ingen bildekreditering på Hjem (flyttet til Innstillinger → Tilpass → Bakgrunn, Bg41Oslo.swift).
        .clipped()
    }

    /// Fotovinduet går helt opp under statuslinja; innholdet starter under den (Dynamic Island eller hakk).
    private var topInset: CGFloat {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let inset = scene?.windows.first(where: { $0.isKeyWindow })?.safeAreaInsets.top ?? scene?.windows.first?.safeAreaInsets.top ?? 0
        return inset > 0 ? inset : 47
    }

    @ViewBuilder private var background: some View {
        if store.paperTab == "avg" {
            RuterHeroArt()
        } else if let img = store.photoImage, store.photo != "cur" {
            // Bildet med uskarphet, mørklegging, dempede farger, papirtekstur og ev. regn/snø (Background19.swift).
            BgPhotoLayer(image: img)
                // Prompt 41: nytt bilde (Oslo hver time) tones inn over 600 ms.
                .id(ObjectIdentifier(img))
                .transition(.opacity)
        } else {
            LinearGradient(colors: gradientColors, startPoint: UnitPoint(x: 0.42, y: 0), endPoint: UnitPoint(x: 0.58, y: 1))
        }
    }

    /// Reserve uten bilde: gradienten fra serveren, ellers den rolige blågrå (aldri en tegning).
    private var gradientColors: [Color] {
        if let c = store.photoWindow?.colors, c.count >= 2, store.photo != "cur" { return c }
        // Prompt 21: ingen tegnet planet; når fotoet ikke kan lastes, vises den rolige gradienten.
        return [Color(hex: "#4a5a6a"), Color(hex: "#2a3440"), Color(hex: "#1d242c")]
    }

    private var bgName: String {
        switch store.photo {
        case "cur": "Nåværende"
        case "weather": "Vær nå"
        case "planets": "Planeter"
        case "custom": "Eget bilde"
        case "gphoto": "Google Photos" // prompt 46
        default: "Oslo"
        }
    }

    private var topRow: some View {
        HStack(spacing: 8) {
            if home {
                Text(AppMeta.shared.name).font(PF.serif(22, medium: true)).foregroundStyle(store.heroInk).lineLimit(1).minimumScaleFactor(0.7).shadow(color: .black.opacity(store.heroInk == .white ? 0.4 : 0), radius: 6)
            } else if store.prof24IsRoot || (wide && store.prof24UpLabel == "Hjem") || store.nav42HideUp(wide: wide) {
                // Prompt 24: rotsidene i Finans + Boliger har ingen tilbakeknapp; profilbildet står fortsatt til høyre.
                // Prompt 25: på bred skjerm går den røde Hjem-knappen i sidelinja hjem, så «‹ Hjem» skjules.
                Color.clear.frame(width: 1, height: 34)
            } else {
                pill("‹ \(store.prof24UpLabel)") { store.paperUp() }
            }
            Spacer()
            // Prompt 30: ingen @brukernavn-pille ved profilbildet (Finans, Subscription OS, Boliger, Aksjer …). Brukernavnet
            // vises bare i Innstillinger → Konto → Profil.
            // Prompt 29: «Planeter ▾» rett til venstre for profilbildet på Hjem og i Innstillinger (samme meny, gjelder hele appen).
            if (home || store.paperTab == "innst") && !store.paperInFinance {
                pill(bgName + " ▾") { store.paperBgOpen.toggle(); Haptics.shared.select() }
                    .accessibilityLabel("Bakgrunn: \(bgName)")
            }
            // Prompt 37: profilbildet øverst åpner Innstillinger (oversikten), ikke Konto. Konto nås fra profilkortet der.
            Button { store.paperGo("innst") } label: {
                // Prompt 46: Glimt-ringen (40 pt), alle lag klippet til sirkel (Profile46.swift).
                Avatar46(size: 40, gap: plain45 ? p.bg : Color.black.opacity(0.35), busy: Brief34Model.shared.loading, shadow: !plain45)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Innstillinger")
        }
    }

    @ViewBuilder private func pill(_ t: String, _ act: @escaping () -> Void) -> some View {
        if plain45 {
            // Lys pille med kant på Papir-bakgrunnen.
            Button(action: act) {
                Text(t).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink).lineLimit(1).padding(.horizontal, 12).frame(height: 34)
                    .background(p.card, in: Capsule())
                    .overlay(Capsule().stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
        } else {
            Button(action: act) {
                Text(t).font(PF.ui(12.5, .semibold)).foregroundStyle(.white).lineLimit(1).padding(.horizontal, 12).frame(height: 34)
                    .background(Color(hex: "#1b1a17").opacity(0.55), in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    /// Hilsenen står alltid på to linjer («God ettermiddag,» / navnet) og skaleres ned i stedet for å brytes.
    private var bottomRow: some View {
        HStack(alignment: .bottom, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(kicker).font(PF.italic(store.paperTab == "familie" ? 17 : 15)).opacity(0.9).lineLimit(1)
                ForEach(Array(title.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                    Text(line).font(PF.serif(home ? (wide ? 44 : 31) : (store.paperTab == "familie" ? 40 : 36), medium: true)).lineLimit(1).minimumScaleFactor(0.55)
                }
            }
            .layoutPriority(1)
            Spacer(minLength: 8)
            if home { weather }
            if store.prof24DomainPill { Dom24Pill() }
        }
        .foregroundStyle(ink45)
        .shadow(color: .black.opacity(!plain45 && store.heroInk == .white ? 0.45 : 0), radius: 8, y: 1)
    }

    @ViewBuilder private var weather: some View {
        let w = store.homeWeather
        let t = w?.temp ?? store.mobileHome?.weather?.temp
        if let t {
            // Prompt 36: trykk åpner Vær, hold inne ≥ 550 ms åpner yr.no for stedet (Temp36.swift).
            Temp36Press(temp: "\(Int(t.rounded()))°", line: "\(w?.text ?? store.mobileHome?.weather?.text ?? "") · \(clock) ›")
        }
    }

    private var rangeName: String {
        switch store.domRange {
        case "1h": return "Siste time"
        case "7d": return "Siste 7 dager"
        case "30d": return "Siste 30 dager"
        default: return "Siste 24 timer"
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
        case "fmer": return "Alt fra FinansHub på nettsiden"
        case "kvitt":
            let n = store.reviewCount ?? 0
            return n > 0 ? "\(n) til gjennomgang" : "Kø og bokført"
        case "fsok": return "Transaksjoner, kvitteringer og varelinjer"
        case "ftx": return "Transaksjon"
        case "abo": return "Abonnementer, kalender og AI-sparing"
        case "domener": return store.domAllMode ? "Alle domener" : rangeName
        case "dpub": return "Kart, land og enheter"
        case "dytl": return "Statuskoder, fart og sikkerhet"
        case "dinf": return "Oppetid, DNS og domeneinfo"
        case "mat": return "Uke \(Calendar(identifier: .iso8601).component(.weekOfYear, from: Date()))"
        case "sporing": return "Pakker og sendinger"
        case "mer": return "Alle moduler"
        case "bursdag": return "Familie og venner"
        case "innst": return "Konto, Finans, \(AppMeta.shared.name) og app"
        default: return store.paper16Kicker ?? ""
        }
    }

    private var title: String {
        switch store.paperTab {
        case "hjem":
            let first = store.displayName.split(separator: " ").first.map(String.init) ?? ""
            return first.isEmpty ? greetingWord() : "\(greetingWord()),\n\(first)"
        case "finans": return "Finans"
        case "fliste": return "Liste"
        case "finn": return "Finn"
        case "fmer": return "Mer"
        case "kvitt": return "Kvitteringer"
        case "fsok": return "Søk"
        case "ftx": return "Detaljer"
        case "abo": return "Subscription OS"
        case "domener": return "Domener"
        case "dpub": return "Publikum"
        case "dytl": return "Ytelse"
        case "dinf": return "Infrastruktur"
        case "mat": return "Mat"
        case "sporing": return "Sporing"
        case "mer": return "Mer"
        case "bursdag": return "Bursdager"
        case "innst": return "Innstillinger"
        default: return store.paper16Title ?? ""
        }
    }
}

func greetingWord(_ d: Date = Date()) -> String {
    let h = Calendar.current.component(.hour, from: d)
    switch h {
    case 5..<10: return "God morgen"
    case 10..<12: return "God formiddag"
    case 12..<18: return "God ettermiddag"
    case 18..<23: return "God kveld"
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
