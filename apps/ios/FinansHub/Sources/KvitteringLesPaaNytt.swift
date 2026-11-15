import SwiftUI
import UIKit
import os

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
        ("llm", "✦ Glimt tolker lokalt butikk, linjer og beløp"),
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
                                                         json: ["engine": "ollama", "async": true], timeout: 30)
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
                    // Prompt 50: lesbar feil (502/503/504/404) i stedet for «Feil 502» (KvitteringLesPaaNytt.swift).
                    self.fail(id, Receipt50Err.text(e).text)
                    return
                }
            } catch {
                self.fail(id, "Glimt svarte ikke")
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
            fail(key, msg.isEmpty ? "Glimt svarte ikke" : msg)
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
                Text(err ? "✕ " + (job.msg.isEmpty ? "Glimt svarte ikke" : job.msg) : title)
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
            if j.step == "error" { return "✕ " + (j.msg.isEmpty ? "Glimt svarte ikke" : j.msg) }
            return "✦ Glimt analyserer på nytt … \(j.pct) %"
        }
        var s: String = Receipts23Line.meta(r)
        if let c = r.aiCategory, c.isNew == true, let n = c.category, !n.isEmpty { s += " · ✦ ny kategori «\(n)»" }
        return s
    }
}

/* ---------------- «✦ Les på nytt» (lokalt; prompt 52: Gemini leser aldri kvitteringer) ---------------- */

/// Ett lesresultat (det forrige eller det nye fra Gemini).
struct ReadResult: Hashable {
    struct Item: Hashable { var name: String; var amount: Double? }
    var merchant = ""
    var date = ""
    var total: Double?
    var items: [Item] = []
    var confidence: Double?
    var engine = ""

    init(_ o: [String: Any]?) {
        merchant = JS.str(o, "merchant") ?? ""
        date = JS.str(o, "date") ?? ""
        total = JS.num(o, "total")
        confidence = JS.num(o, "confidence")
        engine = JS.str(o, "engine") ?? JS.str(o, "provider") ?? ""
        items = JS.list(o, "items").map { i in
            Item(name: JS.str(i, "name") ?? JS.str(i, "description") ?? "", amount: JS.num(i, "amount") ?? JS.num(i, "price"))
        }
    }

    /// Sikkerhet som 0–100 (serveren kan sende 0–1 eller 0–100).
    var confidencePct: Int? {
        guard let c = confidence else { return nil }
        return Int((c <= 1 ? c * 100 : c).rounded())
    }
}

struct ReanalyzeResult: Identifiable, Hashable {
    var id: String { receiptId + candidateId }
    var receiptId: String
    var candidateId: String
    var previous: ReadResult
    var result: ReadResult
}

extension Store {
    /// Skal knappen vises? Serveren sier det med canReanalyze; eldre servere: feil, lav sikkerhet eller usikker Ollama.
    func canReanalyze(_ r: Receipt) -> Bool {
        if let c = r.canReanalyze { return c }
        let minC = Double(boot?.settings.minConf ?? 85) / 100
        let conf = r.confidence ?? 0
        let low = (conf <= 1 ? conf : conf / 100) < minC
        let ollama = (r.provider ?? r.engine ?? "").lowercased().contains("ollama")
        return r.status == "error" || r.error != nil || low || (ollama && r.flag != nil)
    }

    /// Sender originalbildet til Gemini på nytt (POST /receipts/:id/reanalyze) og gir begge resultatene.
    /// Prompt 50: som jobb med polling i stedet for ett synkront kall på opptil 120 s (det ga 502 fra proxyen), KvitteringLesPaaNytt.swift.
    func reanalyze(_ id: String, small: Bool = false, engine: String = "ollama") async throws -> ReanalyzeResult {
        try await reanalyze50(id, engine: engine, small: small)
    }

    /// Beholder det nye eller det forrige resultatet.
    func applyReanalyze(_ r: ReanalyzeResult, keepNew: Bool) {
        run {
            try await self.api.call("POST", "/receipts/\(r.receiptId)/reanalyze/apply", json: ["candidateId": r.candidateId, "keep": keepNew ? "new" : "old"])
            try await self.loadReceipts()
            self.flash(keepNew ? "Det nye resultatet er brukt" : "Det forrige resultatet er beholdt")
        }
    }
}

/// Knappen på bekreftelsessiden og i køen. Åpner sammenligningen når Gemini har svart.
struct ReanalyzeButton: View {
    @Environment(Store.self) private var store
    let receiptId: String
    var compact = false
    /// Prompt 50: primærknapp (blå #4f63ff, hvit tekst) i «Lav sikkerhet»-boksen; grå bare når den faktisk er av.
    var primary50 = false
    var disabledWhy: String? = nil
    /// Prompt 50: «tesseract» = sekundærknappen «Les med lokal OCR».
    /// Prompt 52: «ollama» (lokalt) som standard – Gemini leser aldri kvitteringer.
    var engine50: String = "ollama"
    @State private var busy = false
    @State private var shown: ReanalyzeResult?

    private var ocr50: Bool { engine50 == "tesseract" }
    private var off50: Bool { disabledWhy != nil }

    private var title50: String {
        if ocr50 { return busy ? "Leser med lokal OCR …" : "Les med lokal OCR" }
        if busy { return "Glimt leser lokalt …" }
        if primary50 { return "✦ Les på nytt" }
        return "Les på nytt"
    }

    var body: some View {
        if primary50 || ocr50 { paper50 } else { classic }
    }

    /// Prompt 50: knappene i boksen med temafarger (Receipt50Look). Primær først, sekundær med kant.
    private var paper50: some View {
        let p: PaperPalette = PaperSkin.palette ?? PaperPalette.light
        let primary: Bool = primary50 && !off50
        return Button { start() } label: {
            HStack(spacing: 6) {
                if busy { ProgressView().controlSize(.small).tint(primary ? .white : p.ink) }
                Text(title50).font(PF.ui(13.5, .semibold)).lineLimit(1).minimumScaleFactor(0.85)
            }
            .foregroundStyle(primary ? Color.white : (off50 ? p.mut : p.ink))
            .padding(.horizontal, 14)
            .frame(minHeight: 40)
            .background(primary ? Receipt50Look.acc : (off50 ? Receipt50Look.line(p) : p.card), in: Capsule())
            .overlay(Capsule().stroke(primary ? Color.clear : Receipt50Look.line(p), lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(busy || off50)
        .accessibilityHint(disabledWhy ?? "")
        .sheet(item: $shown) { r in
            ReanalyzeCompare(result: r).presentationDetents([.large]).skinSheetBackground()
        }
    }

    private var classic: some View {
        Button { start() } label: {
            HStack(spacing: 8) {
                if busy { ProgressView().controlSize(.small) } else { Text("✦").fontWeight(.bold) }
                Text(title50).fontWeight(.semibold).lineLimit(1)
            }
            .font(compact ? .footnote : .body)
            .foregroundStyle(Color.accentLight)
            .padding(.horizontal, compact ? 12 : 16)
            .frame(maxWidth: compact ? nil : .infinity, minHeight: compact ? 34 : 50)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .glass(compact ? 17 : 25)
        .disabled(busy)
        .sheet(item: $shown) { r in
            ReanalyzeCompare(result: r).presentationDetents([.large]).skinSheetBackground()
        }
    }

    private func start() {
        guard !busy else { return }
        Haptics.shared.tap()
        busy = true
        Task {
            do {
                let r = try await store.reanalyze(receiptId, engine: engine50)
                busy = false
                shown = r
            } catch {
                busy = false
                // Prompt 50: forklaring brukeren kan handle på i stedet for «Feil 502» (KvitteringLesPaaNytt.swift).
                store.flash(Receipt50Err.text(error).text)
            }
        }
    }
}

/// Forrige og nytt resultat side om side, med valg av hvilket som beholdes.
struct ReanalyzeCompare: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let result: ReanalyzeResult

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Sammenlign").font(.title2.weight(.bold))
                    Spacer()
                    Button { dismiss() } label: { Text("Lukk").fontWeight(.semibold).foregroundStyle(Color.accentLight).frame(height: 44) }.buttonStyle(.plain)
                }
                Text("Velg hvilket resultat som skal beholdes. Originalbildet er lest på nytt lokalt.")
                    .font(.footnote).foregroundStyle(Color.skinFg.opacity(0.65))
                HStack(alignment: .top, spacing: 10) {
                    column("Forrige", result.previous, fresh: false)
                    column("Lokal AI", result.result, fresh: true)
                }
                HStack(spacing: 10) {
                    Button { store.applyReanalyze(result, keepNew: false); dismiss() } label: {
                        Text("Behold forrige").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 52)
                    }
                    .buttonStyle(.plain).glass(26)
                    Button { store.applyReanalyze(result, keepNew: true); dismiss() } label: {
                        Text("Bruk nytt").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 52)
                    }
                    .buttonStyle(.plain).glass(26, tint: .accent)
                }
            }
            .padding(18)
        }
    }

    private func column(_ title: String, _ r: ReadResult, fresh: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(.footnote.weight(.bold)).foregroundStyle(fresh ? Color.accentLight : Color.skinFg.opacity(0.7))
                Spacer(minLength: 0)
                if let c = r.confidencePct { Text("\(c) %").font(.caption.weight(.semibold)).foregroundStyle(Color.skinFg.opacity(0.6)) }
            }
            if !r.engine.isEmpty { Text(r.engine).font(.caption2).foregroundStyle(Color.skinFg.opacity(0.5)) }
            Text(r.merchant.isEmpty ? "–" : r.merchant).fontWeight(.semibold).lineLimit(2)
            Text(r.date.isEmpty ? "–" : ddmm(r.date)).font(.footnote).foregroundStyle(Color.skinFg.opacity(0.7))
            Text(r.total.map { n2($0) + " kr" } ?? "–").font(.system(.body, design: .monospaced).weight(.semibold))
            if !r.items.isEmpty {
                Divider().overlay(Color.skinFg.opacity(0.12))
                ForEach(Array(r.items.prefix(12).enumerated()), id: \.offset) { _, it in
                    HStack(alignment: .top) {
                        Text(it.name).font(.caption).lineLimit(2)
                        Spacer(minLength: 4)
                        Text(it.amount.map(n2) ?? "").font(.system(.caption, design: .monospaced))
                    }
                }
            }
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .topLeading)
        .glass(18, tint: fresh ? Color.accent.opacity(0.25) : nil)
    }
}

/* ---------------- Prompt 50: «Glimt leser kvitteringen på nytt» uten 502, og lesbare feil ----------------
 claude-code-kvittering-les-pa-nytt-502.md (iOS-delen) og claude-code-finans-kvittering-fargefeil.md (iOS-delen).
 Rotårsak i appen: «Les på nytt» (Fin40) og «✦ Analyser på nytt med Gemini» kalte POST /finans/api/receipts/:id/reanalyze
 med async:false og ventet opptil 120 s på ett åpent HTTP-kall. Full oppløsning + Gemini tar ofte lenger enn proxyens
 tidsgrense, så proxyen svarte 502 (og serveren selv svarer 502 når modellen feiler). Appen viste da «Feil 502».
 Nå: jobb (async:true, apply:false) → 202 {jobId} med en gang, så GET /finans/api/receipts/reanalyze/:jobId hvert 1,5 s.
 Ingen forespørsel holdes åpen mer enn noen sekunder. Eldre server som svarer synkront ({candidateId}) virker som før.
 «Les mindre versjon» sender small:true og maxSide:1024 (serveren nedskalerer; ukjente felt ignoreres av eldre servere).
 Feilmeldinger (Receipt50Err): 502/504/tidsavbrudd · 503 modell_utilgjengelig · 404 bilde mangler · annet «kode X». */

enum Receipt50Err {
    static let log: Logger = Logger(subsystem: "no.kristo.finanshub", category: "receipt50")

    /// Melding brukeren kan handle på, og om «Les mindre versjon» skal tilbys.
    nonisolated static func text(status: Int, code: String?, message: String) -> (text: String, small: Bool) {
        let c: String = (code ?? "").lowercased()
        let m: String = message.lowercased()
        if c == "modell_utilgjengelig" || c == "model_unavailable" || c == "ollama_down" || status == 503 {
            return ("Glimt er ikke tilgjengelig akkurat nå. Prøv igjen om litt.", false)
        }
        if status == 404 || c == "bilde_mangler" || c == "original_mangler" || c == "missing_original" || m.contains("originalbildet") {
            return ("Originalbildet finnes ikke lenger. Last opp kvitteringen på nytt.", false)
        }
        if status == 502 || status == 504 || c == "timeout" || c == "tidsavbrudd" || m.contains("svarte ikke") || m.contains("tidsavbrudd") || m.contains("for lang tid") {
            return ("Glimt brukte for lang tid på bildet. Prøv igjen, eller les en mindre versjon.", true)
        }
        // Tydelige meldinger fra serveren (f.eks. «Legg inn en Gemini-nøkkel …», «Kvitteringen leses fortsatt»).
        if [400, 409, 422].contains(status) && !message.isEmpty && !message.hasPrefix("Feil ") { return (message, false) }
        let k: String = status > 0 ? String(status) : (c.isEmpty ? "ukjent" : c)
        return ("Noe gikk galt (kode \(k)).", false)
    }

    /// Fra en feil som kastes av API-et eller jobben. Full feil logges (ikke vist).
    static func text(_ error: Error) -> (text: String, small: Bool) {
        if let e = error as? APIError {
            log.error("reread failed status=\(e.status, privacy: .public) code=\(e.code ?? "-", privacy: .public) msg=\(e.message, privacy: .public)")
            return text(status: e.status, code: e.code, message: e.message)
        }
        log.error("reread failed \(error.localizedDescription, privacy: .public)")
        return text(status: 0, code: nil, message: error.localizedDescription)
    }

    /// Feil i en ferdig jobb: status og kode hvis serveren sender dem, ellers ut fra teksten.
    nonisolated static func jobError(_ o: [String: Any]) -> APIError {
        let msg: String = JS.str(o, "error") ?? JS.str(o, "msg") ?? JS.str(o, "text") ?? ""
        let code: String? = JS.str(o, "code") ?? JS.str(o, "kode")
        var st: Int = JS.int(o, "httpStatus") ?? JS.int(o, "statusCode") ?? 0
        if st == 0 {
            let m: String = msg.lowercased()
            if m.contains("originalbildet") { st = 404 } else if m.contains("kunne ikke lese") || m.contains("svarte ikke") { st = 502 }
        }
        return APIError(message: msg.isEmpty ? "Jobben feilet" : msg, status: st, code: code)
    }
}

extension Store {
    /// Prompt 50: les kvitteringen på nytt som jobb (ingen lange HTTP-kall). Gir begge resultatene til sammenligningen.
    func reanalyze50(_ id: String, engine: String = "ollama", small: Bool = false) async throws -> ReanalyzeResult {
        var body: [String: Any] = ["engine": engine, "async": true, "apply": false]
        if small { body["small"] = true; body["maxSide"] = 1024 }
        let d: Data = try await api.callAt("/finans/api", "POST", "/receipts/\(id)/reanalyze", json: body, timeout: 30)
        let o: [String: Any] = JS.obj(d)
        if let e = JS.str(o, "error") { throw APIError(message: e, status: 0, code: JS.str(o, "code") ?? JS.str(o, "kode")) }
        if JS.str(o, "candidateId") != nil { return Store.reanalyzeParse50(id, o) }
        guard let jid = JS.str(o, "jobId") ?? JS.str(o, "id"), !jid.isEmpty else {
            throw APIError(message: "Uventet svar fra serveren", status: 0)
        }
        return try await pollReanalyze50(id, jid)
    }

    private func pollReanalyze50(_ id: String, _ jid: String) async throws -> ReanalyzeResult {
        let start: Date = Date()
        var misses: Int = 0
        while Date().timeIntervalSince(start) < 8 * 60 {
            try await Task.sleep(nanoseconds: 1_500_000_000)
            let enc: String = jid.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? jid
            let o: [String: Any]
            do {
                o = JS.obj(try await api.callAt("/finans/api", "GET", "/receipts/reanalyze/\(enc)", timeout: 15))
                misses = 0
            } catch let e as APIError where e.status == 404 && misses == 0 {
                // Eldre server uten den egne ruten: den generelle jobbruten.
                misses += 1
                guard let x = try? await api.callAt("/finans/api", "GET", "/jobs/\(enc)", timeout: 15) else { continue }
                o = JS.obj(x)
            } catch {
                misses += 1
                if misses >= 4 { throw error }
                continue
            }
            switch JS.str(o, "status") ?? "" {
            case "done":
                return Store.reanalyzeParse50(id, JS.dict(o, "result") ?? [:])
            case "error":
                throw Receipt50Err.jobError(o)
            case "cancelled":
                throw APIError(message: "Avbrutt · ingenting ble endret", status: 409)
            default:
                continue
            }
        }
        throw APIError(message: "Glimt brukte for lang tid", status: 504, code: "timeout")
    }

    nonisolated static func reanalyzeParse50(_ id: String, _ o: [String: Any]) -> ReanalyzeResult {
        ReanalyzeResult(receiptId: id, candidateId: JS.str(o, "candidateId") ?? "",
                        previous: ReadResult(JS.dict(o, "previous")), result: ReadResult(JS.dict(o, "result")))
    }
}

/* ---------- «Lav sikkerhet»-boksen på Bekreft kvittering (fargefeil) ---------- */

/// Temafarger for boksen: sand/mørk flate, tydelig kant og ink-2-tekst (≥ 4,5:1). Ingen hardkodede blåtoner.
enum Receipt50Look {
    /// Primærknappen («✦ Analyser på nytt med Gemini») – blå med hvit tekst, som «Prøv igjen».
    static let acc: Color = Color(hex: "#4f63ff")

    static func surface2(_ p: PaperPalette) -> Color { p.dark ? Color.white.opacity(0.06) : Color(hex: "#efeadf") }
    static func line(_ p: PaperPalette) -> Color { p.dark ? p.line : Color(hex: "#ddd6c8") }
    static func ink2(_ p: PaperPalette) -> Color { p.dark ? Color(hex: "#c9c3b6") : Color(hex: "#5f5a50") }
}

/// Teksten øverst, knappene på én rad under (Gemini først).
struct Receipt50LowBox: View {
    @Environment(Store.self) private var store
    let r: Receipt

    var body: some View {
        let p: PaperPalette = PaperSkin.palette ?? PaperPalette.light
        VStack(alignment: .leading, spacing: 10) {
            Text(text).font(PF.ui(13.5)).foregroundStyle(Receipt50Look.ink2(p)).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                ReanalyzeButton(receiptId: r.id, compact: true, primary50: true, disabledWhy: store.canReanalyze(r) ? nil : (r.reanalyzeReason ?? "Kan ikke leses på nytt akkurat nå"))
                if (r.mime ?? "") != "text/plain" {
                    ReanalyzeButton(receiptId: r.id, compact: true, engine50: "tesseract")
                }
            }
            if !store.canReanalyze(r), let why = r.reanalyzeReason {
                Text(why).font(PF.ui(12)).foregroundStyle(Receipt50Look.ink2(p)).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Receipt50Look.surface2(p), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Receipt50Look.line(p), lineWidth: 1))
    }

    private var text: String {
        let by: String = r.provider ?? r.engine ?? "lesingen"
        let pct: String = r.confidence.map { c in " (\(Int(((c <= 1 ? c * 100 : c)).rounded())) %)" } ?? ""
        let flag: String = r.flag ?? r.error ?? ""
        return "Lav sikkerhet fra \(by)\(pct)." + (flag.isEmpty ? "" : " " + flag)
    }
}
