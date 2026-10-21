import SwiftUI
import UIKit

/* ---------------- Prompt 44: Innstillinger → Server → Logger (Docker-logger, feil og feilsøking) ----------------
 Fasit: design/Logger.dc.html (mobil = én kolonne) og claude-code-innst-logger-docker.md. Bare admin (serverinfrastruktur).
 Server (SERVER44, server/logs44.js):
   GET  /api/system/containers → {available, containers:[{id,name,image,tag,state,status,color,uptime,restarts,errors1h,warnings1h}], summary, setup?}
   GET  /api/system/containers/:id → {container, cpu:{text}, mem:{text}}
   POST /api/system/containers/:id/(restart|stop|start) {confirm:true} → {message}
   GET  /api/system/logs?ct=&since=&level=&q=&limit= → {lines:[{id,t,ts,level,ct,msg}], total}
   GET  /api/system/logs/stream (SSE «line») · /logs/groups?hours=24 · POST /logs/explain {line, context, ct} · /logs/download
 Hemmeligheter er maskert på serveren. Mangler Docker-socketen: tomtilstand med oppsett. */

struct Log44Container: Identifiable, Hashable {
    var id: String
    var name: String
    var image: String = ""
    var state: String = ""
    var status: String = ""
    var color: String = "green"
    var uptime: String = ""
    var restarts: Int = 0
    var errors: Int = 0
}

struct Log44Line: Identifiable, Hashable {
    var id: String
    var t: String
    var level: String
    var ct: String
    var msg: String
}

struct Log44Group: Identifiable, Hashable {
    var id: String
    var count: Int
    var message: String
    var ct: String
    var last: String
}

@MainActor
@Observable
final class Logs44 {
    static let shared = Logs44()

    var open: Bool = false
    var available: Bool = true
    var setupText: String = ""
    var containers: [Log44Container] = []
    var summary: [(String, String)] = []
    var ct: String = ""
    var level: String = "all"
    var since: String = "1h"
    var query: String = ""
    var live: Bool = false
    var lines: [Log44Line] = []
    var groups: [Log44Group] = []
    var detail: Log44Line? = nil
    var explain: String = ""
    var explainBusy: Bool = false
    var stats: String = ""
    var loading: Bool = false
    var error: String = ""
    var toast: String = ""
    @ObservationIgnored private var liveTask: Task<Void, Never>? = nil

    func show() {
        Haptics.shared.tap()
        open = true
    }

    private func enc(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? s }

    var filterQuery: String {
        var q: String = "since=" + since + "&level=" + level + "&limit=500"
        if !ct.isEmpty { q += "&ct=" + enc(ct) }
        let t: String = query.trimmingCharacters(in: .whitespaces)
        if !t.isEmpty { q += "&q=" + enc(t) }
        return q
    }

    func loadAll(_ store: Store) async {
        loading = true
        defer { loading = false }
        await loadContainers(store)
        await loadLines(store)
        await loadGroups(store)
    }

    func loadContainers(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/system/containers", timeout: 15)
            let o: [String: Any] = JS.obj(d)
            available = JS.bool(o, "available") ?? true
            setupText = JS.str(JS.dict(o, "setup"), "text") ?? JS.str(o, "setupText") ?? ""
            containers = JS.list(o, "containers").map { Logs44.container($0) }
            let s: [String: Any]? = JS.dict(o, "summary")
            summary = Logs44.summary(s, containers)
            error = ""
        } catch let e as APIError {
            error = e.status == 404 ? "Serveren har ikke Logger ennå (oppdater Homelab)." : (e.status == 403 ? "Bare admin kan se loggene." : e.message)
        } catch { self.error = error.localizedDescription }
    }

    nonisolated static func container(_ r: [String: Any]) -> Log44Container {
        var c: Log44Container = Log44Container(id: JS.str(r, "id") ?? JS.str(r, "name") ?? "", name: JS.str(r, "name") ?? "")
        c.image = [JS.str(r, "image") ?? "", JS.str(r, "tag") ?? ""].filter { !$0.isEmpty }.joined(separator: ":")
        c.state = JS.str(r, "state") ?? ""
        c.status = JS.str(r, "status") ?? ""
        c.color = JS.str(r, "color") ?? "green"
        c.uptime = JS.str(r, "uptime") ?? ""
        c.restarts = JS.int(r, "restarts") ?? 0
        c.errors = JS.int(r, "errors1h") ?? JS.int(r, "errors") ?? 0
        return c
    }

    nonisolated static func summary(_ s: [String: Any]?, _ cs: [Log44Container]) -> [(String, String)] {
        let up: Int = JS.int(s, "up") ?? cs.filter { $0.state == "running" }.count
        let total: Int = JS.int(s, "total") ?? cs.count
        var out: [(String, String)] = [("Oppe", "\(up)/\(total)")]
        out.append(("Feil siste time", "\(JS.int(s, "errors1h") ?? cs.reduce(0) { $0 + $1.errors })"))
        out.append(("Advarsler", "\(JS.int(s, "warnings1h") ?? 0)"))
        let worst: String = JS.str(s, "worst") ?? JS.str(JS.dict(s, "worst"), "name") ?? ""
        out.append(("Omstarter", "\(JS.int(s, "restarts") ?? 0)" + (worst.isEmpty ? "" : " · " + worst)))
        if let disk = JS.str(s, "disk") ?? JS.str(JS.dict(s, "disk"), "text") { out.append(("Disk", disk)) }
        return out
    }

    func loadLines(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/system/logs?" + filterQuery, timeout: 20) else { return }
        lines = JS.list(JS.obj(d), "lines").enumerated().map { Logs44.line($0.element, $0.offset) }
    }

    nonisolated static func line(_ r: [String: Any], _ i: Int) -> Log44Line {
        let t: String = JS.str(r, "t") ?? JS.fmt(JS.date(r["ts"]), "HH:mm:ss")
        return Log44Line(id: JS.str(r, "id") ?? "l\(i)-" + t, t: t, level: (JS.str(r, "level") ?? "info").lowercased(),
                         ct: JS.str(r, "ct") ?? "", msg: JS.str(r, "msg") ?? JS.str(r, "message") ?? "")
    }

    func loadGroups(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/system/logs/groups?hours=24", timeout: 20) else { return }
        groups = JS.list(JS.obj(d), "groups").enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Log44Group in
            let r: [String: Any] = pair.element
            return Log44Group(id: JS.str(r, "key") ?? "g\(pair.offset)", count: JS.int(r, "count") ?? 1, message: JS.str(r, "message") ?? "",
                              ct: JS.str(r, "ct") ?? "", last: JS.fmt(JS.date(r["lastSeen"]), "HH:mm"))
        }
    }

    /* ---------- Live (SSE) ---------- */

    func setLive(_ on: Bool, _ store: Store) {
        Haptics.shared.select()
        live = on
        liveTask?.cancel()
        guard on else { return }
        let api: API = store.api
        let q: String = filterQuery
        liveTask = Task { @MainActor in
            let base: String = api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard let u = URL(string: base + "/api/system/logs/stream?" + q) else { return }
            var r: URLRequest = URLRequest(url: u)
            r.timeoutInterval = 3600
            r.setValue("text/event-stream", forHTTPHeaderField: "Accept")
            if let t = api.token { r.setValue("Bearer " + t, forHTTPHeaderField: "Authorization") }
            guard let res = try? await URLSession.shared.bytes(for: r) else { self.live = false; return }
            let bytes: URLSession.AsyncBytes = res.0
            var event: String = ""
            do {
                for try await l in bytes.lines {
                    if Task.isCancelled { break }
                    if l.hasPrefix("event:") { event = l.dropFirst(6).trimmingCharacters(in: .whitespaces); continue }
                    guard l.hasPrefix("data:"), event == "line" || event.isEmpty else { continue }
                    let json: String = String(l.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                    guard let o = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] else { continue }
                    self.lines.append(Logs44.line(o, self.lines.count))
                    if self.lines.count > 500 { self.lines.removeFirst(self.lines.count - 500) }
                }
            } catch {}
            self.live = false
        }
    }

    func stopLive() {
        liveTask?.cancel()
        live = false
    }

    /* ---------- Detaljer og Glimt ---------- */

    func openDetail(_ l: Log44Line, _ store: Store) {
        Haptics.shared.tap()
        detail = l
        explain = ""
        explainBusy = true
        let ctx: [String] = context(l).map { $0.t + " " + $0.level.uppercased() + " " + $0.msg }
        Task { @MainActor in
            defer { self.explainBusy = false }
            guard let d = try? await store.api.callAt("/api", "POST", "/system/logs/explain", json: ["line": l.msg, "context": ctx, "ct": l.ct], timeout: 60) else {
                self.explain = "Glimt fikk ikke forklart linjen akkurat nå."
                return
            }
            let o: [String: Any] = JS.obj(d)
            let steps: [String] = JS.strings(o, "steps")
            let title: String = JS.str(o, "title") ?? ""
            let text: String = JS.str(o, "text") ?? ""
            self.explain = ([title, text] + steps.map { "→ " + $0 }).filter { !$0.isEmpty }.joined(separator: "\n")
        }
    }

    /// Linjen med 20 linjer rundt.
    func context(_ l: Log44Line) -> [Log44Line] {
        guard let i = lines.firstIndex(where: { $0.id == l.id }) else { return [l] }
        let a: Int = Swift.max(0, i - 10)
        let b: Int = Swift.min(lines.count, i + 11)
        return Array(lines[a..<b])
    }

    func copyContext(_ l: Log44Line) {
        UIPasteboard.general.string = context(l).map { $0.t + " " + $0.level.uppercased() + " " + $0.ct + " " + $0.msg }.joined(separator: "\n")
        Haptics.shared.success()
        flash("Kopiert med 20 linjer rundt")
    }

    func flash(_ t: String) {
        toast = t
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_400_000_000)
            if self.toast == t { self.toast = "" }
        }
    }

    /* ---------- Containere ---------- */

    func action(_ c: Log44Container, _ a: String, _ store: Store) {
        Haptics.shared.warning()
        Task { @MainActor in
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/system/containers/\(c.id)/\(a)", json: ["confirm": true], timeout: 60)
                self.flash(JS.str(JS.obj(d), "message") ?? "OK")
                await self.loadContainers(store)
            } catch { self.flash((error as? APIError)?.message ?? error.localizedDescription) }
        }
    }

    func loadStats(_ c: Log44Container, _ store: Store) async {
        stats = ""
        guard let d = try? await store.api.callAt("/api", "GET", "/system/containers/\(c.id)", timeout: 15) else { return }
        let o: [String: Any] = JS.obj(d)
        let cpu: String = JS.str(JS.dict(o, "cpu"), "text") ?? ""
        let mem: String = JS.str(JS.dict(o, "mem"), "text") ?? ""
        stats = [cpu.isEmpty ? "" : "CPU " + cpu, mem.isEmpty ? "" : "Minne " + mem].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    func downloadURL(_ store: Store) -> URL? {
        let base: String = store.api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: base + "/api/system/logs/download?" + filterQuery)
    }

    /// Last ned: hentes med innloggingen og deles som .log-fil.
    func download(_ store: Store) async -> URL? {
        guard let d = try? await store.api.callAt("/api", "GET", "/system/logs/download?" + filterQuery, timeout: 60) else { return nil }
        let name: String = "homelab-" + (ct.isEmpty ? "alle" : ct) + "-" + JS.fmt(Date(), "yyyy-MM-dd") + ".log"
        let u: URL = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try? d.write(to: u)
        return u
    }
}

/* ---------- Fullskjerm ---------- */

struct Logs44Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var m: Logs44 { Logs44.shared }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { m.open }, set: { (v: Bool) in m.open = v; if !v { m.stopLive() } })) {
                Logs44Page()
                    .environment(\.paper, p)
                    .environment(store)
                    .edgeSwipeClose30 { m.open = false; m.stopLive() }
            }
    }
}

extension View {
    func logs44Host(_ p: PaperPalette) -> some View { modifier(Logs44Host(p: p)) }
}

struct Logs44Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Logs44 { Logs44.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Logs44Top()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !m.error.isEmpty { Playback44Note(text: m.error, red: true) }
                    if !m.available { Logs44Setup(text: m.setupText) } else { Logs44Content() }
                }
                .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 40)
                .frame(maxWidth: 720).frame(maxWidth: .infinity)
            }
            .refreshable { await m.loadAll(store) }
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .overlay(alignment: .bottom) { if !m.toast.isEmpty { Logs44Toast(text: m.toast) } }
        .sheet(item: Binding<Log44Line?>(get: { m.detail }, set: { m.detail = $0 })) { (l: Log44Line) in
            Logs44Detail(l: l).sheet43(p, store)
        }
        .task { await m.loadAll(store) }
        .onDisappear { m.stopLive() }
    }
}

struct Logs44Toast: View {
    @Environment(\.paper) private var p
    let text: String

    var body: some View {
        Text(text).font(PF.ui(13.5, .semibold)).foregroundStyle(p.bg)
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(p.ink, in: Capsule())
            .padding(.bottom, 24)
    }
}

struct Logs44Top: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Logs44 { Logs44.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button { Haptic34.back(); m.open = false; m.stopLive() } label: {
                Text("‹ Tilbake").font(PF.ui(16, .bold)).foregroundStyle(Color(hex: "#b23a2a")).frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Text("SERVER").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
            Text("Logger").font(PF.serif(34, medium: true)).foregroundStyle(p.ink)
            Text("Docker-logger, feil og feilsøking").font(PF.ui(13)).foregroundStyle(p.mut)
        }
        .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 6)
    }
}

struct Logs44Setup: View {
    @Environment(\.paper) private var p
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Docker er ikke koblet til").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            Text(text.isEmpty ? "Monter Docker-socketen (helst via tecnativa/docker-socket-proxy med CONTAINERS=1 og POST=1) i Homelab-containeren, så vises containere og logger her." : text)
                .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            Text("DOCKER_HOST=tcp://docker-socket-proxy:2375").font(PF.mono(11, bold: false)).foregroundStyle(p.ink)
                .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(hex: "#1b1a17").opacity(p.dark ? 0.6 : 0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .padding(16)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

struct Logs44Content: View {
    @MainActor private var m: Logs44 { Logs44.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Playback44Kpis(items: m.summary.map { Play44Stat(name: $0.0, value: $0.1) })
            Logs44Containers()
            if let c = m.containers.first(where: { $0.name == m.ct || $0.id == m.ct }) { Logs44Selected(c: c) }
            Logs44Filters()
            Logs44Window()
            Logs44Groups()
        }
    }
}
