import SwiftUI

/* ---------------- Prompt 52: Hjem som 2-kolonners rutenett (3a) og flisene som egne kort ----------------
 Fasit: Homelab.dc.html → edVals() (PG.hjem, gc: halve kort h7/h9/h10/h11/h13–h17) og flisene på Hjem.
 – Avgang, Finans, Middag, Familie og Domener er egne kort i redigering (hold inne for å flytte eller skjule hver for seg).
   På iOS er nøklene h13–h16 allerede brukt (Bibelvers, Vel fremme, Media, samlet flis), så flisene har nøklene
   h17 (Avgang), h18 (Finans), h19 (Middag), h20 (Familie) og h21 (Domener). Lagrede oppsett får flisene der h16 sto
   (Store.pageCards i Paper15.swift → Home52.slot), og var h16 skjult, er alle fem skjult.
 – Avgang er fortsatt dobbelt høy (to rader, med to halve fliser stablet ved siden av).
 – Kalender, Bursdag, Bolig og Prøve er halve fliser; Siste nytt og Media går over hele bredden.
 – Flisstil: 24 pt hjørner, 16 pt luft, 10 pt mono-etikett, større serif-tall, uten «alle ›».
 – Hele Siste nytt-kortet åpner nyhetsleseren, med lett haptikk (openRss vibrerer 10 ms i fasiten). */

enum Home52 {
    static let av: String = "h17"
    static let fin: String = "h18"
    static let mat: String = "h19"
    static let fam: String = "h20"
    static let dom: String = "h21"
    static let tileKeys: [String] = [av, fin, mat, fam, dom]
    /// Halve kort på mobil: flisene + Bolig (h8), Bursdager (h9), Kalender (h10) og Prøveperioder (h11).
    static let half: Set<String> = Set(tileKeys + ["h8", "h9", "h10", "h11"])
    static let tall: Set<String> = [av]

    /// Plassen et nytt flis-kort skal settes inn på i `order` (nil = bakerst).
    static func slot(_ k: String, _ raw: [String], _ order: [String]) -> Int? {
        guard let ki = tileKeys.firstIndex(of: k) else { return nil }
        // Rett etter forrige flis som allerede står i rekkefølgen.
        var j: Int = ki - 1
        while j >= 0 {
            if let p = order.firstIndex(of: tileKeys[j]) { return p + 1 }
            j -= 1
        }
        // Ellers der den samlede flisen (h16) sto.
        // Uten lagret h16: rett etter Søk (h1), som h16 får i pageCards.
        guard let h = raw.firstIndex(of: "h16") else { return order.firstIndex(of: "h1").map { $0 + 1 } }
        var n: Int = 0
        for x in order {
            if let r = raw.firstIndex(of: x), r < h { n += 1 }
        }
        return n
    }

    /// Var den samlede flisen (h16) skjult og flisene aldri lagret, er de skjult også.
    static func hiddenFromSlot(_ hid: [String], _ l: PaperPageLayout, _ keys: [String]) -> [String] {
        guard l.hidden.contains("h16") else { return hid }
        var out: [String] = hid
        for t in tileKeys where keys.contains(t) && !l.order.contains(t) && !l.hidden.contains(t) && !out.contains(t) { out.append(t) }
        return out
    }

    /// Kortene for de fem flisene (bare på mobil med «Hjem som fliser» på).
    @MainActor
    static func tileCards() -> [PaperCardDef] {
        [
            PaperCardDef(key: av, label: "Avgang-flis", view: AnyView(Home52AvCard())),
            PaperCardDef(key: fin, label: "Finans-flis", view: AnyView(Home50FinTile())),
            PaperCardDef(key: mat, label: "Middag-flis", view: AnyView(Home52LookTile(kind: .mat))),
            PaperCardDef(key: fam, label: "Familie-flis", view: AnyView(Home52LookTile(kind: .fam))),
            PaperCardDef(key: dom, label: "Domener-flis", view: AnyView(Home50DomTile())),
        ]
    }

    /// Bytter Kalender, Bursdager, Bolig og Prøveperioder med flis-utgavene (3a).
    @MainActor
    static func asTiles(_ cards: [PaperCardDef]) -> [PaperCardDef] {
        cards.map { (c: PaperCardDef) -> PaperCardDef in
            switch c.key {
            case "h8": return PaperCardDef(key: c.key, label: c.label, view: AnyView(Home52BoligTile()))
            case "h9": return PaperCardDef(key: c.key, label: c.label, view: AnyView(Home52BdTile()))
            case "h10": return PaperCardDef(key: c.key, label: c.label, view: AnyView(Home52CalTile()))
            case "h11": return PaperCardDef(key: c.key, label: c.label, view: AnyView(Home52TrialTile()))
            default: return c
            }
        }
    }
}

/* ---------- Radene i rutenettet ---------- */

enum Home52RowKind {
    case full
    case pair
    case tall
}

struct Home52Row: Identifiable {
    let kind: Home52RowKind
    let keys: [String]
    var id: String { keys.joined(separator: "|") }
}

enum Home52Rows {
    /// Hele kort får egen rad; halve pares to og to; et høyt halvt kort tar med seg de to neste halve.
    static func rows(_ keys: [String], half: Set<String>, tall: Set<String>) -> [Home52Row] {
        var out: [Home52Row] = []
        var i: Int = 0
        while i < keys.count {
            let k: String = keys[i]
            if !half.contains(k) {
                out.append(Home52Row(kind: .full, keys: [k]))
                i += 1
                continue
            }
            if tall.contains(k) {
                var g: [String] = [k]
                var j: Int = i + 1
                while j < keys.count && g.count < 3 && half.contains(keys[j]) && !tall.contains(keys[j]) {
                    g.append(keys[j])
                    j += 1
                }
                out.append(Home52Row(kind: g.count > 1 ? .tall : .pair, keys: g))
                i = j
                continue
            }
            if i + 1 < keys.count && half.contains(keys[i + 1]) && !tall.contains(keys[i + 1]) {
                out.append(Home52Row(kind: .pair, keys: [k, keys[i + 1]]))
                i += 2
            } else {
                out.append(Home52Row(kind: .pair, keys: [k]))
                i += 1
            }
        }
        return out
    }
}

/* ---------- Flisene ---------- */

/// Avgang-flisen som eget kort: holder sanntiden og Familie/Min reise ferske (som Home50TileGrid gjorde).
struct Home52AvCard: View {
    @Environment(\.paper) private var p

    var body: some View {
        Home50AvTile(look: Home50Look.of(p))
    }
}

/// Holder dataene til flisene ferske uansett hvilke fliser som er synlige (legges på Hjem-stakken).
struct Home52Keeper: ViewModifier {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase
    let on: Bool

    func body(content: Content) -> some View {
        content
            .task(id: on && phase == .active) {
                guard on && phase == .active else { return }
                let h: RuterHome27 = RuterHome27.shared
                await h.loadSettings(store)
                await h.refresh(store)
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(30))
                    if Task.isCancelled { break }
                    await h.refresh(store)
                }
            }
            .task(id: on) {
                guard on else { return }
                await PositionsModel20.shared.load(store)
                let m: MinReise41 = MinReise41.shared
                await m.load(store)
                if m.enabled { await m.loadJourney(store) }
            }
    }
}

enum Home52LookKind {
    case mat
    case fam
}

/// Middag og Familie trenger flisfargene (Home50Look) fra paletten.
struct Home52LookTile: View {
    @Environment(\.paper) private var p
    let kind: Home52LookKind

    var body: some View {
        let look: Home50Look = Home50Look.of(p)
        switch kind {
        case .mat: Home50MatTile(look: look)
        case .fam: Home50FamTile(look: look)
        }
    }
}

/// Kalender som halv flis: neste time i serif, tid og «om …».
struct Home52CalTile: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }

    var body: some View {
        TimelineView(.everyMinute) { ctx in
            content(Cal26.widget(m.events, now: ctx.date, colors: m.subjectColors))
        }
        .task(id: store.account?.id ?? "") { await m.load(store) }
    }

    private func content(_ w: CalWidgetState26) -> some View {
        Button {
            Haptics.shared.tap()
            if !w.eventId.isEmpty, let e = m.events.first(where: { (x: CalEvent26) -> Bool in x.id == w.eventId }), KalLink33.event(e) { return }
            store.paperGo("kalender")
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Home50Label(text: "Kalender", color: p.mut)
                    Spacer(minLength: 2)
                    RoundedRectangle(cornerRadius: 2).fill(Color(hex: w.hex)).frame(width: 14, height: 4)
                }
                Spacer(minLength: 4)
                Text(w.big).font(PF.serif(30, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
                Text(m.loaded || !w.title.isEmpty ? w.title : "Henter …").font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(2)
                Text(w.when.isEmpty ? w.sub : w.when).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
            }
            .modifier(Home50TileFrame(fill: p.card, ink: p.ink, border: nil, minHeight: 150))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Åpner kalenderen")
    }
}

/// Bursdag som halv flis (varm som Middag): ansiktene, navnet og når.
struct Home52BdTile: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: BirthdayModel24 { BirthdayModel24.shared }

    var body: some View {
        let look: Home50Look = Home50Look.of(p)
        let top: [Birthday24] = Array(m.items.prefix(3))
        Button { Haptics.shared.tap(); store.paperGo("bursdag") } label: {
            VStack(alignment: .leading, spacing: 6) {
                Home50Label(text: "Bursdag", color: look.matLab)
                HStack(spacing: -8) {
                    ForEach(top) { (b: Birthday24) in
                        BirthdayAvatar24(b: b, size: 32).overlay(Circle().stroke(look.mat, lineWidth: 2))
                    }
                }
                .frame(height: 32)
                .accessibilityHidden(true)
                Spacer(minLength: 4)
                Text(top.first?.name ?? (m.loaded ? "Ingen ennå" : "Henter …")).font(PF.serif(22, medium: true)).lineLimit(1).minimumScaleFactor(0.7)
                Text(sub(top.first)).font(PF.ui(12.5, .semibold)).foregroundStyle(look.matLab).lineLimit(1)
            }
            .modifier(Home50TileFrame(fill: look.mat, ink: look.matInk, border: look.border, minHeight: 150))
        }
        .buttonStyle(.plain)
        .task(id: store.account?.id ?? "") { await m.load(store) }
        .accessibilityHint("Åpner Bursdager")
    }

    private func sub(_ b: Birthday24?) -> String {
        guard let b else { return "+ Legg til" }
        if let a = b.age { return b.whenText + " · fyller \(a)" }
        return b.whenText
    }
}

/// Bolig som halv flis: brukt i år, antall kvitteringer til gjennomgang og stolpe.
struct Home52BoligTile: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let f: Folder? = store.folders?.first
        let review: Int = store.boot?.reviewCount ?? 0
        Button { Haptics.shared.tap(); store.paperFinGo("boliger") } label: {
            VStack(alignment: .leading, spacing: 2) {
                Home50Label(text: "Bolig", color: p.mut)
                Spacer(minLength: 4)
                Text(f?.yearTotal.map { n0($0) } ?? "–").font(PF.serif(26, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
                Text(f.map { "kr i år · " + $0.name } ?? "Ingen boliger ennå").font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                Text(review == 1 ? "1 kvittering" : "\(review) kvitteringer").font(PF.ui(12)).foregroundStyle(p.lab).lineLimit(1).padding(.top, 6)
            }
            .modifier(Home50TileFrame(fill: p.card, ink: p.ink, border: nil, minHeight: 150))
        }
        .buttonStyle(.plain)
        .task { if store.folders == nil { await store.loadBoligerList() } }
        .accessibilityHint("Åpner Boliger")
    }
}

/// Prøve som halv flis (mørk som Avgang): dager igjen i stor serif.
struct Home52TrialTile: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Trial31Model { Trial31Model.shared }

    var body: some View {
        let look: Home50Look = Home50Look.of(p)
        let list: [TrialW32b] = m.active.map { (t: Trial31) -> TrialW32b in t.widget32b }.sorted { (a: TrialW32b, b: TrialW32b) -> Bool in a.end < b.end }
        let muted: Color = look.glass ? Color.white.opacity(0.66) : Color(hex: "#a9a397")
        Button {
            Haptics.shared.tap()
            if list.isEmpty { store.subAdding = true } else { store.paperGo("abo") }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Home50Label(text: "Prøve", color: Color(hex: "#f29a8a"))
                Spacer(minLength: 4)
                if let t = list.first {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text("\(t.days())").font(PF.serif(48)).lineLimit(1)
                        Text(t.unitShort()).font(PF.ui(13, .semibold)).foregroundStyle(muted)
                    }
                    Text(t.name).font(PF.ui(14, .semibold)).lineLimit(1)
                    Text("Avslutt før " + t.endShort).font(PF.ui(12)).foregroundStyle(muted).lineLimit(1)
                } else {
                    Text(m.loaded ? "Ingen aktive" : "Henter …").font(PF.serif(22, medium: true)).lineLimit(1)
                    Text("+ Legg til").font(PF.ui(12)).foregroundStyle(muted)
                }
            }
            .modifier(Home50TileFrame(fill: look.av, ink: look.avInk, border: look.border, minHeight: 150))
        }
        .buttonStyle(.plain)
        .task(id: store.account?.id ?? "") { if !m.loaded { await m.load(store.api) } }
        .accessibilityHint("Åpner prøveperiodene")
    }
}

/// Siste nytt (3a): hele kortet åpner nyhetsleseren, med lett haptikk. Toppsaken i serif, to til under.
struct Home52NewsTile: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        let items: [NewsItem] = store.homeNews.isEmpty ? Array((store.news?.items ?? []).prefix(5)) : store.homeNews
        let top: NewsItem? = items.first
        let rest: [NewsItem] = Array(items.dropFirst().prefix(2))
        let more: Int = Swift.max(0, items.count - 3)
        Button {
            Haptics.shared.tap()
            store.openNews()
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Home50Label(text: "Siste nytt", color: p.mut)
                    Spacer(minLength: 4)
                    if let t = top { Text((t.short + " · " + t.timeText).uppercased()).font(PF.mono(10)).foregroundStyle(p.lab).lineLimit(1) }
                }
                Text(top?.title ?? "Ingen nyheter ennå. Legg til kilder i nyhetsleseren.")
                    .font(top == nil ? PF.ui(13) : PF.serif(24, medium: true))
                    .foregroundStyle(top == nil ? p.mut : p.ink)
                    .lineLimit(3).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                if !rest.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(rest) { (x: NewsItem) in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(x.short).font(PF.mono(10)).foregroundStyle(p.lab).frame(width: 26, alignment: .leading).lineLimit(1)
                                Text(x.title).font(PF.serif(15, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                            }
                        }
                    }
                    .padding(.top, 8)
                    .overlay(alignment: .top) { Rectangle().fill(p.line).frame(height: 1) }
                }
                Text(more > 0 ? "+\(more) saker i nyhetsleseren ›" : "Åpne nyhetsleseren ›").font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
            }
            .modifier(Home50TileFrame(fill: p.card, ink: p.ink, border: nil, pad: EdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 16)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Siste nytt" + (top.map { ": " + $0.title } ?? ""))
        .accessibilityHint("Åpner nyhetsleseren")
    }
}
