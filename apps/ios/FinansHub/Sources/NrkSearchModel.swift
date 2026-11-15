import SwiftUI
import UIKit

/* ---------------- Prompt 88: Media → NRK – søk og serieside (modell) ----------------
 Fasit: prompt-55-pakke (pakke 58) claude-code-media-nrk-musikk.md og design/Media NRK.dc.html; web: public/js/media-nrk.js.
 Alt går via Homelab-serveren (server/nrkdl.js) gjennom Nrk87 sitt call(…) → Media46 – ingen adresse eller token i appen.
   GET  /media/nrk/sok?q=…                  → {configured, tilgjengelig, treff:[{art, id, tittel, beskrivelse, bilde, url, tilgjengelig}]}
   GET  /media/nrk/serie/:sid               → {configured, tilgjengelig, id, tittel, beskrivelse, kategori, bilde, plakat, url,
                                               sesonger:[{navn, tittel, tilgjengelig}], folger}
   GET  /media/nrk/serie/:sid/sesong/:navn  → {configured, tilgjengelig, episoder:[{id, tittel, undertittel, dato, varighet,
                                               varighetTekst, bilde, kan, label, lastetNed, iKo, url}]}
   POST /media/nrk/jobber  {url, type, kvalitet, folg:false, komprimer?, tittel?, episoder?:[https://tv.nrk.no/program/PRF]}
   POST /media/nrk/folger  {url, type:"tv", kvalitet, tittel, komprimer?} · DELETE /media/nrk/folger/:id
 Regelen fra prompt 86: ingenting legges i køen uten at brukeren trykker («Last ned», «Last ned N episoder», «Følg serien»).
 Søket er bare lesing (det kjører mens du skriver, med 350 ms pause). */

struct Nrk88Hit: Identifiable, Hashable {
    var id: String
    /// serie | film | episode | radio
    var art: String
    var title: String
    var desc: String = ""
    var image: String = ""
    var url: String = ""
    var available: Bool = true
}

struct Nrk88SeasonRef: Identifiable, Hashable {
    var name: String
    var title: String = ""
    var available: Bool = true
    var id: String { name }
}

struct Nrk88Series: Hashable {
    var sid: String
    var title: String
    var desc: String = ""
    var kat: String = ""
    var image: String = ""
    var url: String = ""
    var seasons: [Nrk88SeasonRef] = []
}

struct Nrk88Ep: Identifiable, Hashable {
    /// PRF-id (f.eks. MSUI12345678).
    var id: String
    var title: String
    var date: String = ""
    var dur: String = ""
    var image: String = ""
    var can: Bool = false
    var label: String = ""
    var done: Bool = false
    var queued: Bool = false
    var url: String = ""
}

@MainActor
@Observable
final class Nrk88 {
    static let shared = Nrk88()

    static let gammel: String = "Biblioteket krever en nyere versjon av nrk-dl."
    static let help: String = "Følg serien laster ned nye episoder fremover (de to nyeste sesongene), ikke hele arkivet."

    /* ---------- Søk ---------- */

    var q: String = ""
    /// Søket som sist ble sendt (treffene gjelder det).
    var sokQ: String = ""
    var hits: [Nrk88Hit] = []
    var searching: Bool = false
    var searchErr: String = ""
    /// nrk-dl uten katalog (tilgjengelig:false): søket er av, lenkefeltet står åpent.
    var searchOff: Bool = false
    /// «Har du en lenke?» er åpen.
    var linkOpen: Bool = false
    var hitErr: String = ""
    var hitBusy: String = ""

    /* ---------- Seriesiden ---------- */

    /// Serie-id som vises, eller nil (da vises søket).
    var ser: String? = nil
    /// sok = seriesiden står i NRK-kortet · lib = i Bibliotek-kortet (åpnet derfra, tilbake til Bibliotek).
    var from: String = "sok"
    var serTitle: String = ""
    var series: [String: Nrk88Series] = [:]
    var serErr: [String: String] = [:]
    var seasonSel: [String: String] = [:]
    /// Episodene per «sid/navn».
    var eps: [String: [Nrk88Ep]] = [:]
    var epsErr: [String: String] = [:]
    var pick: Set<String> = []
    var serr: String = ""
    var busy: Bool = false
    var fbusy: Bool = false
    /// Lenker som nettopp er lagt i køen (vises som «I kø» til serveren har dem).
    var opt: Set<String> = []

    @ObservationIgnored private var searchTask: Task<Void, Never>? = nil
    @ObservationIgnored private var searchNr: Int = 0

    private var nrk: Nrk87 { Nrk87.shared }

    /* ---------- Validering ---------- */

    nonisolated static func okSid(_ s: String) -> Bool {
        s.range(of: "^[a-z0-9][a-z0-9_-]{0,100}$", options: .regularExpression) != nil
    }

    nonisolated static func okSeason(_ s: String) -> Bool {
        s.range(of: "^[A-Za-z0-9_-]{1,60}$", options: .regularExpression) != nil
    }

    nonisolated static func okPrf(_ s: String) -> Bool {
        s.range(of: "^[A-Za-z]{4}[0-9]{8}$", options: .regularExpression) != nil
    }

    /// Bilder bare via serverens bildeproxy (sti på Homelab) – aldri rett mot NRK fra appen.
    nonisolated static func img(_ v: String?) -> String {
        let s: String = v ?? ""
        return s.hasPrefix("/api/media/nrk/bilde?") ? s : ""
    }

    /// Serie-id fra en tv.nrk.no/serie/<sid>-lenke, ellers nil.
    nonisolated static func sid(_ url: String) -> String? {
        guard Nrk87.valid(url), let u = URL(string: url), (u.host ?? "").lowercased() == "tv.nrk.no" else { return nil }
        let parts: [String] = u.path.components(separatedBy: "/").filter { !$0.isEmpty }
        guard parts.count >= 2, parts[0] == "serie" else { return nil }
        let s: String = parts[1].lowercased()
        return okSid(s) ? s : nil
    }

    nonisolated static func enc(_ s: String) -> String {
        let cs: CharacterSet = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        return s.addingPercentEncoding(withAllowedCharacters: cs) ?? ""
    }

    private func call(_ store: Store, _ method: String, _ path: String, json: [String: Any]? = nil, timeout: TimeInterval = 20) async throws -> Data {
        try await Media46.shared.call(store, method, "/media/nrk" + path, json: json, timeout: timeout)
    }

    /// Ny konto: ingenting fra forrige konto (kalles fra Nrk87.checkScope).
    func reset() {
        searchTask?.cancel()
        searchNr += 1
        q = ""
        sokQ = ""
        hits = []
        searching = false
        searchErr = ""
        searchOff = false
        linkOpen = false
        hitErr = ""
        ser = nil
        series = [:]
        serErr = [:]
        seasonSel = [:]
        eps = [:]
        epsErr = [:]
        pick = []
        serr = ""
        opt = []
    }

    /// Lenke utenfra / «Lim inn»: lenkefeltet åpnes (bare utfylling, ingen nedlasting).
    func showLink() {
        linkOpen = true
        if from == "sok" { ser = nil }
    }

    /* ---------- Søk ---------- */

    /// Kalles når teksten endres: søker etter 350 ms uten nye tastetrykk.
    func typed(_ v: String, _ store: Store) {
        q = v
        if ser != nil && from == "sok" { ser = nil }
        searchTask?.cancel()
        searchTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 350_000_000)
            if Task.isCancelled { return }
            await self.search(store)
        }
    }

    func clear() {
        Haptics.shared.tap()
        searchTask?.cancel()
        searchNr += 1
        q = ""
        sokQ = ""
        hits = []
        searching = false
        searchErr = ""
        hitErr = ""
    }

    func search(_ store: Store) async {
        let text: String = String(q.trimmingCharacters(in: .whitespacesAndNewlines).prefix(100))
        searchNr += 1
        let nr: Int = searchNr
        if text.count < 2 {
            sokQ = ""
            hits = []
            searchErr = ""
            searching = false
            return
        }
        searching = true
        searchErr = ""
        hitErr = ""
        if text != sokQ { sokQ = text; hits = [] }
        do {
            let d: Data = try await call(store, "GET", "/sok?q=" + Nrk88.enc(text), timeout: 20)
            if nr != searchNr { return }
            let o: [String: Any] = JS.obj(d)
            if JS.bool(o, "tilgjengelig") == false {
                searchOff = true
                linkOpen = true
                hits = []
            } else {
                hits = Nrk88.hits(JS.list(o, "treff"))
            }
        } catch let e {
            if nr != searchNr { return }
            searchErr = Nrk87.text(e)
            hits = []
        }
        searching = false
    }

    nonisolated static func hits(_ rows: [[String: Any]]) -> [Nrk88Hit] {
        var out: [Nrk88Hit] = []
        var seen: Set<String> = []
        for r in rows.prefix(100) {
            let art: String = JS.str(r, "art") ?? ""
            guard ["serie", "film", "episode", "radio"].contains(art) else { continue }
            guard let title = JS.str(r, "tittel"), let url = JS.str(r, "url"), Nrk87.valid(url) else { continue }
            let key: String = art + "|" + url
            if seen.contains(key) { continue }
            seen.insert(key)
            var h: Nrk88Hit = Nrk88Hit(id: key, art: art, title: title)
            h.desc = JS.str(r, "beskrivelse") ?? ""
            h.image = img(JS.str(r, "bilde"))
            h.url = url
            h.available = JS.bool(r, "tilgjengelig") ?? true
            out.append(h)
        }
        return out
    }

    /// Ligger i køen nå (aktiv jobb med lenken, eller nettopp lagt til fra appen).
    func queued(_ url: String) -> Bool {
        if url.isEmpty { return false }
        if opt.contains(url) { return true }
        return nrk.jobs.contains { $0.active && ($0.url == url || $0.urls.contains(url)) }
    }

    /// Film, episode eller radio fra søket → køen. Bare fra knappen «Last ned» (krever trykk).
    func download(_ h: Nrk88Hit, _ store: Store) {
        guard h.art != "serie", h.available, Nrk87.valid(h.url), hitBusy.isEmpty, !queued(h.url) else { return }
        let type: String = h.art == "film" ? "film" : (h.art == "radio" ? "radio" : "auto")
        var body: [String: Any] = ["url": h.url, "type": type, "kvalitet": nrk.qual, "folg": false]
        if nrk.hasKomp && nrk.komp != nrk.kompStd { body["komprimer"] = nrk.komp }
        let payload: [String: Any] = body
        Haptics.shared.tap()
        hitBusy = h.id
        hitErr = ""
        Task { @MainActor in
            do {
                _ = try await self.call(store, "POST", "/jobber", json: payload, timeout: 30)
                Haptics.shared.success()
                self.opt.insert(h.url)
                await self.nrk.load(store)
            } catch let e as APIError where e.status == 409 {
                self.hitErr = "Lenken ligger allerede i køen."
            } catch let e {
                Haptics.shared.error()
                self.hitErr = Nrk87.text(e)
            }
            self.hitBusy = ""
        }
    }

    /* ---------- Seriesiden ---------- */

    /// Åpner seriesiden (fra et søketreff eller fra Bibliotek). Henter serien og den valgte sesongen.
    func open(_ sid: String, title: String, from where_: String, _ store: Store) {
        guard Nrk88.okSid(sid) else { return }
        Haptics.shared.tap()
        ser = sid
        from = where_
        serTitle = title
        pick = []
        serr = ""
        if series[sid] == nil || serErr[sid] != nil {
            Task { await self.loadSeries(sid, store) }
        } else if let x = series[sid], let z = season(x), eps[sid + "/" + z.name] == nil {
            Task { await self.loadSeason(sid, z.name, store) }
        }
    }

    func close() {
        Haptics.shared.tap()
        ser = nil
        serr = ""
        pick = []
    }

    func loadSeries(_ sid: String, _ store: Store) async {
        guard Nrk88.okSid(sid) else { return }
        series[sid] = nil
        serErr[sid] = nil
        do {
            let d: Data = try await call(store, "GET", "/serie/" + sid, timeout: 40)
            let o: [String: Any] = JS.obj(d)
            if JS.bool(o, "tilgjengelig") == false || JS.bool(o, "configured") == false {
                serErr[sid] = Nrk88.gammel
                return
            }
            series[sid] = Nrk88.series(o, sid)
        } catch let e {
            serErr[sid] = Nrk87.text(e)
            return
        }
        if let x = series[sid], let z = season(x), eps[sid + "/" + z.name] == nil {
            await loadSeason(sid, z.name, store)
        }
    }

    nonisolated static func series(_ o: [String: Any], _ sid: String) -> Nrk88Series {
        var x: Nrk88Series = Nrk88Series(sid: sid, title: JS.str(o, "tittel") ?? sid)
        x.desc = JS.str(o, "beskrivelse") ?? ""
        x.kat = JS.str(o, "kategori") ?? ""
        let b: String = img(JS.str(o, "bilde"))
        x.image = b.isEmpty ? img(JS.str(o, "plakat")) : b
        let u: String = JS.str(o, "url") ?? ""
        x.url = Nrk87.valid(u) ? u : "https://tv.nrk.no/serie/" + sid
        var seen: Set<String> = []
        for r in JS.list(o, "sesonger").prefix(200) {
            let name: String = JS.str(r, "navn") ?? ""
            guard okSeason(name), !seen.contains(name) else { continue }
            seen.insert(name)
            x.seasons.append(Nrk88SeasonRef(name: name, title: JS.str(r, "tittel") ?? "", available: JS.bool(r, "tilgjengelig") ?? true))
        }
        return x
    }

    /// Valgt sesong: den brukeren trykket på, ellers den nyeste som har episoder.
    func season(_ x: Nrk88Series) -> Nrk88SeasonRef? {
        if let n = seasonSel[x.sid], let z = x.seasons.first(where: { $0.name == n && $0.available }) { return z }
        return x.seasons.last(where: { $0.available })
    }

    nonisolated static func seasonName(_ z: Nrk88SeasonRef) -> String {
        if z.name.range(of: "^[0-9]{4}$", options: .regularExpression) != nil { return z.name }
        return z.title.isEmpty ? "Sesong " + z.name : z.title
    }

    func choose(_ z: Nrk88SeasonRef, _ store: Store) {
        guard let sid = ser, z.available else { return }
        Haptics.shared.select()
        seasonSel[sid] = z.name
        pick = []
        serr = ""
        if (eps[sid + "/" + z.name] ?? []).isEmpty {
            Task { await self.loadSeason(sid, z.name, store) }
        }
    }

    func loadSeason(_ sid: String, _ name: String, _ store: Store, quiet: Bool = false) async {
        guard Nrk88.okSid(sid), Nrk88.okSeason(name) else { return }
        let k: String = sid + "/" + name
        if !quiet { eps[k] = nil }
        epsErr[k] = nil
        do {
            let d: Data = try await call(store, "GET", "/serie/" + sid + "/sesong/" + name, timeout: 40)
            let o: [String: Any] = JS.obj(d)
            if JS.bool(o, "tilgjengelig") == false {
                epsErr[k] = Nrk88.gammel
                eps[k] = []
                return
            }
            eps[k] = Nrk88.episodes(JS.list(o, "episoder"))
        } catch let e {
            if quiet && eps[k] != nil { return }
            epsErr[k] = Nrk87.text(e)
            eps[k] = []
        }
    }

    nonisolated static func episodes(_ rows: [[String: Any]]) -> [Nrk88Ep] {
        var out: [Nrk88Ep] = []
        var seen: Set<String> = []
        for r in rows.prefix(2000) {
            let id: String = (JS.str(r, "id") ?? "").uppercased()
            guard okPrf(id), !seen.contains(id) else { continue }
            seen.insert(id)
            var e: Nrk88Ep = Nrk88Ep(id: id, title: JS.str(r, "tittel") ?? id)
            e.date = date(JS.str(r, "dato") ?? "")
            e.dur = Nrk87.duration(r)
            e.image = img(JS.str(r, "bilde"))
            e.can = JS.bool(r, "kan") ?? false
            e.label = JS.str(r, "label") ?? ""
            e.done = JS.bool(r, "lastetNed") ?? false
            e.queued = JS.bool(r, "iKo") ?? false
            // Alltid en episodelenke vi har bygd selv fra PRF-id-en (serveren gjør det samme).
            e.url = "https://tv.nrk.no/program/" + id
            out.append(e)
        }
        return out
    }

    /// «2026-01-05» (eller full ISO-tid) → «5. jan. 2026»; annen tekst vises som den er.
    nonisolated static func date(_ v: String) -> String {
        let mnd: [String] = ["jan.", "feb.", "mars", "apr.", "mai", "juni", "juli", "aug.", "sep.", "okt.", "nov.", "des."]
        guard v.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}", options: .regularExpression) != nil else { return v }
        let y: String = String(v.prefix(4))
        let m: Int = Int(v.dropFirst(5).prefix(2)) ?? 0
        let d: Int = Int(v.dropFirst(8).prefix(2)) ?? 0
        guard m >= 1, m <= 12 else { return v }
        return "\(d). " + mnd[m - 1] + " " + y
    }

    func isQueued(_ e: Nrk88Ep) -> Bool { e.queued || queued(e.url) }

    func canPick(_ e: Nrk88Ep) -> Bool { e.can && !e.done && !isQueued(e) }

    func toggle(_ e: Nrk88Ep) {
        guard canPick(e) else { return }
        Haptics.shared.select()
        if pick.contains(e.id) { pick.remove(e.id) } else { pick.insert(e.id) }
    }

    func pickAll(_ list: [Nrk88Ep]) {
        let ok: [Nrk88Ep] = list.filter { canPick($0) }
        if ok.isEmpty { return }
        Haptics.shared.select()
        let all: Bool = ok.allSatisfy { pick.contains($0.id) }
        for e in ok {
            if all { pick.remove(e.id) } else { pick.insert(e.id) }
        }
    }

    /// Følg-objektet til serien (lenke tv.nrk.no/serie/<sid>), om du følger den.
    func follow(_ sid: String) -> Nrk87Follow? {
        nrk.follows.first { Nrk88.sid($0.url) == sid }
    }

    /// «Last ned N episoder»: én jobb i nrk-dl med de valgte episodelenkene.
    func downloadPicked(_ store: Store) {
        guard let sid = ser, let x = series[sid], let z = season(x), !busy else { return }
        let list: [Nrk88Ep] = eps[sid + "/" + z.name] ?? []
        let chosen: [Nrk88Ep] = Array(list.filter { canPick($0) && pick.contains($0.id) }.prefix(200))
        if chosen.isEmpty || !Nrk87.valid(x.url) { return }
        let urls: [String] = chosen.map { $0.url }
        let label: String = z.name.range(of: "^[0-9]{4}$", options: .regularExpression) != nil ? z.name : Nrk88.seasonName(z).lowercased()
        var body: [String: Any] = ["url": x.url, "type": "tv", "kvalitet": nrk.qual, "folg": false, "tittel": x.title + " · " + label, "episoder": urls]
        if nrk.hasKomp && nrk.komp != nrk.kompStd { body["komprimer"] = nrk.komp }
        let payload: [String: Any] = body
        Haptics.shared.tap()
        busy = true
        serr = ""
        Task { @MainActor in
            do {
                _ = try await self.call(store, "POST", "/jobber", json: payload, timeout: 30)
                Haptics.shared.success()
                for u in urls { self.opt.insert(u) }
                for e in chosen { self.pick.remove(e.id) }
            } catch let e as APIError where e.status == 409 && !e.message.contains("nrk-dl") {
                self.serr = "Lenken ligger allerede i køen."
            } catch let e {
                Haptics.shared.error()
                self.serr = Nrk87.text(e)
            }
            self.busy = false
            await self.nrk.load(store)
            await self.loadSeason(sid, z.name, store, quiet: true)
        }
    }

    /// «Følg serien» / «✓ Følger serien» (trykk igjen = slutt å følge).
    func toggleFollow(_ store: Store) {
        guard let sid = ser, let x = series[sid], !fbusy, Nrk87.valid(x.url) else { return }
        let f: Nrk87Follow? = follow(sid)
        if let f, !Nrk87.okId(f.id) { return }
        var body: [String: Any] = ["url": x.url, "type": "tv", "kvalitet": nrk.qual, "tittel": x.title]
        if nrk.hasKomp && nrk.komp != nrk.kompStd { body["komprimer"] = nrk.komp }
        let payload: [String: Any] = body
        Haptics.shared.tap()
        fbusy = true
        serr = ""
        Task { @MainActor in
            do {
                if let f {
                    _ = try await self.call(store, "DELETE", "/folger/" + f.id)
                } else {
                    _ = try await self.call(store, "POST", "/folger", json: payload, timeout: 30)
                    Haptics.shared.success()
                }
            } catch let e {
                Haptics.shared.error()
                self.serr = Nrk87.text(e)
            }
            await self.nrk.load(store)
            self.fbusy = false
        }
    }

    /// En jobb ble ferdig mens seriesiden er åpen: hent sesongen på nytt i det stille (lastetNed/iKo).
    func refreshQuiet(_ store: Store) async {
        guard let sid = ser, let x = series[sid], let z = season(x) else { return }
        await loadSeason(sid, z.name, store, quiet: true)
    }
}
