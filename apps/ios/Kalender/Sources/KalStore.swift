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
    /// Prompt 44: Rediger (id-en til hendelsen som endres), koordinater fra adresseforslaget og deltakere.
    var editId: String? = nil
    var lat: Double? = nil
    var lon: Double? = nil
    var att: [KalAtt44] = []
    /// Q26 (fra Homelabs gamle kalender): merknad, gjentakelse (none | daily | weekly | monthly) og en feilmelding
    /// over skjemaet (f.eks. «Fant ikke dato. Velg dato og lagre.» når en rask time ikke kunne tolkes).
    var note: String = ""
    var repeatRule: String = "none"
    var error: String = ""
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
    /// Prompt 35: Innstillinger → «Åpne i» bestemmer visningen appen starter i (ellers siste brukte).
    var view: String = UserDefaults.standard.string(forKey: "kal.openView") ?? UserDefaults.standard.string(forKey: "kal.view") ?? "mnd" {
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
    /// Prompt 46: Innstillinger → Kalender → Standardkalender (serverens prefs.defaultCalendar). "" = ikke valgt.
    var defCal46: String = UserDefaults.standard.string(forKey: "kal46.defCal") ?? "" {
        didSet { UserDefaults.standard.set(defCal46, forKey: "kal46.defCal") }
    }
    /// system | light | dark (kalapp_th i fasiten).
    var theme: String = UserDefaults.standard.string(forKey: "kalapp_th") ?? "system" {
        didSet { UserDefaults.standard.set(theme, forKey: "kalapp_th") }
    }

    /* ---------- Prompt 35: Innstillinger (nederst i sidemenyen) ---------- */
    /// mon | sun – gjelder måned, år, uke, ukenummer-kolonnen og widgetene (App Group kal.weekStart).
    var weekStart: String = KalWeek35.raw {
        didSet {
            KalWeek35.set(weekStart)
            KalW70.reload()
        }
    }
    /// mnd | uke | 3d | dag | liste
    var openView: String = UserDefaults.standard.string(forKey: "kal.openView") ?? "mnd" {
        didSet { UserDefaults.standard.set(openView, forKey: "kal.openView") }
    }
    /// Standard varighet i minutter (30 / 60 / 90 / 120) for rød +.
    var defDur: Int = (UserDefaults.standard.object(forKey: "kal.defDur") as? Int) ?? 60 {
        didSet {
            UserDefaults.standard.set(defDur, forKey: "kal.defDur")
            KalQuick.defDur44 = defDur
        }
    }
    /// Tidslinje starter: now | 06 | 08
    var tlStart: String = UserDefaults.standard.string(forKey: "kal.tlStart") ?? "now" {
        didSet { UserDefaults.standard.set(tlStart, forKey: "kal.tlStart") }
    }
    var nBd: Bool = (UserDefaults.standard.object(forKey: "kal.nBd") as? Bool) ?? true {
        didSet { UserDefaults.standard.set(nBd, forKey: "kal.nBd") }
    }
    var nFr: Bool = (UserDefaults.standard.object(forKey: "kal.nFr") as? Bool) ?? true {
        didSet { UserDefaults.standard.set(nFr, forKey: "kal.nFr") }
    }
    var nBrief: Bool = (UserDefaults.standard.object(forKey: "kal.nBrief") as? Bool) ?? true {
        didSet { UserDefaults.standard.set(nBrief, forKey: "kal.nBrief") }
    }
    var nTv: Bool = (UserDefaults.standard.object(forKey: "kal.nTv") as? Bool) ?? false {
        didSet { UserDefaults.standard.set(nTv, forKey: "kal.nTv") }
    }
    var settingsOpen: Bool = false
    /// Q26: Oversikt (Nå-kort, Prøver og frister, Kalendere, Kalender, Widgets – KalOverview.swift).
    var overviewOpen: Bool = false
    /// Q34 (E-B12): «Slå sammen kalenderne: 6 → 4?» fra serveren (migration.proposed), og om ja-et er sendt (KalMerge.swift).
    var mergeProposal: KalMigration39? = nil
    var merging: Bool = false
    /// Prompt 39: Innstillinger → Kalendere (1a), Rediger (1b, kalender-id), Legg til (1c) og Google-velgeren (1d).
    var cals39Open: Bool = false
    var cal39Edit: String? = nil
    var cal39AddOpen: Bool = false
    var gmap39Open: Bool = false
    /// «+ Legg til kalender»-panelet i sidemenyen: ics | ha | acc (nil = lukket).
    var addCalTab: String? = nil
    /// Zoom mellom visningene: punktet den nye visningen vokser fra, og retningen (inn = fra 0,55, ut = fra 1,6).
    var zoomOrigin: UnitPoint = .center
    var zoomInward: Bool = true
    /// Lokalt valg når serveren ikke lagrer det (ennå): skjult fra menyen og farge per kalender.
    @ObservationIgnored var hidMenuLocal: [String: Bool] = (UserDefaults.standard.dictionary(forKey: "kal.hidMenu") as? [String: Bool]) ?? [:]
    @ObservationIgnored var colLocal: [String: String] = (UserDefaults.standard.dictionary(forKey: "kal.calCol") as? [String: String]) ?? [:]

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
    @ObservationIgnored var pending: [KalEvent] = KalStore.loadList("kal.pending")
    @ObservationIgnored private var hiddenIds: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "kal.del") ?? [])
    @ObservationIgnored var remOverride: [String: Int] = (UserDefaults.standard.dictionary(forKey: "kal.rem") as? [String: Int]) ?? [:]
    @ObservationIgnored var calOverride: [String: String] = (UserDefaults.standard.dictionary(forKey: "kal.calOf") as? [String: String]) ?? [:]
    @ObservationIgnored private var srcOf: [String: String] = (UserDefaults.standard.dictionary(forKey: "kal.src") as? [String: String]) ?? [:]
    @ObservationIgnored private var calOn: [String: Bool] = (UserDefaults.standard.dictionary(forKey: "kal.calOn") as? [String: Bool]) ?? [:]
    @ObservationIgnored private var toastSeq: Int = 0
    /// Hendelser serveren avviste (f.eks. Google ikke koblet til): prøves ikke igjen før appen startes på nytt.
    @ObservationIgnored private var noRetry: Set<String> = []
    @ObservationIgnored private var poll: Timer? = nil
    @ObservationIgnored private var loadedFrom: String = ""
    @ObservationIgnored private var loadedTo: String = ""
    /// Prompt 44: bare én henting om gangen (oppstart, aktivering, lenker og 60 s-intervallet startet før hver sin).
    @ObservationIgnored private var inflight44: Task<Void, Never>? = nil
    @ObservationIgnored let started44: Date = Date()
    @ObservationIgnored var firstFrame44: Bool = false
    /// Prompt 44: «Oppdaterer …» ved tittelen mens den synker (aldri tom kalender eller spinner over rutenettet).
    var syncing44: Bool = false

    init() {
        // Prompt 89: den gamle feilstavede standardadressen → os.smarthjemeksperten.no (KalServerCore.swift).
        KalSrv89.migrate()
        KalQuick.defDur44 = (UserDefaults.standard.object(forKey: "kal.defDur") as? Int) ?? 60
        // Prompt 44: den store bufferen (−3 … +12 mnd) først, ellers widget-bufferen.
        if let f = KalCache44.load(user: KalGroup.user), !f.events.isEmpty {
            if !f.cals.isEmpty { cals = KalCals39.normalize(f.cals) }
            events = f.events
            var w: [String: KalWxDay] = [:]
            for d in f.wx { w[d.day] = d }
            wx = w
            updated = Date(timeIntervalSince1970: f.updated)
        } else if let snap = KalNet.loadSnapshot() {
            if !snap.cals.isEmpty { cals = KalCals39.normalize(snap.cals) }
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
        // Prompt 37: fagfarger synkes med profilen, og tastaturhøyden følges (Ny hendelse bak tastaturet).
        KalFag37.pushEnabled = true
        KalKb37.shared.install()
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
        // Prompt 41: trekk tilbake app-tokenet på serveren (best effort) og glem refresh-tokenet.
        if let tok = KalGroup.token {
            let bases: [String] = KalGroup.bases
            Task.detached { _ = try? await KalNet.send("POST", "/finans/api/auth/logout", json: [:], timeout: 8, bases: bases, token: tok) }
        }
        KalKeychain41.delete("refresh")
        KalGroup.clearSession()
        KalCache44.clear()
        UserDefaults.standard.set(true, forKey: "kal.noAuto")
        loggedIn = false
        events = []
        rebuild()
        KalW70.reload()
        // Prompt 43: oppsettsteget (iPad) vises igjen etter neste innlogging.
        KalWide43.shared.reset()
    }

    /// Prompt 41: tokenet er trukket tilbake (logget ut i Homelab). Ingen ny auto-innlogging med det gamle tokenet.
    func logoutRevoked() {
        UserDefaults.standard.set(true, forKey: "kal.noAuto")
        KalKeychain41.delete("refresh")
        KalGroup.clearSession()
        KalCache44.clear()
        loggedIn = false
        events = []
        rebuild()
        KalW70.reload()
        KalLogin41Model.shared.phase = "start"
        showToast("Du er logget ut i Homelab. Logg inn igjen.", undo: "")
    }

    /// Prompt 85 (innebygd i Homelab, Kal84Host): økten på enheten hører til en annen Homelab-konto enn den som er i bruk.
    /// Glemmes uten melding og uten å sperre automatisk innlogging – Homelab logger straks inn med kontoen som er i bruk.
    func dropSession85() {
        if let tok = KalGroup.token {
            let bases: [String] = KalGroup.bases
            Task.detached { _ = try? await KalNet.send("POST", "/finans/api/auth/logout", json: [:], timeout: 8, bases: bases, token: tok) }
        }
        KalKeychain41.delete("refresh")
        KalGroup.clearSession()
        KalCache44.clear()
        loggedIn = false
        userName = ""
        events = []
        rebuild()
        KalW70.reload()
    }

    /* ---------- Henting ---------- */

    /// Henter perioden rundt det man ser på (−6 uker … +16 uker), kalenderne og været.
    func load(force: Bool = false) async {
        guard loggedIn else { return }
        // Prompt 44: en henting som allerede går, gir svaret til alle. Bare en ny periode (bladd langt) gir en til.
        if let t = inflight44 {
            await t.value
            if !needsRange44() { return }
        }
        let t: Task<Void, Never> = Task { await self.load44(force: force) }
        inflight44 = t
        await t.value
        if inflight44 == t { inflight44 = nil }
    }

    private func needsRange44() -> Bool {
        let a: String = anchor < KalD.todayKey() ? anchor : KalD.todayKey()
        let from: String = KalD.addKey(a, -42)
        let to: String = KalD.addKey(anchor > KalD.todayKey() ? anchor : KalD.todayKey(), 112)
        return loadedFrom.isEmpty || from < loadedFrom || to > loadedTo
    }

    private func load44(force: Bool) async {
        guard loggedIn else { return }
        let t0: Date = Date()
        let a: String = anchor < KalD.todayKey() ? anchor : KalD.todayKey()
        let from: String = KalD.addKey(a, -42)
        let to: String = KalD.addKey(anchor > KalD.todayKey() ? anchor : KalD.todayKey(), 112)
        if !force && from >= loadedFrom && to <= loadedTo && !loadedFrom.isEmpty { return }
        loading = true
        syncing44 = true
        defer {
            loading = false
            syncing44 = false
        }
        if let res = await KalCalAPI35.fetch() {
            serverCals = true
            cals = res.cals
            applyServerPrefs(res.prefs)
            announceMigration39()
            mergeProposal = KalMergeOffer.pending(KalCals39.migration, seenKey: KalStore.mergeSeenKey)
        } else {
            serverCals = false
            mergeLocalCals()
        }
        applyCalOn()
        KalMedia44.tint(&cals)
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
            // Prompt 42: trekk fra Abonnementer uten kalenderen i lista (eldre server) får den lokalt.
            KalAb42.ensureCal(&cals, events: list)
            applyCalOn()
            // Prompt 44: tegn med en gang – vær, kø og fagfarger kommer etterpå.
            rebuild()
            saveSnapshot()
            KalCache44.save(user: KalGroup.user, events: events, cals: cals, wx: Array(wx.values))
            KalLog44.send("cal.syncDone", ["ms": String(Int(Date().timeIntervalSince(t0) * 1000)), "events": String(list.count)])
        } catch let e as KalNetError {
            lastError = e.message
            if e.status == 401 {
                // Prompt 44: KalNet har allerede prøvd å fornye (KalAuthGate44). Bare et tilbakekalt token logger ut –
                // ellers beholdes innloggingen og den lagrede kalenderen (nytt forsøk ved neste henting).
                if !e.revoked44 {
                    lastError = ""
                    return
                }
                lastError = ""
                logoutRevoked()
                return
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
        await KalFag37.pull()
        rebuild()
        saveSnapshot()
        if lastError.isEmpty { KalCache44.save(user: KalGroup.user, events: events, cals: cals, wx: Array(wx.values)) }
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
        cals = KalCals39.normalize(list)
    }

    func applyCalOn() {
        for i in 0..<cals.count {
            if let v = calOn[cals[i].id] { cals[i].on = v }
            // Prompt 35: lokale valg (farge, skjult fra menyen) til serveren har bekreftet dem.
            if let h = hidMenuLocal[cals[i].id] { cals[i].hidMenu = h }
            if let c = colLocal[cals[i].id], c.lowercased() != cals[i].hex.lowercased() { cals[i] = KalTone35.apply(cals[i], hex: c) }
        }
    }

    /* ---------- Avledet ---------- */

    func cal(_ id: String) -> KalCal? {
        // Prompt 39: lagrede kortnøkler («p», «j») og sammenslåtte kalendere viser den nye av de fire.
        let rid: String = KalCals39.resolveId(id, in: cals)
        return cals.first { (c: KalCal) -> Bool in c.id == rid } ?? cals.first
    }

    /// Prompt 35: kalendere som er skjult fra menyen forsvinner også fra visningene.
    private func isOn(_ id: String) -> Bool { cals.first { (c: KalCal) -> Bool in c.id == id }?.shown ?? true }

    /// Bygger byDay og all etter endringer.
    func rebuild() {
        var list: [KalEvent] = []
        for var e in events + pending {
            if hiddenIds.contains(e.id) { continue }
            if let r = remOverride[e.id] { e.rem = r < 0 ? nil : r }
            if let c = calOverride[e.id] { e.cal = c }
            e.cal = KalCals39.resolveId(e.cal, in: cals)
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
        // Prompt 39: Rediger → Varsel av for en kalender gir ingen varsler derfra.
        KalNotify.reschedule(KalCals39.notifiable(upcoming(limit: 200, includeHidden: false), cals))
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

    /// Visningsvelgeren og lenker: samme zoom-animasjon som trykk/pinch, retning etter rekkefølgen År … Dag.
    func go(view v: String, day: String? = nil) {
        let order: [String] = KalZoom35.order
        let a: Int = order.firstIndex(of: view) ?? 0
        let b: Int = order.firstIndex(of: v) ?? 0
        zoomTo(v, day: day, origin: .center, inward: b >= a)
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

    /// Trykk på tittelen zoomer ut: Dag → 3 dager → Uke → Måned → År (Prompt 35).
    func zoomOut() {
        zoomOutStep(.center)
    }

    func openDetail(_ e: KalEvent) {
        // Prompt 37: tastaturet lukkes før arket åpnes (søket og treffene beholdes).
        KalKeyboard37.dismiss()
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
            // Prompt 44: Media-kalenderen henter utgivelsene bare når den er på (samme bryter som «Vis i Kalender» i Media).
            let media: Bool = id == "media"
            Task {
                _ = try? await KalNet.send("PATCH", "/api/kalender/calendars/" + KalNet.enc(id), json: ["visible": on])
                if media && on { await self.load(force: true) }
            }
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
    func push(_ ev: KalEvent) async -> String? {
        var body: [String: Any] = ["title": ev.title, "allDay": ev.allDay, "date": ev.day, "location": ev.loc,
                                   "calendar": serverCal(for: ev.cal), "reminder": KalStore.serverReminder(ev.rem),
                                   "remindMinutes": ev.rem ?? 0, "origin": ev.src.isEmpty ? "Kalender" : "Glimt · Kalender"]
        if let s = ev.s { body["start"] = KalD.hm(s) }
        if let e = ev.e { body["end"] = KalD.hm(Swift.min(e, 1439)) }
        if !ev.src.isEmpty { body["note"] = "Lagt til av Glimt: «" + ev.src + "»" } else if !ev.note.isEmpty { body["note"] = ev.note }
        // Q26: gjentakelse fra skjemaet (Gjenta).
        if let r = ev.repeatRule, r != "none" { body["repeat"] = r }
        // Prompt 44: koordinater fra adresseforslaget og deltakere.
        if let la = ev.lat, let lo = ev.lon { body["geo"] = ["lat": la, "lon": lo] }
        if let att = ev.att44, !att.isEmpty { body["attendees"] = att.map { (a: KalAtt44) -> [String: Any] in a.json } }
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
        // Prompt 44: invitasjonen (.ics fra brukerens egen e-post) sendes når hendelsen er lagret.
        if let att = ev.att44, !att.isEmpty {
            let id: String = newId
            Task { _ = await KalEv44.invite(id, att) }
        }
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
            if m.att44 == nil { m.att44 = ev.att44 }
            if m.lat == nil && ev.lat != nil {
                m.lat = ev.lat
                m.lon = ev.lon
            }
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
        // Prompt 44: «Angre» etter Rediger → Lagre.
        if id.hasPrefix("e44:") {
            undoEdit44(String(id.dropFirst(4)))
            return
        }
        // Prompt 39: «Angre» på «Vi ryddet kalenderne: 12 → 4».
        if id == "mig39" {
            Task { await self.undoMigration39() }
            return
        }
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
        KalW70.reload()
    }

    func savePending() {
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
        // Prompt 42: «… og 3 trekk på til sammen 627 kr» (Abonnementer, også når kalenderen er skjult).
        t += KalAb42.weekLine(upcoming(limit: 300, includeHidden: true), from: tk, to: KalD.addKey(KalD.key(KalWeek35.start(KalD.today())), 6))
        return t
    }

    static func stripFrist(_ s: String) -> String {
        s.hasPrefix("Frist: ") ? String(s.dropFirst(7)) : s
    }

    /* ---------- Ny hendelse ---------- */

    func openNew(day: String? = nil, s: Int? = nil, e: Int? = nil) {
        KalHaptic.tap()
        // Prompt 46: valgt tidsluke/dag først, ellers i dag (uke/3 d/dag: første synlige dag når i dag ikke vises), neste hele time.
        let base: String = day ?? newDay46()
        let st: Int = s ?? KalStore.nextHour46()
        let en: Int = e ?? Swift.min(1439, st + defDur)
        var f: KalNewForm = KalNewForm()
        f.day = KalD.date(base)
        f.start = KalD.at(base, st)
        f.end = KalD.at(base, en)
        f.cal = defCalId46
        f.rem = defRem
        // Prompt 46: aldri grå skjerm – arket åpnes via vakten (logger og viser «Kunne ikke åpne ny hendelse» hvis det ikke vises).
        presentNew46(f)
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

/* ---------------- Prompt 35: Kalender – zoom, kalenderstyring og innstillinger (KalStore) ---------------- */
// Zoom-kjeden År → Måned → Uke → 3 dager → Dag (zoomTo/zoomStep i fasiten): trykk, pinch (> 1,22× / < 0,82×) og tittel-trykk.
// Den nye visningen vokser fra trykkpunktet (scale .55 → 1 inn, 1.6 → 1 ut, 0,38 s cubic-bezier(.2,.8,.2,1)), lett haptikk.
// Kalendere: farge (12 valg), vis/skjul, skjul fra menyen, iCal-abonnement, Home Assistant og fjerning – synkes til profilen.
// Innstillinger: PUT /api/kalender/calendars/prefs (weekStart, openView, defaultDuration, timelineStart, varsler …).

enum KalZoom35 {
    /// Rekkefølgen i visningsvelgeren (retningen på animasjonen).
    static let order: [String] = ["ar", "mnd", "uke", "3d", "dag", "liste"]
    /// Zoom ut ett nivå.
    static let outOf: [String: String] = ["dag": "3d", "3d": "uke", "uke": "mnd", "mnd": "ar", "ar": "ar", "liste": "mnd"]

    static func clampUnit(_ v: CGFloat) -> CGFloat { Swift.max(0, Swift.min(0.999, v)) }
}

extension KalStore {
    /* ---------- Zoom ---------- */

    func zoomTo(_ v: String, day: String?, origin: UnitPoint, inward: Bool) {
        let same: Bool = v == view && (day == nil || day == anchor)
        if same { return }
        KalHaptic.tap()
        zoomOrigin = origin
        zoomInward = inward
        let anim: Animation = UIAccessibility.isReduceMotionEnabled
            ? Animation.easeOut(duration: 0.2)
            : Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.38)
        withAnimation(anim) {
            view = v
            if let day { anchor = day } else if v == "liste" { anchor = KalD.todayKey() }
        }
        Task { await load() }
    }

    /// Zoom ut ett nivå (klyp sammen eller trykk på tittelen).
    func zoomOutStep(_ origin: UnitPoint) {
        let to: String = KalZoom35.outOf[view] ?? "mnd"
        if to == view { return }
        var day: String? = nil
        if view == "liste" { day = KalD.todayKey() }
        zoomTo(to, day: day, origin: origin, inward: false)
    }

    /// Spre to fingre: inn ett nivå fra punktet man klypte.
    func zoomInAt(_ p: UnitPoint) {
        let A: Date = KalD.date(anchor)
        let x: CGFloat = KalZoom35.clampUnit(p.x)
        let y: CGFloat = KalZoom35.clampUnit(p.y)
        switch view {
        case "ar":
            let col: Int = Int(x * 3)
            let row: Int = Int(y * 4)
            let m: Int = Swift.min(12, row * 3 + col + 1)
            if let d = KalQuick.makeDate(KalD.year(A), m, 1) { zoomTo("mnd", day: KalD.key(d), origin: p, inward: true) }
        case "mnd":
            let first: Date = KalD.firstOfMonth(A)
            let start: Date = KalWeek35.start(first)
            let rows: Int = KalWeek35.rows(first)
            let row: Int = Swift.min(rows - 1, Int(y * CGFloat(rows)))
            let col: Int = Swift.min(6, Int(x * 7))
            zoomTo("uke", day: KalD.key(KalD.add(start, row * 7 + col)), origin: p, inward: true)
        case "uke":
            let col: Int = Swift.min(6, Int(x * 7))
            zoomTo("3d", day: KalD.key(KalD.add(KalWeek35.start(A), col)), origin: p, inward: true)
        case "3d":
            let col: Int = Swift.min(2, Int(x * 3))
            zoomTo("dag", day: KalD.key(KalD.add(A, col)), origin: p, inward: true)
        default:
            break
        }
    }

    func pinch(_ m: CGFloat, at p: UnitPoint) {
        if m > 1.22 { zoomInAt(p) } else if m < 0.82 { zoomOutStep(p) }
    }

    /* ---------- Innstillinger ---------- */

    /// Sender ett eller flere valg til profilen (PUT /api/kalender/calendars/prefs).
    func savePrefs(_ body: [String: Any]) {
        Task { await KalCalAPI35.putPrefs(body) }
    }

    /// Valg fra profilen (samme for web, Homelab og widgetene). Bare feltene serveren sender.
    func applyServerPrefs(_ p: [String: String]) {
        if let v = p["weekStart"], (v == "mon" || v == "sun"), v != weekStart { weekStart = v }
        if let v = p["openView"], ["mnd", "uke", "3d", "dag", "liste"].contains(v), v != openView { openView = v }
        if let v = p["defaultDuration"], let n = Int(v), [30, 60, 90, 120].contains(n), n != defDur { defDur = n }
        if let v = p["timelineStart"], ["now", "06", "08"].contains(v), v != tlStart { tlStart = v }
        if let v = p["notifyBirthdays"] { nBd = v == "true" }
        if let v = p["notifyDeadlines"] { nFr = v == "true" }
        if let v = p["notifyBrief"] { nBrief = v == "true" }
        if let v = p["travelTime"] { nTv = v == "true" }
        if let v = p["weekNumbers"] { showWeeks = v == "true" }
        if let v = p["weather"] { showWx = v == "true" }
        if let v = p["theme"], ["system", "light", "dark"].contains(v), v != theme { theme = v }
        if let v = p["defaultReminder"], let m = KalCalAPI35.remFromServer(v), m != defRemRaw { defRemRaw = m }
        // Prompt 46: standardkalenderen (samme som web og Homelab).
        if let v = p["defaultCalendar"], !v.isEmpty, v != defCal46 { defCal46 = v }
    }

    /* ---------- Kalendere ---------- */

    /// Ny farge: tekstfargene regnes ut, lagres lokalt til serveren har bekreftet (PATCH {color}).
    func setColor(_ id: String, _ hex: String) {
        KalHaptic.tap()
        guard let i = cals.firstIndex(where: { (c: KalCal) -> Bool in c.id == id }) else { return }
        cals[i] = KalTone35.apply(cals[i], hex: hex)
        colLocal[id] = hex
        UserDefaults.standard.set(colLocal, forKey: "kal.calCol")
        rebuild()
        saveSnapshot()
        if serverCals {
            Task {
                if await KalCalAPI35.patch(id, ["color": hex]) != nil {
                    self.colLocal.removeValue(forKey: id)
                    UserDefaults.standard.set(self.colLocal, forKey: "kal.calCol")
                }
            }
        }
    }

    /// Skjul fra menyen / Vis i menyen (PATCH {hidMenu}). Skjulte kalendere forsvinner fra lista og visningene.
    func setHidMenu(_ id: String, _ hide: Bool) {
        KalHaptic.tap()
        guard let i = cals.firstIndex(where: { (c: KalCal) -> Bool in c.id == id }) else { return }
        cals[i].hidMenu = hide
        hidMenuLocal[id] = hide
        UserDefaults.standard.set(hidMenuLocal, forKey: "kal.hidMenu")
        rebuild()
        saveSnapshot()
        if serverCals {
            Task {
                // Eldre servere ignorerer feltet: behold det lokalt til svaret viser hidMenu.
                if let d = await KalCalAPI35.patch(id, ["hidMenu": hide]), KalCalAPI35.echoes(d, "hidMenu") {
                    self.hidMenuLocal.removeValue(forKey: id)
                    UserDefaults.standard.set(self.hidMenuLocal, forKey: "kal.hidMenu")
                }
            }
        }
    }

    var hiddenFromMenu: [KalCal] { cals.filter { (c: KalCal) -> Bool in !c.inMenu } }

    /// Abonner på en iCal-lenke. → feilmelding, eller tom ved suksess.
    func addIcal(url: String, name: String, hex: String) async -> String {
        do {
            let made: KalCal? = try await KalCalAPI35.addIcal(url: url, name: name, color: hex)
            let n: String = made?.name ?? name
            showToast("Abonnerer på «" + n + "»", undo: "")
            await load(force: true)
            return ""
        } catch let e as KalNetError {
            if e.status == 404 { return "Serveren støtter ikke iCal-abonnement ennå. Oppdater Homelab." }
            return e.message
        } catch {
            return error.localizedDescription
        }
    }

    /// Legg til valgte Home Assistant-kalendere med farger fordelt automatisk.
    func addHa(_ ids: [String], baseHex: String) async -> String {
        if ids.isEmpty { return "" }
        var colors: [String: String] = [:]
        let start: Int = KalTone35.swatches.firstIndex(of: baseHex) ?? 0
        for (ix, id) in ids.enumerated() {
            colors[id] = KalTone35.swatches[(start + ix * 2) % KalTone35.swatches.count]
        }
        do {
            _ = try await KalCalAPI35.addHa(ids, colors: colors)
            showToast(String(ids.count) + (ids.count == 1 ? " kalender" : " kalendere") + " fra Home Assistant lagt til", undo: "")
            await load(force: true)
            return ""
        } catch let e as KalNetError {
            if e.status == 404 { return "Serveren støtter ikke Home Assistant-kalendere ennå." }
            return e.message
        } catch {
            return error.localizedDescription
        }
    }

    /// × for kalendere man har lagt til selv (egne, iCal, HA).
    func removeCal(_ c: KalCal) {
        KalHaptic.tap()
        if c.local || !serverCals {
            Task { await deleteCalendar(c.id) }
            showToast("«" + c.name + "» fjernet", undo: "")
            return
        }
        Task {
            do {
                try await KalCalAPI35.remove(c.id)
                self.cals.removeAll { (x: KalCal) -> Bool in x.id == c.id }
                self.rebuild()
                self.saveSnapshot()
                self.showToast("«" + c.name + "» fjernet", undo: "")
            } catch let e as KalNetError {
                self.showToast("Kunne ikke fjerne: " + e.message, undo: "")
            } catch {}
        }
    }

    /// Settings → «Kontoer og synk»: lukk innstillingene og åpne «Legg til kalender → Konto» i sidemenyen.
    func openAccounts() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28)) {
            settingsOpen = false
            drawerOpen = true
            addCalTab = "acc"
        }
    }

    /// «Glimt» i innstillingene: Homelab → Innstillinger → Glimt.
    func openGlimtSettings() {
        KalHaptic.tap()
        if let u = URL(string: "finanshub://glimt"), UIApplication.shared.canOpenURL(u) {
            UIApplication.shared.open(u)
        } else {
            showToast("Glimt stilles inn i Homelab → Innstillinger → Glimt og AI → Glimt", undo: "")
        }
    }

    /// Tidspunktet tidslinjen starter ved (time).
    func timelineHour(todayIn: Bool) -> Int {
        if tlStart == "06" { return 6 }
        if tlStart == "08" { return 8 }
        return todayIn ? Swift.max(0, KalD.minutesNow() / 60 - 2) : 7
    }
}

/* ---------------- Prompt 39: Kalender – fire kalendere: lagring for Kalendere (1a), Rediger (1b) og Legg til (1c) ---------------- */
// PATCH /api/kalender/calendars/:id {name, color, visible, notify, showInBrief, interval, country} (SERVER39; eldre servere ignorerer feltene).
// Lokale valg (farge, vis/skjul) går via de eksisterende funksjonene, så de huskes til serveren har bekreftet.

/// Det som endres i Rediger (1b).
struct KalCalDraft39: Equatable {
    var name: String = ""
    var hex: String = "#b23a2a"
    var visible: Bool = true
    var notify: Bool = true
    var brief: Bool = true
    var fag: Bool = true
    var interval: String = "1h"
    var country: String = "NO"
}

extension KalStore {
    /* ---------- Navigasjon ---------- */

    func openCals39() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28)) { cals39Open = true }
    }

    func closeCals39() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28)) {
            cal39Edit = nil
            cals39Open = false
        }
    }

    func editCal39(_ id: String?) {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.28)) { cal39Edit = id }
    }

    func openAdd39() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.32)) { cal39AddOpen = true }
    }

    func openGMap39() {
        KalHaptic.tap()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.32)) {
            cal39AddOpen = false
            gmap39Open = true
        }
    }

    /* ---------- Data ---------- */

    /// Kalenderne i 1a: de fire først, så egne.
    var cals39: [KalCal] { cals.uniqueIds() }

    func draft39(_ c: KalCal) -> KalCalDraft39 {
        var d: KalCalDraft39 = KalCalDraft39()
        d.name = c.name
        d.hex = c.hex
        d.visible = c.on
        d.notify = c.p39?.notify ?? KalCals39.notifyDefault(c)
        d.brief = c.p39?.showInBrief ?? true
        d.fag = c.p39?.subjectColors ?? ((UserDefaults.standard.object(forKey: "kal.fag39") as? Bool) ?? true)
        d.interval = (c.p39?.interval ?? "").isEmpty ? "1h" : (c.p39?.interval ?? "1h")
        d.country = (c.p39?.country ?? "").isEmpty ? "NO" : (c.p39?.country ?? "NO")
        return d
    }

    /// Lagre i Rediger. → feilmelding (tom = ok).
    func saveCal39(_ c: KalCal, _ d: KalCalDraft39) async -> String {
        let old: KalCalDraft39 = draft39(c)
        if d.hex.lowercased() != c.hex.lowercased() { setColor(c.id, d.hex) }
        if d.visible != c.on { setCal(c.id, on: d.visible) }
        var body: [String: Any] = [:]
        let name: String = d.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty && name != c.name { body["name"] = name }
        if d.notify != old.notify { body["notify"] = d.notify }
        if d.brief != old.brief { body["showInBrief"] = d.brief }
        if d.interval != old.interval && KalCals39.role(c) == "s" { body["interval"] = d.interval }
        if d.country != old.country && KalCals39.role(c) == "h" { body["country"] = d.country }
        if let i = cals.firstIndex(where: { (x: KalCal) -> Bool in x.id == c.id }) {
            if !name.isEmpty { cals[i].name = name }
            var info: KalCalInfo39 = cals[i].p39 ?? KalCalInfo39()
            info.notify = d.notify
            info.showInBrief = d.brief
            info.subjectColors = d.fag
            if KalCals39.role(c) == "s" { info.interval = d.interval }
            if KalCals39.role(c) == "h" {
                info.country = d.country
                info.sourceLabel = KalCals39.countryName(d.country)
            }
            cals[i].p39 = info
        }
        if d.fag != old.fag {
            UserDefaults.standard.set(d.fag, forKey: "kal.fag39")
            // Eget kall: eldre servere avviser ukjente nøkler, og da skal ikke resten feile.
            let id: String = c.id
            let fag: Bool = d.fag
            Task { _ = await KalCalAPI39.save(id, ["subjectColors": fag]) }
        }
        rebuild()
        saveSnapshot()
        if body.isEmpty || !serverCals || (c.p39?.localHolidays ?? false) { return "" }
        let err: String = await KalCalAPI39.save(c.id, body)
        if err.isEmpty { await load(force: true) }
        return err
    }

    /// «Lim inn ny URL»: adressen fra utklippstavlen. → feilmelding (tom = ok).
    func pasteUrl39(_ c: KalCal) async -> String {
        let raw: String = (UIPasteboard.general.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !KalCalAPI39.validIcs(raw) { return "Kopier en webcal:// eller https://-adresse først." }
        let err: String = await KalCalAPI39.save(c.id, ["url": raw])
        if err.isEmpty {
            showToast("Ny adresse for «" + c.name + "» lagret", undo: "")
            await load(force: true)
        }
        return err
    }

    /// «↻ Oppdater nå».
    func refreshCal39(_ c: KalCal) async -> String {
        let err: String = await KalCalAPI39.refresh(c.id)
        if err.isEmpty {
            showToast("«" + c.name + "» er oppdatert", undo: "")
            await load(force: true)
        }
        return err
    }

    /// Skole uten adresse får URL-en (Legg til Skole) – ellers et nytt abonnement.
    func addUrl39(url: String, name: String) async -> String {
        if let sk = cals.first(where: { (c: KalCal) -> Bool in KalCals39.role(c) == "s" }), (sk.p39?.url ?? "").isEmpty, KalCals39.serverKnows {
            let err: String = await KalCalAPI39.save(sk.id, ["url": url.trimmingCharacters(in: .whitespacesAndNewlines)])
            if err.isEmpty {
                showToast("Skole abonnerer nå på " + KalCals39.host(url), undo: "")
                await load(force: true)
            }
            return err
        }
        return await addIcal(url: url, name: name, hex: KalCals39.colors["s"] ?? "#2f7a4f")
    }

    /* ---------- Opprydding 12 → 4 ---------- */

    /// «Vi ryddet kalenderne: 12 → 4» vises én gang.
    var migration39Text: String {
        let m: KalMigration39 = KalCals39.migration
        let seen: String = UserDefaults.standard.string(forKey: "kal.mig39") ?? ""
        if m.done && m.from > m.to {
            if seen == "s:" + m.undoUntil { return "" }
            return "Vi ryddet kalenderne: " + String(m.from) + " → " + String(m.to) + "."
        }
        if !KalCals39.serverKnows && KalCals39.mergedFrom > 0 && seen.isEmpty {
            return "Vi ryddet kalenderne: " + String(KalCals39.mergedFrom) + " → 4. Hendelsene ligger i Personlig og Skole."
        }
        return ""
    }

    func dismissMigration39() {
        let m: KalMigration39 = KalCals39.migration
        UserDefaults.standard.set(m.done ? "s:" + m.undoUntil : "local", forKey: "kal.mig39")
        rebuild()
    }

    func undoMigration39() async {
        let err: String = await KalCalAPI39.undoMigration()
        if err.isEmpty {
            showToast("Kalenderne er satt tilbake som før", undo: "")
            dismissMigration39()
            await load(force: true)
        } else {
            showToast(err, undo: "")
        }
    }
}

extension KalStore {
    /// Prompt 39: én gang etter oppryddingen på serveren: «Vi ryddet kalenderne: 12 → 4» med Angre.
    func announceMigration39() {
        let m: KalMigration39 = KalCals39.migration
        guard m.done, m.from > m.to else { return }
        let key: String = "kal.mig39toast"
        let mark: String = m.undoUntil.isEmpty ? "done" : m.undoUntil
        if UserDefaults.standard.string(forKey: key) == mark { return }
        UserDefaults.standard.set(mark, forKey: key)
        showToast("Vi ryddet kalenderne: " + String(m.from) + " → " + String(m.to), undo: m.canUndo ? "mig39" : "")
    }
}
