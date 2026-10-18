import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import UIKit

/* ---------------- Mat (tidligere Matplan): design 2a fra «Mat Varianter» ---------------- */

/// Fargene og fontene i Mat. «2a» er den mørke, varme kokeboka (klassisk app). «Papir» følger Papir-temaet.
struct MatPal {
    let dark: Bool
    let bg, card, field, text, sub, muted, line, accent, accentInk, lime, limeInk, cream, creamInk, chip, chipInk: Color
    let paperFonts: Bool

    /// Mørk varm grunn #15140F, kort #1D1C16, kanter #2E2C24, limegrønn dag #D4F25A og aksent #FF8A4C.
    static let twoA = MatPal(dark: true, bg: Color(hex: "#15140F"), card: Color(hex: "#1D1C16"), field: Color(hex: "#15140F"), text: Color(hex: "#F2EEE4"),
                             sub: Color(hex: "#C9C3B5"), muted: Color(hex: "#9A9588"), line: Color(hex: "#2E2C24"), accent: Color(hex: "#FF8A4C"),
                             accentInk: Color(hex: "#2A1004"), lime: Color(hex: "#D4F25A"), limeInk: Color(hex: "#141A06"), cream: Color(hex: "#F2EEE4"),
                             creamInk: Color(hex: "#15140F"), chip: Color(hex: "#3A2A1A"), chipInk: Color(hex: "#FFB27F"), paperFonts: false)

    static func paper(_ p: PaperPalette) -> MatPal {
        MatPal(dark: p.dark, bg: p.bg, card: p.card, field: p.bg, text: p.ink, sub: p.ink.opacity(0.75), muted: p.mut, line: p.line, accent: p.lab,
               accentInk: .white, lime: Color(hex: "#D4F25A"), limeInk: Color(hex: "#141A06"), cream: p.ink, creamInk: p.bg,
               chip: p.dark ? Color(hex: "#3A2A1A") : Color(hex: "#F3E3D9"), chipInk: p.dark ? Color(hex: "#FFB27F") : p.lab, paperFonts: true)
    }

    /// Instrument Serif i 2a, Newsreader i Papir.
    func serif(_ size: CGFloat) -> Font { paperFonts ? PF.serif(size, medium: true) : .custom("InstrumentSerif-Regular", size: size) }
    func mono(_ size: CGFloat) -> Font { PF.mono(size) }
    func ui(_ size: CGFloat, _ w: Font.Weight = .regular) -> Font { PF.ui(size, w) }
    /// Dagens rett: Bricolage Grotesque ExtraBold.
    func bold(_ size: CGFloat) -> Font { .custom("BricolageGrotesque-ExtraBold", size: size) }
}

private let shortDay = ["MAN", "TIR", "ONS", "TOR", "FRE", "LØR", "SØN"]
private let longDay = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"]
private let monthShort = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]
private let monthLong = ["JANUAR", "FEBRUAR", "MARS", "APRIL", "MAI", "JUNI", "JULI", "AUGUST", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"]

private func dayNum(_ iso: String) -> Int { Int(iso.suffix(2)) ?? 0 }
private func monthIdx(_ iso: String) -> Int { (Int(iso.dropFirst(5).prefix(2)) ?? 1) - 1 }

/// Den klassiske appen: Mat som egen flate i 2a-designet.
struct MatSurface: View {
    @Environment(Store.self) private var store
    var body: some View {
        ScrollView {
            MatView(pal: .twoA, paperMode: false)
                .padding(.horizontal, 18).padding(.top, 6).padding(.bottom, 40)
        }
        .background(MatPal.twoA.bg.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .refreshable { try? await store.loadWeek(); await store.loadMatExtras() }
        .sheet(isPresented: Binding(get: { store.dishSel != nil }, set: { if !$0 { store.dishSel = nil } })) {
            if let id = store.dishSel { DishDetailView(id: id, pal: .twoA).presentationBackground(MatPal.twoA.bg) }
        }
    }
}

/// Uka, dagens rett med steg, mapper, oppskrifter, skanning, import og handleliste.
struct MatView: View {
    @Environment(Store.self) private var store
    let pal: MatPal
    let paperMode: Bool
    @State private var step = 0
    @State private var newFolder = false
    @State private var folderName = ""
    @State private var renaming: MatFolder?
    @State private var camera = false
    @State private var photos = false
    @State private var files = false
    @State private var photoItems: [PhotosPickerItem] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !paperMode { header }
            if let e = store.moduleError { Text(e).font(pal.ui(13)).foregroundStyle(pal.accent) }
            if paperMode {
                // Papir: Dagens middag, Ukeplan, Mapper og Skann og import kan flyttes og skjules (hold inne).
                PaperCardStack(page: "mat", cards: [
                    PaperCardDef(key: "m1", label: "Dagens middag", view: AnyView(todaySection)),
                    PaperCardDef(key: "m2", label: "Ukeplan", view: AnyView(weekSection)),
                    PaperCardDef(key: "m3", label: "Mapper", view: AnyView(VStack(alignment: .leading, spacing: 12) { folders; recipes })),
                    PaperCardDef(key: "m4", label: "Skann og import", view: AnyView(VStack(alignment: .leading, spacing: 12) { actions; jobs })),
                ])
            } else {
                if let w = store.week, !w.days.isEmpty {
                    todayCard(w)
                    weekList(w)
                } else if store.moduleError == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(40)
                }
                folders
                actions
                jobs
                recipes
            }
            shopping
            Button { store.matFull = true } label: {
                Text("Hele uka med kokk, kost og faste dager ›").font(pal.ui(13.5, .semibold)).foregroundStyle(pal.muted).frame(maxWidth: .infinity, minHeight: 40)
            }
            .buttonStyle(.plain)
        }
        .task {
            if store.week == nil { try? await store.loadWeek() }
            if store.matFolders.isEmpty { await store.loadMatExtras() }
        }
        .alert("Ny mappe", isPresented: $newFolder) {
            TextField("Navn", text: $folderName)
            Button("Lag mappe") { store.addFolder(folderName); folderName = "" }
            Button("Avbryt", role: .cancel) { folderName = "" }
        }
        .alert("Gi nytt navn", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Navn", text: $folderName)
            Button("Lagre") { if let f = renaming { store.renameFolder(f, folderName) }; folderName = ""; renaming = nil }
            Button("Avbryt", role: .cancel) { folderName = ""; renaming = nil }
        }
        .sheet(isPresented: Binding(get: { store.matImport }, set: { store.matImport = $0; if !$0 { store.recipePreview = nil } })) {
            RecipeImportSheet(pal: pal).presentationDetents([.large]).presentationBackground(pal.bg)
        }
        .fullScreenCover(isPresented: $camera) { CameraView { img in if let img { store.scanRecipe([.image(img)]) } }.ignoresSafeArea() }
        .photosPicker(isPresented: $photos, selection: $photoItems, maxSelectionCount: 10, matching: .images)
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                var list: [Store.Upload] = []
                for it in items {
                    if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { list.append(.image(img)) }
                }
                photoItems = []
                store.scanRecipe(list)
            }
        }
        .fileImporter(isPresented: $files, allowedContentTypes: [.pdf, .jpeg, .heic, .image], allowsMultipleSelection: true) { r in
            guard case .success(let urls) = r else { return }
            var list: [Store.Upload] = []
            for u in urls {
                guard u.startAccessingSecurityScopedResource() else { continue }
                defer { u.stopAccessingSecurityScopedResource() }
                guard let d = try? Data(contentsOf: u) else { continue }
                if u.pathExtension.lowercased() == "pdf" { list.append(.pdf(d)) } else if let img = UIImage(data: d) { list.append(.image(img)) }
            }
            store.scanRecipe(list)
        }
    }

    /* ---------- Topp ---------- */

    @ViewBuilder private var todaySection: some View {
        if let w = store.week, !w.days.isEmpty {
            todayCard(w)
        } else if store.moduleError == nil {
            ProgressView().frame(maxWidth: .infinity).padding(40)
        }
    }

    @ViewBuilder private var weekSection: some View {
        if let w = store.week, !w.days.isEmpty { weekList(w) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(weekLabel).font(pal.mono(11.5)).tracking(1.4).foregroundStyle(pal.muted).lineLimit(1)
                    Text("Mat").font(pal.serif(56)).foregroundStyle(pal.text)
                }
                Spacer()
                if store.topRowTitle == nil { Avatar() }
            }
            HStack(spacing: 8) {
                Button { store.planWeek() } label: {
                    Text("✦ Lag ny uke").font(pal.ui(14, .semibold)).foregroundStyle(pal.creamInk).padding(.horizontal, 16).frame(height: 44)
                        .background(pal.cream, in: Capsule())
                }
                .buttonStyle(.plain)
                scanMenu {
                    Text("+ Skann eller importer").font(pal.ui(14, .semibold)).foregroundStyle(pal.accentInk).padding(.horizontal, 16).frame(height: 44)
                        .background(pal.accent, in: Capsule())
                }
            }
        }
    }

    private func scanMenu<L: View>(@ViewBuilder _ label: () -> L) -> some View {
        Menu {
            Button { camera = true } label: { Label("Skann oppskrift med kamera", systemImage: "camera") }
            Button { photos = true } label: { Label("Velg fra Bilder", systemImage: "photo.on.rectangle") }
            Button { files = true } label: { Label("Velg fil (PDF eller bilde)", systemImage: "doc") }
            Button { store.matImport = true } label: { Label("Importer fra nettside", systemImage: "link") }
        } label: { label() }
    }

    private var weekLabel: String {
        guard let w = store.week, let s = w.start ?? w.days.first?.date else { return "MAT" }
        let e = w.end ?? w.days.last?.date ?? s
        let n = w.week.map { "UKE \($0) · " } ?? ""
        return n + "\(dayNum(s)).–\(dayNum(e)). \(monthLong[monthIdx(e) % 12])"
    }

    /* ---------- Dagens rett ---------- */

    private func todayIndex(_ w: Week) -> Int {
        let iso = isoDay(Date())
        return w.days.firstIndex { $0.today == true || $0.date == iso } ?? 0
    }

    private func dishOf(_ d: MealDay, _ w: Week) -> Dish? {
        (w.dishes ?? []).first { $0.id == d.dishId } ?? (w.dishes ?? []).first { $0.name == d.name }
    }

    private func todayCard(_ w: Week) -> some View {
        let ti = todayIndex(w)
        let d = w.days[ti]
        let dish = dishOf(d, w)
        let steps = dish?.steps ?? []
        let meta = todayMeta(dish)
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("I DAG · \(longDay[ti % 7].uppercased())").font(pal.ui(12.5, .heavy))
                Spacer()
                Text(meta).font(pal.ui(12.5, .bold))
            }
            Text(d.name ?? "Ingen rett ennå").font(pal.bold(34)).tracking(-0.8).lineLimit(3).minimumScaleFactor(0.7)
            Text(d.cook.map { "\($0) lager middag" } ?? "Ingen kokk valgt").font(pal.ui(14, .semibold))
            if !steps.isEmpty {
                let s = Swift.min(step, steps.count - 1)
                Button { withAnimation(.easeOut(duration: 0.2)) { step = (s + 1) % steps.count } } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("STEG \(s + 1) AV \(steps.count) · trykk for neste").font(pal.ui(12, .bold))
                        Text(steps[s]).font(pal.ui(15.5, .semibold)).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 4) {
                            ForEach(0..<steps.count, id: \.self) { i in
                                Capsule().fill(pal.limeInk.opacity(i <= s ? 0.85 : 0.18)).frame(height: 5)
                            }
                        }
                    }
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    .background(pal.limeInk.opacity(0.1), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .foregroundStyle(pal.limeInk)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(pal.lime, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture { if let dish { store.dishSel = dish.id.value } }
        .contextMenu { dayMenu(d, w) }
    }

    private func todayMeta(_ dish: Dish?) -> String {
        var parts: [String] = []
        if let t = dish?.time { parts.append("\(t) min") }
        if let s = dish?.servings { parts.append("\(s) porsjoner") }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder private func dayMenu(_ d: MealDay, _ w: Week) -> some View {
        Button { store.planDay(d.date) } label: { Label("✦ Foreslå en annen rett", systemImage: "sparkles") }
        Button { store.toggleFixed(d) } label: { Label((d.fixed ?? false) ? "Ikke fast denne dagen" : "Fast denne dagen", systemImage: "pin") }
        if !(w.cooks ?? []).isEmpty {
            Menu("Kokk") { ForEach(w.cooks ?? [], id: \.self) { c in Button(c) { store.setCook(d.date, c) } } }
        }
    }

    /* ---------- Uka ---------- */

    private func weekList(_ w: Week) -> some View {
        let ti = todayIndex(w)
        return VStack(alignment: .leading, spacing: 0) {
            sectionHead("UKA", w.week.map { "Uke \($0)" } ?? "")
            ForEach(Array(w.days.enumerated()), id: \.offset) { i, d in
                let dish = dishOf(d, w)
                Button { if let dish { store.dishSel = dish.id.value } } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(shortDay[i % 7]).font(pal.mono(11)).foregroundStyle(i == ti ? pal.accent : pal.muted).frame(width: 34, alignment: .leading)
                        Text(d.name ?? "–").font(pal.serif(19)).foregroundStyle(d.name == nil ? pal.muted : pal.text).lineLimit(1)
                        Spacer(minLength: 4)
                        Text((d.cook ?? "") + ((d.fixed ?? false) ? " · fast" : "")).font(pal.ui(12)).foregroundStyle(pal.muted).lineLimit(1)
                    }
                    .padding(.vertical, 9).padding(.horizontal, 2)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .contextMenu { dayMenu(d, w) }
                Rectangle().fill(pal.line).frame(height: 1)
            }
        }
    }

    private func sectionHead(_ t: String, _ trailing: String) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(t).font(pal.mono(10.5)).tracking(1.3).foregroundStyle(pal.paperFonts ? pal.accent : pal.muted)
                Spacer()
                Text(trailing).font(pal.ui(12)).foregroundStyle(pal.muted)
            }
            .padding(.horizontal, 2).padding(.bottom, 6)
            Rectangle().fill(pal.paperFonts ? pal.text : pal.line).frame(height: pal.paperFonts ? 2 : 1)
        }
        .padding(.top, 6)
    }

    /* ---------- Mapper ---------- */

    private var folders: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                chip("Alle", store.matFolder == nil, count: store.week?.dishes?.count) { store.matFolder = nil }
                ForEach(store.matFolders) { f in
                    chip(f.name, store.matFolder == f.id, count: f.count) { store.matFolder = store.matFolder == f.id ? nil : f.id }
                        .contextMenu {
                            Button { folderName = f.name; renaming = f } label: { Label("Gi nytt navn", systemImage: "pencil") }
                            Button(role: .destructive) { store.deleteFolder(f) } label: { Label("Slett mappen", systemImage: "trash") }
                        }
                }
                Button { newFolder = true } label: {
                    Text("+ Ny mappe").font(pal.ui(13.5, .semibold)).foregroundStyle(pal.chipInk).padding(.horizontal, 14).frame(height: 36)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 4)
    }

    private func chip(_ t: String, _ on: Bool, count: Int?, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack(spacing: 6) {
                Text(t).font(pal.ui(13.5, .semibold))
                if let count, count > 0 { Text("\(count)").font(pal.ui(11.5)).opacity(0.7) }
            }
            .foregroundStyle(on ? pal.creamInk : pal.text)
            .padding(.horizontal, 14).frame(height: 36)
            .background(on ? pal.cream : pal.card, in: Capsule())
            .overlay(Capsule().stroke(on ? Color.clear : pal.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /* ---------- Skann og importer ---------- */

    private var actions: some View {
        HStack(spacing: 8) {
            scanMenu {
                Text("Skann oppskrift").font(pal.ui(14, .bold)).foregroundStyle(pal.creamInk).frame(maxWidth: .infinity, minHeight: 48)
                    .background(pal.cream, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            Button { store.matImport = true } label: {
                Text("Importer lenke").font(pal.ui(14, .semibold)).foregroundStyle(pal.text).frame(maxWidth: .infinity, minHeight: 48)
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(pal.line, lineWidth: 1))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder private var jobs: some View {
        let list = store.recipeJobs.filter { $0.active || $0.status == "error" }.prefix(5)
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(list)) { j in
                    HStack(spacing: 10) {
                        if j.active { ProgressView().controlSize(.small) } else { Image(systemName: "exclamationmark.triangle").foregroundStyle(pal.accent) }
                        Text(j.name.isEmpty ? "Oppskrift" : j.name).font(pal.ui(13.5, .semibold)).foregroundStyle(pal.text).lineLimit(1)
                        Spacer()
                        Text(j.statusText).font(pal.ui(12)).foregroundStyle(j.status == "error" ? pal.accent : pal.muted).lineLimit(2)
                        if j.status == "error" {
                            Button { store.retryRecipeJob(j) } label: { Image(systemName: "arrow.clockwise").foregroundStyle(pal.text).frame(width: 30, height: 30) }
                                .buttonStyle(.plain).accessibilityLabel("Prøv igjen")
                            Button { store.deleteRecipeJob(j) } label: { Image(systemName: "xmark").foregroundStyle(pal.muted).frame(width: 30, height: 30) }
                                .buttonStyle(.plain).accessibilityLabel("Fjern")
                        }
                    }
                }
            }
            .padding(12)
            .background(pal.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    /* ---------- Oppskrifter ---------- */

    @ViewBuilder private var recipes: some View {
        let list = store.matDishes
        sectionHead(store.matFolder == nil ? "OPPSKRIFTER" : store.folderName(store.matFolder).uppercased(), "\(list.count) retter")
        if list.isEmpty {
            Text(store.matFolder == nil ? "Ingen oppskrifter ennå. Skann eller importer en." : "Ingen retter i denne mappen.").font(pal.ui(13)).foregroundStyle(pal.muted)
        }
        ForEach(list) { d in
            Button { store.dishSel = d.id.value } label: {
                HStack(spacing: 10) {
                    DishThumb(dish: d, size: 44, pal: pal)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(d.name).font(pal.ui(14.5, .semibold)).foregroundStyle(pal.text).lineLimit(1)
                        Text(dishMeta(d)).font(pal.ui(11.5)).foregroundStyle(pal.muted).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    Text("›").foregroundStyle(pal.muted)
                }
                .padding(7)
                .background(pal.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private func dishMeta(_ d: Dish) -> String {
        var parts: [String] = []
        if d.folderId != nil { parts.append(store.folderName(d.folderId)) }
        if let t = d.time { parts.append("\(t) min") }
        let n = d.ing?.count ?? 0
        if n > 0 { parts.append("\(n) ingredienser") }
        if !d.links.isEmpty { parts.append("\(d.links.count) vedlegg") }
        return parts.isEmpty ? "Egen rett" : parts.joined(separator: " · ")
    }

    /* ---------- Handleliste ---------- */

    @ViewBuilder private var shopping: some View {
        let shop = store.week?.shopping ?? []
        sectionHead("HANDLELISTE", "\(shop.filter { !$0.done }.count) igjen")
        if shop.isEmpty { Text("Handlelisten er tom.").font(pal.ui(13)).foregroundStyle(pal.muted) }
        ForEach(shop) { it in
            Button { store.toggleShop(it.id) } label: {
                HStack(spacing: 10) {
                    Text(it.done ? "✓" : "").font(.system(size: 12, weight: .bold)).foregroundStyle(pal.limeInk).frame(width: 20, height: 20)
                        .background(it.done ? pal.lime : Color.clear, in: RoundedRectangle(cornerRadius: 5))
                        .overlay(RoundedRectangle(cornerRadius: 5).stroke(it.done ? pal.lime : pal.muted, lineWidth: 1.5))
                    Text(it.text).font(pal.ui(14.5)).strikethrough(it.done).foregroundStyle(it.done ? pal.muted : pal.text)
                    Spacer()
                }
                .padding(.vertical, 5)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(it.done ? .isSelected : [])
        }
    }
}

/// Bildet av retten, eller en farget flate med forbokstaven.
struct DishThumb: View {
    @Environment(Store.self) private var store
    let dish: Dish
    let size: CGFloat
    let pal: MatPal
    @State private var img: UIImage?
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.24, style: .continuous).fill(tint)
            if let img {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Text(initial(dish.name)).font(.system(size: size * 0.4, weight: .heavy)).foregroundStyle(pal.limeInk.opacity(0.7))
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))
        .task(id: dish.image) { img = await loadImage(store, dish.image) }
    }
    private var tint: Color {
        let tiles = ["#D4F25A", "#FFB27F", "#A8D4FB", "#C3A8FF", "#7EE2A8", "#F3D38A"]
        let h = abs(dish.name.hashValue) % tiles.count
        return Color(hex: tiles[h]).opacity(0.85)
    }
}

/// Bilde fra serveren (relativ sti, med innloggingen) eller fra nettet.
@MainActor func loadImage(_ store: Store, _ raw: String?) async -> UIImage? {
    guard let raw, !raw.isEmpty else { return nil }
    if raw.hasPrefix("http://") || raw.hasPrefix("https://") {
        guard let u = URL(string: raw), let r = try? await URLSession.shared.data(from: u) else { return nil }
        return UIImage(data: r.0)
    }
    return await store.image(raw.hasPrefix("/") ? raw : "/" + raw)
}

/* ---------------- En rett: bilde, ingredienser, steg, mappe, lenker og filer ---------------- */

struct DishDetailView: View {
    @Environment(Store.self) private var store
    let id: String
    let pal: MatPal
    @State private var checked: Set<Int> = []
    @State private var linkAlert = false
    @State private var linkTitle = ""
    @State private var linkURL = ""
    @State private var fileImport = false
    @State private var img: UIImage?

    var body: some View {
        let d = store.dish(id)
        VStack(spacing: 0) {
            HStack {
                Button { store.dishSel = nil } label: {
                    Text("‹ Mat").font(pal.ui(13, .semibold)).foregroundStyle(pal.text).padding(.leading, 10).padding(.trailing, 14).frame(height: 36)
                        .overlay(Capsule().stroke(pal.line, lineWidth: 1)).contentShape(Capsule())
                }
                .buttonStyle(.plain)
                Spacer()
                if let d { folderMenu(d) }
            }
            .padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 8)
            ScrollView {
                if let d { content(d) } else { Text("Fant ikke retten.").font(pal.ui(14)).foregroundStyle(pal.muted).padding(30) }
            }
        }
        .background(pal.bg.ignoresSafeArea())
        .task(id: d?.image) { img = await loadImage(store, d?.image) }
        .sheet(isPresented: Binding(get: { store.sharedFile != nil }, set: { if !$0 { store.sharedFile = nil } })) {
            if let u = store.sharedFile { ShareSheet(url: u) }
        }
        .alert("Legg til lenke", isPresented: $linkAlert) {
            TextField("Tittel (valgfritt)", text: $linkTitle)
            TextField("https://…", text: $linkURL).keyboardType(.URL).textInputAutocapitalization(.never)
            Button("Legg til") { store.addDishLink(id, title: linkTitle, url: linkURL); linkTitle = ""; linkURL = "" }
            Button("Avbryt", role: .cancel) { linkTitle = ""; linkURL = "" }
        }
        .fileImporter(isPresented: $fileImport, allowedContentTypes: allowedFiles, allowsMultipleSelection: false) { r in
            guard case .success(let urls) = r, let u = urls.first else { return }
            guard u.startAccessingSecurityScopedResource() else { return }
            defer { u.stopAccessingSecurityScopedResource() }
            guard let data = try? Data(contentsOf: u) else { return }
            let mime = UTType(filenameExtension: u.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            store.addDishFile(id, name: u.lastPathComponent, data: data, mime: mime)
        }
    }

    private var allowedFiles: [UTType] {
        var t: [UTType] = [.pdf, .image, .commaSeparatedText, .spreadsheet, .data]
        if let x = UTType(filenameExtension: "xlsx") { t.append(x) }
        if let x = UTType(filenameExtension: "docx") { t.append(x) }
        return t
    }

    private func folderMenu(_ d: Dish) -> some View {
        Menu {
            Button { store.moveDish(id, to: nil) } label: { Label("Ingen mappe", systemImage: d.folderId == nil ? "checkmark" : "") }
            ForEach(store.matFolders) { f in
                Button { store.moveDish(id, to: f.id) } label: { Label(f.name, systemImage: d.folderId == f.id ? "checkmark" : "folder") }
            }
        } label: {
            Text("\(store.folderName(d.folderId)) ▾").font(pal.ui(13, .semibold)).foregroundStyle(pal.chipInk).padding(.horizontal, 12).frame(height: 36)
                .background(pal.chip, in: Capsule())
        }
    }

    private func content(_ d: Dish) -> some View {
        let ing = d.ing ?? []
        let steps = d.steps ?? []
        return VStack(alignment: .leading, spacing: 14) {
            if let img {
                Color.clear.frame(height: 220).overlay { Image(uiImage: img).resizable().scaledToFill() }.clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(d.name).font(pal.serif(38)).foregroundStyle(pal.text).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    Text(meta(d)).font(pal.ui(13.5)).foregroundStyle(pal.muted)
                    if let s = d.sourceUrl, !s.isEmpty {
                        Button { store.openLink(s) } label: { Text("Original oppskrift ↗").font(pal.ui(13.5, .semibold)).foregroundStyle(pal.chipInk) }.buttonStyle(.plain)
                    }
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                label("INGREDIENSER")
                if ing.isEmpty { Text("Ingen ingredienser lagt inn.").font(pal.ui(13)).foregroundStyle(pal.muted) }
                ForEach(Array(ing.enumerated()), id: \.offset) { i, n in
                    Button { if checked.contains(i) { checked.remove(i) } else { checked.insert(i) } } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Text(checked.contains(i) ? "✓" : "").font(.system(size: 11, weight: .bold)).foregroundStyle(pal.limeInk).frame(width: 18, height: 18)
                                .background(checked.contains(i) ? pal.lime : Color.clear, in: RoundedRectangle(cornerRadius: 5))
                                .overlay(RoundedRectangle(cornerRadius: 5).stroke(checked.contains(i) ? pal.lime : pal.muted, lineWidth: 1.5))
                            Text(n).font(pal.ui(14.5)).foregroundStyle(checked.contains(i) ? pal.muted : pal.text).multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 7)
                        .overlay(alignment: .bottom) { Rectangle().fill(pal.line).frame(height: 1) }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                if !ing.isEmpty {
                    Button { store.addToShop(ing) } label: {
                        Text("Legg i handlelisten").font(pal.ui(14, .semibold)).foregroundStyle(pal.creamInk).padding(.horizontal, 16).frame(height: 40)
                            .background(pal.cream, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 10)
                }
            }
            if !steps.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    label("SLIK GJØR DU")
                    ForEach(Array(steps.enumerated()), id: \.offset) { i, s in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text("\(i + 1)").font(pal.serif(21)).foregroundStyle(pal.accent).frame(width: 22, alignment: .leading)
                            Text(s).font(pal.ui(14.5)).foregroundStyle(pal.text).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.vertical, 5)
                    }
                }
            }
            links(d)
        }
        .padding(.horizontal, 18).padding(.bottom, 60)
    }

    private func meta(_ d: Dish) -> String {
        var p: [String] = []
        if let t = d.time { p.append("\(t) min") }
        if let s = d.servings { p.append("\(s) porsjoner") }
        if let n = d.ing?.count, n > 0 { p.append("\(n) ingredienser") }
        return p.joined(separator: " · ")
    }

    private func label(_ t: String) -> some View {
        Text(t).font(pal.mono(11)).tracking(1.4).foregroundStyle(pal.paperFonts ? pal.accent : pal.muted).padding(.bottom, 6)
    }

    private func links(_ d: Dish) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            label("LENKER OG FILER")
            if d.links.isEmpty { Text("F.eks. en kalkulator i Excel, en video eller en PDF.").font(pal.ui(13)).foregroundStyle(pal.muted) }
            ForEach(d.links) { l in
                Button { store.openDishLink(l) } label: {
                    HStack(spacing: 10) {
                        Image(systemName: l.icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
                            .frame(width: 30, height: 30).background(l.tint, in: RoundedRectangle(cornerRadius: 8))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(l.label).font(pal.ui(13.5, .semibold)).foregroundStyle(pal.text).lineLimit(1)
                            Text(l.kindName).font(pal.ui(11.5)).foregroundStyle(pal.muted)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "arrow.up.right").font(.system(size: 12)).foregroundStyle(pal.muted)
                    }
                    .padding(8)
                    .background(pal.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button(role: .destructive) { store.deleteDishLink(id, l) } label: { Label("Fjern", systemImage: "trash") }
                }
            }
            HStack(spacing: 8) {
                Button { linkAlert = true } label: { smallButton("+ Lenke") }.buttonStyle(.plain)
                Button { fileImport = true } label: { smallButton("+ Fil") }.buttonStyle(.plain)
            }
            .padding(.top, 4)
        }
    }

    private func smallButton(_ t: String) -> some View {
        Text(t).font(pal.ui(13.5, .semibold)).foregroundStyle(pal.text).padding(.horizontal, 16).frame(height: 38)
            .overlay(Capsule().stroke(pal.line, lineWidth: 1)).contentShape(Capsule())
    }
}

/* ---------------- Importer fra nettside (som Mealie) ---------------- */

struct RecipeImportSheet: View {
    @Environment(Store.self) private var store
    let pal: MatPal
    @State private var url = ""
    @State private var folder: String?
    @State private var picked = false
    @State private var img: UIImage?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Importer oppskrift").font(pal.serif(30)).foregroundStyle(pal.text)
                    Spacer()
                    Button { store.matImport = false } label: { Text("Lukk").font(pal.ui(14, .semibold)).foregroundStyle(pal.muted) }.buttonStyle(.plain)
                }
                Text("Lim inn adressen til en oppskrift. Serveren leser oppskriftsdataene på siden, eller lar AI lese den.").font(pal.ui(13.5)).foregroundStyle(pal.muted)
                HStack(spacing: 8) {
                    TextField("https://…", text: $url)
                        .font(pal.ui(14.5)).foregroundStyle(pal.text)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .submitLabel(.go).onSubmit { store.importRecipe(url) }
                        .padding(.horizontal, 12).frame(height: 46)
                        .background(pal.card, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(pal.line, lineWidth: 1))
                    Button { store.importRecipe(url) } label: {
                        Text(store.recipeBusy ? "Henter …" : "Hent").font(pal.ui(14, .bold)).foregroundStyle(pal.creamInk).padding(.horizontal, 16).frame(height: 46)
                            .background(pal.cream, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(store.recipeBusy)
                }
                PasteButton(payloadType: String.self) { items in
                    let s = items.first?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    DispatchQueue.main.async { if !s.isEmpty { url = s } }
                }
                .buttonBorderShape(.capsule)
                .labelStyle(.titleAndIcon)
                if let pv = store.recipePreview { preview(pv) }
            }
            .padding(20)
        }
        .background(pal.bg)
        .environment(\.colorScheme, pal.dark ? .dark : .light)

    }

    private func preview(_ pv: RecipePreview) -> some View {
        let suggested = store.matFolders.first { $0.name.lowercased() == pv.folderSuggestion.lowercased() }?.id
        let chosen = picked ? folder : (folder ?? suggested)
        return VStack(alignment: .leading, spacing: 12) {
            if let img {
                Color.clear.frame(height: 190).overlay { Image(uiImage: img).resizable().scaledToFill() }.clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            Text(pv.name.isEmpty ? "Uten navn" : pv.name).font(pal.serif(28)).foregroundStyle(pal.text)
            HStack(spacing: 14) {
                fact(pv.time.isEmpty ? "–" : pv.time, "tid")
                fact(pv.servings.isEmpty ? "–" : pv.servings, "porsjoner")
                fact("\(pv.ingredients.count)", "ingredienser")
                fact("\(pv.steps.count)", "steg")
            }
            if !pv.methodText.isEmpty { Text(pv.methodText).font(pal.ui(12.5)).foregroundStyle(pal.muted) }
            Text("MAPPE").font(pal.mono(11)).tracking(1.3).foregroundStyle(pal.muted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    folderChip("Ingen", chosen == nil) { folder = nil; picked = true }
                    ForEach(store.matFolders) { f in
                        folderChip(f.name + (f.id == suggested ? " ✦" : ""), chosen == f.id) { folder = f.id; picked = true }
                    }
                }
            }
            if !pv.ingredients.isEmpty {
                Text(pv.ingredients.prefix(6).joined(separator: " · ") + (pv.ingredients.count > 6 ? " …" : "")).font(pal.ui(13)).foregroundStyle(pal.sub)
            }
            Button { store.saveRecipe(folder: chosen) } label: {
                Text("Lagre oppskriften").font(pal.ui(15, .bold)).foregroundStyle(pal.accentInk).frame(maxWidth: .infinity, minHeight: 50)
                    .background(pal.accent, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .background(pal.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .task(id: pv.image) { img = await loadImage(store, pv.image) }
    }

    private func fact(_ v: String, _ l: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(v).font(pal.serif(20)).foregroundStyle(pal.text).lineLimit(1).minimumScaleFactor(0.7)
            Text(l).font(pal.ui(11.5)).foregroundStyle(pal.muted)
        }
    }

    private func folderChip(_ t: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(pal.ui(13, .semibold)).foregroundStyle(on ? pal.creamInk : pal.text).padding(.horizontal, 12).frame(height: 34)
                .background(on ? pal.cream : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? Color.clear : pal.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}
