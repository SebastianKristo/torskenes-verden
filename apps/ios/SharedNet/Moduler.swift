import Foundation

/* ---------------- Modullisten (GET /api/moduler, shared/schemas/moduler.json) ----------------
 Fase 6 (E-ia §4, Q1–Q12): én liste over modulene med navn, ikon, gruppe, rekkefølge, undersider og gamle ruter for alle
 plattformer. Serveren leverer den per bruker (admin-moduler bare for admin, Media og Bibel bare med tilgang). Appen bufrer det
 siste svaret og bruker den innebygde kopien av shared/schemas/moduler.json (lagt inn ved bygging, project.yml) når den mangler.
 Det finnes ingen egen håndskrevet liste i appen: fanene, Mer og navnene leses herfra (ModulListe.swift i FinansHub).
 Kontrakten er shared/schemas/api/moduler.schema.json. Bare Foundation, så klokka, widgetene og testene kan bruke den. */

struct ModulIkonDTO: Codable, Hashable, Sendable {
    /// Tegn til web og som reserve.
    let tegn: String
    /// SF Symbol (iOS, Mac, Watch).
    let sf: String
    /// Material Symbols-navn (Android, Wear).
    let material: String
}

/// En fane, visning eller et filter inne i en modul (Familie → Kart, Kalender → Uke, Kalender → Bursdager …).
struct ModulUndersideDTO: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let navn: String
    /// Kort navn der plassen ikke strekker til (smale skjermer, widgets, klokka).
    let kort: String?
    /// fane | visning | filter
    let type: String
    let rute: String
    let aliaser: [String]?

    var kortNavn: String { kort ?? navn }
}

struct ModulDTO: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let navn: String
    let gruppe: String
    let ikon: ModulIkonDTO
    let plattformer: [String]
    let adminOnly: Bool
    /// media | bibel: modulen krever egen tilgang.
    let tilgang: String?
    /// side (standard) | ark (Brief, Nyheter åpnes som ark).
    let type: String?
    /// Adressen på web (#/…, eller /finans/). nil = finnes ikke på web.
    let rute: String?
    /// Gamle adresser som går til modulen.
    let aliaser: [String]
    let undersider: [ModulUndersideDTO]

    var erArk: Bool { type == "ark" }

    func underside(_ id: String) -> ModulUndersideDTO? { undersider.first { (u: ModulUndersideDTO) -> Bool in u.id == id } }

    /// Undersidene av én type i listens rekkefølge («visning» for kalendervisningene, «filter» for filtrene, «fane» for fanene).
    func undersider(type: String) -> [ModulUndersideDTO] { undersider.filter { (u: ModulUndersideDTO) -> Bool in u.type == type } }
}

struct ModulGruppeDTO: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let navn: String
}

/// En side i Innstillinger (Konto og sikkerhet, Utseende … Server).
struct InnstillingDTO: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let navn: String
    let beskrivelse: String?
    let adminOnly: Bool?
    let aliaser: [String]?
}

/// Treffet for en gammel eller ny rute: modulen og ev. undersiden.
struct ModulTreff: Hashable, Sendable {
    let modul: ModulDTO
    let underside: ModulUndersideDTO?
}

struct ModulListeDTO: Codable, Hashable, Sendable {
    let versjon: Int
    let grupper: [ModulGruppeDTO]
    let toppmeny: [String]
    let bunnmeny: [String]
    let moduler: [ModulDTO]
    let innstillinger: [InnstillingDTO]

    func modul(_ id: String) -> ModulDTO? { moduler.first { (m: ModulDTO) -> Bool in m.id == id } }

    func gruppe(_ id: String) -> ModulGruppeDTO? { grupper.first { (g: ModulGruppeDTO) -> Bool in g.id == id } }

    /// Samme filtrering som serveren (server/moduler/liste.js) for den innebygde kopien, som har alle modulene:
    /// én plattform, admin-moduler bare for admin og moduler med egen tilgang bare med den.
    func filtrert(plattform: String, admin: Bool, tilganger: Set<String>) -> ModulListeDTO {
        let ms: [ModulDTO] = moduler.filter { (m: ModulDTO) -> Bool in
            if !m.plattformer.contains(plattform) { return false }
            if m.adminOnly && !admin { return false }
            if let t = m.tilgang, !admin && !tilganger.contains(t) { return false }
            return true
        }
        let ids: Set<String> = Set(ms.map { (m: ModulDTO) -> String in m.id })
        let grp: Set<String> = Set(ms.map { (m: ModulDTO) -> String in m.gruppe })
        let inn: [InnstillingDTO] = innstillinger.filter { (s: InnstillingDTO) -> Bool in admin || !(s.adminOnly ?? false) }
        return ModulListeDTO(versjon: versjon,
                             grupper: grupper.filter { (g: ModulGruppeDTO) -> Bool in grp.contains(g.id) },
                             toppmeny: toppmeny.filter { (id: String) -> Bool in ids.contains(id) },
                             bunnmeny: bunnmeny.filter { (id: String) -> Bool in ids.contains(id) },
                             moduler: ms,
                             innstillinger: inn)
    }

    /// En rute fra en lenke («#/huskeliste», «#/kalender/bursdager», «/finans/», «#/kart»), også de gamle, → modulen og
    /// undersiden. Undersidene sjekkes først, så «#/kart» gir Reise → Kart og ikke bare Reise.
    func treff(rute raw: String) -> ModulTreff? {
        let r: String = ModulListeDTO.normaliser(raw)
        if r.isEmpty { return nil }
        for m in moduler {
            for u in m.undersider {
                // En underside med samme rute som modulen (Kalender → Uke, Reise → Avganger) er modulens egen rute.
                var alle: [String] = u.rute == (m.rute ?? "") ? [] : [u.rute]
                alle.append(contentsOf: u.aliaser ?? [])
                if alle.contains(where: { (a: String) -> Bool in ModulListeDTO.normaliser(a) == r }) {
                    return ModulTreff(modul: m, underside: u)
                }
            }
        }
        for m in moduler {
            let alle: [String] = (m.rute.map { [$0] } ?? []) + m.aliaser
            if alle.contains(where: { (a: String) -> Bool in ModulListeDTO.normaliser(a) == r }) { return ModulTreff(modul: m, underside: nil) }
        }
        return nil
    }

    /// «#/Kalender/» → «#/kalender», «kalender» → «#/kalender», «/finans» → «/finans/».
    static func normaliser(_ s: String) -> String {
        var r: String = s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if r.isEmpty { return "" }
        if r == "/finans" || r == "/finans/#/" { return "/finans/" }
        if !r.hasPrefix("#/") && !r.hasPrefix("/") { r = "#/" + r }
        while r.count > 2 && r.hasSuffix("/") && r != "/finans/" { r.removeLast() }
        return r
    }

    /// Dekoder svaret fra GET /api/moduler eller den innebygde kopien («$schema» og «$comment» hoppes over).
    static func decode(_ data: Data) -> ModulListeDTO? {
        guard let l = try? JSONDecoder().decode(ModulListeDTO.self, from: data), !l.moduler.isEmpty else { return nil }
        return l
    }

    /// Den innebygde kopien av shared/schemas/moduler.json (ressurs i appen, se project.yml). nil i mål som ikke har den.
    static func innebygd(_ bundle: Bundle = .main) -> ModulListeDTO? {
        guard let url = bundle.url(forResource: "moduler", withExtension: "json"), let d = try? Data(contentsOf: url) else { return nil }
        return decode(d)
    }
}
