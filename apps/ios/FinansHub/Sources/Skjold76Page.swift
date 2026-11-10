import SwiftUI
import UIKit

/* ---------------- Prompt 76 (SKJIOS): Skjold Lab-siden ----------------
 Mer → Skjold Lab (ikon: skuffeskap) åpner fullskjerm. Søk øverst med forslag mens du skriver, filter (kategori, lavt lager),
 treffliste med bilde, navn, specs, antall og plassering, og tegningen av skapet med valgt skuff uthevet.
 Trykk på et treff → detalj (stort bilde, plassering, antall ±, «Flytt», «Endre», «Slett»). Trykk på en skuff → innholdet. */

struct Skjold76Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var m: Skjold76 { Skjold76.shared }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { m.open }, set: { (v: Bool) in if !v { m.open = false } })) {
                Skjold76Page()
                    .environment(\.paper, p)
                    .environment(store)
                    .edgeSwipeClose30 { m.open = false }
            }
    }
}

extension View {
    func skjold76Host(_ p: PaperPalette) -> some View { modifier(Skjold76Host(p: p)) }
}

struct Skjold76Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Skj76Top()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if m.missing { Playback44Note(text: "Serveren har ikke Skjold Lab ennå (oppdater Homelab).", red: false) }
                    if m.offline { Playback44Note(text: "Uten nett: søker i siste lagrede liste. Endringer krever nett.", red: true) }
                    Skj76Search()
                    Skj76Filters()
                    Skj76CabinetCard()
                    Skj82Entry()
                    Skj76Results()
                }
                .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, Skjold79.shared.count > 0 ? 150 : 90)
                .frame(maxWidth: 760).frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await m.load(store) }
        }
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .overlay(alignment: .bottomTrailing) { Skj76AddButton() }
        .overlay(alignment: .bottom) { Skj76Bottom() }
        .sheet(item: Binding<Skj76Sheet?>(get: { m.sheet }, set: { m.sheet = $0 })) { (s: Skj76Sheet) in
            Skj76SheetView(s: s)
                .environment(\.paper, p)
                .environment(store)
                .presentationDetents([.large])
        }
        .task {
            await m.load(store)
            await Skjold78.shared.load(store)
            await Skjold79.shared.load(store)
            await Skjold82.shared.load(store)
        }
    }
}

/// Toast og «Angre» (10 s) nederst.
struct Skj76Bottom: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }

    var body: some View {
        VStack(spacing: 8) {
            Skj78LitBar()
            Skj79Bar()
            if !m.undoText.isEmpty {
                HStack(spacing: 12) {
                    Text(m.undoText).font(PF.ui(13.5, .semibold)).foregroundStyle(p.bg).lineLimit(2)
                    Spacer(minLength: 4)
                    Button("Angre") { m.undo() }.font(PF.ui(13.5, .bold)).foregroundStyle(p.bg)
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .background(p.ink, in: Capsule())
                .padding(.horizontal, 16)
                .transition(.opacity)
            } else if !m.toast.isEmpty {
                Logs44Toast(text: m.toast)
            }
        }
        .padding(.bottom, 18)
        .animation(.easeOut(duration: 0.2), value: m.undoText)
    }
}

struct Skj76AddButton: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }

    var body: some View {
        Button {
            Haptics.shared.tap()
            m.sheet = .edit("")
        } label: {
            Image(systemName: "plus").font(.system(size: 22, weight: .bold)).foregroundStyle(p.onLab)
                .frame(width: 58, height: 58).background(p.lab, in: Circle())
                .shadow(color: Color.black.opacity(0.18), radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .padding(.trailing, 20).padding(.bottom, lift)
        .accessibilityLabel("Ny del")
    }

    /// Løftes over toast/angre, LED-linja og plukklistelinja (Prompt 79).
    @MainActor private var lift: CGFloat {
        var h: CGFloat = m.undoText.isEmpty && m.toast.isEmpty ? 24 : 78
        if Skjold79.shared.count > 0 { h += 58 }
        if !Skjold78.shared.lit.isEmpty { h += 58 }
        return h
    }
}

/// «‹ Tilbake», SKJOLD LAB · DELER / Skjold Lab og ⋯ (Skap-oppsett, Etiketter, Oppdater).
struct Skj76Top: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Top50Bar(kicker: "Skjold Lab · deler", title: "Skjold Lab", back: { m.open = false }) {
                HStack(spacing: 8) {
                    gear
                    menu
                }
            }
            Text(sub).font(PF.ui(14)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 6)
    }

    private var sub: String {
        if m.cabinets.isEmpty { return "Søk etter deler og se hvilken skuff de ligger i" }
        return m.merSub + " · " + (m.total == 1 ? "1 treff" : "\(m.total) treff")
    }

    private var menu: some View {
        Menu {
            Button { m.sheet = .setup(m.cabinet?.id ?? "") } label: { Label("Skap-oppsett", systemImage: "cabinet") }
            Button { m.sheet = .setup("ny") } label: { Label("Legg til skap", systemImage: "plus.rectangle.on.rectangle") }
            Button { m.sheet = .labels(m.cabinet?.id ?? "") } label: { Label("Etiketter", systemImage: "printer") }
            // Prompt 82: produktene delene er sjekket ut til (Skjold82*.swift).
            Button { m.sheet = .projects } label: { Label("Produkter", systemImage: "shippingbox") }
            // Prompt 78: LED over hver skuff (WLED), test og kalibrering.
            Button { m.sheet = .leds(m.cabinet?.id ?? "") } label: { Label("LED-oppsett", systemImage: "lightbulb") }
            Button { Task { await m.load(store) } } label: { Label("Oppdater", systemImage: "arrow.clockwise") }
            // Prompt 77: Glimt går gjennom delene og foreslår bedre navn, kategori og specs (Skjold77*.swift).
            Divider()
            Button { m.sheet = .tidy([]) } label: { Label("Rydd opp med Glimt", systemImage: "sparkles") }
            if filtered && !m.items.isEmpty {
                Button { m.sheet = .tidy(m.items.map { $0.id }) } label: { Label("Rydd opp i treffene (\(m.items.count))", systemImage: "sparkles.rectangle.stack") }
            }
        } label: {
            Image(systemName: "ellipsis").font(.dyn51(size: 16, weight: .bold)).foregroundStyle(p.ink).round50()
        }
        .accessibilityLabel("Mer for Skjold Lab")
    }

    private var filtered: Bool { !m.query.isEmpty || !m.category.isEmpty || m.lowOnly }

    /// ⚙: «Finn bilder på nett» og «Foreslå automatisk når jeg tar bilde».
    private var gear: some View {
        Button { m.sheet = .ai } label: {
            Image(systemName: "gearshape").font(.dyn51(size: 16, weight: .bold)).foregroundStyle(p.ink).round50()
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Glimt-innstillinger for Skjold Lab")
    }
}

/// Søkefeltet med forslag mens man skriver.
struct Skj76Search: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(p.mut)
                TextField("Søk: M3, 10k, ESP32 …", text: Binding<String>(get: { m.query }, set: { m.query = $0 }))
                    .font(PF.ui(16)).foregroundStyle(p.ink)
                    .textInputAutocapitalization(.never).autocorrectionDisabled(true)
                    .submitLabel(.search)
                    .focused($focused)
                    .onChange(of: m.query) { (_: String, _: String) in m.typed(store) }
                    .onSubmit { m.suggestions = []; Task { await m.search(store) } }
                if !m.query.isEmpty {
                    Button { m.query = ""; m.suggestions = [] } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(p.mut) }
                        .buttonStyle(.plain).accessibilityLabel("Tøm søket")
                }
            }
            .padding(.horizontal, 14).frame(height: 48)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(p.line, lineWidth: 1))
            if focused && !m.suggestions.isEmpty { suggestions }
        }
    }

    private var suggestions: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(m.suggestions, id: \.self) { (s: Skj76Suggest) in
                Button { choose(s) } label: {
                    HStack(spacing: 8) {
                        Image(systemName: s.partId.isEmpty ? "arrow.up.left" : "shippingbox").font(.system(size: 11)).foregroundStyle(p.mut)
                        Text(s.text).font(PF.ui(14.5)).foregroundStyle(p.ink).lineLimit(1)
                        Spacer(minLength: 6)
                        if !s.sub.isEmpty { Text(s.sub).font(PF.mono(10)).foregroundStyle(p.lab).lineLimit(1) }
                    }
                    .padding(.horizontal, 14).frame(height: 40).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
        .padding(.top, 6)
    }

    /// En del åpnes direkte (og skuffen utheves); en kategori/tekst søkes.
    private func choose(_ s: Skj76Suggest) {
        m.suggestions = []
        focused = false
        if !s.partId.isEmpty {
            if let x = m.part(s.partId) { m.pick(x) } else { m.sheet = .part(s.partId) }
            return
        }
        m.query = s.text
        Task { await m.search(store) }
    }
}

/// Filter: Alle · Lavt lager · kategoriene (med telling).
struct Skj76Filters: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip("Alle", on: m.category.isEmpty && !m.lowOnly) { m.category = ""; m.lowOnly = false }
                chip("Lavt lager", on: m.lowOnly) { m.lowOnly.toggle() }
                ForEach(m.categories) { (c: Skj76Cat) in
                    chip(c.id + " · \(c.count)", on: m.category == c.id) { m.category = m.category == c.id ? "" : c.id }
                }
            }
        }
    }

    private func chip(_ t: String, on: Bool, _ act: @escaping () -> Void) -> some View {
        Button {
            Haptics.shared.tick()
            act()
            Task { await m.search(store) }
        } label: {
            Text(t).font(PF.ui(13, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
                .padding(.horizontal, 12).frame(height: 32)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? Color.clear : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// Skapvelger + tegningen. Trykk på en skuff viser innholdet.
struct Skj76CabinetCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }

    var body: some View {
        if let c = m.cabinet {
            PCard {
                VStack(alignment: .leading, spacing: 12) {
                    picker(c)
                    Skj76CabinetView(cab: c, map: m.maps[c.id], mark: mark(c), pulse: m.pulse,
                                     photoMode: Binding<Bool>(get: { m.photoMode }, set: { m.photoMode = $0 })) { (r: Int, k: Int) in
                        Haptics.shared.tap()
                        m.sheet = .drawer(c.id, r, k)
                    }
                    if let f = mark(c) {
                        Text(f.text).font(PF.ui(13, .semibold)).foregroundStyle(p.lab)
                    }
                }
            }
        }
    }

    private func mark(_ c: Skj76Cabinet) -> Skj76Loc? {
        guard let f = m.focus, f.cabinetId.isEmpty || f.cabinetId == c.id else { return nil }
        return f
    }

    private func picker(_ c: Skj76Cabinet) -> some View {
        HStack(spacing: 8) {
            Menu {
                ForEach(m.cabinets) { (x: Skj76Cabinet) in
                    Button(x.name + " · \(x.rows) × \(x.cols)") {
                        m.cabinetId = x.id
                        Task { await m.loadMap(x.id, store) }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "cabinet").foregroundStyle(p.lab)
                    Text(c.name).font(PF.serif(20, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    if m.cabinets.count > 1 { Image(systemName: "chevron.down").font(.system(size: 11, weight: .bold)).foregroundStyle(p.mut) }
                }
            }
            Spacer()
            Text("\(c.parts) deler · \(c.used)/\(c.rows * c.cols) skuffer").font(PF.mono(10.5)).foregroundStyle(p.mut).lineLimit(1)
        }
    }
}

/// Trefflisten.
struct Skj76Results: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                PLabel(text: m.query.isEmpty ? "Deler" : "Treff").padding(.leading, 4)
                Spacer(minLength: 4)
                if !m.query.isEmpty { Skj78AllButton(parts: m.items) }
            }
            if m.loading && m.items.isEmpty { ProgressView().frame(maxWidth: .infinity).padding(24) }
            if !m.loading && m.items.isEmpty {
                PCard { Text(m.query.isEmpty ? "Ingen deler ennå. Trykk + for å legge til den første." : "Fant ingen deler for «" + m.query + "».").font(PF.ui(13.5)).foregroundStyle(p.mut) }
            }
            if !m.items.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(m.items.enumerated()), id: \.element.id) { (i: Int, x: Skj76Part) in
                        if i > 0 { Divider().overlay(p.line) }
                        Skj76Row(part: x)
                    }
                }
                .glass50Card(p, radius: 20)
            }
        }
    }
}

struct Skj76Row: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let part: Skj76Part

    var body: some View {
        HStack(spacing: 0) {
            main
            Skj78RowButton(part: part)
            Skj79AddButton(part: part).padding(.trailing, 4)
        }
    }

    private var main: some View {
        Button { m.pick(part) } label: {
            HStack(spacing: 12) {
                Skj76Thumb(path: part.thumbUrl, size: 52)
                VStack(alignment: .leading, spacing: 2) {
                    Text(part.name).font(PF.ui(15.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    if !part.specLine.isEmpty { Text(part.specLine).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1) }
                    Text(part.loc.map { $0.cabinet + " · " + $0.short + ($0.comp.map { " · rom \($0)" } ?? "") } ?? "Uten plass")
                        .font(PF.mono(10.5)).foregroundStyle(part.loc == nil ? p.mut : p.lab).lineLimit(1)
                }
                Spacer(minLength: 6)
                VStack(alignment: .trailing, spacing: 4) {
                    Text(part.qtyText).font(PF.mono(13)).foregroundStyle(p.ink).lineLimit(1)
                    if part.low { Skj76Badge(text: "Lavt") }
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(part.name + ", " + part.qtyText + ", " + part.locText)
    }
}

struct Skj76Badge: View {
    @Environment(\.paper) private var p
    let text: String

    var body: some View {
        Text(text.uppercased()).font(PF.mono(9.5)).tracking(0.8).foregroundStyle(p.onLab)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(p.lab, in: Capsule())
    }
}

/// Velger riktig ark.
struct Skj76SheetView: View {
    let s: Skj76Sheet

    var body: some View {
        switch s {
        case .part(let id): Skj76Detail(id: id)
        case .edit(let id): Skj76Edit(id: id)
        case .move(let id): Skj76Move(id: id)
        case .setup(let id): Skj76Setup(startId: id)
        case .drawer(let c, let r, let k): Skj76DrawerSheet(cabinetId: c, row: r, col: k)
        case .labels(let c): Skj76Labels(cabinetId: c)
        case .tidy(let ids): Skj77Tidy(ids: ids)
        case .ai: Skj77Settings()
        case .leds(let c): Skj78Setup(startId: c)
        case .calibrate(let c): Skj78Calibrate(cabinetId: c)
        case .pick: Skj79Sheet()
        case .diagnose(let c): Skj79Diagnose(cabinetId: c)
        case .checkout(let id): Skj82Checkout(partId: id)
        case .projects: Skj82ProjectsSheet()
        case .project(let id): Skj82ProjectSheet(id: id)
        }
    }
}
