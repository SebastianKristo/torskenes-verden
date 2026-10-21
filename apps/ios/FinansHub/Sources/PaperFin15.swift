import SwiftUI

/* ---------------- Papir → Finans, prompt 15: Detaljer, Søk, Mer-rutenett, kvitteringsbanner og «På vei» i Finn ---------------- */

private func pkr(_ v: Double) -> String { "\(neg0(v)) kr" }

/// GET /finans/api/transactions/:id: transaksjonen med kvittering (varelinjer) og bankrad.
struct PaperTxData {
    /// Prompt 30: bbox = [x, y, w, h] i prosent av bildet (nil for eldre kvitteringer).
    struct ReceiptLine: Hashable { let name: String; let price: Double?; var bbox: [Double]? = nil }
    var failed = false
    var id = 0
    var merchant = ""
    var category = ""
    var date = ""
    var account = ""
    var amount: Double = 0
    var color = "#6b665c"
    var domain: String?
    var aiSummary = ""
    var hasReceipt = false
    /// attached | needs_review | missing
    var receiptStatus = "missing"
    var receiptFile: String?
    var receiptMime: String?
    var lines: [ReceiptLine] = []
    /// Prompt 30: kvitteringens id (til «Les kvitteringen på nytt»).
    var receiptId: String = ""
    var total: Double?
    var bankText = ""
    var bankMessage = ""
    var booked = ""
    var valueDate = ""
    /// Prompt 40: «Lagt til …» / «Sist endret …» og notatet (Fin40.swift).
    var fin40: Fin40Meta = Fin40Meta()

    init(_ o: [String: Any], failed: Bool = false) {
        self.failed = failed
        fin40 = Fin40Meta(o)
        id = JS.int(o, "id") ?? 0
        merchant = JS.str(o, "merchant") ?? JS.str(o, "description") ?? ""
        category = JS.str(o, "category") ?? ""
        date = JS.str(o, "date") ?? ""
        account = JS.str(o, "account") ?? ""
        amount = JS.num(o, "amount") ?? 0
        color = JS.str(o, "color") ?? "#6b665c"
        domain = JS.str(o, "domain")
        if let r = JS.dict(o, "receipt") {
            hasReceipt = true
            receiptStatus = JS.str(r, "status") ?? "attached"
            receiptFile = JS.str(r, "fileUrl")
            receiptMime = JS.str(r, "mime")
            lines = JS.list(r, "lines").map { (l: [String: Any]) -> ReceiptLine in PaperTxData.line30(l) }
            receiptId = JS.str(r, "id") ?? JS.str(o, "receiptId") ?? ""
            total = JS.num(r, "total")
            aiSummary = JS.str(r, "aiSummary") ?? ""
        }
        if aiSummary.isEmpty { aiSummary = JS.str(o, "aiSummary") ?? JS.str(o, "aiLong") ?? JS.str(o, "aiShort") ?? "" }
        if let b = JS.dict(o, "bank") {
            bankText = JS.str(b, "description") ?? ""
            bankMessage = JS.str(b, "message") ?? ""
            booked = JS.str(b, "bookingDate") ?? ""
            valueDate = JS.str(b, "valueDate") ?? ""
        }
    }

    /// Én varelinje: name/text, price og bbox (prosent, 4 tall).
    static func line30(_ l: [String: Any]) -> ReceiptLine {
        let name: String = JS.str(l, "name") ?? JS.str(l, "text") ?? ""
        let raw: [Double] = ((l["bbox"] as? [Any]) ?? []).compactMap { (v: Any) -> Double? in (v as? NSNumber)?.doubleValue }
        let box: [Double]? = raw.count == 4 ? raw : nil
        return ReceiptLine(name: name, price: JS.num(l, "price"), bbox: box)
    }

    var statusText: String {
        switch receiptStatus {
        case "needs_review": return "Til gjennomgang"
        case "attached": return "Vedlagt"
        default: return "Mangler"
        }
    }
}

private func dmy(_ iso: String) -> String {
    let p = iso.prefix(10).split(separator: "-")
    return p.count == 3 ? "\(p[2]).\(p[1]).\(p[0])" : iso
}

/* ---------- Detaljer ---------- */

struct PaperTxDetailView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var catSheet = false
    @State private var editAll40 = false

    var body: some View {
        VStack(spacing: 10) {
            if let d = store.txDetail {
                if d.failed {
                    PCard { Text("Fikk ikke hentet transaksjonen. Prøv igjen.").font(PF.ui(13.5)).foregroundStyle(p.lab) }
                } else {
                    head(d)
                    HStack {
                        PLabel(text: "Original kvittering")
                        Spacer()
                        Text(d.statusText).font(PF.ui(12, .semibold)).foregroundStyle(d.receiptStatus == "attached" ? p.pos : p.lab)
                    }
                    .padding(.horizontal, 2).padding(.top, 4)
                    if d.hasReceipt {
                        // Prompt 30: gult banner, bildet med markerte felt og «Les kvitteringen på nytt».
                        hl30Top(d)
                        receipt(d)
                        // Prompt 40: ✦ La Glimt lese kvitteringen på nytt (Fin40.swift).
                        if !d.receiptId.isEmpty { Fin40RereadButton(d: d) }
                    } else { attach }
                    HStack(spacing: 8) {
                        // Prompt 40: «Rediger alt» – dato, beløp, kategori, konto, notat og varelinjer.
                        PLineButton(title: "Rediger alt", height: 46, full: true) { editAll40 = true }
                        PLineButton(title: "Endre kategori", height: 46, full: true) { catSheet = true }
                    }
                    PLineButton(title: "Bankutskrift", height: 46, full: true) { store.openOriginal(d.id, "bank") }
                    if !d.bankText.isEmpty || !d.bankMessage.isEmpty { bank(d) }
                    // Prompt 40: når og hvordan den ble lagt til, og sist endret.
                    Fin40AddedLine(meta: d.fin40)
                }
            } else {
                ProgressView().padding(40)
            }
        }
        .sheet(isPresented: $editAll40) {
            if let d = store.txDetail {
                Fin40EditSheet(d: d) { editAll40 = false }
                    .environment(\.paper, p)
                    .presentationDetents([.large])
            }
        }
        .sheet(isPresented: $catSheet) {
            if let d = store.txDetail {
                PaperCategorySheet(detail: d) { catSheet = false }
                    .environment(\.paper, p)
                    .presentationDetents([.medium, .large])
                    .sheetEdge30(p.bg)
            }
        }
    }

    private func head(_ d: PaperTxData) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                PaperLogo(domain: d.domain, name: d.merchant, color: d.color, size: 46, radius: 13)
                VStack(alignment: .leading, spacing: 2) {
                    Text(d.merchant).font(PF.serif(22, medium: true)).foregroundStyle(p.ink).lineLimit(2)
                    Text([d.category, dmy(d.date), d.account].filter { !$0.isEmpty }.joined(separator: " · ")).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
                }
                // Prompt 27: «Velg logo» når butikken mangler logo (Privacy27.swift).
                if (d.domain ?? "").isEmpty && !d.merchant.isEmpty {
                    Spacer(minLength: 4)
                    MerchantLogo27Button(name: d.merchant) { reloadDetail27(d.id) }
                }
            }
            Text((d.amount > 0 ? "+" : "") + pkr(d.amount)).font(PF.serif(40)).foregroundStyle(d.amount > 0 ? p.pos : p.ink).lineLimit(1).minimumScaleFactor(0.6)
            if !d.aiSummary.isEmpty {
                Text("✦ " + d.aiSummary).font(PF.ui(13.5, .medium)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 15, y: 10)
    }

    private func reloadDetail27(_ id: Int) {
        store.run {
            if let d = try? await store.api.call("GET", "/transactions/\(id)") { store.txDetail = PaperTxData(JS.obj(d)) }
        }
    }

    /// Kvitteringen som papirlapp. Et trykk åpner originalen i fullskjerm.
    private func receipt(_ d: PaperTxData) -> some View {
        let ink = Color(hex: "#2a2620")
        return Button { store.openOriginal(d.id, "receipt") } label: {
            VStack(spacing: 6) {
                Text(d.merchant.uppercased()).font(.system(size: 14, weight: .bold, design: .monospaced)).foregroundStyle(ink).multilineTextAlignment(.center)
                Text("\(dmy(d.date)) · KVITTERING").font(.system(size: 11, design: .monospaced)).foregroundStyle(ink.opacity(0.7))
                dashed(ink)
                if d.lines.isEmpty {
                    Text(d.receiptFile == nil ? "Ingen varelinjer lest ennå" : "Trykk for å se originalen").font(.system(size: 12, design: .monospaced)).foregroundStyle(ink.opacity(0.7))
                }
                // Prompt 30: linjene som matcher søket markeres gult (Receipt30.swift).
                let hl: (idx: [Int], word: String) = hl30(d)
                ForEach(Array(d.lines.prefix(40).enumerated()), id: \.offset) { i, l in
                    Hl30Line(name: l.name, price: l.price, hit: hl.idx.contains(i), word: hl.word, first: hl.idx.first == i)
                }
                dashed(ink)
                HStack {
                    Text("TOTAL").font(.system(size: 13, weight: .bold, design: .monospaced))
                    Spacer()
                    Text(n2(abs(d.total ?? d.amount))).font(.system(size: 13, weight: .bold, design: .monospaced))
                }
                .foregroundStyle(ink)
                if d.receiptFile != nil {
                    Text("Trykk for originalen ›").font(PF.ui(11.5, .semibold)).foregroundStyle(ink.opacity(0.6)).padding(.top, 4)
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 16)
            .frame(maxWidth: .infinity)
            .background(Color(hex: "#fbf8f1"), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .shadow(color: .black.opacity(0.15), radius: 8, y: 4)
            .padding(.horizontal, 8)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Original kvittering, \(d.lines.count) varelinjer")
    }

    private func hl30(_ d: PaperTxData) -> (idx: [Int], word: String) {
        let h: Hl30 = Hl30.shared
        if !h.active(d.id) { return ([], "") }
        let names: [String] = d.lines.prefix(40).map(\.name)
        return h.matches(names)
    }

    @ViewBuilder private func hl30Top(_ d: PaperTxData) -> some View {
        let hl: (idx: [Int], word: String) = hl30(d)
        if let first = hl.idx.first {
            let boxes: [[Double]] = hl.idx.compactMap { (i: Int) -> [Double]? in d.lines[i].bbox }
            Hl30Banner(first: first, count: hl.idx.count, price: d.lines[first].price)
                .onAppear { Set25Focus.shared.flash("hl30") }
            if let file = d.receiptFile, !boxes.isEmpty, !(d.receiptMime ?? "").contains("pdf") {
                Hl30Image(path: file, boxes: boxes)
            } else if d.receiptFile != nil && !d.receiptId.isEmpty {
                Hl30Reread(receiptId: d.receiptId, txId: d.id)
            }
        }
    }

    private func dashed(_ c: Color) -> some View {
        Rectangle().stroke(c.opacity(0.45), style: StrokeStyle(lineWidth: 1, dash: [4, 3])).frame(height: 1).padding(.vertical, 2)
    }

    private var attach: some View {
        VStack(spacing: 10) {
            Text("Ingen kvittering er koblet til denne transaksjonen.").font(PF.ui(13.5)).foregroundStyle(p.mut).frame(maxWidth: .infinity, alignment: .leading)
            PInkButton(title: "Legg ved kvittering", height: 46, full: true) {
                store.scanTarget = "receipt"
                store.paperScanOpen = true
            }
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func bank(_ d: PaperTxData) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            PLabel(text: "Bankutskrift", color: p.mut)
            if !d.bankText.isEmpty { Text(d.bankText).font(PF.mono(12.5, bold: false)).foregroundStyle(p.ink) }
            if !d.bankMessage.isEmpty { Text("KID/melding: " + d.bankMessage).font(PF.mono(12, bold: false)).foregroundStyle(p.mut) }
            if !d.booked.isEmpty { Text("Bokført \(dmy(d.booked))" + (d.valueDate.isEmpty ? "" : " · rentedato \(dmy(d.valueDate))")).font(PF.ui(12)).foregroundStyle(p.mut) }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// «Endre kategori»: kategoriene og «lag regel for fremtidige».
struct PaperCategorySheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let detail: PaperTxData
    let close: () -> Void
    @State private var rule = false

    var body: some View {
        let cats = store.boot?.categories ?? []
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Endre kategori").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                Toggle(isOn: $rule) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Lag regel for fremtidige").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                        Text("Nye transaksjoner fra \(detail.merchant) får samme kategori").font(PF.ui(12)).foregroundStyle(p.mut)
                    }
                }
                .tint(p.pos)
                .padding(14)
                .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                VStack(spacing: 0) {
                    ForEach(Array(cats.enumerated()), id: \.element.id) { i, c in
                        if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                        Button { pick(c) } label: {
                            HStack(spacing: 10) {
                                Circle().fill(Color(hex: c.color)).frame(width: 10, height: 10)
                                Text(c.name).font(PF.ui(14.5, .medium)).foregroundStyle(p.ink)
                                Spacer()
                                if c.name == detail.category { Text("✓").font(PF.ui(13, .bold)).foregroundStyle(p.pos) }
                            }
                            .padding(.horizontal, 14).frame(height: 46)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .padding(20)
        }
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .task { if store.boot == nil { await store.loadPaperFinance() } }
    }

    private func pick(_ c: Category) {
        Haptics.shared.select()
        let id = detail.id
        let pattern = detail.merchant
        let makeRule = rule
        store.run {
            _ = try await store.api.call("PATCH", "/transactions/\(id)", json: ["categoryId": c.id])
            if makeRule && !pattern.isEmpty {
                _ = try? await store.api.call("POST", "/rules", json: ["pattern": String(pattern.prefix(60)), "categoryId": c.id])
            }
            if let d = try? await store.api.call("GET", "/transactions/\(id)") { store.txDetail = PaperTxData(JS.obj(d)) }
            store.txs = nil
            store.flash(makeRule ? "Kategori endret, og regelen er laget" : "Kategori endret")
        }
        close()
    }
}

/* ---------- Søk ---------- */

/// Finans → Søk: søkefelt med ✦ AI-bryter. Uten AI: vanlig søk med hvorfor det traff. Med AI: svar-kort øverst.
struct PaperFinSearch: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var q = ""
    @State private var aiOn = UserDefaults.standard.object(forKey: "fh_psearch_ai") as? Bool ?? true
    @FocusState private var focused: Bool
    /// Prompt 27: teksten fra et valgt forslag (ingen nye forslag før brukeren skriver noe annet).
    @State private var lastPicked27: String = ""

    private let tries = ["Rema denne måneden", "kyllingfilet", "Største utgift i oktober", "Over 500 kr", "Abonnementer", "Til gjennomgang"]

    var body: some View {
        VStack(spacing: 10) {
            field
            // Prompt 27: forslag mens du skriver (FinSuggest27.swift).
            if focused && !aiOn && !sug.items.isEmpty {
                FinSuggestList27(items: sug.items, typed: q, pick: { s in pickSuggestion(s) }, fill: { s in fillSuggestion(s) })
                    .padding(.top, -4)
            }
            // Prompt 25: «✦ Ollama tenker … N s av M s», fremdriftslinje og Avbryt.
            if store.aiBusy { AiJobProgress25() }
            if let n = store.aiNote, !store.aiBusy, n.contains("avbrutt") { Text(n).font(PF.ui(12.5)).foregroundStyle(p.mut) }
            if q.trimmingCharacters(in: .whitespaces).isEmpty && store.ai == nil && !store.aiBusy { suggestions }
            // Prompt 40: Glimt svarer med oppsummering, nøkkeltall og kort (Fin40Ask.swift).
            if Fin40Ask.shared.busy && !store.aiBusy {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("✦ Glimt leser …").font(PF.ui(13.5)).foregroundStyle(p.mut)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let g = Fin40Ask.shared.answer, g.q == store.aiQuery || store.aiQuery.isEmpty { Fin40AnswerCard(a: g) }
            if let a = store.ai, !store.aiBusy { results(a) }
        }
        .onAppear {
            if q.isEmpty { q = store.aiQuery; lastPicked27 = store.aiQuery }
            sug.close(suppress: true)
        }
        .onChange(of: q) { _, v in
            if v != lastPicked27 { sug.suppressed = false }
            sug.update(v, aiOn: aiOn, store)
        }
    }

    @MainActor private var sug: FinSuggest27Model { FinSuggest27Model.shared }

    /// Trykk på forslag: søk på navnet og vis treff under.
    private func pickSuggestion(_ s: FinSug27) {
        Haptics.shared.select()
        lastPicked27 = s.name
        sug.close(suppress: true)
        q = s.name
        go(s.name)
    }

    /// ↖: fyll inn uten å søke (forslagene oppdateres for den nye teksten).
    private func fillSuggestion(_ s: FinSug27) {
        Haptics.shared.tick()
        lastPicked27 = ""
        q = s.name
    }

    /// ✕: tøm feltet, avbryt forslag og ventende søk, lukk treffene. Fokus beholdes.
    private func clear27() {
        sug.close(suppress: false)
        lastPicked27 = ""
        store.ai = nil
        store.aiNote = nil
        store.aiQuery = ""
        Fin40Ask.shared.clear()
    }

    private var field: some View {
        HStack(spacing: 8) {
            // Prompt 27: ✕ til venstre (SearchField27).
            SearchField27(text: $q, placeholder: aiOn ? "Spør Glimt, f.eks. «abonnementer»" : "Søk i navn, kategori og varelinjer", font: PF.ui(14.5),
                          focus: $focused, onClear: { clear27() }, onSubmit: { lastPicked27 = q; sug.close(suppress: true); go(q) }, lead: {
                Text("⌕").font(PF.ui(17)).foregroundStyle(p.mut)
            })
            .padding(.leading, 16)
            // Prompt 43: [orb] Glimt – rød fylt når på, rød kant når av (Fin43.swift). Orben går raskere mens Glimt svarer.
            Glimt43Pill(on: aiOn, height: 38, busy: store.aiBusy || Fin40Ask.shared.busy) {
                Haptics.shared.select()
                aiOn.toggle()
                UserDefaults.standard.set(aiOn, forKey: "fh_psearch_ai")
                if aiOn { sug.close(suppress: false) } else { sug.update(q, aiOn: false, store) }
            }
            .padding(.trailing, 6)
        }
        .frame(height: 50)
        .background(p.card, in: Capsule())
        .shadow(color: .black.opacity(0.15), radius: 15, y: 10)
    }

    private var suggestions: some View {
        VStack(alignment: .leading, spacing: 8) {
            PLabel(text: "Prøv").padding(.top, 4).padding(.leading, 2)
            PaperChips(items: tries) { s in q = s; go(s) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private func results(_ a: AiAnswer) -> some View {
        let hits = (a.hits ?? []).filter { $0.txId != nil || $0.description != nil }
        let glimt40: Bool = Fin40Ask.shared.answer != nil
        if aiOn, a.mode != "plain", let t = a.text, !t.isEmpty, !glimt40 {
            VStack(alignment: .leading, spacing: 6) {
                PLabel(text: "✦ Glimt")
                // Prompt 40: aldri rå markdown eller kildemarkører; modellnavnet vises ikke i kortet.
                Text(Fin40Ask.clean(t)).font(PF.serif(18)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(p.lab, lineWidth: 1.5))
        }
        if let n = store.aiNote { Text(n).font(PF.ui(12.5)).foregroundStyle(p.mut).frame(maxWidth: .infinity, alignment: .leading) }
        if hits.isEmpty && glimt40 {
            EmptyView()
        } else if hits.isEmpty {
            Text(aiOn ? "Ingen treff." : "Ingen treff. Slå på ✦ Glimt for å søke i innholdet i kvitteringene.").font(PF.ui(14)).foregroundStyle(p.mut)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 12).padding(.horizontal, 4)
        } else {
            PSection(title: "\(hits.count) treff", trailing: "sum " + pkr(hits.compactMap(\.amount).reduce(0, +)))
            VStack(spacing: 0) {
                ForEach(Array(hits.prefix(60).enumerated()), id: \.offset) { i, h in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    hitRow(h)
                }
            }
        }
    }

    private func hitRow(_ h: AiHit) -> some View {
        let name = h.description ?? "Treff"
        return Button {
            if let id = h.txId {
                // Prompt 30: marker treffet i kvitteringen (?hl=…).
                Hl30.shared.open(id, term: h.matchedText ?? q, lines: h.lineIndex ?? [])
                store.openPaperTx(id)
            }
        } label: {
            HStack(spacing: 12) {
                Text(String(name.prefix(1)).uppercased()).font(PF.ui(11, .heavy)).foregroundStyle(.white)
                    .frame(width: 38, height: 38).background(p.ink.opacity(0.75), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    Text([h.date.map { dmy($0) }, h.reason].compactMap { $0 }.joined(separator: " · ")).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2)
                }
                Spacer(minLength: 4)
                if let a = h.amount {
                    Text((a > 0 ? "+" : "") + neg0(a)).font(PF.serif(17, medium: true)).foregroundStyle(a > 0 ? p.pos : p.ink)
                }
            }
            .padding(.vertical, 8).padding(.horizontal, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func go(_ s: String) {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        focused = false
        Haptics.shared.tap()
        // Prompt 40: Glimt-kort for standardspørsmål (abonnementer, forbruk, faste utgifter) – også uten ✦ Glimt på.
        if aiOn || Fin40Ask.standard(t) { Fin40Ask.shared.ask(t, store) } else { Fin40Ask.shared.clear() }
        if aiOn {
            store.ask(t)
        } else {
            store.aiQuery = t
            store.aiBusy = true
            store.aiNote = nil
            store.run {
                defer { store.aiBusy = false }
                try await store.plainSearch(t)
            }
        }
    }
}

/// Piller som brytes over flere linjer.
struct PaperChips: View {
    @Environment(\.paper) private var p
    let items: [String]
    let tap: (String) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(rows(), id: \.self) { row in
                HStack(spacing: 6) {
                    ForEach(row, id: \.self) { s in
                        Button { tap(s) } label: {
                            Text(s).font(PF.ui(13, .semibold)).foregroundStyle(p.ink).padding(.horizontal, 14).frame(height: 34)
                                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    /// Enkel bryting: to piller per rad.
    private func rows() -> [[String]] {
        var out: [[String]] = []
        var i = 0
        while i < items.count {
            out.append(Array(items[i..<Swift.min(i + 2, items.count)]))
            i += 2
        }
        return out
    }
}

/* ---------- Mer i Finans: rutenett ---------- */

/// To kort i bredden (3–4 på bred skjerm), med ikon i aksentfarge, tittel og et live-tall.
struct PaperFinMoreGrid: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.paperWide) private var wide
    /// Prompt 20: hold inne ~0,45 s → flisene vugger og kan dras til ny plass.
    /// Prompt 28: redigeringsmodus er store.paperEditPage == "fmer", så pillene «↺ Tilbakestill» og ✓ kan ligge over listen
    /// (Wiggle28.swift). Samme vugging som Hjem (±0,45°, 0,6 s, annenhver i motfase).
    private var editing: Bool { store.paperEditPage == "fmer" }
    @State private var order: [String] = FinTileOrder20.load()

    private struct Tile: Identifiable {
        let id: String
        let name: String
        let icon: String
        let value: String
        var badge: Int = 0
        let act: () -> Void
    }

    var body: some View {
        let cols = wide ? 4 : 2
        VStack(alignment: .leading, spacing: 10) {
            // Prompt 30: plassen til pillene er nå 64 pt padding-top i PaperPage (Wiggle30.topPad).
            // Prompt 43: felles WiggleReorderList (WiggleList43.swift), samme oppførsel som Subscription OS.
            let vis: [Tile] = visibleTiles
            WiggleReorderList(
                keys: vis.map(\.id),
                editing: editing,
                columns: cols,
                label: { (id: String) in vis.first { $0.id == id }?.name ?? id },
                enter: { startEditing() },
                commit: { (o: [String]) in commitOrder(o) },
                content: { (id: String) in
                    if let t = vis.first(where: { $0.id == id }) { tile(t) }
                },
                accessory: { (id: String) in
                    if let t = vis.first(where: { $0.id == id }) {
                        badge30(t).offset(x: -9, y: -9).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    }
                }
            )
            // Prompt 30: skjulte sider under rutenettet når ＋ er trykket (55 % opasitet, hvitt ＋-merke).
            if editing && FinHidden30.shared.showHidden { hiddenSection(cols) }
        }
        .onAppear { order = FinTileOrder20.load() }
        .onChange(of: editing) { old, on in if old && !on { stopEditing() } }
        .onChange(of: Edit28.shared.resetTick) { _, _ in resetOrder() }
        .onDisappear { if editing { store.paperEditPage = nil } }
        .task {
            await store.loadPaperFinance()
            if store.subsX == nil { try? await store.loadSubs() }
            if store.stocksX == nil { await store.loadStocksQuiet() }
            if store.reviewCount == nil { await store.loadPaperFinance15() }
        }
    }

    private var tiles: [Tile] {
        let s = store.summary
        let review = store.reviewCount ?? s?.review.count ?? store.boot?.reviewCount ?? 0
        let total = (store.boot?.accounts ?? []).reduce(0) { $0 + $1.balance }
        var t: [Tile] = []
        // Prompt 24: profiler uten Hjem i fanelinjen (Finans + Boliger) har Hjem som flis her.
        if !store.mainTabItems.contains(where: { $0.id == "hjem" }) { t.append(Tile(id: "hjem", name: "Hjem", icon: "house.fill", value: "Pakker, avganger og widgets") { store.paperGo("hjem") }) }
        if !store.finNav.contains("sok") { t.append(Tile(id: "fsok", name: "Søk", icon: "magnifyingglass", value: "✦ Med AI") { store.paperGo("fsok") }) }
        if !store.finNav.contains("liste") { t.append(Tile(id: "fliste", name: "Liste", icon: "list.bullet", value: "Alle transaksjoner") { store.paperGo("fliste") }) }
        if !store.finNav.contains("finn") { t.append(Tile(id: "finn", name: "Finn", icon: "arrow.left.arrow.right", value: "Kjøp og salg") { store.paperGo("finn") }) }
        t.append(Tile(id: "budsjett", name: "Budsjett", icon: "chart.pie", value: s.map { pkr($0.left) + " igjen" } ?? "–") { store.paperFinGo("budsjett") })
        t.append(Tile(id: "kvitt", name: "Kvitteringer", icon: "doc.text.viewfinder", value: review > 0 ? "\(review) til gjennomgang" : "Ingen i kø", badge: review) { store.paperFinGo("kvitt") })
        t.append(Tile(id: "faste", name: "Faste utgifter", icon: "repeat", value: "Neste 30 dager") { store.paperOpen(.fast) })
        t.append(Tile(id: "kontoer", name: "Kontoer", icon: "building.columns", value: store.boot == nil ? "–" : pkr(total)) { store.paperFinGo("kontoer") })
        t.append(Tile(id: "aksjer", name: "Aksjer", icon: "chart.line.uptrend.xyaxis", value: stocksValue) { store.paperFinGo("aksjer") })
        t.append(Tile(id: "rapp", name: "Rapporter", icon: "chart.bar", value: "Måned og år") { store.paperOpen(.reports) })
        t.append(Tile(id: "abo", name: "Subscription OS", icon: "arrow.triangle.2.circlepath", value: store.subsX.map { pkr($0.monthly) + "/mnd" } ?? "–") { store.paperGo("abo") })
        t.append(Tile(id: "boliger", name: "Boliger", icon: "house", value: "Utgifter og regninger") { store.paperFinGo("boliger") })
        t.append(Tile(id: "import", name: "Import", icon: "square.and.arrow.down", value: "Bank, Excel og Finn") { store.paperOpen(.imports) })
        t.append(Tile(id: "innst", name: "Innstillinger", icon: "gearshape", value: "Fanelinje og tema") { store.paperGo("innst") })
        return t
    }

    private var stocksValue: String {
        guard let x = store.stocksX else { return "Trading 212" }
        return x.valueText
    }

    /// Flisene i lagret rekkefølge; nye fliser havner sist.
    private var sortedTiles: [Tile] {
        let list: [Tile] = tiles
        var out: [Tile] = []
        for id in order {
            if let t = list.first(where: { $0.id == id }), !out.contains(where: { $0.id == id }) { out.append(t) }
        }
        for t in list where !out.contains(where: { $0.id == t.id }) { out.append(t) }
        return out
    }

    /// Prompt 30: synlige fliser (skjulte tas ut, Innstillinger kan ikke skjules).
    private var visibleTiles: [Tile] {
        let h: FinHidden30 = FinHidden30.shared
        return sortedTiles.filter { !h.isHidden($0.id) }
    }

    private func hiddenSection(_ cols: Int) -> some View {
        let list: [Tile] = sortedTiles.filter { FinHidden30.shared.isHidden($0.id) }
        return VStack(alignment: .leading, spacing: 10) {
            WiggleHiddenLabel30()
            if list.isEmpty {
                Text("Ingen skjulte sider. Trykk − på en flis for å skjule den.").font(PF.ui(13)).foregroundStyle(p.mut)
                    .padding(.horizontal, 4)
            } else {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: cols), spacing: 10) {
                    ForEach(list) { t in
                        tile(t).opacity(0.55)
                            .overlay(alignment: .topLeading) {
                                WiggleBadge30(kind: .plus, label: "Vis \(t.name)") { showTile(t.id) }.offset(x: -9, y: -9)
                            }
                    }
                }
            }
            FinResetOrder30 { resetOrder() }
        }
    }

    /// Vis igjen: legges sist i rekkefølgen.
    private func showTile(_ id: String) {
        FinHidden30.shared.show(id, store)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { order = order.filter { $0 != id } + [id] }
    }

    @ViewBuilder private func badge30(_ t: Tile) -> some View {
        if t.id == FinHidden30.locked {
            WiggleBadge30(kind: .lock, label: "Innstillinger kan ikke skjules") {}
        } else {
            WiggleBadge30(kind: .minus, label: "Skjul \(t.name)") { FinHidden30.shared.hide(t.id, store) }
        }
    }

    private func startEditing() {
        guard !editing else { return }
        FinHidden30.shared.showHidden = false
        order = sortedTiles.map(\.id)
        store.enterPaperEdit("fmer")
    }

    /// Kalles når redigeringen avsluttes (✓ i pillen, ny side eller tilbake).
    private func stopEditing() {
        FinTileOrder20.save(order, store)
    }

    /// Prompt 43: ny synlig rekkefølge etter slipp – skjulte fliser står der de sto, og lagres med en gang.
    private func commitOrder(_ visible: [String]) {
        let next: [String] = Wiggle43.merge(sortedTiles.map(\.id), visible: visible)
        guard next != order else { return }
        Haptics.shared.tick()
        order = next
        FinTileOrder20.save(next, store)
    }

    private func resetOrder() {
        Haptics.shared.select()
        FinTileOrder20.reset(store)
        let defaults: [String] = tiles.map(\.id)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { order = defaults }
    }

    private func drop(_ src: String?, on target: String) {
        guard let src else { return }
        let ids: [String] = sortedTiles.map(\.id)
        let next: [String] = FinTileOrder20.moved(ids, src, before: target)
        guard next != ids else { return }
        Haptics.shared.tick()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { order = next }
    }

    private func tile(_ t: Tile) -> some View {
        let tint: Color = FinTileColor20.color(t.id)
        return Button {
            if !editing { t.act() }
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    Image(systemName: t.icon).font(.system(size: 17, weight: .semibold)).foregroundStyle(tint)
                        .frame(width: 42, height: 42).background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    Spacer()
                    if t.badge > 0 {
                        Text("\(t.badge)").font(PF.ui(11.5, .bold)).foregroundStyle(.white).frame(minWidth: 22, minHeight: 22)
                            .background(p.lab, in: Circle())
                    }
                }
                Spacer(minLength: 0)
                Text(t.name).font(PF.serif(20, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.8)
                Text(t.value).font(PF.ui(12.5)).foregroundStyle(t.value.contains("▲") ? p.pos : p.mut).lineLimit(2)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Banneret «N kvitteringer til gjennomgang» ---------- */

/// Rett under saldokortet. Trykk på teksten åpner køen, «Skann ›» åpner skann-arket. Skjules når køen er tom.
struct PaperReviewBanner: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let n = store.reviewCount ?? store.summary?.review.count ?? 0
        if n > 0 {
            HStack(spacing: 10) {
                Button { Haptics.shared.tap(); store.paperOpen(.upload) } label: {
                    Text(n == 1 ? "1 kvittering til gjennomgang" : "\(n) kvitteringer til gjennomgang")
                        .font(PF.ui(15, .bold)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Button { Haptics.shared.tap(); store.paperScanOpen = true } label: {
                    Text("Skann ›").font(PF.ui(14, .bold)).foregroundStyle(.white).padding(.horizontal, 12).frame(height: 32)
                        .background(Color.white.opacity(0.18), in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, 16).padding(.trailing, 10).padding(.vertical, 12)
            .background(p.lab, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }
}

/* ---------- Finn: handler på vei ---------- */

/// Vannrett rad mellom Netto i år og filtrene: handler som er sendt eller mottatt, men ikke fullført.
struct PaperFinnWay: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    static func onWay(_ d: FinnDeal) -> Bool { !d.finished && (d.level == 2 || d.level == 3) }

    var body: some View {
        let list = (store.finn?.items ?? []).filter(PaperFinnWay.onWay)
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    PLabel(text: "På vei · \(list.count)")
                    Spacer()
                    Button { Haptics.shared.select(); store.finnSeg = "På vei" } label: {
                        Text("Vis alle ›").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 2)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(list) { d in card(d) }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.viewAligned)
            }
        }
    }

    private func card(_ d: FinnDeal) -> some View {
        let urgent = !d.sold && d.level == 3
        return Button { Haptics.shared.tap(); store.finnSeg = "På vei"; store.openFinn(d.id) } label: {
            HStack(spacing: 12) {
                PaperServerImage(path: d.image, tint: Color(hex: "#2C2C33"), initials: String((d.item ?? "•").prefix(1)).uppercased())
                    .frame(width: 54, height: 54)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    Text(d.item ?? "Finn-handel").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    HStack(spacing: 3) {
                        ForEach(0..<4, id: \.self) { j in Capsule().fill(j < d.level ? p.ink : p.line).frame(height: 4) }
                    }
                    Text((d.sold ? "Solgt · " : "Kjøpt · ") + d.nextText).font(PF.ui(11.5, .semibold)).foregroundStyle(urgent ? p.lab : p.mut).lineLimit(1)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .frame(width: 250, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
