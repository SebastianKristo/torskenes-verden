import SwiftUI
import UIKit
import WidgetKit

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
                if e.status == 404 || e.status == 405 || e.status == 0 {
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
                        // Prompt 42: lengdevakt – ett for langt punkt erstattes med den lokale oppdelingen (Tasks42Split.swift).
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
            let msg: String = "✓ " + (n == 1 ? "Glimt lagde 1 punkt i Huskeliste" : "Glimt lagde \(n) punkter i Huskeliste")
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
            var body: [String: Any] = ["title": it.title, "list": l, "origin": ["text": text, "at": ISO8601DateFormatter().string(from: Date()), "engine": "lokal"]]
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
                        Button { g.dismissJob(j.id) } label: { Text("✕").font(PF.ui(13, .bold)).foregroundStyle(p.mut) }.buttonStyle(.plain)
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
                    Button { g.dismissBanner() } label: { Text("✕").font(PF.ui(13, .bold)).foregroundStyle(p.mut) }.buttonStyle(.plain)
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
                                Image(systemName: t.done ? "checkmark.circle.fill" : "circle").font(.system(size: 18)).foregroundStyle(t.done ? p.pos : p.mut)
                            }
                            .buttonStyle(.plain)
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
    nonisolated static let homeSteps: [String] = ["Leser beskjeden", "Deler opp i punkter", "Finner rekkefølge og steder", "Lagrer i Huskeliste"]

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
        aj.begin(id: "huske-" + id, kind: "huske", title: "Legger til i Huskeliste", input: t, steps: Tasks41Glimt.homeSteps)
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
                Image(systemName: "checklist").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.bg)
                VStack(alignment: .leading, spacing: 0) {
                    Text(text).font(PF.ui(13.5, .bold)).foregroundStyle(p.bg).lineLimit(1)
                    Text("Glimt deler opp i punkter").font(PF.ui(12)).foregroundStyle(p.bg.opacity(0.8)).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text("Legg i Huskeliste").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
                    .padding(.horizontal, 12).frame(height: 32)
                    .background(p.bg, in: Capsule())
            }
            .padding(.leading, 14).padding(.trailing, 8).padding(.vertical, 6)
            .frame(minHeight: 44)
            .background(p.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Legg i Huskeliste: " + text)
    }
}
