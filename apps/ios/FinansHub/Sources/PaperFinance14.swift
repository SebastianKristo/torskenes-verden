import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/* ---------------- Papir → Finans: Liste, Finn og Mer (prompt 14) ---------------- */

private func pkr(_ v: Double) -> String { "\(neg0(v)) kr" }

/// Bilde fra serveren (med app-token). Fargetone og initialer mens det lastes eller mangler.
struct PaperServerImage: View {
    @Environment(Store.self) private var store
    let path: String?
    let tint: Color
    let initials: String
    @State private var img: UIImage?

    var body: some View {
        ZStack {
            tint
            if let img {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Text(initials).font(PF.serif(26, medium: true)).foregroundStyle(.white.opacity(0.75))
            }
        }
        .clipped()
        .task(id: path) {
            guard let path, !path.isEmpty else { img = nil; return }
            img = await store.image(path.hasPrefix("/") || path.hasPrefix("http") ? path : "/" + path)
        }
    }
}

/* ---------- Liste ---------- */

/// Søk med ✦ AI, kategorifiltre (Alle, Til gjennomgang og kategorier), netto for utvalget og transaksjonene.
/// Et trykk åpner detaljen med original kvittering og bankutskrift.
struct PaperFinList: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var cat = "Alle"
    @FocusState private var focused: Bool

    var body: some View {
        let all = store.txs ?? []
        let list = all.filter(match)
        VStack(spacing: 10) {
            search
            chips(all)
            HStack {
                PLabel(text: (cat == "Alle" ? monthName() : cat) + " · \(list.count)")
                Spacer()
                Text("Netto " + pkr(list.reduce(0) { $0 + $1.amount })).font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 2)
            if store.txs == nil { ProgressView().padding(30) }
            if store.txs != nil && list.isEmpty {
                PCard { Text("Ingen transaksjoner i utvalget.").font(PF.ui(13.5)).foregroundStyle(p.mut) }
            }
            VStack(spacing: 0) {
                ForEach(Array(list.prefix(200).enumerated()), id: \.element.id) { i, t in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    row(t)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .task { if store.txs == nil { try? await store.loadTx() } }
    }

    /// Feltet er en pille (44 høyt), og AI-knappen inni er også en pille (34 høy, 5 pt fra kanten).
    private var search: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(p.mut).padding(.leading, 14)
            TextField("Søk i transaksjoner", text: Binding(get: { store.query }, set: { store.query = $0 }))
                .font(PF.ui(14.5)).foregroundStyle(p.ink)
                .focused($focused)
                .submitLabel(.search)
                .onSubmit { store.search() }
            Button {
                Haptics.shared.tap()
                let q = store.query
                guard !q.trimmingCharacters(in: .whitespaces).isEmpty else { store.paperGo("fsok"); return }
                store.paperGo("fsok")
                store.ask(q)
            } label: {
                Text("✦ AI").font(PF.ui(13, .bold)).foregroundStyle(p.bg).padding(.horizontal, 14).frame(height: 34)
                    .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.trailing, 5)
        }
        .frame(height: 44)
        .background(p.card, in: Capsule())
        .overlay(Capsule().stroke(p.line, lineWidth: 1))
    }

    private func chips(_ all: [Tx]) -> some View {
        var cats: [String] = []
        for t in all where !cats.contains(t.category) && !t.category.isEmpty { cats.append(t.category) }
        let names = ["Alle", "Til gjennomgang"] + Array(cats.prefix(8))
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(names, id: \.self) { n in
                    let on = cat == n
                    Button { Haptics.shared.select(); cat = n } label: {
                        Text(n).font(PF.ui(13, .semibold)).foregroundStyle(on ? p.bg : p.ink).padding(.horizontal, 12).frame(height: 32)
                            .background(on ? p.ink : Color.clear, in: Capsule())
                            .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func match(_ t: Tx) -> Bool {
        if cat == "Alle" { return true }
        if cat == "Til gjennomgang" { return PaperFinList.needsReview(t) }
        return t.category == cat
    }

    static func needsReview(_ t: Tx) -> Bool {
        let r = (t.receipt ?? "").lowercased()
        return r == "review" || r == "needs_review" || r.contains("gjennomgang")
    }

    private func row(_ t: Tx) -> some View {
        Button { store.openPaperTx(t.id) } label: {
            HStack(spacing: 12) {
                Text(String((t.merchant ?? t.description).prefix(1)).uppercased()).font(PF.ui(11, .heavy)).foregroundStyle(.white)
                    .frame(width: 38, height: 38).background(Color(hex: t.color), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text(t.merchant ?? t.description).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    Text(sub(t)).font(PF.ui(12)).foregroundStyle(PaperFinList.needsReview(t) ? p.lab : p.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text((t.amount > 0 ? "+" : "") + neg0(t.amount)).font(PF.serif(17, medium: true)).foregroundStyle(t.amount > 0 ? p.pos : p.ink)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func sub(_ t: Tx) -> String {
        let d = t.date.prefix(10).split(separator: "-")
        let day = d.count == 3 ? "\(d[2]).\(d[1])" : t.date
        let rc = PaperFinList.needsReview(t) ? "Til gjennomgang" : (t.receipt == nil || t.receipt?.isEmpty == true ? "ingen kvittering" : "kvittering")
        return "\(t.category) · \(day) · \(rc)"
    }
}

/* ---------- Finn ---------- */

/// Netto i år med stolper for kjøpt og solgt, filtre, «+ Legg til kjøp eller salg» og et rutenett med to kort i bredden.
/// Et trykk på kortet åpner annonsen (Finn-appen), ✎ åpner redigering under rutenettet.
struct PaperFinn: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var adding = false
    @State private var editId: Int?

    private static let segs = ["Alle", "På vei", "Kjøpt", "Solgt", "Fullført"]

    var body: some View {
        let all = store.finn?.items ?? []
        let list = all.filter { PaperFinn.inSeg($0, store.finnSeg) }
        VStack(spacing: 10) {
            netCard(all)
            PaperFinnWay()
            segments(all)
            PLineButton(title: adding ? "Lukk" : "+ Legg til kjøp eller salg", height: 44, full: true) { withAnimation { adding.toggle() } }
            if adding { PaperFinnAdd { adding = false } }
            if store.finn == nil { ProgressView().padding(30) }
            if store.finn != nil && list.isEmpty {
                PCard { Text("Ingen handler i utvalget.").font(PF.ui(13.5)).foregroundStyle(p.mut) }
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
                ForEach(list) { d in
                    PaperFinnCard(d: d, editing: editId == d.id) { toggleEdit(d) }
                }
            }
            if let id = editId, let d = all.first(where: { $0.id == id }) {
                PaperFinnEdit(d: d) { editId = nil }.id(d.id)
            }
        }
        .task { if store.finn == nil { try? await store.loadFinn() } }
    }

    private func toggleEdit(_ d: FinnDeal) {
        Haptics.shared.tap()
        withAnimation(.easeOut(duration: 0.2)) {
            if editId == d.id { editId = nil; store.finnSel = nil } else { editId = d.id; store.openFinn(d.id) }
        }
    }

    static func inSeg(_ d: FinnDeal, _ seg: String) -> Bool {
        switch seg {
        case "På vei": return !d.finished && d.level >= 2
        case "Kjøpt": return !d.sold
        case "Solgt": return d.sold
        case "Fullført": return d.finished
        default: return true
        }
    }

    private func netCard(_ all: [FinnDeal]) -> some View {
        let buy = store.finn?.bought ?? all.filter { !$0.sold }.reduce(0) { $0 + ($1.amount ?? 0) }
        let sell = store.finn?.sold ?? all.filter(\.sold).reduce(0) { $0 + ($1.amount ?? 0) }
        let net = sell - buy
        let mx = Swift.max(1, buy, sell)
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                PLabel(text: "Netto i år")
                Spacer()
                Text("\(all.count) handler").font(PF.ui(12)).foregroundStyle(p.mut)
            }
            Text((net >= 0 ? "+" : "−") + n0(abs(net)) + " kr").font(PF.serif(40)).foregroundStyle(net >= 0 ? p.pos : p.lab).lineLimit(1).minimumScaleFactor(0.6)
            bar("Kjøpt · \(all.filter { !$0.sold }.count)", buy, buy / mx, p.ink)
            bar("Solgt · \(all.filter(\.sold).count)", sell, sell / mx, p.pos)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 15, y: 10)
    }

    private func bar(_ label: String, _ v: Double, _ f: Double, _ c: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(PF.ui(12.5)).foregroundStyle(p.mut)
                Spacer()
                Text(pkr(v)).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(p.line)
                    Capsule().fill(c).frame(width: g.size.width * Swift.min(1, Swift.max(0, f)))
                }
            }
            .frame(height: 8)
        }
    }

    private func segments(_ all: [FinnDeal]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(PaperFinn.segs, id: \.self) { n in
                    let on = store.finnSeg == n
                    let c = all.filter { PaperFinn.inSeg($0, n) }.count
                    Button { Haptics.shared.select(); store.finnSeg = n } label: {
                        HStack(spacing: 5) {
                            Text(n).font(PF.ui(13, .semibold))
                            Text("\(c)").font(PF.mono(11, bold: false)).opacity(0.7)
                        }
                        .foregroundStyle(on ? p.bg : p.ink).padding(.horizontal, 12).frame(height: 32)
                        .background(on ? p.ink : Color.clear, in: Capsule())
                        .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

/// Et kort i rutenettet: bilde (annonsen eller første opplastede), statusmerke, steg-linje, pris, tittel og rolle.
struct PaperFinnCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let d: FinnDeal
    let editing: Bool
    let edit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topLeading) {
                PaperServerImage(path: d.image, tint: tint, initials: initials)
                    .frame(height: 118)
                    .frame(maxWidth: .infinity)
                    .clipped()
                Text(d.finished ? "FULLFØRT" : d.status.uppercased()).font(PF.mono(9.5)).tracking(0.8)
                    .foregroundStyle(pillFg).padding(.horizontal, 8).frame(height: 22)
                    .background(pillBg, in: Capsule())
                    .padding(8)
                HStack {
                    Spacer()
                    Button(action: edit) {
                        Text("✎").font(PF.ui(14, .bold)).foregroundStyle(Color(hex: "#1b1a17")).frame(width: 30, height: 30)
                            .background(Color(hex: "#f3efe6").opacity(0.94), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Rediger \(d.item ?? "handelen")")
                }
                .padding(6)
            }
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 3) {
                    ForEach(0..<4, id: \.self) { j in Capsule().fill(barColor(j)).frame(height: 4) }
                }
                Text((d.sold ? "+" : "−") + n0(d.amount ?? 0) + " kr").font(PF.serif(18, medium: true)).foregroundStyle(d.sold ? p.pos : p.ink).lineLimit(1)
                Text(d.item ?? "Finn-handel").font(PF.ui(13, .semibold)).foregroundStyle(p.ink).lineLimit(2)
                Text((d.sold ? "Solgt" : "Kjøpt") + ((d.counterpart ?? "").isEmpty ? "" : " · \(d.sold ? "til" : "fra") \(d.counterpart ?? "")")).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
                Text(d.nextText).font(PF.ui(11.5)).foregroundStyle(d.finished ? p.pos : p.lab).lineLimit(2)
            }
            .padding(10)
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(editing ? p.lab : Color.clear, lineWidth: 2))
        .contentShape(Rectangle())
        .onTapGesture { openAd() }
    }

    private var tint: Color {
        let c = ["#3A2F4A", "#1E2A3F", "#3B2E22", "#22362C", "#2C2C33", "#2A3540"]
        return Color(hex: c[((d.id % c.count) + c.count) % c.count])
    }

    private var initials: String {
        let w = (d.item ?? "").split(whereSeparator: \.isWhitespace).prefix(2).compactMap { $0.first.map { String($0).uppercased() } }.joined()
        return w.isEmpty ? "•" : w
    }

    private var pillBg: Color { d.finished ? Color.black.opacity(0.6) : d.sold ? Color(hex: "#2f7a4f") : Color(hex: "#f3efe6").opacity(0.94) }
    private var pillFg: Color { d.finished || d.sold ? .white : Color(hex: "#1b1a17") }

    private func barColor(_ j: Int) -> Color {
        if d.finished { return p.pos }
        if j < d.level - 1 { return p.ink }
        if j == d.level - 1 { return p.lab }
        return p.line
    }

    /// Annonsen på finn.no (åpnes i Finn-appen når den finnes).
    private func openAd() {
        if let u = d.adUrl, !u.isEmpty { store.openLink(u); return }
        if let c = d.code, !c.isEmpty, c.allSatisfy(\.isNumber) { store.openLink("https://www.finn.no/recommerce/forsale/item/\(c)"); return }
        store.flash("Handelen har ingen annonse ennå. Trykk ✎ for å legge inn lenken.")
    }
}

/// «+ Legg til kjøp eller salg»: type, Finn-lenke (✦ AI henter tittel, pris, tekst og bilder), tittel, pris og person.
struct PaperFinnAdd: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let done: () -> Void
    @State private var sold = false
    @State private var link = ""
    @State private var title = ""
    @State private var price = ""
    @State private var who = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                kind("Kjøpt", !sold) { sold = false }
                kind("Solgt", sold) { sold = true }
            }
            field("Finn-lenke (valgfritt)", $link, .URL)
            field("Tittel", $title, .default)
            HStack(spacing: 8) {
                field("Pris", $price, .decimalPad)
                field(sold ? "Kjøper" : "Selger", $who, .default)
            }
            Text("Med lenke henter ✦ AI tittel, pris, tekst og bilder fra annonsen.").font(PF.ui(12)).foregroundStyle(p.mut)
            PInkButton(title: "Lagre", height: 46, full: true) {
                store.addFinnDeal(sold: sold, title: title, price: price, who: who, link: link)
                done()
            }
            .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty && link.isEmpty)
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func kind(_ t: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(13.5, .semibold)).foregroundStyle(on ? p.bg : p.ink).padding(.horizontal, 14).frame(height: 34)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func field(_ ph: String, _ b: Binding<String>, _ kb: UIKeyboardType) -> some View {
        TextField(ph, text: b)
            .keyboardType(kb)
            .textInputAutocapitalization(kb == .URL ? .never : .sentences)
            .autocorrectionDisabled(kb == .URL)
            .font(PF.ui(14.5)).foregroundStyle(p.ink)
            .padding(.horizontal, 12).frame(height: 44)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(p.line, lineWidth: 1))
    }
}

/// Redigering under rutenettet: tittel, pris, person, status, kvittering og bilder, «Annonse ↗», Lagre og Slett.
struct PaperFinnEdit: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let d: FinnDeal
    let close: () -> Void
    @State private var title = ""
    @State private var price = ""
    @State private var who = ""
    @State private var link = ""
    @State private var photos: [PhotosPickerItem] = []
    @State private var files = false
    @State private var confirmDelete = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                PLabel(text: "Rediger · \(d.sold ? "salg" : "kjøp")")
                Spacer()
                Button("Lukk", action: close).font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
            }
            field("Tittel", $title, .default)
            HStack(spacing: 8) {
                field("Pris", $price, .decimalPad)
                field(d.sold ? "Kjøper" : "Selger", $who, .default)
            }
            field("Finn-lenke", $link, .URL)
            PLabel(text: "Status", color: p.mut)
            stages
            HStack(spacing: 8) {
                PhotosPicker(selection: $photos, maxSelectionCount: 10, matching: .images) {
                    Text("+ Bilder").font(PF.ui(13, .semibold)).foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 40)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                PLineButton(title: "+ Kvittering", height: 40, full: true) { files = true }
            }
            if store.finnBusy != nil { Text("Laster opp …").font(PF.ui(12)).foregroundStyle(p.mut) }
            HStack(spacing: 8) {
                PLineButton(title: "Annonse ↗", height: 44, full: true) { openAd() }
                PInkButton(title: "Lagre", height: 44, full: true) { save() }
            }
            Button(role: .destructive) { confirmDelete = true } label: {
                Text("Slett handelen").font(PF.ui(13, .semibold)).foregroundStyle(p.lab).frame(maxWidth: .infinity, minHeight: 36)
            }
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(p.lab, lineWidth: 1.5))
        .onAppear {
            title = d.item ?? ""
            price = d.amount.map { n0($0).replacingOccurrences(of: "\u{00a0}", with: "").replacingOccurrences(of: " ", with: "") } ?? ""
            who = d.counterpart ?? ""
            link = d.adUrl ?? ""
        }
        .onChange(of: photos) { _, items in
            guard !items.isEmpty else { return }
            Task {
                var out: [(name: String, mime: String, data: Data)] = []
                for (i, it) in items.enumerated() {
                    if let raw = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: raw), let j = img.scaled(max: 2000).jpegData(compressionQuality: 0.85) {
                        out.append((name: "bilde-\(i + 1).jpg", mime: "image/jpeg", data: j))
                    }
                }
                photos = []
                store.finnSel = d.id
                store.finnUpload("photos", out)
            }
        }
        .fileImporter(isPresented: $files, allowedContentTypes: [.pdf, .jpeg, .png, .heic, .image]) { r in
            guard case .success(let url) = r, url.startAccessingSecurityScopedResource() else { return }
            defer { url.stopAccessingSecurityScopedResource() }
            guard let data = try? Data(contentsOf: url) else { return }
            let pdf = url.pathExtension.lowercased() == "pdf"
            store.finnSel = d.id
            store.finnUpload("receipts", [(name: url.lastPathComponent, mime: pdf ? "application/pdf" : "image/jpeg", data: data)])
        }
        .confirmationDialog("Slette \(d.item ?? "handelen")?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Slett", role: .destructive) { store.deleteFinnDeal(d.id); close() }
            Button("Avbryt", role: .cancel) {}
        }
    }

    private var stages: some View {
        HStack(spacing: 6) {
            ForEach(Array(d.points.enumerated()), id: \.offset) { i, n in
                let on = d.level == i + 1
                Button { store.setFinnStage(d.id, i + 1) } label: {
                    Text(n).font(PF.ui(12, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, minHeight: 32)
                        .background(on ? p.ink : Color.clear, in: Capsule())
                        .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func field(_ ph: String, _ b: Binding<String>, _ kb: UIKeyboardType) -> some View {
        TextField(ph, text: b)
            .keyboardType(kb)
            .textInputAutocapitalization(kb == .URL ? .never : .sentences)
            .autocorrectionDisabled(kb == .URL)
            .font(PF.ui(14.5)).foregroundStyle(p.ink)
            .padding(.horizontal, 12).frame(height: 44)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(p.line, lineWidth: 1))
    }

    private func openAd() {
        let u = link.trimmingCharacters(in: .whitespaces)
        if !u.isEmpty { store.openLink(u.hasPrefix("http") ? u : "https://" + u); return }
        if let c = d.code, !c.isEmpty { store.openLink("https://www.finn.no/recommerce/forsale/item/\(c)"); return }
        store.flash("Legg inn lenken til annonsen først")
    }

    private func save() {
        store.saveFinnDeal(d, title: title, price: price, who: who, link: link)
        close()
    }
}

extension Store {
    /// Ny handel. Med Finn-lenke lagres lenken, og ✦ AI henter annonsen (tittel, pris, tekst og bilder).
    func addFinnDeal(sold: Bool, title: String, price: String, who: String, link: String) {
        let amount = Double(price.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: ".")) ?? 0
        let l = link.trimmingCharacters(in: .whitespacesAndNewlines)
        let t = title.trimmingCharacters(in: .whitespaces)
        run {
            var body: [String: Any] = ["role": sold ? "sold" : "bought", "item": t.isEmpty ? "Finn-annonse" : t, "counterpart": who, "amount": amount > 0 ? amount : 1]
            body["date"] = isoDay(Date())
            let d = try await self.api.call("POST", "/finn", json: body)
            let id = JS.int(JS.obj(d), "id")
            if let id, !l.isEmpty {
                _ = try? await self.api.call("PATCH", "/finn/\(id)", json: ["adUrl": l.hasPrefix("http") ? l : "https://" + l])
                _ = try? await self.api.call("POST", "/finn/\(id)/ad", json: [:])
            }
            try await self.loadFinn()
            self.flash(l.isEmpty ? "Handelen er lagt til" : "✦ Handelen er lagt til, annonsen hentes")
        }
    }

    func saveFinnDeal(_ deal: FinnDeal, title: String, price: String, who: String, link: String) {
        let amount = Double(price.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: "."))
        let l = link.trimmingCharacters(in: .whitespacesAndNewlines)
        run {
            var body: [String: Any] = ["item": title, "counterpart": who]
            if let amount, amount > 0 { body["amount"] = amount }
            if l != (deal.adUrl ?? "") { body["adUrl"] = l.isEmpty ? NSNull() : (l.hasPrefix("http") ? l : "https://" + l) }
            _ = try await self.api.call("PATCH", "/finn/\(deal.id)", json: body)
            try await self.loadFinn()
            self.flash("Lagret")
        }
    }

    func setFinnStage(_ id: Int, _ stage: Int) {
        Haptics.shared.select()
        run {
            _ = try await self.api.call("PATCH", "/finn/\(id)", json: ["stage": stage])
            try await self.loadFinn()
        }
    }

    func deleteFinnDeal(_ id: Int) {
        run {
            _ = try await self.api.call("DELETE", "/finn/\(id)")
            if self.finnSel == id { self.finnSel = nil; self.finnDetail = nil }
            try await self.loadFinn()
            self.flash("Handelen er slettet")
        }
    }
}

/* ---------- Mer i Finans ---------- */

/// Budsjett, Kvitteringer, Faste trekk, Kontoer, Aksjer, Abonnementer, Boliger, Import, Rapporter og Innstillinger.
struct PaperFinMore: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            group("Penger", [
                PaperLinkRow(name: "Budsjett", sub: "Per kategori") { store.paperOpenFin(.budget) },
                PaperLinkRow(name: "Kvitteringer", sub: "Kø og bokført", value: reviewValue) { store.paperOpen(.upload) },
                PaperLinkRow(name: "Faste trekk", sub: "Neste 30 dager") { store.paperOpen(.fast) },
                PaperLinkRow(name: "Kontoer", sub: "Saldo og sparemål") { store.paperOpen(.accounts) },
            ])
            group("Moduler", [
                PaperLinkRow(name: "Aksjer", sub: "Trading 212") { store.paperOpen(.stocks) },
                PaperLinkRow(name: "Abonnementer", sub: "Subscription OS") { store.paperOpen(.sub) },
                PaperLinkRow(name: "Boliger", sub: "Utgifter, prosjekter og regninger") { store.paperOpen(.folders) },
            ])
            group("Data", [
                PaperLinkRow(name: "Import", sub: "Bankutskrift, CSV og XLSX") { store.paperOpen(.imports) },
                PaperLinkRow(name: "Rapporter", sub: "Måned og år") { store.paperOpen(.reports) },
                PaperLinkRow(name: "✦ AI-søk", sub: "Spør om økonomien din") { store.paperOpenFin(.search) },
                PaperLinkRow(name: "Innstillinger", sub: "Tema, bakgrunn og konto") { store.paperGo("innst") },
            ])
        }
    }

    private var reviewValue: String {
        let n = store.summary?.review.count ?? store.boot?.reviewCount ?? 0
        return n > 0 ? "\(n)" : "›"
    }

    private func group(_ t: String, _ rows: [PaperLinkRow]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            PLabel(text: t).padding(.top, 10).padding(.leading, 4)
            PaperLinkList(rows: rows)
        }
    }
}
