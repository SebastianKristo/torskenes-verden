import SwiftUI
import UIKit

/* ---------------- Prompt 34: Glimt-brief – siden, Hjem-kortet og den levende figuren ----------------
   Fasit: design/Glimt Brief.dc.html → isPage (bakgrunn #e6ecef → #f3efe6, «GLIMT · KVELDSBRIEF» + Ferdig, tittel Newsreader 40,
   oppsummering Newsreader 17, Vær i blått kort #22476b med nedbør neste 12 t, Kalender med «NESTE OM 40 MIN», Nyheter,
   «Laget av Glimt 20:31 …», guide-boble og figur 76 nederst til høyre) og isCard (blått kort med «KVELDSBRIEF · GLIMT»,
   oppsummering i 3 linjer, chips og figuren til høyre). Hjem-kortet er widget h12 «Glimt-brief» (flyttes/skjules i wiggle). */

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
    @Environment(\.scenePhase) private var phase
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
            // Prompt 73: kortene hentes når Hjem vises, så de er klare før briefen åpnes (høyst hvert 5. min).
            await Brief52Model.shared.prefetch(store)
        }
        // Prompt 73: og når appen kommer i forgrunnen.
        .onChange(of: phase) { (_: ScenePhase, p: ScenePhase) in
            if p == .active { Task { await Brief52Model.shared.prefetch(store) } }
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
