import SwiftUI
import UIKit

/* ---------------- Prompt 50: Helse (5) og Helse for personen (5b) i nytt design (FAMIOS50) ----------------
   Fasit: Familie App.dc.html (v.helse, v.helsep). API: GET /api/family/health50, POST /health50/:userId/request.
   Oppsummeringen («Ingrid har nådd målet. Du mangler 1 580 skritt.») lages av serveren fra tallene (ikke AI). */

struct Fam50HealthList: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Fam50Model { Fam50Model.shared }

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Helse").font(PF.serif(38, medium: true)).foregroundStyle(t.ink)
                    if !m.healthSummary.isEmpty {
                        Text(m.healthSummary).font(PF.serif(19, medium: true)).foregroundStyle(t.soft).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 20).padding(.top, 48).padding(.bottom, 12)
                VStack(spacing: 8) {
                    // Prompt 52: krasjgrense rundt helsekortene (Family52Guard.swift).
                    Fam52Guard(id: "helse", title: "helse") {
                        ForEach(m.health) { (h: Fam50Health) in Fam50HealthCard(h: h) }
                    }
                }
                .padding(.horizontal, 14)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await m.loadHealth(store) }
        .task { if m.health.isEmpty { await m.loadHealth(store) } }
    }
}

/// Kort per person: navn, skritt i dag, søyler for 7 dager og ›; søvn, hvilepuls og aktive kalorier under.
struct Fam50HealthCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let h: Fam50Health

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Fam50Avatar(mini: h.mini, size: 26)
                        Text(h.mini.first).font(PF.ui(14, .bold)).foregroundStyle(t.ink).lineLimit(1)
                    }
                    Text(h.shared && !h.stepsText.isEmpty ? h.stepsText : "—").font(PF.ui(19, .bold)).foregroundStyle(t.ink).lineLimit(1)
                }
                .frame(width: 104, alignment: .leading)
                Fam50Bars(values: bars, color: Color(hex: h.mini.hex), height: 46, gap: 5, radius: 4)
                Text("›").font(PF.ui(18)).foregroundStyle(t.faint)
            }
            if h.shared { mini(t) } else { off(t) }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(t.card))
        .opacity(h.shared ? 1 : 0.55)
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .onTapGesture { open() }
        .accessibilityAddTraits(.isButton)
    }

    private var bars: [Double?] {
        if !h.shared || h.week.isEmpty { return Array(repeating: nil, count: 7) }
        return h.week.map { $0.steps }
    }

    private func open() {
        if h.shared { Fam50Nav.shared.push(.helsep(h.id)) } else { Task { await Fam50Model.shared.requestHealth(store, h.id) } }
    }

    private func mini(_ t: Fam50Tok) -> some View {
        HStack(alignment: .top, spacing: 6) {
            cell("SØVN", h.sleepText.isEmpty ? "—" : h.sleepText, t)
            cell("HVILEPULS", h.restingHr.map { String(Int($0)) + " bpm" } ?? "—", t)
            cell("AKTIV", h.activeKcal.map { String(Int($0.rounded())) + " kcal" } ?? "—", t)
        }
        .padding(.top, 10)
        .overlay(alignment: .top) { Rectangle().fill(t.line).frame(height: 1) }
    }

    private func cell(_ k: String, _ v: String, _ t: Fam50Tok) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Fam50Label(text: k, color: t.faint, size: 9.5)
            Text(v).font(PF.ui(13.5, .bold)).foregroundStyle(t.ink).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func off(_ t: Fam50Tok) -> some View {
        Text("Deler ikke helse med deg · Be om deling ›").font(PF.ui(12.5)).foregroundStyle(t.mut)
    }
}

/* ---------- 5b · Helse for personen ---------- */

struct Fam50HealthPerson: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let userId: String
    @MainActor private var m: Fam50Model { Fam50Model.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                topRow.padding(.horizontal, 16).padding(.top, 10)
                if let h = m.healthOf(userId) {
                    Fam50HealthDetail(h: h)
                } else {
                    Fam50Note(text: "Henter helse …").padding(14)
                }
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await m.loadHealth(store) }
    }

    private var topRow: some View {
        HStack {
            Fam50TopPill(title: "‹ Helse") { Fam50Nav.shared.back() }
            Spacer()
            if m.person(userId)?.coord != nil {
                Fam50TopPill(title: "Posisjon ›") { Fam50Nav.shared.push(.person(userId)) }
            }
        }
        .frame(height: 40)
    }
}

struct Fam50HealthDetail: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let h: Fam50Health

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                Fam50Avatar(mini: h.mini, size: 52)
                VStack(alignment: .leading, spacing: 2) {
                    Text(h.mini.name).font(PF.serif(30, medium: true)).foregroundStyle(t.ink).lineLimit(1).minimumScaleFactor(0.7)
                    Text(h.sourceText).font(PF.ui(13)).foregroundStyle(t.mut).lineLimit(1)
                }
            }
            .padding(.horizontal, 20).padding(.top, 12).padding(.bottom, 14)
            if h.shared {
                stepsCard(t).padding(.horizontal, 14)
                stats.padding(.horizontal, 14).padding(.top, 8)
                shareLine(t).padding(.horizontal, 14).padding(.top, 8)
            } else {
                notShared(t).padding(.horizontal, 14)
            }
        }
    }

    private func stepsCard(_ t: Fam50Tok) -> some View {
        let reached: Bool = h.goalReached
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 0) {
                    Fam50Label(text: "SKRITT I DAG", color: t.mut)
                    Text(h.stepsText.isEmpty ? "—" : h.stepsText).font(PF.ui(34, .heavy)).foregroundStyle(t.ink).lineLimit(1)
                }
                Spacer()
                if !h.badge.isEmpty {
                    Text(h.badge).font(PF.ui(12.5, .bold)).foregroundStyle(reached ? t.ok : t.soft).padding(.horizontal, 10).frame(height: 28)
                        .background(Capsule().fill(reached ? t.okBg : t.chip))
                }
            }
            Fam50Bars(values: h.week.map { $0.steps }, color: Color(hex: h.mini.hex), height: 96, gap: 8, radius: 6,
                      goal: h.goal, goalLabel: "MÅL " + (h.goalText.isEmpty ? String(Int(h.goal)) : h.goalText), faint: t.faint)
            HStack(spacing: 8) {
                ForEach(h.week) { (d: Fam50Day) in
                    Text(Fam50HealthDetail.dayName(d.day)).font(PF.ui(11, .semibold)).foregroundStyle(d.today ? t.ink : t.faint)
                        .frame(maxWidth: .infinity)
                }
            }
            if !h.weekText.isEmpty {
                Text(h.weekText).font(PF.ui(12.5)).foregroundStyle(t.soft).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(t.card))
    }

    nonisolated static func dayName(_ d: String) -> String {
        guard let f = d.first else { return d }
        return String(f).uppercased() + String(d.dropFirst())
    }

    private var stats: some View {
        let cols: [GridItem] = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
        return LazyVGrid(columns: cols, spacing: 8) {
            Fam50Stat(k: "SØVN I NATT", v: h.sleepText.isEmpty ? "—" : h.sleepText, s: h.sleepRange)
            Fam50Stat(k: "HVILEPULS", v: h.restingHr.map { String(Int($0)) + " bpm" } ?? "—", s: h.hr.map { "Puls nå " + String(Int($0)) } ?? "")
            Fam50Stat(k: "AKTIVE KALORIER", v: h.activeKcal.map { String(Int($0.rounded())) + " kcal" } ?? "—", s: "I dag")
            Fam50Stat(k: "BATTERI", v: h.battery.map { String(Int($0.rounded())) + " %" } ?? "—", s: h.battery == nil ? "" : (h.charging ? "Lader" : "Lader ikke"))
        }
    }

    private func shareLine(_ t: Fam50Tok) -> some View {
        Button { store.paperGo("innst-helse") } label: {
            HStack(spacing: 10) {
                Text(h.shareText.isEmpty ? h.mini.first + " deler helse med deg." : h.shareText + ".").font(PF.ui(13)).foregroundStyle(t.soft)
                    .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
                Text("Deling ›").font(PF.ui(13, .bold)).foregroundStyle(t.ink)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(t.dash.opacity(0.8), lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func notShared(_ t: Fam50Tok) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(h.text.isEmpty ? h.mini.first + " deler ikke helse med deg" : h.text).font(PF.ui(14)).foregroundStyle(t.soft)
            Button { Task { await Fam50Model.shared.requestHealth(store, h.id) } } label: {
                Text("Be om deling ›").font(PF.ui(13.5, .bold)).foregroundStyle(t.lab).frame(minHeight: 36)
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(t.card))
    }
}
