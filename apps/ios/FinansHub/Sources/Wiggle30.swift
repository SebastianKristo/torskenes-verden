import SwiftUI
import UIKit

/* ---------------- Prompt 30: wiggle-verktøylinje, Mer og Finans → Mer i samme WiggleEditor-utseende ---------------- */
// Fasit: design/Mobil Papir App.dc.html → Hjem / Mer / Finans → Mer i redigeringsmodus, og
// prompts/prompt-30-pakke/claude-code-wiggle-verktoylinje.md, claude-code-mer-wiggle.md, claude-code-finans-mer-wiggle.md.
// – Innholdet får 64 pt padding-top (animert 280 ms, cubic-bezier(.2,.8,.2,1)) så ＋ / ✓ aldri dekker første kort.
// – Mer: ingen header-kort, separate kort (radius 18, gap 10) som vugger, minus-merke −9/−9, lås på Innstillinger,
//   ＋ N viser «SKJULT · TRYKK + FOR Å VISE».
// – Finans → Mer: ＋ N (skjulte) til venstre i stedet for «Tilbakestill», minus-merke på flisene, lås på Innstillinger,
//   skjulte sider lagres per bruker i finance_more_hidden (PUT /api/me/layout) og /api/prefs/mer?scope=fin {h}.

@MainActor
enum Wiggle30 {
    /// Prompt 32: 74 pt fra innholdsområdets topp (hero-kanten) + de 23 pt innholdet overlapper fotovinduet, så første kort
    /// og «−»-merket (14 pt over kortet) starter under ＋ / ✓ (8 pt + 40 pt) med luft (claude-code-rediger-knapper-plass.md).
    static let pad: CGFloat = 74 + 23
    /// Klippet når man scroller i redigeringsmodus: under pillene (23 + 8 + 40 + 6), ellers 23.
    static let clipEdit: CGFloat = 77
    static let anim: Animation = .timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28)
    static let gap: CGFloat = 10

    /// Luften over innholdet når en wiggle-verktøylinje vises på siden.
    static func topPad(_ store: Store) -> CGFloat {
        // Prompt 45: i brettet modus ligger + / ✓ i sidelinja, så innholdet får ingen ekstra toppmarg.
        if Layout45.shared.wide { return 0 }
        if let e = store.paperEditPage, Edit28.pages.contains(e) { return pad }
        // Prompt 44: Mer har Ferdig og Store · Lave i overskriftsraden (More44.swift), ingen piller over lista.
        return 0
    }
}

/* ---------- Felles merker ---------- */

/// Hvitt merke 28 pt (card, line-kant, skygge) med − / + / lås. Ligger −9/−9 pt utenfor kortets øvre venstre hjørne.
struct WiggleBadge30: View {
    @Environment(\.paper) private var p
    enum Kind { case minus, plus, lock }
    let kind: Kind
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol).font(.dyn51(size: kind == .lock ? 11 : 12, weight: .heavy)).foregroundStyle(p.ink)
                .frame(width: 28, height: 28)
                .background(p.card, in: Circle())
                .overlay(Circle().stroke(p.line, lineWidth: 1))
                .shadow(color: Color.black.opacity(0.3), radius: 5, x: 0, y: 4)
                .contentShape(Circle().inset(by: -8))
        }
        .buttonStyle(.plain)
        .disabled(kind == .lock)
        .accessibilityLabel(label)
    }

    private var symbol: String {
        switch kind {
        case .minus: return "minus"
        case .plus: return "plus"
        case .lock: return "lock.fill"
        }
    }
}

/// Vugging ±0,45°, 0,6 s per runde, annenhver i motfase. Av når `on` er false (kortet som dras, skjulte kort).
struct Wiggle30Mod: ViewModifier {
    let on: Bool
    let index: Int
    @State private var phase: Bool = false

    func body(content: Content) -> some View {
        let sign: Double = index % 2 == 0 ? 1 : -1
        // Prompt 71: bare rotasjonen animeres (Anim71.swift).
        content
            .wiggle71(on, up: phase, angle: Edit28.angle * sign, half: Edit28.half)
            .onAppear { if on { DispatchQueue.main.async { phase = true } } }
            .onChange(of: on) { _, v in phase = v }
    }
}

extension View {
    func wiggle30(_ on: Bool, _ index: Int) -> some View {
        modifier(Wiggle30Mod(on: on, index: index))
    }
}

/// «SKJULT · TRYKK + FOR Å VISE».
struct WiggleHiddenLabel30: View {
    @Environment(\.paper) private var p

    var body: some View {
        Text("SKJULT · TRYKK + FOR Å VISE").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut)
            .padding(.horizontal, 4).padding(.top, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/* ---------- Mer: verktøylinja ---------- */

@MainActor
@Observable
final class Mer30 {
    static let shared = Mer30()
    /// ＋ viser/skjuler seksjonen med skjulte moduler.
    var showHidden: Bool = false
    /// Antall skjulte (settes av PaperMore28).
    var hiddenCount: Int = 0
}

/// ＋ N til venstre og ✓ til høyre over Mer-listen (samme piller som Hjem). Legges utenfor scroll-innholdet i PaperPage.
struct Mer30Pills: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Mer28 { Mer28.shared }
    @MainActor private var s: Mer30 { Mer30.shared }

    var body: some View {
        // Prompt 44: Mer har egen «Ferdig» i overskriftsraden (More44.swift); pillene vises ikke lenger der.
        if store.paperTab == "mer-28" && m.editing {
            HStack(spacing: 10) {
                Edit28Pill(kind: .add, text: s.hiddenCount > 0 ? "\(s.hiddenCount)" : "") {
                    Haptics.shared.tap()
                    withAnimation(.easeOut(duration: 0.2)) { s.showHidden.toggle() }
                }
                Spacer(minLength: 8)
                Edit28Pill(kind: .done, text: "") {
                    s.showHidden = false
                    m.done(store)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .transition(.opacity)
        }
    }
}

/* ---------- Mer: separate kort i redigeringsmodus ---------- */

/// Synlige moduler som egne kort (vugger, − / lås, ≡ for å flytte) og skjulte under «SKJULT» med ＋-merke.
struct Mer30EditList: View {
    @MainActor private var m: Mer28 { Mer28.shared }
    @MainActor private var s: Mer30 { Mer30.shared }
    let visible: [More28Row]
    let hidden: [More28Row]
    let all: [More28Row]

    var body: some View {
        VStack(alignment: .leading, spacing: Wiggle30.gap) {
            ForEach(Array(visible.enumerated()), id: \.element.id) { i, r in
                Mer30Card(r: r, index: i, all: all, hiddenRow: false)
                    .zIndex(m.dragKey == r.id ? 2 : 0)
            }
            if s.showHidden {
                WiggleHiddenLabel30()
                if hidden.isEmpty {
                    Mer30Empty()
                }
                ForEach(Array(hidden.enumerated()), id: \.element.id) { i, r in
                    Mer30Card(r: r, index: i, all: all, hiddenRow: true)
                }
            }
        }
    }
}

struct Mer30Empty: View {
    @Environment(\.paper) private var p
    var body: some View {
        Text("Ingen skjulte moduler. Trykk − på et kort for å skjule det.").font(PF.ui(13)).foregroundStyle(p.mut)
            .padding(.horizontal, 4)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct Mer30Card: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Mer28 { Mer28.shared }
    let r: More28Row
    let index: Int
    let all: [More28Row]
    let hiddenRow: Bool

    var body: some View {
        let dragging: Bool = m.dragKey == r.id
        row
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: Mer28.rowH)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .opacity(hiddenRow ? 0.55 : 1)
            .shadow(color: Color.black.opacity(dragging ? 0.3 : 0.3), radius: dragging ? 14 : 10, x: 0, y: dragging ? 10 : 8)
            .scaleEffect(dragging ? 1.04 : 1)
            .wiggle30(!hiddenRow && !dragging, index)
            .overlay(alignment: .topLeading) { badge.offset(x: -9, y: -9) }
            .offset(y: dragging ? m.dragDY : 0)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(r.name)
    }

    private var row: some View {
        HStack(spacing: 12) {
            if r.id == "finans" {
                // Prompt 40: Økonomi-ikonet 3c.
                Okonomi40Icon(size: 40)
            } else {
                Image(systemName: r.icon).font(.dyn51(size: 19, weight: .medium))
                    .foregroundStyle(PaperIconTheme.color(store.iconTheme, index))
                    .frame(width: 40, height: 40)
                    .background(p.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(r.name).font(PF.serif(19, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                Text(r.sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            Spacer(minLength: 6)
            if !hiddenRow { handle }
        }
    }

    private var handle: some View {
        Image(systemName: "line.3.horizontal").font(.dyn51(size: 18, weight: .medium)).foregroundStyle(p.mut)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
            .padding(.vertical, -8).padding(.trailing, -8)
            .gesture(drag)
            .accessibilityLabel("Flytt \(r.name)")
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .global)
            .onChanged { (v: DragGesture.Value) in m.drag(r.id, v.translation.height, all) }
            .onEnded { (_: DragGesture.Value) in m.dragEnd(store) }
    }

    @ViewBuilder private var badge: some View {
        if hiddenRow {
            WiggleBadge30(kind: .plus, label: "Vis \(r.name)") {
                Haptic30.soft()
                m.show(r.id, all, store)
            }
        } else if r.id == Mer28.locked {
            WiggleBadge30(kind: .lock, label: "Innstillinger kan ikke skjules") {}
        } else {
            WiggleBadge30(kind: .minus, label: "Skjul \(r.name)") {
                Haptic30.soft()
                m.hide(r.id, all, store)
            }
        }
    }
}

/* ---------- Finans → Mer: skjulte sider ---------- */

@MainActor
@Observable
final class FinHidden30 {
    static let shared = FinHidden30()

    var hidden: [String] = FinHidden30.readLocal()
    var showHidden: Bool = false

    static let locked: String = "innst"
    private static var localKey: String { AcctScope.key("papir_fm_hidden") }

    private static func readLocal() -> [String] {
        (UserDefaults.standard.array(forKey: localKey) as? [String]) ?? []
    }

    /// finance_more_hidden fra /api/me/layout (valgt på en annen enhet).
    func apply(_ o: [String: Any]) {
        guard o["finance_more_hidden"] != nil else { return }
        let list: [String] = JS.strings(o, "finance_more_hidden").filter { $0 != FinHidden30.locked }
        hidden = list
        UserDefaults.standard.set(list, forKey: FinHidden30.localKey)
    }

    func isHidden(_ id: String) -> Bool { hidden.contains(id) && id != FinHidden30.locked }

    func hide(_ id: String, _ store: Store) {
        if id == FinHidden30.locked || hidden.contains(id) { return }
        Haptic30.soft()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { hidden.append(id) }
        save(store)
    }

    func show(_ id: String, _ store: Store) {
        Haptic30.soft()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { hidden.removeAll { $0 == id } }
        save(store)
    }

    private func save(_ store: Store) {
        let list: [String] = hidden
        UserDefaults.standard.set(list, forKey: FinHidden30.localKey)
        // Egen forespørsel: eldre servere som ikke kjenner feltet svarer 400 uten å miste andre felt.
        store.savePaperLayout(["finance_more_hidden": list])
        // Samme nøkler som /api/prefs/mer?scope=fin (Import heter «fimport» der). o sendes med så rekkefølgen ikke nullstilles.
        let o: [String] = FinTileOrder20.load().map { $0 == "import" ? "fimport" : $0 }
        let h: [String] = list.map { $0 == "import" ? "fimport" : $0 }
        let body: [String: Any] = ["o": o, "h": h]
        Task { _ = try? await store.api.callAt("/api", "PUT", "/prefs/mer?scope=fin", json: body) }
    }
}

/// «Tilbakestill rekkefølge» nederst i SKJULT-seksjonen i Finans → Mer.
struct FinResetOrder30: View {
    @Environment(\.paper) private var p
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: "arrow.counterclockwise").font(.dyn51(size: 12, weight: .bold))
                Text("Tilbakestill rekkefølge").font(PF.ui(13, .semibold))
            }
            .foregroundStyle(p.ink)
            .padding(.horizontal, 14).frame(height: 36)
            .background(p.card, in: Capsule())
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .padding(.top, 6)
    }
}
