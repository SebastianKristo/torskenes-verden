import Foundation

/* ---------------- Prompt 44: lagret innhold vises med en gang (iPhone og iPad) ---------------- */
// Årsaken til «det tar tid før innholdet kommer»: bufferen appen startet med (kal.snapshot i App Group-en) er laget for
// widgetene og har bare −2 … +45 dager og maks 500 hendelser; den ble tømt ved hvert nytt token (også samme konto), og
// load() tegnet ikke de nye hendelsene før vær, kø og fagfarger også var hentet (Open-Meteo kan bruke 10 s).
// Nå: en egen fil med −3 … +12 måneder leses synkront i KalStore.init (første bilde), og load() tegner så snart hendelsene
// er hentet. Vær og resten kommer etterpå. Filen ligger i appens Application Support (ikke iCloud-backup).

struct KalCacheFile44: Codable {
    var user: String = ""
    var events: [KalEvent] = []
    var cals: [KalCal] = []
    var wx: [KalWxDay] = []
    var updated: Double = 0
}

enum KalCache44 {
    /// Når appen startet (KalApp.init) – for «cal.firstFrame» i ms.
    nonisolated(unsafe) static var launched: Date = Date()
    private static var url: URL? {
        guard let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var u: URL = dir.appendingPathComponent("kal44-cache.json")
        var rv: URLResourceValues = URLResourceValues()
        rv.isExcludedFromBackup = true
        try? u.setResourceValues(rv)
        return u
    }

    /// Leses synkront ved oppstart (rask: én fil, JSON). nil når den mangler eller tilhører en annen konto.
    static func load(user: String) -> KalCacheFile44? {
        if KalGroup.defaults.bool(forKey: "kal44.wipe") {
            KalGroup.defaults.removeObject(forKey: "kal44.wipe")
            clear()
            return nil
        }
        guard let u = url, let d = try? Data(contentsOf: u) else { return nil }
        guard let f = try? JSONDecoder().decode(KalCacheFile44.self, from: d) else { return nil }
        if !f.user.isEmpty && !user.isEmpty && f.user.lowercased() != user.lowercased() { return nil }
        return f
    }

    /// Skrives i bakgrunnen (−3 … +12 måneder, maks 6000 hendelser).
    static func save(user: String, events: [KalEvent], cals: [KalCal], wx: [KalWxDay]) {
        let from: String = KalD.addKey(KalD.todayKey(), -95)
        let to: String = KalD.addKey(KalD.todayKey(), 370)
        var list: [KalEvent] = events.filter { (e: KalEvent) -> Bool in !e.pending && !e.cont && e.day >= from && e.day <= to }
        if list.count > 6000 { list = Array(list.prefix(6000)) }
        let f: KalCacheFile44 = KalCacheFile44(user: user, events: list, cals: cals, wx: wx, updated: Date().timeIntervalSince1970)
        guard let u = url else { return }
        Task.detached(priority: .utility) {
            if let d = try? JSONEncoder().encode(f) { try? d.write(to: u, options: [.atomic]) }
        }
    }

    static func clear() {
        guard let u = url else { return }
        try? FileManager.default.removeItem(at: u)
    }
}
