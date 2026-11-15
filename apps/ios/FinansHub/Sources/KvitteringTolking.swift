import SwiftUI
import UIKit
import Vision

#if canImport(FoundationModels)
import FoundationModels
#endif

// ---------------- Prompt 47: kvitteringer tolkes på iPhone med Apple Foundation Models (valgfritt) ----------------
// Spesifikasjon: prompts/prompt-47-pakke/claude-code-ios-kvittering-foundation-models.md. Server: POST /finans/api/receipts/parsed
// (multipart: «data» = JSON, «file» = bildet/PDF-en som vedlegg, «thumb» = miniatyr), server/finans/receipts47.js.
// – Innstillinger → Glimt → Kvitteringer: «Tolk kvitteringer på iPhone» (av som standard, lagres per enhet).
// – Krever iOS 26 + Apple Intelligence. Xcode 16 (uten FoundationModels) bygger reserven: alt som bruker rammeverket ligger bak
//   «#if canImport(FoundationModels)» og «if #available(iOS 26.0, *)». Tilgjengeligheten sjekkes på nytt ved hver skanning.
// – Flyt: bilde → Vision-OCR (nb-NO, en-US) på enheten → Foundation Models med guided generation → kontroll (sum ±1 kr, gyldig dato
//   som ikke er i fremtiden, total > 0) → bekreftelsesark der avvik er gule → bare det ferdige resultatet sendes til serveren.
// – Utilgjengelig modell eller feil: bildet går til Glimt som før, med merknaden «Tolket av Glimt (Apple Intelligence utilgjengelig)».
// – Uten nett: resultatet og bildet legges i «Venter på opplasting» (UploadQueue18) og sendes når nettet er tilbake.

/// Hvorfor bryteren er grå (eller .ok).
enum Rc47Avail: Equatable {
    case ok
    case oldOS
    case noDevice
    case notEnabled
    case notReady
    case other

    var ok: Bool { self == .ok }

    /// Teksten under bryteren når den ikke kan brukes.
    var reason: String {
        switch self {
        case .ok: return ""
        case .oldOS: return "Krever iOS 26 med Apple Intelligence"
        case .noDevice: return "Denne iPhonen støtter ikke Apple Intelligence"
        case .notEnabled: return "Slå på Apple Intelligence i Innstillinger"
        case .notReady: return "Modellen lastes ned – prøv igjen senere"
        case .other: return "Apple Intelligence er ikke tilgjengelig nå"
        }
    }

    /// «Slå på Apple Intelligence» får en lenke til Innstillinger.
    var showsSettingsLink: Bool { self == .notEnabled }
}

/// Én varelinje (samme form som den genererte typen, men uavhengig av rammeverket).
struct Rc47Line: Identifiable, Hashable {
    var id: String = UUID().uuidString
    var name: String
    var qty: Double?
    var price: Double
}

/// Resultatet fra modellen, uavhengig av rammeverket (så resten bygger på Xcode 16).
struct Rc47Parsed: Hashable {
    var merchant: String
    var date: String
    var total: Double
    var currency: String
    var vat: Double?
    var lines: [Rc47Line]
    var category: String
    var payment: String?
}

/// Felt som ikke stemmer (markeres gule i bekreftelsesarket).
struct Rc47Flags: Hashable {
    var merchant: Bool = false
    var date: Bool = false
    var total: Bool = false
    var lines: Bool = false
    var notes: [String] = []
    var any: Bool { merchant || date || total || lines }
}

enum Receipt47 {
    static let key: String = "rc47_on_device"
    static let categories: [String] = ["Mat", "Transport", "Bolig", "Helse", "Klær", "Elektronikk", "Restaurant", "Annet"]
    static let instructions: String = "Du leser norske kvitteringer. Bruk bare tall som står i teksten. Ikke gjett."

    /// Bryteren (per enhet). Av som standard.
    static var enabled: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }

    /// Sjekkes ved hver skanning og når innstillingen vises.
    static func availability() -> Rc47Avail {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) { return Rc47FM.availability() }
        #endif
        return .oldOS
    }

    /// Skal denne skanningen tolkes på telefonen?
    static var wanted: Bool { enabled }

    /// «Tolket på iPhone» / motoren fra serveren.
    static func motor(_ r: Receipt) -> String {
        let p: String = (r.provider ?? r.engine ?? "").lowercased()
        if p == "apple-fm" || p.hasPrefix("apple") { return "Tolket på iPhone" }
        if p.isEmpty { return "Tolket av Glimt" }
        return r.provider ?? r.engine ?? "Glimt"
    }

    /* ---------- Kontroll ---------- */

    static let dayFormat: DateFormatter = {
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Europe/Oslo")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Gyldig ÅÅÅÅ-MM-DD som ikke ligger i fremtiden.
    static func validDate(_ s: String) -> Bool {
        let t: String = s.trimmingCharacters(in: .whitespaces)
        guard t.count == 10, let d = dayFormat.date(from: t), dayFormat.string(from: d) == t else { return false }
        let today: String = dayFormat.string(from: Date())
        return t <= today && t >= "2000-01-01"
    }

    static func lineSum(_ lines: [Rc47Line]) -> Double {
        lines.reduce(0) { (a: Double, l: Rc47Line) in a + l.price }
    }

    /// Summen av varelinjene skal stemme med totalsummen (±1 kr), datoen skal være gyldig og totalen > 0.
    static func check(_ r: Rc47Parsed) -> Rc47Flags {
        var f: Rc47Flags = Rc47Flags()
        if r.merchant.trimmingCharacters(in: .whitespaces).isEmpty {
            f.merchant = true
            f.notes.append("Mangler butikk")
        }
        if !validDate(r.date) {
            f.date = true
            f.notes.append(r.date.isEmpty ? "Mangler dato" : "Datoen er ugyldig eller i fremtiden")
        }
        if !(r.total > 0) {
            f.total = true
            f.notes.append("Totalsummen må være større enn 0")
        }
        if !r.lines.isEmpty {
            let sum: Double = lineSum(r.lines)
            if abs(sum - r.total) > 1 {
                f.lines = true
                f.total = true
                f.notes.append("Varelinjene summerer " + kr(sum) + " av " + kr(r.total))
            }
        }
        return f
    }

    static func kr(_ v: Double) -> String {
        return (krFormat.string(from: NSNumber(value: v)) ?? String(format: "%.2f", v)) + " kr"
    }

    private static let krFormat: NumberFormatter = {
        let f: NumberFormatter = NumberFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.numberStyle = .decimal
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f
    }()

    /// Tall fra et tekstfelt («1 234,50» → 1234.5).
    static func number(_ s: String) -> Double? {
        let t: String = s.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "\u{00a0}", with: "")
            .replacingOccurrences(of: "kr", with: "").replacingOccurrences(of: ",", with: ".")
        return Double(t)
    }

    /* ---------- Det som sendes til serveren ---------- */

    /// JSON-feltet «data» til POST /receipts/parsed. Tomme felt utelates (serveren kontrollerer typer og grenser).
    static func payload(_ r: Rc47Parsed, ocr: String) -> [String: Any] {
        var o: [String: Any] = ["source": "apple-fm", "tolketAv": "apple-on-device", "totalsum": round2(r.total)]
        let m: String = r.merchant.trimmingCharacters(in: .whitespacesAndNewlines)
        if !m.isEmpty { o["butikk"] = String(m.prefix(120)) }
        if validDate(r.date) { o["dato"] = r.date }
        let cur: String = r.currency.trimmingCharacters(in: .whitespaces).uppercased()
        o["valuta"] = cur.count == 3 && cur.allSatisfy({ (c: Character) in c.isLetter }) ? cur : "NOK"
        if let v = r.vat, v >= 0, v <= r.total { o["mva"] = round2(v) }
        let lines: [[String: Any]] = r.lines.prefix(80).map { (l: Rc47Line) -> [String: Any] in
            var x: [String: Any] = ["navn": String(l.name.prefix(120)), "pris": round2(l.price)]
            if let q = l.qty, q > 0, q <= 10_000 { x["antall"] = q }
            return x
        }
        if !lines.isEmpty { o["varelinjer"] = lines }
        if !r.category.isEmpty { o["kategori"] = r.category }
        if let p = r.payment?.trimmingCharacters(in: .whitespaces), !p.isEmpty { o["betalingsmiddel"] = String(p.prefix(20)) }
        let t: String = ocr.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { o["ocrText"] = String(t.prefix(40_000)) }
        return o
    }

    static func round2(_ v: Double) -> Double { (v * 100).rounded() / 100 }

    static func json(_ o: [String: Any]) -> String {
        guard let d = try? JSONSerialization.data(withJSONObject: o) else { return "{}" }
        return String(data: d, encoding: .utf8) ?? "{}"
    }

    /* ---------- Tolkingen ---------- */

    enum Failure: Error {
        case unavailable(Rc47Avail)
        case noText
        case model(String)
    }

    /// OCR på enheten og tolking med Foundation Models. Kaster Failure når Glimt må ta over.
    static func interpret(_ images: [UIImage]) async throws -> (parsed: Rc47Parsed, ocr: String) {
        let a: Rc47Avail = availability()
        guard a.ok else { throw Failure.unavailable(a) }
        let text: String = await Rc47OCR.read(images)
        if text.trimmingCharacters(in: .whitespacesAndNewlines).count < 8 { throw Failure.noText }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let r: Rc47Parsed = try await Rc47FM.parse(text)
            return (r, text)
        }
        #endif
        throw Failure.unavailable(.oldOS)
    }
}

/* ---------- Vision-OCR (på enheten, aldri på hovedtråden) ---------- */

enum Rc47OCR {
    /// Teksten fra alle sidene, linje for linje (kolonner på samme linje skilles med tabulator).
    static func read(_ images: [UIImage]) async -> String {
        let cgs: [(CGImage, CGImagePropertyOrientation)] = images.compactMap { (img: UIImage) -> (CGImage, CGImagePropertyOrientation)? in
            guard let cg = img.cgImage else { return nil }
            return (cg, orientation(img.imageOrientation))
        }
        return await Task.detached(priority: .userInitiated) { () -> String in
            var pages: [String] = []
            for (cg, o) in cgs { pages.append(Rc47OCR.page(cg, o)) }
            return pages.joined(separator: "\n\n")
        }.value
    }

    private static func orientation(_ o: UIImage.Orientation) -> CGImagePropertyOrientation {
        switch o {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }

    /// Språk: nb-NO og en-US når Vision kan dem (ellers nærmeste nordiske/latinske, så æøå leses).
    private static func languages(_ r: VNRecognizeTextRequest) -> [String] {
        let wanted: [String] = ["nb-NO", "no-NO", "nn-NO", "da-DK", "sv-SE", "en-US"]
        let have: [String] = (try? r.supportedRecognitionLanguages()) ?? []
        let pick: [String] = wanted.filter { (w: String) in have.contains(w) }
        return pick.isEmpty ? ["en-US"] : pick
    }

    private static func page(_ cg: CGImage, _ o: CGImagePropertyOrientation) -> String {
        let req: VNRecognizeTextRequest = VNRecognizeTextRequest()
        req.recognitionLevel = .accurate
        req.usesLanguageCorrection = true
        req.recognitionLanguages = languages(req)
        let handler: VNImageRequestHandler = VNImageRequestHandler(cgImage: cg, orientation: o, options: [:])
        do { try handler.perform([req]) } catch { return "" }
        let obs: [VNRecognizedTextObservation] = req.results ?? []
        return lines(obs)
    }

    /// Grupperer observasjonene til linjer (samme høyde på siden), venstre mot høyre.
    private static func lines(_ obs: [VNRecognizedTextObservation]) -> String {
        struct Piece { let text: String; let midY: CGFloat; let minX: CGFloat; let h: CGFloat }
        let pieces: [Piece] = obs.compactMap { (o: VNRecognizedTextObservation) -> Piece? in
            guard let t = o.topCandidates(1).first?.string, !t.isEmpty else { return nil }
            let b: CGRect = o.boundingBox
            return Piece(text: t, midY: b.midY, minX: b.minX, h: b.height)
        }
        // Vision har origo nede til venstre: høyest midY først.
        let sorted: [Piece] = pieces.sorted { (a: Piece, b: Piece) in a.midY > b.midY }
        var rows: [[Piece]] = []
        for p in sorted {
            if let last = rows.last?.first, abs(last.midY - p.midY) < max(last.h, p.h) * 0.5 {
                rows[rows.count - 1].append(p)
            } else {
                rows.append([p])
            }
        }
        return rows.map { (r: [Piece]) -> String in
            r.sorted { (a: Piece, b: Piece) in a.minX < b.minX }.map { $0.text }.joined(separator: "\t")
        }.joined(separator: "\n")
    }
}

/* ---------- Foundation Models (bare iOS 26 og Xcode 26) ---------- */

#if canImport(FoundationModels)
@available(iOS 26.0, *)
@Generable
struct Kvittering47 {
    @Guide(description: "Butikk eller selger")
    var butikk: String
    @Guide(description: "Dato på formen ÅÅÅÅ-MM-DD")
    var dato: String
    @Guide(description: "Totalsummen som er betalt, i kroner")
    var totalsum: Double
    @Guide(description: "ISO-valutakode, f.eks. NOK")
    var valuta: String
    @Guide(description: "Samlet merverdiavgift i kroner, hvis den står på kvitteringen")
    var mva: Double?
    @Guide(description: "Varelinjene slik de står på kvitteringen")
    var varelinjer: [Varelinje47]
    @Guide(description: "Kategori", .anyOf(["Mat", "Transport", "Bolig", "Helse", "Klær", "Elektronikk", "Restaurant", "Annet"]))
    var kategori: String
    @Guide(description: "Betalingsmiddel, f.eks. Visa, Mastercard, BankAxept, Vipps eller kontant")
    var betalingsmiddel: String?
}

@available(iOS 26.0, *)
@Generable
struct Varelinje47 {
    @Guide(description: "Varenavnet")
    var navn: String
    @Guide(description: "Antall, hvis det står")
    var antall: Double?
    @Guide(description: "Beløpet for linjen i kroner")
    var pris: Double
}

/// Bare varelinjer (lange kvitteringer tolkes i bolker).
@available(iOS 26.0, *)
@Generable
struct Varelinjer47 {
    @Guide(description: "Varelinjene i denne delen av kvitteringen")
    var varelinjer: [Varelinje47]
}

@available(iOS 26.0, *)
enum Rc47FM {
    /// Omtrent hvor mye tekst som får plass i kontekstvinduet sammen med instruksene og svaret.
    static let maxChars: Int = 3_500
    static let chunkChars: Int = 2_200

    static func availability() -> Rc47Avail {
        switch SystemLanguageModel.default.availability {
        case .available:
            return .ok
        case .unavailable(let why):
            switch why {
            case .deviceNotEligible: return .noDevice
            case .appleIntelligenceNotEnabled: return .notEnabled
            case .modelNotReady: return .notReady
            @unknown default: return .other
            }
        @unknown default:
            return .other
        }
    }

    static func parse(_ text: String) async throws -> Rc47Parsed {
        if text.count <= maxChars {
            let k: Kvittering47 = try await whole(text)
            return convert(k, extra: nil)
        }
        // Lang kvittering: toppen og bunnen gir butikk, dato og sum; varelinjene leses i bolker og slås sammen.
        let all: [String] = text.components(separatedBy: "\n")
        let head: String = all.prefix(25).joined(separator: "\n")
        let tail: String = all.suffix(25).joined(separator: "\n")
        let k: Kvittering47 = try await whole(head + "\n…\n" + tail)
        var lines: [Rc47Line] = []
        for chunk in chunks(all) {
            let s: LanguageModelSession = LanguageModelSession(instructions: Receipt47.instructions)
            let r = try await s.respond(to: "Varelinjer fra en del av en kvittering:\n\n" + chunk, generating: Varelinjer47.self)
            lines.append(contentsOf: r.content.varelinjer.map { (v: Varelinje47) in Rc47FM.line(v) })
        }
        return convert(k, extra: dedupe(lines))
    }

    private static func whole(_ text: String) async throws -> Kvittering47 {
        let s: LanguageModelSession = LanguageModelSession(instructions: Receipt47.instructions)
        let r = try await s.respond(to: "Kvitteringstekst (lest med OCR):\n\n" + text, generating: Kvittering47.self)
        return r.content
    }

    private static func chunks(_ all: [String]) -> [String] {
        var out: [String] = []
        var cur: String = ""
        for l in all {
            if cur.count + l.count + 1 > chunkChars && !cur.isEmpty {
                out.append(cur)
                cur = ""
            }
            cur += (cur.isEmpty ? "" : "\n") + l
        }
        if !cur.isEmpty { out.append(cur) }
        return out
    }

    /// Bolkene overlapper ikke, men modellen kan ta med totalsummen som en linje: fjern linjer som heter «sum»/«total».
    private static func dedupe(_ lines: [Rc47Line]) -> [Rc47Line] {
        lines.filter { (l: Rc47Line) in
            let n: String = l.name.lowercased()
            return !(n.hasPrefix("sum") || n.hasPrefix("total") || n.hasPrefix("å betale") || n.hasPrefix("mva"))
        }
    }

    private static func line(_ v: Varelinje47) -> Rc47Line {
        Rc47Line(name: v.navn, qty: v.antall, price: v.pris)
    }

    private static func convert(_ k: Kvittering47, extra: [Rc47Line]?) -> Rc47Parsed {
        let cat: String = Receipt47.categories.contains(k.kategori) ? k.kategori : "Annet"
        return Rc47Parsed(merchant: k.butikk, date: k.dato, total: k.totalsum, currency: k.valuta.isEmpty ? "NOK" : k.valuta, vat: k.mva,
                          lines: extra ?? k.varelinjer.map { (v: Varelinje47) in Rc47FM.line(v) }, category: cat, payment: k.betalingsmiddel)
    }
}
#endif

// ---------------- Prompt 48: strukturering med Apple Foundation Models (device_parse) ----------------
// – Bare når «Tolk kvitteringer på iPhone» er på (av som standard) OG teksten er lest på iPhonen («Les teksten på iPhone»).
// – Sjekker SystemLanguageModel.default.availability ved hver skanning; utilgjengelig eller feil → hoppes over stille, og bare
//   bildet + device_ocr sendes. Modellen får OCR-radene (rows), ikke bildet.
// – Guided generation: @Generable-typene under speiler shared/schemas/receipt.schema.json felt for felt (samme navn).
//   category_suggestion: listen kommer fra serveren (GET /finans/api/receipts/health → categories) og står i instruksen;
//   svaret knyttes til nærmeste navn i listen (Rc48Check.snap), ellers "" (serveren gjør det samme).
// – Lange kvitteringer: toppen og bunnen gir butikk, dato og sum, varelinjene leses i bolker. Over maxTotal hoppes det over.
// – Resultatet er et forslag: Glimt validerer alt (steg A i kjeden).
// Xcode 16 (uten rammeverket) bygger reserven: alt som bruker FoundationModels er bak #if canImport + #available(iOS 26.0, *).

enum Receipt48Parse {
    /// nil når modellen er utilgjengelig, teksten er for lang eller noe feiler (stille – da sendes bare OCR-en).
    static func parse(rows: [String], categories: [String]) async -> Rc48Receipt? {
        guard Receipt47.availability().ok else { return nil }
        let clean: [String] = rows.map { (r: String) in r.trimmingCharacters(in: .whitespaces) }.filter { (r: String) in !r.isEmpty }
        if clean.joined(separator: "\n").count < 8 { return nil }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            do {
                var r: Rc48Receipt? = try await Rc48FM.parse(clean, categories: categories)
                if let x = r { r = finish(x, categories: categories) }
                return r
            } catch {
                return nil
            }
        }
        #endif
        return nil
    }

    static func finish(_ r: Rc48Receipt, categories: [String]) -> Rc48Receipt {
        var x: Rc48Receipt = r
        x.categorySuggestion = Rc48Check.snap(r.categorySuggestion, to: categories)
        if !Rc48Check.validDate(x.date) {
            // «24.10.26» → 2026-10-24. Ellers sendes teksten som den er: serveren tolker den (parseDate45) eller finner
            // datoen i OCR-teksten (findDate).
            x.date = isoFromNorwegian(x.date) ?? String(x.date.trimmingCharacters(in: .whitespaces).prefix(40))
        }
        return x.cleaned
    }

    /// «dd.mm.yy(yy)» eller «dd/mm/yy(yy)» → ÅÅÅÅ-MM-DD, bare når den er gyldig og ikke i fremtiden.
    static func isoFromNorwegian(_ s: String) -> String? {
        let p: [String] = s.trimmingCharacters(in: .whitespaces).split(whereSeparator: { (c: Character) in c == "." || c == "/" || c == "-" }).map(String.init)
        guard p.count == 3, let d = Int(p[0]), let m = Int(p[1]), var y = Int(p[2]), p[0].count <= 2 else { return nil }
        if y < 100 { y += 2000 }
        let iso: String = String(format: "%04d-%02d-%02d", y, m, d)
        return Rc48Check.validDate(iso) ? iso : nil
    }

    static func instructions(_ categories: [String]) -> String {
        let cats: String = categories.isEmpty ? "Annet" : categories.prefix(60).joined(separator: ", ")
        return "Du transkriberer norske kvitteringer fra OCR-rader til JSON. Skriv av hver varelinje med beløpet som står på raden. "
            + "Pant og tips er egne varelinjer. Rabatter legges i discounts med negativt beløp. Ikke regn ut noe selv, og ikke gjett: "
            + "bruk bare tall og tekst som står i radene. Beløp i kroner med punktum som desimaltegn. Datoen skrives ÅÅÅÅ-MM-DD. "
            + "category_suggestion skal være nøyaktig ett av disse navnene: " + cats + "."
    }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
@Generable
struct Kvittering48 {
    @Guide(description: "Butikkens eller selgerens navn, slik det står øverst på kvitteringen")
    var merchant: String
    @Guide(description: "Organisasjonsnummeret (9 siffer) hvis det står, ellers null")
    var org_number: String?
    @Guide(description: "Kjøpsdatoen på formen ÅÅÅÅ-MM-DD")
    var date: String
    @Guide(description: "Klokkeslettet på formen TT:MM hvis det står, ellers null")
    var time: String?
    @Guide(description: "ISO-valutakode, vanligvis NOK")
    var currency: String
    @Guide(description: "Alle varelinjer i rekkefølge, også pant og tips")
    var items: [Vare48]
    @Guide(description: "Rabatter med negativt beløp")
    var discounts: [Rabatt48]
    @Guide(description: "Delsum før rabatter hvis den står, ellers null")
    var subtotal: Double?
    @Guide(description: "MVA per sats (25, 15 eller 12 prosent) med beløpet i kroner")
    var vat: [Mva48]
    @Guide(description: "Totalbeløpet som er betalt (TOTAL, Å BETALE, SUM eller BETALT), i kroner")
    var total: Double
    @Guide(description: "Betalingsmiddel, f.eks. BankAxept, Visa, Mastercard, Vipps eller kontant, ellers null")
    var payment_method: String?
    @Guide(description: "Kategorien, nøyaktig ett av navnene i instruksen")
    var category_suggestion: String
}

@available(iOS 26.0, *)
@Generable
struct Vare48 {
    @Guide(description: "Varenavnet slik det står")
    var description: String
    @Guide(description: "Antall hvis det står, ellers null")
    var quantity: Double?
    @Guide(description: "Pris per stykk hvis den står, ellers null")
    var unit_price: Double?
    @Guide(description: "Beløpet for linjen i kroner")
    var amount: Double
}

@available(iOS 26.0, *)
@Generable
struct Rabatt48 {
    @Guide(description: "Teksten for rabatten")
    var description: String
    @Guide(description: "Rabatten i kroner som negativt tall")
    var amount: Double
}

@available(iOS 26.0, *)
@Generable
struct Mva48 {
    @Guide(description: "MVA-satsen i prosent: 25, 15 eller 12")
    var rate: Double
    @Guide(description: "MVA-beløpet i kroner")
    var amount: Double
}

/// Bare varelinjer og rabatter (lange kvitteringer tolkes i bolker).
@available(iOS 26.0, *)
@Generable
struct Varer48 {
    @Guide(description: "Varelinjene i denne delen av kvitteringen")
    var items: [Vare48]
    @Guide(description: "Rabatter i denne delen, med negativt beløp")
    var discounts: [Rabatt48]
}

@available(iOS 26.0, *)
enum Rc48FM {
    /// Omtrent hvor mye tekst som får plass sammen med instruksen og svaret.
    static let maxChars: Int = 3_200
    static let chunkChars: Int = 2_000
    /// Lengre enn dette: hopp over device-parse (Glimt tolker radene).
    static let maxTotal: Int = 14_000

    struct TooLong: Error {}

    static func parse(_ rows: [String], categories: [String]) async throws -> Rc48Receipt {
        let text: String = rows.joined(separator: "\n")
        if text.count > maxTotal { throw TooLong() }
        let ins: String = Receipt48Parse.instructions(categories)
        if text.count <= maxChars {
            let k: Kvittering48 = try await whole(text, ins)
            return convert(k, items: nil, discounts: nil)
        }
        let head: String = rows.prefix(25).joined(separator: "\n")
        let tail: String = rows.suffix(25).joined(separator: "\n")
        let k: Kvittering48 = try await whole(head + "\n…\n" + tail, ins)
        var items: [Rc48Item] = []
        var discounts: [Rc48Discount] = []
        for chunk in chunks(rows) {
            let s: LanguageModelSession = LanguageModelSession(instructions: ins)
            let r = try await s.respond(to: "OCR-rader fra en del av en kvittering:\n\n" + chunk, generating: Varer48.self)
            items.append(contentsOf: r.content.items.map { (v: Vare48) in Rc48FM.item(v) })
            discounts.append(contentsOf: r.content.discounts.map { (d: Rabatt48) in Rc48Discount(description: d.description, amount: d.amount) })
        }
        return convert(k, items: dedupe(items), discounts: discounts)
    }

    private static func whole(_ text: String, _ ins: String) async throws -> Kvittering48 {
        let s: LanguageModelSession = LanguageModelSession(instructions: ins)
        let r = try await s.respond(to: "OCR-rader fra kvitteringen (vare og pris står på samme rad):\n\n" + text, generating: Kvittering48.self)
        return r.content
    }

    private static func chunks(_ rows: [String]) -> [String] {
        var out: [String] = []
        var cur: String = ""
        for l in rows {
            if cur.count + l.count + 1 > chunkChars && !cur.isEmpty {
                out.append(cur)
                cur = ""
            }
            cur += (cur.isEmpty ? "" : "\n") + l
        }
        if !cur.isEmpty { out.append(cur) }
        return out
    }

    /// Bolkene kan ta med sum-/totallinjer som varer: de fjernes.
    private static func dedupe(_ items: [Rc48Item]) -> [Rc48Item] {
        items.filter { (i: Rc48Item) in
            let n: String = i.description.lowercased()
            return !(n.hasPrefix("sum") || n.hasPrefix("total") || n.hasPrefix("å betale") || n.hasPrefix("mva") || n.hasPrefix("betalt"))
        }
    }

    private static func item(_ v: Vare48) -> Rc48Item {
        Rc48Item(description: v.description, quantity: v.quantity, unitPrice: v.unit_price, amount: v.amount)
    }

    private static func convert(_ k: Kvittering48, items: [Rc48Item]?, discounts: [Rc48Discount]?) -> Rc48Receipt {
        var r: Rc48Receipt = Rc48Receipt()
        r.merchant = k.merchant
        r.orgNumber = k.org_number
        r.date = k.date
        r.time = k.time
        r.currency = k.currency.isEmpty ? "NOK" : k.currency
        r.items = items ?? k.items.map { (v: Vare48) in Rc48FM.item(v) }
        r.discounts = discounts ?? k.discounts.map { (d: Rabatt48) in Rc48Discount(description: d.description, amount: d.amount) }
        r.subtotal = k.subtotal
        r.vat = k.vat.map { (m: Mva48) in Rc48Vat(rate: m.rate, amount: m.amount) }
        r.total = k.total
        r.paymentMethod = k.payment_method
        r.categorySuggestion = k.category_suggestion
        return r
    }
}
#endif
