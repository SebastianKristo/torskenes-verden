import Foundation

/* ---------------- Prompt 52: Ruter-buffer per stopp i App Group (appen og widgetene) ---------------- */
// Fasit: Homelab.dc.html → avPrefetch()/avFetch() og prompts/prompt-52-pakke/claude-code-ruter-avganger-umiddelbart.md.
// Hvert vellykket svar fra GET /api/ruter/departures?stop= lagres som rå JSON per stopp (`w.ruter52.buf` =
// { [NSR-id]: { data, at, name } }). Appen tegner Ruter fra bufferen i første frame; widgeten bruker den
// som reserve når den ikke får kontakt. Avganger med planlagt tid mer enn 1 min tilbake filtreres bort av leserne.

struct Ruter52Entry: Codable, Hashable {
    var data: Data
    var at: Date
    var name: String
}

enum Ruter52Buffer {
    static let key: String = "w.ruter52.buf"
    /// Maks antall stopp i bufferen (eldste ut).
    static let maxStops: Int = 16

    nonisolated static func all() -> [String: Ruter52Entry] {
        guard let d = WidgetShared.defaults.data(forKey: key),
              let v = try? JSONDecoder().decode([String: Ruter52Entry].self, from: d) else { return [:] }
        return v
    }

    nonisolated static func entry(_ id: String) -> Ruter52Entry? { all()[id] }

    /// Lagrer svaret for ett stopp (bare når svaret faktisk har avganger-feltet).
    nonisolated static func put(_ id: String, name: String, data: Data, at: Date = Date()) {
        guard !id.isEmpty else { return }
        var m: [String: Ruter52Entry] = all()
        m[id] = Ruter52Entry(data: data, at: at, name: name)
        if m.count > maxStops {
            let old: [String] = m.sorted { $0.value.at < $1.value.at }.prefix(m.count - maxStops).map { $0.key }
            for k in old { m.removeValue(forKey: k) }
        }
        if let d = try? JSONEncoder().encode(m) { WidgetShared.defaults.set(d, forKey: key) }
    }

    /// Alder i sekunder for ett stopp (nil = ingen data).
    nonisolated static func age(_ id: String, now: Date = Date()) -> TimeInterval? {
        guard let e = entry(id) else { return nil }
        return now.timeIntervalSince(e.at)
    }

    /// Widget-format fra bufferen: avgangene som ikke har gått (planlagt tid > 1 min tilbake fjernes).
    nonisolated static func stop(_ id: String, name: String, now: Date = Date()) -> (Ruter27Stop, [String])? {
        guard let e = entry(id) else { return nil }
        let r: (Ruter27Stop, [String]) = Ruter27Shared.parseStop(e.data, id: id, name: name.isEmpty ? e.name : name, now: e.at)
        var s: Ruter27Stop = r.0
        s.deps = s.deps.filter { $0.expected.timeIntervalSince(now) > -60 }
        return (s, r.1)
    }
}
