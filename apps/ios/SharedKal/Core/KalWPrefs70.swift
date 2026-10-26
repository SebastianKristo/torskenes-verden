import Foundation

/* ---------------- Prompt 70 (KAL70): Innstillinger → Widgets (delt mellom appene og widgetene) ---------------- */
// Fasit: claude-code-kalender-neste-release.md → «Innstillinger i appen → Widgets»: hvilke kalendere som tas med (standard alle)
// og «Skjul fullførte i dag» (standard på). Lagres i App Group-en (KalGroup.defaults), så widget-utvidelsen leser det samme.
//   kal70.w.off       [String]  kalender-id-er som IKKE vises i widgetene (tom = alle)
//   kal70.w.hideDone  Bool      true (standard) = ferdige hendelser i dag skjules
//   kal70.intro.seen  Bool      kortet «Kalender på hjemskjermen» er vist (én gang etter oppdatering)

enum KalWPrefs70 {
    private static let offKey: String = "kal70.w.off"
    private static let doneKey: String = "kal70.w.hideDone"
    private static let introKey: String = "kal70.intro.seen"

    static var off: Set<String> {
        Set(KalGroup.defaults.stringArray(forKey: offKey) ?? [])
    }

    static func shows(_ calId: String) -> Bool {
        !off.contains(calId)
    }

    static func set(_ calId: String, shown: Bool) {
        var s: Set<String> = off
        if shown { s.remove(calId) } else { s.insert(calId) }
        KalGroup.defaults.set(Array(s).sorted(), forKey: offKey)
    }

    static var hideDone: Bool {
        get {
            if KalGroup.defaults.object(forKey: doneKey) == nil { return true }
            return KalGroup.defaults.bool(forKey: doneKey)
        }
        set { KalGroup.defaults.set(newValue, forKey: doneKey) }
    }

    static var introSeen: Bool {
        get { KalGroup.defaults.bool(forKey: introKey) }
        set { KalGroup.defaults.set(newValue, forKey: introKey) }
    }
}
