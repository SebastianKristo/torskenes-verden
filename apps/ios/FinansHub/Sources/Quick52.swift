import SwiftUI

/* ---------------- Prompt 52: Glimt forstår kalenderbeskjeder i naturlig språk ----------------
 Fasit: Homelab.dc.html → QCX + hsAiParse, prompts/prompt-52-pakke/claude-code-glimt-kalender-kontekst.md, SERVER52-API.md § 4.
 – Regelparseren først (POST /api/kalender/quick/parse + Time44, som før – rask og uten AI).
 – Med Glimt som motor og minst 3 ord: etter 450 ms pause sendes teksten til POST /api/glimt/quickparse52 {text, now}.
   Serveren bruker regel + AI via ai-gate (konfigurert tolkemodell, think:false, num_ctx, JSON-skjema, kontekst: dato/ukedag/klokke,
   kontakter fra Bursdager/familie, tidligere steder, lærte ord), tidsavbrudd 5 s → regelresultatet.
 – Svaret bufres per tekst. AI-svaret overstyrer: kalender → forslaget «Møte med Laila · i dag · Olivia», huske/spørsmål → ingen
   kalenderforslag. Mens AI tenker står «✦ tolker …» på forslaget. Enter før svaret er klart: venter opptil 2,5 s.
 – Læring: POST /api/glimt/lex52 {from, to, kind} når brukeren retter et navn/sted (Quick52.learn). */

struct Quick52Result: Equatable {
    var type: String
    var source: String
    var preview: Quick29Preview
    var people: [String]

    var isCalendar: Bool { type == "kalender" && preview.date.count >= 10 }
}

@MainActor
@Observable
final class Quick52 {
    static let shared = Quick52()

    /// Teksten AI tolker akkurat nå (vises som «✦ tolker …»).
    var busyText: String = ""
    @ObservationIgnored private var cache: [String: Quick52Result] = [:]
    @ObservationIgnored private var missing: Bool = false
    @ObservationIgnored private var inflight: Set<String> = []

    nonisolated static func words(_ t: String) -> Int {
        t.split(whereSeparator: { $0 == " " || $0 == "\n" }).count
    }

    nonisolated static func key(_ t: String) -> String {
        t.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    func cached(_ t: String) -> Quick52Result? { cache[Quick52.key(t)] }

    /// Tolker teksten på serveren (regel + AI). nil = eldre server eller ingen svar.
    func parse(_ t: String, _ store: Store) async -> Quick52Result? {
        let k: String = Quick52.key(t)
        if let c = cache[k] { return c }
        if missing || Quick52.words(t) < 3 { return nil }
        if inflight.contains(k) { return await wait(t, seconds: 6) }
        inflight.insert(k)
        busyText = k
        defer {
            inflight.remove(k)
            if busyText == k { busyText = "" }
        }
        let iso: ISO8601DateFormatter = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        iso.timeZone = TimeZone.current
        let body: [String: Any] = ["text": t.trimmingCharacters(in: .whitespacesAndNewlines), "now": iso.string(from: Date()), "ai": true]
        do {
            let d: Data = try await store.api.callAt("/api", "POST", "/glimt/quickparse52", json: body, timeout: 7)
            let o: [String: Any] = JS.obj(d)
            guard let r = Quick52.result(o) else { return nil }
            cache[k] = r
            if cache.count > 60 { cache.removeAll() ; cache[k] = r }
            return r
        } catch let e as APIError {
            if e.status == 404 || e.status == 405 { missing = true }
            return nil
        } catch {
            return nil
        }
    }

    /// Venter på et svar som allerede er på vei (Enter før AI er ferdig), maks `seconds`.
    func wait(_ t: String, seconds: Double) async -> Quick52Result? {
        let k: String = Quick52.key(t)
        let end: Date = Date().addingTimeInterval(seconds)
        while Date() < end {
            if let c = cache[k] { return c }
            if !inflight.contains(k) { return cache[k] }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        return cache[k]
    }

    func isBusy(_ t: String) -> Bool { !busyText.isEmpty && busyText == Quick52.key(t) }

    nonisolated static func result(_ o: [String: Any]) -> Quick52Result? {
        guard let r = JS.dict(o, "result") ?? JS.dict(o, "ai") ?? JS.dict(o, "rule") else { return nil }
        var pv: Quick29Preview = Quick29Preview()
        pv.title = JS.str(r, "title") ?? ""
        pv.date = JS.str(r, "date") ?? ""
        pv.start = JS.str(r, "start") ?? ""
        pv.end = JS.str(r, "end") ?? ""
        pv.place = JS.str(r, "location") ?? JS.str(r, "place") ?? ""
        let type: String = JS.str(r, "type") ?? "annet"
        pv.type = type
        pv.ok = type == "kalender" && !pv.date.isEmpty
        pv.isAppointment = pv.ok
        return Quick52Result(type: type, source: JS.str(o, "source") ?? "rule", preview: pv, people: JS.strings(r, "people"))
    }

    /// Lærer et rettet ord (navn eller sted) for brukeren.
    func learn(from: String, to: String, kind: String, _ store: Store) {
        let a: String = from.trimmingCharacters(in: .whitespaces)
        let b: String = to.trimmingCharacters(in: .whitespaces)
        guard !a.isEmpty, !b.isEmpty, a.lowercased() != b.lowercased(), !missing else { return }
        cache.removeAll()
        Task { _ = try? await store.api.callAt("/api", "POST", "/glimt/lex52", json: ["from": a, "to": b, "kind": kind], timeout: 10) }
    }
}
