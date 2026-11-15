import SwiftUI
import PhotosUI
import UIKit

/* ---------------- Prompt 27: nytt abonnement fra skjermbilde ---------------- */
// Fasit: «+ Legg til abonnement» → «Fra skjermbilde» i design/Subscription OS.dc.html og
// prompts/prompt-27-pakke/claude-code-abo-skjermbilde.md.
// POST /finans/api/subscriptions/from-screenshot (multipart «image») → {tjeneste, plan, pris (øre NOK), valuta, prisOriginal?,
// syklus:'mnd'|'år', neste_trekk, kategori, logoUrl?, domain?, sikkerhet:{felt:0–1}, check:[felt…], existingId?}.
// Leses lokalt av Ollama (bildemodell) på hjemmeserveren; bildet slettes etter lesing.
// Visning: miniatyr, rader med ✓ eller «Sjekk» (sikkerhet < 0,8 eller i check), «+ Legg til …», «Rediger først»,
// og «Oppdater …» når tjenesten allerede finnes.

struct SubShotResult27 {
    var name: String
    var plan: String
    /// Kroner (NOK).
    var price: Double
    var currency: String
    var priceOriginal: String
    /// monthly | yearly
    var cycle: String
    /// YYYY-MM-DD
    var next: String
    var category: String
    var logoUrl: String?
    var domain: String?
    var existingId: Int?
    var unsure: Set<String>

    init(_ o: [String: Any]) {
        name = JS.str(o, "tjeneste") ?? JS.str(o, "name") ?? ""
        plan = JS.str(o, "plan") ?? ""
        price = (JS.num(o, "pris") ?? 0) / 100
        currency = (JS.str(o, "valuta") ?? "NOK").uppercased()
        if let po = o["prisOriginal"] as? String { priceOriginal = po } else if let n = JS.num(o, "prisOriginal") { priceOriginal = String(format: "%.2f", n) } else { priceOriginal = "" }
        let syk: String = (JS.str(o, "syklus") ?? "mnd").lowercased()
        cycle = (syk == "år" || syk == "ar" || syk == "yearly" || syk == "year") ? "yearly" : "monthly"
        next = JS.str(o, "neste_trekk") ?? JS.str(o, "nextDate") ?? ""
        category = JS.str(o, "kategori") ?? JS.str(o, "category") ?? "Annet"
        logoUrl = JS.str(o, "logoUrl")
        domain = JS.str(o, "domain")
        existingId = JS.int(o, "existingId")
        var u: Set<String> = Set(JS.strings(o, "check").map { $0.lowercased() })
        if let s = JS.dict(o, "sikkerhet") {
            for (k, v) in s {
                let n: Double? = (v as? Double) ?? (v as? Int).map { Double($0) }
                if let n, n < 0.8 { u.insert(k.lowercased()) }
            }
        }
        unsure = u
    }

    func check(_ keys: [String]) -> Bool { keys.contains { unsure.contains($0) } }

    var day: Int { next.count >= 10 ? (Int(next.dropFirst(8).prefix(2)) ?? 1) : Calendar.current.component(.day, from: Date()) }
    var month: Int { next.count >= 7 ? (Int(next.dropFirst(5).prefix(2)) ?? 1) : Calendar.current.component(.month, from: Date()) }

    /// «12. nov»
    var nextText: String {
        let m: Int = Swift.max(1, Swift.min(12, month))
        return "\(day). \(SubCalc23.monthShort[m - 1].lowercased())"
    }

    var priceText: String {
        let kr: String = SubCalc23.kr(price)
        if currency == "NOK" || currency.isEmpty { return kr }
        return priceOriginal.isEmpty ? "≈ \(kr)" : "≈ \(kr) (\(priceOriginal) \(currency))"
    }

    /// Body for POST /subscriptions og PATCH /subscriptions/:id.
    var body: [String: Any] {
        var b: [String: Any] = ["name": name, "plan": plan, "price": price, "cycle": cycle, "category": category,
                                "billDay": day, "chargeDay": day, "status": "active", "active": true, "lowUse": false]
        if cycle == "monthly" { b["billMonth"] = NSNull() } else { b["billMonth"] = month }
        if let d = domain, !d.isEmpty { b["domain"] = d }
        if let l = logoUrl, !l.isEmpty { b["logoUrl"] = l }
        return b
    }

    /// Ferdig utfylt skjema («Rediger først»).
    var draft: SubItem {
        var o: [String: Any] = body
        o["id"] = 0
        o["nextDate"] = next
        if cycle == "monthly" { o.removeValue(forKey: "billMonth") }
        return SubItem(o)
    }
}
