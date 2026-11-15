import Foundation

/* ---------------- Prompt 41: søk med Glimt (Ollama) – delt logikk for Mac (og tilgjengelig for iOS) ---------------- */
// POST /api/kalender/glimt/search {q, today, events:[kompakt liste]} → {text, events:[{id}]} (reserve /api/calendar/ask).
// Lokal reserve: nøkkelord i tittel og sted fra i dag og fremover, merket «UTEN AI».

enum KalAi41 {
    static func line(_ e: KalEvent, calName: String) -> String {
        let d: Date = KalD.date(e.day)
        let time: String = e.allDay ? "hele dagen" : KalD.hm(e.startMin) + "–" + KalD.hm(e.endMin)
        var s: String = e.id + " | " + e.day + " (" + KalD.weekdaysShort[KalD.wd(d)] + ") | " + time + " | " + e.title
        if !e.loc.isEmpty { s += " | " + e.loc }
        return s + " | " + calName
    }

    /// Hendelsene som sendes med (60 dager bak, 180 frem, maks 220).
    static func window(_ all: [KalEvent]) -> [KalEvent] {
        let tk: String = KalD.todayKey()
        let from: String = KalD.addKey(tk, -60)
        let to: String = KalD.addKey(tk, 180)
        var list: [KalEvent] = all.filter { (e: KalEvent) -> Bool in !e.cont && e.day >= from && e.day <= to }
        list.sort { (a: KalEvent, b: KalEvent) -> Bool in a.day != b.day ? a.day < b.day : (a.s ?? -1) < (b.s ?? -1) }
        return Array(list.prefix(220))
    }

    /// Serveren (Ollama). nil = ikke tilgjengelig.
    static func remote(_ q: String, lines: [String], today: String) async -> (String, [String])? {
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

    /// Med tidsgrense (20 s). nil = tidsavbrudd eller ingen server.
    static func remoteTimed(_ q: String, lines: [String], today: String) async -> (String, [String])? {
        await withTaskGroup(of: (String, [String])?.self) { (g: inout TaskGroup<(String, [String])?>) -> (String, [String])? in
            g.addTask { await KalAi41.remote(q, lines: lines, today: today) }
            g.addTask {
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                return nil
            }
            let first: (String, [String])? = await g.next() ?? nil
            g.cancelAll()
            return first
        }
    }

    static func localSearch(_ q: String, list: [KalEvent]) -> (String, [KalEvent]) {
        let today: String = KalD.todayKey()
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
