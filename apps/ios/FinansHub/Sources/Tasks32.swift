import SwiftUI
import WidgetKit

/* ---------------- Prompt 32: Huskeliste – Arkivert ---------------- */
// Fasit: design/Huskeliste.dc.html. Spesifikasjon: claude-code-rom-fullskjerm-bursdag-huskeliste.md (Huskeliste).
// API (SERVER32, server/tasks.js): GET /api/tasks?archived=1 → {items (nyeste først), archivedCount}, PATCH /api/tasks/:id
// {archived:true|false[, done:false]}, POST /api/tasks/archive-done {list?}, DELETE /api/tasks/archived?list=…
// Fullførte oppgaver arkiveres automatisk på serveren etter 7 dager. Arkiverte telles ikke i lister, widgets eller på Hjem.

struct ArchTask32b: Identifiable, Hashable {
    var id: String
    var title: String
    var list: String
    var archivedAt: Double

    init(_ o: [String: Any]) {
        id = JS.str(o, "id") ?? UUID().uuidString
        title = JS.str(o, "title") ?? ""
        list = JS.str(o, "list") ?? "hjem"
        archivedAt = JS.num(o, "archivedAt") ?? JS.num(o, "archived_at") ?? 0
    }
}

@MainActor
@Observable
final class Tasks32b {
    static let shared = Tasks32b()
    nonisolated static let archId: String = "arkiv"

    var items: [ArchTask32b] = []
    var count: Int = 0
    var loaded: Bool = false

    private static func enc(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? s }

    func load(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/tasks?archived=1", timeout: 15) else { loaded = true; return }
        let o: [String: Any] = JS.obj(d)
        // Eldre server ignorerer ?archived=1: bare de som faktisk er arkivert.
        let raw: [[String: Any]] = JS.list(o, "items").filter { (x: [String: Any]) -> Bool in
            (JS.bool(x, "archived") ?? false) || JS.num(x, "archivedAt") != nil
        }
        items = raw.map { ArchTask32b($0) }.sorted { (a: ArchTask32b, b: ArchTask32b) -> Bool in a.archivedAt > b.archivedAt }
        count = Int(JS.num(o, "archivedCount") ?? Double(items.count))
        loaded = true
    }

    /// Arkivikonet på en fullført oppgave.
    func archive(_ t: TaskItem17, _ store: Store) {
        let m: TasksModel = TasksModel.shared
        m.items.removeAll { $0.id == t.id }
        var a = ArchTask32b([:])
        a.id = t.id
        a.title = t.title
        a.list = t.list
        a.archivedAt = Date().timeIntervalSince1970 * 1000
        items.insert(a, at: 0)
        count += 1
        Haptics.shared.tick()
        Task { @MainActor in
            _ = try? await store.api.callAt("/api", "PATCH", "/tasks/" + Tasks32b.enc(t.id), json: ["archived": true])
            WidgetCenter.shared.reloadTimelines(ofKind: "no.kristo.finanshub.tasks")
        }
    }

    /// «Arkiver alle» i FERDIG.
    func archiveDone(_ list: String?, _ store: Store) {
        let m: TasksModel = TasksModel.shared
        let done: [TaskItem17] = m.items.filter { $0.done && (list == nil || $0.list == list) }
        if done.isEmpty { return }
        m.items.removeAll { $0.done && (list == nil || $0.list == list) }
        Haptics.shared.success()
        var body: [String: Any] = [:]
        if let list { body["list"] = list }
        Task { @MainActor in
            do {
                _ = try await store.api.callAt("/api", "POST", "/tasks/archive-done", json: body)
            } catch {
                for t in done { _ = try? await store.api.callAt("/api", "PATCH", "/tasks/" + Tasks32b.enc(t.id), json: ["archived": true]) }
            }
            await self.load(store)
            store.flash(done.count == 1 ? "1 oppgave arkivert" : "\(done.count) oppgaver arkivert")
        }
    }

    /// ↺ Gjenopprett: tilbake som åpen oppgave i sin liste.
    func restore(_ a: ArchTask32b, _ store: Store) {
        items.removeAll { $0.id == a.id }
        count = Swift.max(0, count - 1)
        Haptics.shared.select()
        Task { @MainActor in
            _ = try? await store.api.callAt("/api", "PATCH", "/tasks/" + Tasks32b.enc(a.id), json: ["archived": false, "done": false])
            await TasksModel.shared.load(store)
        }
    }

    /// × i arkivet: slett for godt.
    func remove(_ a: ArchTask32b, _ store: Store) {
        items.removeAll { $0.id == a.id }
        count = Swift.max(0, count - 1)
        Haptics.shared.tick()
        Task { @MainActor in _ = try? await store.api.callAt("/api", "DELETE", "/tasks/" + Tasks32b.enc(a.id)) }
    }

    /// «Tøm arkivet».
    func clear(_ store: Store) {
        items = []
        count = 0
        Haptics.shared.success()
        Task { @MainActor in _ = try? await store.api.callAt("/api", "DELETE", "/tasks/archived") }
    }
}

/// Chip-teksten «Arkivert · N».
struct Tasks32bChip: View {
    @Environment(\.paper) private var p
    @MainActor private var a: Tasks32b { Tasks32b.shared }
    let on: Bool
    let tap: () -> Void

    var body: some View {
        Button(action: tap) {
            HStack(spacing: 6) {
                Image(systemName: "archivebox").font(.system(size: 12, weight: .semibold))
                Text(a.count > 0 ? "Arkivert · \(a.count)" : "Arkivert").font(PF.ui(13, .bold))
            }
            .foregroundStyle(on ? p.bg : p.ink)
            .padding(.horizontal, 14).frame(height: 38)
            .background(on ? p.ink : p.card, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Arkivikonet ved siden av × på en fullført oppgave.
struct Tasks32bArchiveButton: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let t: TaskItem17

    var body: some View {
        Button { Tasks32b.shared.archive(t, store) } label: {
            Image(systemName: "archivebox").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.mut)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Arkiver")
    }
}

/// Listen «ARKIVERT · N» med ↺ Gjenopprett og ×, og «Tøm arkivet» øverst.
struct Tasks32bArchiveView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var a: Tasks32b { Tasks32b.shared }
    @MainActor private var m: TasksModel { TasksModel.shared }
    @State private var confirm: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                PLabel(text: "Arkivert · \(a.items.count)", color: p.mut)
                Spacer()
                if !a.items.isEmpty {
                    Button {
                        if confirm { a.clear(store); confirm = false } else { confirm = true }
                    } label: {
                        Text(confirm ? "Trykk igjen for å tømme" : "Tøm arkivet").font(PF.ui(12.5, .bold)).foregroundStyle(p.lab)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 4)
            if a.items.isEmpty {
                Text(a.loaded ? "Ingenting i arkivet. Fullførte oppgaver arkiveres automatisk etter 7 dager." : "Henter …")
                    .font(PF.ui(14)).foregroundStyle(p.mut).padding(.horizontal, 4).padding(.vertical, 12)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(a.items.enumerated()), id: \.element.id) { i, t in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        row(t)
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 2)
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
        .task { await a.load(store) }
    }

    private func row(_ t: ArchTask32b) -> some View {
        HStack(spacing: 10) {
            Circle().fill(m.color(t.list)).frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 1) {
                Text(t.title).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(2)
                Text(m.listName(t.list) + (t.archivedAt > 0 ? " · " + JS.fmt(Date(timeIntervalSince1970: t.archivedAt / 1000), "d. MMM") : ""))
                    .font(PF.ui(12)).foregroundStyle(p.mut)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { a.restore(t, store) } label: {
                Text("↺ Gjenopprett").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink)
                    .padding(.horizontal, 10).frame(height: 32)
                    .background(p.bg, in: Capsule())
            }
            .buttonStyle(.plain)
            Button { a.remove(t, store) } label: {
                Text("×").font(PF.ui(20, .bold)).foregroundStyle(p.mut).frame(width: 30, height: 36)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Slett for godt")
        }
        .frame(minHeight: 54)
    }
}
