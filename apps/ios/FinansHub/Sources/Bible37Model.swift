import SwiftUI
import UIKit
import UserNotifications

/* ---------------- Prompt 37: Dagens bibelvers – modell (bare brukere med modulen, standard «sebastian») ---------------- */
// prompts/prompt-37-pakke/claude-code-bibelvers.md og design/Bibelvers.dc.html.
// SERVER37: GET /api/bible/today?period=morning|evening, GET /api/bible/next?offset=n, GET/PUT /api/bible/settings,
// GET /api/bible/stats {streak, best, readDays, plan}, POST /api/bible/read {date, period}. 403 / enabled:false = modulen er av.
// Mangler endepunktene (404 eller ingen kontakt), brukes de lokale 1930-versene i Bible37Shared.swift – bare for «sebastian».
// Hjem: bibel_home = {d, read, gone, s} per bruker og enhet (synkes ikke). Lest = synlig lenge nok (4 s + 45 ms per tegn,
// maks 14 s); da skjules kortet ved neste økt samme dag. Sveipet bort = skjult på Hjem resten av dagen. Begge → nederst i briefen.

struct BiblePlan37: Identifiable, Hashable {
    let id: String
    let name: String
    let book: String
    let days: Int

    static let all: [BiblePlan37] = [
        BiblePlan37(id: "joh", name: "Johannes", book: "Johannes", days: 21),
        BiblePlan37(id: "sal", name: "Salmene", book: "Salme", days: 30),
        BiblePlan37(id: "ord", name: "Ordspråkene", book: "Ordspråkene", days: 31),
        BiblePlan37(id: "mark", name: "Markus", book: "Markus", days: 16),
    ]

    static func get(_ id: String) -> BiblePlan37 { all.first { $0.id == id } ?? all[0] }

    /// «Johannes 8» eller «Salme 36–40».
    func chapter(_ day: Int) -> String {
        let d: Int = Swift.min(Swift.max(1, day), days)
        if id == "sal" { return book + " \(d * 5 - 4)–\(d * 5)" }
        return book + " \(d)"
    }
}

@MainActor
@Observable
final class Bible37Model {
    static let shared = Bible37Model()

    /// Modulen er på for brukeren som er logget inn.
    var enabled: Bool = Bible37.cached.enabled
    var morning: Verse37? = nil
    var evening: Verse37? = nil
    /// ↻ i briefen: et annet vers bare for denne visningen.
    var extra: Verse37? = nil
    var extraOffset: Int = 0

    var streak: Int = 0
    var best: Int = 0
    var readDays: [String] = []
    var saved: [Verse37] = []
    var planId: String = "joh"
    var planDay: Int = 1
    var planDoneDate: String = ""
    var reminder: Bool = false
    var inMorning: Bool = true
    var inEvening: Bool = true
    var explain: String = ""
    var explaining: Bool = false
    var sheetOpen: Bool = false

    /// bibel_home for i dag.
    var homeDate: String = ""
    var homeRead: Bool = false
    var homeGone: Bool = false
    var homeSess: String = ""
    /// Økten: ny ved oppstart og når appen kommer tilbake etter mer enn 5 min i bakgrunnen.
    var session: String = UUID().uuidString

    @ObservationIgnored private var loadedFor: String = "-"
    @ObservationIgnored private var loadedAt: Date = .distantPast
    @ObservationIgnored private var bgAt: Date? = nil
    @ObservationIgnored private var observing: Bool = false
    @ObservationIgnored var serverMissing: Bool = false

    private static var homeKey: String { AcctScope.key("bibel_home") }
    private static var localKey: String { AcctScope.key("bibel_progress") }

    /* ---------- Avledet ---------- */

    var today: String { Bible37.iso() }

    /// Dagens vers for perioden nå (↻ overstyrer).
    var current: Verse37 {
        if let e = extra { return e }
        let per: String = Bible37.period()
        if per == "morning", let m = morning { return m }
        if per == "evening", let e = evening { return e }
        return Bible37.local(per)
    }

    var readToday: Bool { readDays.contains(today) }

    /// Skjult på Hjem: sveipet bort i dag, eller lest i en tidligere økt i dag.
    var hiddenOnHome: Bool {
        homeDate == today && (homeGone || (homeRead && homeSess != session))
    }

    /// Plassen i briefen: «top» om morgenen (før 11) og kvelden (fra 17), «bottom» når det er lest/sveipet bort, ellers ingen.
    var briefPlace: String {
        if !enabled { return "" }
        if hiddenOnHome { return "bottom" }
        let h: Int = Bible37.cal.component(.hour, from: Date())
        if (h >= 5 && h < 11 && inMorning) || ((h >= 17 || h < 5) && inEvening) { return "top" }
        return ""
    }

    var plan: BiblePlan37 { BiblePlan37.get(planId) }
    var planDoneToday: Bool { planDoneDate == today }

    /* ---------- Lasting ---------- */

    func load(_ store: Store, force: Bool = false) async {
        observe()
        let acct: String = store.account?.id ?? ""
        if acct != loadedFor {
            loadedFor = acct
            readLocal()
            readHome()
            loadedAt = .distantPast
        }
        if !force && Date().timeIntervalSince(loadedAt) < 600 && morning != nil { return }
        loadedAt = Date()
        let isSeb: Bool = (store.account?.username ?? "").lowercased() == "sebastian"
        var on: Bool? = nil
        var missing: Bool = false
        var m: Verse37? = nil
        var e: Verse37? = nil
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/bible/today?period=morning", timeout: 12)
            let r = Bible37.parse(d)
            on = r.enabled
            m = r.verse
            if let d2 = try? await store.api.callAt("/api", "GET", "/bible/today?period=evening", timeout: 12) {
                e = Bible37.parse(d2).verse
            }
        } catch let err as APIError {
            if err.status == 403 { on = false } else { missing = true }
        } catch {
            missing = true
        }
        serverMissing = missing
        if missing {
            // Serveren mangler bibel-API-et: lokale vers, bare for «sebastian».
            on = isSeb
            m = Bible37.local("morning")
            e = Bible37.local("evening")
        }
        let isOn: Bool = on ?? (m != nil)
        withAnimation(.easeOut(duration: 0.25)) { enabled = isOn }
        morning = m ?? Bible37.local("morning")
        evening = e ?? Bible37.local("evening")
        if isOn && !missing {
            await loadStats(store)
            await loadSettings(store)
        } else {
            recomputeStreak()
        }
        Bible37.push(enabled: isOn, morning: morning, evening: evening, streak: streak)
    }

    private func loadStats(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/bible/stats", timeout: 12) else { recomputeStreak(); return }
        let o: [String: Any] = JS.obj(d)
        let days: [String] = JS.strings(o, "readDays")
        if !days.isEmpty {
            var all: Set<String> = Set(readDays)
            for x in days { all.insert(String(x.prefix(10))) }
            readDays = all.sorted()
        }
        recomputeStreak()
        if let s = JS.int(o, "streak") { streak = Swift.max(streak, s) }
        if let b = JS.int(o, "best") { best = Swift.max(best, b) }
        if let pl = JS.dict(o, "plan") {
            if let id = JS.str(pl, "id"), BiblePlan37.all.contains(where: { $0.id == id }) { planId = id }
            if let dd = JS.int(pl, "day") { planDay = Swift.max(1, dd) }
            if let dn = JS.str(pl, "doneDate") { planDoneDate = String(dn.prefix(10)) }
        }
        writeLocal()
    }

    private func loadSettings(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/bible/settings", timeout: 12) else { return }
        let o: [String: Any] = JS.dict(JS.obj(d), "settings") ?? JS.obj(d)
        if let v = JS.bool(o, "morning") { inMorning = v }
        if let v = JS.bool(o, "evening") { inEvening = v }
        if let v = JS.bool(o, "notify") { reminder = v }
    }

    /// PUT /api/bible/settings (tåler at serveren mangler den).
    func saveSettings(_ store: Store) {
        writeLocal()
        let body: [String: Any] = ["enabled": enabled, "morning": inMorning, "evening": inEvening, "notify": reminder, "translation": "1930"]
        Task { _ = try? await store.api.callAt("/api", "PUT", "/bible/settings", json: body, timeout: 12) }
    }

    /// ↻: neste vers (bare denne visningen). GET /api/bible/next?offset=n, ellers lokalt.
    func next(_ store: Store) {
        Haptics.shared.select()
        extraOffset += 1
        let off: Int = extraOffset
        let per: String = Bible37.period()
        Task { @MainActor in
            var v: Verse37? = nil
            if !serverMissing, let d = try? await store.api.callAt("/api", "GET", "/bible/next?offset=\(off)&period=\(per)", timeout: 10) {
                v = Bible37.parse(d).verse
            }
            let nv: Verse37 = v ?? Bible37.local(per, offset: off)
            withAnimation(.easeOut(duration: 0.25)) { extra = nv }
        }
    }

    /* ---------- Lest, rekke og leseplan ---------- */

    func markRead(_ store: Store) {
        if readToday { return }
        Haptics.shared.success()
        withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
            readDays.append(today)
            recomputeStreak()
        }
        writeLocal()
        let body: [String: Any] = ["date": today, "period": Bible37.period()]
        Task { _ = try? await store.api.callAt("/api", "POST", "/bible/read", json: body, timeout: 12) }
        Bible37.push(enabled: enabled, morning: morning, evening: evening, streak: streak)
    }

    func choosePlan(_ id: String) {
        Haptics.shared.select()
        if id == planId { return }
        withAnimation(.easeOut(duration: 0.2)) {
            planId = id
            planDay = 1
            planDoneDate = ""
        }
        writeLocal()
    }

    func planDone(_ store: Store) {
        if planDoneToday { return }
        withAnimation(.easeOut(duration: 0.2)) {
            planDoneDate = today
            if planDay < plan.days { planDay += 1 }
        }
        markRead(store)
        writeLocal()
    }

    /// Rekken: dager på rad bakover fra i dag (eller i går, når dagens ikke er lest ennå).
    func recomputeStreak() {
        let set: Set<String> = Set(readDays)
        let cal: Calendar = Bible37.cal
        var day: Date = Date()
        if !set.contains(Bible37.iso(day)) { day = cal.date(byAdding: .day, value: -1, to: day) ?? day }
        var n: Int = 0
        while set.contains(Bible37.iso(day)) && n < 3660 {
            n += 1
            day = cal.date(byAdding: .day, value: -1, to: day) ?? day
        }
        streak = n
        best = Swift.max(best, n, longest(set))
    }

    private func longest(_ set: Set<String>) -> Int {
        let sorted: [String] = set.sorted()
        var bestRun: Int = 0
        var run: Int = 0
        var prev: Date? = nil
        for s in sorted {
            guard let d = Trials32b.date(s) else { continue }
            if let p = prev, let next = Bible37.cal.date(byAdding: .day, value: 1, to: p), Bible37.cal.isDate(next, inSameDayAs: d) {
                run += 1
            } else {
                run = 1
            }
            bestRun = Swift.max(bestRun, run)
            prev = d
        }
        return bestRun
    }

    /// Ukeprikkene M–S for denne uken: (bokstav, lest, i dag).
    var week: [(String, Bool, Bool)] {
        let cal: Calendar = Bible37.cal
        let now: Date = Date()
        let wd: Int = (cal.component(.weekday, from: now) + 5) % 7
        let monday: Date = cal.date(byAdding: .day, value: -wd, to: cal.startOfDay(for: now)) ?? now
        let letters: [String] = ["M", "T", "O", "T", "F", "L", "S"]
        var out: [(String, Bool, Bool)] = []
        for i in 0..<7 {
            let d: Date = cal.date(byAdding: .day, value: i, to: monday) ?? monday
            let iso: String = Bible37.iso(d)
            out.append((letters[i], readDays.contains(iso), iso == today))
        }
        return out
    }

    /* ---------- Lagrede vers ---------- */

    func isSaved(_ v: Verse37) -> Bool { saved.contains { $0.ref == v.ref } }

    func toggleSave(_ v: Verse37) {
        Haptics.shared.tap()
        withAnimation(.easeOut(duration: 0.2)) {
            if isSaved(v) { saved.removeAll { $0.ref == v.ref } } else { saved.insert(v, at: 0) }
        }
        writeLocal()
    }

    func removeSaved(_ v: Verse37) {
        withAnimation(.easeOut(duration: 0.2)) { saved.removeAll { $0.ref == v.ref } }
        writeLocal()
    }

    /* ---------- Forklar ---------- */

    func explainVerse(_ v: Verse37, _ store: Store) {
        if explaining { return }
        explaining = true
        explain = ""
        Task { @MainActor in
            var text: String = ""
            let body: [String: Any] = ["ref": v.ref, "text": v.text]
            if !serverMissing, let d = try? await store.api.callAt("/api", "POST", "/bible/explain", json: body, timeout: 40) {
                text = JS.str(JS.obj(d), "text") ?? ""
            }
            if text.isEmpty {
                text = v.ref + ": " + (v.isMorning
                    ? "Et morgenvers om håp og styrke for dagen. Les versene rundt for sammenhengen, og tenk på hva det betyr for deg i dag."
                    : "Et kveldsvers om fred og hvile. Les versene rundt for sammenhengen, og legg dagen fra deg med det.")
            }
            withAnimation(.easeOut(duration: 0.25)) {
                explain = text
                explaining = false
            }
        }
    }

    /* ---------- Påminnelse kl. 07 ---------- */

    func setReminder(_ on: Bool, _ store: Store) {
        Haptics.shared.select()
        reminder = on
        saveSettings(store)
        let c: UNUserNotificationCenter = UNUserNotificationCenter.current()
        c.removePendingNotificationRequests(withIdentifiers: ["bible37.morning", "bible37.streak"])
        if !on { return }
        c.requestAuthorization(options: [.alert, .sound]) { (_: Bool, _: Error?) in }
        let a = UNMutableNotificationContent()
        a.title = "Dagens vers er klart"
        a.body = "Les dagens bibelvers i Homelab."
        a.sound = .default
        var dc = DateComponents()
        dc.hour = 7
        dc.minute = 0
        c.add(UNNotificationRequest(identifier: "bible37.morning", content: a, trigger: UNCalendarNotificationTrigger(dateMatching: dc, repeats: true)))
        let b = UNMutableNotificationContent()
        b.title = "Hold rekken"
        b.body = "Dagens vers venter."
        b.sound = .default
        var dk = DateComponents()
        dk.hour = 21
        dk.minute = 0
        c.add(UNNotificationRequest(identifier: "bible37.streak", content: b, trigger: UNCalendarNotificationTrigger(dateMatching: dk, repeats: true)))
    }

    /* ---------- Hjem: lest / sveipet bort ---------- */

    /// Kortet har vært synlig lenge nok: lest i dag (skjules ved neste økt).
    func setHomeRead() {
        if homeDate == today && homeRead { return }
        homeDate = today
        homeRead = true
        homeGone = false
        homeSess = session
        writeHome()
    }

    /// Sveipet bort: skjult på Hjem resten av dagen, nederst i briefen.
    func setHomeGone() {
        withAnimation(.easeInOut(duration: 0.34)) {
            homeDate = today
            homeRead = true
            homeGone = true
            homeSess = session
        }
        writeHome()
    }

    /// Lesetid: 4 s + 45 ms per tegn, maks 14 s.
    var readNanos: UInt64 {
        let ms: Int = Swift.min(14_000, 4_000 + current.text.count * 45)
        return UInt64(ms) * 1_000_000
    }

    private func observe() {
        if observing { return }
        observing = true
        let nc: NotificationCenter = NotificationCenter.default
        nc.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { (_: Notification) in
            MainActor.assumeIsolated { Bible37Model.shared.wentBackground() }
        }
        nc.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { (_: Notification) in
            MainActor.assumeIsolated { Bible37Model.shared.cameBack() }
        }
    }

    func wentBackground() { bgAt = Date() }

    func cameBack() {
        if let t = bgAt, Date().timeIntervalSince(t) > 300 { session = UUID().uuidString }
        bgAt = nil
        if homeDate != today { readHome() }
    }

    /* ---------- Lokal lagring ---------- */

    private func readHome() {
        homeDate = ""
        homeRead = false
        homeGone = false
        homeSess = ""
        guard let d = UserDefaults.standard.data(forKey: Bible37Model.homeKey),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return }
        let dd: String = (o["d"] as? String) ?? ""
        if dd != today { return }
        homeDate = dd
        homeRead = (o["read"] as? Bool) ?? false
        homeGone = (o["gone"] as? Bool) ?? false
        homeSess = (o["s"] as? String) ?? ""
    }

    private func writeHome() {
        let o: [String: Any] = ["d": homeDate, "read": homeRead, "gone": homeGone, "s": homeSess]
        if let d = try? JSONSerialization.data(withJSONObject: o) { UserDefaults.standard.set(d, forKey: Bible37Model.homeKey) }
    }

    private func readLocal() {
        readDays = []
        saved = []
        planId = "joh"
        planDay = 1
        planDoneDate = ""
        best = 0
        guard let d = UserDefaults.standard.data(forKey: Bible37Model.localKey),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return }
        readDays = (o["readDays"] as? [String]) ?? []
        best = (o["best"] as? Int) ?? 0
        planId = (o["plan"] as? String) ?? "joh"
        planDay = (o["planDay"] as? Int) ?? 1
        planDoneDate = (o["planDone"] as? String) ?? ""
        reminder = (o["reminder"] as? Bool) ?? false
        var list: [Verse37] = []
        for x in (o["saved"] as? [Any]) ?? [] {
            guard let r = x as? [String: Any], let ref = r["ref"] as? String, let t = r["text"] as? String else { continue }
            list.append(Verse37(ref: ref, text: t, period: (r["period"] as? String) ?? "morning"))
        }
        saved = list
    }

    private func writeLocal() {
        var sv: [[String: Any]] = []
        for v in saved { sv.append(["ref": v.ref, "text": v.text, "period": v.period]) }
        let o: [String: Any] = ["readDays": readDays, "best": best, "plan": planId, "planDay": planDay, "planDone": planDoneDate,
                                "reminder": reminder, "saved": sv]
        if let d = try? JSONSerialization.data(withJSONObject: o) { UserDefaults.standard.set(d, forKey: Bible37Model.localKey) }
    }
}
