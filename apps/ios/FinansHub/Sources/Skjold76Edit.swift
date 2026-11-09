import SwiftUI
import UIKit
import PhotosUI
import WebKit

/* ---------------- Prompt 76 (SKJIOS): ny/endre del, innholdet i en skuff og etiketter ----------------
 Ny/endre: navn, kategori (velg eller ny), specs-felt, antall, enhet og min, tags, bilder (kamera eller bibliotek), URL, pris
 og leverandør. Plassering velges ved å trykke på skuffen i tegningen; «Foreslå ledig» velger første tomme skuff (GET /free).
 For en ny del sendes plasseringen med POST /parts; for en eksisterende del går flytting via POST /parts/:id/move (historikk). */

struct Skj76Edit: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let id: String
    @State private var f: Skj76Form = Skj76Form()
    @State private var loaded: Bool = false
    @State private var busy: Bool = false
    @State private var picks: [PhotosPickerItem] = []
    @State private var camera: Bool = false
    /// Prompt 77: «Finn bilde» (Skj77ImageFinder) og Glimt-forslag (Skjold77).
    @State private var finder: Bool = false
    @MainActor private var ai: Skjold77 { Skjold77.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Skj76SheetTop(kicker: id.isEmpty ? "Ny del" : "Endre del", title: f.name.isEmpty ? "Uten navn" : f.name)
                Skj76FormFields(f: $f, onSuggest: { suggestAI(nil) })
                Skj76SpecFields(specs: $f.specs)
                photos
                place
                Skj76Button(title: busy ? "Lagrer …" : "Lagre", icon: "checkmark", filled: true) { save() }
                    .disabled(busy || f.name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(p.bg.ignoresSafeArea())
        .onAppear { boot() }
        .onDisappear { ai.clearSuggestion() }
        .task { if !ai.settingsLoaded { await ai.loadSettings(store) } }
        .onChange(of: picks) { (_: [PhotosPickerItem], v: [PhotosPickerItem]) in take(v) }
        .fullScreenCover(isPresented: $camera) {
            CameraView { (img: UIImage?) in if let img { add(img) } }.ignoresSafeArea()
        }
        .sheet(isPresented: $finder) {
            Skj77ImageFinder(query: f.name, partId: id) { (c: Skj77Candidate) in found(c) }
                .environment(\.paper, p)
                .environment(store)
        }
    }

    private func boot() {
        if loaded { return }
        loaded = true
        ai.clearSuggestion()
        if let x = m.part(id), !id.isEmpty {
            f = Skj76Form.from(x)
        } else {
            f.loc = m.preset
            f.cabId = m.preset?.cabinetId ?? m.cabinet?.id ?? ""
            m.preset = nil
        }
    }

    /* ---------- Bilder ---------- */

    private var photos: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                PLabel(text: "Bilder")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(f.oldPhotos.enumerated()), id: \.offset) { (i: Int, ph: Skj76Photo) in
                            Skj76Thumb(path: ph.thumb, size: 72).overlay(alignment: .topTrailing) { remove { dropOld(i) } }
                        }
                        ForEach(Array(f.newPhotos.enumerated()), id: \.offset) { (i: Int, img: UIImage) in
                            Image(uiImage: img).resizable().scaledToFill().frame(width: 72, height: 72)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .overlay(alignment: .topTrailing) { remove { f.newPhotos.remove(at: i) } }
                        }
                        // Prompt 77: bilder valgt i «Finn bilde» for en ny del (lagres når delen lagres).
                        ForEach(Array(f.found.enumerated()), id: \.offset) { (i: Int, c: Skj77Candidate) in
                            Skj76Thumb(path: c.thumb, size: 72).overlay(alignment: .topTrailing) { remove { f.found.remove(at: i) } }
                        }
                    }
                }
                HStack(spacing: 8) {
                    Skj76Button(title: "Ta bilde", icon: "camera") { camera = true }
                    PhotosPicker(selection: $picks, maxSelectionCount: 6, matching: .images) {
                        Label("Velg bilder", systemImage: "photo.on.rectangle").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
                    }
                }
                Skj76Button(title: "Finn bilde", icon: "photo.badge.magnifyingglass") { openFinder() }
            }
        }
    }

    private func remove(_ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                .frame(width: 22, height: 22).background(Color.black.opacity(0.6), in: Circle())
        }
        .buttonStyle(.plain).padding(4)
        .accessibilityLabel("Fjern bildet")
    }

    private func take(_ items: [PhotosPickerItem]) {
        if items.isEmpty { return }
        Task { @MainActor in
            for it in items {
                if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { add(img) }
            }
            picks = []
        }
    }

    /// Nytt bilde. Med «Foreslå automatisk når jeg tar bilde» på starter Glimt av seg selv (én gang per valg).
    private func add(_ img: UIImage) {
        f.newPhotos.append(img)
        if ai.settingsLoaded && ai.autoSuggest && !ai.thinking { suggestAI(img) }
    }

    /* ---------- Glimt (prompt 77) ---------- */

    /// «✦ Foreslå»: nyeste nye bilde hvis det finnes, ellers delens lagrede bilde og teksten.
    private func suggestAI(_ img: UIImage?) {
        Haptics.shared.tap()
        ai.suggest(partId: id, form: f, image: img ?? f.newPhotos.last, store)
    }

    private func openFinder() {
        if ai.settingsLoaded && !ai.webImages {
            m.flash(Skjold77.webOffText)
            return
        }
        finder = true
    }

    /// Valgt i «Finn bilde»: lagret allerede for en eksisterende del, ellers holdes det til delen lagres.
    private func found(_ c: Skj77Candidate) {
        if id.isEmpty {
            f.found.append(c)
            return
        }
        if let x = m.part(id) {
            f.oldPhotos = x.photos
            f.dropped = []
        }
    }

    private func dropOld(_ i: Int) {
        f.oldPhotos.remove(at: i)
        f.dropped.append(i)
    }

    /* ---------- Plassering ---------- */

    private var place: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                PLabel(text: "Plassering")
                Skj76LocPicker(cabId: $f.cabId, loc: $f.loc)
                HStack(spacing: 8) {
                    Skj76Button(title: "Foreslå ledig", icon: "sparkles") { suggest() }
                    Skj76Button(title: "Uten plass", icon: "tray") { f.loc = nil }
                }
            }
        }
    }

    private func suggest() {
        Task { @MainActor in
            guard let l = await m.free(f.cabId, store) else { return }
            f.cabId = l.cabinetId.isEmpty ? f.cabId : l.cabinetId
            f.loc = l
            m.pulse += 1
            Haptics.shared.success()
        }
    }

    /* ---------- Lagre ---------- */

    private func save() {
        busy = true
        let form: Skj76Form = f
        let old: Skj76Loc? = m.part(id)?.loc
        Task { @MainActor in
            defer { busy = false }
            var body: [String: Any] = form.body()
            if id.isEmpty, let l = form.loc { body.merge(Skjold76.locBody(l)) { (_: Any, b: Any) in b } }
            guard let pid = await m.save(id, body, store) else { return }
            // Bilder som er fjernet (høyeste nummer først, så de andre ikke flytter seg).
            for n in form.dropped.sorted(by: >) { await m.deletePartPhoto(pid, n, store) }
            for img in form.newPhotos { await m.uploadPartPhoto(pid, img, store) }
            for c in form.found { _ = await ai.useImage(c, partId: pid, store) }
            if !id.isEmpty, form.loc != old, let x = m.part(pid) {
                if let l = form.loc { await m.move(x, to: l, store) } else { await m.unplace(x, store) }
            }
            if let l = form.loc { m.highlight(l) }
            m.sheet = .part(pid)
        }
    }
}

/// Feltene i skjemaet (holdt utenfor viewet, så body blir liten).
struct Skj76Form {
    var name: String = ""
    var category: String = ""
    var desc: String = ""
    var specs: [Skj76Spec] = [Skj76Spec(k: "verdi", v: ""), Skj76Spec(k: "pakke", v: "")]
    var qty: String = "1"
    var unit: String = "stk"
    var minQty: String = ""
    var tags: String = ""
    var url: String = ""
    var price: String = ""
    var supplier: String = ""
    var cabId: String = ""
    var loc: Skj76Loc? = nil
    var oldPhotos: [Skj76Photo] = []
    var newPhotos: [UIImage] = []
    var dropped: [Int] = []
    /// Prompt 77: bilder fra «Finn bilde» som lagres sammen med en ny del.
    var found: [Skj77Candidate] = []

    static func from(_ x: Skj76Part) -> Skj76Form {
        var f: Skj76Form = Skj76Form()
        f.name = x.name
        f.category = x.category
        f.desc = x.desc
        f.specs = x.specs.isEmpty ? f.specs : x.specs
        f.qty = Skjold76.num(x.qty)
        f.unit = x.unit
        f.minQty = x.minQty > 0 ? Skjold76.num(x.minQty) : ""
        f.tags = x.tags.joined(separator: ", ")
        f.url = x.url
        f.price = x.price.map { Skjold76.num($0) } ?? ""
        f.supplier = x.supplier
        f.loc = x.loc
        f.cabId = x.loc?.cabinetId ?? ""
        f.oldPhotos = x.photos
        return f
    }

    static func number(_ s: String) -> Double? {
        Double(s.replacingOccurrences(of: ",", with: ".").replacingOccurrences(of: " ", with: ""))
    }

    func body() -> [String: Any] {
        var specObj: [String: Any] = [:]
        for s in specs {
            let k: String = s.k.trimmingCharacters(in: .whitespaces).lowercased()
            let v: String = s.v.trimmingCharacters(in: .whitespaces)
            if !k.isEmpty && !v.isEmpty { specObj[k] = v }
        }
        let tagList: [String] = tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        var b: [String: Any] = ["name": name.trimmingCharacters(in: .whitespaces), "category": category.trimmingCharacters(in: .whitespaces),
                                "description": desc, "specs": specObj, "unit": unit, "tags": tagList, "url": url, "supplier": supplier]
        b["qty"] = Skj76Form.number(qty) ?? 0
        b["min_qty"] = Skj76Form.number(minQty).map { $0 as Any } ?? NSNull()
        b["price"] = Skj76Form.number(price).map { $0 as Any } ?? NSNull()
        return b
    }
}

struct Skj76Field: View {
    @Environment(\.paper) private var p
    let label: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(PF.ui(12, .semibold)).foregroundStyle(p.mut)
            TextField(label, text: $text).font(PF.ui(15.5)).foregroundStyle(p.ink).keyboardType(keyboard)
                .padding(.horizontal, 12).frame(height: 44)
                .background(p.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
        }
    }
}

struct Skj76FormFields: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    @Binding var f: Skj76Form
    /// Prompt 77: «✦ Foreslå» ved navnet (nil = skjult).
    var onSuggest: (() -> Void)? = nil
    @MainActor private var ai: Skjold77 { Skjold77.shared }

    private static let units: [String] = ["stk", "m", "cm", "g", "kg", "ml", "pk"]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .bottom, spacing: 8) {
                Skj76Field(label: "Navn", text: $f.name)
                if let onSuggest { suggestButton(onSuggest) }
            }
            if onSuggest != nil { Skj77SuggestCard(f: $f) }
            HStack(alignment: .bottom, spacing: 8) {
                Skj76Field(label: "Kategori", text: $f.category)
                categoryMenu
            }
            HStack(spacing: 8) {
                Skj76Field(label: "Antall", text: $f.qty, keyboard: .decimalPad)
                Skj76Field(label: "Min", text: $f.minQty, keyboard: .decimalPad)
                unitMenu
            }
            Skj76Field(label: "Tags (komma mellom)", text: $f.tags)
            Skj76Field(label: "Beskrivelse", text: $f.desc)
            Skj76Field(label: "URL (datablad/kjøp)", text: $f.url, keyboard: .URL)
            HStack(spacing: 8) {
                Skj76Field(label: "Pris (kr)", text: $f.price, keyboard: .decimalPad)
                Skj76Field(label: "Leverandør", text: $f.supplier)
            }
        }
    }

    private func suggestButton(_ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text("✦ Foreslå").font(PF.ui(14, .bold)).foregroundStyle(p.onLab)
                .padding(.horizontal, 12).frame(height: 44)
                .background(p.lab, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(ai.thinking)
        .accessibilityLabel("Foreslå navn, kategori og specs med Glimt")
    }

    private var categoryMenu: some View {
        Menu {
            ForEach(m.categories) { (c: Skj76Cat) in Button(c.id) { f.category = c.id } }
            // Prompt 77: standardlisten når brukeren ikke har kategorier ennå.
            if m.categories.isEmpty {
                ForEach(Skjold77.defaultCategories, id: \.self) { (c: String) in Button(c) { f.category = c } }
            }
        } label: {
            Image(systemName: "list.bullet").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.ink)
                .frame(width: 44, height: 44).overlay(RoundedRectangle(cornerRadius: 12).stroke(p.line, lineWidth: 1))
        }
        .accessibilityLabel("Velg kategori")
    }

    private var unitMenu: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Enhet").font(PF.ui(12, .semibold)).foregroundStyle(p.mut)
            Menu {
                ForEach(Skj76FormFields.units, id: \.self) { (u: String) in Button(u) { f.unit = u } }
            } label: {
                Text(f.unit).font(PF.ui(15.5, .semibold)).foregroundStyle(p.ink).frame(width: 64, height: 44)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(p.line, lineWidth: 1))
            }
        }
    }
}

/// Specs som nøkkel/verdi-par (verdi 10k, toleranse 1 %, pakke 0805 …).
struct Skj76SpecFields: View {
    @Environment(\.paper) private var p
    @Binding var specs: [Skj76Spec]

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 8) {
                PLabel(text: "Specs")
                ForEach($specs) { (s: Binding<Skj76Spec>) in
                    let sid: UUID = s.wrappedValue.id
                    HStack(spacing: 8) {
                        TextField("felt", text: s.k).font(PF.mono(13, bold: false)).frame(width: 110)
                        TextField("verdi", text: s.v).font(PF.ui(15))
                        Button { specs.removeAll { $0.id == sid } } label: { Image(systemName: "minus.circle").foregroundStyle(p.mut) }
                            .buttonStyle(.plain).accessibilityLabel("Fjern feltet")
                    }
                    .padding(.horizontal, 10).frame(height: 40)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(p.line, lineWidth: 1))
                }
                Button { specs.append(Skj76Spec(k: "", v: "")) } label: {
                    Label("Legg til felt", systemImage: "plus").font(PF.ui(13.5, .semibold)).foregroundStyle(p.lab)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/* ---------- Innholdet i en skuff ---------- */

struct Skj76DrawerSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let cabinetId: String
    let row: Int
    let col: Int
    @State private var label: String = ""
    @State private var comps: Int = 1
    @State private var loaded: Bool = false

    var body: some View {
        let d: Skj76Drawer = m.maps[cabinetId]?.drawer(row, col) ?? Skj76Drawer(row: row, col: col)
        let cab: String = m.cabinets.first { $0.id == cabinetId }?.name ?? "Skap"
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Skj76SheetTop(kicker: cab + " · \(row)-\(col)", title: "Rad \(row) · Skuff \(col)")
                contents(d)
                Skj76Button(title: "Ny del i denne skuffen", icon: "plus", filled: true) { newHere(cab) }
                settings
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
        .onAppear {
            if loaded { return }
            loaded = true
            label = d.label
            comps = d.comps
            m.highlight(Skj76Loc(cabinetId: cabinetId, cabinet: cab, row: row, col: col, comp: nil, text: Skj76LocPicker.text(cab, row, col, nil)))
        }
    }

    @ViewBuilder
    private func contents(_ d: Skj76Drawer) -> some View {
        if d.parts.isEmpty {
            PCard { Text("Skuffen er tom.").font(PF.ui(14)).foregroundStyle(p.mut) }
        } else {
            VStack(spacing: 0) {
                ForEach(d.parts) { (x: Skj76Mini) in
                    Button { m.sheet = .part(x.id) } label: {
                        HStack(spacing: 12) {
                            Skj76Thumb(path: x.thumbUrl, size: 44)
                            Text(x.name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                            Spacer()
                            Text(Skjold76.num(x.qty)).font(PF.mono(13)).foregroundStyle(p.mut)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 8).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .glass50Card(p, radius: 18)
        }
    }

    private var settings: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                PLabel(text: "Skuffen")
                Skj76Field(label: "Etikett (tom = R\(row)·S\(col))", text: $label)
                Stepper("Rom: \(comps)", value: $comps, in: 1...4).font(PF.ui(14.5)).foregroundStyle(p.ink)
                Skj76Button(title: "Lagre skuffen", icon: "checkmark") { save() }
            }
        }
    }

    private func newHere(_ cab: String) {
        m.preset = Skj76Loc(cabinetId: cabinetId, cabinet: cab, row: row, col: col, comp: nil, text: Skj76LocPicker.text(cab, row, col, nil))
        m.sheet = .edit("")
    }

    private func save() {
        let body: [String: Any] = ["label": label.trimmingCharacters(in: .whitespaces), "compartments": comps]
        Task { @MainActor in
            do {
                _ = try await store.api.callAt(Skjold76.prefix, "PUT", Skjold76.root + "/cabinets/\(cabinetId)/drawers/\(row)/\(col)", json: body, timeout: 15)
                Haptics.shared.success()
                m.flash("Skuffen er lagret")
                await m.loadMap(cabinetId, store)
            } catch { m.fail(error) }
        }
    }
}

/* ---------- Etiketter (GET /labels?cabinet= → HTML, hentes med app-token og skrives ut) ---------- */

struct Skj76Labels: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let cabinetId: String
    @State private var html: String = ""
    @State private var error: String = ""
    @State private var box: Skj76WebCoord = Skj76WebCoord()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Skj76SheetTop(kicker: "Etiketter", title: m.cabinets.first { $0.id == cabinetId }?.name ?? "Skap")
            if !error.isEmpty { Playback44Note(text: error, red: true) }
            Skj76Web(box: box, html: html, base: store.api.base)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
            Skj76Button(title: "Skriv ut", icon: "printer", filled: true) { printOut() }
                .disabled(html.isEmpty)
        }
        .padding(16)
        .background(p.bg.ignoresSafeArea())
        .task { await load() }
    }

    private func load() async {
        let q: String = cabinetId.isEmpty ? "" : "?cabinet=" + Skjold76.enc(cabinetId)
        do {
            let d: Data = try await store.api.callAt(Skjold76.prefix, "GET", Skjold76.root + "/labels" + q, timeout: 20)
            html = String(decoding: d, as: UTF8.self)
        } catch {
            self.error = (error as? APIError)?.status == 0 ? Skjold76.netMsg : ((error as? APIError)?.message ?? error.localizedDescription)
        }
    }

    private func printOut() {
        guard let web = box.web else { return }
        let info: UIPrintInfo = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = "Skjold Lab – etiketter"
        let pc: UIPrintInteractionController = UIPrintInteractionController.shared
        pc.printInfo = info
        pc.printFormatter = web.viewPrintFormatter()
        pc.present(animated: true)
    }
}

struct Skj76Web: UIViewRepresentable {
    let box: Skj76WebCoord
    let html: String
    let base: String

    func makeUIView(context: Context) -> WKWebView {
        let v: WKWebView = WKWebView()
        box.web = v
        return v
    }

    func updateUIView(_ v: WKWebView, context: Context) {
        if html.isEmpty || box.shown == html { return }
        box.shown = html
        v.loadHTMLString(html, baseURL: URL(string: base))
    }
}

/// Holder nettvisningen (for utskrift) og hva den viser.
final class Skj76WebCoord {
    var web: WKWebView? = nil
    var shown: String = ""
}
