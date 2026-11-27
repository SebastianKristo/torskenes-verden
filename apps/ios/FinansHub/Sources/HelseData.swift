import Foundation
import HealthKit

/* ---------------- Prompt 57: Helse-siden – data fra Apple Helse til POST /api/helse ----------------
 Appen sender rådata for brukeren selv: dagssummer (skritt, distanse gått og løpt, aktiv energi, treningstid, hvilepuls),
 søvnmålingene med stadium, treningsøktene og vektmålingene. Serveren regner ut «i natt» (Oslo-tid), snitt, trender og tekstene
 (server/helse/regler.js). Appen regner ikke selv. Første gang sendes 30 dager, deretter de siste 3 (hele netter). Familien ser bare
 det brukeren deler (shareHealth), og det filtreres på serveren. */

enum HelseData {
    static let store = HKHealthStore()

    /// Alle typene Helse-siden leser (i tillegg til puls, som bare brukes i Familie).
    static func readTypes() -> Set<HKObjectType> {
        var out = Set<HKObjectType>()
        let ids: [HKQuantityTypeIdentifier] = [.stepCount, .distanceWalkingRunning, .activeEnergyBurned, .appleExerciseTime, .restingHeartRate, .bodyMass]
        for id in ids {
            if let t = HKObjectType.quantityType(forIdentifier: id) { out.insert(t) }
        }
        if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { out.insert(t) }
        out.insert(HKObjectType.workoutType())
        return out
    }

    /// Typene som vekker appen i bakgrunnen når det kommer nye målinger (HealthObserver20).
    static func observedTypes() -> [HKSampleType] {
        var out: [HKSampleType] = [HKObjectType.workoutType()]
        if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { out.append(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .bodyMass) { out.append(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) { out.append(t) }
        return out
    }

    /// Nøkkelen serveren bruker for økttypen (OKT_TYPER i server/helse/regler.js). Ukjent = «other».
    static func typeKey(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .running: return "running"
        case .walking: return "walking"
        case .hiking: return "hiking"
        case .cycling: return "cycling"
        case .swimming: return "swimming"
        case .traditionalStrengthTraining: return "strength"
        case .functionalStrengthTraining: return "functional"
        case .highIntensityIntervalTraining: return "hiit"
        case .yoga: return "yoga"
        case .pilates: return "pilates"
        case .crossCountrySkiing: return "crossCountrySkiing"
        case .downhillSkiing: return "downhillSkiing"
        case .rowing: return "rowing"
        case .elliptical: return "elliptical"
        case .socialDance, .cardioDance: return "dance"
        case .soccer: return "soccer"
        case .coreTraining: return "core"
        case .stairClimbing, .stairs: return "stairs"
        default: return "other"
        }
    }

    /// Søvnstadiet som serveren kjenner (inBed, asleep, awake, core, deep, rem). nil = ukjent verdi.
    static func stage(_ v: Int) -> String? {
        guard let s = HKCategoryValueSleepAnalysis(rawValue: v) else { return nil }
        switch s {
        case .inBed: return "inBed"
        case .asleepUnspecified: return "asleep"
        case .awake: return "awake"
        case .asleepCore: return "core"
        case .asleepDeep: return "deep"
        case .asleepREM: return "rem"
        @unknown default: return nil
        }
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    static func isoTime(_ d: Date) -> String { iso.string(from: d) }

    /* ---------- Spørringer ---------- */

    private static func stat(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, from: Date, to: Date, average: Bool = false) async -> Double? {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return nil }
        let pred = HKQuery.predicateForSamples(withStart: from, end: to, options: .strictStartDate)
        let opts: HKStatisticsOptions = average ? .discreteAverage : .cumulativeSum
        return await withCheckedContinuation { (c: CheckedContinuation<Double?, Never>) in
            let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: pred, options: opts) { _, r, _ in
                let q2: HKQuantity? = average ? r?.averageQuantity() : r?.sumQuantity()
                c.resume(returning: q2?.doubleValue(for: unit))
            }
            store.execute(q)
        }
    }

    private static func samples(_ type: HKSampleType, from: Date, to: Date, limit: Int) async -> [HKSample] {
        let pred = HKQuery.predicateForSamples(withStart: from, end: to, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        return await withCheckedContinuation { (c: CheckedContinuation<[HKSample], Never>) in
            let q = HKSampleQuery(sampleType: type, predicate: pred, limit: limit, sortDescriptors: [sort]) { _, s, _ in
                c.resume(returning: s ?? [])
            }
            store.execute(q)
        }
    }

    /// Hele kroppen til POST /api/helse for de siste `days` dagene (søvn fra kl. 18 dagen før første dag).
    static func body(days: Int, source: String) async -> [String: Any] {
        let cal = Calendar.current
        let now = Date()
        let today = cal.startOfDay(for: now)
        let first = cal.date(byAdding: .day, value: -(days - 1), to: today) ?? today
        var dayRows: [[String: Any]] = []
        for i in 0..<days {
            guard let d = cal.date(byAdding: .day, value: i, to: first), let e = cal.date(byAdding: .day, value: 1, to: d) else { continue }
            let end = min(e, now)
            var row: [String: Any] = ["date": isoDay(d)]
            if let v = await stat(.stepCount, HKUnit.count(), from: d, to: end) { row["steps"] = Int(v) }
            if let v = await stat(.distanceWalkingRunning, HKUnit.meter(), from: d, to: end) { row["distanceM"] = Int(v) }
            if let v = await stat(.activeEnergyBurned, HKUnit.kilocalorie(), from: d, to: end) { row["activeKcal"] = Int(v) }
            if let v = await stat(.appleExerciseTime, HKUnit.minute(), from: d, to: end) { row["exerciseMin"] = Int(v) }
            if let v = await stat(.restingHeartRate, HKUnit.count().unitDivided(by: HKUnit.minute()), from: d, to: end, average: true) { row["restingHr"] = Int(v.rounded()) }
            if row.count > 1 { dayRows.append(row) }
        }
        var out: [String: Any] = ["source": source, "days": dayRows]

        // Søvn: alle målingene med stadium. Serveren grupperer dem i netter (Oslo-tid) og teller overlapp én gang.
        let sleepFrom = cal.date(byAdding: .hour, value: -6, to: first) ?? first
        if let st = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            let list = await samples(st, from: sleepFrom, to: now, limit: 5000)
            var sleep: [[String: Any]] = []
            for s in list {
                guard let c = s as? HKCategorySample, let stg = stage(c.value) else { continue }
                sleep.append(["start": isoTime(c.startDate), "end": isoTime(c.endDate), "stage": stg])
            }
            out["sleep"] = sleep
        }

        // Trening: én rad per økt (id = HealthKit-UUID, så samme økt bare lagres én gang).
        let wl = await samples(HKObjectType.workoutType(), from: first, to: now, limit: 500)
        var workouts: [[String: Any]] = []
        let kcalType = HKQuantityType(.activeEnergyBurned)
        let distTypes: [HKQuantityType] = [HKQuantityType(.distanceWalkingRunning), HKQuantityType(.distanceCycling), HKQuantityType(.distanceSwimming), HKQuantityType(.distanceDownhillSnowSports)]
        for s in wl {
            guard let w = s as? HKWorkout else { continue }
            var row: [String: Any] = ["id": w.uuid.uuidString, "type": typeKey(w.workoutActivityType), "start": isoTime(w.startDate), "end": isoTime(w.endDate), "durationMin": w.duration / 60]
            if let k = w.statistics(for: kcalType)?.sumQuantity()?.doubleValue(for: HKUnit.kilocalorie()) { row["kcal"] = Int(k) }
            for t in distTypes {
                if let m = w.statistics(for: t)?.sumQuantity()?.doubleValue(for: HKUnit.meter()), m > 0 { row["distanceM"] = Int(m); break }
            }
            workouts.append(row)
        }
        out["workouts"] = workouts

        // Vekt: målingene i perioden (siste måling også når den er eldre: 400 dager tilbake, bare den nyeste).
        if let bt = HKObjectType.quantityType(forIdentifier: .bodyMass) {
            var list = await samples(bt, from: first, to: now, limit: 400)
            if list.isEmpty, let old = cal.date(byAdding: .day, value: -400, to: today) {
                list = Array(await samples(bt, from: old, to: now, limit: 1000).suffix(1))
            }
            var weight: [[String: Any]] = []
            for s in list {
                guard let q = s as? HKQuantitySample else { continue }
                weight.append(["at": isoTime(q.endDate), "kg": (q.quantity.doubleValue(for: HKUnit.gramUnit(with: .kilo)) * 10).rounded() / 10])
            }
            out["weight"] = weight
        }
        return out
    }
}
