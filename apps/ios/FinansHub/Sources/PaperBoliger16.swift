import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/* ---------------- Papir: Boliger (Finans → Boliger) ---------------- */

private func bkr(_ v: Double) -> String { "\(neg0(v)) kr" }

/// Oversikt over boligene, og per bolig: nøkkeltall, opplasting av kvitteringer (AI velger kategori), kategorier,
/// prosjekter med budsjett mot forbruk, faste regninger med neste forfall og alle utgifter med søk.
struct PaperBoliger: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(spacing: 10) {
            if let f = store.folder {
                PaperBoligDetail(f: f)
            } else {
                list
            }
        }
        .task { if store.folders == nil { await store.loadBoligerList() } }
    }

    @ViewBuilder private var list: some View {
        let all = store.folders ?? []
        let total = all.map { $0.total ?? $0.yearTotal ?? 0 }.reduce(0, +)
        HStack(spacing: 10) {
            PKpi(label: "Totalt brukt", value: bkr(total))
            PKpi(label: "Boliger", value: "\(all.count)")
        }
        if store.folders == nil {
            PCard { HStack { ProgressView(); Text("Henter boligene …").font(PF.ui(13.5)).foregroundStyle(p.mut) } }
        } else if all.isEmpty {
            PCard {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Ingen boliger ennå").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                    Text("Lag en bolig i FinansHub på nett under Innstillinger → Boliger. Da kan du laste opp kvitteringer rett hit.")
                        .font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
        } else {
            ForEach(Array(all.enumerated()), id: \.element.id) { i, f in
                Button { Haptics.shared.tap(); store.openFolder(f.id) } label: { card(f, i) }.buttonStyle(.plain)
            }
        }
    }

    private func card(_ f: Folder, _ i: Int) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon(f)).font(.system(size: 20, weight: .semibold)).foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(PaperIconTheme.color(store.iconTheme, i), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(f.name).font(PF.serif(20, medium: true)).foregroundStyle(p.ink).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                Text([f.address, f.count.map { "\($0) utgifter" }, f.readOnly ? "Bare lesetilgang" : nil].compactMap { $0 }.joined(separator: " · "))
                    .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 2) {
                Text(bkr(f.total ?? f.yearTotal ?? 0)).font(PF.serif(17, medium: true)).foregroundStyle(p.ink)
                Text("›").font(PF.ui(15)).foregroundStyle(p.mut)
            }
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func icon(_ f: Folder) -> String {
        let t = (f.type ?? f.name).lowercased()
        if t.contains("hytte") { return "tree" }
        if t.contains("felles") || t.contains("delt") { return "person.2" }
        if t.contains("leil") { return "building.2" }
        return "house"
    }
}

/// Én bolig.
struct PaperBoligDetail: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let f: Folder
    @State private var q = ""
    @State private var photos: [PhotosPickerItem] = []
    @State private var files = false
    @State private var showAll = false

    var body: some View {
        VStack(spacing: 10) {
            kpis
            if !f.readOnly { upload }
            upcoming
            receiptsRow
            categories
            projects
            bills
            entries
        }
        .onChange(of: photos) { _, items in
            guard !items.isEmpty else { return }
            Task {
                var list: [Store.Upload] = []
                for it in items {
                    if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { list.append(.image(img)) }
                }
                photos = []
                if !list.isEmpty { store.uploadToFolder(f.id, list) }
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
            if !list.isEmpty { store.uploadToFolder(f.id, list) }
        }
    }

    private var monthSum: Double {
        let m = String(isoDay(Date()).prefix(7))
        return (f.entries ?? []).filter { ($0.date ?? "").hasPrefix(m) }.compactMap(\.amount).reduce(0, +)
    }

    private var kpis: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                PKpi(label: "Totalt", value: bkr(f.total ?? f.yearTotal ?? 0))
                PKpi(label: "Denne måneden", value: bkr(monthSum))
            }
            HStack(spacing: 8) {
                PKpi(label: "Utgifter", value: "\(f.entries?.count ?? f.count ?? 0)")
                PKpi(label: "Deles med", value: "\(Swift.max(0, (f.members?.count ?? 1)))")
            }
        }
    }

    private var upload: some View {
        VStack(alignment: .leading, spacing: 10) {
            PLabel(text: "Legg til kvittering")
            Text("✦ AI leser kvitteringen og velger kategori og underkategori i \(f.name).").font(PF.ui(12.5)).foregroundStyle(p.mut)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Button { store.uploadFolder = f.id; store.paperScanOpen = true } label: { pill("camera", "Skann") }.buttonStyle(.plain)
                PhotosPicker(selection: $photos, maxSelectionCount: 10, matching: .images) { pill("photo", "Bilder") }.buttonStyle(.plain)
                Button { files = true } label: { pill("doc", "Filer") }.buttonStyle(.plain)
            }
            if store.uploading > 0 {
                HStack(spacing: 8) { ProgressView(); Text("Laster opp \(store.uploading) …").font(PF.ui(12.5)).foregroundStyle(p.mut) }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func pill(_ icon: String, _ t: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 13, weight: .semibold))
            Text(t).font(PF.ui(13, .semibold))
        }
        .foregroundStyle(p.onLab)
        .frame(maxWidth: .infinity, minHeight: 40)
        .background(p.lab, in: Capsule())
    }

    @ViewBuilder private var upcoming: some View {
        let list = f.upcoming ?? []
        if !list.isEmpty {
            PSection(title: "Kommende forfall", trailing: "\(list.count)")
            VStack(spacing: 0) {
                ForEach(Array(list.prefix(6).enumerated()), id: \.offset) { i, u in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    HStack(spacing: 12) {
                        RoundedRectangle(cornerRadius: 3).fill(Color(hex: u.color ?? "#b23a2a")).frame(width: 6, height: 32)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(u.title ?? "").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                            Text([u.sub, u.date.map { ddmm($0) }].compactMap { $0 }.joined(separator: " · ")).font(PF.ui(12)).foregroundStyle(p.mut)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(bkr(u.amount ?? 0)).font(PF.serif(15, medium: true)).foregroundStyle(p.ink)
                            if let d = u.days { Text(d <= 0 ? "I dag" : "om \(d) d").font(PF.ui(11.5)).foregroundStyle(d <= 7 ? p.lab : p.mut) }
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    @ViewBuilder private var receiptsRow: some View {
        let list = f.receipts ?? []
        if !list.isEmpty {
            PSection(title: "Kvitteringer", trailing: "\(list.count)")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(list.prefix(20).enumerated()), id: \.offset) { _, r in
                        VStack(alignment: .leading, spacing: 4) {
                            PaperServerImage(path: thumbPath(r), tint: p.popSel, initials: "⎙")
                                .frame(width: 120, height: 96)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            Text(r.description ?? "Kvittering").font(PF.ui(12, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                            Text((r.pending == true ? "✦ Leses · " : "") + bkr(r.amount ?? 0)).font(PF.ui(11)).foregroundStyle(r.pending == true ? p.lab : p.mut)
                        }
                        .frame(width: 120)
                        .padding(8)
                        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                }
            }
        }
    }

    /// Miniatyren ligger under /finans/api (serveren kan sende stien med eller uten prefiks).
    private func thumbPath(_ r: BoligReceipt) -> String? {
        if let t = r.thumbUrl, !t.isEmpty { return t.hasPrefix("/folders") ? "/finans/api" + t : t }
        if let rid = r.receiptId { return "/finans/api/folders/\(f.id)/receipts/\(rid)/thumb" }
        return nil
    }

    @ViewBuilder private var categories: some View {
        let cats = (f.categories ?? []).filter { ($0.amount ?? 0) > 0 }.sorted { ($0.amount ?? 0) > ($1.amount ?? 0) }
        if !cats.isEmpty {
            let top = cats.first?.amount ?? 1
            PSection(title: "Kategorier", trailing: "\(cats.count)")
            VStack(spacing: 10) {
                ForEach(Array(cats.prefix(8).enumerated()), id: \.offset) { i, c in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(c.name ?? "Annet").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                            Spacer()
                            Text(bkr(c.amount ?? 0)).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
                        }
                        GeometryReader { g in
                            ZStack(alignment: .leading) {
                                Capsule().fill(p.popSel)
                                Capsule().fill(PaperIconTheme.color(store.iconTheme, i)).frame(width: Swift.max(6, g.size.width * CGFloat((c.amount ?? 0) / Swift.max(top, 1))))
                            }
                        }
                        .frame(height: 8)
                        if let subs = c.children, !subs.isEmpty {
                            Text(subs.prefix(3).map { "\($0.name ?? "") \(n0($0.amount ?? 0))" }.joined(separator: " · ")).font(PF.ui(11.5)).foregroundStyle(p.mut)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            .padding(14)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    @ViewBuilder private var projects: some View {
        let list = f.projects ?? []
        if !list.isEmpty {
            PSection(title: "Prosjekter", trailing: "\(list.count)")
            VStack(spacing: 0) {
                ForEach(Array(list.enumerated()), id: \.offset) { i, pr in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    projectRow(pr)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    private func projectRow(_ pr: Project) -> some View {
        let budget = pr.budget ?? 0, spent = pr.spent ?? 0
        let ratio = budget > 0 ? spent / budget : 0
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(pr.name ?? "Prosjekt").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                    if let v = pr.vendor, !v.isEmpty { Text(v).font(PF.ui(12)).foregroundStyle(p.mut) }
                }
                Spacer()
                Text(budget > 0 ? "\(n0(spent)) av \(bkr(budget))" : bkr(spent)).font(PF.ui(13, .semibold)).foregroundStyle(ratio > 1 ? p.lab : p.ink)
            }
            if budget > 0 {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(p.popSel)
                        Capsule().fill(ratio > 1 ? p.lab : p.pos).frame(width: g.size.width * CGFloat(Swift.min(ratio, 1)))
                    }
                }
                .frame(height: 7)
                Text(ratio > 1 ? "\(bkr(spent - budget)) over budsjett" : "\(bkr(budget - spent)) igjen av budsjettet").font(PF.ui(11.5)).foregroundStyle(ratio > 1 ? p.lab : p.mut)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
    }

    @ViewBuilder private var bills: some View {
        let list = (f.bills ?? []).sorted { ($0.nextDue ?? "9999") < ($1.nextDue ?? "9999") }
        if !list.isEmpty {
            PSection(title: "Faste regninger", trailing: "\(list.count)")
            VStack(spacing: 0) {
                ForEach(Array(list.enumerated()), id: \.offset) { i, b in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(b.name ?? "Regning").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                            Text([b.freq, b.payer].compactMap { $0 }.joined(separator: " · ")).font(PF.ui(12)).foregroundStyle(p.mut)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(bkr(b.amount ?? 0)).font(PF.serif(15, medium: true)).foregroundStyle(p.ink)
                            Text(b.nextDue.map { "Neste " + ddmm($0) } ?? "").font(PF.ui(11.5)).foregroundStyle(dueSoon(b.nextDue) ? p.lab : p.mut)
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    private func dueSoon(_ d: String?) -> Bool {
        guard let d, d.count >= 10 else { return false }
        let soon = isoDay(Date().addingTimeInterval(7 * 86400))
        return String(d.prefix(10)) <= soon
    }

    @ViewBuilder private var entries: some View {
        let all = (f.entries ?? []).sorted { ($0.date ?? "") > ($1.date ?? "") }
        let needle = q.trimmingCharacters(in: .whitespaces).lowercased()
        let hits = needle.isEmpty ? all : all.filter { e in
            [e.description, e.category, e.subcategory, e.aiShort, e.paidBy].compactMap { $0?.lowercased() }.contains { $0.contains(needle) }
        }
        let shown = showAll || !needle.isEmpty ? hits : Array(hits.prefix(12))
        PSection(title: "Alle utgifter", trailing: "\(hits.count)")
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(p.mut)
            TextField("Søk i utgiftene", text: $q).font(PF.ui(14)).foregroundStyle(p.ink).autocorrectionDisabled()
        }
        .padding(.horizontal, 14).frame(height: 42)
        .background(p.card, in: Capsule())
        if shown.isEmpty {
            PCard { Text(needle.isEmpty ? "Ingen utgifter ennå. Last opp en kvittering over." : "Ingen treff.").font(PF.ui(13.5)).foregroundStyle(p.mut) }
        } else {
            VStack(spacing: 0) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { i, e in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    entryRow(e)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            if !showAll && needle.isEmpty && hits.count > 12 {
                PLineButton(title: "Vis alle \(hits.count)", height: 40, full: true) { showAll = true }
            }
        }
    }

    private func entryRow(_ e: Entry) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(ddmm(e.date)).font(PF.mono(10, bold: false)).foregroundStyle(p.mut).frame(width: 42, alignment: .leading).padding(.top, 2)
            VStack(alignment: .leading, spacing: 2) {
                Text(e.description ?? "Utgift").font(PF.ui(14, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                let cat = [e.category, e.subcategory].compactMap { $0 }.joined(separator: " › ")
                if !cat.isEmpty { Text((e.aiCategory ? "✦ " : "") + cat).font(PF.ui(12)).foregroundStyle(e.aiCategory ? p.lab : p.mut) }
                if let s = e.aiShort, !s.isEmpty { Text(s).font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true) }
            }
            Spacer(minLength: 6)
            Text(bkr(e.amount ?? 0)).font(PF.serif(15, medium: true)).foregroundStyle(p.ink)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }
}
