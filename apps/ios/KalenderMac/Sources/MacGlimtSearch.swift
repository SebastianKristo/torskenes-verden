import SwiftUI
import AppKit

/* ---------------- Prompt 41: Kalender for Mac – søk med Glimt (Ollama), logikken i SharedKal/Core/KalGlimtSearchCore.swift ---------------- */

struct MacAiHit41: Identifiable, Hashable {
    let id: String
    let ev: KalEvent
}

@MainActor
@Observable
final class MacAi41 {
    var on: Bool = false
    var busy: Bool = false
    var answer: String = ""
    var hits: [MacAiHit41] = []
    var local: Bool = false
    @ObservationIgnored private var seq: Int = 0

    func go(_ q: String) {
        let text: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty {
            on = true
            busy = false
            local = false
            hits = []
            answer = "Skriv et spørsmål, f.eks. «hva skjer i helgen?» eller «når har jeg fri neste uke?»"
            return
        }
        seq += 1
        let id: Int = seq
        on = true
        busy = true
        answer = ""
        hits = []
        local = false
        let store: MacStore = MacStore.shared
        let list: [KalEvent] = KalAi41.window(store.all)
        let lines: [String] = list.map { (e: KalEvent) -> String in KalAi41.line(e, calName: store.cal(e.cal)?.name ?? "") }
        let tk: String = KalD.todayKey()
        Task {
            let res: (String, [String])? = await KalAi41.remoteTimed(text, lines: lines, today: tk)
            if id != self.seq { return }
            self.busy = false
            if let res, !res.0.isEmpty || !res.1.isEmpty {
                self.answer = res.0.isEmpty ? "Fant " + String(res.1.count) + " hendelser." : res.0
                var out: [MacAiHit41] = []
                for i in res.1 {
                    guard let e = list.first(where: { (x: KalEvent) -> Bool in x.id == i }) ?? store.event(i) else { continue }
                    if out.contains(where: { (h: MacAiHit41) -> Bool in h.id == e.id }) { continue }
                    out.append(MacAiHit41(id: e.id, ev: e))
                    if out.count >= 6 { break }
                }
                self.hits = out
                self.local = false
            } else {
                let r: (String, [KalEvent]) = KalAi41.localSearch(text, list: list)
                self.answer = r.0
                self.hits = r.1.map { (e: KalEvent) -> MacAiHit41 in MacAiHit41(id: e.id, ev: e) }
                self.local = true
            }
        }
    }
}

struct MacAiCard41: View {
    @Environment(\.mk) private var t
    @Bindable var ai: MacAi41
    let open: (KalEvent) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("✦").font(.system(size: 10, weight: .bold)).foregroundColor(Color.white)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(Color(kalHex: "#b23a2a")))
                MacLabel(text: "GLIMT · " + (ai.local ? "UTEN AI" : "OLLAMA"), color: Color(kalHex: "#b23a2a"))
            }
            if ai.busy {
                Text("Leser kalenderen din med Ollama …").font(MacFont.ui(14)).foregroundColor(t.mut)
            } else {
                Text(ai.answer).font(MacFont.ui(14)).foregroundColor(t.ink).textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(spacing: 2) {
                    ForEach(ai.hits) { (h: MacAiHit41) in
                        MacSearchRow(e: h.ev) { open(h.ev) }
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Color(kalHex: "#b23a2a"), lineWidth: 1.5))
    }
}
