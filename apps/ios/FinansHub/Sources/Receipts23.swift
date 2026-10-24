import SwiftUI
import PhotosUI
import UIKit
import VisionKit
import UniformTypeIdentifiers

/* ---------------- Prompt 23: Kvitteringer i Papir (Mobil Papir App → side «kvitt») ---------------- */

/// Én linje i KØ: en jobb på serveren eller en fil som venter på nett.
struct Receipt23Queued: Identifiable, Hashable {
    let id: String
    let name: String
    /// read | wait | ready | error
    let kind: String
    let text: String
    let progress: Int
    let job: Bool
}

@MainActor
@Observable
final class Receipts23Model {
    var jobs: [Receipt23Queued] = []
    var review: [Receipt] = []
    var booked: [Receipt] = []
    var open: String? = nil
    var loaded: Bool = false
    /// Jobber appen har sett lese, og som nå er ferdige («Klar · trykk for å bekrefte»).
    private var seenActive: Set<String> = []
    private var ready: [String] = []

    /// Prompt 34: kvitteringer under AI-analyse står i egen seksjon (Receipts34.swift) og holder rask oppdatering i gang.
    var active: Bool { jobs.contains { $0.kind == "read" } || !Receipts34AiModel.shared.items.isEmpty }

    func load(_ store: Store) async {
        if let d = try? await store.api.call("GET", "/receipts/jobs"), let list = (try? JSONSerialization.jsonObject(with: d)) as? [[String: Any]] {
            var out: [Receipt23Queued] = []
            var aiRaw: [[String: Any]] = []
            for o in list {
                let id: String = JS.str(o, "id") ?? ""
                let st: String = JS.str(o, "status") ?? ""
                let name: String = JS.str(o, "name") ?? JS.str(o, "merchant") ?? "Kvittering"
                let p: Int = JS.int(o, "progress") ?? 0
                // Prompt 23 (server): statusText, f.eks. «✦ Gemini svarte ikke innen 20 s · prøver Groq …».
                let note: String? = JS.str(o, "statusText")
                if st == "pending" || st == "processing" {
                    // Prompt 34: går automatisk videre til «Analyseres av AI» (ikke en linje i KØ).
                    seenActive.insert(id)
                    aiRaw.append(o)
                    _ = p
                } else if st == "error" {
                    out.append(Receipt23Queued(id: id, name: name, kind: "error", text: note ?? ("Feilet · " + (JS.str(o, "error") ?? "prøv igjen")), progress: 100, job: true))
                }
                // Prompt 34: ferdig lest flyttes rett til Til gjennomgang (eller Bokført), ingen «Klar»-linje i KØ.
            }
            jobs = out
            await Receipts34AiModel.shared.take(aiRaw, store)
        }
        if let r = try? await store.api.get("/receipts?status=needs_review", as: [Receipt].self) {
            let readyIds: [String] = ready
            review = r.filter { !readyIds.contains($0.id) }
            store.reviewCount = r.count
        }
        if let b = try? await store.api.get("/receipts?status=booked", as: [Receipt].self) { booked = Array(b.prefix(20)) }
        loaded = true
    }

    /// «Klar»-linja: flyttes til Til gjennomgang og åpnes der.
    func confirm(_ id: String, _ store: Store) async {
        ready.removeAll { $0 == id }
        seenActive.remove(id)
        await load(store)
        open = id
    }

    func approve(_ r: Receipt, name: String, amount: String, category: Int?, _ store: Store) async {
        let clean: String = amount.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "\u{00a0}", with: "")
            .replacingOccurrences(of: "−", with: "").replacingOccurrences(of: "-", with: "").replacingOccurrences(of: ",", with: ".")
        let total: Double = Double(clean) ?? r.total ?? 0
        let n: String = name.trimmingCharacters(in: .whitespaces).isEmpty ? (r.merchant ?? "Kvittering") : name
        var body: [String: Any] = ["merchant": n, "total": total]
        if let c = category { body["categoryId"] = c }
        if r.date == nil { body["date"] = JS.fmt(Date(), "yyyy-MM-dd") }
        do {
            try await store.api.call("PATCH", "/receipts/\(r.id)", json: body)
            try await store.api.call("POST", "/receipts/\(r.id)/book")
            open = nil
            Haptics.shared.success()
            store.flash("Bokført · \(n)")
        } catch {
            store.message = error.localizedDescription
        }
        await load(store)
    }

    func reprocess(_ id: String, _ store: Store) async {
        do {
            try await store.api.call("POST", "/receipts/\(id)/reprocess")
            seenActive.insert(id)
            store.flash("✦ Glimt analyserer på nytt")
        } catch { store.message = error.localizedDescription }
        await load(store)
    }

    func delete(_ id: String, _ store: Store) async {
        do {
            try await store.api.call("DELETE", "/receipts/\(id)")
            open = nil
            store.flash("Kvitteringen er slettet")
        } catch { store.message = error.localizedDescription }
        await load(store)
    }

    /// ↺ på en bokført kvittering: tilbake til gjennomgang.
    func unbook(_ id: String, _ store: Store) async {
        do {
            try await store.api.call("POST", "/receipts/\(id)/unbook")
            store.flash("Sendt tilbake til gjennomgang")
        } catch { store.message = "Kunne ikke sende kvitteringen tilbake til gjennomgang" }
        await load(store)
    }
}

struct Receipts23Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var model: Receipts23Model = Receipts23Model()
    @State private var scanning: Bool = false
    @State private var importing: Bool = false
    @State private var items: [PhotosPickerItem] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            cameraCard
            HStack(spacing: 10) {
                PhotosPicker(selection: $items, maxSelectionCount: 20, matching: .images) {
                    Receipts23SourceLabel(title: "Bilder", icon: "photo")
                }
                .buttonStyle(.plain)
                Button { Haptics.shared.tap(); importing = true } label: { Receipts23SourceLabel(title: "Filer", icon: "doc") }
                    .buttonStyle(.plain)
            }
            // Prompt 34: ✦ ANALYSERES AV AI · N over KØ og TIL GJENNOMGANG (Receipts34.swift).
            Receipts34AiSection()
            Receipts23QueueSection(model: model)
            Receipts23ReviewSection(model: model)
            Receipts23BookedSection(model: model)
        }
        .task {
            while !Task.isCancelled {
                await model.load(store)
                let fast: Bool = model.active || store.uploading > 0 || !store.myPendingUploads.isEmpty
                try? await Task.sleep(for: .seconds(fast ? 2 : 20))
            }
        }
        .fullScreenCover(isPresented: $scanning) { scanner.ignoresSafeArea() }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, .image], allowsMultipleSelection: true) { res in
            if case .success(let urls) = res { importFiles(urls) }
        }
        .onChange(of: items) { _, list in
            guard !list.isEmpty else { return }
            Task {
                var files: [Store.Upload] = []
                for it in list {
                    if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { files.append(.image(img)) }
                }
                items = []
                store.upload(files)
            }
        }
    }

    private var cameraCard: some View {
        Button { Haptics.shared.tap(); scanning = true } label: {
            HStack(spacing: 14) {
                Image(systemName: "camera").font(.system(size: 22, weight: .semibold)).foregroundStyle(Color.white)
                    .frame(width: 52, height: 52)
                    .background(p.lab, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("Ta bilde av kvittering").font(PF.ui(17, .bold)).foregroundStyle(p.ink)
                    Text("Bakkamera · ✦ Gemini leser beløp og butikk").font(PF.ui(13)).foregroundStyle(p.mut)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .black.opacity(0.12), radius: 15, y: 10)
        }
        .buttonStyle(.plain)
    }

    /// Dokumentskanneren (automatisk beskjæring). Uten støtte: vanlig kamera.
    @ViewBuilder private var scanner: some View {
        if VNDocumentCameraViewController.isSupported {
            Receipts23DocScanner { imgs in
                scanning = false
                deliver(imgs)
            }
        } else {
            CameraView { img in
                scanning = false
                if let img { deliver([img]) }
            }
        }
    }

    private func deliver(_ imgs: [UIImage]) {
        if imgs.isEmpty { return }
        // Prompt 48: flere sider fra skanneren er én kvittering – til POST /receipts/scan (Receipt48Flow.swift). I en bolig
        // eller fra «Legg ved kvittering» som før (én side som bilde, flere som én PDF).
        store.uploadScanned48(imgs)
    }

    static func pdf(_ imgs: [UIImage]) -> Data {
        let size: CGSize = imgs.first?.size ?? CGSize(width: 612, height: 792)
        let r = UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: size))
        return r.pdfData { ctx in
            for im in imgs {
                let b = CGRect(origin: .zero, size: im.size)
                ctx.beginPage(withBounds: b, pageInfo: [:])
                im.draw(in: b)
            }
        }
    }

    private func importFiles(_ urls: [URL]) {
        var files: [Store.Upload] = []
        for u in urls {
            let ok: Bool = u.startAccessingSecurityScopedResource()
            defer { if ok { u.stopAccessingSecurityScopedResource() } }
            guard let d = try? Data(contentsOf: u) else { continue }
            if u.pathExtension.lowercased() == "pdf" { files.append(.pdf(d)) } else if let img = UIImage(data: d) { files.append(.image(img)) }
        }
        store.upload(files)
    }
}

/// «Bilder» og «Filer»: to like kort i rad.
struct Receipts23SourceLabel: View {
    @Environment(\.paper) private var p
    let title: String
    let icon: String
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 17, weight: .semibold))
            Text(title).font(PF.ui(15, .bold))
        }
        .foregroundStyle(p.ink)
        .frame(maxWidth: .infinity, minHeight: 56)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// Mono-etikett over listene («KØ», «TIL GJENNOMGANG · 2»).
struct Receipts23Label: View {
    let text: String
    var body: some View { PLabel(text: text).padding(.top, 6).padding(.horizontal, 4) }
}

/// Hvitt kort med 16 pt luft på sidene; radene har skillelinje bare mellom seg.
struct Receipts23Card<C: View>: View {
    @Environment(\.paper) private var p
    @ViewBuilder let content: () -> C
    var body: some View {
        VStack(spacing: 0) { content() }
            .padding(.horizontal, 16).padding(.vertical, 2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct Receipts23Divider: View {
    @Environment(\.paper) private var p
    var body: some View { Rectangle().fill(p.line).frame(height: 1) }
}

/* ---------- KØ ---------- */

struct Receipts23QueueSection: View {
    @Environment(Store.self) private var store
    let model: Receipts23Model

    var body: some View {
        let waiting: [PendingUpload] = store.myPendingUploads
        let up: Int = store.uploading
        if !model.jobs.isEmpty || !waiting.isEmpty || up > 0 {
            Receipts23Label(text: "Kø")
            Receipts23Card {
                if up > 0 {
                    Receipts23QueueRow(name: up == 1 ? "Kvittering" : "\(up) kvitteringer", text: "Laster opp …", kind: "read", progress: 8, first: true, again: nil, tap: nil)
                }
                ForEach(Array(waiting.enumerated()), id: \.element.id) { i, w in
                    Receipts23QueueRow(name: w.kind == "pdf" ? "PDF-kvittering" : "Kvittering", text: "Venter på nett · sendes automatisk", kind: "wait", progress: 100,
                                       first: i == 0 && up == 0, again: { store.retryPending(w.id) }, tap: nil)
                }
                ForEach(Array(model.jobs.enumerated()), id: \.element.id) { i, j in
                    Receipts23QueueRow(name: j.name, text: j.text, kind: j.kind, progress: j.progress, first: i == 0 && waiting.isEmpty && up == 0,
                                       again: reprocessAction(j.id),
                                       tap: j.kind == "ready" ? confirmAction(j.id) : nil)
                }
            }
        }
    }
}

extension Receipts23QueueSection {
    func confirmAction(_ id: String) -> () -> Void {
        let m: Receipts23Model = model
        let st: Store = store
        return { Task { await m.confirm(id, st) } }
    }

    func reprocessAction(_ id: String) -> () -> Void {
        let m: Receipts23Model = model
        let st: Store = store
        return { Task { await m.reprocess(id, st) } }
    }
}

struct Receipts23QueueRow: View {
    @Environment(\.paper) private var p
    let name: String
    let text: String
    let kind: String
    let progress: Int
    let first: Bool
    let again: (() -> Void)?
    let tap: (() -> Void)?

    private var color: Color { kind == "ready" ? p.pos : kind == "wait" ? p.mut : p.lab }

    var body: some View {
        VStack(spacing: 0) {
            if !first { Receipts23Divider() }
            HStack(spacing: 10) {
                Button { tap?() } label: { info }.buttonStyle(.plain).disabled(tap == nil)
                if let again {
                    Button { Haptics.shared.tap(); again() } label: {
                        Text("✦ Analyser på nytt").font(PF.ui(12.5, .bold)).foregroundStyle(p.lab)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 12)
        }
    }

    private var info: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
            Text(text).font(PF.ui(12.5, .semibold)).foregroundStyle(color).lineLimit(2)
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(p.line)
                    Capsule().fill(color).frame(width: g.size.width * CGFloat(Swift.min(100, Swift.max(0, progress))) / 100)
                }
            }
            .frame(height: 3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

/* ---------- TIL GJENNOMGANG og BOKFØRT ---------- */

struct Receipts23ReviewSection: View {
    @Environment(\.paper) private var p
    let model: Receipts23Model

    var body: some View {
        Receipts23Label(text: "Til gjennomgang · \(model.review.count)")
        if model.review.isEmpty {
            Text(model.loaded ? "Alt er gjennomgått ✓" : "Henter kvitteringer …").font(PF.ui(14)).foregroundStyle(p.mut)
                .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        } else {
            Receipts23Card {
                ForEach(Array(model.review.enumerated()), id: \.element.id) { i, r in
                    Receipts23ReviewRow(model: model, r: r, first: i == 0)
                }
            }
        }
    }
}

struct Receipts23BookedSection: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let model: Receipts23Model

    var body: some View {
        if !model.booked.isEmpty {
            Receipts23Label(text: "Bokført · \(model.booked.count)")
            Receipts23Card {
                // Prompt 41: bokførte rader kan åpnes (bilde, navn, beløp, kategori, Lagre / Til gjennomgang) og leses på nytt.
                ForEach(Array(model.booked.enumerated()), id: \.element.id) { i, r in
                    Receipts41BookedRow(model: model, r: r, first: i == 0)
                }
            }
        }
    }
}

/// Logo, navn, «dato · motor · sikkerhet» og beløp i Plex Mono.
struct Receipts23Line: View {
    @Environment(\.paper) private var p
    let r: Receipt
    let meta: String

    var body: some View {
        HStack(spacing: 12) {
            Receipts23Logo(domain: r.domain, name: r.merchant ?? "Kvittering")
            VStack(alignment: .leading, spacing: 2) {
                Text(r.merchant ?? "Kvittering").font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                Text(meta).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("−" + n2(abs(r.total ?? 0))).font(PF.mono(16)).foregroundStyle(p.ink).lineLimit(1)
        }
    }

    static func category(_ store: Store, _ id: Int?) -> String {
        guard let id else { return "Uten kategori" }
        return store.boot?.categories.first { $0.id == id }?.name ?? "Uten kategori"
    }

    static func meta(_ r: Receipt) -> String {
        var c: Double = r.confidence ?? 0
        if c <= 1 { c *= 100 }
        // Prompt 47: «Tolket på iPhone» / «Tolket av Glimt».
        let motor: String = Receipt47.motor(r)
        return ddmm(r.date) + " · " + motor + " · \(Int(c.rounded())) % sikker"
    }
}

/// Butikklogo fra logobiblioteket på hvit flate med kantlinje, ellers forbokstaven.
struct Receipts23Logo: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let domain: String?
    let name: String
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white)
            if let img {
                Image(uiImage: img).resizable().scaledToFit().frame(width: 27, height: 27)
            } else {
                Text(String(name.prefix(1)).uppercased()).font(PF.ui(16, .heavy)).foregroundStyle(p.mut)
            }
        }
        .frame(width: 44, height: 44)
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
        .task(id: (domain ?? "") + "|" + name) { await load() }
    }

    private func load() async {
        var d: String? = domain
        if d == nil || d?.isEmpty == true { d = await LogoRegistry20.shared.domain(forName: name, api: store.api) }
        img = await store.logo(d)
    }
}

/// En rad i Til gjennomgang. Trykk utvider: navn, beløp, kategori og knappene.
struct Receipts23ReviewRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let model: Receipts23Model
    let r: Receipt
    let first: Bool
    @State private var name: String = ""
    @State private var amount: String = ""
    @State private var cat: Int? = nil

    private var isOpen: Bool { model.open == r.id }
    @MainActor private var rean: Rean39Model { Rean39Model.shared }
    private func hl(_ f: String) -> Bool { rean.changed[r.id]?.contains(f) == true }

    var body: some View {
        VStack(spacing: 0) {
            if !first { Receipts23Divider() }
            Button {
                Haptics.shared.select()
                withAnimation(.easeOut(duration: 0.18)) { model.open = isOpen ? nil : r.id }
            } label: {
                // Prompt 39: «✦ Analyserer på nytt … 42 %» og en tynn rød linje mens analysen pågår (Receipt39.swift).
                Receipts23Line(r: r, meta: Rc39.meta(r)).padding(.vertical, 12).contentShape(Rectangle())
                    .overlay(alignment: .bottom) {
                        if !isOpen, let j = rean.jobs[r.id], j.step != "error" { Rean39Line(pct: j.pct) }
                    }
            }
            .buttonStyle(.plain)
            if isOpen { editor.padding(.bottom, 14) }
        }
        .onAppear(perform: reset)
        .onChange(of: r) { _, _ in reset() }
    }

    private func reset() {
        name = r.merchant ?? ""
        amount = r.total.map { String(format: "%.2f", $0).replacingOccurrences(of: ".", with: ",") } ?? ""
        cat = r.categoryId
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                field(TextField("Butikk", text: $name).font(PF.ui(14, .semibold)), hl: hl("name"))
                field(TextField("0,00", text: $amount).font(PF.mono(14)).multilineTextAlignment(.trailing).keyboardType(.decimalPad), hl: hl("amount"))
                    .frame(width: 120)
            }
            Receipts23CategoryChips(selected: $cat)
                .background(hl("category") ? Rc39.highlight.opacity(0.7) : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            // Prompt 39: AI-ens begrunnelse for kategorien («Bokhandel · pensum»).
            if let why = r.aiCategory?.reason, !why.isEmpty {
                Text("✦ " + why).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(2)
            }
            HStack(spacing: 8) {
                Button { Task { await model.approve(r, name: name, amount: amount, category: cat, store) } } label: {
                    Text("✓ Godkjenn og bokfør").font(PF.ui(14, .bold)).foregroundStyle(p.bg)
                        .frame(maxWidth: .infinity, minHeight: 42).background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
                // Prompt 39: «✦ På nytt» viser fremdriften («✦ 42 %») og panelet under knappene (Receipt39.swift).
                Button { Rean39Model.shared.start(r, model, store) } label: {
                    Text(reanLabel).font(PF.ui(13, .bold)).foregroundStyle(p.lab).padding(.horizontal, 14)
                        .frame(minHeight: 42).overlay(Capsule().stroke(p.line, lineWidth: 1))
                        .monospacedDigit()
                }
                .buttonStyle(.plain)
                .disabled(reanBusy)
                Button { Haptics.shared.warning(); Task { await model.delete(r.id, store) } } label: {
                    Text("🗑").font(.system(size: 16)).frame(width: 42, height: 42).overlay(Circle().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Slett")
            }
            if let j = rean.jobs[r.id] {
                Rean39Panel(r: r, model: model, job: j)
            }
        }
        .animation(.easeOut(duration: 0.2), value: rean.jobs[r.id] != nil)
    }

    private var reanBusy: Bool {
        guard let j = rean.jobs[r.id] else { return false }
        return j.step != "error"
    }

    private var reanLabel: String {
        guard let j = rean.jobs[r.id], j.step != "error" else { return "✦ På nytt" }
        return "✦ \(j.pct) %"
    }

    private func field<V: View>(_ v: V, hl: Bool = false) -> some View {
        v.foregroundStyle(p.ink).padding(.horizontal, 12).frame(height: 42)
            .background(hl ? Rc39.highlight : p.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .animation(.easeOut(duration: 0.4), value: hl)
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
    }
}

/// Kategori-chips i én vannrett rad (valgt = blekk).
struct Receipts23CategoryChips: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Binding var selected: Int?

    var body: some View {
        // Prompt 39: nye AI-kategorier (source 'ai', ikke godkjent ennå) står først med ✦ foran, før «Annet».
        let all: [Category] = (store.boot?.categories ?? []).filter { $0.kind != "income" }
        let fresh: [Category] = all.filter { $0.source == "ai" && $0.confirmed != true }
        let cats: [Category] = fresh + all.filter { !($0.source == "ai" && $0.confirmed != true) }
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(cats) { c in
                    let on: Bool = selected == c.id
                    Button { Haptics.shared.select(); selected = c.id } label: {
                        Text((c.source == "ai" && c.confirmed != true ? "✦ " : "") + c.name).font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
                            .padding(.horizontal, 12).frame(height: 32)
                            .background(on ? p.ink : Color.clear, in: Capsule())
                            .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

/// VNDocumentCameraViewController: dokumentskanner med automatisk beskjæring.
struct Receipts23DocScanner: UIViewControllerRepresentable {
    let done: ([UIImage]) -> Void

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let v = VNDocumentCameraViewController()
        v.delegate = context.coordinator
        return v
    }
    func updateUIViewController(_ vc: VNDocumentCameraViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let done: ([UIImage]) -> Void
        init(done: @escaping ([UIImage]) -> Void) { self.done = done }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            var imgs: [UIImage] = []
            for i in 0..<scan.pageCount { imgs.append(scan.imageOfPage(at: i)) }
            done(imgs)
        }
        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { done([]) }
        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) { done([]) }
    }
}
