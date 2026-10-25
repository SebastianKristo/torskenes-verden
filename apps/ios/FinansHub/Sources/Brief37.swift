import SwiftUI

/* ---------------- Prompt 37: Now Brief – Vær-kortet åpner Vær ---------------- */
// prompts/prompt-37-pakke/claude-code-glimt-brief.md (2026-10-19). Hele Vær-kortet er trykkbart (scale 0,985 ved trykk og
// lett haptikk) og åpner Vær i fullskjerm OVER briefen (Brief35Page har sitt eget fullScreenCover). ✕ går tilbake til briefen
// på samme scroll-posisjon. Snakker Glimt, stoppes talen.

struct Brief37WeatherButton: View {
    @Environment(Store.self) private var store
    let b: Brief34

    var body: some View {
        Button {
            Glimt35Voice.shared.stop()
            Haptic34.light()
            store.weatherOpen = true
            Task { await store.loadWeatherFull() }
        } label: {
            Brief34Weather(b: b)
                .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(Press37Style())
        .accessibilityLabel("Åpne Vær")
        .accessibilityAddTraits(.isButton)
    }
}

/// Trykk-stil: krymper til 98,5 % mens fingeren er nede.
struct Press37Style: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/* ---------- Now Brief: Gjøremål-kortet (claude-code-gjoremal-glimt.md, punkt 9) ---------- */
// «Gjøremål · 3 gjøremål i dag» med de tre første (forfalt + i dag) og avkrysning rett i briefen, og «Åpne Gjøremål ›».
// Bygger på /api/tasks (tilgangen følger listemedlemskap på serveren). Vises bare når det er noe i dag.

struct Brief37TodosCard: View {
    @Environment(Store.self) private var store
    @MainActor private var m: TasksModel { TasksModel.shared }

    var body: some View {
        let list: [TaskItem17] = Brief37TodosCard.today(m)
        VStack(alignment: .leading, spacing: 8) {
            if !list.isEmpty {
                HStack(alignment: .firstTextBaseline) {
                    Text("Gjøremål").font(PF.serif(22, medium: true)).foregroundStyle(Brief34C.ink)
                    Spacer()
                    Text("\(list.count) I DAG").font(PF.mono(11)).foregroundStyle(Brief34C.red)
                }
                ForEach(Array(list.prefix(3))) { (t: TaskItem17) in
                    row(t)
                }
                Button {
                    Brief34Model.shared.close()
                    store.paperGo("huske")
                } label: {
                    Text("Åpne Gjøremål ›").font(PF.ui(13, .bold)).foregroundStyle(Brief34C.ink)
                        .padding(.top, 4)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(list.isEmpty ? 0 : 16)
        .background(list.isEmpty ? Color.clear : Brief34C.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .task { if !m.loaded { await m.load(store) } }
    }

    static func today(_ m: TasksModel) -> [TaskItem17] {
        let end: Date = Calendar.current.startOfDay(for: Date()).addingTimeInterval(86_400)
        return m.items.filter { (t: TaskItem17) -> Bool in
            guard !t.done, let d = t.due else { return false }
            return d < end
        }.sorted { (a: TaskItem17, b: TaskItem17) -> Bool in (a.due ?? .distantFuture) < (b.due ?? .distantFuture) }
    }

    private func row(_ t: TaskItem17) -> some View {
        let od: Bool = (t.due ?? Date()) < Calendar.current.startOfDay(for: Date())
        return HStack(spacing: 10) {
            Button { m.toggle(t, store) } label: {
                Image(systemName: t.done ? "checkmark.circle.fill" : "circle").font(.dyn51(size: 20, weight: .semibold))
                    .foregroundStyle(t.done ? Color(hex: "#2f7a4f") : Brief34C.mut)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Fullfør " + t.title)
            Text(t.title).font(PF.ui(14.5, .semibold)).foregroundStyle(Brief34C.ink).lineLimit(1)
            Spacer(minLength: 4)
            if od { Text("Forfalt").font(PF.ui(12, .semibold)).foregroundStyle(Brief34C.red) }
        }
        .frame(minHeight: 36)
    }
}
