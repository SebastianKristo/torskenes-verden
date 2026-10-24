import SwiftUI
import UIKit
import MapKit
import CoreLocation

/* ---------------- Prompt 41: Min reise – visningene (Ruter-siden og Hjem) ---------------- */
// Fasit: Mobil Papir App.dc.html → Ruter (MIN REISE · SEBASTIAN, SKOLESONER · ALLE TELLER SOM SKOLE, PÅ HJEM NÅR DU FORLATER
// SKOLEN) og Hjem (MIN REISE · FORLOT SKOLEN 16:31), vedlegg/min-reise-hjem.png.

enum MinReise41Look {
    static func chipBg(_ l: MinReise41Leg, _ p: PaperPalette) -> Color {
        if l.isWalk { return p.bg }
        switch l.mode {
        case "tram": return Color(hex: "#c4dcf6")
        case "metro": return Color(hex: "#f7d3b0")
        case "rail": return Color(hex: "#e6eba0")
        default: return Color(hex: "#f2b9b3")
        }
    }

    static func chipInk(_ l: MinReise41Leg, _ p: PaperPalette) -> Color {
        if l.isWalk { return p.ink }
        switch l.mode {
        case "tram": return Color(hex: "#0b3a6e")
        case "metro": return Color(hex: "#7a3a06")
        case "rail": return Color(hex: "#3d4200")
        default: return Color(hex: "#7a1410")
        }
    }
}

/// «Gå 6 › Trikk 9 min › Gå 2 › 45».
struct MinReise41Strip: View {
    @Environment(\.paper) private var p
    let legs: [MinReise41Leg]

    var body: some View {
        Flow(spacing: 6) {
            ForEach(Array(legs.enumerated()), id: \.offset) { i, l in
                HStack(spacing: 6) {
                    if i > 0 { Text("›").font(PF.ui(13, .semibold)).foregroundStyle(p.mut) }
                    Text(l.chip).font(PF.ui(13.5, .bold)).foregroundStyle(MinReise41Look.chipInk(l, p))
                        .padding(.horizontal, 10).frame(height: 30)
                        .background(MinReise41Look.chipBg(l, p), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                        .overlay(alignment: .topTrailing) {
                            if l.delayMin >= 3 && !l.isWalk {
                                Circle().fill(Color(hex: "#c0392b")).frame(width: 8, height: 8).offset(x: 2, y: -2)
                            }
                        }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Rødt varsel: «Trikken fra Frydenlund er 10 min forsinket» + gangalternativet.
struct MinReise41AlertBox: View {
    @Environment(\.paper) private var p
    let a: MinReise41Alert
    var short: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text("!").font(PF.ui(14, .heavy)).foregroundStyle(Color.white)
                .frame(width: 26, height: 26).background(Color(hex: "#b23a2a"), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(a.text.isEmpty ? "Trikken er forsinket" : a.text).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(detail).font(PF.ui(13)).foregroundStyle(p.ink.opacity(0.8)).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color(hex: "#b23a2a"), lineWidth: 1.5))
    }

    private var detail: String {
        if short && !a.short.isEmpty { return a.short }
        if !short && !a.body.isEmpty { return a.body }
        let walk: String = a.walkMin > 0 ? String(a.walkMin) + " min" : "noen minutter"
        if short { return "Gå til Majorstuen (" + walk + ")" + (a.catches.isEmpty ? "." : " og rekk " + a.catches.replacingOccurrences(of: " ", with: " kl. ") + ".") }
        var s: String = "Går du til Majorstuen i stedet tar det " + walk
        if a.km > 0 { s += " (" + String(format: "%.1f", a.km).replacingOccurrences(of: ".", with: ",") + " km)" }
        if !a.catches.isEmpty { s += ", og du rekker " + a.catches.replacingOccurrences(of: " ", with: " kl. ") }
        s += "."
        if let h = a.homeAt { s += " Hjemme ca. " + Hjemlys40Look.clock(h) + "." }
        return s
    }
}

/* ---------- Ruter-siden ---------- */

struct MinReise41RuterCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: MinReise41 { MinReise41.shared }
    /// Prompt 46: innstillingene (skolesoner, antall, På Hjem) vises bare i wiggle-redigering av Ruter.
    var editing: Bool = false

    var body: some View {
        Group {
            if m.enabled {
                VStack(alignment: .leading, spacing: 12) {
                    // Prompt 42 (claude-code-ruter-snu-knapp.md): etikett + tittel til venstre, «⇄ Snu» (36 pt, padding 13, Manrope 700
                    // 12,5) til høyre, vertikalt sentrert mot hele blokken. Treffflaten er minst 44 × 44 uten å endre det synlige.
                    HStack(alignment: .center, spacing: 10) {
                        VStack(alignment: .leading, spacing: 4) {
                            PLabel(text: "Min reise · " + firstName)
                            Text(m.title).font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
                        }
                        Spacer(minLength: 0)
                        Button { m.flip(store) } label: {
                            Text("⇄ Snu").font(PF.ui(12.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                                .padding(.horizontal, 13).frame(height: 36)
                                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .fixedSize()
                        .accessibilityLabel("Snu reisen")
                    }
                    if let a = m.alert { MinReise41AlertBox(a: a) }
                    if m.busy && m.options.isEmpty {
                        Text("Henter rutene fra Entur …").font(PF.ui(13)).foregroundStyle(p.mut)
                    }
                    if !m.err.isEmpty && m.options.isEmpty {
                        Text(m.err).font(PF.ui(13)).foregroundStyle(p.lab)
                    }
                    // Prompt 45: nøyaktig N anbefalte reiser (Antall anbefalte reiser 1 · 2 · 3).
                    ForEach(Array(m.shown.enumerated()), id: \.element.id) { i, o in
                        MinReise41Row(o: o, first: i == 0)
                    }
                    // Prompt 46 (claude-code-ruter-innstillinger-i-wiggle.md): innstillingene ligger på kortet bare i wiggle.
                    if editing {
                        VStack(alignment: .leading, spacing: 12) {
                            Rectangle().fill(p.line).frame(height: 1)
                            PLabel(text: "Innstillinger for kortet", color: p.mut)
                            MinReise41Zones()
                            MinReise41HomeSetting()
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    } else if CLLocationManager().authorizationStatus != .authorizedAlways {
                        MinReise46AlwaysLine()
                    }
                }
                .animation(.easeInOut(duration: 0.3), value: editing)
                .padding(16)
                .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
        }
        .task { await m.load(store) }
        .task {
            // Sanntid hvert 30. s mens siden er åpen.
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                if Task.isCancelled { break }
                if m.enabled { await m.trip(store) }
            }
        }
        .sheet(isPresented: Binding<Bool>(get: { m.addingZone }, set: { (v: Bool) in m.addingZone = v })) {
            MinReise41ZoneSheet().environment(\.paper, p).presentationDetents([.large])
        }
    }

    private var firstName: String { String(store.displayName.split(separator: " ").first ?? "Meg") }
}

struct MinReise41Row: View {
    @Environment(\.paper) private var p
    @MainActor private var m: MinReise41 { MinReise41.shared }
    let o: MinReise41Option
    let first: Bool

    private var isOpen: Bool { m.open == o.id }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                Haptics.shared.select()
                withAnimation(.easeOut(duration: 0.25)) { m.open = isOpen ? nil : o.id }
            } label: {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(o.dep.map { Hjemlys40Look.clock($0) } ?? "–").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                        Text(arrText).font(PF.ui(13)).foregroundStyle(p.mut)
                        Spacer(minLength: 4)
                        ForEach(badges, id: \.self) { (b: String) in badge(b) }
                    }
                    MinReise41Strip(legs: o.legs)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if isOpen { MinReise41Timeline(legs: o.legs).transition(.opacity.combined(with: .move(edge: .top))) }
        }
        .padding(.top, first ? 0 : 12)
        .overlay(alignment: .top) { if !first { Rectangle().fill(p.line).frame(height: 1) } }
        .clipped()
    }

    /// «→ 17:09 · 37 min» (hele etiketten lages her).
    private var arrText: String {
        let a: String = o.arr.map { Hjemlys40Look.clock($0) } ?? ""
        let mins: Int = o.minutes > 0 ? o.minutes : (o.dep != nil && o.arr != nil ? Int(((o.arr ?? Date()).timeIntervalSince(o.dep ?? Date()) / 60).rounded()) : 0)
        return "→ " + a + (mins > 0 ? " · " + String(mins) + " min" : "")
    }

    private var badges: [String] {
        var out: [String] = []
        if o.preferred { out.append("Foretrukket") }
        for b in o.badges where !out.contains(b) { out.append(b) }
        return out
    }

    private func badge(_ b: String) -> some View {
        let bad: Bool = b.contains("+") || b.lowercased().contains("forsink") || b.lowercased().contains("gått")
        return Text(b).font(PF.ui(11, .bold)).foregroundStyle(bad ? Color.white : Color(hex: "#1f5a37")).lineLimit(1)
            .padding(.horizontal, 8).frame(height: 22)
            .background(bad ? Color(hex: "#b23a2a") : Color(hex: "#d7ecdc"), in: Capsule())
    }
}

/// Tidslinje: klokkeslett, holdeplass, gangtid og meter, byttetid og ventetid. Gange stiplet, kjøring hel. Forsinkelser i rødt.
struct MinReise41Timeline: View {
    @Environment(\.paper) private var p
    let legs: [MinReise41Leg]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(legs.enumerated()), id: \.offset) { i, l in
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(l.depText).font(PF.mono(12.5)).foregroundStyle(l.delayMin >= 3 ? Color(hex: "#b23a2a") : p.ink)
                        if l.delayMin >= 3, let a = l.aimed {
                            Text(Hjemlys40Look.clock(a)).font(PF.mono(10.5)).strikethrough().foregroundStyle(p.mut)
                        }
                    }
                    .frame(width: 46, alignment: .trailing)
                    VStack(spacing: 0) {
                        Circle().fill(l.isWalk ? p.mut : MinReise41Look.chipInk(l, p)).frame(width: 9, height: 9)
                        Rectangle().fill(Color.clear).frame(width: 3).frame(minHeight: 34)
                            .overlay {
                                if l.isWalk {
                                    Path { (pa: inout Path) in pa.move(to: CGPoint(x: 1.5, y: 0)); pa.addLine(to: CGPoint(x: 1.5, y: 400)) }
                                        .stroke(p.mut, style: StrokeStyle(lineWidth: 2, dash: [3, 4]))
                                } else {
                                    Rectangle().fill(MinReise41Look.chipBg(l, p))
                                }
                            }
                            .clipped()
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(l.from.isEmpty ? (i == 0 ? "Start" : "Bytte") : l.from).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
                        Text(detail(l)).font(PF.ui(12)).foregroundStyle(l.delayMin >= 3 ? Color(hex: "#b23a2a") : p.mut)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.bottom, 10)
                    Spacer(minLength: 0)
                }
            }
            if let last = legs.last {
                HStack(spacing: 10) {
                    Text(last.arr.map { Hjemlys40Look.clock($0) } ?? "").font(PF.mono(12.5)).foregroundStyle(p.ink).frame(width: 46, alignment: .trailing)
                    Circle().fill(p.ink).frame(width: 9, height: 9)
                    Text(last.to.isEmpty ? "Fremme" : last.to).font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
                }
            }
        }
        .padding(12)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func detail(_ l: MinReise41Leg) -> String {
        if l.isWalk {
            let m: String = l.meters > 0 ? " · " + String(l.meters) + " m" : ""
            return "Gå " + String(l.walkMin > 0 ? l.walkMin : l.minutes) + " min" + m
        }
        var s: String = l.modeName + (l.line.isEmpty ? "" : " " + l.line) + " til " + (l.to.isEmpty ? "neste stopp" : l.to) + " · " + String(l.minutes) + " min"
        if l.delayMin >= 3 { s += " · " + String(l.delayMin) + " min forsinket" }
        return s
    }
}

/// Prompt 46: i normal visning – en liten linje når posisjon «Alltid» mangler (skolesonene virker ikke uten).
struct MinReise46AlwaysLine: View {
    @Environment(\.paper) private var p

    var body: some View {
        Button {
            Haptics.shared.tap()
            if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
        } label: {
            HStack(spacing: 6) {
                Text("Posisjon «Alltid» mangler – skolesonene virker ikke.").font(PF.ui(12)).foregroundStyle(p.mut)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                Text("Slå på ›").font(PF.ui(12, .bold)).foregroundStyle(p.lab)
            }
            .frame(minHeight: 32)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Skolesoner og valget for Hjem ---------- */

struct MinReise41Zones: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: MinReise41 { MinReise41.shared }

    var body: some View {
        // Prompt 50: skolen hentes fra Familie › Steder (bare visning, «Endre i Steder ›»). Eldre server: sonene som før.
        if Fam50School.shared.supported {
            VStack(alignment: .leading, spacing: 8) {
                Fam50SchoolSection()
                alwaysNote
            }
        } else {
            legacy
        }
    }

    @ViewBuilder private var alwaysNote: some View {
        if CLLocationManager().authorizationStatus != .authorizedAlways {
            Text("Slå på posisjon «Alltid» for appen, så merker den når du forlater skolen.").font(PF.ui(12)).foregroundStyle(p.mut)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var legacy: some View {
        VStack(alignment: .leading, spacing: 8) {
            PLabel(text: "Skolesoner · alle teller som skole")
            Flow(spacing: 6) {
                ForEach(m.zones) { (z: MinReise41Zone) in
                    HStack(spacing: 6) {
                        Text(z.name + " " + String(Int(z.radius)) + " m").font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                        if m.zones.count > 1 {
                            Button { m.deleteZone(z, store) } label: {
                                Image(systemName: "xmark").font(.system(size: 9, weight: .heavy)).foregroundStyle(p.mut)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Slett " + z.name)
                        }
                    }
                    .padding(.horizontal, 10).frame(height: 30)
                    .background(p.bg, in: Capsule())
                }
                Button { Haptics.shared.tap(); m.addingZone = true } label: {
                    Text("+ Sone").font(PF.ui(12.5, .bold)).foregroundStyle(p.lab).padding(.horizontal, 10).frame(height: 30)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            if CLLocationManager().authorizationStatus != .authorizedAlways {
                Text("Slå på posisjon «Alltid» for appen, så merker den når du forlater skolen.").font(PF.ui(12)).foregroundStyle(p.mut)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct MinReise41HomeSetting: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: MinReise41 { MinReise41.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MinReise45Count()
            PLabel(text: "På Hjem når du forlater skolen")
            HStack(spacing: 6) {
                chip("over", "Over Ruter-kortet")
                chip("instead", "I stedet")
                chip("off", "Av")
            }
        }
    }

    private func chip(_ k: String, _ n: String) -> some View {
        let on: Bool = m.homeCard == k
        return Button { m.setHomeCard(k, store) } label: {
            Text(n).font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
                .padding(.horizontal, 12).frame(height: 30)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// «+ Sone»: trykk på kartet for å velge punkt, radius 50–300 m.
struct MinReise41ZoneSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.dismiss) private var dismiss
    @MainActor private var m: MinReise41 { MinReise41.shared }
    @State private var name: String = ""
    @State private var radius: Double = 150
    @State private var point: CLLocationCoordinate2D? = nil
    @State private var cam: MapCameraPosition = .userLocation(fallback: .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 59.9295, longitude: 10.7155),
                                                                                                    span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02))))

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Ny skolesone").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                Spacer()
                Button("Avbryt") { dismiss() }.font(PF.ui(14, .semibold)).foregroundStyle(p.mut)
            }
            Text("Trykk på kartet der sonen skal være. Alle skolesoner teller som «Skole» i rutene og i Vel fremme.")
                .font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            MapReader { (proxy: MapProxy) in
                Map(position: $cam) {
                    if let c = point {
                        MapCircle(center: c, radius: radius).foregroundStyle(Color(hex: "#b23a2a").opacity(0.18)).stroke(Color(hex: "#b23a2a"), lineWidth: 2)
                        Marker(name.isEmpty ? "Skole" : name, coordinate: c).tint(Color(hex: "#b23a2a"))
                    }
                    UserAnnotation()
                }
                .onTapGesture { (pt: CGPoint) in
                    if let c = proxy.convert(pt, from: .local) {
                        Haptics.shared.select()
                        point = c
                    }
                }
            }
            .frame(height: 300)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            TextField("Navn, f.eks. Idrettshallen", text: $name)
                .font(PF.ui(15)).foregroundStyle(p.ink)
                .padding(.horizontal, 12).frame(height: 44)
                .background(p.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            HStack {
                Text("Radius").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                Slider(value: $radius, in: 50...300, step: 10).tint(p.lab)
                Text(String(Int(radius)) + " m").font(PF.mono(13)).foregroundStyle(p.mut).frame(width: 56, alignment: .trailing)
            }
            Button {
                guard let c = point else { return }
                m.addZone(store, name: name, coord: c, radius: radius)
                dismiss()
            } label: {
                Text("Lagre sonen").font(PF.ui(15, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 48)
                    .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(point == nil)
            .opacity(point == nil ? 0.4 : 1)
            Spacer(minLength: 0)
        }
        .padding(20)
        .background(p.bg.ignoresSafeArea())
    }
}

/* ---------- Hjem: «MIN REISE · FORLOT SKOLEN 16:31» ---------- */

/// Avganger-plassen på Hjem: Min reise over (eller i stedet for) Ruter-kortet når du har forlatt skolen.
struct MinReise41HomeSlot: View {
    @Environment(Store.self) private var store
    @MainActor private var m: MinReise41 { MinReise41.shared }

    var body: some View {
        let show: Bool = m.showOnHome
        VStack(spacing: 10) {
            if show {
                Swipe37Card(hint: "Kommer tilbake neste gang du forlater skolen", done: "Min reise skjult",
                            onTap: { store.paperGo("avg") }, onDismiss: { m.hide(store) }) {
                    MinReise41HomeCard()
                }
                .transition(.asymmetric(insertion: .opacity, removal: .move(edge: .trailing).combined(with: .opacity)))
            }
            if m.toast { MinReise41Toast().transition(.opacity.combined(with: .move(edge: .bottom))) }
            // Prompt 50: med fliser på Hjem står avgangene i Avgang-flisen (Home50Tiles.swift).
            if !(show && m.homeCard == "instead") && !Home50Tiles.shared.on { RuterHomeCard27() }
        }
        .animation(.easeOut(duration: 0.25), value: show)
        .task {
            await m.load(store)
            if m.enabled { await m.loadJourney(store) }
        }
    }
}

struct MinReise41HomeCard: View {
    @Environment(\.paper) private var p
    @MainActor private var m: MinReise41 { MinReise41.shared }

    var body: some View {
        let o: MinReise41Option? = m.options.first(where: { ($0.dep ?? .distantFuture) > Date().addingTimeInterval(-60) }) ?? m.options.first
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                PLabel(text: "Min reise · forlot skolen " + (m.leftAt.map { Hjemlys40Look.clock($0) } ?? ""))
                Spacer(minLength: 4)
                Text("alle ruter ›").font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
            if let o {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(o.dep.map { Hjemlys40Look.clock($0) } ?? "–").font(PF.serif(32, medium: true)).foregroundStyle(p.ink)
                    Text("→ hjemme " + (o.arr.map { Hjemlys40Look.clock($0) } ?? "–")).font(PF.ui(14)).foregroundStyle(p.mut)
                }
                MinReise41Strip(legs: o.legs)
                // Prompt 45: de neste anbefalte reisene (til sammen N rader, kortet følger antallet).
                MinReise45More(first: o)
            } else {
                Text("Henter neste avgang …").font(PF.ui(14)).foregroundStyle(p.mut)
            }
            if let a = m.alert { MinReise41AlertBox(a: a, short: true) }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .contentShape(Rectangle())
    }
}

/// «Min reise skjult til neste gang du forlater skolen» + Angre (4,5 s).
struct MinReise41Toast: View {
    @Environment(Store.self) private var store
    @MainActor private var m: MinReise41 { MinReise41.shared }

    var body: some View {
        HStack(spacing: 10) {
            Text("Min reise skjult til neste gang du forlater skolen").font(PF.ui(13.5, .semibold)).foregroundStyle(Color(hex: "#f6f2ea"))
                .lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
            Button { m.undo(store) } label: {
                Text("Angre").font(PF.ui(13.5, .heavy)).foregroundStyle(Color(hex: "#ffb38a"))
                    .padding(.horizontal, 12).frame(minHeight: 36).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 16).padding(.trailing, 6).padding(.vertical, 6)
        .background(Color(hex: "#1b1a17").opacity(0.92), in: Capsule())
        .shadow(color: Color.black.opacity(0.3), radius: 12, y: 8)
    }
}

/* ---------- Prompt 45: antall anbefalte reiser (claude-code-ruter-anbefalt-antall.md) ---------- */

/// «Antall anbefalte reiser» 1 · 2 · 3 (standard 2). Samme verdi på Hjem-kortet og Ruter-siden.
struct MinReise45Count: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: MinReise41 { MinReise41.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            PLabel(text: "Antall anbefalte reiser")
            HStack(spacing: 0) {
                ForEach(1...3, id: \.self) { (n: Int) in seg(n) }
            }
            .padding(3)
            .background(p.line.opacity(0.5), in: Capsule())
            .frame(maxWidth: 220)
        }
        .padding(.bottom, 4)
    }

    private func seg(_ n: Int) -> some View {
        let on: Bool = m.recoCount == n
        return Button { m.setReco(n, store) } label: {
            Text("\(n)").font(PF.ui(13.5, .bold)).foregroundStyle(on ? p.bg : p.ink)
                .frame(maxWidth: .infinity).frame(height: 30)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(n) anbefalte")
        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
    }
}

/// Rad 2 og 3 i Hjem-kortet: avgang → hjemme, kompakt.
struct MinReise45More: View {
    @Environment(\.paper) private var p
    @MainActor private var m: MinReise41 { MinReise41.shared }
    let first: MinReise41Option

    var body: some View {
        let rest: [MinReise41Option] = Array(m.options.filter { $0.id != first.id }.prefix(Swift.max(0, m.recoCount - 1)))
        ForEach(rest, id: \.id) { (o: MinReise41Option) in
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(o.dep.map { Hjemlys40Look.clock($0) } ?? "–").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                Text("→ hjemme " + (o.arr.map { Hjemlys40Look.clock($0) } ?? "–")).font(PF.ui(13)).foregroundStyle(p.mut)
                Spacer(minLength: 0)
            }
            .padding(.top, 6)
            .overlay(alignment: .top) { Rectangle().fill(p.line).frame(height: 1) }
        }
    }
}
