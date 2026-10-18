import Foundation
import HealthKit
import BackgroundTasks
import UIKit

/* ---------------- Familie: helsesammendrag fra Apple Helse (HealthKit) ---------------- */

/// Leser bare datatypene brukeren har slått på, lager et sammendrag (i dag og siste 7 dager) og sender det til
/// POST /api/family/health omtrent hvert 15. minutt (BGAppRefreshTask) og når appen åpnes.
@MainActor
@Observable
final class HealthSync {
    static let shared = HealthSync()

    /// (nøkkel, navn, ikon). Nøklene er de samme som i shareHealth på serveren.
    nonisolated static let kinds: [(String, String, String)] = [
        ("steps", "Skritt", "figure.walk"),
        ("restingHr", "Hvilepuls", "heart"),
        ("hr", "Puls", "waveform.path.ecg"),
        ("sleep", "Søvn", "bed.double"),
        ("activeKcal", "Aktive kalorier", "flame"),
        ("week", "Siste 7 dager", "calendar"),
    ]
    nonisolated static let taskId = "no.kristo.finanshub.health"
    nonisolated static let familyTaskId = "no.kristo.finanshub.family"

    private let hk = HKHealthStore()
    // Prompt 21: valgene lagres per konto (AcctScope). Ingenting deles før brukeren slår det på.
    var share: [String: Bool] = (UserDefaults.standard.dictionary(forKey: AcctScope.key("fh_health_share")) as? [String: Bool]) ?? [:] {
        didSet { UserDefaults.standard.set(share, forKey: AcctScope.key("fh_health_share")) }
    }
    var lastSent: Date? = UserDefaults.standard.object(forKey: AcctScope.key("fh_health_sent")) as? Date
    var lastError: String?
    /// Prompt 20: hovedbryteren «Del helsedata». Av = ingen synk, og serverdataene er slettet.
    var master: Bool = (UserDefaults.standard.object(forKey: AcctScope.key("fh_health_master")) as? Bool) ?? false {
        didSet { UserDefaults.standard.set(master, forKey: AcctScope.key("fh_health_master")) }
    }

    /// Kontobytte: les valgene til den nye kontoen. Observatørene stoppes når den nye kontoen ikke deler.
    func reloadForAccount() {
        let ud = UserDefaults.standard
        share = (ud.dictionary(forKey: AcctScope.key("fh_health_share")) as? [String: Bool]) ?? [:]
        lastSent = ud.object(forKey: AcctScope.key("fh_health_sent")) as? Date
        master = (ud.object(forKey: AcctScope.key("fh_health_master")) as? Bool) ?? false
        lastError = nil
        if master { HealthObserver20.shared.start() } else { HealthObserver20.shared.stop() }
    }
    /// iOS sier ikke om lesetilgang er gitt, så vi husker bare at dialogen er vist.
    var asked: Bool = UserDefaults.standard.bool(forKey: "fh_health_asked") {
        didSet { UserDefaults.standard.set(asked, forKey: "fh_health_asked") }
    }
    /// Samme standard som serveren (DEF_PREFS i server/family.js).
    nonisolated static let defaultShare: [String: Bool] = ["steps": true, "restingHr": true, "hr": false, "sleep": true, "activeKcal": true, "week": true]
    var available: Bool { HKHealthStore.isHealthDataAvailable() }

    var statusText: String {
        if !master { return "Deling av helsedata er av. Ingenting sendes, og dataene dine er slettet fra serveren." }
        if let e = lastError { return "Kunne ikke sende: \(e)" }
        if !share.values.contains(true) { return "Ingenting deles. Slå på det du vil at familien skal se. Bare et sammendrag sendes, aldri enkeltmålinger." }
        guard let d = lastSent else { return "Sammendraget sendes omtrent hvert 15. minutt når iOS tillater det." }
        return "Sist sendt " + JS.fmt(d, Calendar.current.isDateInToday(d) ? "HH:mm" : "dd.MM HH:mm") + ". Sendes omtrent hvert 15. minutt."
    }

    /// shareHealth fra serveren (valgt på en annen enhet).
    func applyServer(_ o: [String: Any]) {
        // Hovedbryteren av: serveren har alt slått av, men de lokale valgene beholdes til den slås på igjen.
        guard master else { return }
        var s = share
        for k in HealthSync.kinds.map(\.0) {
            if let v = JS.bool(o, k) { s[k] = v }
        }
        if s != share { share = s }
    }

    func setShare(_ key: String, _ on: Bool, _ store: Store) {
        share[key] = on
        Haptics.shared.select()
        var body: [String: Any] = [:]
        for k in HealthSync.kinds.map(\.0) { body[k] = share[k] ?? false }
        let api = store.api
        Task {
            _ = try? await api.callAt("/api", "PUT", "/family/me", json: ["shareHealth": body])
            if on { await self.requestAuth() }
            await self.syncNow(api)
        }
        HealthSync.schedule()
    }

    private func readTypes() -> Set<HKObjectType> {
        var out = Set<HKObjectType>()
        let on = share
        let week = on["week"] ?? false
        if on["steps"] == true || week, let t = HKObjectType.quantityType(forIdentifier: .stepCount) { out.insert(t) }
        if on["restingHr"] == true || week, let t = HKObjectType.quantityType(forIdentifier: .restingHeartRate) { out.insert(t) }
        if on["hr"] == true, let t = HKObjectType.quantityType(forIdentifier: .heartRate) { out.insert(t) }
        if on["sleep"] == true || week, let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { out.insert(t) }
        if on["activeKcal"] == true || week, let t = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { out.insert(t) }
        if on["activeKcal"] == true, let t = HKObjectType.quantityType(forIdentifier: .appleExerciseTime) { out.insert(t) }
        return out
    }

    /// Alle typene appen kan lese (onboarding og «Be om tilgang»): skritt, puls, hvilepuls, søvn, aktive kalorier og treningsminutter.
    private func allReadTypes() -> Set<HKObjectType> {
        var out = Set<HKObjectType>()
        let ids: [HKQuantityTypeIdentifier] = [.stepCount, .heartRate, .restingHeartRate, .activeEnergyBurned, .appleExerciseTime]
        for id in ids {
            if let t = HKObjectType.quantityType(forIdentifier: id) { out.insert(t) }
        }
        if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { out.insert(t) }
        return out
    }

    /// Viser iOS-dialogen for alle typene. Etterpå ligger appen under Helse → Profil → Apper.
    func requestAll() async {
        guard available else { return }
        do {
            try await hk.requestAuthorization(toShare: [], read: allReadTypes())
            asked = true
            HealthObserver20.shared.start()
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Slår på eller av flere nøkler samtidig (én bryter per datatype i «Helse og posisjon»).
    func setShareGroup(_ keys: [String], _ on: Bool, _ store: Store) {
        var s = share
        for k in keys { s[k] = on }
        share = s
        Haptics.shared.select()
        let api = store.api
        let body: [String: Any] = shareBody(master ? s : [:])
        Task {
            _ = try? await api.callAt("/api", "PUT", "/family/me", json: ["shareHealth": body])
            if on && self.master { await self.requestAuth(); await self.syncNow(api) }
        }
    }

    private func shareBody(_ s: [String: Bool]) -> [String: Any] {
        var body: [String: Any] = [:]
        for k in HealthSync.kinds.map(\.0) { body[k] = s[k] ?? false }
        return body
    }

    /// Hovedbryteren. Av: stopp observatørene og slett egne helsedata på serveren.
    func setMaster(_ on: Bool, _ store: Store) {
        master = on
        Haptics.shared.select()
        let api = store.api
        if on {
            if !share.values.contains(true) { share = HealthSync.defaultShare }
            let body: [String: Any] = shareBody(share)
            HealthObserver20.shared.start()
            HealthSync.schedule()
            Task {
                _ = try? await api.callAt("/api", "PUT", "/family/me", json: ["shareHealth": body])
                await self.requestAll()
                await self.syncNow(api)
            }
        } else {
            HealthObserver20.shared.stop()
            Task { await self.deleteServerData(api) }
        }
    }

    /// DELETE /api/family/health/me. Eldre servere (404): slå av all deling og send en tom dag, så serveren nuller feltene.
    func deleteServerData(_ api: API) async {
        guard !api.base.isEmpty else { return }
        let off: [String: Any] = shareBody([:])
        _ = try? await api.callAt("/api", "PUT", "/family/me", json: ["shareHealth": off])
        do {
            _ = try await api.callAt("/api", "DELETE", "/family/health/me", timeout: 20)
            lastError = nil
        } catch let e as APIError where e.status == 404 || e.status == 405 {
            _ = try? await api.callAt("/api", "POST", "/family/health", json: ["date": isoDay(Date())], timeout: 20)
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Fra onboarding: hovedbryteren på, standardvalgene hvis ingenting er valgt, og iOS-dialogen.
    func enableFromOnboarding(_ store: Store) {
        setMaster(true, store)
    }

    /// Fra HKObserverQuery: høyst hvert 10. minutt.
    func syncIfDue(_ api: API) async {
        if let d = lastSent, Date().timeIntervalSince(d) < 600 { return }
        await syncNow(api)
    }

    func requestAuth() async {
        guard available else { return }
        let types = readTypes()
        guard !types.isEmpty else { return }
        do {
            try await hk.requestAuthorization(toShare: [], read: types)
            asked = true
        } catch { lastError = error.localizedDescription }
    }

    /* ---------- Sammendrag ---------- */

    private func sum(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, from: Date, to: Date) async -> Double? {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return nil }
        let pred = HKQuery.predicateForSamples(withStart: from, end: to, options: .strictStartDate)
        return await withCheckedContinuation { (c: CheckedContinuation<Double?, Never>) in
            let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: pred, options: .cumulativeSum) { _, r, _ in
                c.resume(returning: r?.sumQuantity()?.doubleValue(for: unit))
            }
            hk.execute(q)
        }
    }

    private func latest(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, since: Date) async -> Double? {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return nil }
        let pred = HKQuery.predicateForSamples(withStart: since, end: Date(), options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        return await withCheckedContinuation { (c: CheckedContinuation<Double?, Never>) in
            let q = HKSampleQuery(sampleType: type, predicate: pred, limit: 1, sortDescriptors: [sort]) { _, s, _ in
                c.resume(returning: (s?.first as? HKQuantitySample)?.quantity.doubleValue(for: unit))
            }
            hk.execute(q)
        }
    }

    /// Minutter med søvn natten som endte på `day` (fra kl. 18 dagen før til kl. 12).
    private func sleepMinutes(_ day: Date) async -> Double? {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return nil }
        let cal = Calendar.current
        let start = cal.date(byAdding: .hour, value: -6, to: cal.startOfDay(for: day)) ?? day
        let end = cal.date(byAdding: .hour, value: 12, to: cal.startOfDay(for: day)) ?? day
        let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let asleep: Set<Int> = [HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue, HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                                HKCategoryValueSleepAnalysis.asleepDeep.rawValue, HKCategoryValueSleepAnalysis.asleepREM.rawValue]
        return await withCheckedContinuation { (c: CheckedContinuation<Double?, Never>) in
            let q = HKSampleQuery(sampleType: type, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, s, _ in
                let list = (s as? [HKCategorySample]) ?? []
                let secs = list.filter { asleep.contains($0.value) }.map { $0.endDate.timeIntervalSince($0.startDate) }.reduce(0, +)
                c.resume(returning: list.isEmpty ? nil : secs / 60)
            }
            hk.execute(q)
        }
    }

    private func summary() async -> [String: Any] {
        let on = share
        let cal = Calendar.current
        let now = Date()
        let today = cal.startOfDay(for: now)
        var body: [String: Any] = ["date": isoDay(now)]
        let count = HKUnit.count()
        let bpm = HKUnit.count().unitDivided(by: .minute())
        if on["steps"] == true, let v = await sum(.stepCount, count, from: today, to: now) { body["steps"] = Int(v) }
        if on["activeKcal"] == true, let v = await sum(.activeEnergyBurned, .kilocalorie(), from: today, to: now) { body["activeKcal"] = Int(v) }
        if on["activeKcal"] == true, let v = await sum(.appleExerciseTime, HKUnit.minute(), from: today, to: now) { body["exerciseMin"] = Int(v) }
        if on["restingHr"] == true, let v = await latest(.restingHeartRate, bpm, since: cal.date(byAdding: .day, value: -2, to: today) ?? today) { body["restingHr"] = Int(v) }
        if on["hr"] == true, let v = await latest(.heartRate, bpm, since: cal.date(byAdding: .hour, value: -3, to: now) ?? now) { body["hr"] = Int(v) }
        if on["sleep"] == true, let v = await sleepMinutes(now) { body["sleepMin"] = Int(v) }
        if on["week"] == true {
            var week: [[String: Any]] = []
            for i in (0..<7).reversed() {
                guard let d = cal.date(byAdding: .day, value: -i, to: today), let e = cal.date(byAdding: .day, value: 1, to: d) else { continue }
                var row: [String: Any] = ["date": isoDay(d)]
                if let v = await sum(.stepCount, count, from: d, to: e) { row["steps"] = Int(v) }
                if let v = await sum(.activeEnergyBurned, .kilocalorie(), from: d, to: e) { row["activeKcal"] = Int(v) }
                if let v = await sleepMinutes(d) { row["sleepMin"] = Int(v) }
                if let v = await latest(.restingHeartRate, bpm, since: d) { row["restingHr"] = Int(v) }
                week.append(row)
            }
            body["week"] = week
        }
        return body
    }

    func syncNow(_ api: API) async {
        guard available, master, share.values.contains(true), !api.base.isEmpty else { return }
        let body = await summary()
        do {
            _ = try await api.callAt("/api", "POST", "/family/health", json: body, timeout: 20)
            lastSent = Date()
            UserDefaults.standard.set(lastSent, forKey: AcctScope.key("fh_health_sent"))
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    /* ---------- Bakgrunn (BGTaskScheduler) ---------- */

    /// Kontoen som er i bruk, lest rett fra nøkkelringen (appen kan vekkes i bakgrunnen uten at skjermen er bygget).
    nonisolated static func backgroundAPI() -> API? {
        guard let raw = Keychain.get("accounts"), let d = raw.data(using: .utf8),
              let list = try? JSONDecoder().decode([LoginAccount].self, from: d), !list.isEmpty else { return nil }
        let active = Keychain.get("active")
        let a = list.first { $0.id == active } ?? list[0]
        // Ekstern adresse først: i bakgrunnen er telefonen ofte ikke på hjemmenettet.
        let base = a.external.isEmpty ? a.server : a.external
        return API(base: base, token: a.token)
    }

    /// Må kalles før appen er ferdig startet (App.init).
    nonisolated static func registerBackground() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskId, using: nil) { task in
            HealthSync.schedule()
            let work = Task { @MainActor in
                if let api = HealthSync.backgroundAPI() { await HealthSync.shared.syncNow(api) }
                task.setTaskCompleted(success: true)
            }
            task.expirationHandler = { work.cancel() }
        }
        BGTaskScheduler.shared.register(forTaskWithIdentifier: familyTaskId, using: nil) { task in
            HealthSync.schedule()
            let work = Task { @MainActor in
                if let api = HealthSync.backgroundAPI() { await FamilyModel.shared.pollEvents(api) }
                task.setTaskCompleted(success: true)
            }
            task.expirationHandler = { work.cancel() }
        }
    }

    nonisolated static func schedule() {
        for id in [taskId, familyTaskId] {
            let r = BGAppRefreshTaskRequest(identifier: id)
            r.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
            try? BGTaskScheduler.shared.submit(r)
        }
    }
}
