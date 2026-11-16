import SwiftUI
import UIKit
import WidgetKit
import UserNotifications

/* ---------------- Q26: kalenderdataene Homelab selv trenger (tynn fasade over GET /api/kalender) ---------------- */
// Selve Kalenderen i Homelab er den delte Kalender-koden (Kalender/, SharedKal/, KAL_EMBED – KalenderInApp.swift). Det som er
// igjen her, er dataene andre deler av Homelab leser uten å åpne Kalender: Oversikt-kortet og -flisen, Mer, briefen, Glimt,
// Chat, Hjemlys, widgetbufferen (App Group) og de lokale påminnelsene. Tidligere lå dette i den gamle kalenderens modell
// (Cal26Model). Hendelsene er de samme som Kalender viser (per bruker: skolens iCal, Canvas, Bursdager og Google).
// Valg per bruker fra /api/me/layout: kalFilters (skjulte kalendere), kalReminders og subjectColors.
// Svarer serveren 404 (eldre homelab), brukes demotimeplanen.

@MainActor
@Observable
final class KalenderData {
    static let shared: KalenderData = KalenderData()

    /// Kalenderne som kan skjules (kalFilters). De gamle nøklene beholdes for eldre data.
    nonisolated static let filterKeys: [String] = ["timeplan", "prover", "skole", "privat", "familie", "bursdager", "helligdager"]

    var events: [CalEvent26] = []
    var subjects: [String: String] = [:]
    var loaded: Bool = false
    var loading: Bool = false
    /// true når serveren ikke har /api/kalender ennå (404): demotimeplanen vises.
    var demo: Bool = false
    var error: String? = nil
    /// Kalendere som er slått av.
    var hiddenFilters: Set<String> = []
    /// id → none, 15m, 1h eller day.
    var reminders: [String: String] = [:]
    var subjectColors: [String: String] = [:]

    @ObservationIgnored private var scope: String = "-"
    @ObservationIgnored private var layoutRead: Bool = false
    @ObservationIgnored private var lastLoad: Date = .distantPast

    /// Samme nøkkel som før, så det lagrede følger med.
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
        hiddenFilters = []
        reminders = [:]
        subjectColors = [:]
        loadLocal()
    }

    /* ---------- Henting ---------- */

    func load(_ store: Store, force: Bool = false) async {
        checkScope()
        if !layoutRead { await readLayout(store) }
        if !force && loaded && Date().timeIntervalSince(lastLoad) < 300 { return }
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
            demo = false
            error = nil
        } catch let e as APIError {
            if e.status == 404 {
                demo = true
                events = Cal26.demo(around: now)
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
        KalenderPaaminnelser.reschedule(events, reminders: reminders)
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

    /// kalFilters, kalReminders og subjectColors fra /api/me/layout (serveren vinner over det lokale).
    func applyLayout(_ o: [String: Any]) {
        if let f = JS.dict(o, "kalFilters") {
            var h: Set<String> = []
            for k in KalenderData.filterKeys where JS.bool(f, k) == false { h.insert(k) }
            hiddenFilters = h
        } else if o["kalFilters"] is [Any] {
            hiddenFilters = Set(JS.strings(o, "kalFilters").filter { KalenderData.filterKeys.contains($0) })
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

    private var filtersJSON: [String: Any] {
        var f: [String: Any] = [:]
        for k in KalenderData.filterKeys { f[k] = !hiddenFilters.contains(k) }
        return f
    }

    private func saveLocal() {
        let o: [String: Any] = ["kalFilters": filtersJSON, "kalReminders": reminders]
        if let d = try? JSONSerialization.data(withJSONObject: o) { UserDefaults.standard.set(d, forKey: localKey) }
    }

    private func loadLocal() {
        guard let d = UserDefaults.standard.data(forKey: localKey) else { return }
        let o: [String: Any] = JS.obj(d)
        if let f = JS.dict(o, "kalFilters") {
            var h: Set<String> = []
            for k in KalenderData.filterKeys where JS.bool(f, k) == false { h.insert(k) }
            hiddenFilters = h
        }
        if let r = JS.dict(o, "kalReminders") {
            var out: [String: String] = [:]
            for (k, v) in r { if let s = v as? String { out[k] = s } }
            reminders = out
        }
    }

    /* ---------- Dyplenker ---------- */

    /// finanshub://kalender[/<id>][?date=…|?quick=…] når lenken ikke ble sendt videre til Kalender (KalLink33.forward):
    /// ?quick= (rask time som feilet) åpner skjemaet, ellers åpnes Kalender på i dag.
    func openLink(_ url: URL, _ store: Store) {
        if Quick29Model.shared.openLink(url, store) { return }
        KalLink33.today()
    }

    /* ---------- Avledet ---------- */

    func on(_ key: String) -> [CalEvent26] { Cal26.on(events, key, hidden: hiddenFilters) }

    func hex(_ e: CalEvent26) -> String { e.hex(subjectColors) }

    /// Standard: dagen før for prøver og frister, ingen for timer og resten.
    func reminder(_ e: CalEvent26) -> String {
        if let r = reminders[e.id] { return r }
        return e.isTest ? "day" : "none"
    }

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
/// Identifikatorene beholder prefikset «kal26-», så påminnelser som allerede er planlagt, byttes ut og ikke dobles.
enum KalenderPaaminnelser {
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
            let old: [String] = reqs.map { $0.identifier }.filter { $0.hasPrefix(KalenderPaaminnelser.prefix) }
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
