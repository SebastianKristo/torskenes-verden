import BackgroundTasks
import Foundation

/* ---------------- Prompt 44: forhåndslasting i bakgrunnen (BGAppRefreshTask, ~30 min) ---------------- */
// Kalenderen skal ha ferskt innhold når den åpnes: iOS vekker appen av og til (tidligst 30 min etter forrige gang),
// og da hentes hendelsene inn i bufferen (KalCache44 + widget-bufferen). Ingen løkker – iOS bestemmer når.
// Info.plist: BGTaskSchedulerPermittedIdentifiers [no.kristo.kalender.refresh44] og UIBackgroundModes [fetch] (project.yml).

enum KalBg44 {
    static let id: String = "no.kristo.kalender.refresh44"

    /// Kalles i KalApp.init (før appen er ferdig startet, som iOS krever).
    /// Prompt 84: ikke i Homelab-appen (KAL_EMBED) – identifikatoren står ikke i Homelabs BGTaskSchedulerPermittedIdentifiers,
    /// og iOS avslutter appen ved registrering av en ukjent identifikator.
    static func register() {
        #if !KAL_EMBED
        _ = BGTaskScheduler.shared.register(forTaskWithIdentifier: id, using: nil) { (task: BGTask) in
            guard let t = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(t)
        }
        #endif
    }

    /// Neste vekking om ~30 min (når appen går i bakgrunnen og etter hver bakgrunnshenting).
    static func schedule() {
        #if !KAL_EMBED
        let r: BGAppRefreshTaskRequest = BGAppRefreshTaskRequest(identifier: id)
        r.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
        try? BGTaskScheduler.shared.submit(r)
        #endif
    }

    private static func handle(_ t: BGAppRefreshTask) {
        schedule()
        let work: Task<Void, Never> = Task { @MainActor in
            let s: KalStore = KalStore.shared
            if s.loggedIn { await s.load(force: true) }
            t.setTaskCompleted(success: true)
        }
        t.expirationHandler = { work.cancel() }
    }
}
