import SwiftUI
import UIKit

/* ---------------- Prompt 45: alle innstillinger samlet i Innstillinger (claude-code-innstillinger-samlet.md) ----------------
 Innstillinger får gruppen MODULER med én rad per modul: Media (servere, tjenester, avspilling og kalender – før et eget ark i
 Media), Gjøremål (synk med Home Assistant, flyttet i prompt 44), Ruter (antall anbefalte reiser, Min reise på Hjem) og
 Sonevarsler (Familie). Modulenes ⋯-meny har snarveien «Innstillinger for …», som åpner siden her direkte. */

@MainActor
enum Settings45 {
    static func rows(_ store: Store) -> [PaperLinkRow] {
        var out: [PaperLinkRow] = []
        if Media43.shared.allowed {
            out.append(PaperLinkRow(name: "Media", sub: "Sonarr, Radarr, qBittorrent, Plex og Jellyfin", icon: "play.rectangle") { store.paperGo("innst-media") })
        }
        out.append(PaperLinkRow(name: "Gjøremål", sub: "Synk med Home Assistant · på/av", icon: "checklist") { store.paperGo("innst-huske") })
        let n: Int = MinReise41.shared.recoCount
        out.append(PaperLinkRow(name: "Ruter", sub: "Anbefalte reiser: \(n) · Min reise på Hjem", icon: "tram") { store.paperGo("innst-ruter") })
        let z: String = Zone45.shared.on ? "På · per person og sone" : "Av"
        out.append(PaperLinkRow(name: "Sonevarsler", sub: "Familie · " + z, icon: "mappin.and.ellipse") { store.paperGo("innst-sone") })
        return out
    }
}

/// Innstillinger → Ruter: antall anbefalte reiser (1 · 2 · 3) og Min reise på Hjem.
struct Ruter45SettingsPage: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            PCard {
                VStack(alignment: .leading, spacing: 14) {
                    MinReise41HomeSetting()
                    Text("Kortet «Min reise» viser nøyaktig så mange forslag. Er det færre avganger, vises de som finnes.")
                        .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .task { await MinReise41.shared.load(store) }
    }
}
