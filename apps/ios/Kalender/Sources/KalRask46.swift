import SwiftUI

/* ---------------- Prompt 46: rask time i Kalender («Skriv en time») – Glimt tolker, ikke bare regex ---------------- */
// Spesifikasjon: claude-code-kalender-rask-time-glimt.md (+ claude-code-glimt-kalender-standardkalender.md).
// Årsak: feltet nederst brukte bare den lokale tolkeren (KalQuick) og kalte aldri Glimt – tittelen ble hele setningen minus
// dato/tid («Vi skal se på dune på coluseum kino») og stedet ble aldri skilt ut.
// Nå:
//   1. Lokal tolkning med en gang (dato/tid som før) + rydding av tittelen (fyllord ut, «på X kino» / «hos X» blir sted).
//   2. Glimt parallelt, 400 ms etter siste tastetrykk: POST /api/glimt/agent/preview {text, module:'calendar', context}
//      (utfører ingenting, 3 s tidsavbrudd, 404 = bare lokal). Lokal dato/tid vinner når den er entydig; Glimt bestemmer
//      tittel og sted. «✦ Glimt» i forhåndsvisningen når modellen ble brukt, «Glimt tenker …» mens vi venter.
//   3. Enter: POST /api/glimt/agent {text, module:'calendar', requestId, context} (samme motor som Hjem og chat, med
//      standardkalenderen). Svarer den ikke (404/feil/ingen calendar.create), lagres hendelsen lokalt som før – aldri dobbelt:
//      ved tidsavbrudd prøves samme requestId én gang til (serveren svarer da «repeated» uten å lage en ny).

/// Glimts forslag (alle felt valgfrie).
struct KalRaskHit46: Equatable {
    var title: String = ""
    var location: String = ""
    var address: String = ""
    var date: String = ""
    var start: Int? = nil
    var end: Int? = nil
    var allDay: Bool = false
    var calendarId: String = ""
    var engine: String = ""
}

enum KalRask46 {
    /// «vi skal se på dune på coluseum kino» → («Dune», «Coluseum kino»). «tannlege hos Nina» → («Tannlege», «Nina»).
    static func tidy(_ raw: String) -> (title: String, loc: String) {
        var t: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        t = t.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        let lead: String = "^(?:(?:vi|jeg|du|dere|de|han|hun|me|eg)\\s+(?:skal|må|vil|burde|bør)\\s+|(?:skal|må)\\s+)"
        t = t.replacingOccurrences(of: lead, with: "", options: [.regularExpression, .caseInsensitive])
        t = t.replacingOccurrences(of: "^(?:(?:gå\\s+)?(?:og\\s+)?se\\s+på|på|til)\\s+", with: "", options: [.regularExpression, .caseInsensitive])
        var loc: String = ""
        if let m = KalRask46.match("^(.+?)\\s+på\\s+(.+?\\s*kino)$", t) {
            t = m.0
            loc = m.1
        } else if let m = KalRask46.match("^(.+?)\\s+hos\\s+(.+)$", t) {
            t = m.0
            loc = m.1
        }
        t = t.replacingOccurrences(of: "^(?:se\\s+på|se)\\s+", with: "", options: [.regularExpression, .caseInsensitive])
        return (cap(t), cap(loc))
    }

    static func cap(_ s: String) -> String {
        let v: String = s.trimmingCharacters(in: .whitespaces)
        guard let f = v.first else { return v }
        return String(f).uppercased() + v.dropFirst()
    }

    private static func match(_ pattern: String, _ s: String) -> (String, String)? {
        guard let rx = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let ns: NSString = s as NSString
        guard let m = rx.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)), m.numberOfRanges >= 3 else { return nil }
        let a: String = ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces)
        let b: String = ns.substring(with: m.range(at: 2)).trimmingCharacters(in: .whitespaces)
        if a.isEmpty || b.isEmpty { return nil }
        return (a, b)
    }

    static func minutes(_ v: Any?) -> Int? {
        guard let s = v as? String else { return nil }
        let p: [Substring] = s.split(separator: ":")
        guard p.count >= 2, let h = Int(p[0]), let m = Int(p[1].prefix(2)), h >= 0, h < 24, m >= 0, m < 60 else { return nil }
        return h * 60 + m
    }

    /// Svaret fra /preview (rot, event, preview eller actions[0].args).
    static func parseHit(_ d: Data) -> KalRaskHit46? {
        guard let o0 = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return nil }
        var o: [String: Any] = o0
        if let e = o0["event"] as? [String: Any] { o = e } else if let e = o0["preview"] as? [String: Any] { o = e }
        else if let acts = o0["actions"] as? [[String: Any]], let a = acts.first, let args = a["args"] as? [String: Any] { o = args }
        var h: KalRaskHit46 = KalRaskHit46()
        h.title = (o["title"] as? String) ?? ""
        if let l = o["location"] as? String { h.location = l } else if let l = o["location"] as? [String: Any] { h.location = (l["name"] as? String) ?? "" }
        h.address = (o["address"] as? String) ?? ((o["place"] as? [String: Any])?["address"] as? String) ?? ""
        h.date = (o["date"] as? String) ?? ""
        h.start = minutes(o["start"])
        h.end = minutes(o["end"])
        h.allDay = (o["allDay"] as? Bool) ?? false
        h.calendarId = (o["calendarId"] as? String) ?? ((o["calendar"] as? String) ?? "")
        h.engine = (o0["engine"] as? String) ?? ((o["engine"] as? String) ?? "")
        if h.title.isEmpty && h.location.isEmpty { return nil }
        return h
    }

    /// Kontekst til Glimt: dagens dato, tidssone, standardkalender og den lokale tolkningen.
    @MainActor static func context(_ p: KalParsed, text: String) -> [String: Any] {
        var local: [String: Any] = ["date": p.day, "title": p.title]
        if let s = p.s { local["start"] = KalD.hm(s) }
        if let e = p.e { local["end"] = KalD.hm(e) }
        return ["today": KalD.todayKey(), "tz": TimeZone.current.identifier, "defaultCalendarId": KalStore.shared.defCalId46,
                "local": local, "hasTime": KalTime44.hasTime(KalTime44.normalize(text))]
    }
}

@MainActor
@Observable
final class KalRask46Model {
    static let shared: KalRask46Model = KalRask46Model()
    /// Glimt-svaret for teksten (nøkkel = teksten det gjelder).
    var hit: KalRaskHit46? = nil
    var hitFor: String = ""
    var thinking: Bool = false
    /// Serveren har ikke /preview (404) – spør ikke igjen før appen starter på nytt.
    @ObservationIgnored var noPreview: Bool = false
    /// Serveren har ikke /api/glimt/agent (404).
    @ObservationIgnored var noAgent: Bool = false
    @ObservationIgnored private var task: Task<Void, Never>? = nil

    /// Kalles når teksten endres (debounce 400 ms).
    func typed(_ text: String) {
        task?.cancel()
        let q: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if q != hitFor { hit = nil }
        guard q.count >= 3, !noPreview, let p = KalComposerModel.shared.parsed else {
            thinking = false
            return
        }
        task = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 400_000_000)
            if Task.isCancelled { return }
            self.thinking = true
            let body: [String: Any] = ["text": q, "module": "calendar", "context": KalRask46.context(p, text: q),
                                       "requestId": "kp" + UUID().uuidString.replacingOccurrences(of: "-", with: "")]
            do {
                let d: Data = try await KalNet.send("POST", "/api/glimt/agent/preview", json: body, timeout: 3)
                if Task.isCancelled { return }
                withAnimation(.easeOut(duration: 0.25)) {
                    self.hit = KalRask46.parseHit(d)
                    self.hitFor = q
                    self.thinking = false
                }
            } catch let e as KalNetError {
                if e.status == 404 || e.status == 405 { self.noPreview = true }
                self.thinking = false
            } catch {
                self.thinking = false
            }
        }
    }

    /// Forhåndsvisningen: lokal dato/tid (når den er entydig), tittel og sted fra Glimt eller den lokale ryddingen.
    func merged(_ p: KalParsed, text: String) -> (p: KalParsed, loc: String, address: String, glimt: Bool) {
        var out: KalParsed = p
        let local: (title: String, loc: String) = KalRask46.tidy(p.title)
        out.title = local.title.isEmpty ? p.title : local.title
        var loc: String = local.loc
        var address: String = ""
        var used: Bool = false
        if out.cal == "p" || out.cal.isEmpty { out.cal = KalStore.shared.defCalId46 }
        let q: String = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let h = hit, hitFor == q {
            if !h.title.isEmpty { out.title = h.title }
            if !h.location.isEmpty { loc = h.location }
            address = h.address
            used = h.engine != "lokal"
            let n: String = KalTime44.normalize(text)
            // Modellen får ikke flytte dato/tid som den lokale tolkeren fant.
            if !KalTime44.hasTime(n), let s = h.start {
                out.s = s
                out.e = h.end ?? Swift.min(1439, s + KalStore.shared.defDur)
            } else if let s = out.s, let e = h.end, h.start == s, e > s {
                out.e = e
            }
            if !h.date.isEmpty && KalD.valid(h.date) && out.day == KalD.todayKey() && !KalRask46Model.hasDateWord(n) { out.day = h.date }
            if !h.calendarId.isEmpty, KalStore.shared.cal(h.calendarId) != nil { out.cal = h.calendarId }
        }
        return (out, loc, address, used)
    }

    /// Teksten nevner en dag/dato selv (da vinner den lokale datoen).
    static func hasDateWord(_ n: String) -> Bool {
        let rx: String = "\\b(i dag|i morgen|i overmorgen|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|neste uke|\\d{1,2}\\.\\s?\\d{1,2}|\\d{1,2}\\.\\s?(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des))"
        return n.lowercased().range(of: rx, options: .regularExpression) != nil
    }

    /// Trykk i forhåndsvisningen: åpne Ny hendelse med verdiene, så de kan rettes før lagring.
    func edit(_ p: KalParsed, loc: String) {
        var f: KalNewForm = KalNewForm()
        f.title = p.title
        f.loc = loc
        f.day = KalD.date(p.day)
        f.allDay = p.s == nil
        let st: Int = p.s ?? 9 * 60
        f.start = KalD.at(p.day, st)
        f.end = KalD.at(p.day, p.e ?? Swift.min(1439, st + KalStore.shared.defDur))
        f.cal = p.cal
        f.rem = p.rem
        KalComposerModel.shared.text = ""
        KalComposerModel.shared.focused = false
        KalStore.shared.presentNew46(f)
    }

    /* ---------- Enter ---------- */

    func submit(_ text: String, local p0: KalParsed) {
        let m: (p: KalParsed, loc: String, address: String, glimt: Bool) = merged(p0, text: text)
        let s: KalStore = KalStore.shared
        hit = nil
        hitFor = ""
        task?.cancel()
        thinking = false
        if noAgent {
            Task { await s.add(m.p, loc: m.address.isEmpty ? m.loc : m.loc + ", " + m.address, toastPrefix: "Glimt la til") }
            return
        }
        let rid: String = "kr" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
        let body: [String: Any] = ["text": text, "module": "calendar", "requestId": rid, "context": KalRask46.context(p0, text: text)]
        s.showToast("Glimt legger inn «" + m.p.title + "» …", undo: "")
        Task { @MainActor in
            let r: KalRaskResult46 = await KalRask46Model.agent(body)
            switch r {
            case .created(let id, let reply):
                await s.load(force: true)
                let fallback: String = "Lagt inn i " + KalDef46.name(m.p.cal, in: s.cals) + " · " + KalD.dl(KalD.date(m.p.day))
                    + (m.p.s == nil ? "" : " " + KalD.hm(m.p.s ?? 0)) + " · " + m.p.title
                s.showToast(reply.isEmpty ? fallback : KalRask46Model.plain(reply), undo: id)
            case .ask:
                // Spørsmål/valg: Glimt-panelet viser det (samme motor via /api/assist).
                KalGlimtModel.shared.send(text)
            case .unsupported:
                self.noAgent = true
                _ = await s.add(m.p, loc: m.loc, toastPrefix: "Glimt la til")
            case .failed:
                _ = await s.add(m.p, loc: m.loc, toastPrefix: "Glimt la til")
            }
        }
    }

    nonisolated static func plain(_ s: String) -> String {
        s.replacingOccurrences(of: "**", with: "").replacingOccurrences(of: "\n", with: " ")
    }

    /// Ett kall (15 s), og ved tidsavbrudd ett til med samme requestId.
    static func agent(_ body: [String: Any]) async -> KalRaskResult46 {
        for attempt in 0..<2 {
            do {
                let d: Data = try await KalNet.send("POST", "/api/glimt/agent", json: body, timeout: KalSrv46.timeout)
                return KalRask46Model.result(d)
            } catch let e as KalNetError {
                if e.status == 404 || e.status == 405 { return .unsupported }
                if e.status != 0 || attempt == 1 { return .failed }
            } catch {
                return .failed
            }
        }
        return .failed
    }

    nonisolated static func result(_ d: Data) -> KalRaskResult46 {
        guard let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return .failed }
        if o["ask"] is [String: Any] || o["confirm"] is [String: Any] { return .ask }
        let reply: String = (o["reply"] as? String) ?? ((o["text"] as? String) ?? "")
        for a in (o["actions"] as? [[String: Any]]) ?? [] {
            guard (a["tool"] as? String) == "calendar.create", (a["status"] as? String) == "done" else { continue }
            let res: [String: Any] = (a["result"] as? [String: Any]) ?? [:]
            let ev: [String: Any] = (res["event"] as? [String: Any]) ?? res
            let id: String = (ev["id"] as? String) ?? ((res["id"] as? String) ?? "")
            return .created(id, reply)
        }
        return .failed
    }
}

enum KalRaskResult46 {
    case created(String, String)
    case ask
    case unsupported
    case failed
}

/// «✦ Glimt» / «Glimt tenker …» og «📍 sted · adresse» i GLIMT FORSTÅR.
struct KalRaskBadge46: View {
    @Environment(\.kal) private var t
    let glimt: Bool
    let thinking: Bool

    var body: some View {
        if thinking {
            Text("Glimt tenker …").font(KalFont.ui(11, .bold)).foregroundStyle(t.mut)
                .opacity(0.75)
                .transition(.opacity)
        } else if glimt {
            Text("✦ Glimt").font(KalFont.ui(11, .bold)).foregroundStyle(t.acc)
                .transition(.opacity)
        }
    }
}

struct KalRaskPlace46: View {
    @Environment(\.kal) private var t
    let loc: String
    let address: String

    var body: some View {
        let text: String = address.isEmpty ? loc : loc + " · " + address
        Text("📍 " + text).font(KalFont.ui(12.5, .semibold)).foregroundStyle(t.ink).lineLimit(2)
    }
}
