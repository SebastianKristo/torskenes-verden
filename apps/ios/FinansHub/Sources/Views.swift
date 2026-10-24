import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/* ---------------- Flater (prompt 42: Liquid Glass er slettet, alt tegnes på Papir) ---------------- */

extension View {
    /// Kortflaten i appen: Papir-kort (hvitt, mørkt i mørk modus) med valgfri tint. Navnet er beholdt fra før.
    @ViewBuilder func glass(_ radius: CGFloat = 24, tint: Color? = nil) -> some View {
        if let p = PaperSkin.palette { paperSurface(p, radius, tint: tint) }
        else { self.background((tint ?? Color.skinFg).opacity(0.1), in: RoundedRectangle(cornerRadius: Swift.min(radius, 22), style: .continuous)) }
    }
}

/// Bakgrunnen bak skjermene: papirfargen.
struct Backdrop: View {
    var body: some View {
        ZStack {
            if let p = PaperSkin.palette { p.bg } else { Color(hex: "#f4f1ea") }
        }
        .ignoresSafeArea()
    }
}

/* ---------------- Byggeklosser ---------------- */

struct Empty: View {
    let text: String
    var body: some View { Text(text).foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(30) }
}

struct SectionLabel: View {
    let text: String
    var body: some View {
        if let p = PaperSkin.palette {
            // I Papir: etikett i IBM Plex Mono med aksentfarge, som i designet.
            Text(text.uppercased()).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4).padding(.top, 8)
        } else {
            Text(text.uppercased()).font(.footnote.weight(.semibold)).foregroundStyle(Color.skinFg.opacity(0.6)).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 6).padding(.top, 6)
        }
    }
}

struct Initial: View {
    let text: String
    let color: String
    var size: CGFloat = 40
    var body: some View {
        Text(initial(text)).font(.system(size: size * 0.4, weight: .bold)).foregroundStyle(Color(hex: color))
            .frame(width: size, height: size).background(Color(hex: color).opacity(0.18), in: Circle())
    }
}

/// Butikklogo (favicon via serverens cache) på hvit flate; initial når domenet er ukjent.
struct Logo: View {
    @Environment(Store.self) private var store
    let domain: String?
    let name: String
    let color: String
    var size: CGFloat = 40
    /// Egen logo (abonnementer: opplastet eller funnet med ✦ AI). Brukes før faviconet.
    var logoUrl: String? = nil
    @State private var img: UIImage? = nil
    private var taskKey: String {
        let a: String = logoUrl ?? ""
        let b: String = domain ?? ""
        return a + "|" + b
    }
    var body: some View {
        content.task(id: taskKey) { await load() }
    }
    @ViewBuilder private var content: some View {
        if let img {
            logoImage(img)
        } else {
            Initial(text: name, color: color, size: size)
        }
    }
    private func logoImage(_ i: UIImage) -> some View {
        let r: CGFloat = size / 4
        let pad: CGFloat = size / 9
        return Image(uiImage: i).resizable().scaledToFit().padding(pad)
            .frame(width: size, height: size)
            .background(Color.white, in: RoundedRectangle(cornerRadius: r))
    }
    private func load() async {
        if let u = logoUrl, !u.isEmpty, let i = await store.image(u) { img = i; return }
        var d: String? = domain
        if d == nil || d?.isEmpty == true { d = await LogoRegistry20.shared.domain(forName: name, api: store.api) }
        img = await store.logo(d)
    }
}

struct AiLine: View {
    let text: String?
    var body: some View {
        if let text, !text.isEmpty { Text("✦ " + text).font(.system(size: 12)).foregroundStyle(Color.accentLight).lineLimit(1) }
    }
}

struct TxRow: View {
    let tx: Tx
    var selected = false
    var body: some View {
        HStack(spacing: 12) {
            Logo(domain: tx.domain, name: tx.description, color: tx.color)
            VStack(alignment: .leading, spacing: 2) {
                Text(tx.description).fontWeight(.medium).lineLimit(1)
                Text("\(ddmm(tx.date)) · \(tx.category)").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6)).lineLimit(1)
                AiLine(text: tx.aiShort)
            }
            Spacer(minLength: 8)
            Text(signed(tx.amount)).font(.system(.body, design: .monospaced).weight(.semibold)).foregroundStyle(tx.amount > 0 ? Color.positive : Color.skinFg)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(selected ? Color.skinFg.opacity(0.1) : .clear)
        .contentShape(Rectangle())
    }
}

struct TxList: View {
    @Environment(Store.self) private var store
    let items: [Tx]
    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { i, t in
                if i > 0 { Divider().overlay(Color.skinFg.opacity(0.12)) }
                TxRow(tx: t, selected: store.selectedTx == t.id).onTapGesture { store.selectedTx = t.id }
            }
        }
        .glass(24)
    }
}

struct Hero: View {
    @Environment(Store.self) private var store
    var body: some View {
        if let s = store.summary {
            let pct = s.budgetTotal > 0 ? min(1, s.budgetUsed / s.budgetTotal) : 0
            VStack(alignment: .leading, spacing: 12) {
                Text("Igjen å bruke i \(monthLabel(s.month).lowercased())").font(.subheadline).foregroundStyle(Color.skinFg.opacity(0.75))
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text(neg0(s.left)).font(.system(size: 42, weight: .semibold, design: .monospaced))
                    Text(" kr").font(.title3).foregroundStyle(Color.skinFg.opacity(0.65))
                }
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.skinFg.opacity(0.14))
                        Capsule().fill(Color(hex: "#FF8A4C")).frame(width: g.size.width * pct)
                    }
                }.frame(height: 10)
                HStack { Text("Brukt \(n0(s.budgetUsed)) kr"); Spacer(); Text("\(n0(max(0, s.left) / Double(max(1, s.daysLeft)))) kr/dag") }
                    .font(.footnote).foregroundStyle(Color.skinFg.opacity(0.7))
            }
            .padding(22).glass(30)
        } else {
            ProgressView().frame(maxWidth: .infinity, minHeight: 160).glass(30)
        }
    }
}

struct ReviewCTA: View {
    @Environment(Store.self) private var store
    var body: some View {
        let q = (store.summary?.review ?? []).filter { $0.status == "needs_review" }
        if !q.isEmpty {
            Button { store.openSub(.upload) } label: {
                HStack(spacing: 14) {
                    Text("\(q.count)").fontWeight(.bold).foregroundStyle(Color.ink).frame(width: 36, height: 36).background(Color.accent, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Kvitteringer til gjennomgang").fontWeight(.semibold).foregroundStyle(Color.accentLight)
                        Text(q.map { $0.merchant ?? "Ny" }.joined(separator: " · ")).font(.footnote).foregroundStyle(Color.skinFg.opacity(0.75)).lineLimit(1)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Color.skinFg.opacity(0.6))
                }
                .padding(14).glass(24)
            }
            .buttonStyle(.plain)
        }
    }
}

/* ---------------- Skjermer ---------------- */

struct HomeView: View {
    @Environment(Store.self) private var store
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading) {
                        Text("\(greetingWord()), \(store.displayName.split(separator: " ").first.map(String.init) ?? store.displayName)").font(.subheadline).foregroundStyle(Color.skinFg.opacity(0.7))
                        Text(monthLabel(store.summary?.month ?? "")).font(.system(size: 34, weight: .bold))
                    }
                    Spacer()
                    if store.hideAmounts {
                        Button { Privacy.shared.hidden.toggle() } label: { Image(systemName: Privacy.shared.hidden ? "eye" : "eye.slash").frame(width: 44, height: 44) }
                            .buttonStyle(.plain).glass(22).accessibilityLabel(Privacy.shared.hidden ? "Vis beløp" : "Skjul beløp")
                    }
                    Avatar()
                }
                .padding(.horizontal, 4).padding(.top, 6)
                Hero().onTapGesture { if store.hideAmounts { Privacy.shared.hidden.toggle() } }
                UploadPill()
                ReviewCTA()
                SectionLabel(text: "Siste")
                if let r = store.summary?.recent { TxList(items: Array(r.prefix(6))) } else { ProgressView() }
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .refreshable { try? await store.reload() }
    }
}

struct ListView: View {
    @Environment(Store.self) private var store
    var body: some View {
        @Bindable var s = store
        ScrollView {
            VStack(spacing: 12) {
                HStack(spacing: 10) {
                    Text("Transaksjoner").font(.system(size: 34, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
                    Spacer()
                    Button { store.newTx() } label: {
                        Image(systemName: "plus").font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.skinFg).frame(width: 44, height: 44).contentShape(Circle())
                    }
                    .buttonStyle(GlassPress()).glassRound().accessibilityLabel("Ny transaksjon")
                    Avatar()
                }
                .padding(.top, 6)
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").font(.system(size: 18)).foregroundStyle(Color.skinFg.opacity(0.6))
                    TextField("Søk i transaksjoner", text: $s.query).submitLabel(.search).onSubmit { store.search() }
                        .textInputAutocapitalization(.never)
                }
                .padding(.horizontal, 16).frame(height: 46).glass(23)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach([("", "Alle"), ("ut", "Utgifter"), ("inn", "Inntekter")], id: \.0) { k, n in
                            Button { store.filter = k; store.search() } label: {
                                Text(n).font(.subheadline).padding(.horizontal, 14).frame(height: 36)
                                    .foregroundStyle(store.filter == k ? Color.ink : Color.skinFg)
                            }
                            .glass(18, tint: store.filter == k ? .accent : nil)
                        }
                    }
                }
                if let txs = store.txs {
                    if txs.isEmpty { Empty(text: "Ingen treff.") }
                    let groups = Dictionary(grouping: txs, by: \.date).sorted { $0.key > $1.key }
                    ForEach(groups, id: \.key) { date, items in
                        SectionLabel(text: dayLabel(date))
                        TxList(items: items)
                    }
                } else { ProgressView().padding(30) }
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .refreshable { try? await store.loadTx() }
    }
}

struct BudgetView: View {
    @Environment(Store.self) private var store
    var body: some View {
        let rows = (store.summary?.budgets ?? []).filter { $0.budget > 0 }.sorted { $0.used / $0.budget > $1.used / $1.budget }
        ScrollView {
            VStack(spacing: 12) {
                HStack { Text("Budsjett").font(.system(size: 34, weight: .bold)); Spacer(); Avatar() }.padding(.top, 6)
                if let s = store.summary {
                    HStack(spacing: 0) {
                        stat("Budsjett", n0(s.budgetTotal)); stat("Brukt", n0(s.budgetUsed)); stat("Dager igjen", "\(s.daysLeft)")
                    }
                    .padding(.vertical, 14).glass(24)
                }
                if rows.isEmpty { Empty(text: "Ingen budsjett satt. Sett opp i FinansHub på nettet.") }
                ForEach(rows) { b in
                    let over = b.used > b.budget
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(b.category).fontWeight(.semibold)
                            Spacer()
                            Text("\(n0(b.used)) / \(n0(b.budget))").font(.system(.subheadline, design: .monospaced)).foregroundStyle(over ? Color.accentLight : Color.skinFg.opacity(0.7))
                        }
                        GeometryReader { g in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.skinFg.opacity(0.14))
                                Capsule().fill(over ? Color.accent : Color(hex: b.color)).frame(width: g.size.width * min(1, b.used / b.budget))
                            }
                        }.frame(height: 8)
                        let days = Double(max(1, store.summary?.daysLeft ?? 1))
                        HStack {
                            Text(over ? "Over med \(n0(b.used - b.budget)) kr" : "\(n0(b.budget - b.used)) kr igjen · \(n0((b.budget - b.used) / days)) kr/dag")
                                .foregroundStyle(over ? Color.accentLight : Color.skinFg.opacity(0.7))
                            Spacer()
                            Text("\(Int(b.used / b.budget * 100)) % brukt").foregroundStyle(Color.skinFg.opacity(0.6))
                        }
                        .font(.footnote)
                        let chips = budgetChips(b)
                        if !chips.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 6) { ForEach(chips, id: \.self) { Text($0).font(.caption).padding(.horizontal, 8).padding(.vertical, 4).background(Color.skinFg.opacity(0.1), in: RoundedRectangle(cornerRadius: 8)) } }
                            }
                        }
                    }
                    .padding(16).glass(22)
                    .overlay(RoundedRectangle(cornerRadius: 22).stroke(store.selectedBudget == b.categoryId ? Color.accent : .clear, lineWidth: 1.5))
                    .onTapGesture { store.selectedBudget = b.categoryId; if store.txs == nil { store.search() } }
                }
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .refreshable { try? await store.reload() }
    }
    private func stat(_ k: String, _ v: String) -> some View {
        VStack(spacing: 2) { Text(k).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6)); Text(v).font(.system(.headline, design: .monospaced)) }.frame(maxWidth: .infinity)
    }
    private func budgetChips(_ b: Budget) -> [String] {
        var c: [String] = []
        if let n = b.count, n > 0 { c.append("\(n) kjøp") }
        if let m = b.topMerchant { c.append("Mest: \(m)") }
        if let p = b.prevUsed, p > 0 { let d = Int((b.used - p) / p * 100); c.append((d > 0 ? "↑ \(d)" : "↓ \(-d)") + " % mot forrige mnd") }
        return c
    }
}

struct TxDetail: View {
    @Environment(Store.self) private var store
    var back = false
    @State private var confirm = false
    var body: some View {
        let pool = store.txPool
        if let t = pool.first(where: { $0.id == store.selectedTx }) ?? (back ? nil : pool.first) {
            let hasReceipt = t.receiptId != nil || (t.receipt != nil && t.receipt != "")
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if back { HStack { GlassBack { store.back() }; Spacer(); Avatar() } }
                    HStack(spacing: 14) {
                        Logo(domain: t.domain, name: t.description, color: t.color, size: 60)
                        VStack(alignment: .leading) { Text(t.description).font(.title2.weight(.bold)); Text(dayLabel(t.date)).foregroundStyle(Color.skinFg.opacity(0.7)) }
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 0) {
                        Text(signed(t.amount)).font(.system(size: 40, weight: .semibold, design: .monospaced)).foregroundStyle(t.amount > 0 ? Color.positive : Color.skinFg)
                        Text(" kr").font(.title3).foregroundStyle(Color.skinFg.opacity(0.6))
                    }
                    if let ai = t.aiLong ?? t.aiShort {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("✦ AI-beskrivelse").font(.footnote.weight(.semibold)).foregroundStyle(Color.accentLight)
                            Text(ai)
                        }
                        .padding(18).frame(maxWidth: .infinity, alignment: .leading).glass(24, tint: Color.accent.opacity(0.25))
                    }
                    if let lines = t.lines, !lines.isEmpty {
                        SectionLabel(text: "Varelinjer")
                        VStack(spacing: 8) {
                            ForEach(Array(lines.enumerated()), id: \.offset) { _, l in
                                HStack { Text(l.description ?? "").lineLimit(2); Spacer(); Text(n2(l.amount)).font(.system(.body, design: .monospaced)) }
                            }
                        }
                        .padding(16).glass(24)
                    }
                    SectionLabel(text: "Originaler")
                    VStack(spacing: 0) {
                        original("Original kvittering", hasReceipt ? (t.receipt == "booked" || t.receiptId != nil ? "Bilde eller PDF" : "Til gjennomgang") : "Ingen vedlagt", "doc.text.image", enabled: hasReceipt) {
                            store.openOriginal(t.id, "receipt")
                        }
                        Divider().overlay(Color.skinFg.opacity(0.12))
                        original("Banktransaksjon", "Slik den kom fra banken", "building.columns", enabled: true) { store.openOriginal(t.id, "bank") }
                    }
                    .glass(24)
                    VStack(spacing: 0) {
                        row("Dato", ddmmyyyy(t.date)); Divider().overlay(Color.skinFg.opacity(0.12))
                        row("Kategori", t.category); Divider().overlay(Color.skinFg.opacity(0.12))
                        row("Konto", t.account); Divider().overlay(Color.skinFg.opacity(0.12))
                        row("Kvittering", t.receipt == "booked" ? "Vedlagt" : t.receipt == nil ? "–" : "Til gjennomgang"); Divider().overlay(Color.skinFg.opacity(0.12))
                        row("Bolig", t.folder ?? "–")
                        if !t.note.isEmpty { Divider().overlay(Color.skinFg.opacity(0.12)); row("Notat", t.note) }
                    }
                    .glass(24)
                    Menu {
                        ForEach(store.boot?.categories ?? []) { c in Button(c.name) { store.setCategory(tx: t.id, category: c.id) } }
                    } label: {
                        Text("Endre kategori").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .glass(25)
                    HStack(spacing: 10) {
                        Button { store.editTx(t) } label: { Label("Rediger", systemImage: "pencil").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 50).contentShape(Capsule()) }
                            .buttonStyle(.plain).glass(25)
                        Button { confirm = true } label: { Label("Slett", systemImage: "trash").fontWeight(.semibold).foregroundStyle(Color.domRed).frame(maxWidth: .infinity, minHeight: 50).contentShape(Capsule()) }
                            .buttonStyle(.plain).glass(25)
                    }
                }
                .padding(20).padding(.bottom, 20)
            }
            .confirmationDialog("Slette transaksjonen?", isPresented: $confirm, titleVisibility: .visible) {
                Button("Slett", role: .destructive) { store.deleteTx(t.id) }
                Button("Avbryt", role: .cancel) {}
            } message: { Text("Den forsvinner fra liste, rapporter, budsjett og AI-søk.") }
        } else { Empty(text: "Ingen transaksjon valgt.") }
    }
    private func row(_ k: String, _ v: String) -> some View {
        HStack { Text(k).foregroundStyle(Color.skinFg.opacity(0.65)); Spacer(); Text(v).fontWeight(.medium) }.padding(.horizontal, 16).padding(.vertical, 14)
    }
    private func original(_ title: String, _ sub: String, _ icon: String, enabled: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack(spacing: 12) {
                Image(systemName: icon).foregroundStyle(Color.accentLight).frame(width: 36, height: 36).background(Color.skinFg.opacity(0.1), in: RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 2) { Text(title).fontWeight(.medium); Text(sub).font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6)) }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Color.skinFg.opacity(0.45))
            }
            .padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
        }
        .buttonStyle(.plain).disabled(!enabled).opacity(enabled ? 1 : 0.55)
    }
}

struct ScanView: View {
    @Environment(Store.self) private var store
    let scan: () -> Void
    @Binding var photos: [PhotosPickerItem]
    @Binding var pdf: Bool
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ModuleHeader(title: "Kvitteringer")
                PendingUploadsList()
                Button(action: scan) {
                    HStack(spacing: 14) {
                        Image(systemName: "camera.fill").foregroundStyle(Color.ink).frame(width: 36, height: 36).background(Color.accent, in: Circle())
                        VStack(alignment: .leading) { Text("Ta bilde av kvittering").fontWeight(.semibold); Text("Bakkamera").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.7)) }
                        Spacer()
                    }
                    .padding(14).glass(24)
                }
                .buttonStyle(.plain)
                HStack(spacing: 10) {
                    PhotosPicker(selection: $photos, maxSelectionCount: 20, matching: .images) { Label("Bilder", systemImage: "photo.on.rectangle").frame(maxWidth: .infinity, minHeight: 48) }.glass(24)
                    Button { pdf = true } label: { Label("Filer", systemImage: "doc").frame(maxWidth: .infinity, minHeight: 48) }.glass(24)
                }
                .buttonStyle(.plain)
                JobQueue()
                let q = store.receipts ?? []
                if store.receipts == nil { ProgressView().padding(30) }
                else if q.isEmpty { Empty(text: "Ingen kvitteringer i køen.") }
                else {
                    SectionLabel(text: "Til gjennomgang")
                    VStack(spacing: 0) {
                        ForEach(Array(q.enumerated()), id: \.element.id) { i, r in
                            if i > 0 { Divider().overlay(Color.skinFg.opacity(0.12)) }
                            Button { store.selectedReceipt = r.id } label: {
                                HStack(spacing: 12) {
                                    Thumb(path: r.thumb)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(r.merchant ?? "Ny kvittering").fontWeight(.medium)
                                        Text(r.status == "needs_review" ? "\(ddmm(r.date)) · \(r.provider ?? "manuell")" : "Leser …").font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6))
                                    }
                                    Spacer()
                                    if let t = r.total { Text(n2(t)).font(.system(.body, design: .monospaced)) }
                                }
                                .padding(.horizontal, 16).padding(.vertical, 12)
                                .background(store.selectedReceipt == r.id ? Color.skinFg.opacity(0.1) : .clear)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .glass(24)
                }
            }
            .padding(.horizontal, 18).padding(.bottom, 30)
        }
        .task { try? await store.loadReceipts(); await store.loadJobs() }
        .refreshable { try? await store.loadReceipts() }
    }
}

struct Thumb: View {
    @Environment(Store.self) private var store
    let path: String?
    @State private var img: UIImage? = nil
    var body: some View {
        RoundedRectangle(cornerRadius: 10).fill(Color.paper).frame(width: 40, height: 40)
            .overlay { if let img { Image(uiImage: img).resizable().scaledToFill() } }
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .task(id: path) { if let path { img = await store.image(path) } }
    }
}

struct ConfirmView: View {
    @Environment(Store.self) private var store
    let back: Bool
    @State private var merchant = ""
    @State private var total = ""
    @State private var date = Date()
    @State private var img: UIImage? = nil

    var body: some View {
        if let r = store.receipts?.first(where: { $0.id == store.selectedReceipt }) {
            let queue = (store.receipts ?? []).filter { $0.status == "needs_review" }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        if back { GlassBack { store.selectedReceipt = nil } }
                        Spacer()
                        if let i = queue.firstIndex(where: { $0.id == r.id }) { Text("\(i + 1) av \(queue.count)").foregroundStyle(Color.skinFg.opacity(0.7)) }
                    }
                    Text("Bekreft kvittering").font(.system(size: 28, weight: .bold))
                    if r.status != "needs_review" && r.status != "error" {
                        VStack(spacing: 14) { ProgressView().controlSize(.large); Text("Leser kvitteringen …").foregroundStyle(Color.skinFg.opacity(0.7)) }.frame(maxWidth: .infinity).padding(50)
                    } else {
                        paper(r)
                        let minC = Double(store.boot?.settings.minConf ?? 85) / 100
                        let high = r.error == nil && r.flag == nil && (r.confidence ?? 0) >= minC
                        HStack {
                            Text(r.provider.map { p in "Lest av \(p)" + (r.seconds.map { " · \(n2($0)) s" } ?? "") } ?? "Manuell utfylling")
                            Spacer()
                            Text("● " + (r.error != nil ? "Fyll ut" : high ? "Høy sikkerhet" : "Sjekk beløp")).foregroundStyle(high ? Color.positive : Color.accentLight).fontWeight(.semibold)
                        }
                        .font(.footnote).foregroundStyle(Color.skinFg.opacity(0.7)).padding(.horizontal, 6)
                        if let e = r.error { Text(e).font(.footnote).foregroundStyle(Color.accentLight).padding(.horizontal, 6) }
                        // Prompt 50 (claude-code-finans-kvittering-fargefeil.md): «Lav sikkerhet»-boksen i temafarger med
                        // «✦ Analyser på nytt med Gemini» som primærknapp og «Les med lokal OCR» ved siden av (Receipt50Reread.swift).
                        if PaperSkin.palette != nil && (!high || store.canReanalyze(r)) {
                            Receipt50LowBox(r: r)
                        } else if store.canReanalyze(r) {
                            ReanalyzeButton(receiptId: r.id)
                        } else if let why = r.reanalyzeReason, r.error != nil {
                            Text(why).font(.caption).foregroundStyle(Color.skinFg.opacity(0.55)).padding(.horizontal, 6)
                        }
                        VStack(spacing: 0) {
                            field("Butikk") { TextField("Butikk", text: $merchant).multilineTextAlignment(.trailing).onSubmit { store.update(r.id, "merchant", merchant) } }
                            Divider().overlay(Color.skinFg.opacity(0.12))
                            field("Dato") { DatePicker("", selection: $date, displayedComponents: .date).labelsHidden().onChange(of: date) { _, d in store.update(r.id, "date", iso(d)) } }
                            Divider().overlay(Color.skinFg.opacity(0.12))
                            field("Total") {
                                TextField("0,00", text: $total).keyboardType(.decimalPad).multilineTextAlignment(.trailing).font(.system(.body, design: .monospaced)).foregroundStyle(Color.accentLight)
                                    .onSubmit { saveTotal(r) }
                            }
                            Divider().overlay(Color.skinFg.opacity(0.12))
                            field("Konto") {
                                Menu((store.boot?.accounts.first { $0.id == r.accountId })?.name ?? "Velg") {
                                    ForEach(store.boot?.accounts ?? []) { a in Button(a.name) { store.update(r.id, "accountId", a.id) } }
                                }
                            }
                        }
                        .glass(24)
                        FlowChips(cats: (store.boot?.categories ?? []).filter { $0.kind == "expense" }, selected: r.categoryId) { store.update(r.id, "categoryId", $0) }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.match != nil ? "Matchet mot kortkjøp" : "Ingen bankmatch").fontWeight(.semibold).foregroundStyle(r.match != nil ? Color.positive : Color.skinFg)
                            Text(r.match.map { "\(ddmm($0.date)) · \(signed($0.amount)) kr · \($0.account)" } ?? "Bokføres som ny transaksjon").foregroundStyle(Color.skinFg.opacity(0.75))
                        }
                        .font(.subheadline).padding(.horizontal, 16).padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
                        .background((r.match != nil ? Color.positive : Color.skinFg).opacity(0.12), in: RoundedRectangle(cornerRadius: 20))
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke((r.match != nil ? Color.positive : Color.skinFg).opacity(0.3)))
                        HStack(spacing: 10) {
                            Button { store.reject(r.id) } label: { Text("Avvis").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 52) }.glass(26)
                            Button { saveTotal(r); store.book(r.id) } label: { Text("Bokfør").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 52) }
                                .glass(26, tint: .accent).frame(maxWidth: .infinity).layoutPriority(1)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 18).padding(.bottom, 30)
            }
            .task(id: r.id) {
                merchant = r.merchant ?? ""
                total = r.total.map { n2($0).replacingOccurrences(of: " ", with: "") } ?? ""
                date = r.date.flatMap(parseIso) ?? Date()
                img = nil
                if let f = r.file, r.mime?.hasPrefix("image/") == true { img = await store.image(f) }
            }
        } else { Empty(text: "Velg en kvittering.") }
    }

    private func saveTotal(_ r: Receipt) {
        let v = Double(total.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: "."))
        if v != r.total { store.update(r.id, "total", v) }
        if merchant != (r.merchant ?? "") { store.update(r.id, "merchant", merchant) }
    }

    @ViewBuilder private func paper(_ r: Receipt) -> some View {
        if let img {
            Image(uiImage: img).resizable().scaledToFit().frame(maxHeight: 380).clipShape(RoundedRectangle(cornerRadius: 22))
        } else {
            VStack(spacing: 6) {
                Text((r.merchant ?? "").uppercased()).fontWeight(.bold)
                ForEach(Array((r.extraction?.lines ?? []).enumerated()), id: \.offset) { _, l in
                    HStack { Text(l.description ?? ""); Spacer(); Text(n2(l.amount)) }
                }
                Divider()
                HStack { Text("TOTAL").fontWeight(.bold); Spacer(); Text(r.total.map(n2) ?? "–").fontWeight(.bold) }
            }
            .font(.system(size: 12.5, design: .monospaced)).foregroundStyle(Color(hex: "#3A362E"))
            .padding(18).background(Color.paper, in: RoundedRectangle(cornerRadius: 18))
        }
    }

    private func field<C: View>(_ label: String, @ViewBuilder _ content: () -> C) -> some View {
        HStack { Text(label).foregroundStyle(Color.skinFg.opacity(0.65)); Spacer(); content() }.padding(.horizontal, 16).padding(.vertical, 10).frame(minHeight: 48)
    }
}

private func iso(_ d: Date) -> String { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.string(from: d) }
private func parseIso(_ s: String) -> Date? { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.date(from: s) }

/// Kategorivalg som brytes over flere linjer.
struct FlowChips: View {
    let cats: [Category]
    let selected: Int?
    let pick: (Int) -> Void
    var body: some View {
        Flow(spacing: 8) {
            ForEach(cats) { c in
                Button { pick(c.id) } label: {
                    Text(c.name).font(.subheadline).padding(.horizontal, 14).frame(height: 36).foregroundStyle(selected == c.id ? Color.ink : Color.skinFg)
                }
                .buttonStyle(.plain)
                .glass(18, tint: selected == c.id ? .accent : nil)
            }
        }
    }
}

struct Flow: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > w, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            x += s.width + spacing; rowH = max(rowH, s.height)
        }
        return CGSize(width: w == .infinity ? x : w, height: y + rowH)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing; rowH = max(rowH, s.height)
        }
    }
}

/* ---------------- Mobil v2 ---------------- */

/// Pille på forsiden som viser fremdrift i opplastingskøen.
struct UploadPill: View {
    @Environment(Store.self) private var store
    var body: some View {
        let active = store.jobs.filter { $0.status == "pending" || $0.status == "processing" }
        let ready = store.jobs.filter { $0.status == "needs_review" }.count
        if !active.isEmpty || store.uploading > 0 || ready > 0 {
            Button { store.openSub(.upload) } label: {
                HStack(spacing: 12) {
                    if !active.isEmpty || store.uploading > 0 { ProgressView() } else { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.positive) }
                    Text(label(active, ready)).fontWeight(.medium)
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Color.skinFg.opacity(0.6))
                }
                .padding(.horizontal, 16).padding(.vertical, 12).glass(24)
            }
            .buttonStyle(.plain)
        }
    }
    private func label(_ active: [Job], _ ready: Int) -> String {
        if store.uploading > 0 { return "Laster opp \(store.uploading) fil" + (store.uploading > 1 ? "er" : "") + " …" }
        if !active.isEmpty {
            let pct = active.map { $0.progress ?? 0 }.reduce(0, +) / max(1, active.count)
            return "Gemini leser \(active.count) · \(pct) %"
        }
        return "\(ready) klar · trykk for å bekrefte"
    }
}

struct JobQueue: View {
    @Environment(Store.self) private var store
    var body: some View {
        let jobs = store.jobs.filter { $0.status != "booked" }
        if !jobs.isEmpty || store.uploading > 0 {
            SectionLabel(text: "Kø")
            VStack(spacing: 0) {
                if store.uploading > 0 { row("Laster opp \(store.uploading) fil" + (store.uploading > 1 ? "er" : ""), "Sender til serveren …", nil) }
                // Prompt 21: skillelinjer bare mellom radene, aldri over den første (samme som «Til gjennomgang»).
                ForEach(Array(jobs.enumerated()), id: \.element.id) { i, j in
                    if i > 0 || store.uploading > 0 { Divider().overlay(Color.skinFg.opacity(0.12)) }
                    HStack(spacing: 0) {
                        jobButton(j)
                        if showReanalyze(j) { ReanalyzeButton(receiptId: j.id, compact: true).padding(.trailing, 12) }
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .glass(24)
        }
    }

    /// Feilet eller usikker lesing: «✦ Analyser på nytt» rett i køen.
    private func showReanalyze(_ j: Job) -> Bool {
        if let r = store.receipts?.first(where: { $0.id == j.id }) { return store.canReanalyze(r) }
        return j.canReanalyze ?? (j.status == "error")
    }

    private func jobButton(_ j: Job) -> some View {
        Button { store.selectedReceipt = j.id } label: {
            switch j.status {
            case "pending": row(j.name ?? "Fil", "I kø", nil)
            case "processing": row(j.name ?? "Fil", "Gemini leser … \(j.progress ?? 0) %", Double(j.progress ?? 0) / 100)
            case "needs_review": row(j.merchant ?? j.name ?? "Kvittering", "Klar · trykk for å bekrefte", nil, ready: true)
            case "error": row(j.name ?? "Fil", "Feilet – fyll ut manuelt", nil)
            default: row(j.name ?? "Fil", j.status, nil)
            }
        }
        .buttonStyle(.plain)
    }

    private func row(_ t: String, _ sub: String, _ p: Double?, ready: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(t).fontWeight(.medium).lineLimit(1)
            Text(sub).font(.footnote).foregroundStyle(ready ? Color.positive : Color.skinFg.opacity(0.6))
            if let p { ProgressView(value: p).tint(Color.accent) }
        }
        .padding(.horizontal, 16).padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
    }
}

/* ---------------- Matplan ---------------- */

private let sourceLabel = ["gemini": "Gemini", "hellofresh": "HelloFresh", "fixed": "Fast", "own": "Egen"]

/// «Se hele uka og alle retter»: alle dagene med kokk, Fast og ✦, og handlelisten.
struct MatWeekView: View {
    @Environment(Store.self) private var store
    var body: some View {
        let today = isoToday()
        ScrollView {
            VStack(spacing: 12) {
                HStack {
                    Text("Hele uka").font(.system(size: 28, weight: .bold))
                    Spacer()
                    Button { store.matFull = false } label: { Text("Ferdig").fontWeight(.semibold).foregroundStyle(Color.accentLight).frame(height: 44) }.buttonStyle(.plain)
                }
                .padding(.top, 16)
                if let e = store.moduleError { Empty(text: e) }
                Button { store.planWeek() } label: { Text("✦ Ny ukeplan med Gemini").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 52) }
                    .buttonStyle(.plain).glass(26, tint: .accent)
                if let w = store.week {
                    Text("Estimert ukekost \(n0(w.weekCost ?? 0)) kr" + ((w.auto ?? false) ? " · automatisk hver søndag" : ""))
                        .font(.footnote).foregroundStyle(Color.skinFg.opacity(0.6)).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 6)
                    ForEach(w.days) { d in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(d.weekday ?? ddmm(d.date)).font(.subheadline.weight(.semibold)).foregroundStyle(Color.skinFg.opacity(0.7))
                                Spacer()
                                if let src = d.source { Text(sourceLabel[src] ?? src).font(.caption.weight(.semibold)).padding(.horizontal, 8).padding(.vertical, 3).background(Color.skinFg.opacity(0.12), in: RoundedRectangle(cornerRadius: 8)) }
                            }
                            Text(d.name ?? "Ingen rett ennå").font(.title3.weight(.semibold)).foregroundStyle(d.name == nil ? Color.skinFg.opacity(0.5) : Color.skinFg)
                            HStack(spacing: 10) {
                                Menu {
                                    ForEach(w.cooks ?? [], id: \.self) { c in Button(c) { store.setCook(d.date, c) } }
                                } label: { Label(d.cook ?? "Velg kokk", systemImage: "person").font(.subheadline) }
                                if let c = d.cost { Text("\(n0(c)) kr").font(.system(.subheadline, design: .monospaced)).foregroundStyle(Color.skinFg.opacity(0.7)) }
                                Spacer()
                                Button { store.toggleFixed(d) } label: {
                                    Text("Fast").font(.subheadline.weight(.semibold)).padding(.horizontal, 12).frame(height: 32)
                                        .foregroundStyle((d.fixed ?? false) ? Color.positive : Color.skinFg)
                                        .background(((d.fixed ?? false) ? Color.positive : Color.skinFg).opacity(0.14), in: Capsule())
                                }
                                Button { store.planDay(d.date) } label: { Text("✦").frame(width: 32, height: 32).background(Color.skinFg.opacity(0.14), in: Circle()) }
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(16).glass(22)
                        .overlay(RoundedRectangle(cornerRadius: 22).stroke(d.date == today ? Color.accent : .clear, lineWidth: 1.5))
                    }
                    let dishes = w.dishes ?? []
                    if !dishes.isEmpty {
                        SectionLabel(text: "Alle retter (\(dishes.count))")
                        VStack(spacing: 0) {
                            ForEach(Array(dishes.enumerated()), id: \.element.id) { i, d in
                                if i > 0 { Divider().overlay(Color.skinFg.opacity(0.12)) }
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(d.name).fontWeight(.semibold).lineLimit(1)
                                        Text("\((d.ing ?? []).count) ingredienser" + (d.src == "hellofresh" ? " · HelloFresh" : "")).font(.caption).foregroundStyle(Color.skinFg.opacity(0.6))
                                    }
                                    Spacer()
                                }
                                .padding(.horizontal, 16).padding(.vertical, 11)
                            }
                        }
                        .glass(22)
                    }
                    if !(w.shopping ?? []).isEmpty { SectionLabel(text: "Handleliste"); ShoppingList() }
                } else if store.moduleError == nil { ProgressView().padding(30) }
            }
            .padding(.horizontal, 18).padding(.bottom, 30)
        }
        .background(Backdrop())
        .skinScheme()
        .refreshable { try? await store.loadWeek() }
    }
}

struct ShoppingList: View {
    @Environment(Store.self) private var store
    var body: some View {
        let items = store.week?.shopping ?? []
        if items.isEmpty { Empty(text: "Handlelisten er tom.") } else {
            VStack(spacing: 0) {
                ForEach(items) { it in
                    Button { store.toggleShop(it.id) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: it.done ? "checkmark.circle.fill" : "circle").foregroundStyle(it.done ? Color.accent : Color.skinFg.opacity(0.6))
                            Text(it.text).strikethrough(it.done).foregroundStyle(it.done ? Color.skinFg.opacity(0.5) : Color.skinFg)
                            Spacer()
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .glass(24)
        }
    }
}

private func isoToday() -> String { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.string(from: Date()) }
