import Foundation

/* ---------------- Prompt 27: Ruter-avganger, delt mellom appen og widgetene (App Group) ---------------- */
// Appen skriver Hjem-stoppene (`w.ruter27.home`) og siste avganger (`w.ruter27`) i App Group.
// Widgeten henter GET /api/widgets/departures (standard = stoppene fra Hjem-kortet), faller tilbake til
// GET /api/ruter/departures?stop= per Hjem-stopp og til bufferen. Minuttene regnes ut fra avgangstiden i hver
// oppføring i tidslinjen, så widgeten teller ned mellom hentingene.

struct Ruter27Dep: Codable, Hashable {
    var line: String
    var dest: String
    var color: String
    var platform: String
    var expected: Date
    var realtime: Bool

    /// Hele minutter fra `now` (aldri negativt).
    func minutes(at now: Date) -> Int {
        Swift.max(0, Int((expected.timeIntervalSince(now) / 60).rounded(.down)))
    }
}

struct Ruter27Stop: Codable, Hashable {
    var id: String
    var name: String
    var deps: [Ruter27Dep]

    /// Avganger som ikke har gått ved `now` (30 s slingring).
    func upcoming(at now: Date) -> [Ruter27Dep] {
        deps.filter { $0.expected.timeIntervalSince(now) > -30 }.sorted { $0.expected < $1.expected }
    }
}

struct Ruter27Snapshot: Codable, Hashable {
    var stops: [Ruter27Stop]
    var deviations: [String]
    var fetched: Date
}

struct Ruter27HomeRef: Codable, Hashable {
    var id: String
    var name: String
}

struct Ruter27Home: Codable, Hashable {
    var stops: [Ruter27HomeRef]
    var n: Int
}

enum Ruter27Shared {
    static let widgetKind: String = "no.kristo.finanshub.ruter27"
    static let cacheKey: String = "w.ruter27"
    static let homeKey: String = "w.ruter27.home"

    /// Hjem-stoppene (fra appen), så widgeten kan hente dem selv.
    static func saveHome(_ h: Ruter27Home) {
        if let d = try? JSONEncoder().encode(h) { WidgetShared.defaults.set(d, forKey: homeKey) }
    }

    static func home() -> Ruter27Home? {
        guard let d = WidgetShared.defaults.data(forKey: homeKey) else { return nil }
        return try? JSONDecoder().decode(Ruter27Home.self, from: d)
    }

    static func saveCache(_ s: Ruter27Snapshot) {
        if let d = try? JSONEncoder().encode(s) { WidgetShared.defaults.set(d, forKey: cacheKey) }
    }

    static func cache() -> Ruter27Snapshot? {
        guard let d = WidgetShared.defaults.data(forKey: cacheKey) else { return nil }
        return try? JSONDecoder().decode(Ruter27Snapshot.self, from: d)
    }

    /* ---------- Tolking ---------- */

    /// GET /api/widgets/departures → {stops:[{id,name,departures:[{line,dest,time,minutes,realtime,color}]}], deviations:[]}.
    static func parseWidget(_ data: Data, now: Date = Date()) -> Ruter27Snapshot? {
        guard let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        let rawStops: [[String: Any]] = (o["stops"] as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
        var stops: [Ruter27Stop] = []
        for s in rawStops {
            let id: String = (s["id"] as? String) ?? ""
            let name: String = (s["name"] as? String) ?? id
            let rawDeps: [[String: Any]] = (s["departures"] as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
            stops.append(Ruter27Stop(id: id, name: name, deps: rawDeps.compactMap { dep($0, now: now) }))
        }
        var devs: [String] = []
        for v in (o["deviations"] as? [Any]) ?? [] {
            if let t = v as? String { devs.append(t) } else if let d = v as? [String: Any], let t = (d["text"] as? String) ?? (d["summary"] as? String) { devs.append(t) }
        }
        if stops.isEmpty { return nil }
        return Ruter27Snapshot(stops: stops, deviations: devs, fetched: now)
    }

    /// GET /api/ruter/departures?stop= → {departures:[{line, to, color, expected, minutes, platform, realtime, situation}]}.
    static func parseStop(_ data: Data, id: String, name: String, now: Date = Date()) -> (Ruter27Stop, [String]) {
        let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
        let raw: [[String: Any]] = (o["departures"] as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
        var devs: [String] = []
        for r in raw { if let s = r["situation"] as? String, !s.isEmpty, !devs.contains(s) { devs.append(s) } }
        return (Ruter27Stop(id: id, name: name, deps: raw.compactMap { dep($0, now: now) }), devs)
    }

    static func dep(_ o: [String: Any], now: Date) -> Ruter27Dep? {
        let line: String = (o["line"] as? String) ?? (o["publicCode"] as? String) ?? ""
        if line.isEmpty { return nil }
        let dest: String = (o["dest"] as? String) ?? (o["to"] as? String) ?? (o["destination"] as? String) ?? ""
        var color: String = (o["color"] as? String) ?? ""
        if !color.isEmpty && !color.hasPrefix("#") { color = "#" + color }
        let platform: String = (o["platform"] as? String) ?? ""
        let realtime: Bool = (o["realtime"] as? Bool) ?? false
        var when: Date? = date(o["expected"]) ?? date(o["time"]) ?? date(o["aimed"])
        if when == nil, let t = o["time"] as? String { when = clock(t, now: now) }
        if when == nil, let m = number(o["minutes"]) { when = now.addingTimeInterval(m * 60) }
        guard let w = when else { return nil }
        return Ruter27Dep(line: line, dest: dest, color: color, platform: platform, expected: w, realtime: realtime)
    }

    private static func number(_ v: Any?) -> Double? {
        if let d = v as? Double { return d }
        if let i = v as? Int { return Double(i) }
        if let s = v as? String { return Double(s) }
        return nil
    }

    private static func date(_ v: Any?) -> Date? {
        guard let s = v as? String, s.count >= 16 else { return nil }
        let f1: ISO8601DateFormatter = ISO8601DateFormatter()
        f1.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f1.date(from: s) { return d }
        let f2: ISO8601DateFormatter = ISO8601DateFormatter()
        f2.formatOptions = [.withInternetDateTime]
        return f2.date(from: s)
    }

    /// «09:41» i dag (eller i morgen hvis klokka allerede er passert med mer enn en time).
    private static func clock(_ s: String, now: Date) -> Date? {
        let parts: [Int] = s.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2 else { return nil }
        var c: DateComponents = Calendar.current.dateComponents([.year, .month, .day], from: now)
        c.hour = parts[0]
        c.minute = parts[1]
        guard var d = Calendar.current.date(from: c) else { return nil }
        if d.timeIntervalSince(now) < -3600 { d = d.addingTimeInterval(86400) }
        return d
    }

    /// Ruters linjefarge når linjen ikke har egen: trikk blå, T-bane oransje, ellers buss rød.
    static func fallbackHex(_ line: String) -> String {
        if line.hasPrefix("T") || line.hasPrefix("L") { return "#ec700c" }
        if let n = Int(line), n >= 11 && n <= 19 { return "#0b91ef" }
        if let n = Int(line), n <= 5 { return "#ec700c" }
        return "#e60000"
    }

    /// Eksempeldata (forhåndsvisning i widget-galleriet).
    static func demo(_ now: Date = Date()) -> Ruter27Snapshot {
        func d(_ l: String, _ to: String, _ c: String, _ pf: String, _ m: Double) -> Ruter27Dep {
            Ruter27Dep(line: l, dest: to, color: c, platform: pf, expected: now.addingTimeInterval(m * 60 + 20), realtime: true)
        }
        let a: Ruter27Stop = Ruter27Stop(id: "demo1", name: "Amagerveien", deps: [d("17", "Grefsen st.", "#0b91ef", "B", 2), d("31", "Fornebu", "#e60000", "A", 4),
                                                                                  d("17", "Rikshospitalet", "#0b91ef", "A", 6), d("17", "Rikshospitalet", "#0b91ef", "A", 16),
                                                                                  d("17", "Rikshospitalet", "#0b91ef", "A", 26)])
        let b: Ruter27Stop = Ruter27Stop(id: "demo2", name: "Majorstuen", deps: [d("T5", "Sognsvann", "#ec700c", "2", 3), d("T4", "Bergkrystallen", "#ec700c", "1", 4),
                                                                                 d("T5", "Vestli", "#ec700c", "1", 11)])
        return Ruter27Snapshot(stops: [a, b], deviations: ["31 kjører omvei ved Sinsen fra 10:00"], fetched: now)
    }
}
