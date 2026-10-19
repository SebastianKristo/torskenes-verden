import SwiftUI
import UIKit

/* ---------------- Prompt 24: Ruter-visningen, lik på iOS og Android ---------------- */
// Fasit: overlegget «av» i design/Mobil Papir App.dc.html og prompts/claude-code-ruter-lik.md.
// Fullskjerm uten fanelinje og skann-knapp (PaperShell skjuler dem for «avg»). Ingen Ruter-logo.
// Toppbilde 52/16/40 med «‹ Hjem» og «↻ tid», innholdet −34 opp i bildet, stopp-piller, filter, avvik,
// én liste i ett kort med minutter i 24 pt, og fotnote.

struct RuterView24: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: RuterModel { RuterModel.shared }
    @State private var openDep: String? = nil
    @State private var mode: String = "Alle"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                RuterHero24(sub: heroSub)
                VStack(alignment: .leading, spacing: 14) { content }
                    .padding(.horizontal, 16)
                    .padding(.top, -34)
                    .padding(.bottom, 40)
            }
        }
        .scrollIndicators(.hidden)
        .background { p.bg.ignoresSafeArea() }
        .ignoresSafeArea(edges: .top)
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .task { if m.stops.isEmpty || m.departures.isEmpty { await m.load(store) } }
        .task {
            // Sanntid: oppdater hvert 30. sekund mens visningen er åpen.
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                if Task.isCancelled { break }
                await m.refresh(store)
            }
        }
        .onChange(of: m.selected) { _, _ in
            mode = "Alle"
            openDep = nil
        }
    }

    /* ---------- Data ---------- */

    private var all: [RuterDeparture] {
        guard let s = m.current else { return [] }
        let list: [RuterDeparture] = m.departures[s.id] ?? []
        return Array(list.sorted { ($0.minutes ?? 9999) < ($1.minutes ?? 9999) }.prefix(20))
    }

    private var modes: [String] {
        var out: [String] = ["Alle"]
        for d in all {
            let n: String = RuterView24.modeName(d)
            if !out.contains(n) { out.append(n) }
        }
        return out
    }

    private var visible: [RuterDeparture] {
        if mode == "Alle" { return all }
        return all.filter { RuterView24.modeName($0) == mode }
    }

    /// «Trikk og buss», «T-bane» … (typene som går fra stoppet), ellers «Sanntid fra Entur».
    private var heroSub: String {
        let types: [String] = modes.filter { $0 != "Alle" }
        if types.isEmpty { return m.current?.locality.isEmpty == false ? (m.current?.locality ?? "") : "Sanntid fra Entur" }
        var words: [String] = types.enumerated().map { pair in pair.offset == 0 ? pair.element : pair.element.lowercased() }
        if words.count == 1 { return words[0] }
        let last: String = words.removeLast()
        return words.joined(separator: ", ") + " og " + last
    }

    private var alert: String {
        for d in all where !d.situation.isEmpty { return d.situation }
        return ""
    }

    static func modeName(_ d: RuterDeparture) -> String {
        let n: String = RuterCall21.modeName(d.mode)
        return n.isEmpty ? "Buss" : n
    }

    /* ---------- Innhold ---------- */

    @ViewBuilder private var content: some View {
        if m.editing {
            RuterMyStops24()
        } else {
            RuterStopPills24()
        }
        if m.loading && all.isEmpty {
            Text("Henter sanntid fra Entur …").font(PF.ui(13)).foregroundStyle(p.mut).padding(.horizontal, 4)
        }
        if let e = m.error {
            Text(e.contains("finnes ikke") ? e : "Fikk ikke kontakt med Entur. Trykk ↻ for å prøve igjen.")
                .font(PF.ui(13)).foregroundStyle(p.lab).padding(.horizontal, 4).fixedSize(horizontal: false, vertical: true)
        }
        if m.current == nil {
            emptyCard
        } else {
            if !all.isEmpty { segment }
            if !alert.isEmpty { alertCard }
            if !visible.isEmpty { list }
            if visible.isEmpty && !m.loading && m.error == nil {
                Text(mode == "Alle" ? "Ingen avganger den neste timen." : "Ingen avganger av denne typen den neste timen.")
                    .font(PF.ui(13)).foregroundStyle(p.mut).padding(.horizontal, 4)
            }
        }
        Text("Sanntid fra Entur/Ruter når tilkoblet. Trykk på en avgang for å se stoppene.")
            .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
    }

    private var emptyCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Ingen stopp ennå").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
            Text("Trykk «+ Stopp» og søk etter en holdeplass i Entur.").font(PF.ui(13)).foregroundStyle(p.mut)
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    /// Alle · Trikk · Buss · T-bane · Tog (bare typene som finnes).
    private var segment: some View {
        HStack(spacing: 4) {
            ForEach(modes, id: \.self) { n in
                let on: Bool = n == mode
                Button {
                    Haptics.shared.select()
                    mode = n
                    openDep = nil
                } label: {
                    Text(n).font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity).frame(height: 34)
                        .background(on ? p.ink : Color.clear, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(p.card, in: Capsule())
    }

    private var alertCard: some View {
        HStack(alignment: .top, spacing: 10) {
            Text("!").font(PF.ui(14, .heavy)).foregroundStyle(p.lab)
            Text(alert).font(PF.ui(13)).foregroundStyle(p.ink).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(p.line, lineWidth: 1))
    }

    /// Én liste i ett kort, skillelinjer bare mellom radene.
    private var list: some View {
        let stopName: String = m.current?.name ?? ""
        return VStack(spacing: 0) {
            ForEach(Array(visible.enumerated()), id: \.element.id) { i, d in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                Button { toggle(d) } label: { RuterRow24(d: d) }
                    .buttonStyle(.plain)
                if openDep == d.openKey {
                    RuterStopList21(dep: d, color: RuterView24.lineColor(d), stopName: stopName)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func toggle(_ d: RuterDeparture) {
        Haptics.shared.select()
        let k: String = d.openKey
        withAnimation(.easeOut(duration: 0.2)) { openDep = openDep == k ? nil : k }
    }

    /* ---------- Linjefarger ---------- */

    /// Entur line.presentation.colour, ellers buss #e60000, trikk #0b91ef, T-bane #ec700c, tog #e1eb00.
    static func lineHex(_ d: RuterDeparture) -> String {
        if let c = d.color, !c.isEmpty { return c.hasPrefix("#") ? c : "#" + c }
        switch RuterView24.modeName(d) {
        case "Trikk": return "#0b91ef"
        case "T-bane": return "#ec700c"
        case "Tog": return "#e1eb00"
        case "Båt": return "#682c88"
        default: return "#e60000"
        }
    }

    static func lineColor(_ d: RuterDeparture) -> Color { Color(hex: lineHex(d)) }

    /// #1b1a17 på lyse linjefarger, hvit på mørke.
    static func lineInk(_ d: RuterDeparture) -> Color {
        let h: String = lineHex(d).trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let v: UInt64 = UInt64(h, radix: 16) ?? 0xE60000
        let r: Double = Double((v >> 16) & 0xFF) / 255
        let g: Double = Double((v >> 8) & 0xFF) / 255
        let b: Double = Double(v & 0xFF) / 255
        let lum: Double = 0.2126 * r + 0.7152 * g + 0.0722 * b
        return lum > 0.55 ? Color(hex: "#1b1a17") : Color.white
    }
}

/* ---------- Toppbildet ---------- */

struct RuterHero24: View {
    @Environment(Store.self) private var store
    @MainActor private var m: RuterModel { RuterModel.shared }
    let sub: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                pill("‹ \(store.paperUpLabel)", leading: 10) { store.paperUp() }
                Spacer()
                pill("↻ " + clock, leading: 12) { Task { await m.refresh(store) } }
                    .accessibilityLabel("Oppdater")
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Sanntid · Ruter").font(PF.italic(17)).opacity(0.92)
                Text(m.current?.name ?? "Avganger").font(PF.serif(40, medium: true)).lineLimit(2).minimumScaleFactor(0.6)
                    .shadow(color: .black.opacity(0.35), radius: 7, y: 2)
                Text(sub).font(PF.ui(13)).opacity(0.9).lineLimit(1)
            }
            .padding(.top, 26)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16)
        .padding(.top, Swift.max(52, topInset + 8))
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack {
                RuterHeroArt()
                LinearGradient(stops: [.init(color: .black.opacity(0.3), location: 0), .init(color: .black.opacity(0.05), location: 0.4), .init(color: .black.opacity(0.45), location: 1)],
                               startPoint: .top, endPoint: .bottom)
            }
            .clipped()
        }
    }

    private var clock: String { JS.fmt(m.updated ?? Date(), "HH:mm") }

    private var topInset: CGFloat {
        let scene: UIWindowScene? = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let inset: CGFloat = scene?.windows.first(where: { $0.isKeyWindow })?.safeAreaInsets.top ?? scene?.windows.first?.safeAreaInsets.top ?? 0
        return inset > 0 ? inset : 47
    }

    private func pill(_ t: String, leading: CGFloat, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(13, .semibold)).foregroundStyle(.white).lineLimit(1)
                .padding(.leading, leading).padding(.trailing, 14).frame(height: 36)
                .background(Color(hex: "#1b1a17").opacity(0.55), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Rad ---------- */

struct RuterRow24: View {
    @Environment(\.paper) private var p
    let d: RuterDeparture

    var body: some View {
        HStack(spacing: 12) {
            Text(d.line).font(PF.ui(13, .heavy)).foregroundStyle(RuterView24.lineInk(d)).lineLimit(1).fixedSize()
                .padding(.horizontal, 6)
                .frame(minWidth: 34).frame(height: 28)
                .background(RuterView24.lineColor(d), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(d.to).font(PF.ui(15, .semibold)).foregroundStyle(d.cancelled ? p.mut : p.ink).strikethrough(d.cancelled).lineLimit(1)
                Text(status).font(PF.ui(12)).foregroundStyle(d.cancelled || d.delay > 0 ? p.lab : p.mut).lineLimit(1)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 2) {
                Text(minText).font(PF.serif(24, medium: true)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
                Text(d.expected.map { JS.fmt($0, "HH:mm") } ?? "").font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1).fixedSize()
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private var minText: String {
        guard let n = d.minutes else { return "–" }
        return n <= 0 ? "Nå" : "\(n) min"
    }

    /// «Trikk · plattform B · i rute» / «Buss · 3 min forsinket».
    private var status: String {
        var parts: [String] = [RuterView24.modeName(d)]
        if !d.platform.isEmpty { parts.append("plattform \(d.platform)") }
        if d.cancelled {
            parts.append("innstilt")
        } else if d.delay > 0 {
            parts.append("\(d.delay) min forsinket")
        } else {
            parts.append(d.status.isEmpty ? "i rute" : d.status)
        }
        return parts.joined(separator: " · ")
    }
}

/* ---------- Stopp-pillene ---------- */

/// Én vannrett rad (ikke i et kort): valgt stopp mørk, de andre kortfarget med kant, til slutt «+ Stopp».
/// Hold inne (550 ms) åpner «Mine stopp».
struct RuterStopPills24: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: RuterModel { RuterModel.shared }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(m.stops) { s in
                    let on: Bool = m.current?.id == s.id
                    Button { m.select(s, store) } label: {
                        Text(s.name).font(PF.ui(13, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1).fixedSize()
                            .padding(.horizontal, 14).frame(height: 36)
                            .background(on ? p.ink : p.card, in: Capsule())
                            .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
                Button { Haptics.shared.tap(); openEdit() } label: {
                    Text("+ Stopp").font(PF.ui(13, .bold)).foregroundStyle(p.ink).fixedSize()
                        .padding(.horizontal, 14).frame(height: 36)
                        .background(p.card, in: Capsule())
                        .overlay(Capsule().stroke(p.mut, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Legg til stopp")
            }
            .padding(.horizontal, 16).padding(.vertical, 2)
        }
        .padding(.horizontal, -16)
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.55).onEnded { _ in
            Haptics.shared.tick()
            openEdit()
        })
    }

    private func openEdit() {
        withAnimation(.easeOut(duration: 0.2)) { m.editing = true }
    }
}

/// «Mine stopp»: ↑ ↓ og − per stopp, søk etter holdeplass (Entur), treff med «+ Legg til», og «Ferdig».
struct RuterMyStops24: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: RuterModel { RuterModel.shared }
    @State private var q: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Mine stopp").font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                Spacer()
                Button {
                    Haptics.shared.select()
                    q = ""
                    m.results = []
                    withAnimation(.easeOut(duration: 0.2)) { m.editing = false }
                } label: {
                    Text("Ferdig").font(PF.ui(13, .bold)).foregroundStyle(p.bg).padding(.horizontal, 16).frame(height: 34).background(p.ink, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            ForEach(Array(m.stops.enumerated()), id: \.element.id) { i, s in
                stopRow(s, i)
            }
            searchField
            if m.searching { Text("Søker i Entur …").font(PF.ui(12.5)).foregroundStyle(p.mut) }
            if !m.searching && q.trimmingCharacters(in: .whitespaces).count >= 2 && m.results.isEmpty {
                Text("Fant ingen holdeplasser.").font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
            if !m.results.isEmpty { results }
            Text("Hold inne på stoppene for å komme hit.").font(PF.ui(11.5)).foregroundStyle(p.mut)
        }
        .padding(14)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .task(id: q) {
            try? await Task.sleep(for: .milliseconds(300))
            if !Task.isCancelled { await m.search(q, store) }
        }
    }

    private func stopRow(_ s: RuterStop, _ i: Int) -> some View {
        VStack(spacing: 0) {
            Rectangle().fill(p.line).frame(height: 1)
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(s.name).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                    Text(s.locality.isEmpty ? "Sanntid fra Entur" : s.locality).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                circleButton("↑", enabled: i > 0, color: p.ink, border: true) { m.move(s, -1, store) }
                circleButton("↓", enabled: i < m.stops.count - 1, color: p.ink, border: true) { m.move(s, 1, store) }
                circleButton("−", enabled: m.stops.count > 1, color: p.lab, border: false) { m.remove(s, store) }
            }
            .padding(.vertical, 8)
        }
    }

    private func circleButton(_ t: String, enabled: Bool, color: Color, border: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(t == "−" ? 20 : 15, .semibold)).foregroundStyle(color)
                .frame(width: 36, height: 36)
                .overlay(Circle().stroke(border ? p.line : Color.clear, lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .opacity(enabled ? 1 : 0.3)
        .disabled(!enabled)
    }

    private var searchField: some View {
        // Prompt 27: ✕ til venstre (SearchField27). Tømming avbryter søket og lukker treffene.
        SearchField27(text: $q, placeholder: "Søk etter holdeplass", onClear: { m.results = [] }, lead: {
            Text("⌕").font(PF.ui(15)).foregroundStyle(p.mut)
        })
        .padding(.horizontal, 14).frame(height: 44)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.line, lineWidth: 1))
    }

    private var results: some View {
        VStack(spacing: 0) {
            ForEach(Array(m.results.enumerated()), id: \.element.id) { i, s in
                let have: Bool = m.stops.contains { $0.id == s.id }
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                Button {
                    guard !have else { return }
                    m.add(s, store)
                    q = ""
                    m.results = []
                } label: {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(s.name).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                            if !s.locality.isEmpty { Text(s.locality).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1) }
                        }
                        Spacer(minLength: 4)
                        Text(have ? "Lagt til" : "+ Legg til").font(PF.ui(12.5, .bold)).foregroundStyle(have ? p.mut : p.lab)
                    }
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}
