import SwiftUI
import UIKit

/* ---------------- Prompt 87: Media → NRK (modell) ----------------
 Fasit: prompts/prompt-54-pakke/claude-code-media-nrk-nedlaster.md og design/Media NRK.dc.html.
 Alt går via Homelab-serveren (/api/media/nrk/…, server/nrkdl.js). Appen ser aldri adressen eller tokenet til nrk-dl.
   GET  /media/nrk/status     → {configured, vpn:{ok, ip, land}, komprimer:{standard, crf, preset}|null, mapper, bibliotek}
   GET  /media/nrk/jobber     → {configured, jobber:[Jobb], folger:[Folg]}
   POST /media/nrk/jobber     {url, type, kvalitet, folg, komprimer?, episoder?}   (409 = ligger allerede i køen)
   POST /media/nrk/jobber/:id/avbryt | /igjen · DELETE /media/nrk/jobber/:id · POST /media/nrk/rydd
   POST /media/nrk/folger/:id/sjekk · DELETE /media/nrk/folger/:id
   GET  /media/nrk/bibliotek  → {configured, tilgjengelig, elementer:[…]} · GET /media/nrk/serie?url=…
 Tåler at felt mangler (eldre server / eldre nrk-dl): uten `komprimer` vises ingen avkrysningsboks, og uten bibliotek
 står teksten «Biblioteket krever en nyere versjon av nrk-dl.».
 Lenker utenfra (homelab://media/nrk?url=…) og «Lim inn» fyller bare ut feltet – ingenting lastes ned før «Last ned». */

struct Nrk87Job: Identifiable, Hashable {
    var id: String
    var url: String = ""
    var type: String = ""
    /// ko | kjorer | ferdig | feil | avbrutt
    var status: String = "ko"
    var title: String = ""
    var msg: String = ""
    var pct: Double? = nil
    var speed: Double = 0
    var eta: Int = 0
    var nr: Int = 0
    var av: Int = 0
    var files: [String] = []
    /// Bytes spart med komprimering (ferdige jobber).
    var saved: Double = 0

    var active: Bool { status == "ko" || status == "kjorer" }
    /// Under komprimering gjelder prosenten komprimeringen, og fart vises ikke.
    var compressing: Bool { status == "kjorer" && msg.hasPrefix("Komprimerer") }
}

struct Nrk87Follow: Identifiable, Hashable {
    var id: String
    var url: String = ""
    var title: String = ""
    var quality: String = "best"
    var checked: Double = 0
    var last: String = ""
}

struct Nrk87Ep: Identifiable, Hashable {
    var id: String
    var nr: Int
    var title: String
    var dur: String = ""
    var url: String = ""
    /// lastet | laster | ko | mangler
    var status: String = "mangler"
}

struct Nrk87Season: Identifiable, Hashable {
    var nr: Int
    var eps: [Nrk87Ep] = []
    var id: Int { nr }
}

struct Nrk87Item: Identifiable, Hashable {
    var id: String
    var title: String
    /// tv | film | radio
    var type: String = "tv"
    var url: String = ""
    /// Bildet via serverens bildeproxy (/api/media/nrk/bilde?u=…). Tomt = fargeflate med tittel.
    var image: String = ""
    var meta: String = ""
    var desc: String = ""
    var seasons: [Nrk87Season] = []
    /// Film uten episodeliste: lastet | laster | ko | mangler.
    var filmStatus: String = "mangler"

    var total: Int {
        let n: Int = seasons.reduce(0) { $0 + $1.eps.count }
        return n > 0 ? n : 1
    }

    var have: Int {
        let n: Int = seasons.reduce(0) { $0 + $1.eps.count }
        if n == 0 { return filmStatus == "lastet" ? 1 : 0 }
        return seasons.reduce(0) { $0 + $1.eps.filter { $0.status == "lastet" }.count }
    }

    /// Statusen til en film (første rad når serveren sender den som én episode).
    var single: String { seasons.first?.eps.first?.status ?? filmStatus }
}

@MainActor
@Observable
final class Nrk87 {
    static let shared = Nrk87()

    static let types: [(String, String)] = [("auto", "Finn ut selv"), ("tv", "Serie"), ("film", "Film"), ("radio", "Radio")]
    static let quals: [(String, String)] = [("best", "Beste"), ("1080", "1080p"), ("720", "720p"), ("540", "540p")]
    static let filters: [(String, String)] = [("alle", "Alle"), ("tv", "Serier"), ("film", "Filmer"), ("radio", "Radio")]

    /* ---------- Tilstand fra serveren ---------- */

    var loaded: Bool = false
    var configured: Bool = true
    var message: String = ""
    var err: String = ""
    var hasVpn: Bool = false
    var vpnOk: Bool = false
    var vpnIp: String = ""
    var vpnLand: String = ""
    var hasKomp: Bool = false
    var kompStd: Bool = false
    var kompCrf: String = ""
    var kompPreset: String = ""
    var folders: [String] = ["tv", "movies", "podcast"]
    var jobs: [Nrk87Job] = []
    var follows: [Nrk87Follow] = []
    /// "" = ikke hentet · ok · gammel (nrk-dl uten bibliotek) · feil
    var libState: String = ""
    var libErr: String = ""
    var lib: [Nrk87Item] = []

    /* ---------- Skjemaet (lever i modellen, så feltet ikke mister teksten når Media tegnes på nytt) ---------- */

    var url: String = ""
    var type: String = "auto"
    var qual: String = "best"
    var follow: Bool = false
    var komp: Bool = false
    var formErr: String = ""
    var busy: Bool = false

    var filesOpen: Set<String> = []
    var checking: Set<String> = []
    var filter: String = "alle"
    var sel: Nrk87Item? = nil
    var selSeason: [String: Int] = [:]

    @ObservationIgnored private var kompTouched: Bool = false
    @ObservationIgnored private var statusAt: Date = .distantPast
    @ObservationIgnored private var libStale: Bool = false
    @ObservationIgnored private var scope: String = "-"

    var active: Bool { jobs.contains { $0.active } }
    /// VPN-en er kjent og ikke norsk: køen står stille.
    var vpnStopped: Bool { hasVpn && !vpnOk }
    var hasDone: Bool { jobs.contains { $0.status == "ferdig" || $0.status == "avbrutt" } }

    /* ---------- Lenker ---------- */

    /// Bare https-lenker til nrk.no / nrksuper.no (med underdomener). Serveren validerer på nytt.
    nonisolated static func valid(_ s: String) -> Bool {
        let re: String = "^https://([a-z0-9-]+\\.)*(nrk\\.no|nrksuper\\.no)(/|$)"
        return s.range(of: re, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// Rydder en innlimt eller delt tekst: første NRK-lenke i teksten, http → https, «tv.nrk.no/…» får https://.
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
        id.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil
    }

    /// Fra en lenke utenfra eller «Lim inn»: fyller bare ut feltet. Brukeren må selv trykke «Last ned».
    func prefill(_ text: String) {
        let l: String = Nrk87.link(in: text)
        if l.isEmpty { return }
        url = String(l.prefix(2000))
        formErr = ""
    }

    func paste() {
        Haptics.shared.tap()
        guard let s = UIPasteboard.general.string, !s.isEmpty else {
            formErr = "Utklippstavlen er tom."
            return
        }
        prefill(s)
    }

    /* ---------- Nett ---------- */

    private func call(_ store: Store, _ method: String, _ path: String, json: [String: Any]? = nil, timeout: TimeInterval = 20) async throws -> Data {
        try await Media46.shared.call(store, method, "/media/nrk" + path, json: json, timeout: timeout)
    }

    /// Serverens norske tekst når den finnes; ellers de vanlige Media-tekstene (utlogget, ingen tilgang, svarer ikke).
    nonisolated static func text(_ e: Error) -> String {
        guard let a = e as? APIError else { return e.localizedDescription }
        if a.status == 404 || a.status == 405 { return "Serveren har ikke NRK-nedlasteren ennå (oppdater Homelab)." }
        if a.status == 0 || a.status == 401 || a.status == 403 { return Media44.errorText(e) }
        if a.message.isEmpty || a.message.hasPrefix("Feil ") { return "NRK-nedlasteren svarer ikke akkurat nå. Prøv igjen om litt." }
        return a.message
    }

    /// Ny konto = ingenting fra forrige konto (alt er per bruker).
    private func checkScope(_ store: Store) {
        let acct: String = store.account?.id ?? ""
        if acct == scope { return }
        // Første gang i denne økten: behold en lenke som nettopp er fylt ut (homelab://media/nrk?url=…).
        let first: Bool = scope == "-"
        scope = acct
        if first { return }
        loaded = false
        configured = true
        message = ""
        err = ""
        hasVpn = false
        hasKomp = false
        jobs = []
        follows = []
        lib = []
        libState = ""
        libErr = ""
        sel = nil
        selSeason = [:]
        filesOpen = []
        checking = []
        url = ""
        formErr = ""
        follow = false
        kompTouched = false
        statusAt = .distantPast
    }

    /// Kjører så lenge NRK-fanen vises (visningens .task avbryter den): hvert 2. s med noe i kø, ellers hvert 10. s.
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
        let before: Int = jobs.filter { $0.active }.count
        do {
            let d: Data = try await call(store, "GET", "/jobber", timeout: 15)
            if Task.isCancelled { return }
            let o: [String: Any] = JS.obj(d)
            configured = JS.bool(o, "configured") ?? true
            message = JS.str(o, "message") ?? ""
            jobs = JS.list(o, "jobber").compactMap { Nrk87.job($0) }
            follows = JS.list(o, "folger").compactMap { Nrk87.follow($0) }
            err = ""
        } catch let e {
            if Task.isCancelled { return }
            err = Nrk87.text(e)
        }
        loaded = true
        if !configured || !err.isEmpty { return }
        let after: Int = jobs.filter { $0.active }.count
        if after < before { libStale = true }
        if full || Date().timeIntervalSince(statusAt) >= 10 { await loadStatus(store) }
        if full || libState.isEmpty || libStale { await loadLib(store) }
    }

    func loadStatus(_ store: Store) async {
        statusAt = Date()
        guard let d = try? await call(store, "GET", "/status", timeout: 12) else { return }
        let o: [String: Any] = JS.obj(d)
        if JS.bool(o, "configured") == false {
            configured = false
            message = JS.str(o, "message") ?? message
            return
        }
        if let v = JS.dict(o, "vpn") {
            hasVpn = true
            vpnOk = JS.bool(v, "ok") ?? false
            vpnIp = JS.str(v, "ip") ?? ""
            vpnLand = JS.str(v, "land") ?? ""
        } else {
            hasVpn = false
        }
        if let k = JS.dict(o, "komprimer") {
            hasKomp = true
            kompStd = JS.bool(k, "standard") ?? false
            kompCrf = JS.str(k, "crf") ?? ""
            kompPreset = JS.str(k, "preset") ?? ""
            if !kompTouched { komp = kompStd }
        } else {
            hasKomp = false
        }
        if let m = JS.dict(o, "mapper") {
            let tv: String = Nrk87.leaf(JS.str(m, "tv"), "tv")
            let film: String = Nrk87.leaf(JS.str(m, "film"), "movies")
            let radio: String = Nrk87.leaf(JS.str(m, "radio"), "podcast")
            folders = [tv, film, radio]
        }
        // nrk-dl uten bibliotek-endepunktene: ikke spør etter dem.
        if JS.bool(o, "bibliotek") == false {
            libState = "gammel"
            lib = []
        } else if libState == "gammel" {
            libState = ""
        }
    }

    nonisolated static func leaf(_ path: String?, _ fallback: String) -> String {
        let parts: [String] = (path ?? "").components(separatedBy: "/").filter { !$0.isEmpty }
        return parts.last ?? fallback
    }

    func loadLib(_ store: Store) async {
        if libState == "gammel" { return }
        libStale = false
        do {
            let d: Data = try await call(store, "GET", "/bibliotek", timeout: 40)
            if Task.isCancelled { return }
            let o: [String: Any] = JS.obj(d)
            if JS.bool(o, "configured") == false { return }
            if JS.bool(o, "tilgjengelig") == false {
                libState = "gammel"
                lib = []
                return
            }
            lib = JS.list(o, "elementer").compactMap { Nrk87.item($0) }
            libState = "ok"
            libErr = ""
            if let s = sel, let fresh = lib.first(where: { $0.id == s.id }), fresh.total >= s.total { sel = fresh }
        } catch let e as APIError where e.status == 404 || e.status == 405 {
            // Homelab-serveren selv er eldre enn biblioteket.
            libState = "gammel"
            lib = []
        } catch let e {
            if Task.isCancelled { return }
            if lib.isEmpty { libState = "feil" }
            libErr = Nrk87.text(e)
        }
    }

    /* ---------- Tolking (tåler at felt mangler) ---------- */

    nonisolated static func job(_ r: [String: Any]) -> Nrk87Job? {
        guard let id = JS.str(r, "id") else { return nil }
        var j: Nrk87Job = Nrk87Job(id: id)
        j.url = JS.str(r, "url") ?? ""
        j.type = JS.str(r, "type") ?? ""
        j.status = JS.str(r, "status") ?? "ko"
        j.title = JS.str(r, "tittel") ?? (j.url.isEmpty ? "NRK" : j.url)
        j.msg = JS.str(r, "melding") ?? ""
        j.pct = JS.num(r, "prosent")
        j.speed = JS.num(r, "fart") ?? 0
        j.eta = JS.int(r, "eta") ?? 0
        j.nr = JS.int(r, "nr") ?? 0
        j.av = JS.int(r, "av") ?? 0
        j.files = JS.strings(r, "filer")
        j.saved = JS.num(r, "spart") ?? 0
        return j
    }

    nonisolated static func follow(_ r: [String: Any]) -> Nrk87Follow? {
        guard let id = JS.str(r, "id") else { return nil }
        var f: Nrk87Follow = Nrk87Follow(id: id)
        f.url = JS.str(r, "url") ?? ""
        f.title = JS.str(r, "tittel") ?? (f.url.isEmpty ? "Serie" : f.url)
        f.quality = JS.str(r, "kvalitet") ?? "best"
        f.checked = JS.num(r, "sjekket") ?? 0
        f.last = JS.str(r, "siste") ?? ""
        return f
    }

    nonisolated static func epStatus(_ r: [String: Any]) -> String {
        switch JS.str(r, "status") ?? "" {
        case "lastet", "ok", "ferdig": return "lastet"
        case "laster", "kjorer": return "laster"
        case "ko": return "ko"
        case "mangler": return "mangler"
        default: return JS.str(r, "fil") != nil ? "lastet" : "mangler"
        }
    }

    /// Serveren sender `varighetTekst` («42 min») og `varighet` i hele sekunder. Teksten brukes når den finnes.
    nonisolated static func duration(_ r: [String: Any]) -> String {
        if let t = JS.str(r, "varighetTekst"), !t.isEmpty { return t }
        if let s = r["varighet"] as? String { return s }
        guard let n = JS.num(r, "varighet"), n > 0 else { return "" }
        let min: Int = Int((n / 60).rounded())
        if min >= 60 { return "\(min / 60) t \(min % 60) min" }
        return "\(Swift.max(1, min)) min"
    }

    nonisolated static func item(_ r: [String: Any]) -> Nrk87Item? {
        guard let title = JS.str(r, "tittel") else { return nil }
        let url: String = JS.str(r, "url") ?? ""
        var it: Nrk87Item = Nrk87Item(id: JS.str(r, "id") ?? (url.isEmpty ? title : url), title: title)
        it.url = url
        let ty: String = JS.str(r, "type") ?? "tv"
        it.type = (ty == "film" || ty == "radio") ? ty : "tv"
        let img: String = JS.str(r, "bilde") ?? ""
        // Bare via serverens proxy (sti på Homelab) – aldri rett mot NRK fra appen.
        it.image = img.hasPrefix("/") ? img : ""
        it.meta = JS.str(r, "meta") ?? ""
        it.desc = JS.str(r, "beskrivelse") ?? ""
        it.filmStatus = epStatus(r)
        var seasons: [Nrk87Season] = []
        for (si, s) in JS.list(r, "sesonger").enumerated() {
            let nr: Int = JS.int(s, "nr") ?? (si + 1)
            var eps: [Nrk87Ep] = []
            for (ei, e) in JS.list(s, "episoder").enumerated() {
                let enr: Int = JS.int(e, "nr") ?? (ei + 1)
                var ep: Nrk87Ep = Nrk87Ep(id: "\(nr)-\(ei)", nr: enr, title: JS.str(e, "tittel") ?? "Episode \(enr)")
                ep.dur = duration(e)
                ep.url = JS.str(e, "url") ?? ""
                ep.status = epStatus(e)
                eps.append(ep)
            }
            // To sesonger med samme nummer ville gitt like id-er i lista.
            if seasons.contains(where: { $0.nr == nr }) { continue }
            seasons.append(Nrk87Season(nr: nr, eps: eps))
        }
        it.seasons = seasons
        return it
    }

    /* ---------- Handlinger (alle krever et trykk i appen) ---------- */

    func add(_ store: Store) {
        if busy { return }
        let u: String = Nrk87.link(in: url)
        guard Nrk87.valid(u) else {
            Haptics.shared.error()
            formErr = "Bare lenker fra nrk.no og nrksuper.no."
            return
        }
        if jobs.contains(where: { $0.url == u && $0.active }) {
            formErr = "Lenken ligger allerede i køen."
            return
        }
        var body: [String: Any] = ["url": u, "type": type, "kvalitet": qual, "folg": follow]
        if hasKomp && komp != kompStd { body["komprimer"] = komp }
        let payload: [String: Any] = body
        busy = true
        formErr = ""
        Task { @MainActor in
            defer { self.busy = false }
            do {
                _ = try await self.call(store, "POST", "/jobber", json: payload, timeout: 30)
                Haptics.shared.success()
                self.url = ""
                await self.load(store)
            } catch let e as APIError where e.status == 409 {
                self.formErr = "Lenken ligger allerede i køen."
            } catch let e {
                Haptics.shared.error()
                self.formErr = Nrk87.text(e)
            }
        }
    }

    func setKomp(_ v: Bool) {
        kompTouched = true
        komp = v
    }

    /// avbryt | igjen | fjern
    func act(_ j: Nrk87Job, _ what: String, _ store: Store) {
        guard Nrk87.okId(j.id) else { err = "Ugyldig id fra NRK-nedlasteren."; return }
        Haptics.shared.tap()
        Task { @MainActor in
            do {
                if what == "fjern" {
                    _ = try await self.call(store, "DELETE", "/jobber/" + j.id)
                } else {
                    _ = try await self.call(store, "POST", "/jobber/" + j.id + "/" + (what == "avbryt" ? "avbryt" : "igjen"), json: [:])
                }
                await self.load(store)
            } catch let e {
                self.err = Nrk87.text(e)
            }
        }
    }

    func clean(_ store: Store) {
        Haptics.shared.tap()
        Task { @MainActor in
            do {
                _ = try await self.call(store, "POST", "/rydd", json: [:])
                await self.load(store)
            } catch let e {
                self.err = Nrk87.text(e)
            }
        }
    }

    func check(_ f: Nrk87Follow, _ store: Store) {
        guard Nrk87.okId(f.id), !checking.contains(f.id) else { return }
        Haptics.shared.tap()
        checking.insert(f.id)
        Task { @MainActor in
            do {
                _ = try await self.call(store, "POST", "/folger/" + f.id + "/sjekk", json: [:], timeout: 60)
                await self.load(store)
            } catch let e {
                self.err = Nrk87.text(e)
            }
            self.checking.remove(f.id)
        }
    }

    func unfollow(_ f: Nrk87Follow, _ store: Store) {
        guard Nrk87.okId(f.id) else { return }
        Haptics.shared.tap()
        Task { @MainActor in
            do {
                _ = try await self.call(store, "DELETE", "/folger/" + f.id)
                await self.load(store)
            } catch let e {
                self.err = Nrk87.text(e)
            }
        }
    }

    /* ---------- Bibliotek ---------- */

    func seasonIndex(_ it: Nrk87Item) -> Int {
        if it.seasons.isEmpty { return 0 }
        let i: Int = selSeason[it.id] ?? (it.seasons.count - 1)
        return Swift.min(Swift.max(0, i), it.seasons.count - 1)
    }

    /// Åpner detaljen med det biblioteket vet, og henter hele serien (også episoder som mangler) i bakgrunnen.
    func open(_ it: Nrk87Item, _ store: Store) {
        Haptics.shared.tap()
        sel = it
        guard Nrk87.valid(it.url) else { return }
        // Bare ASCII uten skilletegn står ukodet (hele lenken er én verdi i ?url=).
        let cs: CharacterSet = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        guard let q = it.url.addingPercentEncoding(withAllowedCharacters: cs) else { return }
        Task { @MainActor in
            guard let d = try? await self.call(store, "GET", "/serie?url=" + q, timeout: 40) else { return }
            let o: [String: Any] = JS.obj(d)
            let row: [String: Any] = JS.dict(o, "element") ?? JS.dict(o, "serie") ?? o
            guard var full = Nrk87.item(row), self.sel?.id == it.id else { return }
            full.id = it.id
            if full.image.isEmpty { full.image = it.image }
            if full.meta.isEmpty { full.meta = it.meta }
            if full.desc.isEmpty { full.desc = it.desc }
            if full.total >= it.total { self.sel = full }
        }
    }

    /// Legger episoder (eller hele lenken når `eps` er tom) i køen, og merker dem «I KØ» med en gang.
    /// `whole` = knappen gjelder hele sesongen/serien. Én enkelt episode uten egen lenke blir aldri til «last ned alt».
    func queue(_ it: Nrk87Item, eps: [Nrk87Ep], whole: Bool, _ store: Store) {
        guard Nrk87.valid(it.url) else { libErr = "Mangler NRK-lenken til denne."; return }
        let urls: [String] = Array(eps.map { $0.url }.filter { Nrk87.valid($0) }.prefix(200))
        if !whole && urls.count != eps.count { libErr = "Mangler NRK-lenken til episoden."; return }
        var body: [String: Any] = ["url": it.url, "type": it.type, "kvalitet": qual, "folg": false]
        if !urls.isEmpty { body["episoder"] = urls }
        if hasKomp && komp != kompStd { body["komprimer"] = komp }
        let payload: [String: Any] = body
        Haptics.shared.tap()
        let ids: Set<String> = Set(eps.map { $0.id })
        Task { @MainActor in
            do {
                _ = try await self.call(store, "POST", "/jobber", json: payload, timeout: 30)
                Haptics.shared.success()
                self.libErr = ""
                self.mark(it.id, ids)
                await self.load(store)
            } catch let e as APIError where e.status == 409 {
                self.libErr = "Lenken ligger allerede i køen."
            } catch let e {
                self.libErr = Nrk87.text(e)
            }
        }
    }

    private func mark(_ itemId: String, _ ids: Set<String>) {
        guard var s = sel, s.id == itemId else { return }
        if s.seasons.isEmpty || (s.type == "film" && ids.isEmpty) { s.filmStatus = "ko" }
        for si in s.seasons.indices {
            for ei in s.seasons[si].eps.indices where s.seasons[si].eps[ei].status == "mangler" {
                if ids.contains(s.seasons[si].eps[ei].id) || (s.type == "film" && ids.isEmpty) { s.seasons[si].eps[ei].status = "ko" }
            }
        }
        sel = s
    }

    /* ---------- Tekster ---------- */

    nonisolated static func comma(_ v: Double, _ dec: Int = 1) -> String {
        String(format: "%.\(dec)f", v).replacingOccurrences(of: ".", with: ",")
    }

    nonisolated static func left(_ s: Int) -> String {
        if s <= 0 { return "" }
        if s >= 3600 { return "\(s / 3600) t \((s % 3600) / 60) min igjen" }
        if s >= 60 { return "\(s / 60) min \(s % 60) s igjen" }
        return "\(s) s igjen"
    }

    nonisolated static func savedText(_ b: Double) -> String {
        if b >= 1e9 { return "Spart " + comma(b / 1e9) + " GB med komprimering" }
        return "Spart " + comma(b / 1e6, 0) + " MB med komprimering"
    }

    nonisolated static func ago(_ t: Double, now: Date = Date()) -> String {
        if t <= 0 { return "aldri" }
        let m: Int = Int(((now.timeIntervalSince1970 - t) / 60).rounded())
        if m < 1 { return "nå nettopp" }
        if m < 60 { return "\(m) min siden" }
        let h: Int = Int((Double(m) / 60).rounded())
        if h < 48 { return "\(h) t siden" }
        return "\(h / 24) d siden"
    }

    nonisolated static func followSub(_ f: Nrk87Follow) -> String {
        var parts: [String] = ["Sjekket " + ago(f.checked)]
        if !f.last.isEmpty { parts.append(f.last) }
        parts.append(f.quality == "best" ? "beste" : f.quality + "p")
        return parts.joined(separator: " · ")
    }

    nonisolated static func summary(_ lib: [Nrk87Item]) -> String {
        let tv: Int = lib.filter { $0.type == "tv" }.count
        let film: Int = lib.filter { $0.type == "film" }.count
        let radio: Int = lib.filter { $0.type == "radio" }.count
        var parts: [String] = []
        if tv > 0 { parts.append(tv == 1 ? "1 serie" : "\(tv) serier") }
        if film > 0 { parts.append(film == 1 ? "1 film" : "\(film) filmer") }
        if radio > 0 { parts.append(radio == 1 ? "1 podkast" : "\(radio) podkaster") }
        return parts.joined(separator: " · ")
    }

    nonisolated static func epCode(_ type: String, _ season: Int, _ nr: Int) -> String {
        if type == "radio" { return "#" + String(format: "%02d", nr) }
        return "S" + String(format: "%02d", season % 100) + "E" + String(format: "%02d", nr)
    }

    nonisolated static func epStatusText(_ s: String) -> String {
        switch s {
        case "lastet": return "LASTET NED"
        case "laster": return "LASTER NED"
        case "ko": return "I KØ"
        default: return "MANGLER"
        }
    }

    nonisolated static func jobStatusText(_ s: String) -> String {
        switch s {
        case "kjorer": return "LASTER NED"
        case "ferdig": return "FERDIG"
        case "feil": return "FEIL"
        case "avbrutt": return "AVBRUTT"
        default: return "I KØ"
        }
    }
}
