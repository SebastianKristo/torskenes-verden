import SwiftUI
import UIKit

/* ---------------- Prompt 76 (SKJIOS): detaljen for en del og flytting ----------------
 Detalj: stort bilde (bla mellom bildene), plassering med skapet tegnet og skuffen uthevet, antall ± og «Flytt», «Endre», «Slett».
 Flytt: velg ny skuff i tegningen (og rom), advarsel når skuffen har andre deler, «Angre» i 10 s etterpå. */

/// Lukk-knapp og tittel i arkene.
struct Skj76SheetTop: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let kicker: String
    let title: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(kicker.uppercased()).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab).lineLimit(1)
                Text(title).font(PF.serif(28, medium: true)).foregroundStyle(p.ink).lineLimit(2).minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { m.sheet = nil } label: {
                Image(systemName: "xmark").font(.system(size: 14, weight: .bold)).foregroundStyle(p.ink).frame(width: 36, height: 36)
                    .overlay(Circle().stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Lukk")
        }
    }
}

/// Knapp i papirstil (fylt eller med kant).
struct Skj76Button: View {
    @Environment(\.paper) private var p
    let title: String
    var icon: String = ""
    var filled: Bool = false
    var danger: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if !icon.isEmpty { Image(systemName: icon).font(.system(size: 13, weight: .semibold)) }
                Text(title).font(PF.ui(14, .bold)).lineLimit(1)
            }
            .foregroundStyle(filled ? p.bg : (danger ? p.lab : p.ink))
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(filled ? p.ink : Color.clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(filled ? Color.clear : (danger ? p.lab : p.line), lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct Skj76Detail: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let id: String
    @State private var confirm: Bool = false

    var body: some View {
        ScrollView {
            if let x = m.part(id) {
                content(x)
            } else {
                ProgressView().padding(40)
            }
        }
        .background(p.bg.ignoresSafeArea())
        .task {
            await m.loadPart(id, store)
            // Prompt 78: «Lys opp automatisk når jeg åpner et treff».
            if let x = m.part(id) { await Skjold78.shared.autoOnOpen(x, store) }
        }
    }

    private func content(_ x: Skj76Part) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Skj76SheetTop(kicker: x.category.isEmpty ? "Del" : x.category, title: x.name)
            Skj76Gallery(photos: x.photos)
            Skj76Where(part: x)
            Skj78LocateButton(part: x)
            Skj76Qty(part: x)
            actions(x)
            Skj76Facts(part: x)
            Skj76History(id: x.id)
        }
        .padding(16)
        .confirmationDialog("Slette «" + x.name + "»?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Slett", role: .destructive) { Task { await m.delete(x, store) } }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("Du kan angre i 10 sekunder. Serveren tar vare på delen i 30 dager.")
        }
    }

    private func actions(_ x: Skj76Part) -> some View {
        HStack(spacing: 8) {
            Skj76Button(title: "Flytt", icon: "arrow.up.and.down.and.arrow.left.and.right", filled: true) { m.sheet = .move(x.id) }
            Skj76Button(title: "Endre", icon: "pencil") { m.sheet = .edit(x.id) }
            Skj76Button(title: "Slett", icon: "trash", danger: true) { confirm = true }
        }
    }
}

/// Bildene (bla sidelengs). Uten bilde: et rolig felt.
struct Skj76Gallery: View {
    @Environment(\.paper) private var p
    let photos: [Skj76Photo]

    var body: some View {
        if photos.isEmpty {
            RoundedRectangle(cornerRadius: 16, style: .continuous).fill(p.line.opacity(0.3))
                .frame(height: 120)
                .overlay(Label("Ingen bilder ennå", systemImage: "photo").font(PF.ui(13.5)).foregroundStyle(p.mut))
        } else {
            TabView {
                ForEach(photos, id: \.self) { (ph: Skj76Photo) in
                    Skj76BigPhoto(path: ph.url)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: photos.count > 1 ? .always : .never))
            .frame(height: 280)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }
}

struct Skj76BigPhoto: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let path: String
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack {
            p.card
            if let img { Image(uiImage: img).resizable().scaledToFit() } else { ProgressView() }
        }
        .task(id: path) { img = await Skj76Images.shared.load(path, store) }
    }
}

/// «Hovedskap · Rad 4 · Skuff 2 · Rom 1» og skapet med skuffen uthevet.
struct Skj76Where: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let part: Skj76Part

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                PLabel(text: "Plassering")
                Text(part.locText).font(PF.ui(16, .bold)).foregroundStyle(part.loc == nil ? p.mut : p.lab)
                if let l = part.loc, let c = cab(l) {
                    Skj76CabinetView(cab: c, map: m.maps[c.id], mark: l, pulse: m.pulse,
                                     photoMode: Binding<Bool>(get: { m.photoMode }, set: { m.photoMode = $0 }))
                }
            }
        }
        .task(id: part.loc?.cabinetId ?? "") {
            guard let l = part.loc else { return }
            m.highlight(l)
            if m.maps[l.cabinetId] == nil { await m.loadMap(l.cabinetId, store) }
        }
    }

    private func cab(_ l: Skj76Loc) -> Skj76Cabinet? { m.cabinets.first { $0.id == l.cabinetId } ?? m.cabinets.first { $0.name == l.cabinet } }
}

/// Antall med − og +, min-grense og «Lavt lager».
struct Skj76Qty: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let part: Skj76Part

    var body: some View {
        PCard {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    PLabel(text: "Antall")
                    Text(part.qtyText).font(PF.serif(30, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
                    if part.minQty > 0 {
                        HStack(spacing: 6) {
                            Text("Min " + Skjold76.num(part.minQty) + " " + part.unit).font(PF.ui(12.5)).foregroundStyle(p.mut)
                            if part.low { Skj76Badge(text: "Lavt lager") }
                        }
                    }
                }
                Spacer()
                step("minus", -1)
                step("plus", 1)
            }
        }
    }

    private func step(_ icon: String, _ d: Double) -> some View {
        Button { m.qty(part, delta: d, store) } label: {
            Image(systemName: icon).font(.system(size: 18, weight: .bold)).foregroundStyle(p.ink)
                .frame(width: 48, height: 48).overlay(Circle().stroke(p.line, lineWidth: 1)).contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(d < 0 ? "Én færre" : "Én til")
    }
}

/// Specs, beskrivelse, tags, pris, leverandør og lenke.
struct Skj76Facts: View {
    @Environment(\.paper) private var p
    let part: Skj76Part

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !part.specs.isEmpty {
                PCard {
                    VStack(alignment: .leading, spacing: 6) {
                        PLabel(text: "Specs")
                        ForEach(part.specs, id: \.self) { (s: Skj76Spec) in row(s.k.capitalized, s.v) }
                    }
                }
            }
            if !part.desc.isEmpty {
                PCard { Text(part.desc).font(PF.ui(14.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true) }
            }
            if !part.tags.isEmpty {
                Flow(spacing: 6) {
                    ForEach(part.tags, id: \.self) { (t: String) in
                        Text("#" + t).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                            .padding(.horizontal, 10).frame(height: 28).overlay(Capsule().stroke(p.line, lineWidth: 1))
                    }
                }
            }
            if part.price != nil || !part.supplier.isEmpty || !part.url.isEmpty { buy }
        }
    }

    private var buy: some View {
        PCard {
            VStack(alignment: .leading, spacing: 6) {
                if let pr = part.price { row("Pris", Skjold76.num(pr) + " kr") }
                if !part.supplier.isEmpty { row("Leverandør", part.supplier) }
                if let u = URL(string: part.url), !part.url.isEmpty {
                    Link(destination: u) {
                        Label("Datablad / kjøp", systemImage: "arrow.up.right.square").font(PF.ui(14, .semibold)).foregroundStyle(p.lab)
                    }
                }
            }
        }
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(k).font(PF.ui(13)).foregroundStyle(p.mut)
            Spacer(minLength: 8)
            Text(v).font(PF.mono(13, bold: false)).foregroundStyle(p.ink).multilineTextAlignment(.trailing)
        }
    }
}

/// Historikk (siste 20) med «Angre» på flytting og antall.
struct Skj76History: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let id: String

    var body: some View {
        let list: [Skj76Hist] = m.history[id] ?? []
        if !list.isEmpty {
            PCard {
                VStack(alignment: .leading, spacing: 8) {
                    PLabel(text: "Historikk")
                    ForEach(list.prefix(8)) { (h: Skj76Hist) in row(h, first: h.id == list.first?.id) }
                }
            }
        }
    }

    private func row(_ h: Skj76Hist, first: Bool) -> some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(h.text).font(PF.ui(13.5)).foregroundStyle(p.ink).lineLimit(1)
                if let d = h.at { Text(JS.fmt(d, "d. MMM HH:mm")).font(PF.mono(10, bold: false)).foregroundStyle(p.mut) }
            }
            Spacer()
            if first && (h.action == "flyttet" || h.action == "antall") {
                Button("Angre") { Task { await m.undoHistory(h, part: id, store) } }
                    .font(PF.ui(13, .bold)).foregroundStyle(p.lab).buttonStyle(.plain)
            }
        }
    }
}

/* ---------- Flytt ---------- */

struct Skj76Move: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let id: String
    @State private var target: Skj76Loc? = nil
    @State private var cabId: String = ""
    @State private var busy: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Skj76SheetTop(kicker: "Flytt", title: m.part(id)?.name ?? "Del")
                Text("Nå: " + (m.part(id)?.locText ?? "Uten plass")).font(PF.ui(13.5)).foregroundStyle(p.mut)
                Skj76LocPicker(cabId: $cabId, loc: $target)
                if let t = target { warning(t) }
                Skj76Button(title: busy ? "Flytter …" : "Flytt hit", icon: "checkmark", filled: true) { go() }
                    .disabled(target == nil || busy)
                    .opacity(target == nil ? 0.5 : 1)
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
        .onAppear {
            cabId = m.part(id)?.loc?.cabinetId ?? m.cabinet?.id ?? ""
            if cabId.isEmpty { cabId = m.cabinet?.id ?? "" }
        }
    }

    /// Andre deler i samme skuff (tillatt, men vis advarsel).
    @ViewBuilder
    private func warning(_ t: Skj76Loc) -> some View {
        let d: Skj76Drawer? = m.maps[t.cabinetId]?.drawer(t.row, t.col)
        let others: [String] = (d?.parts ?? []).filter { $0.id != id }.map { $0.name }
        if !others.isEmpty {
            Playback44Note(text: "Skuff " + t.short + " har allerede: " + others.prefix(4).joined(separator: ", ") + ". Det er greit, men sjekk at de ikke blandes.", red: true)
        }
    }

    private func go() {
        guard let t = target, let x = m.part(id) else { return }
        busy = true
        Task { @MainActor in
            await m.move(x, to: t, store)
            busy = false
            m.sheet = nil
        }
    }
}

/// Velg skap, skuff (trykk i tegningen) og rom. Brukes av Flytt og Ny/endre del.
struct Skj76LocPicker: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    @Binding var cabId: String
    @Binding var loc: Skj76Loc?

    var body: some View {
        let cab: Skj76Cabinet? = m.cabinets.first { $0.id == cabId } ?? m.cabinet
        VStack(alignment: .leading, spacing: 10) {
            if m.cabinets.count > 1 {
                Picker("Skap", selection: $cabId) {
                    ForEach(m.cabinets) { (c: Skj76Cabinet) in Text(c.name).tag(c.id) }
                }
                .pickerStyle(.segmented)
            }
            if let c = cab {
                Skj76CabinetView(cab: c, map: m.maps[c.id], mark: loc?.cabinetId == c.id ? loc : nil, pulse: m.pulse,
                                 photoMode: Binding<Bool>(get: { m.photoMode }, set: { m.photoMode = $0 })) { (r: Int, k: Int) in
                    choose(c, r, k)
                }
                comps(c)
            } else {
                Playback44Note(text: "Ingen skap ennå. Legg til et skap under ⋯ → Skap-oppsett.", red: false)
            }
            Text(loc?.text ?? "Trykk på en skuff i tegningen").font(PF.ui(14, .bold)).foregroundStyle(loc == nil ? p.mut : p.lab)
        }
        .task(id: cabId) { if !cabId.isEmpty && m.maps[cabId] == nil { await m.loadMap(cabId, store) } }
    }

    private func choose(_ c: Skj76Cabinet, _ r: Int, _ k: Int) {
        Haptics.shared.tick()
        let comp: Int? = loc?.cabinetId == c.id && loc?.row == r && loc?.col == k ? loc?.comp : nil
        loc = Skj76Loc(cabinetId: c.id, cabinet: c.name, row: r, col: k, comp: comp, text: Skj76LocPicker.text(c.name, r, k, comp))
        m.pulse += 1
    }

    @ViewBuilder
    private func comps(_ c: Skj76Cabinet) -> some View {
        if let l = loc, l.cabinetId == c.id {
            let n: Int = Swift.max(1, m.maps[c.id]?.drawer(l.row, l.col).comps ?? 1)
            if n > 1 {
                Picker("Rom", selection: Binding<Int>(get: { l.comp ?? 0 }, set: { setComp(c, $0) })) {
                    Text("Hele").tag(0)
                    ForEach(1...n, id: \.self) { (i: Int) in Text("Rom \(i)").tag(i) }
                }
                .pickerStyle(.segmented)
            }
        }
    }

    private func setComp(_ c: Skj76Cabinet, _ v: Int) {
        guard var l = loc else { return }
        l.comp = v == 0 ? nil : v
        l.text = Skj76LocPicker.text(c.name, l.row, l.col, l.comp)
        loc = l
    }

    static func text(_ cab: String, _ r: Int, _ k: Int, _ comp: Int?) -> String {
        cab + " · Rad \(r) · Skuff \(k)" + (comp.map { " · Rom \($0)" } ?? "")
    }
}
