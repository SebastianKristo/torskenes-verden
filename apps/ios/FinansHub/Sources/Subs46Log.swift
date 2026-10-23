import SwiftUI
import UIKit

/* ---------------- Prompt 46: Subscription OS → Historikk → Logg (prøveperioder og alle tidligere fakturaer) ----------------
 Spesifikasjon: claude-code-subscription-logg.md. Fasit: Subscription OS.dc.html → Historikk, «Logg» under «Denne måneden» (hist.log).
 Server (SERVER46, samme som web subs-log46.js): GET /finans/api/subscriptions/log?months=36 →
   {events:[{id, subscriptionId, service, type: charge|trial_start|trial_end|trial_converted|trial_cancelled|price_change|cancelled,
             amount, date, account, oldPrice?, newPrice?, priceAfter?, days?, domain?, logoUrl?, category?}], summary?}
 Eldre server (404): loggen bygges av prøveperiodene appen kjenner, med en linje om at fakturaene mangler.
 – «N fakturaer · N prøveperioder · X kr betalt siste 12 mnd», filter Alle / Fakturaer / Prøveperioder, gruppert per måned med
   månedssum, 3 måneder om gangen («Vis eldre (N måneder)»), «Eksporter CSV» (semikolon, UTF-8: Dato;Tjeneste;Type;Beløp). */

struct Subs46Event: Identifiable, Hashable {
    var id: String
    var service: String
    var type: String
    var amount: Double
    var date: String
    var account: String = ""
    var oldPrice: Double = 0
    var newPrice: Double = 0
    var priceAfter: Double = 0
    var days: Int = 0
    var domain: String = ""
    var logoUrl: String = ""
    var category: String = ""

    var trial: Bool { type.hasPrefix("trial_") }
    var month: String { String(date.prefix(7)) }
}

@MainActor
@Observable
final class Subs46Log {
    static let shared = Subs46Log()

    var events: [Subs46Event] = []
    var server: Bool = true
    var loading: Bool = false
    var filter: String = "all"
    var months: Int = 3
    @ObservationIgnored private var at: Date = .distantPast

    func load(_ store: Store, force: Bool = false) async {
        if loading || (!force && Date().timeIntervalSince(at) < 60 && !events.isEmpty) { return }
        loading = true
        defer { loading = false; at = Date() }
        do {
            let d: Data = try await store.api.callAt("/finans/api", "GET", "/subscriptions/log?months=36", timeout: 20)
            let o: [String: Any] = JS.obj(d)
            let rows: [[String: Any]] = JS.list(o, "events").isEmpty ? JS.list(o, "items") : JS.list(o, "events")
            events = rows.compactMap { Subs46Log.event($0) }
            server = true
        } catch {
            events = Subs46Log.fallback()
            server = false
        }
    }

    nonisolated static func event(_ r: [String: Any]) -> Subs46Event? {
        guard let date = JS.str(r, "date"), !date.isEmpty else { return nil }
        var e: Subs46Event = Subs46Event(id: JS.str(r, "id") ?? JS.int(r, "id").map { String($0) } ?? UUID().uuidString,
                                         service: JS.str(r, "service") ?? "Ukjent", type: JS.str(r, "type") ?? "charge",
                                         amount: JS.num(r, "amount") ?? 0, date: String(date.prefix(10)))
        e.account = JS.str(r, "account") ?? ""
        e.oldPrice = JS.num(r, "oldPrice") ?? 0
        e.newPrice = JS.num(r, "newPrice") ?? 0
        e.priceAfter = JS.num(r, "priceAfter") ?? 0
        e.days = JS.int(r, "days") ?? 0
        e.domain = JS.str(r, "domain") ?? ""
        e.logoUrl = JS.str(r, "logoUrl") ?? ""
        e.category = JS.str(r, "category") ?? ""
        return e
    }

    /// Uten logg på serveren: prøveperiodene (aktive og avsluttede) som appen kjenner.
    static func fallback() -> [Subs46Event] {
        var out: [Subs46Event] = []
        for t in Trial31Model.shared.trials where !t.endsAt.isEmpty {
            let p: Double = Double(t.priceAfter.filter { $0.isNumber || $0 == "," || $0 == "." }.replacingOccurrences(of: ",", with: ".")) ?? 0
            switch t.status {
            case "cancelled": out.append(Subs46Event(id: "tc-" + t.id, service: t.service, type: "trial_cancelled", amount: 0, date: t.endsAt, priceAfter: p))
            case "kept", "converted": out.append(Subs46Event(id: "tv-" + t.id, service: t.service, type: "trial_converted", amount: -p, date: t.endsAt, priceAfter: p))
            default: out.append(Subs46Event(id: "ts-" + t.id, service: t.service, type: "trial_start", amount: 0, date: t.endsAt))
            }
        }
        return out
    }

    var filtered: [Subs46Event] {
        events.filter { (e: Subs46Event) -> Bool in
            filter == "all" ? true : (filter == "charge" ? e.type == "charge" : e.trial)
        }
        .sorted { $0.date > $1.date }
    }

    /// Månedene (nyeste først) med hendelser.
    var groups: [(String, [Subs46Event])] {
        let f: [Subs46Event] = filtered
        var keys: [String] = []
        for e in f where !keys.contains(e.month) { keys.append(e.month) }
        return keys.map { (k: String) -> (String, [Subs46Event]) in (k, f.filter { $0.month == k }) }
    }

    nonisolated static func paid(_ list: [Subs46Event]) -> Double {
        list.filter { $0.type == "charge" || $0.type == "trial_converted" }.reduce(0) { $0 + Swift.max(abs($1.amount), $1.priceAfter) }
    }

    var summary: String {
        let charges: Int = events.filter { $0.type == "charge" }.count
        let trials: Int = events.filter { $0.type == "trial_start" }.count
        let cut: String = Subs46Log.iso(Calendar.current.date(byAdding: .month, value: -12, to: Date()) ?? Date())
        let paid12: Double = Subs46Log.paid(events.filter { $0.date >= cut })
        return "\(charges) fakturaer · \(trials) prøveperioder · " + SubCalc23.kr(paid12) + " betalt siste 12 mnd"
    }

    /// CSV for valgt filter (semikolon, UTF-8): Dato;Tjeneste;Type;Beløp.
    var csv: String {
        let names: [String: String] = ["charge": "Faktura", "trial_start": "Prøveperiode startet", "trial_end": "Prøveperiode avsluttet",
                                       "trial_cancelled": "Prøveperiode sagt opp", "trial_converted": "Prøveperiode til betalt",
                                       "price_change": "Prisendring", "cancelled": "Sagt opp"]
        var lines: [String] = ["Dato;Tjeneste;Type;Beløp"]
        for e in filtered {
            let amount: String = String(format: "%.2f", e.amount).replacingOccurrences(of: ".", with: ",")
            lines.append([e.date, e.service.replacingOccurrences(of: ";", with: ","), names[e.type] ?? e.type, amount].joined(separator: ";"))
        }
        return lines.joined(separator: "\n") + "\n"
    }

    nonisolated static func iso(_ d: Date) -> String {
        let f: DateFormatter = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }

    nonisolated static func monthName(_ ym: String) -> String {
        let names: [String] = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"]
        let parts: [Int] = ym.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 2, (1...12).contains(parts[1]) else { return ym }
        return names[parts[1] - 1].capitalized + " " + String(parts[0])
    }

    nonisolated static func day(_ iso: String) -> String {
        let parts: [Int] = iso.split(separator: "-").compactMap { Int($0) }
        let m: [String] = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]
        guard parts.count == 3, (1...12).contains(parts[1]) else { return iso }
        return "\(parts[2]). " + m[parts[1] - 1]
    }
}

/// «Logg» under «Denne måneden» i Historikk.
struct Subs46LogSection: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Subs46Log { Subs46Log.shared }

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        let groups: [(String, [Subs46Event])] = m.groups
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Logg").font(PF.ui(17, .semibold)).foregroundStyle(t.fg)
                Spacer()
                ShareLink(item: m.csv, preview: SharePreview("abonnement-logg.csv")) {
                    Text("Eksporter CSV").font(PF.ui(12.5, .bold)).foregroundStyle(t.fg).padding(.horizontal, 12).frame(height: 30)
                        .background(t.chip, in: Capsule())
                }
            }
            .padding(.horizontal, 4)
            Text(m.summary).font(PF.ui(12.5)).foregroundStyle(t.mut).padding(.horizontal, 4)
            if !m.server {
                Text("Serveren lagrer ikke fakturaloggen ennå – viser prøveperiodene appen kjenner.").font(PF.ui(12)).foregroundStyle(t.mut).padding(.horizontal, 4)
            }
            chips(t)
            if groups.isEmpty && !m.loading {
                Text("Ingen hendelser ennå.").font(PF.ui(14)).foregroundStyle(t.mut).padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(t.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
            ForEach(Array(groups.prefix(m.months).enumerated()), id: \.offset) { (pair: (offset: Int, element: (String, [Subs46Event]))) in
                Subs46Month(ym: pair.element.0, events: pair.element.1)
            }
            if groups.count > m.months {
                let left: Int = groups.count - m.months
                Button { Haptics.shared.tap(); m.months += 3 } label: {
                    Text("Vis eldre (\(left) " + (left == 1 ? "måned" : "måneder") + ")").font(PF.ui(13.5, .bold)).foregroundStyle(t.fg)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .overlay(Capsule().stroke(t.bd, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 8)
        .task(id: store.account?.id ?? "") { await m.load(store) }
    }

    private func chips(_ t: SubTok23) -> some View {
        HStack(spacing: 6) {
            chip("all", "Alle", t)
            chip("charge", "Fakturaer", t)
            chip("trial", "Prøveperioder", t)
        }
    }

    private func chip(_ k: String, _ label: String, _ t: SubTok23) -> some View {
        let on: Bool = m.filter == k
        return Button { Haptics.shared.select(); m.filter = k; m.months = 3 } label: {
            Text(label).font(PF.ui(12.5, .bold)).foregroundStyle(on ? t.onFg : t.fg)
                .padding(.horizontal, 12).frame(height: 32)
                .background(on ? t.on : t.chip, in: Capsule())
                .frame(minHeight: 44)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

struct Subs46Month: View {
    @Environment(\.paper) private var p
    let ym: String
    let events: [Subs46Event]

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        let sum: Double = Subs46Log.paid(events)
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(Subs46Log.monthName(ym).uppercased()).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(t.mut)
                Spacer()
                if sum > 0 { Text("−" + SubCalc23.kr(sum)).font(PF.mono(11, bold: false)).foregroundStyle(t.mut) }
            }
            .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 6)
            ForEach(Array(events.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Subs46Event)) in
                if pair.offset > 0 { Rectangle().fill(t.bd).frame(height: 1).padding(.leading, 62) }
                Subs46Row(e: pair.element)
            }
        }
        .padding(.bottom, 6)
        .background(t.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct Subs46Row: View {
    @Environment(\.paper) private var p
    let e: Subs46Event

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        let v: (String, Color) = value(t)
        HStack(spacing: 12) {
            SubLogo23(name: e.service, domain: e.domain.isEmpty ? Trials32b.domain(e.service) : e.domain, logoUrl: e.logoUrl.isEmpty ? nil : e.logoUrl,
                      category: e.category.isEmpty ? "Strømming" : e.category, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(e.service).font(PF.ui(14.5, .semibold)).foregroundStyle(t.fg).lineLimit(1)
                    if e.trial {
                        Text("PRØVE").font(PF.mono(9)).foregroundStyle(Subs37.orange).padding(.horizontal, 5).frame(height: 16)
                            .background(Subs37.orange.opacity(0.14), in: Capsule())
                    }
                }
                Text(sub).font(PF.ui(12)).foregroundStyle(t.mut).lineLimit(2)
            }
            Spacer(minLength: 6)
            Text(v.0).font(PF.mono(13)).foregroundStyle(v.1)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private var price: Double { e.priceAfter > 0 ? e.priceAfter : e.newPrice }

    private var sub: String {
        let d: String = Subs46Log.day(e.date)
        switch e.type {
        case "charge": return "Faktura · " + d + (e.account.isEmpty ? "" : " · " + e.account) + (e.oldPrice > 0 && e.oldPrice < abs(e.amount) ? " · gammel pris" : "")
        case "trial_start": return "Prøveperiode startet · " + d + (e.days > 0 ? " · gratis i \(e.days) dager" : "")
        case "trial_cancelled", "trial_end": return "Prøveperiode avsluttet · " + d + " · sagt opp i tide"
        case "trial_converted": return "Gikk over til betalt · " + d + (price > 0 ? " · " + SubCalc23.kr(price) + "/mnd" : "")
        case "price_change": return "Prisendring · " + d + " · " + SubCalc23.kr(e.oldPrice) + " → " + SubCalc23.kr(e.newPrice)
        case "cancelled": return "Sagt opp · " + d
        default: return d
        }
    }

    private func value(_ t: SubTok23) -> (String, Color) {
        switch e.type {
        case "charge": return ("−" + SubCalc23.kr(abs(e.amount)), t.neg)
        case "trial_start": return ("0 kr", t.mut)
        case "trial_cancelled", "trial_end": return (price > 0 ? "Spart " + SubCalc23.kr(price) : "Spart", Subs37.green)
        case "trial_converted": return (price > 0 ? "−" + SubCalc23.kr(price) : "–", t.neg)
        case "price_change":
            let diff: Double = e.newPrice - e.oldPrice
            return ((diff >= 0 ? "+" : "−") + SubCalc23.kr(abs(diff)), diff > 0 ? t.neg : Subs37.green)
        default: return ("–", t.mut)
        }
    }
}
