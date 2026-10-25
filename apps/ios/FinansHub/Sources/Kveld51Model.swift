import SwiftUI
import UIKit

/* ---------------- Prompt 51 (IOSFEAT51): Media – «Hva skal vi se i kveld?», Fortsett, Undertekster og Lagring ----------------
 Server: /api/media51/… ($S/SERVER51-API.md, MEDFAM51). Web-fasit: public/js/medfam51.js (#/mediakveld).
 – I kveld: forslag fra eget bibliotek og egen historikk (hvem ser på, lengde, sjanger, film/serie), «Formuler med lokal modell».
 – Fortsett: lydbøker og podkaster fra Audiobookshelf («fortsett der du slapp»), egen ABS-bruker.
 – Undertekster: norske undertekster via Bazarr («Hent undertekster»).
 – Lagring (bare admin, serveren svarer 403 ellers): disker, «sett og stort», slett med angre (24 t), papirkurv.
 Åpnes fra Media (knappen «I kveld» i toppen), Mer → «Hva skal vi se i kveld?» og finanshub://ikveld[/fortsett|subs|lagring]. */

struct Kv51Item: Identifiable {
    var id: String { kind + "-" + String(arrId) }
    let kind: String
    let arrId: Int
    let title: String
    let year: Int
    let runtimeText: String
    let poster: String
    let text: String
    let next: String

    nonisolated static func parse(_ o: [String: Any]) -> Kv51Item {
        Kv51Item(kind: JS.str(o, "kind") ?? "movie", arrId: JS.int(o, "id") ?? 0, title: JS.str(o, "title") ?? "", year: JS.int(o, "year") ?? 0,
                 runtimeText: JS.str(o, "runtimeText") ?? "", poster: Kv51Item.posterUrl(o["poster"]), text: JS.str(o, "text") ?? (JS.str(o, "reason") ?? ""),
                 next: JS.str(JS.dict(o, "next"), "code") ?? "")
    }

    /// poster er en adresse, eller {url, hash, w, h} (prompt 50).
    nonisolated static func posterUrl(_ v: Any?) -> String {
        if let s = v as? String { return s }
        if let d = v as? [String: Any] { return JS.str(d, "url") ?? "" }
        return ""
    }
}

struct Kv51Audio: Identifiable {
    let id: String
    let title: String
    let author: String
    let episodeTitle: String
    let kind: String
    let progress: Double
    let progressText: String
    let remainingText: String
    let coverUrl: String
    let openUrl: String
}

struct Kv51Sub: Identifiable {
    var id: String { kind + "-" + String(itemId) }
    let kind: String
    let itemId: Int
    let title: String
    let statusText: String
}

struct Kv51Disk: Identifiable {
    var id: String { label + path }
    let path: String
    let label: String
    let freeText: String
    let totalText: String
    let usedPct: Double
    let warn: Bool
}

struct Kv51Rec: Identifiable {
    var id: String { kind + "-" + String(arrId) }
    let kind: String
    let arrId: Int
    let title: String
    let sizeText: String
    let reason: String
    let poster: String
}

struct Kv51Del: Identifiable {
    let id: String
    let title: String
    let sizeText: String
    let statusText: String
    let canUndo: Bool

    nonisolated static func parse(_ o: [String: Any]) -> Kv51Del {
        Kv51Del(id: JS.str(o, "id") ?? "", title: JS.str(o, "title") ?? "", sizeText: JS.str(o, "sizeText") ?? "",
                statusText: JS.str(o, "statusText") ?? "", canUndo: JS.bool(o, "canUndo") ?? false)
    }
}

struct Kv51Storage {
    var disks: [Kv51Disk] = []
    var services: [(String, String)] = []
    var recs: [Kv51Rec] = []
    var recommendText: String = ""
    var trashConfigured: Bool = false
    var trashText: String = ""
    var deletions: [Kv51Del] = []
    var errors: [String] = []

    nonisolated static func parse(_ o: [String: Any]) -> Kv51Storage {
        var s: Kv51Storage = Kv51Storage()
        s.disks = JS.list(o, "disks").map { (d: [String: Any]) -> Kv51Disk in
            Kv51Disk(path: JS.str(d, "path") ?? "", label: JS.str(d, "label") ?? (JS.str(d, "path") ?? ""), freeText: JS.str(d, "freeText") ?? "",
                     totalText: JS.str(d, "totalText") ?? "", usedPct: JS.num(d, "usedPct") ?? 0, warn: JS.bool(d, "warn") ?? false)
        }
        let sv: [String: Any] = JS.dict(o, "services") ?? [:]
        let names: [(String, String)] = [("sonarr", "Serier (Sonarr)"), ("radarr", "Filmer (Radarr)"), ("qbit", "Nedlastinger (qBittorrent)")]
        for (k, n) in names {
            guard let v = JS.dict(sv, k) else { continue }
            var t: String = (JS.str(v, "sizeText") ?? "") + " · \(JS.int(v, "count") ?? 0) " + (k == "qbit" ? "torrenter" : "elementer")
            if let f = JS.str(v, "freeText") { t += " · " + f + " ledig" }
            s.services.append((n, t))
        }
        s.recs = JS.list(o, "recommendations").map { (r: [String: Any]) -> Kv51Rec in
            Kv51Rec(kind: JS.str(r, "kind") ?? "movie", arrId: JS.int(r, "id") ?? 0, title: JS.str(r, "title") ?? "",
                    sizeText: JS.str(r, "sizeText") ?? "", reason: JS.str(r, "reason") ?? "", poster: Kv51Item.posterUrl(r["poster"]))
        }
        s.recommendText = JS.str(o, "recommendText") ?? ""
        let tr: [String: Any]? = JS.dict(o, "trash")
        s.trashConfigured = JS.bool(tr, "configured") ?? false
        s.trashText = JS.str(tr, "text") ?? ""
        s.deletions = JS.list(o, "deletions").map { Kv51Del.parse($0) }
        s.errors = JS.strings(o, "errors")
        return s
    }
}

@MainActor
@Observable
final class Kveld51 {
    static let shared = Kveld51()

    var open: Bool = false
    var tab: String = UserDefaults.standard.string(forKey: "mf51_tab") ?? "kveld"
    var admin: Bool = false
    var statusError: String = ""
    var statusLoaded: Bool = false
    var toast: String = ""
    var errors: [String: String] = [:]
    var loading: Set<String> = []

    // I kveld
    var minutes: Int? = nil
    var genre: String = ""
    var kind: String = "any"
    var who: [String] = []
    var members: [Fc51Person] = []
    var items: [Kv51Item] = []
    var genres: [String] = []
    var whoNote: String = ""
    var phrasedBy: String = ""
    var empty: String = ""
    var tonightLoaded: Bool = false
    var phrasing: Bool = false
    var subsCheck: [String: String] = [:]

    // Fortsett
    var audio: [Kv51Audio] = []
    var audioConfigured: Bool = false
    var absUser: String = ""
    var audioText: String = ""
    var audioLoaded: Bool = false

    // Undertekster
    var subsText: String = ""
    var subsConfigured: Bool = false
    var whisperText: String = ""
    var wanted: [Kv51Sub] = []
    var subsLoaded: Bool = false

    // Lagring
    var storage: Kv51Storage? = nil
    var lastDeletion: Kv51Del? = nil

    var tabs: [(String, String)] {
        var t: [(String, String)] = [("kveld", "I kveld"), ("fortsett", "Fortsett"), ("subs", "Undertekster")]
        if admin { t.append(("lagring", "Lagring")) }
        return t
    }

    func show(_ t: String? = nil) {
        if let t { tab = t }
        Haptics.shared.tap()
        open = true
    }

    func pick(_ t: String, _ store: Store) {
        tab = t
        UserDefaults.standard.set(t, forKey: "mf51_tab")
        Task { await loadTab(store) }
    }

    func flash(_ t: String) {
        toast = t
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_200_000_000)
            if self.toast == t { self.toast = "" }
        }
    }

    private func get(_ store: Store, _ path: String, timeout: TimeInterval = 30) async throws -> [String: Any] {
        JS.obj(try await store.api.callAt("/api", "GET", path, timeout: timeout))
    }

    @discardableResult
    private func send(_ store: Store, _ method: String, _ path: String, _ body: [String: Any]? = nil) async -> [String: Any]? {
        do {
            return JS.obj(try await store.api.callAt("/api", method, path, json: body, timeout: 40))
        } catch {
            flash(F51.err(error))
            return nil
        }
    }

    func boot(_ store: Store) async {
        if !statusLoaded {
            do {
                let o: [String: Any] = try await get(store, "/media51/status", timeout: 20)
                admin = JS.bool(o, "admin") ?? false
                statusError = ""
            } catch {
                statusError = F51.err(error)
            }
            statusLoaded = true
        }
        if tab == "lagring" && !admin { tab = "kveld" }
        await loadTab(store)
    }

    func loadTab(_ store: Store, force: Bool = false) async {
        let t: String = tab
        if loading.contains(t) { return }
        loading.insert(t)
        defer { loading.remove(t) }
        errors[t] = nil
        do {
            switch t {
            case "fortsett": if force || !audioLoaded { try await loadAudio(store) }
            case "subs": if force || !subsLoaded { try await loadSubs(store) }
            case "lagring": if force || storage == nil { storage = Kv51Storage.parse(try await get(store, "/media51/storage", timeout: 40)) }
            default: if force || !tonightLoaded { try await loadTonight(store, phrase: false) }
            }
        } catch {
            errors[t] = F51.err(error)
        }
    }

    /* ---------- I kveld ---------- */

    func loadTonight(_ store: Store, phrase: Bool) async throws {
        var q: [String] = ["kind=" + kind]
        if let mn = minutes { q.append("minutes=\(mn)") }
        if !genre.isEmpty { q.append("genre=" + (genre.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? genre)) }
        if !who.isEmpty { q.append("who=" + who.joined(separator: ",")) }
        if phrase { q.append("phrase=1") }
        let o: [String: Any] = try await get(store, "/media51/tonight?" + q.joined(separator: "&"), timeout: phrase ? 90 : 30)
        items = JS.list(o, "items").map { Kv51Item.parse($0) }
        genres = JS.list(o, "genres").compactMap { JS.str($0, "label") ?? JS.str($0, "id") }
        let w: [String: Any]? = JS.dict(o, "who")
        whoNote = JS.str(w, "note") ?? ""
        if who.isEmpty { who = JS.list(w, "people").compactMap { JS.str($0, "userId") } }
        phrasedBy = JS.bool(o, "phrased") == true ? (JS.str(o, "model") ?? "lokal modell") : ""
        empty = JS.str(o, "empty") ?? "Ingen forslag"
        tonightLoaded = true
        if members.isEmpty, let ev = try? await get(store, "/famcal51/events?from=\(F51.today())&to=\(F51.today())", timeout: 15) {
            members = JS.list(ev, "members").compactMap { Fc51Person.parse($0) }
        }
    }

    func refilter(_ store: Store) {
        Task { @MainActor in
            do { try await loadTonight(store, phrase: false) } catch { errors["kveld"] = F51.err(error) }
        }
    }

    func toggleWho(_ id: String, _ store: Store) {
        if let i = who.firstIndex(of: id) { who.remove(at: i) } else { who.append(id) }
        refilter(store)
    }

    func phrase(_ store: Store) async {
        phrasing = true
        defer { phrasing = false }
        do { try await loadTonight(store, phrase: true) } catch { flash(F51.err(error)) }
    }

    /// «Åpne» i Media (Sonarr/Radarr-siden for tittelen).
    func openInMedia(_ x: Kv51Item, _ store: Store) {
        open = false
        let t: Media43Title = Media43Title(id: x.arrId, kind: x.kind == "movie" ? "movie" : "series", title: x.title, poster: x.poster)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)
            let md: Media43 = Media43.shared
            md.show(x.kind == "movie" ? "radarr" : "sonarr")
            md.select(t, store)
        }
    }

    func checkSubs(_ x: Kv51Item, _ store: Store) async {
        subsCheck[x.id] = "Sjekker …"
        let path: String = x.kind == "movie" ? "/media51/subs/movie/\(x.arrId)" : "/media51/subs/episode/\(x.arrId)"
        do {
            let o: [String: Any] = try await get(store, path, timeout: 20)
            subsCheck[x.id] = (JS.str(o, "statusText") ?? "") + ((JS.bool(o, "hasNorwegian") ?? false) ? "" : "|hent")
        } catch {
            subsCheck[x.id] = F51.err(error)
        }
    }

    func searchSubs(kind: String, id: Int, _ store: Store) async {
        guard let r = await send(store, "POST", "/media51/subs/\(kind)/\(id)/search") else { return }
        flash(JS.str(r, "message") ?? "Søker etter undertekster")
    }

    /* ---------- Fortsett ---------- */

    func loadAudio(_ store: Store) async throws {
        let o: [String: Any] = try await get(store, "/media51/audio/continue?limit=12", timeout: 30)
        audioConfigured = JS.bool(o, "configured") ?? false
        absUser = JS.str(o, "absUser") ?? ""
        audioText = JS.str(o, "text") ?? (JS.str(o, "error") ?? "")
        audio = JS.list(o, "items").map { (x: [String: Any]) -> Kv51Audio in
            Kv51Audio(id: (JS.str(x, "id") ?? UUID().uuidString) + (JS.str(x, "episodeId") ?? ""), title: JS.str(x, "title") ?? "",
                      author: JS.str(x, "author") ?? "", episodeTitle: JS.str(x, "episodeTitle") ?? "", kind: JS.str(x, "kind") ?? "book",
                      progress: JS.num(x, "progress") ?? 0, progressText: JS.str(x, "progressText") ?? "", remainingText: JS.str(x, "remainingText") ?? "",
                      coverUrl: JS.str(x, "coverUrl") ?? "", openUrl: JS.str(x, "openUrl") ?? "")
        }
        audioLoaded = true
    }

    func saveAbsUser(_ v: String, _ store: Store) async {
        guard await send(store, "PUT", "/media51/audio/me", ["absUser": v.trimmingCharacters(in: .whitespaces)]) != nil else { return }
        flash("Lagret")
        await loadTab(store, force: true)
    }

    /* ---------- Undertekster ---------- */

    func loadSubs(_ store: Store) async throws {
        let st: [String: Any] = try await get(store, "/media51/subs/status", timeout: 20)
        subsText = JS.str(st, "text") ?? ""
        subsConfigured = JS.bool(st, "configured") ?? false
        whisperText = JS.str(JS.dict(st, "whisper"), "text") ?? ""
        if let w = try? await get(store, "/media51/subs/wanted", timeout: 30) {
            wanted = JS.list(w, "items").map { (x: [String: Any]) -> Kv51Sub in
                Kv51Sub(kind: JS.str(x, "kind") ?? "movie", itemId: JS.int(x, "id") ?? 0, title: JS.str(x, "title") ?? "", statusText: JS.str(x, "statusText") ?? "")
            }
        } else {
            wanted = []
        }
        subsLoaded = true
    }

    /* ---------- Lagring (admin) ---------- */

    func delete(_ r: Kv51Rec, _ store: Store) async {
        guard let o = await send(store, "POST", "/media51/storage/delete", ["kind": r.kind, "id": r.arrId, "confirm": true]) else { return }
        if let d = JS.dict(o, "deletion") { lastDeletion = Kv51Del.parse(d) }
        flash(JS.str(o, "message") ?? "Slettes – kan angres i 24 timer")
        await loadTab(store, force: true)
    }

    func undo(_ id: String, _ store: Store) async {
        guard let o = await send(store, "POST", "/media51/storage/deletions/\(id)/undo") else { return }
        if lastDeletion?.id == id { lastDeletion = nil }
        flash(JS.str(o, "message") ?? "Angret")
        await loadTab(store, force: true)
    }

    func emptyTrash(_ store: Store) async {
        guard let o = await send(store, "POST", "/media51/storage/trash/empty", ["confirm": "SLETT"]) else { return }
        flash("\(JS.int(o, "removed") ?? 0) slettet for godt")
        await loadTab(store, force: true)
    }
}
