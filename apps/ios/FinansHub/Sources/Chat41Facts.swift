import SwiftUI

// Prompt 41: «Glimt henter fakta». /api/chat/send legger meta.facts i svaret (vær, tid, sol per deloppgave, se
// server/chat-tools41.js). Her vises de som små kort under Glimt-svaret i Papir-stil:
//   VÆR · NEW YORK · NESTE TIME
//   vind 6 m/s, kast 9 m/s
//   Open-Meteo

/// Ett faktum fra serveren.
struct ChatFact41: Hashable, Identifiable {
    var id: String = UUID().uuidString
    var tool: String = ""
    var place: String = ""
    var whenLabel: String = ""
    var label: String = ""
    var source: String = ""
    var failed: Bool = false

    /// «Vær · New York · neste time» (uten tid når hentingen feilet).
    var headLine: String {
        let name: String = tool == "weather" ? "Vær" : tool == "time" ? "Tid" : tool == "sun" ? "Sol" : tool
        return [name, place, failed ? "" : whenLabel].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    static func parse41(_ list: [[String: Any]]) -> [ChatFact41] {
        list.compactMap { (o: [String: Any]) -> ChatFact41? in
            guard let label = JS.str(o, "label") else { return nil }
            var f = ChatFact41()
            f.tool = JS.str(o, "tool") ?? ""
            f.place = JS.str(o, "place") ?? ""
            f.whenLabel = JS.str(o, "when") ?? ""
            f.label = label
            f.source = JS.str(o, "source") ?? ""
            f.failed = JS.str(o, "error") != nil
            return f
        }
    }

    /// «Brukte …»-pillene uten dem kortene allerede viser.
    static func usedWithout41(_ used: [String], _ facts: [ChatFact41]) -> [String] {
        if facts.isEmpty { return used }
        return used.filter { !($0.hasPrefix("Vær · ") || $0.hasPrefix("Tid · ") || $0.hasPrefix("Sol · ")) }
    }
}

struct Chat41FactsView: View {
    let facts: [ChatFact41]
    let c: ChatPal27

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(facts) { (f: ChatFact41) in
                VStack(alignment: .leading, spacing: 2) {
                    Text(f.headLine.uppercased())
                        .font(PF.mono(10, bold: true)).tracking(1)
                        .foregroundStyle(c.acc).lineLimit(1)
                    Text(f.label)
                        .font(c.ui(14, f.failed ? .regular : .semibold))
                        .foregroundStyle(f.failed ? c.mut : c.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if !f.source.isEmpty {
                        Text(f.source).font(PF.mono(10, bold: false)).foregroundStyle(c.mut)
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 9)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(c.card))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(c.line, style: StrokeStyle(lineWidth: 1, dash: f.failed ? [4, 3] : [])))
                .accessibilityElement(children: .combine)
            }
        }
    }
}
