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

/// Kortet over oppgavene når en liste er valgt: eier, «Delt med …» og «Del liste» (bare for eieren).
struct TaskListHeader21: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let list: TaskList17
    @State private var sharing: Bool = false
    @MainActor private var m: TasksModel { TasksModel.shared }

    var body: some View {
        let mine: Bool = m.isMine(list, store)
        let shared: String = m.sharedText(list)
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(mine ? "Din liste" : "Eies av " + m.ownerLabel(list)).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
                Text(shared.isEmpty ? (mine ? "Bare du ser denne listen" : "Delt med deg") : shared)
                    .font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2)
            }
            Spacer(minLength: 6)
            if mine && !list.owner.isEmpty {
                Button { sharing = true; Haptics.shared.tap() } label: {
                    Text("Del liste").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                        .padding(.horizontal, 14).frame(height: 34)
                        .background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .sheet(isPresented: $sharing) {
            TaskShareSheet21(list: list) { sharing = false }
                .environment(\.paper, p)
                .presentationDetents([.medium, .large])
                .sheetEdge30(p.bg)
        }
    }
}

/// Velg hvem listen deles med.
struct TaskShareSheet21: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let list: TaskList17
    let close: () -> Void
    @State private var picked: Set<String> = []
    @MainActor private var m: TasksModel { TasksModel.shared }

    private var others: [TaskMember17] {
        let me: String = (store.account?.username ?? "").lowercased()
        return m.members.filter { mem in
            mem.id != list.owner && (mem.username.isEmpty || mem.username.lowercased() != me)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Del «\(list.name)»").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                Spacer()
                Button("Avbryt") { close() }.font(PF.ui(14, .semibold)).foregroundStyle(p.mut)
            }
            Text("De du velger kan se, legge til og fullføre oppgaver. Bare du kan dele eller slette listen.")
                .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            PLabel(text: "Personer").padding(.leading, 4).padding(.top, 4)
            peopleCard
            Button {
                let ids: [String] = others.map(\.id).filter { picked.contains($0) }
                m.setListMembers(list, ids, store)
                close()
            } label: {
                Text("Lagre").font(PF.ui(15, .bold)).foregroundStyle(p.bg)
                    .frame(maxWidth: .infinity).frame(height: 48)
                    .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            Spacer(minLength: 0)
        }
        .padding(20)
        .onAppear { picked = Set(list.memberIds) }
    }

    private var peopleCard: some View {
        VStack(spacing: 0) {
            if others.isEmpty {
                Text("Ingen andre brukere på serveren ennå.").font(PF.ui(13)).foregroundStyle(p.mut)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(14)
            }
            ForEach(Array(others.enumerated()), id: \.element.id) { i, mem in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                personRow(mem)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func personRow(_ mem: TaskMember17) -> some View {
        let on: Bool = picked.contains(mem.id)
        return Button {
            if on { picked.remove(mem.id) } else { picked.insert(mem.id) }
            Haptics.shared.select()
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(p.line.opacity(0.7))
                    Text(String(mem.name.prefix(1)).uppercased()).font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                }
                .frame(width: 34, height: 34)
                Text(mem.name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Spacer()
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.dyn51(size: 20, weight: .semibold)).foregroundStyle(on ? p.pos : p.line)
            }
            .padding(.horizontal, 14).frame(height: 54)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
