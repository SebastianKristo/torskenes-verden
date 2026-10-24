import SwiftUI
import UIKit

/* ---------------- Prompt 43: Integrasjoner – MEDIA-gruppen (Sonarr, Radarr, qBittorrent, Prowlarr, Jellyfin, Plex) ----------------
 Fasit: prompts/prompt-43-pakke/claude-code-integrasjoner-media.md og Mobil Papir App.dc.html → Innstillinger → Integrasjoner (IDEF).
 Feltene, statusen og stegene kommer fra serveren (GET /api/integrations, `guide`/`steps`). Mangler serveren stegene, brukes
 stegene under (samme tekst som spesifikasjonen). Hemmelige felt vises som «•••• lagret» (Integrations24.swift); verdiene lagres
 kryptert på serveren, aldri i appen. Kodeblokkene er mørke og kopieres med ett trykk. */

enum Int43Media {
    static let ids: Set<String> = ["sonarr", "radarr", "qbittorrent", "qbit", "prowlarr", "jellyfin", "plex"]

    static func meta(_ id: String) -> Int26Meta? {
        switch id {
        case "sonarr": return Int26Meta(category: "Media", badge: "SN", color: "#2a9fd0", desc: "Serier: legg til, overvåk og søk")
        case "radarr": return Int26Meta(category: "Media", badge: "RD", color: "#c9a227", desc: "Filmer: legg til, overvåk og søk")
        case "qbittorrent", "qbit": return Int26Meta(category: "Media", badge: "qB", color: "#2f6fb5", desc: "Nedlastinger, kø og fart")
        case "prowlarr": return Int26Meta(category: "Media", badge: "PR", color: "#d0602b", desc: "Indeksere for Sonarr og Radarr")
        case "jellyfin": return Int26Meta(category: "Media", badge: "JF", color: "#8e5bd8", desc: "Spill av serier og filmer")
        case "plex": return Int26Meta(category: "Media", badge: "PX", color: "#c88a0a", desc: "Spill av serier og filmer")
        default: return nil
        }
    }

    static func steps(_ id: String) -> [Int26Step] {
        switch id {
        case "sonarr":
            return [
                Int26Step(title: "Finn API-nøkkelen", text: "Sonarr → Settings → General → Security → API Key."),
                Int26Step(title: "Adresse og port", text: "Port 8989, med URL Base hvis den er satt.", code: "http://192.168.1.20:8989/sonarr"),
                Int26Step(title: "Samme mapper i alle containerne (hardlinks)", text: "/data/downloads, /data/media/tv og /data/media/film.", code: "volumes:\n  - /srv/data:/data"),
                Int26Step(title: "Rotmappe", text: "Settings → Media Management → Root Folders.", code: "/data/media/tv"),
                Int26Step(title: "Koble til qBittorrent", text: "Download Clients → qBittorrent, port 8080, kategori tv-sonarr."),
                Int26Step(title: "Standard kvalitetsprofil", text: "Brukes når du legger til fra Media eller Glimt (4K → Ultra-HD)."),
                Int26Step(title: "Webhook", text: "Connect → Webhook (On Grab, On Import, On Upgrade, On Health Issue).", code: "https://os.smarthjemexperten.no/api/media/hook/sonarr"),
            ]
        case "radarr":
            return [
                Int26Step(title: "Finn API-nøkkelen", text: "Radarr → Settings → General → Security → API Key."),
                Int26Step(title: "Adresse og port", text: "Port 7878, med URL Base hvis den er satt.", code: "http://192.168.1.20:7878"),
                Int26Step(title: "Rotmappe", text: "Settings → Media Management → Root Folders.", code: "/data/media/film"),
                Int26Step(title: "Koble til qBittorrent", text: "Download Clients → qBittorrent, port 8080, kategori radarr."),
                Int26Step(title: "Minimum Availability", text: "Announced = Annonsert, In Cinemas = På kino, Released = Utgitt digitalt."),
                Int26Step(title: "Webhook", text: "Connect → Webhook (On Grab, On Import, On Health Issue).", code: "https://os.smarthjemexperten.no/api/media/hook/radarr"),
            ]
        case "qbittorrent", "qbit":
            return [
                Int26Step(title: "Slå på Web UI (port 8080)", text: "Docker: finn det midlertidige passordet i loggen.", code: "docker logs qbittorrent | grep -i password"),
                Int26Step(title: "Eget brukernavn og sterkt passord", text: "Tools → Options → Web UI → Authentication."),
                Int26Step(title: "Bare Homelab-serveren", text: "Tillat bare serverens IP. Ikke åpne Web UI mot internett."),
                Int26Step(title: "Kategorier", text: "tv-sonarr → /data/downloads/tv, radarr → /data/downloads/film."),
                Int26Step(title: "Varsel når ferdig", text: "«Kjør eksternt program når torrent er ferdig»:", code: "curl -s -X POST https://os.smarthjemexperten.no/api/media/hook/qbit -d \"hash=%I&name=%N\""),
                Int26Step(title: "Alt-hastighet", text: "Fart → Alternative fartsgrenser (f.eks. 5 MB/s ned)."),
            ]
        case "prowlarr":
            return [
                Int26Step(title: "Finn API-nøkkelen", text: "Prowlarr → Settings → General → Security → API Key."),
                Int26Step(title: "Apps → Sonarr og Radarr med Full Sync", text: "Prowlarr-, Sonarr- og Radarr-adressene inne i Docker-nettet:", code: "http://prowlarr:9696\nhttp://sonarr:8989\nhttp://radarr:7878"),
                Int26Step(title: "Legg til indeksere", text: "Fra Media → Prowlarr → «+ Legg til indekser», eller i Prowlarr."),
                Int26Step(title: "FlareSolverr (valgfri)", text: "For indeksere bak Cloudflare. Legg til taggen flaresolverr på indekseren.", code: "docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr"),
                Int26Step(title: "Webhook", text: "Settings → Connect → Webhook.", code: "https://os.smarthjemexperten.no/api/media/hook/prowlarr"),
            ]
        case "jellyfin":
            return [
                Int26Step(title: "API-nøkkel", text: "Dashbord → API-nøkler → + «Homelab»."),
                Int26Step(title: "Bibliotek", text: "Legg til bibliotekene på de samme mappene.", code: "/data/media/tv\n/data/media/film"),
                Int26Step(title: "Oppdater biblioteket automatisk", text: "Sonarr/Radarr → Connect → Emby/Jellyfin."),
                Int26Step(title: "Spill av", text: "Velg Jellyfin under Media → ⚙ → Spill av med."),
            ]
        case "plex":
            return [
                Int26Step(title: "Plex-token", text: "Åpne et element → ⋯ → Vis XML, og kopier verdien etter X-Plex-Token=."),
                Int26Step(title: "Bibliotek", text: "Samme mapper som Sonarr og Radarr.", code: "/data/media/tv\n/data/media/film"),
                Int26Step(title: "Oppdater biblioteket automatisk", text: "Sonarr/Radarr → Connect → Plex Media Server."),
                Int26Step(title: "Spill av", text: "Velg Plex under Media → ⚙ → Spill av med."),
            ]
        default: return []
        }
    }
}

/// Mørk kodeblokk (mono) som kopieres med ett trykk.
struct Int43Code: View {
    let code: String
    @State private var copied: Bool = false

    var body: some View {
        Button {
            UIPasteboard.general.string = code
            Haptics.shared.tick()
            copied = true
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 1_400_000_000)
                copied = false
            }
        } label: {
            HStack(alignment: .top, spacing: 8) {
                Text(code).font(PF.mono(11.5, bold: false)).foregroundStyle(Color(hex: "#f3efe6"))
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(copied ? "Kopiert" : "Kopier").font(PF.ui(11, .bold)).foregroundStyle(Color(hex: "#e8a593"))
            }
            .padding(10)
            .background(Color(hex: "#1b1a17"), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Kopier: " + code)
    }
}
