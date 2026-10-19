import SwiftUI

/* ---------------- Prompt 28: Innstillinger → System → Oppdatering (bare admin) ---------------- */
// Viser installert og nyeste versjon fra GET /api/system/update (virker med app-token). Selve oppdateringen startes
// bare fra nettleseren (økt + passord), så knappen «Oppdater i nettleseren» åpner <server>/#/innstillinger/system.
// Mangler API-et (eldre server) eller updateren, vises «Ikke tilgjengelig».

@MainActor
@Observable
final class Update28Model {
    static let shared = Update28Model()

    var loaded: Bool = false
    var loading: Bool = false
    /// API-et finnes ikke på serveren (404).
    var missing: Bool = false
    var error: String = ""
    var available: Bool = false
    var installed: String = "–"
    var latest: String = "–"
    var updateAvailable: Bool = false
    var state: String = "idle"
    var running: Bool = false
    var latestError: String = ""

    static func isAdmin(_ store: Store) -> Bool {
        let r: String = store.me?.role ?? store.account?.role ?? ""
        return r == "admin"
    }

    /// Kortstatus til raden i Innstillinger.
    var summary: String {
        if missing { return "Ikke tilgjengelig" }
        if !loaded { return "Versjon og oppdatering" }
        if running { return "Oppdatering pågår …" }
        if !available { return "Installert \(installed) · ikke satt opp" }
        if updateAvailable { return "Ny versjon: \(latest)" }
        return "Installert \(installed)"
    }

    private static func ver(_ any: Any?) -> String {
        guard let o = any as? [String: Any] else { return "–" }
        let v: String = (o["version"] as? String) ?? ""
        let sha: String = String(((o["sha"] as? String) ?? "").prefix(7))
        let parts: [String] = [v, sha].filter { !$0.isEmpty }
        return parts.isEmpty ? "–" : parts.joined(separator: " · ")
    }

    func load(_ store: Store) async {
        if loading { return }
        loading = true
        defer { loading = false }
        do {
            let data: Data = try await store.api.raw("/api", "/system/update")
            let obj: [String: Any] = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
            let st: [String: Any] = (obj["status"] as? [String: Any]) ?? [:]
            installed = Update28Model.ver(obj["installed"])
            latest = Update28Model.ver(obj["latest"])
            available = (obj["available"] as? Bool) ?? false
            updateAvailable = (obj["updateAvailable"] as? Bool) ?? false
            state = (st["state"] as? String) ?? "idle"
            running = (obj["running"] as? Bool) ?? false
            latestError = (obj["latestError"] as? String) ?? ""
            missing = false
            error = ""
            loaded = true
        } catch let e as APIError {
            if e.status == 404 || e.status == 405 { missing = true; error = "" } else { error = e.message }
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Nettsiden med Innstillinger → System åpent.
    static func webURL(_ store: Store) -> URL? {
        let base: String = store.api.base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: base + "/#/innstillinger/system")
    }
}

struct Update28Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    private var m: Update28Model { Update28Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !Update28Model.isAdmin(store) {
                Update28Note(text: "Oppdatering av serveren gjøres av en administrator.")
            } else {
                // Prompt 30: banneret og «Oppdater nå» med passord fra appen (Update30.swift). Nettleseren er en sekundær vei.
                Update30Banner(home: false)
                PaperLinkList(rows: rows)
                Update28Note(text: note)
                if m.updateAvailable && m.available && !m.running {
                    PInkButton(title: "Oppdater nå", height: 44, full: true) { Update30Model.shared.begin("update", store) }
                        .padding(.top, 4)
                }
                PLineButton(title: "Oppdater i nettleseren ›", height: 40, full: true) {
                    store.openURL(Update28Model.webURL(store))
                }
                PLineButton(title: m.loading ? "Henter …" : "Se etter på nytt", height: 40, full: true) {
                    Task { await m.load(store) }
                }
            }
        }
        .task {
            if Update28Model.isAdmin(store) {
                await m.load(store)
                await Update30Model.shared.load(store, force: true)
            }
        }
        .update30Sheet()
    }

    private var rows: [PaperLinkRow] {
        if m.missing {
            return [PaperLinkRow(name: "Oppdatering fra appen", sub: "Serveren har ikke denne funksjonen ennå", value: "Ikke tilgjengelig", valueColor: p.mut) {}]
        }
        if !m.loaded {
            let sub: String = m.error.isEmpty ? "Henter versjon fra serveren" : m.error
            return [PaperLinkRow(name: "Oppdatering", sub: sub, value: m.loading ? "Laster …" : "–") {}]
        }
        let latestSub: String = !m.latestError.isEmpty ? "Kunne ikke hente fra GitHub" : (m.updateAvailable ? "Ny versjon er tilgjengelig" : "Du har nyeste versjon")
        var out: [PaperLinkRow] = [
            PaperLinkRow(name: "Installert versjon", sub: "På serveren", value: m.installed) {},
            PaperLinkRow(name: "Nyeste versjon", sub: latestSub, value: m.latest, valueColor: m.updateAvailable ? p.pos : nil) {},
        ]
        if m.running {
            out.append(PaperLinkRow(name: "Status", sub: "Følg med i nettleseren", value: "Pågår …", valueColor: p.lab) {})
        } else if !m.available {
            out.append(PaperLinkRow(name: "Oppdatering fra appen", sub: "Kjør update.sh én gang fra Proxmox", value: "Ikke satt opp", valueColor: p.mut) {})
        }
        return out
    }

    private var note: String {
        if m.missing || (m.loaded && !m.available) {
            return "Kjør update.sh én gang fra Proxmox for å slå på oppdatering fra appen. Kommandoen finnes på nettsiden under Innstillinger → System."
        }
        return "Trykk Oppdater nå og skriv passordet ditt på nytt. Serveren tar backup av databasen og starter på nytt (vanligvis 2–5 minutter). Du kan også starte oppdateringen fra nettleseren."
    }
}

private struct Update28Note: View {
    @Environment(\.paper) private var p
    let text: String
    var body: some View {
        Text(text).font(PF.ui(12.5)).foregroundStyle(p.mut).padding(.horizontal, 4).fixedSize(horizontal: false, vertical: true)
    }
}
