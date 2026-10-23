import SwiftUI
import UIKit

/* ---------------- Prompt 44: Mer – nytt design med levende kort ----------------
 Fasit: prompts/prompt-44-pakke/design/Mer Ny.dc.html og claude-code-mer-ny-design.md.
 – «Søk i moduler» øverst (filtrerer navn og undertekst i begge seksjonene mens man skriver).
 – HVERDAG OG FAMILIE: 2 × 2 levende kort (150 pt, 22 pt hjørner): Kalender (neste hendelse), Gjøremål (antall åpne),
   Bursdager (neste), Familie og kart (avatarer · «2 av 3 hjemme»). iPad: 4 i rad.
 – VERKTØY: ett kort med rader (62 pt) med levende undertekst. iPad: 2 kolonner. Innstillinger nederst på #e9e2d4.
 – Store · Lave (papir_mer_tsz): Lave = ingen firkantkort; Hverdag blir rader i samme liste, ingen overskrifter.
 – Ingen «Rediger»: hold inne 0,5 s → wiggle (felles WiggleReorderList), «–» skjuler (papir_mer · h), «Ferdig» og
   Store · Lave i overskriftsraden, «Vis N skjulte» nederst. Trykk åpner ikke modulen mens man redigerer.
 Rekkefølge og skjulte lagres som før (Mer28: /api/prefs/mer {o, h} + papir_mer per konto). Aldri plassholdere. */

@MainActor
@Observable
final class Mer44 {
    static let shared = Mer44()

    var query: String = ""
    /// stor | lav
    var size: String = UserDefaults.standard.string(forKey: AcctScope.key("papir_mer_tsz")) ?? "stor"

    static let dailyKeys: [String] = ["kalender", "huske", "bursdag", "kart"]

    var low: Bool { size == "lav" }

    func setSize(_ v: String, _ store: Store) {
        Haptics.shared.select()
        withAnimation(.easeOut(duration: 0.2)) { size = v }
        UserDefaults.standard.set(v, forKey: AcctScope.key("papir_mer_tsz"))
        let a: API = store.api
        Task { _ = try? await a.callAt("/api", "PUT", "/me/layout", json: ["papir_mer_tsz": v]) }
    }

    /// Ny synlig rekkefølge for én seksjon flettes inn i hele lagrede rekkefølgen (skjulte står der de sto).
    func commit(_ visible: [String], _ all: [More28Row], _ store: Store) {
        let m: Mer28 = Mer28.shared
        let cur = m.arrange(all)
        let full: [String] = cur.visible.map(\.id) + cur.hidden.map(\.id)
        m.order = Wiggle43.merge(full, visible: visible)
        m.save(store)
    }

    func showAll(_ store: Store) {
        Haptics.shared.tick()
        withAnimation(.easeOut(duration: 0.2)) { Mer28.shared.hidden = [] }
        Mer28.shared.save(store)
    }

    /// Søket: navn og undertekst, uten forskjell på store/små bokstaver og aksenter.
    func hit(_ r: More28Row) -> Bool {
        let q: String = query.trimmingCharacters(in: .whitespaces)
        if q.isEmpty { return true }
        let hay: String = r.name + " " + r.sub
        return hay.range(of: q, options: [.caseInsensitive, .diacriticInsensitive]) != nil
    }
}

/// Levende innhold for et Hverdag-kort.
struct More44Live {
    var key: String = ""
    var kicker: String = ""
    var value: String = ""
    var sub: String = ""
    var big: Bool = false
    var avatars: [(String, Color)] = []
    /// Én linje til raden (Lave): «Neste: Tannlege · i dag 15:15».
    var line: String = ""
}

/// Mer-siden (Papir), prompt 44.
struct PaperMore44: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Mer28 { Mer28.shared }
    @MainActor private var n: Mer44 { Mer44.shared }

    var body: some View {
        let all: [More28Row] = More44Rows.rows(store)
        let cur = m.arrange(all)
        let vis: [More28Row] = cur.visible.filter { $0.id != Mer28.locked && n.hit($0) }
        VStack(alignment: .leading, spacing: 10) {
            More44Search()
            More44Body(visible: vis, all: all, hiddenCount: cur.hidden.count)
            if let s = all.first(where: { $0.id == Mer28.locked }), n.hit(s) { More44Settings(row: s) }
            if m.editing && !cur.hidden.isEmpty { More44ShowHidden(count: cur.hidden.count) }
            if !m.editing && vis.isEmpty && !n.query.isEmpty { More44Empty() }
        }
        // Prompt 45: «Velg boks» og nytt navn på tittelen (Mer45.swift).
        .modifier(Mer45Sheets(all: all))
        .onAppear { Mer45.shared.boot() }
        .task(id: store.account?.id ?? "") {
            Mer45.shared.boot()
            await m.load(store)
            await Media43.shared.probe(store)
            await More44Rows.warm(store)
        }
        .onDisappear { if m.editing { m.done(store) } }
    }
}

/// Topp + kort/rader. Delt ut så body i PaperMore44 holdes liten (Xcode 16).
struct More44Body: View {
    @Environment(\.paperWide) private var wide
    @MainActor private var m: Mer28 { Mer28.shared }
    @MainActor private var n: Mer44 { Mer44.shared }
    let visible: [More28Row]
    let all: [More28Row]
    let hiddenCount: Int

    var body: some View {
        // Prompt 45: de fire store boksene velges i wiggle (Mer45.big), tittelen kan skjules eller få nytt navn.
        let big: [String] = Mer45.shared.big
        let daily: [More28Row] = visible.filter { big.contains($0.id) }
        let tools: [More28Row] = n.low ? visible : visible.filter { !big.contains($0.id) }
        VStack(alignment: .leading, spacing: 10) {
            if !n.low || m.editing { More44Header(title: n.low ? "" : Mer45.shared.title) }
            if !n.low && !daily.isEmpty { More44Tiles(rows: daily, all: all, columns: wide ? 4 : 2) }
            if !n.low && !tools.isEmpty { More44Label(text: "VERKTØY").padding(.top, 8) }
            if !tools.isEmpty { More44Tools(rows: tools, all: all, columns: wide ? 2 : 1) }
        }
    }
}

struct More44Label: View {
    @Environment(\.paper) private var p
    let text: String

    var body: some View {
        Text(text).font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.mut).padding(.horizontal, 4)
    }
}

/// «HVERDAG OG FAMILIE» + (i redigering) Store · Lave og Ferdig.
struct More44Header: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Mer28 { Mer28.shared }
    let title: String

    var body: some View {
        HStack(spacing: 8) {
            if !title.isEmpty { Mer45Title(editing: m.editing) }
            Spacer(minLength: 6)
            if m.editing {
                More44SizePicker()
                More44Done()
            }
        }
        .frame(minHeight: 30)
    }
}

struct More44SizePicker: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var n: Mer44 { Mer44.shared }

    var body: some View {
        HStack(spacing: 0) {
            seg("stor", "Store")
            seg("lav", "Lave")
        }
        .padding(3)
        .background(More44.chipBg(p), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func seg(_ k: String, _ label: String) -> some View {
        let on: Bool = n.size == k
        return Button { n.setSize(k, store) } label: {
            Text(label).font(PF.ui(12, .bold)).foregroundStyle(p.ink)
                .padding(.horizontal, 10).frame(height: 28)
                .background(on ? p.card : Color.clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .shadow(color: Color.black.opacity(on ? 0.12 : 0), radius: 1.5, y: 1)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

struct More44Done: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Mer28 { Mer28.shared }

    var body: some View {
        Button { m.done(store) } label: {
            Text("Ferdig").font(PF.ui(12.5, .bold)).foregroundStyle(p.bg)
                .padding(.horizontal, 12).frame(height: 30)
                .background(p.ink, in: Capsule())
                .frame(minHeight: 44)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

enum More44 {
    /// #e9e2d4 (lys) – innstillingsraden og Store · Lave.
    static func chipBg(_ p: PaperPalette) -> Color { p.dark ? p.line : Color(hex: "#e9e2d4") }

    /// Ikonbrikke: (bakgrunn, ikon) som i fasiten.
    static func tint(_ k: String, _ p: PaperPalette) -> (Color, Color) {
        let pair: (String, String)
        switch k {
        case "kalender", "kart", "bibel": pair = ("#fbe9e1", "#b23a2a")
        case "huske", "domener", "abo": pair = ("#e3eee5", "#2f6b4a")
        case "bursdag": pair = ("#efe7fb", "#7a5ad6")
        case "chat", "hjem": pair = ("#e6ecf5", "#2b5d8a")
        case "media", "studie": pair = ("#f4e8cf", "#a0671a")
        default: pair = ("#ece6da", "#6b665c")
        }
        if p.dark { return (Color(hex: pair.1).opacity(0.22), Color(hex: pair.1)) }
        return (Color(hex: pair.0), Color(hex: pair.1))
    }
}

/* ---------- Søk ---------- */

struct More44Search: View {
    @Environment(\.paper) private var p
    @MainActor private var n: Mer44 { Mer44.shared }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").font(.system(size: 15, weight: .semibold)).foregroundStyle(p.mut)
            TextField("Søk i moduler", text: Binding<String>(get: { n.query }, set: { n.query = $0 }))
                .font(PF.ui(15, .medium)).foregroundStyle(p.ink)
                .submitLabel(.search)
                .autocorrectionDisabled()
            if !n.query.isEmpty {
                Button { n.query = "" } label: {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 16)).foregroundStyle(p.mut)
                        .frame(width: 32, height: 32).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Tøm søket")
            }
        }
        .padding(.horizontal, 16).frame(height: 46)
        .background(p.card, in: Capsule())
        .shadow(color: Color.black.opacity(0.16), radius: 13, y: 10)
        .padding(.bottom, 6)
    }
}

/* ---------- Hverdag og familie: kort ---------- */

struct More44Tiles: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Mer28 { Mer28.shared }
    let rows: [More28Row]
    let all: [More28Row]
    let columns: Int

    var body: some View {
        WiggleReorderList(
            keys: rows.map(\.id),
            editing: m.editing,
            columns: columns,
            spacing: 10,
            label: { (k: String) in label(k) },
            hide: { (k: String) in m.hide(k, all, store) },
            enter: { m.start() },
            commit: { (o: [String]) in Mer44.shared.commit(o, all, store) },
            content: { (k: String) in tile(k) },
            accessory: { (k: String) in Mer45SwapBadge(key: k) { Haptics.shared.tap(); Mer45.shared.swapping = k } }
        )
    }

    private func label(_ k: String) -> String { rows.first { $0.id == k }?.name ?? k }

    @ViewBuilder private func tile(_ k: String) -> some View {
        if let r = rows.first(where: { $0.id == k }) {
            More44Tile(row: r, live: live45(r))
        }
    }

    /// Prompt 45: moduler uten eget levende innhold (valgt som stor boks) viser den levende underteksten.
    private func live45(_ r: More28Row) -> More44Live {
        var l: More44Live = More44Rows.live(r.id, store)
        if l.value.isEmpty && l.kicker.isEmpty && l.avatars.isEmpty {
            let t: String = More44Rows.line(r, store)
            l.value = t.isEmpty ? r.sub : t
            l.line = l.value
        }
        return l
    }
}

struct More44Tile: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Mer28 { Mer28.shared }
    let row: More28Row
    let live: More44Live

    var body: some View {
        Button { if !m.editing { row.act() } } label: {
            VStack(alignment: .leading, spacing: 0) {
                More44TileTop(row: row)
                Spacer(minLength: 6)
                More44TileValue(live: live)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 150, maxHeight: 150, alignment: .topLeading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(row.name + ". " + live.line)
    }
}

struct More44TileTop: View {
    @Environment(\.paper) private var p
    let row: More28Row

    var body: some View {
        let t: (Color, Color) = More44.tint(row.id, p)
        HStack(spacing: 9) {
            Image(systemName: row.icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(t.1)
                .frame(width: 30, height: 30)
                .background(t.0, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            Text(row.name).font(PF.ui(14, .bold)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.85)
        }
    }
}

struct More44TileValue: View {
    @Environment(\.paper) private var p
    let live: More44Live

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            if !live.kicker.isEmpty { Text(live.kicker).font(PF.ui(12)).foregroundStyle(p.mut) }
            if !live.value.isEmpty { valueText }
            if !live.sub.isEmpty { Text(live.sub).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1) }
            if !live.avatars.isEmpty { More44Avatars(people: live.avatars).padding(.top, 4) }
        }
    }

    private var valueText: some View {
        Text(live.value).font(PF.serif(live.big ? 40 : 22, medium: true)).foregroundStyle(p.ink)
            .lineLimit(live.big ? 1 : 2).minimumScaleFactor(0.7)
    }
}

struct More44Avatars: View {
    @Environment(\.paper) private var p
    let people: [(String, Color)]

    var body: some View {
        HStack(spacing: -8) {
            ForEach(Array(people.prefix(5).enumerated()), id: \.offset) { (pair: (offset: Int, element: (String, Color))) in
                Text(pair.element.0).font(PF.ui(11, .heavy)).foregroundStyle(Color.white)
                    .frame(width: 28, height: 28)
                    .background(pair.element.1, in: Circle())
                    .overlay(Circle().stroke(p.card, lineWidth: 2))
            }
        }
        .accessibilityHidden(true)
    }
}

/* ---------- Verktøy (og alt i Lave): rader ---------- */

/// Ett samlet kort rundt radene. Av i redigering, så «–»-merkene utenfor radene ikke klippes.
struct More44Card: ViewModifier {
    @Environment(\.paper) private var p
    let on: Bool

    @ViewBuilder func body(content: Content) -> some View {
        if on {
            content
                .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        } else {
            content
        }
    }
}

struct More44Tools: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Mer28 { Mer28.shared }
    let rows: [More28Row]
    let all: [More28Row]
    let columns: Int

    var body: some View {
        let editing: Bool = m.editing
        WiggleReorderList(
            keys: rows.map(\.id),
            editing: editing,
            columns: columns,
            spacing: editing || columns > 1 ? 8 : 0,
            label: { (k: String) in rows.first { $0.id == k }?.name ?? k },
            hide: { (k: String) in m.hide(k, all, store) },
            enter: { m.start() },
            commit: { (o: [String]) in Mer44.shared.commit(o, all, store) },
            content: { (k: String) in cell(k) },
            accessory: { (_: String) in EmptyView() }
        )
        .modifier(More44Card(on: single))
    }

    /// Ett samlet kort (utenfor redigering, én kolonne). I redigering er radene egne kort som vugger.
    private var single: Bool { !m.editing && columns == 1 }

    @ViewBuilder private func cell(_ k: String) -> some View {
        if let r = rows.first(where: { $0.id == k }) {
            More44ToolRow(row: r, sub: More44Rows.line(r, store), first: r.id == rows.first?.id, card: !single)
        }
    }
}

struct More44ToolRow: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Mer28 { Mer28.shared }
    let row: More28Row
    let sub: String
    let first: Bool
    /// Egen kortbakgrunn (redigering eller 2 kolonner).
    let card: Bool

    var body: some View {
        Button { if !m.editing { row.act() } } label: {
            More44ToolRowContent(row: row, sub: sub)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .frame(maxWidth: .infinity, minHeight: 62, alignment: .leading)
                .background(card ? p.card : Color.clear, in: RoundedRectangle(cornerRadius: card ? 18 : 0, style: .continuous))
                .overlay(alignment: .top) { if !first && !card { Rectangle().fill(p.line.opacity(0.6)).frame(height: 1) } }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(row.name + ". " + sub)
    }
}

struct More44ToolRowContent: View {
    @Environment(\.paper) private var p
    let row: More28Row
    let sub: String

    var body: some View {
        let t: (Color, Color) = More44.tint(row.id, p)
        HStack(spacing: 12) {
            icon(t)
            VStack(alignment: .leading, spacing: 1) {
                Text(row.name).font(PF.serif(18, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            Spacer(minLength: 6)
            Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
        }
    }

    @ViewBuilder private func icon(_ t: (Color, Color)) -> some View {
        if row.id == "finans" {
            Okonomi40Icon(size: 34)
        } else {
            Image(systemName: row.icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(t.1)
                .frame(width: 34, height: 34)
                .background(t.0, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .accessibilityHidden(true)
        }
    }
}

/// Innstillinger nederst som egen rad på #e9e2d4 (kan ikke skjules).
struct More44Settings: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Mer28 { Mer28.shared }
    let row: More28Row

    var body: some View {
        Button { if !m.editing { row.act() } } label: {
            HStack(spacing: 12) {
                Image(systemName: "gearshape").font(.system(size: 16, weight: .semibold)).foregroundStyle(p.ink)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Innstillinger").font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                    Text(row.sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).frame(maxWidth: .infinity, minHeight: 60)
            .background(More44.chipBg(p), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, 4)
    }
}

struct More44ShowHidden: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let count: Int

    var body: some View {
        Button { Mer44.shared.showAll(store) } label: {
            Text("Vis \(count) skjulte").font(PF.ui(13, .bold)).foregroundStyle(p.lab)
                .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct More44Empty: View {
    @Environment(\.paper) private var p
    @MainActor private var n: Mer44 { Mer44.shared }

    var body: some View {
        Text("Ingen moduler heter «\(n.query)».").font(PF.ui(13.5)).foregroundStyle(p.mut)
            .frame(maxWidth: .infinity).padding(.vertical, 14)
    }
}
