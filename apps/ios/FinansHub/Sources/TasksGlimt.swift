import SwiftUI
import PhotosUI
import UIKit
import Foundation
import WidgetKit
import os

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
    /// Prompt 40: punktene med steg, liste, dato/tid, sted og person (TasksGlimt.swift).
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
        // Prompt 41: lange beskjeder går til Glimt i bakgrunnen; arket lukkes med en gang (TasksGlimt.swift).
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
                Image(systemName: "camera").font(.dyn51(size: 16, weight: .semibold)).foregroundStyle(p.ink)
                    .frame(width: 38, height: 38)
                    .background(p.bg, in: Circle())
            }
            .accessibilityLabel("Bilde av handlelapp eller oppskrift")
            Button { g.run(store) } label: {
                Image(systemName: "arrow.up").font(.dyn51(size: 15, weight: .bold)).foregroundStyle(p.onLab)
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
            Image(systemName: "sparkle").font(.dyn51(size: 24, weight: .bold)).foregroundStyle(p.onLab)
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

// MARK: -

/* ---------------- Prompt 40: Gjøremål – Glimt forstår setninger og lager riktige punkter ----------------
   prompts/prompt-40-pakke/claude-code-huskeliste-glimt-forstar.md, fasit design/Huskeliste.dc.html (gIsMulti, gLocal, gCtx).
   Serveren (POST /api/tasks/glimt) deler opp med LLM + lokal regel og svarer items[{n, list, who:{userId|profileId, name}, date,
   time, place, after, tags}]. Appen viser hvert punkt på to linjer: tittel, og under: steg (1 · først / 2 · etter «…»), liste,
   dato/tid, sted og @person.
   Lokal reserve (eldre server): samme regler som gLocal – del opp på «men først», «først», «før det» (= før) og «deretter»,
   «etterpå», «og så», «til slutt» (= etter), fjern «jeg må (huske å)», gjør infinitiv om til imperativ, sted fra
   «til/i/på/hos/ved/fra + Stort ord», felles tagg for samme tur.
   «Ny oppgave …»-feltet sender setninger med flere handlinger til Glimt i stedet for å lage ett langt punkt. */

struct Task40Item: Hashable {
    var title: String
    var list: String = ""
    var date: String = ""
    var time: String = ""
    var place: String = ""
    var who: String = ""
    var after: String = ""
    var tags: [String] = []
    var step: Int = 0
    /// Prompt 41: begrunnelse («siden …») som note på punktet den gjelder.
    var note: String = ""

    static func parse(_ o: [String: Any], _ i: Int) -> Task40Item? {
        let n: String = JS.str(o, "n") ?? JS.str(o, "title") ?? JS.str(o, "text") ?? ""
        if n.isEmpty { return nil }
        var it: Task40Item = Task40Item(title: n)
        it.list = JS.str(o, "listName") ?? JS.str(o, "list") ?? JS.str(o, "l") ?? ""
        it.date = JS.str(o, "date") ?? JS.str(o, "due") ?? ""
        it.time = JS.str(o, "time") ?? ""
        it.place = JS.str(o, "place") ?? ""
        if let w = o["who"] as? [String: Any] { it.who = JS.str(w, "name") ?? "" } else { it.who = JS.str(o, "who") ?? "" }
        it.after = JS.str(o, "afterTitle") ?? JS.str(o, "after") ?? ""
        it.tags = JS.strings(o, "tags")
        it.note = JS.str(o, "note") ?? ""
        it.step = i + 1
        return it
    }
}

enum Task40Split {
    static let before: [String] = ["men aller først", "men først", "aller først", "før det", "først"]
    static let afterWords: [String] = ["og deretter", "deretter", "etterpå", "etter det", "og så", "til slutt"]

    /// Flere handlinger i én setning (gIsMulti).
    static func isMulti(_ text: String) -> Bool {
        let low: String = " " + text.lowercased() + " "
        if (before + afterWords).contains(where: { (w: String) -> Bool in low.contains(" " + w + " ") }) { return true }
        let sentences: [String] = text.split(whereSeparator: { $0 == "." || $0 == "!" }).map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        let withMust: Int = sentences.filter { (s: String) -> Bool in
            let l: String = s.lowercased()
            return l.contains(" må ") || l.hasPrefix("må ") || l.contains(" skal ") || l.hasPrefix("husk")
        }.count
        return withMust >= 2 || (sentences.count >= 2 && text.count > 30)
    }

    /// Lokal tolkning (gLocal). Returnerer punktene i riktig rekkefølge.
    static func split(_ text: String) -> [Task40Item] {
        var parts: [(String, Int)] = [] // (tekst, rekkefølge: −1 før, 0 vanlig, 1 etter)
        let sentences: [String] = text.split(whereSeparator: { $0 == "." || $0 == "!" || $0 == "\n" })
            .map { String($0).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        for s in sentences {
            var rest: String = s
            var found: Bool = true
            while found {
                found = false
                let low: String = rest.lowercased()
                for w in before {
                    if let r = low.range(of: " " + w + " ") {
                        let a: String = String(rest[rest.startIndex..<rest.index(rest.startIndex, offsetBy: low.distance(from: low.startIndex, to: r.lowerBound))])
                        let b: String = String(rest[rest.index(rest.startIndex, offsetBy: low.distance(from: low.startIndex, to: r.upperBound))...])
                        parts.append((b, -1))
                        rest = a
                        found = true
                        break
                    }
                }
                if found { continue }
                for w in afterWords {
                    if let r = low.range(of: " " + w + " ") {
                        let a: String = String(rest[rest.startIndex..<rest.index(rest.startIndex, offsetBy: low.distance(from: low.startIndex, to: r.lowerBound))])
                        let b: String = String(rest[rest.index(rest.startIndex, offsetBy: low.distance(from: low.startIndex, to: r.upperBound))...])
                        parts.append((b, 1))
                        rest = a
                        found = true
                        break
                    }
                }
            }
            let low0: String = rest.lowercased()
            if low0.hasPrefix("deretter ") || low0.hasPrefix("etterpå ") || low0.hasPrefix("og så ") {
                parts.append((rest, 1))
            } else {
                parts.append((rest, 0))
            }
        }
        let ordered: [(String, Int)] = parts.filter { $0.1 < 0 } + parts.filter { $0.1 == 0 } + parts.filter { $0.1 > 0 }
        var items: [Task40Item] = ordered.compactMap { (p: (String, Int)) -> Task40Item? in
            let t: String = title(p.0)
            if t.isEmpty { return nil }
            var it: Task40Item = Task40Item(title: t)
            it.place = place(p.0)
            return it
        }
        // Felles tagg for samme tur (stedet), og «pakke» → #pakke.
        let trip: String = items.first(where: { !$0.place.isEmpty })?.place ?? ""
        for i in items.indices {
            var tags: [String] = []
            let ws: [String] = items[i].title.lowercased().split(separator: " ").map(String.init)
            if ws.contains("pakke") || ws.contains("pakken") { tags.append("pakke") }
            if !trip.isEmpty { tags.append(trip.lowercased()) }
            items[i].tags = tags
            items[i].step = i + 1
            if i > 0 { items[i].after = items[i - 1].title }
        }
        return items
    }

    /// Kort tittel i imperativ uten «jeg må (huske å)».
    static func title(_ s: String) -> String {
        var t: String = s.trimmingCharacters(in: CharacterSet(charactersIn: " ,.;"))
        let lead: [String] = ["jeg må huske å ", "jeg må huske ", "husk å ", "påminn meg om å ", "jeg må ", "må jeg ", "jeg skal ", "så må jeg ",
                              "deretter ", "etterpå ", "og så ", "og ", "men ", "så ", "må ", "å "]
        var changed: Bool = true
        while changed {
            changed = false
            for l in lead where t.lowercased().hasPrefix(l) {
                t = String(t.dropFirst(l.count))
                changed = true
            }
        }
        var words: [String] = t.split(separator: " ").map(String.init)
        if let first = words.first {
            words[0] = imperative(first)
        }
        t = words.joined(separator: " ")
        // møbeler → møbler (vanlig skrivefeil i eksempelet).
        t = t.replacingOccurrences(of: "møbeler", with: "møbler")
        if t.isEmpty { return "" }
        return t.prefix(1).uppercased() + String(t.dropFirst())
    }

    static func imperative(_ w: String) -> String {
        let l: String = w.lowercased()
        let known: [String: String] = ["levere": "lever", "hente": "hent", "ringe": "ring", "kjøpe": "kjøp", "sende": "send", "bestille": "bestill",
                                       "ta": "ta", "gi": "gi", "kjøre": "kjør", "handle": "handle", "vaske": "vask", "betale": "betal",
                                       "rydde": "rydd", "lage": "lag", "skrive": "skriv", "huske": "husk", "pakke": "pakk", "flytte": "flytt"]
        if let k = known[l] { return k }
        if l.hasSuffix("ere") && l.count > 5 { return String(l.dropLast()) }
        return l
    }

    /// «til/i/på/hos/ved/fra + Stort ord» (ikke ukedager).
    static func place(_ s: String) -> String {
        let words: [String] = s.split(separator: " ").map(String.init)
        let preps: Set<String> = ["til", "i", "på", "hos", "ved", "fra"]
        let days: Set<String> = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag", "Jeg", "Meg"]
        var i: Int = 0
        while i < words.count - 1 {
            let nx: String = words[i + 1].trimmingCharacters(in: CharacterSet.punctuationCharacters)
            if preps.contains(words[i].lowercased()), let c = nx.first, c.isUppercase, !days.contains(nx) {
                return nx
            }
            i += 1
        }
        return ""
    }
}

extension Tasks37Glimt {
    /// Prompt 40: punktene fra serveren med steg, liste, dato/tid, sted og person.
    static func rich(_ o: [String: Any]) -> [Task40Item] {
        let raw: [[String: Any]] = JS.list(o, "items")
        var out: [Task40Item] = []
        for (i, x) in raw.enumerated() {
            if let it = Task40Item.parse(x, i) { out.append(it) }
        }
        // after = id → tittelen til punktet før.
        let ids: [String] = raw.map { (x: [String: Any]) -> String in JS.str(x, "id") ?? "" }
        for i in out.indices where !out[i].after.isEmpty {
            if let j = ids.firstIndex(of: out[i].after), j < out.count { out[i].after = out[j].title }
        }
        return out
    }
}

/// Resultatkortet: hvert punkt på to linjer.
struct Task40ItemRow: View {
    @Environment(\.paper) private var p
    let it: Task40Item
    let total: Int

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text("\(it.step)").font(PF.mono(11)).foregroundStyle(p.bg)
                .frame(width: 20, height: 20)
                .background(p.lab, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(it.title).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                Text(meta).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var meta: String {
        var bits: [String] = []
        if total > 1 { bits.append(it.after.isEmpty ? "først" : "etter «" + it.after + "»") }
        if !it.list.isEmpty { bits.append(it.list) }
        let when: String = [it.date, it.time.isEmpty ? "" : "kl. " + it.time].filter { !$0.isEmpty }.joined(separator: " ")
        if !when.isEmpty { bits.append(when) }
        if !it.place.isEmpty { bits.append("📍 " + it.place) }
        if !it.who.isEmpty { bits.append("@" + it.who) }
        if !it.tags.isEmpty { bits.append(it.tags.map { "#" + $0 }.joined(separator: " ")) }
        return bits.joined(separator: " · ")
    }
}

// MARK: -

/* ---------------- Prompt 41: Gjøremål – Glimt deler opp med AI i bakgrunnen, og «Laget med Glimt» ----------------
   Spesifikasjon: prompts/prompt-41-pakke/claude-code-huskeliste-glimt-ai-bakgrunn.md. Fasit: Huskeliste.dc.html.
   – AI (ikke regex) når teksten har ≥ 12 ord og «må/skal/huske», eller koblinger («før vi skal», «hvor vi må», «og så»,
     «siden/fordi»), eller flere setninger. Korte enkeltoppgaver lages lokalt som før.
   – Bakgrunn: POST /api/tasks/glimt {q, async:true, list?, origin?} → {jobId, placeholder}. Arket lukkes med en gang; øverst i lista
     står en stiplet rad «Glimt deler opp beskjeden …» med beskjeden. Appen spør GET /api/tasks/glimt/jobs/:id (tåler 404) og
     laster lista på nytt til punktene med origin {text, at, engine} er der. Ferdig: lett vibrering og «Glimt lagde 3 punkter i
     riktig rekkefølge · Se / ✕» i 10 s, eller lokalt varsel når appen er i bakgrunnen.
   – «Laget med Glimt»: egen fane i liste-raden (rød prikk, antall beskjeder) med ORIGINAL BESKJED, punktene i rekkefølge,
     «✦ Del opp på nytt» og «Glem beskjeden». Detaljarket viser «LAGET MED GLIMT · ORIGINAL BESKJED «…»».
   – Ingen nett / eldre server: lokal oppdeling (Task40Split + «før vi skal / hvor vi må / siden»). */

struct TaskOrigin41: Hashable {
    var id: String
    var text: String
    var at: Date?
    var engine: String
    var by: String

    init?(_ o: [String: Any]?) {
        guard let o, let t = JS.str(o, "text"), !t.isEmpty else { return nil }
        text = t
        id = JS.str(o, "id") ?? JS.str(o, "srcId") ?? KalGroup.fingerprint(t)
        at = JS.date(o["at"] ?? o["createdAt"])
        engine = JS.str(o, "engine") ?? ""
        by = JS.str(o, "byName") ?? JS.str(o, "by") ?? ""
    }
}

struct Tasks41Job: Identifiable, Hashable {
    var id: String
    var text: String
    var at: Date
    /// run | done | fail
    var state: String = "run"
    var count: Int = 0
}

@MainActor
@Observable
final class Tasks41Glimt {
    static let shared = Tasks41Glimt()
    static let madeId: String = "glimt41"

    var jobs: [Tasks41Job] = []
    /// «Glimt lagde 3 punkter …» i 10 s.
    var banner: Tasks41Job? = nil
    var forgotten: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "tasks41.forgotten") ?? [])
    @ObservationIgnored private var bannerTask: Task<Void, Never>? = nil
    /// Jobber startet fra Hjem-søket: jobb-id → id-en til Glimt-toasten (AiJobs31).
    @ObservationIgnored var homeToasts: [String: String] = [:]

    /* ---------- Når brukes AI ---------- */

    nonisolated static func wantsAI(_ text: String) -> Bool {
        let low: String = " " + text.lowercased() + " "
        let words: Int = text.split(whereSeparator: { $0 == " " || $0 == "\n" }).count
        let verbs: [String] = [" må ", " skal ", " huske ", " husk "]
        let links: [String] = [" før vi skal ", " før jeg skal ", " hvor vi må ", " hvor jeg må ", " og så ", " siden ", " fordi ", " etterpå ", " deretter "]
        if links.contains(where: { low.contains($0) }) && words >= 6 { return true }
        if words >= 12 && verbs.contains(where: { low.contains($0) }) { return true }
        let sentences: Int = text.split(whereSeparator: { $0 == "." || $0 == "!" || $0 == "?" || $0 == "\n" })
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.count
        return sentences >= 2 && words >= 8
    }

    /* ---------- Bakgrunnsjobben ---------- */

    /// origin: «tasks» (Huskeliste) eller «home_search» (søkefeltet på Hjem). Returnerer når jobben er sendt.
    @discardableResult
    func start(_ text: String, _ store: Store, origin: String = "tasks", list: String? = nil) -> String {
        let t: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return "" }
        let local: String = "local-" + UUID().uuidString.prefix(8).lowercased()
        withAnimation(.easeOut(duration: 0.2)) { jobs.insert(Tasks41Job(id: local, text: t, at: Date()), at: 0) }
        var body: [String: Any] = ["q": t, "async": true, "origin": origin]
        if let list, list != "alle", list != Tasks32b.archId, list != Tasks41Glimt.madeId { body["list"] = list }
        Task { @MainActor in
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/tasks/glimt", json: body, timeout: 30)
                let o: [String: Any] = JS.obj(d)
                if let jid = JS.str(o, "jobId") ?? JS.str(o, "job_id") {
                    self.rename(local, jid)
                    await self.poll(jid, t, store)
                } else {
                    // Eldre server svarte med en gang (items).
                    let n: Int = JS.list(o, "items").count
                    await TasksModel.shared.load(store)
                    self.finish(local, n, store)
                }
            } catch let e as APIError {
                // Q19: serveren har POST /api/tasks/glimt; bare uten nett (status 0) deles beskjeden opp på telefonen.
                if e.status == 0 {
                    await self.localSplit(local, t, list, store)
                } else {
                    self.fail(local)
                }
            } catch {
                await self.localSplit(local, t, list, store)
            }
        }
        return local
    }

    private func rename(_ from: String, _ to: String) {
        if let i = jobs.firstIndex(where: { $0.id == from }) { jobs[i].id = to }
        if let t = homeToasts[from] {
            homeToasts[from] = nil
            homeToasts[to] = t
        }
    }

    private func poll(_ id: String, _ text: String, _ store: Store) async {
        let enc: String = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        let t0: Date = Date()
        var jobApi: Bool = true
        while Date().timeIntervalSince(t0) < 120 {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            if jobApi {
                do {
                    let d: Data = try await store.api.callAt("/api", "GET", "/tasks/glimt/jobs/" + enc, timeout: 10)
                    let o: [String: Any] = JS.obj(d)
                    let st: String = (JS.str(o, "state") ?? JS.str(o, "status") ?? "").lowercased()
                    if st == "done" || st == "ok" || st == "finished" {
                        await TasksModel.shared.load(store)
                        // Prompt 42: lengdevakt – ett for langt punkt erstattes med den lokale oppdelingen (TasksGlimt.swift).
                        let n0: Int = JS.int(o, "count") ?? JS.list(o, "tasks").count
                        let n: Int = await guard42(text, store)
                        finish(id, n > 0 ? n : (n0 > 0 ? n0 : JS.list(o, "items").count), store)
                        return
                    }
                    if st == "error" || st == "failed" { fail(id); return }
                    continue
                } catch {
                    jobApi = false
                }
            }
            await TasksModel.shared.load(store)
            let made: Int = TasksModel.shared.items.filter { $0.origin41?.text == text }.count
            if made > 0 { finish(id, await guard42(text, store), store); return }
        }
        await TasksModel.shared.load(store)
        let made: Int = TasksModel.shared.items.filter { $0.origin41?.text == text }.count
        if made > 0 { finish(id, made, store) } else { fail(id) }
    }

    private func finish(_ id: String, _ n: Int, _ store: Store) {
        Haptics.shared.success()
        var j: Tasks41Job = jobs.first(where: { $0.id == id }) ?? Tasks41Job(id: id, text: "", at: Date())
        j.state = "done"
        j.count = n
        withAnimation(.easeOut(duration: 0.2)) {
            jobs.removeAll { $0.id == id }
            banner = j
        }
        let text: String = Tasks41Glimt.doneText(n)
        // Fra Hjem-søket: Glimt-toasten avsluttes med «✓ Glimt lagde 3 punkter i Huskeliste».
        if let tid = homeToasts[id] {
            homeToasts[id] = nil
            let msg: String = "✓ " + (n == 1 ? "Glimt lagde 1 punkt i Gjøremål" : "Glimt lagde \(n) punkter i Gjøremål")
            if AiJobs31.shared.jobs.contains(where: { $0.id == tid }) {
                AiJobs31.shared.end(tid, done: msg)
            } else if UIApplication.shared.applicationState == .active {
                store.flash(msg)
            }
        }
        if UIApplication.shared.applicationState != .active {
            LocalNotify.post("Glimt", text, id: "tasks41-" + id, group: "huske")
        } else if !store.inTasks37 {
            store.flash("✓ " + text)
        }
        bannerTask?.cancel()
        bannerTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 10_000_000_000)
            if Task.isCancelled { return }
            withAnimation(.easeOut(duration: 0.2)) { self.banner = nil }
        }
        WidgetCenter.shared.reloadTimelines(ofKind: "no.kristo.finanshub.tasks")
    }

    private func fail(_ id: String) {
        Haptics.shared.warning()
        if let tid = homeToasts[id] {
            homeToasts[id] = nil
            AiJobs31.shared.end(tid, done: "Glimt fikk ikke delt opp beskjeden")
        }
        if let i = jobs.firstIndex(where: { $0.id == id }) { jobs[i].state = "fail" }
    }

    func dismissJob(_ id: String) {
        withAnimation(.easeOut(duration: 0.2)) { jobs.removeAll { $0.id == id } }
    }

    func dismissBanner() {
        bannerTask?.cancel()
        withAnimation(.easeOut(duration: 0.2)) { banner = nil }
    }

    /// Prompt 42: «Glimt delte beskjeden i 2 oppgaver».
    nonisolated static func doneText(_ n: Int) -> String {
        n == 1 ? "Glimt lagde 1 oppgave" : "Glimt delte beskjeden i \(n) oppgaver"
    }

    /// Ingen nett / eldre server: lokal oppdeling, og punktene legges inn som vanlig.
    private func localSplit(_ id: String, _ text: String, _ list: String?, _ store: Store) async {
        let items: [Task40Item] = Tasks41Glimt.localItems(text)
        let m: TasksModel = TasksModel.shared
        var l: String = list ?? m.lists.first?.id ?? "hjem"
        if l == "alle" || l == Tasks32b.archId || l == Tasks41Glimt.madeId { l = m.lists.first?.id ?? "hjem" }
        for it in items {
            var body: [String: Any] = ["title": it.title, "list": l, "origin": ["text": text, "at": JS.isoPlain.string(from: Date()), "engine": "lokal"]]
            if !it.place.isEmpty { body["place"] = it.place }
            if !it.note.isEmpty { body["note"] = it.note }
            _ = try? await store.api.callAt("/api", "POST", "/tasks", json: body)
        }
        await m.load(store)
        Tasks42Split.logLine(inputLen: text.count, model: "lokal", count: items.count, parseOk: true, path: "local")
        finish(id, items.count, store)
    }

    /// Lokal reserve. Prompt 42: Tasks42Split (gjentatt stedsnavn, «og så», «og husk», fyllord, notat og frist-tekst).
    nonisolated static func localItems(_ text: String) -> [Task40Item] {
        let n42: [Task40Item] = Tasks42Split.items(text)
        if !n42.isEmpty { return n42 }
        var t: String = text
        for (a, b) in [(" før vi skal ", ". "), (" før jeg skal ", ". "), (" hvor vi må ", ". Deretter "), (" hvor jeg må ", ". Deretter ")] {
            t = t.replacingOccurrences(of: a, with: b, options: .caseInsensitive)
        }
        var note: String = ""
        for k in [" siden ", " fordi "] {
            if let r = t.range(of: k, options: .caseInsensitive) {
                note = String(t[r.upperBound...]).trimmingCharacters(in: CharacterSet(charactersIn: " .!"))
                t = String(t[..<r.lowerBound])
                break
            }
        }
        var items: [Task40Item] = Task40Split.split(t)
        if items.isEmpty { items = [Task40Item(title: Task40Split.title(text))] }
        if !note.isEmpty, !items.isEmpty {
            let first: String = note.prefix(1).uppercased() + String(note.dropFirst())
            items[items.count - 1].note = first
        }
        return items
    }

    /* ---------- «Laget med Glimt» ---------- */

    struct Made: Identifiable, Hashable {
        var id: String
        var origin: TaskOrigin41
        var items: [TaskItem17]
    }

    func made(_ m: TasksModel) -> [Made] {
        var out: [Made] = []
        for t in m.items {
            guard let o = t.origin41, !forgotten.contains(o.id) else { continue }
            if let i = out.firstIndex(where: { $0.id == o.id }) {
                out[i].items.append(t)
            } else {
                out.append(Made(id: o.id, origin: o, items: [t]))
            }
        }
        return out.sorted { ($0.origin.at ?? .distantPast) > ($1.origin.at ?? .distantPast) }
    }

    /// «✦ Del opp på nytt»: POST /api/tasks/glimt/sources/:id/redo (serveren sletter ufullførte punkter først og kjører på nytt).
    /// Eldre server: slett ufullførte punkter her og start en ny jobb.
    func redo(_ x: Made, _ store: Store) {
        Haptics.shared.tap()
        let m: TasksModel = TasksModel.shared
        let list: String = x.items.first?.list ?? (m.lists.first?.id ?? "hjem")
        let enc: String = x.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? x.id
        let text: String = x.origin.text
        let local: String = "local-" + UUID().uuidString.prefix(8).lowercased()
        withAnimation(.easeOut(duration: 0.2)) { jobs.insert(Tasks41Job(id: local, text: text, at: Date()), at: 0) }
        Task { @MainActor in
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/tasks/glimt/sources/" + enc + "/redo", json: [:], timeout: 20)
                let o: [String: Any] = JS.obj(d)
                await m.load(store)
                if let jid = JS.str(o, "jobId") ?? JS.str(o, "job_id") {
                    self.rename(local, jid)
                    await self.poll(jid, text, store)
                } else {
                    self.finish(local, JS.int(o, "count") ?? 0, store)
                }
            } catch {
                self.dismissJob(local)
                for t in x.items where !t.done { m.delete(t, store) }
                self.forgotten.insert(x.id)
                self.start(text, store, origin: "huske", list: list)
            }
        }
    }

    /// «Glem beskjeden»: DELETE /api/tasks/glimt/sources/:id – punktene blir, beskjeden forsvinner fra «Laget med Glimt».
    func forget(_ id: String, _ store: Store) {
        Haptics.shared.tap()
        forgotten.insert(id)
        UserDefaults.standard.set(Array(forgotten.suffix(200)), forKey: "tasks41.forgotten")
        let enc: String = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        Task { _ = try? await store.api.callAt("/api", "DELETE", "/tasks/glimt/sources/" + enc, timeout: 10) }
    }
}

/* ---------- Visning ---------- */

/// Øverst i lista: stiplede rader for jobber som pågår, og ferdig-raden («Se / ✕»).
struct Tasks41PendingRows: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var g: Tasks41Glimt { Tasks41Glimt.shared }

    var body: some View {
        VStack(spacing: 8) {
            ForEach(g.jobs) { (j: Tasks41Job) in
                HStack(alignment: .top, spacing: 10) {
                    if j.state == "fail" {
                        Text("!").font(PF.ui(13, .heavy)).foregroundStyle(p.lab).frame(width: 18)
                    } else {
                        ProgressView().scaleEffect(0.8).frame(width: 18)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(j.state == "fail" ? "Glimt fikk ikke delt opp beskjeden" : "✦ Glimt deler opp beskjeden …").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
                        Text("«" + j.text + "»").font(PF.italic(14)).foregroundStyle(p.mut).lineLimit(2)
                    }
                    Spacer(minLength: 4)
                    if j.state == "fail" {
                        Button { g.dismissJob(j.id) } label: { Image(systemName: "xmark").font(PF.ui(12, .bold)).foregroundStyle(p.mut).frame(width: 44, height: 44).contentShape(Rectangle()) }.buttonStyle(.plain).accessibilityLabel("Fjern")
                    }
                }
                .padding(12)
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(p.line, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                .transition(.opacity)
            }
            if let b = g.banner {
                HStack(spacing: 10) {
                    Text("✓ " + Tasks41Glimt.doneText(b.count)).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).lineLimit(2)
                    Spacer(minLength: 4)
                    // Prompt 42: én Angre slår sammen igjen; Endre åpner «Laget med Glimt».
                    if b.count > 1 && !b.text.isEmpty {
                        Button { g.undo42(b.text, store) } label: { Text("Angre").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink) }
                            .buttonStyle(.plain)
                    }
                    Button {
                        g.dismissBanner()
                        TaskDock22.shared.cur = Tasks41Glimt.madeId
                    } label: { Text(b.count > 1 ? "Endre" : "Se").font(PF.ui(13.5, .bold)).foregroundStyle(p.lab) }
                    .buttonStyle(.plain)
                    Button { g.dismissBanner() } label: { Image(systemName: "xmark").font(PF.ui(12, .bold)).foregroundStyle(p.mut).frame(width: 44, height: 44).contentShape(Rectangle()) }.buttonStyle(.plain).accessibilityLabel("Lukk")
                }
                .padding(12)
                .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .transition(.opacity)
            }
        }
    }
}

/// Chip i liste-raden: «Laget med Glimt · N» med rød prikk (bare når det finnes minst én beskjed).
struct Tasks41MadeChip: View {
    @Environment(\.paper) private var p
    @MainActor private var g: Tasks41Glimt { Tasks41Glimt.shared }
    @MainActor private var m: TasksModel { TasksModel.shared }

    var body: some View {
        let n: Int = g.made(m).count
        if n > 0 {
            let on: Bool = TaskDock22.shared.cur == Tasks41Glimt.madeId
            // Prompt 43: et langt trykk (rekkefølge-arket) velger ikke lista.
            Button { if Tasks43Tabs.shared.justHeld { return }; Haptics.shared.select(); TaskDock22.shared.cur = Tasks41Glimt.madeId } label: {
                HStack(spacing: 6) {
                    Circle().fill(p.lab).frame(width: 7, height: 7)
                    Text("Laget med Glimt").font(PF.ui(13, .semibold)).foregroundStyle(on ? p.bg : p.ink)
                    Text(String(n)).font(PF.mono(11)).foregroundStyle(on ? p.bg.opacity(0.8) : p.mut)
                }
                .padding(.horizontal, 12).frame(height: 34)
                .background(on ? p.ink : p.card, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}

/// Fanen «Laget med Glimt»: ett kort per beskjed.
struct Tasks41MadeView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var g: Tasks41Glimt { Tasks41Glimt.shared }
    @MainActor private var m: TasksModel { TasksModel.shared }

    var body: some View {
        let list: [Tasks41Glimt.Made] = g.made(m)
        VStack(alignment: .leading, spacing: 12) {
            if list.isEmpty {
                Text("Ingen beskjeder laget med Glimt ennå.").font(PF.ui(14)).foregroundStyle(p.mut).padding(.horizontal, 4)
            }
            ForEach(list) { (x: Tasks41Glimt.Made) in card(x) }
        }
    }

    private func card(_ x: Tasks41Glimt.Made) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                PLabel(text: "Original beskjed")
                Spacer()
                Text(x.origin.at.map { JS.fmt($0, "d. MMM HH:mm") } ?? "").font(PF.mono(11)).foregroundStyle(p.mut)
            }
            Text(x.origin.text).font(PF.italic(17)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            Text(meta(x)).font(PF.ui(12)).foregroundStyle(p.mut)
            VStack(spacing: 0) {
                ForEach(Array(x.items.enumerated()), id: \.element.id) { i, t in
                    Button { Tasks37UI.shared.detail = t } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Text(String(i + 1)).font(PF.mono(12)).foregroundStyle(p.lab).frame(width: 16)
                            Button { m.toggle(t, store) } label: {
                                Image(systemName: t.done ? "checkmark.circle.fill" : "circle").font(.dyn51(size: 18)).foregroundStyle(t.done ? p.pos : p.mut)
                                    // Prompt 85: trykkflate 44 pt uten å flytte noe (før ca. 22 pt), og tekst for VoiceOver.
                                    .padding(11).contentShape(Rectangle()).padding(-11)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(t.done ? "Ferdig" : "Ikke ferdig")
                            VStack(alignment: .leading, spacing: 2) {
                                Text(t.title).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).strikethrough(t.done)
                                    .fixedSize(horizontal: false, vertical: true)
                                let sub: String = [m.listName(t.list), t.place, t.note].filter { !$0.isEmpty }.joined(separator: " · ")
                                if !sub.isEmpty { Text(sub).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 9)
                        .overlay(alignment: .top) { if i > 0 { Rectangle().fill(p.line).frame(height: 1) } }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack(spacing: 8) {
                Button { g.redo(x, store) } label: {
                    Text("✦ Del opp på nytt").font(PF.ui(13, .bold)).foregroundStyle(p.bg).padding(.horizontal, 14).frame(height: 36)
                        .background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                Button { g.forget(x.id, store) } label: {
                    Text("Glem beskjeden").font(PF.ui(13, .semibold)).foregroundStyle(p.ink).padding(.horizontal, 14).frame(height: 36)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func meta(_ x: Tasks41Glimt.Made) -> String {
        var parts: [String] = [String(x.items.count) + (x.items.count == 1 ? " punkt" : " punkter")]
        parts.append("Glimt" + (x.origin.engine.isEmpty || x.origin.engine == "lokal" ? "" : " · " + x.origin.engine))
        if !x.origin.by.isEmpty { parts.append("av " + x.origin.by) }
        return parts.joined(separator: " · ")
    }
}

/// I detaljarket: «LAGET MED GLIMT · ORIGINAL BESKJED «…»». Trykk åpner fanen.
struct Tasks41OriginCard: View {
    @Environment(\.paper) private var p
    let t: TaskItem17
    let close: () -> Void

    var body: some View {
        if let o = t.origin41 {
            Button {
                close()
                TaskDock22.shared.cur = Tasks41Glimt.madeId
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    PLabel(text: "Laget med Glimt · original beskjed")
                    Text("«" + o.text + "»").font(PF.italic(15)).foregroundStyle(p.ink).lineLimit(3).multilineTextAlignment(.leading)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }
}

/* ---------- Fra søkefeltet på Hjem ---------- */

extension Tasks41Glimt {
    nonisolated static let homeSteps: [String] = ["Leser beskjeden", "Deler opp i punkter", "Finner rekkefølge og steder", "Lagrer i Gjøremål"]

    /// Huskebeskjed i søkefeltet: «husk / påminn meg / legg til i huskeliste / ny oppgave …», eller ≥ 6 ord med «må/skal/huske»
    /// og «vi/jeg/meg/oss». Ikke spørsmål (timer går fortsatt til Kalender).
    nonisolated static func isHuske(_ raw: String) -> Bool {
        let t: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let low: String = t.lowercased()
        if low.hasSuffix("?") { return false }
        let qWords: [String] = ["hva ", "hvem ", "hvor ", "når ", "hvorfor ", "hvordan ", "hvilken ", "hvilke ", "kan du ", "er det "]
        if qWords.contains(where: { low.hasPrefix($0) }) { return false }
        let lead: [String] = ["husk ", "husk å ", "påminn meg", "minn meg på", "legg til i huskeliste", "legg til i huskelisten", "ny oppgave"]
        if lead.contains(where: { low.hasPrefix($0) }) { return true }
        let words: [String] = low.split(whereSeparator: { $0 == " " }).map(String.init)
        if words.count < 6 { return false }
        let verb: Bool = words.contains(where: { ["må", "skal", "huske", "husk"].contains($0) })
        let who: Bool = words.contains(where: { ["vi", "jeg", "meg", "oss"].contains($0) })
        return verb && who
    }

    /// «Legg i Huskeliste» / ↵ fra Hjem: samme Glimt-animasjon som for timer, og samme bakgrunnsjobb.
    func fromHome(_ text: String, _ store: Store) {
        Haptics.shared.tap()
        let t: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let lists: TasksModel = TasksModel.shared
        let listName: String = lists.lists.first?.name ?? "Hjem"
        let id: String = start(t, store, origin: "home_search", list: nil)
        let aj: AiJobs31 = AiJobs31.shared
        aj.begin(id: "huske-" + id, kind: "huske", title: "Legger til i Gjøremål", input: t, steps: Tasks41Glimt.homeSteps)
        if let i = aj.jobs.firstIndex(where: { $0.id == "huske-" + id }) {
            aj.jobs[i].model = "Glimt"
            aj.jobs[i].fields = [AiField31(key: "Beskjed", value: t), AiField31(key: "Liste", value: listName), AiField31(key: "Original", value: "lagres i «Laget med Glimt»")]
        }
        homeToasts[id] = "huske-" + id
        // Animasjonen varer ca. 6 s; tar Glimt lengre tid, fortsetter jobben i bakgrunnen.
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 6_500_000_000)
            if let tid = self.homeToasts[id] ?? self.homeToasts.first(where: { $0.value == "huske-" + id })?.value,
               aj.jobs.contains(where: { $0.id == tid }) {
                aj.end(tid, done: "✦ Glimt deler opp i bakgrunnen …")
            }
        }
    }
}

/// Mørkt forslag under søkefeltet (som «Legg i kalender»): ☑ · beskjeden · «Legg i Huskeliste» («Glimt deler opp i punkter»).
struct HomeSearch41Huske: View {
    @Environment(\.paper) private var p
    let text: String
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 10) {
                Image(systemName: "checklist").font(.dyn51(size: 15, weight: .semibold)).foregroundStyle(p.bg)
                VStack(alignment: .leading, spacing: 0) {
                    Text(text).font(PF.ui(13.5, .bold)).foregroundStyle(p.bg).lineLimit(1)
                    Text("Glimt deler opp i punkter").font(PF.ui(12)).foregroundStyle(p.bg.opacity(0.8)).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text("Legg i Gjøremål").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
                    .padding(.horizontal, 12).frame(height: 32)
                    .background(p.bg, in: Capsule())
            }
            .padding(.leading, 14).padding(.trailing, 8).padding(.vertical, 6)
            .frame(minHeight: 44)
            .background(p.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Legg i Gjøremål: " + text)
    }
}

// MARK: -

/* ---------------- Prompt 42: Gjøremål-Glimt deler fortsatt ikke opp beskjeden ---------------- */
// claude-code-huskeliste-glimt-del-opp.md. Serveren (SERVER42) gir alltid en liste {tasks:[…]} og erstatter den midlertidige
// oppgaven. Appen:
// – Lokal forhåndsdeling (før AI-en svarer, og hvis AI-en feiler): punktum/linjeskift/«og så»/«og husk», og gjentatt stedsnavn
//   («… Strømstad Strømstad må …» = grense). Fjerner «husk å», «må huske å», «de må», «jeg må» i starten og doble ord («ha ha»).
//   Begrunnelser («siden vi skal …») blir notat, steder blir place, «før vi drar til X» blir frist-tekst.
// – Lengdevakt: et punkt med tittel over 60 tegn, eller flere verb-fraser, regnes som mislykket oppdeling. Da erstattes det med
//   den lokale oppdelingen (når den gir flere punkter).
// – Én Angre som slår sammen igjen: punktene fra beskjeden slettes, og én oppgave med originalteksten opprettes.
// – Logg per beskjed: input_len, model, tasks_count, parse_ok, path (local|ai).

enum Tasks42Split {
    static let maxTitle: Int = 60
    private static let log: Logger = Logger(subsystem: "no.kristo.finanshub", category: "tasks42")

    /// Lokal oppdeling i rekkefølge.
    static func items(_ text: String) -> [Task40Item] {
        let clean: String = dedupe(text)
        var out: [Task40Item] = []
        for part in boundaries(clean) {
            if let it = item(part) { out.append(it) }
        }
        if out.isEmpty { out = [Task40Item(title: cap(Task40Split.title(text)))] }
        for i in out.indices { out[i].step = i + 1; if i > 0 { out[i].after = out[i - 1].title } }
        return out
    }

    /// «ha ha» → «ha». Gjentatt stedsnavn med stor forbokstav («Strømstad Strømstad») beholdes som grense («Strømstad | Strømstad»).
    static func dedupe(_ text: String) -> String {
        let words: [String] = text.split(separator: " ").map(String.init)
        var out: [String] = []
        for w in words {
            if let last = out.last, last.lowercased() == w.lowercased() {
                if let f = w.first, f.isUppercase { out.append("|"); out.append(w) }
                continue
            }
            out.append(w)
        }
        return out.joined(separator: " ")
    }

    /// Deler på punktum, linjeskift, «|» (gjentatt sted), «og så», «og husk», «husk også».
    static func boundaries(_ text: String) -> [String] {
        var t: String = text
        for k in [" og så ", " og husk ", " husk også ", " og deretter ", " deretter "] {
            t = t.replacingOccurrences(of: k, with: " | ", options: .caseInsensitive)
        }
        return t.split(whereSeparator: { $0 == "." || $0 == "!" || $0 == "?" || $0 == "\n" || $0 == "|" })
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    /// Ett punkt: sted først («Strømstad må huske å …»), «før vi drar til X» som frist-tekst, «siden …» som notat.
    static func item(_ s0: String) -> Task40Item? {
        var s: String = s0
        var place: String = ""
        // «Strømstad må huske å ta med …»: stedsnavnet før «må/skal».
        let ws: [String] = s.split(separator: " ").map(String.init)
        if ws.count > 2, let f = ws[0].first, f.isUppercase, ["må", "skal"].contains(ws[1].lowercased()) {
            place = ws[0]
            s = ws.dropFirst().joined(separator: " ")
        }
        var note: String = ""
        for k in [" siden ", " fordi "] {
            if let r = s.range(of: k, options: .caseInsensitive) {
                note = String(s[r.upperBound...]).trimmingCharacters(in: CharacterSet(charactersIn: " .!,"))
                s = String(s[..<r.lowerBound])
                break
            }
        }
        var due: String = ""
        for k in [" før vi drar til ", " før vi reiser til ", " før vi skal til ", " før vi skal ", " før jeg drar til "] {
            if let r = s.range(of: k, options: .caseInsensitive) {
                let dest: String = String(s[r.upperBound...]).trimmingCharacters(in: CharacterSet(charactersIn: " .!,"))
                due = dest.isEmpty ? "før turen" : "før " + dest + "-turen"
                s = String(s[..<r.lowerBound])
                break
            }
        }
        // Fyllord i starten.
        let lead: [String] = ["må huske å ", "må huske ", "husk å ", "huske å ", "de må ", "jeg må ", "vi må ", "må ", "å "]
        var changed: Bool = true
        while changed {
            changed = false
            for l in lead where s.lowercased().hasPrefix(l) { s = String(s.dropFirst(l.count)); changed = true }
        }
        var title: String = Task40Split.title(s)
        if !place.isEmpty && !title.lowercased().contains(place.lowercased()) { title += " fra " + place }
        title = cap(title)
        if title.isEmpty { return nil }
        var it: Task40Item = Task40Item(title: title)
        it.place = place
        if !note.isEmpty { it.note = note.prefix(1).uppercased() + String(note.dropFirst()) }
        if !due.isEmpty { it.note = it.note.isEmpty ? "Frist: " + due : it.note + " · frist: " + due }
        return it
    }

    /// Maks 60 tegn, kuttet ved et ord.
    static func cap(_ t: String) -> String {
        let s: String = t.trimmingCharacters(in: .whitespaces)
        if s.count <= maxTitle { return s.prefix(1).uppercased() + String(s.dropFirst()) }
        var out: String = ""
        for w in s.split(separator: " ") {
            if out.count + w.count + 1 > maxTitle { break }
            out += (out.isEmpty ? "" : " ") + w
        }
        return out.prefix(1).uppercased() + String(out.dropFirst())
    }

    /// Lengdevakt: tittel over 60 tegn eller flere verb-fraser («ta med … må … ta med …»).
    static func looksUnsplit(_ title: String) -> Bool {
        if title.count > maxTitle { return true }
        let low: String = " " + title.lowercased() + " "
        let verbs: [String] = [" ta med ", " hent ", " send ", " kjøp ", " ring ", " husk ", " må "]
        let hits: Int = verbs.reduce(0) { (n: Int, v: String) -> Int in n + low.components(separatedBy: v).count - 1 }
        return hits >= 2
    }

    static func logLine(inputLen: Int, model: String, count: Int, parseOk: Bool, path: String) {
        log.notice("tasks42 input_len=\(inputLen) model=\(model, privacy: .public) tasks_count=\(count) parse_ok=\(parseOk) path=\(path, privacy: .public)")
    }
}

extension Tasks41Glimt {
    /// Punktene som ble laget fra beskjeden (origin.text), i listerekkefølge.
    @MainActor func items42(_ text: String) -> [TaskItem17] {
        TasksModel.shared.items.filter { $0.origin41?.text == text }
    }

    /// Lengdevakt etter AI-svaret: ett punkt med for lang tittel → erstatt med den lokale oppdelingen. Returnerer antall punkter.
    @MainActor func guard42(_ text: String, _ store: Store) async -> Int {
        let made: [TaskItem17] = items42(text)
        guard made.count == 1, let one = made.first, Tasks42Split.looksUnsplit(one.title) else {
            Tasks42Split.logLine(inputLen: text.count, model: made.first?.origin41?.engine ?? "", count: made.count, parseOk: !made.isEmpty, path: "ai")
            return made.count
        }
        let local: [Task40Item] = Tasks42Split.items(text)
        guard local.count >= 2 else {
            Tasks42Split.logLine(inputLen: text.count, model: one.origin41?.engine ?? "", count: 1, parseOk: false, path: "ai")
            return 1
        }
        // Erstatt: behold den første (ny tittel), opprett resten.
        let id: String = one.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? one.id
        var first: [String: Any] = ["title": local[0].title]
        if !local[0].note.isEmpty { first["note"] = local[0].note }
        if !local[0].place.isEmpty { first["place"] = local[0].place }
        _ = try? await store.api.callAt("/api", "PATCH", "/tasks/\(id)", json: first)
        let origin: [String: Any] = ["text": text, "at": JS.isoPlain.string(from: Date()), "engine": "lokal"]
        for it in local.dropFirst() {
            var body: [String: Any] = ["title": it.title, "list": one.list, "origin": origin]
            if !it.place.isEmpty { body["place"] = it.place }
            if !it.note.isEmpty { body["note"] = it.note }
            _ = try? await store.api.callAt("/api", "POST", "/tasks", json: body)
        }
        await TasksModel.shared.load(store)
        Tasks42Split.logLine(inputLen: text.count, model: "lokal", count: local.count, parseOk: true, path: "local")
        return local.count
    }

    /// Angre: slår sammen igjen til én oppgave med originalteksten (én handling tilbakestiller alt).
    @MainActor func undo42(_ text: String, _ store: Store) {
        let made: [TaskItem17] = items42(text)
        guard !made.isEmpty else { return }
        Haptics.shared.tap()
        let list: String = made.first?.list ?? (TasksModel.shared.lists.first?.id ?? "hjem")
        dismissBanner()
        Task { @MainActor in
            for t in made { TasksModel.shared.delete(t, store) }
            let body: [String: Any] = ["title": Tasks42Split.cap(text), "note": text, "list": list]
            _ = try? await store.api.callAt("/api", "POST", "/tasks", json: body)
            await TasksModel.shared.load(store)
            store.flash("Slått sammen til én oppgave")
        }
    }
}
