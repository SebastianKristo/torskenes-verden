import SwiftUI
import UIKit

/* ---------------- Prompt 43: Gjøremål – rekkefølge på liste-pillene, «+ Ny liste» alltid sist ----------------
 Fasit: prompts/prompt-43-pakke/claude-code-gjoremal-faner-rekkefolge.md og Huskeliste.dc.html (tabSort, tabSv, lpFor, ord-arket).
 - Raden: [lister i valgt rekkefølge (Alle, egne lister, Arkivert, Laget med Glimt)] + «+ Ny liste» til slutt (ikke en del av sorteringen).
 - Hold inne en pille 0,45 s (haptikk) → arket «Rekkefølge på lister». Et langt trykk velger ikke lista.
 - Lagres per bruker: `huske_tab_order` lokalt + PUT /api/tasks/lists/order {ids} (eldre server: 404, bare lokalt).
   Nye lister havner sist (før «+ Ny liste»), slettede faller ut. */

@MainActor
@Observable
final class Tasks43Tabs {
    static let shared = Tasks43Tabs()

    static let key: String = "huske_tab_order"

    var order: [String] = (UserDefaults.standard.array(forKey: Tasks43Tabs.key) as? [String]) ?? []
    var sheet: Bool = false
    @ObservationIgnored private var heldAt: Date = .distantPast

    /// Rett etter et langt trykk: trykket som kommer når fingeren slippes skal ikke velge lista.
    var justHeld: Bool { Date().timeIntervalSince(heldAt) < 0.8 }

    /// Standard: Alle, egne lister, Arkivert, Laget med Glimt.
    func defaults(_ m: TasksModel) -> [String] {
        ["alle"] + m.lists.map(\.id) + [Tasks32b.archId, Tasks41Glimt.madeId]
    }

    /// Nøklene i valgt rekkefølge; nye legges bakerst, borte tas ut.
    func sorted(_ m: TasksModel) -> [String] {
        let keys: [String] = defaults(m)
        var out: [String] = order.filter { keys.contains($0) }
        for k in keys where !out.contains(k) { out.append(k) }
        return out
    }

    func hold() {
        heldAt = Date()
        if Haptics.shared.on { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
        sheet = true
    }

    func save(order next: [String], _ store: Store) {
        order = next
        UserDefaults.standard.set(next, forKey: Tasks43Tabs.key)
        Task { @MainActor in
            _ = try? await store.api.callAt("/api", "PUT", "/tasks/lists/order", json: ["ids": next])
        }
    }

    func reset(_ store: Store) {
        order = []
        UserDefaults.standard.removeObject(forKey: Tasks43Tabs.key)
        Task { @MainActor in
            _ = try? await store.api.callAt("/api", "PUT", "/tasks/lists/order", json: ["ids": [String]()])
        }
    }

    func name(_ k: String, _ m: TasksModel) -> String {
        switch k {
        case "alle": return "Alle"
        case Tasks32b.archId: return "Arkivert"
        case Tasks41Glimt.madeId: return "Laget med Glimt"
        default: return m.listName(k)
        }
    }

    func color(_ k: String, _ m: TasksModel, _ p: PaperPalette) -> Color {
        switch k {
        case "alle": return p.ink
        case Tasks32b.archId: return p.mut
        case Tasks41Glimt.madeId: return p.lab
        default: return m.lists.first(where: { $0.id == k }).map { Color(hex: $0.color) } ?? p.mut
        }
    }
}

extension View {
    /// Hold inne en liste-pille 0,45 s → arket «Rekkefølge på lister».
    func tasks43Hold() -> some View {
        simultaneousGesture(LongPressGesture(minimumDuration: 0.45, maximumDistance: 10).onEnded { (_: Bool) in
            Tasks43Tabs.shared.hold()
        })
    }
}

/// «+ Ny liste»: samme flate som de andre pillene (card, ink 700 13 pt) med 1,5 pt stiplet kant i ink (40 %).
struct Tasks43NewListChip: View {
    @Environment(\.paper) private var p
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text("+ Ny liste").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                .padding(.horizontal, 14).frame(height: 38)
                .background(p.card, in: Capsule())
                .overlay(Capsule().strokeBorder(p.ink.opacity(0.4), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ny liste")
    }
}

/// Arket «Rekkefølge på lister»: dra i ≡ eller bruk ▲ ▼. Endringen vises med en gang i raden bak arket.
struct Tasks43OrderSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var t: Tasks43Tabs { Tasks43Tabs.shared }
    @MainActor private var m: TasksModel { TasksModel.shared }

    var body: some View {
        let keys: [String] = t.sorted(m)
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("Rekkefølge på lister").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                Spacer()
                Button {
                    Haptics.shared.select()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { t.reset(store) }
                } label: {
                    Text("Tilbakestill").font(PF.ui(13, .semibold)).foregroundStyle(p.ink)
                        .padding(.horizontal, 14).frame(height: 34).background(p.card, in: Capsule())
                }
                .buttonStyle(.plain)
                Button {
                    Haptics.shared.success()
                    t.sheet = false
                } label: {
                    Text("Ferdig").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                        .padding(.horizontal, 16).frame(height: 34).background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20).padding(.top, 22)
            Text("Dra i ≡ eller bruk pilene. «+ Ny liste» ligger alltid sist.")
                .font(PF.ui(13)).foregroundStyle(p.mut)
                .padding(.horizontal, 20).padding(.top, 6).padding(.bottom, 8)
            List {
                ForEach(Array(keys.enumerated()), id: \.element) { i, k in
                    HStack(spacing: 12) {
                        Circle().fill(t.color(k, m, p)).frame(width: 10, height: 10)
                        Text(t.name(k, m)).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                        Spacer(minLength: 4)
                        arrow("chevron.up", "Flytt \(t.name(k, m)) opp", enabled: i > 0) { step(keys, i, -1) }
                        arrow("chevron.down", "Flytt \(t.name(k, m)) ned", enabled: i < keys.count - 1) { step(keys, i, 1) }
                    }
                    .frame(minHeight: 44)
                    .listRowBackground(p.card)
                }
                .onMove { (from: IndexSet, to: Int) in
                    var o: [String] = keys
                    o.move(fromOffsets: from, toOffset: to)
                    Haptics.shared.tick()
                    t.save(order: o, store)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            // ≡ (flytt-håndtaket) alltid synlig.
            .environment(\.editMode, .constant(.active))
        }
        .background(p.bg)
    }

    private func arrow(_ icon: String, _ label: String, enabled: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Image(systemName: icon).font(.dyn51(size: 13, weight: .bold)).foregroundStyle(enabled ? p.ink : p.mut.opacity(0.4))
                .frame(width: 36, height: 36).background(p.bg, in: Circle())
        }
        .buttonStyle(.borderless)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }

    private func step(_ keys: [String], _ i: Int, _ dir: Int) {
        let j: Int = i + dir
        guard j >= 0, j < keys.count else { return }
        var o: [String] = keys
        o.swapAt(i, j)
        Haptics.shared.tick()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { t.save(order: o, store) }
    }
}
