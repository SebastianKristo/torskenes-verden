import SwiftUI
import os

/* ---------------- Prompt 42: Gjøremål-Glimt deler fortsatt ikke opp beskjeden ---------------- */
// claude-code-huskeliste-glimt-del-opp.md. Serveren (SERVER42) gir alltid en liste {tasks:[…]} og erstatter den midlertidige
// oppgaven. Appen:
// – Lokal forhåndsdeling (før AI-en svarer, og hvis AI-en feiler): punktum/linjeskift/«og så»/«og husk», og gjentatt stedsnavn
//   («… Strømstad Strømstad må …» = grense). Fjerner «husk å», «må huske å», «de må», «jeg må» i starten og doble ord («ha ha»).
//   Begrunnelser («siden vi skal …») blir notat, steder blir place, «før vi drar til X» blir frist-tekst.
// – Lengdevakt: et punkt med tittel over 60 tegn, eller flere verb-fraser, regnes som mislykket oppdeling. Da erstattes det med
//   den lokale oppdelingen (når den gir flere punkter).
// – Én Angre som slår sammen igjen: punktene fra beskjeden slettes, og én oppgave med originalteksten opprettes.
// – Logg per beskjed: input_len, model, tasks_count, parse_ok, path (local|ai).

enum Tasks42Split {
    static let maxTitle: Int = 60
    private static let log: Logger = Logger(subsystem: "no.kristo.finanshub", category: "tasks42")

    /// Lokal oppdeling i rekkefølge.
    static func items(_ text: String) -> [Task40Item] {
        let clean: String = dedupe(text)
        var out: [Task40Item] = []
        for part in boundaries(clean) {
            if let it = item(part) { out.append(it) }
        }
        if out.isEmpty { out = [Task40Item(title: cap(Task40Split.title(text)))] }
        for i in out.indices { out[i].step = i + 1; if i > 0 { out[i].after = out[i - 1].title } }
        return out
    }

    /// «ha ha» → «ha». Gjentatt stedsnavn med stor forbokstav («Strømstad Strømstad») beholdes som grense («Strømstad | Strømstad»).
    static func dedupe(_ text: String) -> String {
        let words: [String] = text.split(separator: " ").map(String.init)
        var out: [String] = []
        for w in words {
            if let last = out.last, last.lowercased() == w.lowercased() {
                if let f = w.first, f.isUppercase { out.append("|"); out.append(w) }
                continue
            }
            out.append(w)
        }
        return out.joined(separator: " ")
    }

    /// Deler på punktum, linjeskift, «|» (gjentatt sted), «og så», «og husk», «husk også».
    static func boundaries(_ text: String) -> [String] {
        var t: String = text
        for k in [" og så ", " og husk ", " husk også ", " og deretter ", " deretter "] {
            t = t.replacingOccurrences(of: k, with: " | ", options: .caseInsensitive)
        }
        return t.split(whereSeparator: { $0 == "." || $0 == "!" || $0 == "?" || $0 == "\n" || $0 == "|" })
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    /// Ett punkt: sted først («Strømstad må huske å …»), «før vi drar til X» som frist-tekst, «siden …» som notat.
    static func item(_ s0: String) -> Task40Item? {
        var s: String = s0
        var place: String = ""
        // «Strømstad må huske å ta med …»: stedsnavnet før «må/skal».
        let ws: [String] = s.split(separator: " ").map(String.init)
        if ws.count > 2, let f = ws[0].first, f.isUppercase, ["må", "skal"].contains(ws[1].lowercased()) {
            place = ws[0]
            s = ws.dropFirst().joined(separator: " ")
        }
        var note: String = ""
        for k in [" siden ", " fordi "] {
            if let r = s.range(of: k, options: .caseInsensitive) {
                note = String(s[r.upperBound...]).trimmingCharacters(in: CharacterSet(charactersIn: " .!,"))
                s = String(s[..<r.lowerBound])
                break
            }
        }
        var due: String = ""
        for k in [" før vi drar til ", " før vi reiser til ", " før vi skal til ", " før vi skal ", " før jeg drar til "] {
            if let r = s.range(of: k, options: .caseInsensitive) {
                let dest: String = String(s[r.upperBound...]).trimmingCharacters(in: CharacterSet(charactersIn: " .!,"))
                due = dest.isEmpty ? "før turen" : "før " + dest + "-turen"
                s = String(s[..<r.lowerBound])
                break
            }
        }
        // Fyllord i starten.
        let lead: [String] = ["må huske å ", "må huske ", "husk å ", "huske å ", "de må ", "jeg må ", "vi må ", "må ", "å "]
        var changed: Bool = true
        while changed {
            changed = false
            for l in lead where s.lowercased().hasPrefix(l) { s = String(s.dropFirst(l.count)); changed = true }
        }
        var title: String = Task40Split.title(s)
        if !place.isEmpty && !title.lowercased().contains(place.lowercased()) { title += " fra " + place }
        title = cap(title)
        if title.isEmpty { return nil }
        var it: Task40Item = Task40Item(title: title)
        it.place = place
        if !note.isEmpty { it.note = note.prefix(1).uppercased() + String(note.dropFirst()) }
        if !due.isEmpty { it.note = it.note.isEmpty ? "Frist: " + due : it.note + " · frist: " + due }
        return it
    }

    /// Maks 60 tegn, kuttet ved et ord.
    static func cap(_ t: String) -> String {
        let s: String = t.trimmingCharacters(in: .whitespaces)
        if s.count <= maxTitle { return s.prefix(1).uppercased() + String(s.dropFirst()) }
        var out: String = ""
        for w in s.split(separator: " ") {
            if out.count + w.count + 1 > maxTitle { break }
            out += (out.isEmpty ? "" : " ") + w
        }
        return out.prefix(1).uppercased() + String(out.dropFirst())
    }

    /// Lengdevakt: tittel over 60 tegn eller flere verb-fraser («ta med … må … ta med …»).
    static func looksUnsplit(_ title: String) -> Bool {
        if title.count > maxTitle { return true }
        let low: String = " " + title.lowercased() + " "
        let verbs: [String] = [" ta med ", " hent ", " send ", " kjøp ", " ring ", " husk ", " må "]
        let hits: Int = verbs.reduce(0) { (n: Int, v: String) -> Int in n + low.components(separatedBy: v).count - 1 }
        return hits >= 2
    }

    static func logLine(inputLen: Int, model: String, count: Int, parseOk: Bool, path: String) {
        log.notice("tasks42 input_len=\(inputLen) model=\(model, privacy: .public) tasks_count=\(count) parse_ok=\(parseOk) path=\(path, privacy: .public)")
    }
}

extension Tasks41Glimt {
    /// Punktene som ble laget fra beskjeden (origin.text), i listerekkefølge.
    @MainActor func items42(_ text: String) -> [TaskItem17] {
        TasksModel.shared.items.filter { $0.origin41?.text == text }
    }

    /// Lengdevakt etter AI-svaret: ett punkt med for lang tittel → erstatt med den lokale oppdelingen. Returnerer antall punkter.
    @MainActor func guard42(_ text: String, _ store: Store) async -> Int {
        let made: [TaskItem17] = items42(text)
        guard made.count == 1, let one = made.first, Tasks42Split.looksUnsplit(one.title) else {
            Tasks42Split.logLine(inputLen: text.count, model: made.first?.origin41?.engine ?? "", count: made.count, parseOk: !made.isEmpty, path: "ai")
            return made.count
        }
        let local: [Task40Item] = Tasks42Split.items(text)
        guard local.count >= 2 else {
            Tasks42Split.logLine(inputLen: text.count, model: one.origin41?.engine ?? "", count: 1, parseOk: false, path: "ai")
            return 1
        }
        // Erstatt: behold den første (ny tittel), opprett resten.
        let id: String = one.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? one.id
        var first: [String: Any] = ["title": local[0].title]
        if !local[0].note.isEmpty { first["note"] = local[0].note }
        if !local[0].place.isEmpty { first["place"] = local[0].place }
        _ = try? await store.api.callAt("/api", "PATCH", "/tasks/\(id)", json: first)
        let origin: [String: Any] = ["text": text, "at": ISO8601DateFormatter().string(from: Date()), "engine": "lokal"]
        for it in local.dropFirst() {
            var body: [String: Any] = ["title": it.title, "list": one.list, "origin": origin]
            if !it.place.isEmpty { body["place"] = it.place }
            if !it.note.isEmpty { body["note"] = it.note }
            _ = try? await store.api.callAt("/api", "POST", "/tasks", json: body)
        }
        await TasksModel.shared.load(store)
        Tasks42Split.logLine(inputLen: text.count, model: "lokal", count: local.count, parseOk: true, path: "local")
        return local.count
    }

    /// Angre: slår sammen igjen til én oppgave med originalteksten (én handling tilbakestiller alt).
    @MainActor func undo42(_ text: String, _ store: Store) {
        let made: [TaskItem17] = items42(text)
        guard !made.isEmpty else { return }
        Haptics.shared.tap()
        let list: String = made.first?.list ?? (TasksModel.shared.lists.first?.id ?? "hjem")
        dismissBanner()
        Task { @MainActor in
            for t in made { TasksModel.shared.delete(t, store) }
            let body: [String: Any] = ["title": Tasks42Split.cap(text), "note": text, "list": list]
            _ = try? await store.api.callAt("/api", "POST", "/tasks", json: body)
            await TasksModel.shared.load(store)
            store.flash("Slått sammen til én oppgave")
        }
    }
}
