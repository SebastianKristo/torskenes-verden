import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/*
 * Finn-handler (design 2a): egen fane i Finans. Listen har netto i år, «på vei»-kort med sporing,
 * filter og et rutenett; handelen har bilder, status, kvittering, annonse, bilder og en tidslinje.
 */

private let nb = Locale(identifier: "nb_NO")
private let buyC = Color(hex: "#8FB3FF")
private let sellC = Color(hex: "#7BE3A0")
private let dim = Color(hex: "#3A3A44")
private let text2 = Color.white.opacity(0.6)

private extension FinnDeal {
    var col: Color { sold ? sellC : buyC }
    var roleName: String { sold ? "Solgt" : "Kjøpt" }
    var valueText: String { (sold ? "+" : "−") + n0(amount ?? 0) + " kr" }
    var title: String { item ?? "Finn-handel" }
}

private func initials(_ s: String) -> String {
    let w = s.split(whereSeparator: \.isWhitespace).prefix(2).compactMap { $0.first.map { String($0).uppercased() } }.joined()
    return w.isEmpty ? "•" : w
}

/// Fast fargetone per handel når det ikke finnes bilde.
private func tint(_ id: Int) -> Color {
    let c = ["#3A2F4A", "#1E2A3F", "#3B2E22", "#22362C", "#2C2C33", "#2A3540"]
    return Color(hex: c[((id % c.count) + c.count) % c.count])
}

/// «2026-10-14» eller «14.10.2026» → sorterbar nøkkel.
private func sortKey(_ d: String?) -> String {
    guard let d else { return "" }
    if let r = d.range(of: #"^\d{4}-\d{2}-\d{2}"#, options: .regularExpression) { return String(d[r]) }
    if let r = d.range(of: #"^\d{1,2}\.\d{1,2}(\.\d{2,4})?"#, options: .regularExpression) {
        let p = d[r].split(separator: ".").map(String.init)
        var y = p.count > 2 ? p[2] : String(Calendar.current.component(.year, from: Date()))
        if y.count == 2 { y = "20" + y }
        return "\(y)-\(p[1].count == 1 ? "0" + p[1] : p[1])-\(p[0].count == 1 ? "0" + p[0] : p[0])"
    }
    return d
}

/// «O», «N», «D» … under månedsstolpene.
private func narrowMonth(_ d: Date) -> String {
    let f = DateFormatter()
    f.locale = nb
    f.dateFormat = "LLLLL"
    return f.string(from: d).uppercased()
}

/// «pdf», «jpg» … (tomt uten filendelse).
private func fileExt(_ name: String) -> String {
    guard let i = name.lastIndex(of: "."), i != name.startIndex else { return "" }
    return String(name[name.index(after: i)...].prefix(4)).uppercased()
}

/// Bilde fra serveren (relativ sti, hentes med appens token). Uten bilde vises fargetone og initialer.
private struct FinnImage: View {
    @Environment(Store.self) private var store
    let path: String?
    let id: Int
    let label: String
    var ini: CGFloat = 32
    @State private var img: UIImage?
    var body: some View {
        ZStack {
            tint(id)
            if let img {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Text(initials(label)).font(.system(size: ini, weight: .bold)).foregroundStyle(.white.opacity(0.2))
            }
        }
        .clipped()
        .task(id: path) { img = nil; if let path, path.hasPrefix("/") { img = await store.image(path) } }
    }
}

/// Fire sporingspunkter: Betalt → Sendt → Mottatt → Godkjent (kjøp) eller Solgt → Sendt → Levert → Utbetalt (salg).
private struct TrackPoints: View {
    let d: FinnDeal
    var big = false
    var body: some View {
        let lvl = d.level
        HStack(spacing: 0) {
            ForEach(Array(d.points.enumerated()), id: \.offset) { j, t in
                let done = j < lvl
                let cur = j == lvl - 1 && !d.finished
                VStack(alignment: .leading, spacing: big ? 8 : 7) {
                    HStack(spacing: 0) {
                        Circle().fill(done ? (cur ? Color.accent : .white) : dim).frame(width: big ? 14 : 12, height: big ? 14 : 12)
                            .overlay { if cur { Circle().stroke(Color.accent.opacity(0.35), lineWidth: 3).padding(-3) } }
                        Rectangle().fill(j == 3 ? Color.clear : (j + 1 < lvl ? Color.white : dim)).frame(height: big ? 3 : 2)
                    }
                    Text(t).font(.system(size: big ? 11.5 : 11, weight: cur ? .semibold : .regular))
                        .foregroundStyle(done ? Color.white : text2.opacity(0.6)).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

private struct FinnPill: View {
    let text: String
    let bg: Color
    let fg: Color
    var body: some View {
        Text(text).font(.system(size: 12, weight: .semibold)).foregroundStyle(fg).lineLimit(1)
            .padding(.horizontal, 10).padding(.vertical, 4).background(bg, in: RoundedRectangle(cornerRadius: 12))
    }
}

/* ---------------- Listen ---------------- */

struct FinnView: View {
    @Environment(Store.self) private var store
    @State private var q = ""
    @State private var qOpen = false
    @State private var seg = "Alle"
    var body: some View {
        if store.finnSel != nil { FinnDealView() } else { list }
    }

    private var list: some View {
        ScrollView {
            VStack(spacing: 14) {
                HStack(spacing: 10) {
                    // Åpnet fra Mer (Finn er skjult som fane): tilbake til Mer.
                    if !store.finTabs.contains(.finn) { GlassBack { store.back() } }
                    Text(store.tabName(.finn)).font(.system(size: 34, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
                    Spacer()
                    Button { qOpen.toggle(); q = "" } label: {
                        Image(systemName: qOpen ? "xmark" : "magnifyingglass").font(.system(size: 16, weight: .semibold)).foregroundStyle(.white).frame(width: 44, height: 44).contentShape(Circle())
                    }
                    .buttonStyle(GlassPress()).glassRound().accessibilityLabel(qOpen ? "Lukk søk" : "Søk i handler")
                    Avatar()
                }
                .padding(.top, 6)
                if qOpen {
                    TextField("Søk i handler", text: $q).submitLabel(.search).padding(.horizontal, 16).frame(height: 46).glass(23)
                }
                if let e = store.moduleError { Empty(text: e) }
                if let f = store.finn {
                    let needle = q.trimmingCharacters(in: .whitespaces)
                    let vis = f.items.filter { d in needle.isEmpty || "\(d.item ?? "") \(d.counterpart ?? "") \(d.code ?? "")".localizedCaseInsensitiveContains(needle) }
                    FinnSummary(f: f)
                    let act = vis.filter { !$0.finished }
                    if !act.isEmpty {
                        HStack(alignment: .lastTextBaseline) {
                            Text("\(act.count) på vei").font(.system(size: 20, weight: .semibold))
                            Spacer()
                            if act.count > 1 { Text("Sveip for flere").font(.footnote).foregroundStyle(text2) }
                        }
                        .padding(.top, 4)
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 12) { ForEach(act) { d in OnTheWayCard(d: d) } }
                        }
                        .scrollClipDisabled()
                    }
                    HStack(spacing: 4) {
                        ForEach(["Alle", "Kjøpt", "Solgt", "Fullført"], id: \.self) { n in
                            let on = seg == n
                            Button { seg = n } label: {
                                Text(n).font(.system(size: 13.5, weight: .medium)).lineLimit(1).foregroundStyle(on ? Color.ink : text2)
                                    .frame(maxWidth: .infinity, minHeight: 40).background(on ? Color.white : .clear, in: RoundedRectangle(cornerRadius: 12)).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(4).glass(16)
                    let grid = vis.filter { d in seg == "Kjøpt" ? !d.sold : seg == "Solgt" ? d.sold : seg == "Fullført" ? d.finished : true }
                    if grid.isEmpty {
                        Empty(text: f.items.isEmpty ? "Ingen Finn-handler ennå. De kommer inn fra Finn-e-postene, eller legg dem inn i FinansHub på PC." : "Ingen handler passer.")
                    }
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        ForEach(grid) { d in GridCard(d: d) }
                    }
                } else if store.moduleError == nil { ProgressView().padding(30) }
            }
            .padding(.horizontal, 18).padding(.bottom, 110)
        }
        .scrollDismissesKeyboard(.interactively)
        .tracksScroll(store)
        .refreshable { try? await store.loadFinn() }
    }
}

/// Netto i år med månedsstolper, og kjøpt/solgt med andelsstolper.
private struct FinnSummary: View {
    let f: FinnList
    var body: some View {
        let cal = Calendar.current
        let now = Date()
        let year = String(cal.component(.year, from: now))
        let inYear = f.items.filter { sortKey($0.date).hasPrefix(year) }
        let bought = f.bought ?? inYear.filter { !$0.sold }.map { $0.amount ?? 0 }.reduce(0, +)
        let sold = f.sold ?? inYear.filter(\.sold).map { $0.amount ?? 0 }.reduce(0, +)
        let net = sold - bought
        let mx = Swift.max(bought, sold, 1)
        let months: [(String, Double)] = (0...3).reversed().map { k in
            let m = cal.date(byAdding: .month, value: -k, to: now) ?? now
            let key = String(format: "%04d-%02d", cal.component(.year, from: m), cal.component(.month, from: m))
            return (narrowMonth(m), f.items.filter { sortKey($0.date).hasPrefix(key) }.map { $0.amount ?? 0 }.reduce(0, +))
        }
        let top = Swift.max(months.map { $0.1 }.max() ?? 0, 1)
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Netto i år").font(.subheadline).foregroundStyle(text2)
                    Text((net >= 0 ? "+" : "−") + n0(net) + " kr").font(.system(size: 32, weight: .semibold, design: .monospaced))
                        .foregroundStyle(net >= 0 ? sellC : .white).lineLimit(1).minimumScaleFactor(0.6)
                }
                Spacer()
                HStack(alignment: .bottom, spacing: 4) {
                    ForEach(Array(months.enumerated()), id: \.offset) { k, m in
                        VStack(spacing: 4) {
                            RoundedRectangle(cornerRadius: 4).fill(k == 3 ? Color.accent : .white.opacity(0.18)).frame(width: 12, height: m.1 / top * 30 + 4)
                            Text(m.0).font(.system(size: 9.5)).foregroundStyle(text2)
                        }
                    }
                }
                .frame(height: 52, alignment: .bottom)
            }
            HStack(spacing: 10) {
                share("Kjøpt · \(inYear.filter { !$0.sold }.count)", bought, mx, buyC)
                share("Solgt · \(inYear.filter(\.sold).count)", sold, mx, sellC)
            }
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading).glass(24)
    }

    private func share(_ l: String, _ v: Double, _ mx: Double, _ c: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(l).font(.system(size: 12.5)).foregroundStyle(text2)
            Text(n0(v) + " kr").font(.system(size: 16, weight: .bold, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.7)
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.12))
                    Capsule().fill(c).frame(width: g.size.width * Swift.min(1, Swift.max(0, v / mx)))
                }
            }
            .frame(height: 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct OnTheWayCard: View {
    @Environment(Store.self) private var store
    let d: FinnDeal
    var body: some View {
        Button { store.openFinn(d.id) } label: {
            VStack(alignment: .leading, spacing: 0) {
                FinnImage(path: d.image, id: d.id, label: d.title, ini: 42).frame(height: 132)
                    .overlay(alignment: .topLeading) { FinnPill(text: d.roleName, bg: .black.opacity(0.5), fg: d.col).padding(12) }
                    .overlay(alignment: .topTrailing) { FinnPill(text: d.valueText, bg: .black.opacity(0.5), fg: .white).padding(12) }
                VStack(alignment: .leading, spacing: 12) {
                    Text(d.title).font(.system(size: 16, weight: .semibold)).lineLimit(1)
                    TrackPoints(d: d)
                    Divider().overlay(.white.opacity(0.15))
                    Text("Neste: \(d.nextText)").font(.system(size: 13)).lineLimit(2).multilineTextAlignment(.leading)
                }
                .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 16)
            }
            .foregroundStyle(.white)
            .frame(width: 262, alignment: .leading)
            .clipShape(RoundedRectangle(cornerRadius: 26))
            .glass(26)
        }
        .buttonStyle(GlassPress())
    }
}

private struct GridCard: View {
    @Environment(Store.self) private var store
    let d: FinnDeal
    var body: some View {
        Button { store.openFinn(d.id) } label: {
            VStack(alignment: .leading, spacing: 0) {
                Color.clear.aspectRatio(4 / 3, contentMode: .fit)
                    .overlay { FinnImage(path: d.image, id: d.id, label: d.title) }
                    .clipped()
                    .overlay(alignment: .topLeading) {
                        FinnPill(text: d.status, bg: d.finished ? Color.black.opacity(0.55) : Color.accent, fg: d.finished ? Color.white.opacity(0.85) : Color.ink).padding(10)
                    }
                VStack(alignment: .leading, spacing: 3) {
                    Text(d.valueText).font(.system(size: 15, weight: .bold, design: .monospaced)).foregroundStyle(d.col).lineLimit(1).minimumScaleFactor(0.7)
                    Text(d.title).font(.system(size: 13.5)).lineLimit(1)
                    Text("\(d.roleName) · \(ddmm(sortKey(d.date)))").font(.system(size: 12)).foregroundStyle(text2).lineLimit(1)
                    if let s = d.summary, !s.isEmpty { Text(s).font(.system(size: 11)).foregroundStyle(text2.opacity(0.8)).lineLimit(1) }
                }
                .padding(.horizontal, 12).padding(.top, 11).padding(.bottom, 13)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .glass(22)
        }
        .buttonStyle(GlassPress())
    }
}

/* ---------------- Handelen ---------------- */

private struct TlEntry: Identifiable {
    let id: String; let title: String; let sub: String; let date: String?; let body: String?; let mail: Bool
}

private struct FinnDealView: View {
    @Environment(Store.self) private var store
    @State private var ix = 0
    @State private var open: String?
    @State private var askUrl = false
    @State private var url = ""
    @State private var picking = false
    @State private var pickKind = "receipts"
    @State private var photoItems: [PhotosPickerItem] = []

    var body: some View {
        if let det = store.finnDetail { content(det) } else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
    }

    private func content(_ det: FinnDetail) -> some View {
        let d = det.deal
        let imgs = det.images
        return ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                carousel(d, imgs)
                VStack(alignment: .leading, spacing: 6) {
                    FinnPill(text: d.roleName + (d.code.map { " · Finn-kode \($0)" } ?? ""), bg: d.col.opacity(0.14), fg: d.col)
                    Text(d.title).font(.system(size: 26, weight: .semibold))
                    HStack(alignment: .lastTextBaseline) {
                        Text([d.counterpart.map { (d.sold ? "Til " : "Fra ") + $0.replacingOccurrences(of: #"^(selger|kjøper)\s+"#, with: "", options: [.regularExpression, .caseInsensitive]) }, ddmm(sortKey(d.date))].compactMap { $0 }.joined(separator: " · "))
                            .font(.subheadline).foregroundStyle(text2).lineLimit(1)
                        Spacer()
                        Text(d.valueText).font(.system(size: 22, weight: .bold, design: .monospaced)).foregroundStyle(d.col).lineLimit(1).fixedSize()
                    }
                }
                status(d)
                tiles(d, det)
                if let ad = det.ad { adCard(ad, d) }
                if !det.receipts.isEmpty { receipts(det.receipts) }
                if !det.photos.isEmpty { photos(det.photos, d) }
                paper(d, det)
                timeline(d, det)
                if let s = det.summary, !s.isEmpty { Text("✦ " + s).font(.system(size: 12.5)).foregroundStyle(text2).padding(.leading, 8) }
            }
            .padding(.horizontal, 18).padding(.top, 6).padding(.bottom, 110)
        }
        .refreshable { await store.loadFinnDetail() }
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                var files: [(name: String, mime: String, data: Data)] = []
                for (k, item) in items.enumerated() {
                    if let raw = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: raw), let jpg = img.scaled(max: 2400).jpegData(compressionQuality: 0.88) {
                        files.append((name: "bilde-\(k + 1).jpg", mime: "image/jpeg", data: jpg))
                    }
                }
                photoItems = []
                store.finnUpload("photos", files)
            }
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: pickKind == "emails" ? [UTType.emailMessage, .plainText, .data] : [UTType.pdf, .image, .emailMessage], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            var files: [(name: String, mime: String, data: Data)] = []
            for u in urls {
                let scoped = u.startAccessingSecurityScopedResource()
                defer { if scoped { u.stopAccessingSecurityScopedResource() } }
                guard let data = try? Data(contentsOf: u) else { continue }
                let mime = UTType(filenameExtension: u.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                files.append((name: u.lastPathComponent, mime: mime, data: data))
            }
            store.finnUpload(pickKind, files)
        }
        .alert("✦ Hent annonsen", isPresented: $askUrl) {
            TextField("https://www.finn.no/…", text: $url).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            Button("Hent") { store.finnFetchAd(url); url = "" }
            Button("Avbryt", role: .cancel) { url = "" }
        } message: {
            Text("Lim inn finn.no-lenken. Serveren henter tittel, pris, sted, beskrivelse og alle bildene, og beholder kopien selv om annonsen slettes.")
        }
    }

    /// Stort bilde: egne bilder eller annonsens. Sveip eller trykk for neste.
    private func carousel(_ d: FinnDeal, _ imgs: [String]) -> some View {
        let n = imgs.count
        let cur = n == 0 ? 0 : Swift.min(ix, n - 1)
        return ZStack {
            if n == 0 {
                FinnImage(path: nil, id: d.id, label: d.title, ini: 88)
            } else {
                TabView(selection: Binding(get: { cur }, set: { ix = $0 })) {
                    ForEach(Array(imgs.enumerated()), id: \.offset) { k, p in
                        FinnImage(path: p, id: d.id, label: d.title, ini: 88).tag(k)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .onTapGesture { if n > 1 { withAnimation { ix = (cur + 1) % n } } }
            }
        }
        .frame(height: 280).frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 28))
        .overlay(alignment: .top) {
            HStack {
                Button { store.back() } label: {
                    Image(systemName: "chevron.left").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white).frame(width: 44, height: 44)
                        .background(.black.opacity(0.45), in: Circle()).contentShape(Circle())
                }
                .buttonStyle(GlassPress()).accessibilityLabel("Tilbake til Finn")
                Spacer()
                if n > 1 {
                    Text("\(cur + 1) / \(n)").font(.system(size: 13)).foregroundStyle(.white).padding(.horizontal, 14).padding(.vertical, 12).background(.black.opacity(0.45), in: Capsule())
                }
            }
            .padding(14)
        }
        .overlay(alignment: .bottomLeading) {
            if n > 1 {
                HStack(spacing: 6) {
                    ForEach(0..<Swift.min(n, 8), id: \.self) { k in
                        Capsule().fill(k == cur ? Color.white : .white.opacity(0.45)).frame(width: k == cur ? 22 : 6, height: 6)
                    }
                }
                .padding(16)
            }
        }
    }

    /// Statuskort med sporing.
    private func status(_ d: FinnDeal) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text("STATUS").font(.system(size: 13)).tracking(1).foregroundStyle(Color.accentLight)
                Text(d.status).font(.system(size: 26, weight: .semibold))
                Text(d.finished ? "Alt er i orden, og kvitteringen er lagret." : d.nextText).font(.subheadline).foregroundStyle(text2)
            }
            TrackPoints(d: d, big: true)
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [Color(hex: "#2A1A10"), Color(hex: "#1A1210")], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color(hex: "#3A2A20"), lineWidth: 1))
    }

    /// Kvittering · Annonse · Bilder
    private func tiles(_ d: FinnDeal, _ det: FinnDetail) -> some View {
        let busy = store.finnBusy
        return HStack(spacing: 8) {
            Button { pickKind = "receipts"; picking = true } label: {
                tile("doc.text", "Kvittering", busy == "receipts" ? "Laster opp …" : det.receipts.isEmpty ? "Legg ved" : "✓ \(det.receipts.count) lagt ved", det.receipts.isEmpty ? .accentLight : sellC)
            }
            .buttonStyle(GlassPress())
            Button { if d.code == nil && d.adUrl == nil && det.ad?.url == nil && det.adUrlGuess == nil { askUrl = true } else { store.finnFetchAd() } } label: {
                tile("rectangle.grid.1x2", "Annonse", busy == "ad" ? "Henter …" : det.ad != nil ? "✓ Lagret" : "✦ Hent fra Finn", det.ad != nil ? sellC : .accentLight)
            }
            .buttonStyle(GlassPress())
            PhotosPicker(selection: $photoItems, maxSelectionCount: 20, matching: .images) {
                tile("photo.on.rectangle", "Bilder", busy == "photos" ? "Laster opp …" : det.photos.isEmpty ? "Last opp" : "\(det.photos.count) egne", text2)
            }
            .buttonStyle(GlassPress())
        }
    }

    private func tile(_ icon: String, _ title: String, _ sub: String, _ subColor: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: icon).font(.system(size: 18)).foregroundStyle(.white)
            Text(title).font(.system(size: 13.5, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
            Text(sub).font(.system(size: 12)).foregroundStyle(subColor).lineLimit(1)
        }
        .padding(.horizontal, 12).padding(.vertical, 14).frame(maxWidth: .infinity, alignment: .leading).glass(18)
    }

    private func adCard(_ ad: FinnAd, _ d: FinnDeal) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .lastTextBaseline) {
                Text(ad.title ?? d.title).fontWeight(.semibold)
                Spacer()
                Text(n0(ad.price ?? d.amount ?? 0) + " kr").font(.system(size: 14, design: .monospaced))
            }
            let meta = [ad.place, ad.saved.map { s in "lagret " + (ddmm(sortKey(s)) == "–" ? s : ddmm(sortKey(s))) }].compactMap { $0 }
            if !meta.isEmpty { Text(meta.joined(separator: " · ")).font(.system(size: 12.5)).foregroundStyle(text2) }
            if let t = ad.description, !t.isEmpty { Text(t).font(.system(size: 14)).lineSpacing(4) }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading).glass(20)
    }

    private func receipts(_ list: [FinnFile]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.element.id) { k, r in
                if k > 0 { Divider().overlay(.white.opacity(0.12)) }
                HStack(spacing: 12) {
                    Text(fileExt(r.name))
                        .font(.system(size: 10.5, weight: .bold)).foregroundStyle(Color.accentLight)
                        .frame(width: 34, height: 34).background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                    Text(r.name).font(.system(size: 14)).lineLimit(1)
                    Spacer()
                    Button { store.finnRemove("receipts", r.id) } label: {
                        Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(text2).frame(width: 32, height: 32).background(.white.opacity(0.1), in: Circle())
                    }
                    .buttonStyle(.plain).accessibilityLabel("Fjern \(r.name)")
                }
                .padding(.vertical, 10)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 4).glass(20)
    }

    private func photos(_ list: [FinnFile], _ d: FinnDeal) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(list) { p in
                    FinnImage(path: p.thumb ?? p.url, id: d.id, label: d.title, ini: 14).frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(alignment: .topTrailing) {
                            Button { store.finnRemove("photos", p.id) } label: {
                                Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.white).frame(width: 22, height: 22).background(.black.opacity(0.55), in: Circle())
                            }
                            .buttonStyle(.plain).padding(4).accessibilityLabel("Fjern bildet")
                        }
                }
            }
        }
    }

    /// Kvittering i papirstil.
    private func paper(_ d: FinnDeal, _ det: FinnDetail) -> some View {
        let lines = det.lines.isEmpty ? [FinnLine(label: d.sold ? "Salgspris" : "Varepris", amount: d.amount ?? 0)] : det.lines
        let total = det.total ?? (det.lines.isEmpty ? (d.amount ?? 0) : lines.map(\.amount).reduce(0, +))
        let ink = Color(hex: "#1C1B19")
        let rule = Color(hex: "#CFC9BD")
        let mono = Font.system(size: 14, design: .monospaced)
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("KVITTERING" + (d.code.map { " · \($0)" } ?? ""))
                Spacer()
                Text(String((d.date ?? "").prefix(10)))
            }
            .font(.system(size: 12, design: .monospaced)).foregroundStyle(Color(hex: "#77736B"))
            Rectangle().fill(rule).frame(height: 1)
            ForEach(Array(lines.enumerated()), id: \.offset) { _, l in
                HStack { Text(l.label).foregroundStyle(Color(hex: "#55524C")); Spacer(); Text(n0(l.amount) + " kr").foregroundStyle(ink) }.font(mono)
            }
            Rectangle().fill(rule).frame(height: 1)
            HStack { Text(det.totalLabel ?? (d.sold ? "Utbetalt" : "Betalt")); Spacer(); Text(n0(total) + " kr") }
                .font(.system(size: 17, weight: .bold, design: .monospaced)).foregroundStyle(ink)
        }
        .padding(.horizontal, 20).padding(.vertical, 18).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(hex: "#F4F1EA"), in: RoundedRectangle(cornerRadius: 22))
    }

    /// Tidslinje: fullførte steg og e-postene i handelen, nyeste øverst.
    private func timeline(_ d: FinnDeal, _ det: FinnDetail) -> some View {
        let steps = (d.steps ?? []).filter { $0.done == true }.enumerated().map { k, s in TlEntry(id: "s\(k)", title: s.t ?? "Steg", sub: "Steg fullført", date: s.date, body: nil, mail: false) }
        let mails = det.emails.map { m in TlEntry(id: "m\(m.id)", title: m.subject ?? "(uten emne)", sub: m.from ?? "E-post", date: m.date, body: m.body ?? m.snippet, mail: true) }
        let tl = (steps + mails).sorted { sortKey($0.date) > sortKey($1.date) }
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Tidslinje").font(.system(size: 16, weight: .semibold))
                Spacer()
                Button { pickKind = "emails"; picking = true } label: {
                    Text(store.finnBusy == "emails" ? "Legger ved …" : "+ Legg ved e-post").font(.system(size: 12.5)).foregroundStyle(Color.accentLight)
                }
                .buttonStyle(.plain)
            }
            .padding(.bottom, 12)
            if tl.isEmpty {
                Text("Ingen steg eller e-poster ennå. E-poster fra FINN, Posten og motparten kobles til automatisk.").font(.system(size: 13)).foregroundStyle(text2).padding(.bottom, 14)
            }
            ForEach(Array(tl.enumerated()), id: \.element.id) { j, e in
                HStack(alignment: .top, spacing: 14) {
                    VStack(spacing: 3) {
                        Circle().fill(j == 0 ? Color.accent : e.mail ? Color(hex: "#07070A") : Color.white).frame(width: 12, height: 12)
                            .overlay(Circle().stroke(j == 0 ? Color.accent : e.mail ? Color.white.opacity(0.35) : Color.white, lineWidth: 2))
                            .padding(.top, 4)
                        if j < tl.count - 1 { Rectangle().fill(.white.opacity(0.15)).frame(width: 2).frame(minHeight: 40, maxHeight: .infinity) }
                    }
                    .frame(width: 14)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(e.title).font(.system(size: 14, weight: e.mail ? .regular : .semibold)).lineLimit(1)
                            Spacer()
                            if let dt = e.date { Text(ddmm(sortKey(dt))).font(.system(size: 12, design: .monospaced)).foregroundStyle(text2) }
                        }
                        Text(e.sub).font(.system(size: 12.5)).foregroundStyle(text2).lineLimit(1)
                        if open == e.id, let b = e.body {
                            Text(b).font(.system(size: 13.5)).lineSpacing(4).padding(.horizontal, 12).padding(.vertical, 10)
                                .frame(maxWidth: .infinity, alignment: .leading).background(.black.opacity(0.35), in: RoundedRectangle(cornerRadius: 12)).padding(.top, 8)
                        }
                    }
                    .padding(.bottom, 14)
                }
                .contentShape(Rectangle())
                .onTapGesture { if e.body != nil { withAnimation { open = open == e.id ? nil : e.id } } }
            }
        }
        .padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 4).frame(maxWidth: .infinity, alignment: .leading).glass(22)
    }
}
