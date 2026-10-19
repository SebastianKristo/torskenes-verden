import SwiftUI
import UIKit

/* ---------------- Prompt 27: Kalender v2 – Dag · 3 dager · Uke (00–24) ---------------- */
// Fasit: rutenettet i design/Kalender.dc.html. Timehøyde 64 (Dag), 56 (3 dager) og 46 pt (Uke). Ruller til nå
// (halvannen time over) når siden åpnes eller visningen byttes, ellers til 07:45. Rød nålinje, «HELE»-rad for
// heldagshendelser og frister, overlappende hendelser side om side, og trykk på tom plass gir ny hendelse på den halvtimen.

struct Cal27Grid: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let now: Date

    var body: some View {
        let start: Date = m.gridStart
        let n: Int = m.days
        let hh: CGFloat = m.hourH
        let dates: [Date] = (0..<n).map { (i: Int) -> Date in Cal26.add(start, i) }
        let anyAll: Bool = dates.contains { (d: Date) -> Bool in m.on(Cal26.key(d)).contains { Cal27Model.inAllRow($0) } }
        VStack(spacing: 0) {
            Cal27GridHead(dates: dates, now: now)
            if anyAll { Cal27AllDayRow(dates: dates) }
            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 0) {
                        Cal27HourLabels(hh: hh)
                        ForEach(dates, id: \.self) { d in
                            Cal27DayColumn(d: d, now: now, hh: hh, compact: n == 7)
                        }
                    }
                    .padding(.top, 8).padding(.trailing, 8).padding(.bottom, 96)
                }
                .onAppear { scroll(proxy, dates: dates, animated: false) }
                .onChange(of: m.scrollTick) { _, _ in scroll(proxy, dates: dates, animated: true) }
                .onChange(of: m.gridKey) { _, _ in scroll(proxy, dates: dates, animated: false) }
            }
        }
    }

    /// I dag i perioden: halvannen time før nå. Ellers 07:45.
    private func scroll(_ proxy: ScrollViewProxy, dates: [Date], animated: Bool) {
        let tk: String = Cal26.key(now)
        let inRange: Bool = dates.contains { Cal26.key($0) == tk }
        let nm: Int = Cal26.minutes(now)
        let hour: Int = inRange ? Swift.max(0, Swift.min(23, (nm - 90) / 60)) : 7
        DispatchQueue.main.async {
            if animated {
                withAnimation(.easeOut(duration: 0.3)) { proxy.scrollTo("c27h\(hour)", anchor: .top) }
            } else {
                proxy.scrollTo("c27h\(hour)", anchor: .top)
            }
        }
    }
}

/// Ukenummer og dagene (trykk = dagsvisning).
struct Cal27GridHead: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let dates: [Date]
    let now: Date

    var body: some View {
        let tk: String = Cal26.key(now)
        let compact: Bool = dates.count == 7
        VStack(spacing: 0) {
            HStack(alignment: .bottom, spacing: 0) {
                Text("U\(Cal26.isoWeek(dates.first ?? now))").font(PF.mono(10)).foregroundStyle(p.mut)
                    .frame(width: 40).padding(.bottom, 8)
                ForEach(dates, id: \.self) { d in
                    let k: String = Cal26.key(d)
                    let isT: Bool = k == tk
                    let we: Bool = Cal26.jsDay(d) % 6 == 0
                    let w: String = Cal26.weekShort[(Cal26.jsDay(d) + 6) % 7]
                    Button { m.goDay(k) } label: {
                        VStack(spacing: 3) {
                            Text(compact ? String(w.prefix(1)) : w).font(PF.mono(10.5)).tracking(0.6)
                                .foregroundStyle(isT ? p.lab : (we ? p.mut : p.ink))
                            Text("\(Cal26.cal.component(.day, from: d))").font(PF.ui(16, .bold))
                                .foregroundStyle(isT ? Color.white : (we ? p.mut : p.ink))
                                .frame(width: 32, height: 32)
                                .background(isT ? p.lab : Color.clear, in: Circle())
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 2)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.trailing, 8).padding(.bottom, 6)
            Rectangle().fill(p.line).frame(height: 1)
        }
    }
}

/// «HELE»: heldagshendelser og frister.
struct Cal27AllDayRow: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let dates: [Date]

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                Text("HELE").font(PF.mono(9)).foregroundStyle(p.mut).frame(width: 40).padding(.top, 5)
                ForEach(dates, id: \.self) { d in
                    let list: [CalEvent26] = m.on(Cal26.key(d)).filter { Cal27Model.inAllRow($0) }
                    VStack(spacing: 2) {
                        ForEach(list) { e in chip(e) }
                    }
                    .frame(maxWidth: .infinity, alignment: .top)
                    .padding(.horizontal, 1)
                }
            }
            .padding(.vertical, 4).padding(.trailing, 8)
            Rectangle().fill(p.line).frame(height: 1)
        }
    }

    private func chip(_ e: CalEvent26) -> some View {
        Button { m.open(e) } label: {
            Text((e.type == "innl" ? "⚑ " : "") + e.short).font(PF.ui(11, .bold)).foregroundStyle(Color.white).lineLimit(1)
                .padding(.horizontal, 6)
                .frame(maxWidth: .infinity, alignment: .leading).frame(height: 22)
                .background(Color(hex: m.hex(e)), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// Klokkeslettene til venstre. Hver time er en egen rad (id c27h<time>), så ScrollViewReader kan rulle til den.
struct Cal27HourLabels: View {
    @Environment(\.paper) private var p
    let hh: CGFloat

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<24, id: \.self) { h in
                Color.clear.frame(width: 40, height: hh)
                    .overlay(alignment: .topTrailing) {
                        if h > 0 {
                            Text(String(format: "%02d", h)).font(PF.mono(10.5, bold: false)).foregroundStyle(p.mut)
                                .padding(.trailing, 6).offset(y: -7)
                        }
                    }
                    .id("c27h\(h)")
            }
        }
    }
}

/// Én dag i rutenettet.
struct Cal27DayColumn: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let d: Date
    let now: Date
    let hh: CGFloat
    let compact: Bool

    var body: some View {
        let k: String = Cal26.key(d)
        let isT: Bool = k == Cal26.key(now)
        let we: Bool = Cal26.jsDay(d) % 6 == 0
        let slots: [Cal27Slot] = Cal27Model.layout(m.on(k))
        let nm: Int = Cal26.minutes(now)
        let bg: Color = isT ? p.lab.opacity(0.05) : (we ? p.line.opacity(0.3) : Color.clear)
        GeometryReader { g in
            let w: CGFloat = g.size.width
            ZStack(alignment: .topLeading) {
                Rectangle().fill(bg)
                    .contentShape(Rectangle())
                    .gesture(SpatialTapGesture().onEnded { v in tapAt(v.location.y, k) })
                ForEach(1..<24, id: \.self) { h in
                    Rectangle().fill(p.line).frame(width: w, height: 1)
                        .offset(y: CGFloat(h) * hh)
                        .allowsHitTesting(false)
                }
                ForEach(slots) { s in
                    Cal27Block(slot: s, width: w, hh: hh, compact: compact)
                }
                if isT {
                    Cal27NowLine(width: w)
                        .offset(y: CGFloat(nm) / 60 * hh - 1)
                        .allowsHitTesting(false)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 24 * hh)
        .overlay(alignment: .leading) { Rectangle().fill(p.line).frame(width: 1) }
    }

    /// Ny hendelse på halvtimen som ble trykket.
    private func tapAt(_ y: CGFloat, _ k: String) {
        let half: Int = Int((y / hh * 2).rounded(.down))
        let minute: Int = Swift.max(0, Swift.min(23 * 60, half * 30))
        m.newEvent(day: k, minute: minute)
    }
}

struct Cal27NowLine: View {
    let width: CGFloat

    var body: some View {
        ZStack(alignment: .leading) {
            Rectangle().fill(Color(hex: "#e0342a")).frame(width: width, height: 2)
            Circle().fill(Color(hex: "#e0342a")).frame(width: 10, height: 10).offset(x: -5)
        }
        .frame(width: width, height: 2)
    }
}

/// En hendelse i rutenettet: prøver fylt, resten tonet med fargestripe til venstre.
struct Cal27Block: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let slot: Cal27Slot
    let width: CGFloat
    let hh: CGFloat
    let compact: Bool

    var body: some View {
        let e: CalEvent26 = slot.e
        let c: Color = Color(hex: m.hex(e))
        let solid: Bool = e.type == "prove"
        let n: CGFloat = CGFloat(Swift.max(1, slot.n))
        let x: CGFloat = width * CGFloat(slot.c) / n + 1
        let bw: CGFloat = Swift.max(8, width / n - 3)
        let ht: CGFloat = CGFloat(slot.b - slot.a) / 60 * hh
        let bh: CGFloat = Swift.max(18, ht - 2)
        let tall: Bool = ht >= 40 && !(compact && slot.n > 1)
        let sel: Bool = m.sel?.id == e.id
        let fg: Color = solid ? Color.white : p.ink
        Button { m.open(e) } label: {
            VStack(alignment: .leading, spacing: 1) {
                Text(e.type == "time" ? e.short : e.title).font(PF.ui(compact ? 10.5 : 12, .bold)).foregroundStyle(fg).lineLimit(1)
                if tall {
                    Text(e.startText + "–" + e.endText + (e.room.isEmpty ? "" : " · " + e.room)).font(PF.ui(11))
                        .foregroundStyle(fg.opacity(0.8)).lineLimit(1)
                }
            }
            .padding(.leading, 6).padding(.trailing, 3).padding(.vertical, 3)
            .frame(width: bw, height: bh, alignment: .topLeading)
            .background(solid ? c : c.opacity(0.17))
            .background(p.card)
            .overlay(alignment: .leading) { Rectangle().fill(c).frame(width: 3) }
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay {
                if sel { RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(p.ink, lineWidth: 2).padding(-1) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .offset(x: x, y: CGFloat(slot.a) / 60 * hh)
        .accessibilityLabel(e.title + ", " + e.timeText)
    }
}
