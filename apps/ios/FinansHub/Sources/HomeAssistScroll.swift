import SwiftUI
import UIKit
import UIKit.UIGestureRecognizerSubclass

/* ---------------- Prompt 70 (IOSHOME70): scrolle på Hjem mens Glimt svarer ----------------
 Spesifikasjon: prompt-51b-pakke/claude-code-hjem-scroll-mens-ai.md. Fasit: Homelab.dc.html (svarkortet under søkefeltet).
 – Ingen fullskjerm-lag (Assist38Catcher viser bare pillen under). Kortet ligger i innholdet og scroller med siden.
 – Trykk utenfor lukker (ikke scroll): SpatialTapGesture som .simultaneousGesture på Hjem-innholdet. Et trykk feiler av seg
   selv når fingeren flytter seg, så scroll lukker aldri. Lukker bare når trykket er utenfor søkefeltet og kortet, og
   svaret er ferdig. Mens Glimt tenker lukkes kortet bare med ✕.
 – Sveip opp / dra ned gjøres fra grepet nederst i kortet (Assist38Swipe).
 – Svaret strømmer videre selv om kortet er scrollet ut av syne. Blir det ferdig da: lett haptikk og pillen «Glimt svarte ↑»
   nederst over fanelinjen, som scroller opp til søkefeltet (Drag37.scrollTick → PaperPage).
 Prompt 74: SpatialTapGesture alene fyrte også etter en liten scroll (og når et trykk stoppet en scroll som gled), så kortet
   lukket seg. Nå avgjør Touch74 (en UIKit-observatør på vinduet som aldri tar berøringen) om det var et ekte trykk:
   én finger, under 10 pt total bevegelse, kort berøring, og søkefeltet sto stille fra ned til opp (og like før ned).
   Trykket fra SpatialTapGesture brukes bare til stedet, og avgjøres etter at hele berøringen er behandlet. */

@MainActor
@Observable
final class Assist70 {
    static let shared = Assist70()

    /// Pillen «Glimt svarte ↑».
    var pill: Bool = false

    /// Søkefeltet med kortet under (globalt). Endres ved scroll, så det observeres ikke.
    @ObservationIgnored var searchRect: CGRect = .zero
    /// Den synlige flaten (globalt), satt av pillens lag over PaperShell.
    @ObservationIgnored var viewport: CGRect = .zero
    @ObservationIgnored private var hideTask: Task<Void, Never>? = nil
    /// Prompt 74: sist søkefeltet flyttet seg (scroll), i systemtid.
    @ObservationIgnored var movedAt: TimeInterval = 0

    /// Søkefeltets ramme endret seg. Flytter den seg loddrett, scroller siden.
    func track(_ r: CGRect) {
        if abs(r.minY - searchRect.minY) > 0.5 { movedAt = ProcessInfo.processInfo.systemUptime }
        searchRect = r
    }

    /// Trykk et sted på Hjem (globale koordinater). Prompt 74: avgjøres når hele berøringen er ferdig (Touch74).
    func tapped(_ pt: CGPoint) {
        Task { @MainActor in Assist70.shared.decide(pt) }
    }

    private func decide(_ pt: CGPoint) {
        guard Touch74.shared.cleanTap() else { return }
        let a: Assist31 = Assist31.shared
        guard a.homeAnswer != nil, !a.homeBusy else { return }
        if searchRect.insetBy(dx: -4, dy: -4).contains(pt) { return }
        if Assist38.shared.rect.contains(pt) { return }
        Assist38.close()
    }

    /// Svaret ble ferdig (homeBusy true → false med svar). Er kortet ute av syne: haptikk og pillen.
    func answered() {
        guard Assist31.shared.homeAnswer != nil else { return }
        if visible() { return }
        Haptic34.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { pill = true }
        hideTask?.cancel()
        hideTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            if !Task.isCancelled { self.hide() }
        }
    }

    func hide() {
        hideTask?.cancel()
        hideTask = nil
        if pill { withAnimation(.easeOut(duration: 0.2)) { pill = false } }
    }

    /// Scroller opp til søkefeltet (kortet ligger rett under).
    func scrollUp() {
        Haptics.shared.tap()
        let d: Drag37 = Drag37.shared
        d.scrollTarget = "h1"
        d.scrollTop = true
        d.scrollTick += 1
        hide()
    }

    private func visible() -> Bool {
        let r: CGRect = Assist38.shared.rect
        guard r.height > 0 else { return false }
        let vp: CGRect = viewport.height > 0 ? viewport : CGRect(x: 0, y: 0, width: 400, height: 800)
        return r.maxY > vp.minY + 90 && r.minY < vp.maxY - 140
    }
}

/// Trykk utenfor søkefeltet og svarkortet lukker et ferdig svar. Samtidig gest, så kort og knapper virker som før
/// og ScrollView scroller (et trykk er aldri en drag-gest).
struct Assist70Tap: ViewModifier {
    func body(content: Content) -> some View {
        content
            // Prompt 74: observatøren som avgjør om berøringen var et ekte trykk (Touch74, på vinduet).
            .background(Touch74Host().allowsHitTesting(false))
            .contentShape(Rectangle())
            .simultaneousGesture(
                SpatialTapGesture(count: 1, coordinateSpace: .global)
                    .onEnded { (v: SpatialTapGesture.Value) in Assist70.shared.tapped(v.location) }
            )
    }
}

/// Måler søkefeltet (med kortet) globalt, og melder fra når Glimt er ferdig.
struct Assist70Track: ViewModifier {
    @MainActor private var a: Assist31 { Assist31.shared }

    func body(content: Content) -> some View {
        content
            .background {
                GeometryReader { (g: GeometryProxy) in
                    Color.clear
                        .onAppear { Assist70.shared.searchRect = g.frame(in: .global) }
                        .onChange(of: g.frame(in: .global)) { (_: CGRect, r: CGRect) in Assist70.shared.track(r) }
                }
            }
            .onChange(of: a.homeBusy) { (was: Bool, now: Bool) in
                if was && !now { Assist70.shared.answered() }
            }
            .onChange(of: a.homeOpen) { (_: Bool, open: Bool) in
                if !open { Assist70.shared.hide() }
            }
    }
}

/* ---------- Prompt 74: ekte trykk eller scroll? ---------- */

/// Hva siste berøring i vinduet var. Skrives av Touch74Recognizer, leses av Assist70.decide.
@MainActor
final class Touch74 {
    static let shared = Touch74()

    /// Mer bevegelse enn dette (pt, totalt fra ned) er ikke et trykk.
    static let slop: CGFloat = 10
    /// Lengre berøring enn dette (s) er ikke et trykk.
    static let maxTime: TimeInterval = 0.5

    private var start: CGPoint = .zero
    private var t0: TimeInterval = 0
    private var y0: CGFloat = 0
    private var far: Bool = false
    private var scrolled: Bool = false
    private var kb: Bool = false
    private var clean: Bool = false
    private var upAt: TimeInterval = 0

    func down(_ pt: CGPoint, _ t: TimeInterval) {
        start = pt
        t0 = t
        far = false
        clean = false
        let a: Assist70 = Assist70.shared
        y0 = a.searchRect.minY
        // Siden gled fortsatt (trykket stopper en scroll): ikke et trykk.
        scrolled = ProcessInfo.processInfo.systemUptime - a.movedAt < 0.12
        // Tastaturet var oppe: trykket lukker bare tastaturet, ikke Glimt (punkt 3).
        kb = Kb32b.shared.frame.height > 0
    }

    func moved(_ pt: CGPoint) {
        let dx: CGFloat = pt.x - start.x
        let dy: CGFloat = pt.y - start.y
        if dx * dx + dy * dy > Touch74.slop * Touch74.slop { far = true }
    }

    func multi() {
        far = true
    }

    func up(_ pt: CGPoint, _ t: TimeInterval) {
        moved(pt)
        let still: Bool = abs(Assist70.shared.searchRect.minY - y0) < 1
        clean = !far && !scrolled && !kb && still && t - t0 < Touch74.maxTime
        upAt = ProcessInfo.processInfo.systemUptime
    }

    func cancelled() {
        clean = false
        upAt = ProcessInfo.processInfo.systemUptime
    }

    /// Siste berøring var et ekte trykk, og den sluttet nettopp.
    func cleanTap() -> Bool {
        clean && ProcessInfo.processInfo.systemUptime - upAt < 0.4
    }
}

/// Ser alle berøringer i vinduet uten å ta dem: blir aldri gjenkjent (feiler når fingeren slippes), forsinker ingenting
/// og kansellerer ingenting. Navnet har verken «Pan» eller «Drag», så kantgesten venter ikke på den (Nav50Edge.waits).
final class Touch74Recognizer: UIGestureRecognizer {
    override init(target: Any?, action: Selector?) {
        super.init(target: target, action: action)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        guard let t = touches.first else { return }
        if (event.allTouches?.count ?? 1) > 1 {
            Touch74.shared.multi()
            return
        }
        Touch74.shared.down(t.location(in: nil), t.timestamp)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)
        if let t = touches.first { Touch74.shared.moved(t.location(in: nil)) }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesEnded(touches, with: event)
        if let t = touches.first { Touch74.shared.up(t.location(in: nil), t.timestamp) }
        state = .failed
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesCancelled(touches, with: event)
        Touch74.shared.cancelled()
        state = .failed
    }
}

/// Legger Touch74Recognizer på vinduet (én gang per vindu), som EdgePanHost i Nav23Swipe.swift.
struct Touch74Host: UIViewRepresentable {
    func makeUIView(context: Context) -> Touch74HostView {
        let v: Touch74HostView = Touch74HostView()
        v.isUserInteractionEnabled = false
        v.backgroundColor = .clear
        return v
    }

    func updateUIView(_ v: Touch74HostView, context: Context) {}
}

final class Touch74HostView: UIView {
    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard let w = window else { return }
        Kb32b.shared.start()
        if w.gestureRecognizers?.contains(where: { (g: UIGestureRecognizer) -> Bool in g is Touch74Recognizer }) == true { return }
        w.addGestureRecognizer(Touch74Recognizer(target: nil, action: nil))
    }
}

extension View {
    func assist70Tap() -> some View { modifier(Assist70Tap()) }
    func assist70Track() -> some View { modifier(Assist70Track()) }
}

/// «Glimt svarte ↑» nederst over fanelinjen. Ligger over PaperShell (via Assist38Catcher), uten lag over resten.
struct Assist70Pill: View {
    @Environment(Store.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    @MainActor private var m: Assist70 { Assist70.shared }

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            Color.clear
                .allowsHitTesting(false)
                .onAppear { Assist70.shared.viewport = g.frame(in: .global) }
                .onChange(of: g.size) { (_: CGSize, _: CGSize) in Assist70.shared.viewport = g.frame(in: .global) }
        }
        .allowsHitTesting(false)
        .overlay(alignment: .bottom) {
            if m.pill && store.paperTab == "hjem" {
                pillButton
                    .padding(.bottom, 62 + 22)
                    // Prompt 71: «Reduser bevegelse» gir bare fade.
                    .transition(reduce ? AnyTransition.opacity : AnyTransition.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    private var pillButton: some View {
        Button { m.scrollUp() } label: {
            HStack(spacing: 8) {
                Glimt31Mark(size: 18, state: .done, dark: true)
                Text("Glimt svarte ↑").font(PF.ui(13.5, .bold)).foregroundStyle(Color(hex: "#f6f2ea")).lineLimit(1)
            }
            .padding(.leading, 10).padding(.trailing, 16)
            .frame(height: 40)
            .background(Color(hex: "#161412").opacity(0.9), in: Capsule())
            .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1))
            .shadow(color: Color.black.opacity(0.35), radius: 14, y: 8)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Glimt svarte. Vis svaret")
    }
}
