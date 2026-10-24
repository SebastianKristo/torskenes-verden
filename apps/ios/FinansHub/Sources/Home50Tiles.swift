import SwiftUI

/* ---------------- Prompt 50: Hjem som fliser (retning 1d), claude-code-hjem-fliser.md ----------------
 Fasit: Mobil Papir App.dc.html → widget h4 «Fliser» og `tl` i renderVals(); designmal Hjem Retninger.dc.html 1d.
 – På iOS ligger flisene i kortet h16 (der minikortene Finans · Mat · Domener sto). Rutenett med 10 pt mellomrom, 24 pt hjørner:
   Avgang (1 kol × 2 rader, min 212 pt) til venstre, Finans og Middag til høyre, Familie og Domener på raden under.
   Brett/iPad: tre kolonner som i fasiten (Avgang 1×2, de fire andre 1×1 i to rader).
 – Når flisene er på, skjules det gamle Avganger-kortet (Min reise vises fortsatt) og Posisjon (h7), så ingenting står dobbelt.
 – Lagres i papir_home_tiles (standard på, «0» = gamle minikort). Bryter: Innstillinger → Utseende → «Hjem som fliser».
 – Farger: lys (svart, sand, grønn), mørk (#0f0e0c med tynn kant, mørke toner med lys tekst) og Liquid Glass (Glass50.swift).
 – Ingen egne gester: flisene er vanlige knapper, så scroll og hold-for-å-redigere (WiggleReorderList) virker som før. */

@MainActor
@Observable
final class Home50Tiles {
    static let shared = Home50Tiles()
    static let key: String = "papir_home_tiles"

    var on: Bool = UserDefaults.standard.string(forKey: Home50Tiles.key) != "0"

    func set(_ v: Bool) {
        on = v
        UserDefaults.standard.set(v ? "1" : "0", forKey: Home50Tiles.key)
    }
}

/// Flisfargene for lys, mørk og Liquid Glass.
struct Home50Look {
    let av: Color, avInk: Color
    let mat: Color, matInk: Color, matLab: Color
    let fam: Color, famInk: Color, famLab: Color
    let border: Color?
    let glass: Bool

    static func of(_ p: PaperPalette) -> Home50Look {
        if p.glass {
            return Home50Look(av: Color.white.opacity(0.07), avInk: .white,
                              mat: Color(hex: "#FF7A3D").opacity(0.18), matInk: .white, matLab: Color(hex: "#FFB08A"),
                              fam: Color(hex: "#4D6BFF").opacity(0.18), famInk: .white, famLab: Color(hex: "#AFC0FF"),
                              border: Glass50.edge, glass: true)
        }
        if p.dark {
            return Home50Look(av: Color(hex: "#0f0e0c"), avInk: Color(hex: "#f3efe6"),
                              mat: Color(hex: "#452c17"), matInk: Color(hex: "#f4e3cf"), matLab: Color(hex: "#f2c38f"),
                              fam: Color(hex: "#213625"), famInk: Color(hex: "#e1ece4"), famLab: Color(hex: "#9fd3b0"),
                              border: Color.white.opacity(0.08), glass: false)
        }
        return Home50Look(av: Color(hex: "#1b1a17"), avInk: Color(hex: "#f3efe6"),
                          mat: Color(hex: "#f4e3cf"), matInk: Color(hex: "#3a2410"), matLab: Color(hex: "#8a4f12"),
                          fam: Color(hex: "#e1ece4"), famInk: Color(hex: "#1b1a17"), famLab: Color(hex: "#2f6b4a"),
                          border: nil, glass: false)
    }
}

/// Én avgang slik flisen viser den.
struct Home50Dep {
    let line: String
    let bg: Color
    let ink: Color
    let dest: String
    let minutes: Int?

    var minText: String {
        guard let m = minutes else { return "–" }
        return m <= 0 ? "nå" : "\(m)"
    }
    var unit: String { (minutes ?? 1) <= 0 ? "" : "min" }
}

/// Kortet h16 på Hjem: flisene, eller de gamle minikortene når bryteren er av.
struct Home50TilesSlot: View {
    let minis: AnyView
    @MainActor private var t: Home50Tiles { Home50Tiles.shared }

    var body: some View {
        if t.on { Home50TileGrid() } else { minis }
    }
}

struct Home50TileGrid: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.paperWide) private var wide
    @Environment(\.scenePhase) private var phase

    var body: some View {
        let look: Home50Look = Home50Look.of(p)
        Group {
            if wide { wideGrid(look) } else { phoneGrid(look) }
        }
        .task(id: phase == .active) { await keepFresh() }
        .task { await loadOthers() }
    }

    /// To kolonner: Avgang over to rader til venstre, Finans og Middag til høyre; Familie og Domener under.
    private func phoneGrid(_ look: Home50Look) -> some View {
        VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Home50AvTile(look: look)
                VStack(spacing: 10) {
                    Home50FinTile()
                    Home50MatTile(look: look)
                }
                .frame(maxWidth: .infinity)
            }
            .fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .top, spacing: 10) {
                Home50FamTile(look: look)
                Home50DomTile()
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Brett/iPad: tre kolonner (Avgang 1×2, så Finans/Familie og Middag/Domener).
    private func wideGrid(_ look: Home50Look) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Home50AvTile(look: look)
            VStack(spacing: 10) {
                Home50FinTile()
                Home50FamTile(look: look)
            }
            .frame(maxWidth: .infinity)
            VStack(spacing: 10) {
                Home50MatTile(look: look)
                Home50DomTile()
            }
            .frame(maxWidth: .infinity)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    /// Sanntid hvert 30. sekund mens Hjem er synlig (Avganger-kortet er skjult når flisene er på).
    private func keepFresh() async {
        guard phase == .active else { return }
        let h: RuterHome27 = RuterHome27.shared
        await h.loadSettings(store)
        await h.refresh(store)
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(30))
            if Task.isCancelled { break }
            await h.refresh(store)
        }
    }

    /// Familie-flisen og Min reise (som vises over flisene når du har forlatt skolen).
    private func loadOthers() async {
        await PositionsModel20.shared.load(store)
        let m: MinReise41 = MinReise41.shared
        await m.load(store)
        if m.enabled { await m.loadJourney(store) }
    }
}

/* ---------- Flisene ---------- */

/// Felles ramme: 24 pt hjørner, polstring og ev. kant/glass.
struct Home50TileFrame: ViewModifier {
    @Environment(\.paper) private var p
    let fill: Color
    let ink: Color
    let border: Color?
    var minHeight: CGFloat = 0
    var pad: EdgeInsets = EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16)

    func body(content: Content) -> some View {
        let shape: RoundedRectangle = RoundedRectangle(cornerRadius: 24, style: .continuous)
        return content
            .foregroundStyle(ink)
            .padding(pad)
            .frame(maxWidth: .infinity, minHeight: minHeight, maxHeight: .infinity, alignment: .topLeading)
            .glass50Bg(p, fill, shape)
            .overlay { if let border, !p.glass { shape.stroke(border, lineWidth: 1) } }
            .contentShape(shape)
    }
}

struct Home50Label: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text.uppercased()).font(PF.mono(10)).tracking(1.2).foregroundStyle(color).lineLimit(1)
    }
}

struct Home50AvTile: View {
    @Environment(Store.self) private var store
    let look: Home50Look

    var body: some View {
        let deps: [Home50Dep] = Home50AvData.rows(store)
        Button { open() } label: { content(deps) }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity)
            .accessibilityLabel(accLabel(deps))
            .accessibilityHint("Åpner avgangene")
    }

    private func content(_ deps: [Home50Dep]) -> some View {
        let first: Home50Dep? = deps.first
        let muted: Color = look.glass ? Color.white.opacity(0.66) : Color(hex: "#a9a397")
        return VStack(alignment: .leading, spacing: 6) {
            Home50Label(text: "Avgang", color: Color(hex: "#f29a8a"))
            Home50LineBadge(dep: first)
            Text(first?.dest ?? (RuterHome27.shared.updated == nil ? "Henter avganger …" : "Ingen avganger"))
                .font(PF.ui(15, .semibold)).lineLimit(1).truncationMode(.tail)
            Spacer(minLength: 4)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(first?.minText ?? "–").font(PF.serif(64)).lineLimit(1).minimumScaleFactor(0.6)
                Text(first?.unit ?? "").font(PF.ui(14, .semibold)).foregroundStyle(muted)
            }
            Text(next(deps)).font(PF.ui(12.5, .semibold)).foregroundStyle(muted).lineLimit(1).truncationMode(.tail)
        }
        .modifier(Home50TileFrame(fill: look.av, ink: look.avInk, border: look.border, minHeight: 212,
                                  pad: EdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 16)))
    }

    /// «Så 20 Galgeberg · 2 min» på én linje.
    private func next(_ deps: [Home50Dep]) -> String {
        guard deps.count > 1 else { return " " }
        let d: Home50Dep = deps[1]
        let tail: String = d.unit.isEmpty ? d.minText : d.minText + " " + d.unit
        return "Så \(d.line) \(d.dest) · \(tail)"
    }

    private func accLabel(_ deps: [Home50Dep]) -> String {
        guard let d = deps.first else { return "Avgang" }
        return "Avgang, linje \(d.line) mot \(d.dest), \(d.minText) \(d.unit)"
    }

    private func open() {
        Haptics.shared.tap()
        if let s = RuterHome27.shared.selected(RuterModel.shared.stops).first { RuterModel.shared.selected = s.id }
        store.paperGo("avg")
    }
}

struct Home50LineBadge: View {
    let dep: Home50Dep?

    var body: some View {
        Text(dep?.line ?? "–").font(PF.ui(14, .heavy)).lineLimit(1).fixedSize()
            .foregroundStyle(dep?.ink ?? Color(hex: "#1b1a17"))
            .padding(.horizontal, 5)
            .frame(minWidth: 34).frame(height: 26)
            .background(dep?.bg ?? Color(hex: "#a9d3f5"), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
}

/// Avgangene til flisen: valgte stopp (RuterHome27), ellers det serveren sender til forsiden.
@MainActor
enum Home50AvData {
    static func rows(_ store: Store) -> [Home50Dep] {
        let h: RuterHome27 = RuterHome27.shared
        let sel: [RuterStop] = h.selected(RuterModel.shared.stops)
        var out: [Home50Dep] = []
        if !sel.isEmpty {
            var all: [RuterDeparture] = []
            for s in sel { all.append(contentsOf: (h.deps[s.id] ?? []).filter { !$0.cancelled }) }
            all.sort { minutes($0) < minutes($1) }
            out = all.prefix(2).map { (d: RuterDeparture) -> Home50Dep in
                Home50Dep(line: d.line, bg: RuterView24.lineColor(d), ink: RuterView24.lineInk(d), dest: d.to, minutes: minutes(d))
            }
        }
        if out.isEmpty {
            let lines: [RuterLine] = store.mobileHome?.ruter ?? []
            for l in lines {
                for d in l.departures where out.count < 2 {
                    out.append(Home50Dep(line: d.line, bg: Color(hex: d.ruterColor), ink: Color(hex: d.ruterTextColor), dest: d.to ?? l.to, minutes: d.min))
                }
            }
        }
        return out
    }

    static func minutes(_ d: RuterDeparture) -> Int {
        if let e = d.expected { return Swift.max(0, Int((e.timeIntervalSinceNow / 60).rounded(.down))) }
        return d.minutes ?? 9999
    }
}

struct Home50FinTile: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let review: Int = store.summary?.review.count ?? store.boot?.reviewCount ?? 0
        let left: Double? = store.summary?.left
        Button { store.paperGo("finans") } label: {
            VStack(alignment: .leading, spacing: 2) {
                Home50Label(text: "Finans", color: p.mut)
                Text(left.map { n0($0) } ?? "–").font(PF.serif(26, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
                Text(review > 0 ? (review == 1 ? "1 kvittering" : "\(review) kvitteringer") : "igjen i mnd")
                    .font(PF.ui(12)).foregroundStyle(review > 0 ? p.lab : p.mut).lineLimit(1)
            }
            .modifier(Home50TileFrame(fill: p.card, ink: p.ink, border: nil))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Åpner Finans")
    }
}

struct Home50MatTile: View {
    @Environment(Store.self) private var store
    let look: Home50Look

    var body: some View {
        Button { store.paperGo("mat") } label: {
            VStack(alignment: .leading, spacing: 2) {
                Home50Label(text: "Middag", color: look.matLab)
                Text(store.todayMeal ?? "Ingen rett").font(PF.serif(20, medium: true)).lineLimit(2).minimumScaleFactor(0.7)
            }
            .modifier(Home50TileFrame(fill: look.mat, ink: look.matInk, border: look.border))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Åpner Mat")
    }
}

struct Home50FamTile: View {
    @Environment(Store.self) private var store
    let look: Home50Look
    @MainActor private var m: PositionsModel20 { PositionsModel20.shared }

    var body: some View {
        let people: [FamPerson20] = m.people
        Button { store.paperGo("familie") } label: {
            VStack(alignment: .leading, spacing: 8) {
                Home50Label(text: "Familie", color: look.famLab)
                Home50Faces(people: Array(people.prefix(4)), ring: look.fam)
                Text(Home50FamText.line(people, loaded: m.loaded)).font(PF.ui(13, .semibold)).foregroundStyle(look.famLab).lineLimit(1).truncationMode(.tail)
            }
            .modifier(Home50TileFrame(fill: look.fam, ink: look.famInk, border: look.border))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Åpner Familie")
    }
}

/// Avatarene som overlapper hverandre (32 pt, 8 pt overlapp, kant i flisfargen).
struct Home50Faces: View {
    let people: [FamPerson20]
    let ring: Color

    var body: some View {
        HStack(spacing: -8) {
            ForEach(people) { (x: FamPerson20) in
                PosAvatarFace20(person: x)
                    .frame(width: 32, height: 32)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(ring, lineWidth: 2))
            }
        }
        .frame(height: 32)
        .accessibilityHidden(true)
    }
}

enum Home50FamText {
    /// «Alle på plass» når ingen er på vei, ellers «Ingrid · Går · Bislett» for den første som er på vei.
    nonisolated static func line(_ people: [FamPerson20], loaded: Bool) -> String {
        if people.isEmpty { return loaded ? "Ingen i familien ennå" : "Henter familien …" }
        let moving: [String] = ["Går", "Løper", "Sykler", "I bil"]
        if let x = people.first(where: { (q: FamPerson20) in moving.contains { q.line2 == $0 || q.line2.hasPrefix($0 + " ·") } }) {
            return x.name + " · " + x.line2
        }
        return "Alle på plass"
    }
}

struct Home50DomTile: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let up: DomainToday? = store.domainToday
        Button { store.paperOpenDomains(from: "hjem") } label: {
            VStack(alignment: .leading, spacing: 2) {
                Home50Label(text: "Domener", color: p.mut)
                Text(up.map { n0($0.visitors) } ?? "–").font(PF.serif(26, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
                Text(up == nil ? " " : "● besøk i dag").font(PF.ui(12)).foregroundStyle(p.pos).lineLimit(1)
            }
            .modifier(Home50TileFrame(fill: p.card, ink: p.ink, border: nil))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Åpner Domener")
    }
}

/// Innstillinger → Utseende: «Hjem som fliser».
struct Home50TilesToggle: View {
    @Environment(\.paper) private var p
    @MainActor private var t: Home50Tiles { Home50Tiles.shared }

    var body: some View {
        let on: Bool = t.on
        Button { Haptics.shared.select(); withAnimation(.easeOut(duration: 0.2)) { t.set(!on) } } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Hjem som fliser").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text("Avgang, Finans, Middag, Familie og Domener som fliser").font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(2)
                }
                Spacer(minLength: 8)
                PaperSwitch(on: on)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .glass50Card(p)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Hjem som fliser")
        .accessibilityValue(on ? "På" : "Av")
    }
}
