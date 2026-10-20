import SwiftUI
import UIKit
import WidgetKit
import UserNotifications

/* ---------------- Prompt 26: Kalender (Mer → Kalender), data og valg ---------------- */
// Fasit: design/Kalender.dc.html (variant «mobile»). Hendelser fra GET /api/kalender?from=&to= (per bruker:
// skolens iCal, Canvas, Bursdager og Google). Svarer serveren 404 (eldre homelab), vises demotimeplanen.
// Valgene lagres per bruker i /api/me/layout: kalOrder, kalHidden, kalFilters, kalView, kalReminders og subjectColors,
// og lokalt per konto, så de virker også uten nett.

@MainActor
@Observable
final class Cal26Model {
    static let shared = Cal26Model()

    /// Kortene på siden: Nå-kort, Prøver og frister, Kalendere, Kalender og Widgets (som A–E i designet).
    nonisolated static let cardKeys: [String] = ["A", "B", "C", "D", "E"]
    nonisolated static let cardNames: [String: String] = ["A": "Nå-kort", "B": "Prøver og frister", "C": "Kalendere", "D": "Kalender", "E": "Widgets"]
    /// Prompt 27: kalenderne i Kalender v2 (Privat og Familie er Google). Av/på lagres i kalFilters.
    // Prompt 39: fire kalendere – Personlig (gamle «privat»), Bursdager, Skole og Helligdager. De gamle nøklene beholdes for eldre data.
    nonisolated static let filterKeys: [String] = ["timeplan", "prover", "skole", "privat", "familie", "bursdager", "helligdager"]
    nonisolated static let filterNames: [String: String] = ["timeplan": "Timeplan", "prover": "Prøver og frister", "bursdager": "Bursdager", "skole": "Skole",
                                                            "privat": "Personlig", "familie": "Familie", "helligdager": "Helligdager"]

    var events: [CalEvent26] = []
    var subjects: [String: String] = [:]
    var loaded: Bool = false
    var loading: Bool = false
    /// true når serveren ikke har /api/kalender ennå (404): demotimeplanen vises.
    var demo: Bool = false
    var error: String? = nil

    /// uke, maaned eller agenda.
    var view: String = "uke"
    /// Uker (Uke, Agenda) eller måneder (Måned) fra i dag.
    var off: Int = 0
    /// Valgt dag i Måned («2026-10-22»).
    var selDay: String? = nil
    /// Hendelsen i detaljkortet.
    var sel: CalEvent26? = nil
    /// Filtergrupper som er slått av.
    var hiddenFilters: Set<String> = []
    var order: [String] = Cal26Model.cardKeys
    var hiddenCards: Set<String> = []
    /// id → none, 15m, 1h eller day.
    var reminders: [String: String] = [:]
    var subjectColors: [String: String] = [:]
    /// Dyplenke fra widgeten (finanshub://kalender/<id>) som venter på data.
    var pendingOpen: String? = nil

    @ObservationIgnored private var scope: String = "-"
    @ObservationIgnored private var layoutRead: Bool = false
    @ObservationIgnored private var api: API? = nil
    @ObservationIgnored private var lastLoad: Date = .distantPast

    private var localKey: String { AcctScope.key("fh_kal26") }

    private func checkScope() {
        let c: String = AcctScope.current
        if c == scope { return }
        scope = c
        events = []
        subjects = [:]
        loaded = false
        demo = false
        layoutRead = false
        sel = nil
        selDay = nil
        off = 0
        view = "uke"
        hiddenFilters = []
        order = Cal26Model.cardKeys
        hiddenCards = []
        reminders = [:]
        subjectColors = [:]
        loadLocal()
    }

    /* ---------- Henting ---------- */

    func load(_ store: Store, force: Bool = false) async {
        checkScope()
        api = store.api
        if !layoutRead { await readLayout(store) }
        if !force && loaded && Date().timeIntervalSince(lastLoad) < 300 { applyPending(); return }
        loading = true
        defer { loading = false }
        let now: Date = Date()
        let from: String = Cal26.key(Cal26.add(now, -42))
        let to: String = Cal26.key(Cal26.add(now, 120))
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/kalender?from=\(from)&to=\(to)", timeout: 20)
            let r = Cal26.parse(d)
            events = r.events
            subjects = r.subjects
            // Prompt 27: kalenderlisten (calendars) og hentet periode til Kalender v2 (Calendar27Model.swift).
            Cal27Model.shared.applyServer(JS.obj(d), from: from, to: to)
            demo = false
            error = nil
        } catch let e as APIError {
            if e.status == 404 {
                demo = true
                events = Cal26.demo(around: now)
                Cal27Model.shared.applyServer([:], from: from, to: to)
                error = nil
            } else {
                error = e.message
                if events.isEmpty { events = cachedEvents() }
            }
        } catch {
            self.error = error.localizedDescription
            if events.isEmpty { events = cachedEvents() }
        }
        loaded = true
        lastLoad = Date()
        pushWidgets()
        Cal26Notify.reschedule(events, reminders: reminders)
        applyPending()
    }

    private func cachedEvents() -> [CalEvent26] {
        guard let d = WidgetShared.defaults.data(forKey: Cal26.cacheKey) else { return [] }
        return Cal26.parse(d).events
    }

    /// Bufferen til widgetene (App Group) og ny tegning av Kalender-widgeten.
    func pushWidgets() {
        if let d = Cal26.compact(events, from: Date(), days: 21) {
            WidgetShared.defaults.set(d, forKey: Cal26.cacheKey)
        }
        WidgetCenter.shared.reloadTimelines(ofKind: Cal26.widgetKind)
    }

    /* ---------- Oppsett per bruker ---------- */

    private func readLayout(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/me/layout", timeout: 10) else { return }
        layoutRead = true
        applyLayout(JS.obj(d))
    }

    /// kal*-feltene fra /api/me/layout (serveren vinner over det lokale).
    func applyLayout(_ o: [String: Any]) {
        let ord: [String] = JS.strings(o, "kalOrder").filter { Cal26Model.cardKeys.contains($0) }
        if !ord.isEmpty { order = Cal26Model.fullOrder(ord) }
        if o["kalHidden"] != nil {
            hiddenCards = Set(JS.strings(o, "kalHidden").filter { Cal26Model.cardKeys.contains($0) })
        }
        if let f = JS.dict(o, "kalFilters") {
            var h: Set<String> = []
            for k in Cal26Model.filterKeys where JS.bool(f, k) == false { h.insert(k) }
            hiddenFilters = h
        } else if o["kalFilters"] is [Any] {
            hiddenFilters = Set(JS.strings(o, "kalFilters").filter { Cal26Model.filterKeys.contains($0) })
        }
        if let v = JS.str(o, "kalView") {
            view = Cal26Model.normView(v)
            Cal27Model.shared.applyView(v)
        }
        if let r = JS.dict(o, "kalReminders") {
            var out: [String: String] = [:]
            for (k, v) in r { if let s = v as? String, ["none", "15m", "1h", "day"].contains(s) { out[k] = s } }
            reminders = out
        }
        if let c = JS.dict(o, "subjectColors") {
            var out: [String: String] = [:]
            for (k, v) in c { if let s = v as? String, s.hasPrefix("#") { out[k] = s } }
            subjectColors = out
        }
        saveLocal()
    }

    nonisolated static func normView(_ v: String) -> String {
        switch v {
        case "maaned", "mnd", "maned", "måned": return "maaned"
        case "agenda": return "agenda"
        default: return "uke"
        }
    }

    nonisolated static func fullOrder(_ o: [String]) -> [String] {
        var out: [String] = []
        for k in o where cardKeys.contains(k) && !out.contains(k) { out.append(k) }
        for k in cardKeys where !out.contains(k) { out.append(k) }
        return out
    }

    private var filtersJSON: [String: Any] {
        var f: [String: Any] = [:]
        for k in Cal26Model.filterKeys { f[k] = !hiddenFilters.contains(k) }
        return f
    }

    private func save(_ body: [String: Any]) {
        saveLocal()
        guard let api else { return }
        Task { _ = try? await api.callAt("/api", "PUT", "/me/layout", json: body) }
    }

    private func saveLocal() {
        let o: [String: Any] = ["kalOrder": order, "kalHidden": Array(hiddenCards), "kalFilters": filtersJSON,
                                "kalView": view, "kalReminders": reminders]
        if let d = try? JSONSerialization.data(withJSONObject: o) { UserDefaults.standard.set(d, forKey: localKey) }
    }

    private func loadLocal() {
        guard let d = UserDefaults.standard.data(forKey: localKey) else { return }
        let o: [String: Any] = JS.obj(d)
        let ord: [String] = JS.strings(o, "kalOrder")
        if !ord.isEmpty { order = Cal26Model.fullOrder(ord) }
        hiddenCards = Set(JS.strings(o, "kalHidden").filter { Cal26Model.cardKeys.contains($0) })
        if let f = JS.dict(o, "kalFilters") {
            var h: Set<String> = []
            for k in Cal26Model.filterKeys where JS.bool(f, k) == false { h.insert(k) }
            hiddenFilters = h
        }
        if let v = JS.str(o, "kalView") { view = Cal26Model.normView(v) }
        if let r = JS.dict(o, "kalReminders") {
            var out: [String: String] = [:]
            for (k, v) in r { if let s = v as? String { out[k] = s } }
            reminders = out
        }
    }

    /* ---------- Handlinger ---------- */

    func setView(_ v: String) {
        view = Cal26Model.normView(v)
        off = 0
        sel = nil
        Haptics.shared.select()
        save(["kalView": view])
    }

    func toggleFilter(_ k: String) {
        if hiddenFilters.contains(k) { hiddenFilters.remove(k) } else { hiddenFilters.insert(k) }
        Haptics.shared.select()
        save(["kalFilters": filtersJSON])
    }

    func step(_ d: Int) {
        off += d
        sel = nil
        Haptics.shared.select()
    }

    func goToday() {
        off = 0
        selDay = nil
        sel = nil
        Haptics.shared.select()
    }

    /// Trykk på en hendelse åpner detaljkortet; trykk på samme lukker det.
    func open(_ e: CalEvent26) {
        if sel?.id == e.id { sel = nil } else { sel = e }
        Haptics.shared.select()
    }

    /// Fra Prøver og frister: detaljkortet og Agenda.
    func openInAgenda(_ e: CalEvent26) {
        sel = e
        view = "agenda"
        off = 0
        Haptics.shared.select()
    }

    /// Trykk på en dag i Uke: Måned med dagen valgt.
    func openDayInMonth(_ key: String) {
        let d: Date = Cal26.day(key)
        let now: Date = Date()
        let c: Calendar = Cal26.cal
        let dy: Int = c.component(.year, from: d) - c.component(.year, from: now)
        let dm: Int = c.component(.month, from: d) - c.component(.month, from: now)
        view = "maaned"
        off = dy * 12 + dm
        selDay = key
        sel = nil
        Haptics.shared.select()
        save(["kalView": view])
    }

    /// Standard: dagen før for prøver og frister, ingen for timer og resten.
    func reminder(_ e: CalEvent26) -> String {
        if let r = reminders[e.id] { return r }
        return e.isTest ? "day" : "none"
    }

    func setReminder(_ e: CalEvent26, _ v: String) {
        reminders[e.id] = v
        Haptics.shared.select()
        save(["kalReminders": reminders])
        if v != "none" {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        }
        Cal26Notify.reschedule(events, reminders: reminders)
    }

    /* ---------- Rediger-modus ---------- */

    var visibleCards: [String] { order.filter { !hiddenCards.contains($0) } }

    func moveCard(_ k: String, _ dir: Int) {
        var o: [String] = Cal26Model.fullOrder(order)
        guard let i = o.firstIndex(of: k) else { return }
        let j: Int = i + dir
        guard j >= 0, j < o.count else { return }
        o.swapAt(i, j)
        Haptics.shared.tick()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { order = o }
        save(["kalOrder": order])
    }

    /// Skjuler et kort. Minst ett kort må være synlig.
    func hideCard(_ k: String) {
        if visibleCards.count <= 1 { return }
        Haptics.shared.tick()
        withAnimation(.easeOut(duration: 0.2)) { _ = hiddenCards.insert(k) }
        save(["kalHidden": Array(hiddenCards)])
    }

    func showCard(_ k: String) {
        Haptics.shared.tick()
        withAnimation(.easeOut(duration: 0.2)) { _ = hiddenCards.remove(k) }
        save(["kalHidden": Array(hiddenCards)])
    }

    /// Tilbakestill: alle kort synlige og standard rekkefølge.
    func resetCards() {
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.2)) {
            order = Cal26Model.cardKeys
            hiddenCards = []
        }
        save(["kalOrder": order, "kalHidden": [String]()])
    }

    /* ---------- Dyplenker ---------- */

    /// finanshub://kalender[/<id>]
    func openLink(_ url: URL, _ store: Store) {
        // Prompt 29: finanshub://kalender?date=YYYY-MM-DD (rask time ferdig) og ?quick=<jobb> (feilet → skjemaet).
        if Quick29Model.shared.openLink(url, store) { return }
        let parts: [String] = url.pathComponents.filter { $0 != "/" }
        if let id = parts.first, !id.isEmpty { pendingOpen = id.removingPercentEncoding ?? id }
        if store.paper { store.paperGo("kalender") }
        applyPending()
    }

    private func applyPending() {
        guard let id = pendingOpen, loaded else { return }
        pendingOpen = nil
        if let e = events.first(where: { $0.id == id }) {
            sel = e
            if view == "maaned" { selDay = e.dayKey }
            // Prompt 27: Kalender v2 viser dagen og detaljarket.
            Cal27Model.shared.openFromLink(e)
        }
    }

    /* ---------- Avledet ---------- */

    func on(_ key: String) -> [CalEvent26] { Cal26.on(events, key, hidden: hiddenFilters) }

    func hex(_ e: CalEvent26) -> String { e.hex(subjectColors) }

    /// «Skole · høst 2026» i toppbildet.
    var kicker: String {
        let c: Calendar = Cal26.cal
        let now: Date = Date()
        let y: Int = c.component(.year, from: now)
        let m: Int = c.component(.month, from: now)
        return m >= 8 ? "Skole · høst \(y)" : "Skole · vår \(y)"
    }
}

/* ---------- Lokale påminnelser ---------- */

/// UNCalendarNotificationTrigger per hendelse med påminnelse. De 40 nærmeste planlegges (iOS tillater 64).
enum Cal26Notify {
    static let prefix: String = "kal26-"

    @MainActor static func reschedule(_ events: [CalEvent26], reminders: [String: String]) {
        let center: UNUserNotificationCenter = UNUserNotificationCenter.current()
        let now: Date = Date()
        var plans: [(String, Date, String, String)] = []
        for e in events where e.end > now {
            let r: String = reminders[e.id] ?? (e.isTest ? "day" : "none")
            guard let at = fireDate(e, r), at > now else { continue }
            let body: String = [e.timeText, e.room].filter { !$0.isEmpty }.joined(separator: " · ")
            plans.append((prefix + e.id, at, e.title, body))
        }
        plans.sort { a, b in a.1 < b.1 }
        let chosen: [(String, Date, String, String)] = Array(plans.prefix(40))
        center.getPendingNotificationRequests { reqs in
            let old: [String] = reqs.map { $0.identifier }.filter { $0.hasPrefix(Cal26Notify.prefix) }
            center.removePendingNotificationRequests(withIdentifiers: old)
            for p in chosen {
                let c = UNMutableNotificationContent()
                c.title = p.2
                c.body = p.3
                c.sound = .default
                c.userInfo = ["url": "finanshub://kalender"]
                let comps: DateComponents = Cal26.cal.dateComponents([.year, .month, .day, .hour, .minute], from: p.1)
                let trig = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
                center.add(UNNotificationRequest(identifier: p.0, content: c, trigger: trig)) { _ in }
            }
        }
    }

    /// 15 min / 1 time før start, eller dagen før kl. 18.
    static func fireDate(_ e: CalEvent26, _ r: String) -> Date? {
        let startAt: Date = e.startMin >= 0 ? e.start : (e.type == "innl" ? e.end : Cal26.startOfDay(e.start).addingTimeInterval(8 * 3600))
        switch r {
        case "15m": return startAt.addingTimeInterval(-900)
        case "1h": return startAt.addingTimeInterval(-3600)
        case "day": return Cal26.startOfDay(Cal26.add(e.start, -1)).addingTimeInterval(18 * 3600)
        default: return nil
        }
    }
}
