import SwiftUI
import UIKit

/* ---------------- Prompt 32: Innstillinger uten bunnmeny, ekte logoer på Integrasjoner, versjonsinfo i Nordlys OS ---------------- */
// Spesifikasjon: claude-code-innstillinger-uten-navbar.md, claude-code-integrasjoner-logoer.md og claude-code-fjern-oppdatering-rad.md.
// Fasit: Mobil Papir App.dc.html → navVis / fab.on / cPb, ILOGO / ilg() og gruppen PROGRAMVARE.

extension Store {
    /// Innstillinger og alle undersidene: ingen flytende fanelinje og ingen skann-knapp (som Nordlys/System, Chat og Kalender).
    var inSettings32b: Bool {
        paperClassic == nil && paperFin == nil && (paperTab == "innst" || paperTab.hasPrefix("innst-") || paperTab == "profil")
    }
}

/* ---------- Integrasjoner: logo i hvit rute (bokstavmerket mens den lastes eller hvis den feiler) ---------- */

enum IntLogo32b {
    static func domain(_ id: String) -> String {
        switch id.lowercased() {
        case "ha", "homeassistant": return "home-assistant.io"
        case "calendars", "calendar", "google", "kal": return "calendar.google.com"
        case "entur": return "entur.no"
        case "mybring", "bring": return "bring.no"
        case "postnord": return "postnord.no"
        case "parcelsapp": return "parcelsapp.com"
        case "t212": return "trading212.com"
        case "imap", "mail", "epost": return "proton.me"
        case "finn": return "finn.no"
        case "ai", "gemini", "gm": return "gemini.google.com"
        case "cloudflare", "cf": return "cloudflare.com"
        case "map", "kart": return "kartverket.no"
        case "icons", "iconify": return "iconify.design"
        case "photos": return "unsplash.com"
        case "plex": return "plex.tv"
        case "jellyfin": return "jellyfin.org"
        case "sonarr": return "sonarr.tv"
        case "radarr": return "radarr.video"
        default: return ""
        }
    }
}

struct IntLogoView32b: View {
    let item: Int24Item
    var size: CGFloat = 34

    var body: some View {
        let id: String = item.id.lowercased()
        if id == "met" || id == "yr" {
            // MET / Yr: den opplastede Yr-logoen fyller hele ruten.
            Image("YrLogo").resizable().scaledToFill()
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        } else if id == "bank" || IntLogo32b.domain(id).isEmpty {
            // Bankimport (og ukjente) beholder bokstavmerket.
            Int26Badge(text: item.badge26, color: item.color26, size: size)
        } else {
            LogoBox32b(domain: IntLogo32b.domain(id), letter: item.badge26, color: Color(hex: item.color26),
                       size: size, radius: 10, logoSize: size * 22 / 34)
        }
    }
}

/* ---------- Nordlys OS: «Installert … · build …» med Kopier, og Se etter oppdatering ---------- */

struct System32bInstalled: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var old: Update28Model { Update28Model.shared }
    @MainActor private var u: Update30Model { Update30Model.shared }
    @State private var copied: Bool = false

    var body: some View {
        let line: String = installedLine
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(line).font(PF.mono(12, bold: false)).foregroundStyle(p.mut).lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 4)
                Button {
                    UIPasteboard.general.string = line
                    Haptics.shared.success()
                    copied = true
                } label: {
                    Text(copied ? "Kopiert" : "Kopier").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink)
                        .padding(.horizontal, 12).frame(height: 30)
                        .background(p.card, in: Capsule())
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            PaperLinkList(rows: [
                PaperLinkRow(name: "Se etter oppdatering", sub: u.checking ? "Sjekker …" : "Sjekk mot GitHub nå", value: "›", icon: "arrow.clockwise") { u.check(store) },
            ])
        }
        .padding(.horizontal, 4)
        .task { if !old.loaded { await old.load(store) } }
    }

    private var installedLine: String {
        let parts: [String] = old.installed.components(separatedBy: " · ")
        if parts.count >= 2 { return "Installert " + parts[0] + " · build " + parts[1] }
        if !u.current.isEmpty { return "Installert " + u.current + (u.sha.isEmpty ? "" : " · build " + String(u.sha.prefix(7))) }
        return "Installert " + old.installed
    }
}
