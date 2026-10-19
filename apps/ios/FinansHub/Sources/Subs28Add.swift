import SwiftUI
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/* ---------------- Prompt 28: nytt «Legg til abonnement»-ark (Papir) ---------------- */
// Fasit: design/Abonnement Legg til ark.dc.html og prompts/prompt-28-pakke/claude-code-abo-ark.md.
// Én grep-strek (systemets, .presentationDragIndicator(.visible)) – arket tegner ingen egen. Alle farger fra aktivt tema.
// Liste i ett kort: Skjermbilde ✦ AI · Kvittering ✦ AI · Fra transaksjon · Skriv inn selv. «Skriv inn selv» har eget skjema.
// Skjermbilde (claude-code-abo-skjermbilde-fiks.md): JPEG 0.85 ≤ 1600 px (aldri HEIC), 130 s tidsgrense, feilkort etter
// code fra serveren (ollama_down | no_vision | timeout | not_found), «Les med Gemini» (?engine=gemini) bare etter trykk,
// «Installer qwen2.5vl» (POST /finans/api/ai/vision/install, SSE med fremdrift) og «Laster bildemodellen …» etter 5 s.

/// Fargene i arket, fra Papir-paletten (lys eller mørk).
struct SubPal28 {
    let dark: Bool
    let bg: Color
    let card: Color
    let border: Color
    let sep: Color
    let tile: Color
    let chev: Color
    let seg: Color
    let segOn: Color
    let ink: Color
    let mut: Color
    let lab: Color
    let onLab: Color
    let pos: Color

    static func of(_ p: PaperPalette) -> SubPal28 {
        if p.dark {
            return SubPal28(dark: true, bg: p.bg, card: p.card, border: p.line, sep: p.line, tile: p.lab.opacity(0.18), chev: p.mut,
                            seg: p.line, segOn: p.card, ink: p.ink, mut: p.mut, lab: p.lab, onLab: p.onLab, pos: p.pos)
        }
        return SubPal28(dark: false, bg: p.bg, card: p.card, border: Color(hex: "#e4ddcf"), sep: Color(hex: "#eee8dc"), tile: Color(hex: "#f5e4e0"),
                        chev: Color(hex: "#a39c8e"), seg: Color(hex: "#e9e3d6"), segOn: Color.white, ink: p.ink, mut: p.mut, lab: p.lab,
                        onLab: p.onLab, pos: p.pos)
    }
}

/// Skjemaet «Skriv inn selv» (også ferdig utfylt fra skjermbildet).
struct SubForm28: Equatable {
    var name: String = ""
    var amount: String = ""
    var day: String = ""
    /// Uke | Måned | År
    var cycle: String = "Måned"
    var plan: String = ""
    var category: String = ""
    var domain: String = ""
    var logoUrl: String = ""
    var month: Int = 0

    var price: Double? {
        let t: String = amount.replacingOccurrences(of: "kr", with: "").replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: ".")
        guard let v = Double(t), v > 0 else { return nil }
        return v
    }

    var valid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && price != nil }

    /// Body for POST /subscriptions. Ukepris regnes om til månedspris (52/12), siden abonnementene er månedlige eller årlige.
    var body: [String: Any] {
        let d: Int = Swift.min(31, Swift.max(1, Int(day.filter { $0.isNumber }) ?? Calendar.current.component(.day, from: Date())))
        let yearly: Bool = cycle == "År"
        var p: Double = price ?? 0
        if cycle == "Uke" { p = (p * 52 / 12 * 100).rounded() / 100 }
        var b: [String: Any] = ["name": name.trimmingCharacters(in: .whitespaces), "plan": plan, "price": p, "cycle": yearly ? "yearly" : "monthly",
                                "billDay": d, "chargeDay": d, "status": "active", "active": true, "lowUse": false]
        if yearly { b["billMonth"] = month > 0 ? month : Calendar.current.component(.month, from: Date()) } else { b["billMonth"] = NSNull() }
        if cycle == "Uke" && plan.isEmpty { b["plan"] = "Ukentlig" }
        if !category.isEmpty { b["category"] = category }
        if !domain.isEmpty { b["domain"] = domain }
        if !logoUrl.isEmpty { b["logoUrl"] = logoUrl }
        return b
    }

    static func from(_ r: SubShotResult27) -> SubForm28 {
        var f: SubForm28 = SubForm28()
        f.name = r.name
        f.amount = r.price > 0 ? String(format: "%.2f", r.price).replacingOccurrences(of: ".", with: ",") : ""
        f.day = "\(r.day)"
        f.cycle = r.cycle == "yearly" ? "År" : "Måned"
        f.plan = r.plan
        f.category = r.category
        f.domain = r.domain ?? ""
        f.logoUrl = r.logoUrl ?? ""
        f.month = r.month
        return f
    }
}

struct SubAdd28Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    /// menu | form | shot | rc | tx
    @State private var step: String = "menu"
    @State private var form: SubForm28 = SubForm28()
    @State private var shotItem: PhotosPickerItem? = nil
    @State private var shotImage: UIImage? = nil

    var body: some View {
        let c: SubPal28 = SubPal28.of(p)
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                SubAdd28Header(c: c, title: title, sub: sub, back: step == "menu" ? nil : { goMenu() }, close: { dismiss() })
                content(c).padding(.top, 16)
            }
            .padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 30)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(c.bg.ignoresSafeArea())
        .environment(\.colorScheme, c.dark ? .dark : .light)
        .onChange(of: shotItem) { _, it in loadShot(it) }
    }

    @ViewBuilder private func content(_ c: SubPal28) -> some View {
        switch step {
        case "form": SubForm28View(c: c, form: $form, save: { save() })
        case "shot": SubShot28Panel(c: c, image: shotImage, add: { r in addResult(r) }, edit: { r in editResult(r) },
                                    manual: { form = SubForm28(); step = "form" }, pick: $shotItem)
        case "rc": SubReceipt28View(c: c, done: { dismiss() })
        case "tx": SubTx28View(c: c)
        // Prompt 31: Gratis prøveperiode (Trial31.swift).
        case "trial": Trial31Form(c: c, done: { dismiss() })
        default: menu(c)
        }
    }

    private func menu(_ c: SubPal28) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(spacing: 0) {
                PhotosPicker(selection: $shotItem, matching: .images) {
                    SubAdd28Option(c: c, icon: "viewfinder", title: "Skjermbilde", ai: true,
                                   desc: "Fra App Store, e-post eller kontoside. Tjeneste, pris og trekkdato fylles ut.", first: true)
                }
                .buttonStyle(SubAdd28Press(c: c))
                Button { go("rc") } label: {
                    SubAdd28Option(c: c, icon: "doc.plaintext", title: "Kvittering", ai: true, desc: "Ta bilde eller velg PDF. Ollama leser beløp og syklus.", first: false)
                }
                .buttonStyle(SubAdd28Press(c: c))
                Button { go("tx"); store.loadSubCandidates() } label: {
                    SubAdd28Option(c: c, icon: "arrow.left.arrow.right", title: "Fra transaksjon", ai: false, desc: "Velg et gjentakende trekk fra banken.", first: false)
                }
                .buttonStyle(SubAdd28Press(c: c))
                Button { go("trial") } label: {
                    SubAdd28Option(c: c, icon: "clock", title: "Gratis prøveperiode", ai: true,
                                   desc: "Få varsel før prøven går over til betalt. Skriv det med egne ord eller fyll ut.", first: false)
                }
                .buttonStyle(SubAdd28Press(c: c))
                Button { form = SubForm28(); go("form") } label: {
                    SubAdd28Option(c: c, icon: "pencil", title: "Skriv inn selv", ai: false, desc: "Tjeneste, beløp, syklus og trekkdag.", first: false)
                }
                .buttonStyle(SubAdd28Press(c: c))
            }
            .background(c.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(c.border, lineWidth: 1))
            Text("Bilder og kvitteringer leses lokalt av Ollama. Ingenting sendes ut av Homelab.")
                .font(PF.ui(12.5)).foregroundStyle(c.mut).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
        }
    }

    private var title: String {
        switch step {
        case "form": return "Skriv inn selv"
        case "shot": return "Skjermbilde"
        case "rc": return "Kvittering"
        case "tx": return "Fra transaksjon"
        case "trial": return "Prøveperiode"
        default: return "Legg til abonnement"
        }
    }

    private var sub: String {
        switch step {
        case "form": return "Du kan endre alt senere."
        case "shot": return "Ollama leser tjeneste, pris og trekkdato lokalt."
        case "rc": return "Ta bilde eller velg PDF. Ollama leser beløp og syklus."
        case "tx": return "Velg et gjentakende trekk fra banken."
        case "trial": return "Vi minner deg på å avslutte før den blir betalt."
        default: return "Velg hvordan du vil legge det inn."
        }
    }

    private func go(_ s: String) {
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.18)) { step = s }
    }

    private func goMenu() {
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.18)) { step = "menu" }
    }

    private func loadShot(_ it: PhotosPickerItem?) {
        guard let it else { return }
        Task { @MainActor in
            if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) {
                shotImage = img
                go("shot")
            }
            shotItem = nil
        }
    }

    private func save() {
        guard form.valid else { return }
        Haptics.shared.success()
        store.saveSub(nil, form.body)
        dismiss()
    }

    private func addResult(_ r: SubShotResult27) {
        Haptics.shared.success()
        if let id = r.existingId {
            store.saveSub(id, ["plan": r.plan, "price": r.price, "cycle": r.cycle])
        } else {
            store.saveSub(nil, r.body)
        }
        dismiss()
    }

    private func editResult(_ r: SubShotResult27) {
        form = SubForm28.from(r)
        go("form")
    }
}

/* ---------- Topp og rader ---------- */

struct SubAdd28Header: View {
    let c: SubPal28
    let title: String
    let sub: String
    let back: (() -> Void)?
    let close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .center, spacing: 12) {
                // Prompt 30: felles piller (‹ Tilbake / Lukk) i stedet for røde tekstlenker.
                if let back {
                    SheetButton30(kind: .back, title: "Tilbake", ink: c.ink, paper: c.bg, dark: c.dark, action: back)
                }
                Text(title).font(PF.serif(26, medium: true)).foregroundStyle(c.ink).lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 4)
                SheetButton30(kind: .secondary, title: "Lukk", ink: c.ink, paper: c.bg, dark: c.dark, action: close)
            }
            Text(sub).font(PF.ui(14)).foregroundStyle(c.mut).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
        }
    }
}

/// En rad i menyen: ikonflis 44×44, tittel (+ ✦ AI), beskrivelse og chevron. Minst 72 pt høy.
struct SubAdd28Option: View {
    let c: SubPal28
    let icon: String
    let title: String
    let ai: Bool
    let desc: String
    let first: Bool

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 19, weight: .regular)).foregroundStyle(c.lab)
                .frame(width: 44, height: 44)
                .background(c.tile, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(title).font(PF.ui(16, .bold)).foregroundStyle(c.ink).lineLimit(1)
                    if ai { SubAi28Badge(c: c) }
                }
                Text(desc).font(PF.ui(13.5)).foregroundStyle(c.mut).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(c.chev)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        .overlay(alignment: .top) { if !first { Rectangle().fill(c.sep).frame(height: 1) } }
        .contentShape(Rectangle())
    }
}

struct SubAi28Badge: View {
    let c: SubPal28
    var body: some View {
        Text("✦ AI").font(PF.ui(10.5, .heavy)).tracking(0.6).foregroundStyle(c.bg)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(c.ink, in: Capsule())
    }
}

/// Trykket rad: litt mørkere bakgrunn.
struct SubAdd28Press: ButtonStyle {
    let c: SubPal28
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background(configuration.isPressed ? c.seg.opacity(0.5) : Color.clear)
    }
}

/// Primærknapp i arket: lab-bakgrunn, onLab-tekst, 52 pt, radius 16.
struct SubPrimary28: View {
    let c: SubPal28
    let title: String
    var enabled: Bool = true
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(title).font(PF.ui(16, .bold)).foregroundStyle(enabled ? c.onLab : c.mut)
                .lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(enabled ? c.lab : c.seg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

/// Sekundærknapp: kant i border, ink-tekst.
struct SubSecondary28: View {
    let c: SubPal28
    let title: String
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(title).font(PF.ui(15, .bold)).foregroundStyle(c.ink).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 46)
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(c.border, lineWidth: 1))
                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Skriv inn selv ---------- */

struct SubForm28View: View {
    let c: SubPal28
    @Binding var form: SubForm28
    let save: () -> Void
    @FocusState private var focus: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(spacing: 0) {
                field("Tjeneste", "HBO Max", text: $form.name, kb: .default, tag: 0, first: true)
                field("Beløp", "129 kr", text: $form.amount, kb: .decimalPad, tag: 1, first: false)
                field("Trekkdag", "15.", text: $form.day, kb: .numberPad, tag: 2, first: false)
            }
            .background(c.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(c.border, lineWidth: 1))
            VStack(alignment: .leading, spacing: 8) {
                Text("SYKLUS").font(PF.ui(11.5, .heavy)).tracking(1.4).foregroundStyle(c.lab).padding(.horizontal, 4)
                SubCycle28(c: c, value: $form.cycle)
            }
            SubPrimary28(c: c, title: "Legg til abonnement", enabled: form.valid) { focus = nil; save() }
        }
    }

    private func field(_ label: String, _ ph: String, text: Binding<String>, kb: UIKeyboardType, tag: Int, first: Bool) -> some View {
        HStack(spacing: 12) {
            Text(label).font(PF.ui(14, .semibold)).foregroundStyle(c.mut).frame(width: 92, alignment: .leading)
            TextField("", text: text, prompt: Text(ph).foregroundColor(c.chev))
                .font(PF.ui(16, .semibold)).foregroundStyle(c.ink)
                .keyboardType(kb)
                .focused($focus, equals: tag)
                .frame(minHeight: 44)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
        .overlay(alignment: .top) { if !first { Rectangle().fill(c.sep).frame(height: 1) } }
        .contentShape(Rectangle())
        .onTapGesture { focus = tag }
    }
}

/// Uke / Måned / År.
struct SubCycle28: View {
    let c: SubPal28
    @Binding var value: String

    var body: some View {
        HStack(spacing: 4) {
            ForEach(["Uke", "Måned", "År"], id: \.self) { n in
                let on: Bool = value == n
                Button { Haptics.shared.select(); value = n } label: {
                    Text(n).font(PF.ui(14, .bold)).foregroundStyle(c.ink)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background(on ? c.segOn : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .shadow(color: .black.opacity(on ? 0.12 : 0), radius: 2, y: 1)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(4)
        .background(c.seg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/* ---------- Kvittering ---------- */

struct SubReceipt28View: View {
    @Environment(Store.self) private var store
    let c: SubPal28
    let done: () -> Void
    @State private var photo: PhotosPickerItem? = nil
    @State private var files: Bool = false
    @State private var camera: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { camera = true } label: { SubAdd28Option(c: c, icon: "camera", title: "Ta bilde", ai: true, desc: "Kvitteringen leses lokalt.", first: true) }
                .buttonStyle(SubAdd28Press(c: c))
                .background(c.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(c.border, lineWidth: 1))
            HStack(spacing: 8) {
                PhotosPicker(selection: $photo, matching: .images) {
                    Text("Velg bilde").font(PF.ui(15, .bold)).foregroundStyle(c.ink)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(c.border, lineWidth: 1))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                SubSecondary28(c: c, title: "Velg PDF eller fil") { files = true }
            }
        }
        .fileImporter(isPresented: $files, allowedContentTypes: [.pdf, .jpeg, .png, .heic, .image]) { r in pickedFile(r) }
        .onChange(of: photo) { _, it in pickedPhoto(it) }
        .fullScreenCover(isPresented: $camera) {
            CameraView { img in if let img { sendImage(img) } }.ignoresSafeArea()
        }
    }

    private func pickedFile(_ r: Result<URL, Error>) {
        guard case .success(let url) = r else { return }
        let scoped: Bool = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let d = try? Data(contentsOf: url) else { return }
        if url.pathExtension.lowercased() == "pdf" {
            store.uploadSubReceipt(d, mime: "application/pdf", name: "kvittering.pdf")
            done()
        } else if let img = UIImage(data: d) {
            sendImage(img)
        }
    }

    private func pickedPhoto(_ it: PhotosPickerItem?) {
        guard let it else { return }
        Task { @MainActor in
            if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { sendImage(img) }
            photo = nil
        }
    }

    /// Alltid JPEG (aldri HEIC), maks 1600 px.
    private func sendImage(_ img: UIImage) {
        guard let j = img.scaled(max: 1600).jpegData(compressionQuality: 0.85) else { return }
        store.uploadSubReceipt(j, mime: "image/jpeg", name: "kvittering.jpg")
        done()
    }
}

/* ---------- Fra transaksjon ---------- */

struct SubTx28View: View {
    @Environment(Store.self) private var store
    let c: SubPal28

    var body: some View {
        if let list = store.subCandidates {
            VStack(spacing: 0) {
                if list.isEmpty {
                    Text("Fant ingen nye faste trekk. Alt ser ut til å være registrert.").font(PF.ui(13.5)).foregroundStyle(c.mut)
                        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                }
                ForEach(Array(list.enumerated()), id: \.element.id) { i, k in
                    SubTx28Row(c: c, k: k, first: i == 0)
                }
            }
            .background(c.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(c.border, lineWidth: 1))
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(24)
        }
    }
}

struct SubTx28Row: View {
    @Environment(Store.self) private var store
    let c: SubPal28
    let k: SubCandidate
    let first: Bool

    var body: some View {
        let sub: String = "\(k.cycle == "yearly" ? "Årlig" : "Månedlig") · \(SubCalc23.kr(k.amount)) · sett \(k.count) ganger"
        HStack(spacing: 12) {
            SubLogo23(name: k.merchant, domain: k.domain, logoUrl: nil, category: "Annet", size: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(k.merchant).font(PF.ui(15, .semibold)).foregroundStyle(c.ink).lineLimit(1)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(c.mut).lineLimit(1)
            }
            Spacer(minLength: 6)
            Button { Haptics.shared.tap(); store.addSubCandidate(k) } label: {
                Text("+ Legg til").font(PF.ui(13, .bold)).foregroundStyle(c.onLab)
                    .padding(.horizontal, 12).frame(height: 34)
                    .background(c.lab, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .frame(minHeight: 60)
        .overlay(alignment: .top) { if !first { Rectangle().fill(c.sep).frame(height: 1) } }
    }
}
