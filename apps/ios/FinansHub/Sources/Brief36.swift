import SwiftUI
import UIKit

/* ---------------- Prompt 36: Glimt-brief – fast bredde, nøyaktig ring, sveip bort kortet på Hjem og «Now Brief» i Mer ----------------
   Fasit: design/Glimt Brief.dc.html (ringen: outline 2,5 px #b23a2a, offset 4 → 8 → 4 px på 1,3 s, fargen 100 % ↔ 45 %) og
   Mobil Papir App.dc.html → bsVals() (sveip mot høyre, terskel 38 % eller rask flikk, «Sveip for å skjule», grønt over terskel,
   flyr ut 0,34 s, høyden kollapser, toast med Angre i 4,5 s, hint de 2 første gangene: 72 px og 40 px fram og tilbake).
   prompts/prompt-36-pakke/claude-code-glimt-brief.md. Skjult lagres per dag og periode (morgen/dag/kveld/natt) og kommer
   tilbake av seg selv med neste brief. */

/* ---------- Ringen ---------- */

/// Ring som følger kortets hjørner nøyaktig: radius = kortradius + offset, padding(−offset). Starter etter 350 ms (scrollen ferdig).
struct Brief36Ring: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let radius: CGFloat
    @State private var shown: Bool = false
    @State private var t0: Date = Date()

    var body: some View {
        ZStack {
            if shown {
                if reduce {
                    ring(5, 1)
                } else {
                    TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { (ctx: TimelineViewDefaultContext) in
                        let p: Double = G36Anim.loop(ctx.date.timeIntervalSince(t0), 1.3)
                        let k: Double = G36Anim.kf(p, [(0, 0), (0.5, 1), (1, 0)])
                        ring(CGFloat(4 + 4 * k), 1 - 0.55 * k)
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            t0 = Date()
            withAnimation(.easeOut(duration: 0.2)) { shown = true }
        }
    }

    private func ring(_ off: CGFloat, _ alpha: Double) -> some View {
        RoundedRectangle(cornerRadius: radius + off, style: .continuous)
            .stroke(Color(hex: "#b23a2a").opacity(alpha), lineWidth: 2.5)
            .padding(-off)
    }
}

extension View {
    /// Erstatter brief34Ring på brief-siden (prompt 36).
    func brief36Ring(_ on: Bool, radius: CGFloat = 24) -> some View {
        overlay { if on { Brief36Ring(radius: radius) } }
    }
}

/* ---------- Skjul på Hjem ---------- */

@MainActor
@Observable
final class Brief36Model {
    static let shared = Brief36Model()

    var hiddenKey: String = UserDefaults.standard.string(forKey: Brief36Model.hideKey) ?? ""
    var toast: Bool = false
    @ObservationIgnored private var toastTask: Task<Void, Never>? = nil

    private static var hideKey: String { AcctScope.key("glimt_brief_hide") }
    private static var hintKey: String { AcctScope.key("glimt_brief_swhint") }

    /// «Sat Oct 19 2026|kveld»
    static func periodKey(_ d: Date = Date()) -> String {
        let h: Int = Calendar.current.component(.hour, from: d)
        let per: String = h < 11 ? "morgen" : (h < 17 ? "dag" : (h < 21 ? "kveld" : "natt"))
        return JS.fmt(d, "yyyy-MM-dd") + "|" + per
    }

    /// «kveldsbriefen kl. 17»
    static var nextText: String {
        let h: Int = Calendar.current.component(.hour, from: Date())
        if h < 11 { return "dagsbriefen kl. 11" }
        if h < 17 { return "kveldsbriefen kl. 17" }
        if h < 21 { return "nattbriefen kl. 21" }
        return "morgenbriefen kl. 07"
    }

    var hiddenNow: Bool { hiddenKey == Brief36Model.periodKey() }

    func hide() {
        let k: String = Brief36Model.periodKey()
        UserDefaults.standard.set(k, forKey: Brief36Model.hideKey)
        withAnimation(.smooth(duration: 0.3)) { hiddenKey = k }
        toast = true
        toastTask?.cancel()
        toastTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 4_500_000_000)
            if Task.isCancelled { return }
            withAnimation(.easeOut(duration: 0.25)) { Brief36Model.shared.toast = false }
        }
    }

    func undo() {
        Haptics.shared.tap()
        toastTask?.cancel()
        UserDefaults.standard.removeObject(forKey: Brief36Model.hideKey)
        withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
            hiddenKey = ""
            toast = false
        }
    }

    /// Hintet vises de 2 første gangene Hjem åpnes.
    func takeHint() -> Bool {
        let n: Int = UserDefaults.standard.integer(forKey: Brief36Model.hintKey)
        if n >= 2 { return false }
        UserDefaults.standard.set(n + 1, forKey: Brief36Model.hintKey)
        return true
    }

    /// Undertekst på «Now Brief» i Mer.
    var merSub: String { hiddenNow ? "Skjult på Hjem · trykk for å åpne" : "Glimt oppsummerer dagen" }
}

/// Hjem-kortet (h12) som kan sveipes bort mot høyre.
struct Brief36SwipeCard: View {
    @MainActor private var m: Brief36Model { Brief36Model.shared }

    var body: some View {
        VStack(spacing: 0) {
            if !m.hiddenNow {
                Brief36Swiper()
                    .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.96, anchor: .top)),
                                            removal: .move(edge: .trailing).combined(with: .opacity)))
            }
            if m.toast {
                Brief36Toast()
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
    }
}

struct Brief36Swiper: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    @MainActor private var m: Brief36Model { Brief36Model.shared }
    @State private var dx: CGFloat = 0
    @State private var lock: Int = 0
    @State private var dragging: Bool = false
    @State private var out: Bool = false
    @State private var width: CGFloat = 360
    @State private var hint: Bool = false
    @State private var over: Bool = false
    @State private var lastVel: CGFloat = 0
    /// Prompt 40: nullstilles også når gesten avbrytes (scroll tar over), så `Swipe40Gate` alltid slippes.
    @GestureState private var touching: Bool = false

    var body: some View {
        let p: CGFloat = Swift.min(1, dx / Swift.max(1, width * 0.38))
        Brief34HomeCard()
            .offset(x: out ? width * 1.15 : dx)
            .rotationEffect(.degrees(out ? 7 : Double(dx / Swift.max(1, width) * 5)), anchor: .center)
            .background {
                // Ligger fast bak kortet (offset flytter bare kortet).
                Brief36Reveal(progress: p, out: out, hint: hint && dx < 4)
                    .opacity(dx > 4 || out || hint ? Double(Swift.min(1, hint ? 1 : 0.35 + p)) : 0)
            }
        .background {
            GeometryReader { (g: GeometryProxy) in
                Color.clear.onAppear { width = g.size.width }
                    .onChange(of: g.size.width) { (_: CGFloat, w: CGFloat) in width = w }
            }
        }
        .simultaneousGesture(drag)
        .onChange(of: touching) { (_: Bool, on: Bool) in if !on { Swipe40Gate.ended() } }
        // Prompt 39: ingen automatisk sveipe-hint (kortet som dyttet seg mot høyre) – aldri, heller ikke ved første oppstart.
        .accessibilityAction(named: "Skjul briefen til neste brief") { dismiss() }
    }

    private var drag: some Gesture {
        // Prompt 40: 6 pt (samme terskel som trykk/bevegelse); all bevegelse merkes i Swipe40Gate.
        DragGesture(minimumDistance: 6, coordinateSpace: .local)
            .updating($touching) { (_: DragGesture.Value, st: inout Bool, _: inout Transaction) in st = true }
            .onChanged { (v: DragGesture.Value) in
                Swipe40Gate.track(v.translation)
                if out { return }
                if hint { stopHint() }
                let tx: CGFloat = v.translation.width
                let ty: CGFloat = v.translation.height
                if lock == 0 && (abs(tx) > 8 || abs(ty) > 8) {
                    lock = (abs(tx) > abs(ty) * 1.2 && tx > 0) ? 1 : 2
                }
                if lock != 1 { return }
                dragging = true
                // Prompt 39: gummistrikk mot venstre, ingen implisitt animasjon under drag (følger fingeren 1:1).
                let nv: CGFloat = Swipe39.rubber(tx)
                let isOver: Bool = nv >= width * 0.38
                if isOver && !over { Haptics.shared.select() }
                over = isOver
                var tr: Transaction = Transaction()
                tr.disablesAnimations = true
                withTransaction(tr) { dx = nv }
            }
            .onEnded { (v: DragGesture.Value) in
                Swipe40Gate.ended()
                let wasX: Bool = lock == 1
                lock = 0
                if !wasX || out { dragging = false; return }
                let vel: CGFloat = v.velocity.width
                lastVel = vel
                if Swipe39.passes(dx: dx, width: width, velocity: vel) {
                    dismiss()
                } else {
                    withAnimation(Swipe39.springBack) { dx = 0 }
                    over = false
                    Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 80_000_000)
                        dragging = false
                    }
                }
            }
    }

    private func dismiss() {
        Haptic30.double()
        // Prompt 39: fly ut fra nåværende posisjon, varighet etter farten (0,17–0,32 s), hold 260 ms, kollaps mykt.
        let d: Double = reduce ? 0.2 : Swipe39.flyDuration(dx: dx, width: width, velocity: lastVel)
        withAnimation(Swipe39.flyCurve(d)) { out = true }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64((d + 0.26) * 1_000_000_000))
            Brief36Model.shared.hide()
            dragging = false
        }
    }

    private func stopHint() {
        hint = false
        withAnimation(.easeOut(duration: 0.15)) { dx = 0 }
    }
}

/// Det mørke feltet bak kortet: ✓ «Sveip for å skjule» → grønt «Slipp for å skjule» → «Brief skjult».
struct Brief36Reveal: View {
    let progress: CGFloat
    let out: Bool
    let hint: Bool

    var body: some View {
        let full: Bool = progress >= 1 || out
        HStack(spacing: 12) {
            Image(systemName: "checkmark").font(.system(size: 16, weight: .heavy)).foregroundStyle(Color.white)
                .frame(width: 36, height: 36)
                .background(Color.white.opacity(0.16), in: Circle())
                .scaleEffect(full ? 1.15 : 0.7 + progress * 0.3)
                .animation(.spring(response: 0.3, dampingFraction: 0.5), value: full)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(PF.ui(14.5, .bold)).foregroundStyle(Color.white)
                Text("Kommer tilbake med " + Brief36Model.nextText).font(PF.ui(12)).foregroundStyle(Color.white.opacity(0.75))
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(full ? Color(hex: "#2f7a4f") : Color(hex: "#1b1a17"), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .animation(.easeOut(duration: 0.18), value: full)
        .accessibilityHidden(true)
    }

    private var title: String {
        if out { return "Brief skjult" }
        if progress >= 1 { return "Slipp for å skjule" }
        if hint { return "Sveip → for å skjule" }
        return "Sveip for å skjule"
    }
}

/// «Brief skjult til kveldsbriefen kl. 17» + Angre (4,5 s).
struct Brief36Toast: View {
    @MainActor private var m: Brief36Model { Brief36Model.shared }

    var body: some View {
        HStack(spacing: 10) {
            Text("Brief skjult til " + Brief36Model.nextText).font(PF.ui(13.5, .semibold)).foregroundStyle(Color(hex: "#f6f2ea"))
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button { m.undo() } label: {
                Text("Angre").font(PF.ui(13.5, .heavy)).foregroundStyle(Color(hex: "#ffb38a"))
                    .padding(.horizontal, 12).frame(minHeight: 36).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 16).padding(.trailing, 6).padding(.vertical, 6)
        .background(Color(hex: "#1b1a17").opacity(0.92), in: Capsule())
        .shadow(color: Color.black.opacity(0.3), radius: 12, y: 8)
    }
}
