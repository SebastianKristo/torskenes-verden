import SwiftUI
import UIKit

/* ---------------- Prompt 43: Media – Sonarr, Radarr, qBittorrent og Prowlarr (modell) ----------------
 Fasit: prompts/prompt-43-pakke/claude-code-media-arr.md og design/Media.dc.html (variant «mobile», 2a).
 Appen snakker bare med Homelab-serveren (`/api/media/...`, proxy). API-nøkler og passord ligger på serveren og sendes aldri hit.
 JSON leses romslig (JS-hjelperne), og eldre/andre stier prøves i rekkefølge, så appen tåler 404 fra en eldre server. */

struct Media43Item: Identifiable, Hashable {
    var id: String
    var kind: String = "episode"          // episode | movie
    var title: String = ""
    var sub: String = ""                  // «S05E09 · The Last Floor»
    var code: String = ""                 // «S05E09»
    var date: Date? = nil
    var poster: String = ""
    var status: String = ""               // downloaded | downloading | missing | stalled | paused | queued | unmonitored
    var progress: Double = 0
    var seriesId: Int = 0
    var movieId: Int = 0
    var episodeId: Int = 0
}

struct Media43Title: Identifiable, Hashable {
    var id: Int
    var kind: String = "series"           // series | movie
    var title: String = ""
    var year: Int = 0
    var network: String = ""
    var status: String = ""               // continuing | ended | upcoming | released …
    var poster: String = ""
    var overview: String = ""
    var have: Int = 0
    var total: Int = 0
    var monitored: Bool = true
    var profileId: Int = 0
    var profile: String = ""
    var seriesType: String = "standard"
    var monitor: String = "all"
    var minimumAvailability: String = "released"
    var hasFile: Bool = false
    var fileQuality: String = ""
    var fileSize: Double = 0
    var path: String = ""
    var tvdbId: Int = 0
    var tmdbId: Int = 0
    var exists: Bool = true
    var playUrl: String = ""
    /// Prompt 44: banneret (fanart 16:9, spilletid, sjanger, språk) og filmfilen (Slett fil / Last ned på nytt).
    var fanart: String = ""
    var runtime: Int = 0
    var genres: [String] = []
    var language: String = ""
    var fileId: Int = 0
    var endYear: Int = 0
    var missing: Int { Swift.max(0, total - have) }
}

struct Media43Episode: Identifiable, Hashable {
    var id: Int
    var season: Int
    var number: Int
    var title: String = ""
    var air: Date? = nil
    var hasFile: Bool = false
    var monitored: Bool = true
    var status: String = ""
    /// Prompt 44: episodefilen (Slett / Last ned på nytt).
    var fileId: Int = 0
    var fileQuality: String = ""
}

struct Media43Release: Identifiable, Hashable {
    var id: String { guid }
    var guid: String
    var indexerId: Int = 0
    var title: String = ""
    var quality: String = ""
    var size: Double = 0
    var seeders: Int = 0
    var peers: Int = 0
    var indexer: String = ""
    var languages: String = ""
    var age: String = ""
    var rejected: [String] = []
    var best: Bool = false
    /// Prompt 44: delvis treff fra en indekser mens søket pågår (kan ikke sendes før Sonarr/Radarr er ferdig).
    var partial: Bool = false
}

struct Media43Torrent: Identifiable, Hashable {
    var id: String { hash }
    var hash: String
    var name: String = ""
    var sub: String = ""
    var progress: Double = 0
    var state: String = ""
    var dl: Double = 0
    var up: Double = 0
    var eta: Int = 0
    var size: Double = 0
    var poster: String = ""
    var category: String = ""

    var paused: Bool { let s = state.lowercased(); return s.contains("paused") || s.contains("stopped") }
    var done: Bool { progress >= 0.999 || ["uploading", "stalledup", "pausedup", "stoppedup", "forcedup", "queuedup"].contains(state.lowercased()) }
    var stalled: Bool { state.lowercased() == "stalleddl" || state.lowercased().contains("error") || state.lowercased() == "missingfiles" }
    var active: Bool { !paused && !done && !stalled }
}

struct Media43File: Identifiable, Hashable {
    var id: Int
    var name: String
    var size: Double
    var progress: Double
    var priority: Int
}

struct Media43Indexer: Identifiable, Hashable {
    var id: Int
    var name: String = ""
    var ok: Bool = true
    var ms: Int = 0
    var queries: Int = 0
    var grabs: Int = 0
    var error: String = ""
    var privacy: String = ""
    var protocolName: String = ""
}

struct Media43Schema: Identifiable, Hashable {
    var id: String { name + "#" + implementation }
    var name: String = ""
    var implementation: String = ""
    var privacy: String = "public"        // public | private | semiPrivate
    var protocolName: String = "torrent"  // torrent | usenet
    var language: String = ""
    var categories: String = ""
    var fields: [String] = []             // username | password | apiKey | cookie
    var added: Bool = false
}

struct Media43Option: Identifiable, Hashable {
    var id: Int
    var name: String
    var free: Double = 0
}

struct Media43Service: Identifiable, Hashable {
    var id: String
    var name: String
    var configured: Bool = false
    var ok: Bool = false
    var version: String = ""
    var ms: Int = 0
}

/// Ett steg i Glimt («✓ Søker i Sonarr og Radarr 412 ms»).
struct Media43Step: Identifiable, Hashable {
    var id: Int
    var text: String
    var ms: Int = 0
}

/// En handling fra Glimt-svaret (Legg til, Last ned, Åpne …).
struct Media43Action: Identifiable, Hashable {
    var id: Int
    var label: String
    var method: String = "POST"
    var path: String = ""
    var bodyJSON: String = ""
    var open: String = ""
}

struct Media43Result: Identifiable, Hashable {
    var id: Int
    var title: String
    var sub: String = ""
    var size: String = ""
    var poster: String = ""
    var actions: [Media43Action] = []
}

@MainActor
@Observable
final class Media43 {
    static let shared = Media43()

    var open: Bool = false
    var tab: String = "kommer"
    var loading: Bool = false
    var error: String = ""
    var toast: String = ""
    var missingServer: Bool = false

    var services: [Media43Service] = []
    var upcoming: [Media43Item] = []
    var series: [Media43Title] = []
    var movies: [Media43Title] = []
    var torrents: [Media43Torrent] = []
    var dlSpeed: Double = 0
    var upSpeed: Double = 0
    var altSpeed: Bool = false
    var altLimit: Double = 0
    var indexers: [Media43Indexer] = []
    var profilesTv: [Media43Option] = []
    var profilesMovie: [Media43Option] = []
    var rootsTv: [Media43Option] = []
    var rootsMovie: [Media43Option] = []
    var testing: Set<Int> = []

    /// Valgt serie/film (ark eller høyre kolonne på stor skjerm).
    var selected: Media43Title? = nil
    var episodes: [Media43Episode] = []
    /// Interaktivt søk.
    var searchFor: Media43SearchTarget? = nil
    /// Legg til (serie/film), magnet og indekser.
    var adding: String? = nil
    var addPrefill: String = ""
    var magnetOpen: Bool = false
    var magnetPrefill: String = ""
    var indexerAddOpen: Bool = false
    var settingsOpen: Bool = false
    var torrentMenu: Media43Torrent? = nil

    /// Glimt i Media.
    var glimtOpen: Bool = false
    var glimtBusy: Bool = false
    var glimtText: String = ""
    var glimtSteps: [Media43Step] = []
    var glimtResults: [Media43Result] = []

    /// Spill av med: jellyfin | plex (lokalt valg).
    var player: String = UserDefaults.standard.string(forKey: "media43_player") ?? "jellyfin" {
        didSet { UserDefaults.standard.set(player, forKey: "media43_player") }
    }

    @ObservationIgnored private var pollTask: Task<Void, Never>? = nil
    @ObservationIgnored private var toastTask: Task<Void, Never>? = nil

    /// Prompt 44: «Avspilling» (Plex/Jellyfin, Playback44.swift) etter Prowlarr.
    static let tabs: [(String, String)] = [("kommer", "Kommer snart"), ("sonarr", "Sonarr"), ("radarr", "Radarr"), ("qbit", "qBittorrent"), ("prowlarr", "Prowlarr"), ("avspilling", "Avspilling")]

    /// Modulen «media»: false når serveren svarer 403 (ingen tilgang) eller ikke har Media (404). Lagres lokalt.
    var allowed: Bool = UserDefaults.standard.object(forKey: "media43_allowed") as? Bool ?? true {
        didSet { UserDefaults.standard.set(allowed, forKey: "media43_allowed") }
    }
    @ObservationIgnored private var probedFor: String = "-"

    /// Sjekker én gang per konto om brukeren har Media (Mer-raden vises bare da).
    func probe(_ store: Store) async {
        let acct: String = store.account?.id ?? ""
        if probedFor == acct { return }
        probedFor = acct
        do {
            _ = try await Media46.shared.call(store, "GET", "/media/status", timeout: 8)
            allowed = true
        } catch let e as APIError {
            if e.status == 403 || e.status == 404 { allowed = false }
        } catch {}
    }

    /* ---------- Åpne / lukke ---------- */

    func show(_ tab: String? = nil) {
        if let tab { self.tab = tab }
        Haptics.shared.tap()
        open = true
    }

    /// magnet:… eller homelab://magnet?url=… / finanshub://magnet?url=… åpner arket ferdig utfylt.
    func handleURL(_ u: URL, _ store: Store) -> Bool {
        let s: String = u.absoluteString
        if u.scheme?.lowercased() == "magnet" {
            magnetPrefill = s
        } else if (u.scheme == "homelab" || u.scheme == "finanshub" || u.scheme == "papir") && u.host == "magnet" {
            let q: [URLQueryItem] = URLComponents(url: u, resolvingAgainstBaseURL: false)?.queryItems ?? []
            magnetPrefill = q.first(where: { $0.name == "url" || $0.name == "u" })?.value ?? ""
        } else if (u.scheme == "homelab" || u.scheme == "finanshub") && u.host == "media" {
            let t: String = u.pathComponents.dropFirst().first ?? "kommer"
            show(t)
            return true
        } else {
            return false
        }
        tab = "qbit"
        open = true
        magnetOpen = true
        return true
    }

    /* ---------- Nettverk ---------- */

    /// Prøver stiene i rekkefølge; 404 = neste. Kaster siste feil.
    func fetch(_ store: Store, _ paths: [String], method: String = "GET", json: [String: Any]? = nil, timeout: TimeInterval = 20) async throws -> Data {
        var last: Error = APIError(message: "Serveren har ikke Media ennå.", status: 404)
        for p0 in paths {
            // Prompt 44: felles servervalg (?server=<sted>), med fallback til standard når stedet mangler tjenesten (Media44.swift).
            let p: String = Media44.shared.withSite(p0)
            do {
                // Prompt 46: logg + 401 bekreftes mot /api/me (en sti serveren ikke har gir 401 for token, 404 for cookie).
                let d: Data = try await Media46.shared.call(store, method, p, json: json, timeout: timeout)
                missingServer = false
                return d
            } catch let e as APIError where e.status == 404 || e.status == 405 {
                last = e
                continue
            }
        }
        if let e = last as? APIError, e.status == 404 { missingServer = true }
        throw last
    }

    /// Liste fra et svar: rot-array eller {items|series|movies|records|results|torrents|indexers|data: [...]}.
    nonisolated static func rows(_ d: Data, _ keys: [String] = []) -> [[String: Any]] {
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        if let a = any as? [Any] { return a.compactMap { $0 as? [String: Any] } }
        guard let o = any as? [String: Any] else { return [] }
        for k in keys + ["items", "records", "results", "data", "list"] {
            let l: [[String: Any]] = JS.list(o, k)
            if !l.isEmpty { return l }
        }
        return []
    }

    func flash(_ t: String) {
        toast = t
        toastTask?.cancel()
        toastTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if !Task.isCancelled { withAnimation(.easeOut(duration: 0.2)) { self.toast = "" } }
        }
    }

    /// Prompt 44: «Utlogget fra Homelab» / «Svarer ikke» / «Ikke satt opp» – aldri «ikke logget inn» når backend er treg.
    func errorText(_ e: Error) -> String { Media44.errorText(e) }

    /* ---------- Last inn ---------- */

    func loadAll(_ store: Store) async {
        loading = true
        error = ""
        defer { loading = false }
        // Prompt 44: gamle lokale flagg bort, og stedene (Hjemme/Hytta) før første kall.
        Media44.shared.migrate()
        if Media44.shared.sites.isEmpty { await Media44.shared.load(store) }
        await loadStatus(store)
        await loadUpcoming(store)
        await loadTorrents(store)
        switch tab {
        case "sonarr": await loadSeries(store)
        case "radarr": await loadMovies(store)
        case "prowlarr": await loadIndexers(store)
        default: break
        }
    }

    func loadTab(_ store: Store) async {
        switch tab {
        case "kommer": await loadUpcoming(store)
        case "sonarr": await loadSeries(store); await loadOptions(store)
        case "radarr": await loadMovies(store); await loadOptions(store)
        case "qbit": await loadTorrents(store); await loadOptions(store)
        case "prowlarr": await loadIndexers(store)
        case "avspilling": await Playback44.shared.load(store)
        default: break
        }
    }

    func loadStatus(_ store: Store) async {
        // Prompt 44: én kilde – samme status som Innstillinger (GET /api/integrations/status). Eldre server: /media/status.
        let shared: [Media43Service] = await Media44.shared.statusFromIntegrations(store)
        if !shared.isEmpty { services = shared; return }
        guard let d = try? await fetch(store, ["/media/status"]) else { return }
        let o: [String: Any] = JS.obj(d)
        var out: [Media43Service] = []
        let names: [(String, String)] = [("sonarr", "Sonarr"), ("radarr", "Radarr"), ("qbittorrent", "qBittorrent"), ("prowlarr", "Prowlarr"), ("jellyfin", "Jellyfin"), ("plex", "Plex")]
        let src: [String: Any] = JS.dict(o, "services") ?? o
        for (k, n) in names {
            let s: [String: Any]? = JS.dict(src, k) ?? (k == "qbittorrent" ? JS.dict(src, "qbit") : nil)
            guard let s else { continue }
            out.append(Media43Service(id: k, name: n, configured: JS.bool(s, "configured") ?? true, ok: JS.bool(s, "ok") ?? false,
                                      version: JS.str(s, "version") ?? "", ms: JS.int(s, "ms") ?? 0))
        }
        if out.isEmpty {
            for r in Media43.rows(d, ["services"]) {
                let k: String = JS.str(r, "id") ?? JS.str(r, "name")?.lowercased() ?? ""
                out.append(Media43Service(id: k, name: JS.str(r, "name") ?? k, configured: JS.bool(r, "configured") ?? true,
                                          ok: JS.bool(r, "ok") ?? false, version: JS.str(r, "version") ?? "", ms: JS.int(r, "ms") ?? 0))
            }
        }
        services = out
    }

    func loadUpcoming(_ store: Store) async {
        do {
            let d: Data = try await fetch(store, ["/media/upcoming?days=7", "/media/calendar?days=7"])
            upcoming = Media43.rows(d, ["upcoming", "calendar"]).enumerated().map { Media43.item($0.element, $0.offset) }
                .sorted { ($0.date ?? .distantFuture) < ($1.date ?? .distantFuture) }
        } catch {
            if upcoming.isEmpty { self.error = errorText(error) }
        }
    }

    nonisolated static func item(_ r: [String: Any], _ i: Int) -> Media43Item {
        let s: Int? = JS.int(r, "seasonNumber") ?? JS.int(r, "season")
        let e: Int? = JS.int(r, "episodeNumber") ?? JS.int(r, "episode")
        let code: String = (s != nil && e != nil) ? String(format: "S%02dE%02d", s ?? 0, e ?? 0) : (JS.str(r, "code") ?? "")
        let series: [String: Any]? = JS.dict(r, "series")
        let movieLike: Bool = (JS.str(r, "kind") ?? JS.str(r, "type") ?? "") == "movie" || r["movieId"] != nil && s == nil
        let title: String = JS.str(r, "seriesTitle") ?? JS.str(series, "title") ?? JS.str(r, "title") ?? ""
        let epTitle: String = JS.str(r, "episodeTitle") ?? (movieLike ? "" : (JS.str(r, "title") != title ? (JS.str(r, "title") ?? "") : ""))
        var it: Media43Item = Media43Item(id: JS.str(r, "id") ?? "u\(i)")
        it.kind = movieLike ? "movie" : "episode"
        it.title = title
        it.code = code
        it.sub = movieLike ? (JS.str(r, "sub") ?? "Film") : [code, epTitle].filter { !$0.isEmpty }.joined(separator: " · ")
        it.date = JS.date(r["airDateUtc"] ?? r["date"] ?? r["airDate"] ?? r["digitalRelease"] ?? r["releaseDate"])
        it.poster = JS.str(r, "poster") ?? Media43.poster(series ?? r)
        it.status = (JS.str(r, "status") ?? (JS.bool(r, "hasFile") == true ? "downloaded" : "missing")).lowercased()
        it.progress = JS.num(r, "progress") ?? 0
        if it.progress > 1 { it.progress /= 100 }
        it.seriesId = JS.int(r, "seriesId") ?? JS.int(series, "id") ?? 0
        it.movieId = JS.int(r, "movieId") ?? (movieLike ? (JS.int(r, "id") ?? 0) : 0)
        it.episodeId = JS.int(r, "episodeId") ?? (movieLike ? 0 : (JS.int(r, "id") ?? 0))
        return it
    }

    /// Prompt 44: images[coverType=<type>] (fanart 16:9 til banneret), eller feltet med samme navn fra serveren.
    nonisolated static func cover(_ r: [String: Any]?, _ type: String) -> String {
        if let p = JS.str(r, type) ?? JS.str(r, type + "Url") { return p }
        for im in JS.list(r, "images") where (JS.str(im, "coverType") ?? "") == type {
            return JS.str(im, "remoteUrl") ?? JS.str(im, "url") ?? ""
        }
        return ""
    }

    /// images[coverType=poster].remoteUrl (eller poster/posterUrl fra serveren).
    nonisolated static func poster(_ r: [String: Any]?) -> String {
        if let p = JS.str(r, "poster") ?? JS.str(r, "posterUrl") ?? JS.str(r, "remotePoster") { return p }
        for im in JS.list(r, "images") where (JS.str(im, "coverType") ?? "") == "poster" {
            return JS.str(im, "remoteUrl") ?? JS.str(im, "url") ?? ""
        }
        return ""
    }

    nonisolated static func title(_ r: [String: Any], kind: String) -> Media43Title {
        let stats: [String: Any]? = JS.dict(r, "statistics")
        var t: Media43Title = Media43Title(id: JS.int(r, "id") ?? 0, kind: kind)
        t.title = JS.str(r, "title") ?? ""
        t.year = JS.int(r, "year") ?? 0
        t.network = JS.str(r, "network") ?? JS.str(r, "studio") ?? ""
        t.status = (JS.str(r, "status") ?? "").lowercased()
        t.poster = Media43.poster(r)
        t.overview = JS.str(r, "overview") ?? ""
        t.have = JS.int(stats, "episodeFileCount") ?? JS.int(r, "episodeFileCount") ?? JS.int(r, "have") ?? 0
        t.total = JS.int(stats, "episodeCount") ?? JS.int(r, "episodeCount") ?? JS.int(r, "total") ?? 0
        t.monitored = JS.bool(r, "monitored") ?? true
        t.profileId = JS.int(r, "qualityProfileId") ?? 0
        t.profile = JS.str(r, "qualityProfile") ?? JS.str(r, "profile") ?? ""
        t.seriesType = JS.str(r, "seriesType") ?? "standard"
        t.monitor = JS.str(r, "monitor") ?? JS.str(JS.dict(r, "addOptions"), "monitor") ?? "all"
        t.minimumAvailability = JS.str(r, "minimumAvailability") ?? "released"
        t.hasFile = JS.bool(r, "hasFile") ?? (kind == "movie" ? JS.dict(r, "movieFile") != nil : false)
        let mf: [String: Any]? = JS.dict(r, "movieFile")
        t.fileQuality = JS.str(JS.dict(JS.dict(mf, "quality"), "quality"), "name") ?? JS.str(mf, "quality") ?? JS.str(r, "fileQuality") ?? ""
        t.fileSize = JS.num(mf, "size") ?? JS.num(r, "sizeOnDisk") ?? 0
        t.path = JS.str(r, "path") ?? JS.str(r, "folder") ?? ""
        t.tvdbId = JS.int(r, "tvdbId") ?? 0
        t.tmdbId = JS.int(r, "tmdbId") ?? 0
        t.exists = (JS.int(r, "id") ?? 0) > 0 || (JS.bool(r, "exists") ?? false)
        t.playUrl = JS.str(r, "playUrl") ?? JS.str(r, "jellyfinUrl") ?? JS.str(r, "plexUrl") ?? ""
        // Prompt 44: fanart til banneret og fakta (spilletid, sjanger, språk), og filmfilens id.
        t.fanart = Media43.cover(r, "fanart")
        t.runtime = JS.int(r, "runtime") ?? 0
        t.genres = JS.strings(r, "genres")
        t.language = JS.str(JS.dict(r, "originalLanguage"), "name") ?? JS.str(r, "language") ?? ""
        t.fileId = JS.int(mf, "id") ?? JS.int(r, "movieFileId") ?? 0
        t.endYear = JS.int(r, "endYear") ?? 0
        return t
    }

    func loadSeries(_ store: Store) async {
        do {
            let d: Data = try await fetch(store, ["/media/series", "/media/sonarr/series"])
            series = Media43.rows(d, ["series"]).map { Media43.title($0, kind: "series") }.sorted { $0.title < $1.title }
        } catch { self.error = errorText(error) }
    }

    func loadMovies(_ store: Store) async {
        do {
            let d: Data = try await fetch(store, ["/media/movies", "/media/radarr/movie", "/media/radarr/movies"])
            movies = Media43.rows(d, ["movies"]).map { Media43.title($0, kind: "movie") }.sorted { $0.title < $1.title }
        } catch { self.error = errorText(error) }
    }

    func loadOptions(_ store: Store) async {
        if profilesTv.isEmpty, let d = try? await fetch(store, ["/media/qualityprofiles?service=sonarr", "/media/sonarr/qualityprofiles"]) {
            profilesTv = Media43.rows(d, ["profiles"]).map { Media43Option(id: JS.int($0, "id") ?? 0, name: JS.str($0, "name") ?? "") }
        }
        if profilesMovie.isEmpty, let d = try? await fetch(store, ["/media/qualityprofiles?service=radarr", "/media/radarr/qualityprofiles"]) {
            profilesMovie = Media43.rows(d, ["profiles"]).map { Media43Option(id: JS.int($0, "id") ?? 0, name: JS.str($0, "name") ?? "") }
        }
        if rootsTv.isEmpty, let d = try? await fetch(store, ["/media/rootfolders?service=sonarr", "/media/sonarr/rootfolders", "/media/rootfolders"]) {
            rootsTv = Media43.rows(d, ["folders", "rootfolders"]).map { Media43Option(id: JS.int($0, "id") ?? 0, name: JS.str($0, "path") ?? JS.str($0, "name") ?? "", free: JS.num($0, "freeSpace") ?? JS.num($0, "free") ?? 0) }
        }
        if rootsMovie.isEmpty, let d = try? await fetch(store, ["/media/rootfolders?service=radarr", "/media/radarr/rootfolders"]) {
            rootsMovie = Media43.rows(d, ["folders", "rootfolders"]).map { Media43Option(id: JS.int($0, "id") ?? 0, name: JS.str($0, "path") ?? JS.str($0, "name") ?? "", free: JS.num($0, "freeSpace") ?? JS.num($0, "free") ?? 0) }
        }
    }

    func loadTorrents(_ store: Store) async {
        do {
            let d: Data = try await fetch(store, ["/media/torrents", "/media/qbit/torrents", "/media/qbittorrent/torrents"])
            torrents = Media43.rows(d, ["torrents"]).map { (r: [String: Any]) -> Media43Torrent in
                var t: Media43Torrent = Media43Torrent(hash: JS.str(r, "hash") ?? UUID().uuidString)
                t.name = JS.str(r, "name") ?? ""
                t.sub = JS.str(r, "sub") ?? JS.str(r, "episode") ?? ""
                t.progress = JS.num(r, "progress") ?? 0
                if t.progress > 1.0001 { t.progress /= 100 }
                t.state = JS.str(r, "state") ?? ""
                t.dl = JS.num(r, "dlspeed") ?? JS.num(r, "dl") ?? 0
                t.up = JS.num(r, "upspeed") ?? JS.num(r, "up") ?? 0
                t.eta = JS.int(r, "eta") ?? 0
                t.size = JS.num(r, "size") ?? JS.num(r, "total_size") ?? 0
                t.poster = JS.str(r, "poster") ?? ""
                t.category = JS.str(r, "category") ?? ""
                return t
            }
            let o: [String: Any] = JS.obj(d)
            let ti: [String: Any]? = JS.dict(o, "transfer") ?? JS.dict(o, "server_state")
            dlSpeed = JS.num(ti, "dl_info_speed") ?? JS.num(ti, "dl") ?? torrents.reduce(0) { $0 + $1.dl }
            upSpeed = JS.num(ti, "up_info_speed") ?? JS.num(ti, "up") ?? torrents.reduce(0) { $0 + $1.up }
            altSpeed = JS.bool(ti, "use_alt_speed_limits") ?? JS.bool(ti, "altSpeed") ?? altSpeed
            altLimit = JS.num(ti, "alt_dl_limit") ?? JS.num(ti, "altLimit") ?? altLimit
            Media43Widget.write(self)
        } catch {
            if tab == "qbit" && torrents.isEmpty { self.error = errorText(error) }
        }
    }

    func loadIndexers(_ store: Store) async {
        do {
            let d: Data = try await fetch(store, ["/media/indexers", "/media/prowlarr/indexers"])
            indexers = Media43.rows(d, ["indexers"]).map { (r: [String: Any]) -> Media43Indexer in
                Media43Indexer(id: JS.int(r, "id") ?? 0, name: JS.str(r, "name") ?? "", ok: JS.bool(r, "ok") ?? (JS.str(r, "error") == nil),
                               ms: JS.int(r, "ms") ?? JS.int(r, "averageResponseTime") ?? 0, queries: JS.int(r, "queries") ?? JS.int(r, "numberOfQueries") ?? 0,
                               grabs: JS.int(r, "grabs") ?? JS.int(r, "numberOfGrabs") ?? 0, error: JS.str(r, "error") ?? "",
                               privacy: JS.str(r, "privacy") ?? "", protocolName: JS.str(r, "protocol") ?? "")
            }
        } catch { self.error = errorText(error) }
    }

    /* ---------- Oppdatering hvert 2. sekund mens qBittorrent er åpen ---------- */

    func startPolling(_ store: Store) {
        pollTask?.cancel()
        pollTask = Task { @MainActor in
            while !Task.isCancelled {
                let wait: UInt64 = (self.open && self.tab == "qbit") ? 2_000_000_000 : 30_000_000_000
                try? await Task.sleep(nanoseconds: wait)
                if Task.isCancelled { break }
                if self.open { await self.loadTorrents(store) }
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    /* ---------- Serie / film ---------- */

    func select(_ t: Media43Title, _ store: Store) {
        Haptics.shared.tap()
        selected = t
        episodes = []
        guard t.kind == "series", t.id > 0 else { return }
        Task { @MainActor in
            guard let d = try? await self.fetch(store, ["/media/series/\(t.id)", "/media/sonarr/series/\(t.id)"]) else { return }
            let o: [String: Any] = JS.obj(d)
            let full: [String: Any] = JS.dict(o, "series") ?? o
            if full["title"] != nil {
                var nt: Media43Title = Media43.title(full, kind: "series")
                if nt.poster.isEmpty { nt.poster = t.poster }
                if self.selected?.id == t.id { self.selected = nt }
            }
            let eps: [[String: Any]] = JS.list(o, "episodes").isEmpty ? JS.list(full, "episodes") : JS.list(o, "episodes")
            self.episodes = eps.map { (e: [String: Any]) -> Media43Episode in Media43.episode(e) }
        }
    }

    /// Én episode fra Sonarr (delt opp i små uttrykk for typesjekkeren i Xcode 16).
    nonisolated static func episode(_ e: [String: Any]) -> Media43Episode {
        let ef: [String: Any]? = JS.dict(e, "episodeFile")
        var x: Media43Episode = Media43Episode(id: JS.int(e, "id") ?? 0, season: JS.int(e, "seasonNumber") ?? JS.int(e, "season") ?? 0,
                                               number: JS.int(e, "episodeNumber") ?? JS.int(e, "number") ?? 0)
        x.title = JS.str(e, "title") ?? ""
        x.air = JS.date(e["airDateUtc"] ?? e["airDate"])
        x.hasFile = JS.bool(e, "hasFile") ?? false
        x.monitored = JS.bool(e, "monitored") ?? true
        x.status = (JS.str(e, "status") ?? "").lowercased()
        let fid: Int? = JS.int(e, "episodeFileId")
        x.fileId = fid ?? JS.int(ef, "id") ?? 0
        let q: [String: Any]? = JS.dict(JS.dict(ef, "quality"), "quality")
        x.fileQuality = JS.str(q, "name") ?? JS.str(e, "quality") ?? ""
        return x
    }

    /// Lagrer endring på serie/film (profil, overvåking, type, minimumAvailability) med PUT.
    func update(_ t: Media43Title, _ changes: [String: Any], _ store: Store) {
        Haptics.shared.select()
        let svc: String = t.kind == "series" ? "sonarr/series" : "radarr/movie"
        let alt: String = t.kind == "series" ? "series" : "movies"
        Task { @MainActor in
            do {
                _ = try await self.fetch(store, ["/media/\(alt)/\(t.id)", "/media/\(svc)/\(t.id)"], method: "PUT", json: changes)
                self.flash("Lagret")
                if t.kind == "series" { await self.loadSeries(store) } else { await self.loadMovies(store) }
                if let n = (t.kind == "series" ? self.series : self.movies).first(where: { $0.id == t.id }), self.selected?.id == t.id { self.selected = n }
            } catch { self.flash(self.errorText(error)) }
        }
    }

    /// Automatisk søk: EpisodeSearch / SeasonSearch / SeriesSearch / MoviesSearch.
    func command(_ name: String, _ body: [String: Any], service: String, _ store: Store, toast: String) {
        Haptics.shared.tap()
        var b: [String: Any] = body
        b["name"] = name
        Task { @MainActor in
            do {
                _ = try await self.fetch(store, ["/media/command?service=\(service)", "/media/\(service)/command"], method: "POST", json: b)
                self.flash(toast)
            } catch { self.flash(self.errorText(error)) }
        }
    }

    func setEpisodeMonitored(_ e: Media43Episode, _ on: Bool, _ store: Store) {
        Haptics.shared.select()
        if let i = episodes.firstIndex(where: { $0.id == e.id }) { episodes[i].monitored = on }
        Task { @MainActor in
            _ = try? await self.fetch(store, ["/media/episode/monitor", "/media/sonarr/episode/monitor"], method: "PUT",
                                      json: ["episodeIds": [e.id], "monitored": on])
        }
    }

    func setSeasonMonitored(_ season: Int, _ on: Bool, _ store: Store) {
        Haptics.shared.select()
        let ids: [Int] = episodes.filter { $0.season == season }.map(\.id)
        for i in episodes.indices where episodes[i].season == season { episodes[i].monitored = on }
        Task { @MainActor in
            _ = try? await self.fetch(store, ["/media/episode/monitor", "/media/sonarr/episode/monitor"], method: "PUT",
                                      json: ["episodeIds": ids, "monitored": on])
        }
    }

    func delete(_ t: Media43Title, files: Bool, _ store: Store) {
        Haptics.shared.warning()
        let svc: String = t.kind == "series" ? "sonarr/series" : "radarr/movie"
        let alt: String = t.kind == "series" ? "series" : "movies"
        Task { @MainActor in
            do {
                _ = try await self.fetch(store, ["/media/\(alt)/\(t.id)?files=\(files)&deleteFiles=\(files)", "/media/\(svc)/\(t.id)?deleteFiles=\(files)"], method: "DELETE")
                self.selected = nil
                self.flash("Slettet " + t.title)
                if t.kind == "series" { await self.loadSeries(store) } else { await self.loadMovies(store) }
            } catch { self.flash(self.errorText(error)) }
        }
    }

    /* ---------- qBittorrent ---------- */

    func torrent(_ t: Media43Torrent, _ action: String, _ store: Store, extra: [String: Any] = [:]) {
        if action == "pause" || action == "resume" { Haptics.shared.tap() } else { Haptics.shared.select() }
        let enc: String = t.hash
        Task { @MainActor in
            do {
                _ = try await self.fetch(store, ["/media/torrents/\(enc)/\(action)", "/media/qbit/torrents/\(enc)/\(action)"], method: "POST", json: extra)
                await self.loadTorrents(store)
            } catch { self.flash(self.errorText(error)) }
        }
    }

    func deleteTorrent(_ t: Media43Torrent, files: Bool, _ store: Store) {
        Haptics.shared.warning()
        Task { @MainActor in
            do {
                _ = try await self.fetch(store, ["/media/torrents/\(t.hash)?files=\(files)", "/media/qbit/torrents/\(t.hash)?files=\(files)"], method: "DELETE")
                self.torrents.removeAll { $0.hash == t.hash }
                self.flash(files ? "Slettet med filene" : "Slettet, filene er beholdt")
                await self.loadTorrents(store)
            } catch { self.flash(self.errorText(error)) }
        }
    }

    func all(_ pause: Bool, _ store: Store) {
        Haptics.shared.tap()
        let a: String = pause ? "pauseAll" : "resumeAll"
        Task { @MainActor in
            do {
                _ = try await self.fetch(store, ["/media/torrents/\(a)", "/media/qbit/torrents/\(a)"], method: "POST", json: [:])
                self.flash(pause ? "Alt er pauset" : "Alt fortsetter")
                await self.loadTorrents(store)
            } catch { self.flash(self.errorText(error)) }
        }
    }

    func toggleAlt(_ store: Store) {
        Haptics.shared.select()
        altSpeed.toggle()
        Task { @MainActor in
            _ = try? await self.fetch(store, ["/media/altSpeed", "/media/qbit/altSpeed"], method: "POST", json: ["on": self.altSpeed])
        }
    }

    func files(_ t: Media43Torrent, _ store: Store) async -> [Media43File] {
        guard let d = try? await fetch(store, ["/media/torrents/\(t.hash)/files", "/media/qbit/torrents/\(t.hash)/files"]) else { return [] }
        return Media43.rows(d, ["files"]).enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Media43File in
            let i: Int = pair.offset
            let r: [String: Any] = pair.element
            return Media43File(id: JS.int(r, "index") ?? JS.int(r, "id") ?? i, name: JS.str(r, "name") ?? "", size: JS.num(r, "size") ?? 0,
                        progress: JS.num(r, "progress") ?? 0, priority: JS.int(r, "priority") ?? 1)
        }
    }

    func setFile(_ t: Media43Torrent, _ f: Media43File, on: Bool, _ store: Store) {
        Haptics.shared.select()
        Task { @MainActor in
            _ = try? await self.fetch(store, ["/media/torrents/\(t.hash)/files", "/media/qbit/torrents/\(t.hash)/files"], method: "POST",
                                      json: ["files": [["id": f.id, "priority": on ? 1 : 0]], "id": f.id, "priority": on ? 1 : 0])
        }
    }

    /* ---------- Prowlarr ---------- */

    func test(_ ix: Media43Indexer, _ store: Store) {
        Haptics.shared.tap()
        testing.insert(ix.id)
        Task { @MainActor in
            defer { self.testing.remove(ix.id) }
            do {
                let d: Data = try await self.fetch(store, ["/media/indexers/\(ix.id)/test", "/media/prowlarr/indexers/\(ix.id)/test"], method: "POST", json: [:], timeout: 40)
                let o: [String: Any] = JS.obj(d)
                let ok: Bool = JS.bool(o, "ok") ?? true
                let ms: Int = JS.int(o, "ms") ?? 0
                if let i = self.indexers.firstIndex(where: { $0.id == ix.id }) {
                    self.indexers[i].ok = ok
                    if ms > 0 { self.indexers[i].ms = ms }
                    self.indexers[i].error = ok ? "" : (JS.str(o, "error") ?? "Feilet")
                }
                self.flash(ok ? "\(ix.name) svarte\(ms > 0 ? " på \(ms) ms" : "")" : "\(ix.name): " + (JS.str(o, "error") ?? "feilet"))
            } catch {
                if let i = self.indexers.firstIndex(where: { $0.id == ix.id }) { self.indexers[i].ok = false; self.indexers[i].error = self.errorText(error) }
            }
        }
    }

    func testAll(_ store: Store) {
        for ix in indexers { test(ix, store) }
    }

    /* ---------- Glimt ---------- */

    func ask(_ q: String, _ store: Store) {
        let t: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        Haptics.shared.tap()
        glimtBusy = true
        glimtText = ""
        glimtSteps = []
        glimtResults = []
        let t0: Date = Date()
        Task { @MainActor in
            defer { self.glimtBusy = false }
            do {
                let d: Data = try await self.fetch(store, ["/media/glimt"], method: "POST", json: ["q": t], timeout: 60)
                let o: [String: Any] = JS.obj(d)
                self.glimtText = JS.str(o, "text") ?? ""
                self.glimtSteps = JS.list(o, "steps").enumerated().map { Media43Step(id: $0.offset, text: JS.str($0.element, "text") ?? JS.str($0.element, "t") ?? "", ms: JS.int($0.element, "ms") ?? 0) }
                if self.glimtSteps.isEmpty {
                    self.glimtSteps = [Media43Step(id: 0, text: "Glimt svarte", ms: Int(Date().timeIntervalSince(t0) * 1000))]
                }
                self.glimtResults = JS.list(o, "results").enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Media43Result in
            let i: Int = pair.offset
            let r: [String: Any] = pair.element
                    return Media43Result(id: i, title: JS.str(r, "title") ?? JS.str(r, "name") ?? "", sub: JS.str(r, "sub") ?? JS.str(r, "quality") ?? "",
                                  size: JS.str(r, "size") ?? "", poster: JS.str(r, "poster") ?? "",
                                  actions: Media43.actions(JS.list(r, "actions")))
                }
                let top: [Media43Action] = Media43.actions(JS.list(o, "actions"))
                if !top.isEmpty { self.glimtResults.append(Media43Result(id: 999, title: "", actions: top)) }
                if JS.str(o, "intent") == "pauseAll" || JS.str(o, "intent") == "resumeAll" { await self.loadTorrents(store) }
            } catch {
                self.glimtText = self.errorText(error)
            }
        }
    }

    nonisolated static func actions(_ l: [[String: Any]]) -> [Media43Action] {
        l.enumerated().map { (pair: (offset: Int, element: [String: Any])) -> Media43Action in
            let i: Int = pair.offset
            let a: [String: Any] = pair.element
            var body: String = ""
            if let b = a["body"], let d = try? JSONSerialization.data(withJSONObject: b), let s = String(data: d, encoding: .utf8) { body = s }
            return Media43Action(id: i, label: JS.str(a, "label") ?? JS.str(a, "text") ?? "Utfør", method: JS.str(a, "method") ?? "POST",
                                 path: JS.str(a, "path") ?? JS.str(a, "url") ?? "", bodyJSON: body, open: JS.str(a, "open") ?? "")
        }
    }

    func run(_ a: Media43Action, _ store: Store) {
        Haptics.shared.tap()
        if !a.open.isEmpty {
            if a.open.hasPrefix("tab:") { tab = String(a.open.dropFirst(4)); return }
            if a.open.hasPrefix("add:") { addPrefill = String(a.open.dropFirst(4)); adding = tab == "radarr" ? "movie" : "series"; return }
        }
        guard !a.path.isEmpty else { return }
        var path: String = a.path
        if path.hasPrefix("/api/") { path = String(path.dropFirst(4)) }
        let body: [String: Any]? = a.bodyJSON.isEmpty ? nil : ((try? JSONSerialization.jsonObject(with: Data(a.bodyJSON.utf8))) as? [String: Any])
        Task { @MainActor in
            do {
                _ = try await Media46.shared.call(store, a.method, path, json: body, timeout: 30)
                self.flash("✓ " + a.label)
                await self.loadTorrents(store)
            } catch { self.flash(self.errorText(error)) }
        }
    }

    /* ---------- Tekst ---------- */

    nonisolated static func size(_ b: Double) -> String {
        if b <= 0 { return "størrelse ukjent" }
        let f: (Double) -> String = { String(format: "%.1f", $0).replacingOccurrences(of: ".", with: ",") }
        if b >= 1e12 { return f(b / 1e12) + " TB" }
        if b >= 1e9 { return f(b / 1e9) + " GB" }
        if b >= 1e6 { return String(format: "%.0f", b / 1e6) + " MB" }
        return String(format: "%.0f", b / 1e3) + " kB"
    }

    nonisolated static func speed(_ b: Double) -> String {
        if b >= 1e6 { return String(format: "%.1f", b / 1e6).replacingOccurrences(of: ".", with: ",") + " MB/s" }
        if b >= 1e3 { return String(format: "%.0f", b / 1e3) + " kB/s" }
        return "0 kB/s"
    }

    nonisolated static func eta(_ s: Int) -> String {
        if s <= 0 || s >= 8_640_000 { return "" }
        if s < 60 { return "\(s) s" }
        if s < 3600 { return "\(s / 60) min" }
        return "\(s / 3600) t \((s % 3600) / 60) min"
    }

    nonisolated static func statusText(_ s: String, _ p: Double) -> String {
        switch s {
        case "downloaded", "hasfile", "ok": return "Lastet ned"
        case "downloading": return "Lastes ned \(Int(p * 100)) %"
        case "stalled": return "Står fast"
        case "paused": return "Pauset"
        case "queued", "waiting", "venter": return "Venter"
        case "unmonitored": return "Ikke overvåket"
        default: return "Mangler"
        }
    }

    nonisolated static func statusColor(_ s: String, _ p: PaperPalette) -> Color {
        // Prompt 45: Lastes ned blå, Venter gul, Ferdig grønn, Mangler rød, Uovervåket grå (Media45.swift).
        if let c = Media45.status(s) { return c }
        switch s {
        case "downloaded", "hasfile", "ok": return Color(hex: "#2f6b4a")
        case "downloading": return p.lab
        case "stalled", "missing": return Color(hex: p.dark ? "#c48a1a" : "#a0671a")
        default: return p.mut
        }
    }
}

/// Mål for interaktivt søk.
struct Media43SearchTarget: Identifiable, Hashable {
    var id: String { "\(kind)-\(episodeId)-\(movieId)-\(seriesId)-\(season)" }
    var kind: String            // episode | season | movie
    var title: String
    var sub: String = ""
    var poster: String = ""
    var profile: String = ""
    var episodeId: Int = 0
    var seriesId: Int = 0
    var season: Int = 0
    var movieId: Int = 0
}
