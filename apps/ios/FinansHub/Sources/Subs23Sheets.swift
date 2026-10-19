import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/* ---------------- Prompt 23: «Endre abonnement» og «Legg til abonnement» i Papir-farger ---------------- */

/// Chip i arket: valgt er fylt `on` med lys tekst (`onFg`), ellers gjennomsiktig med kant.
struct SubChip23: View {
    @Environment(\.paper) private var p
    let title: String
    let on: Bool
    let act: () -> Void

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        return Button(action: act) {
            Text(title).font(PF.ui(13, .semibold)).foregroundStyle(on ? t.onFg : t.fg).lineLimit(1).minimumScaleFactor(0.8)
                .padding(.horizontal, 10)
                .frame(maxWidth: .infinity, minHeight: 38)
                .background(on ? t.on : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? t.on : t.bd, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Felt med etikett over (12,5 mut) og kortfarget boks med kant.
struct SubField23: View {
    @Environment(\.paper) private var p
    let label: String
    let placeholder: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default
    var mono: Bool = false

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        return VStack(alignment: .leading, spacing: 6) {
            Text(label).font(PF.ui(12.5)).foregroundStyle(t.mut)
            TextField("", text: $text, prompt: Text(placeholder).foregroundColor(t.mut))
                .keyboardType(keyboard)
                .font(mono ? PF.mono(15, bold: false) : PF.ui(15))
                .foregroundStyle(t.fg)
                .padding(.horizontal, 12).frame(height: 44)
                .background(t.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(t.bd, lineWidth: 1))
        }
    }
}

/// Meny i samme stil som feltene (kategori, dag og måned).
struct SubMenuBox23: View {
    @Environment(\.paper) private var p
    let text: String
    var dim: Bool = false

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        return HStack {
            Text(text).font(PF.ui(15)).foregroundStyle(dim ? t.mut : t.fg).lineLimit(1)
            Spacer(minLength: 4)
            Text("▾").font(PF.ui(12)).foregroundStyle(t.mut)
        }
        .padding(.horizontal, 12).frame(height: 44)
        .background(t.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(t.bd, lineWidth: 1))
        .contentShape(Rectangle())
    }
}

/// «Rediger …» / «Nytt abonnement»: logo, navn, pris, plan, kategori, hvor ofte, faktureringsdato, status, Lagre og Slett.
struct SubEdit23Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    let item: SubItem?
    /// Prompt 27: ferdig utfylt nytt abonnement («Rediger først» fra skjermbilde, SubsShot27.swift). Lagres som nytt.
    var prefill27: SubItem? = nil
    @State private var name: String = ""
    @State private var price: String = ""
    @State private var plan: String = ""
    @State private var category: String = "Annet"
    @State private var cycle: String = "monthly"
    @State private var day: Int = 1
    @State private var month: Int = 1
    @State private var status: String = "active"
    @State private var logo: PhotosPickerItem? = nil
    @State private var logoImg: UIImage? = nil
    @State private var confirmDelete: Bool = false

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        return ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Capsule().fill(t.bd).frame(width: 40, height: 5).frame(maxWidth: .infinity)
                titleRow(t)
                logoRow(t)
                HStack(alignment: .top, spacing: 10) {
                    SubField23(label: "Navn", placeholder: "F.eks. HBO Max", text: $name).frame(maxWidth: .infinity).layoutPriority(2)
                    SubField23(label: "Pris (kr)", placeholder: "149", text: $price, keyboard: .decimalPad, mono: true).frame(width: 110)
                }
                HStack(alignment: .top, spacing: 10) {
                    SubField23(label: "Plan", placeholder: "Standard", text: $plan).frame(maxWidth: .infinity)
                    categoryBox(t).frame(maxWidth: .infinity)
                }
                cycleBox(t)
                dateBox(t)
                statusBox(t)
                buttons(t)
            }
            .padding(.horizontal, 20).padding(.top, 18).padding(.bottom, 26)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(t.bg.ignoresSafeArea())
        .environment(\.colorScheme, t.dark ? .dark : .light)
        .onAppear(perform: fill)
        .onChange(of: logo) { _, it in
            guard let it else { return }
            Task {
                if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) {
                    logoImg = img
                    if let s = item { store.uploadSubLogo(s.id, img) }
                }
                logo = nil
            }
        }
        .confirmationDialog("Slette \(name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Slett", role: .destructive) {
                if let s = item { store.deleteSub(s.id) }
                dismiss()
            }
            Button("Avbryt", role: .cancel) {}
        }
    }

    private func titleRow(_ t: SubTok23) -> some View {
        HStack(spacing: 10) {
            Text(item.map { "Rediger \($0.name)" } ?? "Nytt abonnement").font(PF.ui(20, .semibold)).foregroundStyle(t.fg).lineLimit(1)
            Spacer(minLength: 6)
            SheetButton30(kind: .secondary, title: "Lukk", ink: t.fg, paper: t.bg, dark: t.dark) { dismiss() }
        }
    }

    private func logoRow(_ t: SubTok23) -> some View {
        HStack(spacing: 14) {
            logoView
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            VStack(alignment: .leading, spacing: 8) {
                Text("Logo").font(PF.ui(13)).foregroundStyle(t.mut)
                HStack(spacing: 6) {
                    PhotosPicker(selection: $logo, matching: .images) {
                        pill("↑ Last opp", t.fg, t)
                    }
                    .buttonStyle(.plain)
                    .disabled(item == nil)
                    Button { if let s = item { store.findSubLogo(s.id) } } label: {
                        pill("✦ Finn logo med AI", t.neg, t)
                    }
                    .buttonStyle(.plain)
                    .disabled(item == nil)
                    if item?.logoUrl != nil || logoImg != nil {
                        Button { clearLogo() } label: {
                            Text("Fjern").font(PF.ui(13)).foregroundStyle(t.mut).padding(.horizontal, 12).frame(height: 34)
                                .overlay(Capsule().stroke(t.bd, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
                if item == nil {
                    Text("Logo kan legges til etter lagring").font(PF.ui(11.5)).foregroundStyle(t.mut)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(t.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @ViewBuilder private var logoView: some View {
        if let logoImg {
            Image(uiImage: logoImg).resizable().scaledToFill()
        } else {
            Logo(domain: item?.domain, name: name.isEmpty ? "?" : name, color: SubCalc23.catHex(category), size: 64, logoUrl: item?.logoUrl)
        }
    }

    private func pill(_ title: String, _ fg: Color, _ t: SubTok23) -> some View {
        Text(title).font(PF.ui(13, .semibold)).foregroundStyle(fg).lineLimit(1)
            .padding(.horizontal, 12).frame(height: 34)
            .background(t.card, in: Capsule())
            .overlay(Capsule().stroke(t.bd, lineWidth: 1))
            .opacity(item == nil ? 0.4 : 1)
    }

    private func categoryBox(_ t: SubTok23) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Kategori").font(PF.ui(12.5)).foregroundStyle(t.mut)
            Menu {
                ForEach(cats, id: \.self) { c in
                    Button { category = c } label: { Text(c + (c == category ? " ✓" : "")) }
                }
            } label: {
                SubMenuBox23(text: category)
            }
        }
    }

    private func cycleBox(_ t: SubTok23) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Hvor ofte").font(PF.ui(12.5)).foregroundStyle(t.mut)
            HStack(spacing: 6) {
                SubChip23(title: "Månedlig", on: cycle == "monthly") { Haptics.shared.select(); cycle = "monthly" }
                SubChip23(title: "Årlig", on: cycle == "yearly") { Haptics.shared.select(); cycle = "yearly" }
                SubChip23(title: "Hvert 2. år", on: cycle == "biennial") { Haptics.shared.select(); cycle = "biennial" }
            }
        }
    }

    private func dateBox(_ t: SubTok23) -> some View {
        let monthly: Bool = cycle == "monthly"
        return VStack(alignment: .leading, spacing: 6) {
            Text("Faktureringsdato").font(PF.ui(12.5)).foregroundStyle(t.mut)
            HStack(spacing: 8) {
                Menu {
                    ForEach(1...31, id: \.self) { d in
                        Button { day = d } label: { Text("\(d).") }
                    }
                } label: {
                    SubMenuBox23(text: "\(day).")
                }
                .frame(width: 96)
                Menu {
                    ForEach(1...12, id: \.self) { m in
                        Button { month = m } label: { Text(SubCalc23.months[m - 1].capitalized) }
                    }
                } label: {
                    SubMenuBox23(text: monthly ? "hver måned" : SubCalc23.months[month - 1].capitalized, dim: monthly)
                }
                .disabled(monthly)
            }
            Text(nextText).font(PF.ui(12.5)).foregroundStyle(t.neg)
        }
    }

    private func statusBox(_ t: SubTok23) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Status").font(PF.ui(12.5)).foregroundStyle(t.mut)
            HStack(spacing: 6) {
                SubChip23(title: "Aktiv", on: status == "active") { Haptics.shared.select(); status = "active" }
                SubChip23(title: "Lite brukt", on: status == "low_use") { Haptics.shared.select(); status = "low_use" }
                SubChip23(title: "Sagt opp", on: status == "cancelled") { Haptics.shared.select(); status = "cancelled" }
            }
        }
    }

    private func buttons(_ t: SubTok23) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Button { save() } label: {
                    Text("Lagre").font(PF.ui(15.5, .semibold)).foregroundStyle(t.onFg)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(t.on, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(!valid)
                .opacity(valid ? 1 : 0.4)
                if item != nil {
                    Button { confirmDelete = true } label: {
                        Text("Slett").font(PF.ui(15, .semibold)).foregroundStyle(t.neg)
                            .padding(.horizontal, 18).frame(minHeight: 48)
                            .overlay(Capsule().stroke(t.bd, lineWidth: 1))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 4)
            if !valid {
                Text(name.trimmingCharacters(in: .whitespaces).isEmpty ? "Skriv inn navnet på tjenesten." : "Skriv inn prisen i kroner, f.eks. 149.")
                    .font(PF.ui(12.5)).foregroundStyle(t.mut)
            }
        }
    }

    private var cats: [String] {
        var c: [String] = store.subsX?.categories ?? []
        if c.isEmpty { c = SubCalc23.fallbackCats }
        if !c.contains(category) { c.append(category) }
        return c
    }

    private var amount: Double? {
        Double(price.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "\u{00a0}", with: "").replacingOccurrences(of: ",", with: "."))
    }

    private var valid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && (amount ?? -1) >= 0 }

    /// «Neste trekk 21. oktober, deretter hvert år».
    private var nextText: String {
        let cal: Calendar = Calendar.current
        let now: Date = Date()
        var c: DateComponents = cal.dateComponents([.year, .month], from: now)
        if cycle != "monthly" { c.month = month }
        c.day = day
        var d: Date = cal.date(from: c) ?? now
        var guardN: Int = 0
        while cal.startOfDay(for: d) < cal.startOfDay(for: now) && guardN < 30 {
            let comp: Calendar.Component = cycle == "monthly" ? .month : .year
            d = cal.date(byAdding: comp, value: cycle == "biennial" ? 2 : 1, to: d) ?? now
            guardN += 1
        }
        let m: String = SubCalc23.months[cal.component(.month, from: d) - 1]
        let then: String = cycle == "yearly" ? "deretter hvert år" : cycle == "biennial" ? "deretter hvert 2. år" : "deretter hver måned"
        return "Neste trekk \(cal.component(.day, from: d)). \(m), \(then)"
    }

    private func fill() {
        guard let s = item ?? prefill27 else {
            month = Calendar.current.component(.month, from: Date())
            day = Calendar.current.component(.day, from: Date())
            category = SubCalc23.fallbackCats[0]
            return
        }
        name = s.name
        price = s.price == s.price.rounded() ? String(Int(s.price)) : String(s.price).replacingOccurrences(of: ".", with: ",")
        plan = s.plan
        category = s.category.isEmpty ? "Annet" : s.category
        cycle = s.cycle
        day = Swift.min(31, Swift.max(1, s.billDay ?? 1))
        month = Swift.min(12, Swift.max(1, s.billMonth ?? Calendar.current.component(.month, from: Date())))
        if !s.active || s.status == "cancelled" || s.status == "paused" { status = "cancelled" } else if s.status == "low_use" { status = "low_use" } else { status = "active" }
    }

    private func clearLogo() {
        logoImg = nil
        guard let s = item else { return }
        store.saveSub(s.id, ["logoUrl": NSNull()])
    }

    private func save() {
        guard let a = amount, valid else { return }
        var body: [String: Any] = ["name": name.trimmingCharacters(in: .whitespaces), "plan": plan, "price": a, "cycle": cycle, "category": category,
                                   "billDay": day, "chargeDay": day, "status": status, "active": status != "cancelled", "lowUse": status == "low_use"]
        if cycle == "monthly" { body["billMonth"] = NSNull() } else { body["billMonth"] = month }
        Haptics.shared.success()
        store.saveSub(item?.id, body)
        dismiss()
    }
}

/// «Legg til abonnement»: Manuelt · Kvittering · Transaksjon (tre fliser), så skjemaet eller kandidatene.
struct SubAdd23Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var mode: String? = nil
    @State private var photo: PhotosPickerItem? = nil
    @State private var files: Bool = false

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        return ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Capsule().fill(t.bd).frame(width: 40, height: 5).frame(maxWidth: .infinity)
                HStack {
                    Text("Legg til abonnement").font(PF.ui(17, .semibold)).foregroundStyle(t.fg)
                    Spacer()
                    SheetButton30(kind: .secondary, title: "Lukk", ink: t.fg, paper: t.bg, dark: t.dark) { dismiss() }
                }
                // Prompt 27: «Fra skjermbilde» først (SubsShot27.swift).
                HStack(spacing: 8) {
                    tile("▣", "Skjermbilde", "sk", t) { mode = "sk" }
                    tile("✎", "Manuelt", "man", t) { manual() }
                    tile("⎙", "Kvittering", "rc", t) { mode = "rc" }
                    tile("⇄", "Transaksjon", "tx", t) { mode = "tx"; store.loadSubCandidates() }
                }
                if mode == "sk" { SubShot27Panel(t: t, done: { dismiss() }) }
                if mode == "rc" { receipt(t) }
                if mode == "tx" { candidates(t) }
            }
            .padding(16)
        }
        .background(t.bg.ignoresSafeArea())
        .environment(\.colorScheme, t.dark ? .dark : .light)
        .fileImporter(isPresented: $files, allowedContentTypes: [.pdf, .jpeg, .png, .heic, .image]) { r in
            guard case .success(let url) = r, url.startAccessingSecurityScopedResource() else { return }
            defer { url.stopAccessingSecurityScopedResource() }
            guard let d = try? Data(contentsOf: url) else { return }
            if url.pathExtension.lowercased() == "pdf" { send(d, "application/pdf", "kvittering.pdf") }
            else if let img = UIImage(data: d), let j = img.scaled(max: 2400).jpegData(compressionQuality: 0.85) { send(j, "image/jpeg", "kvittering.jpg") }
        }
        .onChange(of: photo) { _, it in
            guard let it else { return }
            Task {
                if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d), let j = img.scaled(max: 2400).jpegData(compressionQuality: 0.85) {
                    send(j, "image/jpeg", "kvittering.jpg")
                }
                photo = nil
            }
        }
    }

    private func tile(_ ic: String, _ title: String, _ key: String, _ t: SubTok23, _ act: @escaping () -> Void) -> some View {
        Button { Haptics.shared.select(); act() } label: {
            VStack(alignment: .leading, spacing: 8) {
                Text(ic).font(.system(size: 18)).foregroundStyle(SubTok23.peach)
                Text(title).font(PF.ui(13.5, .semibold)).foregroundStyle(t.fg).lineLimit(1).minimumScaleFactor(0.65)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(t.card2, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(mode == key ? SubTok23.orange : Color.clear, lineWidth: 2))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func manual() {
        dismiss()
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(450))
            store.subNew = true
        }
    }

    private func receipt(_ t: SubTok23) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("✦ AI leser bilde, PDF eller e-post og lager abonnementet.").font(PF.ui(13)).foregroundStyle(t.mut)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                PhotosPicker(selection: $photo, matching: .images) {
                    Text("Velg bilde").font(PF.ui(14, .semibold)).foregroundStyle(t.onFg)
                        .frame(maxWidth: .infinity, minHeight: 46).background(t.on, in: Capsule())
                }
                .buttonStyle(.plain)
                Button { files = true } label: {
                    Text("Velg fil").font(PF.ui(14, .semibold)).foregroundStyle(t.fg)
                        .frame(maxWidth: .infinity, minHeight: 46).overlay(Capsule().stroke(t.bd, lineWidth: 1)).contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(t.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    @ViewBuilder private func candidates(_ t: SubTok23) -> some View {
        if let list = store.subCandidates {
            VStack(spacing: 0) {
                if list.isEmpty {
                    Text("Fant ingen nye faste trekk. Alt ser ut til å være registrert.").font(PF.ui(13.5)).foregroundStyle(t.mut)
                        .padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
                }
                ForEach(Array(list.enumerated()), id: \.element.id) { i, c in
                    if i > 0 { Rectangle().fill(t.bd).frame(height: 1) }
                    candRow(c, t)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 4)
            .background(t.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(24)
        }
    }

    private func candRow(_ c: SubCandidate, _ t: SubTok23) -> some View {
        let sub: String = "\(c.cycle == "yearly" ? "Årlig" : "Månedlig") · \(SubCalc23.kr(c.amount)) · sett \(c.count) ganger"
        return HStack(spacing: 12) {
            SubLogo23(name: c.merchant, domain: c.domain, logoUrl: nil, category: "Annet", size: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(c.merchant).font(PF.ui(14.5, .medium)).foregroundStyle(t.fg).lineLimit(1)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(t.mut).lineLimit(1)
            }
            Spacer(minLength: 6)
            Button { Haptics.shared.tap(); store.addSubCandidate(c) } label: {
                Text("+ Legg til").font(PF.ui(13, .semibold)).foregroundStyle(SubTok23.ink0)
                    .padding(.horizontal, 12).frame(height: 32).background(SubTok23.orange, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 10)
    }

    private func send(_ d: Data, _ mime: String, _ name: String) {
        store.uploadSubReceipt(d, mime: mime, name: name)
        dismiss()
    }
}
