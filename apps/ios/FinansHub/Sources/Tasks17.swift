import SwiftUI
import WidgetKit
import CoreLocation

/// Avstand i meter mellom to punkter (for «er i sonen»).
func famDistance(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> Double {
    CLLocation(latitude: a.latitude, longitude: a.longitude).distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude))
}

/* ---------------- Huskeliste (prompt 17): /api/tasks, delt i familien, sanntid via /api/ws ---------------- */

struct TaskList17: Identifiable, Hashable {
    var id: String
    var name: String
    var color: String
    /// Prompt 21: eier (bruker-id) og navn, og hvem listen er delt med. Tomt fra eldre servere.
    var owner: String = ""
    var ownerName: String = ""
    var memberIds: [String] = []
    var memberNames: [String] = []
    /// `mine` fra serveren. nil = eldre server (alle lister regnes som egne).
    var mineFlag: Bool? = nil
    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        name = JS.str(o, "name") ?? "Liste"
        color = JS.str(o, "color") ?? "#1b1a17"
        let share: TaskListShare21 = TaskListShare21(o)
        owner = share.owner
        ownerName = share.ownerName
        memberIds = share.ids
        memberNames = share.names
        mineFlag = JS.bool(o, "mine")
    }
    init(id: String, name: String, color: String) { self.id = id; self.name = name; self.color = color }
}

struct TaskItem17: Identifiable, Hashable {
    var id: String
    var title: String
    var list: String
    var due: Date?
    var assignee: String?
    var note: String
    var done: Bool
    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        title = JS.str(o, "title") ?? ""
        list = JS.str(o, "list") ?? "hjem"
        due = JS.str(o, "due").flatMap { parseDay($0) }
        assignee = JS.str(o, "assignee")
        note = JS.str(o, "note") ?? ""
        done = JS.bool(o, "done") ?? false
    }
}

struct TaskMember17: Identifiable, Hashable {
    var id: String
    var name: String
    var username: String = ""
    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? ""
        name = JS.str(o, "name") ?? JS.str(o, "username") ?? "–"
        username = JS.str(o, "username") ?? ""
    }
    var first: String { name.split(separator: " ").first.map(String.init) ?? name }
}

@MainActor
@Observable
final class TasksModel {
    static let shared = TasksModel()
    var lists: [TaskList17] = [
        TaskList17(id: "hjem", name: "Hjem", color: "#b23a2a"), TaskList17(id: "handel", name: "Handel", color: "#2f6b45"),
        TaskList17(id: "hytta", name: "Hytta", color: "#a8661a"), TaskList17(id: "jobb", name: "Jobb", color: "#2b5d8a"),
    ]
    var items: [TaskItem17] = []
    var members: [TaskMember17] = []
    var loaded = false
    var error: String?

    var openCount: Int { items.filter { !$0.done }.count }

    func color(_ list: String) -> Color { Color(hex: lists.first { $0.id == list }?.color ?? "#1b1a17") }
    func listName(_ list: String) -> String { lists.first { $0.id == list }?.name ?? list }
    func memberName(_ id: String?) -> String? {
        guard let id, !id.isEmpty else { return nil }
        return members.first { $0.id == id }?.first ?? id
    }

    func load(_ store: Store) async {
        do {
            let d = try await store.api.callAt("/api", "GET", "/tasks", timeout: 15)
            let o = JS.obj(d)
            let ls = JS.list(o, "lists").map { TaskList17($0) }
            if !ls.isEmpty { lists = ls }
            items = JS.list(o, "items").map { TaskItem17($0) }
            members = JS.list(o, "members").map { TaskMember17($0) }
            error = nil
            // Prompt 21: eier og deling fra /api/tasks/lists (eldre servere: 404, da beholdes listene over).
            await loadListSharing(store)
        } catch let e as APIError {
            error = e.status == 404 ? "Huskelisten finnes ikke på serveren ennå. Oppdater homelab." : e.message
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
        WidgetCenter.shared.reloadTimelines(ofKind: "no.kristo.finanshub.tasks")
    }

    func add(_ title: String, list: String, due: Date?, assignee: String?, _ store: Store) {
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        var body: [String: Any] = ["title": t, "list": list]
        if let due { body["due"] = JS.fmt(due, "yyyy-MM-dd") }
        if let assignee, !assignee.isEmpty { body["assignee"] = assignee }
        Haptics.shared.success()
        Task {
            do {
                _ = try await store.api.callAt("/api", "POST", "/tasks", json: body)
                await self.load(store)
            } catch {
                store.flash("Kunne ikke lagre oppgaven: \(error.localizedDescription)")
            }
        }
    }

    func toggle(_ t: TaskItem17, _ store: Store) {
        if let i = items.firstIndex(where: { $0.id == t.id }) { items[i].done.toggle() }
        Haptics.shared.tick()
        let id = t.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? t.id
        let v = !t.done
        Task {
            _ = try? await store.api.callAt("/api", "PATCH", "/tasks/\(id)", json: ["done": v])
            WidgetCenter.shared.reloadTimelines(ofKind: "no.kristo.finanshub.tasks")
        }
    }

    func update(_ t: TaskItem17, title: String, list: String, due: Date?, assignee: String?, _ store: Store) {
        let id = t.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? t.id
        var body: [String: Any] = ["title": title, "list": list, "due": NSNull(), "assignee": NSNull()]
        if let due { body["due"] = JS.fmt(due, "yyyy-MM-dd") }
        if let assignee, !assignee.isEmpty { body["assignee"] = assignee }
        Task {
            _ = try? await store.api.callAt("/api", "PATCH", "/tasks/\(id)", json: body)
            await self.load(store)
        }
    }

    func delete(_ t: TaskItem17, _ store: Store) {
        items.removeAll { $0.id == t.id }
        let id = t.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? t.id
        Task {
            _ = try? await store.api.callAt("/api", "DELETE", "/tasks/\(id)")
            WidgetCenter.shared.reloadTimelines(ofKind: "no.kristo.finanshub.tasks")
        }
    }

    func clearDone(_ list: String?, _ store: Store) {
        items.removeAll { $0.done && (list == nil || $0.list == list) }
        var body: [String: Any] = [:]
        if let list { body["list"] = list }
        Task { _ = try? await store.api.callAt("/api", "POST", "/tasks/clear-done", json: body) }
    }

    /// De neste oppgavene (forfalte og i dag først, deretter etter dato).
    var next: [TaskItem17] {
        items.filter { !$0.done }.sorted { a, b in
            (a.due ?? .distantFuture) < (b.due ?? .distantFuture)
        }
    }

    static func dueText(_ d: Date?) -> (String, Bool) {
        guard let d else { return ("", false) }
        let cal = Calendar.current
        let n = cal.dateComponents([.day], from: cal.startOfDay(for: Date()), to: cal.startOfDay(for: d)).day ?? 0
        if n < 0 { return ("Forfalt \(-n) d", true) }
        if n == 0 { return ("I dag", true) }
        if n == 1 { return ("I morgen", false) }
        return (JS.fmt(d, "EEE d. MMM"), false)
    }
}

struct PaperTasksView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.paperWide) private var wide
    @State private var text = ""
    @State private var editing: TaskItem17?
    /// Prompt 22: valgt liste, frist og person deles med feltet over fanelinjen (TaskDock22).
    @MainActor private var cur: String {
        get { TaskDock22.shared.cur }
        nonmutating set { TaskDock22.shared.cur = newValue }
    }
    @MainActor private var dueDays: Int? {
        get { TaskDock22.shared.dueDays }
        nonmutating set { TaskDock22.shared.dueDays = newValue }
    }
    @MainActor private var who: String {
        get { TaskDock22.shared.who }
        nonmutating set { TaskDock22.shared.who = newValue }
    }
    @FocusState private var focused: Bool
    @MainActor private var m: TasksModel { TasksModel.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            listChips
            if let l = m.lists.first(where: { $0.id == cur }) { TaskListHeader21(list: l) }
            // Prompt 22: på telefon ligger feltet fast over fanelinjen (TaskDockField22), ikke øverst.
            if wide { addField }
            options
            if let e = m.error { PCard { Text(e).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true) } }
            ForEach(groups, id: \.0) { g in
                PLabel(text: g.0, color: g.1).padding(.leading, 4).padding(.top, 2)
                groupCard(g.2)
            }
            if inList.isEmpty && m.loaded {
                Text("Ingen oppgaver i \(curName).").font(PF.ui(14)).foregroundStyle(p.mut).padding(.horizontal, 4).padding(.vertical, 16)
            }
            if inList.contains(where: { $0.done }) {
                Button { m.clearDone(cur == "alle" ? nil : cur, store) } label: {
                    Text("Fjern ferdige").font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
                }
                .buttonStyle(.plain).padding(.leading, 4)
            }
            TaskHASection22()
            Text("Widgeten «Huskeliste» på hjemskjermen viser de tre neste oppgavene, og du kan krysse av rett i den.")
                .font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 4).padding(.top, 6).fixedSize(horizontal: false, vertical: true)
        }
        .task { await m.load(store) }
        .sheet(item: $editing) { t in
            TaskEditSheet(task: t) { editing = nil }.environment(\.paper, p).presentationDetents([.medium, .large]).presentationBackground(p.bg)
        }
    }

    private var curName: String { cur == "alle" ? "Alle" : m.listName(cur) }

    private var inList: [TaskItem17] { m.items.filter { cur == "alle" || $0.list == cur } }

    private var groups: [(String, Color, [TaskItem17])] {
        let today = Calendar.current.startOfDay(for: Date())
        let open = inList.filter { !$0.done }
        let soon = open.filter { t in t.due.map { Calendar.current.startOfDay(for: $0) <= today } ?? false }
        let later = open.filter { t in !(t.due.map { Calendar.current.startOfDay(for: $0) <= today } ?? false) }
            .sorted { ($0.due ?? .distantFuture) < ($1.due ?? .distantFuture) }
        let done = inList.filter { $0.done }
        var out: [(String, Color, [TaskItem17])] = []
        if !soon.isEmpty { out.append(("I dag og forfalt", p.lab, soon)) }
        if !later.isEmpty { out.append(("Senere", p.mut, later)) }
        if !done.isEmpty { out.append(("Ferdig", p.pos, done)) }
        return out
    }

    private var listChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                chip("alle", "Alle", p.ink, m.openCount)
                ForEach(m.lists) { l in
                    chip(l.id, l.name, Color(hex: l.color), m.items.filter { $0.list == l.id && !$0.done }.count)
                }
            }
        }
    }

    private func chip(_ id: String, _ name: String, _ c: Color, _ n: Int) -> some View {
        let on = cur == id
        return Button { cur = id; Haptics.shared.select() } label: {
            HStack(spacing: 8) {
                // Prompt 22: «Alle» har ingen fargeprikk.
                if id != "alle" { Circle().fill(c).frame(width: 9, height: 9) }
                Text(name).font(PF.ui(13, .bold))
                if n > 0 { Text("\(n)").font(PF.ui(12, .semibold)).opacity(0.6) }
            }
            .foregroundStyle(on ? p.bg : p.ink)
            .padding(.horizontal, 14).frame(height: 38)
            .background(on ? p.ink : p.card, in: Capsule())
            .overlay(Capsule().stroke(on ? p.ink : Color.clear, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var addField: some View {
        HStack(spacing: 8) {
            TextField("Ny oppgave i \(curName)", text: $text)
                .font(PF.ui(15, .medium))
                .padding(.horizontal, 16).frame(height: 48)
                .background(p.card, in: Capsule())
                .focused($focused)
                .submitLabel(.done)
                .onSubmit { add() }
            Button { add() } label: {
                Image(systemName: "plus").font(.system(size: 18, weight: .bold)).foregroundStyle(p.onLab)
                    .frame(width: 48, height: 48).background(p.lab, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Legg til")
        }
    }

    private var options: some View {
        let dues: [(String, Int?)] = [("I dag", 0), ("I morgen", 1), ("Neste uke", 7), ("Uten dato", nil)]
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(dues, id: \.0) { d in
                    smallChip(d.0, dueDays == d.1) { dueDays = d.1 }
                }
                smallChip("Meg", who.isEmpty) { who = "" }
                ForEach(m.members.filter { $0.id != FamilyModel.shared.meId }) { mem in
                    smallChip(mem.first, who == mem.id) { who = mem.id }
                }
            }
        }
    }

    private func smallChip(_ t: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button { act(); Haptics.shared.select() } label: {
            // Prompt 22: valgt chip er fylt (blekk-bakgrunn, lys tekst), uvalgt er kortfarge med tynn kant.
            Text(t).font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.bg : p.ink).padding(.horizontal, 12).frame(height: 32)
                .background(on ? p.ink : p.card, in: Capsule())
                .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func add() {
        let list = cur == "alle" ? (m.lists.first?.id ?? "hjem") : cur
        let due = dueDays.flatMap { Calendar.current.date(byAdding: .day, value: $0, to: Date()) }
        m.add(text, list: list, due: due, assignee: who.isEmpty ? nil : who, store)
        text = ""
    }

    private func groupCard(_ list: [TaskItem17]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.element.id) { i, t in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                row(t)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 2)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func row(_ t: TaskItem17) -> some View {
        let c = m.color(t.list)
        let dt = TasksModel.dueText(t.due)
        let meta = [dt.0, m.memberName(t.assignee) ?? "", cur == "alle" ? m.listName(t.list) : ""].filter { !$0.isEmpty }.joined(separator: " · ")
        return HStack(spacing: 12) {
            Button { m.toggle(t, store) } label: {
                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(c, lineWidth: 2)
                    if t.done {
                        RoundedRectangle(cornerRadius: 8, style: .continuous).fill(c)
                        Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                    }
                }
                .frame(width: 26, height: 26)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(t.done ? "Marker som ikke ferdig" : "Fullfør")
            Button { editing = t } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.title).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).strikethrough(t.done).lineLimit(2)
                    if !meta.isEmpty { Text(meta).font(PF.ui(12)).foregroundStyle(t.done ? p.mut : (dt.1 ? p.lab : p.mut)) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .opacity(t.done ? 0.55 : 1)
        .frame(minHeight: 54)
        .contextMenu {
            Button { editing = t } label: { Label("Endre", systemImage: "pencil") }
            Button(role: .destructive) { m.delete(t, store) } label: { Label("Slett", systemImage: "trash") }
        }
    }
}

/// Endre en oppgave: tittel, liste, forfall og hvem.
struct TaskEditSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let task: TaskItem17
    let close: () -> Void
    @State private var title = ""
    @State private var list = "hjem"
    @State private var hasDue = false
    @State private var due = Date()
    @State private var who = ""
    @State private var confirmDelete = false
    @MainActor private var m: TasksModel { TasksModel.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Oppgave").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                TextField("Tittel", text: $title).font(PF.serif(19)).padding(.vertical, 8)
                    .overlay(alignment: .bottom) { Rectangle().fill(p.lab).frame(height: 2) }
                PLabel(text: "Liste")
                HStack(spacing: 6) {
                    ForEach(m.lists) { l in
                        Button { list = l.id } label: {
                            Text(l.name).font(PF.ui(13, .semibold)).foregroundStyle(list == l.id ? p.bg : p.ink).padding(.horizontal, 12).frame(height: 32)
                                .background(list == l.id ? Color(hex: l.color) : p.card, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                Toggle(isOn: $hasDue) { Text("Forfall").font(PF.ui(15, .semibold)).foregroundStyle(p.ink) }.tint(p.pos)
                if hasDue { DatePicker("Dato", selection: $due, displayedComponents: .date).datePickerStyle(.compact) }
                PLabel(text: "Hvem")
                HStack(spacing: 6) {
                    whoChip("Ingen", "")
                    ForEach(m.members) { mem in whoChip(mem.first, mem.id) }
                }
                HStack(spacing: 10) {
                    PLineButton(title: confirmDelete ? "Trykk igjen for å slette" : "Slett", height: 46, full: true) {
                        if confirmDelete { m.delete(task, store); close() } else { confirmDelete = true }
                    }
                    PInkButton(title: "Lagre", height: 46, full: true) {
                        m.update(task, title: title, list: list, due: hasDue ? due : nil, assignee: who.isEmpty ? nil : who, store)
                        close()
                    }
                }
                .padding(.top, 8)
            }
            .padding(20)
        }
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onAppear {
            title = task.title
            list = task.list
            hasDue = task.due != nil
            due = task.due ?? Date()
            who = task.assignee ?? ""
        }
    }

    private func whoChip(_ t: String, _ id: String) -> some View {
        Button { who = id } label: {
            Text(t).font(PF.ui(13, .semibold)).foregroundStyle(who == id ? p.bg : p.ink).padding(.horizontal, 12).frame(height: 32)
                .background(who == id ? p.ink : p.card, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Hjem-kortene: Huskeliste, Posisjon og Bolig ---------- */

/// «HUSKELISTE · N IGJEN» med de tre neste oppgavene og avkrysning.
struct PaperTasksCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: TasksModel { TasksModel.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                PLabel(text: "Huskeliste · \(m.openCount) igjen")
                Spacer()
                Button { store.paperGo("huske") } label: { Text("alle ›").font(PF.ui(12)).foregroundStyle(p.mut) }.buttonStyle(.plain)
            }
            let top = Array(m.next.prefix(3))
            if top.isEmpty {
                Text(m.loaded ? "Alt er gjort." : "Henter …").font(PF.ui(14)).foregroundStyle(p.mut)
            }
            ForEach(top) { t in
                HStack(spacing: 10) {
                    Button { m.toggle(t, store) } label: {
                        RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(m.color(t.list), lineWidth: 2).frame(width: 22, height: 22)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Fullfør \(t.title)")
                    Text(t.title).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    Spacer(minLength: 4)
                    let dt = TasksModel.dueText(t.due)
                    Text(dt.0).font(PF.ui(12)).foregroundStyle(dt.1 ? p.lab : p.mut)
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .onTapGesture { store.paperGo("huske") }
        .task { if !m.loaded { await m.load(store) } }
    }
}

// «POSISJON · FAMILIE»-kortet (PaperFamilyCard) ligger i Positions20.swift (prompt 20).

/// «BOLIG»: brukt mot budsjett denne måneden, ting til gjennomgang og neste faste utgift (åpner Boliger).
struct PaperHomeBoligCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        Button { store.paperFinGo("boliger") } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    PLabel(text: "Bolig")
                    Spacer()
                    Text("Boliger ›").font(PF.ui(12)).foregroundStyle(p.mut)
                }
                if let f = store.folders?.first {
                    Text(f.name).font(PF.serif(20, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    HStack(spacing: 14) {
                        stat("I år", f.yearTotal.map { kr($0) } ?? "–")
                        stat("Til gjennomgang", "\(store.boot?.reviewCount ?? 0)")
                        if let u = f.upcoming?.first { stat("Neste", "\(u.title ?? "") · \(kr(u.amount ?? 0))") }
                    }
                } else {
                    Text("Ingen boliger ennå. Legg til en bolig i Finans → Boliger.").font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
        .task { if store.folders == nil { await store.loadBoligerList() } }
    }

    private func stat(_ k: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(k.uppercased()).font(PF.mono(9.5)).tracking(1).foregroundStyle(p.mut)
            Text(v).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
        }
    }

    private func kr(_ v: Double) -> String { "\(n0(v)) kr" }
}

/* ---------- Sporing: velg flere, arkiv og bulk-handlinger ---------- */

/// Hold inne en pakke for å velge den. Menyen har Velg alle, Arkiver (Gjenopprett i Arkiv) og Slett (bekreftes).
@MainActor
@Observable
final class TrackSelect {
    static let shared = TrackSelect()
    var ids: Set<String> = []
    var active = false
    var confirmDelete = false
    var archived: [Shipment] = []
    var archivedLoaded = false

    func start(_ id: String) {
        active = true
        ids = [id]
        confirmDelete = false
        Haptics.shared.tick()
    }

    func toggle(_ id: String) {
        if ids.contains(id) { ids.remove(id) } else { ids.insert(id) }
        if ids.isEmpty { active = false }
        confirmDelete = false
        Haptics.shared.select()
    }

    func end() {
        active = false
        ids = []
        confirmDelete = false
    }

    func loadArchived(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/tracking?archived=1", timeout: 15) else { archivedLoaded = true; return }
        archived = TrackingData.parse(d).items.filter { $0.archived }
        archivedLoaded = true
    }

    /// POST /api/tracking/bulk {ids, action: archive | unarchive | delete}.
    func run(_ action: String, _ store: Store) {
        let list = Array(ids)
        guard !list.isEmpty else { return }
        if action == "delete" && !confirmDelete { confirmDelete = true; Haptics.shared.tick(); return }
        let n = list.count
        end()
        Task {
            do {
                _ = try await store.api.callAt("/api", "POST", "/tracking/bulk", json: ["ids": list, "action": action])
                let word = action == "delete" ? "slettet" : action == "archive" ? "arkivert" : "hentet tilbake"
                store.flash("\(n) \(n == 1 ? "sending" : "sendinger") \(word)")
                Haptics.shared.success()
            } catch {
                store.flash("Kunne ikke endre sendingene: \(error.localizedDescription)")
            }
            try? await store.loadTracking()
            await self.loadArchived(store)
        }
    }
}

/// Linjen øverst når pakker er valgt.
struct TrackSelectBar: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let all: [Shipment]
    let inArchive: Bool
    @MainActor private var sel: TrackSelect { TrackSelect.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("\(sel.ids.count) valgt").font(PF.ui(14, .bold)).foregroundStyle(p.bg)
                Spacer()
                Button { sel.ids = Set(all.map(\.id)); Haptics.shared.select() } label: {
                    Text("Velg alle").font(PF.ui(13, .semibold)).foregroundStyle(p.bg)
                }
                .buttonStyle(.plain)
                Button { sel.end() } label: {
                    Text("Ferdig").font(PF.ui(13, .bold)).foregroundStyle(p.ink).padding(.horizontal, 12).frame(height: 30).background(p.bg, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            HStack(spacing: 8) {
                Button { sel.run(inArchive ? "unarchive" : "archive", store) } label: {
                    Text(inArchive ? "Gjenopprett" : "Arkiver").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
                        .frame(maxWidth: .infinity, minHeight: 38).background(p.bg, in: Capsule())
                }
                .buttonStyle(.plain)
                Button { sel.run("delete", store) } label: {
                    Text(sel.confirmDelete ? "Trykk igjen for å slette" : "Slett").font(PF.ui(13.5, .bold)).foregroundStyle(p.onLab)
                        .frame(maxWidth: .infinity, minHeight: 38).background(p.lab, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(p.ink, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
