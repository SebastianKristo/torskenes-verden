import SwiftUI
import UIKit

// ---------------- Prompt 47: flyten, bekreftelsesarket og innstillingen for kvitteringer tolket på iPhone ----------------
// Motoren (Vision + Foundation Models) ligger i Receipt47Engine.swift. Her: køen av skanninger, reserven til Glimt, arket der
// brukeren retter gule felt før lagring, opplastingen (POST /finans/api/receipts/parsed) og bryteren under Innstillinger → Glimt.

/// Et ferdig tolket utkast som venter på bekreftelse.
struct Rc47Draft: Identifiable {
    let id: String = UUID().uuidString
    let images: [UIImage]
    let parsed: Rc47Parsed
    let ocr: String
}

@MainActor
@Observable
final class Receipt47Flow {
    static let shared = Receipt47Flow()

    /// «✦ Leser kvitteringen på iPhonen …»
    var reading: Bool = false
    /// Bekreftelsesarket.
    var draft: Rc47Draft? = nil
    private var waiting: [[UIImage]] = []

    /// Hver gruppe er én kvittering (flere sider fra dokumentskanneren = én gruppe).
    func handle(_ groups: [[UIImage]], _ store: Store) {
        let g: [[UIImage]] = groups.filter { !$0.isEmpty }
        if g.isEmpty { return }
        waiting.append(contentsOf: g)
        if !reading && draft == nil { next(store) }
    }

    /// Neste kvittering i køen (etter at arket er lukket).
    func next(_ store: Store) {
        guard draft == nil, !waiting.isEmpty else { return }
        let imgs: [UIImage] = waiting.removeFirst()
        reading = true
        Task { @MainActor in
            do {
                let r: (parsed: Rc47Parsed, ocr: String) = try await Receipt47.interpret(imgs)
                self.reading = false
                // Skanne-arket kan stå oppe: lukk det før bekreftelsesarket vises (ett ark om gangen).
                if store.paperScanOpen {
                    store.paperScanOpen = false
                    try? await Task.sleep(for: .milliseconds(450))
                }
                self.draft = Rc47Draft(images: imgs, parsed: r.parsed, ocr: r.ocr)
            } catch Receipt47.Failure.unavailable(_) {
                self.reading = false
                self.glimt(imgs, store, note: "Tolket av Glimt (Apple Intelligence utilgjengelig)")
            } catch {
                self.reading = false
                self.glimt(imgs, store, note: "Tolket av Glimt (iPhonen klarte ikke å lese kvitteringen)")
            }
        }
    }

    /// Reserven: bildet går til Glimt som før.
    func glimt(_ imgs: [UIImage], _ store: Store, note: String) {
        guard let first = imgs.first else { return }
        let f: Store.Upload = imgs.count == 1 ? .image(first) : .pdf(Receipts23Page.pdf(imgs))
        store.upload([f], onDevice47: false)
        store.flash(note)
        next(store)
    }

    /// Lukker arket uten å lagre.
    func cancel(_ store: Store) {
        draft = nil
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(400))
            self.next(store)
        }
    }

    /// Vedlegget: ett bilde (original + miniatyr som vanlig opplasting) eller flere sider som én PDF.
    static func fileParts(_ imgs: [UIImage], _ store: Store) -> [API.Part] {
        guard let first = imgs.first else { return [] }
        if imgs.count == 1 { return store.uploadParts(first).filter { $0.name != "scan" } }
        var parts: [API.Part] = [API.Part(name: "file", filename: "kvittering.pdf", mime: "application/pdf", data: Receipts23Page.pdf(imgs))]
        if let t = first.scaled(max: 240).jpegData(compressionQuality: 0.75) { parts.append(API.Part(name: "thumb", filename: "thumb.jpg", mime: "image/jpeg", data: t)) }
        return parts
    }

    /// Lagrer: sender det ferdige resultatet + bildet. Returnerer en feilmelding som vises i arket (400), ellers nil.
    func save(_ d: Rc47Draft, _ r: Rc47Parsed, _ store: Store) async -> String? {
        let data: String = Receipt47.json(Receipt47.payload(r, ocr: d.ocr))
        let parts: [API.Part] = [API.Part.text("data", data)] + Receipt47Flow.fileParts(d.images, store)
        guard store.canUploadNow else {
            queue(d, data, store, error: "Venter på Wi-Fi")
            return nil
        }
        do {
            _ = try await store.api.upload("/receipts/parsed", parts: parts, timeout: 45)
            finish(store, "Lagret · tolket på iPhone")
            try? await store.loadReceipts()
            await store.loadJobs()
            return nil
        } catch let e as APIError where e.status == 404 || e.status == 405 {
            // Eldre server uten /receipts/parsed: bildet tolkes av Glimt i stedet.
            draft = nil
            glimt(d.images, store, note: "Serveren tar ikke imot tolking fra iPhone ennå – tolket av Glimt")
            return nil
        } catch let e as APIError where e.status == 0 || e.status >= 500 {
            queue(d, data, store, error: e.message)
            return nil
        } catch let e as APIError {
            return e.message
        } catch {
            queue(d, data, store, error: error.localizedDescription)
            return nil
        }
    }

    /// Uten nett: lagres på telefonen og sendes når nettet er tilbake (UploadQueue18).
    private func queue(_ d: Rc47Draft, _ data: String, _ store: Store, error: String) {
        guard let first = d.images.first else { return }
        let f: Store.Upload = d.images.count == 1 ? .image(first) : .pdf(Receipts23Page.pdf(d.images))
        store.enqueuePending(f, folder: nil, error: error, parsed47: data)
        finish(store, "Lagret på telefonen · sendes når nettet er tilbake")
    }

    private func finish(_ store: Store, _ text: String) {
        draft = nil
        store.flash(text)
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(400))
            self.next(store)
        }
    }
}

/* ---------- Vertskap: arket og «Leser …»-pillen ---------- */

struct Receipt47Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var f: Receipt47Flow { Receipt47Flow.shared }

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) { pill }
            .sheet(item: Binding<Rc47Draft?>(get: { f.draft }, set: { (v: Rc47Draft?) in if v == nil, f.draft != nil { f.cancel(store) } })) { (d: Rc47Draft) in
                Receipt47Sheet(draft: d)
                    .environment(\.paper, p)
                    .presentationDetents([.large])
                    .interactiveDismissDisabled(true)
            }
    }

    @ViewBuilder private var pill: some View {
        if f.reading {
            HStack(spacing: 8) {
                ProgressView().tint(p.bg)
                Text("✦ Leser kvitteringen på iPhonen …").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
            }
            .padding(.horizontal, 16).frame(height: 40)
            .background(p.ink, in: Capsule())
            .padding(.bottom, 104)
            .transition(.opacity)
            .allowsHitTesting(false)
        }
    }
}

extension View {
    func receipt47Host(_ p: PaperPalette) -> some View { modifier(Receipt47Host(p: p)) }
}

/* ---------- Bekreftelsesarket ---------- */

enum Rc47Colors {
    static let warnBg: Color = Color(hex: "#f6e7a6")
    static let warnLine: Color = Color(hex: "#c9a227")
    static let warnInk: Color = Color(hex: "#5c4a00")
}

struct Receipt47Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let draft: Rc47Draft
    @State private var merchant: String = ""
    @State private var date: String = ""
    @State private var total: String = ""
    @State private var currency: String = "NOK"
    @State private var vat: String = ""
    @State private var category: String = "Annet"
    @State private var payment: String = ""
    @State private var lines: [Rc47Line] = []
    @State private var saving: Bool = false
    @State private var error: String = ""
    @State private var started: Bool = false
    @MainActor private var f: Receipt47Flow { Receipt47Flow.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                head
                Receipt47Notes(flags: flags)
                fields
                Receipt47Lines(lines: lines, warn: flags.lines, total: current.total)
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

    private var head: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Bekreft kvitteringen").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                Text("Tolket på iPhone").font(PF.ui(11.5, .bold)).foregroundStyle(p.pos)
                    .padding(.horizontal, 9).frame(height: 22)
                    .overlay(Capsule().stroke(p.pos, lineWidth: 1))
            }
            Spacer(minLength: 8)
            if let img = draft.images.first {
                Image(uiImage: img).resizable().scaledToFill()
                    .frame(width: 56, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(p.line, lineWidth: 1))
            }
        }
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: 10) {
            Receipt47Field(label: "Butikk", text: $merchant, warn: flags.merchant)
            HStack(spacing: 10) {
                Receipt47Field(label: "Dato (ÅÅÅÅ-MM-DD)", text: $date, warn: flags.date, mono: true)
                Receipt47Field(label: "Totalsum", text: $total, warn: flags.total, mono: true, numeric: true)
            }
            HStack(spacing: 10) {
                Receipt47Field(label: "Valuta", text: $currency, warn: false, mono: true)
                Receipt47Field(label: "MVA", text: $vat, warn: false, mono: true, numeric: true)
            }
            Receipt47CategoryPicker(category: $category)
            Receipt47Field(label: "Betalingsmiddel", text: $payment, warn: false)
        }
    }

    private var buttons: some View {
        VStack(spacing: 8) {
            Bol24Button(title: saving ? "Lagrer …" : "Lagre", fg: p.bg, bg: p.ink, border: nil, height: 48, font: 15) { save() }
                .disabled(saving || !(current.total > 0))
                .opacity(current.total > 0 ? 1 : 0.5)
            Bol24Button(title: "La Glimt lese den i stedet", fg: p.ink, bg: Color.clear, border: p.line, height: 44) {
                let imgs: [UIImage] = draft.images
                f.draft = nil
                f.glimt(imgs, store, note: "Sendt til Glimt")
            }
            .disabled(saving)
            Button { f.cancel(store) } label: {
                Text("Forkast").font(PF.ui(14, .bold)).foregroundStyle(p.lab).frame(maxWidth: .infinity).frame(height: 40).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(saving)
        }
        .padding(.top, 4)
    }

    /// Det brukeren ser nå (rettede felt).
    private var current: Rc47Parsed {
        Rc47Parsed(merchant: merchant, date: date.trimmingCharacters(in: .whitespaces), total: Receipt47.number(total) ?? 0,
                   currency: currency, vat: Receipt47.number(vat), lines: lines, category: category,
                   payment: payment.isEmpty ? nil : payment)
    }

    private var flags: Rc47Flags { Receipt47.check(current) }

    private func start() {
        if started { return }
        started = true
        let r: Rc47Parsed = draft.parsed
        merchant = r.merchant
        date = r.date
        total = r.total > 0 ? String(format: "%.2f", r.total) : ""
        currency = r.currency.isEmpty ? "NOK" : r.currency
        vat = r.vat.map { String(format: "%.2f", $0) } ?? ""
        category = Receipt47.categories.contains(r.category) ? r.category : "Annet"
        payment = r.payment ?? ""
        lines = r.lines
    }

    private func save() {
        if saving { return }
        saving = true
        error = ""
        let r: Rc47Parsed = current
        let d: Rc47Draft = draft
        Task { @MainActor in
            let msg: String? = await f.save(d, r, store)
            saving = false
            if let msg { error = msg; Haptics.shared.warning() }
        }
    }
}

/// Gul boks med det som ikke stemmer.
struct Receipt47Notes: View {
    let flags: Rc47Flags

    var body: some View {
        if !flags.notes.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("Sjekk de gule feltene").font(PF.ui(13.5, .bold)).foregroundStyle(Rc47Colors.warnInk)
                ForEach(flags.notes, id: \.self) { (n: String) in
                    Text("• " + n).font(PF.ui(12.5)).foregroundStyle(Rc47Colors.warnInk).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Rc47Colors.warnBg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }
}

struct Receipt47Field: View {
    @Environment(\.paper) private var p
    let label: String
    @Binding var text: String
    let warn: Bool
    var mono: Bool = false
    var numeric: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(PF.ui(12.5)).foregroundStyle(warn ? Rc47Colors.warnInk : p.mut)
            TextField(label, text: $text)
                .font(mono ? PF.mono(15, bold: false) : PF.ui(15, .semibold))
                .foregroundStyle(warn ? Rc47Colors.warnInk : p.ink)
                .keyboardType(numeric ? .decimalPad : .default)
                .textInputAutocapitalization(mono ? .never : .sentences)
                .autocorrectionDisabled()
                .padding(.horizontal, 12).frame(height: 46)
                .background(warn ? Rc47Colors.warnBg : p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(warn ? Rc47Colors.warnLine : p.line, lineWidth: warn ? 1.5 : 1))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct Receipt47CategoryPicker: View {
    @Environment(\.paper) private var p
    @Binding var category: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Kategori").font(PF.ui(12.5)).foregroundStyle(p.mut)
            Menu {
                ForEach(Receipt47.categories, id: \.self) { (c: String) in
                    Button(c) { category = c }
                }
            } label: {
                HStack {
                    Text(category).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down").font(.system(size: 12, weight: .semibold)).foregroundStyle(p.mut)
                }
                .padding(.horizontal, 12).frame(height: 46)
                .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
                .contentShape(Rectangle())
            }
        }
    }
}

/// Varelinjene (lesevisning) med summen. Gul når summen ikke stemmer med totalen.
struct Receipt47Lines: View {
    @Environment(\.paper) private var p
    let lines: [Rc47Line]
    let warn: Bool
    let total: Double

    var body: some View {
        if !lines.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Text("Varelinjer · \(lines.count)").font(PF.ui(12.5)).foregroundStyle(warn ? Rc47Colors.warnInk : p.mut).padding(.bottom, 6)
                ForEach(lines) { (l: Rc47Line) in row(l) }
                sumRow
            }
            .padding(12)
            .background(warn ? Rc47Colors.warnBg : p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(warn ? Rc47Colors.warnLine : p.line, lineWidth: 1))
        }
    }

    private func row(_ l: Rc47Line) -> some View {
        HStack(spacing: 8) {
            Text(qty(l) + l.name).font(PF.ui(13.5)).foregroundStyle(p.ink).lineLimit(2)
            Spacer(minLength: 6)
            Text(Receipt47.kr(l.price)).font(PF.mono(13, bold: false)).foregroundStyle(p.ink).lineLimit(1)
        }
        .padding(.vertical, 4)
    }

    private var sumRow: some View {
        HStack {
            Text("Sum varelinjer").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
            Spacer()
            Text(Receipt47.kr(Receipt47.lineSum(lines))).font(PF.mono(13)).foregroundStyle(p.ink)
        }
        .padding(.top, 6)
        .overlay(alignment: .top) { Rectangle().fill(p.line).frame(height: 1) }
    }

    private func qty(_ l: Rc47Line) -> String {
        guard let q = l.qty, q > 0, q != 1 else { return "" }
        let s: String = q == q.rounded() ? String(Int(q)) : String(format: "%.2f", q)
        return s + " × "
    }
}

/* ---------- Innstillinger → Glimt → KVITTERINGER ---------- */

struct Receipt47Settings: View {
    @Environment(\.scenePhase) private var phase
    @State private var on: Bool = Receipt47.enabled
    @State private var avail: Rc47Avail = Receipt47.availability()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Glimt35Label(text: "KVITTERINGER").padding(.top, 4)
            Glimt35ToggleRow(name: "Tolk kvitteringer på iPhone", sub: sub, on: on && avail.ok) { toggle() }
                .opacity(avail.ok ? 1 : 0.45)
                .disabled(!avail.ok)
                .overlay(alignment: .top) { Rectangle().fill(Brief34C.line).frame(height: 1) }
            if !avail.ok { reason }
            if on && !avail.ok {
                Text("Bryteren står på: til Apple Intelligence er tilgjengelig, tolkes kvitteringene av Glimt.")
                    .font(PF.ui(12)).foregroundStyle(Brief34C.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .onAppear { avail = Receipt47.availability() }
        .onChange(of: phase) { (_: ScenePhase, v: ScenePhase) in if v == .active { avail = Receipt47.availability() } }
    }

    private var sub: String {
        "Bruker Apple Intelligence på enheten i stedet for Glimt på serveren. Kvitteringen forlater ikke telefonen før den er tolket."
    }

    @ViewBuilder private var reason: some View {
        HStack(spacing: 10) {
            Text(avail.reason).font(PF.ui(12.5, .semibold)).foregroundStyle(Brief34C.red).fixedSize(horizontal: false, vertical: true)
            if avail.showsSettingsLink {
                Button {
                    if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
                } label: {
                    Text("Åpne Innstillinger ›").font(PF.ui(12.5, .bold)).foregroundStyle(Brief34C.ink).underline()
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func toggle() {
        avail = Receipt47.availability()
        guard avail.ok else { return }
        on.toggle()
        Receipt47.enabled = on
        Haptics.shared.select()
    }
}
