import SwiftUI
import AppKit

/* ---------------- Prompt 39: Kalender for Mac – fire kalendere: «Vi ryddet kalenderne: 12 → 4» med Angre ---------------- */
// Serveren (SERVER39) rydder én gang og sender migration:{done, from, to, undoUntil}. Toasten vises én gang;
// Angre → POST /api/kalender/calendars/migration/undo (hendelsene ble bare flyttet, ingenting slettet).

extension MacStore {
    func announceMigration39() {
        let m: KalMigration39 = KalCals39.migration
        guard m.done, m.from > m.to else { return }
        let key: String = "mac.mig39toast"
        let mark: String = m.undoUntil.isEmpty ? "done" : m.undoUntil
        if UserDefaults.standard.string(forKey: key) == mark { return }
        UserDefaults.standard.set(mark, forKey: key)
        showToast("Vi ryddet kalenderne: " + String(m.from) + " → " + String(m.to), undo: m.canUndo ? "mig39" : "")
    }

    func undoMigration39() async {
        let err: String = await KalCalAPI39.undoMigration()
        if err.isEmpty {
            showToast("Kalenderne er satt tilbake som før", undo: "")
            await load(force: true)
        } else {
            showToast(err, undo: "")
        }
    }
}
