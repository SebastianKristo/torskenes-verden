import SwiftUI

/* ---------------- Prompt 43: Gjøremål på iPad (1a i Stor Skjerm Oppsett.dc.html) ----------------
 Kolonne 1 (250): «To-do for hele familien» / Gjøremål, LISTER (Alle, egne lister i valgt rekkefølge, Laget med Glimt, Arkivert)
 med antall, «+ Ny liste» sist. Kolonne 2 (fleks): oppgavene (PaperTasksView). Kolonne 3 (320): GLIMT-forslag og valgt oppgave,
 der redigeringen skjer (ikke i et nytt ark). Kolonnene skilles med 1 pt line; høyre kolonne har litt mørkere papir. */

struct Tasks43ListColumn: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: TasksModel { TasksModel.shared }
    @MainActor private var t: Tasks43Tabs { Tasks43Tabs.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("To-do for hele familien").font(PF.ui(12.5)).foregroundStyle(p.mut)
            Text("Gjøremål").font(PF.serif(30, medium: true)).foregroundStyle(p.ink).padding(.bottom, 10)
            Text("LISTER").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
            Rectangle().fill(p.ink).frame(height: 2).padding(.bottom, 4)
            ForEach(t.sorted(m), id: \.self) { (k: String) in
                row(k).tasks43Hold()
            }
            Tasks43NewListChip {
                Haptics.shared.tap()
                Tasks37UI.shared.listEdit = nil
                Tasks37UI.shared.listSheet = true
            }
            .padding(.top, 8)
        }
        .sheet(isPresented: Binding<Bool>(get: { Tasks43Tabs.shared.sheet }, set: { Tasks43Tabs.shared.sheet = $0 })) {
            Tasks43OrderSheet()
                .environment(\.paper, p)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private func count(_ k: String) -> Int {
        switch k {
        case "alle": return m.openCount
        case Tasks32b.archId: return Tasks32b.shared.count
        case Tasks41Glimt.madeId: return Tasks41Glimt.shared.made(m).count
        default: return m.items.filter { $0.list == k && !$0.done }.count
        }
    }

    @ViewBuilder private func row(_ k: String) -> some View {
        let n: Int = count(k)
        // «Laget med Glimt» vises bare når det finnes beskjeder.
        if k != Tasks41Glimt.madeId || n > 0 {
            let on: Bool = TaskDock22.shared.cur == k
            Button {
                if t.justHeld { return }
                Haptics.shared.select()
                if on, let l = m.lists.first(where: { $0.id == k }) {
                    Tasks37UI.shared.listEdit = l
                    Tasks37UI.shared.listSheet = true
                } else {
                    TaskDock22.shared.cur = k
                    Tasks37UI.shared.detail = nil
                }
            } label: {
                HStack(spacing: 10) {
                    Circle().fill(t.color(k, m, p)).frame(width: 9, height: 9)
                    Text(t.name(k, m)).font(PF.ui(14.5, on ? .bold : .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
                    Spacer(minLength: 4)
                    if n > 0 { Text("\(n)").font(PF.mono(11, bold: false)).foregroundStyle(on ? p.bg.opacity(0.8) : p.mut) }
                }
                .padding(.horizontal, 12).frame(minHeight: 44)
                .background(on ? p.ink : Color.clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

struct Tasks43RightColumn: View {
    @Environment(\.paper) private var p
    let cur: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Orb43(size: 22)
                Text("GLIMT · FORSLAG").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
            }
            Task37GlimtCards(cur: cur)
            Text("VALGT OPPGAVE").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab).padding(.top, 6)
            Rectangle().fill(p.ink).frame(height: 2)
            if let d = Tasks37UI.shared.detail {
                Task37DetailSheet(task: d) { Tasks37UI.shared.detail = nil }
                    .id(d.id)
                    .frame(height: 680)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            } else {
                Text("Trykk på en oppgave for å se og endre den her.").font(PF.ui(13)).foregroundStyle(p.mut)
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
        .padding(14)
        .background(p.dark ? p.card.opacity(0.5) : Color(hex: "#efe9de"), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
