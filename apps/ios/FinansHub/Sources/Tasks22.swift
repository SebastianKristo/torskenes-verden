import SwiftUI

/* ---------------- Huskeliste, prompt 22 ---------------- */
// 1) Feltet «Ny oppgave …» ligger fast over fanelinjen (ved siden av FAB-en, som viser +) og flytter seg med tastaturet.
// 2) Valgt liste, frist og person deles mellom siden og feltet (TaskDock22).
// 3) «SYNK MED HOME ASSISTANT» for admin: GET/PUT /api/tasks/ha, PUT /api/tasks/ha/map, POST /api/tasks/ha/sync og /create.

@MainActor
@Observable
final class TaskDock22 {
    static let shared = TaskDock22()
    /// Valgt liste («alle» eller liste-id), frist i dager (nil = uten dato) og person ("" = meg).
    var cur: String = "alle"
    var dueDays: Int? = 0
    var who: String = ""
    var text: String = ""
    /// Økes for å be feltet om fokus (FAB med tomt felt).
    var focusTick: Int = 0

    /// FAB / Enter: legg til oppgaven i valgt liste med valgt frist og person, eller fokuser feltet hvis det er tomt.
    func submit(_ store: Store) {
        let t: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty {
            focusTick += 1
            return
        }
        let m: TasksModel = TasksModel.shared
        let list: String = cur == "alle" ? (m.lists.first?.id ?? "hjem") : cur
        let due: Date? = dueDays.flatMap { Calendar.current.date(byAdding: .day, value: $0, to: Date()) }
        m.add(t, list: list, due: due, assignee: who.isEmpty ? nil : who, store)
        text = ""
    }
}

/// Feltet over fanelinjen (Mobil Papir App.dc.html: 60 pt høyt, radius 22, kortfarge og skygge).
struct TaskDockField22: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    /// Uten flytende FAB får feltet sin egen +-knapp.
    let ownButton: Bool
    @FocusState private var focused: Bool

    var body: some View {
        let d: TaskDock22 = TaskDock22.shared
        HStack(spacing: 10) {
            TextField("", text: Binding(get: { d.text }, set: { d.text = $0 }), prompt: Text("Ny oppgave …").foregroundColor(p.mut))
                .font(PF.ui(16, .medium)).foregroundStyle(p.ink)
                .focused($focused)
                .submitLabel(.done)
                .onSubmit { d.submit(store) }
                .padding(.horizontal, 20).frame(height: 60)
                .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .shadow(color: Color.black.opacity(0.4), radius: 15, y: 14)
                .shadow(color: Color.black.opacity(0.12), radius: 3, y: 2)
            if ownButton {
                Button { d.submit(store) } label: {
                    Image(systemName: "plus").font(.system(size: 24, weight: .semibold)).foregroundStyle(p.onLab)
                        .frame(width: 60, height: 60)
                        .background(p.lab, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Legg til oppgave")
            }
        }
        .onChange(of: d.focusTick) { _, _ in focused = true }
    }
}

/* ---------- Synk med Home Assistant ---------- */

struct TaskHAState22 {
    var enabled: Bool = false
    var status: String = "off"
    var syncedAt: Date? = nil
    var error: String = ""
    var entities: [(String, String)] = []
    var maps: [String: String] = [:]

    init() {}
    init(_ o: [String: Any]) {
        enabled = JS.bool(o, "enabled") ?? false
        status = JS.str(o, "status") ?? (enabled ? "connecting" : "off")
        syncedAt = JS.date(o["syncedAt"])
        error = JS.str(o, "error") ?? ""
        entities = JS.list(o, "entities").compactMap { e -> (String, String)? in
            guard let id = JS.str(e, "entity_id") ?? JS.str(e, "entityId") else { return nil }
            return (id, JS.str(e, "name") ?? id)
        }
        var mm: [String: String] = [:]
        for r in JS.list(o, "maps") {
            if let l = JS.str(r, "listId") ?? JS.str(r, "list_id"), let e = JS.str(r, "entityId") ?? JS.str(r, "entity_id") { mm[l] = e }
        }
        maps = mm
    }
}

/// Seksjonen nederst på Huskeliste (bare admin). Skjules når serveren ikke har endepunktet (404) eller nekter (403).
struct TaskHASection22: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var st: TaskHAState22? = nil
    @State private var busy: Bool = false
    @MainActor private var m: TasksModel { TasksModel.shared }

    var body: some View {
        Group {
            if let s = st {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("SYNK MED HOME ASSISTANT").font(PF.mono(10.5)).tracking(1.26).foregroundStyle(p.lab)
                        Spacer()
                        Text(statusText(s)).font(PF.ui(12)).foregroundStyle(s.status == "error" ? p.lab : p.mut)
                    }
                    .padding(.horizontal, 4)
                    card(s)
                    if s.status == "error" && !s.error.isEmpty {
                        Text(s.error).font(PF.ui(12)).foregroundStyle(p.lab).padding(.horizontal, 4).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, 6)
            }
        }
        .task { await load() }
    }

    private func statusText(_ s: TaskHAState22) -> String {
        if !s.enabled { return "Av" }
        switch s.status {
        case "ok": return s.syncedAt.map { "Synket " + JS.fmt($0, "HH:mm") } ?? "Synket"
        case "error": return "Feil · prøv igjen"
        default: return "Kobler til …"
        }
    }

    private func card(_ s: TaskHAState22) -> some View {
        VStack(spacing: 0) {
            Button { setEnabled(!s.enabled) } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Synkroniser lister").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                        Text("To veier · Home Assistant To-do (todo.*)").font(PF.ui(12)).foregroundStyle(p.mut)
                    }
                    Spacer()
                    TaskSwitch22(on: s.enabled)
                }
                .frame(minHeight: 56)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if s.enabled {
                ForEach(m.lists) { l in
                    Rectangle().fill(p.line).frame(height: 1)
                    listRow(l, s)
                }
                Rectangle().fill(p.line).frame(height: 1)
                Button { sync() } label: {
                    Text(busy ? "Synker …" : "↻ Synk nå").font(PF.ui(14, .bold)).foregroundStyle(p.lab)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 2)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func listRow(_ l: TaskList17, _ s: TaskHAState22) -> some View {
        let e: String? = s.maps[l.id]
        return Menu {
            ForEach(s.entities, id: \.0) { ent in
                Button { setMap(l.id, ent.0) } label: {
                    Text(ent.1 == ent.0 ? ent.0 : ent.1 + " · " + ent.0)
                }
            }
            Button { setMap(l.id, nil) } label: { Text("Ikke koblet") }
            Button { create(l) } label: { Text("+ Lag ny liste i HA") }
        } label: {
            HStack(spacing: 12) {
                Circle().fill(Color(hex: l.color)).frame(width: 9, height: 9)
                Text(l.name).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                Spacer(minLength: 6)
                Text(e ?? "Ikke koblet").font(PF.mono(12.5)).foregroundStyle(e == nil ? p.mut : p.ink).lineLimit(1)
                Text("›").foregroundStyle(p.mut)
            }
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
    }

    /* ---------- Nett ---------- */

    private func load() async {
        let admin: Bool = (store.me?.role ?? store.account?.role ?? "") == "admin"
        guard admin else { st = nil; return }
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/tasks/ha", timeout: 15)
            st = TaskHAState22(JS.obj(d))
        } catch {
            // 404 (eldre server) eller 403: ingen seksjon.
            st = nil
        }
    }

    private func setEnabled(_ on: Bool) {
        Haptics.shared.select()
        if var s = st { s.enabled = on; s.status = on ? "connecting" : "off"; st = s }
        Task {
            do {
                _ = try await store.api.callAt("/api", "PUT", "/tasks/ha", json: ["enabled": on])
            } catch {
                store.flash("Kunne ikke endre synk: \(error.localizedDescription)")
            }
            await load()
        }
    }

    private func setMap(_ listId: String, _ entity: String?) {
        Haptics.shared.select()
        if var s = st { s.maps[listId] = entity; st = s }
        var payload: [String: Any] = ["listId": listId]
        if let entity { payload["entityId"] = entity } else { payload["entityId"] = NSNull() }
        Task {
            do {
                _ = try await store.api.callAt("/api", "PUT", "/tasks/ha/map", json: payload)
            } catch {
                store.flash("Kunne ikke koble listen: \(error.localizedDescription)")
            }
            await load()
            await m.load(store)
        }
    }

    private func create(_ l: TaskList17) {
        Haptics.shared.tap()
        Task {
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/tasks/ha/create", json: ["name": l.name], timeout: 30)
                let o: [String: Any] = JS.obj(d)
                if let e = JS.str(o, "entity_id") ?? JS.str(o, "entityId") {
                    setMap(l.id, e)
                } else {
                    await load()
                }
            } catch {
                store.flash("Kunne ikke lage listen i Home Assistant: \(error.localizedDescription)")
            }
        }
    }

    private func sync() {
        Haptics.shared.tap()
        busy = true
        Task {
            do {
                _ = try await store.api.callAt("/api", "POST", "/tasks/ha/sync", timeout: 60)
            } catch {
                store.flash("Synk feilet: \(error.localizedDescription)")
            }
            busy = false
            await load()
            await m.load(store)
        }
    }
}

/// Bryteren i designet: 46 × 28, grønn (#2f7a4f) når på, kantfarge når av.
struct TaskSwitch22: View {
    @Environment(\.paper) private var p
    let on: Bool
    var body: some View {
        ZStack(alignment: on ? .trailing : .leading) {
            Capsule().fill(on ? Color(hex: "#2f7a4f") : p.line)
            Circle().fill(Color.white).frame(width: 22, height: 22).shadow(color: Color.black.opacity(0.3), radius: 1.5, y: 1).padding(3)
        }
        .frame(width: 46, height: 28)
        .animation(.easeOut(duration: 0.15), value: on)
    }
}
