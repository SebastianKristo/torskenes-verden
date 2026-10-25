import SwiftUI
import UIKit

// ---------------- Prompt 48 (Del 5): skjemaet etter skanningen, pillen og bryterne under Innstillinger → Glimt ----------------
// Skjemaet viser kvitteringen Glimt kom fram til (eller utkastet fra iPhonen når Glimt ikke svarer), med usikre felt gule
// (failed_fields + uncertain_fields fra serveren), merkelappen for veien («iPhone», «iPhone + Glimt», «Mac», «Glimt», «Gemini»)
// og stegene i pipeline. «Lagre» sender rettelsene (PATCH /receipts/:id + POST /receipts/:id/corrections). Kvitteringen er
// allerede lagret med originalbildet og ligger under Til godkjenning til den bokføres.

struct Receipt48Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var f: Receipt48Flow { Receipt48Flow.shared }

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) { Receipt48Pill(p: p) }
            .sheet(item: Binding<Rc48Result?>(get: { f.shown }, set: { (v: Rc48Result?) in if v == nil, f.shown != nil { f.close() } })) { (r: Rc48Result) in
                Receipt48Sheet(result: r)
                    .environment(\.paper, p)
                    .presentationDetents([.large])
                    .interactiveDismissDisabled(true)
            }
    }
}

extension View {
    func receipt48Host(_ p: PaperPalette) -> some View { modifier(Receipt48Host(p: p)) }
}

/// «Leser teksten på iPhonen …» / «Glimt kontrollerer kvitteringen …»
struct Receipt48Pill: View {
    let p: PaperPalette
    @MainActor private var f: Receipt48Flow { Receipt48Flow.shared }

    var body: some View {
        if let s = f.status {
            HStack(spacing: 8) {
                ProgressView().tint(p.bg)
                Text(s).font(PF.ui(13, .bold)).foregroundStyle(p.bg)
            }
            .padding(.horizontal, 16).frame(height: 40)
            .background(p.ink, in: Capsule())
            .padding(.bottom, 104)
            .transition(.opacity)
            .allowsHitTesting(false)
        }
    }
}

/* ---------- Skjemaet ---------- */

struct Receipt48Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let result: Rc48Result
    @State private var merchant: String = ""
    @State private var org: String = ""
    @State private var date: String = ""
    @State private var time: String = ""
    @State private var total: String = ""
    @State private var currency: String = "NOK"
    @State private var payment: String = ""
    @State private var category: String = ""
    @State private var saving: Bool = false
    @State private var error: String = ""
    @State private var started: Bool = false
    @MainActor private var f: Receipt48Flow { Receipt48Flow.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Receipt48Head(result: result)
                Receipt48Notes(result: result, open: openFlags)
                fields
                Receipt48Items(receipt: result.receipt, warn: warn("items", true))
                Receipt48Pipeline(steps: result.response?.pipeline ?? [])
                if let res = result.response { Receipt51RawSection(receiptId: res.receiptId, raw: res.stored?.ocr_raw) }
                if !error.isEmpty {
                    Text(error).font(PF.ui(13, .semibold)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
                }
                buttons
            }
            .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 30)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(p.bg.ignoresSafeArea())
        .onAppear { start() }
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: 10) {
            Receipt47Field(label: "Butikk", text: $merchant, warn: warn("merchant", merchant == orig.merchant))
            if merchant == orig.merchant, let res = result.response {
                // Prompt 51: hvor butikknavnet kom fra («fra org.nr.», «kjent butikk», «modellens forslag»).
                Receipt51SourceTag(source: res.merchantSource ?? res.stored?.merchant_source, label: res.merchantLabel ?? res.stored?.merchant_label)
            }
            HStack(spacing: 10) {
                Receipt47Field(label: "Dato (ÅÅÅÅ-MM-DD)", text: $date, warn: warn("date", date == orig.date), mono: true)
                Receipt47Field(label: "Klokkeslett", text: $time, warn: warn("time", time == (orig.time ?? "")), mono: true)
            }
            HStack(spacing: 10) {
                Receipt47Field(label: "Totalsum", text: $total, warn: warn("total", total == fmt(orig.total)), mono: true, numeric: true)
                Receipt47Field(label: "Valuta", text: $currency, warn: false, mono: true)
            }
            Receipt48CategoryPicker(category: $category, options: result.categories)
            HStack(spacing: 10) {
                Receipt47Field(label: "Betaling", text: $payment, warn: false)
                Receipt47Field(label: "Org.nr.", text: $org, warn: warn("org_number", org == (orig.orgNumber ?? "")), mono: true, numeric: true)
            }
        }
        .disabled(result.offline || saving)
    }

    @ViewBuilder private var buttons: some View {
        VStack(spacing: 8) {
            if result.offline {
                Bol24Button(title: "OK", fg: p.bg, bg: p.ink, border: nil, height: 48, font: 15) { f.close() }
            } else {
                Bol24Button(title: saving ? "Lagrer …" : "Lagre", fg: p.bg, bg: p.ink, border: nil, height: 48, font: 15) { save() }
                    .disabled(saving)
                Bol24Button(title: "Se på det senere", fg: p.ink, bg: Color.clear, border: p.line, height: 44) { f.close() }
                    .disabled(saving)
                Button { Task { await f.discard(result, store) } } label: {
                    Text("Forkast kvitteringen").font(PF.ui(14, .bold)).foregroundStyle(p.lab).frame(maxWidth: .infinity).frame(height: 40).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(saving)
            }
        }
        .padding(.top, 4)
    }

    private var orig: Rc48Receipt { result.receipt }

    /// Gult felt: serveren (eller den lokale kontrollen) flagget det, og brukeren har ikke endret det ennå.
    private func warn(_ field: String, _ untouched: Bool) -> Bool { result.flagged.contains(field) && untouched }

    /// Feltene som fortsatt er flagget (for notatboksen).
    private var openFlags: [String] {
        let order: [String] = ["merchant", "date", "total", "items", "vat", "org_number", "time", "discounts"]
        return order.filter { (k: String) in result.flagged.contains(k) }
    }

    private func fmt(_ v: Double) -> String { v > 0 ? String(format: "%.2f", v) : "" }

    private func start() {
        if started { return }
        started = true
        let r: Rc48Receipt = orig
        merchant = r.merchant
        org = r.orgNumber ?? ""
        date = r.date
        time = r.time ?? ""
        total = fmt(r.total)
        currency = r.currency.isEmpty ? "NOK" : r.currency
        payment = r.paymentMethod ?? ""
        category = r.categorySuggestion
    }

    /// Kvitteringen slik brukeren har rettet den (varelinjer, rabatter og mva som Glimt leste dem).
    private var edited: Rc48Receipt {
        var r: Rc48Receipt = orig
        r.merchant = merchant.trimmingCharacters(in: .whitespacesAndNewlines)
        r.orgNumber = org.isEmpty ? nil : org
        r.date = date.trimmingCharacters(in: .whitespaces)
        r.time = time.isEmpty ? nil : time
        r.total = Receipt47.number(total) ?? 0
        r.currency = currency
        r.paymentMethod = payment.isEmpty ? nil : payment
        r.categorySuggestion = category
        return r
    }

    private func save() {
        if saving { return }
        if edited.merchant.isEmpty || !(edited.total > 0) {
            error = "Butikk og totalsum må fylles ut"
            Haptics.shared.warning()
            return
        }
        saving = true
        error = ""
        let e: Rc48Receipt = edited
        Task { @MainActor in
            let msg: String? = await f.save(result, edited: e, store)
            saving = false
            if let msg { error = msg; Haptics.shared.warning() }
        }
    }
}

struct Receipt48Head: View {
    @Environment(\.paper) private var p
    let result: Rc48Result

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                Text(result.offline ? "Utkast fra iPhonen" : "Sjekk kvitteringen").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                HStack(spacing: 6) {
                    Text(result.label).font(PF.ui(11.5, .bold)).foregroundStyle(p.pos)
                        .padding(.horizontal, 9).frame(height: 22)
                        .overlay(Capsule().stroke(p.pos, lineWidth: 1))
                    Text(sub).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Image(uiImage: result.image).resizable().scaledToFill()
                .frame(width: 56, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(p.line, lineWidth: 1))
        }
    }

    private var sub: String {
        guard let r = result.response else { return "sendes til Glimt når forbindelsen er tilbake" }
        var s: String = Rc48Check.confidenceText(r.confidence)
        if let sec = r.seconds { s += String(format: " · %.1f s", sec) }
        return s
    }
}

/// Gul boks med det som ikke stemmer (og feilmeldingen når ingen steg ga en tolkning).
struct Receipt48Notes: View {
    let result: Rc48Result
    let open: [String]

    var body: some View {
        if !notes.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("Sjekk de gule feltene").font(PF.ui(13.5, .bold)).foregroundStyle(Rc47Colors.warnInk)
                ForEach(notes, id: \.self) { (n: String) in
                    Text("• " + n).font(PF.ui(12.5)).foregroundStyle(Rc47Colors.warnInk).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Rc47Colors.warnBg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private var notes: [String] {
        var out: [String] = open.map { (k: String) in Rc48Check.fieldName(k) }
        if let r = result.response, r.receipt == nil {
            out.insert("Glimt klarte ikke å tolke kvitteringen – fyll ut feltene", at: 0)
        }
        if result.offline { out.append("Glimt kontrollerer utkastet når kvitteringen er sendt") }
        return out
    }
}

struct Receipt48CategoryPicker: View {
    @Environment(\.paper) private var p
    @Binding var category: String
    let options: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Kategori").font(PF.ui(12.5)).foregroundStyle(p.mut)
            Menu {
                Button("Ingen forslag") { category = "" }
                ForEach(options, id: \.self) { (c: String) in
                    Button(c) { category = c }
                }
            } label: {
                HStack {
                    Text(category.isEmpty ? "Velg kategori" : category).font(PF.ui(15, .semibold)).foregroundStyle(category.isEmpty ? p.mut : p.ink)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down").font(.dyn51(size: 12, weight: .semibold)).foregroundStyle(p.mut)
                }
                .padding(.horizontal, 12).frame(height: 46)
                .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
                .contentShape(Rectangle())
            }
        }
    }
}

/// Varelinjer, rabatter og mva (lesevisning) med summen. Gul når summen ikke stemmer med totalen.
struct Receipt48Items: View {
    @Environment(\.paper) private var p
    let receipt: Rc48Receipt
    let warn: Bool

    var body: some View {
        if !receipt.items.isEmpty || !receipt.discounts.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Text("Varelinjer · \(receipt.items.count)").font(PF.ui(12.5)).foregroundStyle(warn ? Rc47Colors.warnInk : p.mut).padding(.bottom, 6)
                ForEach(receipt.items) { (i: Rc48Item) in row(qty(i) + i.description, i.amount) }
                ForEach(receipt.discounts) { (d: Rc48Discount) in row(d.description, d.amount) }
                sumRow
                ForEach(receipt.vat.indices, id: \.self) { (i: Int) in
                    row("MVA " + String(format: "%.0f", receipt.vat[i].rate) + " %", receipt.vat[i].amount)
                }
            }
            .padding(12)
            .background(warn ? Rc47Colors.warnBg : p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(warn ? Rc47Colors.warnLine : p.line, lineWidth: 1))
        }
    }

    private func row(_ name: String, _ amount: Double) -> some View {
        HStack(spacing: 8) {
            Text(name).font(PF.ui(13.5)).foregroundStyle(p.ink).lineLimit(2)
            Spacer(minLength: 6)
            Text(Receipt47.kr(amount)).font(PF.mono(13, bold: false)).foregroundStyle(p.ink).lineLimit(1)
        }
        .padding(.vertical, 4)
    }

    private var sumRow: some View {
        HStack {
            Text("Sum varelinjer").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
            Spacer()
            Text(Receipt47.kr(Rc48Check.itemSum(receipt))).font(PF.mono(13)).foregroundStyle(p.ink)
        }
        .padding(.vertical, 6)
        .overlay(alignment: .top) { Rectangle().fill(p.line).frame(height: 1) }
    }

    private func qty(_ i: Rc48Item) -> String {
        guard let q = i.quantity, q > 0, q != 1 else { return "" }
        let s: String = q == q.rounded() ? String(Int(q)) : String(format: "%.2f", q)
        return s + " × "
    }
}

/// Veien gjennom kjeden: ett steg per linje («C · Mac Vision + lokal modell · besto · 1,5 s»).
struct Receipt48Pipeline: View {
    @Environment(\.paper) private var p
    let steps: [Rc48Step]

    var body: some View {
        if !steps.isEmpty {
            VStack(alignment: .leading, spacing: 3) {
                Text("VEI GJENNOM GLIMT").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut)
                ForEach(steps) { (s: Rc48Step) in
                    Text(line(s)).font(PF.ui(12)).foregroundStyle(s.status == "ok" ? p.ink : p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func line(_ s: Rc48Step) -> String {
        var t: String = s.step + " · " + (s.name ?? s.step) + " · " + Rc48Check.statusText(s.status)
        if let ms = s.ms, ms > 0 { t += String(format: " · %.1f s", ms / 1000) }
        if let r = s.reason, !r.isEmpty, s.status == "skipped" { t += " (" + r + ")" }
        return t
    }
}

/* ---------- Innstillinger → Glimt → KVITTERINGER ---------- */

struct Receipt48Settings: View {
    @Environment(\.scenePhase) private var phase
    @State private var ocr: Bool = Receipt48Flow.ocrEnabled
    @State private var parse: Bool = Receipt47.enabled
    @State private var avail: Rc47Avail = Receipt47.availability()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Glimt35Label(text: "KVITTERINGER").padding(.top, 4)
            Glimt35ToggleRow(name: "Les teksten på iPhone", sub: "Apple Vision leser teksten på telefonen og sender den med bildet til Glimt.", on: ocr) { toggleOcr() }
                .overlay(alignment: .top) { Rectangle().fill(Brief34C.line).frame(height: 1) }
            if ocr {
                // Språkvalget for Vision på denne iPhonen (nb-NO hvis støttet, ellers dansk/svensk for æ/ø/å + en-US).
                Text("Språk: " + Rc48Lang.current.languages.joined(separator: ", ") + " · " + Rc48Lang.current.note)
                    .font(PF.ui(11.5)).foregroundStyle(Brief34C.mut).fixedSize(horizontal: false, vertical: true)
            }
            Glimt35ToggleRow(name: "Tolk kvitteringer på iPhone", sub: parseSub, on: parse && ocr && avail.ok) { toggleParse() }
                .opacity(avail.ok && ocr ? 1 : 0.45)
                .disabled(!avail.ok || !ocr)
            if !avail.ok {
                Text(avail.reason).font(PF.ui(12.5, .semibold)).foregroundStyle(Brief34C.red).fixedSize(horizontal: false, vertical: true)
            }
            Text("Begge er av som standard. Bildet sendes bare til Homelab-serveren din, og Glimt kontrollerer alltid resultatet (Mac-en tar over når iPhonen ikke klarer det).")
                .font(PF.ui(12)).foregroundStyle(Brief34C.mut).fixedSize(horizontal: false, vertical: true)
        }
        .onAppear { refresh() }
        .onChange(of: phase) { (_: ScenePhase, v: ScenePhase) in if v == .active { refresh() } }
    }

    private var parseSub: String {
        ocr ? "Apple Intelligence foreslår butikk, dato, varer og sum på telefonen." : "Krever «Les teksten på iPhone»."
    }

    private func refresh() {
        avail = Receipt47.availability()
        ocr = Receipt48Flow.ocrEnabled
        parse = Receipt47.enabled
    }

    private func toggleOcr() {
        ocr.toggle()
        Receipt48Flow.ocrEnabled = ocr
        Haptics.shared.select()
    }

    private func toggleParse() {
        avail = Receipt47.availability()
        guard avail.ok, ocr else { return }
        parse.toggle()
        Receipt47.enabled = parse
        Haptics.shared.select()
    }
}
