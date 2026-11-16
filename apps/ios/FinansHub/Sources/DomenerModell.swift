import SwiftUI

/* ---------------- Struktur: iOS – Domener ut av Store (AUDIT §6) ----------------
 Første domene som flyttes ut av Store. Tilstanden og kallene for Domener bor her. Store eier modellen (store.domener) og har
 videresendende egenskaper (store.domains, store.domain, store.domRange …), så skjermene og Store-utvidelsene virker som før.
 Modellen injiseres sammen med Store (homelabMiljo, HomelabMiljo.swift), så nye visninger kan lese den med
 @Environment(DomenerModell.self). Kallene får Store som parameter (api, run, flash, busy) i stedet for å holde på den. */

@MainActor
@Observable
final class DomenerModell {
    var domains: [DomainRef]? = nil
    var domain: String? = nil
    var analytics: Analytics? = nil
    var tab: DomTab = .traffic
    var range: String = "24h"
    /// «Oversikt»: alle domenene samtidig (PaperDomAllList).
    var allMode: Bool = false
    var all: [String: Analytics] = [:]
    /// «Administrer domener» (arket bak tannhjulet i Domener).
    var manager: Bool = false

    /// Landene til verdenskartet, hentet én gang.
    @ObservationIgnored private var mapCache: [MapCountry]? = nil

    func load(_ store: Store) async throws {
        let list: [DomainRef] = try await store.decodeList(store.api.raw("/domains/api", "/domains"))
        domains = list
        if domain == nil || !list.contains(where: { (d: DomainRef) -> Bool in d.name == domain }) { domain = list.first?.name }
        try await loadAnalytics(store)
    }

    func loadAnalytics(_ store: Store) async throws {
        guard let d = domain else { analytics = nil; return }
        let enc: String = d.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? d
        analytics = try await store.api.module("/domains/api", "/\(enc)/analytics?range=\(range)", as: Analytics.self)
    }

    func pick(_ name: String, _ store: Store) {
        domain = name
        analytics = nil
        store.run { try await self.loadAnalytics(store) }
    }

    /// Samme liste som i Homelab. API-token for Plausible/Umami legges inn på web.
    func add(_ name: String, source: String, _ store: Store) {
        let n: String = name.trimmingCharacters(in: .whitespaces).lowercased()
            .replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
        guard !n.isEmpty else { store.flash("Skriv domenet"); return }
        store.run {
            store.busy = true
            defer { store.busy = false }
            try await store.api.callAt("/domains/api", "POST", "/domains", json: ["name": n, "source": source])
            self.domain = n
            try await self.load(store)
            store.flash("\(n) er lagt til")
        }
    }

    func remove(_ d: DomainRef, _ store: Store) {
        guard let id = d.id?.value else { return }
        store.run {
            try await store.api.callAt("/domains/api", "DELETE", "/domains/\(id)")
            if self.domain == d.name { self.domain = nil }
            try await self.load(store)
            store.flash("\(d.name) er fjernet")
        }
    }

    /// Landene til verdenskartet (world-atlas 110m), fra serveren eller jsDelivr som reserve. Hentes én gang.
    func worldMap(_ store: Store) async -> [MapCountry] {
        if let m = mapCache { return m }
        var data: Data? = try? await store.api.raw("/domains/api", "/vendor/countries-110m.json")
        if data.flatMap({ (x: Data) -> [MapCountry]? in MapCountry.parse(x) })?.isEmpty != false,
           let u = URL(string: "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json") {
            data = try? await HomelabHTTP.session.data(from: u).0
        }
        let list: [MapCountry] = data.flatMap { (x: Data) -> [MapCountry]? in MapCountry.parse(x) } ?? []
        if !list.isEmpty { mapCache = list }
        return list
    }

    func setRange(_ r: String, _ store: Store) {
        range = r
        store.run { try await self.loadAnalytics(store) }
    }

    func reload(_ store: Store) {
        store.run {
            try await self.load(store)
            store.flash("Oppdatert fra Cloudflare")
        }
    }
}
