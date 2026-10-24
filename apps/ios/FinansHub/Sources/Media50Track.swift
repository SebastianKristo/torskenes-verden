import SwiftUI
import UIKit

/* ---------------- Prompt 50: Media – sann status etter søk og Diagnostikk (claude-code-media-qbit-starter-ikke.md) ----------------
 POST /api/media/command svarer nå med `track {id, url, state, text, pollMs}`. Vi spør GET /api/media/track/:id til `final`
 og viser serverens tekst («Fant ingen utgivelser» + grunn, «Sendt til qBittorrent», «Laster ned 12 % · 4,2 MB/s · 8 min»,
 «qBittorrent svarer ikke», «Lagt til, men stoppet» …) med handlingene Velg manuelt / Start / Innstillinger → Media / Søk igjen.
 Manuelt valg i interaktivt søk: POST /api/media/track {episodeId|movieId, grabbed:true}. Fasit for oppførsel: public/js/media50.js.
 Innstillinger → Media → Diagnostikk (bare admin): GET /api/media/diagnostics → ledd 2–6 grønt/gult/rødt med feilmeldingen. */

struct Media50TrackAction: Identifiable, Hashable {
    var id: String
    var label: String
    var hash: String = ""
    var path: String = ""
    var method: String = "POST"
    var bodyJSON: String = ""
}

struct Media50TrackState: Identifiable, Hashable {
    var id: String
    var state: String = "searching"
    var tone: String = "mut"
    var text: String = ""
    var detail: String = ""
    var progress: Double? = nil
    var final: Bool = false
    var pollMs: Int = 2500
    var episodeIds: [Int] = []
    var movieIds: [Int] = []
    var seriesId: Int? = nil
    var seasonNumber: Int? = nil
    var actions: [Media50TrackAction] = []
    var hints: [String] = []

    var busy: Bool { !final && ["searching", "checking", "sent", "starting"].contains(state) }

    nonisolated static func ints(_ o: [String: Any]?, _ k: String) -> [Int] {
        (o?[k] as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue ?? Int(($0 as? String) ?? "") } ?? []
    }

    nonisolated static func parse(_ o: [String: Any], seed: [String: Any]) -> Media50TrackState? {
        guard let id = JS.str(o, "id") else { return nil }
        var t: Media50TrackState = Media50TrackState(id: id)
        t.state = JS.str(o, "state") ?? "searching"
        t.tone = JS.str(o, "tone") ?? "mut"
        t.text = JS.str(o, "text") ?? ""
        t.detail = JS.str(o, "detail") ?? ""
        if let p = JS.num(o, "progress") { t.progress = p > 1.0001 ? p / 100 : p }
        t.final = JS.bool(o, "final") ?? false
        t.pollMs = JS.int(o, "pollMs") ?? 2500
        t.episodeIds = ints(o, "episodeIds")
        if t.episodeIds.isEmpty { t.episodeIds = ints(seed, "episodeIds") }
        t.movieIds = ints(o, "movieIds")
        if t.movieIds.isEmpty { t.movieIds = ints(seed, "movieIds") }
        t.seriesId = JS.int(o, "seriesId") ?? JS.int(seed, "seriesId")
        t.seasonNumber = JS.int(o, "seasonNumber") ?? JS.int(seed, "seasonNumber")
        t.actions = JS.list(o, "actions").map { (a: [String: Any]) -> Media50TrackAction in
            var body: String = ""
            if let b = a["body"], let d = try? JSONSerialization.data(withJSONObject: b), let s = String(data: d, encoding: .utf8) { body = s }
            return Media50TrackAction(id: JS.str(a, "id") ?? "", label: JS.str(a, "label") ?? "", hash: JS.str(a, "hash") ?? "",
                                      path: JS.str(a, "path") ?? "", method: JS.str(a, "method") ?? "POST", bodyJSON: body)
        }
        // Hint fra den automatiske diagnostikken (bare admin får dem fra serveren).
        let steps: [[String: Any]] = JS.list(JS.dict(o, "diagnostics"), "steps")
        t.hints = steps.filter { (JS.str($0, "state") ?? "ok") != "ok" }.compactMap { JS.str($0, "hint") ?? JS.str($0, "text") }.prefix(2).map { $0 }
        if t.text.isEmpty { t.text = "Søker …" }
        return t
    }

    /// Nøklene sporingen vises under: «e:<episodeId>», «m:<movieId>», «s:<serieId>:<sesong>» (tom sesong = hele serien).
    /// Som på web (keysOf): filmer, ellers episoder, ellers serien/sesongen. Søk etter mange episoder vises også på serien.
    var keys: [String] {
        if !movieIds.isEmpty { return movieIds.map { "m:\($0)" } }
        var sk: [String] = []
        if let sid = seriesId {
            let season: String = seasonNumber.map { (n: Int) -> String in String(n) } ?? ""
            sk = ["s:\(sid):" + season]
        }
        if !episodeIds.isEmpty { return episodeIds.map { "e:\($0)" } + (episodeIds.count > 3 ? sk : []) }
        return sk
    }
}

@MainActor
@Observable
final class Media50Track {
    static let shared = Media50Track()

    var byKey: [String: Media50TrackState] = [:]
    var busyStart: Set<String> = []
    @ObservationIgnored private var tasks: [String: Task<Void, Never>] = [:]

    func get(_ key: String) -> Media50TrackState? { byKey[key] }

    private func put(_ t: Media50TrackState) {
        for k in t.keys { byKey[k] = t }
    }

    /// Svaret fra /command (eller /glimt) → true når det hadde en sporing.
    @discardableResult
    func start(_ d: Data, body: [String: Any], _ store: Store) -> Bool {
        let o: [String: Any] = JS.obj(d)
        let tr: [String: Any]? = JS.dict(o, "track") ?? (o["state"] != nil && o["id"] != nil ? o : nil)
        guard let tr, let t = Media50TrackState.parse(tr, seed: body) else { return false }
        put(t)
        poll(t.id, store, first: 1.2)
        return true
    }

    /// Manuelt valg i interaktivt søk: følg nedlastingen videre.
    func grabbed(_ target: Media43SearchTarget, _ store: Store) {
        var b: [String: Any] = ["grabbed": true]
        var seed: [String: Any] = [:]
        if target.kind == "movie" {
            b["movieId"] = target.movieId; seed["movieIds"] = [target.movieId]
        } else if target.kind == "season" {
            b["seriesId"] = target.seriesId; b["seasonNumber"] = target.season
            seed["seriesId"] = target.seriesId; seed["seasonNumber"] = target.season
        } else {
            b["episodeId"] = target.episodeId; seed["episodeIds"] = [target.episodeId]
        }
        Task { @MainActor in
            guard let d = try? await Media43.shared.fetch(store, ["/media/track"], method: "POST", json: b, timeout: 15) else { return }
            self.start(d, body: seed, store)
        }
    }

    private func poll(_ id: String, _ store: Store, first: Double) {
        tasks[id]?.cancel()
        let t0: Date = Date()
        tasks[id] = Task { @MainActor in
            var wait: Double = first
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
                if Task.isCancelled { return }
                do {
                    let d: Data = try await Media43.shared.fetch(store, ["/media/track/\(id)"], timeout: 15)
                    if let t = Media50TrackState.parse(JS.obj(d), seed: [:]) {
                        self.put(t)
                        if t.final { break }
                        wait = Swift.max(1.5, Double(t.pollMs) / 1000)
                    }
                } catch let e as APIError where e.status == 404 {
                    break
                } catch {
                    wait = 5
                }
                // Ikke spør i det uendelige (serveren gir opp etter 6 t; vi etter 20 min).
                if Date().timeIntervalSince(t0) > 20 * 60 { break }
                if UIApplication.shared.applicationState != .active { wait *= 4 }
            }
            self.tasks[id] = nil
        }
    }

    /// «Start» for en torrent som ble lagt til stoppet (qBittorrent 5.x start, serveren prøver resume for 4.x).
    func startTorrent(_ hash: String, key: String, _ store: Store) {
        Haptics.shared.tap()
        busyStart.insert(key)
        Task { @MainActor in
            defer { self.busyStart.remove(key) }
            do {
                _ = try await Media43.shared.fetch(store, ["/media/torrents/\(hash)/start", "/media/torrents/\(hash)/resume"], method: "POST", json: [:])
                Haptics.shared.success()
                if var t = self.byKey[key] {
                    t.state = "starting"; t.tone = "dl"; t.text = "Startet · venter på fart …"; t.actions = []; t.final = false
                    self.put(t)
                    self.poll(t.id, store, first: 1.5)
                }
                await Media43.shared.loadTorrents(store)
            } catch { Media43.shared.flash(Media43.shared.errorText(error)) }
        }
    }

    func retry(_ a: Media50TrackAction, _ store: Store) {
        guard let body = (try? JSONSerialization.jsonObject(with: Data(a.bodyJSON.utf8))) as? [String: Any] else { return }
        Haptics.shared.tap()
        var path: String = a.path.isEmpty ? "/media/command" : a.path
        if path.hasPrefix("/api/") { path = String(path.dropFirst(4)) }
        Task { @MainActor in
            do {
                let d: Data = try await Media43.shared.fetch(store, [path], method: "POST", json: body)
                self.start(d, body: body, store)
            } catch { Media43.shared.flash(Media43.shared.errorText(error)) }
        }
    }
}

/* ---------- Statuslinja under episoden / filmen / sesongen ---------- */

struct Media50TrackLine: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var tr: Media50Track { Media50Track.shared }
    let key: String
    /// Episode-rader viser ikke søk etter mange episoder (de vises på sesongen/serien).
    var single: Bool = false
    /// «Velg manuelt» (åpner interaktivt søk for elementet).
    var manual: (() -> Void)? = nil

    var body: some View {
        if let t = tr.get(key), !(single && t.episodeIds.count > 3) {
            content(t)
        }
    }

    private func content(_ t: Media50TrackState) -> some View {
        let c: Color = Media50TrackLine.tone(t.tone, p)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                if t.busy { ProgressView().controlSize(.mini).tint(c) } else { Circle().fill(c).frame(width: 8, height: 8) }
                Text(t.text).font(PF.ui(13, .bold)).foregroundStyle(c).fixedSize(horizontal: false, vertical: true)
            }
            if !t.detail.isEmpty {
                Text(t.detail).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            if t.state == "downloading", let pr = t.progress { bar(pr, c) }
            ForEach(t.hints, id: \.self) { (h: String) in
                Text(h).font(PF.ui(11.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            if !t.actions.isEmpty { actions(t) }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(c.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
        .animation(.easeOut(duration: 0.2), value: t.text)
    }

    private func bar(_ v: Double, _ c: Color) -> some View {
        GeometryReader { (g: GeometryProxy) in
            ZStack(alignment: .leading) {
                Capsule().fill(p.line)
                Capsule().fill(c).frame(width: g.size.width * CGFloat(Swift.max(0, Swift.min(1, v))))
            }
        }
        .frame(height: 4)
    }

    private func actions(_ t: Media50TrackState) -> some View {
        HStack(spacing: 8) {
            ForEach(t.actions) { (a: Media50TrackAction) in
                if a.id == "start" && !a.hash.isEmpty {
                    pill(tr.busyStart.contains(key) ? "Starter …" : a.label, primary: true) { tr.startTorrent(a.hash, key: key, store) }
                } else if a.id == "manual", let manual {
                    pill(a.label, primary: false) { manual() }
                } else if a.id == "settings" {
                    pill(a.label, primary: false) {
                        Media43.shared.open = false
                        store.paperGo("innst-media")
                    }
                } else if a.id == "retry" && !a.bodyJSON.isEmpty {
                    pill(a.label, primary: false) { tr.retry(a, store) }
                }
            }
        }
    }

    private func pill(_ t: String, primary: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(12.5, .bold)).foregroundStyle(primary ? p.bg : p.ink).lineLimit(1)
                .padding(.horizontal, 12).frame(height: 32)
                .background(primary ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(primary ? p.ink : p.line, lineWidth: 1))
                .frame(minHeight: 44)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    static func tone(_ t: String, _ p: PaperPalette) -> Color {
        switch t {
        case "ok": return Color(hex: p.dark ? "#8fd9a8" : "#2f6b4a")
        case "dl": return Color(hex: p.dark ? "#8fb8e6" : "#2b5d8a")
        case "warn", "wait": return Color(hex: p.dark ? "#e0b25a" : "#a0671a")
        case "bad": return p.lab
        default: return p.mut
        }
    }
}

/* ---------- Innstillinger → Media → Diagnostikk (bare admin) ---------- */

struct Media50DiagStep: Identifiable, Hashable {
    var id: String
    var n: Int = 0
    var title: String = ""
    var state: String = "skip"
    var text: String = ""
    var hint: String = ""
    var ms: Int = 0
    var torrents: [Media50DiagTorrent] = []
}

struct Media50DiagTorrent: Identifiable, Hashable {
    var id: String { hash + name }
    var hash: String
    var name: String = ""
    var state: String = ""
    var canStart: Bool = false
}

struct Media50DiagCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var steps: [Media50DiagStep] = []
    @State private var summary: String = ""
    @State private var running: Bool = false
    @State private var error: String = ""
    @State private var at: Date? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("DIAGNOSTIKK").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.lab)
            Text("Følger én nedlasting gjennom kjeden: Sonarr/Radarr → indeksere → grab → nedlastingsklient → qBittorrent. Kjøres også av seg selv når et søk ikke har gitt grab etter 60 s.")
                .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            Button { run() } label: {
                HStack(spacing: 8) {
                    if running { ProgressView().controlSize(.small).tint(p.bg) }
                    Text(running ? "Sjekker …" : "Kjør diagnostikk").font(PF.ui(14, .bold)).foregroundStyle(p.bg)
                }
                .frame(maxWidth: .infinity, minHeight: 46)
                .background(p.ink, in: Capsule())
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(running)
            if !error.isEmpty { Text(error).font(PF.ui(13, .semibold)).foregroundStyle(p.lab) }
            if !summary.isEmpty { Text(summary).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true) }
            if !steps.isEmpty { list }
        }
    }

    private var list: some View {
        VStack(spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Media50DiagStep)) in
                if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                row(pair.element)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func row(_ s: Media50DiagStep) -> some View {
        let c: Color = color(s.state)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 10) {
                Circle().fill(c).frame(width: 9, height: 9)
                Text((s.n > 0 ? "\(s.n). " : "") + s.title).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(2)
                Spacer(minLength: 4)
                Text(label(s.state)).font(PF.ui(12, .bold)).foregroundStyle(c)
            }
            if !s.text.isEmpty { Text(s.text).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true).padding(.leading, 19) }
            if !s.hint.isEmpty { Text(s.hint).font(PF.ui(12)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true).padding(.leading, 19) }
            ForEach(s.torrents) { (t: Media50DiagTorrent) in
                HStack(spacing: 8) {
                    Text(t.name).font(PF.ui(12)).foregroundStyle(p.ink).lineLimit(1)
                    Text(t.state).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut)
                    Spacer(minLength: 4)
                    if t.canStart && !t.hash.isEmpty {
                        Button { start(t) } label: {
                            Text("Start").font(PF.ui(12, .bold)).foregroundStyle(p.bg).padding(.horizontal, 12).frame(height: 30)
                                .background(p.ink, in: Capsule()).frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.leading, 19)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private func color(_ s: String) -> Color {
        switch s {
        case "ok": return Color(hex: p.dark ? "#8fd9a8" : "#2f6b4a")
        case "warn": return Color(hex: p.dark ? "#e0b25a" : "#a0671a")
        case "fail": return p.lab
        default: return p.mut
        }
    }

    private func label(_ s: String) -> String {
        switch s {
        case "ok": return "OK"
        case "warn": return "Advarsel"
        case "fail": return "Feiler"
        default: return "Hoppet over"
        }
    }

    private func run() {
        Haptics.shared.tap()
        running = true
        error = ""
        Task { @MainActor in
            defer { running = false }
            do {
                let d: Data = try await Media43.shared.fetch(store, ["/media/diagnostics"], timeout: 60)
                parse(JS.obj(d))
                Haptics.shared.success()
            } catch let e as APIError where e.status == 403 {
                self.error = "Diagnostikk er bare for administrator."
            } catch {
                self.error = Media43.shared.errorText(error)
            }
        }
    }

    private func parse(_ o: [String: Any]) {
        summary = JS.str(o, "summary") ?? ""
        at = JS.date(o["at"])
        steps = JS.list(o, "steps").map { (r: [String: Any]) -> Media50DiagStep in
            var s: Media50DiagStep = Media50DiagStep(id: JS.str(r, "id") ?? UUID().uuidString)
            s.n = JS.int(r, "n") ?? 0
            s.title = JS.str(r, "title") ?? ""
            s.state = JS.str(r, "state") ?? ((JS.bool(r, "ok") ?? false) ? "ok" : "fail")
            s.text = JS.str(r, "text") ?? ""
            s.hint = JS.str(r, "hint") ?? ""
            s.ms = JS.int(r, "ms") ?? 0
            s.torrents = JS.list(r, "torrents").prefix(8).map { (t: [String: Any]) -> Media50DiagTorrent in
                let st: String = JS.str(t, "state") ?? ""
                let act: Bool = JS.dict(t, "action") != nil || (JS.str(t, "action") ?? "").lowercased() == "start"
                return Media50DiagTorrent(hash: JS.str(t, "hash") ?? "", name: JS.str(t, "name") ?? "", state: st,
                                          canStart: act || st.lowercased().hasPrefix("stopped") || st.lowercased().hasPrefix("paused"))
            }
            return s
        }
    }

    private func start(_ t: Media50DiagTorrent) {
        Haptics.shared.tap()
        Task { @MainActor in
            do {
                _ = try await Media43.shared.fetch(store, ["/media/torrents/\(t.hash)/start", "/media/torrents/\(t.hash)/resume"], method: "POST", json: [:])
                Media43.shared.flash("Startet " + t.name)
                run()
            } catch { self.error = Media43.shared.errorText(error) }
        }
    }
}
