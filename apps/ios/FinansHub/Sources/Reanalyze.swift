import SwiftUI

/* ---------------- «✦ Analyser på nytt med Gemini» ---------------- */

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
    func reanalyze(_ id: String) async throws -> ReanalyzeResult {
        let d = try await api.callAt("/finans/api", "POST", "/receipts/\(id)/reanalyze", json: ["engine": "gemini"], timeout: 120)
        let o = JS.obj(d)
        if let e = JS.str(o, "error") { throw APIError(message: e, status: 0) }
        return ReanalyzeResult(receiptId: id, candidateId: JS.str(o, "candidateId") ?? "",
                               previous: ReadResult(JS.dict(o, "previous")), result: ReadResult(JS.dict(o, "result")))
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
    @State private var busy = false
    @State private var shown: ReanalyzeResult?

    var body: some View {
        Button { start() } label: {
            HStack(spacing: 8) {
                if busy { ProgressView().controlSize(.small) } else { Text("✦").fontWeight(.bold) }
                Text(busy ? "Gemini leser på nytt …" : (compact ? "Analyser på nytt" : "Analyser på nytt med Gemini")).fontWeight(.semibold).lineLimit(1)
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
            ReanalyzeCompare(result: r).presentationDetents([.large]).presentationBackground(.ultraThinMaterial)
        }
    }

    private func start() {
        guard !busy else { return }
        Haptics.shared.tap()
        busy = true
        Task {
            do {
                let r = try await store.reanalyze(receiptId)
                busy = false
                shown = r
            } catch {
                busy = false
                let msg = (error as? APIError)?.message ?? error.localizedDescription
                store.flash("Kunne ikke analysere på nytt: \(msg)")
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
                Text("Velg hvilket resultat som skal beholdes. Originalbildet er lest på nytt av Gemini.")
                    .font(.footnote).foregroundStyle(Color.skinFg.opacity(0.65))
                HStack(alignment: .top, spacing: 10) {
                    column("Forrige", result.previous, fresh: false)
                    column("Gemini", result.result, fresh: true)
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
