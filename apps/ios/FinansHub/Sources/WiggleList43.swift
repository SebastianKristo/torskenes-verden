import SwiftUI
import UIKit
import UniformTypeIdentifiers
import os

/* ---------------- Prompt 43: én felles wiggle-liste (Hjem, Finans → Oversikt/Mer, Mat og Sporing) ----------------
 Fasit: prompts/prompt-43-pakke/claude-code-wiggle-ios-virker-ikke.md. Subscription OS (SubHome23 i Subs23.swift) er
 siden der wiggle + scroll virker på iOS, og denne komponenten følger den.

 Den ekte årsaken (sammenlignet med Subscription OS):
 1. Gester. Subscription OS bruker systemets dra-og-slipp (UIDragInteraction via .draggable/.dropDestination) i redigerings-
    modus og INGEN SwiftUI-gester på kortene. UIKit avgjør selv hold = løft og sveip = scroll, og ruller listen nær kantene.
    Hjem/Finans/Mat/Sporing (Drag37Shield i Reorder37.swift) la en `LongPressGesture.sequenced(before: DragGesture(minimumDistance: 0))`
    som `.simultaneousGesture` på et usynlig lag over hvert kort, i tillegg til kortets eget hold (0,5 s). På iOS 18+ er
    SwiftUI-gester egne UIGestureRecognizer-e som konkurrerer med ScrollView-panoreringen: enten tok DragGesture berøringen
    (siden scroller ikke), eller panoreringen kansellerte holdet (kortet løftes aldri). Heuristikken «har siden flyttet seg
    siden fingeren kom ned» (Drag37.mayLift) avviste i tillegg ekte hold når listen fortsatt gled etter et sveip.
 2. Scroll-container. `.scrollDisabled(Drag37.shared.active)` ble slått på MIDT i berøringen (ved løft). Når ScrollView
    bygges om midt i en gest, avbrytes gesten på iOS 18, så kortet falt tilbake med en gang. Subscription OS slår aldri av scroll.
 3. Tilstand. Subscription OS har én `wig`/`editing` for hele siden. Hjem hadde `@State wig` per kort, startet i onAppear.
 4. Animasjon. Begge bruker rotationEffect, men Hjem flyttet kortet med `.offset` + zIndex per finger-punkt (layout per bilde).
 5. Mat: «Dagens middag» og radene i ukeplanen hadde `.contextMenu`. iOS gir holdet til kontekstmenyen før kortets
    hold-gest, så Mat kom aldri i redigeringsmodus fra de kortene (fjernet i MatMobile.swift, menyen er nå en ⋯-knapp).

 Nå: hold 0,5 s = redigering (haptikk), alle kort vugger (én tilstand for siden, av med «Reduser bevegelse»), sveip = scroll,
 hold på et kort i redigering = systemet løfter det (dra-og-slipp), de andre glir unna mens du drar, slipp = lagre én gang.
 «–» skjuler, «Rediger widget» o.l. legges som tilbehør over kortet. Ingen forhåndsvisning som trenger miljøet (krasjen fra
 prompt 37): forhåndsvisningen er en enkel plate med etiketten og faste farger.
 Logg (Konsoll, underlag «papir», kategori «wiggle»): longPress.began, edit.enter, drag.lift, drag.move, drag.drop, save. */

enum Wiggle43 {
    static let log: Logger = Logger(subsystem: "papir", category: "wiggle")
    /// Hold for å starte redigering.
    static let hold: Double = 0.5

    static func sign(_ i: Int) -> Double { i % 2 == 0 ? 1 : -1 }

    /// Rekkefølgen `live` tilpasset de nåværende nøklene (nye legges bakerst, borte tas ut).
    static func reconcile(_ live: [String], _ keys: [String]) -> [String] {
        var out: [String] = live.filter { keys.contains($0) }
        for k in keys where !out.contains(k) { out.append(k) }
        return out
    }

    /// Flytter `src` til plassen til `target` (nedover havner den etter målet, oppover foran).
    static func move(_ order: [String], _ src: String, to target: String) -> [String] {
        guard src != target, let from = order.firstIndex(of: src), let to = order.firstIndex(of: target) else { return order }
        var o: [String] = order
        o.remove(at: from)
        o.insert(src, at: Swift.min(to, o.count))
        return o
    }

    /// Ny full rekkefølge der de synlige plassene får den nye synlige rekkefølgen, og skjulte står der de sto.
    static func merge(_ full: [String], visible: [String]) -> [String] {
        var it: IndexingIterator<[String]> = visible.makeIterator()
        var out: [String] = []
        for k in full {
            if visible.contains(k) { if let n = it.next() { out.append(n) } } else { out.append(k) }
        }
        for k in visible where !out.contains(k) { out.append(k) }
        return out
    }

    /// Haptikk når redigering slås på (Store.enterPaperEdit).
    @MainActor static func enterHaptic() {
        if Haptics.shared.on { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    }
}

/// Hold 0,5 s på et kort (utenfor redigering) slår på redigering. Samtidig gest, så ScrollView fortsatt scroller.
/// I redigering er gesten maskert bort (`including: .subviews`), så den ikke konkurrerer med systemets løft.
struct Wiggle43Hold: ViewModifier {
    let editing: Bool
    let enter: () -> Void

    func body(content: Content) -> some View {
        content.simultaneousGesture(
            LongPressGesture(minimumDuration: Wiggle43.hold, maximumDistance: 8)
                .onChanged { (_: Bool) in Wiggle43.log.debug("longPress.began") }
                .onEnded { (_: Bool) in if !editing { enter() } },
            including: editing ? .subviews : .all
        )
    }
}

/// Slippflate for hele lista, bare aktiv i redigering.
struct Wiggle43DropArea: ViewModifier {
    let active: Bool
    let drop: () -> Bool

    @ViewBuilder func body(content: Content) -> some View {
        if active {
            content.onDrop(of: [UTType.text], isTargeted: nil) { (_: [NSItemProvider]) -> Bool in
                MainActor.assumeIsolated { drop() }
            }
        } else {
            content
        }
    }
}

extension View {
    func wiggle43Hold(editing: Bool, enter: @escaping () -> Void) -> some View {
        modifier(Wiggle43Hold(editing: editing, enter: enter))
    }
}

/// Forhåndsvisningen mens et kort dras: en enkel plate med faste farger (bygges av UIKit uten appens miljø).
struct Wiggle43Plate: View {
    let text: String
    let ink: Color
    let card: Color
    let line: Color

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "line.3.horizontal").font(.system(size: 14, weight: .bold))
            Text(text).font(PF.ui(15, .semibold)).lineLimit(1)
        }
        .foregroundStyle(ink)
        .padding(.horizontal, 18)
        .frame(minWidth: 180, minHeight: 56)
        .background(card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(line, lineWidth: 1))
    }
}

/// Kortene på en side som kan flyttes og skjules i wiggle-modus. Én tilstand per side (`editing` kommer fra siden),
/// stabile id-er (nøkkelen), rotationEffect for vuggingen og systemets dra-og-slipp for flytting.
struct WiggleReorderList<Content: View, Accessory: View>: View {
    @Environment(\.paper) private var p
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Synlige nøkler i lagret rekkefølge.
    let keys: [String]
    let editing: Bool
    let columns: Int
    let spacing: CGFloat
    /// Et redigeringsark er åpent: kortene står stille.
    let paused: Bool
    let label: (String) -> String
    /// Minus («Skjul …») når satt og `canHide` gir true.
    let hide: ((String) -> Void)?
    let canHide: (String) -> Bool
    let enter: () -> Void
    /// Ny synlig rekkefølge etter slipp (eller ✓ hvis slippet havnet utenfor).
    let commit: ([String]) -> Void
    let content: (String) -> Content
    let accessory: (String) -> Accessory

    @State private var live: [String]? = nil
    @State private var dragKey: String? = nil
    @State private var hoverKey: String? = nil
    @State private var wig: Bool = false
    @State private var lastMove: Date = .distantPast

    init(keys: [String], editing: Bool, columns: Int = 1, spacing: CGFloat = 10, paused: Bool = false,
         label: @escaping (String) -> String,
         hide: ((String) -> Void)? = nil,
         canHide: @escaping (String) -> Bool = { (_: String) in true },
         enter: @escaping () -> Void,
         commit: @escaping ([String]) -> Void,
         @ViewBuilder content: @escaping (String) -> Content,
         @ViewBuilder accessory: @escaping (String) -> Accessory) {
        self.keys = keys
        self.editing = editing
        self.columns = columns
        self.spacing = spacing
        self.paused = paused
        self.label = label
        self.hide = hide
        self.canHide = canHide
        self.enter = enter
        self.commit = commit
        self.content = content
        self.accessory = accessory
    }

    private var order: [String] {
        guard editing, let l = live else { return keys }
        return Wiggle43.reconcile(l, keys)
    }

    var body: some View {
        let o: [String] = order
        Group {
            if columns > 1 {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: spacing), count: columns), spacing: spacing) {
                    ForEach(Array(o.enumerated()), id: \.element) { i, k in cell(k, i) }
                }
            } else {
                VStack(spacing: spacing) {
                    ForEach(Array(o.enumerated()), id: \.element) { i, k in
                        cell(k, i)
                            .id("card37-" + k)
                            .transition(.opacity.combined(with: .scale(scale: 0.96)))
                    }
                }
            }
        }
        // Slipp i mellomrommet mellom kortene teller også – bare i redigering (utenfor er lista helt vanlig, så siden scroller).
        .modifier(Wiggle43DropArea(active: editing) { dropHere() })
        .onAppear { startWiggle(editing && !paused) }
        .onChange(of: editing) { (_: Bool, on: Bool) in
            if !on { finish() }
            startWiggle(on && !paused)
        }
        .onChange(of: paused) { (_: Bool, pz: Bool) in if editing { startWiggle(!pz) } }
        // Nye kort (lagt til med ＋) skal også vugge.
        .onChange(of: keys) { (_: [String], _: [String]) in if editing && !paused { startWiggle(true) } }
        .onDisappear { if live != nil { finish() } }
    }

    @ViewBuilder private func cell(_ k: String, _ i: Int) -> some View {
        if editing {
            editCell(k, i)
        } else {
            // Som Subscription OS utenfor redigering: bare kortet og holdet (samtidig gest, så ScrollView scroller).
            content(k).wiggle43Hold(editing: false) { enter() }
        }
    }

    @ViewBuilder private func editCell(_ k: String, _ i: Int) -> some View {
        let a: Double = (reduceMotion || paused) ? 0 : Edit28.angle * Wiggle43.sign(i)
        let ink: Color = p.ink
        let card: Color = p.card
        let line: Color = p.line
        let text: String = label(k)
        content(k)
            // Trykk inne i kortet er av mens du redigerer (som Subscription OS).
            .allowsHitTesting(!editing)
            .overlay {
                if editing {
                    // Det usynlige laget er kilden og målet for systemets dra-og-slipp (ingen SwiftUI-gester).
                    Color.white.opacity(0.001)
                        .contentShape(Rectangle())
                        .onDrag {
                            MainActor.assumeIsolated { beginDrag(k) }
                            return NSItemProvider(object: k as NSString)
                        } preview: {
                            Wiggle43Plate(text: text, ink: ink, card: card, line: line)
                        }
                        .onDrop(of: [UTType.text], isTargeted: hover(k)) { (_: [NSItemProvider]) -> Bool in
                            MainActor.assumeIsolated { dropHere() }
                        }
                        .accessibilityElement()
                        .accessibilityLabel(text)
                        .accessibilityHint("Redigeringsmodus. Bruk handlingene for å flytte.")
                        .accessibilityAction(named: "Flytt opp") { step(k, -1) }
                        .accessibilityAction(named: "Flytt ned") { step(k, 1) }
                }
            }
            .overlay(alignment: .topLeading) {
                if editing, let hide, canHide(k) {
                    // Kort uten innhold (høyde 0, f.eks. sveipet bort) får ikke minus midt på siden.
                    GeometryReader { (g: GeometryProxy) in
                        if g.size.height >= 4 {
                            Edit28Minus(label: "Skjul " + text) {
                                Haptics.shared.tick()
                                Wiggle43.log.debug("hide \(k, privacy: .public)")
                                withAnimation(.easeOut(duration: 0.2)) { hide(k) }
                            }
                            .offset(x: -9, y: -9)
                        }
                    }
                }
            }
            .overlay { if editing { accessory(k) } }
            .rotationEffect(.degrees(editing ? (wig ? a : -a) : 0))
            .animation(editing && a != 0 ? Animation.easeInOut(duration: Edit28.half).repeatForever(autoreverses: true) : Animation.easeOut(duration: 0.15), value: wig)
            .wiggle43Hold(editing: editing) { enter() }
    }

    private func startWiggle(_ on: Bool) {
        wig = false
        if on { DispatchQueue.main.async { wig = true } }
    }

    private func hover(_ k: String) -> Binding<Bool> {
        Binding<Bool>(
            get: { hoverKey == k },
            set: { (on: Bool) in
                if on {
                    hoverKey = k
                    moveLive(to: k)
                } else if hoverKey == k {
                    hoverKey = nil
                }
            }
        )
    }

    /// Slipp på et kort eller i mellomrommet: bare våre egne kort (ikke tekst dratt inn fra andre apper).
    private func dropHere() -> Bool {
        guard editing, dragKey != nil else { return false }
        finish()
        return true
    }

    private func beginDrag(_ k: String) {
        if live == nil { live = keys }
        dragKey = k
        lastMove = .distantPast
        if Haptics.shared.on { UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.7) }
        Wiggle43.log.debug("drag.lift \(k, privacy: .public)")
    }

    /// De andre kortene glir unna mens kortet dras over dem.
    private func moveLive(to target: String) {
        guard let src = dragKey, src != target else { return }
        let now: Date = Date()
        if now.timeIntervalSince(lastMove) < 0.12 { return }
        let cur: [String] = Wiggle43.reconcile(live ?? keys, keys)
        let next: [String] = Wiggle43.move(cur, src, to: target)
        guard next != cur else { return }
        lastMove = now
        if Haptics.shared.on { UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.45) }
        Wiggle43.log.debug("drag.move \(src, privacy: .public) → \(target, privacy: .public)")
        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) { live = next }
    }

    /// VoiceOver: flytt ett hakk opp eller ned og lagre.
    private func step(_ k: String, _ dir: Int) {
        var o: [String] = order
        guard let i = o.firstIndex(of: k) else { return }
        let j: Int = i + dir
        guard j >= 0, j < o.count else { return }
        o.swapAt(i, j)
        live = o
        finish()
    }

    /// Slipp (eller ✓): lagre én gang hvis rekkefølgen er endret.
    private func finish() {
        let o: [String]? = live.map { Wiggle43.reconcile($0, keys) }
        let dk: String = dragKey ?? "-"
        Wiggle43.log.debug("drag.drop \(dk, privacy: .public)")
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            if let o, o != keys {
                let txt: String = o.joined(separator: ",")
                Wiggle43.log.debug("save \(txt, privacy: .public)")
                commit(o)
            }
            live = nil
            dragKey = nil
            hoverKey = nil
        }
    }
}
