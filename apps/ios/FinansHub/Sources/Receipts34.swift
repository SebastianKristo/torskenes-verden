import SwiftUI
import UIKit

/* ---------------- Prompt 34: Kvitteringer → «✦ ANALYSERES AV AI · N» ----------------
   Fasit: design/Mobil Papir App.dc.html → Kvitteringer → kv.ai / rcAiL() / rcAiTick() og
   prompts/prompt-34-pakke/claude-code-chat-skanninger-mappe.md («Kvitteringer (mobil): Analyseres av AI»).
   Øverst under Ta bilde / Bilder / Filer og over KØ og TIL GJENNOMGANG: ett kort per kvittering som leses nå, med miniatyr og rød
   skannelinje, «Leser kvittering …» → butikk, beløp når det er lest, undertekst (filnavn → «6 varelinjer» → «Mat og dagligvarer ·
   94 % sikker»), modell-chip, fremdriftslinje og stegliste. «Følg i Chat ›» åpner samtalen i mappen «Kvitteringer og skanninger»,
   «Avbryt» stopper jobben. Ferdig: toast «✦ Kvittering lest · KIWI Majorstuen» med dobbel haptikk.

   Data (SERVER34): GET /finans/api/receipts/analyzing → {count, items:[{id, receiptId, file, thumb, status:'queued'|'analyzing',
   model, progress, step:'upload'|'read'|'fields'|'lines'|'category', stepLabel, partial:{store, sum, lines, category, confidence},
   statusText, jobId, chatId, cancellable}]}, flettet med jobbene pending/processing fra GET /finans/api/receipts/jobs (eldre server).
   Avbryt: POST /finans/api/receipts/:id/cancel-ai (kvitteringen går til Til godkjenning), ellers POST /api/ai/jobs/:jobId/cancel. */

struct Receipt34Ai: Identifiable, Equatable {
    var id: String
    var file: String = ""
    var thumb: String = ""
    var model: String = ""
    var progress: Int = 0
    /// 0 Lastet opp · 1 Leser bildet · 2 Finner butikk, dato og sum · 3 Leser varelinjer · 4 Foreslår kategori
    var step: Int = 1
    var store: String = ""
    var sum: Double? = nil
    var lines: Int = 0
    var category: String = ""
    var confidence: Int = 0
    var chatId: String = ""
    var jobId: String = ""

    static let steps: [String] = ["Lastet opp", "Leser bildet", "Finner butikk, dato og sum", "Leser varelinjer", "Foreslår kategori"]

    var title: String { store.isEmpty || step < 2 ? "Leser kvittering …" : store }

    var subtitle: String {
        if step >= 4 && !category.isEmpty {
            return confidence > 0 ? category + " · " + String(confidence) + " % sikker" : category
        }
        if step >= 3 && lines > 0 { return String(lines) + " varelinjer" }
        return file.isEmpty ? "Kvittering" : file
    }

    var amount: String {
        guard let sum, step >= 2 else { return "" }
        return "−" + Receipt34Ai.kr(sum)
    }

    static func kr(_ v: Double) -> String {
        let f: NumberFormatter = NumberFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.numberStyle = .decimal
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f.string(from: NSNumber(value: v)) ?? String(format: "%.2f", v)
    }

    /// Steget som tall: fra «step» (tall eller tekst) eller fremdriften.
    static func stepOf(_ o: [String: Any], progress: Int) -> Int {
        if let n = JS.int(o, "step"), n >= 0 && n <= 4 { return n }
        switch (JS.str(o, "step") ?? "").lowercased() {
        case "upload": return 0
        case "read": return 1
        case "fields": return 2
        case "lines": return 3
        case "category": return 4
        default: break
        }
        let t: String = (JS.str(o, "stepLabel") ?? JS.str(o, "step") ?? JS.str(o, "statusText") ?? "").lowercased()
        if t.contains("kategori") { return 4 }
        if t.contains("varelin") || t.contains("linjer") { return 3 }
        if t.contains("butikk") || t.contains("sum") || t.contains("dato") { return 2 }
        if t.contains("leser") || t.contains("bilde") { return 1 }
        return Swift.min(4, Swift.max(1, progress / 20))
    }

    static func from(_ raw: [String: Any]) -> Receipt34Ai? {
        guard let id = JS.str(raw, "receiptId") ?? JS.str(raw, "id") else { return nil }
        let part: [String: Any] = JS.dict(raw, "partial") ?? JS.dict(raw, "result") ?? [:]
        var r: Receipt34Ai = Receipt34Ai(id: id)
        r.file = JS.str(raw, "file") ?? JS.str(raw, "filename") ?? JS.str(raw, "name") ?? ""
        r.thumb = JS.str(raw, "thumb") ?? JS.str(raw, "thumbUrl") ?? JS.str(raw, "thumbnail") ?? ""
        r.model = JS.str(raw, "model") ?? JS.str(raw, "provider") ?? ""
        let p: Int = JS.int(raw, "progress") ?? 0
        r.progress = Swift.max(0, Swift.min(100, p))
        r.step = Receipt34Ai.stepOf(raw, progress: r.progress)
        r.store = JS.str(part, "store") ?? JS.str(part, "merchant") ?? JS.str(raw, "merchant") ?? ""
        r.sum = JS.num(part, "sum") ?? JS.num(part, "total") ?? JS.num(raw, "total")
        r.lines = JS.int(part, "lines") ?? JS.int(part, "lineCount") ?? (part["lines"] as? [Any])?.count ?? 0
        r.category = JS.str(part, "category") ?? JS.str(part, "categoryName") ?? ""
        let c: Double = JS.num(part, "confidence") ?? JS.num(raw, "confidence") ?? 0
        r.confidence = Int((c <= 1 ? c * 100 : c).rounded())
        r.chatId = JS.str(raw, "chatId") ?? JS.str(raw, "chat_id") ?? ""
        r.jobId = JS.str(raw, "jobId") ?? ""
        return r
    }

    /// Fletter to kilder: verdiene som finnes i b vinner.
    func merged(_ b: Receipt34Ai) -> Receipt34Ai {
        var r: Receipt34Ai = self
        if !b.file.isEmpty { r.file = b.file }
        if !b.thumb.isEmpty { r.thumb = b.thumb }
        if !b.model.isEmpty { r.model = b.model }
        if b.progress > r.progress { r.progress = b.progress }
        if b.step > r.step { r.step = b.step }
        if !b.store.isEmpty { r.store = b.store }
        if b.sum != nil { r.sum = b.sum }
        if b.lines > 0 { r.lines = b.lines }
        if !b.category.isEmpty { r.category = b.category }
        if b.confidence > 0 { r.confidence = b.confidence }
        if !b.chatId.isEmpty { r.chatId = b.chatId }
        if !b.jobId.isEmpty { r.jobId = b.jobId }
        return r
    }
}

@MainActor
@Observable
final class Receipts34AiModel {
    static let shared = Receipts34AiModel()

    var items: [Receipt34Ai] = []
    @ObservationIgnored private var cancelled: Set<String> = []

    /// Kalles fra Receipts23Model.load med jobbene som leses nå (pending/processing fra /receipts/jobs).
    func take(_ raw: [[String: Any]], _ store: Store) async {
        var map: [String: Receipt34Ai] = [:]
        var order: [String] = []
        func add(_ r: Receipt34Ai) {
            if cancelled.contains(r.id) { return }
            if let old = map[r.id] { map[r.id] = old.merged(r) } else { map[r.id] = r; order.append(r.id) }
        }
        for o in raw { if let r = Receipt34Ai.from(o) { add(r) } }
        // SERVER34: steg, modell og delresultater (butikk, sum, varelinjer …) for alt som analyseres eller venter.
        if let d = try? await store.api.call("GET", "/receipts/analyzing") {
            for o in Receipts34AiModel.rows(d) { if let r = Receipt34Ai.from(o) { add(r) } }
        }
        let next: [Receipt34Ai] = order.compactMap { map[$0] }
        finished(next, store)
        items = next
    }

    /// Lister i formene [..], {items:[..]}, {receipts:[..]}, {jobs:[..]}.
    static func rows(_ d: Data) -> [[String: Any]] {
        let any: Any? = try? JSONSerialization.jsonObject(with: d)
        if let l = any as? [Any] { return l.compactMap { $0 as? [String: Any] } }
        let o: [String: Any] = (any as? [String: Any]) ?? [:]
        for k in ["items", "receipts", "jobs", "data"] {
            let l: [[String: Any]] = JS.list(o, k)
            if !l.isEmpty { return l }
        }
        return []
    }

    /// Kvitteringer som var under analyse og nå er borte: «✦ Kvittering lest · butikk» og dobbel haptikk.
    private func finished(_ next: [Receipt34Ai], _ store: Store) {
        let ids: Set<String> = Set(next.map(\.id))
        let done: [Receipt34Ai] = items.filter { !ids.contains($0.id) && !cancelled.contains($0.id) }
        guard let first = done.first else { return }
        let name: String = first.store.isEmpty ? "ny kvittering" : first.store
        let more: String = done.count > 1 ? " + " + String(done.count - 1) : ""
        Haptic34.double()
        store.paperHint = "✦ Kvittering lest · " + name + more
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            if store.paperHint?.hasPrefix("✦ Kvittering lest") == true { store.paperHint = nil }
        }
    }

    func cancel(_ r: Receipt34Ai, _ store: Store) {
        Haptic34.light()
        cancelled.insert(r.id)
        items.removeAll { $0.id == r.id }
        let job: String = r.jobId
        Task {
            do {
                try await store.api.call("POST", "/receipts/" + Cal27Model.enc(r.id) + "/cancel-ai")
                store.flash("Avbrutt · kvitteringen ligger i Til gjennomgang")
            } catch {
                if !job.isEmpty { _ = try? await store.api.callAt("/api", "POST", "/ai/jobs/" + Cal27Model.enc(job) + "/cancel", json: [:], timeout: 10) }
            }
        }
    }

    /// «Følg i Chat ›»: samtalen i «Kvitteringer og skanninger» (eller mappen, hvis serveren ikke har gitt samtale-id ennå).
    func follow(_ r: Receipt34Ai, _ store: Store) {
        Haptic34.light()
        let s: ChatStore27 = ChatStore27.shared
        if !r.chatId.isEmpty {
            let title: String = (r.store.isEmpty ? "Ny kvittering" : r.store) + " · leser …"
            let sum: ChatSummary27 = ChatSummary27(id: r.chatId, title: title, model: r.model, updatedAt: Date(), pinned: false, folderId: Chat34Scans.folderName)
            s.open(sum, store)
        } else {
            Chat34Scans.openFolder(store)
        }
        store.paperGo("chat")
    }
}

/* ---------- Visningen ---------- */

struct Receipts34AiSection: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Receipts34AiModel { Receipts34AiModel.shared }

    var body: some View {
        let list: [Receipt34Ai] = m.items
        if !list.isEmpty {
            HStack(spacing: 8) {
                Glimt31Mark(size: 16, state: .thinking)
                PLabel(text: "Analyseres av AI · " + String(list.count))
            }
            .padding(.top, 6).padding(.horizontal, 4)
            VStack(spacing: 10) {
                ForEach(list) { (r: Receipt34Ai) in
                    Receipt34AiCard(r: r)
                }
            }
        }
    }
}

struct Receipt34AiCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let r: Receipt34Ai

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            head
            Receipt34Bar(progress: r.progress)
            Receipt34Steps(step: r.step, progress: r.progress)
            actions
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(p.lab.opacity(0.22), lineWidth: 1))
    }

    private var head: some View {
        HStack(spacing: 12) {
            Receipt34Thumb(path: r.thumb, progress: r.progress)
            VStack(alignment: .leading, spacing: 2) {
                Text(r.title).font(PF.ui(15, .bold)).foregroundStyle(p.ink).lineLimit(1)
                Text(r.subtitle).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                if !r.model.isEmpty {
                    Text(r.model).font(PF.mono(10.5)).foregroundStyle(p.mut)
                        .padding(.horizontal, 8).padding(.vertical, 1)
                        .background(p.bg, in: Capsule())
                        .padding(.top, 2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !r.amount.isEmpty {
                Text(r.amount).font(PF.mono(16)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
            }
        }
    }

    private var actions: some View {
        HStack(spacing: 8) {
            Button { Receipts34AiModel.shared.follow(r, store) } label: {
                Text("Følg i Chat ›").font(PF.ui(13, .bold)).foregroundStyle(p.ink).lineLimit(1)
                    .padding(.horizontal, 14).frame(height: 36)
                    .overlay(Capsule().strokeBorder(p.line, lineWidth: 1))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            Button { Receipts34AiModel.shared.cancel(r, store) } label: {
                Text("Avbryt").font(PF.ui(13, .bold)).foregroundStyle(p.lab)
                    .padding(.horizontal, 14).frame(height: 36)
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}

/// Miniatyr 46 × 58 med rød skannelinje som glir over bildet.
struct Receipt34Thumb: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.accessibilityReduceMotion) private var reduce
    let path: String
    let progress: Int
    @State private var img: UIImage? = nil
    @State private var y: CGFloat = 0.08

    var body: some View {
        ZStack(alignment: .top) {
            RoundedRectangle(cornerRadius: 8, style: .continuous).fill(p.bg)
            if let img {
                Image(uiImage: img).resizable().scaledToFill().frame(width: 46, height: 58).clipped()
            } else {
                Receipt34Stripes().foregroundStyle(p.line)
            }
            Rectangle().fill(p.lab).frame(height: 2)
                .shadow(color: p.lab, radius: 4)
                .offset(y: 58 * y)
        }
        .frame(width: 46, height: 58)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(p.line, lineWidth: 1))
        .task(id: path) {
            if !path.isEmpty { img = await store.image(path) }
        }
        .onAppear {
            if reduce { y = CGFloat(progress) / 100; return }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { y = 0.92 }
        }
    }
}

/// Linjer som i en kvittering (uten bilde).
struct Receipt34Stripes: View {
    var body: some View {
        VStack(spacing: 5) {
            ForEach(0..<8, id: \.self) { (_: Int) in
                Rectangle().frame(height: 2)
            }
        }
        .padding(.horizontal, 7).padding(.vertical, 6)
    }
}

struct Receipt34Bar: View {
    @Environment(\.paper) private var p
    let progress: Int

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            ZStack(alignment: .leading) {
                Capsule().fill(p.bg)
                Capsule().fill(p.lab).frame(width: g.size.width * CGFloat(Swift.max(4, progress)) / 100)
            }
        }
        .frame(height: 6)
        .animation(.linear(duration: 0.8), value: progress)
    }
}

struct Receipt34Steps: View {
    let step: Int
    let progress: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            ForEach(Array(Receipt34Ai.steps.enumerated()), id: \.offset) { (pair: (offset: Int, element: String)) in
                Receipt34StepRow(name: pair.element, done: pair.offset < step || (pair.offset == step && progress >= 100),
                                 active: pair.offset == step && progress < 100)
            }
        }
    }
}

struct Receipt34StepRow: View {
    @Environment(\.paper) private var p
    let name: String
    let done: Bool
    let active: Bool

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                if done {
                    Circle().fill(p.pos)
                    Text("✓").font(PF.ui(8.5, .heavy)).foregroundStyle(Color.white)
                } else if active {
                    Circle().strokeBorder(p.lab, lineWidth: 2)
                } else {
                    Circle().strokeBorder(p.line, lineWidth: 1.5)
                }
            }
            .frame(width: 15, height: 15)
            Text(name).font(PF.ui(13, active ? .bold : .medium)).foregroundStyle(done || active ? p.ink : p.mut)
        }
    }
}
