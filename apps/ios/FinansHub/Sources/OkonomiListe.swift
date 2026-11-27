import SwiftUI
import UIKit

/* ---------------- Prompt 43: Glimt-orben, saldokortet (4b i Papir), månedstopp i Liste og rød Glimt-knapp ----------------
 Fasit: prompts/prompt-43-pakke/claude-code-finans-saldokort.md, -finans-liste-maned-topp.md, -finans-sok-glimt-knapp.md
 og -domener-glimt-i-kortet.md (orben, ikke figuren). Design: Mobil Papir App.dc.html (finSal, txGroups, finOrb). */

/// Firetakket stjerne (Glimt-tegnet) midt i orben.
struct Star43: Shape {
    func path(in r: CGRect) -> Path {
        let c: CGPoint = CGPoint(x: r.midX, y: r.midY)
        let R: CGFloat = Swift.min(r.width, r.height) / 2
        let k: CGFloat = R * 0.28
        var p: Path = Path()
        p.move(to: CGPoint(x: c.x, y: c.y - R))
        p.addQuadCurve(to: CGPoint(x: c.x + R, y: c.y), control: CGPoint(x: c.x + k, y: c.y - k))
        p.addQuadCurve(to: CGPoint(x: c.x, y: c.y + R), control: CGPoint(x: c.x + k, y: c.y + k))
        p.addQuadCurve(to: CGPoint(x: c.x - R, y: c.y), control: CGPoint(x: c.x - k, y: c.y + k))
        p.addQuadCurve(to: CGPoint(x: c.x, y: c.y - R), control: CGPoint(x: c.x - k, y: c.y - k))
        p.closeSubpath()
        return p
    }
}

/// Glimt-orben: konisk fargering (#b23a2a → #e8794a → #f2c14e → #3fbf9a → #7a5ad6), kremfarget innside og rød stjerne.
/// Roterer sakte (6 s per runde), raskere (1,6 s) mens Glimt svarer. Står stille med «Reduser bevegelse».
/// Prompt 71: ringen er et ferdig lag (Orb43Ring, drawingGroup) som bare roteres av TimelineView(.animation) – ingen
/// repeatForever som kan lekke inn i layout, og farten byttes uten hopp (vinkelen fortsetter der den var).
struct Orb43: View {
    var size: CGFloat = 20
    var busy: Bool = false
    /// Prompt 57: ringen står stille der den er (Glimt-statuspillen når Glimt er ferdig eller feilet).
    var still: Bool = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var t0: Double = Date.timeIntervalSinceReferenceDate
    @State private var deg0: Double = 0
    /// Perioden som gjelder fra t0 (byttes sammen med t0/deg0, så det aldri blir et bilde med feil vinkel).
    @State private var per: Double = 0

    static let colors: [Color] = [DS.fixed(.accent, stil: .papir, dark: false), Color(hex: "#e8794a"), Color(hex: "#f2c14e"), Color(hex: "#3fbf9a"), Color(hex: "#7a5ad6"), DS.fixed(.accent, stil: .papir, dark: false)]

    var body: some View {
        let ring: CGFloat = Swift.max(2, size * 0.12)
        ZStack {
            Circle().fill(DS.fixed(.surface, stil: .papir, dark: false))
            TimelineView(.animation(minimumInterval: nil, paused: reduceMotion || still)) { (ctx: TimelineViewDefaultContext) in
                Orb43Ring(ring: ring)
                    .rotationEffect(.degrees(angle(ctx.date.timeIntervalSinceReferenceDate)))
            }
            Star43().fill(DS.fixed(.accent, stil: .papir, dark: false)).frame(width: size * 0.5, height: size * 0.5)
        }
        .frame(width: size, height: size)
        .onAppear { t0 = Date.timeIntervalSinceReferenceDate; deg0 = 0; per = Orb43.period(busy) }
        .onChange(of: busy) { (_: Bool, now: Bool) in rebase(now) }
        .onChange(of: still) { (_: Bool, now: Bool) in freeze(now) }
        .accessibilityHidden(true)
    }

    private static func period(_ busy: Bool) -> Double { busy ? 1.6 : 6 }

    private func angle(_ t: Double) -> Double {
        if reduceMotion { return 0 }
        if still { return deg0 }
        return Anim71.turn(t, per: per > 0 ? per : Orb43.period(busy), t0: t0, deg0: deg0)
    }

    /// Stopp (vinkelen der ringen er nå) eller start igjen fra samme vinkel.
    private func freeze(_ on: Bool) {
        let now: Double = Date.timeIntervalSinceReferenceDate
        if on && !reduceMotion { deg0 = Anim71.turn(now, per: per > 0 ? per : Orb43.period(busy), t0: t0, deg0: deg0) }
        t0 = now
    }

    /// Ny fart: start fra vinkelen ringen har nå.
    private func rebase(_ next: Bool) {
        let now: Double = Date.timeIntervalSinceReferenceDate
        deg0 = angle(now)
        t0 = now
        per = Orb43.period(next)
    }
}

/// Fargeringen som ett ferdig lag (tegnes én gang, roteres som bilde).
struct Orb43Ring: View {
    let ring: CGFloat

    var body: some View {
        Circle()
            .strokeBorder(AngularGradient(colors: Orb43.colors, center: .center), lineWidth: ring)
            .drawingGroup()
    }
}

/// Rød Glimt-pille med orben på en hvit brikke. På: rød fylt, hvit tekst. Av: rød kant, rød tekst og 12 % rød bakgrunn.
struct Glimt43Pill: View {
    @Environment(\.paper) private var p
    let on: Bool
    var height: CGFloat = 38
    var busy: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Orb43(size: 20, busy: busy)
                    .padding(2)
                    .background(Color.white.opacity(0.92), in: Circle())
                Text("Glimt").font(PF.ui(13, .bold)).foregroundStyle(on ? Color.white : p.lab)
            }
            .padding(.leading, 6).padding(.trailing, 14)
            .frame(height: height)
            .background(on ? p.lab : p.lab.opacity(0.12), in: Capsule())
            .overlay(Capsule().stroke(p.lab, lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(on ? "Glimt er på" : "Glimt")
    }
}

/// Finans → Oversikt: saldokortet (f1) i 4b-oppsett med Papir-farger. Bare to tall: saldo og brukt denne måneden.
/// Prompt 52: fire utseender (Standard, Glass, Kvittering, Fargebunn) – hold inne for å velge (OkonomiSaldokort.swift).
struct Fin43Saldo: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var s: Sal52 { Sal52.shared }

    var body: some View {
        let d: Sal52Data = Sal52Data.of(store)
        Button {
            // Et langt trykk (arket) åpner ikke Kontoer.
            if s.blocksWiggle || s.sheet { return }
            Haptics.shared.tap()
            store.paperFinGo("kontoer")
        } label: {
            Sal52Card(style: s.style, data: d)
                .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        }
        .buttonStyle(.plain)
        // Hold 0,45 s: før wiggle-holdet (0,5 s) i kortstabelen, som da hoppes over (PaperCardStack, Sal52.blocksWiggle).
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.45, maximumDistance: 8).onEnded { (_: Bool) in s.hold() })
        .sheet(isPresented: Binding<Bool>(get: { s.sheet }, set: { s.sheet = $0 })) {
            Sal52Sheet()
                .environment(\.paper, p)
                .homelabMiljo(store)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .onAppear { s.boot() }
        .accessibilityLabel("Saldo alle kontoer \(d.amount) kroner. Brukt i \(d.month) \(d.spent).")
        .accessibilityHint("Åpner Kontoer. Hold inne for å velge utseende.")
    }

    static func month(_ d: Date) -> String { monthFormat.string(from: d) }

    private static let monthFormat: DateFormatter = {
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = "LLLL"
        return f
    }()
}

/// Én måned i Finans → Liste.
struct Fin43Month: Identifiable {
    let id: String          // "2026-10"
    let label: String       // "OKTOBER"
    let short: String       // "OKT"
    let txs: [Tx]
    var net: Double { txs.reduce(0) { $0 + $1.amount } }

    /// Grupperer transaksjonene per måned (nyeste først, rekkefølgen i lista beholdes inne i måneden).
    static func groups(_ list: [Tx]) -> [Fin43Month] {
        var order: [String] = []
        var map: [String: [Tx]] = [:]
        for t in list {
            let k: String = String(t.date.prefix(7))
            if map[k] == nil { order.append(k); map[k] = [] }
            map[k]?.append(t)
        }
        return order.map { (k: String) -> Fin43Month in
            let parts: [Substring] = k.split(separator: "-")
            let m: Int = parts.count == 2 ? (Int(parts[1]) ?? 0) : 0
            let names: [String] = ["JANUAR", "FEBRUAR", "MARS", "APRIL", "MAI", "JUNI", "JULI", "AUGUST", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"]
            let shorts: [String] = ["JAN", "FEB", "MARS", "APR", "MAI", "JUNI", "JULI", "AUG", "SEP", "OKT", "NOV", "DES"]
            let label: String = (1...12).contains(m) ? names[m - 1] : k
            let short: String = (1...12).contains(m) ? shorts[m - 1] : k
            return Fin43Month(id: k, label: label, short: short, txs: map[k] ?? [])
        }
    }
}

/// Månedstoppen: «OKTOBER · 19» i rød mono til venstre, «Netto +25 518,09 kr» til høyre og 2 pt strek i ink under.
struct Fin43MonthHead: View {
    @Environment(\.paper) private var p
    let title: String
    let net: Double
    /// Prompt 52: festet øverst (har scrollet forbi starten av måneden) → avrundet, flytende pille (OkonomiListe.swift).
    var pinned: Bool = false

    var body: some View {
        VStack(spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab).lineLimit(1)
                Spacer(minLength: 8)
                Text("Netto " + (net > 0 ? "+" : "") + Fin43MonthHead.kr(net)).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
            }
            .padding(.horizontal, pinned ? 14 : 2)
            .padding(.vertical, pinned ? 10 : 0)
            .background { if pinned { Fin52StickBg() } }
            .padding(.horizontal, pinned ? -6 : 0)
            if !pinned { Rectangle().fill(p.ink).frame(height: 2) }
        }
        .padding(.top, pinned ? 10 : 4)
        .background(pinned ? Color.clear : p.bg)
        .animation(.easeOut(duration: 0.22), value: pinned)
        .accessibilityElement(children: .combine)
    }

    static func kr(_ v: Double) -> String {
        if Privacy.shared.hidden { return neg0(v) + " kr" }
        let s: String = krFormat.string(from: NSNumber(value: abs(v))) ?? String(format: "%.2f", abs(v))
        return (v < 0 ? "−" : "") + s + " kr"
    }

    private static let krFormat: NumberFormatter = {
        let f: NumberFormatter = NumberFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.numberStyle = .decimal
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f
    }()
}

/* ---------------- Prompt 52 (IOS52A): Finans → Liste – avrundet månedslinje når den er festet ----------------
   Spesifikasjon: prompt-52-pakke/claude-code-finans-liste-maanedslinje-avrundet.md. Fasit: Homelab.dc.html (stickInit, data-fstick).
   – I flyt: som før (mono-etikett, netto, 2 pt strek under).
   – Festet: radius 16, kortfarge 88 % + .ultraThinMaterial, 1 pt kontur i linjefarge, myk skygge (0 10 24 −14 rgba(27,26,23,.45)),
     ingen strek, luft 10/14, 6 pt bredere enn lista på hver side, 10 pt fra toppen. Overgang 0,22 s.
   – Festet = toppen av månedens innhold har scrollet opp under overskriften (målt i det globale koordinatsystemet). Ingen gester. */

/// Én måned i lista: seksjon med festet overskrift som vet når den er festet.
struct Fin52MonthSection<C: View>: View {
    let title: String
    let net: Double
    @ViewBuilder let content: () -> C
    @State private var headBottom: CGFloat = 0
    @State private var contentTop: CGFloat = 0

    private var pinned: Bool { headBottom > 0 && contentTop < headBottom - 2 }

    var body: some View {
        Section {
            content()
                .background(GeometryReader { (g: GeometryProxy) in
                    Color.clear
                        .onAppear { contentTop = g.frame(in: .global).minY }
                        .onChange(of: g.frame(in: .global).minY) { (_: CGFloat, y: CGFloat) in contentTop = y }
                })
        } header: {
            Fin43MonthHead(title: title, net: net, pinned: pinned)
                .background(GeometryReader { (g: GeometryProxy) in
                    Color.clear
                        .onAppear { headBottom = g.frame(in: .global).maxY }
                        .onChange(of: g.frame(in: .global).maxY) { (_: CGFloat, y: CGFloat) in headBottom = y }
                })
        }
    }
}

/// Bakgrunnen til den festede pillen.
struct Fin52StickBg: View {
    @Environment(\.paper) private var p

    var body: some View {
        let shape: RoundedRectangle = RoundedRectangle(cornerRadius: 16, style: .continuous)
        ZStack {
            shape.fill(.ultraThinMaterial)
            shape.fill(p.card.opacity(0.88))
        }
        .overlay(shape.stroke(p.line, lineWidth: 1))
        .shadow(color: Color(red: 27 / 255, green: 26 / 255, blue: 23 / 255).opacity(0.28), radius: 12, x: 0, y: 10) // spredning −14 finnes ikke i SwiftUI: lavere opasitet
        .transition(.opacity)
    }
}
