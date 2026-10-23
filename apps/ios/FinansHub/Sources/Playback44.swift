import SwiftUI
import UIKit

/* ---------------- Prompt 44: Avspilling (Plex + Jellyfin, Tautulli-lignende) og «Logg inn med Plex» ----------------
 Fasit: design/Avspilling.dc.html og claude-code-avspilling-plex-jellyfin.md. Fane «Avspilling» i Media etter Prowlarr
 (samme innhold som siden, uten egen tittel; servervelgeren skjules – Plex/Jellyfin velges inne i fanen).
 Server (SERVER44): POST /api/playback/plex/pin → {id, code, authUrl} · GET /api/playback/plex/pin/:id (poll hvert 2. s,
 maks 5 min; token lagres som serverhemmelighet) · GET /api/playback/sessions · /history?q=&user=&page= · /stats · /libraries.
 Underfaner: Spilles nå · Historikk · Statistikk · Biblioteker. Eldre server (404): tydelig tomtilstand. */

struct Play44Session: Identifiable, Hashable {
    var id: String
    var title: String = ""
    var sub: String = ""
    var poster: String = ""
    var user: String = ""
    var device: String = ""
    var server: String = ""
    var transcode: Bool = false
    var chips: [String] = []
    var progress: Double = 0
    var buffer: Double = 0
    var left: String = ""
}

struct Play44Row: Identifiable, Hashable {
    var id: String
    var when: String = ""
    var title: String = ""
    var sub: String = ""
    var poster: String = ""
    var user: String = ""
    var device: String = ""
    var duration: String = ""
    var percent: Double = 0
}

struct Play44Stat: Identifiable, Hashable {
    var id: String { name }
    var name: String
    var value: String
}

struct Play44Library: Identifiable, Hashable {
    var id: String
    var name: String
    var count: String = ""
    var size: String = ""
    var runtime: String = ""
    var last: String = ""
    var server: String = ""
}

@MainActor
@Observable
final class Playback44 {
    static let shared = Playback44()

    var sub: String = "now"
    var server: String = "plex"
    var plexOn: Bool = false
    var jellyOn: Bool = false
    var serverLine: String = ""
    var sessions: [Play44Session] = []
    var kpis: [Play44Stat] = []
    var history: [Play44Row] = []
    var users: [String] = []
    var userFilter: String = ""
    var query: String = ""
    var stats: [Play44Stat] = []
    var topShows: [Play44Stat] = []
    var topUsers: [Play44Stat] = []
    var platforms: [Play44Stat] = []
    var perDay: [(String, Double)] = []
    var range: String = "7d"
    var libraries: [Play44Library] = []
    var loading: Bool = false
    var missing: Bool = false
    var error: String = ""
    /// Plex PIN-flyt.
    var pinCode: String = ""
    var pinBusy: Bool = false
    @ObservationIgnored private var pinTask: Task<Void, Never>? = nil

    static let subs: [(String, String)] = [("now", "Spilles nå"), ("history", "Historikk"), ("stats", "Statistikk"), ("libs", "Biblioteker")]

    private func fetchObj(_ store: Store, _ path: String) async throws -> [String: Any] {
        let d: Data = try await store.api.callAt("/api", "GET", "/playback" + path, timeout: 20)
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        if let o = any as? [String: Any] { return o }
        return ["items": any ?? []]
    }

    private func q(_ base: String) -> String {
        if base.hasPrefix("/libraries") || base.hasPrefix("/stats") { return base }
        let sep: String = base.contains("?") ? "&" : "?"
        return base + sep + "server=" + server
    }

    func load(_ store: Store) async {
        loading = true
        error = ""
        defer { loading = false }
        do {
            switch sub {
            case "history": try await loadHistory(store)
            case "stats": try await loadStats(store)
            case "libs": try await loadLibraries(store)
            default: try await loadSessions(store)
            }
            missing = false
        } catch let e as APIError where e.status == 404 {
            missing = true
        } catch {
            self.error = Media44.errorText(error)
        }
    }

    private func loadSessions(_ store: Store) async throws {
        let o: [String: Any] = try await fetchObj(store, q("/sessions"))
        readServers(o)
        sessions = (JS.list(o, "sessions") + JS.list(o, "items")).enumerated().map { Playback44.session($0.element, $0.offset) }
        kpis = Playback44.kpis(JS.dict(o, "kpi"), sessions.count)
    }

    private func readServers(_ o: [String: Any]) {
        if let s = JS.dict(o, "servers") {
            plexOn = JS.bool(JS.dict(s, "plex"), "connected") ?? JS.bool(s, "plex") ?? plexOn
            jellyOn = JS.bool(JS.dict(s, "jellyfin"), "connected") ?? JS.bool(s, "jellyfin") ?? jellyOn
        }
        plexOn = JS.bool(o, "plexConnected") ?? plexOn
        jellyOn = JS.bool(o, "jellyfinConnected") ?? jellyOn
        serverLine = JS.str(o, "serverLine") ?? JS.str(o, "line") ?? serverLine
    }

    /// kpi:{streams, streamsText, bandwidthText, weekPlays, users} → fire kort.
    nonisolated static func kpis(_ k: [String: Any]?, _ n: Int) -> [Play44Stat] {
        guard let k else { return [Play44Stat(name: "Strømmer nå", value: "\(n)")] }
        var out: [Play44Stat] = [Play44Stat(name: "Strømmer nå", value: JS.str(k, "streamsText") ?? "\(JS.int(k, "streams") ?? n)")]
        if let b = JS.str(k, "bandwidthText") { out.append(Play44Stat(name: "Båndbredde", value: b)) }
        if let w = JS.str(k, "weekPlays") { out.append(Play44Stat(name: "Sett denne uka", value: w)) }
        if let u = JS.str(k, "users") { out.append(Play44Stat(name: "Brukere", value: u)) }
        return out
    }

    nonisolated static func session(_ r: [String: Any], _ i: Int) -> Play44Session {
        var s: Play44Session = Play44Session(id: JS.str(r, "id") ?? JS.str(r, "sessionKey") ?? "s\(i)")
        s.title = JS.str(r, "title") ?? JS.str(r, "grandparentTitle") ?? ""
        s.sub = JS.str(r, "subtitle") ?? JS.str(r, "sub") ?? JS.str(r, "episode") ?? ""
        s.poster = JS.str(r, "poster") ?? JS.str(r, "thumb") ?? ""
        s.user = JS.str(r, "user") ?? JS.str(JS.dict(r, "user"), "name") ?? ""
        s.device = [JS.str(r, "device") ?? JS.str(r, "player") ?? "", JS.str(r, "platform") ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
        s.server = JS.str(r, "server") ?? ""
        s.transcode = JS.bool(r, "transcode") ?? (JS.str(r, "decision") == "transcode")
        s.chips = JS.strings(r, "chips") + JS.strings(r, "tech")
        var pr: Double = JS.num(r, "progress") ?? JS.num(r, "percent") ?? 0
        if pr > 1 { pr /= 100 }
        s.progress = pr
        var bu: Double = JS.num(r, "buffer") ?? pr
        if bu > 1 { bu /= 100 }
        s.buffer = bu
        s.left = JS.str(r, "remainingText") ?? JS.str(r, "left") ?? JS.str(r, "remaining") ?? ""
        return s
    }

    private func loadHistory(_ store: Store) async throws {
        var path: String = "/history?page=1"
        let qq: String = query.trimmingCharacters(in: .whitespaces)
        if !qq.isEmpty { path += "&q=" + (qq.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? qq) }
        if !userFilter.isEmpty { path += "&user=" + (userFilter.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? userFilter) }
        let o: [String: Any] = try await fetchObj(store, q(path))
        readServers(o)
        history = (JS.list(o, "rows") + JS.list(o, "items") + JS.list(o, "history")).enumerated().map { Playback44.row($0.element, $0.offset) }
        let us: [String] = JS.strings(o, "users")
        if !us.isEmpty { users = us } else if users.isEmpty { users = Array(Set(history.map(\.user))).filter { !$0.isEmpty }.sorted() }
    }

    nonisolated static func row(_ r: [String: Any], _ i: Int) -> Play44Row {
        var x: Play44Row = Play44Row(id: JS.str(r, "id") ?? "h\(i)")
        x.when = JS.str(r, "whenText") ?? JS.str(r, "when") ?? JS.fmt(JS.date(r["started"] ?? r["date"]), "d. MMM HH:mm")
        x.title = JS.str(r, "title") ?? ""
        x.sub = JS.str(r, "subtitle") ?? JS.str(r, "sub") ?? JS.str(r, "episode") ?? ""
        x.poster = JS.str(r, "poster") ?? ""
        x.user = JS.str(r, "user") ?? ""
        x.device = JS.str(r, "device") ?? JS.str(r, "platform") ?? ""
        x.duration = JS.str(r, "durationText") ?? JS.str(r, "duration") ?? ""
        var pc: Double = JS.num(r, "percent") ?? JS.num(r, "watched") ?? 0
        if pc > 1 { pc /= 100 }
        x.percent = pc
        return x
    }

    private func loadStats(_ store: Store) async throws {
        let o: [String: Any] = try await fetchObj(store, q("/stats?range=" + range))
        readServers(o)
        stats = [Play44Stat(name: "Avspillinger", value: JS.str(o, "total") ?? "0")]
        topShows = JS.list(o, "topShows").map { Play44Stat(name: JS.str($0, "title") ?? JS.str($0, "name") ?? "", value: (JS.str($0, "plays") ?? "") + " avsp.") }
        topUsers = JS.list(o, "topUsers").map { Play44Stat(name: JS.str($0, "name") ?? "", value: JS.str($0, "hoursText") ?? JS.str($0, "hours") ?? "") }
        platforms = JS.list(o, "platforms").map { Play44Stat(name: JS.str($0, "name") ?? "", value: (JS.str($0, "pct") ?? "0") + " %") }
        perDay = JS.list(o, "perDay").map { Playback44.day($0) }
    }

    nonisolated static func day(_ r: [String: Any]) -> (String, Double) {
        let d: Date? = JS.date(r["date"])
        let label: String = d.map { JS.fmt($0, "d.M") } ?? (JS.str(r, "label") ?? "")
        return (label, JS.num(r, "count") ?? JS.num(r, "plays") ?? 0)
    }

    private func loadLibraries(_ store: Store) async throws {
        let o: [String: Any] = try await fetchObj(store, q("/libraries"))
        readServers(o)
        libraries = (JS.list(o, "libraries") + JS.list(o, "items")).enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Play44Library in
            let r: [String: Any] = pair.element
            return Play44Library(id: JS.str(r, "id") ?? "l\(pair.offset)", name: JS.str(r, "name") ?? JS.str(r, "title") ?? "",
                                 count: JS.str(r, "countText") ?? JS.str(r, "count") ?? "", size: JS.str(r, "sizeText") ?? "",
                                 runtime: JS.str(r, "runtimeText") ?? "", last: JS.str(r, "lastAdded") ?? JS.str(r, "last") ?? "",
                                 server: JS.str(r, "server") ?? "")
        }
    }

    /* ---------- Logg inn med Plex (PIN) ---------- */

    func plexLogin(_ store: Store, _ open: @escaping (URL) -> Void) {
        Haptics.shared.tap()
        pinBusy = true
        pinTask?.cancel()
        pinTask = Task { @MainActor in
            defer { self.pinBusy = false }
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/playback/plex/pin", json: [:], timeout: 20)
                let o: [String: Any] = JS.obj(d)
                let id: String = JS.str(o, "id") ?? ""
                self.pinCode = JS.str(o, "code") ?? ""
                if let s = JS.str(o, "authUrl"), let u = URL(string: s) { open(u) }
                for _ in 0..<150 {
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    if Task.isCancelled || id.isEmpty { return }
                    guard let dd = try? await store.api.callAt("/api", "GET", "/playback/plex/pin/\(id)", timeout: 10) else { continue }
                    let r: [String: Any] = JS.obj(dd)
                    let st: String = JS.str(r, "status") ?? JS.str(r, "state") ?? ""
                    if st == "ok" || JS.bool(r, "connected") == true {
                        self.pinCode = ""
                        self.plexOn = true
                        Haptics.shared.success()
                        await self.load(store)
                        return
                    }
                    if st == "expired" { break }
                }
                self.pinCode = ""
                self.error = "Plex-koden gikk ut. Prøv igjen."
            } catch {
                self.pinCode = ""
                self.error = Media44.errorText(error)
            }
        }
    }

    func cancelPin() {
        pinTask?.cancel()
        pinCode = ""
        pinBusy = false
    }
}

/* ---------- Visningen ---------- */

struct Playback44View: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Playback44 { Playback44.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Playback44Top()
            if !m.pinCode.isEmpty { Playback44Pin() }
            if !m.error.isEmpty { Playback44Note(text: m.error, red: true) }
            if m.missing { Playback44Note(text: "Serveren har ikke Avspilling ennå (oppdater Homelab).", red: false) }
            Playback44Body()
        }
        .task(id: m.sub + m.server) { await m.load(store) }
    }
}

struct Playback44Note: View {
    @Environment(\.paper) private var p
    let text: String
    let red: Bool

    var body: some View {
        Text(text).font(PF.ui(13.5)).foregroundStyle(red ? p.lab : p.mut).fixedSize(horizontal: false, vertical: true)
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// Plex · Jellyfin (prikk = tilkoblet), underfaner og serverlinjen i mono. «Logg inn med Plex» når Plex mangler.
struct Playback44Top: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.openURL) private var openURL
    @MainActor private var m: Playback44 { Playback44.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                serverChip("plex", "Plex", m.plexOn)
                serverChip("jellyfin", "Jellyfin", m.jellyOn)
                Spacer(minLength: 4)
                if !m.plexOn && m.server == "plex" { plexButton }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Playback44.subs, id: \.0) { (s: (String, String)) in
                        Media43Chip(text: s.1, on: m.sub == s.0) { Haptics.shared.select(); m.sub = s.0 }
                    }
                }
            }
            if !m.serverLine.isEmpty { Text(m.serverLine).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).lineLimit(1) }
        }
    }

    private func serverChip(_ k: String, _ name: String, _ on: Bool) -> some View {
        Button { Haptics.shared.select(); m.server = k } label: {
            HStack(spacing: 6) {
                Circle().fill(on ? Color(hex: "#2f6b4a") : p.mut.opacity(0.5)).frame(width: 7, height: 7)
                Text(name).font(PF.ui(13, .bold))
            }
            .foregroundStyle(m.server == k ? p.bg : p.ink)
            .padding(.horizontal, 12).frame(height: 32)
            .background(m.server == k ? p.ink : p.card, in: Capsule())
            .frame(minHeight: 44).contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var plexButton: some View {
        Button { m.plexLogin(store) { (u: URL) in openURL(u) } } label: {
            Text(m.pinBusy ? "Venter …" : "Logg inn med Plex").font(PF.ui(12.5, .bold)).foregroundStyle(Color(hex: "#1b1a17"))
                .padding(.horizontal, 12).frame(height: 32)
                .background(Color(hex: "#e5a00d"), in: Capsule())
                .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
    }
}

/// «Venter på godkjenning … kode K7QX».
struct Playback44Pin: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Playback44 { Playback44.shared }

    var body: some View {
        HStack(spacing: 10) {
            ProgressView()
            VStack(alignment: .leading, spacing: 2) {
                Text("Venter på godkjenning i Plex …").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
                Text("Kode " + m.pinCode).font(PF.mono(14)).foregroundStyle(p.ink)
            }
            Spacer(minLength: 4)
            Button { m.cancelPin() } label: { Text("Avbryt").font(PF.ui(13, .bold)).foregroundStyle(p.lab).frame(minHeight: 44) }
                .buttonStyle(.plain)
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct Playback44Body: View {
    @MainActor private var m: Playback44 { Playback44.shared }

    var body: some View {
        switch m.sub {
        case "history": Playback44History()
        // Prompt 45: mobilsiden for statistikk (7 d · 30 d · År · Alt), Media45.swift. Eldre server: den gamle.
        case "stats": Playback45Stats()
        case "libs": Playback44Libs()
        default: Playback44Now()
        }
    }
}

struct Playback44Now: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Playback44 { Playback44.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Playback44Kpis(items: m.kpis)
            if m.sessions.isEmpty && !m.loading && !m.missing {
                Text("Ingen spiller noe akkurat nå.").font(PF.ui(14)).foregroundStyle(p.mut).padding(.vertical, 12)
            }
            ForEach(m.sessions) { (s: Play44Session) in Playback44SessionCard(s: s, plex: m.server == "plex") }
        }
    }
}

struct Playback44Kpis: View {
    @Environment(\.paper) private var p
    let items: [Play44Stat]

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach(items) { (k: Play44Stat) in
                VStack(alignment: .leading, spacing: 2) {
                    Text(k.name.uppercased()).font(PF.mono(9.5)).tracking(1).foregroundStyle(p.mut).lineLimit(1)
                    Text(k.value).font(PF.serif(24, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.7)
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }
}

struct Playback44SessionCard: View {
    @Environment(\.paper) private var p
    let s: Play44Session
    let plex: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Media43Poster(url: s.poster, title: s.title, width: 60, height: 90, radius: 10)
            VStack(alignment: .leading, spacing: 5) {
                Playback44Badge(transcode: s.transcode, device: s.device)
                Text(s.title).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                if !s.sub.isEmpty { Text(s.sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1) }
                if !s.chips.isEmpty { Text(s.chips.joined(separator: " · ")).font(PF.mono(10, bold: false)).foregroundStyle(p.mut).lineLimit(2) }
                Playback44Bar(progress: s.progress, buffer: s.buffer, color: Color(hex: plex ? "#e5a00d" : "#7a5ad6"))
                Text([s.user, s.left].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(12, .semibold)).foregroundStyle(p.ink)
            }
        }
        .padding(12)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct Playback44Badge: View {
    @Environment(\.paper) private var p
    let transcode: Bool
    let device: String

    var body: some View {
        HStack(spacing: 6) {
            Text(transcode ? "Omkoder" : "Direkte avspilling").font(PF.ui(10.5, .bold)).foregroundStyle(Color.white)
                .padding(.horizontal, 7).frame(height: 20)
                .background(transcode ? Color(hex: "#b23a2a") : Color(hex: "#2f6b4a"), in: Capsule())
            if !device.isEmpty { Text(device).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1) }
        }
    }
}

struct Playback44Bar: View {
    @Environment(\.paper) private var p
    let progress: Double
    let buffer: Double
    let color: Color

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            ZStack(alignment: .leading) {
                Capsule().fill(p.line)
                Capsule().fill(color.opacity(0.35)).frame(width: g.size.width * CGFloat(Swift.min(1, buffer)))
                Capsule().fill(color).frame(width: g.size.width * CGFloat(Swift.min(1, progress)))
            }
        }
        .frame(height: 5)
    }
}

struct Playback44History: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Playback44 { Playback44.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("Søk i tittel, bruker eller enhet", text: Binding<String>(get: { m.query }, set: { m.query = $0 }))
                .font(PF.ui(14.5)).padding(.horizontal, 14).frame(height: 44)
                .background(p.card, in: Capsule())
                .submitLabel(.search)
                .onSubmit { Task { await m.load(store) } }
            users
            ForEach(m.history) { (r: Play44Row) in Playback44HistoryRow(r: r) }
            if m.history.isEmpty && !m.loading && !m.missing { Text("Ingen avspillinger ennå.").font(PF.ui(14)).foregroundStyle(p.mut) }
        }
    }

    private var users: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Media43Chip(text: "Alle", on: m.userFilter.isEmpty) { pick("") }
                ForEach(m.users, id: \.self) { (u: String) in Media43Chip(text: u, on: m.userFilter == u) { pick(u) } }
            }
        }
    }

    private func pick(_ u: String) {
        Haptics.shared.select()
        m.userFilter = u
        Task { await m.load(store) }
    }
}

struct Playback44HistoryRow: View {
    @Environment(\.paper) private var p
    let r: Play44Row

    var body: some View {
        HStack(spacing: 10) {
            Media43Poster(url: r.poster, title: r.title, width: 36, height: 54, radius: 7)
            VStack(alignment: .leading, spacing: 2) {
                Text(r.title).font(PF.ui(13.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                Text([r.sub, r.user, r.device].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
                Text([r.when, r.duration].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.mono(10, bold: false)).foregroundStyle(p.mut)
            }
            Spacer(minLength: 4)
            Text("\(Int(r.percent * 100)) %").font(PF.ui(12, .bold)).foregroundStyle(r.percent >= 0.9 ? Color(hex: "#2f6b4a") : p.mut)
        }
        .padding(10)
        .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct Playback44Stats: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Playback44 { Playback44.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                ForEach([("7d", "7 dager"), ("30d", "30 dager"), ("12m", "12 mnd")], id: \.0) { (r: (String, String)) in
                    Media43Chip(text: r.1, on: m.range == r.0) { m.range = r.0; Task { await m.load(store) } }
                }
            }
            Playback44Kpis(items: m.stats)
            Playback44Chart(days: m.perDay)
            Playback44List(title: "MEST SETTE SERIER", items: m.topShows)
            Playback44List(title: "MEST AKTIVE BRUKERE", items: m.topUsers)
            Playback44List(title: "PLATTFORMER", items: m.platforms)
        }
    }
}

struct Playback44Chart: View {
    @Environment(\.paper) private var p
    let days: [(String, Double)]

    var body: some View {
        let top: Double = days.map(\.1).max() ?? 0
        if !days.isEmpty && top > 0 {
            VStack(alignment: .leading, spacing: 6) {
                Text("AVSPILLINGER PER DAG").font(PF.mono(10)).tracking(1.1).foregroundStyle(p.mut)
                HStack(alignment: .bottom, spacing: 4) {
                    ForEach(Array(days.enumerated()), id: \.offset) { (pair: (offset: Int, element: (String, Double))) in
                        Playback44ChartBar(label: pair.element.0, frac: pair.element.1 / top)
                    }
                }
                .frame(height: 110)
            }
            .padding(12)
            .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }
}

struct Playback44ChartBar: View {
    @Environment(\.paper) private var p
    let label: String
    let frac: Double

    var body: some View {
        VStack(spacing: 3) {
            Spacer(minLength: 0)
            RoundedRectangle(cornerRadius: 3, style: .continuous).fill(p.ink).frame(height: CGFloat(Swift.max(2, frac * 86)))
            Text(label).font(PF.mono(8.5, bold: false)).foregroundStyle(p.mut).lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity)
    }
}

struct Playback44List: View {
    @Environment(\.paper) private var p
    let title: String
    let items: [Play44Stat]

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(PF.mono(10)).tracking(1.1).foregroundStyle(p.mut).padding(.bottom, 6)
                ForEach(items) { (s: Play44Stat) in
                    HStack {
                        Text(s.name).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                        Spacer(minLength: 4)
                        Text(s.value).font(PF.mono(11, bold: false)).foregroundStyle(p.mut)
                    }
                    .frame(minHeight: 34)
                }
            }
            .padding(12)
            .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }
}

struct Playback44Libs: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Playback44 { Playback44.shared }

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            ForEach(m.libraries) { (l: Play44Library) in
                VStack(alignment: .leading, spacing: 3) {
                    Text(l.name).font(PF.serif(18, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    if !l.count.isEmpty { Text(l.count).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink) }
                    Text([l.size, l.runtime].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
                    if !l.last.isEmpty { Text("Sist: " + l.last).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1) }
                }
                .padding(12).frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
                .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }
}
