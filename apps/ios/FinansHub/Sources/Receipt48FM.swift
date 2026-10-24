import SwiftUI
import UIKit
#if canImport(FoundationModels)
import FoundationModels
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
