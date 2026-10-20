import SwiftUI

/* ---------------- Prompt 40: Finans → Søk – Glimt gir ryddige svar med kort ----------------
   prompts/prompt-40-pakke/claude-code-finans-sok-glimt-kort.md, fasit Mobil Papir App.dc.html → Finans → Søk (fs, subI, G).
   AI heter Glimt i Finans-søket («✦ Glimt», «✦ GLIMT», «Spør Glimt, f.eks. …»). Kilden står kort til høyre i toppen av kortet
   («fra Subscription OS»). Svaret har alltid tre deler: kort oppsummering (maks 2 setninger, serif 19), tre nøkkeltall og kort per
   element (logo, navn, «Neste trekk 25. okt · om 5 dager» – rød innen 7 dager, beløp + «per mnd»), sortert etter neste trekk,
   og «Åpne Subscription OS ›». Ingen «Ingen treff.» når Glimt har svart med kort.
   API (SERVER40): POST /finans/api/search/ask {q} → {text, source, cards:[{kind:'sub'|'tx'|'receipt'|'budget'|'stat', …}],
   kpis?, items, total?, open?}. Markdown og kildemarkører fjernes alltid, tall formateres i appen (nb-NO). */

struct Fin40Kpi: Hashable {
    var label: String
    var value: String
    var sub: String
}

struct Fin40Card: Hashable, Identifiable {
    var id: String
    var kind: String
    var name: String
    var logo: String
    var domain: String
    var amount: Double?
    var cycle: String
    var next: Date?
    var note: String
    var txId: Int?

    init(_ o: [String: Any], _ i: Int) {
        kind = JS.str(o, "kind") ?? JS.str(o, "type") ?? "sub"
        id = (JS.str(o, "id") ?? "\(i)") + kind
        name = JS.str(o, "name") ?? JS.str(o, "title") ?? JS.str(o, "description") ?? ""
        logo = JS.str(o, "logo") ?? ""
        domain = JS.str(o, "domain") ?? ""
        amount = JS.num(o, "amount") ?? JS.num(o, "price")
        cycle = JS.str(o, "cycle") ?? JS.str(o, "interval") ?? ""
        next = Hjemlys40Session.date(o["next_date"] ?? o["nextDate"] ?? o["next"] ?? o["date"])
        note = Fin40Ask.clean(JS.str(o, "note") ?? JS.str(o, "sub") ?? "")
        txId = JS.int(o, "txId") ?? (kind == "tx" ? JS.int(o, "id") : nil)
    }

    var daysLeft: Int? {
        guard let n = next else { return nil }
        let c: Calendar = Calendar.current
        return c.dateComponents([.day], from: c.startOfDay(for: Date()), to: c.startOfDay(for: n)).day
    }

    var yearly: Bool { ["year", "yearly", "år", "årlig", "annual"].contains(cycle.lowercased()) }

    /// Månedsbeløp (årlige delt på 12).
    var monthly: Double { (amount ?? 0) / (yearly ? 12 : 1) }

    var logoURL: URL? {
        if logo.hasPrefix("http"), let u = URL(string: logo) { return u }
        let dom: String = domain.isEmpty ? name.lowercased().replacingOccurrences(of: " ", with: "") + ".no" : domain
        return URL(string: "https://www.google.com/s2/favicons?sz=64&domain=" + dom)
    }
}

struct Fin40Answer: Hashable {
    var q: String = ""
    var text: String = ""
    var source: String = ""
    var kpis: [Fin40Kpi] = []
    var cards: [Fin40Card] = []
    var open: String = ""
    var openLabel: String = ""
}

@MainActor
@Observable
final class Fin40Ask {
    static let shared = Fin40Ask()

    var answer: Fin40Answer? = nil
    var busy: Bool = false

    /// Standardspørsmål som alltid gir kort (også uten ✦ Glimt).
    static func standard(_ q: String) -> Bool {
        let l: String = q.lowercased()
        let words: [String] = ["abonnement", "abo", "faste trekk", "hva betaler jeg for", "hvor mye brukte jeg", "faste utgifter", "budsjett", "kontoer"]
        return words.contains(where: { l.contains($0) })
    }

    /// Fjerner markdown og kildemarkører ([n], **, __, #).
    static func clean(_ s: String) -> String {
        var t: String = s.replacingOccurrences(of: "**", with: "").replacingOccurrences(of: "__", with: "").replacingOccurrences(of: "`", with: "")
        t = t.replacingOccurrences(of: "\\[[0-9, ]+\\]", with: "", options: .regularExpression)
        t = t.replacingOccurrences(of: "(?m)^#+ ", with: "", options: .regularExpression)
        t = t.replacingOccurrences(of: "  ", with: " ")
        return t.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func clear() { answer = nil }

    func ask(_ q: String, _ store: Store) {
        busy = true
        answer = nil
        Task {
            defer { self.busy = false }
            guard let d = try? await store.api.callAt("/finans/api", "POST", "/search/ask", json: ["q": q], timeout: 60) else { return }
            let o: [String: Any] = JS.obj(d)
            var a: Fin40Answer = Fin40Answer()
            a.q = q
            a.text = Fin40Ask.clean(JS.str(o, "text") ?? JS.str(o, "summary") ?? "")
            a.source = JS.str(o, "source") ?? ""
            let cs: [[String: Any]] = JS.list(o, "cards").isEmpty ? JS.list(o, "items") : JS.list(o, "cards")
            a.cards = cs.enumerated().map { (x: (offset: Int, element: [String: Any])) -> Fin40Card in Fin40Card(x.element, x.offset) }
                .filter { !$0.name.isEmpty }
                .sorted { (l: Fin40Card, r: Fin40Card) -> Bool in (l.next ?? .distantFuture) < (r.next ?? .distantFuture) }
            a.kpis = JS.list(o, "kpis").map { (k: [String: Any]) -> Fin40Kpi in
                Fin40Kpi(label: (JS.str(k, "label") ?? "").uppercased(), value: JS.str(k, "value") ?? "", sub: JS.str(k, "sub") ?? "")
            }
            if a.kpis.isEmpty { a.kpis = Fin40Ask.kpis(a.cards, total: JS.num(o, "total")) }
            if let op = o["open"] as? [String: Any] {
                a.open = JS.str(op, "target") ?? ""
                a.openLabel = JS.str(op, "label") ?? ""
            } else {
                a.open = JS.str(o, "open") ?? ""
            }
            if a.open.isEmpty, a.source.lowercased().contains("subscription") { a.open = "abo" }
            if a.text.isEmpty && a.cards.isEmpty { return }
            self.answer = a
        }
    }

    /// PER MÅNED · PER ÅR · NESTE TREKK fra kortene (abonnementer).
    static func kpis(_ cards: [Fin40Card], total: Double?) -> [Fin40Kpi] {
        let subs: [Fin40Card] = cards.filter { $0.kind == "sub" }
        if subs.isEmpty { return [] }
        let month: Double = total ?? subs.map(\.monthly).reduce(0, +)
        var out: [Fin40Kpi] = [Fin40Kpi(label: "PER MÅNED", value: Fin40Reread.money(month), sub: "\(subs.count) abonnementer"),
                               Fin40Kpi(label: "PER ÅR", value: Fin40Reread.money(month * 12), sub: "")]
        if let n = subs.first(where: { $0.next != nil }), let d = n.next {
            out.append(Fin40Kpi(label: "NESTE TREKK", value: Fin40Card.day(d), sub: n.name + " · " + Fin40Reread.money(n.amount)))
        }
        return out
    }
}

extension Fin40Card {
    /// «25. okt».
    static func day(_ d: Date) -> String {
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = "d. MMM"
        var s: String = f.string(from: d)
        if s.hasSuffix(".") { s.removeLast() }
        return s
    }
}

/// Glimt-kortet i Finans-søket.
struct Fin40AnswerCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let a: Fin40Answer

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("✦ GLIMT").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
                Spacer()
                if !a.source.isEmpty {
                    Text(a.source.hasPrefix("fra ") || a.source.hasPrefix("leste") ? a.source : "fra " + a.source)
                        .font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
                }
            }
            if !a.text.isEmpty {
                Text(a.text).font(PF.serif(19)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            }
            if !a.kpis.isEmpty {
                HStack(alignment: .top, spacing: 8) {
                    ForEach(a.kpis.prefix(3), id: \.self) { (k: Fin40Kpi) in Fin40KpiBox(k: k) }
                }
            }
            if !a.cards.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(a.cards.prefix(20).enumerated()), id: \.element.id) { i, c in
                        Fin40CardRow(c: c, first: i == 0)
                    }
                }
                .background(p.bg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            if a.open == "abo" || a.source.lowercased().contains("subscription") {
                Button { Haptic30.light(); store.paperGo("abo") } label: {
                    Text(a.openLabel.isEmpty ? "Åpne Subscription OS ›" : a.openLabel + " ›").font(PF.ui(14, .bold)).foregroundStyle(p.lab)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(p.lab, lineWidth: 1.5))
    }
}

struct Fin40KpiBox: View {
    @Environment(\.paper) private var p
    let k: Fin40Kpi

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(k.label).font(PF.mono(9.5)).tracking(0.9).foregroundStyle(p.mut).lineLimit(1).minimumScaleFactor(0.8)
            Text(k.value).font(PF.serif(18, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
            if !k.sub.isEmpty {
                Text(k.sub).font(PF.ui(11)).foregroundStyle(p.mut).lineLimit(2).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct Fin40CardRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let c: Fin40Card
    let first: Bool

    var body: some View {
        Button { open() } label: {
            HStack(spacing: 12) {
                logo
                VStack(alignment: .leading, spacing: 1) {
                    Text(c.name).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    Text(subline).font(PF.ui(12)).foregroundStyle(soon ? Color(hex: "#b23a2a") : p.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 1) {
                    Text(Fin40Reread.money(c.amount)).font(PF.serif(16, medium: true)).foregroundStyle(p.ink)
                    if c.kind == "sub" {
                        Text(c.yearly ? "per år · " + Fin40Reread.money(c.monthly).replacingOccurrences(of: " kr", with: "") + "/mnd" : "per mnd")
                            .font(PF.ui(11)).foregroundStyle(p.mut)
                    }
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .overlay(alignment: .top) { if !first { Rectangle().fill(p.line).frame(height: 1) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var soon: Bool { (c.daysLeft ?? 99) <= 7 && (c.daysLeft ?? -1) >= 0 }

    private var subline: String {
        if let n = c.next, let d = c.daysLeft {
            let rel: String = d == 0 ? "i dag" : (d == 1 ? "i morgen" : "om \(d) dager")
            return "Neste trekk " + Fin40Card.day(n) + " · " + rel
        }
        return c.note
    }

    private var logo: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous).fill(p.card)
            Text(String(c.name.prefix(1)).uppercased()).font(PF.ui(13, .heavy)).foregroundStyle(p.ink)
            if let u = c.logoURL {
                AsyncImage(url: u) { (img: Image) in img.resizable().scaledToFit().padding(6) } placeholder: { Color.clear }
            }
        }
        .frame(width: 36, height: 36)
    }

    private func open() {
        Haptic30.light()
        if let id = c.txId { store.openPaperTx(id); return }
        if c.kind == "sub" { store.paperGo("abo") }
    }
}
