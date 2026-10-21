import SwiftUI
import WidgetKit

/* ---------------- Prompt 37: Gjøremål – felter, lister og Glimt (modell) ---------------- */
// prompts/prompt-37-pakke/claude-code-huskeliste-uten-navbar.md og claude-code-gjoremal-glimt.md. Fasit: design/Huskeliste.dc.html.
// SERVER37 utvider /api/tasks: oppgaver {id, n|title, notes, l|list, due, time, urgent, rep, early, prio, flag, tags[], who,
// subs:[{n,done}], done, doneAt, arch, by, place}; lister GET/POST/PATCH/DELETE /api/tasks/lists {id, name, color, ownerId,
// members:[{userId, name, color, role}], shared, private} og POST /api/tasks/lists/:id/leave. Glimt: POST /api/tasks/glimt
// {q, list?} → {kind, text, items, undo:{token}} og POST /api/tasks/glimt/undo {token}; POST /api/tasks/:id/split.
// Eldre server: feltene ignoreres og listene beholdes som før.

struct TaskSub37: Hashable {
    var n: String
    var done: Bool
    /// Prompt 44: id per deloppgave (subs:[{id,n,done}]). Tom fra eldre servere; lages når den lagres.
    var id: String = ""
}

enum Tasks37 {
    static let reps: [(String, String)] = [("never", "Aldri"), ("day", "Hver dag"), ("weekdays", "Ukedager"), ("week", "Hver uke"),
                                           ("2week", "Annenhver uke"), ("month", "Hver måned"), ("year", "Hvert år")]
    static let earlies: [(String, String)] = [("none", "Ingen"), ("5m", "5 min før"), ("15m", "15 min før"), ("30m", "30 min før"),
                                              ("1h", "1 time før"), ("1d", "1 dag før"), ("2d", "2 dager før"), ("1w", "1 uke før")]
    static let prios: [(Int, String)] = [(0, "Ingen"), (1, "Lav"), (2, "Middels"), (3, "Høy")]
    static let places: [(String, String)] = [("", "Av"), ("store", "Ved matbutikk"), ("home_arrive", "Når jeg kommer hjem"),
                                             ("home_leave", "Når jeg drar hjemmefra"), ("work", "På jobb"), ("cabin", "På hytta")]
    static let colors: [String] = ["#b23a2a", "#2f6b45", "#a8661a", "#2b5d8a", "#6b4a8f", "#1b1a17", "#c2577a", "#4a7a8a"]

    static func repName(_ k: String) -> String { reps.first { $0.0 == k }?.1 ?? "Aldri" }
    static func earlyName(_ k: String) -> String { earlies.first { $0.0 == k }?.1 ?? "Ingen" }
    static func placeName(_ k: String) -> String { places.first { $0.0 == k }?.1 ?? "Av" }

    /// «!», «!!» eller «!!!» foran tittelen.
    static func bangs(_ p: Int) -> String { p <= 0 ? "" : String(repeating: "!", count: Swift.min(3, p)) }

    /// Leser de nye feltene fra serveren inn i oppgaven.
    static func fill(_ t: inout TaskItem17, _ o: [String: Any]) {
        t.time = JS.str(o, "time") ?? ""
        t.urgent = JS.bool(o, "urgent") ?? false
        t.rep = JS.str(o, "rep") ?? "never"
        if t.rep.isEmpty || t.rep == "none" { t.rep = "never" }
        t.early = JS.str(o, "early") ?? "none"
        if t.early.isEmpty { t.early = "none" }
        t.prio = JS.int(o, "prio") ?? 0
        t.flag = JS.bool(o, "flag") ?? false
        t.tags = JS.strings(o, "tags")
        var subs: [TaskSub37] = []
        for s in JS.list(o, "subs") {
            let n: String = JS.str(s, "n") ?? JS.str(s, "title") ?? ""
            if n.isEmpty { continue }
            subs.append(TaskSub37(n: n, done: JS.bool(s, "done") ?? false, id: JS.str(s, "id") ?? ""))
        }
        t.subs = subs
        // Prompt 44: frist (dl) er et eget felt fra dato/tid (due, time), og sted kan ha koordinater (geo).
        t.dl44 = JS.str(o, "dl").flatMap { parseDay($0) }
        if let g = JS.dict(o, "geo"), let la = JS.num(g, "lat"), let lo = JS.num(g, "lon") { t.geo44 = [la, lo] }
        t.by = JS.str(o, "by") ?? JS.str(o, "createdBy") ?? ""
        t.place = JS.str(o, "place") ?? ""
        t.doneAt = JS.date(o["doneAt"])
    }

    /// Alle feltene som JSON til PATCH /api/tasks/:id (både gamle og nye navn).
    static func body(_ t: TaskItem17) -> [String: Any] {
        var b: [String: Any] = ["title": t.title, "n": t.title, "list": t.list, "l": t.list, "note": t.note, "notes": t.note,
                                "time": t.time, "urgent": t.urgent, "rep": t.rep, "early": t.early, "prio": t.prio, "flag": t.flag,
                                "tags": t.tags, "place": t.place]
        if let d = t.due { b["due"] = JS.fmt(d, "yyyy-MM-dd") } else { b["due"] = NSNull() }
        if let a = t.assignee, !a.isEmpty { b["assignee"] = a; b["who"] = a } else { b["assignee"] = NSNull(); b["who"] = NSNull() }
        var subs: [[String: Any]] = []
        for s in t.subs { subs.append(["id": s.id.isEmpty ? Tasks44.newId() : s.id, "n": s.n, "done": s.done]) }
        b["subs"] = subs
        if let d = t.dl44 { b["dl"] = JS.fmt(d, "yyyy-MM-dd") } else { b["dl"] = NSNull() }
        if t.geo44.count == 2 { b["geo"] = ["lat": t.geo44[0], "lon": t.geo44[1]] } else { b["geo"] = NSNull() }
        return b
    }

    static func enc(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? s }
}

/// Ark som er åpne i Gjøremål: da skjules det dokkede feltet og Glimt-knappen.
@MainActor
@Observable
final class Tasks37UI {
    static let shared = Tasks37UI()

    var detail: TaskItem17? = nil
    var listSheet: Bool = false
    /// Listen som redigeres i listearket (nil = ny liste).
    var listEdit: TaskList17? = nil
    var glimtOpen: Bool = false
    /// Glimt-kort som er lukket («Ikke nå»), per økt.
    var dismissed: Set<String> = []

    /// Prompt 44: infosiden skjuler også «Ny oppgave …» og Glimt-knappen.
    var anySheet: Bool { detail != nil || listSheet || glimtOpen || Tasks44UI.shared.info != nil }
}

extension TasksModel {
    /* ---------- Oppgaver ---------- */

    /// Lagrer hele oppgaven med en gang (detaljarket har ingen egen lagre-knapp).
    func save37(_ t: TaskItem17, _ store: Store) {
        if let i = items.firstIndex(where: { $0.id == t.id }) { items[i] = t }
        let body: [String: Any] = Tasks37.body(t)
        let id: String = Tasks37.enc(t.id)
        Task {
            _ = try? await store.api.callAt("/api", "PATCH", "/tasks/\(id)", json: body)
            WidgetCenter.shared.reloadTimelines(ofKind: "no.kristo.finanshub.tasks")
        }
    }

    /// Del opp med Glimt: POST /api/tasks/:id/split → {subs:[…]} eller {items:[…]}; ellers lokale maler.
    func split37(_ t: TaskItem17, _ store: Store) async -> [TaskSub37] {
        let id: String = Tasks37.enc(t.id)
        if let d = try? await store.api.callAt("/api", "POST", "/tasks/\(id)/split", json: [:], timeout: 40) {
            let o: [String: Any] = JS.obj(d)
            var out: [TaskSub37] = []
            for s in JS.list(o, "subs") + JS.list(o, "items") {
                let n: String = JS.str(s, "n") ?? JS.str(s, "title") ?? ""
                if !n.isEmpty { out.append(TaskSub37(n: n, done: false)) }
            }
            for s in JS.strings(o, "subs") where !s.isEmpty { out.append(TaskSub37(n: s, done: false)) }
            if !out.isEmpty { return out }
        }
        return Tasks37Local.split(t.title).map { TaskSub37(n: $0, done: false) }
    }

    /* ---------- Lister ---------- */

    /// Ny liste: POST /api/tasks/lists {name, color, members:[userId]}.
    func createList37(_ name: String, _ color: String, _ members: [String], _ store: Store) {
        let body: [String: Any] = ["name": name, "color": color, "members": members, "userIds": members]
        Haptics.shared.success()
        Task {
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/tasks/lists", json: body)
                let o: [String: Any] = JS.dict(JS.obj(d), "list") ?? JS.obj(d)
                if let id = JS.str(o, "id") { TaskDock22.shared.cur = id }
            } catch let e as APIError {
                store.flash(e.status == 404 ? "Serveren støtter ikke nye lister ennå. Oppdater homelab." : "Kunne ikke lage listen: " + e.message)
            } catch {
                store.flash("Kunne ikke lage listen: " + error.localizedDescription)
            }
            await self.load(store)
        }
    }

    /// Endre navn, farge og medlemmer (bare eieren): PATCH /api/tasks/lists/:id.
    func updateList37(_ l: TaskList17, _ name: String, _ color: String, _ members: [String], _ store: Store) {
        if let i = lists.firstIndex(where: { $0.id == l.id }) {
            lists[i].name = name
            lists[i].color = color
        }
        let body: [String: Any] = ["name": name, "color": color, "members": members, "userIds": members]
        let id: String = Tasks37.enc(l.id)
        Task {
            do {
                _ = try await store.api.callAt("/api", "PATCH", "/tasks/lists/\(id)", json: body)
            } catch let e as APIError {
                if e.status == 404 || e.status == 405 {
                    // Eldre server: bare deling (prompt 21).
                    _ = try? await store.api.callAt("/api", "PUT", "/tasks/lists/\(id)/members", json: ["userIds": members])
                } else {
                    store.flash(e.status == 403 ? "Bare eieren kan endre listen" : "Kunne ikke lagre listen: " + e.message)
                }
            } catch {
                store.flash("Kunne ikke lagre listen: " + error.localizedDescription)
            }
            await self.load(store)
        }
    }

    /// Slett listen (eier, sletter oppgavene): DELETE /api/tasks/lists/:id.
    func deleteList37(_ l: TaskList17, _ store: Store) {
        lists.removeAll { $0.id == l.id }
        items.removeAll { $0.list == l.id }
        TaskDock22.shared.cur = "alle"
        let id: String = Tasks37.enc(l.id)
        Task {
            do { _ = try await store.api.callAt("/api", "DELETE", "/tasks/lists/\(id)") } catch {
                store.flash("Kunne ikke slette listen: " + error.localizedDescription)
            }
            await self.load(store)
        }
    }

    /// Forlat en delt liste (medlem): POST /api/tasks/lists/:id/leave.
    func leaveList37(_ l: TaskList17, _ store: Store) {
        lists.removeAll { $0.id == l.id }
        items.removeAll { $0.list == l.id }
        TaskDock22.shared.cur = "alle"
        let id: String = Tasks37.enc(l.id)
        Task {
            do { _ = try await store.api.callAt("/api", "POST", "/tasks/lists/\(id)/leave", json: [:]) } catch {
                store.flash("Kunne ikke forlate listen: " + error.localizedDescription)
            }
            await self.load(store)
        }
    }

    /// Medlemmer av listen (til «Ansvarlig»). Uten medlemsliste fra serveren: alle.
    func members37(_ listId: String) -> [TaskMember17] {
        guard let l = lists.first(where: { $0.id == listId }), !l.memberIds.isEmpty else { return members }
        var ids: Set<String> = Set(l.memberIds)
        if !l.owner.isEmpty { ids.insert(l.owner) }
        let out: [TaskMember17] = members.filter { ids.contains($0.id) }
        return out.isEmpty ? members : out
    }

    /// Listen er privat (bare eieren).
    func isPrivate37(_ l: TaskList17) -> Bool {
        let others: [String] = l.memberIds.filter { $0 != l.owner }
        return others.isEmpty
    }

    /* ---------- Glimt-kort i listen (lokalt) ---------- */

    /// Like åpne oppgaver i samme liste: «2× «Melk» i Handel».
    func duplicates37(_ cur: String) -> [(String, [TaskItem17])] {
        var groups: [String: [TaskItem17]] = [:]
        for t in items where !t.done && (cur == "alle" || t.list == cur) {
            let k: String = t.list + "|" + t.title.lowercased().trimmingCharacters(in: .whitespaces)
            groups[k, default: []].append(t)
        }
        return groups.filter { $0.value.count > 1 }.map { ($0.key, $0.value) }.sorted { $0.0 < $1.0 }
    }

    /// Forfalte åpne oppgaver.
    func overdue37(_ cur: String) -> [TaskItem17] {
        let today: Date = Calendar.current.startOfDay(for: Date())
        return items.filter { t in
            guard !t.done, cur == "alle" || t.list == cur, let d = t.due else { return false }
            return Calendar.current.startOfDay(for: d) < today
        }
    }

    /// Slå sammen: beholder den første, slår sammen tagger og deloppgaver, sletter resten.
    func merge37(_ group: [TaskItem17], _ store: Store) {
        guard var keep = group.first else { return }
        for t in group.dropFirst() {
            for tag in t.tags where !keep.tags.contains(tag) { keep.tags.append(tag) }
            for s in t.subs where !keep.subs.contains(where: { $0.n == s.n }) { keep.subs.append(s) }
            delete(t, store)
        }
        save37(keep, store)
        Haptics.shared.success()
    }

    func moveOverdue37(_ list: [TaskItem17], _ store: Store) {
        let tomorrow: Date = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        for var t in list {
            t.due = tomorrow
            save37(t, store)
        }
        Haptics.shared.success()
    }
}

/// Lokale maler når serveren ikke har Glimt for Gjøremål ennå.
enum Tasks37Local {
    static func split(_ title: String) -> [String] {
        let t: String = title.lowercased()
        if t.contains("flytt") { return ["Bestill flyttebil", "Skaff esker", "Meld flytting", "Pakk kjøkken", "Vask ut"] }
        if t.contains("hytt") { return ["Handle mat", "Sjekk ved", "Pakk sengetøy", "Bestill brøyting"] }
        if t.contains("bursdag") { return ["Inviter gjester", "Kjøp gave", "Bestill kake", "Pynt"] }
        if t.contains("filter") { return ["Finn riktig filter", "Bestill filter", "Bytt filter"] }
        if t.contains("domene") { return ["Sjekk utløpsdato", "Forny domenet", "Sjekk DNS"] }
        return ["Planlegg", "Gjør det", "Sjekk at det er ferdig"]
    }
}

extension Store {
    /// Prompt 37: Gjøremål (intern nøkkel «huske») vises uten fanelinje og skann-knapp.
    var inTasks37: Bool { paperClassic == nil && paperFin == nil && paperTab == "huske" }
}
