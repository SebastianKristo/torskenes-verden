import SwiftUI

/* ---------------- Prompt 27: Finans → Søk, forslag mens du skriver (Google-stil) ---------------- */
// Fasit: Finans → Søk i design/Mobil Papir App.dc.html og prompts/prompt-27-pakke/claude-code-finans-sokeforslag.md.
// GET /finans/api/forslag?q=&limit=6 → [{type:'butikk'|'kategori'|'vare', navn, antall, sum (øre), ikon, farge, logoUrl?}].
// Debounce 120 ms, forrige forespørsel avbrytes. Ingen forslag når ✦ AI er på, feltet er tomt, eller etter at et forslag
// er valgt / Enter er trykket (til brukeren skriver igjen).

struct FinSug27: Identifiable, Hashable {
    let id: String
    let type: String
    let name: String
    let count: Int
    /// Øre, negativ for utgift.
    let sum: Double
    let icon: String
    let color: String
    let logoUrl: String?

    init(_ o: [String: Any], _ i: Int) {
        type = JS.str(o, "type") ?? "butikk"
        name = JS.str(o, "navn") ?? JS.str(o, "name") ?? ""
        count = JS.int(o, "antall") ?? JS.int(o, "count") ?? 0
        sum = JS.num(o, "sum") ?? 0
        let ini: String = JS.str(o, "ikon") ?? ""
        icon = ini.isEmpty ? String(name.prefix(2)).uppercased() : ini
        color = JS.str(o, "farge") ?? JS.str(o, "color") ?? "#7a7468"
        logoUrl = JS.str(o, "logoUrl")
        id = "\(i)-\(type)-\(name)"
    }

    var typeName: String {
        switch type {
        case "kategori": return "Kategori"
        case "vare": return "Vare"
        default: return "Butikk"
        }
    }

    /// «Butikk · 2 kjøp · −618 kr».
    var sub: String {
        let kr: Double = sum / 100
        let buys: String = count == 1 ? "1 kjøp" : "\(count) kjøp"
        return "\(typeName) · \(buys) · \(neg0(kr)) kr"
    }
}

@MainActor
@Observable
final class FinSuggest27Model {
    static let shared = FinSuggest27Model()

    var items: [FinSug27] = []
    /// Teksten forslagene gjelder (for fet/normal vekt).
    var forQuery: String = ""
    /// true etter valg / Enter: ingen forslag før brukeren skriver igjen.
    var suppressed: Bool = false
    @ObservationIgnored private var task: Task<Void, Never>? = nil
    @ObservationIgnored private var seq: Int = 0

    /// Kalles ved hvert tastetrykk.
    func update(_ q: String, aiOn: Bool, _ store: Store) {
        task?.cancel()
        seq += 1
        let t: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if aiOn || t.isEmpty || suppressed {
            items = []
            return
        }
        let my: Int = seq
        task = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(120))
            if Task.isCancelled || my != self.seq { return }
            let enc: String = t.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? t
            guard let d = try? await store.api.call("GET", "/forslag?q=\(enc)&limit=6") else {
                if my == self.seq { self.items = [] }
                return
            }
            if Task.isCancelled || my != self.seq { return }
            let raw: [Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [Any]) ?? JS.list(JS.obj(d), "items")
            let dicts: [[String: Any]] = raw.compactMap { $0 as? [String: Any] }
            self.items = dicts.enumerated().map { FinSug27($0.element, $0.offset) }.filter { !$0.name.isEmpty }
            self.forQuery = t
        }
    }

    /// Lukk forslagene og avbryt det som venter (✕, valg, Enter, ✦ AI).
    func close(suppress: Bool) {
        task?.cancel()
        seq += 1
        items = []
        suppressed = suppress
    }
}

/// Listen under søkefeltet: ikon, navn (skrevet del normal vekt, resten fet), undertekst og ↖.
struct FinSuggestList27: View {
    @Environment(\.paper) private var p
    let items: [FinSug27]
    let typed: String
    let pick: (FinSug27) -> Void
    let fill: (FinSug27) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(items) { s in row(s) }
        }
        .padding(6)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: Color.black.opacity(0.18), radius: 18, y: 12)
    }

    private func row(_ s: FinSug27) -> some View {
        HStack(spacing: 12) {
            Button { pick(s) } label: {
                HStack(spacing: 12) {
                    FinSugIcon27(s: s)
                    VStack(alignment: .leading, spacing: 1) {
                        title(s.name).lineLimit(1)
                        Text(s.sub).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.leading, 10)
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button { fill(s) } label: {
                Text("↖").font(.system(size: 17)).foregroundStyle(p.mut).frame(width: 44, height: 44).contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Fyll inn i søket")
        }
        .padding(.vertical, 4).padding(.trailing, 4)
    }

    /// Skrevet del i vanlig vekt, resten fet.
    private func title(_ name: String) -> Text {
        let bold: Font = PF.ui(15, .bold)
        let normal: Font = PF.ui(15)
        let q: String = typed.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty, let r = name.range(of: q, options: [.caseInsensitive, .diacriticInsensitive]) else {
            return Text(name).font(bold).foregroundColor(p.ink)
        }
        let pre: String = String(name[name.startIndex..<r.lowerBound])
        let mid: String = String(name[r])
        let post: String = String(name[r.upperBound..<name.endIndex])
        return Text(pre).font(bold).foregroundColor(p.ink) + Text(mid).font(normal).foregroundColor(p.ink) + Text(post).font(bold).foregroundColor(p.ink)
    }
}

/// 34 × 34: merkefarge + initialer, eller logoen når serveren har en.
struct FinSugIcon27: View {
    let s: FinSug27

    var body: some View {
        if let u = s.logoUrl, !u.isEmpty {
            Logo(domain: nil, name: s.name, color: s.color, size: 34, logoUrl: u)
        } else {
            Text(s.icon).font(PF.ui(11, .heavy)).foregroundStyle(Color.white).lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 34, height: 34)
                .background(Color(hex: s.color), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }
}
