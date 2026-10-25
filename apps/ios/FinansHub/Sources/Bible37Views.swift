import SwiftUI
import UIKit

/* ---------------- Prompt 37: Dagens bibelvers – Hjem-kortet (h13), arket og brief-kortet ---------------- */
// Fasit: design/Bibelvers.dc.html (mode=home og mode=brief) og claude-code-bibelvers.md.

/// Farger for morgen (fersken) og kveld (indigo med gyllen glød).
struct BibleTone37 {
    let morning: Bool
    var from: Color { morning ? Color(hex: "#fbe9d6") : Color(hex: "#1f2b4a") }
    var to: Color { morning ? Color(hex: "#f6d6b8") : Color(hex: "#2b2350") }
    var fg: Color { morning ? Color(hex: "#3b2a1a") : Color(hex: "#f3efe6") }
    var lab: Color { morning ? Color(hex: "#b23a2a") : Color(hex: "#ffd9c2") }
    var mut: Color { morning ? Color(hex: "#8a6a4a") : Color(hex: "#f3efe6").opacity(0.6) }
    var chip: Color { morning ? Color(hex: "#3b2a1a").opacity(0.08) : Color.white.opacity(0.12) }
    var glow: Color { morning ? Color(red: 1, green: 0.78, blue: 0.47).opacity(0.55) : Color(red: 1, green: 0.9, blue: 0.66).opacity(0.25) }

    func background(_ radius: CGFloat) -> some View {
        // Prompt 39: gløden ligger i et overlay, så den faste 220 × 220-rammen aldri gjør bakgrunnen større enn kortet
        // (før stakk bakgrunnen ut over og under lave kort: overlapp med hero og ingen luft mellom kortene).
        LinearGradient(colors: [from, to], startPoint: .topLeading, endPoint: .bottomTrailing)
            .overlay(alignment: .topTrailing) {
                RadialGradient(colors: [glow, .clear], center: .center, startRadius: 0, endRadius: 110)
                    .frame(width: 220, height: 220)
                    .offset(x: 70, y: -90)
                    .allowsHitTesting(false)
            }
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/* ---------- Hjem (h13) ---------- */

/// «DAGENS BIBELVERS» i papir-temaet. Sveip mot høyre skjuler det resten av dagen (→ nederst i briefen).
struct Bible37HomeCard: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase
    @MainActor private var m: Bible37Model { Bible37Model.shared }
    @State private var timer: Task<Void, Never>? = nil

    var body: some View {
        VStack(spacing: 0) {
            if m.enabled {
                Swipe37Card(hint: "Nederst i briefen resten av dagen", done: "Flyttet til briefen", onTap: { open() }, onDismiss: { m.setHomeGone() }) {
                    Bible37HomeFace(v: m.current)
                }
            }
        }
        .onAppear { startTimer() }
        .onDisappear { stopTimer() }
        .onChange(of: phase) { (_: ScenePhase, ph: ScenePhase) in
            if ph == .active { startTimer() } else { stopTimer() }
        }
        .task { await m.load(store) }
    }

    private func open() {
        Haptics.shared.tap()
        m.sheetOpen = true
    }

    private func startTimer() {
        stopTimer()
        if !m.enabled || m.hiddenOnHome { return }
        let ns: UInt64 = m.readNanos
        timer = Task { @MainActor in
            try? await Task.sleep(nanoseconds: ns)
            if Task.isCancelled { return }
            Bible37Model.shared.setHomeRead()
        }
    }

    private func stopTimer() {
        timer?.cancel()
        timer = nil
    }
}

struct Bible37HomeFace: View {
    @Environment(\.paper) private var p
    let v: Verse37

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Text("DAGENS BIBELVERS").font(PF.mono(10.5)).tracking(1.4).foregroundStyle(p.lab)
                Spacer(minLength: 6)
                Text(v.ref).font(PF.mono(11, bold: false)).foregroundStyle(p.mut).lineLimit(1)
            }
            Text("«" + v.text + "»").font(PF.italic(19)).foregroundStyle(p.ink).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 18).padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Dagens bibelvers, " + v.ref + ": " + v.text)
        .accessibilityHint("Trykk for å lese hele. Sveip mot høyre for å skjule.")
    }
}

/// Kort som kan sveipes bort mot høyre (samme gest og animasjon som brief-kortet, Brief36).
struct Swipe37Card<C: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let hint: String
    let done: String
    let onTap: () -> Void
    let onDismiss: () -> Void
    @ViewBuilder let content: () -> C
    @State private var dx: CGFloat = 0
    @State private var lock: Int = 0
    @State private var out: Bool = false
    @State private var over: Bool = false
    @State private var width: CGFloat = 360
    @State private var movedAt: Date = .distantPast
    @State private var lastVel: CGFloat = 0
    @GestureState private var touching: Bool = false

    var body: some View {
        let prog: CGFloat = Swift.min(1, dx / Swift.max(1, width * 0.38))
        content()
            .offset(x: out ? width * 1.15 : dx)
            .rotationEffect(.degrees(out ? 6 : Double(dx / Swift.max(1, width) * 4)), anchor: .center)
            .background {
                Swipe37Reveal(progress: prog, out: out, hint: hint, done: done)
                    .opacity(dx > 4 || out ? Double(Swift.min(1, 0.35 + prog)) : 0)
            }
            .background {
                GeometryReader { (g: GeometryProxy) in
                    Color.clear.onAppear { width = g.size.width }
                        .onChange(of: g.size.width) { (_: CGFloat, w: CGFloat) in width = w }
                }
            }
            .onTapGesture {
                // Klikk rett etter et sveip ignoreres.
                // Prompt 40: også når fingeren holdt stille før slipp eller sveipet ble låst som vertikalt.
                if Date().timeIntervalSince(movedAt) < 0.5 || out || Swipe40Gate.moved { return }
                onTap()
            }
            // Prompt 42: bare vannrette drag fanges; loddrett drag scroller Hjem (Swipe42.swift).
            .hSwipe42(drag, changed: { (t: CGSize) in changed(t, forceX: true) }, ended: { (vel: CGFloat) in ended(vel) })
            .onChange(of: touching) { (_: Bool, on: Bool) in if !on { Swipe40Gate.ended() } }
            .accessibilityAction(named: "Skjul resten av dagen") { dismiss() }
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 12, coordinateSpace: .local)
            .updating($touching) { (_: DragGesture.Value, st: inout Bool, _: inout Transaction) in st = true }
            .onChanged { (v: DragGesture.Value) in changed(v.translation, forceX: false) }
            .onEnded { (v: DragGesture.Value) in ended(v.velocity.width) }
    }

    /// forceX: UIKit-pannen (iOS 18+) starter bare ved vannrett drag, så retningen er allerede låst.
    private func changed(_ t: CGSize, forceX: Bool) {
                Swipe40Gate.track(t)
                if out { return }
                let tx: CGFloat = t.width
                let ty: CGFloat = t.height
                if lock == 0 && (forceX || abs(tx) > 8 || abs(ty) > 8) {
                    lock = (forceX || (abs(tx) > abs(ty) * 1.15 && tx > 0)) ? 1 : 2
                }
                if lock != 1 { return }
                movedAt = Date()
                // Prompt 39: gummistrikk mot venstre og ingen implisitt animasjon under drag.
                let nv: CGFloat = Swipe39.rubber(tx)
                let isOver: Bool = nv >= width * 0.38
                if isOver && !over { Haptics.shared.select() }
                over = isOver
                var tr: Transaction = Transaction()
                tr.disablesAnimations = true
                withTransaction(tr) { dx = nv }
    }

    private func ended(_ vel: CGFloat) {
                Swipe40Gate.ended()
                let wasX: Bool = lock == 1
                lock = 0
                if !wasX || out { return }
                movedAt = Date()
                lastVel = vel
                if Swipe39.passes(dx: dx, width: width, velocity: vel) {
                    dismiss()
                } else {
                    withAnimation(Swipe39.springBack) { dx = 0 }
                    over = false
                }
    }

    private func dismiss() {
        Haptic30.double()
        // Prompt 39: fly ut etter farten, hold 260 ms så «Flyttet til briefen» rekker å vises, så kollaps mykt.
        let d: Double = reduce ? 0.2 : Swipe39.flyDuration(dx: dx, width: width, velocity: lastVel)
        withAnimation(Swipe39.flyCurve(d)) { out = true }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64((d + 0.26) * 1_000_000_000))
            withAnimation(.smooth(duration: 0.3)) { onDismiss() }
            // Nullstill først etter kollapsen, så kortet aldri blinker tilbake.
            try? await Task.sleep(nanoseconds: 340_000_000)
            var tr: Transaction = Transaction()
            tr.disablesAnimations = true
            withTransaction(tr) {
                dx = 0
                out = false
                over = false
            }
        }
    }
}

/// Feltet bak kortet: mørkt «Sveip for å skjule» → grønt «Slipp for å skjule» → «Flyttet til briefen».
struct Swipe37Reveal: View {
    let progress: CGFloat
    let out: Bool
    let hint: String
    let done: String

    var body: some View {
        let full: Bool = progress >= 1 || out
        HStack(spacing: 12) {
            Image(systemName: "checkmark").font(.dyn51(size: 16, weight: .heavy)).foregroundStyle(Color.white)
                .frame(width: 36, height: 36)
                .background(Color.white.opacity(0.16), in: Circle())
                .scaleEffect(full ? 1.15 : 0.7 + progress * 0.3)
                .animation(.spring(response: 0.3, dampingFraction: 0.5), value: full)
            VStack(alignment: .leading, spacing: 2) {
                Text(out ? done : (full ? "Slipp for å skjule" : "Sveip for å skjule")).font(PF.ui(14.5, .bold)).foregroundStyle(Color.white)
                Text(hint).font(PF.ui(12)).foregroundStyle(Color.white.opacity(0.75)).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(full ? Color(hex: "#2f7a4f") : Color(hex: "#1b1a17"), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .animation(.easeOut(duration: 0.15), value: full)
    }
}

/* ---------- Arket: hele verset med kontekst, Del og Kopier ---------- */

struct Bible37Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Bible37Model { Bible37Model.shared }
    @State private var copied: Bool = false
    /// Prompt 42: lange kontekstvers vises med maks 3 linjer før og etter, med «Vis mer».
    @State private var more: Bool = false

    // Prompt 42 (claude-code-bibel-ark-knapp-alltid.md): fast topp (tittel + Ferdig), innhold som scroller, og fast bunn med
    // «Åpne Bibel-siden ›» som alltid ligger over hjemstreken, uansett tekstlengde, Dynamic Type eller skjermstørrelse.
    var body: some View {
        let v: Verse37 = m.current
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Text("Dagens bibelvers").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                Spacer(minLength: 4)
                SheetButton30(kind: .primary, title: "Ferdig") { m.sheetOpen = false }
            }
            .padding(.horizontal, 18).padding(.top, 22).padding(.bottom, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if !v.before.isEmpty { context(v.before) }
                    Text("«" + v.text + "»").font(PF.italic(23)).foregroundStyle(p.ink).lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(v.ref + " · Bibelen 1930").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
                    if !v.after.isEmpty { context(v.after) }
                    if long(v) {
                        Button { withAnimation(.easeOut(duration: 0.2)) { more.toggle() } } label: {
                            Text(more ? "Vis mindre" : "Vis mer").font(PF.ui(13, .bold)).foregroundStyle(p.lab)
                        }
                        .buttonStyle(.plain)
                    }
                    HStack(spacing: 10) {
                        ShareLink(item: v.copyText) {
                            Text("Del").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
                                .padding(.horizontal, 18).frame(height: 40)
                                .background(p.card, in: Capsule())
                                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        }
                        Button { copy(v) } label: {
                            Text(copied ? "Kopiert" : "Kopier").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
                                .padding(.horizontal, 18).frame(height: 40)
                                .background(p.card, in: Capsule())
                                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        Spacer(minLength: 0)
                    }
                }
                .padding(.horizontal, 18).padding(.top, 4).padding(.bottom, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollBounceBehavior(.basedOnSize)
            .safeAreaInset(edge: .bottom, spacing: 0) { openButton }
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    /// Fast bunn: full bredde, 56 pt, mørk pille med hvit tekst (Manrope 700 18), svak skygge over.
    private var openButton: some View {
        Button {
            Haptics.shared.tap()
            m.sheetOpen = false
            store.paperGo("bibel")
        } label: {
            Text("Åpne Bibel-siden ›").font(PF.ui(18, .bold)).foregroundStyle(Color.white)
                .lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity).frame(height: 56)
                .background(Color(hex: "#1b1a17"), in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 12)
        .background {
            p.bg
                .shadow(color: Color(hex: "#1b1a17").opacity(0.18), radius: 8, y: -6)
                .ignoresSafeArea(edges: .bottom)
        }
    }

    private func context(_ lines: [String]) -> some View {
        Text(lines.joined(separator: " ")).font(PF.serif(16)).foregroundStyle(p.mut).lineSpacing(3)
            .lineLimit(more ? nil : 3)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func long(_ v: Verse37) -> Bool {
        v.before.joined(separator: " ").count > 150 || v.after.joined(separator: " ").count > 150
    }

    private func copy(_ v: Verse37) {
        UIPasteboard.general.string = v.copyText
        Haptics.shared.success()
        withAnimation(.easeOut(duration: 0.15)) { copied = true }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_600_000_000)
            withAnimation(.easeOut(duration: 0.15)) { copied = false }
        }
    }
}

extension View {
    /// Arket med hele verset (legges på Hjem).
    func bible37Sheet(_ p: PaperPalette) -> some View {
        sheet(isPresented: Binding<Bool>(get: { Bible37Model.shared.sheetOpen }, set: { (v: Bool) in Bible37Model.shared.sheetOpen = v })) {
            Bible37Sheet().environment(\.paper, p)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .sheetEdge30(p.bg)
        }
    }
}

/* ---------- Now Brief: «MORGENVERS · GLIMT» / «KVELDSVERS · GLIMT» ---------- */

struct Bible37BriefCard: View {
    @Environment(Store.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    @MainActor private var m: Bible37Model { Bible37Model.shared }
    @State private var copied: Bool = false

    var body: some View {
        let v: Verse37 = m.current
        let t: BibleTone37 = BibleTone37(morning: Bible37.period() == "morning")
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(t.morning ? "MORGENVERS · GLIMT" : "KVELDSVERS · GLIMT").font(PF.mono(10.5)).tracking(1.4).foregroundStyle(t.lab)
                    Text(Bible37.dateShort()).font(PF.mono(11, bold: false)).foregroundStyle(t.mut)
                }
                Spacer(minLength: 6)
                // Prompt 38: Glimt i prestedrakt (46 pt) oppe til høyre (Shared/Glimt38Priest.swift).
                Glimt38PriestFig(id: Glimt35Model.shared.cfg.host, size: 46, still: reduce)
            }
            Text("«" + v.text + "»").font(PF.italic(22)).foregroundStyle(t.fg).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            Text(v.ref).font(PF.ui(14, .bold)).foregroundStyle(t.fg)
            HStack(spacing: 8) {
                Button { copy(v) } label: {
                    Text(copied ? "Kopiert" : "Kopier").font(PF.ui(12.5, .bold)).foregroundStyle(t.fg)
                        .padding(.horizontal, 14).frame(height: 32)
                        .background(t.chip, in: Capsule())
                }
                .buttonStyle(.plain)
                Button { m.next(store) } label: {
                    Image(systemName: "arrow.clockwise").font(.dyn51(size: 13, weight: .bold)).foregroundStyle(t.fg)
                        .frame(width: 32, height: 32)
                        .background(t.chip, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Nytt vers")
                Spacer(minLength: 0)
            }
            .padding(.top, 2)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.background(24))
        // Prompt 40: trykk på kortet lukker briefen og åpner Bibel-siden (Kopier og ↻ gjør bare sitt eget).
        .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .onTapGesture { openBible() }
        .accessibilityAction(named: "Åpne Bibel") { openBible() }
        .task { await m.load(store) }
    }

    private func openBible() {
        Haptic30.light()
        Brief34Model.shared.close()
        store.paperGo("bibel")
    }

    private func copy(_ v: Verse37) {
        UIPasteboard.general.string = v.copyText
        Haptics.shared.success()
        withAnimation(.easeOut(duration: 0.15)) { copied = true }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_600_000_000)
            withAnimation(.easeOut(duration: 0.15)) { copied = false }
        }
    }
}
