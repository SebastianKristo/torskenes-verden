import SwiftUI
import UIKit

/* ---------------- Prompt 26: Kalender-kortet (Uke · Måned · Agenda, filter og detaljkort) ---------------- */
// Fasit: kort D i design/Kalender.dc.html. Uke: Man–Fre 08–16, timehøyde 48 pt, rad for hele dagen, nå-linje og
// ISO-ukenummer; i helgen vises neste uke. Måned: 7 × 6 med prikker. Agenda: 21 dager, tomme dager hoppes over.
// Sveip til venstre/høyre bytter uke eller måned.

extension Cal26 {
    /// Mandagen i uka som vises (helg → neste uke når off er 0).
    static func weekStart(_ now: Date, _ off: Int) -> Date {
        var b: Date = startOfDay(now)
        let wd: Int = jsDay(b)
        if off == 0 && (wd == 6 || wd == 0) { b = add(b, wd == 6 ? 2 : 1) }
        let monday: Date = add(b, -((jsDay(b) + 6) % 7))
        return add(monday, off * 7)
    }

    static func monthStart(_ now: Date, _ off: Int) -> Date {
        let c: DateComponents = cal.dateComponents([.year, .month], from: now)
        let first: Date = cal.date(from: c) ?? startOfDay(now)
        return cal.date(byAdding: .month, value: off, to: first) ?? first
    }

    static func monthKeyPrefix(_ d: Date) -> String { String(key(d).prefix(7)) }
}

/// Tittel og undertittel mellom ‹ og ›, og om «I dag» er aktiv.
struct Cal26Nav {
    var title: String = ""
    var sub: String = ""
    var isToday: Bool = true

    static func make(view: String, off: Int, selDay: String?, now: Date) -> Cal26Nav {
        var n = Cal26Nav()
        let c: Calendar = Cal26.cal
        switch view {
        case "maaned":
            let m0: Date = Cal26.monthStart(now, off)
            let last: Date = Cal26.add(c.date(byAdding: .month, value: 1, to: m0) ?? m0, -1)
            n.title = Cal26.cap(Cal26.monthsLong[c.component(.month, from: m0) - 1]) + " \(c.component(.year, from: m0))"
            n.sub = "Uke \(Cal26.isoWeek(m0))–\(Cal26.isoWeek(last))"
            n.isToday = off == 0 && Cal26Nav.selectedKey(selDay: selDay, off: off, now: now) == Cal26.key(now)
        case "agenda":
            let a0: Date = Cal26.add(Cal26.startOfDay(now), off * 7)
            let a1: Date = Cal26.add(a0, 20)
            n.title = Cal26.dShort(a0) + " – " + Cal26.dShort(a1)
            n.sub = "Tre uker fremover"
            n.isToday = off == 0
        default:
            let s: Date = Cal26.weekStart(now, off)
            let f: Date = Cal26.add(s, 4)
            let sm: Int = c.component(.month, from: s)
            let fm: Int = c.component(.month, from: f)
            n.title = "Uke \(Cal26.isoWeek(s))"
            let sd: Int = c.component(.day, from: s)
            let fd: Int = c.component(.day, from: f)
            let fy: Int = c.component(.year, from: f)
            let mid: String = sm != fm ? " " + Cal26.monthsShort[sm - 1] : ""
            let tail: String = Cal26.monthsLong[fm - 1] + " \(fy)"
            n.sub = "\(sd)." + mid + "–\(fd). " + tail
            n.isToday = off == 0
        }
        return n
    }

    /// Valgt dag i Måned: valgt dag i måneden, ellers i dag (denne måneden) eller den første.
    static func selectedKey(selDay: String?, off: Int, now: Date) -> String {
        let m0: Date = Cal26.monthStart(now, off)
        if let s = selDay, s.hasPrefix(Cal26.monthKeyPrefix(m0)) { return s }
        return off == 0 ? Cal26.key(now) : Cal26.key(m0)
    }
}

struct Cal26CalendarCard: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let now: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Cal26ViewSwitch()
            Cal26NavRow(now: now)
            Cal26Chips()
            if let e = m.sel { Cal26DetailCard(e: e) }
            viewBody(m.view)
                .simultaneousGesture(DragGesture(minimumDistance: 24).onEnded { v in swipe(v) })
            Text("Timeplanen hentes fra skolens iCal-lenke og oppdateres hver time. Trykk på en time for rom, lærer og påminnelse.")
                .font(PF.ui(12)).foregroundStyle(p.mut).lineSpacing(2).padding(.horizontal, 4)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder private func viewBody(_ v: String) -> some View {
        switch v {
        case "maaned": Cal26MonthView(now: now)
        case "agenda": Cal26AgendaView(now: now)
        default: Cal26WeekView(now: now)
        }
    }

    private func swipe(_ v: DragGesture.Value) {
        let dx: CGFloat = v.translation.width
        let dy: CGFloat = v.translation.height
        guard abs(dx) > 60, abs(dx) > abs(dy) * 1.6 else { return }
        m.step(dx < 0 ? 1 : -1)
    }
}

/// Uke · Måned · Agenda.
struct Cal26ViewSwitch: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }

    var body: some View {
        HStack(spacing: 4) {
            seg("uke", "Uke")
            seg("maaned", "Måned")
            seg("agenda", "Agenda")
        }
        .padding(4)
        .background(p.card, in: Capsule())
    }

    private func seg(_ k: String, _ name: String) -> some View {
        let on: Bool = m.view == k
        return Button { m.setView(k) } label: {
            Text(name).font(PF.ui(13.5, .bold)).foregroundStyle(on ? p.bg : p.ink)
                .frame(maxWidth: .infinity).frame(height: 38)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// ‹  Uke 43 / 19.–23. oktober 2026  ›  I dag
struct Cal26NavRow: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let now: Date

    var body: some View {
        let n: Cal26Nav = Cal26Nav.make(view: m.view, off: m.off, selDay: m.selDay, now: now)
        HStack(spacing: 8) {
            circle("‹", "Forrige") { m.step(-1) }
            VStack(spacing: 1) {
                Text(n.title).font(PF.serif(21, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.8)
                Text(n.sub).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            circle("›", "Neste") { m.step(1) }
            Button { m.goToday() } label: {
                Text("I dag").font(PF.ui(13, .bold)).foregroundStyle(n.isToday ? p.mut : Color.white)
                    .padding(.horizontal, 14).frame(height: 38)
                    .background(n.isToday ? p.card : Color(hex: "#b23a2a"), in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    private func circle(_ t: String, _ label: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(17)).foregroundStyle(p.ink).frame(width: 38, height: 38)
                .background(p.card, in: Circle())
                .overlay(Circle().stroke(p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Filter: Timeplan · Prøver og frister · Bursdager · Skole (lagres per bruker).
struct Cal26Chips: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }

    private let colors: [String: String] = ["prover": "#b23a2a", "bursdager": "#2b5d8a", "skole": "#a8661a"]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Cal26Model.filterKeys, id: \.self) { k in chip(k) }
            }
        }
    }

    private func chip(_ k: String) -> some View {
        let off: Bool = m.hiddenFilters.contains(k)
        let dot: Color = colors[k].map { Color(hex: $0) } ?? p.ink
        return Button { m.toggleFilter(k) } label: {
            HStack(spacing: 7) {
                Circle().fill(dot).frame(width: 9, height: 9)
                Text(Cal26Model.filterNames[k] ?? k).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
            }
            .padding(.horizontal, 12).frame(height: 32)
            .background(off ? Color.clear : p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(p.line, lineWidth: 1))
            .opacity(off ? 0.5 : 1)
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Detaljkortet ---------- */

struct Cal26DetailCard: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let e: CalEvent26

    private static let rems: [(String, String)] = [("none", "Ingen"), ("15m", "15 min før"), ("1h", "1 time før"), ("day", "Dagen før")]

    var body: some View {
        let c: Color = Color(hex: m.hex(e))
        VStack(alignment: .leading, spacing: 10) {
            header(c)
            ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                VStack(spacing: 0) {
                    Rectangle().fill(p.line).frame(height: 1)
                    HStack(alignment: .top, spacing: 12) {
                        Text(r.0).font(PF.ui(14)).foregroundStyle(p.mut)
                        Spacer(minLength: 8)
                        Text(r.1).font(PF.ui(14, .bold)).foregroundStyle(p.ink).multilineTextAlignment(.trailing)
                    }
                    .padding(.vertical, 9)
                }
            }
            Text("Påminnelse").font(PF.ui(12.5)).foregroundStyle(p.mut)
            Flow(spacing: 6) {
                ForEach(Array(Cal26DetailCard.rems.enumerated()), id: \.offset) { _, r in remChip(r.0, r.1) }
            }
            if hasMap { mapLink }
        }
        .padding(16)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(c, lineWidth: 1.5))
    }

    private func header(_ c: Color) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(kicker).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(c)
                Text(e.title).font(PF.serif(26, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                Text(when).font(PF.ui(13.5)).foregroundStyle(p.mut).padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 18)
            .overlay(alignment: .leading) {
                RoundedRectangle(cornerRadius: 3).fill(c).frame(width: 6)
            }
            Button { m.sel = nil } label: {
                Text("×").font(PF.ui(16)).foregroundStyle(p.ink).frame(width: 34, height: 34)
                    .overlay(Circle().stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Lukk")
        }
    }

    private var kicker: String {
        switch e.type {
        case "time": return "TIME"
        case "prove": return "PRØVE"
        case "innl": return "INNLEVERING"
        case "bursdag": return "BURSDAG"
        default: return "SKOLE"
        }
    }

    private var when: String { Cal26.cap(Cal26.dLong(Cal26.day(e.dayKey))) + " · " + e.timeText }

    private var rows: [(String, String)] {
        var out: [(String, String)] = []
        if !e.room.isEmpty { out.append(("Rom", e.room)) }
        if !e.teacher.isEmpty { out.append(("Lærer", e.teacher)) }
        if e.type != "time" && !e.subject.isEmpty { out.append(("Fag", e.subject)) }
        if !e.note.isEmpty { out.append(("Merknad", e.note)) }
        return out
    }

    private func remChip(_ k: String, _ name: String) -> some View {
        let on: Bool = m.reminder(e) == k
        return Button { m.setReminder(e, k) } label: {
            Text(name).font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.bg : p.ink)
                .padding(.horizontal, 12).frame(height: 32)
                .background(on ? p.ink : Color.clear, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(on ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var hasMap: Bool {
        if !e.mazemap.isEmpty { return true }
        if e.room.isEmpty { return false }
        if e.room.range(of: "^[A-C]-", options: .regularExpression) != nil { return true }
        for w in ["Aula", "Hall", "Gym", "Bibl"] where e.room.contains(w) { return true }
        return false
    }

    @ViewBuilder private var mapLink: some View {
        if let u = URL(string: e.mazemap.isEmpty ? "https://use.mazemap.com/" : e.mazemap) {
            Link(destination: u) {
                Text("Finn rommet i MazeMap ↗").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                    .padding(.horizontal, 16).frame(height: 38)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1))
            }
        }
    }
}

/* ---------- Rad i Måned og Agenda ---------- */

struct Cal26ItemRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let e: CalEvent26

    var body: some View {
        let c: Color = Color(hex: m.hex(e))
        Button { cal26Tap(store) { m.open(e) } } label: {
            HStack(spacing: 12) {
                Text(e.timeText).font(PF.mono(12, bold: false)).foregroundStyle(p.mut).lineLimit(2).frame(width: 72, alignment: .leading)
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.title).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                    if !e.subLine.isEmpty {
                        Text(e.subLine).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 16)
                .overlay(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2).fill(c).frame(width: 4)
                }
                if e.isTest {
                    Text(e.type == "prove" ? "PRØVE" : "FRIST").font(PF.ui(10.5, .bold)).foregroundStyle(Color.white)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(c, in: Capsule())
                }
            }
            .padding(.vertical, 8)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Kort med rader og skillelinjer bare mellom radene.
struct Cal26ListCard: View {
    @Environment(\.paper) private var p
    let items: [CalEvent26]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { i, e in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                Cal26ItemRow(e: e)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 2)
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/* ---------- Agenda ---------- */

struct Cal26AgendaView: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let now: Date

    private struct Group26: Identifiable {
        let id: String
        let title: String
        let today: Bool
        let items: [CalEvent26]
    }

    private var groups: [Group26] {
        let a0: Date = Cal26.add(Cal26.startOfDay(now), m.off * 7)
        let tk: String = Cal26.key(now)
        let tm: String = Cal26.key(Cal26.add(now, 1))
        var out: [Group26] = []
        for i in 0..<21 {
            let d: Date = Cal26.add(a0, i)
            let k: String = Cal26.key(d)
            let l: [CalEvent26] = m.on(k)
            if l.isEmpty { continue }
            let pre: String = k == tk ? "I DAG · " : (k == tm ? "I MORGEN · " : "")
            out.append(Group26(id: k, title: pre + Cal26.dLong(d).uppercased(), today: k == tk, items: l))
        }
        return out
    }

    var body: some View {
        let g: [Group26] = groups
        VStack(alignment: .leading, spacing: 12) {
            if g.isEmpty {
                Text(m.loaded ? "Ingenting de neste tre ukene." : "Henter …").font(PF.ui(14)).foregroundStyle(p.mut).padding(.horizontal, 4)
            }
            ForEach(g) { grp in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(grp.title).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(grp.today ? p.lab : p.ink).lineLimit(1)
                        Spacer()
                        Text("\(grp.items.count)").font(PF.mono(10.5)).foregroundStyle(p.mut)
                    }
                    .padding(.horizontal, 4).padding(.top, 4)
                    Cal26ListCard(items: grp.items)
                }
            }
        }
    }
}

/* ---------- Måned ---------- */

struct Cal26MonthView: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let now: Date

    var body: some View {
        let m0: Date = Cal26.monthStart(now, m.off)
        let st: Date = Cal26.add(m0, -((Cal26.jsDay(m0) + 6) % 7))
        let selK: String = Cal26Nav.selectedKey(selDay: m.selDay, off: m.off, now: now)
        let list: [CalEvent26] = m.on(selK)
        let pre: String = selK == Cal26.key(now) ? "I DAG · " : ""
        VStack(alignment: .leading, spacing: 14) {
            VStack(spacing: 2) {
                HStack(spacing: 2) {
                    ForEach(Cal26.weekShort, id: \.self) { h in
                        Text(h).font(PF.mono(10)).tracking(0.8).foregroundStyle(p.mut)
                            .frame(maxWidth: .infinity).padding(.top, 2).padding(.bottom, 6)
                    }
                }
                ForEach(0..<6, id: \.self) { r in
                    HStack(spacing: 2) {
                        ForEach(0..<7, id: \.self) { c in
                            Cal26MonthCell(d: Cal26.add(st, r * 7 + c), m0: m0, selK: selK, now: now)
                        }
                    }
                }
            }
            .padding(12)
            .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            VStack(alignment: .leading, spacing: 6) {
                Text(pre + Cal26.dLong(Cal26.day(selK)).uppercased()).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                    .padding(.horizontal, 4).padding(.top, 4)
                if list.isEmpty {
                    Text("Ingenting denne dagen.").font(PF.ui(14)).foregroundStyle(p.mut)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14).padding(.vertical, 16)
                        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                } else {
                    Cal26ListCard(items: list)
                }
            }
        }
    }
}

struct Cal26MonthCell: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let d: Date
    let m0: Date
    let selK: String
    let now: Date

    var body: some View {
        let k: String = Cal26.key(d)
        let inMonth: Bool = Cal26.monthKeyPrefix(d) == Cal26.monthKeyPrefix(m0)
        let isT: Bool = k == Cal26.key(now)
        let sel: Bool = k == selK
        let wd: Int = Cal26.jsDay(d)
        let weekday: Bool = wd != 0 && wd != 6
        let dots: [String] = dotColors(k)
        Button { cal26Tap(store) { m.selDay = k; m.sel = nil; Haptics.shared.select() } } label: {
            VStack(spacing: 4) {
                Text("\(Cal26.cal.component(.day, from: d))").font(PF.serif(16, medium: true))
                    .foregroundStyle(isT ? Color.white : (weekday ? p.ink : p.mut))
                    .frame(width: 28, height: 28)
                    .background(isT ? Color(hex: "#b23a2a") : Color.clear, in: Circle())
                HStack(spacing: 3) {
                    ForEach(Array(dots.enumerated()), id: \.offset) { _, h in
                        Circle().fill(h == "line" ? p.line : Color(hex: h)).frame(width: 6, height: 6)
                    }
                }
                .frame(height: 6)
                Spacer(minLength: 0)
            }
            .padding(.top, 5)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(sel ? p.bg : Color.clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                if sel { RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(p.ink, lineWidth: 1.5) }
            }
            .opacity(inMonth ? 1 : 0.38)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// Opptil tre prikker: én per farge for annet enn timer, og en grå når dagen har timer.
    private func dotColors(_ k: String) -> [String] {
        let l: [CalEvent26] = m.on(k)
        var out: [String] = []
        for e in l where e.type != "time" {
            let h: String = m.hex(e)
            if !out.contains(h) { out.append(h) }
            if out.count >= 3 { break }
        }
        if out.count < 3 && l.contains(where: { $0.type == "time" }) { out.append("line") }
        return out
    }
}

/* ---------- Uke ---------- */

struct Cal26WeekView: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let now: Date

    static let hourH: CGFloat = 48
    static let s0: Int = 8 * 60
    static let s1: Int = 16 * 60
    static var gridH: CGFloat { CGFloat(s1 - s0) / 60 * hourH }

    var body: some View {
        let start: Date = Cal26.weekStart(now, m.off)
        let days: [Date] = [0, 1, 2, 3, 4].map { Cal26.add(start, $0) }
        let anyAll: Bool = days.contains(where: { (d: Date) -> Bool in m.on(Cal26.key(d)).contains(where: { Cal26WeekView.inAllRow($0) }) })
        VStack(spacing: 6) {
            HStack(alignment: .top, spacing: 4) {
                Color.clear.frame(width: 30, height: 1)
                ForEach(days, id: \.self) { d in Cal26WeekHead(d: d, now: now) }
            }
            if anyAll {
                HStack(alignment: .top, spacing: 4) {
                    Text("HELE").font(PF.mono(9)).foregroundStyle(p.mut).frame(width: 30, alignment: .trailing).padding(.top, 5)
                    ForEach(days, id: \.self) { d in Cal26WeekAllDay(key: Cal26.key(d)) }
                }
            }
            HStack(alignment: .top, spacing: 4) {
                hourLabels
                ForEach(days, id: \.self) { d in Cal26WeekColumn(d: d, now: now) }
            }
        }
        .padding(.top, 12).padding(.bottom, 14).padding(.leading, 6).padding(.trailing, 10)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var hourLabels: some View {
        ZStack(alignment: .topTrailing) {
            ForEach(Array(8...16), id: \.self) { h in
                Text(String(format: "%02d", h)).font(PF.mono(10, bold: false)).foregroundStyle(p.mut)
                    .offset(x: -2, y: CGFloat(h * 60 - Cal26WeekView.s0) / 60 * Cal26WeekView.hourH - 7)
            }
        }
        .frame(width: 30, height: Cal26WeekView.gridH, alignment: .topTrailing)
    }

    /// Utenfor 08–16, uten klokkeslett eller frister: raden for hele dagen.
    static func outside(_ e: CalEvent26) -> Bool {
        e.startMin >= 0 && e.type != "innl" && (e.endMin <= s0 || e.startMin >= s1)
    }

    static func inAllRow(_ e: CalEvent26) -> Bool { e.startMin < 0 || e.type == "innl" || outside(e) }
}

struct Cal26WeekHead: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let d: Date
    let now: Date

    var body: some View {
        let k: String = Cal26.key(d)
        let isT: Bool = k == Cal26.key(now)
        Button { cal26Tap(store) { m.openDayInMonth(k) } } label: {
            VStack(spacing: 3) {
                Text(Cal26.weekShort[(Cal26.jsDay(d) + 6) % 7]).font(PF.mono(10)).tracking(0.8).foregroundStyle(p.mut)
                Text("\(Cal26.cal.component(.day, from: d))").font(PF.serif(17, medium: true))
                    .foregroundStyle(isT ? Color.white : p.ink)
                    .frame(width: 30, height: 30)
                    .background(isT ? Color(hex: "#b23a2a") : Color.clear, in: Circle())
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}

struct Cal26WeekAllDay: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let key: String

    var body: some View {
        let list: [CalEvent26] = m.on(key).filter { Cal26WeekView.inAllRow($0) }
        VStack(alignment: .leading, spacing: 3) {
            ForEach(list) { e in
                Button { cal26Tap(store) { m.open(e) } } label: {
                    Text(label(e)).font(PF.ui(10.5, .bold)).foregroundStyle(Color.white).lineLimit(1)
                        .padding(.horizontal, 5).padding(.vertical, 3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(hex: m.hex(e)), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .top)
    }

    private func label(_ e: CalEvent26) -> String {
        if e.type == "innl" { return "⚑ " + e.title }
        if Cal26WeekView.outside(e) { return e.startText + " " + e.title }
        return e.title
    }
}

struct Cal26WeekColumn: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let d: Date
    let now: Date

    var body: some View {
        let k: String = Cal26.key(d)
        let isT: Bool = k == Cal26.key(now)
        let nm: Int = Cal26.minutes(now)
        let list: [CalEvent26] = m.on(k).filter { !Cal26WeekView.inAllRow($0) }
        let hH: CGFloat = Cal26WeekView.hourH
        let s0: Int = Cal26WeekView.s0
        ZStack(alignment: .top) {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(isT ? Color(hex: "#b23a2a").opacity(0.06) : Color.clear)
            ForEach(Array(8...16), id: \.self) { h in
                Rectangle().fill(p.line.opacity(0.6)).frame(height: 1)
                    .offset(y: CGFloat(h * 60 - s0) / 60 * hH)
            }
            ForEach(list) { e in
                Cal26WeekBlock(e: e, sel: m.sel?.id == e.id)
            }
            if isT && nm >= s0 && nm <= Cal26WeekView.s1 {
                ZStack(alignment: .leading) {
                    Rectangle().fill(Color(hex: "#b23a2a")).frame(height: 2)
                    Circle().fill(Color(hex: "#b23a2a")).frame(width: 8, height: 8).offset(x: -3)
                }
                .offset(y: CGFloat(nm - s0) / 60 * hH - 1)
                .allowsHitTesting(false)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: Cal26WeekView.gridH, alignment: .top)
    }
}

struct Cal26WeekBlock: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let e: CalEvent26
    let sel: Bool

    var body: some View {
        let s0: Int = Cal26WeekView.s0
        let s1: Int = Cal26WeekView.s1
        let a: Int = Swift.max(s0, e.startMin)
        let b: Int = Swift.min(s1, e.endMin)
        let hH: CGFloat = Cal26WeekView.hourH
        let top: CGFloat = CGFloat(a - s0) / 60 * hH
        let height: CGFloat = Swift.max(22, CGFloat(b - a) / 60 * hH - 2)
        let test: Bool = e.type == "prove"
        let c: Color = Color(hex: m.hex(e))
        let fg: Color = test ? Color.white : p.ink
        Button { cal26Tap(store) { m.open(e) } } label: {
            VStack(alignment: .leading, spacing: 1) {
                Text(e.short).font(PF.ui(11, .heavy)).foregroundStyle(fg).lineLimit(1)
                Text(test ? (e.room.isEmpty ? "PRØVE" : e.room + " · PRØVE") : e.room).font(PF.ui(10, .semibold))
                    .foregroundStyle(fg).opacity(0.8).lineLimit(1)
            }
            .padding(.leading, 8).padding(.trailing, 4).padding(.vertical, 3)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(test ? c : c.opacity(0.15))
            .overlay(alignment: .leading) { Rectangle().fill(c).frame(width: 3) }
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            .overlay {
                if sel { RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(p.ink, lineWidth: 2).padding(-1) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(height: height)
        .padding(.horizontal, 2)
        .offset(y: top)
    }
}
