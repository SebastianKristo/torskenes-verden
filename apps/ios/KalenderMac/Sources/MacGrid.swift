import SwiftUI

/* ---------------- Prompt 34: Kalender for Mac – Dag / 3 dager / Uke (tidslinje 00–24) ---------------- */
// Kolonnehode med ukedag, dato og vær, rad for heldagshendelser, overlappende hendelser i spor, rød nå-linje.
// Starter ved nå −2 t (i dag i perioden) eller 07:30. Dobbeltklikk i en tom time lager ny hendelse der.

struct MacLaid: Identifiable {
    let ev: KalEvent
    let lane: Int
    let lanes: Int
    var id: String { ev.id }
}

enum MacLayout {
    /// lay() i fasiten: klynger av overlappende hendelser, hver får spor 0…n-1.
    static func lanes(_ list: [KalEvent]) -> [MacLaid] {
        let timed: [KalEvent] = list.filter { (e: KalEvent) -> Bool in !e.allDay }.sorted { (a: KalEvent, b: KalEvent) -> Bool in
            if a.startMin != b.startMin { return a.startMin < b.startMin }
            return a.endMin > b.endMin
        }
        var out: [MacLaid] = []
        var cluster: [KalEvent] = []
        var end: Int = -1
        func flush() {
            var laneEnds: [Int] = []
            var assigned: [(KalEvent, Int)] = []
            for e in cluster {
                var idx: Int = -1
                for (i, z) in laneEnds.enumerated() where z <= e.startMin {
                    idx = i
                    break
                }
                if idx < 0 {
                    idx = laneEnds.count
                    laneEnds.append(0)
                }
                laneEnds[idx] = e.endMin
                assigned.append((e, idx))
            }
            let n: Int = Swift.max(1, laneEnds.count)
            for pair in assigned { out.append(MacLaid(ev: pair.0, lane: pair.1, lanes: n)) }
            cluster = []
        }
        for e in timed {
            if !cluster.isEmpty && e.startMin >= end {
                flush()
                end = -1
            }
            cluster.append(e)
            end = Swift.max(end, e.endMin)
        }
        if !cluster.isEmpty { flush() }
        return out
    }
}

struct MacGridView: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared

    private var count: Int { win.view == "dag" ? 1 : (win.view == "3d" ? 3 : 7) }
    private var hourH: CGFloat { count == 7 ? 48 : (count == 3 ? 56 : 64) }
    private var startDay: Date {
        let A: Date = KalD.date(win.anchor)
        return win.view == "uke" ? KalWeek35.start(A) : A
    }

    var body: some View {
        let days: [Date] = (0..<count).map { (i: Int) -> Date in KalD.add(startDay, i) }
        let hasAll: Bool = days.contains { (d: Date) -> Bool in
            store.on(KalD.key(d)).contains { (e: KalEvent) -> Bool in e.allDay }
        }
        VStack(spacing: 0) {
            MacGridHead(win: win, days: days)
            if hasAll { MacGridAllDay(win: win, days: days) }
            MacGridBody(win: win, days: days, hourH: hourH)
        }
    }
}

struct MacGridHead: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    let days: [Date]

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            // Prompt 35: «U43» i mono 800, 12 pt, full tekstfarge.
            Text("U" + String(KalWeek35.weekNo(KalWeek35.start(days.first ?? Date())))).font(MacFont.monoHeavy(12)).foregroundColor(t.ink)
                .frame(width: 52).padding(.bottom, 6)
            ForEach(0..<days.count, id: \.self) { (i: Int) in
                MacGridHeadCell(win: win, day: days[i], origin: UnitPoint(x: (CGFloat(i) + 0.5) / CGFloat(days.count), y: 0.06))
            }
        }
        .padding(.trailing, 8)
        .padding(.vertical, 6)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line).frame(height: 1) }
    }
}

struct MacGridHeadCell: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared
    let day: Date
    var origin: UnitPoint = .center

    var body: some View {
        let k: String = KalD.key(day)
        let today: Bool = k == KalD.todayKey()
        let sunday: Bool = KalD.wd(day) == 0
        // Prompt 35: Uke → 3 dager fra dagen, 3 dager → Dag.
        Button(action: {
            if win.view == "uke" { win.zoomTo("3d", day: k, origin: origin, inward: true) }
            else if win.view == "3d" { win.zoomTo("dag", day: k, origin: origin, inward: true) }
        }) {
            HStack(spacing: 6) {
                Text(KalD.weekdaysShort[KalD.wd(day)].uppercased()).font(MacFont.mono(10)).tracking(0.8)
                    .foregroundColor(today ? t.red : (sunday ? t.sunday : t.mut))
                Text(String(KalD.dayOfMonth(day))).font(MacFont.ui(15, .heavy))
                    .foregroundColor(today ? Color.white : t.ink)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(today ? t.red : Color.clear))
                if let wx = store.weather(k) {
                    Image(systemName: KalWx.symbol(wx.kind)).font(.system(size: 11, weight: .semibold))
                        .foregroundColor(KalWx.color(wx.kind, mut: t.mut))
                    Text(String(wx.hi) + "°").font(MacFont.mono(10)).foregroundColor(t.mut)
                }
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct MacGridAllDay: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared
    let days: [Date]

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Text("HELE\nDAGEN").font(MacFont.mono(8.5)).foregroundColor(t.mut2).multilineTextAlignment(.center)
                .frame(width: 52).padding(.top, 4)
            ForEach(days, id: \.self) { (d: Date) in
                let list: [KalEvent] = store.on(KalD.key(d)).filter { (e: KalEvent) -> Bool in e.allDay }
                VStack(spacing: 2) {
                    ForEach(list) { (e: KalEvent) in MacMonthChip(e: e) { win.openDetail(e) } }
                }
                .frame(maxWidth: .infinity, alignment: .top)
                .padding(.horizontal, 2)
                .overlay(alignment: .leading) { Rectangle().fill(t.line2).frame(width: 1) }
            }
        }
        .padding(.trailing, 8)
        .padding(.vertical, 4)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line).frame(height: 1) }
    }
}

struct MacGridBody: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    let days: [Date]
    let hourH: CGFloat

    private var startHour: Int {
        let tk: String = KalD.todayKey()
        let hasToday: Bool = days.contains { (d: Date) -> Bool in KalD.key(d) == tk }
        // Prompt 35: Innstillinger → «Tidslinje starter» (Nå / 06 / 08).
        return MacStore.shared.timelineHour(todayIn: hasToday)
    }

    var body: some View {
        ScrollViewReader { (proxy: ScrollViewProxy) in
            ScrollView {
                HStack(alignment: .top, spacing: 0) {
                    hoursColumn
                    ForEach(days, id: \.self) { (d: Date) in
                        MacGridColumn(win: win, day: d, hourH: hourH)
                    }
                }
                .padding(.trailing, 8)
                .padding(.top, 8)
            }
            .onAppear { proxy.scrollTo("h" + String(startHour), anchor: .top) }
            .onChange(of: win.anchor) { (_: String) in proxy.scrollTo("h" + String(startHour), anchor: .top) }
        }
    }

    private var hoursColumn: some View {
        VStack(spacing: 0) {
            ForEach(0..<24, id: \.self) { (h: Int) in
                Text(h == 0 ? "" : KalD.pad(h) + ":00").font(MacFont.mono(10)).foregroundColor(t.mut)
                    .frame(width: 52, height: hourH, alignment: .topTrailing)
                    .padding(.trailing, 6)
                    .offset(y: -6)
                    .id("h" + String(h))
            }
        }
        .frame(width: 52)
    }
}

struct MacGridColumn: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared
    let day: Date
    let hourH: CGFloat

    var body: some View {
        let k: String = KalD.key(day)
        let laid: [MacLaid] = MacLayout.lanes(store.on(k))
        let today: Bool = k == KalD.todayKey()
        GeometryReader { (g: GeometryProxy) in
            ZStack(alignment: .topLeading) {
                lines
                ForEach(laid) { (l: MacLaid) in
                    block(l, width: g.size.width)
                }
                if today { nowLine(width: g.size.width) }
            }
        }
        .frame(height: hourH * 24)
        .background(today ? t.red.opacity(0.035) : Color.clear)
        .overlay(alignment: .leading) { Rectangle().fill(t.line).frame(width: 1) }
        .contentShape(Rectangle())
        .onTapGesture(count: 2) { (p: CGPoint) in
            let raw: CGFloat = p.y / hourH * 60
            let m: Int = raw.isFinite ? Swift.max(0, Swift.min(1439, Int(raw))) : 0
            let s: Int = Swift.min(23 * 60, (m / 30) * 30)
            win.openNew(day: k, s: s, e: s + 60)
        }
    }

    private var lines: some View {
        VStack(spacing: 0) {
            ForEach(0..<24, id: \.self) { (_: Int) in
                Rectangle().fill(t.line2).frame(height: 1).frame(height: hourH, alignment: .top)
            }
        }
    }

    private func block(_ l: MacLaid, width: CGFloat) -> some View {
        let e: KalEvent = l.ev
        let c: KalCal? = KalFag37.tint(store.cal(e.cal), e)
        let lw: CGFloat = Swift.max(0, width - 4) / CGFloat(Swift.max(1, l.lanes))
        let y: CGFloat = CGFloat(e.startMin) / 60 * hourH
        let h: CGFloat = Swift.max(18, CGFloat(e.endMin - e.startMin) / 60 * hourH - 2)
        let x: CGFloat = 2 + lw * CGFloat(l.lane)
        return Button(action: { win.openDetail(e) }) {
            VStack(alignment: .leading, spacing: 1) {
                Text(e.title).font(MacFont.ui(11.5, .bold)).foregroundColor(t.calText(c)).lineLimit(h > 34 ? 2 : 1)
                if h > 30 {
                    Text(KalD.hm(e.startMin) + "–" + KalD.hm(e.endMin)).font(MacFont.mono(9.5)).foregroundColor(t.calText(c).opacity(0.8))
                }
                if h > 52 && !e.loc.isEmpty {
                    Text(e.loc).font(MacFont.ui(10.5)).foregroundColor(t.calText(c).opacity(0.8)).lineLimit(1)
                }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .frame(width: Swift.max(10, lw - 2), height: h, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 7).fill(t.calTint(c, t.dark ? 0.32 : 0.16)))
            .overlay(alignment: .leading) { RoundedRectangle(cornerRadius: 2).fill(t.calColor(c)).frame(width: 3) }
            .clipShape(RoundedRectangle(cornerRadius: 7))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(e.title + " · " + KalD.hm(e.startMin) + "–" + KalD.hm(e.endMin))
        .offset(x: x, y: y)
    }

    private func nowLine(width: CGFloat) -> some View {
        let y: CGFloat = CGFloat(KalD.minutesNow()) / 60 * hourH
        let _: Int = store.tick
        return HStack(spacing: 0) {
            Circle().fill(t.red).frame(width: 9, height: 9).offset(x: -4.5)
            Rectangle().fill(t.red).frame(height: 2)
        }
        .frame(width: width)
        .offset(y: y - 4.5)
        .allowsHitTesting(false)
    }
}
