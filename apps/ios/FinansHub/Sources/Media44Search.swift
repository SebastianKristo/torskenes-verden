import SwiftUI

/* ---------------- Prompt 44: Media – interaktivt søk som jobb (ingen «Feil 504») ----------------
 Fasit: claude-code-media-interaktivt-sok-504.md. Sonarr/Radarr /release spør alle indeksere og svarer ofte først etter
 30–120 s, så ett langt kall ga 504. Nå: POST /api/media/release/search {episodeId|movieId|seriesId+seasonNumber, force?}
 → {jobId} med en gang; GET …/search/:jobId hvert sekund gir status per indekser (✓ 41 treff · 2,1 s / ⟳ / ✕) og delvise
 treff mens det søker. Én indekser som feiler stopper ikke resten; feilkort bare når alle feiler («Ingen indeksere svarte»).
 Avbryt (DELETE …/:jobId). Resultatet caches 10 min på serveren og her («Hentet for 2 min siden · Søk igjen»).
 Eldre server (404): det gamle kallet med 180 s grense og ett nytt forsøk ved 502/503/504 etter 2 s. */

struct Media44Indexer: Identifiable, Hashable {
    var id: String
    var name: String
    var state: String
    var line: String
}

@MainActor
@Observable
final class Media44Job {
    var rows: [Media43Release] = []
    var indexers: [Media44Indexer] = []
    var running: Bool = false
    var error: String = ""
    var allFailed: Bool = false
    var meta: String = ""
    var text: String = ""
    var cachedNote: String = ""
    @ObservationIgnored private var jobId: String = ""
    @ObservationIgnored private var cancelled: Bool = false

    /// Lages som @State i søkearket (visningens init), derfor nonisolated.
    nonisolated init() {}

    /// Lokal cache (10 min) per mål og sted.
    static var cache: [String: (Date, [Media43Release], String)] = [:]

    private func key(_ t: Media43SearchTarget) -> String { t.id + "@" + Media44.shared.site }

    func run(_ t: Media43SearchTarget, _ store: Store, force: Bool = false) async {
        cancelled = false
        error = ""
        allFailed = false
        cachedNote = ""
        if !force, let c = Media44Job.cache[key(t)], Date().timeIntervalSince(c.0) < 600 {
            rows = c.1
            meta = c.2
            cachedNote = Media44Job.age(c.0)
            return
        }
        running = true
        indexers = []
        rows = []
        defer { running = false }
        let t0: Date = Date()
        do {
            try await job(t, store, force: force)
        } catch let e as APIError where e.status == 404 || e.status == 405 {
            await legacy(t, store, t0)
        } catch {
            if !cancelled { self.error = Media44.errorText(error) }
        }
        if error.isEmpty && !cancelled { Media44Job.cache[key(t)] = (Date(), rows, meta) }
    }

    func cancel(_ store: Store) {
        cancelled = true
        running = false
        text = "Avbrutt"
        guard !jobId.isEmpty else { return }
        let id: String = jobId
        Task { _ = try? await store.api.callAt("/api", "DELETE", "/media/release/search/\(id)", timeout: 10) }
    }

    /* ---------- Jobben ---------- */

    private func body(_ t: Media43SearchTarget, force: Bool) -> [String: Any] {
        var b: [String: Any] = ["force": force]
        switch t.kind {
        case "movie": b["movieId"] = t.movieId; b["service"] = "radarr"
        case "season": b["seriesId"] = t.seriesId; b["seasonNumber"] = t.season; b["service"] = "sonarr"
        default: b["episodeId"] = t.episodeId; b["service"] = "sonarr"
        }
        return b
    }

    private func job(_ t: Media43SearchTarget, _ store: Store, force: Bool) async throws {
        let m: Media43 = Media43.shared
        let d: Data = try await m.fetch(store, ["/media/release/search"], method: "POST", json: body(t, force: force), timeout: 20)
        let o: [String: Any] = JS.obj(d)
        jobId = JS.str(o, "jobId") ?? JS.str(o, "id") ?? ""
        gotResult = false
        apply(o)
        var waited: Int = 0
        while !cancelled && stateRunning && !jobId.isEmpty && waited < 240 {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            waited += 1
            if cancelled { return }
            guard let dd = try? await store.api.callAt("/api", "GET", Media44.shared.withSite("/media/release/search/\(jobId)"), timeout: 15) else { continue }
            apply(JS.obj(dd))
            if !stateRunning { break }
        }
        // Ferdig med en gang (cache på serveren) uten resultatet i svaret: hent jobben én gang.
        if !cancelled && !gotResult && !jobId.isEmpty, let dd = try? await store.api.callAt("/api", "GET", Media44.shared.withSite("/media/release/search/\(jobId)"), timeout: 15) {
            apply(JS.obj(dd))
        }
    }

    @ObservationIgnored private var gotResult: Bool = false

    @ObservationIgnored private var stateRunning: Bool = true

    /// Jobbens svar: indeksere, delvise treff, resultat, feil.
    private func apply(_ o: [String: Any]) {
        let st: String = JS.str(o, "state") ?? "running"
        stateRunning = st == "running" || st == "pending"
        text = JS.str(o, "text") ?? ""
        indexers = JS.list(o, "indexers").enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Media44Indexer in
            let r: [String: Any] = pair.element
            return Media44Indexer(id: JS.str(r, "id") ?? "\(pair.offset)", name: JS.str(r, "name") ?? "Indekser",
                                  state: JS.str(r, "state") ?? "running", line: JS.str(r, "line") ?? "⟳")
        }
        if let res = JS.dict(o, "result") {
            gotResult = true
            rows = JS.list(res, "items").map { Media44Job.release($0) } + JS.list(res, "releases").map { Media44Job.release($0) }
            meta = JS.str(res, "text") ?? "\(rows.count) treff"
        } else if stateRunning {
            rows = JS.list(o, "partial").map { Media44Job.release($0) }
        }
        if JS.bool(o, "cached") == true, let a = JS.str(o, "ageText") { cachedNote = "Hentet " + a }
        if st == "failed" {
            allFailed = JS.bool(o, "allFailed") ?? false
            error = allFailed ? "Ingen indeksere svarte. Sjekk Prowlarr → Helse." : (JS.str(o, "error") ?? "Søket feilet")
        }
    }

    /* ---------- Eldre server ---------- */

    private func legacy(_ t: Media43SearchTarget, _ store: Store, _ t0: Date) async {
        let m: Media43 = Media43.shared
        let q: String
        switch t.kind {
        case "movie": q = "movieId=\(t.movieId)"
        case "season": q = "seriesId=\(t.seriesId)&seasonNumber=\(t.season)"
        default: q = "episodeId=\(t.episodeId)"
        }
        let svc: String = t.kind == "movie" ? "radarr" : "sonarr"
        let paths: [String] = ["/media/\(svc)/release?" + q, "/media/release?service=\(svc)&" + q]
        for attempt in 0..<2 {
            do {
                let d: Data = try await m.fetch(store, paths, timeout: 180)
                let o: [String: Any] = JS.obj(d)
                rows = Media43.rows(d, ["releases"]).map { Media44Job.release($0) }
                let ms: Int = JS.int(o, "ms") ?? Int(Date().timeIntervalSince(t0) * 1000)
                let ix: Int = JS.int(o, "indexers") ?? Set(rows.map(\.indexer)).count
                meta = "\(rows.count) treff fra \(ix) indeksere · " + Media43Page.ms(ms)
                return
            } catch let e as APIError where attempt == 0 && [502, 503, 504].contains(e.status) {
                text = "Serveren brukte for lang tid · prøver igjen …"
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            } catch {
                self.error = Media44.errorText(error)
                return
            }
        }
    }

    /* ---------- Tolking ---------- */

    nonisolated static func release(_ r: [String: Any]) -> Media43Release {
        var x: Media43Release = Media43Release(guid: JS.str(r, "guid") ?? UUID().uuidString)
        x.indexerId = JS.int(r, "indexerId") ?? 0
        x.title = JS.str(r, "title") ?? ""
        let q: [String: Any]? = JS.dict(JS.dict(r, "quality"), "quality")
        x.quality = JS.str(q, "name") ?? JS.str(r, "quality") ?? JS.str(r, "qualityName") ?? ""
        x.size = JS.num(r, "size") ?? 0
        x.seeders = JS.int(r, "seeders") ?? 0
        x.peers = JS.int(r, "leechers") ?? JS.int(r, "peers") ?? 0
        x.indexer = JS.str(r, "indexer") ?? ""
        let langs: [String] = JS.strings(r, "languages")
        x.languages = langs.isEmpty ? (JS.str(r, "language") ?? "") : langs.joined(separator: ", ")
        if let a = JS.num(r, "ageHours") {
            x.age = a < 48 ? "\(Int(a)) t" : "\(Int(a / 24)) d"
        } else if let a = JS.int(r, "age") {
            x.age = "\(a) d"
        }
        x.rejected = JS.strings(r, "rejections")
        x.best = JS.bool(r, "best") ?? false
        x.partial = (JS.bool(r, "partial") ?? false) || JS.bool(r, "canGrab") == false
        return x
    }

    nonisolated static func age(_ d: Date) -> String {
        let s: Int = Int(Date().timeIntervalSince(d))
        if s < 60 { return "Hentet nå nettopp" }
        return "Hentet for \(s / 60) min siden"
    }
}

/// «Søker i 8 indeksere … 23 s» med en rad per indekser og Avbryt; «Hentet for 2 min siden · Søk igjen» etterpå.
struct Media44JobStatus: View {
    @Environment(\.paper) private var p
    let job: Media44Job
    let cancel: () -> Void
    let again: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if job.running { runningHead }
            ForEach(job.running ? job.indexers : []) { (ix: Media44Indexer) in Media44IndexerLine(ix: ix) }
            if !job.running && !job.cachedNote.isEmpty { cachedLine }
        }
    }

    private var runningHead: some View {
        HStack(spacing: 8) {
            ProgressView()
            Text(job.text.isEmpty ? "Søker i indekserne …" : job.text).font(PF.ui(13)).foregroundStyle(p.mut).lineLimit(2)
            Spacer(minLength: 4)
            Button(action: cancel) {
                Text("Avbryt").font(PF.ui(13, .bold)).foregroundStyle(p.lab).frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private var cachedLine: some View {
        HStack(spacing: 6) {
            Text(job.cachedNote).font(PF.ui(12.5)).foregroundStyle(p.mut)
            Button(action: again) {
                Text("· Søk igjen").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink).frame(minHeight: 36).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

struct Media44IndexerLine: View {
    @Environment(\.paper) private var p
    let ix: Media44Indexer

    var body: some View {
        HStack(spacing: 8) {
            Text(ix.name).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
            Spacer(minLength: 4)
            Text(ix.line).font(PF.mono(11, bold: false)).foregroundStyle(color).lineLimit(1)
        }
        .padding(.horizontal, 12).frame(minHeight: 30)
        .background(p.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var color: Color {
        switch ix.state {
        case "done": return Color(hex: "#2f6b4a")
        case "failed": return p.lab
        default: return p.mut
        }
    }
}

/// Alt rundt treffene i søkearket (delt ut så arkets body holdes liten).
struct Media44SearchStatus: View {
    @Environment(\.paper) private var p
    let job: Media44Job
    let empty: Bool
    let again: () -> Void
    let cancel: () -> Void
    let prowlarr: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Media44JobStatus(job: job, cancel: cancel, again: again)
            if job.allFailed { Media44AllFailed(text: job.error, retry: again, prowlarr: prowlarr) }
            if !job.allFailed && !job.error.isEmpty { Text(job.error).font(PF.ui(13)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true) }
            if !job.running && job.error.isEmpty && empty { Text("Ingen treff.").font(PF.ui(13.5)).foregroundStyle(p.mut) }
        }
    }
}

/// Feilkort bare når alle indekserne feilet: «Prøv igjen» og «Åpne Prowlarr».
struct Media44AllFailed: View {
    @Environment(\.paper) private var p
    let text: String
    let retry: () -> Void
    let prowlarr: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(text).font(PF.ui(13.5)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                button("Prøv igjen", true, retry)
                button("Åpne Prowlarr", false, prowlarr)
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func button(_ t: String, _ primary: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(13.5, .bold)).foregroundStyle(primary ? p.bg : p.ink)
                .padding(.horizontal, 14).frame(minHeight: 40)
                .background(primary ? p.ink : p.bg, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}
