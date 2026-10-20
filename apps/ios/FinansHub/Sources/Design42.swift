import SwiftUI
import UIKit

/* ---------------- Prompt 42: det klassiske designet (Liquid Glass / Material) er slettet ---------------- */
// claude-code-slett-gamle-design.md: appen har bare Papir · lys, Papir · mørk og Følg systemet.
// Den som sto på «Klassisk» (lokalt fh_mobile_design eller layout.mobileDesign på serveren), flyttes til
// Papir · lys, eller Papir · mørk hvis systemet er mørkt. Ingen dialog. Gamle nøkler for designstil (fh_design)
// og fargebakgrunn (fh_ios_bg) fjernes. Widgets, app-ikoner og data røres ikke.

extension Store {
    /// Kjøres ved oppstart (lokalt valg) og når serveren sender mobileDesign = «klassisk».
    func migrateClassic42(server: Bool) {
        let d: UserDefaults = UserDefaults.standard
        let local: Bool = d.string(forKey: "fh_mobile_design") == "klassisk"
        d.removeObject(forKey: "fh_design")
        d.removeObject(forKey: "fh_ios_bg")
        guard local || server else { return }
        d.set("papir", forKey: "fh_mobile_design")
        let mode: String = paperSystemScheme(.active) == .dark ? "mork" : "lys"
        // Har brukeren allerede et eget Papir-valg (lys/mørk), beholdes det.
        if paperMode == "auto" { paperMode = mode }
        if loggedIn { savePaperLayout(["mobileDesign": "papir", "paperMode": paperMode]) }
    }
}
