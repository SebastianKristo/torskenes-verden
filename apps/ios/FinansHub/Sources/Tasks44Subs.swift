import SwiftUI
import WidgetKit

/* ---------------- Prompt 44: Gjøremål – deloppgaver rett i lista, infoside og synk i Innstillinger ----------------
 Fasit: prompts/prompt-44-pakke/design/Huskeliste.dc.html og claude-code-gjoremal-deloppgaver.md / -infoside.md / -synk-i-innstillinger.md.
 – ↳+ på hver oppgave (ved ✕/arkiv): feltet «Ny deloppgave …» åpnes rett under med tastaturet oppe. Enter legger til og
   feltet blir stående for neste. Deloppgavene står innrykket (38 pt) med egen avkrysning i listens farge, tekst og ✕.
 – Alle deloppgaver krysset av → «Fullfør «X» også?» (Fullfør / Ikke nå). Fullføres hovedoppgaven, krysses resten av.
 – Lagring: subs:[{id, n, done}] på oppgaven (PATCH /api/tasks/:id), som før. HA får dem som beskrivelse («☐ sovepose»).
 – Trykk på en oppgave åpner infosiden (Tasks44Info.swift) i fullskjerm over skrivefeltet og Glimt-knappen. */

enum Tasks44 {
    static func newId() -> String { "s" + String(UUID().uuidString.prefix(8)).lowercased() }
}

@MainActor
@Observable
final class Tasks44UI {
    static let shared = Tasks44UI()

    /// Oppgaven med åpent «Ny deloppgave …»-felt.
    var adding: String? = nil
    /// Infosiden (fullskjerm).
    var info: TaskItem17? = nil
    /// «Fullfør «X» også?»
    var askDone: TaskItem17? = nil

    func open(_ t: TaskItem17) {
        Haptics.shared.tap()
        adding = nil
        info = t
    }

    func toggleAdd(_ t: TaskItem17) {
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.18)) { adding = adding == t.id ? nil : t.id }
    }

    /* ---------- Deloppgaver ---------- */

    func current(_ id: String) -> TaskItem17? { TasksModel.shared.items.first { $0.id == id } }

    func addSub(_ id: String, _ text: String, _ store: Store) {
        let n: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty, var t = current(id) else { return }
        Haptics.shared.tick()
        t.subs.append(TaskSub37(n: n, done: false, id: Tasks44.newId()))
        TasksModel.shared.save37(t, store)
        if info?.id == id { info = t }
    }

    func toggleSub(_ id: String, _ index: Int, _ store: Store) {
        guard var t = current(id), index < t.subs.count else { return }
        Haptics.shared.tick()
        t.subs[index].done.toggle()
        TasksModel.shared.save37(t, store)
        if info?.id == id { info = t }
        if !t.done && !t.subs.isEmpty && t.subs.allSatisfy({ $0.done }) { askDone = t }
    }

    func removeSub(_ id: String, _ index: Int, _ store: Store) {
        guard var t = current(id), index < t.subs.count else { return }
        Haptics.shared.tick()
        t.subs.remove(at: index)
        TasksModel.shared.save37(t, store)
        if info?.id == id { info = t }
    }

    /// Fullfør (eller angre): fullføres hovedoppgaven, krysses deloppgavene av.
    func setDone(_ id: String, _ on: Bool, _ store: Store) {
        guard var t = current(id) else { return }
        if on { Haptics.shared.success() } else { Haptics.shared.tick() }
        t.done = on
        if on { for i in t.subs.indices { t.subs[i].done = true } }
        var body: [String: Any] = Tasks37.body(t)
        body["done"] = on
        if let i = TasksModel.shared.items.firstIndex(where: { $0.id == id }) { TasksModel.shared.items[i] = t }
        if info?.id == id { info = t }
        let enc: String = Tasks37.enc(id)
        Task {
            _ = try? await store.api.callAt("/api", "PATCH", "/tasks/\(enc)", json: body)
            WidgetCenter.shared.reloadTimelines(ofKind: "no.kristo.finanshub.tasks")
        }
    }
}

/// Fullskjerm-infosiden og «Fullfør også?»-spørsmålet. Legges på PaperTasksView.
struct Tasks44Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var ui: Tasks44UI { Tasks44UI.shared }

    func body(content: Content) -> some View {
        content
            // Prompt 46: «Fullført: … · Angre» etter at infosiden lukket seg (Tasks46Done.swift).
            .overlay(alignment: .bottom) { Tasks46UndoBar().environment(\.paper, p) }
            .fullScreenCover(item: Binding<TaskItem17?>(get: { ui.info }, set: { ui.info = $0 })) { (t: TaskItem17) in
                Tasks44InfoPage(taskId: t.id)
                    .environment(\.paper, p)
                    .environment(store)
                    .edgeSwipeClose30 { ui.info = nil }
            }
            .alert(askTitle, isPresented: askBinding) {
                Button("Fullfør") { if let t = ui.askDone { ui.setDone(t.id, true, store) }; ui.askDone = nil }
                Button("Ikke nå", role: .cancel) { ui.askDone = nil }
            } message: {
                Text("Alle deloppgavene er krysset av.")
            }
    }

    private var askTitle: String { "Fullfør «" + (ui.askDone?.title ?? "") + "» også?" }

    private var askBinding: Binding<Bool> {
        Binding<Bool>(get: { ui.askDone != nil && ui.info == nil }, set: { (v: Bool) in if !v { ui.askDone = nil } })
    }
}

extension View {
    func tasks44Host(_ p: PaperPalette) -> some View { modifier(Tasks44Host(p: p)) }
}

/* ---------- Lista: ↳+ og innrykkede deloppgaver ---------- */

/// ↳+ (Legg til deloppgave) ved siden av ✕/arkiv på raden.
struct Tasks44SubButton: View {
    @Environment(\.paper) private var p
    @MainActor private var ui: Tasks44UI { Tasks44UI.shared }
    let t: TaskItem17

    var body: some View {
        let on: Bool = ui.adding == t.id
        Button { ui.toggleAdd(t) } label: {
            Text("↳+").font(PF.ui(13, .bold)).foregroundStyle(on ? p.bg : p.mut)
                .frame(width: 34, height: 30)
                .background(on ? p.ink : Color.clear, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(on ? Color.clear : p.line, lineWidth: 1))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Legg til deloppgave")
    }
}

/// Deloppgavene under oppgaven (38 pt innrykk) og feltet «Ny deloppgave …» når ↳+ er trykket.
struct Tasks44SubList: View {
    @MainActor private var ui: Tasks44UI { Tasks44UI.shared }
    @MainActor private var m: TasksModel { TasksModel.shared }
    let t: TaskItem17

    var body: some View {
        let c: Color = m.color(t.list)
        if !t.subs.isEmpty || ui.adding == t.id {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(t.subs.enumerated()), id: \.offset) { (pair: (offset: Int, element: TaskSub37)) in
                    Tasks44SubRow(taskId: t.id, index: pair.offset, sub: pair.element, color: c)
                }
                if ui.adding == t.id { Tasks44SubField(taskId: t.id) }
            }
            .padding(.leading, 38)
            .padding(.bottom, 6)
        }
    }
}

struct Tasks44SubRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let taskId: String
    let index: Int
    let sub: TaskSub37
    let color: Color

    var body: some View {
        HStack(spacing: 10) {
            Button { Tasks44UI.shared.toggleSub(taskId, index, store) } label: {
                Tasks44Check(on: sub.done, color: color, size: 20, round: false)
                    .frame(width: 36, height: 36).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(sub.done ? "Marker som ikke ferdig" : "Fullfør deloppgave")
            Text(sub.n).font(PF.ui(14)).foregroundStyle(sub.done ? p.mut : p.ink)
                .strikethrough(sub.done)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button { Tasks44UI.shared.removeSub(taskId, index, store) } label: {
                Image(systemName: "xmark").font(.dyn51(size: 11, weight: .bold)).foregroundStyle(p.mut)
                    .frame(width: 36, height: 36).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Slett deloppgave")
        }
        .opacity(sub.done ? 0.7 : 1)
        .frame(minHeight: 38)
    }
}

/// Avkrysningsboks i listens farge (firkantet i lista, rund på infosiden).
struct Tasks44Check: View {
    let on: Bool
    let color: Color
    var size: CGFloat = 26
    var round: Bool = false

    var body: some View {
        ZStack {
            shape.stroke(color, lineWidth: 2)
            if on {
                shape.fill(color)
                Image(systemName: "checkmark").font(.dyn51(size: size * 0.48, weight: .bold)).foregroundStyle(Color.white)
            }
        }
        .frame(width: size, height: size)
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: round ? size / 2 : size * 0.3, style: .continuous)
    }
}

/// «Ny deloppgave …» – Enter / «Legg til» legger den til, feltet blir stående.
struct Tasks44SubField: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let taskId: String
    @State private var text: String = ""
    @FocusState private var focus: Bool

    var body: some View {
        HStack(spacing: 8) {
            TextField("Ny deloppgave …", text: $text)
                .font(PF.ui(14)).foregroundStyle(p.ink)
                .focused($focus)
                .submitLabel(.next)
                .onSubmit { add() }
                .padding(.horizontal, 12).frame(height: 38)
                .background(p.bg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            Button { add() } label: {
                Text("Legg til").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 12).frame(height: 34)
                    .background(p.ink, in: Capsule())
                    .frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .onAppear { DispatchQueue.main.async { focus = true } }
    }

    private func add() {
        Tasks44UI.shared.addSub(taskId, text, store)
        text = ""
        focus = true
    }
}

/* ---------- Synk med Home Assistant: rad i Gjøremål og Innstillinger → Gjøremål ---------- */

/// «⇄ Synk med Home Assistant · Synket 20:41 · endres i Innstillinger → Gjøremål ›» (erstatter det store kortet).
struct Tasks44SyncRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var st: TaskHAState22? = nil

    var body: some View {
        Group {
            if let s = st {
                Button { store.paperGo("innst-huske") } label: { label(s) }
                    .buttonStyle(.plain)
            }
        }
        .task { await load() }
    }

    private func label(_ s: TaskHAState22) -> some View {
        HStack(spacing: 10) {
            Text("⇄").font(PF.ui(16, .bold)).foregroundStyle(p.mut)
            VStack(alignment: .leading, spacing: 1) {
                Text("Synk med Home Assistant · " + Tasks44SyncRow.status(s)).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                Text("endres i Innstillinger → Gjøremål").font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
            }
            Spacer(minLength: 6)
            Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
        }
        .padding(.horizontal, 14).frame(minHeight: 54)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .contentShape(Rectangle())
        .padding(.top, 6)
    }

    static func status(_ s: TaskHAState22) -> String {
        if !s.enabled { return "Av" }
        if s.status == "error" { return "Feil" }
        return s.syncedAt.map { "Synket " + JS.fmt($0, "HH:mm") } ?? "På"
    }

    private func load() async {
        let admin: Bool = (store.me?.role ?? store.account?.role ?? "") == "admin"
        guard admin, let d = try? await store.api.callAt("/api", "GET", "/tasks/ha", timeout: 15) else { st = nil; return }
        st = TaskHAState22(JS.obj(d))
    }
}

/// Innstillinger → Gjøremål: SYNK MED HOME ASSISTANT (samme lagring som før, så ingenting må kobles på nytt).
struct Tasks44SyncPage: View {
    @Environment(\.paper) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            TaskHASection22()
            Text("Gjøremål synkes to veier med Home Assistant To-do (todo.*). Nye lister kobles automatisk når du velger en entitet. Deloppgaver sendes som beskrivelse («☐ sovepose»), fordi Home Assistant ikke har underpunkter.")
                .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 4)
            Tasks44SyncEmpty()
        }
    }
}

/// Ikke-admin ser forklaringen i stedet for det tomme kortet.
struct Tasks44SyncEmpty: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        if (store.me?.role ?? store.account?.role ?? "") != "admin" {
            Text("Synken settes opp av en administrator.").font(PF.ui(13)).foregroundStyle(p.mut).padding(.horizontal, 4)
        }
    }
}
