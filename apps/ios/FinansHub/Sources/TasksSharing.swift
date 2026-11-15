import SwiftUI

/* ---------------- Huskeliste: eier og deling (prompt 21) ---------------- */
// Hver liste har en eier. Eieren kan dele listen med navngitte personer (PUT /api/tasks/lists/:id/members),
// og bare eieren kan dele eller slette den. Eldre servere sender ikke owner/members; da vises ingen deling.

/// Leser owner og members fra en liste. Begge kan komme som tekst/id eller som objekt med id og navn.
struct TaskListShare21 {
    var owner: String = ""
    var ownerName: String = ""
    var ids: [String] = []
    var names: [String] = []

    init(_ o: [String: Any]) {
        if let d = o["owner"] as? [String: Any] {
            owner = JS.str(d, "id") ?? JS.str(d, "userId") ?? ""
            ownerName = JS.str(d, "name") ?? JS.str(d, "displayName") ?? ""
        } else {
            owner = JS.str(o, "owner") ?? ""
            ownerName = JS.str(o, "ownerName") ?? ""
        }
        let raw: [Any] = (o["members"] as? [Any]) ?? []
        for v in raw {
            if let d = v as? [String: Any] {
                let id: String = JS.str(d, "id") ?? JS.str(d, "userId") ?? ""
                if id.isEmpty { continue }
                ids.append(id)
                names.append(JS.str(d, "name") ?? JS.str(d, "displayName") ?? "")
            } else if let s = v as? String, !s.isEmpty {
                ids.append(s)
                names.append("")
            }
        }
    }
}

extension TasksModel {
    /// GET /api/tasks/lists: listene med owner, members og mine. Feiler stille (eldre server).
    func loadListSharing(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/tasks/lists", timeout: 15) else { return }
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        var raw: [[String: Any]] = []
        if let arr = any as? [Any] {
            raw = arr.compactMap { $0 as? [String: Any] }
        } else if let o = any as? [String: Any] {
            raw = JS.list(o, "lists")
            if members.isEmpty { members = JS.list(o, "members").map { TaskMember17($0) } }
        }
        let parsed: [TaskList17] = raw.map { TaskList17($0) }
        if !parsed.isEmpty { lists = parsed }
    }

    /// Eieren av listen er den som er logget inn. Eldre servere uten eier: alle lister regnes som egne.
    func isMine(_ l: TaskList17, _ store: Store) -> Bool {
        if let f = l.mineFlag { return f }
        if l.owner.isEmpty { return true }
        let me: String = (store.account?.username ?? "").lowercased()
        if let m = members.first(where: { $0.id == l.owner }), !m.username.isEmpty { return m.username.lowercased() == me }
        return false
    }

    func ownerLabel(_ l: TaskList17) -> String {
        if !l.ownerName.isEmpty { return l.ownerName }
        return memberName(l.owner) ?? "en annen"
    }

    /// «Delt med Ingrid og Pål» eller tom tekst når listen ikke er delt.
    func sharedText(_ l: TaskList17) -> String {
        var names: [String] = []
        for (i, id) in l.memberIds.enumerated() {
            if id == l.owner { continue }
            let given: String = i < l.memberNames.count ? l.memberNames[i] : ""
            let n: String = given.isEmpty ? (memberName(id) ?? "") : (given.split(separator: " ").first.map(String.init) ?? given)
            if !n.isEmpty { names.append(n) }
        }
        if names.isEmpty { return "" }
        if names.count == 1 { return "Delt med " + names[0] }
        let head: String = names.dropLast().joined(separator: ", ")
        return "Delt med " + head + " og " + (names.last ?? "")
    }

    /// PUT /api/tasks/lists/:id/members {userIds}. Bare eieren kan dele.
    func setListMembers(_ l: TaskList17, _ ids: [String], _ store: Store) {
        let e: String = l.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? l.id
        let body: [String: Any] = ["userIds": ids]
        if let i = lists.firstIndex(where: { $0.id == l.id }) {
            lists[i].memberIds = ids
            lists[i].memberNames = ids.map { _ in "" }
        }
        Task {
            do {
                _ = try await store.api.callAt("/api", "PUT", "/tasks/lists/\(e)/members", json: body)
                store.flash(ids.isEmpty ? "Listen er ikke delt lenger" : "Listen er delt")
                await self.load(store)
            } catch let err as APIError {
                if err.status == 404 || err.status == 405 {
                    store.flash("Kunne ikke dele: serveren støtter ikke deling ennå. Oppdater homelab.")
                } else if err.status == 403 {
                    store.flash("Kunne ikke dele: bare eieren kan dele listen")
                } else {
                    store.flash("Kunne ikke dele listen: \(err.message)")
                }
                await self.load(store)
            } catch {
                store.flash("Kunne ikke dele listen: \(error.localizedDescription)")
            }
        }
    }
}
