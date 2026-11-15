import SwiftUI
import UIKit

/* ---------------- Prompt 44: Media – felles servervalg, én statuskilde og riktige feilmeldinger ----------------
 Fasit: claude-code-media-arr.md («Flere servere per tjeneste», felles valg «Hjemme»/«Hytta») og
 claude-code-media-mobil-ikke-innlogget.md. Serveren (SERVER44, server/media44.js):
   GET /api/media/servers[?status=1] → [{id, name, color, default, builtin, selected, sonarr|radarr|qbit|prowlarr:{configured, status?}}]
   PUT /api/media/servers/select {id} (lagres per bruker) · ?server=<id> på alle /api/media/…-kall.
   GET /api/integrations/status → {items:[{service, name, site, configured, connected, state, lastOk, error, fallback?}], site, sites}
 – Én kilde: Media leser samme status som Innstillinger (backend). Ingen lokal «innlogget»-flagg; gamle nøkler slettes én gang.
 – Mangler valgt sted en tjeneste: standard (Hjemme) brukes, og en liten brikke sier «Hytta mangler qBittorrent».
 – Feilmeldinger som stemmer: «Ikke satt opp» · «Svarer ikke» · «Utlogget fra Homelab». Aldri «ikke logget inn» når backend er treg. */

struct Media44Site: Identifiable, Hashable {
    var id: String
    var name: String
    var color: String = ""
    var isDefault: Bool = false
    /// tjeneste (sonarr | radarr | qbit | prowlarr) → satt opp
    var configured: [String: Bool] = [:]
    /// tjeneste → «Tilkoblet · 412 ms» / «Svarer ikke»
    var status: [String: String] = [:]
    var ok: [String: Bool] = [:]
    var urls: [String: String] = [:]
}

@MainActor
@Observable
final class Media44 {
    static let shared = Media44()

    var sites: [Media44Site] = []
    /// Valgt sted (felles for Sonarr, Radarr, qBittorrent og Prowlarr). Lagres per bruker på serveren og lokalt.
    var site: String = UserDefaults.standard.string(forKey: AcctScope.key("media_site")) ?? ""
    var pickerOpen: Bool = false
    var loadingSites: Bool = false
    /// «Hytta mangler qBittorrent» (fallback til standard).
    var fallbackNote: String = ""
    @ObservationIgnored private var migrated: Bool = false

    static let services: [(String, String)] = [("sonarr", "Sonarr"), ("radarr", "Radarr"), ("qbit", "qBittorrent"), ("prowlarr", "Prowlarr")]

    var current: Media44Site? {
        if let s = sites.first(where: { $0.id == site }) { return s }
        if let d = sites.first(where: { $0.isDefault }) { return d }
        return sites.first
    }
    var multi: Bool { sites.count > 1 }

    /// Tjenesten en fane bruker (nil = Kommer snart/Avspilling, ingen velger).
    static func service(_ tab: String) -> String? {
        switch tab {
        case "sonarr", "radarr", "qbit", "prowlarr": return tab
        default: return nil
        }
    }

    static func serviceName(_ s: String) -> String { services.first { $0.0 == s }?.1 ?? s }

    /// Engangs-migrering: gamle lokale «innlogget»/tilgangsflagg fra før prompt 44 slettes, så Media leser serveren.
    func migrate() {
        if migrated { return }
        migrated = true
        let k: String = "media44_mig_v1"
        if UserDefaults.standard.bool(forKey: k) { return }
        UserDefaults.standard.set(true, forKey: k)
        for old in ["media43_allowed", "media_connected", "media_site_old"] { UserDefaults.standard.removeObject(forKey: old) }
        Media43.shared.allowed = true
    }

    /* ---------- Nett ---------- */

    func load(_ store: Store, status: Bool = false) async {
        loadingSites = true
        defer { loadingSites = false }
        guard let d = try? await Media46.shared.call(store, "GET", "/media/servers" + (status ? "?status=1" : ""), timeout: status ? 20 : 10) else { return }
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        var rows: [[String: Any]] = (any as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
        if rows.isEmpty { rows = JS.list(any as? [String: Any], "servers") + JS.list(any as? [String: Any], "items") }
        let parsed: [Media44Site] = rows.map { Media44.parse($0) }
        if parsed.isEmpty { return }
        sites = parsed
        if let sel = rows.first(where: { JS.bool($0, "selected") == true }), let id = JS.str(sel, "id"), site.isEmpty || !parsed.contains(where: { $0.id == site }) {
            setLocal(id)
        }
        if !parsed.contains(where: { $0.id == site }) { setLocal(parsed.first { $0.isDefault }?.id ?? parsed[0].id) }
    }

    nonisolated static func parse(_ r: [String: Any]) -> Media44Site {
        var s: Media44Site = Media44Site(id: JS.str(r, "id") ?? "hjemme", name: JS.str(r, "name") ?? "Hjemme")
        s.color = JS.str(r, "color") ?? ""
        s.isDefault = JS.bool(r, "default") ?? JS.bool(r, "builtin") ?? false
        for (k, _) in Media44.services {
            let o: [String: Any]? = JS.dict(r, k) ?? (k == "qbit" ? JS.dict(r, "qbittorrent") : nil)
            s.configured[k] = JS.bool(o, "configured") ?? (o != nil)
            if let st = JS.dict(o, "status") {
                s.ok[k] = JS.bool(st, "ok") ?? false
                s.status[k] = JS.str(st, "text") ?? ((JS.bool(st, "ok") ?? false) ? "Tilkoblet" : "Svarer ikke")
            }
            if let u = JS.str(o, "url") { s.urls[k] = u }
        }
        return s
    }

    private func setLocal(_ id: String) {
        site = id
        UserDefaults.standard.set(id, forKey: AcctScope.key("media_site"))
    }

    func select(_ id: String, _ store: Store) {
        Haptics.shared.select()
        setLocal(id)
        pickerOpen = false
        Task { @MainActor in
            _ = try? await Media46.shared.call(store, "PUT", "/media/servers/select", json: ["id": id])
            let m: Media43 = Media43.shared
            m.series = []
            m.movies = []
            m.indexers = []
            await m.loadAll(store)
        }
    }

    /// Stien med ?server=<sted>. Mangler stedet tjenesten, brukes standard (og brikken sier fra).
    func withSite(_ path: String) -> String {
        guard multi, let cur = current else { return path }
        var id: String = cur.id
        let svc: String? = Media44.serviceIn(path)
        if let svc, cur.configured[svc] == false, let def = sites.first(where: { $0.isDefault }), def.id != cur.id {
            id = def.id
            let note: String = cur.name + " mangler " + Media44.serviceName(svc)
            if fallbackNote != note { fallbackNote = note }
        } else if svc != nil && !fallbackNote.isEmpty && Media44.service(Media43.shared.tab) == svc {
            fallbackNote = ""
        }
        if path.contains("server=") { return path }
        let enc: String = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id
        return path + (path.contains("?") ? "&" : "?") + "server=" + enc
    }

    nonisolated static func serviceIn(_ path: String) -> String? {
        if path.contains("/sonarr") || path.contains("/series") || path.contains("/episode") { return "sonarr" }
        if path.contains("/radarr") || path.contains("/movie") { return "radarr" }
        if path.contains("/qbit") || path.contains("/torrents") || path.contains("/altSpeed") { return "qbit" }
        if path.contains("/prowlarr") || path.contains("/indexers") { return "prowlarr" }
        return nil
    }

    /* ---------- Feilmeldinger som stemmer ---------- */

    /// «Utlogget fra Homelab» (401), «Svarer ikke» (nett/tidsavbrudd/502–504), «Ikke satt opp» (409/412 eller configured:false).
    nonisolated static func errorText(_ e: Error) -> String {
        guard let a = e as? APIError else { return e.localizedDescription }
        // Prompt 46: «Utlogget» bare når innloggingen faktisk er ugyldig (HOMELAB_AUTH – fra serveren eller bekreftet mot /api/me i Media46).
        if a.status == 401 && a.code != "HOMELAB_AUTH" { return "Serveren avviste kallet (401), men innloggingen din er gyldig. Trykk for detaljer." }
        if let up = Media44.upstreamAuth(a) { return up }
        switch a.status {
        case 401: return "Utlogget fra Homelab. Logg inn igjen under Innstillinger → Kontoer og brukere."
        case 403: return "Du har ikke tilgang til Media. Be en administrator om modulen «media»."
        case 404: return "Serveren har ikke Media ennå (oppdater Homelab)."
        case 0, 502, 503, 504: return "Svarer ikke akkurat nå. " + (a.status == 0 ? a.message : "Prøv igjen om litt.")
        default: break
        }
        if a.code == "not_configured" || a.message.lowercased().contains("ikke satt opp") { return "Ikke satt opp. Legg inn tjenesten under Innstillinger → Integrasjoner → MEDIA." }
        // Serveren kan svare «Ikke logget inn» fra Sonarr/Radarr selv om Homelab-innloggingen er i orden.
        if a.message.lowercased().contains("ikke logget inn") { return "Tjenesten avviste nøkkelen på serveren. Sjekk API-nøkkelen under Integrasjoner → MEDIA." }
        return a.message
    }

    /// Prompt 46: Sonarr/Radarr/Prowlarr avviser nøkkelen på serveren (502 UPSTREAM_AUTH eller «feil API-nøkkel») – ikke Homelab-innloggingen.
    nonisolated static func upstreamAuth(_ a: APIError) -> String? {
        let m: String = a.message.lowercased()
        guard a.code == "UPSTREAM_AUTH" || m.contains("feil api-nøkkel") || m.contains("feil brukernavn eller passord") else { return nil }
        for (k, n) in [("sonarr", "Sonarr"), ("radarr", "Radarr"), ("prowlarr", "Prowlarr"), ("qbit", "qBittorrent")] where m.contains(k) {
            return n + " avviser " + (k == "qbit" ? "brukernavnet eller passordet" : "API-nøkkelen") + ". Sjekk under Innstillinger → Integrasjoner → MEDIA."
        }
        return "Tjenesten avviser nøkkelen på serveren. Sjekk under Innstillinger → Integrasjoner → MEDIA."
    }

    /// Samme status som Innstillinger: GET /api/integrations/status → services med configured/connected/state.
    func statusFromIntegrations(_ store: Store) async -> [Media43Service] {
        guard let d = try? await Media46.shared.call(store, "GET", "/integrations/status", timeout: 12) else { return [] }
        let o: [String: Any] = JS.obj(d)
        let names: [String: String] = ["sonarr": "Sonarr", "radarr": "Radarr", "qbittorrent": "qBittorrent", "qbit": "qBittorrent",
                                       "prowlarr": "Prowlarr", "jellyfin": "Jellyfin", "plex": "Plex"]
        return JS.list(o, "items").compactMap { (r: [String: Any]) -> Media43Service? in
            let k: String = (JS.str(r, "service") ?? "").lowercased()
            guard let n = names[k] else { return nil }
            let id: String = k == "qbit" ? "qbittorrent" : k
            return Media43Service(id: id, name: JS.str(r, "name") ?? n, configured: JS.bool(r, "configured") ?? true,
                                  ok: JS.bool(r, "connected") ?? (JS.str(r, "state") == "ok"), version: JS.str(r, "version") ?? "", ms: JS.int(r, "ms") ?? 0)
        }
    }
}

/* ---------- Servervalg: rad øverst i fanen og arket ---------- */

/// «● Server: Hjemme ›» øverst i Sonarr/Radarr/qBittorrent/Prowlarr (bare med flere steder), og brikken ved fallback.
struct Media44SiteRow: View {
    @Environment(\.paper) private var p
    @MainActor private var s: Media44 { Media44.shared }
    let tab: String

    var body: some View {
        if s.multi, let svc = Media44.service(tab), let cur = s.current {
            VStack(alignment: .leading, spacing: 6) {
                Button { Haptics.shared.tap(); s.pickerOpen = true } label: { label(cur, svc) }
                    .buttonStyle(.plain)
                if !s.fallbackNote.isEmpty { note }
            }
        }
    }

    private func label(_ cur: Media44Site, _ svc: String) -> some View {
        HStack(spacing: 8) {
            Circle().fill(Media44SiteRow.dot(cur, svc)).frame(width: 8, height: 8)
            Text(Media44.serviceName(svc) + " · " + cur.name).font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
            Spacer(minLength: 4)
            Text("Bytt ›").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
        }
        .padding(.horizontal, 14).frame(minHeight: 44)
        .background(p.card, in: Capsule())
        .overlay(Capsule().stroke(p.line, lineWidth: 1))
        .contentShape(Capsule())
    }

    private var note: some View {
        Text(s.fallbackNote + " · bruker Hjemme").font(PF.ui(11.5, .bold)).foregroundStyle(Color(hex: "#a0671a"))
            .padding(.horizontal, 10).frame(height: 24)
            .background(Color(hex: "#a0671a").opacity(0.12), in: Capsule())
    }

    static func dot(_ s: Media44Site, _ svc: String) -> Color {
        if s.configured[svc] == false { return Color(hex: "#a39d90") }
        if let ok = s.ok[svc] { return ok ? Color(hex: "#2f6b4a") : Color(hex: "#b23a2a") }
        return Color(hex: "#2f6b4a")
    }
}

/// «VELG SERVER · GJELDER SONARR, RADARR, QBITTORRENT OG PROWLARR» med URL og status for fanens tjeneste.
struct Media44SiteSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var s: Media44 { Media44.shared }
    let tab: String

    var body: some View {
        let svc: String = Media44.service(tab) ?? "sonarr"
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                SheetHeader30(title: "Velg server", closeTitle: "Ferdig") { s.pickerOpen = false }
                Text("VELG SERVER · GJELDER SONARR, RADARR, QBITTORRENT OG PROWLARR").font(PF.mono(10)).tracking(1.1).foregroundStyle(p.lab)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(spacing: 0) {
                    ForEach(Array(s.sites.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Media44Site)) in
                        if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        Media44SiteChoice(site: pair.element, svc: svc, on: pair.element.id == s.current?.id) { s.select(pair.element.id, store) }
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                Button { s.pickerOpen = false; Media43.shared.open = false; store.paperGo("innst-integ") } label: {
                    Text("+ Legg til " + Media44.serviceName(svc) + "-server").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                if s.loadingSites { HStack(spacing: 8) { ProgressView(); Text("Sjekker status …").font(PF.ui(12.5)).foregroundStyle(p.mut) } }
            }
            .padding(20)
        }
        .task { await s.load(store, status: true) }
    }
}

struct Media44SiteChoice: View {
    @Environment(\.paper) private var p
    let site: Media44Site
    let svc: String
    let on: Bool
    let pick: () -> Void

    var body: some View {
        Button(action: pick) {
            HStack(spacing: 12) {
                Circle().fill(Media44SiteRow.dot(site, svc)).frame(width: 9, height: 9)
                VStack(alignment: .leading, spacing: 2) {
                    Text(site.name).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    if let u = site.urls[svc] { Text(u).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut).lineLimit(1) }
                    Text(statusLine).font(PF.ui(12)).foregroundStyle(p.mut)
                }
                Spacer(minLength: 6)
                if on { Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(p.lab) }
            }
            .padding(.horizontal, 14).frame(minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private var statusLine: String {
        if site.configured[svc] == false { return "Ikke satt opp – bruker Hjemme" }
        return site.status[svc] ?? "Tilkoblet"
    }
}
