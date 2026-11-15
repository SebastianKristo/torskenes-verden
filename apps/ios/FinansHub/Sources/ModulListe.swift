import Foundation
import SwiftUI

/* ---------------- Modullisten i appen: henting, buffer og reserve ----------------
 Fase 6 (E-ia §4, Q1–Q12): navn, ikon og rekkefølge på modulene kommer fra GET /api/moduler?plattform=ios (SharedNet/Moduler.swift).
 – Svaret bufres per konto (UserDefaults), så appen starter med den sist kjente lista, også uten nett.
 – Mangler bufferen (første start, ny konto), brukes den innebygde kopien av shared/schemas/moduler.json (ressurs i appen,
   project.yml), filtrert for iOS og rollen. Det finnes ingen egen håndskrevet liste i appen.
 – Fanelinja (PaperTabItem.all), Mer og titlene leser navn og ikon herfra. ModulSider.swift sier hvilken side en modul åpner.
 – Brukerens lagrede fanelinje flyttes én gang til de nye navnene (flyttFaner): bare faner som har et av de gamle standardnavnene
   får nytt navn, egne navn beholdes. */

@MainActor
@Observable
final class ModulListe {
    static let shared: ModulListe = ModulListe()

    /// Lista som gjelder nå: serverens svar, den bufrede eller den innebygde.
    private(set) var liste: ModulListeDTO?
    /// true når lista er hentet fra serveren i denne økten.
    private(set) var fraServer: Bool = false
    /// Kontoen lista hører til (AcctScope).
    @ObservationIgnored private var konto: String = AcctScope.current

    private static var bufferKey: String { AcctScope.key("moduler_liste") }
    private static var flyttetKey: String { AcctScope.key("moduler_faner_flyttet") }

    init() {
        liste = ModulListe.lesBuffer() ?? ModulListe.reserve(admin: false)
    }

    /// Den innebygde kopien filtrert for iOS. Media og Bibel følger appens egne flagg til serveren har svart.
    static func reserve(admin: Bool) -> ModulListeDTO? {
        var tilganger: Set<String> = []
        if UserDefaults.standard.object(forKey: "media43_allowed") as? Bool ?? true { tilganger.insert("media") }
        tilganger.insert("bibel")
        return ModulListeDTO.innebygd()?.filtrert(plattform: "ios", admin: admin, tilganger: tilganger)
    }

    private static func lesBuffer() -> ModulListeDTO? {
        guard let d = UserDefaults.standard.data(forKey: bufferKey) else { return nil }
        return ModulListeDTO.decode(d)
    }

    /// Kontobytte: les bufferen for den nye kontoen (eller reserven).
    func kontoByttet(_ store: Store) {
        konto = AcctScope.current
        fraServer = false
        liste = ModulListe.lesBuffer() ?? ModulListe.reserve(admin: Konto44.isAdmin(store))
    }

    /// GET /api/moduler?plattform=ios. Feiler kallet (uten nett, eldre server), beholdes lista som er der.
    func hent(_ store: Store) async {
        if konto != AcctScope.current { kontoByttet(store) }
        guard let d = try? await store.api.callAt("/api", "GET", "/moduler?plattform=ios", timeout: 15),
              let l = ModulListeDTO.decode(d) else {
            if liste == nil { liste = ModulListe.reserve(admin: Konto44.isAdmin(store)) }
            return
        }
        UserDefaults.standard.set(d, forKey: ModulListe.bufferKey)
        fraServer = true
        if l != liste { liste = l }
    }

    /* ---------- Oppslag ---------- */

    /// Modulen for en modul-id eller en intern nøkkel («huske», «avg», «rss»).
    func modul(_ key: String) -> ModulDTO? {
        guard let id = ModulSider.modulId(key) else { return nil }
        return liste?.modul(id)
    }

    /// Navnet fra modullisten, ellers reserven.
    func navn(_ key: String, _ reserve: String) -> String { modul(key)?.navn ?? reserve }

    /// SF Symbol fra modullisten, ellers reserven.
    func ikon(_ key: String, _ reserve: String) -> String { modul(key)?.ikon.sf ?? reserve }

    /// Finnes modulen for denne brukeren? (Uten liste: ja, så ingenting forsvinner.)
    func har(_ key: String) -> Bool {
        guard let l = liste, let id = ModulSider.modulId(key) else { return true }
        return l.modul(id) != nil
    }

    /// Plassen i modullisten (til standardrekkefølgen i Mer). Ukjente sist.
    func plass(_ key: String) -> Int {
        guard let l = liste, let id = ModulSider.modulId(key),
              let i = l.moduler.firstIndex(where: { (m: ModulDTO) -> Bool in m.id == id }) else { return 1000 }
        return i
    }

    /// Navnene på undersidene av én type (kalendervisningene, filtrene, fanene) i listens rekkefølge.
    func undersider(_ modulId: String, type: String) -> [ModulUndersideDTO] {
        liste?.modul(modulId)?.undersider(type: type) ?? []
    }

    /// Innstillingssidene i listens rekkefølge (Konto og sikkerhet … Server).
    var innstillinger: [InnstillingDTO] { liste?.innstillinger ?? [] }

    /* ---------- Fanelinja ---------- */

    /// Alle fanene som kan ligge i fanelinja: modulene i listens rekkefølge, så snarveiene (sider inne i en modul).
    var faner: [PaperTabItem] {
        var out: [PaperTabItem] = []
        for m in liste?.moduler ?? [] {
            guard let side = ModulSider.side[m.id] else { continue }
            out.append(PaperTabItem(id: side, label: m.navn, icon: m.ikon.sf))
        }
        for s in ModulSider.snarveier where !out.contains(where: { (t: PaperTabItem) -> Bool in t.id == s.id }) {
            out.append(PaperTabItem(id: s.id, label: s.navn, icon: s.ikon))
        }
        return out
    }

    /// Engangsflytting av brukerens fanelinje: «rss» blir «nyheter» (Q10), og faner med et gammelt standardnavn («Hjem»,
    /// «Finans», «Avganger», «Now Brief» …) får navnet fra modullisten. Egne navn og rekkefølgen beholdes. nil = ingen endring.
    func flyttFaner(_ items: [PaperTabItem]) -> [PaperTabItem]? {
        if UserDefaults.standard.bool(forKey: ModulListe.flyttetKey) { return nil }
        UserDefaults.standard.set(true, forKey: ModulListe.flyttetKey)
        let alle: [PaperTabItem] = faner
        var out: [PaperTabItem] = []
        for it in items {
            let id: String = it.id == "rss" ? "nyheter" : it.id
            if out.contains(where: { (t: PaperTabItem) -> Bool in t.id == id }) { continue }
            let ny: PaperTabItem? = alle.first { (t: PaperTabItem) -> Bool in t.id == id }
            let label: String = ModulSider.gamleNavn.contains(it.label) || it.id != id ? (ny?.label ?? it.label) : it.label
            out.append(PaperTabItem(id: id, label: label, icon: it.icon))
        }
        return out == items ? nil : out
    }
}
