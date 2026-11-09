import SwiftUI
import UIKit

/* ---------------- Prompt 79 (PICKIOS): plukkliste i Skjold Lab og «Feilsøk LED» ----------------
 Kontrakt: CONTRACT79.md. Brukeren velger flere deler med + (gul diode, ESP32, transistor …) og trykker «💡 Vis alle med LED»:
 hver del lyser i sin egen farge (første farge = skapets farge), og plukklista viser fargeprikken ved hver del.
 Server (PICKSRV, server/skjold76), per bruker, under /api/skjold:
   POST /locate {partIds:[…], colors:true} → {ok, lit:[{partId, cabinetId, row, col, index, color}], skipped:[{partId, reason}], untilMs}
     (maks 20 skuffer; to deler i samme skuff deler LED, første farge vinner)
   GET|PUT /picklist {items:[{partId, qty}]} (valgfri synk mellom enheter; 404 = bare lokalt)
   POST /cabinets/:id/leds/diagnose → {steps:[{name, ok, detail}], hint}
 Lista lagres lokalt per konto (UserDefaults, nøkkel per AcctScope) og overlever omstart. «Ta ut av lager» trekker fra
 antallet for alle delene (POST /parts/:id/qty {delta}) med «Angre» i 10 s. */

/// Én del i plukklista. Navn, bilde og plassering tas vare på så lista kan vises uten nett.
struct Skj79Item: Identifiable, Hashable {
    var partId: String
    var name: String = ""
    var thumbUrl: String = ""
    var place: String = ""
    var cabinetId: String = ""
    var unit: String = "stk"
    var stock: Double = 0
    /// Hvor mange jeg tar.
    var take: Int = 1

    var id: String { partId }
}

/// Ett steg i «Feilsøk LED».
struct Skj79Step: Identifiable, Hashable {
    var id: Int
    var name: String
    var ok: Bool
    var detail: String
}

@MainActor
@Observable
final class Skjold79 {
    static let shared = Skjold79()

    var items: [Skj79Item] = []
    var skipped: [String: String] = [:]
    var taking: Bool = false
    /// Serveren har ikke /picklist (404): bare lokalt.
    @ObservationIgnored private var localOnly: Bool = false
    @ObservationIgnored private var loadedScope: String? = nil
    @ObservationIgnored private var syncTask: Task<Void, Never>? = nil

    nonisolated static let maxLit: Int = 20
    /// Samme palett som serveren (blå = skapets standardfarge, så gul, grønn, rød, lilla, oransje, cyan, rosa …).
    nonisolated static let palette: [String] = ["#2F6BFF", "#FFD000", "#18C964", "#FF3B30", "#B455FF", "#FF8A00", "#00D1FF", "#FF4FA3", "#FFFFFF", "#8BFF3D"]

    private var m: Skjold76 { Skjold76.shared }
    private var l: Skjold78 { Skjold78.shared }

    var count: Int { items.count }
    func has(_ id: String) -> Bool { items.contains { $0.partId == id } }

    /// Fargen delen lyser i nå (tom når den ikke lyser).
    func color(_ id: String) -> String {
        guard let x = l.lit.first(where: { $0.partId == id }) else { return "" }
        return x.color
    }

    var lightable: Int { items.filter { canLight($0) }.count }

    func canLight(_ x: Skj79Item) -> Bool {
        if l.missing || x.cabinetId.isEmpty { return false }
        return l.config(x.cabinetId)?.usable ?? false
    }

    /* ---------- Legg til og fjern ---------- */

    /// + / ✓: legger delen i lista, eller fjerner den.
    func toggle(_ p: Skj76Part, _ store: Store) {
        ensureLoaded()
        if has(p.id) {
            remove(p.id, store)
            Haptics.shared.tick()
            return
        }
        items.append(Skjold79.item(p))
        Haptics.shared.success()
        m.flash("La til «" + p.name + "» i plukklista")
        changed(store)
    }

    func remove(_ id: String, _ store: Store) {
        items.removeAll { $0.partId == id }
        changed(store)
    }

    func clear(_ store: Store) {
        let old: [Skj79Item] = items
        if old.isEmpty { return }
        items = []
        changed(store)
        Haptics.shared.tick()
        m.offerUndo("Tømte plukklista") { [weak self] in
            guard let self else { return }
            Task { @MainActor in self.restore(old, store) }
        }
    }

    private func restore(_ old: [Skj79Item], _ store: Store) {
        items = old
        changed(store)
    }

    func setTake(_ id: String, _ n: Int, _ store: Store) {
        guard let i = items.firstIndex(where: { $0.partId == id }) else { return }
        items[i].take = Swift.max(1, Swift.min(9999, n))
        Haptics.shared.tick()
        changed(store)
    }

    /// Oppdaterer navn, bilde, plassering og lager fra det appen nettopp har hentet.
    func refreshFromParts() {
        for i in items.indices {
            if let p = m.part(items[i].partId) {
                var x: Skj79Item = Skjold79.item(p)
                x.take = items[i].take
                items[i] = x
            }
        }
    }

    /* ---------- Vis alle med LED ---------- */

    func lightAll(_ store: Store) async {
        refreshFromParts()
        let ids: [Any] = items.filter { canLight($0) }.prefix(Skjold79.maxLit).map { Skjold76.idv($0.partId) }
        if ids.isEmpty {
            m.flash("Ingen av delene ligger i et skap med LED")
            return
        }
        let o: [String: Any] = await l.locateMany(ids, colors: true, store)
        var sk: [String: String] = [:]
        for s in JS.list(o, "skipped") {
            let id: String = JS.str(s, "partId") ?? JS.str(s, "id") ?? ""
            if !id.isEmpty { sk[id] = Skjold79.skipText(JS.str(s, "code") ?? "", JS.str(s, "reason") ?? "") }
        }
        skipped = sk
        let over: Int = lightable - ids.count
        if over > 0 { m.flash("Maks \(Skjold79.maxLit) skuffer samtidig – \(over) ble ikke tent") }
    }

    /* ---------- Ta ut av lager ---------- */

    /// Trekker «take» fra antallet for alle delene. Angre legger dem tilbake og henter lista igjen.
    func takeOut(_ store: Store) async {
        let list: [Skj79Item] = items
        if list.isEmpty || taking { return }
        taking = true
        defer { taking = false }
        var done: [Skj79Item] = []
        var failed: Int = 0
        for x in list {
            let ok: Bool = await Skjold79.adjust(x.partId, -Double(x.take), store)
            if ok { done.append(x) } else { failed += 1 }
        }
        if done.isEmpty {
            m.flash(failed > 0 ? Skjold76.netMsg : "Ingenting å ta ut")
            Haptics.shared.warning()
            return
        }
        let doneIds: Set<String> = Set(done.map { $0.partId })
        items.removeAll { doneIds.contains($0.partId) }
        changed(store)
        Haptics.shared.success()
        await reloadParts(done, store)
        let text: String = failed > 0 ? "Tok ut \(done.count) deler (\(failed) feilet)" : "Tok ut \(done.count) deler av lageret"
        m.offerUndo(text) { [weak self] in
            guard let self else { return }
            Task { @MainActor in await self.putBack(done, store) }
        }
    }

    private func putBack(_ done: [Skj79Item], _ store: Store) async {
        for x in done {
            _ = await Skjold79.adjust(x.partId, Double(x.take), store)
            if !has(x.partId) { items.append(x) }
        }
        changed(store)
        await reloadParts(done, store)
        m.flash("Angret – antallet er tilbake")
    }

    private func reloadParts(_ list: [Skj79Item], _ store: Store) async {
        for x in list { await m.loadPart(x.partId, store) }
        await m.search(store)
        refreshFromParts()
    }

    nonisolated static func adjust(_ id: String, _ delta: Double, _ store: Store) async -> Bool {
        do {
            let path: String = Skjold76.root + "/parts/\(id)/qty"
            _ = try await store.api.callAt(Skjold76.prefix, "POST", path, json: ["delta": delta], timeout: 15)
            return true
        } catch {
            return false
        }
    }

    /* ---------- Lagring (lokalt per konto, og /picklist hvis serveren har det) ---------- */

    private var key: String {
        let s: String = AcctScope.current.isEmpty ? "anon" : AcctScope.current
        return "skj79.pick." + s
    }

    /// Leser lista for kontoen som er logget inn (én gang per konto).
    func ensureLoaded() {
        let s: String = AcctScope.current
        if loadedScope == s { return }
        loadedScope = s
        items = []
        guard let raw = UserDefaults.standard.array(forKey: key) as? [[String: Any]] else { return }
        items = raw.map { Skjold79.read($0) }.filter { !$0.partId.isEmpty }
    }

    private func writeLocal() {
        UserDefaults.standard.set(items.map { Skjold79.write($0) }, forKey: key)
    }

    /// Henter lista fra serveren (når Skjold Lab åpnes). Serverens liste vinner hvis den har noe; ellers lastes vår opp.
    func load(_ store: Store) async {
        ensureLoaded()
        if localOnly { return }
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "GET", Skjold76.root + "/picklist", timeout: 10)
            let o: [String: Any] = JS.obj(d)
            let remote: [[String: Any]] = JS.list(o, "items")
            if remote.isEmpty {
                if !items.isEmpty { await push(store) }
            } else {
                merge(remote)
            }
        } catch let e as APIError where e.status == 404 {
            localOnly = true
        } catch {
            // Uten nett: lokal liste.
        }
        refreshFromParts()
    }

    private func merge(_ remote: [[String: Any]]) {
        var out: [Skj79Item] = []
        for r in remote {
            let id: String = JS.str(r, "partId") ?? JS.str(r, "id") ?? ""
            if id.isEmpty { continue }
            var x: Skj79Item = items.first { $0.partId == id } ?? Skjold79.read(r)
            x.take = Swift.max(1, JS.int(r, "qty") ?? x.take)
            if let p = m.part(id) {
                let t: Int = x.take
                x = Skjold79.item(p)
                x.take = t
            }
            out.append(x)
        }
        items = out
        writeLocal()
    }

    private func changed(_ store: Store) {
        writeLocal()
        if localOnly { return }
        syncTask?.cancel()
        syncTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 600_000_000)
            if Task.isCancelled { return }
            await self.push(store)
        }
    }

    private func push(_ store: Store) async {
        let body: [String: Any] = ["items": items.map { Skjold79.remote($0) }]
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "PUT", Skjold76.root + "/picklist", json: body, timeout: 10)
        } catch let e as APIError where e.status == 404 {
            localOnly = true
        } catch {
            // Neste endring prøver igjen; lokalt er lista trygg.
        }
    }

    /* ---------- Rene regler ---------- */

    nonisolated static func item(_ p: Skj76Part) -> Skj79Item {
        var x: Skj79Item = Skj79Item(partId: p.id)
        x.name = p.name
        x.thumbUrl = p.thumbUrl
        x.place = p.loc.map { $0.cabinet + " · " + $0.short } ?? "Uten plass"
        x.cabinetId = p.loc?.cabinetId ?? ""
        x.unit = p.unit
        x.stock = p.qty
        return x
    }

    nonisolated static func write(_ x: Skj79Item) -> [String: Any] {
        ["partId": x.partId, "name": x.name, "thumbUrl": x.thumbUrl, "place": x.place, "cabinetId": x.cabinetId,
         "unit": x.unit, "stock": x.stock, "qty": x.take]
    }

    nonisolated static func remote(_ x: Skj79Item) -> [String: Any] {
        ["partId": Skjold76.idv(x.partId), "qty": x.take]
    }

    nonisolated static func read(_ o: [String: Any]) -> Skj79Item {
        var x: Skj79Item = Skj79Item(partId: JS.str(o, "partId") ?? JS.str(o, "id") ?? "")
        x.name = JS.str(o, "name") ?? ""
        x.thumbUrl = JS.str(o, "thumbUrl") ?? ""
        x.place = JS.str(o, "place") ?? ""
        x.cabinetId = JS.str(o, "cabinetId") ?? ""
        x.unit = JS.str(o, "unit") ?? "stk"
        x.stock = JS.num(o, "stock") ?? 0
        x.take = Swift.max(1, JS.int(o, "qty") ?? 1)
        return x
    }

    /// Kode først (max, out_of_range …), ellers serverens egen tekst.
    nonisolated static func skipText(_ code: String, _ text: String) -> String {
        let known: String = Skjold79.reason(code)
        if !code.isEmpty && known != code { return known }
        return Skjold79.reason(text.isEmpty ? code : text)
    }

    /// Grunnen til at en del ikke ble tent, på norsk.
    nonisolated static func reason(_ r: String) -> String {
        switch r {
        case "no-location", "noLocation", "unplaced": return "har ingen plass"
        case "no-leds", "disabled", "leds-off": return "skapet har ikke LED"
        case "limit", "max", "too-many": return "over grensen på 20 skuffer"
        case "out_of_range", "out-of-range": return "LED-en ligger utenfor stripa i WLED"
        case "not-found", "missing": return "fins ikke"
        case "": return "ble ikke tent"
        default: return r
        }
    }

    /* ---------- Feilsøk LED ---------- */

    nonisolated static func steps(_ o: [String: Any]) -> [Skj79Step] {
        var out: [Skj79Step] = []
        for (i, s) in JS.list(o, "steps").enumerated() {
            out.append(Skj79Step(id: i, name: JS.str(s, "name") ?? "Steg \(i + 1)", ok: JS.bool(s, "ok") ?? false, detail: JS.str(s, "detail") ?? ""))
        }
        return out
    }

    /// Serverens tekst for utfallet (hints: none, red, blue, both), ellers vår egen.
    nonisolated static func hint(red: Bool, blue: Bool, server: [String: String]) -> String {
        let k: String = red ? (blue ? "both" : "red") : (blue ? "blue" : "none")
        if let s = server[k], !s.isEmpty { return s }
        return hint(red: red, blue: blue)
    }

    /// Hintet ut fra svarene på «Lyste stripa rødt?» og «Lyste én LED blått?» (samme regel som serveren).
    nonisolated static func hint(red: Bool, blue: Bool) -> String {
        if !red && !blue {
            return "Ingen av testene lyste: feilen er i maskinvaren eller oppsettet i WLED. Sjekk GPIO-pinnen, LED-typen (WS2812B, GRB), antall LED-er, felles jord mellom ESP32 og strømforsyningen, nivåskifter på datalinja, strømmen og «LED Preferences» i WLED."
        }
        if red && !blue {
            return "Stripa lyser med vanlig farge, men ikke når appen styrer enkelt-LED-er. Det er en feil hos oss – send gjerne en rapport med stegene over."
        }
        if !red && blue {
            return "Bare én LED lyste. Sjekk at segmentet i WLED dekker hele stripa og at antall LED-er stemmer."
        }
        return "Begge testene lyste, så WLED virker. Lyser feil skuff, kjør kalibreringen («Trykk på skuffen som lyser») eller sjekk start, antall og retning per rad."
    }
}
