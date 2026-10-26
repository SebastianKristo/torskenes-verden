import SwiftUI
import UIKit
import UserNotifications
import WidgetKit

/* ---------------- Prompt 33: Kalender – egen app (no.kristo.kalender) ---------------- */
// Fasit: design/Kalender App.dc.html (platform ios), Kalender App Oversikt.dc.html, Kalender iPhone.dc.html.
// Én skjerm: toppfelt, visning og skrivefelt. Sidemeny, ark, Glimt-panel og bakteppe dekker hele skjermen (også statuslinjen).

@main
struct KalApp: App {
    @Environment(\.scenePhase) private var phase

    init() {
        KalCache44.launched = Date()
        // Prompt 51: krasjfangeren først (forrige økts krasj legges i køen), så enhetsnøkkel/flagg (KalSec51Core.swift).
        KalSec51.enabled = true
        KalCrash51.install()
        // Prompt 44: forhåndslasting i bakgrunnen (BGAppRefreshTask) må registreres før appen er ferdig startet.
        KalBg44.register()
        KalNotify.setup()
        UNUserNotificationCenter.current().delegate = KalNotifyDelegate.shared
    }

    var body: some Scene {
        WindowGroup {
            KalThemed()
                .onOpenURL { (url: URL) in KalLinks.handle(url) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { (a: NSUserActivity) in
                    if let u = a.webpageURL { KalLinks.handle(u) }
                }
                .task {
                    KalStore.shared.bootstrap()
                    // Prompt 51: krasjrapporter, flagg, ventende enheter og «Nytt i denne versjonen».
                    KalSec51Model.shared.active()
                    await KalStore.shared.load(force: true)
                }
        }
        .onChange(of: phase) { (_: ScenePhase, p: ScenePhase) in
            let s: KalStore = KalStore.shared
            if p == .active {
                // Prompt 44: tilbake fra Homelab uten svar → feilmelding etter 20 s.
                KalLogin41Model.shared.returned44()
                s.bootstrap()
                s.startPolling()
                Task { await s.load(force: true) }
                // Prompt 41: lokal eller ekstern adresse (Bytt automatisk), hentet fra Homelab-serveren.
                if s.loggedIn { Task { await KalLogin41Model.syncServers() } }
                KalSec51Model.shared.active()
            } else if p == .background {
                KalSec51Model.shared.inactive()
                s.stopPolling()
                s.saveSnapshot()
                KalBg44.schedule()
            }
        }
    }
}

/// Velger tema (System / Lys / Mørk) og legger tokens i miljøet.
struct KalThemed: View {
    @MainActor private var s: KalStore { KalStore.shared }

    private var scheme: ColorScheme? {
        if s.theme == "light" { return .light }
        if s.theme == "dark" { return .dark }
        return nil
    }

    var body: some View {
        KalSchemeReader()
            .preferredColorScheme(scheme)
            .onAppear { KalThemed.apply(s.theme) }
            .onChange(of: s.theme) { (_: String, v: String) in KalThemed.apply(v) }
    }

    /// overrideUserInterfaceStyle på vinduene (preferredColorScheme(nil) går ikke alltid tilbake til System).
    static func apply(_ theme: String) {
        let style: UIUserInterfaceStyle = theme == "light" ? .light : (theme == "dark" ? .dark : .unspecified)
        for scene in UIApplication.shared.connectedScenes {
            guard let ws = scene as? UIWindowScene else { continue }
            // Prompt 47: også tastaturvinduene får stilen (tastaturet følger temaet), men aldri bakgrunnsfarge (se KalKeyboard37.windowBg).
            for w in ws.windows { w.overrideUserInterfaceStyle = style }
        }
    }
}

struct KalSchemeReader: View {
    @Environment(\.colorScheme) private var cs

    var body: some View {
        // Prompt 51: «Nytt i denne versjonen» over alt annet (tegner ingenting når det ikke er noe nytt).
        KalRoot()
            .overlay { KalNew51Host() }
            // Prompt 70: «Kalender på hjemskjermen» én gang etter oppdateringen (etter «Nytt i denne versjonen»).
            .overlay { KalWIntro70Host() }
            .environment(\.kal, cs == .dark ? KalTheme.darkTheme : KalTheme.light)
    }
}

struct KalRoot: View {
    @Environment(\.kal) private var t
    @Environment(\.accessibilityReduceMotion) private var reduce
    /// Prompt 42: iPad – bred layout når vinduet er regular (fullskjerm, Split View 1/2 og 2/3), ellers iPhone-layouten.
    @Environment(\.horizontalSizeClass) private var hsc
    @MainActor private var s: KalStore { KalStore.shared }

    private var pad: Bool { hsc == .regular && KalPad42Model.isPad }

    var body: some View {
        ZStack {
            t.bg.ignoresSafeArea()
            if s.loggedIn {
                // Prompt 43: steg 2 av 2 etter innlogging på bred skjerm (≥ 600 pt): velg oppsett. Én gang per enhet.
                GeometryReader { (g: GeometryProxy) in
                    if g.size.width >= 600 && !KalWide43.shared.done {
                        KalLayoutStep43()
                            .transition(.opacity)
                    } else {
                        ZStack {
                            main
                            overlays
                        }
                    }
                }
            } else {
                // Prompt 41: innlogging uten serveradresse (Fortsett som · Logg inn med Homelab-appen · passord).
                KalLogin41View()
            }
        }
        .onAppear { firstFrame44() }
        .tint(t.red)
        // Prompt 42: arkene legges i midten på iPad (bred layout), tastatursnarveiene finnes i begge layoutene.
        .environment(\.kalPad42, pad)
        .background { if s.loggedIn { KalPad42Keys() } }
        .animation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3), value: KalPad42Model.shared.sideOpen)
        .animation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3), value: KalPad42Model.shared.overlayOpen)
        .animation(sheetAnim, value: s.glimtOpen)
        .animation(sheetAnim, value: s.detId)
        .animation(sheetAnim, value: s.newForm != nil)
        .animation(sheetAnim, value: s.drawerOpen)
        .animation(reduce ? Animation.easeOut(duration: 0.2) : Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28), value: s.settingsOpen)
        .animation(.easeOut(duration: 0.2), value: s.searchOpen)
        .animation(reduce ? Animation.easeOut(duration: 0.2) : Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28), value: s.cals39Open)
        .animation(reduce ? Animation.easeOut(duration: 0.2) : Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28), value: s.cal39Edit)
        .animation(sheetAnim, value: s.cal39AddOpen)
        .animation(sheetAnim, value: s.gmap39Open)
        .animation(.easeOut(duration: 0.2), value: s.toast)
        // Prompt 41: testvarselet vises også som banner i appen.
        .overlay(alignment: .top) {
            if KalNotify41.shared.banner { KalTestBanner41() }
        }
    }

    /// Prompt 44: «cal.firstFrame» – første bilde etter trykk på ikonet (mål: < 300 ms, bufferen tegnes uten nett).
    private func firstFrame44() {
        if s.firstFrame44 { return }
        s.firstFrame44 = true
        let ms: Int = Int(Date().timeIntervalSince(KalCache44.launched) * 1000)
        KalLog44.send("cal.firstFrame", ["ms": String(ms), "events": String(s.events.count)])
    }

    /// 0,3 s cubic-bezier(.2,.8,.2,1); med «Reduser bevegelse» bare en kort fade.
    private var sheetAnim: Animation {
        if reduce { return Animation.easeOut(duration: 0.2) }
        return Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.32)
    }

    @ViewBuilder private var main: some View {
        // Prompt 43: Innstillinger → Generelt → Oppsett på iPad og Fold (tlf | delt | full).
        if pad && KalWide43.shared.mode == "full" {
            KalPad42Main(full43: true) { stage }
        } else if pad && KalWide43.shared.mode == "delt" {
            KalPad42Main { stage }
        } else if pad {
            // «Som på telefonen»: iPhone-layouten, sentrert med maks-bredde 700 pt.
            phoneLayout
                .frame(maxWidth: 700)
                .frame(maxWidth: .infinity)
        } else {
            phoneLayout
        }
    }

    private var phoneLayout: some View {
        Group {
            // Prompt 35 (tastatur): toppfeltet og skrivefeltet har fast høyde og prioritet; bare visningen krymper når tastaturet kommer.
            // Uten minHeight 0 kunne innholdet ikke krympe, VStack-en ble høyere enn skjermen og toppen havnet under statuslinjen
            // mens skrivefeltet havnet bak tastaturet.
            VStack(spacing: 0) {
                KalHeader()
                    .fixedSize(horizontal: false, vertical: true)
                    .layoutPriority(2)
                stage
                    .frame(minHeight: 0, maxHeight: .infinity)
                    .layoutPriority(0)
                KalComposer()
                    .fixedSize(horizontal: false, vertical: true)
                    .layoutPriority(2)
            }
        }
    }

    /// Visningen med zoom, sveip, klyp og toast (felles for iPhone- og iPad-layouten).
    private var stage: some View {
            ZStack(alignment: .bottom) {
                // Prompt 35: zoom mellom visningene – den nye visningen vokser fra trykk-/klypepunktet. «Uken starter» bygger alt på nytt.
                ZStack {
                    content
                        .id(s.view + "|" + s.weekStart)
                        .transition(zoomTransition)
                }
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                .clipped()
                .contentShape(Rectangle())
                .simultaneousGesture(swipe)
                .simultaneousGesture(pinch)
                .overlay { keyboardCatcher }
                if let toast = s.toast {
                    KalToastView(toast: toast)
                        .padding(.horizontal, 14)
                        .padding(.bottom, 10)
                        .transition(.opacity.combined(with: .offset(y: 10)))
                }
            }
    }

    @ViewBuilder private var content: some View {
        switch s.view {
        case "ar": KalYearView()
        case "uke", "3d", "dag": KalGridView()
        case "liste": KalListView()
        default: KalMonthView()
        }
    }

    /// Prompt 35: inn = scale(.55) → 1 + fade, ut = scale(1.6) → 1, fra punktet man trykket. «Reduser bevegelse»: bare fade.
    private var zoomTransition: AnyTransition {
        if reduce { return AnyTransition.opacity }
        let from: CGFloat = s.zoomInward ? 0.55 : 1.6
        let ins: AnyTransition = AnyTransition.scale(scale: from, anchor: s.zoomOrigin).combined(with: .opacity)
        return AnyTransition.asymmetric(insertion: ins, removal: .opacity)
    }

    /// Spre to fingre (> 1,22×) zoomer inn fra punktet, klyp sammen (< 0,82×) zoomer ut.
    private var pinch: some Gesture {
        MagnifyGesture(minimumScaleDelta: 0.05).onEnded { (v: MagnifyGesture.Value) in
            s.pinch(v.magnification, at: v.startAnchor)
        }
    }

    /// Prompt 35: trykk utenfor feltet lukker tastaturet (laget finnes bare mens feltet har fokus).
    @ViewBuilder private var keyboardCatcher: some View {
        if KalComposerModel.shared.focused {
            Color.black.opacity(0.001)
                .contentShape(Rectangle())
                .onTapGesture { KalComposerModel.shared.focused = false }
                .gesture(DragGesture(minimumDistance: 12).onEnded { (v: DragGesture.Value) in
                    if v.translation.height > 20 { KalComposerModel.shared.focused = false }
                })
                .accessibilityHidden(true)
        }
    }

    /// Sveip inn fra venstre kant (de første 28 pt) åpner Kalendere; ellers bytter sveip venstre/høyre periode (ikke i Liste).
    private var swipe: some Gesture {
        // Prompt 44: merk sveipet så snart fingeren har flyttet seg > 12 pt (trykk rett etter ignoreres, KalSwipe44).
        DragGesture(minimumDistance: 12).onChanged { (v: DragGesture.Value) in
            if abs(v.translation.width) > 12 || abs(v.translation.height) > 12 { KalSwipe44.mark() }
        }
        .onEnded { (v: DragGesture.Value) in
            if abs(v.translation.width) > 12 || abs(v.translation.height) > 12 { KalSwipe44.mark() }
            let dx: CGFloat = v.translation.width
            let dy: CGFloat = v.translation.height
            if v.startLocation.x < 28 && dx > 50 && abs(dx) > abs(dy) {
                KalHaptic.tap()
                // Prompt 42: på iPad glir sidepanelet inn i stedet for sidemenyen.
                withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3)) {
                    // Prompt 43: «Som på telefonen» på iPad har sidemenyen fra iPhone (ikke sidepanelet).
                    if pad && KalWide43.shared.mode != "tlf" { KalPad42Model.shared.overlayOpen = true } else { s.drawerOpen = true }
                }
                return
            }
            if s.view == "liste" { return }
            if abs(dx) > 60 && abs(dx) > abs(dy) * 1.5 { s.step(dx < 0 ? 1 : -1) }
        }
    }

    private var sheetIn: AnyTransition { reduce ? AnyTransition.opacity : AnyTransition.move(edge: .bottom) }
    private var drawerIn: AnyTransition { reduce ? AnyTransition.opacity : AnyTransition.move(edge: .leading) }

    @ViewBuilder private var overlays: some View {
        if s.searchOpen {
            KalSearchView()
                .transition(.opacity)
                .zIndex(20)
        }
        if s.glimtOpen {
            KalDim { withAnimation(.easeOut(duration: 0.25)) { KalGlimtModel.shared.finishAll(); s.glimtOpen = false } }
                .zIndex(45)
            KalGlimtPanel()
                .frame(maxWidth: pad ? 680 : .infinity)
                .ignoresSafeArea(.container, edges: .bottom)
                .transition(sheetIn)
                .zIndex(46)
        }
        if let id = s.detId, let e = s.event(id) {
            KalDim { withAnimation(.easeOut(duration: 0.22)) { s.detId = nil } }
                .zIndex(47)
            KalDetailSheet(e: e)
                .ignoresSafeArea(.container, edges: .bottom)
                .transition(sheetIn)
                .zIndex(48)
        }
        if let f = s.newForm {
            KalDim { withAnimation(.easeOut(duration: 0.22)) { s.newForm = nil } }
                .zIndex(49)
            // Prompt 37: arket ligger også bak tastaturet (ingen grå dimming i tastaturets runde hjørner).
            KalNewSheet(form: f)
                .ignoresSafeArea([.container, .keyboard], edges: .bottom)
                .transition(sheetIn)
                .zIndex(50)
        }
        if s.drawerOpen {
            KalDim { withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3)) { s.drawerOpen = false } }
                .zIndex(51)
            KalDrawer()
                .ignoresSafeArea(.container, edges: .all)
                .transition(drawerIn)
                .zIndex(52)
        }
        // Prompt 46: arket kom ikke fram – feilmelding med «Prøv igjen» i stedet for grå skjerm.
        if KalNew46Guard.shared.failed != nil {
            KalNewFail46()
                .frame(maxHeight: .infinity, alignment: .bottom)
                .padding(.bottom, 90)
                .transition(.opacity)
                .zIndex(69)
        }
        // Prompt 44: «Endret et annet sted. Behold din eller deres?» etter Lagre.
        if KalEdit44Model.shared.conflict != nil {
            KalDim { KalStore.shared.resolveConflict44(keepMine: false) }
                .zIndex(67)
            KalConflict44View()
                .zIndex(68)
        }
        // Prompt 35: Innstillinger glir inn fra høyre over hele skjermen (0,28 s).
        if s.settingsOpen {
            KalSettings35View()
                .modifier(KalPadSide42(pad: pad))
                .transition(reduce ? AnyTransition.opacity : AnyTransition.move(edge: .trailing))
                .zIndex(60)
        }
        // Prompt 39: Kalendere (1a) → Rediger (1b), Legg til (1c) og Google-velgeren (1d).
        if s.cals39Open {
            KalCals39View()
                .modifier(KalPadSide42(pad: pad))
                .transition(reduce ? AnyTransition.opacity : AnyTransition.move(edge: .trailing))
                .zIndex(61)
        }
        if let id = s.cal39Edit, let c = s.cals.first(where: { (x: KalCal) -> Bool in x.id == id }) {
            KalCalEdit39View(c: c)
                .modifier(KalPadSide42(pad: pad))
                .id(id)
                .transition(reduce ? AnyTransition.opacity : AnyTransition.move(edge: .trailing))
                .zIndex(62)
        }
        if s.cal39AddOpen {
            KalDim { withAnimation(.easeOut(duration: 0.22)) { s.cal39AddOpen = false } }
                .zIndex(63)
            KalCalAdd39Sheet()
                .frame(maxWidth: pad ? 620 : .infinity)
                .ignoresSafeArea([.container, .keyboard], edges: .bottom)
                .transition(sheetIn)
                .zIndex(64)
        }
        if s.gmap39Open {
            KalDim { withAnimation(.easeOut(duration: 0.22)) { s.gmap39Open = false } }
                .zIndex(65)
            KalGMap39Sheet()
                .frame(maxWidth: pad ? 620 : .infinity)
                .ignoresSafeArea(.container, edges: .bottom)
                .transition(sheetIn)
                .zIndex(66)
        }
    }
}

/// Bakteppet (rgba(27,26,23,.32) / rgba(0,0,0,.55)) over hele skjermen, også statuslinjen.
struct KalDim: View {
    @Environment(\.kal) private var t
    let close: () -> Void

    var body: some View {
        t.dim
            .ignoresSafeArea()
            .contentShape(Rectangle())
            .onTapGesture {
                KalHaptic.tap()
                close()
            }
            .transition(.opacity)
            .accessibilityLabel("Lukk")
            .accessibilityAddTraits(.isButton)
    }
}

struct KalToastView: View {
    @Environment(\.kal) private var t
    let toast: KalToast

    var body: some View {
        HStack(spacing: 12) {
            Text(toast.text).font(KalFont.ui(13, .semibold)).foregroundStyle(t.bg).lineLimit(1)
            if !toast.undoId.isEmpty {
                Button(action: {
                    KalStore.shared.undo(toast.undoId)
                    withAnimation(.easeOut(duration: 0.2)) { KalStore.shared.toast = nil }
                }) {
                    Text("Angre").font(KalFont.ui(12, .bold)).foregroundStyle(t.ink)
                        .padding(.horizontal, 12).frame(height: 28)
                        .background(Capsule().fill(t.bg))
                }
                .buttonStyle(.plain)
                .frame(minHeight: 44)
                .accessibilityLabel("Angre")
            }
        }
        .padding(.leading, 16).padding(.trailing, 10).padding(.vertical, 4)
        .frame(minHeight: 44)
        .background(Capsule().fill(t.ink))
        .shadow(color: Color.black.opacity(0.25), radius: 15, y: 12)
    }
}

/// Prompt 42: Innstillinger og Kalendere glir inn fra høyre som et panel (maks 480 pt) på iPad, ikke over hele skjermen.
struct KalPadSide42: ViewModifier {
    let pad: Bool

    @ViewBuilder func body(content: Content) -> some View {
        if pad {
            content
                .frame(width: 480)
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: 24, bottomLeadingRadius: 24))
                .shadow(color: Color.black.opacity(0.18), radius: 20, x: -12)
                .frame(maxWidth: .infinity, alignment: .trailing)
        } else {
            content
        }
    }
}
