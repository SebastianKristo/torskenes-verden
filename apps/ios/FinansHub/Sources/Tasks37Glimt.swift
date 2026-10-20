import SwiftUI
import PhotosUI
import UIKit

/* ---------------- Prompt 37: Gjøremål – Glimt-arket (✦-knappen) og Glimt-kortene i listen ---------------- */
// prompts/prompt-37-pakke/claude-code-gjoremal-glimt.md. Den runde knappen nede til høyre har Glimt-ikonet (✦) i stedet for +.
// Tomt «Ny oppgave …»: arket åpnes. Står det tekst: teksten sendes til Glimt og arket åpnes med resultatet.
// SERVER37: POST /api/tasks/glimt {q, list?, image?} → {kind:'question'|'add'|'action', text, items:[{n|title, l|list, due …}],
// undo:{token}}; POST /api/tasks/glimt/undo {token}. Alt Glimt legger til kan angres i 10 s.
// Uten server-Glimt (404): lokal tolkning (én oppgave per linje, «kjøp a, b og c» → én vare per ting i Handel, enkle spørsmål).

struct Task37GlimtResult: Equatable {
    var kind: String = ""
    var text: String = ""
    var items: [String] = []
    var undo: String = ""
    var localIds: [String] = []
    /// Prompt 40: punktene med steg, liste, dato/tid, sted og person (Tasks40Glimt.swift).
    var rich: [Task40Item] = []
}

@MainActor
@Observable
final class Tasks37Glimt {
    static let shared = Tasks37Glimt()

    var q: String = ""
    var busy: Bool = false
    var result: Task37GlimtResult? = nil
    var undoLeft: Int = 0
    @ObservationIgnored private var undoTask: Task<Void, Never>? = nil

    static let suggestions: [String] = ["Hva har jeg igjen i dag?", "Hva er forfalt?", "Legg ukas matplan i handlelisten", "Kjøp melk, egg og kaffe"]

    /// Fra ✦-knappen: tekst i feltet sendes med en gang, ellers åpnes arket tomt.
    func open(_ store: Store) {
        let d: TaskDock22 = TaskDock22.shared
        let t: String = d.text.trimmingCharacters(in: .whitespacesAndNewlines)
        Haptics.shared.tap()
        Tasks37UI.shared.glimtOpen = true
        if !t.isEmpty {
            d.text = ""
            q = t
            run(store)
        }
    }

    func run(_ store: Store, image: Data? = nil) {
        let text: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty && image == nil { return }
        // Prompt 41: lange beskjeder går til Glimt i bakgrunnen; arket lukkes med en gang (Tasks41Glimt.swift).
        if image == nil && Tasks41Glimt.wantsAI(text) {
            q = ""
            Tasks37UI.shared.glimtOpen = false
            Tasks41Glimt.shared.start(text, store, origin: "huske", list: TaskDock22.shared.cur)
            return
        }
        busy = true
        result = nil
        let cur: String = TaskDock22.shared.cur
        var body: [String: Any] = ["q": text]
        if cur != "alle" && cur != Tasks32b.archId { body["list"] = cur }
        if let image { body["image"] = "data:image/jpeg;base64," + image.base64EncodedString() }
        Task { @MainActor in
            var r: Task37GlimtResult? = nil
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/tasks/glimt", json: body, timeout: 60)
                r = Tasks37Glimt.parse(JS.obj(d))
            } catch let e as APIError {
                if e.status != 404 && e.status != 405 && e.status != 0 {
                    r = Task37GlimtResult(kind: "question", text: "Glimt fikk ikke svar: " + e.message)
                }
            } catch {}
            if r == nil { r = await local(text, image != nil, store) }
            withAnimation(.easeOut(duration: 0.2)) {
                result = r
                busy = false
            }
            if let rr = r, rr.kind == "add" || rr.kind == "action" {
                Haptics.shared.success()
                startUndo()
                await TasksModel.shared.load(store)
            }
            q = ""
        }
    }

    static func parse(_ o: [String: Any]) -> Task37GlimtResult {
        var r = Task37GlimtResult()
        r.kind = JS.str(o, "kind") ?? "question"
        r.text = JS.str(o, "text") ?? ""
        for it in JS.list(o, "items") {
            let n: String = JS.str(it, "n") ?? JS.str(it, "title") ?? JS.str(it, "text") ?? ""
            if !n.isEmpty { r.items.append(n) }
        }
        if r.items.isEmpty { r.items = JS.strings(o, "items") }
        r.rich = Tasks37Glimt.rich(o)
        r.undo = JS.str(JS.dict(o, "undo"), "token") ?? JS.str(o, "undoToken") ?? ""
        return r
    }

    private func startUndo() {
        undoTask?.cancel()
        undoLeft = 10
        undoTask = Task { @MainActor in
            while undoLeft > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                undoLeft -= 1
            }
        }
    }

    func undo(_ store: Store) {
        guard let r = result else { return }
        undoTask?.cancel()
        undoLeft = 0
        Haptics.shared.tap()
        let m: TasksModel = TasksModel.shared
        Task { @MainActor in
            if !r.undo.isEmpty {
                _ = try? await store.api.callAt("/api", "POST", "/tasks/glimt/undo", json: ["token": r.undo])
            }
            for id in r.localIds {
                if let t = m.items.first(where: { $0.id == id }) { m.delete(t, store) }
            }
            withAnimation(.easeOut(duration: 0.2)) {
                result = Task37GlimtResult(kind: "question", text: "Angret. Ingenting ble lagt til.")
            }
            await m.load(store)
        }
    }

    /* ---------- Lokal reserve ---------- */

    private func local(_ text: String, _ hadImage: Bool, _ store: Store) async -> Task37GlimtResult {
        let m: TasksModel = TasksModel.shared
        if hadImage && text.isEmpty {
            return Task37GlimtResult(kind: "question", text: "Bildelesing krever Glimt på serveren. Oppdater homelab, eller skriv varene.")
        }
        let low: String = text.lowercased()
        let isQ: Bool = text.hasSuffix("?") || ["hva ", "hvem ", "når ", "hvor ", "har jeg", "hvilke "].contains(where: { low.hasPrefix($0) })
        if isQ { return answer(low, m) }
        if low.contains("matplan") {
            return Task37GlimtResult(kind: "question", text: "Matplanen kan bare legges i handlelisten når Glimt på serveren er oppdatert.")
        }
        var titles: [String] = []
        var listId: String = TaskDock22.shared.cur
        if listId == "alle" || listId == Tasks32b.archId { listId = m.lists.first?.id ?? "hjem" }
        let lines: [String] = text.components(separatedBy: .newlines)
            .map { Tasks37Glimt.clean($0) }
            .filter { !$0.isEmpty }
        // Prompt 40: setninger med flere handlinger deles opp i punkter i riktig rekkefølge (gLocal).
        if lines.count <= 1 && Task40Split.isMulti(text) {
            return await localMulti(text, listId, store)
        }
        if lines.count > 1 {
            titles = lines
        } else if low.hasPrefix("kjøp ") || low.hasPrefix("handle ") {
            let rest: String = String(text.drop(while: { $0 != " " })).trimmingCharacters(in: .whitespaces)
            let parts: [String] = rest.replacingOccurrences(of: " og ", with: ", ").components(separatedBy: ",")
            for part in parts {
                let w: String = part.trimmingCharacters(in: .whitespaces)
                if w.isEmpty { continue }
                titles.append(w.prefix(1).uppercased() + String(w.dropFirst()))
            }
            if let h = m.lists.first(where: { $0.name.lowercased() == "handel" || $0.id == "handel" }) { listId = h.id }
        } else {
            titles = [text]
        }
        let before: Set<String> = Set(m.items.map(\.id))
        for t in titles {
            let body: [String: Any] = ["title": t, "list": listId]
            _ = try? await store.api.callAt("/api", "POST", "/tasks", json: body)
        }
        await m.load(store)
        let newIds: [String] = m.items.map(\.id).filter { !before.contains($0) }
        let name: String = m.listName(listId)
        let n: Int = titles.count
        var r = Task37GlimtResult(kind: "add", text: "La til \(n) " + (n == 1 ? "oppgave" : "oppgaver") + " i " + name + ".", items: titles)
        r.localIds = newIds
        return r
    }

    /// Prompt 40: legger inn punktene fra den lokale tolkeren (rekkefølge, sted og tagger).
    private func localMulti(_ text: String, _ listId: String, _ store: Store) async -> Task37GlimtResult {
        let m: TasksModel = TasksModel.shared
        let items: [Task40Item] = Task40Split.split(text)
        let before: Set<String> = Set(m.items.map(\.id))
        var prevId: String = ""
        for it in items {
            var body: [String: Any] = ["title": it.title, "list": listId]
            if !it.place.isEmpty { body["place"] = it.place }
            if !it.tags.isEmpty { body["tags"] = it.tags }
            if !prevId.isEmpty { body["after"] = prevId }
            if let d = try? await store.api.callAt("/api", "POST", "/tasks", json: body) {
                let o: [String: Any] = JS.obj(d)
                prevId = JS.str(o, "id") ?? JS.str(JS.dict(o, "item"), "id") ?? ""
            }
        }
        await m.load(store)
        var named: [Task40Item] = items
        let list: String = m.listName(listId)
        for i in named.indices { named[i].list = list }
        let trip: String = items.first(where: { !$0.place.isEmpty })?.place ?? ""
        let n: Int = items.count
        var r = Task37GlimtResult(kind: "add", text: "Lagde \(n) punkter" + (trip.isEmpty ? "" : " for " + trip) + ", i riktig rekkefølge.",
                                  items: items.map(\.title))
        r.rich = named
        r.localIds = m.items.map(\.id).filter { !before.contains($0) }
        return r
    }

    private func answer(_ low: String, _ m: TasksModel) -> Task37GlimtResult {
        let today: Date = Calendar.current.startOfDay(for: Date())
        let open: [TaskItem17] = m.items.filter { !$0.done }
        let overdue: [TaskItem17] = open.filter { t in t.due.map { Calendar.current.startOfDay(for: $0) < today } ?? false }
        let dueToday: [TaskItem17] = open.filter { t in t.due.map { Calendar.current.isDate($0, inSameDayAs: today) } ?? false }
        if low.contains("forfalt") {
            if overdue.isEmpty { return Task37GlimtResult(kind: "question", text: "Ingenting er forfalt. Bra!") }
            return Task37GlimtResult(kind: "question", text: "\(overdue.count) gjøremål er forfalt:",
                                     items: overdue.map(\.title))
        }
        if low.contains("i dag") || low.contains("igjen") {
            let all: [TaskItem17] = overdue + dueToday
            if all.isEmpty { return Task37GlimtResult(kind: "question", text: "Du har ingenting igjen i dag.") }
            let od: String = overdue.isEmpty ? "" : (overdue.count == 1 ? ", ett er forfalt" : ", \(overdue.count) er forfalt")
            return Task37GlimtResult(kind: "question", text: "Du har \(all.count) gjøremål i dag" + od + ".",
                                     items: all.map(\.title))
        }
        if low.contains("sist") {
            let words: [String] = low.split(separator: " ").map(String.init)
            if let w = words.last?.trimmingCharacters(in: CharacterSet(charactersIn: "?")), !w.isEmpty,
               let t = m.items.filter({ $0.done && $0.title.lowercased().contains(w) }).sorted(by: { ($0.doneAt ?? .distantPast) > ($1.doneAt ?? .distantPast) }).first {
                let when: String = t.doneAt.map { JS.fmt($0, "d. MMMM") } ?? "nylig"
                return Task37GlimtResult(kind: "question", text: "Sist avkrysset: «" + t.title + "» " + when + ".")
            }
        }
        return Task37GlimtResult(kind: "question", text: "Det vet jeg ikke ennå. Spør meg i Chat for mer.")
    }

    /// Fjerner punkttegn og nummerering foran en linje.
    static func clean(_ s: String) -> String {
        var t: String = s.trimmingCharacters(in: .whitespaces)
        let marks: [String] = ["- ", "• ", "* ", "– ", "▢ ", "☐ "]
        for mk in marks where t.hasPrefix(mk) { t = String(t.dropFirst(mk.count)) }
        if let r = t.range(of: "^[0-9]+[.)] ", options: .regularExpression) { t.removeSubrange(r) }
        return t.trimmingCharacters(in: .whitespaces)
    }
}

/// Glimt-arket: ✦ Glimt + Ferdig, felt / 📷 / send, forslag og svar med Angre.
struct Task37GlimtSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var g: Tasks37Glimt { Tasks37Glimt.shared }
    @State private var photo: PhotosPickerItem? = nil
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Text("✦").font(PF.ui(20, .bold)).foregroundStyle(p.lab)
                Text("Glimt").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                Spacer(minLength: 4)
                SheetButton30(kind: .primary, title: "Ferdig") { Tasks37UI.shared.glimtOpen = false }
            }
            field
            chips
            if g.busy {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Forstår hva du mener …").font(PF.ui(14)).foregroundStyle(p.mut)
                }
            }
            if let r = g.result { answer(r) }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.top, 20).padding(.bottom, 16)
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onChange(of: photo) { (_: PhotosPickerItem?, it: PhotosPickerItem?) in load(it) }
        .onAppear { if g.result == nil && !g.busy { focused = true } }
    }

    private var field: some View {
        HStack(spacing: 8) {
            TextField("", text: Binding<String>(get: { g.q }, set: { g.q = $0 }),
                      prompt: Text("Spør Glimt eller skriv en oppgave …").foregroundColor(p.mut), axis: .vertical)
                .font(PF.ui(15.5, .medium)).foregroundStyle(p.ink)
                .lineLimit(1...5)
                .focused($focused)
                .submitLabel(.send)
                .onSubmit { g.run(store) }
            PhotosPicker(selection: $photo, matching: .images) {
                Image(systemName: "camera").font(.system(size: 16, weight: .semibold)).foregroundStyle(p.ink)
                    .frame(width: 38, height: 38)
                    .background(p.bg, in: Circle())
            }
            .accessibilityLabel("Bilde av handlelapp eller oppskrift")
            Button { g.run(store) } label: {
                Image(systemName: "arrow.up").font(.system(size: 15, weight: .bold)).foregroundStyle(p.onLab)
                    .frame(width: 38, height: 38)
                    .background(p.lab, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Send")
        }
        .padding(.leading, 16).padding(.trailing, 6).padding(.vertical, 6)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Tasks37Glimt.suggestions, id: \.self) { (s: String) in
                    Button {
                        g.q = s
                        g.run(store)
                    } label: {
                        Text(s).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                            .padding(.horizontal, 12).frame(height: 32)
                            .background(p.card, in: Capsule())
                            .overlay(Capsule().stroke(p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func answer(_ r: Task37GlimtResult) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(r.text).font(PF.ui(15)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            if r.rich.count > 1 || r.rich.contains(where: { !$0.place.isEmpty || !$0.who.isEmpty || !$0.date.isEmpty }) {
                // Prompt 40: to linjer per punkt (tittel + steg, liste, dato/tid, sted, @person).
                ForEach(Array(r.rich.prefix(8).enumerated()), id: \.offset) { _, it in
                    Task40ItemRow(it: it, total: r.rich.count)
                }
            } else {
                ForEach(Array(r.items.prefix(8).enumerated()), id: \.offset) { _, it in
                    HStack(spacing: 8) {
                        Text("✦").font(PF.ui(11, .bold)).foregroundStyle(p.lab)
                        Text(it).font(PF.ui(14)).foregroundStyle(p.ink).lineLimit(2)
                    }
                }
            }
            if (r.kind == "add" || r.kind == "action") && g.undoLeft > 0 {
                Button { g.undo(store) } label: {
                    Text("Angre (\(g.undoLeft) s)").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                        .padding(.horizontal, 14).frame(height: 34)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .transition(.opacity)
    }

    private func load(_ it: PhotosPickerItem?) {
        guard let it else { return }
        Task { @MainActor in
            guard let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) else { return }
            let small: UIImage = img.preparingThumbnail(of: CGSize(width: 1280, height: 1280 * img.size.height / Swift.max(1, img.size.width))) ?? img
            let jpg: Data? = small.jpegData(compressionQuality: 0.7)
            photo = nil
            g.run(store, image: jpg)
        }
    }
}

/// ✦-knappen nede til høyre (rød, rund): Glimt · skriv eller spør.
struct Task37GlimtButton: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        Button { Tasks37Glimt.shared.open(store) } label: {
            Image(systemName: "sparkle").font(.system(size: 24, weight: .bold)).foregroundStyle(p.onLab)
                .frame(width: 60, height: 60)
                .background(p.lab, in: Circle())
                .shadow(color: .black.opacity(0.4), radius: 14, y: 10)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Glimt · skriv eller spør")
    }
}

/// Glimt-kortene i listen: like oppgaver og forfalte.
struct Task37GlimtCards: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: TasksModel { TasksModel.shared }
    @MainActor private var ui: Tasks37UI { Tasks37UI.shared }
    let cur: String

    var body: some View {
        let dups: [(String, [TaskItem17])] = m.duplicates37(cur).filter { !ui.dismissed.contains("dup:" + $0.0) }
        let over: [TaskItem17] = m.overdue37(cur)
        VStack(spacing: 8) {
            ForEach(dups, id: \.0) { (g: (String, [TaskItem17])) in
                card("\(g.1.count)× «" + (g.1.first?.title ?? "") + "» i " + m.listName(g.1.first?.list ?? ""), key: "dup:" + g.0,
                     a: "Slå sammen", act: { m.merge37(g.1, store) }, b: nil, actB: nil)
            }
            if over.count >= 2 && !ui.dismissed.contains("over") {
                card("\(over.count) gjøremål er forfalt", key: "over", a: "Flytt til i morgen", act: { m.moveOverdue37(over, store) },
                     b: "Arkiver", actB: {
                         for t in over { Tasks32b.shared.archive(t, store) }
                     })
            }
        }
    }

    private func card(_ text: String, key: String, a: String, act: @escaping () -> Void, b: String?, actB: (() -> Void)?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("✦").font(PF.ui(14, .bold)).foregroundStyle(p.lab)
                Text(text).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(2)
                Spacer(minLength: 4)
                Button {
                    withAnimation(.easeOut(duration: 0.2)) { _ = ui.dismissed.insert(key) }
                } label: {
                    Text("Ikke nå").font(PF.ui(12, .semibold)).foregroundStyle(p.mut)
                }
                .buttonStyle(.plain)
            }
            HStack(spacing: 8) {
                Button {
                    act()
                    withAnimation(.easeOut(duration: 0.2)) { _ = ui.dismissed.insert(key) }
                } label: {
                    Text(a).font(PF.ui(12.5, .bold)).foregroundStyle(p.bg)
                        .padding(.horizontal, 12).frame(height: 32)
                        .background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                if let b, let actB {
                    Button {
                        actB()
                        withAnimation(.easeOut(duration: 0.2)) { _ = ui.dismissed.insert(key) }
                    } label: {
                        Text(b).font(PF.ui(12.5, .bold)).foregroundStyle(p.ink)
                            .padding(.horizontal, 12).frame(height: 32)
                            .overlay(Capsule().stroke(p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
