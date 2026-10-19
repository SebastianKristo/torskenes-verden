import SwiftUI
import UIKit

/* ---------------- Prompt 27: Kalender v2 – Måned (6 uker) og Liste (45 dager) ---------------- */
// Fasit: design/Kalender.dc.html. Måned: hendelsene som brikker (maks 3), timene samlet som «4 t», «+2» når det er flere.
// Trykk på en dag åpner dagsvisningen. Liste: 45 dager fra valgt dag, gruppert per dag (tomme dager hoppes over, unntatt i dag).

struct Cal27Month: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let now: Date

    var body: some View {
        let c: Date = m.curD
        let comps: DateComponents = Cal26.cal.dateComponents([.year, .month], from: c)
        let first0: Date = Cal26.cal.date(from: comps) ?? c
        let first: Date = Cal26.day(Cal26.key(first0))
        let st: Date = Cal26.add(first, -((Cal26.jsDay(first) + 6) % 7))
        let month: Int = Cal26.cal.component(.month, from: first)
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                // Prompt 29: ukenummer (U) i egen kolonne; trykk åpner uken (Calendar29Now.swift).
                Cal29WeekHead(width: 24, size: 10).padding(.top, 4).padding(.bottom, 6)
                ForEach(Cal26.weekShort, id: \.self) { h in
                    Text(String(h.prefix(1))).font(PF.mono(10)).tracking(0.8).foregroundStyle(p.mut)
                        .frame(maxWidth: .infinity).padding(.top, 4).padding(.bottom, 6)
                }
            }
            .padding(.horizontal, 6)
            Rectangle().fill(p.line).frame(height: 1)
            VStack(spacing: 0) {
                ForEach(0..<6, id: \.self) { r in
                    HStack(spacing: 0) {
                        Cal29WeekNo(monday: Cal26.add(st, r * 7), width: 24, size: 10)
                            .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
                        ForEach(0..<7, id: \.self) { col in
                            Cal27MonthCell(d: Cal26.add(st, r * 7 + col), month: month, now: now)
                        }
                    }
                    .frame(maxHeight: .infinity)
                }
            }
            .padding(.horizontal, 6)
            .padding(.bottom, 90)
        }
    }
}

struct Cal27MonthCell: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let d: Date
    let month: Int
    let now: Date

    var body: some View {
        let k: String = Cal26.key(d)
        let isT: Bool = k == Cal26.key(now)
        let inM: Bool = Cal26.cal.component(.month, from: d) == month
        let list: [CalEvent26] = m.on(k)
        let lessons: Int = list.filter { $0.type == "time" }.count
        let others: [CalEvent26] = list.filter { $0.type != "time" }
        let maxN: Int = lessons > 0 ? 2 : 3
        let shown: [CalEvent26] = Array(others.prefix(maxN))
        Button { m.goDay(k) } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(Cal26.cal.component(.day, from: d))").font(PF.ui(12.5, .bold))
                    .foregroundStyle(isT ? Color.white : p.ink)
                    .frame(width: 24, height: 24)
                    .background(isT ? p.lab : Color.clear, in: Circle())
                    .frame(maxWidth: .infinity)
                ForEach(shown) { e in chip(e) }
                if lessons > 0 {
                    Text("\(lessons) t").font(PF.ui(10, .bold)).foregroundStyle(p.ink).lineLimit(1)
                        .padding(.horizontal, 4).frame(maxWidth: .infinity, alignment: .leading).frame(height: 16)
                        .background(p.line.opacity(0.7), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
                }
                if others.count > shown.count {
                    Text("+\(others.count - shown.count)").font(PF.ui(10, .bold)).foregroundStyle(p.mut).padding(.leading, 4)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 2).padding(.vertical, 4)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(isT ? p.lab.opacity(0.06) : Color.clear)
            .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
            .opacity(inM ? 1 : 0.4)
            .clipped()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func chip(_ e: CalEvent26) -> some View {
        let c: Color = Color(hex: m.hex(e))
        let solid: Bool = e.type == "prove" || e.type == "innl" || e.startMin < 0 || e.allDay
        return Text(e.short).font(PF.ui(10, .bold)).foregroundStyle(solid ? Color.white : c).lineLimit(1)
            .padding(.horizontal, 4).frame(maxWidth: .infinity, alignment: .leading).frame(height: 16)
            .background(solid ? c : Color.clear, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
    }
}

/* ---------- Liste ---------- */

struct Cal27DayGroup: Identifiable {
    let id: String
    let date: Date
    let today: Bool
    let items: [CalEvent26]
}

struct Cal27List: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let now: Date

    private var groups: [Cal27DayGroup] {
        let tk: String = Cal26.key(now)
        let c: Date = m.curD
        var out: [Cal27DayGroup] = []
        for i in 0..<45 {
            let d: Date = Cal26.add(c, i)
            let k: String = Cal26.key(d)
            let l: [CalEvent26] = m.on(k)
            if l.isEmpty && k != tk { continue }
            out.append(Cal27DayGroup(id: k, date: d, today: k == tk, items: l))
        }
        return out
    }

    var body: some View {
        let g: [Cal27DayGroup] = groups
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    Color.clear.frame(height: 0).id("c27top")
                    if g.isEmpty {
                        Text(Cal26Model.shared.loaded ? "Ingenting de neste 45 dagene." : "Henter …").font(PF.ui(14)).foregroundStyle(p.mut)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 20)
                    }
                    ForEach(g) { grp in Cal27ListDay(grp: grp) }
                }
                .padding(.horizontal, 14).padding(.bottom, 96)
            }
            .onChange(of: Cal26.key(m.curD)) { _, _ in proxy.scrollTo("c27top", anchor: .top) }
        }
    }
}

struct Cal27ListDay: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let grp: Cal27DayGroup

    var body: some View {
        let d: Date = grp.date
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 2) {
                Text(Cal26.weekShort[(Cal26.jsDay(d) + 6) % 7]).font(PF.mono(10.5)).foregroundStyle(grp.today ? p.lab : p.mut)
                Text("\(Cal26.cal.component(.day, from: d))").font(PF.ui(16, .bold))
                    .foregroundStyle(grp.today ? Color.white : p.ink)
                    .frame(width: 34, height: 34)
                    .background(grp.today ? p.lab : Color.clear, in: Circle())
                Text(Cal26.monthsShort[Cal26.cal.component(.month, from: d) - 1].uppercased()).font(PF.mono(10, bold: false)).foregroundStyle(p.mut)
            }
            .frame(width: 46)
            // Prompt 30: trykk på datoen åpner dagen i Dag-visning.
            .contentShape(Rectangle())
            .onTapGesture { m.goDay(Cal26.key(d)) }
            .accessibilityAddTraits(.isButton)
            VStack(spacing: 6) {
                if grp.items.isEmpty {
                    Text("Ingen hendelser").font(PF.ui(14)).foregroundStyle(p.mut)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 12).padding(.horizontal, 2)
                }
                ForEach(grp.items) { e in Cal27ListItem(e: e) }
            }
            .padding(.top, 2)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
    }
}

struct Cal27ListItem: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let e: CalEvent26

    var body: some View {
        let c: Color = Color(hex: m.hex(e))
        let solid: Bool = e.isTest
        let fg: Color = solid ? Color.white : p.ink
        let sub: String = e.timeText + (e.room.isEmpty ? "" : " · " + e.room) + (e.type == "time" && !e.teacher.isEmpty ? " · " + e.teacher : "")
        Button { m.open(e) } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.title).font(PF.ui(14.5, .bold)).foregroundStyle(fg).lineLimit(1)
                    Text(sub).font(PF.ui(12)).foregroundStyle(fg.opacity(0.85)).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if solid {
                    Text(e.type == "prove" ? "PRØVE" : "FRIST").font(PF.mono(9.5)).tracking(0.8).foregroundStyle(fg)
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background(Color.black.opacity(0.18), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
            .frame(minHeight: 48)
            .background(solid ? c : c.opacity(0.13))
            .background(p.card)
            .overlay(alignment: .leading) { Rectangle().fill(c).frame(width: 3) }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
