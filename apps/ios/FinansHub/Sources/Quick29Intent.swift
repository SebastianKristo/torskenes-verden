import Foundation
import AppIntents

/* ---------------- Prompt 29: Snarvei / Siri «Legg til time» ---------------- */
// Sender teksten til POST /api/kalender/quick med app-tokenet fra App Group (WidgetShared), uten å åpne appen.
// Serveren tolker teksten i bakgrunnen og sender push «✓ Nina frisør · fre 25. sep · 14:30» når timen er lagt inn.

struct Quick29Intent: AppIntent {
    static var title: LocalizedStringResource = "Legg til time"
    static var description = IntentDescription("Legger til en time i kalenderen fra en tekst, f.eks. «time hos Nina frisør 14.30 25.09».")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Tekst", requestValueDialog: IntentDialog("Hva skal legges til? F.eks. «time hos Nina frisør 14.30 25.09»"))
    var text: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let t: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return .result(dialog: IntentDialog("Skriv hva timen gjelder.")) }
        let ok: Bool = await Quick29Intent.send(t)
        if ok { return .result(dialog: IntentDialog("✦ Legger til i kalenderen …")) }
        return .result(dialog: IntentDialog("Fikk ikke kontakt med serveren. Åpne appen og prøv igjen."))
    }

    /// Prøver adressene i rekkefølge (hoved, ekstern, lokal).
    static func send(_ text: String) async -> Bool {
        guard let token = WidgetShared.token, !token.isEmpty else { return false }
        let body: Data = (try? JSONSerialization.data(withJSONObject: ["text": text])) ?? Data()
        for b in WidgetShared.bases {
            let base: String = b.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard let url = URL(string: base + "/api/kalender/quick") else { continue }
            var r = URLRequest(url: url)
            r.httpMethod = "POST"
            r.timeoutInterval = 15
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.setValue("application/json", forHTTPHeaderField: "Accept")
            r.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
            r.httpBody = body
            guard let pair = try? await URLSession.shared.data(for: r) else { continue }
            let code: Int = (pair.1 as? HTTPURLResponse)?.statusCode ?? 0
            if code >= 200 && code < 300 { return true }
            if code > 0 { return false }
        }
        return false
    }
}

/// Snarveier-appen og Siri: «Legg til time i FinansHub».
struct Quick29Shortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: Quick29Intent(),
            phrases: [
                "Legg til time i \(.applicationName)",
                "Ny time i \(.applicationName)",
            ],
            shortTitle: "Legg til time",
            systemImageName: "calendar.badge.plus"
        )
    }
}
