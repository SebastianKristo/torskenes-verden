import SwiftUI
import UIKit

/* ---------------- Prompt 40: Finans – «Lagt til»-linja, ✦ La Glimt lese kvitteringen på nytt, og Rediger alt ----------------
   prompts/prompt-40-pakke/claude-code-finans-lagt-til.md og claude-code-finans-les-pa-nytt-rediger.md.
   Fasit: Mobil Papir App.dc.html → Finans → Liste → transaksjon (txTools, tx1.reread, tx1.ed) og FinansHub Mobil v2 (addedOf).
   – Nederst i detaljen (og under kvitteringen): «Lagt til 16.10.2026 kl. 17.46 · skannet kvittering · Sebastian», og
     «Sist endret 18.10.2026 kl. 09.12 av Ingrid» når den er endret etterpå (12,5 pt, sekundærfarge, sentrert).
     Data (SERVER40): added:{at, by, byName, source:'scan'|'bank'|'manual'|'email'|'import', sourceLabel} og history[{at, byName}].
   – «✦ La Glimt lese kvitteringen på nytt»: eksisterende reanalyze (prompt 39, synkron sammenligning) med originalbildet.
     Resultat: endringer «gammelt → nytt» med «Bruk endringene» / «Behold som før», eller «Ingen endringer …» + OK.
   – «Rediger alt» (ark): butikk/beskrivelse, dato, beløp (beholder fortegn), kategori, konto, notat og varelinjer med live
     sumkontroll. PATCH /finans/api/transactions/:id med alle felt + lines (serveren lagrer history). */

struct Fin40Meta: Hashable {
    var addedLine: String = ""
    var editedLine: String = ""
    var note: String = ""

    init() {}

    init(_ o: [String: Any]) {
        note = JS.str(o, "note") ?? ""
        let a: [String: Any]? = JS.dict(o, "added")
        let at: String = JS.str(a, "at") ?? JS.str(o, "createdAt") ?? JS.str(o, "created_at") ?? ""
        let by: String = JS.str(a, "byName") ?? JS.str(o, "createdByName") ?? ""
        let src: String = JS.str(a, "source") ?? JS.str(o, "createdVia") ?? JS.str(o, "created_via") ?? ""
        let label: String = JS.str(a, "sourceLabel") ?? ""
        if !at.isEmpty {
            var bits: [String] = ["Lagt til " + Fin40Meta.when(at)]
            let how: String = label.isEmpty ? Fin40Meta.source(src) : label
            if !how.isEmpty { bits.append(how) }
            let bank: Bool = src == "bank" || src == "bank_import"
            if !by.isEmpty && !bank { bits.append(by) }
            addedLine = bits.joined(separator: " · ")
        }
        let hist: [[String: Any]] = JS.list(o, "history")
        if let last = hist.last, let hat = JS.str(last, "at") {
            let who: String = JS.str(last, "byName") ?? JS.str(last, "by") ?? ""
            editedLine = "Sist endret " + Fin40Meta.when(hat) + (who.isEmpty ? "" : " av " + who)
        } else if let u = JS.str(o, "updatedAt"), !u.isEmpty, u != at, let who = JS.str(o, "updatedByName") {
            editedLine = "Sist endret " + Fin40Meta.when(u) + " av " + who
        }
    }

    static func source(_ s: String) -> String {
        switch s {
        case "scan": return "skannet kvittering"
        case "bank", "bank_import": return "bankimport"
        case "manual": return "lagt inn manuelt"
        case "email": return "fra e-post"
        case "import": return "importert"
        case "glimt": return "lagt til av Glimt fra chat"
        case "shortcut": return "via iOS Snarvei"
        case "api": return "via API-nøkkel"
        default: return ""
        }
    }

    /// «16.10.2026 kl. 17.46» i Europe/Oslo.
    static func when(_ iso: String) -> String {
        let d: Date? = Hjemlys40Session.date(iso)
        guard let d else { return String(iso.prefix(10)) }
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.timeZone = TimeZone(identifier: "Europe/Oslo") ?? TimeZone.current
        f.dateFormat = "dd.MM.yyyy 'kl.' HH.mm"
        return f.string(from: d)
    }
}

/// Den dempede, sentrerte linja nederst.
struct Fin40AddedLine: View {
    @Environment(\.paper) private var p
    let meta: Fin40Meta

    var body: some View {
        if !meta.addedLine.isEmpty || !meta.editedLine.isEmpty {
            VStack(spacing: 3) {
                if !meta.addedLine.isEmpty { Text(meta.addedLine) }
                if !meta.editedLine.isEmpty { Text(meta.editedLine) }
            }
            .font(PF.ui(12.5)).foregroundStyle(p.mut)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, 6)
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/* ---------- ✦ La Glimt lese kvitteringen på nytt ---------- */

struct Fin40Change: Hashable {
    var field: String
    var old: String
    var new: String
}

@MainActor
@Observable
final class Fin40Reread {
    static let shared = Fin40Reread()

    var busy: Bool = false
    var result: ReanalyzeResult? = nil
    var changes: [Fin40Change] = []
    var err: String = ""
    var shown: Bool = false

    func run(_ d: PaperTxData, _ store: Store) {
        if busy || d.receiptId.isEmpty { return }
        Haptic30.light()
        busy = true
        err = ""
        result = nil
        changes = []
        shown = true
        Task {
            defer { self.busy = false }
            do {
                let r: ReanalyzeResult = try await store.reanalyze(d.receiptId)
                self.result = r
                self.changes = Fin40Reread.diff(r.previous, r.result)
            } catch let e as APIError {
                // Prompt 41: ny lesing er lov for alle statuser; mangler originalen, si det konkret.
                self.err = e.status == 404 ? "Fant ikke originalbildet. Last det opp på nytt for å lese det." : e.message
            } catch {
                self.err = error.localizedDescription
            }
        }
    }

    nonisolated static func money(_ v: Double?) -> String {
        guard let v else { return "–" }
        let f: NumberFormatter = NumberFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.numberStyle = .decimal
        f.minimumFractionDigits = v == v.rounded() ? 0 : 2
        f.maximumFractionDigits = 2
        return (f.string(from: NSNumber(value: abs(v))) ?? "\(v)") + " kr"
    }

    nonisolated static func diff(_ a: ReadResult, _ b: ReadResult) -> [Fin40Change] {
        var out: [Fin40Change] = []
        if !b.merchant.isEmpty && a.merchant != b.merchant { out.append(Fin40Change(field: "Butikk", old: a.merchant, new: b.merchant)) }
        if !b.date.isEmpty && a.date.prefix(10) != b.date.prefix(10) { out.append(Fin40Change(field: "Dato", old: String(a.date.prefix(10)), new: String(b.date.prefix(10)))) }
        if let t = b.total, abs((a.total ?? 0) - t) > 0.004 { out.append(Fin40Change(field: "Beløp", old: money(a.total), new: money(t))) }
        let n: Int = Swift.max(a.items.count, b.items.count)
        var i: Int = 0
        while i < n {
            let x: ReadResult.Item? = i < a.items.count ? a.items[i] : nil
            let y: ReadResult.Item? = i < b.items.count ? b.items[i] : nil
            let xs: String = x.map { $0.name + " " + money($0.amount) } ?? ""
            let ys: String = y.map { $0.name + " " + money($0.amount) } ?? ""
            if xs != ys { out.append(Fin40Change(field: "Linje \(i + 1)", old: xs.isEmpty ? "–" : xs, new: ys.isEmpty ? "fjernet" : ys)) }
            i += 1
        }
        return out
    }

    /// Summen av linjene stemmer ikke med totalen i den nye lesingen.
    var sumMismatch: Bool {
        guard let r = result, let t = r.result.total, !r.result.items.isEmpty else { return false }
        let sum: Double = r.result.items.compactMap { (i: ReadResult.Item) -> Double? in i.amount }.reduce(0, +)
        return abs(abs(t) - abs(sum)) > 0.5
    }

    func apply(_ store: Store, keepNew: Bool, txId: Int) {
        guard let r = result else { shown = false; return }
        store.applyReanalyze(r, keepNew: keepNew)
        shown = false
        Task {
            try? await Task.sleep(nanoseconds: 600_000_000)
            if let d = try? await store.api.call("GET", "/transactions/\(txId)") { store.txDetail = PaperTxData(JS.obj(d)) }
        }
    }
}

/// Knappen under kvitteringen (full bredde, mørk).
struct Fin40RereadButton: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Fin40Reread { Fin40Reread.shared }
    let d: PaperTxData

    var body: some View {
        Button { m.run(d, store) } label: {
            HStack(spacing: 8) {
                if m.busy { ProgressView().tint(p.bg) }
                Text(m.busy ? "Glimt leser kvitteringen på nytt …" : "✦ La Glimt lese kvitteringen på nytt").font(PF.ui(14.5, .bold))
            }
            .foregroundStyle(p.bg)
            .frame(maxWidth: .infinity).frame(height: 48)
            .background(p.ink, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(m.busy)
        .sheet(isPresented: Binding<Bool>(get: { m.shown }, set: { (v: Bool) in m.shown = v })) {
            Fin40RereadSheet(txId: d.id, lineCount: d.lines.count, total: d.total ?? d.amount)
                .environment(\.paper, p)
                .presentationDetents([.medium, .large])
        }
    }
}

struct Fin40RereadSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Fin40Reread { Fin40Reread.shared }
    let txId: Int
    let lineCount: Int
    let total: Double

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    Text("✦ GLIMT").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
                    Spacer()
                }
                if m.busy {
                    Text("Glimt leser kvitteringen på nytt …").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                    Text("Sjekker butikk, dato, hver linje og at summen stemmer").font(PF.ui(13.5)).foregroundStyle(p.mut)
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 10)
                } else if !m.err.isEmpty {
                    Text(m.err).font(PF.ui(14)).foregroundStyle(Color(hex: "#b23a2a")).fixedSize(horizontal: false, vertical: true)
                    Tfa40Primary(title: "OK") { m.shown = false }
                } else if m.changes.isEmpty {
                    Text("Ingen endringer").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                    Text("Butikk, dato og alle \(lineCount) linjer stemmer, og summen er " + Fin40Reread.money(total) + ".")
                        .font(PF.ui(14)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    Tfa40Primary(title: "OK") { m.shown = false }
                } else {
                    Text("Glimt fant \(m.changes.count) " + (m.changes.count == 1 ? "endring" : "endringer")).font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                    VStack(spacing: 0) {
                        ForEach(Array(m.changes.enumerated()), id: \.offset) { i, c in
                            Fin40ChangeRow(c: c, first: i == 0)
                        }
                    }
                    .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    if m.sumMismatch {
                        Text("Summen av linjene stemmer ikke med totalen. Sjekk i «Rediger alt».")
                            .font(PF.ui(13, .semibold)).foregroundStyle(Color(hex: "#b23a2a")).fixedSize(horizontal: false, vertical: true)
                    }
                    HStack(spacing: 8) {
                        Tfa40Secondary(title: "Behold som før") { m.apply(store, keepNew: false, txId: txId) }
                        Tfa40Primary(title: "Bruk endringene") { m.apply(store, keepNew: true, txId: txId) }
                    }
                }
            }
            .padding(20)
        }
        .background(p.bg.ignoresSafeArea())
    }
}

struct Fin40ChangeRow: View {
    @Environment(\.paper) private var p
    let c: Fin40Change
    let first: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(c.field.uppercased()).font(PF.mono(10)).tracking(1).foregroundStyle(p.mut)
            HStack(spacing: 6) {
                Text(c.old).strikethrough().foregroundStyle(p.mut)
                Text("→").foregroundStyle(p.mut)
                Text(c.new).foregroundStyle(p.ink).fontWeight(.semibold)
            }
            .font(PF.ui(13.5))
            .lineLimit(2)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { if !first { Rectangle().fill(p.line).frame(height: 1) } }
    }
}

/* ---------- Rediger alt ---------- */

struct Fin40Line: Identifiable, Hashable {
    var id: UUID = UUID()
    var name: String
    var price: String
}

struct Fin40EditSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let d: PaperTxData
    let close: () -> Void
    @State private var merchant: String = ""
    @State private var date: Date = Date()
    @State private var amount: String = ""
    @State private var income: Bool = false
    @State private var category: String = ""
    @State private var account: String = ""
    @State private var note: String = ""
    @State private var lines: [Fin40Line] = []
    @State private var busy: Bool = false
    @State private var err: String = ""
    @State private var ready: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Button("Avbryt", action: close).font(PF.ui(15, .semibold)).foregroundStyle(p.mut)
                    Spacer()
                    Text("Rediger alt").font(PF.ui(16, .bold)).foregroundStyle(p.ink)
                    Spacer()
                    Button { save() } label: {
                        if busy { ProgressView() } else { Text("Lagre").font(PF.ui(15, .bold)).foregroundStyle(p.lab) }
                    }
                    .buttonStyle(.plain)
                    .disabled(busy)
                }
                field("BUTIKK / BESKRIVELSE") {
                    TextField("Butikk", text: $merchant).font(PF.ui(16)).foregroundStyle(p.ink)
                }
                field("DATO") {
                    DatePicker("Dato", selection: $date, displayedComponents: [.date]).labelsHidden()
                }
                field(income ? "BELØP · INNTEKT" : "BELØP · UTGIFT") {
                    HStack {
                        TextField("0", text: $amount).keyboardType(.decimalPad).font(PF.serif(26)).foregroundStyle(p.ink)
                        Text("kr").font(PF.ui(15)).foregroundStyle(p.mut)
                    }
                }
                chips("KATEGORI", (store.boot?.categories ?? []).map(\.name), $category)
                chips("KONTO", (store.boot?.accounts ?? []).map(\.name), $account)
                field("NOTAT") {
                    TextField("Notat", text: $note, axis: .vertical).lineLimit(1...4).font(PF.ui(15)).foregroundStyle(p.ink)
                }
                linesBox
                if !err.isEmpty {
                    Text(err).font(PF.ui(13, .semibold)).foregroundStyle(Color(hex: "#b23a2a"))
                }
                if !d.lines.isEmpty {
                    Button { resetLines() } label: {
                        Text("Tilbakestill til slik Glimt leste den").font(PF.ui(13.5, .semibold)).foregroundStyle(p.lab).frame(height: 40)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(p.bg.ignoresSafeArea())
        .onAppear { fill() }
    }

    private func field<C: View>(_ label: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut)
            content()
                .padding(.horizontal, 14).frame(minHeight: 48)
                .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private func chips(_ label: String, _ all: [String], _ sel: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(all, id: \.self) { (n: String) in
                        let on: Bool = n == sel.wrappedValue
                        Button { sel.wrappedValue = n; Haptic30.light() } label: {
                            Text(n).font(PF.ui(13, .bold)).foregroundStyle(on ? p.bg : p.ink)
                                .padding(.horizontal, 12).frame(height: 34)
                                .background(on ? p.ink : p.card, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var linesBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("VARELINJER").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut)
            VStack(spacing: 0) {
                ForEach($lines) { (l: Binding<Fin40Line>) in
                    HStack(spacing: 8) {
                        TextField("Vare", text: l.name).font(PF.ui(14)).foregroundStyle(p.ink)
                        TextField("0", text: l.price).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            .font(PF.mono(14)).foregroundStyle(p.ink).frame(width: 90)
                        Button { remove(l.wrappedValue.id) } label: {
                            Text("×").font(PF.ui(18, .bold)).foregroundStyle(p.mut).frame(width: 30, height: 36)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Fjern linje")
                    }
                    .padding(.horizontal, 12).frame(minHeight: 44)
                    .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
                }
                Button { lines.append(Fin40Line(name: "", price: "")) } label: {
                    Text("+ Legg til linje").font(PF.ui(13.5, .bold)).foregroundStyle(p.lab)
                        .frame(maxWidth: .infinity).frame(height: 44)
                }
                .buttonStyle(.plain)
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            if !lines.isEmpty {
                let ok: Bool = abs(sumLines - (Fin40EditSheet.num(amount) ?? 0)) < 0.01
                Text("Sum linjer " + Fin40Reread.money(sumLines) + (ok ? " · stemmer" : " · stemmer ikke med beløpet"))
                    .font(PF.ui(13, .semibold)).foregroundStyle(ok ? Color(hex: "#2f7a4f") : Color(hex: "#b23a2a"))
            }
        }
    }

    private var sumLines: Double {
        lines.compactMap { (l: Fin40Line) -> Double? in Fin40EditSheet.num(l.price) }.reduce(0, +)
    }

    nonisolated static func num(_ s: String) -> Double? {
        Double(s.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "\u{00a0}", with: "").replacingOccurrences(of: ",", with: "."))
    }

    static func fmt(_ v: Double) -> String {
        let s: String = v == v.rounded() ? String(Int(v)) : String(format: "%.2f", v)
        return s.replacingOccurrences(of: ".", with: ",")
    }

    private func fill() {
        if ready { return }
        ready = true
        merchant = d.merchant
        let parts: [String] = d.date.prefix(10).split(separator: "-").map(String.init)
        if parts.count == 3, let y = Int(parts[0]), let mo = Int(parts[1]), let da = Int(parts[2]),
           let dt = Calendar.current.date(from: DateComponents(year: y, month: mo, day: da, hour: 12)) {
            date = dt
        }
        income = d.amount > 0
        amount = Fin40EditSheet.fmt(abs(d.amount))
        category = d.category
        account = d.account
        note = d.fin40.note
        resetLines()
    }

    private func resetLines() {
        lines = d.lines.map { (l: PaperTxData.ReceiptLine) -> Fin40Line in Fin40Line(name: l.name, price: l.price.map { Fin40EditSheet.fmt($0) } ?? "") }
    }

    private func remove(_ id: UUID) {
        lines.removeAll { $0.id == id }
    }

    private func save() {
        guard let a = Fin40EditSheet.num(amount) else { err = "Skriv et gyldig beløp."; return }
        busy = true
        err = ""
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        let ls: [[String: Any]] = lines.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }.map { (l: Fin40Line) -> [String: Any] in
            var o: [String: Any] = ["name": l.name]
            if let pr = Fin40EditSheet.num(l.price) { o["price"] = pr }
            return o
        }
        let body: [String: Any] = ["description": merchant, "merchant": merchant, "date": f.string(from: date),
                                   "amount": income ? abs(a) : -abs(a), "category": category, "account": account,
                                   "note": note, "lines": ls]
        let id: Int = d.id
        Task {
            do {
                _ = try await store.api.call("PATCH", "/transactions/\(id)", json: body)
                if let nd = try? await store.api.call("GET", "/transactions/\(id)") { store.txDetail = PaperTxData(JS.obj(nd)) }
                try? await store.loadTx()
                Haptic30.double()
                store.flash("Transaksjonen er oppdatert")
                busy = false
                close()
            } catch {
                busy = false
                err = (error as? APIError)?.message ?? error.localizedDescription
            }
        }
    }
}
