// Språkvalg for VNRecognizeTextRequest. Ved oppstart leses supportedRecognitionLanguages(),
// og valget logges og rapporteres i /health.
import Foundation

public struct LanguageChoice: Equatable, Sendable {
    /// Språkene som gis til Vision, i prioritert rekkefølge.
    public let languages: [String]
    /// Norsk (bokmål/nynorsk/«no») er støttet og brukt.
    public let norwegian: Bool
    /// Kort forklaring på norsk.
    public let note: String

    public init(languages: [String], norwegian: Bool, note: String) {
        self.languages = languages
        self.norwegian = norwegian
        self.note = note
    }
}

/// Norske koder i prioritert rekkefølge.
public let norwegianCandidates = ["nb-NO", "nb", "no-NO", "no", "nn-NO", "nn"]
/// Reserve når norsk mangler: dansk og svensk har æ/ø/å (og ä/ö), engelsk tar resten.
public let fallbackCandidates = ["da-DK", "sv-SE", "en-US"]

private func canon(_ s: String) -> String { s.replacingOccurrences(of: "_", with: "-").lowercased() }

/// Finner koden slik Vision skriver den (eller nil) – uavhengig av store/små bokstaver og _/-.
private func lookup(_ code: String, in supported: [String]) -> String? {
    let c = canon(code)
    return supported.first { canon($0) == c }
}

/// Velger språk:
/// 1. `override` fra config.json (bare de som er støttet), hvis noen blir igjen.
/// 2. Norsk hvis støttet (+ en-US for engelske ord på kvitteringer).
/// 3. Ellers dansk, svensk og engelsk – de som er støttet.
/// 4. Ellers en-US (Vision-standard).
public func chooseLanguages(supported: [String], override: [String]? = nil) -> LanguageChoice {
    if let o = override, !o.isEmpty {
        let picked = o.compactMap { lookup($0, in: supported) }
        if !picked.isEmpty {
            let nor = picked.contains { code in norwegianCandidates.contains { canon($0) == canon(code) } }
            return LanguageChoice(languages: uniq(picked), norwegian: nor, note: "Språk fra config.json")
        }
    }
    for n in norwegianCandidates {
        if let code = lookup(n, in: supported) {
            var langs = [code]
            if let en = lookup("en-US", in: supported) { langs.append(en) }
            return LanguageChoice(languages: langs, norwegian: true, note: "Norsk er støttet av Vision")
        }
    }
    let fb = fallbackCandidates.compactMap { lookup($0, in: supported) }
    if !fb.isEmpty {
        return LanguageChoice(languages: uniq(fb), norwegian: false,
                              note: "Norsk er ikke støttet av Vision på denne macOS-versjonen – bruker \(fb.joined(separator: ", ")) (æ/ø/å via dansk/svensk)")
    }
    return LanguageChoice(languages: ["en-US"], norwegian: false,
                          note: "Verken norsk, dansk eller svensk er støttet – bruker en-US (æ/ø/å kan bli lest feil)")
}

private func uniq(_ a: [String]) -> [String] {
    var seen = Set<String>()
    return a.filter { seen.insert($0).inserted }
}

/// Ord som ofte står på norske kvitteringer. Gis til Vision som `customWords`
/// (brukes bare når språkkorrigering er på).
public let receiptCustomWords = [
    "TOTAL", "SUM", "Å BETALE", "BETALT", "BETALING", "KVITTERING", "PANT", "RABATT", "MVA",
    "MVA-GRUNNLAG", "ORG.NR", "ORGNR", "FORETAKSREGISTERET", "BANKAXEPT", "VISA", "MASTERCARD",
    "VEKSEL", "KONTANT", "KORT", "TIPS", "DRIKKEPENGER", "BONG", "KASSE", "KASSERER", "ANTALL",
    "STK", "KR", "NOK", "TRUMF", "COOP", "REMA", "KIWI", "MENY", "EXTRA", "OBS", "SPAR", "JOKER",
    "BRØD", "MELK", "SMØR", "OST", "KJØTT", "FISK", "GRØNNSAKER", "FRUKT", "ØL", "VARER",
]
