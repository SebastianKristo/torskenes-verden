import SwiftUI
import UIKit

/* ---------------- Prompt 51 (IOSFEAT51): felles familiekalender med «hvem kjører?» ----------------
 Server: /api/famcal51/… ($S/SERVER51-API.md, MEDFAM51). Web-fasit: public/js/medfam51.js (#/familiekalender).
 Hendelser de neste fire ukene, bringing/henting som oppgaver med sjåfør («Jeg kjører», «Si fra meg», velg sjåfør, «Gjort»),
 Ruter-forslag per oppgave, ny hendelse og «Vis i Kalender». Åpnes fra Familie (stripen under personene), Mer → Familiekalender,
 varsler (data.kind famcal51 / url /#/familiekalender) og finanshub://familiekalender[/<oppgave-id>]. */

struct Fc51Person: Identifiable, Hashable {
    var id: String { userId }
    let userId: String
    let name: String
    let initials: String
    let color: String
    let me: Bool

    nonisolated static func parse(_ o: [String: Any]?) -> Fc51Person? {
        guard let o, let id = JS.str(o, "userId") else { return nil }
        let n: String = JS.str(o, "name") ?? ""
        return Fc51Person(userId: id, name: n, initials: JS.str(o, "initials") ?? String(n.prefix(1)).uppercased(),
                          color: JS.str(o, "color") ?? "", me: JS.bool(o, "self") ?? false)
    }
}

struct Fc51Task: Identifiable {
    let id: String
    let eventId: String
    let kind: String
    let kindLabel: String
    let title: String
    let atText: String
    let forWho: Fc51Person?
    let note: String
    let assignee: Fc51Person?
    let status: String
    let statusText: String
    let mine: Bool

    nonisolated static func parse(_ o: [String: Any]) -> Fc51Task {
        Fc51Task(id: JS.str(o, "id") ?? "", eventId: JS.str(o, "eventId") ?? "", kind: JS.str(o, "kind") ?? "bringing",
                 kindLabel: JS.str(o, "kindLabel") ?? "", title: JS.str(o, "title") ?? "", atText: JS.str(o, "atText") ?? "",
                 forWho: Fc51Person.parse(JS.dict(o, "for")), note: JS.str(o, "note") ?? "", assignee: Fc51Person.parse(JS.dict(o, "assignee")),
                 status: JS.str(o, "status") ?? "open", statusText: JS.str(o, "statusText") ?? "", mine: JS.bool(o, "mine") ?? false)
    }
}

struct Fc51Event: Identifiable {
    let id: String
    let title: String
    let date: String
    let allDay: Bool
    let time: String
    let place: String
    let note: String
    let createdBy: Fc51Person?
    let canEdit: Bool
    let tasks: [Fc51Task]
    let needsDriverText: String

    nonisolated static func parse(_ o: [String: Any]) -> Fc51Event {
        var place: String = ""
        if let pl = JS.dict(o, "place") { place = JS.str(pl, "name") ?? "" } else { place = JS.str(o, "place") ?? "" }
        return Fc51Event(id: JS.str(o, "id") ?? "", title: JS.str(o, "title") ?? "", date: JS.str(o, "date") ?? "",
                         allDay: JS.bool(o, "allDay") ?? false, time: JS.str(o, "time") ?? "", place: place, note: JS.str(o, "note") ?? "",
                         createdBy: Fc51Person.parse(JS.dict(o, "createdBy")), canEdit: JS.bool(o, "canEdit") ?? false,
                         tasks: JS.list(o, "tasks").map { Fc51Task.parse($0) }, needsDriverText: JS.str(o, "needsDriverText") ?? "")
    }
}

struct Fc51Ruter {
    var busy: Bool = true
    var text: String = ""
    var lines: [String] = []
    var source: String = ""
}

@MainActor
@Observable
final class FamCal51 {
    static let shared = FamCal51()

    var open: Bool = false
    var events: [Fc51Event] = []
    var members: [Fc51Person] = []
    var hasHome: Bool = true
    var drives: [Fc51Task] = []
    var drivesText: String = ""
    var inCalendar: Bool = false
    var loaded: Bool = false
    var error: String = ""
    var toast: String = ""
    var ruter: [String: Fc51Ruter] = [:]
    var focusTask: String? = nil
    var adding: Bool = false

    /// «Ny hendelse» åpnes når siden har kommet opp (ark på en fullskjerm som ennå ikke vises, kan bli borte).
    @ObservationIgnored var pendingAdd: Bool = false

    func show(task: String? = nil, add: Bool = false) {
        focusTask = task
        pendingAdd = add
        Haptics.shared.tap()
        open = true
    }

    func flash(_ t: String) {
        toast = t
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_800_000_000)
            if self.toast == t { self.toast = "" }
        }
    }

    func load(_ store: Store) async {
        let a: API = store.api
        do {
            let ev: Data = try await a.callAt("/api", "GET", "/famcal51/events?from=\(F51.today())&to=\(F51.day(28))", timeout: 20)
            let o: [String: Any] = JS.obj(ev)
            events = JS.list(o, "events").map { Fc51Event.parse($0) }
            members = JS.list(o, "members").compactMap { Fc51Person.parse($0) }
            hasHome = JS.dict(o, "home") != nil
            error = ""
        } catch {
            self.error = F51.err(error)
        }
        await loadDrives(store)
        loaded = true
        if let d = try? await a.callAt("/api", "GET", "/famcal51/settings", timeout: 15) {
            inCalendar = JS.bool(JS.obj(d), "inCalendar") ?? false
        }
    }

    /// Bare «hvem kjører?» (stripen i Familie).
    func loadDrives(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/famcal51/drives?days=14", timeout: 15) else { return }
        let o: [String: Any] = JS.obj(d)
        drives = JS.list(o, "tasks").map { Fc51Task.parse($0) }
        drivesText = JS.str(o, "text") ?? ""
    }

    @discardableResult
    private func send(_ store: Store, _ method: String, _ path: String, _ body: [String: Any]? = nil) async -> [String: Any]? {
        do {
            let d: Data = try await store.api.callAt("/api", method, path, json: body, timeout: 30)
            return JS.obj(d)
        } catch {
            flash(F51.err(error))
            return nil
        }
    }

    func claim(_ t: Fc51Task, _ store: Store) async {
        guard await send(store, "POST", "/famcal51/tasks/\(t.id)/claim") != nil else { return }
        Haptics.shared.tick()
        flash("Du kjører")
        await load(store)
    }

    func release(_ t: Fc51Task, _ store: Store) async {
        guard await send(store, "POST", "/famcal51/tasks/\(t.id)/release") != nil else { return }
        flash("Oppgaven trenger en ny sjåfør")
        await load(store)
    }

    func done(_ t: Fc51Task, _ store: Store) async {
        guard await send(store, "POST", "/famcal51/tasks/\(t.id)/done") != nil else { return }
        flash("Markert som gjort")
        await load(store)
    }

    func assign(_ t: Fc51Task, _ userId: String?, _ store: Store) async {
        let v: Any = userId.map { $0 as Any } ?? NSNull()
        guard let r = await send(store, "PATCH", "/famcal51/tasks/\(t.id)", ["assignee": v]) else { return }
        flash(JS.str(JS.dict(r, "task"), "statusText") ?? "Lagret")
        await load(store)
    }

    func deleteTask(_ t: Fc51Task, _ store: Store) async {
        guard await send(store, "DELETE", "/famcal51/tasks/\(t.id)") != nil else { return }
        flash("Oppgaven er slettet")
        await load(store)
    }

    func deleteEvent(_ e: Fc51Event, _ store: Store) async {
        guard await send(store, "DELETE", "/famcal51/events/\(e.id)") != nil else { return }
        flash("Hendelsen er slettet")
        await load(store)
    }

    func addTask(_ e: Fc51Event, kind: String, _ store: Store) async {
        guard await send(store, "POST", "/famcal51/events/\(e.id)/tasks", ["kind": kind]) != nil else { return }
        flash(kind == "henting" ? "Henting lagt til" : "Bringing lagt til")
        await load(store)
    }

    func loadRuter(_ t: Fc51Task, _ store: Store) async {
        if ruter[t.id] != nil { ruter[t.id] = nil; return }
        ruter[t.id] = Fc51Ruter()
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/famcal51/tasks/\(t.id)/ruter", timeout: 30)
            let o: [String: Any] = JS.obj(d)
            var r: Fc51Ruter = Fc51Ruter(busy: false)
            r.text = JS.str(o, "text") ?? JS.str(o, "error") ?? "Ingen reiseforslag"
            r.source = JS.str(o, "source") ?? ""
            r.lines = JS.list(o, "options").map { (x: [String: Any]) -> String in
                [JS.str(x, "depLabel"), JS.str(x, "arrLabel"), JS.str(x, "strip")].compactMap { $0 }.joined(separator: " · ")
            }
            ruter[t.id] = r
        } catch {
            ruter[t.id] = Fc51Ruter(busy: false, text: F51.err(error))
        }
    }

    func setInCalendar(_ v: Bool, _ store: Store) async {
        inCalendar = v
        if await send(store, "PUT", "/famcal51/settings", ["inCalendar": v]) == nil { inCalendar = !v }
    }

    func create(_ store: Store, title: String, date: Date, start: Date, end: Date, allDay: Bool, place: String, forUser: String?,
                bringing: Bool, henting: Bool, note: String) async -> Bool {
        let t: String = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { flash("Skriv en tittel"); return false }
        let day: String = JS.fmt(date, "yyyy-MM-dd")
        var b: [String: Any] = ["title": t, "allDay": allDay]
        if allDay {
            b["start"] = day
        } else {
            b["start"] = day + "T" + JS.fmt(start, "HH:mm")
            b["end"] = day + "T" + JS.fmt(end > start ? end : start.addingTimeInterval(3600), "HH:mm")
        }
        let pl: String = place.trimmingCharacters(in: .whitespacesAndNewlines)
        if !pl.isEmpty { b["place"] = ["name": pl] }
        let n: String = note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !n.isEmpty { b["note"] = n }
        var tasks: [[String: Any]] = []
        for (k, on) in [("bringing", bringing), ("henting", henting)] where on {
            var x: [String: Any] = ["kind": k]
            if let f = forUser { x["for"] = f }
            tasks.append(x)
        }
        b["tasks"] = tasks
        guard await send(store, "POST", "/famcal51/events", b) != nil else { return false }
        flash("Hendelsen er lagt til")
        await load(store)
        return true
    }

    nonisolated static func dayLabel(_ iso: String) -> String {
        guard let d = parseDay(iso) else { return iso }
        if Calendar.current.isDateInToday(d) { return "I dag" }
        if Calendar.current.isDateInTomorrow(d) { return "I morgen" }
        let s: String = JS.fmt(d, "EEEE d. MMMM")
        return s.prefix(1).uppercased() + s.dropFirst()
    }
}

/* ---------- Siden ---------- */

struct FamCal51Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: FamCal51 { FamCal51.shared }

    var body: some View {
        F51Scaffold(kicker: "Familie · kalender", title: "Familiekalender", sub: sub, toast: m.toast,
                    close: { m.open = false }, refresh: { await m.load(store) }) {
            if !m.loaded {
                F51Loading()
            } else if !m.error.isEmpty && m.events.isEmpty {
                F51Error(text: m.error) { Task { await m.load(store) } }
            } else {
                F51Btn(title: "Ny hendelse", kind: .ink, icon: "plus") { m.adding = true }
                F51Grid {
                    FamCal51Drives()
                    FamCal51Settings()
                }
                FamCal51List()
            }
        }
        .task {
            if m.pendingAdd {
                m.pendingAdd = false
                try? await Task.sleep(nanoseconds: 350_000_000)
                m.adding = true
            }
            await m.load(store)
        }
        .sheet(isPresented: Binding<Bool>(get: { m.adding }, set: { m.adding = $0 })) {
            FamCal51New()
                .environment(\.paper, p)
                .environment(store)
                .presentationDetents([.large])
        }
    }

    private var sub: String {
        let a: String = m.drivesText.isEmpty ? "Henting og bringing for hele familien" : m.drivesText
        return m.hasHome ? a : a + " · legg inn et sted med type hjem i Familie › Steder for Ruter-forslag"
    }
}

struct FamCal51Drives: View {
    @Environment(\.paper) private var p
    @MainActor private var m: FamCal51 { FamCal51.shared }

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 6) {
                Text("Hvem kjører?").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                if m.drives.isEmpty { F51Note(text: "Ingen kjøring de neste to ukene.") }
                ForEach(m.drives) { (t: Fc51Task) in
                    HStack(spacing: 10) {
                        FamCal51Avatar(person: t.assignee)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.title).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                            HStack(spacing: 6) {
                                Text(t.atText).font(PF.ui(12)).foregroundStyle(p.mut)
                                F51Tag(text: t.statusText, tone: t.status == "open" ? .red : .ok)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}

struct FamCal51Avatar: View {
    @Environment(\.paper) private var p
    let person: Fc51Person?

    var body: some View {
        let c: Color = (person?.color ?? "").isEmpty ? p.line : Color(hex: person?.color ?? "")
        Text(person?.initials ?? "?").font(PF.ui(12, .bold)).foregroundStyle(person == nil ? p.mut : .white)
            .frame(width: 34, height: 34)
            .background(c, in: Circle())
            .accessibilityHidden(true)
    }
}

struct FamCal51Settings: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: FamCal51 { FamCal51.shared }

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 6) {
                Toggle(isOn: Binding<Bool>(get: { m.inCalendar }, set: { (v: Bool) in Task { await m.setInCalendar(v, store) } })) {
                    Text("Vis familiekalenderen i Kalender").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                }
                .tint(p.pos)
                F51Note(text: "Hendelsene vises da også i Kalender med sjåføren i notatet.")
            }
        }
    }
}

struct FamCal51List: View {
    @Environment(\.paper) private var p
    @MainActor private var m: FamCal51 { FamCal51.shared }

    var body: some View {
        let days: [String] = m.events.reduce(into: [String]()) { (a: inout [String], e: Fc51Event) in if !a.contains(e.date) { a.append(e.date) } }
        VStack(alignment: .leading, spacing: 10) {
            Text("Kommende").font(PF.serif(22, medium: true)).foregroundStyle(p.ink).padding(.top, 4)
            if m.events.isEmpty { PCard { F51Note(text: "Ingen hendelser de neste fire ukene.") } }
            ForEach(days, id: \.self) { (d: String) in
                PLabel(text: FamCal51.dayLabel(d), color: p.mut).padding(.top, 6)
                F51Grid {
                    ForEach(m.events.filter { $0.date == d }) { (e: Fc51Event) in FamCal51EventCard(e: e) }
                }
            }
        }
    }
}

struct FamCal51EventCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: FamCal51 { FamCal51.shared }
    let e: Fc51Event
    @State private var confirm: Bool = false

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 8) {
                Text(e.title).font(PF.ui(16, .bold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                Text(meta).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                if !e.note.isEmpty { F51Note(text: e.note) }
                ForEach(e.tasks) { (t: Fc51Task) in FamCal51TaskRow(t: t) }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        F51Btn(title: "Bringing", icon: "plus") { Task { await m.addTask(e, kind: "bringing", store) } }
                        F51Btn(title: "Henting", icon: "plus") { Task { await m.addTask(e, kind: "henting", store) } }
                        if e.canEdit { F51Btn(title: "Slett hendelsen", kind: .red) { confirm = true } }
                    }
                }
            }
        }
        .confirmationDialog("Slette hendelsen og kjøreoppgavene?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Slett", role: .destructive) { Task { await m.deleteEvent(e, store) } }
            Button("Avbryt", role: .cancel) {}
        }
    }

    private var meta: String {
        var parts: [String] = [e.allDay ? "Hele dagen" : e.time]
        if !e.place.isEmpty { parts.append(e.place) }
        if let c = e.createdBy { parts.append("lagt inn av " + (c.me ? "deg" : c.name)) }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

struct FamCal51TaskRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: FamCal51 { FamCal51.shared }
    let t: Fc51Task
    @State private var confirm: Bool = false

    var body: some View {
        let focus: Bool = m.focusTask == t.id
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 10) {
                FamCal51Avatar(person: t.assignee)
                VStack(alignment: .leading, spacing: 3) {
                    Text(headline).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 6) {
                        F51Tag(text: t.statusText, tone: t.status == "open" ? .red : .ok)
                        if !t.note.isEmpty { Text(t.note).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2) }
                    }
                }
            }
            .accessibilityElement(children: .combine)
            actions
            if let r = m.ruter[t.id] { ruterBox(r) }
        }
        .padding(10)
        .background(focus ? p.lab.opacity(0.08) : p.bg.opacity(0.6), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .confirmationDialog("Slette kjøreoppgaven?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Slett", role: .destructive) { Task { await m.deleteTask(t, store) } }
            Button("Avbryt", role: .cancel) {}
        }
    }

    private var headline: String {
        var s: String = t.kindLabel + " " + t.atText
        if let f = t.forWho { s += " · " + (f.me ? "deg" : f.name) }
        return s
    }

    private var actions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                if t.status != "done" && !t.mine { F51Btn(title: "Jeg kjører", kind: .ink) { Task { await m.claim(t, store) } } }
                if t.mine && t.status != "done" { F51Btn(title: "Si fra meg") { Task { await m.release(t, store) } } }
                driverMenu
                F51Btn(title: "Ruter-forslag", icon: "tram") { Task { await m.loadRuter(t, store) } }
                if t.status != "done" { F51Btn(title: "Gjort", icon: "checkmark") { Task { await m.done(t, store) } } }
                F51Btn(title: "Slett", kind: .red) { confirm = true }
            }
        }
    }

    private var driverMenu: some View {
        Menu {
            Button("Ingen") { Task { await m.assign(t, nil, store) } }
            ForEach(m.members) { (p0: Fc51Person) in
                Button(p0.me ? p0.name + " (deg)" : p0.name) { Task { await m.assign(t, p0.userId, store) } }
            }
        } label: {
            Text("Sjåfør: " + (t.assignee?.name ?? "ingen") + " ▾").font(PF.ui(13, .bold)).foregroundStyle(p.ink).lineLimit(1)
                .padding(.horizontal, 14).frame(minHeight: 36)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .frame(minHeight: 44)
        }
        .accessibilityLabel("Velg sjåfør")
    }

    private func ruterBox(_ r: Fc51Ruter) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            if r.busy {
                F51Loading(text: "Henter reiseforslag …")
            } else {
                Text(r.text).font(PF.ui(13, .bold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                ForEach(Array(r.lines.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                    Text(pair.element).font(PF.mono(11.5, bold: false)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                if !r.source.isEmpty { Text("Kilde: " + r.source).font(PF.ui(11.5)).foregroundStyle(p.mut) }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// Ny hendelse (tittel, dato, tid, sted, hvem det gjelder og om noen må bringe/hente).
struct FamCal51New: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: FamCal51 { FamCal51.shared }

    @State private var title: String = ""
    @State private var date: Date = Date()
    @State private var start: Date = Calendar.current.date(bySettingHour: 17, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var end: Date = Calendar.current.date(bySettingHour: 18, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var allDay: Bool = false
    @State private var place: String = ""
    @State private var forUser: String? = nil
    @State private var bringing: Bool = false
    @State private var henting: Bool = false
    @State private var note: String = ""
    @State private var busy: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Ny hendelse").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                F51Field(label: "Tittel", text: $title, placeholder: "Fotballtrening")
                times
                F51Field(label: "Sted", text: $place, placeholder: "Hallen")
                forPicker
                Toggle(isOn: $bringing) { Text("Trenger bringing").font(PF.ui(14, .semibold)).foregroundStyle(p.ink) }.tint(p.pos)
                Toggle(isOn: $henting) { Text("Trenger henting").font(PF.ui(14, .semibold)).foregroundStyle(p.ink) }.tint(p.pos)
                F51Field(label: "Notat", text: $note, placeholder: "Ta med drikkeflaske")
                HStack(spacing: 8) {
                    F51Btn(title: "Legg til", kind: .ink, busy: busy) { save() }
                    F51Btn(title: "Avbryt") { m.adding = false }
                }
            }
            .padding(22)
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private var times: some View {
        VStack(alignment: .leading, spacing: 8) {
            DatePicker("Dato", selection: $date, displayedComponents: .date)
            Toggle(isOn: $allDay) { Text("Hele dagen").font(PF.ui(14, .semibold)).foregroundStyle(p.ink) }.tint(p.pos)
            if !allDay {
                DatePicker("Start", selection: $start, displayedComponents: .hourAndMinute)
                DatePicker("Slutt", selection: $end, displayedComponents: .hourAndMinute)
            }
        }
        .font(PF.ui(14))
        .environment(\.locale, Locale(identifier: "nb_NO"))
    }

    private var forPicker: some View {
        let cur: String = m.members.first(where: { $0.userId == forUser }).map { $0.me ? $0.name + " (deg)" : $0.name } ?? "Ingen bestemt"
        return VStack(alignment: .leading, spacing: 4) {
            Text("Gjelder").font(PF.ui(12, .semibold)).foregroundStyle(p.mut)
            Menu {
                Button("Ingen bestemt") { forUser = nil }
                ForEach(m.members) { (x: Fc51Person) in
                    Button(x.me ? x.name + " (deg)" : x.name) { forUser = x.userId }
                }
            } label: {
                Text(cur + " ▾").font(PF.ui(14)).foregroundStyle(p.ink)
                    .padding(.horizontal, 12).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .background(p.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
            }
        }
    }

    private func save() {
        busy = true
        Task { @MainActor in
            let ok: Bool = await m.create(store, title: title, date: date, start: start, end: end, allDay: allDay, place: place,
                                          forUser: forUser, bringing: bringing, henting: henting, note: note)
            busy = false
            if ok { m.adding = false }
        }
    }
}

/// Stripen i Familie (under personene): «Familiekalender · 1 uten sjåfør ›».
struct FamCal51Strip: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: FamCal51 { FamCal51.shared }

    var body: some View {
        Button { m.show() } label: {
            HStack(spacing: 10) {
                Image(systemName: "car.fill").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.lab).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Familiekalender · hvem kjører?").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                    Text(m.drivesText.isEmpty ? "Henting og bringing for hele familien" : m.drivesText).font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer(minLength: 6)
                Text("›").font(PF.ui(18, .bold)).foregroundStyle(p.mut).accessibilityHidden(true)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glass50Card(p, radius: 18)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .task { if m.drivesText.isEmpty { await m.loadDrives(store) } }
    }
}
