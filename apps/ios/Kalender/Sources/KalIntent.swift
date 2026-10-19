import Foundation
import AppIntents

/* ---------------- Prompt 33: App Intent «Legg til i Kalender …» (Siri, Snarveier) ---------------- */
// Tolker teksten lokalt (samme regler som Glimt-feltet) og sender hendelsen til serveren uten å åpne appen.

struct KalAddIntent: AppIntent {
    static var title: LocalizedStringResource = "Legg til i Kalender"
    static var description = IntentDescription("Legger til en hendelse fra en tekst, f.eks. «frisør 14.30 25.10» eller «tannlege fredag kl 9».")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Tekst", requestValueDialog: IntentDialog("Hva skal legges til? F.eks. «frisør 14.30 25.10»"))
    var text: String

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let t: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return .result(dialog: IntentDialog("Skriv hva hendelsen gjelder.")) }
        let s: KalStore = KalStore.shared
        s.bootstrap()
        if !s.loggedIn { return .result(dialog: IntentDialog("Åpne Kalender og logg inn først.")) }
        let p: KalParsed = KalQuick.parse(t, defaultRem: s.defRem)
        _ = await s.add(p, toastPrefix: nil)
        let when: String = KalD.dl(KalD.date(p.day)) + (p.allDay ? "" : " kl. " + KalD.hm(p.s ?? 0))
        return .result(dialog: IntentDialog(stringLiteral: "La til «" + p.title + "» · " + when))
    }
}

struct KalShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: KalAddIntent(),
            phrases: [
                "Legg til i \(.applicationName)",
                "Ny hendelse i \(.applicationName)",
            ],
            shortTitle: "Legg til i Kalender",
            systemImageName: "calendar.badge.plus"
        )
    }
}
