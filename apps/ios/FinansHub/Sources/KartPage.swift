import SwiftUI
import UIKit
import MapKit

/* ---------------- Prompt 46: Kart – siden (Mer → Kart, side-nøkkel tkart) ----------------
 Fasit: Kart.dc.html. Fullskjerm som Media/Kalender (fanelinjen skjules), «‹ Mer» først i chip-raden går tilbake.
 – Chips øverst: Buss · T-bane · Trikk · Tog · Båt (gjelder holdeplasser og kjøretøy).
 – Panel: bred (iPad ≥ 900 pt) = fast til venstre (372 pt); mobil = bunnark med tre høyder (lav / halv / høy).
   Søk etter holdeplass, faner Lag · Soner · Personer, og avganger for valgt holdeplass.
 – Kilde øverst: «SANNTID · ENTUR» eller «DEMO-DATA». */

struct Kart46Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Kart46 { Kart46.shared }
    @State private var detent: PresentationDetent = .fraction(0.22)

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            if g.size.width >= 900 { wide(g) } else { phone }
        }
        .background(p.bg.ignoresSafeArea())
        .task { await m.load(store) }
        .onDisappear { m.close() }
    }

    private func wide(_ g: GeometryProxy) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Kart46Top(wide: true)
                ScrollView { Kart46Panel().padding(16) }
            }
            .frame(width: 372)
            .background(p.bg)
            Rectangle().fill(p.line).frame(width: 1)
            ZStack(alignment: .topLeading) {
                Kart46MapView().ignoresSafeArea()
                Kart46Chips(back: false).padding(12)
                Kart46ZoomButtons().frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing).padding(16)
            }
        }
    }

    private var phone: some View {
        ZStack(alignment: .top) {
            Kart46MapView().ignoresSafeArea()
            VStack(spacing: 8) {
                Kart46Chips(back: true)
                if !m.zoomHint.isEmpty { Kart46Hint(text: m.zoomHint) }
            }
            .padding(.horizontal, 12).padding(.top, 6)
            Kart46ZoomButtons().frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing).padding(.trailing, 12)
        }
        .sheet(isPresented: .constant(true)) {
            ScrollView { Kart46Panel().padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 24) }
                .environment(\.paper, p)
                .environment(store)
                .presentationDetents([.fraction(0.22), .medium, .large], selection: $detent)
                .presentationDragIndicator(.visible)
                .presentationBackgroundInteraction(.enabled(upThrough: .medium))
                .presentationBackground(p.bg)
                .interactiveDismissDisabled()
        }
    }
}

/// «‹ Mer» + overskrift (bred visning: «Holdeplasser · sanntid · soner»).
struct Kart46Top: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Kart46 { Kart46.shared }
    let wide: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button { Haptic34.back(); m.close() } label: {
                Text("‹ Mer").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink).padding(.horizontal, 14).frame(height: 36)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1)).contentShape(Capsule())
            }
            .buttonStyle(.plain)
            Text("Kart").font(PF.serif(32, medium: true)).foregroundStyle(p.ink)
            Text("Holdeplasser · sanntid · soner").font(PF.ui(13)).foregroundStyle(p.mut)
        }
        .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 4)
    }
}

/// Chips: (‹ Mer) Buss · T-bane · Trikk · Tog · Båt.
struct Kart46Chips: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Kart46 { Kart46.shared }
    let back: Bool

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                if back {
                    Button { Haptic34.back(); m.close() } label: { chip("‹ Mer", on: true, color: p.ink) }
                        .buttonStyle(.plain)
                }
                ForEach(Kart46.modes, id: \.0) { (it: (String, String, String)) in
                    Button { m.toggleMode(it.0, store) } label: { chip(it.1, on: m.md.contains(it.0), color: Color(hex: it.2)) }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(m.md.contains(it.0) ? .isSelected : [])
                }
            }
        }
    }

    private func chip(_ t: String, on: Bool, color: Color) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(t).font(PF.ui(12.5, .bold)).foregroundStyle(on ? p.ink : p.mut)
        }
        .padding(.horizontal, 12).frame(height: 34)
        .background(p.card.opacity(on ? 1 : 0.8), in: Capsule())
        .overlay(Capsule().stroke(on ? color.opacity(0.6) : p.line, lineWidth: 1))
        .shadow(color: Color.black.opacity(0.12), radius: 4, y: 2)
        .frame(minHeight: 44)
        .contentShape(Capsule())
    }
}

struct Kart46Hint: View {
    @Environment(\.paper) private var p
    let text: String

    var body: some View {
        Text(text).font(PF.ui(12, .semibold)).foregroundStyle(p.ink)
            .padding(.horizontal, 12).frame(height: 28)
            .background(p.card, in: Capsule())
            .shadow(color: Color.black.opacity(0.12), radius: 4, y: 2)
    }
}

/// + / − og «Min posisjon».
struct Kart46ZoomButtons: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Kart46 { Kart46.shared }

    var body: some View {
        VStack(spacing: 8) {
            btn("plus", "Zoom inn") { m.go(m.center.latitude, m.center.longitude, Swift.min(18, m.zoom + 1)) }
            btn("minus", "Zoom ut") { m.go(m.center.latitude, m.center.longitude, Swift.max(11, m.zoom - 1)) }
            btn("location.fill", "Min posisjon") {
                if let me = m.people.first(where: { $0.me }) { m.go(me.lat, me.lon, 16) }
                else if let la = Vaer46.shared.lat, let lo = Vaer46.shared.lon { m.go(la, lo, 16) }
            }
        }
    }

    private func btn(_ icon: String, _ label: String, _ act: @escaping () -> Void) -> some View {
        Button { Haptics.shared.tap(); act() } label: {
            Image(systemName: icon).font(.system(size: 15, weight: .bold)).foregroundStyle(p.ink)
                .frame(width: 44, height: 44)
                .background(p.card, in: Circle())
                .shadow(color: Color.black.opacity(0.16), radius: 5, y: 2)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/* ---------- Panelet ---------- */

struct Kart46Panel: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Kart46 { Kart46.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(m.sourceText).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(m.demo ? Color(hex: "#a0671a") : Color(hex: "#2f6b4a"))
            Kart46Search()
            if let s = m.stop {
                Kart46StopCard(s: s)
            } else {
                Kart46Tabs()
                tabBody
            }
        }
    }

    @ViewBuilder private var tabBody: some View {
        switch m.tab {
        case "soner": Kart46ZoneList()
        case "personer": Kart46PeopleList()
        default: Kart46Layers()
        }
    }
}

struct Kart46Search: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Kart46 { Kart46.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 14, weight: .semibold)).foregroundStyle(p.mut)
                TextField("Søk etter holdeplass", text: Binding<String>(get: { m.query }, set: { (v: String) in m.query = v; m.search(store) }))
                    .font(PF.ui(15)).foregroundStyle(p.ink).submitLabel(.search)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            .padding(.horizontal, 14).frame(height: 44)
            .background(p.card, in: Capsule())
            .overlay(Capsule().stroke(p.line, lineWidth: 1))
            ForEach(m.results) { (s: Kart46Stop) in
                Button {
                    m.query = ""
                    m.results = []
                    m.select(s, store)
                } label: {
                    HStack(spacing: 8) {
                        Circle().fill(Kart46.color(s.modes.first ?? "bus")).frame(width: 8, height: 8)
                        Text(s.name).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                        Spacer(minLength: 4)
                        Text(s.modes.map { Kart46.name($0) }.joined(separator: " · ")).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
                    }
                    .padding(.horizontal, 12).frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct Kart46Tabs: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Kart46 { Kart46.shared }

    var body: some View {
        HStack(spacing: 0) {
            seg("lag", "Lag")
            seg("soner", "Soner")
            seg("personer", "Personer")
        }
        .padding(3)
        .background(p.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func seg(_ k: String, _ t: String) -> some View {
        let on: Bool = m.tab == k
        return Button { Haptics.shared.select(); m.tab = k } label: {
            Text(t).font(PF.ui(13, .bold)).foregroundStyle(on ? p.bg : p.ink)
                .frame(maxWidth: .infinity, minHeight: 36)
                .background(on ? p.ink : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

struct Kart46Layers: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Kart46 { Kart46.shared }

    var body: some View {
        VStack(spacing: 0) {
            row("stops", "Holdeplasser", "Buss, T-bane, trikk, tog og båt", m.showStops)
            Rectangle().fill(p.line).frame(height: 1)
            row("vehicles", "Kjøretøy i sanntid", m.liveIds.isEmpty ? "Velg soner under Soner" : "\(m.vehicles.count) i valgte soner", m.showVehicles)
            Rectangle().fill(p.line).frame(height: 1)
            row("zones", "Mine soner", "\(m.zones.count) soner fra Familie", m.showZones)
            Rectangle().fill(p.line).frame(height: 1)
            row("people", "Personer", "Hvor familien er nå", m.showPeople)
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func row(_ k: String, _ t: String, _ sub: String, _ on: Bool) -> some View {
        Toggle(isOn: Binding<Bool>(get: { on }, set: { (v: Bool) in m.setLayer(k, v, store) })) {
            VStack(alignment: .leading, spacing: 1) {
                Text(t).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(12)).foregroundStyle(p.mut)
            }
        }
        .tint(p.lab)
        .padding(.horizontal, 14).frame(minHeight: 58)
    }
}

struct Kart46ZoneList: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Kart46 { Kart46.shared }

    var body: some View {
        VStack(spacing: 0) {
            if m.zones.isEmpty {
                Text("Ingen soner ennå. Lag soner i Familie → Soner.").font(PF.ui(13.5)).foregroundStyle(p.mut).padding(14)
            }
            ForEach(Array(m.zones.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Kart46Zone)) in
                if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                row(pair.element)
            }
        }
        .frame(maxWidth: .infinity)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func row(_ z: Kart46Zone) -> some View {
        HStack(spacing: 10) {
            Button { Haptics.shared.tap(); m.go(z.lat, z.lon, 15) } label: {
                HStack(spacing: 10) {
                    Circle().stroke(Color(hex: z.color), lineWidth: 2.5).frame(width: 16, height: 16)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(z.name).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                        Text("Radius \(Int(z.radius)) m" + (z.live ? " · LIVE" : "")).font(PF.ui(12)).foregroundStyle(p.mut)
                    }
                    Spacer(minLength: 4)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button { m.setLive(z, !z.live, store) } label: {
                Text("Sanntid").font(PF.ui(12.5, .bold)).foregroundStyle(z.live ? p.bg : p.ink)
                    .padding(.horizontal, 12).frame(height: 32)
                    .background(z.live ? p.ink : Color.clear, in: Capsule())
                    .overlay(Capsule().stroke(z.live ? p.ink : p.line, lineWidth: 1))
                    .frame(minHeight: 44)
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(z.live ? .isSelected : [])
        }
        .padding(.horizontal, 14).frame(minHeight: 58)
    }
}

struct Kart46PeopleList: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Kart46 { Kart46.shared }

    var body: some View {
        VStack(spacing: 0) {
            if m.people.isEmpty {
                Text("Ingen deler posisjon med deg nå.").font(PF.ui(13.5)).foregroundStyle(p.mut).padding(14)
            }
            ForEach(Array(m.people.enumerated()), id: \.element.id) { (pair: (offset: Int, element: Kart46Person)) in
                if pair.offset > 0 { Rectangle().fill(p.line).frame(height: 1) }
                row(pair.element)
            }
        }
        .frame(maxWidth: .infinity)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func row(_ pe: Kart46Person) -> some View {
        Button { Haptics.shared.tap(); m.go(pe.lat, pe.lon, 16) } label: {
            HStack(spacing: 10) {
                Text(pe.me ? "Du" : String(pe.name.prefix(1)).uppercased()).font(PF.ui(12, .bold)).foregroundStyle(Color.white)
                    .frame(width: 32, height: 32).background(Color(hex: pe.color), in: Circle())
                VStack(alignment: .leading, spacing: 1) {
                    Text(pe.name).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                    Text(sub(pe)).font(PF.ui(12)).foregroundStyle(p.mut)
                }
                Spacer(minLength: 4)
                Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).frame(minHeight: 58)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func sub(_ pe: Kart46Person) -> String {
        let z: String = pe.zone.isEmpty ? "Utenfor sonene" : "I sone " + pe.zone
        guard let u = pe.updated else { return z }
        let f: RelativeDateTimeFormatter = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "nb_NO")
        return z + " · " + f.localizedString(for: u, relativeTo: Date())
    }
}

/// Valgt holdeplass: navn, transportmidler og avganger (12 stk / 2 t).
struct Kart46StopCard: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Kart46 { Kart46.shared }
    let s: Kart46Stop

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.name).font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                    Text(s.modes.map { Kart46.name($0) }.joined(separator: " · ")).font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer()
                Button { Haptic34.back(); m.stop = nil } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(p.ink)
                        .frame(width: 34, height: 34).background(p.card, in: Circle()).frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Lukk")
            }
            if m.callsBusy && m.calls.isEmpty { ProgressView().frame(maxWidth: .infinity).padding(10) }
            VStack(spacing: 0) {
                ForEach(m.calls) { (c: Kart46Call) in
                    Kart46CallRow(c: c)
                    Rectangle().fill(p.line).frame(height: 1)
                }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }
}

struct Kart46CallRow: View {
    @Environment(\.paper) private var p
    let c: Kart46Call

    var body: some View {
        HStack(spacing: 10) {
            Text(c.line).font(PF.ui(12.5, .heavy)).foregroundStyle(Color.white)
                .padding(.horizontal, 7).frame(minWidth: 34, minHeight: 24)
                .background(Kart46.color(c.mode), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(c.to).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                if !c.platform.isEmpty { Text("Plattform " + c.platform).font(PF.ui(11.5)).foregroundStyle(p.mut) }
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 1) {
                Text(c.minutes <= 0 ? "Nå" : "\(c.minutes) min").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                if c.delay > 0 { Text("+\(c.delay) min").font(PF.ui(11.5, .bold)).foregroundStyle(Color(hex: "#b23a2a")) }
            }
        }
        .padding(.horizontal, 12).frame(minHeight: 50)
    }
}

extension View {
    /// Kart i fullskjerm (fanelinjen skjules). Legges på roten i Papir.
    func kart46Host(_ p: PaperPalette, _ store: Store) -> some View {
        fullScreenCover(isPresented: Binding<Bool>(get: { Kart46.shared.open }, set: { (v: Bool) in if !v { Kart46.shared.close() } })) {
            // Prompt 50: kantsveip lukker også Kart. UIKit-kantgesten tar bare berøringer som starter i kantsonen (ca. 20 pt),
            // så kartet kan fortsatt dras overalt ellers. «‹ Mer» lukker som før.
            Kart46Page().environment(\.paper, p).environment(store)
                .edgeSwipeClose30 { Kart46.shared.close() }
        }
    }
}
