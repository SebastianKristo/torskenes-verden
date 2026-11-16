import SwiftUI

/// C-B5: én ruting for innstillingssidene (`innst-…`). Brukes av telefonen (PaperPage.page) og iPad/Fold (Settings50Page),
/// så en ny side bare legges til her.
struct InnstSide: View {
    let id: String

    var body: some View {
        switch id {
        // Prompt 39: «Utseende» er en del av «Tilpass»; gamle lenker til innst-ut havner der (SettingsCustomize.swift).
        case "innst-ut", "innst-tilpass": Tilpass39Page()
        case "innst-appprofil": AppProfile39Page()
        case "innst-fam": FamilySettingsView()
        case "innst-helse": HealthPosSettings20()
        // Prompt 42: Innstillinger → Helse (Familie) → Home Assistant · Mobilapp (HealthHomeAssistant.swift).
        case "innst-hahelse": HaHealthPage42()
        default: PaperSettingsSub(key: String(id.dropFirst(6)))
        }
    }
}
