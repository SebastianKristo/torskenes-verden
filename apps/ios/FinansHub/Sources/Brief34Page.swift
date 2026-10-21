import SwiftUI
import UIKit

/* ---------------- Prompt 34: Glimt-brief – siden, Hjem-kortet og den levende figuren ----------------
   Fasit: design/Glimt Brief.dc.html → isPage (bakgrunn #e6ecef → #f3efe6, «GLIMT · KVELDSBRIEF» + Ferdig, tittel Newsreader 40,
   oppsummering Newsreader 17, Vær i blått kort #22476b med nedbør neste 12 t, Kalender med «NESTE OM 40 MIN», Nyheter,
   «Laget av Glimt 20:31 …», guide-boble og figur 76 nederst til høyre) og isCard (blått kort med «KVELDSBRIEF · GLIMT»,
   oppsummering i 3 linjer, chips og figuren til høyre). Hjem-kortet er widget h12 «Glimt-brief» (flyttes/skjules i wiggle). */

/// Figuren med animasjon (svev 2,6 s, ring, blunk, stjerne, vinking). «Reduser bevegelse»: stillestående.
struct Glimt34Live: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let size: CGFloat
    var mood: Glimt34Mood = .idle
    var lean: Double = 0

    var body: some View {
        if reduce {
            Glimt34Figure(size: size, mood: mood, lean: lean, t: 0, still: true)
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { (ctx: TimelineViewDefaultContext) in
                Glimt44Brief34Stack(size: size, mood: mood, lean: lean, t: ctx.date.timeIntervalSinceReferenceDate)
            }
            .frame(width: size, height: size * 1.12)
            .animation(.easeInOut(duration: 0.4), value: lean)
        }
    }
}

/// Prompt 44: figuren og juleantrekket i én beholder. Svevet og lenet ligger på beholderen, så lue og skjerf følger med.
struct Glimt44Brief34Stack: View {
    let size: CGFloat
    let mood: Glimt34Mood
    let lean: Double
    let t: Double

    var body: some View {
        let bob: CGFloat = CGFloat(-2.5 + 2.5 * cos(t * 2 * .pi / 2.6))
        ZStack(alignment: .topLeading) {
            Glimt34Figure(size: size, mood: mood, lean: 0, t: t, carried44: true)
            Glimt40DressAuto(S: size, H: size * 1.12, t: t)
        }
        .frame(width: size, height: size * 1.12, alignment: .topLeading)
        .rotationEffect(.degrees(lean))
        .offset(y: bob)
    }
}

/// Legges i PaperShell: briefen i fullskjerm.
struct Brief34Host: ViewModifier {
    @Environment(Store.self) private var store
    let p: PaperPalette
    @MainActor private var m: Brief34Model { Brief34Model.shared }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { m.open }, set: { (v: Bool) in if !v { m.close() } })) {
                // Prompt 35: briefen med Glimt og venner, opplesning, nyheter med bilder og prøveperioder (Brief35Page.swift).
                Brief35Page()
                    .environment(\.paper, p)
                    .edgeSwipeClose30 { m.close() }
            }
    }
}

extension View {
    func brief34Host(_ p: PaperPalette) -> some View { modifier(Brief34Host(p: p)) }
}

/* ---------- Hjem-kortet (h12) ---------- */

struct Brief34HomeCard: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Brief34Model { Brief34Model.shared }

    var body: some View {
        let b: Brief34 = m.brief ?? Brief34()
        // Prompt 40: et avbrutt sveip (over 6 pt bevegelse) åpner ikke briefen (Swipe40Gate i Swipe39.swift).
        Button { if !Swipe40Gate.moved { m.show() } } label: {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(b.kick.uppercased() + " · GLIMT").font(PF.mono(10.5)).tracking(1.4).foregroundStyle(Brief34C.peach)
                    Text(b.summary.isEmpty ? "Glimt lager briefen din …" : b.summary)
                        .font(PF.serif(17, medium: true)).foregroundStyle(Color.white).lineSpacing(2).lineLimit(3)
                        .multilineTextAlignment(.leading)
                    Brief34Chips(chips: b.chips).padding(.top, 2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                // Prompt 35: verten (brukerens figur, Glimt Natt 21–06).
                // Prompt 39: «Glimt i briefen» av → teksten fyller hele bredden.
                if Glimt35Model.shared.cfg.briefGlimt {
                    Glimt35Live(id: Glimt35Model.shared.cfg.host, size: 56, mood: Glimt35Char.sleeping() ? .sover : .idle)
                        .frame(width: 64)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LinearGradient(colors: [Brief34C.blue, Brief34C.blue2], startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(.plain)
        .task {
            await m.load(store)
            Glimt35Model.shared.refreshExtra()
            await Glimt35Model.shared.load(store)
        }
        .accessibilityLabel(b.kick + ". " + b.summary)
    }
}

struct Brief34Chips: View {
    let chips: [String]

    var body: some View {
        Flow(spacing: 6) {
            ForEach(chips, id: \.self) { (c: String) in
                Text(c).font(PF.ui(11.5, .bold)).foregroundStyle(Color.white).lineLimit(1)
                    .padding(.horizontal, 9).frame(height: 24)
                    .background(Color.white.opacity(0.14), in: Capsule())
            }
        }
    }
}

/* ---------- Siden ---------- */

struct Brief34Page: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Brief34Model { Brief34Model.shared }

    var body: some View {
        let b: Brief34 = m.brief ?? Brief34()
        let g: [(String, String, String)] = m.guide(b)
        let idx: Int = Swift.min(Swift.max(0, m.step - 1), g.count - 1)
        let target: String = m.step > 0 ? g[idx].0 : ""
        ZStack(alignment: .bottomTrailing) {
            LinearGradient(stops: [.init(color: Brief34C.rgb(0xe6ecef), location: 0), .init(color: Brief34C.paper, location: 0.46)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            ScrollViewReader { (proxy: ScrollViewProxy) in
                ScrollView(.vertical, showsIndicators: false) {
                    Brief34Content(b: b, target: target)
                        .padding(.horizontal, 18).padding(.top, 8).padding(.bottom, 170)
                }
                .refreshable { await m.load(store, force: true) }
                .onChange(of: target) { (_: String, t: String) in
                    if t.isEmpty { return }
                    withAnimation(.easeInOut(duration: 0.4)) { proxy.scrollTo("gb-" + t, anchor: UnitPoint(x: 0.5, y: 0.18)) }
                }
            }
            Brief34Guide(steps: g, idx: idx, target: target)
                .padding(.horizontal, 16).padding(.bottom, 20)
        }
        .environment(\.colorScheme, .light)
        .task {
            await m.load(store)
            await m.autoStart()
        }
    }
}

struct Brief34Content: View {
    @MainActor private var m: Brief34Model { Brief34Model.shared }
    let b: Brief34
    let target: String

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("GLIMT · " + b.kick.uppercased()).font(PF.mono(10.5)).tracking(1.4).foregroundStyle(Brief34C.red)
                Spacer(minLength: 8)
                Button { m.close() } label: {
                    Text("Ferdig").font(PF.ui(13.5, .bold)).foregroundStyle(Brief34C.paper)
                        .padding(.horizontal, 18).frame(height: 36)
                        .background(Brief34C.ink, in: Capsule())
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text(b.kick).font(PF.serif(40, medium: true)).foregroundStyle(Brief34C.ink)
                Text(b.summary.isEmpty ? (m.loading ? "Glimt lager briefen din …" : "Ingen brief ennå. Dra ned for å prøve igjen.") : b.summary)
                    .font(PF.serif(17)).foregroundStyle(Brief34C.rgb(0x3d3a33)).lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                if !m.error.isEmpty {
                    Text(m.error).font(PF.ui(12.5, .semibold)).foregroundStyle(Brief34C.red)
                }
            }
            Brief34Weather(b: b).brief34Ring(target == "vaer").id("gb-vaer")
            Brief34Calendar(b: b).brief34Ring(target == "kal").id("gb-kal")
            Brief34NewsCard(b: b).brief34Ring(target == "nyh").id("gb-nyh")
            Text(footer).font(PF.ui(12)).foregroundStyle(Brief34C.rgb(0x8a8478))
                .frame(maxWidth: .infinity).multilineTextAlignment(.center)
        }
    }

    private var footer: String {
        if !b.footer.isEmpty { return b.footer }
        let made: String = b.madeAt.isEmpty ? "Laget av Glimt" : "Laget av Glimt " + b.madeAt
        let src: String = b.sources.isEmpty ? "Vær: MET / Open-Meteo · Nyheter: NRK, VG, E24" : b.sources
        return made + " · " + src
    }
}

/// Pulserende rød ring rundt kortet guiden snakker om.
struct Brief34Ring: ViewModifier {
    let on: Bool

    func body(content: Content) -> some View {
        content.overlay {
            if on { Hl34Ring(radius: 21).allowsHitTesting(false) }
        }
    }
}

extension View {
    func brief34Ring(_ on: Bool) -> some View { modifier(Brief34Ring(on: on)) }
}

struct Brief34Weather: View {
    let b: Brief34

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                Brief34WxIcon(icon: b.icon, size: 44, color: Brief34WxIcon.tint(b.icon))
                VStack(alignment: .leading, spacing: 0) {
                    Text(b.temp.isEmpty ? "–" : b.temp).font(PF.serif(38, medium: true)).foregroundStyle(Color.white)
                    Text(b.placeLine).font(PF.ui(13)).foregroundStyle(Color.white.opacity(0.85))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(b.hiLo).font(PF.mono(12.5)).foregroundStyle(Color.white.opacity(0.9))
            }
            Brief34Rain(rain: b.rain)
            HStack {
                Text("nå")
                Spacer()
                Text("nedbør neste 12 t")
                Spacer()
                Text("+12 t")
            }
            .font(PF.mono(10.5)).foregroundStyle(Color.white.opacity(0.75))
            Brief34WxNotes(b: b)
        }
        .padding(18)
        .background(Brief34C.blue, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

struct Brief34Rain: View {
    let rain: [Double]

    var body: some View {
        let vals: [Double] = rain.isEmpty ? Array(repeating: 0, count: 12) : Array(rain.prefix(12))
        let mx: Double = Swift.max(0.6, vals.max() ?? 0.6)
        HStack(alignment: .bottom, spacing: 3) {
            ForEach(Array(vals.enumerated()), id: \.offset) { (pair: (offset: Int, element: Double)) in
                Brief34RainBar(frac: Swift.max(0.06, pair.element / mx), wet: pair.element >= 0.2)
            }
        }
        .frame(height: 46)
    }
}

struct Brief34RainBar: View {
    let frac: Double
    let wet: Bool

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            UnevenRoundedRectangle(topLeadingRadius: 3, topTrailingRadius: 3)
                .fill(Color.white.opacity(wet ? 0.9 : 0.3))
                .frame(height: 46 * CGFloat(Swift.min(1, frac)))
        }
        .frame(maxWidth: .infinity)
    }
}

struct Brief34WxNotes: View {
    let b: Brief34

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !b.vsYesterday.isEmpty { note("Sammenlignet med i går", b.vsYesterday) }
            if !b.sunset.isEmpty { note("Solnedgang", "Sola går ned " + b.sunset) }
        }
        .padding(.top, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(Color.white.opacity(0.18)).frame(height: 1) }
    }

    private func note(_ k: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(k).font(PF.ui(12)).foregroundStyle(Color.white.opacity(0.75))
            Text(v).font(PF.ui(14, .bold)).foregroundStyle(Color.white)
        }
    }
}

struct Brief34Calendar: View {
    @Environment(Store.self) private var store
    let b: Brief34

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("Kalender").font(PF.serif(22, medium: true)).foregroundStyle(Brief34C.ink)
                Spacer()
                Text(b.nextLabel).font(PF.mono(11)).foregroundStyle(Brief34C.red)
            }
            if b.events.isEmpty {
                Text("Ingen avtaler i dag eller i morgen.").font(PF.ui(13)).foregroundStyle(Brief34C.mut).padding(.vertical, 6)
            }
            ForEach(b.events) { (e: Brief34Event) in
                Brief34EventRow(e: e)
            }
        }
        .padding(16)
        .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

struct Brief34EventRow: View {
    @Environment(Store.self) private var store
    let e: Brief34Event

    var body: some View {
        Button { open() } label: {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(e.time).font(PF.mono(11.5)).foregroundStyle(Brief34C.ink)
                    Text(e.day).font(PF.mono(11.5)).foregroundStyle(Brief34C.mut2)
                }
                .frame(width: 58, alignment: .leading)
                RoundedRectangle(cornerRadius: 2).fill(Brief34EventRow.color(e.color)).frame(width: 4)
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.title).font(PF.ui(14.5, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                    if !e.place.isEmpty { Text(e.place).font(PF.ui(12.5)).foregroundStyle(Brief34C.mut).lineLimit(1) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 9)
            .overlay(alignment: .top) { Rectangle().fill(Brief34C.line).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    static func color(_ hex: String) -> Color {
        hex.isEmpty ? Brief34C.red : Color(hex: hex)
    }

    /// Kalender-appen på dagen (kalender://dag/…), ellers Homelabs egen kalender.
    private func open() {
        Haptic34.light()
        let day: String = e.date.isEmpty ? JS.fmt(Date(), "yyyy-MM-dd") : e.date
        if KalLink33.day(day) { return }
        Brief34Model.shared.close()
        store.paperGo("kalender")
    }
}

struct Brief34NewsCard: View {
    @Environment(Store.self) private var store
    let b: Brief34

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Nyheter").font(PF.serif(22, medium: true)).foregroundStyle(Brief34C.ink)
            if b.news.isEmpty {
                Text("Ingen nyheter fra Nyhetsleser ennå.").font(PF.ui(13)).foregroundStyle(Brief34C.mut).padding(.vertical, 6)
            }
            ForEach(b.news) { (n: Brief34News) in
                Button { store.openLink(n.url) } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(n.source).font(PF.mono(11)).foregroundStyle(Brief34C.red).frame(width: 36, alignment: .leading)
                        Text(n.title).font(PF.serif(15.5, medium: true)).foregroundStyle(Brief34C.ink)
                            .multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
                        Text(n.time).font(PF.mono(11)).foregroundStyle(Brief34C.mut2)
                    }
                    .padding(.vertical, 9)
                    .overlay(alignment: .top) { Rectangle().fill(Brief34C.line).frame(height: 1) }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(Brief34C.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

/// Boblen (Neste / Hopp over) og figuren nederst til høyre. Trykk på figuren starter eller avslutter runden.
struct Brief34Guide: View {
    @MainActor private var m: Brief34Model { Brief34Model.shared }
    let steps: [(String, String, String)]
    let idx: Int
    let target: String

    var body: some View {
        let showBubble: Bool = m.step > 0
        let mood: Glimt34Mood = showBubble ? .talk : .wave
        HStack(alignment: .bottom, spacing: 10) {
            Spacer(minLength: 0)
            if showBubble {
                Brief34Bubble(text: steps[idx].1, nextLabel: steps[idx].2, canSkip: idx > 0 && idx < steps.count - 1, count: steps.count)
                    .transition(.opacity.combined(with: .offset(y: 8)))
            }
            Button { m.tapFigure() } label: {
                Glimt34Live(size: 76, mood: mood, lean: target.isEmpty ? 0 : -8)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(showBubble ? "Avslutt runden med Glimt" : "Start en runde med Glimt")
        }
        .animation(.easeOut(duration: 0.28), value: m.step)
    }
}

struct Brief34Bubble: View {
    @MainActor private var m: Brief34Model { Brief34Model.shared }
    let text: String
    let nextLabel: String
    let canSkip: Bool
    let count: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(text).font(PF.ui(14)).foregroundStyle(Brief34C.paper).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 6) {
                Spacer(minLength: 0)
                if canSkip {
                    Button { m.skip() } label: {
                        Text("Hopp over").font(PF.ui(12, .bold)).foregroundStyle(Brief34C.rgb(0xc9c1b1)).padding(.horizontal, 12).frame(height: 30)
                    }
                    .buttonStyle(.plain)
                }
                Button { m.next(count) } label: {
                    Text(nextLabel).font(PF.ui(12, .bold)).foregroundStyle(Brief34C.ink).lineLimit(1)
                        .padding(.horizontal, 14).frame(height: 30)
                        .background(Brief34C.paper, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: 280, alignment: .leading)
        .background(Brief34C.ink, in: UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 18, bottomTrailingRadius: 4, topTrailingRadius: 18))
        .shadow(color: Color.black.opacity(0.25), radius: 15, y: 14)
    }
}
