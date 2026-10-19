import SwiftUI
import UIKit

/* ---------------- Prompt 29: Innstillinger → Konto → Backup (hele systemet, bare admin) ---------------- */
// Fasit: design/Mobil Papir App.dc.html (bkGet/backup) og prompts/prompt-29-pakke/claude-code-backup.md.
// API (server/system-backup.js): GET/PUT /api/backup/settings, POST /api/backup/run → 202 {id}, GET /api/backup/status
// (siste + pågående jobb med pct), GET /api/backup/list, POST /api/backup/restore {id, modules, password},
// POST /api/backup/key → {key} (vises én gang), GET /api/backup/:id/download (økt i nettleseren → åpnes i Safari).
// GET virker med app-token; endringer kan kreve økt i nettleseren (403) – da vises en lenke til nettsiden.
// Mangler API-et (404) vises «Serveren har ikke systembackup ennå».

struct Backup29Entry: Identifiable, Equatable {
    var id: String
    var at: Date?
    var size: Double
    var scope: String
    var modules: [String]
    var ok: Bool
    var error: String
    var encrypted: Bool
    var cloud: Bool

    static func from(_ o: [String: Any]) -> Backup29Entry? {
        guard let id = JS.str(o, "id") else { return nil }
        let at: Date? = JS.date(o["at"] ?? o["finished"] ?? o["started"])
        let cloudAny: Any? = o["cloud"]
        var cloud: Bool = false
        if let b = cloudAny as? Bool { cloud = b } else if cloudAny is [String: Any] { cloud = true } else if let s = cloudAny as? String { cloud = !s.isEmpty }
        return Backup29Entry(id: id, at: at, size: JS.num(o, "size") ?? 0, scope: JS.str(o, "scope") ?? "all",
                             modules: JS.strings(o, "modules"), ok: JS.bool(o, "ok") ?? (JS.str(o, "error") == nil),
                             error: JS.str(o, "error") ?? "", encrypted: JS.bool(o, "encrypted") ?? false, cloud: cloud)
    }
}

@MainActor
@Observable
final class Backup29Model {
    static let shared = Backup29Model()

    /// (id, navn, undertekst) – modulene serveren kjenner.
    nonisolated static let modules: [(String, String, String)] = [
        ("finans", "Finans", "Transaksjoner, kvitteringer, budsjett, abonnementer"),
        ("kalender", "Kalender", "Egne hendelser og påminnelser"),
        ("familie", "Familie", "Posisjoner, soner og helse"),
        ("mat", "Mat", "Oppskrifter og ukeplan"),
        ("sporing", "Sporing", "Pakker og historikk"),
        ("huske", "Huskeliste", "Lister og oppgaver"),
        ("bursdager", "Bursdager", ""),
        ("chat", "Chat", "Samtaler og kunnskapsbase"),
        ("domener", "Domener", "Oppsett og statistikk"),
        ("innstillinger", "Innstillinger og brukere", "Kontoer, tokens og regler"),
        ("filer", "Bilder og filer", "Kvitteringsbilder og vedlegg"),
    ]
    nonisolated static let schedules: [(String, String)] = [("nightly", "Hver natt 03:00"), ("6h", "Hver 6. time"), ("weekly", "Hver uke · søndag"), ("monthly", "Hver måned")]
    nonisolated static let keeps: [(String, String)] = [("7", "7 siste"), ("30", "30 siste"), ("90d", "90 dager"), ("1y", "1 år")]
    nonisolated static let scopes: [(String, String)] = [("all", "Hele systemet"), ("finans", "Bare Finans"), ("custom", "Egendefinert")]

    var loaded: Bool = false
    var loading: Bool = false
    var missing: Bool = false
    var error: String = ""
    /// Endringen krever økt i nettleseren.
    var needsWeb: Bool = false

    /// Innstillingene slik serveren sendte dem (sendes tilbake med endringene).
    var settings: [String: Any] = [:]
    var list: [Backup29Entry] = []
    var last: Backup29Entry? = nil
    /// Pågående jobb (0–100), nil = ingen.
    var runPct: Int? = nil
    /// Gjenopprettingsnøkkelen, vises én gang.
    var newKey: String? = nil
    var restoring: Backup29Entry? = nil

    @ObservationIgnored private var pollTask: Task<Void, Never>? = nil

    static func isAdmin(_ store: Store) -> Bool { Update28Model.isAdmin(store) }

    /* ---------- Lesing ---------- */

    var auto: Bool { JS.bool(settings, "auto") ?? true }
    var schedule: String { JS.str(settings, "schedule") ?? "nightly" }
    var keep: String { JS.str(settings, "keep") ?? "30" }
    var notifyFail: Bool { JS.bool(settings, "notifyFail") ?? true }
    var scope: String { JS.str(settings, "scope") ?? "all" }
    var chosen: [String] { JS.strings(settings, "modules") }
    var encrypt: Bool { JS.bool(settings, "encrypt") ?? false }
    var keySet: Bool { JS.bool(settings, "keySet") ?? false }
    var path: String { JS.str(JS.dict(settings, "target"), "path") ?? "/srv/backup" }
    var cloudOn: Bool { JS.bool(JS.dict(settings, "cloud"), "enabled") ?? false }
    var provider: String { JS.str(JS.dict(settings, "cloud"), "provider") ?? "b2" }
    /// Prompt 30: nettverksdisk (SMB) – target.smb {enabled, share, path, label, lastUpload, lastError}.
    var smb: [String: Any]? { JS.dict(JS.dict(settings, "target"), "smb") }
    var smbKnown: Bool { smb != nil }
    var smbShare: String { JS.str(smb, "share") ?? "" }
    var smbOn: Bool { JS.bool(smb, "enabled") ?? false }
    var smbSub: String {
        let label: String = JS.str(smb, "label") ?? smbShare
        if let e = JS.str(smb, "lastError"), !e.isEmpty { return label + " · siste kopi feilet: " + e }
        if let d = JS.date(smb?["lastUpload"]) { return label + " · sist " + Backup29Model.when(d) }
        return label + (smbOn ? " · kopieres etter hver backup" : "")
    }
    /// Åpner SMB-veiviseren (Smb30Wizard.swift) for systembackupen.
    func openSmb(_ store: Store) { Smb30Model.shared.start(finans: false, system: true, encrypted: encrypt, store) }
    func setSmb(_ v: Bool, _ store: Store) {
        var t: [String: Any] = JS.dict(settings, "target") ?? [:]
        var s: [String: Any] = smb ?? [:]
        s["enabled"] = v
        t["smb"] = s
        put(["target": t], store)
    }
    /// Google Drive kan svare {supported:false}.
    var cloudSupported: Bool { JS.bool(JS.dict(settings, "cloud"), "supported") ?? (provider == "b2") }

    nonisolated static func name(_ list: [(String, String)], _ id: String) -> String { list.first(where: { $0.0 == id })?.1 ?? id }

    func includes(_ mod: String) -> Bool {
        if scope == "all" { return true }
        if scope == "finans" { return mod == "finans" }
        return chosen.contains(mod)
    }

    /// Undertekst på raden i Innstillinger: «Hver natt 03:00 · Hele systemet» eller «Automatisk av».
    var summary: String {
        if missing { return "Ikke tilgjengelig på serveren" }
        if !loaded { return "Hele systemet · automatisk og gjenoppretting" }
        if !auto { return "Automatisk av" }
        return Backup29Model.name(Backup29Model.schedules, schedule) + " · " + Backup29Model.name(Backup29Model.scopes, scope)
    }

    /* ---------- Henting ---------- */

    func load(_ store: Store) async {
        if loading { return }
        loading = true
        defer { loading = false }
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/backup/settings", timeout: 15)
            let o: [String: Any] = JS.obj(d)
            settings = JS.dict(o, "settings") ?? o
            missing = false
            error = ""
            loaded = true
        } catch let e as APIError {
            if e.status == 404 || e.status == 405 { missing = true; error = "" } else { error = e.message }
            return
        } catch {
            self.error = error.localizedDescription
            return
        }
        await loadList(store)
        await loadStatus(store)
    }

    func loadList(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/backup/list", timeout: 15) else { return }
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        var rows: [[String: Any]] = (any as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
        if rows.isEmpty { rows = JS.list(any as? [String: Any], "items") }
        list = rows.compactMap { Backup29Entry.from($0) }
    }

    func loadStatus(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/backup/status", timeout: 10) else { return }
        let o: [String: Any] = JS.obj(d)
        if let l = JS.dict(o, "last") { last = Backup29Entry.from(l) } else { last = list.first }
        let run: [String: Any]? = JS.dict(o, "running") ?? JS.dict(o, "current") ?? JS.dict(o, "job")
        if let r = run, (JS.str(r, "state") ?? "running") != "done" {
            runPct = JS.int(r, "pct") ?? 0
            startPolling(store)
        } else {
            runPct = nil
        }
    }

    /* ---------- Endringer ---------- */

    private func put(_ patch: [String: Any], _ store: Store) {
        var next: [String: Any] = settings
        for (k, v) in patch { next[k] = v }
        let old: [String: Any] = settings
        settings = next
        Haptics.shared.select()
        Task {
            do {
                let d: Data = try await store.api.callAt("/api", "PUT", "/backup/settings", json: next, timeout: 15)
                let o: [String: Any] = JS.obj(d)
                let s: [String: Any] = JS.dict(o, "settings") ?? o
                if !s.isEmpty { self.settings = s }
                self.needsWeb = false
            } catch let e as APIError {
                self.settings = old
                if e.status == 403 || e.status == 401 { self.needsWeb = true }
                store.flash("Kunne ikke lagre: " + e.message)
            } catch {
                self.settings = old
                store.flash("Kunne ikke lagre: " + error.localizedDescription)
            }
        }
    }

    private static func cycle(_ list: [(String, String)], _ cur: String) -> String {
        let i: Int = list.firstIndex(where: { $0.0 == cur }) ?? -1
        return list[(i + 1) % list.count].0
    }

    func setAuto(_ v: Bool, _ store: Store) { put(["auto": v], store) }
    func setNotify(_ v: Bool, _ store: Store) { put(["notifyFail": v], store) }
    func nextSchedule(_ store: Store) { put(["schedule": Backup29Model.cycle(Backup29Model.schedules, schedule)], store) }
    func nextKeep(_ store: Store) { put(["keep": Backup29Model.cycle(Backup29Model.keeps, keep)], store) }
    func nextScope(_ store: Store) { put(["scope": Backup29Model.cycle(Backup29Model.scopes, scope)], store) }

    func toggleModule(_ id: String, _ store: Store) {
        guard scope == "custom" else { return }
        var mods: [String] = chosen
        if let i = mods.firstIndex(of: id) { mods.remove(at: i) } else { mods.append(id) }
        put(["modules": mods], store)
    }

    func setEncrypt(_ v: Bool, _ store: Store) {
        if !v && cloudOn {
            var c: [String: Any] = JS.dict(settings, "cloud") ?? [:]
            c["enabled"] = false
            put(["encrypt": false, "cloud": c], store)
            return
        }
        put(["encrypt": v], store)
        if v && !keySet { makeKey(store) }
    }

    func setCloud(_ v: Bool, _ store: Store) {
        if v && !encrypt { store.flash("Slå på kryptering først. Ingenting sendes ukryptert til sky."); return }
        if v && !cloudSupported { store.flash("Kopi til " + providerName + " kommer"); return }
        var c: [String: Any] = JS.dict(settings, "cloud") ?? [:]
        c["enabled"] = v
        if c["provider"] == nil { c["provider"] = provider }
        put(["cloud": c], store)
    }

    var providerName: String { provider == "gdrive" ? "Google Drive" : "Backblaze B2" }

    func nextProvider(_ store: Store) {
        var c: [String: Any] = JS.dict(settings, "cloud") ?? [:]
        c["provider"] = provider == "b2" ? "gdrive" : "b2"
        c["supported"] = nil
        put(["cloud": c], store)
    }

    /// Ny gjenopprettingsnøkkel (vises én gang).
    func makeKey(_ store: Store) {
        Task {
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/backup/key", json: [:], timeout: 15)
                if let k = JS.str(JS.obj(d), "key") { self.newKey = k }
                var s: [String: Any] = self.settings
                s["keySet"] = true
                self.settings = s
            } catch let e as APIError {
                if e.status == 403 || e.status == 401 { self.needsWeb = true }
                store.flash("Kunne ikke lage nøkkel: " + e.message)
            } catch {
                store.flash("Kunne ikke lage nøkkel: " + error.localizedDescription)
            }
        }
    }

    /* ---------- Kjøring ---------- */

    func run(_ store: Store) {
        if runPct != nil { return }
        runPct = 0
        Haptics.shared.tap()
        var body: [String: Any] = ["scope": scope]
        if scope == "custom" { body["modules"] = chosen }
        let payload: [String: Any] = body
        Task {
            do {
                _ = try await store.api.callAt("/api", "POST", "/backup/run", json: payload, timeout: 20)
                self.startPolling(store)
            } catch let e as APIError {
                self.runPct = nil
                if e.status == 403 || e.status == 401 { self.needsWeb = true }
                store.flash("Kunne ikke starte backup: " + e.message)
            } catch {
                self.runPct = nil
                store.flash("Kunne ikke starte backup: " + error.localizedDescription)
            }
        }
    }

    private func startPolling(_ store: Store) {
        if pollTask != nil { return }
        pollTask = Task {
            var rounds: Int = 0
            while rounds < 900 {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                if Task.isCancelled { break }
                rounds += 1
                guard let d = try? await store.api.callAt("/api", "GET", "/backup/status", timeout: 10) else { continue }
                let o: [String: Any] = JS.obj(d)
                let run: [String: Any]? = JS.dict(o, "running") ?? JS.dict(o, "current") ?? JS.dict(o, "job")
                if let r = run, (JS.str(r, "state") ?? "running") != "done" {
                    self.runPct = JS.int(r, "pct") ?? self.runPct
                    continue
                }
                self.runPct = nil
                if let l = JS.dict(o, "last") { self.last = Backup29Entry.from(l) }
                await self.loadList(store)
                if self.last == nil { self.last = self.list.first }
                if self.last?.ok ?? true { store.flash("✓ Backup ferdig") } else { store.flash("Backup feilet: " + (self.last?.error ?? "")) }
                break
            }
            self.pollTask = nil
        }
    }

    /// Gjenopprett: valgte moduler (tom liste = alt) og passordet på nytt. Serveren tar en sikkerhetskopi først.
    func restore(_ e: Backup29Entry, modules: [String], password: String, _ store: Store) async -> String? {
        do {
            let body: [String: Any] = ["id": e.id, "modules": modules, "password": password]
            let d: Data = try await store.api.callAt("/api", "POST", "/backup/restore", json: body, timeout: 300)
            let o: [String: Any] = JS.obj(d)
            if JS.bool(o, "ok") == false { return JS.str(o, "error") ?? "Gjenopprettingen feilet." }
            restoring = nil
            store.flash("✓ Gjenopprettet")
            await loadList(store)
            return nil
        } catch let er as APIError {
            if er.status == 403 && er.message.lowercased().contains("nettleser") { needsWeb = true }
            return er.message
        } catch {
            return error.localizedDescription
        }
    }

    /* ---------- Nettleseren ---------- */

    static func webURL(_ store: Store) -> URL? {
        let base: String = store.api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: base + "/#/innstillinger/backup")
    }

    static func downloadURL(_ e: Backup29Entry, _ store: Store) -> URL? {
        let base: String = store.api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: base + "/api/backup/" + Cal27Model.enc(e.id) + "/download")
    }

    /* ---------- Tekst ---------- */

    nonisolated static func size(_ b: Double) -> String {
        if b <= 0 { return "–" }
        let gb: Double = b / 1_073_741_824
        if gb >= 1 { return String(format: "%.1f GB", gb).replacingOccurrences(of: ".", with: ",") }
        let mb: Double = b / 1_048_576
        if mb >= 1 { return "\(Int(mb.rounded())) MB" }
        return "\(Int((b / 1024).rounded())) kB"
    }

    /// «I natt 03:00», «I dag 14:02», «I går 03:00» eller «17.10 03:00».
    static func when(_ d: Date?) -> String {
        guard let d else { return "–" }
        let cal: Calendar = Cal26.cal
        let hm: String = JS.fmt(d, "HH:mm")
        if cal.isDateInToday(d) { return (cal.component(.hour, from: d) < 6 ? "I natt " : "I dag ") + hm }
        if cal.isDateInYesterday(d) { return "I går " + hm }
        return JS.fmt(d, "dd.MM HH:mm")
    }

    nonisolated static func scopeName(_ e: Backup29Entry) -> String {
        if e.scope == "custom" && !e.modules.isEmpty {
            let names: [String] = e.modules.map { m in Backup29Model.name(Backup29Model.modules.map { ($0.0, $0.1) }, m) }
            return names.prefix(3).joined(separator: ", ") + (names.count > 3 ? " …" : "")
        }
        return name(scopes, e.scope)
    }
}
