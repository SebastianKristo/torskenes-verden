import SwiftUI
import UIKit
import WidgetKit

/* ---------------- Prompt 33: Kalender – tilstanden i appen (renderVals/put/events i fasiten) ---------------- */
// Sannheten ligger på Homelab-serveren (/api/kalender). Appen holder en buffer for offline-visning og widgetene,
// pluss det serveren ikke lagrer: valgt app-kalender per hendelse, Glimt-teksten, skjulte hendelser og varsel per hendelse.

struct KalToast: Equatable {
    let id: Int
    let text: String
    let undoId: String
}

/// Skjemaet «Ny hendelse».
struct KalNewForm: Equatable {
    var title: String = ""
    var loc: String = ""
    var day: Date = Date()
    var allDay: Bool = false
    var start: Date = Date()
    var end: Date = Date()
    var cal: String = "p"
    var rem: Int? = 60
}

@MainActor
@Observable
final class KalStore {
    static let shared: KalStore = KalStore()

    /* ---------- Innlogging ---------- */
    var loggedIn: Bool = KalGroup.token != nil
    var userName: String = KalGroup.user

    /* ---------- Data ---------- */
    var cals: [KalCal] = KalCals.defaults
    /// true når kalenderne kom fra /api/kalender/calendars.
    var serverCals: Bool = false
    var events: [KalEvent] = []
    var wx: [String: KalWxDay] = [:]
    var loading: Bool = false
    var lastError: String = ""
    var updated: Date? = nil

    /// Avledet: synlige hendelser per dag (med FORTS.-kopier), sortert heldag først.
    private(set) var byDay: [String: [KalEvent]] = [:]
    /// Alle hendelser (også skjulte kalendere) etter lokale endringer.
    private(set) var all: [KalEvent] = []

    /* ---------- Visning ---------- */
    var view: String = UserDefaults.standard.string(forKey: "kal.view") ?? "mnd" {
        didSet { UserDefaults.standard.set(view, forKey: "kal.view") }
    }
    var anchor: String = KalD.todayKey()
    var showWeeks: Bool = (UserDefaults.standard.object(forKey: "kal.sw") as? Bool) ?? true {
        didSet { UserDefaults.standard.set(showWeeks, forKey: "kal.sw") }
    }
    var showWx: Bool = (UserDefaults.standard.object(forKey: "kal.swx") as? Bool) ?? true {
        didSet { UserDefaults.standard.set(showWx, forKey: "kal.swx") }
    }
    /// Standardvarsel for nye hendelser (minutter, -1 = ingen).
    var defRemRaw: Int = (UserDefaults.standard.object(forKey: "kal.drem") as? Int) ?? 60 {
        didSet { UserDefaults.standard.set(defRemRaw, forKey: "kal.drem") }
    }
    var defRem: Int? { defRemRaw < 0 ? nil : defRemRaw }
    /// system | light | dark (kalapp_th i fasiten).
    var theme: String = UserDefaults.standard.string(forKey: "kalapp_th") ?? "system" {
        didSet { UserDefaults.standard.set(theme, forKey: "kalapp_th") }
    }

    /* ---------- Ark og paneler ---------- */
    var drawerOpen: Bool = false
    var searchOpen: Bool = false
    var query: String = ""
    var searchCal: String? = nil
    var detId: String? = nil
    /// Hendelse fra en lenke som ikke fantes i kalenderen (arket viser data fra lenken).
    var linkEvent: KalEvent? = nil
    var newForm: KalNewForm? = nil
    var glimtOpen: Bool = false
    var toast: KalToast? = nil
    /// «◀ Homelab» når appen ble åpnet fra Homelab.
    var fromHomelab: Bool = false

    /* ---------- Lokale tillegg (lagres på enheten) ---------- */
    @ObservationIgnored private var pending: [KalEvent] = KalStore.loadList("kal.pending")
    @ObservationIgnored private var hiddenIds: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "kal.del") ?? [])
    @ObservationIgnored private var remOverride: [String: Int] = (UserDefaults.standard.dictionary(forKey: "kal.rem") as? [String: Int]) ?? [:]
    @ObservationIgnored private var calOverride: [String: String] = (UserDefaults.standard.dictionary(forKey: "kal.calOf") as? [String: String]) ?? [:]
    @ObservationIgnored private var srcOf: [String: String] = (UserDefaults.standard.dictionary(forKey: "kal.src") as? [String: String]) ?? [:]
    @ObservationIgnored private var calOn: [String: Bool] = (UserDefaults.standard.dictionary(forKey: "kal.calOn") as? [String: Bool]) ?? [:]
    @ObservationIgnored private var toastSeq: Int = 0
    /// Hendelser serveren avviste (f.eks. Google ikke koblet til): prøves ikke igjen før appen startes på nytt.
    @ObservationIgnored private var noRetry: Set<String> = []
    @ObservationIgnored private var poll: Timer? = nil
    @ObservationIgnored private var loadedFrom: String = ""
    @ObservationIgnored private var loadedTo: String = ""

    init() {
        if let snap = KalNet.loadSnapshot() {
            if !snap.cals.isEmpty { cals = snap.cals }
            events = snap.events.filter { (e: KalEvent) -> Bool in !e.pending }
            var w: [String: KalWxDay] = [:]
            for d in snap.wx { w[d.day] = d }
            wx = w
        }
        applyCalOn()
        rebuild()
    }

    /* ---------- Innlogging ---------- */

    /// Ved oppstart og kalender://login: bruk Homelab-appens token hvis appen ikke er logget inn selv.
    func bootstrap() {
        if KalGroup.token != nil {
            loggedIn = true
            userName = KalGroup.user
            return
        }
        if UserDefaults.standard.bool(forKey: "kal.noAuto") { return }
        adoptHomelab()
    }

    @discardableResult
    func adoptHomelab() -> Bool {
        guard let t = KalGroup.homelabToken, !KalGroup.homelabBases.isEmpty else { return false }
        KalGroup.saveSession(bases: KalGroup.homelabBases, token: t, user: KalGroup.homelabUser, via: "homelab")
        UserDefaults.standard.set(false, forKey: "kal.noAuto")
        loggedIn = true
        userName = KalGroup.homelabUser
        Task { await self.load(force: true) }
        return true
    }

    func didLogin(bases: [String], token: String, user: String) {
        KalGroup.saveSession(bases: bases, token: token, user: user, via: "login")
        UserDefaults.standard.set(false, forKey: "kal.noAuto")
        loggedIn = true
        userName = user
        Task { await self.load(force: true) }
    }

    func logout() {
        KalGroup.clearSession()
        UserDefaults.standard.set(true, forKey: "kal.noAuto")
        loggedIn = false
        events = []
        rebuild()
        WidgetCenter.shared.reloadAllTimelines()
    }

    /* ---------- Henting ---------- */

    /// Henter perioden rundt det man ser på (−6 uker … +16 uker), kalenderne og været.
    func load(force: Bool = false) async {
        guard loggedIn else { return }
        let a: String = anchor < KalD.todayKey() ? anchor : KalD.todayKey()
        let from: String = KalD.addKey(a, -42)
        let to: String = KalD.addKey(anchor > KalD.todayKey() ? anchor : KalD.todayKey(), 112)
        if !force && from >= loadedFrom && to <= loadedTo && !loadedFrom.isEmpty { return }
        loading = true
        defer { loading = false }
        if let list = await KalNet.calendars() {
            serverCals = true
            cals = list
        } else {
            serverCals = false
            mergeLocalCals()
        }
        applyCalOn()
        let ids: Set<String> = Set(cals.map { (c: KalCal) -> String in c.id })
        do {
            let list: [KalEvent] = try await KalNet.events(from: from, to: to, calIds: ids)
            events = list
            loadedFrom = from
            loadedTo = to
            lastError = ""
            updated = Date()
            // Hendelser i kalendere som ikke er i listen (serverens kalendere uten visnings-id): faste farger lokalt.
            for e in list where !cals.contains(where: { (c: KalCal) -> Bool in c.id == e.cal }) {
                if let d = KalCals.defaults.first(where: { (c: KalCal) -> Bool in c.id == e.cal }) { cals.append(d) }
            }
            applyCalOn()
        } catch let e as KalNetError {
            lastError = e.message
            if e.status == 401 {
                lastError = "Innloggingen er utløpt. Logg inn på nytt."
                // Homelab-appen har laget et nytt token (f.eks. etter at det gamle ble trukket tilbake).
                if let hl = KalGroup.homelabToken, hl != KalGroup.token, adoptHomelab() { return }
            }
        } catch {
            lastError = error.localizedDescription
        }
        let w: [KalWxDay] = await KalNet.weather(from: KalD.todayKey(), to: KalD.addKey(KalD.todayKey(), 15))
        if !w.isEmpty {
            var o: [String: KalWxDay] = [:]
            for d in w { o[d.day] = d }
            wx = o
        }
        await flushPending()
        rebuild()
        saveSnapshot()
    }

    /// Hver 60. sekund mens appen er åpen (endringer fra Homelab vises uten å dra ned).
    func startPolling() {
        poll?.invalidate()
        poll = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { (_: Timer) in
            Task { @MainActor in await KalStore.shared.load(force: true) }
        }
    }

    func stopPolling() {
        poll?.invalidate()
        poll = nil
    }

    /// Egne lokale kalendere når serveren ikke har kalender-API-et.
    private func mergeLocalCals() {
        var list: [KalCal] = KalCals.defaults
        let extra: [KalCal] = KalStore.loadCals("kal.localCals")
        for c in extra where !list.contains(where: { (x: KalCal) -> Bool in x.id == c.id }) { list.append(c) }
        cals = list
    }

    private func applyCalOn() {
        for i in 0..<cals.count {
            if let v = calOn[cals[i].id] { cals[i].on = v }
        }
    }

    /* ---------- Avledet ---------- */

    func cal(_ id: String) -> KalCal? { cals.first { (c: KalCal) -> Bool in c.id == id } ?? cals.first }

    private func isOn(_ id: String) -> Bool { cals.first { (c: KalCal) -> Bool in c.id == id }?.on ?? true }

    /// Bygger byDay og all etter endringer.
    func rebuild() {
        var list: [KalEvent] = []
        for var e in events + pending {
            if hiddenIds.contains(e.id) { continue }
            if let r = remOverride[e.id] { e.rem = r < 0 ? nil : r }
            if let c = calOverride[e.id] { e.cal = c }
            if let s = srcOf[e.id], e.src.isEmpty { e.src = s }
            list.append(e)
        }
        all = list
        var map: [String: [KalEvent]] = [:]
        for e in list where isOn(e.cal) {
            let n: Int = Swift.max(1, e.days)
            for i in 0..<n {
                let k: String = i == 0 ? e.day : KalD.addKey(e.day, i)
                var x: KalEvent = e
                if i > 0 { x.cont = true }
                map[k, default: []].append(x)
            }
        }
        for (k, v) in map {
            map[k] = v.sorted { (a: KalEvent, b: KalEvent) -> Bool in
                if a.allDay != b.allDay { return a.allDay }
                return (a.s ?? 0) < (b.s ?? 0)
            }
        }
        byDay = map
        for i in 0..<cals.count {
            let id: String = cals[i].id
            let today: String = KalD.todayKey()
            let last: String = KalD.addKey(today, 30)
            cals[i].count = list.filter { (e: KalEvent) -> Bool in e.cal == id && e.day >= today && e.day <= last }.count
        }
        KalNotify.reschedule(upcoming(limit: 200, includeHidden: false))
    }

    func on(_ key: String) -> [KalEvent] { byDay[key] ?? [] }

    /// Kommende hendelser (ikke ferdige), sortert.
    func upcoming(limit: Int = 50, includeHidden: Bool = false) -> [KalEvent] {
        let tk: String = KalD.todayKey()
        let nm: Int = KalD.minutesNow()
        let last: String = KalD.addKey(tk, 120)
        let list: [KalEvent] = all.filter { (e: KalEvent) -> Bool in
            if !includeHidden && !isOn(e.cal) { return false }
            if e.day > last { return false }
            if e.day > tk { return true }
            if e.day == tk { return e.allDay || e.endMin > nm }
            return false
        }
        let sorted: [KalEvent] = list.sorted { (a: KalEvent, b: KalEvent) -> Bool in
            if a.day != b.day { return a.day < b.day }
            if a.allDay != b.allDay { return a.allDay }
            return (a.s ?? 0) < (b.s ?? 0)
        }
        return Array(sorted.prefix(limit))
    }

    func event(_ id: String) -> KalEvent? {
        if let e = all.first(where: { (x: KalEvent) -> Bool in x.id == id }) { return e }
        if let l = linkEvent, l.id == id { return l }
        return nil
    }

    func weather(_ key: String) -> KalWxDay? { showWx ? wx[key] : nil }

    /* ---------- Navigering ---------- */

    func go(view v: String, day: String? = nil) {
        KalHaptic.tap()
        withAnimation(.easeOut(duration: 0.2)) {
            view = v
            if let day { anchor = day } else if v == "liste" { anchor = KalD.todayKey() }
        }
        Task { await load() }
    }

    func step(_ dir: Int) {
        KalHaptic.tap()
        let A: Date = KalD.date(anchor)
        let n: Date
        switch view {
        case "mnd": n = KalD.addMonths(KalD.firstOfMonth(A), dir)
        case "ar": n = KalD.addMonths(KalD.firstOfMonth(A), dir * 12)
        case "uke": n = KalD.add(A, dir * 7)
        case "3d": n = KalD.add(A, dir * 3)
        default: n = KalD.add(A, dir)
        }
        withAnimation(.easeOut(duration: 0.22)) { anchor = KalD.key(n) }
        Task { await load() }
    }

    func goToday() {
        KalHaptic.tap()
        withAnimation(.easeOut(duration: 0.2)) { anchor = KalD.todayKey() }
    }

    /// Trykk på tittelen zoomer ut: Dag → Uke → Mnd → År.
    func zoomOut() {
        let z: [String: String] = ["dag": "uke", "3d": "uke", "uke": "mnd", "mnd": "ar", "ar": "ar", "liste": "mnd"]
        go(view: z[view] ?? "mnd")
    }

    func openDetail(_ e: KalEvent) {
        KalHaptic.tap()
        detId = e.id
    }

    /* ---------- Endringer ---------- */

    func setCal(_ id: String, on: Bool) {
        KalHaptic.tap()
        calOn[id] = on
        UserDefaults.standard.set(calOn, forKey: "kal.calOn")
        if let i = cals.firstIndex(where: { (c: KalCal) -> Bool in c.id == id }) { cals[i].on = on }
        if serverCals {
            Task { _ = try? await KalNet.send("PATCH", "/api/kalender/calendars/" + KalNet.enc(id), json: ["visible": on]) }
        }
        rebuild()
        saveSnapshot()
    }

    /// Egen kalender med farge (POST /api/kalender/calendars, eller lokalt).
    func addCalendar(name: String, hex: String) async {
        let n: String = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if n.isEmpty { return }
        if serverCals {
            if let d = try? await KalNet.send("POST", "/api/kalender/calendars", json: ["name": n, "color": hex]) {
                let obj: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
                var row: [String: Any] = obj
                if let inner = obj["calendar"] as? [String: Any] { row = inner }
                if row["id"] != nil, let data = try? JSONSerialization.data(withJSONObject: ["calendars": [row]]),
                   let made = KalParse.calendars(data).first {
                    cals.append(made)
                }
                await load(force: true)
                return
            }
        }
        var c: KalCal = KalCals.make(id: "c" + String(Int(Date().timeIntervalSince1970)), name: n, hex: hex)
        c.local = true
        cals.append(c)
        var extra: [KalCal] = KalStore.loadCals("kal.localCals")
        extra.append(c)
        KalStore.saveCals(extra, "kal.localCals")
        rebuild()
        saveSnapshot()
    }

    func deleteCalendar(_ id: String) async {
        if serverCals { _ = try? await KalNet.send("DELETE", "/api/kalender/calendars/" + KalNet.enc(id)) }
        cals.removeAll { (c: KalCal) -> Bool in c.id == id }
        var extra: [KalCal] = KalStore.loadCals("kal.localCals")
        extra.removeAll { (c: KalCal) -> Bool in c.id == id }
        KalStore.saveCals(extra, "kal.localCals")
        rebuild()
        saveSnapshot()
    }

    /// Ny hendelse (skjemaet, Glimt-feltet, Glimt-panelet, App Intent). Viser toast med Angre når toast er true.
    @discardableResult
    func add(_ p: KalParsed, loc: String = "", toastPrefix: String? = nil) async -> String {
        let tmpId: String = "u" + String(Int(Date().timeIntervalSince1970 * 1000))
        var ev: KalEvent = KalEvent(id: tmpId, title: p.title, cal: p.cal, day: p.day, s: p.s, e: p.e)
        ev.loc = loc
        ev.rem = p.rem
        ev.src = p.src
        ev.pending = true
        ev.editable = true
        pending.append(ev)
        savePending()
        rebuild()
        if let toastPrefix {
            let when: String = KalD.dl(KalD.date(p.day)) + (p.s == nil ? "" : " " + KalD.hm(p.s ?? 0))
            showToast(toastPrefix + " «" + p.title + "» · " + when, undo: tmpId)
        }
        let realId: String? = await push(ev)
        return realId ?? tmpId
    }

    /// Sender en lokal hendelse til serveren. → serverens id, eller nil (beholdes lokalt og prøves igjen senere).
    private func push(_ ev: KalEvent) async -> String? {
        var body: [String: Any] = ["title": ev.title, "allDay": ev.allDay, "date": ev.day, "location": ev.loc,
                                   "calendar": serverCal(for: ev.cal), "reminder": KalStore.serverReminder(ev.rem),
                                   "remindMinutes": ev.rem ?? 0, "origin": ev.src.isEmpty ? "Kalender" : "Glimt · Kalender"]
        if let s = ev.s { body["start"] = KalD.hm(s) }
        if let e = ev.e { body["end"] = KalD.hm(Swift.min(e, 1439)) }
        if !ev.src.isEmpty { body["note"] = "Lagt til av Glimt: «" + ev.src + "»" }
        var data: Data? = nil
        do {
            data = try await KalNet.send("POST", "/api/kalender/events", json: body)
        } catch let e as KalNetError {
            if e.status == 400 && (body["calendar"] as? String) != "privat" {
                body["calendar"] = ev.cal == "f" ? "familie" : "privat"
                data = try? await KalNet.send("POST", "/api/kalender/events", json: body)
            } else if e.status > 0 {
                if !noRetry.contains(ev.id) { showToast("Lagret bare på telefonen: " + e.message, undo: "") }
                noRetry.insert(ev.id)
            }
        } catch {
            data = nil
        }
        guard let data else { return nil }
        let obj: [String: Any] = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
        let ids: Set<String> = Set(cals.map { (c: KalCal) -> String in c.id })
        let made: KalEvent? = (obj["event"] as? [String: Any]).flatMap { (o: [String: Any]) -> KalEvent? in KalParse.event(o, calIds: ids) }
        let newId: String = made?.id ?? (obj["id"] as? String) ?? ""
        if newId.isEmpty { return nil }
        pending.removeAll { (x: KalEvent) -> Bool in x.id == ev.id }
        savePending()
        calOverride[newId] = ev.cal
        UserDefaults.standard.set(calOverride, forKey: "kal.calOf")
        if !ev.src.isEmpty {
            srcOf[newId] = ev.src
            UserDefaults.standard.set(srcOf, forKey: "kal.src")
        }
        if let r = ev.rem { remOverride[newId] = r } else { remOverride[newId] = -1 }
        UserDefaults.standard.set(remOverride, forKey: "kal.rem")
        if var m = made {
            m.cal = ev.cal
            events.append(m)
        }
        if toast?.undoId == ev.id, let t = toast { toast = KalToast(id: t.id, text: t.text, undoId: newId) }
        rebuild()
        saveSnapshot()
        return newId
    }

    private func flushPending() async {
        let list: [KalEvent] = pending.filter { (e: KalEvent) -> Bool in !noRetry.contains(e.id) }
        for e in list { _ = await push(e) }
    }

    /// Kalender-id-en serveren skal få. Uten kalender-API-et: Familie → familie, ellers privat.
    private func serverCal(for id: String) -> String {
        if serverCals, let c = cals.first(where: { (x: KalCal) -> Bool in x.id == id }), c.writable { return c.id }
        return id == "f" ? "familie" : "privat"
    }

    static func serverReminder(_ r: Int?) -> String {
        guard let r else { return "none" }
        if r >= 1440 { return "day" }
        if r >= 60 { return "1h" }
        return "15m"
    }

    /// Angre (toast og Glimt-panelet).
    func undo(_ id: String) {
        KalHaptic.tap()
        if id.isEmpty { return }
        if pending.contains(where: { (x: KalEvent) -> Bool in x.id == id }) {
            pending.removeAll { (x: KalEvent) -> Bool in x.id == id }
            savePending()
            rebuild()
            saveSnapshot()
            return
        }
        events.removeAll { (x: KalEvent) -> Bool in x.id == id }
        rebuild()
        saveSnapshot()
        Task { _ = try? await KalNet.send("DELETE", "/api/kalender/events/" + KalNet.enc(id)) }
    }

    func delete(_ e: KalEvent) {
        KalHaptic.tap()
        detId = nil
        if e.pending || e.id.hasPrefix("u") {
            pending.removeAll { (x: KalEvent) -> Bool in x.id == e.id }
            savePending()
        } else if e.editable {
            events.removeAll { (x: KalEvent) -> Bool in x.id == e.id }
            Task {
                do {
                    _ = try await KalNet.send("DELETE", "/api/kalender/events/" + KalNet.enc(e.id))
                } catch let err as KalNetError {
                    self.showToast("Kunne ikke slette: " + err.message, undo: "")
                    await self.load(force: true)
                } catch {}
            }
        } else {
            // Skolens og andres hendelser kan ikke slettes på serveren: skjules i Kalender.
            hiddenIds.insert(e.id)
            UserDefaults.standard.set(Array(hiddenIds), forKey: "kal.del")
        }
        showToast("«" + e.title + "» slettet", undo: "")
        rebuild()
        saveSnapshot()
    }

    func setReminder(_ e: KalEvent, _ r: Int?) {
        KalHaptic.tap()
        remOverride[e.id] = r ?? -1
        UserDefaults.standard.set(remOverride, forKey: "kal.rem")
        rebuild()
        if e.editable && !e.pending {
            Task { _ = try? await KalNet.send("PATCH", "/api/kalender/events/" + KalNet.enc(e.id), json: ["reminder": KalStore.serverReminder(r)]) }
        }
    }

    /* ---------- Toast ---------- */

    func showToast(_ text: String, undo: String) {
        toastSeq += 1
        let id: Int = toastSeq
        withAnimation(.easeOut(duration: 0.2)) { toast = KalToast(id: id, text: text, undoId: undo) }
        Task {
            try? await Task.sleep(nanoseconds: 4_500_000_000)
            if self.toast?.id == id { withAnimation(.easeOut(duration: 0.2)) { self.toast = nil } }
        }
    }

    /* ---------- Buffer og widgets ---------- */

    func saveSnapshot() {
        var s: KalSnapshot = KalSnapshot()
        s.events = all.filter { (e: KalEvent) -> Bool in isOn(e.cal) }
        s.cals = cals
        s.wx = wx.values.sorted { (a: KalWxDay, b: KalWxDay) -> Bool in a.day < b.day }
        s.updated = Date().timeIntervalSince1970
        KalNet.saveSnapshot(s)
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func savePending() {
        if let d = try? JSONEncoder().encode(pending) { UserDefaults.standard.set(d, forKey: "kal.pending") }
    }

    private static func loadList(_ key: String) -> [KalEvent] {
        guard let d = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([KalEvent].self, from: d)) ?? []
    }

    static func loadCals(_ key: String) -> [KalCal] {
        guard let d = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([KalCal].self, from: d)) ?? []
    }

    static func saveCals(_ list: [KalCal], _ key: String) {
        if let d = try? JSONEncoder().encode(list) { UserDefaults.standard.set(d, forKey: key) }
    }

    /* ---------- «Glimt · dagen din» ---------- */

    var daySummary: String {
        let tk: String = KalD.todayKey()
        let tmr: String = KalD.addKey(tk, 1)
        let nm: Int = KalD.minutesNow()
        let left: [KalEvent] = on(tk).filter { (e: KalEvent) -> Bool in !e.allDay && e.endMin > nm }
        let up: [KalEvent] = upcoming(limit: 200)
        var t: String = left.isEmpty ? "Resten av dagen er fri." : "Du har " + String(left.count) + " igjen i dag. Neste er " + left[0].title + " kl. " + KalD.hm(left[0].startMin) + "."
        if let w = wx[tk] {
            t += " " + (KalWx.text[w.kind] ?? "Skyet") + ", " + String(w.lo) + "–" + String(w.hi) + "°" + (w.kind == "regn" ? ", ta med paraply." : ".")
        }
        if let f = up.first(where: { (e: KalEvent) -> Bool in e.kind == "frist" }) {
            let when: String = f.day == tmr ? "i morgen" : KalD.dl(KalD.date(f.day)).lowercased()
            t += " Frist: " + KalStore.stripFrist(f.title) + " " + when + "."
        }
        if let b = up.first(where: { (e: KalEvent) -> Bool in e.kind == "bursdag" || e.cal == "b" }), b.day <= KalD.addKey(tk, 7) {
            let when: String = b.day == tk ? "i dag" : b.day == tmr ? "i morgen" : KalD.dl(KalD.date(b.day)).lowercased()
            t += " " + b.title + " " + when + "."
        }
        return t
    }

    static func stripFrist(_ s: String) -> String {
        s.hasPrefix("Frist: ") ? String(s.dropFirst(7)) : s
    }

    /* ---------- Ny hendelse ---------- */

    func openNew(day: String? = nil, s: Int? = nil, e: Int? = nil) {
        KalHaptic.tap()
        let tk: String = KalD.todayKey()
        var base: String = (view == "mnd" || view == "ar" || view == "liste") ? tk : anchor
        if let day { base = day }
        if base < tk { base = tk }
        let st: Int = s ?? Swift.min(23 * 60, ((KalD.minutesNow() + 1 + 29) / 30) * 30)
        let en: Int = e ?? Swift.min(1439, st + 60)
        var f: KalNewForm = KalNewForm()
        f.day = KalD.date(base)
        f.start = KalD.at(base, st)
        f.end = KalD.at(base, en)
        f.cal = cals.first(where: { (c: KalCal) -> Bool in c.writable && c.on })?.id ?? "p"
        f.rem = defRem
        newForm = f
    }

    func saveNew(_ f: KalNewForm) {
        let t: String = f.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return }
        let day: String = KalD.key(f.day)
        let s: Int = KalD.minutes(f.start)
        let e: Int = Swift.max(s + 15, KalD.minutes(f.end))
        let p: KalParsed = KalParsed(title: t, cal: f.cal, day: day, s: f.allDay ? nil : s, e: f.allDay ? nil : Swift.min(1439, e),
                                     rem: f.allDay ? nil : f.rem, src: "")
        newForm = nil
        anchor = day
        KalHaptic.done()
        Task { await self.add(p, loc: f.loc.trimmingCharacters(in: .whitespacesAndNewlines), toastPrefix: "La til") }
    }
}
