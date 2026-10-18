import SwiftUI
import WidgetKit
import AppIntents

/* ---------------- Huskeliste-widget (prompt 17): de neste oppgavene med avkrysning ---------------- */

struct TaskW: Hashable {
    var id: String
    var title: String
    var list: String
    var due: String
    var overdue: Bool
    var today: Bool
}

struct TasksEntry: TimelineEntry {
    let date: Date
    let items: [TaskW]
    let open: Int
    let colors: [String: String]
    let linked: Bool
}

enum TasksFetch {
    static let cacheKey = "w.tasks"

    static func parse(_ d: Data) -> (items: [TaskW], open: Int, colors: [String: String]) {
        let o = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        let raw = (o["items"] as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
        let items = raw.map { x -> TaskW in
            TaskW(id: (x["id"] as? String) ?? "\(x["id"] ?? "")", title: (x["title"] as? String) ?? "", list: (x["list"] as? String) ?? "hjem",
                  due: (x["due"] as? String) ?? "", overdue: (x["overdue"] as? Bool) ?? false, today: (x["today"] as? Bool) ?? false)
        }
        var colors: [String: String] = [:]
        for l in (o["lists"] as? [Any])?.compactMap({ $0 as? [String: Any] }) ?? [] {
            if let id = l["id"] as? String, let c = l["color"] as? String { colors[id] = c }
        }
        let open = (o["open"] as? Int) ?? items.count
        return (items, open, colors)
    }

    static func request(_ path: String, method: String = "GET", body: [String: Any]? = nil) async -> Data? {
        guard let token = WidgetShared.token, !token.isEmpty else { return nil }
        for base in WidgetShared.bases {
            let trimmed = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard let url = URL(string: trimmed + path) else { continue }
            var r = URLRequest(url: url)
            r.httpMethod = method
            r.timeoutInterval = 8
            r.setValue("application/json", forHTTPHeaderField: "Accept")
            r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            if let body {
                r.setValue("application/json", forHTTPHeaderField: "Content-Type")
                r.httpBody = try? JSONSerialization.data(withJSONObject: body)
            }
            if let pair = try? await URLSession.shared.data(for: r), let code = (pair.1 as? HTTPURLResponse)?.statusCode, code < 400 { return pair.0 }
        }
        return nil
    }

    static func load() async -> TasksEntry {
        let linked = !(WidgetShared.token ?? "").isEmpty
        var data = await request("/api/tasks/next?n=4")
        if let data { WidgetShared.defaults.set(data, forKey: cacheKey) } else { data = WidgetShared.defaults.data(forKey: cacheKey) }
        let p = data.map { parse($0) } ?? ([], 0, [:])
        return TasksEntry(date: Date(), items: p.items, open: p.open, colors: p.colors, linked: linked)
    }
}

/// Kryss av en oppgave rett i widgeten (PATCH /api/tasks/:id {done: true}).
struct ToggleTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Fullfør oppgave"
    static var description = IntentDescription("Krysser av en oppgave i huskelisten.")

    @Parameter(title: "Oppgave")
    var taskId: String

    init() { taskId = "" }
    init(taskId: String) { self.taskId = taskId }

    func perform() async throws -> some IntentResult {
        let id = taskId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? taskId
        _ = await TasksFetch.request("/api/tasks/\(id)", method: "PATCH", body: ["done": true])
        // Ta oppgaven ut av bufferet med en gang, så widgeten oppdateres selv uten nett.
        if let d = WidgetShared.defaults.data(forKey: TasksFetch.cacheKey),
           var o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any],
           let items = o["items"] as? [Any] {
            o["items"] = items.filter { (($0 as? [String: Any])?["id"] as? String) != taskId }
            if let n = o["open"] as? Int { o["open"] = Swift.max(0, n - 1) }
            if let nd = try? JSONSerialization.data(withJSONObject: o) { WidgetShared.defaults.set(nd, forKey: TasksFetch.cacheKey) }
        }
        WidgetCenter.shared.reloadTimelines(ofKind: "no.kristo.finanshub.tasks")
        return .result()
    }
}

struct TasksProvider: TimelineProvider {
    func placeholder(in context: Context) -> TasksEntry {
        TasksEntry(date: Date(), items: [TaskW(id: "1", title: "Melk, egg, kaffe", list: "handel", due: "", overdue: false, today: true),
                                         TaskW(id: "2", title: "Bytt filter i ventilasjonen", list: "hjem", due: "", overdue: false, today: true)],
                   open: 2, colors: [:], linked: true)
    }
    func getSnapshot(in context: Context, completion: @escaping (TasksEntry) -> Void) {
        Task { completion(await TasksFetch.load()) }
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<TasksEntry>) -> Void) {
        Task {
            let e = await TasksFetch.load()
            completion(Timeline(entries: [e], policy: .after(Date().addingTimeInterval(15 * 60))))
        }
    }
}

struct TasksWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "no.kristo.finanshub.tasks", provider: TasksProvider()) { e in TasksWidgetView(entry: e) }
            .configurationDisplayName("Huskeliste")
            .description("De neste oppgavene. Kryss av rett i widgeten.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private let paperInk = Color(red: 0.106, green: 0.102, blue: 0.09)
private let paperLab = Color(red: 0.698, green: 0.227, blue: 0.165)
private let paperMut = Color(red: 0.478, green: 0.455, blue: 0.408)

private func tColor(_ hex: String?, _ list: String) -> Color {
    let fallback: [String: String] = ["hjem": "#b23a2a", "handel": "#2f6b45", "hytta": "#a8661a", "jobb": "#2b5d8a"]
    var h = (hex ?? fallback[list] ?? "#1b1a17").trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
    let v = UInt64(h, radix: 16) ?? 0x1B1A17
    return Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
}

struct TasksWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TasksEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text("Huskeliste").font(.system(size: 14, weight: .bold, design: .serif))
                Spacer()
                Text("\(entry.open) igjen").font(.system(size: 11, weight: .semibold, design: .monospaced)).foregroundStyle(paperLab)
            }
            if !entry.linked {
                Text("Åpne appen og logg inn").font(.system(size: 12)).foregroundStyle(paperMut)
            } else if entry.items.isEmpty {
                Spacer(minLength: 0)
                Text("Alt er gjort.").font(.system(size: 13)).foregroundStyle(paperMut)
            }
            ForEach(entry.items.prefix(family == .systemSmall ? 3 : 4), id: \.id) { t in row(t) }
            Spacer(minLength: 0)
        }
        .foregroundStyle(paperInk)
        .widgetURL(URL(string: "finanshub://huske"))
        .containerBackground(for: .widget) { Color(red: 0.953, green: 0.937, blue: 0.902) }
    }

    private func row(_ t: TaskW) -> some View {
        HStack(spacing: 8) {
            Button(intent: ToggleTaskIntent(taskId: t.id)) {
                RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(tColor(entry.colors[t.list], t.list), lineWidth: 2).frame(width: 18, height: 18)
            }
            .buttonStyle(.plain)
            Text(t.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
            Spacer(minLength: 2)
            if family != .systemSmall, !dueText(t).isEmpty {
                Text(dueText(t)).font(.system(size: 11)).foregroundStyle(t.overdue || t.today ? paperLab : paperMut)
            }
        }
    }

    private func dueText(_ t: TaskW) -> String {
        if t.overdue { return "Forfalt" }
        if t.today { return "I dag" }
        guard t.due.count >= 10 else { return "" }
        let p = t.due.prefix(10).split(separator: "-")
        guard p.count == 3, let m = Int(p[1]), let d = Int(p[2]) else { return "" }
        let months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]
        return "\(d). \(months[(m - 1) % 12])"
    }
}

/* ---------------- Posisjon-widget: hvor familien er ---------------- */

struct FamW: Hashable {
    var name: String
    var place: String
    var battery: Int?
}

struct FamEntry: TimelineEntry {
    let date: Date
    let people: [FamW]
    let linked: Bool
}

enum FamFetch {
    static let cacheKey = "w.family"

    static func parse(_ d: Data) -> [FamW] {
        let o = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        let members = (o["members"] as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
        return members.map { m -> FamW in
            let name = ((m["name"] as? String) ?? "–").split(separator: " ").first.map(String.init) ?? "–"
            let sharing = (m["sharing"] as? String) ?? "on"
            let last = m["last"] as? [String: Any]
            var place = (last?["place"] as? String) ?? ""
            if sharing == "paused" { place = "Pauset" } else if sharing == "off" { place = "Deler ikke" } else if last == nil { place = "Ukjent sted" }
            if place.isEmpty { place = "Ukjent sted" }
            let b = (last?["battery"] as? NSNumber)?.doubleValue
            return FamW(name: name, place: place, battery: b.map { Int(($0 <= 1 ? $0 * 100 : $0).rounded()) })
        }
    }

    static func load() async -> FamEntry {
        let linked = !(WidgetShared.token ?? "").isEmpty
        var data = await TasksFetch.request("/api/family")
        if let data { WidgetShared.defaults.set(data, forKey: cacheKey) } else { data = WidgetShared.defaults.data(forKey: cacheKey) }
        return FamEntry(date: Date(), people: data.map { parse($0) } ?? [], linked: linked)
    }
}

struct FamProvider: TimelineProvider {
    func placeholder(in context: Context) -> FamEntry {
        FamEntry(date: Date(), people: [FamW(name: "Ingrid", place: "Hjem", battery: 82), FamW(name: "Pål", place: "Skole", battery: 41)], linked: true)
    }
    func getSnapshot(in context: Context, completion: @escaping (FamEntry) -> Void) { Task { completion(await FamFetch.load()) } }
    func getTimeline(in context: Context, completion: @escaping (Timeline<FamEntry>) -> Void) {
        Task {
            let e = await FamFetch.load()
            completion(Timeline(entries: [e], policy: .after(Date().addingTimeInterval(15 * 60))))
        }
    }
}

struct PositionWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "no.kristo.finanshub.position", provider: FamProvider()) { e in PositionWidgetView(entry: e) }
            .configurationDisplayName("Posisjon")
            .description("Hvor familien er akkurat nå.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct PositionWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FamEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("POSISJON").font(.system(size: 10, weight: .semibold, design: .monospaced)).foregroundStyle(paperLab)
            if !entry.linked {
                Text("Åpne appen og logg inn").font(.system(size: 12)).foregroundStyle(paperMut)
            } else if entry.people.isEmpty {
                Text("Ingen deler posisjonen ennå.").font(.system(size: 12)).foregroundStyle(paperMut)
            }
            ForEach(entry.people.prefix(family == .systemSmall ? 3 : 4), id: \.self) { m in
                HStack(spacing: 7) {
                    Text(String(m.name.prefix(1))).font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 22, height: 22).background(paperInk, in: Circle())
                    VStack(alignment: .leading, spacing: 0) {
                        Text(m.name).font(.system(size: 12.5, weight: .semibold)).lineLimit(1)
                        Text(m.place).font(.system(size: 11)).foregroundStyle(paperMut).lineLimit(1)
                    }
                    Spacer(minLength: 2)
                    if family != .systemSmall, let b = m.battery { Text("\(b) %").font(.system(size: 11, design: .monospaced)).foregroundStyle(paperMut) }
                }
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(paperInk)
        .widgetURL(URL(string: "finanshub://familie"))
        .containerBackground(for: .widget) { Color(red: 0.953, green: 0.937, blue: 0.902) }
    }
}
