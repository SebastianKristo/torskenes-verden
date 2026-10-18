import SwiftUI
import UIKit

/* ---------------- Prompt 22: Helse-fanen (kilder og ett kort per person) ---------------- */

/// Kildene øverst: Apple Health ♥ og Health Connect ✚, kant i `pos` når koblet til.
struct Fam22HealthSources: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: FamilyModel { FamilyModel.shared }
    @MainActor private var h: HealthSync { HealthSync.shared }

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        HStack(alignment: .top, spacing: 8) {
            card(t, "Apple Health", "♥", Color(hex: "#e0245e"), appleOn, "iPhone") { store.paperGo("innst-helse") }
            card(t, "Health Connect", "✚", Color(hex: "#3b6fd6"), hcOn, "Android") {
                store.flash(hcOn ? "Health Connect styres i Homelab-appen på Android" : "Åpne Homelab-appen på Android for å godkjenne Health Connect")
            }
        }
    }

    private var appleOn: Bool { h.master && h.share.values.contains(true) }

    private var hcOn: Bool {
        m.members.contains { mem in mem.health != nil && Fam22HealthSrc.isAndroid(mem) }
    }

    private func card(_ t: Fam22Tok, _ n: String, _ ic: String, _ c: Color, _ on: Bool, _ dev: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            VStack(alignment: .leading, spacing: 6) {
                Text(ic).font(.system(size: 18)).foregroundStyle(Color.white)
                    .frame(width: 36, height: 36)
                    .background(RoundedRectangle(cornerRadius: 11).fill(c))
                Text(n).font(PF.ui(14, .bold)).foregroundStyle(t.ink).lineLimit(1)
                Text(on ? "Koblet til via appen · " + dev : "Ikke koblet til · trykk for å koble").font(PF.ui(12)).foregroundStyle(on ? t.pos : t.mut)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 20).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(on ? t.pos : t.line, lineWidth: 1.5))
            .contentShape(RoundedRectangle(cornerRadius: 20))
        }
        .buttonStyle(.plain)
    }
}

enum Fam22HealthSrc {
    static func isAndroid(_ mem: FamMember) -> Bool {
        let d: String = (mem.last?.device ?? "").lowercased()
        if d.isEmpty { return false }
        return !(d.contains("iphone") || d.contains("ios") || d.contains("ipad"))
    }

    static func name(_ mem: FamMember) -> String { isAndroid(mem) ? "Health Connect" : "Apple Health" }
}

/// Ett helsekort: avatar 40, kilde og synk, delingschip; ring 64 med skritt, fire ruter og ukestolper.
struct Fam22HealthCard: View {
    @Environment(\.paper) private var p
    let mem: FamMember
    let isMe: Bool

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        let on: Bool = mem.health?.steps != nil || mem.health?.restingHr != nil || mem.health?.sleepMin != nil
        VStack(alignment: .leading, spacing: 12) {
            head(t, on)
            if on, let hh = mem.health {
                ring(t, hh)
                metrics(t, hh)
                if !hh.week.isEmpty { week(hh.week) }
            } else {
                Text("Deler ikke helsedata. \(isMe ? "Du" : FamPerson20Build.firstName(mem.name)) kan slå det på i sin app.")
                    .font(PF.ui(13)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
    }

    private var color: Color { Color(hex: Fam22Fmt.color(mem)) }

    private func head(_ t: Fam22Tok, _ on: Bool) -> some View {
        let synced: String = on ? "synket " + Fam22Fmt.ago(mem.health?.updated).lowercased() : "ikke synket"
        return HStack(spacing: 12) {
            Fam22Avatar(mem: mem, size: 40, font: 13)
            VStack(alignment: .leading, spacing: 0) {
                Text(isMe ? mem.name + " (deg)" : mem.name).font(PF.ui(15, .bold)).foregroundStyle(t.ink).lineLimit(1)
                Text(Fam22HealthSrc.name(mem) + " · " + synced).font(PF.ui(12)).foregroundStyle(t.mut).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(on ? "Deler" : "Deler ikke").font(PF.ui(11.5, .bold)).foregroundStyle(on ? t.pos : t.mut)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(RoundedRectangle(cornerRadius: 10).fill(t.bg))
                .fixedSize()
        }
    }

    private func ring(_ t: Fam22Tok, _ hh: FamHealth) -> some View {
        let steps: Double = hh.steps ?? 0
        let goal: Double = 10000
        let f: Double = Swift.min(1, steps / goal)
        return HStack(spacing: 14) {
            ZStack {
                Circle().stroke(t.line, lineWidth: 7)
                Circle().trim(from: 0, to: CGFloat(f))
                    .stroke(color, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: 52, height: 52)
            .frame(width: 64, height: 64)
            VStack(alignment: .leading, spacing: 2) {
                Text(n0(steps)).font(PF.serif(28, medium: true)).foregroundStyle(t.ink)
                Text("skritt · mål \(n0(goal))").font(PF.ui(12.5)).foregroundStyle(t.mut)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func metrics(_ t: Fam22Tok, _ hh: FamHealth) -> some View {
        let sleep: String = hh.sleepMin.map { "\(Int($0) / 60) t \(Int($0) % 60) m" } ?? "–"
        let cols: [GridItem] = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
        return LazyVGrid(columns: cols, spacing: 8) {
            tile(t, "Hvilepuls", hh.restingHr.map { "\(Int($0)) bpm" } ?? "–", "Snitt siste 7 dager")
            tile(t, "Puls nå", hh.hr.map { "\(Int($0)) bpm" } ?? "–", "Fra klokken")
            tile(t, "Søvn i natt", sleep, "Mål 8 t")
            tile(t, "Aktive kalorier", hh.activeKcal.map { n0($0) + " kcal" } ?? "–", "I dag")
        }
    }

    private func tile(_ t: Fam22Tok, _ l: String, _ v: String, _ s: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(l).font(PF.ui(11.5)).foregroundStyle(t.mut).lineLimit(1)
            Text(v).font(PF.mono(15)).foregroundStyle(t.ink).lineLimit(1)
            Text(s).font(PF.ui(11)).foregroundStyle(t.mut).lineLimit(1)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(t.bg))
    }

    private func week(_ w: [Double]) -> some View {
        let vals: [Double] = Array(w.suffix(7))
        let mx: Double = Swift.max(1, vals.max() ?? 1)
        return HStack(alignment: .bottom, spacing: 4) {
            ForEach(Array(vals.enumerated()), id: \.offset) { i, v in
                RoundedRectangle(cornerRadius: 4)
                    .fill(i == vals.count - 1 ? color : color.opacity(0x55 / 255.0))
                    .frame(maxWidth: .infinity)
                    .frame(height: Swift.max(44 * 0.08, 44 * v / mx))
            }
        }
        .frame(height: 44, alignment: .bottom)
    }
}

/// Hele Helse-fanen: kilder, ev. «Ingen data», ett kort per person og forklaringen nederst.
struct Fam22HealthTab: View {
    @Environment(\.paper) private var p
    @MainActor private var m: FamilyModel { FamilyModel.shared }

    var body: some View {
        let t: Fam22Tok = Fam22Tok.of(p)
        VStack(spacing: 14) {
            Fam22HealthSources()
            if HealthNoData20.shouldShow(m) { HealthNoData20() }
            if !m.loaded && m.members.isEmpty {
                Text("Henter …").font(PF.ui(13.5)).foregroundStyle(t.mut)
                    .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 22).fill(t.card))
            }
            ForEach(m.members) { mem in
                Fam22HealthCard(mem: mem, isMe: mem.id == m.meId)
            }
            Text("Apple Health og Health Connect kan bare leses av appen på telefonen. Homelab-appen sender et sammendrag hit hvert 15. minutt, og bare det personen har valgt å dele.")
                .font(PF.ui(12)).foregroundStyle(t.mut).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
