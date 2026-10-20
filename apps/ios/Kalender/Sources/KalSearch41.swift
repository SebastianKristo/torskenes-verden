import SwiftUI

/* ---------------- Prompt 41: Kalender – søk med Glimt (Ollama på hjemmeserveren) ---------------- */
// Fasit: Kalender App.dc.html → calAi / sAi. «✦ Glimt» i søkefeltet (rød når aktiv), Enter på en setning med mellomrom.
// POST /api/kalender/glimt/search {q, today, events:[kompakt liste]} → {text, events:[…]} (Ollama, modell fra «✦ Auto»).
// Reserve: POST /api/calendar/ask. Tidsgrense 20 s → lokal nøkkelordsøk merket «UTEN AI». Kalenderdata sendes aldri til
// skymodeller herfra – bare til egen server.

struct KalAiHit41: Identifiable, Hashable {
    let id: String
    let ev: KalEvent
}

@MainActor
@Observable
final class KalSearch41 {
    static let shared: KalSearch41 = KalSearch41()

    var on: Bool = false
    var busy: Bool = false
    var answer: String = ""
    var hits: [KalAiHit41] = []
    var local: Bool = false
    @ObservationIgnored private var seq: Int = 0

    func reset() {
        seq += 1
        on = false
        busy = false
        answer = ""
        hits = []
        local = false
    }

    /// Knappen: med tekst → AI-søk, uten → eksempel.
    func go(_ q: String) {
        KalHaptic.tap()
        let text: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty {
            on = true
            busy = false
            local = false
            hits = []
            answer = "Skriv et spørsmål, f.eks. «hva skjer i helgen?» eller «når har jeg fri neste uke?»"
            return
        }
        ask(text)
    }

    /// Enter: bare setninger (med mellomrom) går til Glimt; ett ord er vanlig søk.
    func submit(_ q: String) {
        let text: String = q.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.contains(" ") { ask(text) }
    }

    nonisolated static func line(_ e: KalEvent, calName: String) -> String {
        let d: Date = KalD.date(e.day)
        let time: String = e.allDay ? "hele dagen" : KalD.hm(e.startMin) + "–" + KalD.hm(e.endMin)
        var s: String = e.id + " | " + e.day + " (" + KalD.weekdaysShort[KalD.wd(d)] + ") | " + time + " | " + e.title
        if !e.loc.isEmpty { s += " | " + e.loc }
        return s + " | " + calName
    }

    private func ask(_ q: String) {
        seq += 1
        let id: Int = seq
        on = true
        busy = true
        answer = ""
        hits = []
        local = false
        let store: KalStore = KalStore.shared
        let tk: String = KalD.todayKey()
        let from: String = KalD.addKey(tk, -60)
        let to: String = KalD.addKey(tk, 180)
        var list: [KalEvent] = store.all.filter { (e: KalEvent) -> Bool in !e.cont && e.day >= from && e.day <= to }
        list.sort { (a: KalEvent, b: KalEvent) -> Bool in a.day != b.day ? a.day < b.day : (a.s ?? -1) < (b.s ?? -1) }
        let compact: [KalEvent] = Array(list.prefix(220))
        let lines: [String] = compact.map { (e: KalEvent) -> String in KalSearch41.line(e, calName: store.cal(e.cal)?.name ?? "") }
        Task {
            let res: (String, [String])? = await withTaskGroup(of: (String, [String])?.self) { (g: inout TaskGroup<(String, [String])?>) -> (String, [String])? in
                g.addTask { await KalSearch41.remote(q, lines: lines, today: tk) }
                g.addTask {
                    try? await Task.sleep(nanoseconds: 20_000_000_000)
                    return nil
                }
                let first: (String, [String])? = await g.next() ?? nil
                g.cancelAll()
                return first
            }
            if id != seq { return }
            busy = false
            if let res, !res.0.isEmpty || !res.1.isEmpty {
                answer = res.0.isEmpty ? "Fant " + String(res.1.count) + " hendelser." : res.0
                hits = resolve(res.1, in: list)
                local = false
            } else {
                let r: (String, [KalEvent]) = KalSearch41.localSearch(q, list: list, today: tk)
                answer = r.0
                hits = r.1.map { (e: KalEvent) -> KalAiHit41 in KalAiHit41(id: e.id, ev: e) }
                local = true
            }
        }
    }

    private func resolve(_ ids: [String], in list: [KalEvent]) -> [KalAiHit41] {
        var out: [KalAiHit41] = []
        for i in ids {
            guard let e = list.first(where: { (x: KalEvent) -> Bool in x.id == i }) ?? KalStore.shared.event(i) else { continue }
            if out.contains(where: { (h: KalAiHit41) -> Bool in h.id == e.id }) { continue }
            out.append(KalAiHit41(id: e.id, ev: e))
            if out.count >= 6 { break }
        }
        return out
    }

    /// Serveren (Ollama). nil = ikke tilgjengelig.
    nonisolated static func remote(_ q: String, lines: [String], today: String) async -> (String, [String])? {
        let body: [String: Any] = ["q": q, "today": today, "events": lines, "engine": "auto", "local": true]
        var data: Data? = try? await KalNet.send("POST", "/api/kalender/glimt/search", json: body, timeout: 20)
        if data == nil { data = try? await KalNet.send("POST", "/api/calendar/ask", json: body, timeout: 20) }
        guard let data, let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        let text: String = ((o["text"] as? String) ?? (o["answer"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        var ids: [String] = []
        if let evs = o["events"] as? [[String: Any]] {
            for e in evs {
                if let i = e["id"] as? String { ids.append(i) } else if let i = e["id"] as? Int { ids.append(String(i)) }
            }
        }
        if let a = o["ids"] as? [String] { ids.append(contentsOf: a) }
        if let a = o["events"] as? [String] { ids.append(contentsOf: a) }
        return (text, ids)
    }

    /// Lokal reserve: nøkkelord i tittel og sted, fra i dag og fremover.
    nonisolated static func localSearch(_ q: String, list: [KalEvent], today: String) -> (String, [KalEvent]) {
        let stop: Set<String> = ["når", "hva", "har", "jeg", "neste", "skjer", "den", "det", "som", "med", "for", "var", "sist", "hvilke", "hvor", "min", "mine"]
        let words: [String] = q.lowercased().split(whereSeparator: { (c: Character) -> Bool in !(c.isLetter || c.isNumber) })
            .map { (s: Substring) -> String in String(s) }
            .filter { (w: String) -> Bool in w.count > 2 && !stop.contains(w) }
        let hit: [KalEvent] = list.filter { (e: KalEvent) -> Bool in
            if e.day < today { return false }
            let hay: String = (e.title + " " + e.loc).lowercased()
            return words.contains { (w: String) -> Bool in hay.contains(w) }
        }
        if hit.isEmpty { return ("Fant ingen hendelser som passer.", []) }
        return ("Fant " + String(hit.count) + " hendelser som passer. Første er " + hit[0].title + ".", Array(hit.prefix(6)))
    }
}

/// Svarkortet øverst: «GLIMT · OLLAMA» (eller «UTEN AI»), svaret og opptil 6 treff.
struct KalAiCard41: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalSearch41 { KalSearch41.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("✦").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.white)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(t.red))
                Text("GLIMT · " + (m.local ? "UTEN AI" : "OLLAMA")).font(KalFont.mono(10)).tracking(1.4).foregroundStyle(t.red)
            }
            if m.busy {
                Text("Leser kalenderen din med Ollama …").font(KalFont.ui(14)).foregroundStyle(t.mut)
            } else {
                Text(m.answer).font(KalFont.ui(14.5)).foregroundStyle(t.ink).fixedSize(horizontal: false, vertical: true)
                VStack(spacing: 0) {
                    ForEach(m.hits) { (h: KalAiHit41) in
                        KalAiRow41(e: h.ev)
                    }
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(t.red, lineWidth: 1.5))
    }
}

struct KalAiRow41: View {
    @Environment(\.kal) private var t
    let e: KalEvent

    var body: some View {
        let s: KalStore = KalStore.shared
        let c: KalCal? = KalFag37.tint(s.cal(e.cal), e)
        let d: Date = KalD.date(e.day)
        let when: String = KalD.cap(KalD.weekdays[KalD.wd(d)]) + " " + String(KalD.dayOfMonth(d)) + ". " + KalD.months[KalD.month(d) - 1]
            + (e.allDay ? " · hele dagen" : " · " + KalD.hm(e.startMin))
        Button(action: { s.openDetail(e) }) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 2).fill(t.calColor(c)).frame(width: 4)
                VStack(alignment: .leading, spacing: 0) {
                    KalBdText41.title(e, calName: c?.name ?? "").font(KalFont.ui(14, .bold)).foregroundStyle(t.ink).lineLimit(1)
                    Text(when).font(KalFont.ui(12)).foregroundStyle(t.mut)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 8)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
        }
        .buttonStyle(.plain)
    }
}
