import SwiftUI
import WidgetKit

/* ---------------- Prompt 44: Gjøremål – infosiden (Papir) ----------------
 Fasit: Huskeliste.dc.html (vwVals, mobil) og claude-code-gjoremal-infoside.md «Nytt utseende», «Frist / Når virker + sted
 med kart» og «Ny toppstripe». Felles toppstripe som Media: rød «‹ Tilbake» (Manrope 16/700) til venstre, to runde hvite
 knapper (42 pt, tynn ramme, liten skygge) til høyre: ☆ (rød, gul ★ når flagget) og glidebrytere → meny (Gjentakelse,
 påminnelse og mer … / Dupliser / Slett oppgaven). Så liste-pille, avkrysning (30) + tittel (Newsreader 30, redigeres
 direkte), FRIST og NÅR side om side (trykk = velger, ✕ fjerner), DETALJER, DELOPPGAVER («1 av 3» + stolpe), STED med
 forslag og kart, og fast «Fullfør oppgaven» nederst i listens farge. Alt lagres fortløpende (PATCH /api/tasks/:id).
 Frist (dl) = siste dag, Når (due + time) = når du planlegger å gjøre det. */

struct Tasks44InfoPage: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let taskId: String
    @State private var t: TaskItem17? = nil
    @State private var saveTask: Task<Void, Never>? = nil
    @State private var picker: Tasks44Pick? = nil
    @State private var moreSheet: Bool = false
    @State private var confirmDelete: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            Tasks44InfoTop(flag: t?.flag ?? false, onBack: close, onFlag: toggleFlag, onMore: { moreSheet = true },
                           onDuplicate: duplicate, onDelete: { confirmDelete = true })
            if let cur = t { content(cur) } else { Spacer() }
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .overlay(alignment: .bottom) { if let cur = t { Tasks44DoneBar(t: cur, color: TasksModel.shared.color(cur.list)) { setDone(!cur.done) } } }
        .onAppear { t = Tasks44UI.shared.current(taskId) ?? Tasks44UI.shared.info }
        .onChange(of: Tasks44UI.shared.info) { (_: TaskItem17?, v: TaskItem17?) in if let v, v.id == taskId, v.subs != t?.subs { t = v } }
        .sheet(item: $picker) { (k: Tasks44Pick) in pickerSheet(k) }
        .sheet(isPresented: $moreSheet) { moreSheetView }
        .confirmationDialog("Slette oppgaven?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Slett oppgaven", role: .destructive) { delete() }
            Button("Avbryt", role: .cancel) {}
        }
    }

    private func content(_ cur: TaskItem17) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Tasks44ListPill(listId: cur.list) { (id: String) in edit { $0.list = id } }
                Tasks44TitleRow(t: cur, title: binding(\.title), onCheck: { setDone(!cur.done) })
                Tasks44WhenCards(t: cur, pick: { picker = $0 }, clearDl: { edit { $0.dl44 = nil } },
                                 clearDue: { edit { $0.due = nil; $0.time = "" } })
                Tasks44Details(note: binding(\.note))
                Tasks44SubsCard(t: cur)
                Tasks44PlaceCard(t: cur) { (pl: String, geo: [Double]) in edit { $0.place = pl; $0.geo44 = geo } }
            }
            .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 110)
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    /* ---------- Lagring ---------- */

    private func binding(_ k: WritableKeyPath<TaskItem17, String>) -> Binding<String> {
        Binding<String>(get: { t?[keyPath: k] ?? "" }, set: { (v: String) in edit(debounce: true) { $0[keyPath: k] = v } })
    }

    /// Endrer kladden og lagrer (tekst: 0,6 s pause; ellers med en gang).
    private func edit(debounce: Bool = false, _ f: (inout TaskItem17) -> Void) {
        guard var cur = t else { return }
        f(&cur)
        t = cur
        saveTask?.cancel()
        if !debounce { save(cur); return }
        saveTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 600_000_000)
            if !Task.isCancelled { save(cur) }
        }
    }

    private func save(_ cur: TaskItem17) {
        TasksModel.shared.save37(cur, store)
        Tasks44UI.shared.info = cur
    }

    private func close() {
        saveTask?.cancel()
        if let cur = t { TasksModel.shared.save37(cur, store) }
        Haptic34.back()
        Tasks44UI.shared.info = nil
    }

    private func toggleFlag() {
        Haptics.shared.select()
        edit { $0.flag.toggle() }
    }

    private func setDone(_ on: Bool) {
        saveTask?.cancel()
        if let cur = t { TasksModel.shared.save37(cur, store) }
        Tasks44UI.shared.setDone(taskId, on, store)
        t = Tasks44UI.shared.current(taskId) ?? t
    }

    private func duplicate() {
        guard let cur = t else { return }
        var body: [String: Any] = Tasks37.body(cur)
        body["title"] = cur.title + " (kopi)"
        body["n"] = cur.title + " (kopi)"
        Haptics.shared.success()
        Task { @MainActor in
            _ = try? await store.api.callAt("/api", "POST", "/tasks", json: body)
            await TasksModel.shared.load(store)
            store.flash("Kopi laget")
        }
    }

    private func delete() {
        guard let cur = t else { return }
        Tasks44UI.shared.info = nil
        TasksModel.shared.delete(cur, store)
    }

    /* ---------- Ark ---------- */

    @ViewBuilder private func pickerSheet(_ k: Tasks44Pick) -> some View {
        Tasks44DateSheet(kind: k, t: t ?? Tasks44UI.shared.info, apply: { (d: Date) in apply(k, d) })
            .environment(\.paper, p)
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .sheetEdge30(p.bg)
    }

    private func apply(_ k: Tasks44Pick, _ d: Date) {
        switch k {
        case .dl: edit { $0.dl44 = d }
        case .due: edit { $0.due = d }
        case .time: edit { (x: inout TaskItem17) in x.time = Task37Time.text(d); if x.due == nil { x.due = Date() } }
        }
    }

    private var moreSheetView: some View {
        Task37DetailSheet(task: t ?? Tasks44UI.shared.info ?? TaskItem17([:])) {
            moreSheet = false
            if let n = Tasks44UI.shared.current(taskId) { t = n }
        }
        .environment(\.paper, p)
        .environment(store)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .sheetEdge30(p.bg)
    }
}

enum Tasks44Pick: String, Identifiable {
    case dl, due, time
    var id: String { rawValue }
}

/* ---------- Toppstripe (samme høyde som Media: safe area + 12, 42 pt) ---------- */

struct Tasks44InfoTop: View {
    @Environment(\.paper) private var p
    let flag: Bool
    let onBack: () -> Void
    let onFlag: () -> Void
    let onMore: () -> Void
    let onDuplicate: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onBack) {
                Text("‹ Tilbake").font(PF.ui(16, .bold)).foregroundStyle(Color(hex: "#b23a2a"))
                    .frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Spacer(minLength: 8)
            Button(action: onFlag) { Tasks44Round { star } }
                .buttonStyle(.plain)
                .accessibilityLabel(flag ? "Fjern flagg" : "Flagg")
            menu
        }
        .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 6)
    }

    private var star: some View {
        Image(systemName: flag ? "star.fill" : "star").font(.system(size: 16, weight: .semibold))
            .foregroundStyle(flag ? Color(hex: "#e0a81a") : Color(hex: "#b23a2a"))
    }

    private var menu: some View {
        Menu {
            Button(action: onMore) { Label("Gjentakelse, påminnelse og mer …", systemImage: "slider.horizontal.3") }
            Button(action: onDuplicate) { Label("Dupliser", systemImage: "plus.square.on.square") }
            Button(role: .destructive, action: onDelete) { Label("Slett oppgaven", systemImage: "trash") }
        } label: {
            Tasks44Round {
                Image(systemName: "slider.horizontal.3").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.ink)
            }
        }
        .accessibilityLabel("Flere valg")
    }
}

/// Rund hvit knapp, 42 pt, tynn ramme og liten skygge.
struct Tasks44Round<C: View>: View {
    @Environment(\.paper) private var p
    @ViewBuilder let content: () -> C

    var body: some View {
        content()
            .frame(width: 42, height: 42)
            .background(p.card, in: Circle())
            .overlay(Circle().stroke(p.line, lineWidth: 1))
            .shadow(color: Color.black.opacity(0.08), radius: 3, y: 2)
            .frame(width: 44, height: 44)
            .contentShape(Circle())
    }
}

/* ---------- Liste-pille ---------- */

struct Tasks44ListPill: View {
    @Environment(\.paper) private var p
    @MainActor private var m: TasksModel { TasksModel.shared }
    let listId: String
    let pick: (String) -> Void

    var body: some View {
        Menu {
            ForEach(m.lists) { (l: TaskList17) in
                Button { Haptics.shared.select(); pick(l.id) } label: {
                    if l.id == listId { Label(l.name, systemImage: "checkmark") } else { Text(l.name) }
                }
            }
        } label: {
            HStack(spacing: 8) {
                Circle().fill(m.color(listId)).frame(width: 9, height: 9)
                Text(m.listName(listId)).font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
                Text("▼").font(PF.ui(9)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).frame(height: 34)
            .background(p.card, in: Capsule())
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
            .frame(minHeight: 44)
        }
        .accessibilityLabel("Liste: " + m.listName(listId))
    }
}

/* ---------- Avkrysning + tittel ---------- */

struct Tasks44TitleRow: View {
    @Environment(\.paper) private var p
    let t: TaskItem17
    @Binding var title: String
    let onCheck: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Button(action: onCheck) {
                Tasks44Check(on: t.done, color: TasksModel.shared.color(t.list), size: 30, round: true)
                    .frame(width: 44, height: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 2)
            .accessibilityLabel(t.done ? "Marker som ikke fullført" : "Fullfør")
            TextField("Tittel", text: $title, axis: .vertical)
                .font(PF.serif(30, medium: true)).foregroundStyle(p.ink)
                .strikethrough(t.done)
                .lineLimit(1...4)
                .submitLabel(.done)
        }
    }
}

/* ---------- Frist og Når ---------- */

struct Tasks44WhenCards: View {
    let t: TaskItem17
    let pick: (Tasks44Pick) -> Void
    let clearDl: () -> Void
    let clearDue: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Tasks44DlCard(t: t, open: { pick(.dl) }, clear: clearDl)
            Tasks44DueCard(t: t, open: { pick(.due) }, openTime: { pick(.time) }, clear: clearDue)
        }
    }
}

enum Tasks44Fmt {
    /// «Fredag 24. oktober»
    static func long(_ d: Date) -> String {
        let s: String = JS.fmt(d, "EEEE d. MMMM")
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    /// «I dag», «I morgen», «Fre 24. okt»
    static func rel(_ d: Date) -> String {
        let c: Calendar = Calendar.current
        if c.isDateInToday(d) { return "I dag" }
        if c.isDateInTomorrow(d) { return "I morgen" }
        if c.isDateInYesterday(d) { return "I går" }
        let s: String = JS.fmt(d, "EEE d. MMM")
        return s.prefix(1).uppercased() + s.dropFirst()
    }

    static func overdue(_ d: Date) -> Bool { Calendar.current.startOfDay(for: d) < Calendar.current.startOfDay(for: Date()) }
}

/// Kortskall for FRIST/NÅR: etikett, innhold, ✕ (fjerner uten å åpne velgeren).
struct Tasks44WhenShell<C: View>: View {
    @Environment(\.paper) private var p
    let label: String
    let red: Bool
    let filled: Bool
    let open: () -> Void
    let clear: () -> Void
    @ViewBuilder let content: () -> C

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 6) {
                Text(label).font(PF.mono(10)).tracking(1.2).foregroundStyle(red ? Color(hex: "#b23a2a") : p.mut)
                content()
            }
            .padding(14).frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(red ? Color(hex: "#b23a2a") : Color.clear, lineWidth: 1.5))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .overlay(alignment: .topTrailing) { if filled { clearButton } }
    }

    private var clearButton: some View {
        Button(action: clear) {
            Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(p.mut)
                .frame(width: 40, height: 40).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Fjern " + label.lowercased())
    }
}

struct Tasks44DlCard: View {
    @Environment(\.paper) private var p
    let t: TaskItem17
    let open: () -> Void
    let clear: () -> Void

    var body: some View {
        let late: Bool = t.dl44.map { Tasks44Fmt.overdue($0) && !t.done } ?? false
        Tasks44WhenShell(label: "FRIST", red: late, filled: t.dl44 != nil, open: open, clear: clear) {
            if let d = t.dl44 {
                Text(Tasks44Fmt.long(d)).font(PF.serif(18, medium: true)).foregroundStyle(late ? Color(hex: "#b23a2a") : p.ink).lineLimit(2)
                if late { Text("forfalt").font(PF.ui(12, .bold)).foregroundStyle(Color(hex: "#b23a2a")) }
            } else {
                Text("Legg til").font(PF.ui(15, .semibold)).foregroundStyle(p.mut)
            }
        }
    }
}

struct Tasks44DueCard: View {
    @Environment(\.paper) private var p
    let t: TaskItem17
    let open: () -> Void
    let openTime: () -> Void
    let clear: () -> Void

    var body: some View {
        Tasks44WhenShell(label: "NÅR", red: false, filled: t.due != nil, open: open, clear: clear) {
            if let d = t.due {
                Text(Tasks44Fmt.rel(d)).font(PF.serif(18, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                timePill
            } else {
                Text("Legg til").font(PF.ui(15, .semibold)).foregroundStyle(p.mut)
            }
        }
    }

    private var timePill: some View {
        Button(action: openTime) {
            Text(t.time.isEmpty ? "Legg til tid" : t.time).font(PF.ui(12.5, .bold)).foregroundStyle(p.ink)
                .padding(.horizontal, 10).frame(height: 28)
                .background(p.bg, in: Capsule())
                .frame(minHeight: 36).contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// DatePicker i ark (iOS): dato (grafisk) eller klokkeslett (hjul).
struct Tasks44DateSheet: View {
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    let kind: Tasks44Pick
    let t: TaskItem17?
    let apply: (Date) -> Void
    @State private var d: Date = Date()

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader30(title: title, closeTitle: "Ferdig") { apply(d); dismiss() }
            picker
            Spacer(minLength: 0)
        }
        .padding(20)
        .onAppear { d = start }
    }

    private var title: String {
        switch kind {
        case .dl: return "Frist"
        case .due: return "Når"
        case .time: return "Klokkeslett"
        }
    }

    private var start: Date {
        switch kind {
        case .dl: return t?.dl44 ?? Date()
        case .due: return t?.due ?? Date()
        case .time: return Task37Time.date(t?.time ?? "") ?? Date()
        }
    }

    @ViewBuilder private var picker: some View {
        if kind == .time {
            DatePicker("", selection: $d, displayedComponents: .hourAndMinute)
                .datePickerStyle(.wheel).labelsHidden()
                .frame(maxWidth: .infinity)
        } else {
            DatePicker("", selection: $d, displayedComponents: .date)
                .datePickerStyle(.graphical).labelsHidden()
                .tint(Color(hex: "#b23a2a"))
        }
    }
}

/* ---------- Detaljer ---------- */

struct Tasks44Details: View {
    @Environment(\.paper) private var p
    @Binding var note: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("DETALJER").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.mut)
            TextField("Legg til detaljer", text: $note, axis: .vertical)
                .font(PF.serif(16)).foregroundStyle(p.ink)
                .lineLimit(2...12)
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/* ---------- Deloppgaver ---------- */

struct Tasks44SubsCard: View {
    @Environment(\.paper) private var p
    let t: TaskItem17

    var body: some View {
        let c: Color = TasksModel.shared.color(t.list)
        VStack(alignment: .leading, spacing: 8) {
            Tasks44SubsHead(t: t, color: c)
            ForEach(Array(t.subs.enumerated()), id: \.offset) { (pair: (offset: Int, element: TaskSub37)) in
                Tasks44InfoSubRow(taskId: t.id, index: pair.offset, sub: pair.element, color: c)
            }
            Tasks44InfoSubAdd(taskId: t.id)
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

struct Tasks44SubsHead: View {
    @Environment(\.paper) private var p
    let t: TaskItem17
    let color: Color

    var body: some View {
        let done: Int = t.subs.filter { $0.done }.count
        let frac: CGFloat = t.subs.isEmpty ? 0 : CGFloat(done) / CGFloat(t.subs.count)
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("DELOPPGAVER").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.mut)
                Spacer()
                if !t.subs.isEmpty { Text("\(done) av \(t.subs.count)").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut) }
            }
            if !t.subs.isEmpty {
                GeometryReader { (g: GeometryProxy) in
                    ZStack(alignment: .leading) {
                        Capsule().fill(p.line)
                        Capsule().fill(color).frame(width: g.size.width * frac)
                    }
                }
                .frame(height: 4)
            }
        }
    }
}

struct Tasks44InfoSubRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let taskId: String
    let index: Int
    let sub: TaskSub37
    let color: Color

    var body: some View {
        HStack(spacing: 10) {
            Button { Tasks44UI.shared.toggleSub(taskId, index, store) } label: {
                Tasks44Check(on: sub.done, color: color, size: 22, round: true).frame(width: 40, height: 40).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Text(sub.n).font(PF.ui(15)).foregroundStyle(sub.done ? p.mut : p.ink).strikethrough(sub.done)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button { Tasks44UI.shared.removeSub(taskId, index, store) } label: {
                Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(p.mut)
                    .frame(width: 40, height: 40).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Slett deloppgave")
        }
    }
}

/// Stiplet boks «Legg til deloppgave» med rund «+». Enter legger til.
struct Tasks44InfoSubAdd: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let taskId: String
    @State private var text: String = ""

    var body: some View {
        HStack(spacing: 8) {
            TextField("Legg til deloppgave", text: $text)
                .font(PF.ui(15)).foregroundStyle(p.ink)
                .submitLabel(.next)
                .onSubmit { add() }
            Button { add() } label: {
                Image(systemName: "plus").font(.system(size: 14, weight: .bold)).foregroundStyle(p.bg)
                    .frame(width: 32, height: 32).background(p.ink, in: Circle())
                    .frame(width: 44, height: 44).contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Legg til deloppgave")
        }
        .padding(.leading, 12).padding(.trailing, 2)
        .frame(minHeight: 48)
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, style: StrokeStyle(lineWidth: 1.2, dash: [5, 4])))
    }

    private func add() {
        Tasks44UI.shared.addSub(taskId, text, store)
        text = ""
    }
}

/* ---------- Fast knapp nederst ---------- */

struct Tasks44DoneBar: View {
    @Environment(\.paper) private var p
    let t: TaskItem17
    let color: Color
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(t.done ? "Angre fullført" : "Fullfør oppgaven").font(PF.ui(16, .bold))
                .foregroundStyle(t.done ? p.ink : Color.white)
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(t.done ? p.card : color, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(t.done ? p.line : Color.clear, lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16).padding(.bottom, 10).padding(.top, 12)
        .frame(maxWidth: 640)
        .background(LinearGradient(colors: [p.bg.opacity(0), p.bg], startPoint: .top, endPoint: .center).ignoresSafeArea())
    }
}
