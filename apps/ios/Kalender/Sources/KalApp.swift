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
                    await KalStore.shared.load(force: true)
                }
        }
        .onChange(of: phase) { (_: ScenePhase, p: ScenePhase) in
            let s: KalStore = KalStore.shared
            if p == .active {
                s.bootstrap()
                s.startPolling()
                Task { await s.load(force: true) }
            } else if p == .background {
                s.stopPolling()
                s.saveSnapshot()
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
            for w in ws.windows { w.overrideUserInterfaceStyle = style }
        }
    }
}

struct KalSchemeReader: View {
    @Environment(\.colorScheme) private var cs

    var body: some View {
        KalRoot().environment(\.kal, cs == .dark ? KalTheme.darkTheme : KalTheme.light)
    }
}

struct KalRoot: View {
    @Environment(\.kal) private var t
    @Environment(\.accessibilityReduceMotion) private var reduce
    @MainActor private var s: KalStore { KalStore.shared }

    var body: some View {
        ZStack {
            t.bg.ignoresSafeArea()
            if s.loggedIn {
                main
                overlays
            } else {
                KalLoginView()
            }
        }
        .tint(t.red)
        .animation(sheetAnim, value: s.glimtOpen)
        .animation(sheetAnim, value: s.detId)
        .animation(sheetAnim, value: s.newForm != nil)
        .animation(sheetAnim, value: s.drawerOpen)
        .animation(reduce ? Animation.easeOut(duration: 0.2) : Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28), value: s.settingsOpen)
        .animation(.easeOut(duration: 0.2), value: s.searchOpen)
        .animation(.easeOut(duration: 0.2), value: s.toast)
    }

    /// 0,3 s cubic-bezier(.2,.8,.2,1); med «Reduser bevegelse» bare en kort fade.
    private var sheetAnim: Animation {
        if reduce { return Animation.easeOut(duration: 0.2) }
        return Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.32)
    }

    private var main: some View {
        // Prompt 35 (tastatur): toppfeltet og skrivefeltet har fast høyde og prioritet; bare visningen krymper når tastaturet kommer.
        // Uten minHeight 0 kunne innholdet ikke krympe, VStack-en ble høyere enn skjermen og toppen havnet under statuslinjen
        // mens skrivefeltet havnet bak tastaturet.
        VStack(spacing: 0) {
            KalHeader()
                .fixedSize(horizontal: false, vertical: true)
                .layoutPriority(2)
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
            .frame(minHeight: 0, maxHeight: .infinity)
            .layoutPriority(0)
            KalComposer()
                .fixedSize(horizontal: false, vertical: true)
                .layoutPriority(2)
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
        DragGesture(minimumDistance: 30).onEnded { (v: DragGesture.Value) in
            let dx: CGFloat = v.translation.width
            let dy: CGFloat = v.translation.height
            if v.startLocation.x < 28 && dx > 50 && abs(dx) > abs(dy) {
                KalHaptic.tap()
                withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.3)) { s.drawerOpen = true }
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
        // Prompt 35: Innstillinger glir inn fra høyre over hele skjermen (0,28 s).
        if s.settingsOpen {
            KalSettings35View()
                .transition(reduce ? AnyTransition.opacity : AnyTransition.move(edge: .trailing))
                .zIndex(60)
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
