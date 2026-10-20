import SwiftUI
import UIKit

/* ---------------- Prompt 42: Familie – Vel fremme, Soner uten kart, helsekilder i Innstillinger ---------------- */
// claude-code-vel-fremme.md, claude-code-familie-fjern-hjemlys-kort.md, claude-code-familie-soner-uten-kart.md,
// claude-code-familie-helsekilder-innstillinger.md. Fasit: Familie.dc.html (isHjl, hl.others, hl.sugOn, showMap, snAdd).
// Hjemlys heter nå Vel fremme i brukertekstene. Interne nøkler og API-stier (/api/hjemlys/*) er uendret.

/// Kart: liten statuslinje når en Vel fremme-økt pågår («Vel fremme på · Rune er på vei · 12 min»). Trykk åpner fanen.
/// Ingen start-knapp på Kart (startes fra fanen Vel fremme).
struct VelFremmeStatus42: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }

    var body: some View {
        if let t = text {
            Button {
                Haptics.shared.select()
                withAnimation(.easeOut(duration: 0.2)) { FamilyModel.shared.tab = "hjemlys" }
            } label: {
                HStack(spacing: 8) {
                    Hjemlys40Dot(size: 10, state: state)
                    Text(t).font(PF.ui(13, .semibold)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.8)
                    Spacer(minLength: 4)
                    Text("›").font(PF.ui(14, .bold)).foregroundStyle(p.mut)
                }
                .padding(.horizontal, 14).frame(height: 40)
                .background(p.card, in: Capsule())
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Åpner Vel fremme")
        }
    }

    private var first: Hjemlys40Member? {
        m.household.first(where: { $0.state == "late" }) ?? m.household.first(where: { $0.state == "onTheWay" })
    }

    private var state: String {
        if let s = m.mine, s.active { return s.state }
        return first?.state ?? "onTheWay"
    }

    private var text: String? {
        if let s = m.mine, s.active { return "Vel fremme på · du er på vei" }
        guard let h = first else { return nil }
        let name: String = String(h.name.split(separator: " ").first ?? Substring(h.name))
        if h.state == "late" { return "Vel fremme på · \(name) er \(h.lateMinutes) min forsinket" }
        if let e = h.eta {
            let left: Int = Int((e.timeIntervalSinceNow / 60).rounded(.up))
            return "Vel fremme på · \(name) er på vei · " + Hjemlys40Look.mins(left)
        }
        return "Vel fremme på · \(name) er på vei"
    }
}

/// Fanen Vel fremme: «AKTIVE I FAMILIEN» (forsinket først, så på vei, så sjekket inn) og Glimt-forslaget.
struct VelFremmeCards42: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }
    @State private var open: Hjemlys40Member? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            let act: [Hjemlys40Member] = active
            if !act.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    PLabel(text: "Aktive i familien").padding(.leading, 4)
                    VStack(spacing: 0) {
                        ForEach(Array(act.enumerated()), id: \.element.id) { i, h in
                            if i > 0 { Rectangle().fill(p.line).frame(height: 1).padding(.leading, 62) }
                            row(h)
                        }
                    }
                    .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
            }
            if m.suggest && (m.mine == nil || m.mine?.active == false) {
                VStack(alignment: .leading, spacing: 8) {
                    if let r = route { Text(r).font(PF.ui(12.5)).foregroundStyle(p.mut).padding(.horizontal, 4) }
                    Hjemlys40Suggest()
                }
                .padding(4)
                .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
        .sheet(item: $open) { (h: Hjemlys40Member) in
            VelFremmePerson42(h: h) { open = nil }
                .environment(\.paper, p)
                .presentationDetents([.medium])
                .sheetEdge30(p.bg)
        }
    }

    /// Forsinket først, så på vei, så sjekket inn / hjemme.
    private var active: [Hjemlys40Member] {
        let rank: [String: Int] = ["late": 0, "onTheWay": 1, "home": 2]
        return m.household.filter { rank[$0.state] != nil }.sorted { (rank[$0.state] ?? 9) < (rank[$1.state] ?? 9) }
    }

    private var route: String? {
        guard let e = m.suggestEta else { return nil }
        return "Hjemme ca. " + Hjemlys40Look.clock(e)
    }

    private func row(_ h: Hjemlys40Member) -> some View {
        Button {
            Haptics.shared.select()
            if h.state == "late" { m.alertMember = h } else { open = h }
        } label: {
            HStack(spacing: 12) {
                Text(String(h.name.prefix(1)).uppercased()).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    .frame(width: 38, height: 38)
                    .background(p.bg, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(title(h)).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.85)
                    Text(sub(h)).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                Circle().fill(dot(h)).frame(width: 10, height: 10)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private func first(_ h: Hjemlys40Member) -> String { String(h.name.split(separator: " ").first ?? Substring(h.name)) }

    private func title(_ h: Hjemlys40Member) -> String {
        switch h.state {
        case "late": return "\(first(h)) er \(h.lateMinutes > 0 ? "\(h.lateMinutes) min" : "litt") forsinket"
        case "home": return "\(first(h)) er vel fremme"
        default: return "\(first(h)) er på vei hjem"
        }
    }

    private func sub(_ h: Hjemlys40Member) -> String {
        switch h.state {
        case "late": return "Trykk for siste posisjon og ring"
        case "home": return "Fremme " + (h.since.map { Hjemlys40Look.clock($0) } ?? "")
        default: return "Hjemme ca. " + (h.eta.map { Hjemlys40Look.clock($0) } ?? "–") + " · i rute"
        }
    }

    /// Grønn = i rute, rød = forsinket, gul = sjekket inn.
    private func dot(_ h: Hjemlys40Member) -> Color {
        switch h.state {
        case "late": return Hjemlys40Look.red
        case "home": return Hjemlys40Look.gold
        default: return Hjemlys40Look.green
        }
    }
}

/// Økta til én person: status, Ring, Send melding og «Vis på kart».
struct VelFremmePerson42: View {
    @Environment(\.paper) private var p
    @Environment(\.openURL) private var openURL
    let h: Hjemlys40Member
    let close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    PLabel(text: "Vel fremme")
                    Text(h.name).font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                }
                Spacer(minLength: 8)
                SheetButton30(kind: .primary, title: "Ferdig", action: close)
            }
            Text(String(h.line.prefix(1)).uppercased() + String(h.line.dropFirst())).font(PF.ui(14)).foregroundStyle(p.ink)
            HStack(spacing: 8) {
                if !digits.isEmpty {
                    Hjemlys40Pill(title: "Ring", dark: true) { if let u = URL(string: "tel:" + digits) { openURL(u) } }
                    Hjemlys40Pill(title: "Send melding", dark: false) { if let u = URL(string: "sms:" + digits) { openURL(u) } }
                }
                Hjemlys40Pill(title: "Vis på kart", dark: digits.isEmpty) {
                    close()
                    FamilyModel.shared.tab = "kart"
                    if FamilyModel.shared.member(h.id) != nil { FamilyModel.shared.selected = h.id }
                }
            }
            Text("Posisjonen deles bare når personen er sen. Den slettes etter 24 timer.")
                .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18).padding(.top, 22).padding(.bottom, 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(p.bg.ignoresSafeArea())
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private var digits: String { h.phone.filter { $0.isNumber || $0 == "+" } }
}

/// Soner: «+ Ny sone på kartet» øverst. Kartet vises bare mens en sone plasseres eller redigeres.
struct ZonesAddRow42: View {
    @Environment(\.paper) private var p
    let placing: Bool
    let start: () -> Void
    let cancel: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            if placing {
                Text("Trykk på kartet der sonen skal være").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink)
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 6)
                Button(action: cancel) {
                    Text("Avbryt").font(PF.ui(13, .bold)).foregroundStyle(p.ink).padding(.horizontal, 14).frame(height: 36)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            } else {
                Button(action: start) {
                    Text("+ Ny sone på kartet").font(PF.ui(14, .bold)).foregroundStyle(p.bg)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .background(p.ink, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}
