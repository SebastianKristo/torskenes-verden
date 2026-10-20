import SwiftUI
import Foundation

/* ---------------- Prompt 40: Gjøremål – Glimt forstår setninger og lager riktige punkter ----------------
   prompts/prompt-40-pakke/claude-code-huskeliste-glimt-forstar.md, fasit design/Huskeliste.dc.html (gIsMulti, gLocal, gCtx).
   Serveren (POST /api/tasks/glimt) deler opp med LLM + lokal regel og svarer items[{n, list, who:{userId|profileId, name}, date,
   time, place, after, tags}]. Appen viser hvert punkt på to linjer: tittel, og under: steg (1 · først / 2 · etter «…»), liste,
   dato/tid, sted og @person.
   Lokal reserve (eldre server): samme regler som gLocal – del opp på «men først», «først», «før det» (= før) og «deretter»,
   «etterpå», «og så», «til slutt» (= etter), fjern «jeg må (huske å)», gjør infinitiv om til imperativ, sted fra
   «til/i/på/hos/ved/fra + Stort ord», felles tagg for samme tur.
   «Ny oppgave …»-feltet sender setninger med flere handlinger til Glimt i stedet for å lage ett langt punkt. */

struct Task40Item: Hashable {
    var title: String
    var list: String = ""
    var date: String = ""
    var time: String = ""
    var place: String = ""
    var who: String = ""
    var after: String = ""
    var tags: [String] = []
    var step: Int = 0

    static func parse(_ o: [String: Any], _ i: Int) -> Task40Item? {
        let n: String = JS.str(o, "n") ?? JS.str(o, "title") ?? JS.str(o, "text") ?? ""
        if n.isEmpty { return nil }
        var it: Task40Item = Task40Item(title: n)
        it.list = JS.str(o, "listName") ?? JS.str(o, "list") ?? JS.str(o, "l") ?? ""
        it.date = JS.str(o, "date") ?? JS.str(o, "due") ?? ""
        it.time = JS.str(o, "time") ?? ""
        it.place = JS.str(o, "place") ?? ""
        if let w = o["who"] as? [String: Any] { it.who = JS.str(w, "name") ?? "" } else { it.who = JS.str(o, "who") ?? "" }
        it.after = JS.str(o, "afterTitle") ?? JS.str(o, "after") ?? ""
        it.tags = JS.strings(o, "tags")
        it.step = i + 1
        return it
    }
}

enum Task40Split {
    static let before: [String] = ["men aller først", "men først", "aller først", "før det", "først"]
    static let afterWords: [String] = ["og deretter", "deretter", "etterpå", "etter det", "og så", "til slutt"]

    /// Flere handlinger i én setning (gIsMulti).
    static func isMulti(_ text: String) -> Bool {
        let low: String = " " + text.lowercased() + " "
        if (before + afterWords).contains(where: { (w: String) -> Bool in low.contains(" " + w + " ") }) { return true }
        let sentences: [String] = text.split(whereSeparator: { $0 == "." || $0 == "!" }).map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        let withMust: Int = sentences.filter { (s: String) -> Bool in
            let l: String = s.lowercased()
            return l.contains(" må ") || l.hasPrefix("må ") || l.contains(" skal ") || l.hasPrefix("husk")
        }.count
        return withMust >= 2 || (sentences.count >= 2 && text.count > 30)
    }

    /// Lokal tolkning (gLocal). Returnerer punktene i riktig rekkefølge.
    static func split(_ text: String) -> [Task40Item] {
        var parts: [(String, Int)] = [] // (tekst, rekkefølge: −1 før, 0 vanlig, 1 etter)
        let sentences: [String] = text.split(whereSeparator: { $0 == "." || $0 == "!" || $0 == "\n" })
            .map { String($0).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        for s in sentences {
            var rest: String = s
            var found: Bool = true
            while found {
                found = false
                let low: String = rest.lowercased()
                for w in before {
                    if let r = low.range(of: " " + w + " ") {
                        let a: String = String(rest[rest.startIndex..<rest.index(rest.startIndex, offsetBy: low.distance(from: low.startIndex, to: r.lowerBound))])
                        let b: String = String(rest[rest.index(rest.startIndex, offsetBy: low.distance(from: low.startIndex, to: r.upperBound))...])
                        parts.append((b, -1))
                        rest = a
                        found = true
                        break
                    }
                }
                if found { continue }
                for w in afterWords {
                    if let r = low.range(of: " " + w + " ") {
                        let a: String = String(rest[rest.startIndex..<rest.index(rest.startIndex, offsetBy: low.distance(from: low.startIndex, to: r.lowerBound))])
                        let b: String = String(rest[rest.index(rest.startIndex, offsetBy: low.distance(from: low.startIndex, to: r.upperBound))...])
                        parts.append((b, 1))
                        rest = a
                        found = true
                        break
                    }
                }
            }
            let low0: String = rest.lowercased()
            if low0.hasPrefix("deretter ") || low0.hasPrefix("etterpå ") || low0.hasPrefix("og så ") {
                parts.append((rest, 1))
            } else {
                parts.append((rest, 0))
            }
        }
        let ordered: [(String, Int)] = parts.filter { $0.1 < 0 } + parts.filter { $0.1 == 0 } + parts.filter { $0.1 > 0 }
        var items: [Task40Item] = ordered.compactMap { (p: (String, Int)) -> Task40Item? in
            let t: String = title(p.0)
            if t.isEmpty { return nil }
            var it: Task40Item = Task40Item(title: t)
            it.place = place(p.0)
            return it
        }
        // Felles tagg for samme tur (stedet), og «pakke» → #pakke.
        let trip: String = items.first(where: { !$0.place.isEmpty })?.place ?? ""
        for i in items.indices {
            var tags: [String] = []
            let ws: [String] = items[i].title.lowercased().split(separator: " ").map(String.init)
            if ws.contains("pakke") || ws.contains("pakken") { tags.append("pakke") }
            if !trip.isEmpty { tags.append(trip.lowercased()) }
            items[i].tags = tags
            items[i].step = i + 1
            if i > 0 { items[i].after = items[i - 1].title }
        }
        return items
    }

    /// Kort tittel i imperativ uten «jeg må (huske å)».
    static func title(_ s: String) -> String {
        var t: String = s.trimmingCharacters(in: CharacterSet(charactersIn: " ,.;"))
        let lead: [String] = ["jeg må huske å ", "jeg må huske ", "husk å ", "påminn meg om å ", "jeg må ", "må jeg ", "jeg skal ", "så må jeg ",
                              "deretter ", "etterpå ", "og så ", "og ", "men ", "så ", "må ", "å "]
        var changed: Bool = true
        while changed {
            changed = false
            for l in lead where t.lowercased().hasPrefix(l) {
                t = String(t.dropFirst(l.count))
                changed = true
            }
        }
        var words: [String] = t.split(separator: " ").map(String.init)
        if let first = words.first {
            words[0] = imperative(first)
        }
        t = words.joined(separator: " ")
        // møbeler → møbler (vanlig skrivefeil i eksempelet).
        t = t.replacingOccurrences(of: "møbeler", with: "møbler")
        if t.isEmpty { return "" }
        return t.prefix(1).uppercased() + String(t.dropFirst())
    }

    static func imperative(_ w: String) -> String {
        let l: String = w.lowercased()
        let known: [String: String] = ["levere": "lever", "hente": "hent", "ringe": "ring", "kjøpe": "kjøp", "sende": "send", "bestille": "bestill",
                                       "ta": "ta", "gi": "gi", "kjøre": "kjør", "handle": "handle", "vaske": "vask", "betale": "betal",
                                       "rydde": "rydd", "lage": "lag", "skrive": "skriv", "huske": "husk", "pakke": "pakk", "flytte": "flytt"]
        if let k = known[l] { return k }
        if l.hasSuffix("ere") && l.count > 5 { return String(l.dropLast()) }
        return l
    }

    /// «til/i/på/hos/ved/fra + Stort ord» (ikke ukedager).
    static func place(_ s: String) -> String {
        let words: [String] = s.split(separator: " ").map(String.init)
        let preps: Set<String> = ["til", "i", "på", "hos", "ved", "fra"]
        let days: Set<String> = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag", "Jeg", "Meg"]
        var i: Int = 0
        while i < words.count - 1 {
            let nx: String = words[i + 1].trimmingCharacters(in: CharacterSet.punctuationCharacters)
            if preps.contains(words[i].lowercased()), let c = nx.first, c.isUppercase, !days.contains(nx) {
                return nx
            }
            i += 1
        }
        return ""
    }
}

extension Tasks37Glimt {
    /// Prompt 40: punktene fra serveren med steg, liste, dato/tid, sted og person.
    static func rich(_ o: [String: Any]) -> [Task40Item] {
        let raw: [[String: Any]] = JS.list(o, "items")
        var out: [Task40Item] = []
        for (i, x) in raw.enumerated() {
            if let it = Task40Item.parse(x, i) { out.append(it) }
        }
        // after = id → tittelen til punktet før.
        let ids: [String] = raw.map { (x: [String: Any]) -> String in JS.str(x, "id") ?? "" }
        for i in out.indices where !out[i].after.isEmpty {
            if let j = ids.firstIndex(of: out[i].after), j < out.count { out[i].after = out[j].title }
        }
        return out
    }
}

/// Resultatkortet: hvert punkt på to linjer.
struct Task40ItemRow: View {
    @Environment(\.paper) private var p
    let it: Task40Item
    let total: Int

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text("\(it.step)").font(PF.mono(11)).foregroundStyle(p.bg)
                .frame(width: 20, height: 20)
                .background(p.lab, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(it.title).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                Text(meta).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var meta: String {
        var bits: [String] = []
        if total > 1 { bits.append(it.after.isEmpty ? "først" : "etter «" + it.after + "»") }
        if !it.list.isEmpty { bits.append(it.list) }
        let when: String = [it.date, it.time.isEmpty ? "" : "kl. " + it.time].filter { !$0.isEmpty }.joined(separator: " ")
        if !when.isEmpty { bits.append(when) }
        if !it.place.isEmpty { bits.append("📍 " + it.place) }
        if !it.who.isEmpty { bits.append("@" + it.who) }
        if !it.tags.isEmpty { bits.append(it.tags.map { "#" + $0 }.joined(separator: " ")) }
        return bits.joined(separator: " · ")
    }
}
