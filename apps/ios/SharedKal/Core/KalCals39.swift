import Foundation

/* ---------------- Prompt 39: Kalender – fire kalendere (Personlig · Bursdager · Skole · Helligdager) ---------------- */
// Fasit: Kalendere Oppsett.dc.html (1a–1d) og Kalender App.dc.html (CALS, CNORM, HOLI). Felles for iPhone, Mac og widgetene.
// Serveren (SERVER39) sender de fire + egne i GET /api/kalender/calendars med key/source/sourceLabel/badge/notify/showInBrief/…
// og rydder 12 → 4 én gang (migration:{done, from, to, undoUntil}). Eldre servere: appen slår sammen lokalt
// (Jobb/Familie/Helse → Personlig, Studie/Timeplan/Prøver → Skole, Google-«Sebastian…» → Personlig, dupliserte Bursdager)
// og legger inn norske helligdager selv (bevegelige beregnet, ingen nett). Ingenting slettes – hendelsene vises bare i den nye.

/// Det appen vet om kilden til en kalender (prompt 39). Mangler på eldre servere – da fylles det ut lokalt.
struct KalCalInfo39: Codable, Hashable {
    /// p | b | s | h, tom = egen kalender.
    var role: String = ""
    /// google | url | builtin | own | ical | ha
    var source: String = ""
    /// «sebastian@kristo.no», «tp.uio.no · hver time», «Norge».
    var sourceLabel: String = ""
    /// GOOGLE | URL | INNEBYGD | EGEN | HA
    var badge: String = ""
    var notify: Bool? = nil
    var showInBrief: Bool? = nil
    var subjectColors: Bool? = nil
    var url: String = ""
    /// 15m | 1h | 6h | 1d
    var interval: String = ""
    var lastFetched: String = ""
    var status: String = ""
    var country: String = ""
    /// Helligdagene beregnes i appen (serveren har ikke kalenderen).
    var localHolidays: Bool = false
}

struct KalMigration39: Hashable {
    var done: Bool = false
    var from: Int = 0
    var to: Int = 0
    /// ISO-tid. Tom = kan ikke angres lenger.
    var undoUntil: String = ""

    var canUndo: Bool {
        guard done, !undoUntil.isEmpty else { return false }
        guard let d = KalCals39.isoDate(undoUntil) else { return false }
        return d > Date()
    }
}

enum KalCals39 {
    static let roles: [String] = ["p", "b", "s", "h"]
    static let names: [String: String] = ["p": "Personlig", "b": "Bursdager", "s": "Skole", "h": "Helligdager"]
    static let colors: [String: String] = ["p": "#b23a2a", "b": "#8a3fa0", "s": "#2f7a4f", "h": "#a39d90"]
    /// De ti fargene i Rediger (1b).
    static let palette: [String] = ["#b23a2a", "#e8794a", "#a8661a", "#2f7a4f", "#3d7f8a", "#2b5d8a", "#5b4fc4", "#8a3fa0", "#c2477a", "#6b665c"]
    static let intervals: [(String, String)] = [("15m", "15 min"), ("1h", "Hver time"), ("6h", "Hver 6. time"), ("1d", "Daglig")]
    static let countries: [(String, String)] = [("NO", "Norge"), ("SE", "Sverige"), ("DK", "Danmark")]

    /* ---------- Tilstand fra siste GET /api/kalender/calendars ---------- */

    /// Sammenslåtte id-er → id-en de vises i (bare eldre servere).
    static var alias: [String: String] = [:]
    /// Rolle → kalender-id i appen («p» → «personlig»).
    static var roleIds: [String: String] = ["p": "p", "b": "b", "s": "s", "h": "h"]
    /// Helligdagene legges inn lokalt (serveren har ikke kalenderen).
    static var localHolidays: Bool = true
    /// Serveren kjenner de fire kalenderne (sender key/sourceLabel/migration).
    static var serverKnows: Bool = false
    private static var sawServerFields: Bool = false
    static var migration: KalMigration39 = KalMigration39()
    /// Antall kalendere før opprydding (lokalt, eldre server) – for «12 → 4».
    static var mergedFrom: Int = 0

    /* ---------- Roller ---------- */

    /// Rollen til en kalender-id, serverkalender eller kortnøkkel. Tom = ukjent.
    static func roleOf(_ raw: String) -> String {
        let s: String = raw.lowercased().trimmingCharacters(in: .whitespaces)
        switch s {
        case "p", "personlig", "privat", "jobb", "work", "j", "familie", "f", "helse", "health", "trials", "primary": return "p"
        case "b", "bursdager", "bursdag", "birthdays", "birthday": return "b"
        case "s", "studie", "skole", "timeplan", "prover", "prøver", "canvas", "study", "school", "studie 40": return "s"
        case "h", "hd", "helligdager", "helligdag", "holidays", "holiday": return "h"
        default: return ""
        }
    }

    /// Rollen til en kalender i lista.
    static func role(_ c: KalCal) -> String {
        if let r = c.p39?.role, !r.isEmpty { return r }
        let src: String = (c.p39?.source.isEmpty == false ? c.p39?.source : c.source) ?? ""
        let n: String = c.name.lowercased()
        if src == "own" || src == "ha" || c.local { return "" }
        // Prompt 43: Media-kalenderen (Sonarr/Radarr, kilde «media») er egen og kan slås av – aldri slått sammen med Personlig.
        if src == "media" || c.id == "media" || c.id.hasPrefix("media") { return "" }
        if src == "google" {
            if n.contains("bursdag") || n.contains("birthday") { return "b" }
            if n.contains("helligdag") || n.contains("holiday") { return "h" }
            return "p"
        }
        if src == "ical" || src == "url" {
            if n.contains("skole") || n.contains("timeplan") || n.contains("studie") || n.contains("tp.uio") { return "s" }
            if n.contains("helligdag") { return "h" }
            return ""
        }
        // Navnet før id-en: gamle lokale buffere hadde «h» = Helse.
        if ["personlig", "jobb", "familie", "helse"].contains(n) { return "p" }
        if n == "bursdager" { return "b" }
        if ["studie", "skole", "timeplan", "prøver", "studie 40"].contains(n) { return "s" }
        if n.contains("helligdag") { return "h" }
        return roleOf(c.id)
    }

    /// Rangering når flere kalendere har samme rolle: serverens nøkkel, så den innebygde, så resten.
    private static func rank(_ c: KalCal, _ r: String) -> Int {
        if c.p39?.role == r && !(c.p39?.localHolidays ?? false) { return 0 }
        let id: String = c.id.lowercased()
        let canon: [String: [String]] = ["p": ["personlig", "p"], "b": ["bursdager", "b"], "s": ["skole", "studie", "s"], "h": ["helligdager", "h", "hd"]]
        if (canon[r] ?? []).contains(id) { return 1 }
        if (c.source ?? "") == "builtin" { return 2 }
        return 3
    }

    /* ---------- Fra serveren ---------- */

    /// Feltene fra prompt 39 på én kalender (tåler at alle mangler).
    static func info(_ o: [String: Any]) -> KalCalInfo39 {
        var x: KalCalInfo39 = KalCalInfo39()
        if o["sourceLabel"] != nil || o["showInBrief"] != nil { sawServerFields = true }
        let key: String = KalParse.str(o, "key")
        x.role = ["p", "b", "s", "h"].contains(key) && !KalParse.str(o, "sourceLabel").isEmpty ? key : ""
        x.source = KalParse.str(o, "source")
        x.sourceLabel = KalParse.str(o, "sourceLabel")
        x.badge = KalParse.str(o, "badge").uppercased()
        x.notify = KalParse.bool(o, "notify")
        x.showInBrief = KalParse.bool(o, "showInBrief")
        if let sc = o["subjectColors"] as? Bool { x.subjectColors = sc } else if o["subjectColors"] is [String: Any] { x.subjectColors = true }
        x.url = KalParse.str(o, "url")
        x.interval = KalParse.str(o, "interval")
        x.lastFetched = KalParse.str(o, "lastFetched")
        x.status = KalParse.str(o, "status")
        x.country = KalParse.str(o, "country")
        return x
    }

    static func readMigration(_ root: Any?) {
        let saw: Bool = sawServerFields
        sawServerFields = false
        guard let o = root as? [String: Any] else { return }
        serverKnows = saw || o["migration"] != nil
        guard let m = o["migration"] as? [String: Any] else { return }
        var out: KalMigration39 = KalMigration39()
        out.done = KalParse.bool(m, "done") ?? false
        out.from = KalParse.int(m, "from") ?? 0
        out.to = KalParse.int(m, "to") ?? 0
        out.undoUntil = KalParse.str(m, "undoUntil")
        migration = out
    }

    /// Hele lista fra GET /api/kalender/calendars → de fire (+ egne). Tom liste = serveren har ikke endepunktet.
    static func fromServer(_ list: [KalCal]) -> [KalCal] {
        if list.isEmpty { return list }
        return normalize(list)
    }

    /// Slår sammen til de fire (+ egne), fyller ut kilde/merke og legger til Helligdager når serveren ikke har den.
    static func normalize(_ list: [KalCal]) -> [KalCal] {
        var newAlias: [String: String] = [:]
        var newRoleIds: [String: String] = [:]
        var byRole: [String: KalCal] = [:]
        var others: [KalCal] = []
        for r in roles {
            let group: [KalCal] = list.filter { (c: KalCal) -> Bool in role(c) == r }
            if group.isEmpty { continue }
            let sorted: [KalCal] = group.enumerated().sorted { (a: (offset: Int, element: KalCal), b: (offset: Int, element: KalCal)) -> Bool in
                let ra: Int = rank(a.element, r)
                let rb: Int = rank(b.element, r)
                if ra != rb { return ra < rb }
                return a.offset < b.offset
            }.map { (x: (offset: Int, element: KalCal)) -> KalCal in x.element }
            var target: KalCal = sorted[0]
            for extra in sorted.dropFirst() {
                newAlias[extra.id] = target.id
                target.count += extra.count
            }
            target = fill(target, r)
            byRole[r] = target
            newRoleIds[r] = target.id
        }
        for c in list where role(c).isEmpty { others.append(fill(c, "")) }
        var out: [KalCal] = []
        for r in roles {
            if let c = byRole[r] { out.append(c) }
        }
        if byRole["h"] == nil {
            out.append(holidayCal())
            newRoleIds["h"] = "h"
            localHolidays = true
        } else {
            localHolidays = byRole["h"]?.p39?.localHolidays ?? false
        }
        out.append(contentsOf: others)
        if !serverKnows && list.count > out.count { mergedFrom = list.count }
        alias = newAlias
        for r in roles where newRoleIds[r] == nil { newRoleIds[r] = r }
        roleIds = newRoleIds
        return out.uniqueIds()
    }

    /// Kanoniske navn, merke og kilde der serveren ikke har sendt dem.
    private static func fill(_ c: KalCal, _ r: String) -> KalCal {
        var x: KalCal = c
        var i: KalCalInfo39 = c.p39 ?? KalCalInfo39()
        if i.source.isEmpty { i.source = c.source ?? "" }
        if !r.isEmpty {
            i.role = r
            if !serverKnows {
                let n: String = x.name.lowercased()
                if r == "s" && ["studie", "studie 40", "timeplan", "prøver"].contains(n) { x.name = "Skole" }
                if r == "p" && ["jobb", "familie", "helse"].contains(n) { x.name = "Personlig" }
            }
            if i.badge.isEmpty { i.badge = r == "h" ? "INNEBYGD" : r == "s" ? "URL" : "GOOGLE" }
            if i.sourceLabel.isEmpty {
                switch r {
                case "p": i.sourceLabel = "Google"
                case "b": i.sourceLabel = "Bursdager fra kontakter"
                case "s": i.sourceLabel = i.url.isEmpty ? "Abonnement" : host(i.url)
                default: i.sourceLabel = countryName(i.country)
                }
            }
            if r == "b" { x.writable = false }
        } else if i.badge.isEmpty {
            switch i.source {
            case "google": i.badge = "GOOGLE"
            case "ical", "url": i.badge = "URL"
            case "ha": i.badge = "HA"
            case "builtin": i.badge = "INNEBYGD"
            default: i.badge = "EGEN"
            }
        }
        if i.sourceLabel.isEmpty {
            switch i.source {
            case "ha": i.sourceLabel = "Home Assistant"
            case "ical", "url": i.sourceLabel = i.url.isEmpty ? "Abonnement" : host(i.url)
            case "google": i.sourceLabel = "Google"
            default: i.sourceLabel = "Egen kalender"
            }
        }
        // Prompt 42: Abonnementer (trekkdatoer fra Finans) – innebygd, kilde «Finans».
        if KalAb42.isAbCal(x) {
            if i.sourceLabel == "Egen kalender" { i.sourceLabel = "Finans · trekkdatoer" }
            if i.badge.isEmpty || i.badge == "EGEN" { i.badge = "INNEBYGD" }
            x.writable = false
        }
        x.p39 = i
        return x
    }

    static func holidayCal() -> KalCal {
        var c: KalCal = KalCal(id: "h", name: "Helligdager", hex: "#a39d90", lightHex: "#c9c2b4", textHex: "#5a554c")
        c.writable = false
        c.builtin = true
        c.source = "builtin"
        var i: KalCalInfo39 = KalCalInfo39()
        i.role = "h"
        i.source = "builtin"
        i.badge = "INNEBYGD"
        i.sourceLabel = "Norge"
        i.country = "NO"
        i.notify = false
        i.localHolidays = true
        c.p39 = i
        c.count = KalHoliday39.list(from: KalD.todayKey(), to: KalD.addKey(KalD.todayKey(), 29)).count
        return c
    }

    /* ---------- Hendelser ---------- */

    /// Kalenderen en hendelse vises i. raw = appCalendar/cal, serverCal = serverens kilde («timeplan»).
    static func resolve(_ raw: String, calIds: Set<String>, serverCal: String, type: String, title: String) -> String {
        if let a = alias[raw], calIds.isEmpty || calIds.contains(a) { return a }
        if !raw.isEmpty && calIds.contains(raw) { return raw }
        var r: String = roleOf(raw)
        if r.isEmpty { r = roleOf(serverCal) }
        if r.isEmpty {
            let t: String = type.lowercased()
            if t == "bursdag" { r = "b" } else if t == "time" || t == "prove" || t == "innl" { r = "s" } else if t == "helligdag" || t == "holiday" { r = "h" }
        }
        if r.isEmpty { r = KalCals.guess(title) }
        let id: String = roleIds[r] ?? r
        if calIds.isEmpty || calIds.contains(id) { return id }
        if calIds.contains(r) { return r }
        let p: String = roleIds["p"] ?? "p"
        return calIds.contains(p) ? p : (raw.isEmpty ? id : raw)
    }

    /// Id-en i lista for en lagret id eller kortnøkkel («p», «jobb», en sammenslått Google-kalender …).
    static func resolveId(_ id: String, in cals: [KalCal]) -> String {
        if cals.contains(where: { (c: KalCal) -> Bool in c.id == id }) { return id }
        if let a = alias[id] { return a }
        let r: String = roleOf(id)
        if !r.isEmpty, let c = cals.first(where: { (x: KalCal) -> Bool in role(x) == r }) { return c.id }
        return id
    }

    /// Hendelsene som kan gi varsel (kalenderens Varsel er ikke slått av).
    static func notifiable(_ events: [KalEvent], _ cals: [KalCal]) -> [KalEvent] {
        var off: Set<String> = []
        for c in cals where c.p39?.notify == false { off.insert(c.id) }
        // Prompt 44: Media-utgivelser varsler ikke som standard (kan slås på per kalender: notify true).
        for c in cals where c.id == "media" && c.p39?.notify != true { off.insert(c.id) }
        if off.isEmpty { return events }
        return events.filter { (e: KalEvent) -> Bool in !off.contains(e.cal) }
    }

    /* ---------- Tekster ---------- */

    static func host(_ url: String) -> String {
        guard let r = url.range(of: "//") else { return url }
        var h: String = String(url[r.upperBound...])
        if let slash = h.firstIndex(of: "/") { h = String(h[..<slash]) }
        if h.hasPrefix("www.") { h = String(h.dropFirst(4)) }
        return h
    }

    static func countryName(_ code: String) -> String {
        let c: String = code.isEmpty ? "NO" : code.uppercased()
        for (k, n) in countries where k == c { return n }
        return c
    }

    static func intervalName(_ v: String) -> String {
        for (k, n) in intervals where k == v { return n }
        return v.isEmpty ? "Hver time" : v
    }

    /// «GOOGLE KALENDER» / «ABONNEMENT» / «INNEBYGD» over navnet i Rediger.
    static func kicker(_ c: KalCal) -> String {
        switch c.p39?.badge ?? "" {
        case "GOOGLE": return "GOOGLE KALENDER"
        case "URL": return "ABONNEMENT"
        case "INNEBYGD": return "INNEBYGD"
        case "HA": return "HOME ASSISTANT"
        default: return "EGEN KALENDER"
        }
    }

    /// Standardvarsel-teksten per rolle (Bursdager kl. 09, Helligdager av, ellers 15 min før).
    static func notifyText(_ c: KalCal) -> String {
        switch role(c) {
        case "b": return "Kl. 09:00 samme dag"
        case "h": return "Av som standard"
        default: return "15 min før"
        }
    }

    static func notifyDefault(_ c: KalCal) -> Bool { role(c) != "h" }

    /// Personlig kan ikke fjernes (bare kobles om). Helligdager kan skjules, men er innebygd.
    static func canRemove(_ c: KalCal) -> Bool {
        let r: String = role(c)
        if r == "p" { return false }
        if r == "h" { return !(c.p39?.localHolidays ?? false) }
        return true
    }

    static func isoDate(_ s: String) -> Date? {
        let f: ISO8601DateFormatter = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        let g: ISO8601DateFormatter = ISO8601DateFormatter()
        g.formatOptions = [.withInternetDateTime]
        return g.date(from: s)
    }

    /// «08:10» eller «19. okt 08:10» fra en ISO-tid.
    static func shortTime(_ s: String) -> String {
        guard let d = isoDate(s) else { return s }
        let hm: String = KalD.hm(KalD.minutes(d))
        if KalD.key(d) == KalD.todayKey() { return hm }
        return String(KalD.dayOfMonth(d)) + ". " + KalD.monthsShort[KalD.month(d) - 1] + " " + hm
    }
}

/* ---------- Helligdager (innebygd, Norge) ---------- */

enum KalHoliday39 {
    /// Påskedag (gregoriansk, anonym algoritme). → (måned, dag)
    static func easter(_ y: Int) -> (Int, Int) {
        let a: Int = y % 19
        let b: Int = y / 100
        let c: Int = y % 100
        let d: Int = b / 4
        let e: Int = b % 4
        let f: Int = (b + 8) / 25
        let g: Int = (b - f + 1) / 3
        let h: Int = (19 * a + b - d - g + 15) % 30
        let i: Int = c / 4
        let k: Int = c % 4
        let l: Int = (32 + 2 * e + 2 * i - h - k) % 7
        let m: Int = (a + 11 * h + 22 * l) / 451
        let month: Int = (h + l - 7 * m + 114) / 31
        let day: Int = ((h + l - 7 * m + 114) % 31) + 1
        return (month, day)
    }

    private static func key(_ y: Int, _ m: Int, _ d: Int) -> String {
        let mm: String = m < 10 ? "0" + String(m) : String(m)
        let dd: String = d < 10 ? "0" + String(d) : String(d)
        return String(y) + "-" + mm + "-" + dd
    }

    /// Årets fridager (fri = true) og merkedager. → [(dato, navn, fri)]
    static func year(_ y: Int) -> [(String, String, Bool)] {
        let e: (Int, Int) = easter(y)
        let ek: String = key(y, e.0, e.1)
        func off(_ n: Int) -> String { KalD.addKey(ek, n) }
        var out: [(String, String, Bool)] = [
            (key(y, 1, 1), "1. nyttårsdag", true),
            (off(-7), "Palmesøndag", false),
            (off(-3), "Skjærtorsdag", true),
            (off(-2), "Langfredag", true),
            (ek, "1. påskedag", true),
            (off(1), "2. påskedag", true),
            (key(y, 5, 1), "Arbeidernes dag", true),
            (key(y, 5, 17), "Grunnlovsdag", true),
            (off(39), "Kristi himmelfartsdag", true),
            (off(49), "1. pinsedag", true),
            (off(50), "2. pinsedag", true),
            (key(y, 12, 24), "Julaften", false),
            (key(y, 12, 25), "1. juledag", true),
            (key(y, 12, 26), "2. juledag", true),
            (key(y, 12, 31), "Nyttårsaften", false),
        ]
        out.sort { (a: (String, String, Bool), b: (String, String, Bool)) -> Bool in a.0 < b.0 }
        return out
    }

    /// Helligdagene i perioden (inklusive) som heldagshendelser i kalenderen «Helligdager».
    static func list(from: String, to: String) -> [KalEvent] {
        guard from.count >= 4, to.count >= 4, let y0 = Int(from.prefix(4)), let y1 = Int(to.prefix(4)), y1 >= y0, y1 - y0 < 5 else { return [] }
        let cal: String = KalCals39.roleIds["h"] ?? "h"
        var out: [KalEvent] = []
        for y in y0...y1 {
            for (d, n, fri) in year(y) where d >= from && d <= to {
                var ev: KalEvent = KalEvent(id: "hd-" + d, title: n, cal: cal, day: d, s: nil, e: nil)
                ev.kind = fri ? "fri" : "merkedag"
                ev.serverCal = "helligdager"
                out.append(ev)
            }
        }
        return out
    }

    /// Legger inn helligdagene når de beregnes lokalt og serveren ikke har sendt noen.
    static func merge(_ events: [KalEvent], from: String, to: String) -> [KalEvent] {
        guard KalCals39.localHolidays else { return events }
        let h: String = KalCals39.roleIds["h"] ?? "h"
        if events.contains(where: { (e: KalEvent) -> Bool in e.cal == h }) { return events }
        let extra: [KalEvent] = KalHoliday39.list(from: from, to: to)
        var out: [KalEvent] = events + extra
        out.sort { (a: KalEvent, b: KalEvent) -> Bool in
            if a.day != b.day { return a.day < b.day }
            return (a.s ?? -1) < (b.s ?? -1)
        }
        return out
    }
}

/* ---------- Server: Kalendere (1a/1b/1c) ---------- */

struct KalIcsPreview39: Hashable {
    var name: String = ""
    var count: Int = 0
    var subjects: [String] = []
    var error: String = ""
}

enum KalCalAPI39 {
    /// POST /api/kalender/calendars/migration/undo
    static func undoMigration() async -> String {
        do {
            _ = try await KalNet.send("POST", "/api/kalender/calendars/migration/undo", json: [:], timeout: 30)
            return ""
        } catch let e as KalNetError {
            return e.status == 404 ? "Serveren kan ikke angre oppryddingen." : e.message
        } catch {
            return error.localizedDescription
        }
    }

    /// Henter en URL-kalender på nytt (↻ Oppdater nå).
    static func refresh(_ id: String) async -> String {
        do {
            _ = try await KalNet.send("POST", "/api/kalender/calendars/ical/" + KalNet.enc(id) + "/refresh", json: [:], timeout: 40)
            return ""
        } catch let e as KalNetError {
            if e.status == 404 || e.status == 405 {
                do {
                    _ = try await KalNet.send("POST", "/api/kalender/calendars/" + KalNet.enc(id) + "/refresh", json: [:], timeout: 40)
                    return ""
                } catch let e2 as KalNetError {
                    return e2.status == 404 ? "Serveren kan ikke oppdatere denne kalenderen ennå." : e2.message
                } catch {
                    return error.localizedDescription
                }
            }
            return e.message
        } catch {
            return error.localizedDescription
        }
    }

    /// PATCH med de nye feltene. → feilmelding (tom = ok).
    static func save(_ id: String, _ body: [String: Any]) async -> String {
        do {
            _ = try await KalNet.send("PATCH", "/api/kalender/calendars/" + KalNet.enc(id), json: body)
            return ""
        } catch let e as KalNetError {
            return e.message
        } catch {
            return error.localizedDescription
        }
    }

    /// webcal:// eller https://…(.ics)
    static func validIcs(_ s: String) -> Bool {
        let t: String = s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if t.hasPrefix("webcal://") { return t.count > 12 }
        if t.hasPrefix("https://") || t.hasPrefix("http://") { return t.count > 12 }
        return false
    }

    /// Henter iCal-adressen én gang og viser navn, antall og fag før den lagres.
    static func preview(_ raw: String) async -> KalIcsPreview39 {
        var out: KalIcsPreview39 = KalIcsPreview39()
        var s: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.lowercased().hasPrefix("webcal://") { s = "https://" + String(s.dropFirst(9)) }
        guard validIcs(raw), let url = URL(string: s) else {
            out.error = "Lim inn en webcal:// eller https://-adresse (…ics)."
            return out
        }
        var r: URLRequest = URLRequest(url: url)
        r.timeoutInterval = 20
        guard let pair = try? await URLSession.shared.data(for: r) else {
            out.error = "Fikk ikke hentet adressen. Sjekk at den er riktig."
            return out
        }
        let code: Int = (pair.1 as? HTTPURLResponse)?.statusCode ?? 200
        let text: String = String(data: pair.0, encoding: .utf8) ?? String(data: pair.0, encoding: .isoLatin1) ?? ""
        if code >= 400 || !text.contains("BEGIN:VCALENDAR") {
            out.error = "Adressen ga ingen kalender (iCal)."
            return out
        }
        var subjects: [String] = []
        for line in text.components(separatedBy: "\n") {
            let l: String = line.trimmingCharacters(in: CharacterSet(charactersIn: "\r"))
            if l.hasPrefix("X-WR-CALNAME:") { out.name = String(l.dropFirst(13)).trimmingCharacters(in: .whitespaces) }
            else if l.hasPrefix("BEGIN:VEVENT") { out.count += 1 }
            else if l.hasPrefix("SUMMARY"), let c = l.firstIndex(of: ":") {
                let t: String = String(l[l.index(after: c)...]).trimmingCharacters(in: .whitespaces)
                let k: String = fag(t)
                if !k.isEmpty && !subjects.contains(k) && subjects.count < 8 { subjects.append(k) }
            }
        }
        out.subjects = subjects
        if out.name.isEmpty { out.name = KalTone35.guessName(s) }
        return out
    }

    /// Faget fra tittelen («IN1000 – forelesning» → «IN1000», «Matematikk R2» → «Matematikk»).
    static func fag(_ title: String) -> String {
        let t: String = title.replacingOccurrences(of: "\\,", with: ",")
        if let r = t.range(of: "[A-ZÆØÅ]{2,6}[0-9]{3,4}", options: .regularExpression) { return String(t[r]) }
        let first: String = t.split(whereSeparator: { (ch: Character) -> Bool in ch == " " || ch == "-" || ch == "–" || ch == ":" || ch == "," }).first.map { (x: Substring) -> String in String(x) } ?? ""
        return first.count >= 3 ? first : ""
    }
}

/* ---------- Server: «Hvilken kalender er hva?» (1d) ---------- */

struct KalGMapCal39: Identifiable, Hashable {
    let googleId: String
    let name: String
    let color: String
    let access: String
    /// p | b | x (ikke bruk)
    var role: String
    var id: String { googleId }
}

struct KalGMapPreview39: Identifiable, Hashable {
    let id: String
    let name: String
    let parts: [String]
}

struct KalGMap39 {
    var connected: Bool = false
    var email: String = ""
    var calendars: [KalGMapCal39] = []
    var schoolUrl: String = ""
    var schoolStatus: String = ""
    var country: String = "NO"
    var preview: [KalGMapPreview39] = []
    var error: String = ""
    /// Bygget fra prompt 36-oversikten (serveren har ikke mapping ennå) – kan ikke lagres.
    var legacy: Bool = false

    func names(_ role: String) -> [String] {
        calendars.filter { (c: KalGMapCal39) -> Bool in c.role == role }.map { (c: KalGMapCal39) -> String in c.name }
    }

    /// «SLIK BLIR DET I APPEN» – oppdateres live.
    func summary(_ cals: [KalCal]) -> [(String, String, String)] {
        let pn: [String] = names("p")
        let bn: [String] = names("b")
        let p: String = pn.isEmpty ? "Ingen valgt" : pn.joined(separator: " + ") + (pn.count > 1 ? " · slått sammen" : "")
        let b: String = bn.isEmpty ? "Ingen valgt" : bn.joined(separator: " + ")
        let sh: String = schoolUrl.isEmpty ? "Ingen URL ennå" : "Abonnement fra " + KalCals39.host(schoolUrl)
        func col(_ r: String) -> String {
            cals.first(where: { (c: KalCal) -> Bool in KalCals39.role(c) == r })?.hex ?? (KalCals39.colors[r] ?? "#6b665c")
        }
        return [("Personlig", col("p"), p), ("Bursdager", col("b"), b), ("Skole", col("s"), sh),
                ("Helligdager", col("h"), KalCals39.countryName(country) + " · innebygd")]
    }
}

enum KalGMapAPI39 {
    static func parse(_ d: Data) -> KalGMap39 {
        var out: KalGMap39 = KalGMap39()
        let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
        out.connected = KalParse.bool(o, "connected") ?? false
        out.email = KalParse.str(o, "email")
        var seen: Set<String> = []
        for c in KalParse.list(o, "calendars") {
            var gid: String = KalParse.str(c, "googleId")
            if gid.isEmpty { gid = KalParse.str(c, "id") }
            if gid.isEmpty || seen.contains(gid) { continue }
            seen.insert(gid)
            var role: String = KalParse.str(c, "role")
            if role.isEmpty { role = KalParse.str(c, "suggested") }
            if role != "p" && role != "b" { role = "x" }
            var color: String = KalParse.str(c, "color")
            if !(color.count == 7 && color.hasPrefix("#")) { color = "#6b665c" }
            let name: String = KalParse.str(c, "name")
            out.calendars.append(KalGMapCal39(googleId: gid, name: name.isEmpty ? gid : name, color: color, access: KalParse.str(c, "access"), role: role))
        }
        if let s = o["school"] as? [String: Any] {
            out.schoolUrl = KalParse.str(s, "url")
            out.schoolStatus = KalParse.str(s, "status")
        }
        if let h = o["holidays"] as? [String: Any] {
            let c: String = KalParse.str(h, "country")
            if !c.isEmpty { out.country = c }
        }
        for p in KalParse.list(o, "preview") {
            let parts: [String] = (p["parts"] as? [Any])?.compactMap { (x: Any) -> String? in x as? String } ?? []
            out.preview.append(KalGMapPreview39(id: KalParse.str(p, "id"), name: KalParse.str(p, "name"), parts: parts))
        }
        return out
    }

    /// GET /api/kalender/google/mapping. Uten endepunktet (404): bygges fra prompt 36-oversikten (bare visning).
    static func fetch() async -> KalGMap39 {
        do {
            let d: Data = try await KalNet.get("/api/kalender/google/mapping", timeout: 20)
            return parse(d)
        } catch let e as KalNetError {
            if e.status == 404 || e.status == 405 { return await legacy() }
            var out: KalGMap39 = KalGMap39()
            out.error = e.message
            return out
        } catch {
            var out: KalGMap39 = KalGMap39()
            out.error = error.localizedDescription
            return out
        }
    }

    private static func legacy() async -> KalGMap39 {
        let g: KalGoogle36 = await KalGoogleAPI36.fetch()
        var out: KalGMap39 = KalGMap39()
        out.legacy = true
        out.connected = g.connected
        out.email = g.email
        out.error = g.error
        for c in g.calendars {
            let n: String = c.name.lowercased()
            let role: String = n.contains("bursdag") || n.contains("birthday") ? "b" : (c.primary || c.main || c.access == "owner") && !n.contains("helligdag") ? "p" : "x"
            let access: String = c.primary ? "primær · eier" : c.access == "owner" ? "eier" : c.writable ? "kan redigere" : "kan se"
            out.calendars.append(KalGMapCal39(googleId: c.googleId, name: c.name, color: c.color.isEmpty ? "#6b665c" : c.color, access: access, role: role))
        }
        return out
    }

    /// PUT {map:{googleId: 'p'|'b'|null}} → feilmelding (tom = ok, full synk i bakgrunnen).
    static func save(_ m: KalGMap39) async -> String {
        if m.legacy { return "Homelab-serveren må oppdateres for å lagre koblingen." }
        var map: [String: Any] = [:]
        for c in m.calendars {
            if c.role == "x" { map[c.googleId] = NSNull() } else { map[c.googleId] = c.role }
        }
        do {
            _ = try await KalNet.send("PUT", "/api/kalender/google/mapping", json: ["map": map], timeout: 30)
            return ""
        } catch let e as KalNetError {
            return e.status == 404 ? "Homelab-serveren må oppdateres for å lagre koblingen." : e.message
        } catch {
            return error.localizedDescription
        }
    }

    /// PATCH Helligdager-landet fra velgeren.
    static func saveCountry(_ calId: String, _ country: String) async {
        _ = await KalCalAPI39.save(calId, ["country": country])
    }
}
