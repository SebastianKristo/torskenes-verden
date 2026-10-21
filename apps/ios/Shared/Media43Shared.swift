import Foundation
import WidgetKit
import AppIntents

/* ---------------- Prompt 43: Media-widgets – delt mellom appen og widgetene (App Group) ----------------
 Fasit: prompts/prompt-43-pakke/claude-code-media-widgets.md og design/Media Widgets.dc.html (1a iOS).
 Data: GET /api/widgets/media (aktiv kø + de neste fra kalenderen). Appen skriver det samme formatet til App Group når
 Media er åpen (Media43Widget i appen), så widgeten har ferske tall uten nett. Pause alt / Fortsett er AppIntents. */

struct Media43WDownload: Codable, Hashable {
    var name: String
    var sub: String
    var progress: Double
    var stalled: Bool
    var hash: String
}

struct Media43WNext: Codable, Hashable {
    var title: String
    var code: String
    var when: String
    var poster: String
    var color: String
}

struct Media43WData: Codable, Hashable {
    var speed: Double = 0
    var up: Double = 0
    var active: Int = 0
    var paused: Bool = false
    var downloads: [Media43WDownload] = []
    var next: [Media43WNext] = []
    var updated: Double = 0
}

enum Media43W {
    static let kind: String = "no.kristo.finanshub.media43"
    static let lockKind: String = "no.kristo.finanshub.media43.lock"
    static let cacheKey: String = "w.media43"

    static var cached: Media43WData {
        guard let d = WidgetShared.defaults.data(forKey: cacheKey), let v = try? JSONDecoder().decode(Media43WData.self, from: d) else { return Media43WData() }
        return v
    }

    static func store(_ v: Media43WData) {
        if let d = try? JSONEncoder().encode(v) { WidgetShared.defaults.set(d, forKey: cacheKey) }
    }

    static func reload() {
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
        WidgetCenter.shared.reloadTimelines(ofKind: lockKind)
    }

    private static func num(_ o: [String: Any]?, _ k: String) -> Double? {
        switch o?[k] {
        case let n as NSNumber: return n.doubleValue
        case let s as String: return Double(s.replacingOccurrences(of: ",", with: "."))
        default: return nil
        }
    }

    private static func str(_ o: [String: Any]?, _ k: String) -> String? {
        switch o?[k] {
        case let s as String: return s.isEmpty ? nil : s
        case let n as NSNumber: return n.stringValue
        default: return nil
        }
    }

    private static func list(_ o: [String: Any]?, _ k: String) -> [[String: Any]] {
        (o?[k] as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
    }

    /// {speed, up, active, downloads|torrents|queue:[{name, sub, progress, stalled|state, hash}], upcoming|next|coming:[{title, code, when, poster}]}
    static func parse(_ d: Data) -> Media43WData? {
        guard let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return nil }
        let root: [String: Any] = (o["media"] as? [String: Any]) ?? o
        var v: Media43WData = Media43WData()
        v.speed = num(root, "speed") ?? num(root, "dl") ?? 0
        v.up = num(root, "up") ?? 0
        var dls: [[String: Any]] = list(root, "downloads")
        if dls.isEmpty { dls = list(root, "torrents") }
        if dls.isEmpty { dls = list(root, "queue") }
        v.downloads = dls.prefix(5).map { (r: [String: Any]) -> Media43WDownload in
            var p: Double = num(r, "progress") ?? 0
            if p > 1.0001 { p /= 100 }
            let st: String = (str(r, "state") ?? "").lowercased()
            return Media43WDownload(name: str(r, "name") ?? str(r, "title") ?? "", sub: str(r, "sub") ?? str(r, "episode") ?? "",
                                    progress: p, stalled: (r["stalled"] as? Bool) ?? (st == "stalleddl" || st.contains("error")), hash: str(r, "hash") ?? "")
        }
        v.active = Int(num(root, "active") ?? Double(v.downloads.filter { !$0.stalled && $0.progress < 1 }.count))
        v.paused = (root["paused"] as? Bool) ?? false
        var nx: [[String: Any]] = list(root, "upcoming")
        if nx.isEmpty { nx = list(root, "next") }
        if nx.isEmpty { nx = list(root, "coming") }
        v.next = nx.prefix(3).map { (r: [String: Any]) -> Media43WNext in
            Media43WNext(title: str(r, "title") ?? str(r, "seriesTitle") ?? "", code: str(r, "code") ?? str(r, "sub") ?? "",
                         when: str(r, "when") ?? str(r, "time") ?? "", poster: str(r, "poster") ?? "", color: str(r, "color") ?? "")
        }
        v.updated = Date().timeIntervalSince1970
        return v
    }

    static func request(_ path: String, method: String = "GET", body: [String: Any]? = nil) async -> Data? {
        await Trials32b.request(path, method: method, body: body)
    }

    static func load() async -> Media43WData {
        if let d = await request("/api/widgets/media"), let v = parse(d) {
            store(v)
            return v
        }
        return cached
    }

    static func speed(_ b: Double) -> String {
        if b >= 1e6 { return String(format: "%.1f", b / 1e6).replacingOccurrences(of: ".", with: ",") + " MB/s" }
        if b >= 1e3 { return String(format: "%.0f", b / 1e3) + " kB/s" }
        return "0 kB/s"
    }

    /// Bare tallet (Newsreader 30) og enheten hver for seg.
    static func speedParts(_ b: Double) -> (String, String) {
        if b >= 1e6 { return (String(format: "%.1f", b / 1e6).replacingOccurrences(of: ".", with: ","), "MB/s") }
        return (String(format: "%.0f", b / 1e3), "kB/s")
    }
}

/// «Pause alt» i den store widgeten (iOS 17, Button(intent:)).
struct PauseAllIntent43: AppIntent {
    static var title: LocalizedStringResource = "Pause alle nedlastinger"
    static var description = IntentDescription("Pauser alle nedlastinger i qBittorrent.")

    init() {}

    func perform() async throws -> some IntentResult {
        var v: Media43WData = Media43W.cached
        v.paused = true
        Media43W.store(v)
        if await Media43W.request("/api/media/qbit/torrents/pauseAll", method: "POST", body: [:]) == nil {
            _ = await Media43W.request("/api/media/torrents/pauseAll", method: "POST", body: [:])
        }
        Media43W.reload()
        return .result()
    }
}

/// «Fortsett» i den store widgeten.
struct ResumeAllIntent43: AppIntent {
    static var title: LocalizedStringResource = "Fortsett alle nedlastinger"
    static var description = IntentDescription("Fortsetter alle nedlastinger i qBittorrent.")

    init() {}

    func perform() async throws -> some IntentResult {
        var v: Media43WData = Media43W.cached
        v.paused = false
        Media43W.store(v)
        if await Media43W.request("/api/media/qbit/torrents/resumeAll", method: "POST", body: [:]) == nil {
            _ = await Media43W.request("/api/media/torrents/resumeAll", method: "POST", body: [:])
        }
        Media43W.reload()
        return .result()
    }
}
