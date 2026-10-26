import SwiftUI

/* ---------------- Prompt 67 (IOSSET67): Innstillinger → Glimt som på web (prompt 49 del 1, 2, 3, 5 og 7) ----------------
 Data og kall for sidene under Innstillinger → Glimt. Alt går til Homelab-serveren med den vanlige API-klienten
 (store.api.callAt("/api", …)), med samme innlogging som resten av appen. Formene står i SERVER60–64-API.md:
 – Glimt lærer: /api/glimt/recipes (liste, statistikk, innstillinger, PATCH pause/aktiver, DELETE, test).
 – Faste oppgaver: /api/glimt/schedules (liste, «Lag fra tekst» = /parse og så POST, pause/fortsett, slett, kjøringer, «Kjør nå»).
   Systemoppgavene (system: true) kan bare settes på pause.
 – Entitetsregister: /api/glimt/entities (liste, legg til, rediger, slett, «Hva betyr …?»).
 – Glimt husker: /api/glimt/memory/pending · /conflicts · /stale · /hygiene (forslag, motstrid, ikke brukt på lenge).
 – Kvalitet: /api/glimt/quality/weekly (per bruker) og /runs, /run-now, /abort (bare admin).
 Eldre server (404): sidene sier «Oppdater serveren». */

/// Rutene under Innstillinger → Glimt (store.paperGo("innst-glimt") og "innst-glimt:<side>").
enum G67Nav {
    static let husker: String = "innst-glimt:husker"
    static let ent: String = "innst-glimt:ent"
    static let laerer: String = "innst-glimt:laerer"
    static let faste: String = "innst-glimt:faste"
    static let kvalitet: String = "innst-glimt:kvalitet"

    /// Tittel og undertittel for toppbildet (PaperSettingsSub.title26).
    static func title(_ key: String) -> (String, String)? {
        switch key {
        case "glimt": return ("Glimt", "Figur, brief, stemme · minne, lærer og faste oppgaver")
        case "glimt:husker": return ("Glimt husker", "Det du har lært Glimt, forslag og motstrid")
        case "glimt:ent": return ("Entitetsregister", "Personer, steder, butikker og abonnementer med aliaser")
        case "glimt:laerer": return ("Glimt lærer", "Oppskrifter fra vellykkede kjøringer og rettelser")
        case "glimt:faste": return ("Faste oppgaver", "Planlagte oppgaver og varsler du har bedt Glimt om")
        case "glimt:kvalitet": return ("Kvalitet", "Ukerapport og nattlige eval-kjøringer")
        case "finans67": return ("Finans", "AI, kategorier, regler, bank, aksjer og abonnementer")
        default: return nil
        }
    }

    /// Push-lenkene fra serveren (/#/innstillinger/faste-oppgaver, glimt-husker, kvalitet/run/q…, kvalitet/uke/2026-W44).
    static func page(_ url: String) -> String? {
        let u: String = url.lowercased()
        if u.contains("faste-oppgaver") { return "innst-glimt:faste" }
        if u.contains("glimt-husker") { return "innst-glimt:husker" }
        if u.contains("kvalitet") {
            let parts: [String] = url.components(separatedBy: "/")
            if let i = parts.firstIndex(where: { $0.lowercased() == "run" }), i + 1 < parts.count { return "q67run:" + parts[i + 1] }
            if let i = parts.firstIndex(where: { $0.lowercased() == "uke" }), i + 1 < parts.count { return "q67uke:" + parts[i + 1] }
            return "innst-glimt:kvalitet"
        }
        return nil
    }

    /// Åpner en side fra push-lenken (q67run:/q67uke: åpner Kvalitet på riktig kjøring/uke).
    @MainActor static func open(_ go: String, _ store: Store) {
        if go.hasPrefix("q67run:") {
            G67Quality.shared.openRun = String(go.dropFirst(7))
            store.paperGo(kvalitet)
            return
        }
        if go.hasPrefix("q67uke:") {
            G67Quality.shared.week = String(go.dropFirst(7))
            store.paperGo(kvalitet)
            return
        }
        store.paperGo(go)
    }
}

/* ---------- Felles hjelpere ---------- */

enum G67Fmt {
    static let tz: TimeZone = TimeZone(identifier: "Europe/Oslo") ?? .current

    /// «3. nov» (samme år) / «3. nov 2025».
    static func dayText(_ d: Date) -> String {
        var cal: Calendar = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = tz
        f.dateFormat = "MMM"
        let m: String = f.string(from: d).replacingOccurrences(of: ".", with: "")
        let y: Int = cal.component(.year, from: d)
        let s: String = "\(cal.component(.day, from: d)). " + m
        return y == cal.component(.year, from: Date()) ? s : s + " \(y)"
    }

    /// «i dag 07:00» · «i morgen 07:00» · «i går 21:10» · «3. nov 07:00». '' for ugyldig.
    static func when(_ v: Any?) -> String {
        guard let d = JS.date(v) else { return "" }
        var cal: Calendar = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = tz
        f.dateFormat = "HH:mm"
        let t: String = f.string(from: d)
        if cal.isDateInToday(d) { return "i dag " + t }
        if cal.isDateInTomorrow(d) { return "i morgen " + t }
        if cal.isDateInYesterday(d) { return "i går " + t }
        return dayText(d) + " " + t
    }

    /// «18. jun» / «18. jun 2025». Tar også «2027-02-28» (lokal dato).
    static func day(_ v: Any?) -> String {
        guard let d = JS.date(v) else { return "" }
        return dayText(d)
    }

    static func pct(_ x: Double?) -> String {
        guard let x else { return "–" }
        return "\(Int((x * 100).rounded())) %"
    }

    static func secs(_ ms: Double?) -> String {
        guard let ms else { return "–" }
        return String(format: "%.1f s", ms / 1000).replacingOccurrences(of: ".", with: ",")
    }

    static func sim(_ x: Double?) -> String {
        guard let x else { return "–" }
        return String(format: "%.2f", x).replacingOccurrences(of: ".", with: ",")
    }

    /// Aliaser skrevet med komma → liste (uten tomme og doble).
    static func aliases(_ s: String) -> [String] {
        var out: [String] = []
        for part in s.split(separator: ",") {
            let a: String = part.trimmingCharacters(in: .whitespacesAndNewlines)
            if !a.isEmpty && !out.contains(where: { $0.lowercased() == a.lowercased() }) { out.append(a) }
        }
        return out
    }
}

@MainActor
enum G67Api {
    static func get(_ store: Store, _ path: String, timeout: TimeInterval = 15) async throws -> [String: Any] {
        JS.obj(try await store.api.callAt("/api", "GET", path, timeout: timeout))
    }

    @discardableResult
    static func send(_ store: Store, _ method: String, _ path: String, _ body: [String: Any]? = nil, timeout: TimeInterval = 20) async throws -> [String: Any] {
        JS.obj(try await store.api.callAt("/api", method, path, json: body ?? (method == "DELETE" ? nil : [:]), timeout: timeout))
    }

    static func message(_ e: Error) -> String {
        if let a = e as? APIError {
            if a.status == 403 { return a.message.hasPrefix("Feil") ? "Bare administrator kan endre dette for alle" : a.message }
            return a.message
        }
        return e.localizedDescription
    }

    static func missing(_ e: Error) -> Bool {
        guard let a = e as? APIError else { return false }
        return a.status == 404 || a.status == 405
    }

    static func esc(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#"))) ?? s
    }
}

/* ---------- Brytere med «for meg» og «for alle (admin)» ---------- */

struct G67FlagDef {
    let key: String
    let label: String
    let help: String
}

/// Innstillingene i del 1, 2, 3, 5 og 7 har samme form: {settings, server, user, admin, labels, help}.
/// Effektiv verdi = server OG bruker. PUT {scope:'user'|'server', nøkkel: bool}.
@MainActor
@Observable
final class G67Flags {
    let path: String
    let defs: [G67FlagDef]
    let userKeys: [String]
    let serverKeys: [String]
    var data: [String: Any]? = nil
    var missing: Bool = false
    var msg: String = ""
    var busy: Bool = false

    init(_ path: String, _ defs: [G67FlagDef], user: [String]? = nil, server: [String]? = nil) {
        self.path = path
        self.defs = defs
        self.userKeys = user ?? defs.map(\.key)
        self.serverKeys = server ?? defs.map(\.key)
    }

    static let recipes: G67Flags = G67Flags("/glimt/recipes/settings", [
        G67FlagDef(key: "save", label: "Lagre oppskrifter", help: "Når Glimt løser noe riktig, lagres hvordan (planen med variabler som {person} og {when}). Bare lokalt i databasen."),
        G67FlagDef(key: "fewshot", label: "Bruk som eksempler", help: "Lignende oppskrifter (maks 3) gis til planleggeren som eksempler før de faste."),
        G67FlagDef(key: "fast", label: "Hurtigvei", help: "Svært like forespørsler (likhet ≥ 0,92, aktiv oppskrift med minst 5 vellykkede bruk og ingen feil de siste 10) hopper over planleggeren. Aldri for handlinger som endrer data uten at det er slått på for oppskriften."),
        G67FlagDef(key: "learn", label: "Lær av rettelser", help: "«Nei, jeg mente …» lagrer feil og riktig plan, lager en ny oppskrift og et testtilfelle for eval."),
    ])

    static let schedules: G67Flags = G67Flags("/glimt/schedules/settings", [
        G67FlagDef(key: "enabled", label: "Planlagte oppgaver", help: "Glimt kjører faste oppgaver du har bedt om («Send meg strømprisene hver morgen kl. 7») og sender resultatet som push i appen. Av: ingenting kjøres, men oppgavene står."),
        G67FlagDef(key: "conditions", label: "Betingede varsler", help: "Varsler med betingelse («si fra hvis strømprisen går over 2 kr») sjekkes i koden mot ekte data – modellen vurderer aldri betingelsen."),
        G67FlagDef(key: "quiet", label: "Stille timer 23–07", help: "Oppgaver uten eget klokkeslett flyttes til 07:00 i stedet for å kjøre mellom 23 og 07. Ba du om et klokkeslett, gjelder det."),
    ])

    static let hygiene: G67Flags = G67Flags("/glimt/memory/hygiene", [
        G67FlagDef(key: "nightly", label: "Nattlig oppsummering", help: "Kl. 03 hver natt går Glimt gjennom dagens samtaler, rettelser og nye kalenderhendelser og foreslår nye fakta. Ingenting lagres før du godkjenner. Kjøres bare med lokal modell."),
        G67FlagDef(key: "conflicts", label: "Motstrid-sjekk", help: "Glimt sier fra når to ting motsier hverandre («Nina er frisør» og «Nina er tannlege») og spør hvilken som stemmer."),
        G67FlagDef(key: "stale", label: "Marker ubrukte fakta", help: "Fakta som ikke er brukt på lenge får et merke. De slettes aldri automatisk – bare når du trykker Slett."),
    ])

    static let quality: G67Flags = G67Flags("/glimt/quality/settings", [
        G67FlagDef(key: "nightly", label: "Nattlig eval", help: "Kl. 02 hver natt kjøres eval-testene mot den lokale modellen. Du får push bare når noe som var grønt har blitt rødt. Avbrytes hvis noen bruker Glimt."),
        G67FlagDef(key: "weekly", label: "Ukerapport", help: "Søndag kl. 20: én kort melding med antall forespørsler, andel løst på første forsøk, rettelser, nye oppskrifter, hurtigvei og median svartid."),
    ], user: ["weekly"])

    static let understand: G67Flags = G67Flags("/glimt/agent/understand", [
        G67FlagDef(key: "state", label: "Samtaletilstand", help: "Glimt husker forrige spørsmål i samtalen, så «og i Bergen?» og «flytt den til 11» forstås. Utløper etter 30 min i søket på Hjem og 12 t i Chat."),
        G67FlagDef(key: "entities", label: "Entitetsregister", help: "Personer, steder, butikker, abonnementer og faste hendelser med aliaser («hytta», «jobben»), brukt i minne, kalendersøk, vær og finans."),
        G67FlagDef(key: "choices", label: "Valgknapper ved usikkerhet", help: "Glimt spør med konkrete valg («Mener du A eller B?») i stedet for å gjette, og forstår «den første»."),
    ])

    var admin: Bool { JS.bool(data, "admin") == true }

    func server(_ k: String) -> Bool { JS.bool(JS.dict(data, "server"), k) != false }

    func own(_ k: String) -> Bool? { JS.bool(JS.dict(data, "user"), k) }

    func on(_ k: String) -> Bool {
        if !userKeys.contains(k) { return server(k) }
        let s: Bool = server(k)
        return s && (own(k) ?? s)
    }

    func label(_ d: G67FlagDef) -> String { JS.str(JS.dict(data, "labels"), d.key) ?? d.label }

    func help(_ d: G67FlagDef) -> String {
        let h: String = JS.str(JS.dict(data, "help"), d.key) ?? ""
        return h.isEmpty || h == "…" ? d.help : h
    }

    func load(_ store: Store) async {
        do {
            data = try await G67Api.get(store, path)
            missing = false
            msg = ""
        } catch {
            if G67Api.missing(error) { missing = true } else { msg = G67Api.message(error) }
        }
    }

    func setUser(_ k: String, _ store: Store) async {
        await put(["scope": "user", k: !on(k)], store)
    }

    func setServer(_ k: String, _ store: Store) async {
        await put(["scope": "server", k: !server(k)], store)
    }

    func put(_ body: [String: Any], _ store: Store) async {
        busy = true
        do {
            data = try await G67Api.send(store, "PUT", path, body)
            msg = "Lagret ✓"
            Haptics.shared.select()
        } catch {
            msg = "Kunne ikke lagre: " + G67Api.message(error)
        }
        busy = false
    }
}

/* ---------- Glimt lærer (oppskrifter) ---------- */

@MainActor
@Observable
final class G67Recipes {
    static let shared = G67Recipes()

    nonisolated static let status: [String: String] = ["active": "Aktiv", "candidate": "Kandidat", "disabled": "Avslått"]
    nonisolated static let use: [String: String] = ["new": "ny", "fewshot": "eksempel", "fast": "hurtigvei", "match": "samme plan"]
    nonisolated static let state: [String: String] = ["success": "vellykket", "fail": "feil", "pending": "venter"]
    nonisolated static let source: [String: String] = ["learned": "Lært av en vellykket kjøring", "correction": "Lært av en rettelse", "edited": "Redigert av deg"]
    nonisolated static let vars: [String] = ["person", "person.aliases", "place", "when"]

    var items: [[String: Any]] = []
    var counts: [String: Any] = [:]
    var stats: [String: Any]? = nil
    var enabled: Bool = true
    var loaded: Bool = false
    var missing: Bool = false
    var err: String = ""
    var msg: String = ""
    var filter: String = ""
    var query: String = ""
    var open: String? = nil
    var detail: [String: [String: Any]] = [:]
    var tests: [String: [String: Any]] = [:]
    var testErr: [String: String] = [:]
    var busy: String? = nil
    var arm: String? = nil
    var editing: String? = nil

    var shown: [[String: Any]] {
        let q: String = query.trimmingCharacters(in: .whitespaces).lowercased()
        return items.filter { (it: [String: Any]) -> Bool in
            if !filter.isEmpty && JS.str(it, "status") != filter { return false }
            if q.isEmpty { return true }
            return ((JS.str(it, "exampleQuery") ?? "") + " " + (JS.str(it, "queryTemplate") ?? "")).lowercased().contains(q)
        }
    }

    func count(_ s: String) -> Int {
        if let n = JS.int(counts, s) { return n }
        return s == "total" ? items.count : items.filter { JS.str($0, "status") == s }.count
    }

    func load(_ store: Store) async {
        do {
            let o: [String: Any] = try await G67Api.get(store, "/glimt/recipes")
            items = JS.list(o, "items")
            counts = JS.dict(o, "counts") ?? [:]
            enabled = JS.bool(o, "enabled") != false
            missing = false
            err = ""
            stats = try? await G67Api.get(store, "/glimt/recipes/stats")
        } catch {
            if G67Api.missing(error) { missing = true } else { err = G67Api.message(error) }
        }
        loaded = true
    }

    func toggle(_ id: String, _ store: Store) {
        if open == id { open = nil; return }
        open = id
        editing = nil
        Task { await loadDetail(id, store) }
    }

    func loadDetail(_ id: String, _ store: Store) async {
        if let o = try? await G67Api.get(store, "/glimt/recipes/" + G67Api.esc(id)) { detail[id] = o }
    }

    func replace(_ item: [String: Any]?) {
        guard let item, let id = JS.str(item, "id"), let i = items.firstIndex(where: { JS.str($0, "id") == id }) else { return }
        items[i] = item
    }

    func setStatus(_ id: String, _ st: String, _ store: Store) async {
        busy = id
        do {
            let o: [String: Any] = try await G67Api.send(store, "PATCH", "/glimt/recipes/" + G67Api.esc(id), ["status": st])
            replace(JS.dict(o, "item"))
            msg = st == "disabled" ? "Oppskriften er slått av ✓" : "Oppskriften er slått på ✓"
        } catch { msg = G67Api.message(error) }
        busy = nil
        await load(store)
    }

    func delete(_ id: String, _ store: Store) async {
        if arm != id { arm = id; return }
        arm = nil
        busy = id
        do {
            try await G67Api.send(store, "DELETE", "/glimt/recipes/" + G67Api.esc(id))
            items.removeAll { JS.str($0, "id") == id }
            open = nil
            msg = "Slettet ✓"
        } catch { msg = G67Api.message(error) }
        busy = nil
        await load(store)
    }

    func test(_ id: String, _ text: String, _ store: Store) async {
        busy = id
        testErr[id] = nil
        let t: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            tests[id] = try await G67Api.send(store, "POST", "/glimt/recipes/" + G67Api.esc(id) + "/test", t.isEmpty ? [:] : ["text": t], timeout: 60)
        } catch { testErr[id] = G67Api.message(error) }
        busy = nil
    }

    /// Ukjente variabler i en tekst (bare {person}, {person.aliases}, {place} og {when} er lov).
    nonisolated static func badVars(_ s: String) -> [String] {
        var out: [String] = []
        var rest: Substring = Substring(s)
        while let a = rest.firstIndex(of: "{") {
            let after: Substring = rest[rest.index(after: a)...]
            guard let b = after.firstIndex(of: "}") else { break }
            let name: String = String(after[after.startIndex..<b]).trimmingCharacters(in: .whitespaces)
            if !name.isEmpty && name.count <= 40 && !name.contains("\"") && !vars.contains(name) && !out.contains(name) { out.append(name) }
            rest = after[after.index(after: b)...]
        }
        return out
    }

    /// Sjekker og sender redigeringen (samme grenser som serveren). → feilmelding eller nil.
    func saveEdit(_ it: [String: Any], template: String, planText: String, fastWrite: Bool, _ store: Store) async -> String? {
        guard let id = JS.str(it, "id") else { return "Fant ikke oppskriften" }
        var body: [String: Any] = [:]
        let tpl: String = template.trimmingCharacters(in: .whitespacesAndNewlines)
        if tpl != (JS.str(it, "queryTemplate") ?? "") {
            if tpl.count < 3 || tpl.count > 200 { return "Malen må være 3–200 tegn" }
            if let bad = G67Recipes.badVars(tpl).first {
                return "Ukjent variabel i malen: {\(bad)} (lov: " + G67Recipes.vars.map { "{\($0)}" }.joined(separator: ", ") + ")"
            }
            body["queryTemplate"] = tpl
        }
        let raw: String = planText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !raw.isEmpty && raw != G67Recipes.planText(it) {
            guard let parsed = try? JSONSerialization.jsonObject(with: Data(raw.utf8)) else { return "Planen er ikke gyldig JSON" }
            let calls: [Any] = (parsed as? [Any]) ?? ((parsed as? [String: Any])?["calls"] as? [Any]) ?? []
            if calls.isEmpty || calls.count > 6 { return "Planen må ha 1–6 kall" }
            var norm: [[String: Any]] = []
            for c in calls {
                guard let d = c as? [String: Any], let tool = d["tool"] as? String, !tool.isEmpty else { return "Hvert kall trenger «tool» og «args»" }
                if d["args"] != nil && !(d["args"] is [String: Any]) && !(d["args"] is NSNull) { return "Hvert kall trenger «tool» og «args»" }
                norm.append(["tool": tool, "args": (d["args"] as? [String: Any]) ?? [:]])
            }
            if let bad = G67Recipes.badVars(raw).first { return "Ukjent variabel i planen: {\(bad)}" }
            body["plan"] = ["calls": norm]
        }
        if JS.bool(it, "writes") == true && fastWrite != (JS.bool(it, "allowFastWrite") == true) { body["allowFastWrite"] = fastWrite }
        if body.isEmpty { editing = nil; msg = "Ingen endringer"; return nil }
        busy = id
        defer { busy = nil }
        do {
            let o: [String: Any] = try await G67Api.send(store, "PATCH", "/glimt/recipes/" + G67Api.esc(id), body)
            replace(JS.dict(o, "item"))
            editing = nil
            msg = "Lagret ✓"
            await loadDetail(id, store)
            return nil
        } catch { return G67Api.message(error) }
    }

    /// Planen som JSON-tekst til redigering.
    nonisolated static func planText(_ it: [String: Any]) -> String {
        let plan: Any = it["plan"] ?? ["calls": []]
        guard let d = try? JSONSerialization.data(withJSONObject: plan, options: [.prettyPrinted, .sortedKeys]) else { return "" }
        return String(decoding: d, as: UTF8.self)
    }

    /// «Brukt 7 ganger · 6 vellykket · 1 feil · siste 10: 6/7»
    nonisolated static func statLine(_ r: [String: Any]) -> String {
        let u: Int = JS.int(r, "useCount") ?? 0, s: Int = JS.int(r, "successCount") ?? 0, f: Int = JS.int(r, "failCount") ?? 0
        if u == 0 && s == 0 && f == 0 { return "Ikke brukt ennå" }
        var parts: [String] = ["Brukt \(u) \(u == 1 ? "gang" : "ganger")", "\(s) vellykket"]
        if f > 0 { parts.append("\(f) feil") }
        if let l = JS.dict(r, "last10") {
            let ls: Int = JS.int(l, "success") ?? 0
            parts.append("siste 10: \(ls)/\(ls + (JS.int(l, "fail") ?? 0) + (JS.int(l, "pending") ?? 0))")
        }
        return parts.joined(separator: " · ")
    }

    /// Planen som lesbar tekst (serverens readableSteps/readable, ellers verktøy + argumenter).
    nonisolated static func readable(_ r: [String: Any]) -> [String] {
        let steps: [String] = JS.strings(r, "readableSteps")
        if !steps.isEmpty { return steps }
        if let one = JS.str(r, "readable") { return [one] }
        return JS.list(JS.dict(r, "plan"), "calls").map { (c: [String: Any]) -> String in
            let args: [String] = (JS.dict(c, "args") ?? [:]).sorted { $0.key < $1.key }.map { "\($0.key): \($0.value)" }
            return (JS.str(c, "tool") ?? "?") + "(" + args.joined(separator: "; ") + ")"
        }
    }

    nonisolated static func fastLine(_ r: [String: Any]) -> String {
        guard let f = JS.dict(r, "fast") else { return "" }
        if JS.bool(f, "eligible") == true { return "Kan gå hurtigveien" }
        return "Ikke hurtigvei: " + JS.strings(f, "reasons").joined(separator: " · ")
    }
}

/* ---------- Faste oppgaver ---------- */

@MainActor
@Observable
final class G67Sched {
    static let shared = G67Sched()

    nonisolated static let kind: [String: String] = ["power": "Strømpriser", "reminder": "Påminnelse", "query": "Glimt-forespørsel",
                                                     "memory": "Minne", "quality": "Kvalitet", "weekly": "Ukerapport"]
    nonisolated static let run: [String: String] = ["running": "Kjører", "ok": "Levert", "failed": "Feilet", "skipped": "Hoppet over",
                                                    "missed": "Tapt", "condition_false": "Betingelsen var ikke oppfylt"]
    nonisolated static let status: [String: String] = ["active": "Aktiv", "paused": "Pauset", "ended": "Ferdig"]
    nonisolated static let zones: [(String, String)] = [("NO1", "Øst"), ("NO2", "Sør"), ("NO3", "Midt"), ("NO4", "Nord"), ("NO5", "Vest")]

    var items: [[String: Any]] = []
    var builtin: [[String: Any]] = []
    var counts: [String: Any] = [:]
    var enabled: Bool = true
    var loaded: Bool = false
    var missing: Bool = false
    var err: String = ""
    var msg: String = ""
    var filter: String = ""
    var open: String? = nil
    var runs: [String: [[String: Any]]] = [:]
    var busy: [String: String] = [:]
    var rmsg: [String: String] = [:]
    var arm: String? = nil
    var editWhen: String? = nil

    // «Lag fra tekst»
    var newWhat: String = ""
    var newWhen: String = ""
    var newCond: String = ""
    var preview: [String: Any]? = nil
    var previewErr: String = ""
    var creating: Bool = false

    var shown: [[String: Any]] { items.filter { filter.isEmpty || JS.str($0, "status") == filter } }

    func count(_ s: String) -> Int {
        if let n = JS.int(counts, s) { return n }
        return s == "total" ? items.count : items.filter { JS.str($0, "status") == s }.count
    }

    func load(_ store: Store) async {
        do {
            let o: [String: Any] = try await G67Api.get(store, "/glimt/schedules")
            items = JS.list(o, "items")
            builtin = JS.list(o, "builtin")
            counts = JS.dict(o, "counts") ?? [:]
            enabled = JS.bool(o, "enabled") != false
            missing = false
            err = ""
        } catch {
            if G67Api.missing(error) { missing = true } else { err = G67Api.message(error) }
        }
        loaded = true
    }

    func toggle(_ id: String, _ store: Store) {
        if open == id { open = nil; return }
        open = id
        editWhen = nil
        Task { await loadRuns(id, store) }
    }

    func loadRuns(_ id: String, _ store: Store) async {
        if let o = try? await G67Api.get(store, "/glimt/schedules/" + G67Api.esc(id) + "/runs?limit=20") { runs[id] = JS.list(o, "items") }
    }

    func replace(_ item: [String: Any]?) {
        guard let item, let id = JS.str(item, "id") else { return }
        if let i = items.firstIndex(where: { JS.str($0, "id") == id }) { items[i] = item }
        if let i = builtin.firstIndex(where: { JS.str($0, "id") == id }) { builtin[i] = item }
    }

    func setStatus(_ id: String, _ st: String, _ store: Store) async {
        busy[id] = "status"
        do {
            let o: [String: Any] = try await G67Api.send(store, "PATCH", "/glimt/schedules/" + G67Api.esc(id), ["status": st])
            replace(JS.dict(o, "item"))
            rmsg[id] = st == "paused" ? "Satt på pause ✓" : "Slått på igjen ✓"
        } catch { rmsg[id] = G67Api.message(error) }
        busy[id] = nil
    }

    func delete(_ id: String, _ store: Store) async {
        if arm != id { arm = id; return }
        arm = nil
        busy[id] = "del"
        do {
            try await G67Api.send(store, "DELETE", "/glimt/schedules/" + G67Api.esc(id))
            items.removeAll { JS.str($0, "id") == id }
            open = nil
            msg = "Slettet ✓"
        } catch { rmsg[id] = G67Api.message(error) }
        busy[id] = nil
    }

    func runNow(_ id: String, _ store: Store) async {
        busy[id] = "run"
        rmsg[id] = nil
        do {
            let o: [String: Any] = try await G67Api.send(store, "POST", "/glimt/schedules/" + G67Api.esc(id) + "/run-now", [:], timeout: 180)
            replace(JS.dict(o, "item"))
            let r: [String: Any]? = JS.dict(o, "run")
            let st: String = G67Sched.run[JS.str(r, "status") ?? ""] ?? "Kjørt"
            rmsg[id] = [st, JS.str(r, "result") ?? JS.str(r, "reason") ?? JS.str(r, "error") ?? ""].filter { !$0.isEmpty }.joined(separator: ": ")
            await loadRuns(id, store)
        } catch { rmsg[id] = G67Api.message(error) }
        busy[id] = nil
    }

    func move(_ id: String, when: String, _ store: Store) async {
        let w: String = when.trimmingCharacters(in: .whitespacesAndNewlines)
        if w.count < 2 || w.count > 200 { rmsg[id] = "Skriv når, f.eks. «hver hverdag kl. 7» (2–200 tegn)"; return }
        busy[id] = "when"
        do {
            let o: [String: Any] = try await G67Api.send(store, "PATCH", "/glimt/schedules/" + G67Api.esc(id), ["when": w])
            replace(JS.dict(o, "item"))
            editWhen = nil
            rmsg[id] = "Endret ✓"
        } catch { rmsg[id] = G67Api.message(error) }
        busy[id] = nil
    }

    func brief(_ id: String, at: String?, on: Bool?, _ store: Store) async {
        var body: [String: Any] = [:]
        if let at { body["at"] = at }
        if let on { body["on"] = on }
        busy[id] = "brief"
        do {
            let o: [String: Any] = try await G67Api.send(store, "PATCH", "/glimt/schedules/" + id, body)
            replace(JS.dict(o, "item"))
            rmsg[id] = "Lagret ✓"
        } catch { rmsg[id] = G67Api.message(error) }
        busy[id] = nil
    }

    private var createBody: [String: Any] {
        var b: [String: Any] = ["when": newWhen.trimmingCharacters(in: .whitespacesAndNewlines),
                                "what": newWhat.trimmingCharacters(in: .whitespacesAndNewlines)]
        let c: String = newCond.trimmingCharacters(in: .whitespacesAndNewlines)
        if !c.isEmpty { b["condition"] = c }
        return b
    }

    /// «Lag fra tekst» steg 1: forhåndsvisning (lagrer ingenting).
    func parse(_ store: Store) async {
        previewErr = ""
        preview = nil
        let w: String = newWhen.trimmingCharacters(in: .whitespacesAndNewlines)
        if newWhat.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 { previewErr = "Skriv hva Glimt skal gjøre"; return }
        if w.count < 2 || w.count > 200 { previewErr = "Skriv når, f.eks. «hver hverdag kl. 7» (2–200 tegn)"; return }
        creating = true
        do { preview = try await G67Api.send(store, "POST", "/glimt/schedules/parse", createBody) }
        catch { previewErr = G67Api.message(error) }
        creating = false
    }

    /// Steg 2: lagre (POST) etter at tolkningen er vist.
    func create(_ store: Store) async -> Bool {
        creating = true
        defer { creating = false }
        do {
            let o: [String: Any] = try await G67Api.send(store, "POST", "/glimt/schedules", createBody)
            msg = "Lagret ✓ " + (JS.str(JS.dict(o, "item"), "summary") ?? "")
            newWhat = ""; newWhen = ""; newCond = ""; preview = nil
            await load(store)
            return true
        } catch {
            previewErr = G67Api.message(error)
            return false
        }
    }

    /// «Hver dag kl. 07:00 · til og med 28. feb 2027»
    nonisolated static func whenLabel(_ w: [String: Any]?) -> String {
        var parts: [String] = [JS.str(w, "label") ?? JS.str(w, "text") ?? ""]
        if let u = JS.str(w, "until") { parts.append("til og med " + G67Fmt.day(u)) }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    nonisolated static func next(_ it: [String: Any]) -> String {
        let st: String = JS.str(it, "status") ?? ""
        if st == "active", let n = JS.str(it, "nextRunAt") { return "Neste " + G67Fmt.when(n) }
        return st == "paused" ? "På pause" : "Ingen flere kjøringer"
    }

    nonisolated static func delivery(_ r: [String: Any]) -> String {
        guard let d = JS.dict(r, "delivery") else { return "" }
        if let s = JS.str(d, "skipped") { return "Ikke sendt: " + s }
        if JS.bool(d, "delivered") == true {
            let n: Int = JS.int(d, "pushed") ?? 0
            return n > 0 ? "Push sendt til \(n) enheter" : "Push sendt"
        }
        return JS.str(r, "status") == "ok" ? "Ingen enheter tok imot push" : ""
    }
}

/* ---------- Entitetsregister ---------- */

@MainActor
@Observable
final class G67Ent {
    static let shared = G67Ent()

    nonisolated static let types: [String] = ["person", "place", "store", "subscription", "event"]
    nonisolated static let defLabels: [String: String] = ["person": "Personer", "place": "Steder", "store": "Butikker", "subscription": "Abonnementer", "event": "Faste hendelser"]
    nonisolated static let one: [String: String] = ["person": "Person", "place": "Sted", "store": "Butikk", "subscription": "Abonnement", "event": "Fast hendelse"]

    var items: [[String: Any]] = []
    var labels: [String: String] = G67Ent.defLabels
    var enabled: Bool = true
    var loaded: Bool = false
    var missing: Bool = false
    var err: String = ""
    var msg: String = ""
    var filter: String = ""
    /// Id som redigeres, eller "+" for ny.
    var editing: String? = nil
    var arm: String? = nil
    var busy: Bool = false
    var resolved: String = ""

    var shown: [[String: Any]] { items.filter { filter.isEmpty || JS.str($0, "type") == filter } }

    func label(_ t: String) -> String { labels[t] ?? G67Ent.defLabels[t] ?? t }

    func load(_ store: Store) async {
        do {
            let o: [String: Any] = try await G67Api.get(store, "/glimt/entities")
            items = JS.list(o, "items")
            if let l = JS.dict(o, "labels") as? [String: String] { labels = l }
            enabled = JS.bool(o, "enabled") != false
            missing = false
            err = ""
        } catch {
            if G67Api.missing(error) { missing = true } else { err = G67Api.message(error) }
        }
        loaded = true
    }

    nonisolated static func check(name: String, aliases: [String], derived: Bool) -> String {
        if !derived && (name.count < 2 || name.count > 80) { return "Navnet må være 2–80 tegn" }
        if aliases.count > 20 { return "Maks 20 aliaser" }
        if let bad = aliases.first(where: { $0.count < 2 || $0.count > 60 }) { return "Aliaset «\(bad)» må være 2–60 tegn" }
        return ""
    }

    /// Lagrer ny (POST) eller endret (PATCH). For avledede (Familie-steder, abonnementer, vær, profil) sendes bare aliaser.
    func save(_ it: [String: Any]?, type: String, name: String, value: String, aliases: String, _ store: Store) async -> Bool {
        let al: [String] = G67Fmt.aliases(aliases)
        let derived: Bool = it != nil && (JS.dict(it, "editable").map { JS.bool($0, "name") == false } ?? false)
        let n: String = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let e: String = G67Ent.check(name: n, aliases: al, derived: derived)
        if !e.isEmpty { msg = e; return false }
        if it == nil && type.isEmpty { msg = "Velg en type"; return false }
        busy = true
        defer { busy = false }
        do {
            if let it, let id = JS.str(it, "id") {
                var body: [String: Any] = ["aliases": al]
                if !derived {
                    body["name"] = n
                    let v: String = value.trimmingCharacters(in: .whitespacesAndNewlines)
                    body["value"] = v.isEmpty ? NSNull() : v
                }
                try await G67Api.send(store, "PATCH", "/glimt/entities/" + G67Api.esc(id), body)
            } else {
                var body: [String: Any] = ["type": type, "name": n, "aliases": al]
                let v: String = value.trimmingCharacters(in: .whitespacesAndNewlines)
                if !v.isEmpty { body["value"] = v }
                try await G67Api.send(store, "POST", "/glimt/entities", body)
            }
            editing = nil
            msg = "Lagret ✓"
            await load(store)
            return true
        } catch {
            msg = "Kunne ikke lagre: " + G67Api.message(error)
            return false
        }
    }

    func delete(_ it: [String: Any], _ store: Store) async {
        guard let id = JS.str(it, "id") else { return }
        if arm != id { arm = id; return }
        arm = nil
        busy = true
        do {
            let o: [String: Any] = try await G67Api.send(store, "DELETE", "/glimt/entities/" + G67Api.esc(id))
            msg = JS.str(o, "removed") == "aliases" ? "Egne aliaser er fjernet ✓" : "Slettet ✓"
            editing = nil
            await load(store)
        } catch { msg = "Kunne ikke slette: " + G67Api.message(error) }
        busy = false
    }

    /// «Hva betyr …?» – hva Glimt tror ordet betyr.
    func resolve(_ q: String, _ store: Store) async {
        let w: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !w.isEmpty else { resolved = ""; return }
        do {
            let o: [String: Any] = try await G67Api.get(store, "/glimt/entities/resolve?q=" + (w.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=+"))) ?? w))
            if let it = JS.dict(o, "item") {
                let via: String = ["name": "navnet", "alias": "et alias", "builtin": "et fast ord"][JS.str(o, "via") ?? ""] ?? ""
                let v: String = JS.str(it, "value").map { " (" + $0 + ")" } ?? ""
                resolved = "«\(w)» = \(JS.str(it, "name") ?? "")\(v) · \(G67Ent.one[JS.str(it, "type") ?? ""] ?? "")" + (via.isEmpty ? "" : " · funnet via " + via)
            } else {
                resolved = "Glimt kjenner ikke «\(w)» ennå."
            }
        } catch { resolved = "Kunne ikke slå opp: " + G67Api.message(error) }
    }
}

/* ---------- Glimt husker: Forslag, Motstrid, Ikke brukt på lenge ---------- */

@MainActor
@Observable
final class G67Mem {
    static let shared = G67Mem()

    nonisolated static let source: [String: String] = ["conversation": "Glimt-samtale", "correction": "Rettelse", "calendar": "Kalender"]

    var pending: [[String: Any]] = []
    var conflicts: [[String: Any]] = []
    var stale: [[String: Any]] = []
    var staleDays: Int = 90
    var hygiene: [String: Any]? = nil
    var loaded: Bool = false
    var missing: Bool = false
    var err: String = ""
    var msg: String = ""
    var busy: [String: Bool] = [:]
    var editing: String? = nil
    var arm: String? = nil

    func on(_ k: String) -> Bool { JS.bool(JS.dict(hygiene, "settings"), k) != false }

    func load(_ store: Store) async {
        do {
            hygiene = try await G67Api.get(store, "/glimt/memory/hygiene")
            missing = false
            err = ""
        } catch {
            if G67Api.missing(error) { missing = true; loaded = true; return }
            err = G67Api.message(error)
        }
        if let o = try? await G67Api.get(store, "/glimt/memory/pending") {
            pending = JS.list(o, "items").filter { (JS.str($0, "status") ?? "pending") == "pending" }
        }
        if let o = try? await G67Api.get(store, "/glimt/memory/conflicts") {
            conflicts = JS.list(o, "items").filter { (JS.str($0, "status") ?? "open") == "open" }
        }
        if let o = try? await G67Api.get(store, "/glimt/memory/stale") {
            stale = JS.list(o, "items")
            staleDays = JS.int(o, "staleDays") ?? JS.int(hygiene, "staleDays") ?? 90
        }
        loaded = true
    }

    private func changed(_ text: String, _ store: Store, memory: Bool = false) async {
        msg = text
        Haptics.shared.select()
        await load(store)
        if memory { await Memory33Model.shared.load(store, force: true) }
    }

    func approve(_ id: String, edits: [String: Any]?, _ store: Store) async {
        busy[id] = true
        do {
            let o: [String: Any] = try await G67Api.send(store, "POST", "/glimt/memory/pending/" + G67Api.esc(id) + "/approve", edits ?? [:])
            editing = nil
            await changed("Lagret i minnet: «" + G67Mem.sentence(JS.dict(o, "item") ?? [:]) + "» ✓", store, memory: true)
        } catch let e as APIError where e.status == 409 {
            editing = nil
            await changed("Forslaget motsier noe Glimt allerede vet. Velg hva som stemmer under Motstrid.", store)
        } catch { msg = G67Api.message(error) }
        busy[id] = nil
    }

    func reject(_ id: String, _ store: Store) async {
        busy[id] = true
        do {
            try await G67Api.send(store, "POST", "/glimt/memory/pending/" + G67Api.esc(id) + "/reject")
            await changed("Avvist – Glimt lagrer det ikke", store)
        } catch { msg = G67Api.message(error) }
        busy[id] = nil
    }

    /// Lagrer redigeringen (forblir forslag), eller lagrer og godkjenner.
    func saveEdit(_ p: [String: Any], subject: String, object: String, aliases: String, approve: Bool, _ store: Store) async -> String? {
        guard let id = JS.str(p, "id") else { return "Fant ikke dette" }
        let s: String = subject.trimmingCharacters(in: .whitespacesAndNewlines)
        let o: String = object.trimmingCharacters(in: .whitespacesAndNewlines)
        let al: [String] = G67Fmt.aliases(aliases)
        if s.count < 2 || s.count > 80 { return "Navnet må være 2–80 tegn" }
        if o.isEmpty || o.count > 120 { return "Hva det er må være 1–120 tegn" }
        if al.count > 20 { return "Maks 20 aliaser" }
        if let bad = al.first(where: { $0.count < 2 || $0.count > 60 }) { return "Aliaset «\(bad)» må være 2–60 tegn" }
        var body: [String: Any] = [:]
        if s != (JS.str(p, "subject") ?? "") { body["subject"] = s }
        if o != (JS.str(p, "object") ?? "") { body["object"] = o }
        if al != JS.strings(p, "aliases") { body["aliases"] = al }
        if approve { await self.approve(id, edits: body, store); return nil }
        if body.isEmpty { editing = nil; return nil }
        busy[id] = true
        defer { busy[id] = nil }
        do {
            let r: [String: Any] = try await G67Api.send(store, "POST", "/glimt/memory/pending/" + G67Api.esc(id) + "/edit", body)
            editing = nil
            await changed(JS.str(JS.dict(r, "item"), "conflictId") != nil ? "Lagret forslaget – det motsier noe Glimt vet, se Motstrid" : "Lagret forslaget – godkjenn når det stemmer", store)
            return nil
        } catch { return G67Api.message(error) }
    }

    func resolve(_ id: String, _ choice: String, _ store: Store) async {
        busy[id] = true
        do {
            try await G67Api.send(store, "POST", "/glimt/memory/conflicts/" + G67Api.esc(id) + "/resolve", ["choice": choice])
            await changed(choice == "both" ? "Begge beholdes – Glimt spør ikke igjen ✓" : "Lagret valget ✓", store, memory: true)
        } catch { msg = G67Api.message(error) }
        busy[id] = nil
    }

    func keep(_ id: Int, _ store: Store) async {
        busy["s\(id)"] = true
        do {
            try await G67Api.send(store, "POST", "/glimt/memory/stale/\(id)/keep")
            await changed("Beholdt – merket er fjernet ✓", store, memory: true)
        } catch { msg = G67Api.message(error) }
        busy["s\(id)"] = nil
    }

    func deleteStale(_ id: Int, _ store: Store) async {
        if arm != "s\(id)" { arm = "s\(id)"; return }
        arm = nil
        busy["s\(id)"] = true
        do {
            try await G67Api.send(store, "DELETE", "/glimt/memory/\(id)")
            await changed("Slettet fra minnet ✓", store, memory: true)
        } catch { msg = G67Api.message(error) }
        busy["s\(id)"] = nil
    }

    func runNow(_ store: Store) async {
        busy["run"] = true
        do {
            let o: [String: Any] = try await G67Api.send(store, "POST", "/glimt/memory/hygiene/run-now", [:], timeout: 300)
            let r: [String: Any]? = JS.dict(o, "run")
            let n: Int = JS.int(r, "proposals") ?? 0
            await changed(JS.str(r, "status") == "ok" ? (n > 0 ? "Ferdig: \(n) nye forslag" : "Ferdig: ingen nye forslag") : G67Mem.runLine(r), store)
        } catch { msg = G67Api.message(error) }
        busy["run"] = nil
    }

    nonisolated static func sentence(_ p: [String: Any]) -> String {
        if let s = JS.str(p, "sentence") { return s }
        return [JS.str(p, "subject") ?? "", JS.str(p, "predicate") ?? "er", JS.str(p, "object") ?? ""].filter { !$0.isEmpty }.joined(separator: " ")
    }

    nonisolated static func sub(_ p: [String: Any]) -> String {
        [JS.str(p, "sourceLabel") ?? source[JS.str(p, "source") ?? ""] ?? "", JS.str(p, "reason") ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    nonisolated static func days(_ n: Int) -> String { "\(n) \(n == 1 ? "dag" : "dager")" }

    /// «Nina → frisør» (tittelen når den finnes).
    nonisolated static func staleTitle(_ it: [String: Any]) -> String {
        let s: String = JS.str(it, "subject") ?? ""
        if let t = JS.str(it, "title") { return !s.isEmpty && !t.lowercased().contains(s.lowercased()) ? s + " → " + t : t }
        return (s + " → " + (JS.str(it, "object") ?? "")).trimmingCharacters(in: .whitespaces)
    }

    /// «Ikke brukt på 131 dager · sist brukt 18. jun»
    nonisolated static func staleLine(_ it: [String: Any]) -> String {
        let head: String = JS.int(it, "daysUnused").map { "Ikke brukt på " + days($0) } ?? "Ikke brukt på lenge"
        let tail: String
        if let u = JS.str(it, "lastUsedAt") { tail = "sist brukt " + G67Fmt.day(u) }
        else if let k = JS.str(it, "keptAt") { tail = "beholdt " + G67Fmt.day(k) }
        else if let c = JS.str(it, "createdAt") { tail = "aldri brukt · lagt inn " + G67Fmt.day(c) }
        else { tail = "aldri brukt" }
        return head + " · " + tail
    }

    /// Nattjobbens siste kjøring på én linje.
    nonisolated static func runLine(_ run: [String: Any]?) -> String {
        guard let run else { return "Ikke kjørt ennå" }
        let at: String = G67Fmt.when(run["at"])
        let reason: String = JS.str(run, "reason").map { ": " + $0 } ?? ""
        switch JS.str(run, "status") {
        case "skipped": return "Hoppet over " + at + reason
        case "failed": return "Feilet " + at + reason
        default:
            var parts: [String] = ["Kjørt " + at]
            if let n = JS.int(run, "proposals") { parts.append("\(n) forslag") }
            if let n = JS.int(run, "conflicts") { parts.append("\(n) motstrid") }
            if let n = JS.int(run, "stale") { parts.append("\(n) \(n == 1 ? "ubrukt" : "ubrukte")") }
            return parts.joined(separator: " · ")
        }
    }

    /// Valgknappene for en motstrid (serverens choices, ellers de tre faste).
    nonisolated static func choices(_ c: [String: Any]) -> [(String, String)] {
        let ok: [String] = ["keep_a", "keep_b", "both"]
        let srv: [(String, String)] = JS.list(c, "choices").compactMap { (x: [String: Any]) -> (String, String)? in
            guard let id = JS.str(x, "id"), ok.contains(id) else { return nil }
            return (id, JS.str(x, "label") ?? id)
        }
        if !srv.isEmpty { return srv }
        let a: String = JS.str(JS.dict(c, "a"), "label") ?? "A"
        let b: String = JS.str(JS.dict(c, "b"), "label") ?? "B"
        return [("keep_a", "Behold «\(a)»"), ("keep_b", "Behold «\(b)»"), ("both", "Begge stemmer")]
    }
}

/* ---------- Kvalitet ---------- */

@MainActor
@Observable
final class G67Quality {
    static let shared = G67Quality()

    nonisolated static let status: [String: String] = ["running": "Kjører", "ok": "OK", "regression": "Regresjon", "failed": "Feilet",
                                                       "skipped": "Hoppet over", "aborted": "Avbrutt"]

    var weekly: [String: Any]? = nil
    /// Uka som vises (nil = inneværende). Settes også fra push-lenken.
    var week: String? = nil
    var weekErr: String = ""
    var settings: [String: Any]? = nil
    var runs: [[String: Any]] = []
    var running: [String: Any]? = nil
    var runsErr: String = ""
    var loaded: Bool = false
    var missing: Bool = false
    var msg: String = ""
    var busy: Bool = false
    var open: String? = nil
    var openRun: String? = nil
    var details: [String: [String: Any]] = [:]
    var reports: [String: String] = [:]
    var showAll: Bool = false

    func load(_ store: Store, admin: Bool) async {
        await loadWeek(store)
        if missing { loaded = true; return }
        settings = try? await G67Api.get(store, "/glimt/quality/settings")
        if admin { await loadRuns(store) }
        if let r = openRun {
            openRun = nil
            open = r
            await loadRun(r, store)
        }
        loaded = true
    }

    func loadWeek(_ store: Store) async {
        let q: String = week.map { "?week=" + G67Api.esc($0) } ?? ""
        do {
            weekly = try await G67Api.get(store, "/glimt/quality/weekly" + q)
            weekErr = ""
            missing = false
        } catch {
            if (error as? APIError)?.status == 404 && week == nil { missing = true } else { weekErr = G67Api.message(error) }
        }
    }

    func go(_ w: String?, _ store: Store) async {
        week = w
        await loadWeek(store)
    }

    func loadRuns(_ store: Store) async {
        do {
            let o: [String: Any] = try await G67Api.get(store, "/glimt/quality/runs?limit=30")
            runs = JS.list(o, "items")
            running = JS.dict(o, "running")
            runsErr = ""
        } catch { runsErr = G67Api.message(error) }
    }

    func toggle(_ id: String, _ store: Store) {
        if open == id { open = nil; return }
        open = id
        showAll = false
        Task { await loadRun(id, store) }
    }

    func loadRun(_ id: String, _ store: Store) async {
        do { details[id] = try await G67Api.get(store, "/glimt/quality/runs/" + G67Api.esc(id)) }
        catch { msg = (error as? APIError)?.status == 404 ? "Fant ikke kjøringen (rapporten kan være rotert bort)." : "Kunne ikke hente casene: " + G67Api.message(error) }
    }

    func loadReport(_ id: String, _ store: Store) async {
        if reports[id] != nil { reports[id] = nil; return }
        reports[id] = "Henter rapporten …"
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/glimt/quality/runs/" + G67Api.esc(id) + "?format=md", timeout: 30)
            reports[id] = String(decoding: d, as: UTF8.self)
        } catch { reports[id] = "Kunne ikke hente rapporten: " + G67Api.message(error) }
    }

    func runNow(_ store: Store) async {
        busy = true
        do {
            let o: [String: Any] = try await G67Api.send(store, "POST", "/glimt/quality/run-now", [:], timeout: 30)
            let r: [String: Any]? = JS.dict(o, "run")
            msg = JS.bool(o, "ok") == false ? "Hoppet over" + (JS.str(r, "reason").map { ": " + $0 } ?? "") : "Nattlig eval startet ✓"
        } catch { msg = G67Api.message(error) }
        busy = false
        await loadRuns(store)
    }

    func abort(_ store: Store) async {
        busy = true
        do {
            try await G67Api.send(store, "POST", "/glimt/quality/abort")
            msg = "Avbrutt ✓"
        } catch { msg = G67Api.message(error) }
        busy = false
        await loadRuns(store)
    }

    /// «120/129 bestått · 40/43 caser grønne · 3 miljøfeil (teller ikke)»
    nonisolated static func line(_ r: [String: Any]) -> String {
        var parts: [String] = []
        if let p = JS.int(r, "passed"), let t = JS.int(r, "total") { parts.append("\(p)/\(t) bestått") }
        if let c = JS.int(r, "cases") { parts.append("\(JS.int(r, "greenCases") ?? 0)/\(c) caser grønne") }
        if let e = JS.int(r, "envFailures"), e > 0 { parts.append("\(e) miljøfeil (teller ikke)") }
        let reg: Int = JS.list(r, "regressions").count
        if reg > 0 { parts.append("\(reg) \(reg == 1 ? "regresjon" : "regresjoner")") }
        let imp: Int = JS.list(r, "improved").count
        if imp > 0 { parts.append("\(imp) \(imp == 1 ? "case bedre" : "caser bedre")") }
        if let n = JS.int(r, "newCases"), n > 0 { parts.append("\(n) nye caser") }
        if let p = JS.dict(r, "progress"), JS.str(r, "status") == "running" {
            parts.append("\(JS.int(p, "done") ?? 0)/\(JS.int(p, "total") ?? 0)" + (JS.str(p, "current").map { " · " + $0 } ?? ""))
        }
        if let reason = JS.str(r, "reason") { parts.append(reason) }
        return parts.joined(separator: " · ")
    }
}
