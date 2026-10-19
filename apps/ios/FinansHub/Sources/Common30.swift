import SwiftUI
import UIKit

/* ---------------- Prompt 30: felles knapper, ark, haptikk ved lukking, kantsveip og logoer ---------------- */
// Fasit: design/Mobil Papir App.dc.html, Abonnement Legg til ark.dc.html, Subscription OS.dc.html, Vaer.dc.html og
// prompts/prompt-30-pakke/claude-code-felles-knapper-ark.md, claude-code-vaer-haptikk.md, claude-code-tilbake-swipe-ios.md.

/* ---------- Haptikk ved lukking (én sentral funksjon) ---------- */

enum Haptic30 {
    nonisolated(unsafe) private static var last: Date = .distantPast

    /// Ett lett «tikk». To kall innen 250 ms (knapp + onDismiss) gir bare ett tikk.
    static func light() {
        let h: Haptics = Haptics.shared
        guard h.on, h.taps else { return }
        let now: Date = Date()
        if now.timeIntervalSince(last) < 0.25 { return }
        last = now
        onMain { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    }

    /// Kort tikk på 8–12 ms (skjul/vis, valg).
    static func soft() {
        let h: Haptics = Haptics.shared
        guard h.on, h.taps else { return }
        onMain { UIImpactFeedbackGenerator(style: .soft).impactOccurred() }
    }

    /// To korte tikk (oppdatering ferdig).
    static func double() {
        let h: Haptics = Haptics.shared
        guard h.on, h.done else { return }
        onMain { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.14) {
            MainActor.assumeIsolated { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        }
    }

    private static func onMain(_ f: @escaping @MainActor () -> Void) {
        if Thread.isMainThread { MainActor.assumeIsolated { f() } } else { Task { @MainActor in f() } }
    }
}

/// Lett haptikk når noe som var åpent lukkes (ark, fullskjerm, popup). Ikke ved åpning.
struct DismissHaptic30: ViewModifier {
    let open: Bool

    func body(content: Content) -> some View {
        content.onChange(of: open) { (old: Bool, new: Bool) in
            if old && !new { Haptic30.light() }
        }
    }
}

extension View {
    func dismissHaptic30(_ open: Bool) -> some View {
        modifier(DismissHaptic30(open: open))
    }
}

/* ---------- SheetButton30: Ferdig · Lukk/Avbryt · ‹ Tilbake ---------- */

/// Pille 36 pt (radius 18, padding 0 16, 700 14). Primary = ink-bakgrunn og bg-tekst, secondary = ink 8 % (mørk: hvit 10 %),
/// back = som secondary med chevron (padding 0 16 0 10). På mørke flater (Vær, Subscription OS) er primary hvit med mørk tekst.
/// Treffflaten er minst 44 × 44.
struct SheetButton30: View {
    @Environment(\.paper) private var p
    enum Kind { case primary, secondary, back }

    let kind: Kind
    let title: String
    var dark: Bool = false
    /// Egne farger for flater med eget tema (Subscription OS): tekstfarge og bakgrunnsfarge.
    var ink: Color? = nil
    var paper: Color? = nil
    let action: () -> Void

    init(kind: Kind, title: String, dark: Bool = false, action: @escaping () -> Void) {
        self.kind = kind
        self.title = title
        self.dark = dark
        self.action = action
    }

    init(kind: Kind, title: String, ink: Color, paper: Color, dark: Bool, action: @escaping () -> Void) {
        self.kind = kind
        self.title = title
        self.dark = dark
        self.ink = ink
        self.paper = paper
        self.action = action
    }

    var body: some View {
        Button {
            Haptic30.light()
            action()
        } label: {
            label
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }

    private var label: some View {
        HStack(spacing: 4) {
            if kind == .back {
                Image(systemName: "chevron.left").font(.system(size: 14, weight: .bold))
            }
            Text(title).font(font).lineLimit(1)
        }
        .foregroundStyle(fg)
        .padding(.leading, kind == .back ? 10 : 16)
        .padding(.trailing, 16)
        .frame(height: 36)
        .background(bg, in: Capsule())
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
    }

    private var font: Font {
        if dark && ink == nil { return .system(size: 14, weight: .bold) }
        return PF.ui(14, .bold)
    }

    private var isDark: Bool { dark || p.dark }

    private var fg: Color {
        if let ink, let paper { return kind == .primary ? paper : ink }
        if kind == .primary {
            if dark { return Color(hex: "#17191e") }
            return p.bg
        }
        return dark ? Color.white : p.ink
    }

    private var bg: Color {
        if let ink, paper != nil {
            if kind == .primary { return ink }
            return dark ? Color.white.opacity(0.1) : ink.opacity(0.08)
        }
        if kind == .primary {
            if dark { return Color.white }
            return p.ink
        }
        if isDark { return Color.white.opacity(0.1) }
        return Color(red: 27.0 / 255.0, green: 26.0 / 255.0, blue: 23.0 / 255.0).opacity(0.08)
    }
}

/// Topplinje i et ark: valgfri Tilbake til venstre, tittel, Ferdig/Lukk til høyre (vertikalt sentrert).
struct SheetHeader30: View {
    @Environment(\.paper) private var p
    let title: String
    var back: (() -> Void)? = nil
    var closeTitle: String = "Ferdig"
    var closeKind: SheetButton30.Kind = .primary
    let close: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            if let back {
                SheetButton30(kind: .back, title: "Tilbake", action: back)
            }
            Text(title).font(PF.serif(24, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 6)
            SheetButton30(kind: closeKind, title: closeTitle, action: close)
        }
    }
}

extension View {
    /// Ark kant i kant med bunnen: bare avrunding øverst (28), bakgrunnen fortsetter under hjem-indikatoren.
    func sheetEdge30(_ bg: Color) -> some View {
        self
            .presentationCornerRadius(28)
            .presentationBackground(bg)
    }
}

/* ---------- Kantsveip tilbake (fullskjerm og egne sider) ---------- */

/// 28 pt kantsone til venstre (startpunktet i skjermkoordinater). Siden følger fingeren; slipp etter min(110, 28 % av bredden) → lukk (260 ms) med lett haptikk.
/// Låser til vannrett når |dx| > 1,2·|dy|. Brukes på fullScreenCover og sider med egen navigasjon.
struct EdgeSwipeClose30: ViewModifier {
    let enabled: Bool
    let close: () -> Void
    @State private var dx: CGFloat = 0
    @State private var width: CGFloat = 390
    @State private var locked: Int = 0

    func body(content: Content) -> some View {
        content
            .offset(x: dx)
            .shadow(color: Color.black.opacity(dx > 0 ? 0.25 : 0), radius: 16, x: -6, y: 0)
            .background(GeometryReader { (g: GeometryProxy) in
                Color.clear
                    .onAppear { width = g.size.width }
                    .onChange(of: g.size.width) { _, v in width = v }
            })
            // Samtidig gest (ikke et lag over kanten), så knapper ved venstre kant fortsatt kan trykkes.
            .simultaneousGesture(drag, including: enabled ? .all : .subviews)
    }

    private var threshold: CGFloat { Swift.min(110, width * 0.28) }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 8, coordinateSpace: .global)
            .onChanged { (v: DragGesture.Value) in changed(v) }
            .onEnded { (v: DragGesture.Value) in ended(v) }
    }

    private func changed(_ v: DragGesture.Value) {
        let x: CGFloat = v.translation.width
        let y: CGFloat = v.translation.height
        if locked == 0 {
            // Bare fra kantsonen (28 pt) og vannrett mot høyre.
            let fromEdge: Bool = v.startLocation.x <= 28
            locked = (fromEdge && x > 0 && abs(x) > 1.2 * abs(y)) ? 1 : -1
        }
        if locked == 1 { dx = Swift.max(0, x) }
    }

    private func ended(_ v: DragGesture.Value) {
        let wasLocked: Bool = locked == 1
        locked = 0
        guard wasLocked else { return }
        let x: CGFloat = Swift.max(v.translation.width, v.predictedEndTranslation.width * 0.5)
        if x > threshold {
            withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.26)) { dx = width }
            Haptic30.light()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.24) {
                close()
                var t: Transaction = Transaction()
                t.disablesAnimations = true
                withTransaction(t) { dx = 0 }
            }
        } else {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { dx = 0 }
        }
    }
}

extension View {
    func edgeSwipeClose30(enabled: Bool = true, _ close: @escaping () -> Void) -> some View {
        modifier(EdgeSwipeClose30(enabled: enabled, close: close))
    }
}

/* ---------- Logoer (Yr og Storm) ---------- */

/// Rund logo fra Assets (YrLogo / StormLogo). Ingen hvit kant eller bakgrunn – logoen fyller sirkelen.
struct WxLogo30: View {
    let asset: String
    let size: CGFloat

    var body: some View {
        Image(asset)
            .resizable()
            .interpolation(.high)
            .scaledToFill()
            .frame(width: size, height: size)
            .clipShape(Circle())
            .accessibilityHidden(true)
    }
}

/// «[logo] YR» i tabellhodet (18 pt logo).
struct WxLogoLabel30: View {
    let asset: String
    let text: String
    let color: Color

    var body: some View {
        HStack(spacing: 6) {
            WxLogo30(asset: asset, size: 18)
            Text(text).foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/* ---------- Vær: to flytende glassknapper ---------- */

/// Kart (venstre) og Steder ☰ (høyre), 52 × 52, glass rgba(10,20,35,.34) + blur, kant hvit 22 %, 18 pt fra sidene og
/// 6 pt over hjem-indikatoren. Ingen linje eller bakgrunn mellom dem; bare knappene tar imot trykk.
struct WxBottomButtons30: View {
    let map: () -> Void
    let places: () -> Void

    /// Plassen innholdet må holde fri nederst (52 + 6 + litt luft).
    static let height: CGFloat = 64

    /// Prompt 35 (claude-code-vaer-web.md → iOS): knappene står helt nede i hjørnene, på høyde med hjemstreken.
    /// Før la vi safe area to ganger (GeometryReader-ens bunn-inset + 6 pt), så de havnet ca. 40 pt for høyt.
    /// Nå: bunnen av skjermen + max(10, safe-area-inset − 22) ≈ 12 pt over bunnen med hjemstrek, 10 pt uten (som fasiten).
    var body: some View {
        // Hjemstreken leses fra vinduet (samme som Cal32b), så foreldrenes safe area ikke kan legge den til én gang til.
        let sb: CGFloat = Cal32b.bottomInset
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            HStack(spacing: 10) {
                WxGlassButton30(icon: "map", stroke: 2, label: "Værkart", action: map)
                Spacer(minLength: 0)
                WxGlassButton30(icon: "menu", stroke: 2.2, label: "Steder og søk", action: places)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, Swift.max(10, sb - 22))
        }
        .ignoresSafeArea(.container, edges: .bottom)
        .ignoresSafeArea(.keyboard)
    }
}

struct WxGlassButton30: View {
    let icon: String
    let stroke: CGFloat
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Glyph22Icon(name: icon, size: 24, color: .white, stroke: stroke)
                .frame(width: 52, height: 52)
                .background(.ultraThinMaterial, in: Circle())
                .background(Color(hex: "#0a1423").opacity(0.34), in: Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.22), lineWidth: 1))
                .clipShape(Circle())
                .shadow(color: Color.black.opacity(0.45), radius: 12, x: 0, y: 8)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
