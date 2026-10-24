import SwiftUI
import UIKit

/* ---------------- Prompt 39: Kvitteringer · «✦ På nytt» med fremdrift + ny AI-kategori ---------------- */
// Spesifikasjon: claude-code-kvittering-pa-nytt-fremdrift.md og claude-code-kvittering-ny-kategori.md.
// Fasit: Mobil Papir App.dc.html → Finans → Kvitteringer → TIL GJENNOMGANG (re, reStop, rcRe; CB, CNEW, CATS).
//
// SERVER39: POST /finans/api/receipts/:id/reanalyze {async:true} → {jobId}. Fremdrift kommer på samme realtime-kanal som køen
// ({jobId, step:'upload'|'ocr'|'llm'|'verify'|'done'|'error', pct, msg}). Appen tåler at dette mangler:
//  • 404 → POST /receipts/:id/reprocess (som før) og fremdrift som følger stegene lokalt til kvitteringen er lest.
//  • Ingen realtime-hendelser → listen hentes hvert 2. s, og jobben er ferdig når kvitteringen er tilbake i gjennomgang.

struct Rean39Job: Hashable {
    var jobId: String = ""
    /// upload | ocr | llm | verify | done | error
    var step: String = "upload"
    var pct: Int = 2
    var msg: String = ""
    var started: Date = Date()
    var sawActive: Bool = false
}

/// Kategori-tolkningen fra lesingen ({category, isNew, confidence, reason}).
struct Rc39Cat: Decodable, Hashable {
    var category: String? = nil
    var isNew: Bool? = nil
    var confidence: Double? = nil
    var reason: String? = nil
}

@MainActor
@Observable
final class Rean39Model {
    static let shared = Rean39Model()

    /// Per kvittering-id.
    var jobs: [String: Rean39Job] = [:]
    /// Felt som endret seg (gul bakgrunn i 2 s): name, amount, date, category.
    var changed: [String: Set<String>] = [:]

    @ObservationIgnored private var tickers: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var before: [String: Receipt] = [:]

    static let steps: [(String, String)] = [
        ("upload", "Laster opp bildet"),
        ("ocr", "Leser teksten (OCR)"),
        ("llm", "✦ Gemini tolker butikk, linjer og beløp"),
        ("verify", "Sjekker sum og dato"),
    ]

    static func stepIndex(_ s: String) -> Int {
        switch s {
        case "upload": return 0
        case "ocr": return 1
        case "llm": return 2
        case "verify": return 3
        case "done": return 4
        default: return -1
        }
    }

    /// Øvre grense for lokal fremdrift i hvert steg (når serveren ikke sender prosent).
    private static func cap(_ s: String) -> Int {
        switch s {
        case "upload": return 18
        case "ocr": return 44
        case "llm": return 86
        default: return 97
        }
    }

    func job(_ id: String) -> Rean39Job? { jobs[id] }

    var anyRunning: Bool { jobs.values.contains { $0.step != "error" && $0.step != "done" } }

    /* ---------- Start, avbryt, prøv igjen ---------- */

    func start(_ r: Receipt, _ model: Receipts23Model, _ store: Store) {
        if let j = jobs[r.id], j.step != "error" { return }
        Haptics.shared.tap()
        before[r.id] = r
        var j: Rean39Job = Rean39Job()
        j.msg = "Laster opp bildet"
        jobs[r.id] = j
        changed[r.id] = nil
        let id: String = r.id
        Task {
            do {
                let d: Data = try await store.api.callAt("/finans/api", "POST", "/receipts/\(id)/reanalyze",
                                                         json: ["engine": "gemini", "async": true], timeout: 30)
                let o: [String: Any] = JS.obj(d)
                if let jid = JS.str(o, "jobId") ?? JS.str(o, "id"), !jid.isEmpty {
                    self.update(id) { (x: inout Rean39Job) in x.jobId = jid }
                } else if JS.str(o, "candidateId") != nil {
                    // Eldre server leste synkront: bruk det nye resultatet og vis det.
                    let cand: String = JS.str(o, "candidateId") ?? ""
                    _ = try? await store.api.call("POST", "/receipts/\(id)/reanalyze/apply", json: ["candidateId": cand, "keep": "new"])
                    await self.finish(id, model, store)
                    return
                }
            } catch let e as APIError {
                if e.status == 404 || e.status == 405 {
                    // Eldre server: les kvitteringen på nytt i køen.
                    _ = try? await store.api.call("POST", "/receipts/\(id)/reprocess")
                } else {
                    // Prompt 50: lesbar feil (502/503/504/404) i stedet for «Feil 502» (Receipt50Reread.swift).
                    self.fail(id, Receipt50Err.text(e).text)
                    return
                }
            } catch {
                self.fail(id, "Gemini svarte ikke")
                return
            }
            self.startTicker(id, model, store)
        }
    }

    func cancel(_ id: String, _ store: Store) {
        Haptics.shared.tap()
        let jid: String = jobs[id]?.jobId ?? ""
        stop(id)
        withAnimation(.easeOut(duration: 0.2)) { jobs[id] = nil }
        store.flash("Avbrutt · ingenting ble endret")
        Task {
            if !jid.isEmpty {
                _ = try? await store.api.callAt("/finans/api", "POST", "/receipts/\(id)/reanalyze/\(jid)/cancel", json: [:], timeout: 10)
            }
        }
    }

    /// «Bruk lokal OCR» etter en feil.
    func localOcr(_ r: Receipt, _ model: Receipts23Model, _ store: Store) {
        stop(r.id)
        jobs[r.id] = nil
        Task {
            _ = try? await store.api.call("POST", "/receipts/\(r.id)/reprocess", json: ["engine": "local"])
            store.flash("Leser med lokal OCR …")
            await model.load(store)
        }
    }

    /* ---------- Fremdrift ---------- */

    /// Realtime-hendelse med jobId + step/pct. Returnerer true hvis den gjaldt en av jobbene her.
    @discardableResult
    func realtime(_ o: [String: Any], _ store: Store) -> Bool {
        let jid: String = JS.str(o, "jobId") ?? JS.str(o, "id") ?? ""
        let rid: String = JS.str(o, "receiptId") ?? ""
        guard let key = jobs.first(where: { (e: (key: String, value: Rean39Job)) -> Bool in
            (!jid.isEmpty && e.value.jobId == jid) || (!rid.isEmpty && e.key == rid)
        })?.key else { return false }
        let step: String = JS.str(o, "step") ?? ""
        let pct: Int? = JS.int(o, "pct") ?? JS.int(o, "progress")
        let msg: String = JS.str(o, "msg") ?? JS.str(o, "message") ?? ""
        if step == "error" {
            fail(key, msg.isEmpty ? "Gemini svarte ikke" : msg)
            return true
        }
        update(key) { (x: inout Rean39Job) in
            if !step.isEmpty && step != "done" { x.step = step }
            if let pct { x.pct = Swift.max(x.pct, Swift.min(100, pct)) }
            if !msg.isEmpty { x.msg = msg }
        }
        if step == "done" {
            let model: Receipts23Model? = Rean39Model.models[key]
            Task { if let model { await self.finish(key, model, store) } }
        }
        return true
    }

    static var models: [String: Receipts23Model] = [:]

    private func startTicker(_ id: String, _ model: Receipts23Model, _ store: Store) {
        Rean39Model.models[id] = model
        tickers[id]?.cancel()
        tickers[id] = Task { @MainActor in
            var n: Int = 0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 400_000_000)
                if Task.isCancelled { return }
                guard let j = self.jobs[id], j.step != "error" else { return }
                self.advance(id, j)
                n += 1
                // Hvert 2. s: er kvitteringen lest ferdig (tilbake i gjennomgang med nye verdier)?
                if n % 5 == 0 {
                    await model.load(store)
                    if self.isDone(id, model) { await self.finish(id, model, store); return }
                }
                if Date().timeIntervalSince(j.started) > 150 {
                    self.fail(id, Receipt50Err.text(status: 504, code: "timeout", message: "").text) // prompt 50
                    return
                }
            }
        }
    }

    /// Lokal fremdrift: kryper mot taket i steget, og går til neste steg ved taket.
    private func advance(_ id: String, _ j: Rean39Job) {
        let c: Int = Rean39Model.cap(j.step)
        let order: [String] = ["upload", "ocr", "llm", "verify"]
        update(id) { (x: inout Rean39Job) in
            if x.pct < c {
                x.pct = Swift.min(c, x.pct + Swift.max(1, (c - x.pct) / 6))
            } else if let i = order.firstIndex(of: x.step), i + 1 < order.count {
                x.step = order[i + 1]
                x.msg = Rean39Model.steps[i + 1].1
            }
        }
    }

    private func isDone(_ id: String, _ model: Receipts23Model) -> Bool {
        let inAi: Bool = model.jobs.contains { $0.id == id } || model.active && !(model.review.contains { $0.id == id })
        if inAi { update(id) { (x: inout Rean39Job) in x.sawActive = true }; return false }
        guard let now = model.review.first(where: { $0.id == id }) ?? model.booked.first(where: { $0.id == id }) else { return false }
        guard let old = before[id] else { return true }
        if jobs[id]?.sawActive == true { return true }
        if now != old { return true }
        // Ingen realtime-hendelser og ingen synlig endring: ferdig etter 45 s uten at kvitteringen er i kø/analyse.
        if let j = jobs[id], Date().timeIntervalSince(j.started) > 45 { return true }
        return false
    }

    private func finish(_ id: String, _ model: Receipts23Model, _ store: Store) async {
        stop(id)
        await model.load(store)
        let now: Receipt? = model.review.first(where: { $0.id == id }) ?? model.booked.first(where: { $0.id == id })
        var diff: Set<String> = []
        if let a = before[id], let b = now {
            if (a.merchant ?? "") != (b.merchant ?? "") { diff.insert("name") }
            if a.total != b.total { diff.insert("amount") }
            if (a.date ?? "") != (b.date ?? "") { diff.insert("date") }
            if a.categoryId != b.categoryId { diff.insert("category") }
        }
        update(id) { (x: inout Rean39Job) in
            x.step = "done"
            x.pct = 100
        }
        Haptics.shared.success()
        var c: Double = now?.confidence ?? 0
        if c <= 1 { c *= 100 }
        let sure: String = c > 0 ? " · \(Int(c.rounded())) % sikker" : ""
        store.flash("✦ Glimt har analysert på nytt" + sure)
        if UIApplication.shared.applicationState != .active {
            let shop: String = now?.merchant ?? before[id]?.merchant ?? ""
            LocalNotify.post("Glimt", shop.isEmpty ? "Kvitteringen er lest på nytt" : "Kvitteringen fra \(shop) er lest på nytt", id: "rean-" + id, group: "finans")
        }
        withAnimation(.easeOut(duration: 0.2)) {
            jobs[id] = nil
            changed[id] = diff.isEmpty ? nil : diff
        }
        before[id] = nil
        if !diff.isEmpty {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            withAnimation(.easeOut(duration: 0.4)) { changed[id] = nil }
        }
    }

    private func fail(_ id: String, _ msg: String) {
        stop(id)
        Haptics.shared.warning()
        update(id) { (x: inout Rean39Job) in
            x.step = "error"
            x.msg = msg
        }
    }

    private func stop(_ id: String) {
        tickers[id]?.cancel()
        tickers[id] = nil
    }

    private func update(_ id: String, _ f: (inout Rean39Job) -> Void) {
        guard var j = jobs[id] else { return }
        f(&j)
        jobs[id] = j
    }
}

/* ---------- Visning ---------- */

/// Fremdriftspanelet under knappene: steg + prosent, 6 px linje, steglisten og Avbryt (eller feil med Prøv igjen / Bruk lokal OCR).
struct Rean39Panel: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let r: Receipt
    let model: Receipts23Model
    let job: Rean39Job

    var body: some View {
        let err: Bool = job.step == "error"
        let cur: Int = Rean39Model.stepIndex(job.step)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(err ? "✕ " + (job.msg.isEmpty ? "Gemini svarte ikke" : job.msg) : title)
                    .font(PF.ui(13.5, .bold)).foregroundStyle(err ? Rc39.bad : p.ink).lineLimit(2)
                Spacer(minLength: 6)
                if !err { Text("\(job.pct) %").font(PF.mono(13)).foregroundStyle(p.lab) }
            }
            GeometryReader { (g: GeometryProxy) in
                ZStack(alignment: .leading) {
                    Capsule().fill(p.line)
                    Capsule().fill(err ? Rc39.bad : p.lab).frame(width: g.size.width * CGFloat(job.pct) / 100)
                }
            }
            .frame(height: 6)
            .animation(.easeOut(duration: 0.35), value: job.pct)
            VStack(alignment: .leading, spacing: 5) {
                ForEach(0..<Rean39Model.steps.count, id: \.self) { (i: Int) in
                    Rean39StepRow(text: Rean39Model.steps[i].1, state: stepState(i, cur: cur, err: err))
                }
            }
            if err {
                HStack(spacing: 8) {
                    Button { Rean39Model.shared.start(r, model, store) } label: {
                        Text("Prøv igjen").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                            .padding(.horizontal, 14).frame(minHeight: 36).background(p.ink, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    Button { Rean39Model.shared.localOcr(r, model, store) } label: {
                        Text("Bruk lokal OCR").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                            .padding(.horizontal, 14).frame(minHeight: 36).overlay(Capsule().stroke(p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            } else {
                Button { Rean39Model.shared.cancel(r.id, store) } label: {
                    Text("Avbryt").font(PF.ui(13, .bold)).foregroundStyle(p.mut)
                        .padding(.horizontal, 14).frame(minHeight: 34).overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
        .transition(.opacity)
    }

    private var title: String {
        let i: Int = Rean39Model.stepIndex(job.step)
        if i >= 0 && i < Rean39Model.steps.count { return Rean39Model.steps[i].1 }
        return job.msg.isEmpty ? "Glimt analyserer på nytt" : job.msg
    }

    /// 0 = venter, 1 = pågår, 2 = ferdig, 3 = feil.
    private func stepState(_ i: Int, cur: Int, err: Bool) -> Int {
        if err { return i == 2 ? 3 : (i < 2 ? 2 : 0) }
        if i < cur { return 2 }
        if i == cur { return 1 }
        return 0
    }
}

struct Rean39StepRow: View {
    @Environment(\.paper) private var p
    let text: String
    /// 0 venter · 1 pågår · 2 ferdig · 3 feil
    let state: Int

    var body: some View {
        HStack(spacing: 8) {
            Text(mark).font(PF.ui(12.5, .bold)).foregroundStyle(color).frame(width: 14)
            Text(text).font(PF.ui(12.5, state == 1 ? .bold : .regular)).foregroundStyle(state == 0 ? p.mut : p.ink).lineLimit(1)
        }
    }

    private var mark: String {
        switch state {
        case 2: return "✓"
        case 1: return "•"
        case 3: return "✕"
        default: return "·"
        }
    }

    private var color: Color {
        switch state {
        case 2: return p.pos
        case 1: return p.lab
        case 3: return Rc39.bad
        default: return p.mut
        }
    }
}

/// Tynn rød linje under en lukket rad mens analysen pågår.
struct Rean39Line: View {
    @Environment(\.paper) private var p
    let pct: Int

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            Rectangle().fill(p.lab).frame(width: g.size.width * CGFloat(pct) / 100, height: 2)
        }
        .frame(height: 2)
        .animation(.easeOut(duration: 0.35), value: pct)
    }
}

enum Rc39 {
    /// Gul markering av felt som endret seg (2 s).
    static let highlight: Color = Color(hex: "#f6e7a8")
    /// Feil (rødt kryss og linje).
    static let bad: Color = Color(hex: "#c0392b")

    /// «✦ Analyserer på nytt … 42 %» eller vanlig meta (+ «✦ ny kategori «Skole og studier»» når AI lagde en ny).
    @MainActor static func meta(_ r: Receipt) -> String {
        if let j = Rean39Model.shared.jobs[r.id] {
            if j.step == "error" { return "✕ " + (j.msg.isEmpty ? "Gemini svarte ikke" : j.msg) }
            return "✦ Glimt analyserer på nytt … \(j.pct) %"
        }
        var s: String = Receipts23Line.meta(r)
        if let c = r.aiCategory, c.isNew == true, let n = c.category, !n.isEmpty { s += " · ✦ ny kategori «\(n)»" }
        return s
    }
}
