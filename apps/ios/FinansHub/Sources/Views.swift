import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/* ---------------- Liquid Glass ---------------- */

extension View {
    /// iOS 26 Liquid Glass når tilgjengelig, ellers uskarpt materiale med lys kant (samme uttrykk som designet 1a).
    @ViewBuilder func glass(_ radius: CGFloat = 24, tint: Color? = nil) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            self.glassEffect(tint.map { Glass.regular.tint($0) } ?? .regular, in: .rect(cornerRadius: radius))
        } else {
            fallbackGlass(radius, tint: tint)
        }
        #else
        fallbackGlass(radius, tint: tint)
        #endif
    }

    func fallbackGlass(_ radius: CGFloat, tint: Color?) -> some View {
        self.background((tint ?? .white).opacity(tint == nil ? 0.08 : 0.55), in: RoundedRectangle(cornerRadius: radius))
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).stroke(.white.opacity(0.2), lineWidth: 1))
    }
}

/// Bakgrunn med fargeflekker bak glasset.
struct Backdrop: View {
    var body: some View {
        ZStack {
            Color(hex: "#07070A")
            Circle().fill(Color.accent).frame(width: 300).blur(radius: 90).opacity(0.55).offset(x: -140, y: -220)
            Circle().fill(Color(hex: "#4D6BFF")).frame(width: 260).blur(radius: 90).opacity(0.45).offset(x: 150, y: 80)
            Circle().fill(Color(hex: "#C24E17")).frame(width: 220).blur(radius: 80).opacity(0.4).offset(x: -40, y: 360)
        }
        .ignoresSafeArea()
    }
}

/* ---------------- Rot ---------------- */

struct RootView: View {
    @Environment(Store.self) private var store
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var showCamera = false
    @State private var photoItem: PhotosPickerItem?
    @State private var showPdf = false

    var body: some View {
        ZStack {
            Backdrop()
            if !store.loggedIn {
                LoginView()
            } else if hSize == .regular {
                // iPad: sidefelt + liste + detalj.
                HStack(spacing: 0) {
                    Sidebar(scan: { showCamera = true })
                    MainPane(scan: { showCamera = true }, photo: $photoItem, pdf: $showPdf).frame(maxWidth: .infinity)
                    Divider().overlay(.white.opacity(0.1))
                    DetailPane().frame(maxWidth: .infinity)
                }
            } else {
                MainPane(scan: { showCamera = true }, photo: $photoItem, pdf: $showPdf)
                    .safeAreaInset(edge: .bottom) { TabBar(scan: { showCamera = true }) }
            }
            if store.busy { ProgressView().controlSize(.large).padding(30).glass(20) }
            if let msg = store.message {
                VStack { Spacer(); Text(msg).font(.subheadline.weight(.semibold)).padding(.horizontal, 18).padding(.vertical, 12).glass(16).padding(.bottom, 110) }
                    .transition(.opacity).onTapGesture { store.message = nil }
            }
        }
        .preferredColorScheme(.dark)
        .tint(.accent)
        .fullScreenCover(isPresented: $showCamera) { CameraView { img in if let img { store.upload(image: img) } }.ignoresSafeArea() }
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task {
                if let d = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: d) { store.upload(image: img) }
                photoItem = nil
            }
        }
        .fileImporter(isPresented: $showPdf, allowedContentTypes: [.pdf, .image]) { result in
            guard case .success(let url) = result, url.startAccessingSecurityScopedResource() else { return }
            defer { url.stopAccessingSecurityScopedResource() }
            guard let d = try? Data(contentsOf: url) else { return }
            if url.pathExtension.lowercased() == "pdf" { store.upload(pdf: d) } else if let img = UIImage(data: d) { store.upload(image: img) }
        }
    }
}

/// Flytende fanelinje i glass med egen skanneknapp.
struct TabBar: View {
    @Environment(Store.self) private var store
    let scan: () -> Void
    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 0) {
                ForEach([Tab.home, .list, .budget, .me]) { t in
                    Button { store.go(t) } label: {
                        VStack(spacing: 2) { Image(systemName: t.icon).font(.system(size: 20)); Text(t.rawValue).font(.system(size: 10.5, weight: .semibold)) }
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .foregroundStyle(store.tab == t ? Color.accentLight : .white.opacity(0.85))
                            .background(store.tab == t ? Color.white.opacity(0.16) : .clear, in: Capsule())
                    }
                }
            }
            .padding(5).frame(height: 64).glass(32)
            Button(action: scan) { Image(systemName: "doc.viewfinder").font(.system(size: 24, weight: .semibold)).foregroundStyle(.white).frame(width: 64, height: 64) }
                .glass(32, tint: .accent)
                .accessibilityLabel("Skann kvittering")
        }
        .padding(.horizontal, 16).padding(.bottom, 6)
    }
}

struct Sidebar: View {
    @Environment(Store.self) private var store
    let scan: () -> Void
    var body: some View {
        VStack(spacing: 18) {
            Button(action: scan) { Image(systemName: "doc.viewfinder").font(.title2).foregroundStyle(.white).frame(width: 56, height: 56) }.glass(28, tint: .accent)
            ForEach(Tab.allCases) { t in
                Button { store.go(t) } label: {
                    VStack(spacing: 4) { Image(systemName: t.icon).font(.title3); Text(t.rawValue).font(.caption.weight(.semibold)) }
                        .frame(width: 70, height: 56)
                        .foregroundStyle(store.tab == t ? Color.accentLight : .white.opacity(0.85))
                        .background(store.tab == t ? Color.white.opacity(0.16) : .clear, in: RoundedRectangle(cornerRadius: 16))
                }
            }
            Spacer()
        }
        .padding(.vertical, 20).frame(width: 96).glass(0)
    }
}

struct MainPane: View {
    @Environment(Store.self) private var store
    @Environment(\.horizontalSizeClass) private var hSize
    let scan: () -> Void
    @Binding var photo: PhotosPickerItem?
    @Binding var pdf: Bool
    var body: some View {
        switch store.tab {
        case .home: HomeView()
        case .list: ListView()
        case .budget: BudgetView()
        case .scan:
            if hSize != .regular, store.selectedReceipt != nil { ConfirmView(back: true) } else { ScanView(scan: scan, photo: $photo, pdf: $pdf) }
        case .me: MeView()
        }
    }
}

struct DetailPane: View {
    @Environment(Store.self) private var store
    var body: some View {
        switch store.tab {
        case .scan: if store.selectedReceipt != nil { ConfirmView(back: false) } else { Empty(text: "Velg en kvittering.") }
        case .budget: BudgetDetail()
        case .me: ScrollView { Hero().padding(20) }
        default: TxDetail()
        }
    }
}

/* ---------------- Byggeklosser ---------------- */

struct Empty: View {
    let text: String
    var body: some View { Text(text).foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(30) }
}

struct SectionLabel: View {
    let text: String
    var body: some View { Text(text.uppercased()).font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.6)).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 6).padding(.top, 6) }
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

struct TxRow: View {
    let tx: Tx
    var selected = false
    var body: some View {
        HStack(spacing: 12) {
            Initial(text: tx.description, color: tx.color)
            VStack(alignment: .leading, spacing: 2) {
                Text(tx.description).fontWeight(.medium).lineLimit(1)
                Text("\(ddmm(tx.date)) · \(tx.category)").font(.footnote).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(signed(tx.amount)).font(.system(.body, design: .monospaced).weight(.semibold)).foregroundStyle(tx.amount > 0 ? Color.positive : .white)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(selected ? Color.white.opacity(0.1) : .clear)
        .contentShape(Rectangle())
    }
}

struct TxList: View {
    @Environment(Store.self) private var store
    let items: [Tx]
    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { i, t in
                if i > 0 { Divider().overlay(.white.opacity(0.12)) }
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
                Text("Igjen å bruke i \(monthLabel(s.month).lowercased())").font(.subheadline).foregroundStyle(.white.opacity(0.75))
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text(neg0(s.left)).font(.system(size: 42, weight: .semibold, design: .monospaced))
                    Text(" kr").font(.title3).foregroundStyle(.white.opacity(0.65))
                }
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.14))
                        Capsule().fill(Color(hex: "#FF8A4C")).frame(width: g.size.width * pct)
                    }
                }.frame(height: 10)
                HStack { Text("Brukt \(n0(s.budgetUsed)) kr"); Spacer(); Text("\(n0(max(0, s.left) / Double(max(1, s.daysLeft)))) kr/dag") }
                    .font(.footnote).foregroundStyle(.white.opacity(0.7))
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
            Button { store.go(.scan) } label: {
                HStack(spacing: 14) {
                    Text("\(q.count)").fontWeight(.bold).foregroundStyle(Color.ink).frame(width: 36, height: 36).background(Color.accent, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Kvitteringer til gjennomgang").fontWeight(.semibold).foregroundStyle(Color.accentLight)
                        Text(q.map { $0.merchant ?? "Ny" }.joined(separator: " · ")).font(.footnote).foregroundStyle(.white.opacity(0.75)).lineLimit(1)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(.white.opacity(0.6))
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
                        Text("Hei, \(store.boot?.settings.name ?? "")").font(.subheadline).foregroundStyle(.white.opacity(0.7))
                        Text(monthLabel(store.summary?.month ?? "")).font(.system(size: 34, weight: .bold))
                    }
                    Spacer()
                    Button { store.go(.me) } label: { Text(initial(store.boot?.settings.name ?? "S")).fontWeight(.semibold).frame(width: 44, height: 44) }.glass(22)
                }
                .padding(.horizontal, 4).padding(.top, 6)
                Hero()
                ReviewCTA()
                SectionLabel(text: "Siste")
                if let r = store.summary?.recent { TxList(items: Array(r.prefix(6))) } else { ProgressView() }
            }
            .padding(.horizontal, 18).padding(.bottom, 30)
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
                Text("Transaksjoner").font(.system(size: 34, weight: .bold)).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(.white.opacity(0.6))
                    TextField("Søk", text: $s.query).submitLabel(.search).onSubmit { store.search() }
                }
                .padding(.horizontal, 14).frame(height: 44).glass(22)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach([("", "Alle"), ("ut", "Utgifter"), ("inn", "Inntekter")], id: \.0) { k, n in
                            Button { store.filter = k; store.search() } label: {
                                Text(n).font(.subheadline).padding(.horizontal, 14).frame(height: 36)
                                    .foregroundStyle(store.filter == k ? Color.ink : .white)
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
            .padding(.horizontal, 18).padding(.bottom, 30)
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
                Text("Budsjett").font(.system(size: 34, weight: .bold)).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
                Hero()
                if rows.isEmpty { Empty(text: "Ingen budsjett satt. Sett opp i FinansHub på nettet.") }
                ForEach(rows) { b in
                    let over = b.used > b.budget
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(b.category).fontWeight(.semibold)
                            Spacer()
                            Text("\(n0(b.used)) / \(n0(b.budget))").font(.system(.subheadline, design: .monospaced)).foregroundStyle(over ? Color.accentLight : .white.opacity(0.7))
                        }
                        GeometryReader { g in
                            ZStack(alignment: .leading) {
                                Capsule().fill(.white.opacity(0.14))
                                Capsule().fill(over ? Color.accent : Color(hex: b.color)).frame(width: g.size.width * min(1, b.used / b.budget))
                            }
                        }.frame(height: 8)
                    }
                    .padding(16).glass(22)
                    .overlay(RoundedRectangle(cornerRadius: 22).stroke(store.selectedBudget == b.categoryId ? Color.accent : .clear, lineWidth: 1.5))
                    .onTapGesture { store.selectedBudget = b.categoryId; if store.txs == nil { store.search() } }
                }
            }
            .padding(.horizontal, 18).padding(.bottom, 30)
        }
    }
}

struct BudgetDetail: View {
    @Environment(Store.self) private var store
    var body: some View {
        if let s = store.summary, let b = s.budgets.first(where: { $0.categoryId == store.selectedBudget }) ?? s.budgets.first(where: { $0.budget > 0 }) {
            let items = (store.txs ?? []).filter { $0.categoryId == b.categoryId && $0.date >= s.from && $0.date < s.to }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(b.category).font(.title.weight(.bold))
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Brukt av \(n0(b.budget)) kr").foregroundStyle(.white.opacity(0.7))
                        Text("\(n0(b.used)) kr").font(.system(size: 36, weight: .semibold, design: .monospaced))
                        Text(b.used > b.budget ? "Over budsjett med \(n0(b.used - b.budget)) kr." : "\(n0(b.budget - b.used)) kr igjen denne måneden.").foregroundStyle(.white.opacity(0.75))
                    }
                    .padding(20).frame(maxWidth: .infinity, alignment: .leading).glass(28)
                    if !items.isEmpty { SectionLabel(text: "Transaksjoner"); TxList(items: items) }
                }
                .padding(20)
            }
        } else { Empty(text: "Velg en kategori.") }
    }
}

struct TxDetail: View {
    @Environment(Store.self) private var store
    var body: some View {
        let pool = (store.txs ?? []) + (store.summary?.recent ?? [])
        if let t = pool.first(where: { $0.id == store.selectedTx }) ?? pool.first {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 14) {
                        Initial(text: t.description, color: t.color, size: 56)
                        VStack(alignment: .leading) { Text(t.description).font(.title2.weight(.bold)); Text(dayLabel(t.date)).foregroundStyle(.white.opacity(0.7)) }
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 0) {
                        Text(signed(t.amount)).font(.system(size: 40, weight: .semibold, design: .monospaced)).foregroundStyle(t.amount > 0 ? Color.positive : .white)
                        Text(" kr").font(.title3).foregroundStyle(.white.opacity(0.6))
                    }
                    VStack(spacing: 0) {
                        row("Kategori", t.category); Divider().overlay(.white.opacity(0.12))
                        row("Konto", t.account); Divider().overlay(.white.opacity(0.12))
                        row("Kvittering", t.receipt == "booked" ? "Vedlagt" : t.receipt == nil ? "–" : "Til gjennomgang")
                        if !t.note.isEmpty { Divider().overlay(.white.opacity(0.12)); row("Notat", t.note) }
                    }
                    .glass(24)
                    Menu {
                        ForEach(store.boot?.categories ?? []) { c in Button(c.name) { store.setCategory(tx: t.id, category: c.id) } }
                    } label: {
                        Text("Endre kategori").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .glass(25)
                }
                .padding(20)
            }
        } else { Empty(text: "Ingen transaksjon valgt.") }
    }
    private func row(_ k: String, _ v: String) -> some View {
        HStack { Text(k).foregroundStyle(.white.opacity(0.65)); Spacer(); Text(v).fontWeight(.medium) }.padding(.horizontal, 16).padding(.vertical, 14)
    }
}

struct ScanView: View {
    @Environment(Store.self) private var store
    let scan: () -> Void
    @Binding var photo: PhotosPickerItem?
    @Binding var pdf: Bool
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text("Skann").font(.system(size: 34, weight: .bold)).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
                Button(action: scan) {
                    HStack(spacing: 14) {
                        Image(systemName: "camera.fill").foregroundStyle(Color.ink).frame(width: 36, height: 36).background(Color.accent, in: Circle())
                        VStack(alignment: .leading) { Text("Ta bilde av kvittering").fontWeight(.semibold); Text("Bakkamera").font(.footnote).foregroundStyle(.white.opacity(0.7)) }
                        Spacer()
                    }
                    .padding(14).glass(24)
                }
                .buttonStyle(.plain)
                HStack(spacing: 10) {
                    PhotosPicker(selection: $photo, matching: .images) { Label("Bilder", systemImage: "photo").frame(maxWidth: .infinity, minHeight: 48) }.glass(24)
                    Button { pdf = true } label: { Label("Filer", systemImage: "doc").frame(maxWidth: .infinity, minHeight: 48) }.glass(24)
                }
                .buttonStyle(.plain)
                let q = store.receipts ?? []
                if store.receipts == nil { ProgressView().padding(30) }
                else if q.isEmpty { Empty(text: "Ingen kvitteringer i køen.") }
                else {
                    SectionLabel(text: "Til gjennomgang")
                    VStack(spacing: 0) {
                        ForEach(Array(q.enumerated()), id: \.element.id) { i, r in
                            if i > 0 { Divider().overlay(.white.opacity(0.12)) }
                            Button { store.selectedReceipt = r.id } label: {
                                HStack(spacing: 12) {
                                    Thumb(path: r.thumb)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(r.merchant ?? "Ny kvittering").fontWeight(.medium)
                                        Text(r.status == "needs_review" ? "\(ddmm(r.date)) · \(r.provider ?? "manuell")" : "Leser …").font(.footnote).foregroundStyle(.white.opacity(0.6))
                                    }
                                    Spacer()
                                    if let t = r.total { Text(n2(t)).font(.system(.body, design: .monospaced)) }
                                }
                                .padding(.horizontal, 16).padding(.vertical, 12)
                                .background(store.selectedReceipt == r.id ? Color.white.opacity(0.1) : .clear)
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
        .task { try? await store.loadReceipts() }
        .refreshable { try? await store.loadReceipts() }
    }
}

struct Thumb: View {
    @Environment(Store.self) private var store
    let path: String?
    @State private var img: UIImage?
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
    @State private var img: UIImage?

    var body: some View {
        if let r = store.receipts?.first(where: { $0.id == store.selectedReceipt }) {
            let queue = (store.receipts ?? []).filter { $0.status == "needs_review" }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        if back { Button { store.selectedReceipt = nil } label: { Label("Tilbake", systemImage: "chevron.left") }.foregroundStyle(Color.accentLight) }
                        Spacer()
                        if let i = queue.firstIndex(where: { $0.id == r.id }) { Text("\(i + 1) av \(queue.count)").foregroundStyle(.white.opacity(0.7)) }
                    }
                    Text("Bekreft kvittering").font(.system(size: 28, weight: .bold))
                    if r.status != "needs_review" {
                        VStack(spacing: 14) { ProgressView().controlSize(.large); Text("Leser kvitteringen …").foregroundStyle(.white.opacity(0.7)) }.frame(maxWidth: .infinity).padding(50)
                    } else {
                        paper(r)
                        let minC = Double(store.boot?.settings.minConf ?? 85) / 100
                        let high = r.error == nil && r.flag == nil && (r.confidence ?? 0) >= minC
                        HStack {
                            Text(r.provider.map { p in "Lest av \(p)" + (r.seconds.map { " · \(n2($0)) s" } ?? "") } ?? "Manuell utfylling")
                            Spacer()
                            Text("● " + (r.error != nil ? "Fyll ut" : high ? "Høy sikkerhet" : "Sjekk beløp")).foregroundStyle(high ? Color.positive : Color.accentLight).fontWeight(.semibold)
                        }
                        .font(.footnote).foregroundStyle(.white.opacity(0.7)).padding(.horizontal, 6)
                        if let e = r.error { Text(e).font(.footnote).foregroundStyle(Color.accentLight).padding(.horizontal, 6) }
                        VStack(spacing: 0) {
                            field("Butikk") { TextField("Butikk", text: $merchant).multilineTextAlignment(.trailing).onSubmit { store.update(r.id, "merchant", merchant) } }
                            Divider().overlay(.white.opacity(0.12))
                            field("Dato") { DatePicker("", selection: $date, displayedComponents: .date).labelsHidden().onChange(of: date) { _, d in store.update(r.id, "date", iso(d)) } }
                            Divider().overlay(.white.opacity(0.12))
                            field("Total") {
                                TextField("0,00", text: $total).keyboardType(.decimalPad).multilineTextAlignment(.trailing).font(.system(.body, design: .monospaced)).foregroundStyle(Color.accentLight)
                                    .onSubmit { saveTotal(r) }
                            }
                            Divider().overlay(.white.opacity(0.12))
                            field("Konto") {
                                Menu((store.boot?.accounts.first { $0.id == r.accountId })?.name ?? "Velg") {
                                    ForEach(store.boot?.accounts ?? []) { a in Button(a.name) { store.update(r.id, "accountId", a.id) } }
                                }
                            }
                        }
                        .glass(24)
                        FlowChips(cats: (store.boot?.categories ?? []).filter { $0.kind == "expense" }, selected: r.categoryId) { store.update(r.id, "categoryId", $0) }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.match != nil ? "Matchet mot kortkjøp" : "Ingen bankmatch").fontWeight(.semibold).foregroundStyle(r.match != nil ? Color.positive : .white)
                            Text(r.match.map { "\(ddmm($0.date)) · \(signed($0.amount)) kr · \($0.account)" } ?? "Bokføres som ny transaksjon").foregroundStyle(.white.opacity(0.75))
                        }
                        .font(.subheadline).padding(.horizontal, 16).padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading)
                        .background((r.match != nil ? Color.positive : .white).opacity(0.12), in: RoundedRectangle(cornerRadius: 20))
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke((r.match != nil ? Color.positive : .white).opacity(0.3)))
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
        HStack { Text(label).foregroundStyle(.white.opacity(0.65)); Spacer(); content() }.padding(.horizontal, 16).padding(.vertical, 10).frame(minHeight: 48)
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
                    Text(c.name).font(.subheadline).padding(.horizontal, 14).frame(height: 36).foregroundStyle(selected == c.id ? Color.ink : .white)
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

struct MeView: View {
    @Environment(Store.self) private var store
    var body: some View {
        ScrollView {
            if let st = store.boot?.settings {
                VStack(spacing: 12) {
                    HStack(spacing: 14) {
                        Text(initial(st.name)).font(.title2.weight(.semibold)).frame(width: 56, height: 56).glass(28)
                        VStack(alignment: .leading) { Text(st.name).font(.system(size: 28, weight: .bold)); Text(store.server.replacingOccurrences(of: "https://", with: "")).font(.subheadline).foregroundStyle(.white.opacity(0.65)) }
                        Spacer()
                    }
                    .padding(.top, 6)
                    SectionLabel(text: "AI-motor")
                    VStack(spacing: 0) {
                        choice("Ollama · lokalt", "Bildet forlater aldri huset", st.provider == "ollama") { store.save("provider", "ollama") }
                        Divider().overlay(.white.opacity(0.12))
                        choice("Gemini · sky", "Raskest og mest presis", st.provider == "gemini") { store.save("provider", "gemini") }
                        Divider().overlay(.white.opacity(0.12))
                        toggle("Bruk reserve ved feil", st.fallback) { store.save("fallback", $0) }
                    }
                    .glass(24)
                    SectionLabel(text: "Varsler og regler")
                    VStack(spacing: 0) {
                        toggle("Budsjett 80 %", st.n80) { store.save("n80", $0) }
                        Divider().overlay(.white.opacity(0.12))
                        toggle("Budsjett brukt opp", st.n100) { store.save("n100", $0) }
                        Divider().overlay(.white.opacity(0.12))
                        toggle("Ny kvittering", st.nRc) { store.save("nRc", $0) }
                        Divider().overlay(.white.opacity(0.12))
                        toggle("Auto-kategorisering", st.autoCat) { store.save("autoCat", $0) }
                    }
                    .glass(24)
                    Button { store.logout() } label: { Text("Logg ut").fontWeight(.semibold).foregroundStyle(Color(hex: "#FF8A6B")).frame(maxWidth: .infinity, minHeight: 52) }
                        .buttonStyle(.plain).glass(26)
                    Text("Flere innstillinger finnes i FinansHub på nettet.").font(.caption).foregroundStyle(.white.opacity(0.5))
                }
                .padding(.horizontal, 18).padding(.bottom, 30)
            }
        }
    }
    private func choice(_ t: String, _ s: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack { VStack(alignment: .leading) { Text(t).fontWeight(.medium); Text(s).font(.footnote).foregroundStyle(.white.opacity(0.6)) }; Spacer(); if on { Image(systemName: "checkmark").foregroundStyle(Color.accent) } }
                .padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
    private func toggle(_ t: String, _ on: Bool, _ set: @escaping (Bool) -> Void) -> some View {
        Toggle(t, isOn: Binding(get: { on }, set: set)).padding(.horizontal, 16).padding(.vertical, 8)
    }
}

struct LoginView: View {
    @Environment(Store.self) private var store
    @State private var server = ""
    @State private var password = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer()
            Image(systemName: "chart.line.uptrend.xyaxis").font(.title).foregroundStyle(Color.ink).frame(width: 56, height: 56).background(Color.accent, in: RoundedRectangle(cornerRadius: 18))
            Text("FinansHub").font(.system(size: 34, weight: .bold))
            Text("Logg inn på homelab-serveren din. Appen får bare tilgang til økonomidelen.").foregroundStyle(.white.opacity(0.7))
            TextField("https://os.dittdomene.no", text: $server).textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(.horizontal, 18).frame(height: 54).glass(27)
            SecureField("Passord", text: $password).textContentType(.password).submitLabel(.go).onSubmit(submit)
                .padding(.horizontal, 18).frame(height: 54).glass(27)
            Button(action: submit) { Text(store.busy ? "Logger inn …" : "Logg inn").fontWeight(.bold).foregroundStyle(Color.ink).frame(maxWidth: .infinity, minHeight: 54) }
                .buttonStyle(.plain).glass(27, tint: .accent).disabled(server.isEmpty || password.isEmpty || store.busy)
            Spacer()
        }
        .padding(24).frame(maxWidth: 480)
        .onAppear { server = store.server }
    }
    private func submit() { store.login(server: server, password: password) }
}
