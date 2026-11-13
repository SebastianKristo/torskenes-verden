import SwiftUI
import UIKit

/* ---------------- Prompt 88: Media → Musikk (yubal) – modell ----------------
 Fasit: prompt-55-pakke (pakke 58) claude-code-media-nrk-musikk.md, claude-code-musikk-spilleliste-sanger.md og
 design/Media Musikk.dc.html; web: public/js/media-musikk.js, server: server/yubal.js, docs/musikk-yubal.md.
 Alt går via Homelab-serveren (rutene under /api/media/yubal) gjennom Media46.call – appen kjenner aldri adressen til yubal.
   GET    /media/yubal/status                   → {configured, format, scheduler:{enabled, next_run_at, …}|null}
   GET    /media/yubal/info?url=                → {configured, info:{title, artist, year, track_count, kind, thumbnail, audio_codec, audio_bitrate, url}}
   GET    /media/yubal/jobs                     → {configured, jobs:[…] nyeste først}
   POST   /media/yubal/jobs                     {url, max_items?}
   POST   /media/yubal/jobs/:id/cancel · DELETE /media/yubal/jobs/:id · DELETE /media/yubal/jobs (fjern ferdige)
   GET    /media/yubal/subscriptions            → {configured, items:[…]}
   POST   /media/yubal/subscriptions            {url, max_items?} → {item}
   PATCH  /media/yubal/subscriptions/:id        {enabled} · DELETE /media/yubal/subscriptions/:id
   POST   /media/yubal/subscriptions/:id/sync · POST /media/yubal/subscriptions/sync
   GET    /media/yubal/subscriptions/:id/tracks → {tracks:[{title, artist, duration, status}], total, available, summary, message?}
 Bilder bare via /api/media/yubal/bilde?u=… (samme innlogging som andre Media-bilder).
 «Lim inn» og lenker utenfra fyller bare ut feltet; ingenting lastes ned før brukeren trykker «Last ned». */

struct Mu88Info: Hashable {
    var title: String
    var artist: String = ""
    var year: Int? = nil
    var tracks: Int? = nil
    /// album | playlist | track
    var kind: String = "playlist"
    var image: String = ""
    var codec: String = ""
    var bitrate: Int? = nil
    var url: String = ""
}

struct Mu88Stats: Hashable {
    var success: Int = 0
    var failed: Int = 0
    var skipped: Int = 0
    var existing: Int = 0
}

struct Mu88Job: Identifiable, Hashable {
    var id: String
    var url: String = ""
    /// pending | fetching_info | downloading | importing | completed | failed | cancelled
    var status: String = "pending"
    var progress: Double = 0
    var auto: Bool = false
    var info: Mu88Info? = nil
    var stats: Mu88Stats = Mu88Stats()

    var done: Bool { status == "completed" || status == "failed" || status == "cancelled" }
}

struct Mu88Sub: Identifiable, Hashable {
    var id: String
    var url: String = ""
    var name: String = "Spilleliste"
    var enabled: Bool = true
    var max: Int? = nil
    var image: String = ""
    var synced: Date? = nil
}

struct Mu88Track: Identifiable, Hashable {
    var id: Int
    var title: String
    var artist: String = ""
    var duration: Int = 0
    /// downloaded | skipped | failed | pending | "" (ukjent)
    var status: String = ""
}

struct Mu88Tracks: Hashable {
    var tracks: [Mu88Track] = []
    var total: Int? = nil
    var available: Bool = false
    var message: String = ""
    var summary: Mu88Stats = Mu88Stats()
    var lastStatus: String = ""
    var at: Date = Date()
}

@MainActor
@Observable
final class Musikk88 {
    static let shared = Musikk88()

    static let bareYt: String = "Bare lenker fra music.youtube.com, youtube.com eller youtu.be."

    /* ---------- Fra serveren ---------- */

    var loaded: Bool = false
    var configured: Bool = true
    var message: String = ""
    var err: String = ""
    var aerr: String = ""
    var format: String = "m4a"
    var hasScheduler: Bool = false
    var schedOn: Bool = false
    var nextRun: Date? = nil
    var jobs: [Mu88Job] = []
    var subs: [Mu88Sub] = []

    /* ---------- Skjemaet (lever i modellen, så teksten ikke forsvinner når Media tegnes på nytt) ---------- */

    var url: String = ""
    var ferr: String = ""
    var previewing: Bool = false
    var pv: Mu88Info? = nil
    /// Lenken forhåndsvisningen gjelder (det som sendes til yubal).
    var pvSource: String = ""
    /// alle | max
    var typ: String = "alle"
    var maxN: Int = 50
    var follow: Bool = false
    var starting: Bool = false

    /* ---------- Spillelister ---------- */

    /// Spillelisten som er åpen (én om gangen).
    var open: String? = nil
    var tracks: [String: Mu88Tracks] = [:]
    var tracksLoading: Set<String> = []
    var tracksErr: [String: String] = [:]
    /// Id som synker nå, eller «alle».
    var syncing: String = ""
    var toggling: String = ""

    @ObservationIgnored private var statusAt: Date = .distantPast
    @ObservationIgnored private var scope: String = "-"

    var active: Bool { jobs.contains { !$0.done } }
    var hasDone: Bool { jobs.contains { $0.done } }

    /* ---------- Lenker og id-er ---------- */

    /// Bare https-lenker til YouTube Music / YouTube. Serveren validerer på nytt.
    nonisolated static func valid(_ s: String) -> Bool {
        let re: String = "^https://(music\\.youtube\\.com|youtube\\.com|www\\.youtube\\.com|m\\.youtube\\.com|youtu\\.be)/"
        return s.count <= 2000 && s.range(of: re, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// Første YouTube-lenke i en innlimt eller delt tekst; http → https, «music.youtube.com/…» får https://.
    nonisolated static func link(in text: String) -> String {
        let t: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts: [String] = t.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
        for part in parts {
            let c: String = fix(part)
            if valid(c) { return c }
        }
        return parts.count == 1 ? fix(t) : t
    }

    nonisolated static func fix(_ s: String) -> String {
        let low: String = s.lowercased()
        if low.hasPrefix("http://") { return "https://" + String(s.dropFirst(7)) }
        if low.hasPrefix("https://") { return s }
        if valid("https://" + s) { return "https://" + s }
        return s
    }

    nonisolated static func okId(_ id: String) -> Bool {
        id.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", options: .regularExpression) != nil
    }

    /// Omslag bare via serverens bildeproxy.
    nonisolated static func img(_ v: String?) -> String {
        let s: String = v ?? ""
        return s.hasPrefix("/api/media/yubal/bilde?") ? s : ""
    }

    nonisolated static func enc(_ s: String) -> String {
        let cs: CharacterSet = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        return s.addingPercentEncoding(withAllowedCharacters: cs) ?? ""
    }

    /// Fra en lenke utenfra eller «Lim inn»: fyller bare ut feltet. Brukeren må selv trykke «Forhåndsvis» og «Last ned».
    func prefill(_ text: String) {
        let l: String = Musikk88.link(in: text)
        if l.isEmpty { return }
        url = String(l.prefix(2000))
        ferr = ""
        pv = nil
    }

    func paste() {
        Haptics.shared.tap()
        guard let s = UIPasteboard.general.string, !s.isEmpty else {
            ferr = "Utklippstavlen er tom."
            return
        }
        prefill(s)
    }

    func edited(_ v: String) {
        url = v
        ferr = ""
        pv = nil
    }

    /* ---------- Nett ---------- */

    private func call(_ store: Store, _ method: String, _ path: String, json: [String: Any]? = nil, timeout: TimeInterval = 20) async throws -> Data {
        try await Media46.shared.call(store, method, "/media/yubal" + path, json: json, timeout: timeout)
    }

    nonisolated static func text(_ e: Error) -> String {
        guard let a = e as? APIError else { return e.localizedDescription }
        if a.status == 404 && a.message.isEmpty { return "Serveren har ikke Musikk ennå (oppdater Homelab)." }
        if a.status == 405 { return "Serveren har ikke Musikk ennå (oppdater Homelab)." }
        if a.status == 0 || a.status == 401 || a.status == 403 { return Media44.errorText(e) }
        if a.message.isEmpty || a.message.hasPrefix("Feil ") { return "yubal svarer ikke akkurat nå. Prøv igjen om litt." }
        return a.message
    }

    private func checkScope(_ store: Store) {
        let acct: String = store.account?.id ?? ""
        if acct == scope { return }
        let first: Bool = scope == "-"
        scope = acct
        if first { return }
        loaded = false
        configured = true
        err = ""
        aerr = ""
        jobs = []
        subs = []
        open = nil
        tracks = [:]
        tracksErr = [:]
        url = ""
        pv = nil
        ferr = ""
        follow = false
        statusAt = .distantPast
    }

    /// Kjører så lenge Musikk-fanen vises (visningens .task avbryter den): hvert 2. s mens noe pågår, ellers hvert 10. s.
    func run(_ store: Store) async {
        await load(store, full: true)
        while !Task.isCancelled {
            let wait: UInt64 = active ? 2_000_000_000 : 10_000_000_000
            try? await Task.sleep(nanoseconds: wait)
            if Task.isCancelled { break }
            if UIApplication.shared.applicationState != .active { continue }
            await load(store)
        }
    }

    func load(_ store: Store, full: Bool = false) async {
        checkScope(store)
        do {
            let d: Data = try await call(store, "GET", "/jobs", timeout: 15)
            if Task.isCancelled { return }
            let o: [String: Any] = JS.obj(d)
            configured = JS.bool(o, "configured") ?? true
            message = JS.str(o, "message") ?? ""
            jobs = JS.list(o, "jobs").compactMap { Musikk88.job($0) }
            err = ""
        } catch let e {
            if Task.isCancelled { return }
            err = Musikk88.text(e)
        }
        loaded = true
        if !configured || !err.isEmpty { return }
        if let d = try? await call(store, "GET", "/subscriptions", timeout: 15) {
            subs = JS.list(JS.obj(d), "items").compactMap { Musikk88.sub($0) }
        }
        if full || Date().timeIntervalSince(statusAt) >= 60 { await loadStatus(store) }
    }

    func loadStatus(_ store: Store) async {
        statusAt = Date()
        guard let d = try? await call(store, "GET", "/status", timeout: 12) else { return }
        let o: [String: Any] = JS.obj(d)
        if JS.bool(o, "configured") == false { return }
        format = JS.str(o, "format") ?? "m4a"
        if let s = JS.dict(o, "scheduler") {
            hasScheduler = true
            schedOn = JS.bool(s, "enabled") ?? false
            nextRun = JS.date(s["next_run_at"])
        } else {
            hasScheduler = false
        }
    }

    /* ---------- Tolking ---------- */

    nonisolated static func info(_ r: [String: Any]?) -> Mu88Info? {
        guard let r else { return nil }
        var x: Mu88Info = Mu88Info(title: JS.str(r, "title") ?? "Uten tittel")
        x.artist = JS.str(r, "artist") ?? ""
        x.year = JS.int(r, "year")
        x.tracks = JS.int(r, "track_count")
        let k: String = JS.str(r, "kind") ?? "playlist"
        x.kind = ["album", "playlist", "track"].contains(k) ? k : "playlist"
        x.image = img(JS.str(r, "thumbnail"))
        x.codec = JS.str(r, "audio_codec") ?? ""
        x.bitrate = JS.int(r, "audio_bitrate")
        let u: String = JS.str(r, "url") ?? ""
        x.url = valid(u) ? u : ""
        return x
    }

    nonisolated static func stats(_ r: [String: Any]?) -> Mu88Stats {
        var s: Mu88Stats = Mu88Stats()
        s.success = JS.int(r, "success") ?? 0
        s.failed = JS.int(r, "failed") ?? 0
        s.skipped = JS.int(r, "skipped") ?? 0
        s.existing = JS.int(r, "existing") ?? 0
        return s
    }

    nonisolated static func job(_ r: [String: Any]) -> Mu88Job? {
        guard let id = JS.str(r, "id"), okId(id) else { return nil }
        var j: Mu88Job = Mu88Job(id: id)
        j.url = JS.str(r, "url") ?? ""
        j.status = JS.str(r, "status") ?? "pending"
        j.progress = Swift.min(100, Swift.max(0, JS.num(r, "progress") ?? 0))
        j.auto = JS.str(r, "source") == "scheduler"
        j.info = info(JS.dict(r, "content_info"))
        j.stats = stats(JS.dict(r, "download_stats"))
        return j
    }

    nonisolated static func sub(_ r: [String: Any]) -> Mu88Sub? {
        guard let id = JS.str(r, "id"), okId(id) else { return nil }
        var s: Mu88Sub = Mu88Sub(id: id)
        s.url = JS.str(r, "url") ?? ""
        s.name = JS.str(r, "name") ?? "Spilleliste"
        s.enabled = JS.bool(r, "enabled") ?? true
        s.max = JS.int(r, "max_items")
        s.image = img(JS.str(r, "thumbnail"))
        s.synced = JS.date(r["last_synced_at"])
        return s
    }

    nonisolated static func trackList(_ o: [String: Any]) -> Mu88Tracks {
        var t: Mu88Tracks = Mu88Tracks()
        t.available = JS.bool(o, "available") ?? false
        t.total = JS.int(o, "total")
        t.message = JS.str(o, "message") ?? ""
        let sum: [String: Any]? = JS.dict(o, "summary")
        t.summary = stats(sum)
        t.lastStatus = JS.str(sum, "last_status") ?? ""
        var out: [Mu88Track] = []
        for (i, r) in JS.list(o, "tracks").prefix(2000).enumerated() {
            var x: Mu88Track = Mu88Track(id: i, title: JS.str(r, "title") ?? "Uten tittel")
            x.artist = JS.str(r, "artist") ?? ""
            x.duration = JS.int(r, "duration") ?? 0
            let st: String = JS.str(r, "status") ?? ""
            x.status = ["downloaded", "skipped", "failed", "pending"].contains(st) ? st : ""
            out.append(x)
        }
        t.tracks = out
        return t
    }

    /* ---------- Handlinger (alle krever et trykk) ---------- */

    func preview(_ store: Store) {
        if previewing { return }
        let u: String = Musikk88.link(in: url)
        guard Musikk88.valid(u) else {
            Haptics.shared.error()
            ferr = Musikk88.bareYt
            pv = nil
            return
        }
        previewing = true
        ferr = ""
        pv = nil
        Task { @MainActor in
            do {
                let d: Data = try await self.call(store, "GET", "/info?url=" + Musikk88.enc(u), timeout: 30)
                let o: [String: Any] = JS.obj(d)
                if JS.bool(o, "configured") == false {
                    self.configured = false
                } else if let x = Musikk88.info(JS.dict(o, "info")) {
                    self.pv = x
                    self.pvSource = u
                    self.typ = "alle"
                    self.follow = false
                } else {
                    self.ferr = "yubal fant ikke noe på lenken."
                }
            } catch let e {
                self.ferr = Musikk88.text(e)
            }
            self.previewing = false
        }
    }

    func setMax(_ v: Int) {
        maxN = Swift.max(1, Swift.min(10000, v))
    }

    /// «Last ned» / «Følg og last ned»: jobb, eller abonnement + første synk for spillelister som skal følges.
    func start(_ store: Store) {
        guard let p = pv, !starting else { return }
        let src: String = Musikk88.valid(pvSource) ? pvSource : p.url
        guard Musikk88.valid(src) else { ferr = Musikk88.bareYt; return }
        let max: Int? = p.kind != "track" && typ == "max" ? Swift.max(1, Swift.min(10000, maxN)) : nil
        var body: [String: Any] = ["url": src]
        if let max { body["max_items"] = max }
        let payload: [String: Any] = body
        let subscribe: Bool = p.kind == "playlist" && follow
        Haptics.shared.tap()
        starting = true
        ferr = ""
        Task { @MainActor in
            do {
                if subscribe {
                    let d: Data = try await self.call(store, "POST", "/subscriptions", json: payload, timeout: 30)
                    let id: String = JS.str(JS.dict(JS.obj(d), "item"), "id") ?? ""
                    // Last ned med en gang, ikke vent på planleggeren.
                    if Musikk88.okId(id) { _ = try await self.call(store, "POST", "/subscriptions/" + id + "/sync", json: [:], timeout: 30) }
                } else {
                    _ = try await self.call(store, "POST", "/jobs", json: payload, timeout: 30)
                }
                Haptics.shared.success()
                self.pv = nil
                self.url = ""
                self.follow = false
                self.typ = "alle"
            } catch let e {
                Haptics.shared.error()
                self.ferr = Musikk88.text(e)
            }
            self.starting = false
            await self.load(store)
        }
    }

    /// avbryt | fjern
    func act(_ j: Mu88Job, _ what: String, _ store: Store) {
        guard Musikk88.okId(j.id) else { return }
        Haptics.shared.tap()
        aerr = ""
        Task { @MainActor in
            do {
                if what == "fjern" {
                    _ = try await self.call(store, "DELETE", "/jobs/" + j.id)
                } else {
                    _ = try await self.call(store, "POST", "/jobs/" + j.id + "/cancel", json: [:])
                }
            } catch let e {
                self.aerr = Musikk88.text(e)
            }
            await self.load(store)
        }
    }

    func clean(_ store: Store) {
        Haptics.shared.tap()
        aerr = ""
        Task { @MainActor in
            do {
                _ = try await self.call(store, "DELETE", "/jobs")
            } catch let e {
                self.aerr = Musikk88.text(e)
            }
            await self.load(store)
        }
    }

    func toggle(_ s: Mu88Sub, _ store: Store) {
        guard Musikk88.okId(s.id), toggling.isEmpty else { return }
        Haptics.shared.select()
        toggling = s.id
        aerr = ""
        let on: Bool = !s.enabled
        Task { @MainActor in
            do {
                _ = try await self.call(store, "PATCH", "/subscriptions/" + s.id, json: ["enabled": on])
                self.tracks[s.id] = nil
            } catch let e {
                self.aerr = Musikk88.text(e)
            }
            self.toggling = ""
            self.statusAt = .distantPast
            await self.load(store)
        }
    }

    func sync(_ s: Mu88Sub?, _ store: Store) {
        if !syncing.isEmpty { return }
        if let s, !Musikk88.okId(s.id) { return }
        Haptics.shared.tap()
        syncing = s?.id ?? "alle"
        aerr = ""
        Task { @MainActor in
            do {
                if let s {
                    _ = try await self.call(store, "POST", "/subscriptions/" + s.id + "/sync", json: [:], timeout: 30)
                    self.tracks[s.id] = nil
                } else {
                    _ = try await self.call(store, "POST", "/subscriptions/sync", json: [:], timeout: 30)
                    self.tracks = [:]
                }
            } catch let e {
                self.aerr = Musikk88.text(e)
            }
            self.syncing = ""
            await self.load(store)
            if let o = self.open, self.tracks[o] == nil { await self.loadTracks(o, store) }
        }
    }

    func unfollow(_ s: Mu88Sub, _ store: Store) {
        guard Musikk88.okId(s.id) else { return }
        Haptics.shared.tap()
        aerr = ""
        Task { @MainActor in
            do {
                _ = try await self.call(store, "DELETE", "/subscriptions/" + s.id)
                if self.open == s.id { self.open = nil }
                self.tracks[s.id] = nil
            } catch let e {
                self.aerr = Musikk88.text(e)
            }
            await self.load(store)
        }
    }

    /// Trykk på en spilleliste: åpner sangene (én om gangen), henter dem første gang og når de er eldre enn 60 s.
    func expand(_ s: Mu88Sub, _ store: Store) {
        Haptics.shared.select()
        if open == s.id { open = nil; return }
        open = s.id
        if let t = tracks[s.id], Date().timeIntervalSince(t.at) < 60 { return }
        Task { await self.loadTracks(s.id, store) }
    }

    func loadTracks(_ id: String, _ store: Store) async {
        guard Musikk88.okId(id), !tracksLoading.contains(id) else { return }
        tracksLoading.insert(id)
        tracksErr[id] = nil
        do {
            let d: Data = try await call(store, "GET", "/subscriptions/" + id + "/tracks", timeout: 40)
            var t: Mu88Tracks = Musikk88.trackList(JS.obj(d))
            t.at = Date()
            tracks[id] = t
        } catch let e {
            tracksErr[id] = Musikk88.text(e)
        }
        tracksLoading.remove(id)
    }

    /* ---------- Tekster ---------- */

    nonisolated static func count(_ n: Int, _ one: String, _ many: String) -> String {
        "\(n) " + (n == 1 ? one : many)
    }

    nonisolated static func statusText(_ s: String) -> String {
        switch s {
        case "fetching_info": return "HENTER INFO"
        case "downloading": return "LASTER NED"
        case "importing": return "IMPORTERER"
        case "completed": return "FERDIG"
        case "failed": return "FEILET"
        case "cancelled": return "AVBRUTT"
        default: return "VENTER"
        }
    }

    nonisolated static func kindText(_ k: String) -> String {
        switch k {
        case "album": return "ALBUM"
        case "track": return "SANG"
        default: return "SPILLELISTE"
        }
    }

    nonisolated static func trackText(_ s: String) -> String {
        switch s {
        case "downloaded": return "LASTET NED"
        case "skipped": return "FINNES ALT"
        case "failed": return "FEILET"
        case "pending": return "IKKE SYNKET"
        default: return ""
        }
    }

    /// «12 lastet ned · 1 feilet · 3 hoppet over» (venter: antall spor).
    nonisolated static func jobLine(_ j: Mu88Job) -> String {
        if j.status == "pending" {
            if let n = j.info?.tracks { return count(n, "spor", "spor") }
            return "Venter på tur"
        }
        var parts: [String] = ["\(j.stats.success) lastet ned"]
        if j.stats.failed > 0 { parts.append("\(j.stats.failed) feilet") }
        if j.stats.skipped > 0 { parts.append("\(j.stats.skipped) hoppet over") }
        return parts.joined(separator: " · ")
    }

    nonisolated static func meta(_ x: Mu88Info) -> String {
        var parts: [String] = []
        if !x.artist.isEmpty { parts.append(x.artist) }
        if let y = x.year, y > 0 { parts.append("\(y)") }
        if let n = x.tracks { parts.append(count(n, "spor", "spor")) }
        return parts.joined(separator: " · ")
    }

    nonisolated static func source(_ x: Mu88Info) -> String {
        var parts: [String] = []
        if !x.codec.isEmpty { parts.append(x.codec) }
        if let b = x.bitrate, b > 0 { parts.append("\(b) kbps") }
        return parts.isEmpty ? "" : "Kilde: " + parts.joined(separator: " · ")
    }

    nonisolated static func ago(_ d: Date?, now: Date = Date()) -> String {
        guard let d else { return "" }
        let m: Int = Int((now.timeIntervalSince(d) / 60).rounded())
        if m < 1 { return "nå nettopp" }
        if m < 60 { return "\(m) min siden" }
        if m < 1440 { return "\(Int((Double(m) / 60).rounded())) t siden" }
        return "\(Int((Double(m) / 1440).rounded())) d siden"
    }

    /// «i dag kl. 03:00», «i morgen kl. 03:00» eller «fre. 14. nov. kl. 03:00».
    nonisolated static func when(_ d: Date, now: Date = Date()) -> String {
        let cal: Calendar = Calendar.current
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = "HH:mm"
        let kl: String = "kl. " + f.string(from: d)
        let days: Int = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: d)).day ?? 0
        if days == 0 { return "i dag " + kl }
        if days == 1 { return "i morgen " + kl }
        f.dateFormat = "EEE d. MMM"
        return f.string(from: d) + " " + kl
    }

    nonisolated static func mmss(_ s: Int) -> String {
        if s <= 0 { return "" }
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }

    func subLine(_ s: Mu88Sub) -> String {
        let a: String = Musikk88.ago(s.synced)
        var parts: [String] = [a.isEmpty ? "Ikke synket ennå" : "Synket " + a]
        if let m = s.max { parts.append("de første \(m)") }
        return parts.joined(separator: " · ")
    }

    var plan: String {
        if !hasScheduler { return "" }
        if !schedOn { return "Automatisk synk er slått av i yubal" }
        let on: Int = subs.filter { $0.enabled }.count
        let next: String = nextRun.map { Musikk88.when($0) } ?? "ukjent"
        return "Neste automatiske sjekk: " + next + " · \(on) av \(subs.count) på"
    }

    nonisolated static func trackSummary(_ t: Mu88Tracks) -> String {
        var parts: [String] = []
        if t.available && !t.tracks.isEmpty {
            let n: (String) -> Int = { (k: String) -> Int in t.tracks.filter { $0.status == k }.count }
            parts.append(count(t.tracks.count, "sang", "sanger"))
            parts.append("\(n("downloaded")) lastet ned")
            if n("skipped") > 0 { parts.append("\(n("skipped")) fantes fra før") }
            if n("failed") > 0 { parts.append("\(n("failed")) feilet") }
            if n("pending") > 0 { parts.append("\(n("pending")) ikke synket") }
        } else {
            let s: Mu88Stats = t.summary
            let other: Int = Swift.max(0, s.skipped - s.existing)
            if let total = t.total { parts.append(count(total, "sang", "sanger")) }
            parts.append(t.lastStatus.isEmpty ? "Ikke synket ennå" : "\(s.success) lastet ned")
            if s.existing > 0 { parts.append("\(s.existing) fantes fra før") }
            if other > 0 { parts.append("\(other) hoppet over") }
            if s.failed > 0 { parts.append("\(s.failed) feilet") }
        }
        return parts.joined(separator: " · ")
    }
}
