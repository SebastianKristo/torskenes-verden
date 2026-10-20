import SwiftUI
import UIKit

/* ---------------- Prompt 39: Innstillinger → «Tilpass» og «Appprofil» som egne sider ---------------- */
// Spesifikasjon: claude-code-innst-tilpass-side.md og claude-code-innst-appprofil-underside.md.
// Fasit: Mobil Papir App.dc.html → SUBP.tilpass og SUBP.profil.
// Alle valg har samme logikk og lagringsnøkler som før, bare plasseringen er ny.

extension Store {
    /// Bibel-siden: ingen fanelinje og ingen skann-knapp (samme regel som Innstillinger, Kalender og Gjøremål).
    var inBible39: Bool { paperClassic == nil && paperFin == nil && paperTab == "bibel" }

    /// Undertekst på raden «Appprofil»: valgt profil.
    var appProfileName39: String {
        let cur: String = Prof24.shared.current(self)
        if cur == "custom" { return "Egendefinert" }
        return Prof24.shared.defs.first(where: { (d: Prof24Def) -> Bool in d.key == cur })?.name ?? "Standard"
    }
}

/// Innstillinger → Tilpass: IDENTITET, FANELINJE og deretter Tema, Bakgrunn, Ikonfarger osv. (det som var «Utseende»).
struct Tilpass39Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var naming: Bool = false
    @State private var picking: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Set39Group(title: "Identitet", offset: 1, rows: identityRows)
            // Prompt 41: «Skanneknapp på Hjem» øverst i FANELINJE.
            PLabel(text: "Fanelinje").padding(.top, 12).padding(.leading, 4)
            Scan41Row().padding(.bottom, 6)
            Set39Group(title: "", offset: 2, rows: tabRows)
            // Tema, bakgrunn, ikonfarger og resten av fanelinje-valgene, flyttet uendret fra «Utseende».
            PaperLookSettings().padding(.top, 8)
            // Prompt 41: HØYTIDER (17. mai-design), samme valg som i Innstillinger → Glimt.
            PLabel(text: "Høytider").padding(.top, 14).padding(.leading, 4)
            Mai17Settings41().padding(.top, 6)
        }
        .sheet(isPresented: $naming) {
            AppName24Sheet { naming = false }.environment(\.paper, p).presentationDetents([.medium, .large]).sheetEdge30(p.bg)
        }
        .sheet(isPresented: $picking) {
            AppIconSheet { picking = false }.environment(\.paper, p).presentationDetents([.medium, .large]).sheetEdge30(p.bg)
        }
    }

    private var identityRows: [PaperLinkRow] {
        [
            PaperLinkRow(name: "Navn på appen", sub: AppMeta.shared.name, value: "Endre ›", icon: "character.cursor.ibeam") { naming = true },
            PaperLinkRow(name: "App-ikon", sub: AppMeta.shared.iconName, value: "Endre ›", icon: "app.badge") { picking = true },
        ]
    }

    private var tabRows: [PaperLinkRow] {
        [
            PaperLinkRow(name: "Fanelinje-stil", sub: NavStyle25.sub(store.navStyle25), value: NavStyle25.name(store.navStyle25) + " ›", icon: "rectangle.split.3x1") { store.cycleNavStyle25() },
            PaperLinkRow(name: "Fanelinje i Hjem", sub: "Fjern, flytt, gi nytt navn og ikon · eller hold inne på fanelinjen", icon: "dock.rectangle") { store.tabBarEditing = true },
            // Prompt 42: Hjem-knapp (Standard / 1a–1d) med forhåndsvisning (NavHome42.swift).
            PaperLinkRow(name: "Hjem-knapp", sub: NavHome42.name(NavHome42.shared.value) + " · velg og se forhåndsvisning", value: "Velg ›", icon: "house") { NavHome42.shared.picking = true },
        ]
    }
}

/// Innstillinger → Appprofil: VELG PROFIL (samme valg og logikk som før) og forklaringen under.
struct AppProfile39Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Set39Group(title: "Velg profil", offset: 4, rows: store.prof24Rows(p))
            Text("En profil bestemmer hvilke faner og sider appen viser og hvor den åpner. Dataene dine endres ikke.")
                .font(PF.ui(12.5)).foregroundStyle(p.mut)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 6).padding(.top, 8)
        }
    }
}

/// Gruppe med overskrift og lenkerader (samme utseende som gruppene på hovedsiden i Innstillinger).
struct Set39Group: View {
    let title: String
    let offset: Int
    let rows: [PaperLinkRow]

    var body: some View {
        let shifted: [PaperLinkRow] = rows.map { (r: PaperLinkRow) -> PaperLinkRow in
            var x: PaperLinkRow = r
            x.colorOffset = offset
            if x.tint30 == nil { x.tint30 = Set30Colors.tint(r.name) }
            return x
        }
        VStack(alignment: .leading, spacing: 0) {
            PLabel(text: title).padding(.top, 12).padding(.leading, 4)
            PaperLinkList(rows: shifted)
        }
    }
}

/* ---------- Prompt 39: nytt standard app-ikon (Papir-monogram) ---------- */
// AppIcon i Assets.xcassets er nå «Papir-monogram» (vedlegg/app-icon-1024.png). Det gamle standardikonet «Huset med stativ»
// er alternativt (AppIcon-Hus). Valget i appen følger ikonet iOS faktisk viser. Brukere som selv hadde valgt «Huset» før,
// får det satt som alternativt ikon én gang, så de beholder det (iOS viser da sin vanlige bekreftelse).

extension AppMeta {
    @MainActor static func sync39() async {
        let app: UIApplication = UIApplication.shared
        let d: UserDefaults = UserDefaults.standard
        let migKey: String = "fh_icon39_migrated"
        if !d.bool(forKey: migKey) {
            d.set(true, forKey: migKey)
            if app.alternateIconName == nil && d.string(forKey: "fh_app_icon") == "hus" && app.supportsAlternateIcons {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                if app.applicationState == .active {
                    app.setAlternateIconName("AppIcon-Hus") { (_: Error?) in }
                }
                return
            }
        }
        let id: String
        switch app.alternateIconName ?? "" {
        case "AppIcon-Hus": id = "hus"
        case "AppIcon-Rom": id = "rom"
        case "AppIcon-Okonomi": id = "okonomi"
        default: id = "monogram"
        }
        if AppMeta.shared.icon != id { AppMeta.shared.icon = id }
    }
}
