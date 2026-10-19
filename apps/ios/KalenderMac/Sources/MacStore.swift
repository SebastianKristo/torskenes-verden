import SwiftUI
import AppKit

/* ---------------- Prompt 34: Kalender for Mac – data (samme konto og backend som web og iPhone) ---------------- */
// Sannheten ligger på Homelab-serveren (/api/kalender). macOS 13: ObservableObject (ikke @Observable, som krever macOS 14).
// Visning (view/anchor) ligger per vindu i MacWin; her ligger dataene, innloggingen og innstillingene som deles av alle vinduer.

struct MacToast: Equatable {
    let id: Int
    let text: String
    let undoId: String
}

/// Skjemaet «Ny hendelse».
struct MacNewForm: Equatable {
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
final class MacStore: ObservableObject {
    static let shared: MacStore = MacStore()

    /* ---------- Innlogging ---------- */
    @Published var loggedIn: Bool = MacSession.token != nil
    @Published var userName: String = MacSession.user

    /* ---------- Data ---------- */
    @Published var cals: [KalCal] = KalCals.defaults
    @Published var serverCals: Bool = false
    @Published var events: [KalEvent] = []
    @Published var wx: [String: KalWxDay] = [:]
    @Published var loading: Bool = false
    @Published var lastError: String = ""
    @Published var updated: Date? = nil
    @Published private(set) var byDay: [String: [KalEvent]] = [:]
    @Published private(set) var all: [KalEvent] = []
    @Published var toast: MacToast? = nil
    /// Endres ved midnatt og hvert minutt, så «i dag» og nå-linja oppdateres.
    @Published var tick: Int = 0

    /* ---------- Innstillinger (Kalender → Innstillinger …) ---------- */
    @Published var showWeeks: Bool = MacStore.boolPref("mac.sw", true) { didSet { MacStore.setPref("mac.sw", showWeeks) } }
    @Published var showWx: Bool = MacStore.boolPref("mac.swx", true) { didSet { MacStore.setPref("mac.swx", showWx) } }
    /// system | light | dark
    @Published var theme: String = UserDefaults.standard.string(forKey: "mac.theme") ?? "system" {
        didSet {
            UserDefaults.standard.set(theme, forKey: "mac.theme")
            MacApp.applyTheme(theme)
        }
    }
    /// Menylinje-kalenderen av/på og hva den viser: icon | date | next.
    @Published var menuBarOn: Bool = MacStore.boolPref("mac.mb", true) { didSet { MacStore.setPref("mac.mb", menuBarOn) } }
    @Published var menuBarMode: String = UserDefaults.standard.string(forKey: "mac.mbMode") ?? "next" {
        didSet { UserDefaults.standard.set(menuBarMode, forKey: "mac.mbMode") }
    }
    /// Prompt 38: hovedvinduet viser web-kalenderen (<server>/kalender?app=mac). Av = den innebygde kalenderen (reserve).
    @Published var useWeb38: Bool = MacStore.boolPref("mac.web38", true) {
        didSet {
            MacStore.setPref("mac.web38", useWeb38)
            MacWeb38Model.prefChanged()
        }
    }
    /// Antall hendelser i dag som merke på Dock-ikonet.
    @Published var dockBadge: Bool = MacStore.boolPref("mac.badge", true) { didSet { MacStore.setPref("mac.badge", dockBadge); MacDock.refresh() } }
    /// Standardvarsel (minutter, -1 = ingen).
    @Published var defRemRaw: Int = (UserDefaults.standard.object(forKey: "mac.drem") as? Int) ?? 60 {
        didSet { UserDefaults.standard.set(defRemRaw, forKey: "mac.drem") }
    }
    var defRem: Int? { defRemRaw < 0 ? nil : defRemRaw }

    /* ---------- Prompt 35: samme valg som iPhone-appen (profilen /api/kalender/calendars/prefs) ---------- */
    /// mon | sun – måned, år, uke, ukenummer og minikalenderen.
    @Published var weekStart: String = KalWeek35.raw { didSet { KalWeek35.set(weekStart) } }
    /// Visningen nye vinduer åpner i: mnd | uke | 3d | dag | liste.
    @Published var openView: String = UserDefaults.standard.string(forKey: "mac.openView") ?? "mnd" {
        didSet { UserDefaults.standard.set(openView, forKey: "mac.openView") }
    }
    /// Standard varighet (min) for nye hendelser.
    @Published var defDur: Int = (UserDefaults.standard.object(forKey: "mac.defDur") as? Int) ?? 60 {
        didSet { UserDefaults.standard.set(defDur, forKey: "mac.defDur") }
    }
    /// Tidslinje starter: now | 06 | 08
    @Published var tlStart: String = UserDefaults.standard.string(forKey: "mac.tlStart") ?? "now" {
        didSet { UserDefaults.standard.set(tlStart, forKey: "mac.tlStart") }
    }
    @Published var nBd: Bool = MacStore.boolPref("mac.nBd", true) { didSet { MacStore.setPref("mac.nBd", nBd) } }
    @Published var nFr: Bool = MacStore.boolPref("mac.nFr", true) { didSet { MacStore.setPref("mac.nFr", nFr) } }
    /// Lokale valg til serveren har bekreftet dem.
    var hidMenuLocal: [String: Bool] = (UserDefaults.standard.dictionary(forKey: "mac.hidMenu") as? [String: Bool]) ?? [:]
    var colLocal: [String: String] = (UserDefaults.standard.dictionary(forKey: "mac.calCol") as? [String: String]) ?? [:]

    /* ---------- Lokale tillegg ---------- */
    private var pending: [KalEvent] = MacStore.loadList("mac.pending")
    private var hiddenIds: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "mac.del") ?? [])
    private var remOverride: [String: Int] = (UserDefaults.standard.dictionary(forKey: "mac.rem") as? [String: Int]) ?? [:]
    private var calOverride: [String: String] = (UserDefaults.standard.dictionary(forKey: "mac.calOf") as? [String: String]) ?? [:]
    private var srcOf: [String: String] = (UserDefaults.standard.dictionary(forKey: "mac.src") as? [String: String]) ?? [:]
    private var calOn: [String: Bool] = (UserDefaults.standard.dictionary(forKey: "mac.calOn") as? [String: Bool]) ?? [:]
    private var toastSeq: Int = 0
    private var noRetry: Set<String> = []
    private var poll: Timer? = nil
    private var minuteTimer: Timer? = nil
    private var loadedFrom: String = ""
    private var loadedTo: String = ""
    private var lastDay: String = KalD.todayKey()

    init() {
        // Prompt 37: fagfargene synkes med profilen (PUT/GET /api/me/layout subjectColors).
        KalFag37.pushEnabled = true
        if let d = UserDefaults.standard.data(forKey: "mac.snapshot"), let snap = try? JSONDecoder().decode(KalSnapshot.self, from: d) {
            if !snap.cals.isEmpty { cals = snap.cals }
            events = snap.events.filter { (e: KalEvent) -> Bool in !e.pending }
            var w: [String: KalWxDay] = [:]
            for x in snap.wx { w[x.day] = x }
            wx = w
        }
        applyCalOn()
        // Ikke varsler/Dock her: de leser MacStore.shared, som ikke er ferdig laget ennå.
        rebuild(sideEffects: false)
    }

    static func boolPref(_ k: String, _ def: Bool) -> Bool { (UserDefaults.standard.object(forKey: k) as? Bool) ?? def }
    static func setPref(_ k: String, _ v: Bool) { UserDefaults.standard.set(v, forKey: k) }

    /* ---------- Innlogging ---------- */

    func didLogin(bases: [String], token: String, user: String) {
        MacSession.save(bases: bases, token: token, user: user)
        loggedIn = true
        userName = user
        MacLive.shared.start()
        Task { await self.load(force: true) }
    }

    func logout() {
        if let t = MacSession.token {
            // Trekk tilbake app-tokenet på serveren (best effort).
            Task { _ = try? await KalNet.send("POST", "/finans/api/logout", json: [:], timeout: 8, bases: MacSession.bases, token: t) }
        }
        MacLive.shared.stop()
        // Prompt 38: glem økt-cookien i web-visningen.
        MacWeb38Model.signOutAll()
        MacSession.clear()
        loggedIn = false
        events = []
        pending = []
        UserDefaults.standard.removeObject(forKey: "mac.snapshot")
        rebuild()
    }

    /* ---------- Henting ---------- */

    /// Henter −8 … +26 uker rundt anchor (og i dag), kalenderne og været.
    func load(around anchor: String? = nil, force: Bool = false) async {
        guard loggedIn else { return }
        let tk: String = KalD.todayKey()
        let a: String = anchor ?? tk
        let lo: String = a < tk ? a : tk
        let hi: String = a > tk ? a : tk
        let from: String = KalD.addKey(lo, -56)
        let to: String = KalD.addKey(hi, 182)
        if !force && !loadedFrom.isEmpty && from >= loadedFrom && to <= loadedTo { return }
        if loading && !force { return }
        loading = true
        defer { loading = false }
        if let res = await KalCalAPI35.fetch() {
            serverCals = true
            cals = res.cals
            applyServerPrefs(res.prefs)
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
            for e in list where !cals.contains(where: { (c: KalCal) -> Bool in c.id == e.cal }) {
                if let d = KalCals.defaults.first(where: { (c: KalCal) -> Bool in c.id == e.cal }) { cals.append(d) }
            }
            applyCalOn()
        } catch let e as KalNetError {
            lastError = e.status == 401 ? "Innloggingen er utløpt. Logg inn på nytt." : e.message
            if e.status == 401 { logout() }
        } catch {
            lastError = error.localizedDescription
        }
        // Logget ut underveis (401): ikke skriv bufferen eller send køen på nytt.
        if !loggedIn { return }
        let w: [KalWxDay] = await KalNet.weather(from: tk, to: KalD.addKey(tk, 15))
        if !w.isEmpty {
            var o: [String: KalWxDay] = [:]
            for d in w { o[d.day] = d }
            wx = o
        }
        await flushPending()
        await KalFag37.pull()
        rebuild()
        saveSnapshot()
    }

    /// Reserve når WebSocket-en er nede: hvert 60. sekund. Hvert minutt: «nå» og midnatt.
    func startTimers() {
        poll?.invalidate()
        poll = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { (_: Timer) in
            Task { @MainActor in
                if !MacLive.shared.connected { await MacStore.shared.load(force: true) }
            }
        }
        minuteTimer?.invalidate()
        minuteTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { (_: Timer) in
            Task { @MainActor in MacStore.shared.minute() }
        }
    }

    private func minute() {
        tick += 1
        let tk: String = KalD.todayKey()
        if tk != lastDay {
            lastDay = tk
            rebuild()
            MacDock.refresh()
            Task { await self.load(force: true) }
        }
    }

    private func mergeLocalCals() {
        var list: [KalCal] = KalCals.defaults
        let extra: [KalCal] = MacStore.loadCals("mac.localCals")
        for c in extra where !list.contains(where: { (x: KalCal) -> Bool in x.id == c.id }) { list.append(c) }
        cals = list
    }

    func applyCalOn() {
        for i in 0..<cals.count {
            if let v = calOn[cals[i].id] { cals[i].on = v }
            // Prompt 35: farge og «skjult fra menyen» lokalt til serveren har bekreftet.
            if let h = hidMenuLocal[cals[i].id] { cals[i].hidMenu = h }
            if let c = colLocal[cals[i].id], c.lowercased() != cals[i].hex.lowercased() { cals[i] = KalTone35.apply(cals[i], hex: c) }
        }
    }

    /* ---------- Avledet ---------- */

    func cal(_ id: String) -> KalCal? { cals.first { (c: KalCal) -> Bool in c.id == id } ?? cals.first }

    /// Prompt 35: kalendere som er skjult fra menyen vises heller ikke.
    func isOn(_ id: String) -> Bool { cals.first { (c: KalCal) -> Bool in c.id == id }?.shown ?? true }

    func rebuild(sideEffects: Bool = true) {
        var list: [KalEvent] = []
        // Samme id to ganger (serveren + lokal kø, eller dobbel import) gir dupliserte id-er i ForEach – det kan krasje SwiftUI.
        var seen: Set<String> = []
        for var e in events + pending {
            if hiddenIds.contains(e.id) || seen.contains(e.id) { continue }
            seen.insert(e.id)
            if let r = remOverride[e.id] { e.rem = r < 0 ? nil : r }
            if let c = calOverride[e.id] { e.cal = c }
            if let s = srcOf[e.id], e.src.isEmpty { e.src = s }
            list.append(e)
        }
        all = list
        var map: [String: [KalEvent]] = [:]
        for e in list where isOn(e.cal) {
            // Maks ett år per hendelse (feil sluttdato fra en kilde skal ikke gi millioner av dager).
            let n: Int = Swift.min(366, Swift.max(1, e.days))
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
        let today: String = KalD.todayKey()
        let last: String = KalD.addKey(today, 30)
        for i in 0..<cals.count {
            let id: String = cals[i].id
            cals[i].count = list.filter { (e: KalEvent) -> Bool in e.cal == id && e.day >= today && e.day <= last }.count
        }
        if !sideEffects { return }
        MacNotify.reschedule(upcoming(limit: 200))
        MacDock.refresh()
    }

    func on(_ key: String) -> [KalEvent] { byDay[key] ?? [] }

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

    /// Neste (eller pågående) hendelse med klokkeslett – menylinja og «NESTE»-banneret.
    func nextTimed() -> KalEvent? {
        upcoming(limit: 60).first { (e: KalEvent) -> Bool in !e.allDay && !e.cont }
    }

    func event(_ id: String) -> KalEvent? {
        all.first { (x: KalEvent) -> Bool in x.id == id }
    }

    func weather(_ key: String) -> KalWxDay? { showWx ? wx[key] : nil }

    /* ---------- Endringer ---------- */

    func setCal(_ id: String, on: Bool) {
        calOn[id] = on
        UserDefaults.standard.set(calOn, forKey: "mac.calOn")
        if let i = cals.firstIndex(where: { (c: KalCal) -> Bool in c.id == id }) { cals[i].on = on }
        if serverCals {
            Task { _ = try? await KalNet.send("PATCH", "/api/kalender/calendars/" + KalNet.enc(id), json: ["visible": on]) }
        }
        rebuild()
        saveSnapshot()
    }

    func addCalendar(name: String, hex: String) async {
        let n: String = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if n.isEmpty { return }
        if serverCals, (try? await KalNet.send("POST", "/api/kalender/calendars", json: ["name": n, "color": hex])) != nil {
            await load(force: true)
            return
        }
        var c: KalCal = KalCals.make(id: "c" + String(Int(Date().timeIntervalSince1970)), name: n, hex: hex)
        c.local = true
        cals.append(c)
        var extra: [KalCal] = MacStore.loadCals("mac.localCals")
        extra.append(c)
        MacStore.saveCals(extra, "mac.localCals")
        rebuild()
        saveSnapshot()
    }

    /// Ny hendelse (skjemaet, Glimt-feltet, Glimt-panelet, menylinja, .ics-import).
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

    private func pushBody(_ ev: KalEvent) -> [String: Any] {
        var body: [String: Any] = ["title": ev.title, "allDay": ev.allDay, "date": ev.day, "location": ev.loc]
        body["calendar"] = serverCal(for: ev.cal)
        body["reminder"] = MacStore.serverReminder(ev.rem)
        body["remindMinutes"] = ev.rem ?? 0
        body["origin"] = ev.src.isEmpty ? "Kalender (Mac)" : "Glimt · Kalender (Mac)"
        if let s = ev.s { body["start"] = KalD.hm(s) }
        if let e = ev.e { body["end"] = KalD.hm(Swift.min(e, 1439)) }
        if !ev.src.isEmpty { body["note"] = "Lagt til av Glimt: «" + ev.src + "»" }
        return body
    }

    private func push(_ ev: KalEvent) async -> String? {
        var body: [String: Any] = pushBody(ev)
        var data: Data? = nil
        do {
            data = try await KalNet.send("POST", "/api/kalender/events", json: body)
        } catch let e as KalNetError {
            if e.status == 400 && (body["calendar"] as? String) != "privat" {
                body["calendar"] = ev.cal == "f" ? "familie" : "privat"
                data = try? await KalNet.send("POST", "/api/kalender/events", json: body)
            } else if e.status > 0 {
                if !noRetry.contains(ev.id) { showToast("Lagret bare på denne Mac-en: " + e.message, undo: "") }
                noRetry.insert(ev.id)
            }
        } catch {
            data = nil
        }
        guard let data else { return nil }
        let obj: [String: Any] = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
        let ids: Set<String> = Set(cals.map { (c: KalCal) -> String in c.id })
        var made: KalEvent? = nil
        if let o = obj["event"] as? [String: Any] { made = KalParse.event(o, calIds: ids) }
        let newId: String = made?.id ?? (obj["id"] as? String) ?? ""
        if newId.isEmpty { return nil }
        pending.removeAll { (x: KalEvent) -> Bool in x.id == ev.id }
        savePending()
        calOverride[newId] = ev.cal
        UserDefaults.standard.set(calOverride, forKey: "mac.calOf")
        if !ev.src.isEmpty {
            srcOf[newId] = ev.src
            UserDefaults.standard.set(srcOf, forKey: "mac.src")
        }
        remOverride[newId] = ev.rem ?? -1
        UserDefaults.standard.set(remOverride, forKey: "mac.rem")
        if var m = made {
            m.cal = ev.cal
            events.append(m)
        }
        if let t = toast, t.undoId == ev.id { toast = MacToast(id: t.id, text: t.text, undoId: newId) }
        rebuild()
        saveSnapshot()
        return newId
    }

    private func flushPending() async {
        let list: [KalEvent] = pending.filter { (e: KalEvent) -> Bool in !noRetry.contains(e.id) }
        for e in list { _ = await push(e) }
    }

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

    func undo(_ id: String) {
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
            hiddenIds.insert(e.id)
            UserDefaults.standard.set(Array(hiddenIds), forKey: "mac.del")
        }
        showToast("«" + e.title + "» slettet", undo: "")
        rebuild()
        saveSnapshot()
    }

    func setReminder(_ e: KalEvent, _ r: Int?) {
        remOverride[e.id] = r ?? -1
        UserDefaults.standard.set(remOverride, forKey: "mac.rem")
        rebuild()
        if e.editable && !e.pending {
            let body: [String: Any] = ["reminder": MacStore.serverReminder(r)]
            Task { _ = try? await KalNet.send("PATCH", "/api/kalender/events/" + KalNet.enc(e.id), json: body) }
        }
    }

    func saveNew(_ f: MacNewForm) -> String? {
        let t: String = f.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return nil }
        let day: String = KalD.key(f.day)
        let s: Int = KalD.minutes(f.start)
        let e: Int = Swift.max(s + 15, KalD.minutes(f.end))
        let p: KalParsed = KalParsed(title: t, cal: f.cal, day: day, s: f.allDay ? nil : s, e: f.allDay ? nil : Swift.min(1439, e),
                                     rem: f.allDay ? nil : f.rem, src: "")
        let loc: String = f.loc.trimmingCharacters(in: .whitespacesAndNewlines)
        Task { await self.add(p, loc: loc, toastPrefix: "La til") }
        return day
    }

    func makeForm(day: String, s: Int?, e: Int?) -> MacNewForm {
        let tk: String = KalD.todayKey()
        let base: String = day < tk ? tk : day
        let next: Int = ((KalD.minutesNow() + 1 + 29) / 30) * 30
        let st: Int = s ?? Swift.min(23 * 60, next)
        let en: Int = e ?? Swift.min(1439, st + defDur)
        var f: MacNewForm = MacNewForm()
        f.day = KalD.date(base)
        f.start = KalD.at(base, st)
        f.end = KalD.at(base, en)
        f.cal = cals.first(where: { (c: KalCal) -> Bool in c.writable && c.on })?.id ?? "p"
        f.rem = defRem
        return f
    }

    /* ---------- Toast ---------- */

    func showToast(_ text: String, undo: String) {
        toastSeq += 1
        let id: Int = toastSeq
        withAnimation(.easeOut(duration: 0.2)) { toast = MacToast(id: id, text: text, undoId: undo) }
        Task {
            try? await Task.sleep(nanoseconds: 4_500_000_000)
            if self.toast?.id == id { withAnimation(.easeOut(duration: 0.2)) { self.toast = nil } }
        }
    }

    /* ---------- Buffer ---------- */

    func saveSnapshot() {
        var s: KalSnapshot = KalSnapshot()
        let from: String = KalD.addKey(KalD.todayKey(), -60)
        s.events = all.filter { (e: KalEvent) -> Bool in e.day >= from && !e.pending }
        s.cals = cals
        s.wx = wx.values.sorted { (a: KalWxDay, b: KalWxDay) -> Bool in a.day < b.day }
        s.updated = Date().timeIntervalSince1970
        if let d = try? JSONEncoder().encode(s) { UserDefaults.standard.set(d, forKey: "mac.snapshot") }
    }

    private func savePending() {
        if let d = try? JSONEncoder().encode(pending) { UserDefaults.standard.set(d, forKey: "mac.pending") }
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

    static func stripFrist(_ s: String) -> String {
        s.hasPrefix("Frist: ") ? String(s.dropFirst(7)) : s
    }

    /// «Glimt · dagen din» øverst i Liste.
    var daySummary: String {
        let tk: String = KalD.todayKey()
        let nm: Int = KalD.minutesNow()
        let left: [KalEvent] = on(tk).filter { (e: KalEvent) -> Bool in !e.allDay && e.endMin > nm }
        var t: String = "Resten av dagen er fri."
        if let f = left.first {
            t = "Du har " + String(left.count) + " igjen i dag. Neste er " + f.title + " kl. " + KalD.hm(f.startMin) + "."
        }
        if let w = wx[tk] {
            let kind: String = KalWx.text[w.kind] ?? "Skyet"
            t += " " + kind + ", " + String(w.lo) + "–" + String(w.hi) + "°."
        }
        if let f = upcoming(limit: 200).first(where: { (e: KalEvent) -> Bool in e.kind == "frist" }) {
            t += " Frist: " + MacStore.stripFrist(f.title) + " " + KalD.dl(KalD.date(f.day)).lowercased() + "."
        }
        return t
    }
}
