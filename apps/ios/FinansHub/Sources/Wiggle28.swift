import SwiftUI
import UIKit

/* ---------------- Prompt 28: redigeringsmodus som iOS-hjemskjermen (wiggle) ---------------- */
// Fasit: hold inne et kort på Hjem i design/Mobil Papir App.dc.html og prompts/prompt-28-pakke/claude-code-hjem-wiggle.md.
// Ingen mørk instruksjonslinje og ingen ▲ ▼ (unntatt Sporing midlertidig). To flytende piller over listen (eget lag utenfor
// scroll-innholdet, 8 pt under toppen av innholdsområdet): ＋ (skjulte widgets) / «↺ Tilbakestill» (Finans → Mer) til venstre
// og ✓ til høyre. Minus-sirkel øverst til venstre (9 pt utenfor kanten), «✎ Rediger widget» midt på kort med innstillinger,
// og arket «Legg til widget». Samme vugging overalt: ±0,45°, 0,6 s per runde, annenhver i motfase.

@MainActor
@Observable
final class Edit28 {
    static let shared = Edit28()

    var addOpen: Bool = false
    var ruterOpen: Bool = false
    /// Økes av «↺ Tilbakestill» i Finans → Mer; rutenettet lytter.
    var resetTick: Int = 0
    /// Etikettene til kortene på hver side (settes av PaperCardStack), til «Legg til widget».
    @ObservationIgnored var labels: [String: [(String, String)]] = [:]

    /// Sidene med pillene.
    static let pages: Set<String> = ["hjem", "mat", "finans", "sporing", "fmer"]
    /// Kort med egne innstillinger («✎ Rediger widget»).
    static let settingsCards: Set<String> = ["h3", "h10"]

    static let angle: Double = 0.45
    static let half: Double = 0.3

    func editWidget(_ key: String, _ store: Store) {
        Haptics.shared.tap()
        switch key {
        case "h3": ruterOpen = true
        case "h10": store.paperGo("innst-kal")
        default: break
        }
    }
}

/// Pillene over listen. Legges som overlay på scroll-flaten i PaperPage, så de aldri kuttes når man scroller.
struct Edit28Pills: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var e: Edit28 { Edit28.shared }

    var body: some View {
        if let page = store.paperEditPage, Edit28.pages.contains(page) {
            HStack(spacing: 10) {
                left(page)
                Spacer(minLength: 8)
                Edit28Pill(kind: .done, text: "", action: { done(page) })
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .transition(.opacity)
        }
    }

    @ViewBuilder private func left(_ page: String) -> some View {
        if page == "fmer" {
            Edit28Pill(kind: .reset, text: "Tilbakestill") {
                Haptics.shared.select()
                e.resetTick += 1
            }
        } else if page != "sporing" {
            let n: Int = hiddenCount(page)
            Edit28Pill(kind: .add, text: n > 0 ? "\(n)" : "") {
                Haptics.shared.tap()
                e.addOpen = true
            }
        }
    }

    private func hiddenCount(_ page: String) -> Int {
        let keys: [String] = (e.labels[page] ?? []).map { $0.0 }
        if keys.isEmpty { return store.paperPages[page]?.hidden.count ?? 0 }
        return store.pageCards(page, keys).hidden.count
    }

    private func done(_ page: String) {
        store.exitPaperEdit()
    }
}

/// Én pille, 40 pt høy, Papir-stil. ＋/↺: card + line-kant + ink. ✓: ink-bakgrunn og bg-ikon (primær).
struct Edit28Pill: View {
    @Environment(\.paper) private var p
    enum Kind { case add, reset, done }
    let kind: Kind
    let text: String
    let action: () -> Void

    var body: some View {
        let primary: Bool = kind == .done
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: primary ? 16 : 14, weight: .bold))
                if !text.isEmpty { Text(text).font(PF.ui(14, .bold)) }
            }
            .foregroundStyle(primary ? p.bg : p.ink)
            .padding(.horizontal, 16)
            .frame(minWidth: 64, minHeight: 40)
            .background(primary ? p.ink : p.card, in: Capsule())
            .overlay(Capsule().stroke(primary ? p.ink : p.line, lineWidth: 1))
            .shadow(color: .black.opacity(primary ? 0.35 : 0.3), radius: 10, y: 8)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var icon: String {
        switch kind {
        case .add: return "plus"
        case .reset: return "arrow.counterclockwise"
        case .done: return "checkmark"
        }
    }

    private var label: String {
        switch kind {
        case .add: return "Legg til widget"
        case .reset: return "Tilbakestill"
        case .done: return "Ferdig"
        }
    }
}

/// Minus-sirkel 28 pt i Papir-stil (card, line-kant, ink −).
struct Edit28Minus: View {
    @Environment(\.paper) private var p
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "minus").font(.system(size: 12, weight: .heavy)).foregroundStyle(p.ink)
                .frame(width: 28, height: 28)
                .background(p.card, in: Circle())
                .overlay(Circle().stroke(p.line, lineWidth: 1))
                .shadow(color: .black.opacity(0.3), radius: 5, y: 4)
                .contentShape(Circle().inset(by: -8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// «✎ Rediger widget» midt på kortet.
struct Edit28WidgetPill: View {
    @Environment(\.paper) private var p
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: "pencil").font(.system(size: 12, weight: .bold))
                Text("Rediger widget").font(PF.ui(12.5, .bold))
            }
            .foregroundStyle(p.bg)
            .padding(.horizontal, 14).frame(height: 32)
            .background(p.ink, in: Capsule())
            .shadow(color: .black.opacity(0.3), radius: 6, y: 4)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// ▲ ▼ i Papir-stil (card, line-kant, ink) – midlertidig på Sporing.
struct Edit28Arrow: View {
    @Environment(\.paper) private var p
    let up: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: up ? "chevron.up" : "chevron.down").font(.system(size: 12, weight: .bold)).foregroundStyle(p.ink)
                .frame(width: 30, height: 30)
                .background(p.card, in: Circle())
                .overlay(Circle().stroke(p.line, lineWidth: 1))
                .shadow(color: .black.opacity(0.25), radius: 4, y: 2)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(up ? "Flytt opp" : "Flytt ned")
    }
}

/// Arket «Legg til widget»: skjulte kort med grønn ＋, eller tom-tekst.
struct Edit28AddSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var e: Edit28 { Edit28.shared }

    var body: some View {
        let page: String = store.paperEditPage ?? "hjem"
        let all: [(String, String)] = e.labels[page] ?? []
        let keys: [String] = all.map { $0.0 }
        let hidden: [String] = store.pageCards(page, keys).hidden
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Text("Legg til widget").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                Spacer(minLength: 4)
                Button { e.addOpen = false } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(p.ink)
                        .frame(width: 36, height: 36).background(p.card, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Lukk")
            }
            if hidden.isEmpty {
                Text("Alle widgets vises allerede. Trykk − på en widget for å skjule den.").font(PF.ui(14)).foregroundStyle(p.mut)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(hidden.enumerated()), id: \.element) { i, k in
                        Edit28AddRow(name: all.first { $0.0 == k }?.1 ?? k, first: i == 0) {
                            store.setPaperCardHidden(page, k, false, keys)
                        }
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 20)
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }
}

struct Edit28AddRow: View {
    @Environment(\.paper) private var p
    let name: String
    let first: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(name).font(PF.ui(15.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                Spacer(minLength: 6)
                Image(systemName: "plus").font(.system(size: 13, weight: .heavy)).foregroundStyle(Color.white)
                    .frame(width: 28, height: 28).background(p.pos, in: Circle())
            }
            .padding(.horizontal, 16).frame(minHeight: 54)
            .overlay(alignment: .top) { if !first { Rectangle().fill(p.line).frame(height: 1) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Vis \(name)")
    }
}

extension View {
    /// Pillene og arkene for redigeringsmodus (legges på scroll-flaten i PaperPage).
    func edit28Layer(_ p: PaperPalette) -> some View {
        modifier(Edit28Layer(p: p))
    }
}

struct Edit28Layer: ViewModifier {
    @Environment(Store.self) private var store
    @MainActor private var e: Edit28 { Edit28.shared }
    let p: PaperPalette

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) { Edit28Pills() }
            .animation(.easeOut(duration: 0.2), value: store.paperEditPage)
            .sheet(isPresented: Binding<Bool>(get: { e.addOpen }, set: { e.addOpen = $0 })) {
                Edit28AddSheet().environment(\.paper, p)
                    .presentationDetents([.medium])
                    .presentationDragIndicator(.visible)
                    .presentationBackground(p.bg)
            }
            .sheet(isPresented: Binding<Bool>(get: { e.ruterOpen }, set: { e.ruterOpen = $0 })) {
                RuterPick27Sheet(close: { e.ruterOpen = false }).environment(\.paper, p)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationBackground(p.bg)
            }
    }
}

/* ---------- Ruter: jevn åpne/lukke-animasjon ---------- */

/// Innhold som alltid ligger i layouten og animerer høyde 0 ↔ innhold. Innholdet bygges først når raden åpnes første gang
/// (og beholdes), så lukkingen animerer i stedet for å forsvinne.
struct Ruter28Expand<C: View>: View {
    let open: Bool
    @ViewBuilder let content: () -> C
    @State private var built: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            if built || open {
                content()
                    .opacity(open ? 1 : 0)
                    .offset(y: open ? 0 : -6)
            }
        }
        .frame(maxWidth: .infinity, alignment: .top)
        .frame(height: open ? nil : 0, alignment: .top)
        .clipped()
        .allowsHitTesting(open)
        .accessibilityHidden(!open)
        .onChange(of: open) { _, on in if on { built = true } }
        .onAppear { if open { built = true } }
    }
}
