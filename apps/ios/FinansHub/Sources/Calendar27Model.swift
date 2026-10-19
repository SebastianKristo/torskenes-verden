import SwiftUI
import UIKit

/* ---------------- Prompt 27: Kalender v2 – data, valg og handlinger ---------------- */
// Fasit: design/Kalender.dc.html (variant «mobile», fullskjerm uten toppbilde og uten appens fanelinje) og
// prompts/prompt-27-pakke/claude-code-kalender-v2.md.
// Hendelsene hentes som før av Cal26Model (GET /api/kalender?from=&to=). Her ligger det som er nytt i v2:
// visningene Dag · 3 dager · Uke · Måned · Liste, valgt dag, minikalender, søk (GET /api/kalender/search),
// ny/rediger/slett (POST/PATCH/DELETE /api/kalender/events) og «Kopier til Privat» (POST /events/:id/copy).
// Av/på for kalenderne er Cal26Model.hiddenFilters (layout-feltet kalFilters).

/// Én kalender i minikalenderen (fra `calendars` i svaret, ellers standardlisten).
struct Cal27Calendar: Identifiable, Hashable {
    var id: String
    var name: String
    var color: String
    var writable: Bool
    var source: String

    static let defaults: [Cal27Calendar] = [
        Cal27Calendar(id: "timeplan", name: "Timeplan", color: "#2b5d8a", writable: false, source: "Skolens iCal"),
        Cal27Calendar(id: "prover", name: "Prøver og frister", color: "#b23a2a", writable: false, source: "Skolens iCal"),
        Cal27Calendar(id: "skole", name: "Skole", color: "#a8661a", writable: false, source: "Skolens iCal"),
        Cal27Calendar(id: "privat", name: "Privat", color: "#6b4fa0", writable: true, source: "Google Kalender"),
        Cal27Calendar(id: "familie", name: "Familie", color: "#d08a1e", writable: true, source: "Google · delt med familien"),
        Cal27Calendar(id: "bursdager", name: "Bursdager", color: "#3f7a6e", writable: false, source: "Bursdager-modulen"),
    ]
}

/// Skjemaet for ny eller endret hendelse.
struct Cal27Form: Identifiable {
    var id: String = UUID().uuidString
    /// Hendelsen som redigeres (nil = ny).
    var eventId: String? = nil
    var title: String = ""
    var allDay: Bool = false
    var date: Date = Date()
    var start: Date = Date()
    var end: Date = Date().addingTimeInterval(3600)
    var location: String = ""
    var calendar: String = "privat"
    var repeatRule: String = "none"
    var reminder: String = "15m"
    var note: String = ""
    var error: String = ""
}

/// En hendelse plassert i rutenettet: kolonne c av n når flere overlapper.
struct Cal27Slot: Identifiable {
    let e: CalEvent26
    let a: Int
    let b: Int
    var c: Int
    var n: Int
    var id: String { e.id }
}

@MainActor
@Observable
final class Cal27Model {
    static let shared = Cal27Model()

    /// (id, navn, hurtigtast) i fanelinjen nederst.
    nonisolated static let views: [(String, String, String)] = [("dag", "Dag", "calendar.day.timeline.left"), ("3dager", "3 dager", "rectangle.split.3x1"),
                                                                ("uke", "Uke", "calendar"), ("maaned", "Måned", "square.grid.3x3"), ("liste", "Liste", "list.bullet")]
    nonisolated static let reminders: [(String, String)] = [("none", "Ingen"), ("15m", "15 min"), ("1h", "1 time"), ("day", "Dagen før")]
    nonisolated static let repeats: [(String, String)] = [("none", "Ingen"), ("daily", "Hver dag"), ("weekly", "Hver uke"), ("monthly", "Hver måned")]

    var view: String = "3dager"
    /// Valgt dag («2026-10-22»), nil = i dag.
    var cur: String? = nil
    var mini: Bool = false
    var miniOff: Int = 0
    /// Hendelsen i detaljarket.
    var sel: CalEvent26? = nil
    var form: Cal27Form? = nil
    var searchOpen: Bool = false
    var query: String = ""
    var results: [CalEvent26] = []
    var searching: Bool = false
    var calendars: [Cal27Calendar] = Cal27Calendar.defaults
    var saving: Bool = false
    var delArm: Bool = false
    /// Google-tokenet mangler skrivetilgang (409 reconnect).
    var reconnect: Bool = false
    var toast: String = ""
    /// Øker når rutenettet skal rulle til nå (ny visning eller I dag).
    var scrollTick: Int = 0

    @ObservationIgnored private var api: API? = nil
    @ObservationIgnored private var loadedFrom: String = ""
    @ObservationIgnored private var loadedTo: String = ""
    @ObservationIgnored private var searchTask: Task<Void, Never>? = nil
    @ObservationIgnored private var toastTask: Task<Void, Never>? = nil
    @ObservationIgnored private var viewRead: Bool = false

    private var localKey: String { AcctScope.key("fh_kal27") }

    private var base: Cal26Model { Cal26Model.shared }

    /* ---------- Fra serveren ---------- */

    /// `calendars` i svaret fra /api/kalender, og perioden som er hentet.
    func applyServer(_ o: [String: Any], from: String, to: String) {
        if loadedFrom.isEmpty || from < loadedFrom { loadedFrom = from }
        if loadedTo.isEmpty || to > loadedTo { loadedTo = to }
        let list: [[String: Any]] = JS.list(o, "calendars")
        if list.isEmpty { return }
        var out: [Cal27Calendar] = []
        for c in list {
            guard let raw = JS.str(c, "id") else { continue }
            let id: String = Cal26.normCal(raw)
            let def: Cal27Calendar? = Cal27Calendar.defaults.first(where: { $0.id == id })
            let name: String = JS.str(c, "name") ?? def?.name ?? raw
            let color: String = JS.str(c, "color") ?? def?.color ?? "#7a7468"
            let w: Bool = JS.bool(c, "writable") ?? def?.writable ?? false
            let src: String = JS.str(c, "source") ?? def?.source ?? ""
            if !out.contains(where: { $0.id == id }) { out.append(Cal27Calendar(id: id, name: name, color: color, writable: w, source: src)) }
        }
        for d in Cal27Calendar.defaults where !out.contains(where: { $0.id == d.id }) { out.append(d) }
        calendars = out
    }

    /// kalView fra layout: dag, 3dager, uke, maaned eller liste (agenda → liste).
    func applyView(_ v: String) {
        if let n = Cal27Model.normView(v) {
            view = n
            viewRead = true
        }
    }

    nonisolated static func normView(_ v: String) -> String? {
        switch v {
        case "dag", "day": return "dag"
        case "3dager", "3d": return "3dager"
        case "uke", "week": return "uke"
        case "maaned", "mnd", "måned", "month": return "maaned"
        case "liste", "agenda", "list": return "liste"
        default: return nil
        }
    }

    func boot(_ store: Store) async {
        api = store.api
        if !viewRead, let v = UserDefaults.standard.string(forKey: localKey), let n = Cal27Model.normView(v) { view = n }
        await base.load(store)
        scrollTick += 1
    }

    /// Henter mer når brukeren blar utenfor perioden som er hentet (±42/120 dager).
    func ensure(_ d: Date) {
        guard let api, !loadedFrom.isEmpty else { return }
        let k0: String = Cal26.key(Cal26.add(d, -7))
        let k1: String = Cal26.key(Cal26.add(d, 50))
        if k0 >= loadedFrom && k1 <= loadedTo { return }
        let from: String = Cal26.key(Cal26.add(d, -42))
        let to: String = Cal26.key(Cal26.add(d, 90))
        Task {
            guard let data = try? await api.callAt("/api", "GET", "/kalender?from=\(from)&to=\(to)", timeout: 20) else { return }
            let r = Cal26.parse(data)
            var all: [CalEvent26] = self.base.events
            let have: Set<String> = Set(all.map { $0.id })
            for e in r.events where !have.contains(e.id) { all.append(e) }
            all.sort { a, b in a.start < b.start }
            self.base.events = all
            if from < self.loadedFrom { self.loadedFrom = from }
            if to > self.loadedTo { self.loadedTo = to }
        }
    }

    /* ---------- Avledet ---------- */

    var curD: Date { cur.map { Cal26.day($0) } ?? Cal26.day(Cal26.key(Date())) }

    var days: Int { view == "dag" ? 1 : view == "3dager" ? 3 : 7 }

    var hourH: CGFloat { view == "dag" ? 64 : view == "3dager" ? 56 : 46 }

    var isGrid: Bool { view == "dag" || view == "3dager" || view == "uke" }

    /// Første dag i rutenettet (mandag i Uke).
    var gridStart: Date {
        let c: Date = curD
        if view == "uke" { return Cal26.add(c, -((Cal26.jsDay(c) + 6) % 7)) }
        return c
    }

    var gridKey: String { view + "|" + Cal26.key(gridStart) }

    func on(_ key: String) -> [CalEvent26] { base.on(key) }

    func calendar(_ id: String) -> Cal27Calendar {
        calendars.first(where: { $0.id == id }) ?? Cal27Calendar.defaults.first(where: { $0.id == id }) ?? Cal27Calendar(id: id, name: id, color: "#7a7468", writable: false, source: "")
    }

    /// Timer i fagfargen, prøver og frister røde, resten i kalenderens farge.
    func hex(_ e: CalEvent26) -> String {
        if e.type == "time" { return base.hex(e) }
        if e.isTest { return Cal26.red }
        return calendar(e.group).color
    }

    func isHidden(_ cal: String) -> Bool { base.hiddenFilters.contains(cal) }

    /// «Oktober», «Okt–nov» og året øverst.
    var title: (String, String) {
        let a: Date = isGrid ? gridStart : curD
        let b: Date = isGrid ? Cal26.add(gridStart, days - 1) : curD
        let c: Calendar = Cal26.cal
        let ma: Int = c.component(.month, from: a) - 1
        let mb: Int = c.component(.month, from: b) - 1
        let t: String = ma == mb ? Cal26.cap(Cal26.monthsLong[ma]) : Cal26.cap(Cal26.monthsShort[ma]) + "–" + Cal26.monthsShort[mb]
        return (t, String(c.component(.year, from: b)))
    }

    /* ---------- Navigasjon ---------- */

    func setView(_ v: String, _ store: Store) {
        guard Cal27Model.views.contains(where: { $0.0 == v }) else { return }
        view = v
        sel = nil
        mini = false
        scrollTick += 1
        Haptics.shared.select()
        UserDefaults.standard.set(v, forKey: localKey)
        let a: API = store.api
        Task { _ = try? await a.callAt("/api", "PUT", "/me/layout", json: ["kalView": v]) }
    }

    func shift(_ dir: Int) {
        let c: Date = curD
        var n: Date
        if view == "maaned" {
            let comps: DateComponents = Cal26.cal.dateComponents([.year, .month], from: c)
            let first: Date = Cal26.cal.date(from: comps) ?? c
            n = Cal26.cal.date(byAdding: .month, value: dir, to: first) ?? c
            n = Cal26.day(Cal26.key(n))
        } else {
            let step: Int = view == "dag" ? 1 : view == "3dager" ? 3 : view == "uke" ? 7 : 14
            n = Cal26.add(c, dir * step)
        }
        cur = Cal26.key(n)
        sel = nil
        Haptics.shared.select()
        ensure(n)
    }

    func goToday() {
        cur = nil
        mini = false
        sel = nil
        scrollTick += 1
        Haptics.shared.select()
    }

    func goDay(_ key: String) {
        cur = key
        view = "dag"
        mini = false
        miniOff = 0
        scrollTick += 1
        Haptics.shared.select()
        ensure(Cal26.day(key))
    }

    /// Prompt 30: fra nedtrekks-minikalenderen beholdes Dag/3 dager/Uke; fra Måned eller Liste går den til Dag.
    func pickMini(_ key: String) {
        cur = key
        if !isGrid { view = "dag" }
        mini = false
        miniOff = 0
        scrollTick += 1
        Haptics.shared.select()
        ensure(Cal26.day(key))
    }

    func open(_ e: CalEvent26) {
        delArm = false
        sel = e
        mini = false
        Haptics.shared.select()
    }

    /// finanshub://kalender/<id>: dagen og detaljarket.
    func openFromLink(_ e: CalEvent26) {
        cur = e.dayKey
        if !isGrid { view = "dag" }
        sel = e
        scrollTick += 1
    }

    func toggleCal(_ id: String) { base.toggleFilter(id) }

    func flash(_ t: String) {
        toast = t
        toastTask?.cancel()
        toastTask = Task {
            try? await Task.sleep(nanoseconds: 1_900_000_000)
            if !Task.isCancelled { self.toast = "" }
        }
    }

    /* ---------- Ny / rediger ---------- */

    private static func at(_ d: Date, _ minutes: Int) -> Date {
        Cal26.startOfDay(d).addingTimeInterval(TimeInterval(minutes * 60))
    }

    /// Ny hendelse: valgt dag og neste halvtime (eller tidspunktet som ble trykket i rutenettet).
    func newEvent(day: String? = nil, minute: Int? = nil) {
        let d: Date = day.map { Cal26.day($0) } ?? curD
        let now: Date = Date()
        var st: Int = minute ?? Int((Double(Cal26.minutes(now)) / 30).rounded(.up)) * 30
        st = Swift.min(st, 22 * 60)
        var f = Cal27Form()
        f.date = d
        f.start = Cal27Model.at(d, st)
        f.end = Cal27Model.at(d, Swift.min(st + 60, 23 * 60 + 55))
        f.calendar = "privat"
        sel = nil
        form = f
        Haptics.shared.tap()
    }

    func edit(_ e: CalEvent26) {
        var f = Cal27Form()
        f.eventId = e.id
        f.title = e.title
        f.allDay = e.allDay || e.startMin < 0
        f.date = Cal26.day(e.dayKey)
        f.start = e.startMin >= 0 ? e.start : Cal27Model.at(f.date, 9 * 60)
        f.end = e.startMin >= 0 ? e.end : Cal27Model.at(f.date, 10 * 60)
        f.location = e.roomFull.isEmpty ? e.room : e.roomFull
        f.calendar = e.group == "familie" ? "familie" : "privat"
        f.note = e.note
        f.reminder = base.reminder(e)
        let r: String = e.recurrence.uppercased()
        f.repeatRule = r.contains("DAILY") ? "daily" : r.contains("WEEKLY") ? "weekly" : r.contains("MONTHLY") ? "monthly" : "none"
        sel = nil
        form = f
    }

    private func hmText(_ d: Date) -> String { Cal26.hm(Cal26.minutes(d)) }

    func save(_ store: Store) {
        guard var f = form else { return }
        let t: String = f.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { f.error = "Skriv en tittel."; form = f; return }
        if !f.allDay && Cal26.minutes(f.end) <= Cal26.minutes(f.start) { f.error = "Slutt må være etter start."; form = f; return }
        let dateKey: String = Cal26.key(f.date)
        var body: [String: Any] = ["title": t, "allDay": f.allDay, "date": dateKey, "start": hmText(f.start), "end": hmText(f.end),
                                   "location": f.location.trimmingCharacters(in: .whitespaces), "calendar": f.calendar,
                                   "repeat": f.repeatRule, "reminder": f.reminder, "note": f.note]
        if f.allDay { body["endDate"] = dateKey }
        let path: String = f.eventId.map { "/kalender/events/" + Cal27Model.enc($0) } ?? "/kalender/events"
        let method: String = f.eventId == nil ? "POST" : "PATCH"
        let editId: String? = f.eventId
        let rem: String = f.reminder
        let payload: [String: Any] = body
        saving = true
        reconnect = false
        Task {
            do {
                let d: Data = try await store.api.callAt("/api", method, path, json: payload, timeout: 20)
                let o: [String: Any] = JS.obj(d)
                let newId: String? = JS.str(o, "id") ?? JS.str(JS.dict(o, "event"), "id") ?? editId
                self.form = nil
                self.cur = dateKey
                await self.base.load(store, force: true)
                if let id = newId, let e = self.base.events.first(where: { $0.id == id }), rem != self.base.reminder(e) {
                    self.base.setReminder(e, rem)
                }
                self.flash(editId == nil ? "Hendelsen er lagret" : "Endringen er lagret")
                // Prompt 33: ny tittel på en rask time → forslag om å huske avsenderen (lagres bare med «Husk»).
                if editId != nil { Memory33Model.shared.suggest(JS.dict(o, "suggestMemory")) }
                Haptics.shared.success()
            } catch let e as APIError {
                if var ff = self.form {
                    if e.status == 409 {
                        self.reconnect = true
                        ff.error = "Google-kontoen må kobles til på nytt for å skrive til kalenderen."
                    } else if e.status == 404 {
                        ff.error = "Serveren kan ikke lagre hendelser ennå. Oppdater homelab-serveren."
                    } else {
                        ff.error = e.message
                    }
                    self.form = ff
                }
                Haptics.shared.error()
            } catch {
                if var ff = self.form { ff.error = error.localizedDescription; self.form = ff }
            }
            self.saving = false
        }
    }

    /// Slett: første trykk spør, andre sletter.
    func delete(_ e: CalEvent26, _ store: Store) {
        if !delArm { delArm = true; Haptics.shared.warning(); return }
        delArm = false
        Task {
            do {
                _ = try await store.api.callAt("/api", "DELETE", "/kalender/events/" + Cal27Model.enc(e.id), timeout: 20)
                self.sel = nil
                self.base.events.removeAll { $0.id == e.id }
                await self.base.load(store, force: true)
                self.flash("Hendelsen er slettet")
            } catch let er as APIError {
                self.flash(er.status == 409 ? "Koble til Google på nytt i Innstillinger → Kalendere" : er.message)
            } catch {
                self.flash(error.localizedDescription)
            }
        }
    }

    func copyToPrivate(_ e: CalEvent26, _ store: Store) {
        Task {
            do {
                _ = try await store.api.callAt("/api", "POST", "/kalender/events/" + Cal27Model.enc(e.id) + "/copy", json: [:], timeout: 20)
                self.sel = nil
                await self.base.load(store, force: true)
                self.flash("Kopiert til Privat")
                Haptics.shared.success()
            } catch let er as APIError {
                if er.status == 409 { self.reconnect = true }
                self.flash(er.status == 409 ? "Koble til Google på nytt i Innstillinger → Kalendere" : er.message)
            } catch {
                self.flash(error.localizedDescription)
            }
        }
    }

    nonisolated static func enc(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#"))) ?? s
    }

    /* ---------- Søk ---------- */

    func openSearch() {
        query = ""
        results = []
        searchOpen = true
        mini = false
    }

    /// Søk med 200 ms pause: serveren (±180 dager, uklart), ellers lokalt i det som er hentet.
    func search(_ store: Store) {
        searchTask?.cancel()
        let q: String = query.trimmingCharacters(in: .whitespaces)
        if q.count < 2 { results = []; searching = false; return }
        searching = true
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 200_000_000)
            if Task.isCancelled { return }
            let qq: String = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
            var out: [CalEvent26] = []
            if let d = try? await store.api.callAt("/api", "GET", "/kalender/search?q=\(qq)", timeout: 15) {
                out = Cal26.parse(d).events
            } else {
                out = self.localSearch(q)
            }
            if Task.isCancelled { return }
            self.results = Array(out.prefix(60))
            self.searching = false
        }
    }

    func clearSearch() {
        searchTask?.cancel()
        query = ""
        results = []
        searching = false
    }

    private func localSearch(_ q: String) -> [CalEvent26] {
        let n: String = q.lowercased().folding(options: .diacriticInsensitive, locale: Locale(identifier: "nb_NO"))
        let today: String = Cal26.key(Cal26.add(Date(), -7))
        return base.events.filter { e in
            if e.dayKey < today { return false }
            let hay: String = (e.title + " " + e.room + " " + e.teacher + " " + e.note + " " + e.subject).lowercased()
                .folding(options: .diacriticInsensitive, locale: Locale(identifier: "nb_NO"))
            return hay.contains(n)
        }
    }

    func pickResult(_ e: CalEvent26) {
        searchOpen = false
        cur = e.dayKey
        if !isGrid { view = "dag" }
        scrollTick += 1
        ensure(Cal26.day(e.dayKey))
        Task {
            try? await Task.sleep(nanoseconds: 450_000_000)
            self.sel = e
        }
    }

    /* ---------- Rutenett: overlapp side om side ---------- */

    nonisolated static func inAllRow(_ e: CalEvent26) -> Bool { e.allDay || e.startMin < 0 || e.type == "innl" }

    /// Som `lay` i fasiten: grupper som overlapper får kolonner, og alle i gruppen deler bredden.
    nonisolated static func layout(_ list: [CalEvent26]) -> [Cal27Slot] {
        var t: [Cal27Slot] = list.filter { !inAllRow($0) }.map { (e: CalEvent26) -> Cal27Slot in
            Cal27Slot(e: e, a: e.startMin, b: Swift.max(e.endMin, e.startMin + 20), c: 0, n: 1)
        }
        t.sort { x, y in x.a != y.a ? x.a < y.a : x.b > y.b }
        var out: [Cal27Slot] = []
        var grp: [Cal27Slot] = []
        var end: Int = -1
        func flush() {
            var cols: [Int] = []
            var placed: [Cal27Slot] = []
            for var x in grp {
                var c: Int = -1
                for (i, tEnd) in cols.enumerated() where tEnd <= x.a { c = i; break }
                if c < 0 { c = cols.count; cols.append(0) }
                cols[c] = x.b
                x.c = c
                placed.append(x)
            }
            for var x in placed {
                x.n = cols.count
                out.append(x)
            }
            grp = []
        }
        for x in t {
            if !grp.isEmpty && x.a >= end { flush(); end = -1 }
            grp.append(x)
            end = Swift.max(end, x.b)
        }
        if !grp.isEmpty { flush() }
        return out
    }

    /* ---------- NESTE / NÅ ---------- */

    struct Next {
        var kicker: String = ""
        var title: String = "Ingen kommende hendelser"
        var sub: String = "De neste tre ukene"
        var when: String = ""
        var hex: String = "#7a7468"
        var event: CalEvent26? = nil
    }

    nonisolated static func dur(_ x: Int) -> String {
        if x < 60 { return "\(x) min" }
        if x < 1440 { return "\(x / 60) t" + (x % 60 > 0 ? " \(x % 60) min" : "") }
        return "\(Int((Double(x) / 1440).rounded())) d"
    }

    /// Neste hendelse med klokkeslett uansett type (time først når de starter likt), eller den som pågår.
    func next(_ now: Date) -> Next {
        let nm: Int = Cal26.minutes(now)
        for i in 0..<21 {
            let d: Date = Cal26.add(now, i)
            let list: [CalEvent26] = on(Cal26.key(d)).filter { !Cal27Model.inAllRow($0) }
                .sorted { x, y in x.startMin != y.startMin ? x.startMin < y.startMin : (x.type == "time" && y.type != "time") }
            for e in list {
                let a: Int = e.startMin + i * 1440
                let b: Int = e.endMin + i * 1440
                if b <= nm { continue }
                var n = Next()
                let isCur: Bool = a <= nm
                n.kicker = isCur ? "NÅ" : "NESTE"
                n.title = e.title
                n.hex = hex(e)
                let dayT: String = i == 0 ? "I dag" : i == 1 ? "I morgen" : Cal26.cap(Cal26.dLong(d))
                n.sub = dayT + " · " + e.startText + "–" + e.endText + (e.room.isEmpty ? "" : " · " + e.room)
                if isCur {
                    n.when = Cal27Model.dur(b - nm) + " igjen"
                } else if a - nm < 1440 {
                    n.when = "om " + Cal27Model.dur(a - nm)
                } else {
                    n.when = String(Cal26.cap(Cal26.weekdays[Cal26.jsDay(d)]).prefix(3))
                }
                n.event = e
                return n
            }
        }
        return Next()
    }
}

extension Store {
    /// Prompt 27: Kalender og Chat vises i fullskjerm uten toppbilde og uten appens fanelinje.
    var full27: Bool {
        (paperTab == "kalender" || paperTab == "chat") && paperClassic == nil && paperFin == nil && !newsOpen && dishSel == nil
    }
}

/// Hvor Kalender og Chat ble åpnet fra, så ‹ går tilbake dit (Hjem, Mer, Finans …).
@MainActor
enum Nav27 {
    static var from: [String: String] = [:]

    /// Kalles fra Store.paperGo før fanen byttes.
    static func note(from: String, to: String) {
        // Innstillinger → Kalendere åpnet fra Kalender går tilbake hit; da beholdes det opprinnelige stedet.
        if to == "kalender" && from == "innst-kal" { return }
        if (to == "kalender" || to == "chat") && from != to && from != "kalender" && from != "chat" { self.from[to] = from }
    }

    static func back(_ store: Store) {
        let page: String = store.paperTab
        let t: String = from[page] ?? (page == "kalender" ? "mer" : "hjem")
        from[page] = nil
        if store.paperIsFinanceTab27(t) { store.paperFinGo(t) } else { store.paperGo(t) }
    }
}

extension Store {
    fileprivate func paperIsFinanceTab27(_ t: String) -> Bool {
        t == "budsjett" || t == "kontoer"
    }
}
