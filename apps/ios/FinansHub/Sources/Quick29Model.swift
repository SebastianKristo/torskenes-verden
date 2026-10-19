import SwiftUI
import UIKit

/* ---------------- Prompt 29: Kalender → rask time med AI («Legg til time») ---------------- */
// Fasit: design/Kalender.dc.html (QP(), qaVals) og prompts/prompt-29-pakke/claude-code-kalender-rask-time.md.
// Forhåndsvisning: POST /api/kalender/quick/parse {text} (200 ms pause). «Legg til»: POST /api/kalender/quick {text}
// → 202 {jobId}; arket lukkes med en gang og jobben kjører på serveren. Mens noe kjører spørres
// GET /api/kalender/quick/jobs hvert 2. sekund (i tillegg til realtime «calendar-quick» og push).
// Ferdig: banner «✓ Nina frisør · fre 25. sep · 14:30» med Angre (POST /quick/:id/undo) og Vis.
// Feilet: skjemaet åpnes utfylt med det som ble funnet, feilmeldingen og originalteksten i notat.
// Eldre server (404): forhåndsvisningen skjules, og «Legg til» åpner skjemaet med teksten i notat.

/// Svaret fra parseQuick (public/js/quick-time.js) eller `found` i en feilet jobb.
struct Quick29Preview: Equatable {
    var ok: Bool = false
    var why: String = ""
    var title: String = ""
    /// «2026-09-25»
    var date: String = ""
    /// «14:30»
    var start: String = ""
    var end: String = ""
    var place: String = ""
    var type: String = ""
    var isAppointment: Bool = false

    static func from(_ raw: [String: Any]) -> Quick29Preview {
        let o: [String: Any] = JS.dict(raw, "result") ?? raw
        var v = Quick29Preview()
        v.title = JS.str(o, "title") ?? JS.str(o, "tittel") ?? ""
        v.date = JS.str(o, "date") ?? JS.str(o, "dato") ?? ""
        v.start = JS.str(o, "start") ?? ""
        v.end = JS.str(o, "end") ?? JS.str(o, "slutt") ?? ""
        v.place = JS.str(o, "place") ?? JS.str(o, "sted") ?? JS.str(o, "location") ?? ""
        v.type = JS.str(o, "type") ?? ""
        v.why = JS.str(o, "why") ?? ""
        v.ok = JS.bool(o, "ok") ?? !v.date.isEmpty
        v.isAppointment = JS.bool(o, "isAppointment") ?? false
        return v
    }

    /// «fredag 25. september · 14:30–15:15» eller «… · hele dagen».
    var dateLabel: String {
        if date.count < 10 { return "" }
        let d: Date = Cal26.day(String(date.prefix(10)))
        let base: String = Cal26.dLong(d)
        if start.isEmpty { return base + " · hele dagen" }
        let range: String = end.isEmpty ? start : start + "–" + end
        return base + " · " + range
    }

    /// «fre 25. sep · 14:30» (forslaget på Hjem og banneret).
    var shortLabel: String { Quick29Preview.short(date, start) }

    static func short(_ date: String, _ start: String) -> String {
        if date.count < 10 { return start }
        let d: Date = Cal26.day(String(date.prefix(10)))
        let wd: String = String(Cal26.weekdays[Cal26.jsDay(d)].prefix(3))
        let s: String = wd + " " + Cal26.dShort(d)
        return start.isEmpty ? s : s + " · " + start
    }
}

/// Én jobb fra GET /api/kalender/quick/jobs.
struct Quick29Job: Identifiable, Equatable {
    var id: String
    var state: String
    var text: String
    var eventId: String = ""
    var title: String = ""
    var date: String = ""
    var start: String = ""
    var label: String = ""
    var error: String = ""
    var found: Quick29Preview = Quick29Preview()

    static func from(_ o: [String: Any]) -> Quick29Job? {
        guard let id = JS.str(o, "id") ?? JS.str(o, "jobId") else { return nil }
        var j = Quick29Job(id: id, state: JS.str(o, "state") ?? "queued", text: JS.str(o, "text") ?? "")
        let r: [String: Any]? = JS.dict(o, "result")
        j.eventId = JS.str(r, "eventId") ?? JS.str(r, "id") ?? ""
        j.title = JS.str(r, "title") ?? ""
        j.date = JS.str(r, "date") ?? ""
        j.start = JS.str(r, "start") ?? ""
        j.label = JS.str(r, "label") ?? ""
        j.error = JS.str(o, "error") ?? ""
        if let f = JS.dict(o, "found") { j.found = Quick29Preview.from(f) }
        return j
    }

    /// «fre 25. sep · 14:30» (serverens label hvis den finnes).
    var when: String {
        if !label.isEmpty {
            // label kan være hele teksten «✓ Nina frisør · fre 25. sep · 14:30»: ta bort tittelen.
            let t: String = label.replacingOccurrences(of: "✓ ", with: "")
            if !title.isEmpty && t.hasPrefix(title + " · ") { return String(t.dropFirst(title.count + 3)) }
            return t
        }
        return Quick29Preview.short(date, start)
    }
}

@MainActor
@Observable
final class Quick29Model {
    static let shared = Quick29Model()

    /// Arket «Legg til time».
    var sheetOpen: Bool = false
    var text: String = ""
    var preview: Quick29Preview? = nil
    /// Serveren mangler /quick/parse (404).
    var parseMissing: Bool = false
    /// Jobber som kjører (id-er).
    var pending: [String] = []
    /// Banneret etter en ferdig jobb.
    var banner: Quick29Job? = nil

    @ObservationIgnored private var parseTask: Task<Void, Never>? = nil
    @ObservationIgnored private var pollTask: Task<Void, Never>? = nil
    @ObservationIgnored private var bannerTask: Task<Void, Never>? = nil
    @ObservationIgnored private var handled: Set<String> = []

    nonisolated static let chips: [String] = ["Frisør", "Lege", "Tannlege", "Fysio"]

    var busy: Bool { !pending.isEmpty }

    var busyText: String {
        pending.count > 1 ? "Legger til \(pending.count) timer …" : "Legger til i kalenderen …"
    }

    /* ---------- Arket ---------- */

    func openSheet(_ t: String = "") {
        text = t
        preview = nil
        sheetOpen = true
        Haptics.shared.tap()
    }

    func setText(_ v: String, _ store: Store) {
        text = v
        parseTask?.cancel()
        let t: String = v.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.count <= 3 { preview = nil; return }
        parseTask = Task {
            try? await Task.sleep(nanoseconds: 200_000_000)
            if Task.isCancelled { return }
            let pv: Quick29Preview? = await self.parse(t, store)
            if Task.isCancelled { return }
            self.preview = pv
        }
    }

    func chip(_ name: String, _ store: Store) {
        setText("Time hos " + name.lowercased() + " ", store)
        Haptics.shared.select()
    }

    func paste(_ store: Store) {
        guard let s = UIPasteboard.general.string, !s.isEmpty else { return }
        setText(s, store)
        Haptics.shared.select()
    }

    /// Tolker teksten på serveren (rask, uten AI). nil når serveren mangler endepunktet eller ikke svarer.
    func parse(_ t: String, _ store: Store) async -> Quick29Preview? {
        do {
            let d: Data = try await store.api.callAt("/api", "POST", "/kalender/quick/parse", json: ["text": t], timeout: 4)
            parseMissing = false
            return Quick29Preview.from(JS.obj(d))
        } catch let e as APIError {
            if e.status == 404 || e.status == 405 { parseMissing = true }
            return nil
        } catch {
            return nil
        }
    }

    /// «Fyll ut selv»: lukker arket og åpner det vanlige skjemaet.
    func manual() {
        sheetOpen = false
        Task {
            try? await Task.sleep(nanoseconds: 450_000_000)
            Cal27Model.shared.newEvent()
        }
    }

    /* ---------- Bakgrunnsjobben ---------- */

    /// «Legg til i kalenderen» (arket, Hjem-søket og Snarveier): lukker arket med en gang og legger jobben i køen.
    func submit(_ raw: String, _ store: Store) {
        let t: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        sheetOpen = false
        text = ""
        preview = nil
        let tmp: String = "tmp-" + UUID().uuidString
        pending.append(tmp)
        // Prompt 31: Glimt-toasten og glassboblen (AiJob31.swift).
        AiJobs31.shared.begin(id: tmp, kind: "quick", title: "Legger til i kalenderen", input: t, steps: AiJobs31.quickSteps)
        Haptics.shared.tap()
        Task {
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/kalender/quick", json: ["text": t], timeout: 20)
                let o: [String: Any] = JS.obj(d)
                let id: String = JS.str(o, "jobId") ?? JS.str(o, "id") ?? ""
                self.pending.removeAll { $0 == tmp }
                if id.isEmpty { AiJobs31.shared.end(tmp); return }
                AiJobs31.shared.rename(tmp, to: id)
                self.pending.append(id)
                self.startPolling(store)
            } catch let e as APIError {
                self.pending.removeAll { $0 == tmp }
                AiJobs31.shared.end(tmp)
                if e.status == 404 || e.status == 405 {
                    self.openForm(Quick29Preview(), text: t, error: "Serveren kan ikke legge til timer i bakgrunnen ennå. Fyll ut og lagre.", store)
                } else {
                    store.flash("Kunne ikke legge til timen: " + e.message)
                }
            } catch {
                self.pending.removeAll { $0 == tmp }
                AiJobs31.shared.end(tmp)
                store.flash("Kunne ikke legge til timen: " + error.localizedDescription)
            }
        }
    }

    /// Spør etter jobbene hvert 2. sekund så lenge noe kjører (maks ca. 5 minutter).
    func startPolling(_ store: Store) {
        if pollTask != nil { return }
        pollTask = Task {
            var rounds: Int = 0
            while !self.pending.isEmpty && rounds < 150 {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                if Task.isCancelled { break }
                await self.check(store)
                rounds += 1
            }
            if rounds >= 150 {
                for id in self.pending where !id.hasPrefix("tmp-") { AiJobs31.shared.end(id) }
                self.pending.removeAll { !$0.hasPrefix("tmp-") }
            }
            self.pollTask = nil
        }
    }

    /// Realtime «calendar-quick» eller push: hent jobbene med en gang.
    func poke(_ store: Store) {
        Task { await self.check(store) }
    }

    func check(_ store: Store) async {
        let ids: [String] = pending.filter { !$0.hasPrefix("tmp-") }
        if ids.isEmpty { return }
        guard let d = try? await store.api.callAt("/api", "GET", "/kalender/quick/jobs", timeout: 10) else { return }
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        var rows: [[String: Any]] = (any as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
        if rows.isEmpty { rows = JS.list(any as? [String: Any], "jobs") }
        let jobs: [Quick29Job] = rows.compactMap { Quick29Job.from($0) }
        for id in ids {
            guard let j = jobs.first(where: { $0.id == id }) else { continue }
            if j.state == "done" { finish(j, store) } else if j.state == "failed" { fail(j, store) }
        }
    }

    private func finish(_ j: Quick29Job, _ store: Store) {
        pending.removeAll { $0 == j.id }
        AiJobs31.shared.end(j.id)
        if handled.contains(j.id) { return }
        handled.insert(j.id)
        showBanner(j)
        Haptics.shared.success()
        Task { await Cal26Model.shared.load(store, force: true) }
    }

    private func fail(_ j: Quick29Job, _ store: Store) {
        pending.removeAll { $0 == j.id }
        AiJobs31.shared.end(j.id)
        if handled.contains(j.id) { return }
        handled.insert(j.id)
        Haptics.shared.error()
        let why: String = j.error.isEmpty ? "Fant ikke dato." : j.error
        openForm(j.found, text: j.text, error: why + " Velg dato og lagre.", store)
    }

    private func showBanner(_ j: Quick29Job) {
        banner = j
        bannerTask?.cancel()
        bannerTask = Task {
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            if !Task.isCancelled { self.banner = nil }
        }
    }

    /// Skjemaet i Kalender, utfylt med det som ble funnet.
    func openForm(_ f: Quick29Preview, text: String, error: String, _ store: Store) {
        var form = Cal27Form()
        let day: Date = f.date.count >= 10 ? Cal26.day(String(f.date.prefix(10))) : Cal27Model.shared.curD
        let s: Int = Quick29Model.minutes(f.start) ?? 9 * 60
        let e: Int = Quick29Model.minutes(f.end) ?? Swift.min(s + 60, 23 * 60 + 55)
        let start0: Date = Cal26.startOfDay(day)
        form.title = f.title
        form.date = day
        form.start = start0.addingTimeInterval(TimeInterval(s * 60))
        form.end = start0.addingTimeInterval(TimeInterval(Swift.max(e, s + 15) * 60))
        form.location = f.place
        form.calendar = "privat"
        form.reminder = "1h"
        form.note = text
        form.error = error
        if store.paperTab != "kalender" { store.paperGo("kalender") }
        Task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            Cal27Model.shared.form = form
        }
    }

    nonisolated static func minutes(_ hm: String) -> Int? {
        let parts: [Substring] = hm.split(separator: ":")
        guard parts.count >= 2, let h = Int(parts[0]), let m = Int(parts[1].prefix(2)) else { return nil }
        return h * 60 + m
    }

    /* ---------- Dyplenker fra push ---------- */

    /// finanshub://kalender?date=… åpner dagen, ?quick=<id> åpner skjemaet for en feilet jobb. true = håndtert.
    func openLink(_ url: URL, _ store: Store) -> Bool {
        let items: [URLQueryItem] = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let d = items.first(where: { $0.name == "date" })?.value, d.count >= 10 {
            if store.paperTab != "kalender" { store.paperGo("kalender") }
            Cal27Model.shared.goDay(String(d.prefix(10)))
            return true
        }
        if let id = items.first(where: { $0.name == "quick" })?.value, !id.isEmpty {
            Task { await self.openFailed(id, store) }
            return true
        }
        return false
    }

    private func openFailed(_ id: String, _ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/kalender/quick/jobs", timeout: 10) else { return }
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        let rows: [[String: Any]] = (any as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
        guard let j = rows.compactMap({ Quick29Job.from($0) }).first(where: { $0.id == id }) else { return }
        handled.insert(j.id)
        pending.removeAll { $0 == j.id }
        if j.state == "failed" {
            let why: String = j.error.isEmpty ? "Fant ikke dato." : j.error
            openForm(j.found, text: j.text, error: why + " Velg dato og lagre.", store)
        } else if j.state == "done" && j.date.count >= 10 {
            if store.paperTab != "kalender" { store.paperGo("kalender") }
            Cal27Model.shared.goDay(String(j.date.prefix(10)))
        }
    }

    /* ---------- Banneret ---------- */

    func undo(_ store: Store) {
        guard let j = banner else { return }
        banner = nil
        bannerTask?.cancel()
        Task {
            do {
                _ = try await store.api.callAt("/api", "POST", "/kalender/quick/" + Cal27Model.enc(j.id) + "/undo", json: [:], timeout: 15)
                await Cal26Model.shared.load(store, force: true)
                store.flash("Timen er fjernet")
            } catch let e as APIError {
                store.flash("Kunne ikke angre: " + e.message)
            } catch {
                store.flash("Kunne ikke angre: " + error.localizedDescription)
            }
        }
    }

    func show(_ store: Store) {
        guard let j = banner else { return }
        banner = nil
        bannerTask?.cancel()
        if store.paperTab != "kalender" { store.paperGo("kalender") }
        if j.date.count >= 10 { Cal27Model.shared.goDay(String(j.date.prefix(10))) }
    }

    func closeBanner() {
        banner = nil
        bannerTask?.cancel()
    }
}
