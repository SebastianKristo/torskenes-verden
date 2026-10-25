import SwiftUI
import PhotosUI

/* ---------------- Prompt 24: «Rediger bolig» (hold inne), Ny bolig, Ny utgift og utgiftsdetaljen ---------------- */

/// Felles tekstfelt i arkene: høyde 46, radius 14, card med line-kant.
struct Bol24Field: View {
    @Environment(\.paper) private var p
    let label: String
    let placeholder: String
    @Binding var text: String
    var mono: Bool = false
    var numeric: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !label.isEmpty { Text(label).font(PF.ui(12.5)).foregroundStyle(p.mut) }
            TextField(placeholder, text: $text)
                .font(mono ? PF.mono(15) : PF.ui(15, .semibold))
                .foregroundStyle(p.ink)
                .keyboardType(numeric ? .numberPad : .default)
                .padding(.horizontal, 14)
                .frame(height: 46)
                .background(RoundedRectangle(cornerRadius: 14).fill(p.card))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(p.line, lineWidth: 1))
        }
    }
}

/// Toppen av arkene: håndtak og tittel, × til høyre.
struct Bol24SheetHead: View {
    @Environment(\.paper) private var p
    let title: String
    let close: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Capsule().fill(p.line).frame(width: 40, height: 5)
            ZStack {
                Text(title).font(PF.serif(22, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                HStack {
                    Spacer()
                    Button(action: close) {
                        Text("×").font(.dyn51(size: 17)).foregroundStyle(p.ink)
                            .frame(width: 38, height: 38)
                            .background(Circle().fill(p.card))
                            .overlay(Circle().strokeBorder(p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Lukk")
                }
            }
        }
    }
}

/* ---------- Rediger bolig ---------- */

struct Bol24EditSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let home: Bol24Home
    let close: () -> Void
    /// Prompt 47: «Delt med N» lukker arket og åpner Tilgang.
    var access: (() -> Void)? = nil
    @State private var name: String = ""
    @State private var address: String = ""
    @State private var budget: String = ""
    @State private var color: String = "#2f6b45"
    @State private var bg: String = "color"
    @State private var free: Color = Color(hex: "#2f6b45")
    @State private var pick: PhotosPickerItem? = nil
    @State private var newImage: UIImage? = nil
    @State private var confirmDelete: Bool = false
    @State private var saving: Bool = false
    @State private var started: Bool = false
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Bol24SheetHead(title: "Rediger bolig", close: close)
                preview
                Bol24Field(label: "Navn", placeholder: "Navn", text: $name)
                Bol24Field(label: "Adresse", placeholder: "Adresse eller sted", text: $address)
                Bol24Field(label: "Budsjett per måned (kr)", placeholder: "8000", text: $budget, mono: true, numeric: true)
                colors
                backgrounds
                if let access { Bol47SharedRow(home: home, open: access) }
                buttons
            }
            .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 30)
        }
        .background(p.bg.ignoresSafeArea())
        .onAppear { start() }
        .onChange(of: free) { _, c in
            color = Fam22Fmt.hex(c)
        }
        .onChange(of: pick) { _, item in
            guard let item else { return }
            Task { @MainActor in
                if let d = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: d) {
                    newImage = img.scaled(max: 1200)
                    bg = "new"
                }
                pick = nil
            }
        }
    }

    private func start() {
        if started { return }
        started = true
        name = home.name
        address = home.address
        budget = home.budget.map { String(Int($0.rounded())) } ?? ""
        color = home.color
        free = Color(hex: home.color)
        bg = home.bgKind
    }

    /// Forhåndsvisning 120 høy med bakgrunnen og navnet.
    private var preview: some View {
        ZStack(alignment: .bottomLeading) {
            previewBg
            Text(name.isEmpty ? home.name : name).font(PF.serif(26, medium: true)).foregroundStyle(Color.white)
                .shadow(color: Color.black.opacity(0.4), radius: 5, x: 0, y: 2)
                .padding(14)
        }
        .frame(height: 120)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    @ViewBuilder private var previewBg: some View {
        if let img = imageFor(bg) {
            Color.clear
                .overlay { Image(uiImage: img).resizable().scaledToFill() }
                .overlay { LinearGradient(colors: [Color.black.opacity(0.1), Color.black.opacity(0.5)], startPoint: .top, endPoint: .bottom) }
                .clipped()
        } else {
            Bol24Color.gradient(color)
        }
    }

    private func imageFor(_ kind: String) -> UIImage? {
        if kind == "preset:stromstad" { return UIImage(named: "Stromstad") }
        if kind == "new" { return newImage }
        if kind.hasPrefix("upload:") { return m.uploaded(home.id, kind) ?? (m.home?.id == home.id ? m.heroImage : nil) }
        return nil
    }

    private var colors: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Farge").font(PF.ui(12.5)).foregroundStyle(p.mut)
            HStack(spacing: 8) {
                ForEach(Bol24Pal.colors, id: \.self) { c in
                    Button { color = c } label: {
                        Circle().fill(Color(hex: c))
                            .frame(width: 32, height: 32)
                            .overlay(Circle().strokeBorder(p.bg, lineWidth: 2).padding(3))
                            .overlay(Circle().strokeBorder(color.lowercased() == c ? p.ink : Color.clear, lineWidth: 3))
                    }
                    .buttonStyle(.plain)
                }
                ColorPicker("", selection: $free, supportsOpacity: false)
                    .labelsHidden()
                    .frame(width: 32, height: 32)
            }
        }
    }

    private var bgOptions: [(String, String)] {
        var o: [(String, String)] = [("color", "Farge"), ("preset:stromstad", "Strømstad")]
        if home.bgKind.hasPrefix("upload:") { o.append((home.bgKind, "Eget bilde")) }
        if newImage != nil { o.append(("new", "Nytt bilde")) }
        return o
    }

    private var backgrounds: some View {
        let cols: [GridItem] = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
        return VStack(alignment: .leading, spacing: 6) {
            Text("Bakgrunn").font(PF.ui(12.5)).foregroundStyle(p.mut)
            LazyVGrid(columns: cols, spacing: 8) {
                ForEach(bgOptions, id: \.0) { o in bgTile(o.0, o.1) }
                PhotosPicker(selection: $pick, matching: .images) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("+").font(.dyn51(size: 20)).foregroundStyle(p.mut)
                            .frame(maxWidth: .infinity)
                            .aspectRatio(1.6, contentMode: .fit)
                            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(p.line, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                        Text("Last opp").font(PF.ui(12, .semibold)).foregroundStyle(p.ink)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func bgTile(_ kind: String, _ title: String) -> some View {
        let on: Bool = bg == kind
        return Button { bg = kind } label: {
            VStack(alignment: .leading, spacing: 5) {
                Color.clear
                    .aspectRatio(1.6, contentMode: .fit)
                    .overlay { tileBg(kind) }
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(on ? p.ink : Color.clear, lineWidth: 2).padding(-4))
                Text(title).font(PF.ui(12, .semibold)).foregroundStyle(p.ink).lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func tileBg(_ kind: String) -> some View {
        if let img = imageFor(kind) {
            Image(uiImage: img).resizable().scaledToFill()
        } else {
            Color(hex: color)
        }
    }

    private var buttons: some View {
        VStack(spacing: 6) {
            Bol24Button(title: saving ? "Lagrer …" : "Lagre", fg: p.bg, bg: p.ink, border: nil, height: 48, font: 15) { save() }
                .disabled(saving)
            Button { del() } label: {
                Text(deleteTitle).font(PF.ui(14, .bold)).foregroundStyle(p.lab)
                    .frame(maxWidth: .infinity).frame(height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(m.homes.count <= 1 || !home.isOwner)
        }
        .padding(.top, 4)
    }

    private var deleteTitle: String {
        if m.homes.count <= 1 { return "Kan ikke slette siste bolig" }
        return confirmDelete ? "Trykk igjen for å slette \(home.name)" : "Slett bolig"
    }

    private func save() {
        guard !saving else { return }
        saving = true
        let id: Int = home.id
        var body: [String: Any] = [:]
        let n: String = name.trimmingCharacters(in: .whitespaces)
        if !n.isEmpty && n != home.name { body["name"] = n }
        if address != home.address { body["address"] = address }
        let digits: String = budget.filter { $0.isNumber }
        let b: Double? = Double(digits)
        if b != home.budget { body["budget"] = b.map { $0 as Any } ?? NSNull() }
        if color.lowercased() != home.color.lowercased() { body["color"] = color.lowercased() }
        let kind: String = bg
        if kind != "new" && kind != home.bgKind { body["background"] = kind }
        let img: UIImage? = kind == "new" ? newImage : nil
        Task { @MainActor in
            var ok: Bool = true
            if !body.isEmpty { ok = await m.patch(id, body, store) }
            if ok, let img { ok = await m.uploadBackground(id, img, store) }
            saving = false
            if ok {
                store.flash("Lagret " + (n.isEmpty ? "bolig" : n))
                close()
            }
        }
    }

    private func del() {
        guard m.homes.count > 1 else { return }
        if !confirmDelete {
            Haptics.shared.tick()
            confirmDelete = true
            return
        }
        let id: Int = home.id
        Task { @MainActor in
            await m.delete(id, store)
            close()
        }
    }
}

/* ---------- Ny bolig ---------- */

struct Bol24NewHomeSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let close: () -> Void
    @State private var name: String = ""
    @State private var address: String = ""
    @State private var budget: String = ""
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Bol24SheetHead(title: "Ny bolig", close: close)
            Bol24Field(label: "", placeholder: "Navn, f.eks. Hytta", text: $name)
            Bol24Field(label: "", placeholder: "Adresse eller sted", text: $address)
            Bol24Field(label: "", placeholder: "Månedsbudsjett (kr)", text: $budget, mono: true, numeric: true)
            Text("Du blir eier. Du kan invitere andre etterpå.").font(PF.ui(12)).foregroundStyle(p.mut)
            Bol24Button(title: "Opprett bolig", fg: p.bg, bg: p.ink, border: nil, height: 48, font: 15) { create() }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18).padding(.top, 14).padding(.bottom, 30)
        .background(p.bg.ignoresSafeArea())
    }

    private func create() {
        let n: String = name.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty else { return }
        let a: String = address.trimmingCharacters(in: .whitespaces)
        let b: Double? = Double(budget.filter { $0.isNumber })
        Task { @MainActor in
            await m.create(name: n, address: a, budget: b, store)
            close()
        }
    }
}

/* ---------- Ny utgift ---------- */

struct Bol24AddSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let home: Bol24Home
    let close: () -> Void
    @State private var text: String = ""
    @State private var amount: String = ""
    @State private var cat: Int? = nil
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Bol24SheetHead(title: "Ny utgift · \(home.name)", close: close)
            Bol24Field(label: "", placeholder: "Hva, f.eks. Byggmakker", text: $text)
            Bol24Field(label: "", placeholder: "Beløp (kr)", text: $amount, mono: true)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Bol24Chip(name: "✦ AI velger", color: "#b23a2a", on: cat == nil, height: 34) { cat = nil }
                    ForEach(home.cats) { c in
                        Bol24Chip(name: c.name, color: c.color, on: cat == c.id, height: 34) { cat = c.id }
                    }
                }
            }
            Bol24Button(title: "Legg til", fg: p.bg, bg: p.ink, border: nil, height: 48, font: 15) { add() }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18).padding(.top, 14).padding(.bottom, 30)
        .background(p.bg.ignoresSafeArea())
    }

    private func add() {
        let t: String = text.trimmingCharacters(in: .whitespaces)
        let a: Double = Double(amount.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: ".")) ?? 0
        guard !t.isEmpty, a > 0 else { store.flash("Skriv inn hva og beløp"); return }
        let id: Int = home.id
        let c: Int? = cat
        Task { @MainActor in
            await m.addEntry(id, text: t, amount: a, categoryId: c, store)
            close()
        }
    }
}

/* ---------- Utgiftsdetaljen ---------- */

struct Bol24EntrySheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let home: Bol24Home
    let entry: Bol24Entry
    let close: () -> Void
    @State private var confirmDelete: Bool = false
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    private var e: Bol24Entry { m.home?.entries.first(where: { $0.id == entry.id }) ?? entry }

    private var kick: String {
        let s: String = e.pending ? "LESES AV AI" : (e.status == "review" ? "TIL GJENNOMGANG" : "GODKJENT")
        return home.name.uppercased() + " · " + s
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Capsule().fill(p.line).frame(width: 40, height: 5).frame(maxWidth: .infinity)
                head
                // Prompt 52: samme kvitteringsvisning som Finans → transaksjon (Receipt52Panel.swift): logo, butikk,
                // «kategori · dato · bolig», stort beløp, ✦ Glimt-tekst og «ORIGINAL KVITTERING». Ingen egen leser i Boliger.
                Bol52ReceiptPanel(home: home, entry: e)
                if home.canEdit && !e.pending { edit52 }
                if home.canEdit { cats }
                if home.canEdit { buttons }
            }
            .padding(.horizontal, 18).padding(.top, 14).padding(.bottom, 30)
        }
        .background(p.bg.ignoresSafeArea())
    }

    private var head: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                PLabel(text: kick, size: 11)
                // Prompt 30: butikk/beskrivelse kan redigeres (lagres fortløpende, Boliger30.swift).
                Bol30TitleField(hid: home.id, eid: e.id, initial: e.description, editable: home.canEdit && !e.pending)
            }
            Spacer(minLength: 0)
            // Prompt 30: felles Ferdig-pille.
            SheetButton30(kind: .primary, title: "Ferdig", action: close)
        }
    }

    /// Prompt 52: beløp og dato kan fortsatt endres (prompt 30), under panelet.
    private var edit52: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Endre beløp og dato").font(PF.ui(12.5)).foregroundStyle(p.mut)
            Bol30AmountDate(hid: home.id, eid: e.id, amount: e.amount, date: e.date)
            if !e.paidBy.isEmpty { Text("Lagt til av " + e.paidBy).font(PF.ui(13)).foregroundStyle(p.mut) }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var info: some View {
        HStack(alignment: .top, spacing: 12) {
            receipt
            VStack(alignment: .leading, spacing: 6) {
                if home.canEdit && !e.pending {
                    // Prompt 30: beløp (34 pt, «kr») og dato kan endres.
                    Bol30AmountDate(hid: home.id, eid: e.id, amount: e.amount, date: e.date)
                    if !e.paidBy.isEmpty { Text("Lagt til av " + e.paidBy).font(PF.ui(13)).foregroundStyle(p.mut) }
                } else {
                    Text(e.pending ? "…" : bol24kr(e.amount)).font(PF.serif(34, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
                    Text(ddmmyyyy(e.date) + (e.paidBy.isEmpty ? "" : " · lagt til av " + e.paidBy)).font(PF.ui(13)).foregroundStyle(p.mut)
                }
                if !e.aiShort.isEmpty {
                    Text("✦ " + e.aiShort).font(PF.ui(13)).foregroundStyle(p.ink).lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 12).fill(p.card))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder private var receipt: some View {
        if e.receiptId.isEmpty {
            Text("Ingen kvittering").font(PF.ui(12)).foregroundStyle(p.mut).multilineTextAlignment(.center)
                .frame(width: 96, height: 124)
                .background(RoundedRectangle(cornerRadius: 12).fill(p.card))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(p.line, lineWidth: 1))
        } else {
            PaperServerImage(path: "/finans/api/folders/\(home.id)/receipts/\(e.receiptId)/thumb", tint: p.card, initials: "⎙")
                .frame(width: 96, height: 124)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(p.line, lineWidth: 1))
        }
    }

    private var cats: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Kategori").font(PF.ui(12.5)).foregroundStyle(p.mut)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(home.cats) { c in
                        Bol24Chip(name: c.name, color: c.color, on: c.name == e.category, height: 34) {
                            let hid: Int = home.id
                            let eid: Int = e.id
                            Task { await m.entry(hid, eid, ["categoryId": c.id], store) }
                        }
                    }
                }
            }
        }
    }

    private var buttons: some View {
        HStack(spacing: 8) {
            Bol24Button(title: confirmDelete ? "Trykk igjen" : "Slett", fg: p.lab, bg: Color.clear, border: p.line, height: 46) { del() }
            Bol24Button(title: e.status == "ok" ? "Lagre" : "Godkjenn", fg: p.bg, bg: p.ink, border: nil, height: 46) { ok() }
        }
        .padding(.top, 4)
    }

    private func del() {
        if !confirmDelete { confirmDelete = true; Haptics.shared.tick(); return }
        let hid: Int = home.id
        let eid: Int = e.id
        Task { @MainActor in
            await m.deleteEntry(hid, eid, store)
            close()
        }
    }

    private func ok() {
        let hid: Int = home.id
        let eid: Int = e.id
        if e.status == "ok" { close(); return }
        Task { @MainActor in
            await m.entry(hid, eid, ["status": "ok"], store, done: "Lagret i " + home.name)
            close()
        }
    }
}
