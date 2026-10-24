import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/* ---------------- Prompt 24: Boliger → Oversikt (handlinger, Til gjennomgang, Kategorier, Historikk, Siste utgifter) ---------------- */

/// Tegnet til kategorien (designet: CATS).
enum Bol24Icon {
    static func glyph(_ cat: String) -> String {
        let c: String = cat.lowercased()
        if c.contains("strøm") || c.contains("energi") { return "⚡" }
        if c.contains("vakt") { return "⌂" }
        if c.contains("hage") { return "✿" }
        if c.contains("vedlike") || c.contains("oppussing") { return "⚒" }
        if c.contains("forsikr") { return "◈" }
        if c.contains("kommun") || c.contains("avgift") || c.contains("felles") { return "▤" }
        return "•"
    }
}

struct Bol24Overview: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let home: Bol24Home
    let open: (Bol24Entry) -> Void
    let add: () -> Void
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    var body: some View {
        VStack(spacing: 14) {
            Bol24HomeCard(home: home)
            if home.canEdit { Bol24Actions(home: home, add: add) }
            Bol24Review(home: home, open: open)
            Bol24Categories(home: home)
            Bol24History(home: home)
            Bol24Recent(home: home, open: open)
            // Prompt 47: «Delt med N» er flyttet til «Rediger bolig» (Boliger47.swift).
        }
    }
}

/* ---------- Handlinger: Skann · Last opp · Ny utgift (prompt 47: «Fra e-post» er fjernet på mobil) ---------- */

struct Bol24Actions: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let home: Bol24Home
    let add: () -> Void
    @State private var photos: [PhotosPickerItem] = []
    @State private var files: Bool = false

    var body: some View {
        let cols: [GridItem] = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
        LazyVGrid(columns: cols, spacing: 8) {
            Button { scan() } label: { tile("Skann", red: true) { Bol24ScanGlyph() } }.buttonStyle(.plain)
            Menu {
                PhotosPicker(selection: $photos, maxSelectionCount: 10, matching: .images) { Label("Bilder", systemImage: "photo") }
                Button { files = true } label: { Label("Filer (PDF og bilder)", systemImage: "doc") }
            } label: {
                tile("Last opp", red: false) { Image(systemName: "square.and.arrow.up").font(.system(size: 16, weight: .semibold)) }
            }
            .buttonStyle(.plain)
            Button(action: add) { tile("Ny utgift", red: false) { Text("+").font(.system(size: 20)) } }.buttonStyle(.plain)
        }
        .onChange(of: photos) { _, items in
            guard !items.isEmpty else { return }
            let id: Int = home.id
            Task { @MainActor in
                var list: [Store.Upload] = []
                for it in items {
                    if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { list.append(.image(img)) }
                }
                photos = []
                if !list.isEmpty { store.uploadToFolder(id, list); await reloadSoon(id) }
            }
        }
        .fileImporter(isPresented: $files, allowedContentTypes: [.pdf, .jpeg, .png, .heic, .image], allowsMultipleSelection: true) { r in
            guard case .success(let urls) = r else { return }
            var list: [Store.Upload] = []
            for u in urls {
                guard u.startAccessingSecurityScopedResource() else { continue }
                defer { u.stopAccessingSecurityScopedResource() }
                guard let d = try? Data(contentsOf: u) else { continue }
                if u.pathExtension.lowercased() == "pdf" { list.append(.pdf(d)) } else if let img = UIImage(data: d) { list.append(.image(img)) }
            }
            if !list.isEmpty {
                let id: Int = home.id
                store.uploadToFolder(id, list)
                Task { await reloadSoon(id) }
            }
        }
    }

    private func tile<I: View>(_ title: String, red: Bool, @ViewBuilder icon: () -> I) -> some View {
        VStack(spacing: 6) {
            icon()
                .foregroundStyle(red ? p.onLab : p.ink)
                .frame(width: 38, height: 38)
                .background(Circle().fill(red ? p.lab : p.bg))
            Text(title).font(PF.ui(12, .bold)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.8)
        }
        .padding(.vertical, 12).padding(.horizontal, 4)
        .frame(maxWidth: .infinity)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .contentShape(Rectangle())
    }

    private func scan() {
        Haptics.shared.tap()
        store.uploadFolder = home.id
        store.scanTarget = "receipt"
        store.paperScanOpen = true
    }

    private func reloadSoon(_ id: Int) async {
        try? await Task.sleep(nanoseconds: 2_500_000_000)
        await Bol24Model.shared.loadDetail(id, store)
    }
}

/// Skann-ikonet fra designet (hjørner og strek).
struct Bol24ScanGlyph: View {
    var body: some View {
        Fam22Glyph(d: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8", size: 19, stroke: 2, color: Color.white)
    }
}

/* ---------- Til gjennomgang ---------- */

struct Bol24Review: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let home: Bol24Home
    let open: (Bol24Entry) -> Void
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    private var list: [Bol24Entry] { home.entries.filter { $0.review } }

    var body: some View {
        if !list.isEmpty {
            VStack(spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    PLabel(text: "Til gjennomgang · \(list.count)", size: 11)
                    Spacer()
                    if home.canEdit {
                        Button {
                            let id: Int = home.id
                            Task { await m.approveAll(id, store) }
                        } label: {
                            Text("Godkjenn alle").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 4)
                ForEach(list) { e in card(e) }
            }
        }
    }

    private func card(_ e: Bol24Entry) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                thumb(e)
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.description).font(PF.ui(15, .bold)).foregroundStyle(p.ink).lineLimit(1)
                    Text(e.pending ? "Gemini leser kvitteringen …" : "AI foreslår " + e.category + (e.paidBy.isEmpty ? "" : " · " + e.paidBy))
                        .font(PF.ui(12.5)).foregroundStyle(e.pending ? p.lab : p.mut).lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(e.pending ? "…" : bol24kr(e.amount)).font(PF.mono(15)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
                Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
            }
            // Prompt 30: hele toppraden (miniatyr · butikk · forslag · beløp · ›) åpner detaljarket, også mens AI leser.
            .contentShape(Rectangle())
            .onTapGesture { Haptics.shared.tap(); open(e) }
            .accessibilityAddTraits(.isButton)
            if !e.pending && home.canEdit {
                chips(e)
                HStack(spacing: 8) {
                    Bol24Button(title: "Detaljer", fg: p.ink, bg: Color.clear, border: p.line, height: 40, font: 13.5) { open(e) }
                    Bol24Button(title: "Godkjenn", fg: p.bg, bg: p.ink, border: nil, height: 40, font: 13.5) {
                        let hid: Int = home.id
                        Task { await m.entry(hid, e.id, ["status": "ok"], store, done: "Godkjent · " + e.category) }
                    }
                }
            }
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(e.pending ? p.line : p.lab, lineWidth: 1.5))
    }

    private func thumb(_ e: Bol24Entry) -> some View {
        let path: String? = e.receiptId.isEmpty ? nil : "/finans/api/folders/\(home.id)/receipts/\(e.receiptId)/thumb"
        return ZStack {
            if let path {
                PaperServerImage(path: path, tint: p.bg, initials: "⎙")
            } else {
                Text("⎙").font(.system(size: 16)).foregroundStyle(p.mut)
            }
        }
        .frame(width: 42, height: 52)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 8))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(p.line, lineWidth: 1))
    }

    /// Forslaget først, så tre andre hovedkategorier.
    private func chips(_ e: Bol24Entry) -> some View {
        var names: [Bol24Cat] = []
        if let c = home.cats.first(where: { $0.name == e.category }) { names.append(c) } else { names.append(Bol24Cat(id: e.categoryId ?? 0, name: e.category, color: e.color)) }
        for c in home.cats where c.name != e.category && c.name != "Annet" && names.count < 4 { names.append(c) }
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(names) { c in
                    Bol24Chip(name: c.name, color: c.color, on: c.name == e.category) {
                        let hid: Int = home.id
                        Task { await m.entry(hid, e.id, ["categoryId": c.id], store) }
                    }
                }
            }
        }
    }
}

/// Kategori-chip: høyde 32–34, prikk i kategorifarge. Valgt = ink.
struct Bol24Chip: View {
    @Environment(\.paper) private var p
    let name: String
    let color: String
    let on: Bool
    var height: CGFloat = 32
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Circle().fill(Color(hex: color)).frame(width: 8, height: 8)
                Text(name).font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
            }
            .padding(.horizontal, 12)
            .frame(height: height)
            .background(Capsule().fill(on ? p.ink : Color.clear))
            .overlay(Capsule().strokeBorder(on ? p.ink : p.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Kategorier denne måneden ---------- */

struct Bol24CatSum: Identifiable {
    let id: String
    let name: String
    let color: String
    let value: Double
    let count: Int
}

enum Bol24Calc {
    static func byCategory(_ entries: [Bol24Entry]) -> [Bol24CatSum] {
        var order: [String] = []
        var sums: [String: Double] = [:]
        var counts: [String: Int] = [:]
        var colors: [String: String] = [:]
        for e in entries where !e.pending {
            if sums[e.category] == nil { order.append(e.category) }
            sums[e.category, default: 0] += e.amount
            counts[e.category, default: 0] += 1
            colors[e.category] = e.color
        }
        let out: [Bol24CatSum] = order.map { (n: String) -> Bol24CatSum in
            Bol24CatSum(id: n, name: n, color: colors[n] ?? "#7a7468", value: sums[n] ?? 0, count: counts[n] ?? 0)
        }
        return out.filter { $0.value > 0 }.sorted { $0.value > $1.value }
    }
}

struct Bol24Categories: View {
    @Environment(\.paper) private var p
    let home: Bol24Home
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    var body: some View {
        let month: String = Bol24Model.thisMonth
        let list: [Bol24CatSum] = Bol24Calc.byCategory(home.entries.filter { $0.month == month })
        let total: Double = list.reduce(0) { $0 + $1.value }
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Kategorier").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                Spacer()
                Text(Bol24Model.monthNames[Bol24Model.monthIndex(month)]).font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
            if list.isEmpty {
                Text("Ingen utgifter ennå denne måneden.").font(PF.ui(13)).foregroundStyle(p.mut)
            } else {
                bar(list, total)
                ForEach(list) { c in row(c, total) }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func bar(_ list: [Bol24CatSum], _ total: Double) -> some View {
        GeometryReader { g in
            let gaps: CGFloat = CGFloat(Swift.max(0, list.count - 1)) * 2
            HStack(spacing: 2) {
                ForEach(list) { c in
                    Rectangle().fill(Color(hex: c.color))
                        .frame(width: Swift.max(4, (g.size.width - gaps) * CGFloat(c.value / Swift.max(total, 1))))
                }
            }
        }
        .frame(height: 12)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func row(_ c: Bol24CatSum, _ total: Double) -> some View {
        let pct: String = total > 0 ? "\(Int((c.value / total * 100).rounded())) %" : ""
        return Button {
            Haptics.shared.select()
            m.filter = c.name
            m.tab = "ex"
        } label: {
            HStack(spacing: 10) {
                Text(Bol24Icon.glyph(c.name)).font(.system(size: 14, weight: .heavy)).foregroundStyle(Color(hex: c.color))
                    .frame(width: 30, height: 30)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color(hex: c.color).opacity(0.16)))
                HStack(spacing: 0) {
                    Text(c.name).font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                    Text(" · \(c.count) " + (c.count == 1 ? "utgift" : "utgifter")).font(PF.ui(14, .medium)).foregroundStyle(p.mut)
                }
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(pct).font(PF.ui(12)).foregroundStyle(p.mut)
                Text(bol24kr(c.value)).font(PF.mono(14)).foregroundStyle(p.ink).frame(width: 86, alignment: .trailing).lineLimit(1).minimumScaleFactor(0.7)
            }
            .padding(.vertical, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Historikk (seks måneder) ---------- */

struct Bol24History: View {
    @Environment(\.paper) private var p
    let home: Bol24Home

    var body: some View {
        let keys: [String] = (0..<6).map { (i: Int) -> String in Bol24Model.monthKey(i - 5) }
        let vals: [Double] = keys.map { (k: String) -> Double in home.spent(k) }
        let maxV: Double = Swift.max(vals.max() ?? 1, 1)
        let prevVals: [Double] = Array(vals.prefix(5))
        let avg: Double = prevVals.reduce(0, +) / Double(Swift.max(1, prevVals.count))
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Historikk").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                Spacer()
                Text("Snitt " + bol24kr(avg)).font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(0..<6, id: \.self) { i in
                    bar(keys[i], vals[i], maxV, last: i == 5)
                }
            }
            .frame(height: 130)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func bar(_ key: String, _ v: Double, _ maxV: Double, last: Bool) -> some View {
        let k: String = String(format: "%.1f", (v / 100).rounded() / 10).replacingOccurrences(of: ".", with: ",") + "k"
        return VStack(spacing: 6) {
            Text(k).font(PF.mono(10.5)).foregroundStyle(p.mut).lineLimit(1).minimumScaleFactor(0.7)
            GeometryReader { g in
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    RoundedRectangle(cornerRadius: 8)
                        .fill(last ? Color(hex: home.color) : Color(hex: home.color).opacity(0.3))
                        .frame(height: Swift.max(4, g.size.height * CGFloat(v / maxV)))
                }
            }
            Text(Bol24Model.monthShort[Bol24Model.monthIndex(key)]).font(PF.ui(11.5, last ? .heavy : .medium)).foregroundStyle(last ? p.ink : p.mut)
        }
        .frame(maxWidth: .infinity)
    }
}

/* ---------- Siste utgifter ---------- */

struct Bol24Recent: View {
    @Environment(\.paper) private var p
    let home: Bol24Home
    let open: (Bol24Entry) -> Void
    @MainActor private var m: Bol24Model { Bol24Model.shared }

    var body: some View {
        let list: [Bol24Entry] = Array(home.entries.filter { !$0.review }.prefix(5))
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("Siste utgifter").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                Spacer()
                Button {
                    m.filter = "Alle"
                    m.tab = "ex"
                } label: {
                    Text("Alle ›").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink)
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 10).padding(.bottom, 4)
            if list.isEmpty {
                Text("Ingen utgifter ennå.").font(PF.ui(13)).foregroundStyle(p.mut).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 12)
            }
            ForEach(Array(list.enumerated()), id: \.element.id) { i, e in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                Bol24EntryRow(entry: e, full: false) { open(e) }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 6)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// En utgift: ikon i kategorifarge (36, radius 12), tittel, dato · kategori (· hvem) og beløp.
struct Bol24EntryRow: View {
    @Environment(\.paper) private var p
    let entry: Bol24Entry
    let full: Bool
    let action: () -> Void

    var body: some View {
        let e: Bol24Entry = entry
        let sub: String = ddmmyyyy(e.date) + " · " + e.category + (full && !e.paidBy.isEmpty ? " · " + e.paidBy : "")
        let rc: String = e.pending ? "Leses av AI" : (e.status == "review" ? "Til gjennomgang" : (e.receiptId.isEmpty ? "" : "⎙ Kvittering"))
        return Button(action: action) {
            HStack(spacing: 12) {
                Text(Bol24Icon.glyph(e.category)).font(.system(size: 14, weight: .heavy)).foregroundStyle(Color(hex: e.color))
                    .frame(width: 36, height: 36)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color(hex: e.color).opacity(0.16)))
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.description).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    Text(sub).font(PF.ui(12)).foregroundStyle(e.review ? p.lab : p.mut).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 1) {
                    Text(e.pending ? "…" : bol24kr(e.amount)).font(PF.mono(14)).foregroundStyle(p.ink).lineLimit(1)
                    if full && !rc.isEmpty { Text(rc).font(PF.ui(11)).foregroundStyle(p.mut).lineLimit(1) }
                }
                .fixedSize()
            }
            .padding(.vertical, full ? 12 : 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
