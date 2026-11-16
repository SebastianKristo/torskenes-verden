import Foundation

/* ---------------- Innstillinger → Tilkoblinger: gruppene fra serveren (E-ia O8, Fase 6) ----------------
 Serveren sender gruppenavnet i `category` (GET /api/integrations), tatt fra shared/schemas/tilkoblinger.json. Appen grupperer
 etter det og bruker rekkefølgen fra den samme fila, som ligger innebygd i appen (ressurs, se project.yml). Den innebygde fila er
 også reserven for en eldre server uten `category`: id → gruppe derfra, ukjent id → «Generelt». Ingen egen liste i appen. */

/// Gruppene i tilkoblinger.json.
struct TilkoblingerDTO: Decodable, Sendable {
    struct Gruppe: Decodable, Sendable {
        let id: String
        let navn: String
    }

    let grupper: [Gruppe]
    let integrasjoner: [String: String]
}

enum Tilkoblingsgrupper {
    /// Navnet på gruppen for ukjente integrasjoner.
    static let generelt: String = "Generelt"

    /// Den innebygde kopien av shared/schemas/tilkoblinger.json. nil i mål som ikke har den.
    static let innebygd: TilkoblingerDTO? = {
        guard let url = Bundle.main.url(forResource: "tilkoblinger", withExtension: "json"),
              let d = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(TilkoblingerDTO.self, from: d)
    }()

    /// Gruppenavnene i fast rekkefølge (Smarthjem, Kalender og e-post, Media …, Generelt sist).
    static var rekkefolge: [String] {
        let navn: [String] = (innebygd?.grupper ?? []).map { (g: TilkoblingerDTO.Gruppe) -> String in g.navn }
        return navn.isEmpty ? [generelt] : navn
    }

    /// Gruppen for en integrasjon når serveren ikke har sendt `category`.
    static func gruppe(for id: String) -> String {
        guard let dto = innebygd, let gid = dto.integrasjoner[id.lowercased()] else { return generelt }
        return dto.grupper.first { (g: TilkoblingerDTO.Gruppe) -> Bool in g.id == gid }?.navn ?? generelt
    }

    /// Gruppen som vises: serverens `category` når den finnes, ellers den innebygde fila.
    static func vist(category: String, id: String) -> String {
        let c: String = category.trimmingCharacters(in: .whitespacesAndNewlines)
        return c.isEmpty ? gruppe(for: id) : c
    }

    /// Rekkefølgen for gruppene i lista: fila først, så grupper serveren sender som fila ikke kjenner (i den rekkefølgen de kom).
    static func ordnet(_ brukt: [String]) -> [String] {
        let fast: [String] = rekkefolge
        var out: [String] = fast.filter { (n: String) -> Bool in brukt.contains(n) }
        for n in brukt where !out.contains(n) { out.append(n) }
        return out
    }
}
