import SwiftUI
import UIKit

/* ---------------- Prompt 77 (SKJAIIOS): Skjold Lab med smarte forslag (bilde, navn, kategori) ----------------
 Kontrakt: CONTRACT77.md. Den lokale visjonsmodellen (via ai-run, oppgaven «skj») foreslår navn, kategori, specs og tags
 fra bilde og/eller tekst. Fargebånd, SMD- og kondensatorkoder regnes ut i kode på serveren (decoded).
 Server (SKJAISRV, server/skjold76/ai77.js og images77.js), per bruker, under /api/skjold:
   POST /ai/suggest {partId?|name?, description?, specs?, photo?} eller multipart (file + feltene)
        → {name, category, categoryNew, specs, tags, confidence, why, source:'bilde'|'tekst'|'begge', decoded?}
   POST /ai/images {q} → {items:[{id, thumbUrl, title, source, width, height}]} (id er signert og kortlivet, bildene går via proxy)
   POST /parts/:id/photos/from-search {id}
   POST /ai/tidy {partIds?|all:true} → {jobId} · GET /ai/tidy/:jobId → {state, done, total, items} · POST /ai/tidy/:jobId/apply {partIds}
   GET|PUT /ai/settings {webImages, autoSuggestOnPhoto}
 Tidsavbrudd: 60 s med bilde og 30 s med bare tekst (litt slakk i klienten). Mens vi venter vises «Glimt tenker …». */

/// Ett forslag fra Glimt.
struct Skj77Suggestion: Hashable {
    var name: String = ""
    var category: String = ""
    var categoryNew: Bool = false
    var specs: [Skj76Spec] = []
    var tags: [String] = []
    var confidence: Double = 0
    var why: String = ""
    var source: String = "tekst"
    /// Utregnet i kode: «brun-svart-oransje-gull → 10 kΩ 5 %», «103 → 10 kΩ», «104 → 100 nF».
    var decoded: [String] = []

    var percent: String { "\(Int((confidence * 100).rounded())) %" }
    var sourceText: String {
        switch source {
        case "bilde": return "fra bildet"
        case "begge": return "fra bilde og tekst"
        default: return "fra teksten"
        }
    }
}

/// En bildekandidat fra søket (bare signert id og miniatyr via serverens proxy).
struct Skj77Candidate: Identifiable, Hashable {
    var id: String
    var thumb: String
    var title: String = ""
    var source: String = ""
    var width: Int = 0
    var height: Int = 0

    var size: String { width > 0 && height > 0 ? "\(width) × \(height)" : "" }
}

/// Én linje i «Rydd opp»-gjennomgangen.
struct Skj77TidyItem: Identifiable, Hashable {
    var id: String
    var oldName: String = ""
    var oldCategory: String = ""
    var after: Skj77Suggestion = Skj77Suggestion()
    var error: String = ""

    var changed: Bool {
        if !error.isEmpty { return false }
        let n: Bool = !after.name.isEmpty && after.name != oldName
        let c: Bool = !after.category.isEmpty && after.category != oldCategory
        return n || c || !after.specs.isEmpty || !after.tags.isEmpty
    }
}

@MainActor
@Observable
final class Skjold77 {
    static let shared = Skjold77()

    /* ---------- Innstillinger ---------- */
    var webImages: Bool = true
    var autoSuggest: Bool = true
    /// Innstillingene er hentet (auto-forslag startes først da, så en eldre server ikke gir feil ved hvert bilde).
    var settingsLoaded: Bool = false
    var settingsError: String = ""

    /* ---------- Forslag i Ny/Endre del ---------- */
    var thinking: Bool = false
    var suggestion: Skj77Suggestion? = nil
    var suggestError: String = ""

    /* ---------- Finn bilde ---------- */
    var searching: Bool = false
    var candidates: [Skj77Candidate] = []
    var imageMessage: String = ""

    /* ---------- Rydd opp ---------- */
    var jobId: String = ""
    var jobState: String = ""
    var jobDone: Int = 0
    var jobTotal: Int = 0
    var tidyItems: [Skj77TidyItem] = []
    var chosen: Set<String> = []
    var tidyError: String = ""
    var applying: Bool = false
    @ObservationIgnored private var pollTask: Task<Void, Never>? = nil
    @ObservationIgnored private var suggestTask: Task<Void, Never>? = nil

    nonisolated static let defaultCategories: [String] = ["Motstander", "Kondensatorer", "Dioder og LED", "Transistorer", "IC-er",
        "Mikrokontrollere", "Sensorer", "Moduler", "Kontakter", "Kabler", "Skruer og bolter", "Mutre og skiver", "Avstandsstykker",
        "Brytere", "Sikringer", "Verktøy", "Diverse"]
    nonisolated static let thinkingText: String = "Glimt tenker …"
    nonisolated static let photoTimeout: TimeInterval = 65
    nonisolated static let textTimeout: TimeInterval = 35

    private var m: Skjold76 { Skjold76.shared }

    /// Innstillinger → Moduler → Skjold Lab: åpner Skjold Lab med Glimt-innstillingene.
    func openSettings() {
        m.show()
        m.sheet = .ai
    }

    func loadSettings(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "GET", Skjold76.root + "/ai/settings", timeout: 15)
            applySettings(JS.obj(d))
            settingsError = ""
        } catch {
            settingsError = Skjold77.message(error)
        }
    }

    private func applySettings(_ raw: [String: Any]) {
        let o: [String: Any] = JS.dict(raw, "settings") ?? raw
        webImages = JS.bool(o, "webImages") ?? true
        autoSuggest = JS.bool(o, "autoSuggestOnPhoto") ?? true
        settingsLoaded = true
    }

    func saveSettings(_ store: Store) async {
        let body: [String: Any] = ["webImages": webImages, "autoSuggestOnPhoto": autoSuggest]
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "PUT", Skjold76.root + "/ai/settings", json: body, timeout: 15)
            let o: [String: Any] = JS.obj(d)
            if !o.isEmpty { applySettings(o) }
            settingsError = ""
            Haptics.shared.tick()
        } catch {
            settingsError = Skjold77.message(error)
            await loadSettings(store)
        }
    }

    /* ---------- Forslag ---------- */

    func clearSuggestion() {
        suggestTask?.cancel()
        suggestion = nil
        suggestError = ""
        thinking = false
    }

    /// «✦ Foreslå»: med nytt bilde (multipart), ellers delens lagrede bilde og/eller teksten.
    func suggest(partId: String, form f: Skj76Form, image: UIImage?, _ store: Store) {
        suggestTask?.cancel()
        thinking = true
        suggestError = ""
        suggestion = nil
        suggestTask = Task { @MainActor in
            do {
                let d: Data = try await self.suggestCall(partId, f, image, store)
                if Task.isCancelled { return }
                let s: Skj77Suggestion = Skjold77.suggestion(JS.obj(d))
                if s.name.isEmpty && s.category.isEmpty && s.specs.isEmpty {
                    self.suggestError = "Glimt fant ikke noe å foreslå. Prøv et skarpere bilde eller et mer beskrivende navn."
                } else {
                    self.suggestion = s
                    Haptics.shared.success()
                }
            } catch {
                if Task.isCancelled { return }
                self.suggestError = Skjold77.message(error)
            }
            self.thinking = false
        }
    }

    private func suggestCall(_ partId: String, _ f: Skj76Form, _ image: UIImage?, _ store: Store) async throws -> Data {
        let path: String = Skjold76.root + "/ai/suggest"
        let specs: [String: Any] = Skjold77.specObject(f.specs)
        if let image, let jpg = Skjold76.jpeg(image) {
            var parts: [API.Part] = [API.Part(name: "file", filename: "del.jpg", mime: "image/jpeg", data: jpg)]
            if !partId.isEmpty { parts.append(.text("partId", partId)) }
            parts.append(.text("name", f.name))
            parts.append(.text("description", f.desc))
            parts.append(.text("specs", Skjold77.jsonText(specs)))
            return try await store.api.upload(path, parts: parts, prefix: Skjold76.prefix, timeout: Skjold77.photoTimeout)
        }
        var body: [String: Any] = ["name": f.name, "description": f.desc, "specs": specs]
        if !partId.isEmpty { body["partId"] = Skjold76.idv(partId) }
        let photo: String = Skjold77.fileName(f.oldPhotos.first?.url ?? "")
        if !photo.isEmpty { body["photo"] = photo }
        let t: TimeInterval = photo.isEmpty ? Skjold77.textTimeout : Skjold77.photoTimeout
        return try await store.api.callAt(Skjold76.prefix, "POST", path, json: body, timeout: t)
    }

    /* ---------- Finn bilde ---------- */

    func findImages(_ q: String, _ store: Store) async {
        let text: String = q.trimmingCharacters(in: .whitespaces)
        if text.isEmpty { imageMessage = "Skriv hva du leter etter."; return }
        if settingsLoaded && !webImages {
            candidates = []
            imageMessage = Skjold77.webOffText
            return
        }
        searching = true
        imageMessage = ""
        defer { searching = false }
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/ai/images", json: ["q": text], timeout: 30)
            let o: [String: Any] = JS.obj(d)
            candidates = Array(JS.list(o, "items").compactMap { Skjold77.candidate($0) }.prefix(12))
            if candidates.isEmpty {
                imageMessage = JS.str(o, "message") ?? JS.str(o, "error") ?? "Fant ingen bilder av «" + text + "». Prøv et annet ord."
            }
        } catch {
            candidates = []
            imageMessage = Skjold77.message(error)
        }
    }

    /// Lagrer valgt kandidat på delen (serveren laster ned med SSRF-vern og behandler bildet som en opplasting).
    func useImage(_ c: Skj77Candidate, partId: String, _ store: Store) async -> Bool {
        let path: String = Skjold76.root + "/parts/\(partId)/photos/from-search"
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "POST", path, json: ["id": c.id], timeout: 45)
            Haptics.shared.success()
            await m.loadPart(partId, store)
            return true
        } catch {
            m.fail(error)
            return false
        }
    }

    /* ---------- Rydd opp ---------- */

    func startTidy(_ ids: [String], _ store: Store) async {
        pollTask?.cancel()
        jobId = ""
        jobState = "starter"
        jobDone = 0
        jobTotal = ids.isEmpty ? m.total : ids.count
        tidyItems = []
        chosen = []
        tidyError = ""
        let body: [String: Any] = ids.isEmpty ? ["all": true] : ["partIds": ids.map { Skjold76.idv($0) }]
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/ai/tidy", json: body, timeout: 20)
            let o: [String: Any] = JS.obj(d)
            jobId = JS.str(o, "jobId") ?? JS.str(o, "id") ?? ""
            if jobId.isEmpty { tidyError = "Serveren startet ikke gjennomgangen."; jobState = "error"; return }
            poll(store)
        } catch {
            tidyError = Skjold77.message(error)
            jobState = "error"
        }
    }

    var tidyRunning: Bool { !jobId.isEmpty && !Skjold77.finished(jobState) }

    private func poll(_ store: Store) {
        pollTask?.cancel()
        let id: String = jobId
        pollTask = Task { @MainActor in
            var misses: Int = 0
            while !Task.isCancelled && self.jobId == id {
                do {
                    let d: Data = try await store.api.callAt(Skjold76.prefix, "GET", Skjold76.root + "/ai/tidy/\(id)", timeout: 15)
                    misses = 0
                    self.applyJob(JS.obj(d))
                    if Skjold77.finished(self.jobState) { return }
                } catch {
                    misses += 1
                    if misses >= 5 { self.tidyError = Skjold77.message(error); self.jobState = "error"; return }
                }
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
        }
    }

    private func applyJob(_ o: [String: Any]) {
        jobState = JS.str(o, "state") ?? JS.str(o, "status") ?? jobState
        jobDone = JS.int(o, "done") ?? jobDone
        jobTotal = JS.int(o, "total") ?? jobTotal
        if let e = JS.str(o, "error"), !e.isEmpty { tidyError = e }
        let fresh: [Skj77TidyItem] = JS.list(o, "items").map { Skjold77.tidyItem($0) }
        let known: Set<String> = Set(tidyItems.map { $0.id })
        // Nye forslag med høy nok sikkerhet krysses av; brukeren godkjenner fortsatt med «Godta valgte».
        for x in fresh where !known.contains(x.id) && x.changed && x.after.confidence >= 0.6 { chosen.insert(x.id) }
        tidyItems = fresh
    }

    func toggle(_ id: String) {
        Haptics.shared.tick()
        if chosen.contains(id) { chosen.remove(id) } else { chosen.insert(id) }
    }

    /// «Godta valgte»: bare de avkryssede endres, og endringene logges i historikken (kan angres).
    func applyChosen(_ store: Store) async -> Bool {
        let ids: [String] = tidyItems.filter { chosen.contains($0.id) && $0.changed }.map { $0.id }
        if ids.isEmpty || jobId.isEmpty { return false }
        applying = true
        defer { applying = false }
        do {
            _ = try await store.api.callAt(Skjold76.prefix, "POST", Skjold76.root + "/ai/tidy/\(jobId)/apply",
                                           json: ["partIds": ids.map { Skjold76.idv($0) }], timeout: 30)
            Haptics.shared.success()
            m.flash(ids.count == 1 ? "1 del er ryddet · kan angres i historikken" : "\(ids.count) deler er ryddet · kan angres i historikken")
            closeTidy()
            await m.refresh(store)
            return true
        } catch {
            m.fail(error)
            return false
        }
    }

    /// «Hopp over»: lukker uten å endre noe.
    func closeTidy() {
        pollTask?.cancel()
        jobId = ""
        jobState = ""
        tidyItems = []
        chosen = []
        tidyError = ""
    }

    /* ---------- Lesing ---------- */

    nonisolated static let webOffText: String = "«Finn bilder på nett» er slått av. Slå det på under ⚙ i Skjold Lab."

    nonisolated static func finished(_ s: String) -> Bool {
        ["done", "ferdig", "finished", "complete", "completed", "error", "failed", "feil", "cancelled", "avbrutt"].contains(s.lowercased())
    }

    nonisolated static func message(_ e: Error) -> String {
        guard let a = e as? APIError else { return e.localizedDescription }
        if a.status == 0 { return Skjold76.netMsg }
        if a.status == 404 { return "Serveren har ikke Glimt-forslag i Skjold Lab ennå (oppdater Homelab)." }
        if a.status == 504 || a.status == 408 { return "Glimt brukte for lang tid. Prøv igjen om litt." }
        return a.message
    }

    nonisolated static func suggestion(_ raw: [String: Any]) -> Skj77Suggestion {
        let o: [String: Any] = JS.dict(raw, "suggestion") ?? JS.dict(raw, "after") ?? raw
        var s: Skj77Suggestion = Skj77Suggestion()
        s.name = JS.str(o, "name") ?? ""
        s.category = JS.str(o, "category") ?? ""
        s.categoryNew = JS.bool(o, "categoryNew") ?? JS.bool(o, "category_new") ?? false
        s.specs = Skjold76.specs(o["specs"]).filter { !$0.v.isEmpty }
        s.tags = Skjold76.tags(o["tags"])
        let c: Double = JS.num(o, "confidence") ?? 0
        s.confidence = Swift.min(1, Swift.max(0, c > 1 ? c / 100 : c))
        s.why = JS.str(o, "why") ?? JS.str(o, "reason") ?? ""
        s.source = JS.str(o, "source") ?? "tekst"
        s.decoded = decodedLines(JS.dict(o, "decoded") ?? JS.dict(raw, "decoded"))
        return s
    }

    /// decoded: {resistor?, smd?, cap?} – hvert felt er tekst eller et objekt med text/value/label.
    nonisolated static func decodedLines(_ o: [String: Any]?) -> [String] {
        guard let o else { return [] }
        let names: [String: String] = ["resistor": "Fargebånd", "smd": "SMD-kode", "cap": "Kondensatorkode"]
        return ["resistor", "smd", "cap"].compactMap { (k: String) -> String? in
            let label: String = names[k] ?? k
            if let s = o[k] as? String, !s.isEmpty { return label + ": " + s }
            guard let d = o[k] as? [String: Any] else { return nil }
            let from: String = JS.str(d, "code") ?? (JS.strings(d, "bands").isEmpty ? "" : JS.strings(d, "bands").joined(separator: "-"))
            let to: String = JS.str(d, "text") ?? JS.str(d, "value") ?? JS.str(d, "label") ?? ""
            if to.isEmpty { return nil }
            return label + ": " + (from.isEmpty ? to : from + " → " + to)
        }
    }

    nonisolated static func candidate(_ o: [String: Any]) -> Skj77Candidate? {
        guard let id = JS.str(o, "id"), !id.isEmpty else { return nil }
        let t: String = Skjold76.path(JS.str(o, "thumbUrl") ?? JS.str(o, "thumb"))
        // Bare serverens proxy: aldri hent direkte fra tredjepart.
        if !t.hasPrefix("/") { return nil }
        return Skj77Candidate(id: id, thumb: t, title: JS.str(o, "title") ?? "", source: JS.str(o, "source") ?? "",
                              width: JS.int(o, "width") ?? 0, height: JS.int(o, "height") ?? 0)
    }

    nonisolated static func tidyItem(_ o: [String: Any]) -> Skj77TidyItem {
        let before: [String: Any]? = JS.dict(o, "before")
        var x: Skj77TidyItem = Skj77TidyItem(id: JS.str(o, "partId") ?? JS.str(o, "id") ?? UUID().uuidString)
        x.oldName = JS.str(before, "name") ?? ""
        x.oldCategory = JS.str(before, "category") ?? ""
        var a: Skj77Suggestion = suggestion(JS.dict(o, "after") ?? [:])
        if let c = JS.num(o, "confidence") { a.confidence = Swift.min(1, Swift.max(0, c > 1 ? c / 100 : c)) }
        x.after = a
        x.error = JS.str(o, "error") ?? ""
        return x
    }

    /// «/api/skjold/files/abc.jpg?u=…&sig=…» → «abc.jpg» (filnavnet i skj_files).
    nonisolated static func fileName(_ url: String) -> String {
        guard let r = url.range(of: "/files/") else { return "" }
        let rest: String = String(url[r.upperBound...])
        return String(rest.split(separator: "?").first ?? "").removingPercentEncoding ?? ""
    }

    nonisolated static func specObject(_ specs: [Skj76Spec]) -> [String: Any] {
        var o: [String: Any] = [:]
        for s in specs {
            let k: String = s.k.trimmingCharacters(in: .whitespaces).lowercased()
            let v: String = s.v.trimmingCharacters(in: .whitespaces)
            if !k.isEmpty && !v.isEmpty { o[k] = v }
        }
        return o
    }

    nonisolated static func jsonText(_ o: [String: Any]) -> String {
        guard let d = try? JSONSerialization.data(withJSONObject: o) else { return "{}" }
        return String(decoding: d, as: UTF8.self)
    }

    /* ---------- Bruk forslaget i skjemaet ---------- */

    /// Legger specs inn i skjemaet: samme nøkkel erstattes, tomme plassholdere fjernes.
    nonisolated static func merge(specs new: [Skj76Spec], into old: [Skj76Spec]) -> [Skj76Spec] {
        var out: [Skj76Spec] = old.filter { !$0.v.trimmingCharacters(in: .whitespaces).isEmpty }
        for s in new {
            let k: String = s.k.lowercased()
            if let i = out.firstIndex(where: { $0.k.lowercased() == k }) { out[i].v = s.v } else { out.append(Skj76Spec(k: s.k, v: s.v)) }
        }
        return out
    }

    nonisolated static func merge(tags new: [String], into old: String) -> String {
        var list: [String] = old.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        for t in new where !list.contains(where: { $0.lowercased() == t.lowercased() }) { list.append(t) }
        return list.joined(separator: ", ")
    }
}
