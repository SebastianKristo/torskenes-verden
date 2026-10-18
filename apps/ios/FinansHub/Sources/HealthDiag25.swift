import Foundation
import SwiftUI

/// Feilsøking for Apple Health: sjekker om profilen appen faktisk er installert med (embedded.mobileprovision) gir
/// HealthKit-tilgang. Sideloading-verktøy (AltStore, SideStore, Sideloadly) signerer appen på nytt med sin egen profil,
/// og kan fjerne HealthKit. Da viser iOS ingen dialog, og appen dukker ikke opp under Helse → Apper.
enum HealthDiag25 {
    /// nil = fant ingen profil (App Store / TestFlight / utviklerbygg), true/false = profilen har / mangler HealthKit.
    static let profileHasHealthKit: Bool? = {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url) else { return nil }
        let text: String = String(decoding: data, as: UTF8.self)
        guard let start = text.range(of: "<?xml"), let end = text.range(of: "</plist>", range: start.lowerBound..<text.endIndex) else { return nil }
        let xml: String = String(text[start.lowerBound..<end.upperBound])
        guard let plistData = xml.data(using: .utf8),
              let obj = try? PropertyListSerialization.propertyList(from: plistData, options: [], format: nil),
              let dict = obj as? [String: Any],
              let ent = dict["Entitlements"] as? [String: Any] else { return nil }
        return (ent["com.apple.developer.healthkit"] as? Bool) == true
    }()

    /// Kort forklaring som vises under «Be om tilgang». nil = alt ser riktig ut.
    static func problem(lastError: String?) -> String? {
        if profileHasHealthKit == false {
            return "Profilen appen er installert med mangler HealthKit. Sideloading-verktøyet har trolig fjernet den. Installer på nytt med et verktøy eller en utviklerkonto som støtter HealthKit."
        }
        if let e = lastError, !e.isEmpty { return "iOS svarte: \(e)" }
        return nil
    }
}

/// Rad med feilmelding under «Be om tilgang» i Helse og posisjon.
struct HealthDiagRow25: View {
    let text: String
    @Environment(\.paper) private var p

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.lab)
            Text(text).font(PF.ui(12.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
