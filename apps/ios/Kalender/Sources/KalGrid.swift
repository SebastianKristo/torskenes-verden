import SwiftUI

/* ---------------- Prompt 33: Kalender – Uke / 3 dager / Dag (tidslinje 00–24) ---------------- */
// 44 / 52 / 62 pt per time. Starter ved nå −2 t (i dag i perioden) eller 07:30. Kolonnehode med ukedag, dato og vær.
// Rad for heldagshendelser. Overlappende hendelser deles i spor. Rød nå-linje. Blokker i kalenderfarge med tittel og tid.

struct KalLaid: Identifiable {
    let ev: KalEvent
    let lane: Int
    let lanes: Int
    var id: String { ev.id }
}

enum KalLayout {
    /// lay() i fasiten: klynger av overlappende hendelser, hver får spor 0…n-1.
    static func lanes(_ list: [KalEvent]) -> [KalLaid] {
        let timed: [KalEvent] = list.filter { (e: KalEvent) -> Bool in !e.allDay }.sorted { (a: KalEvent, b: KalEvent) -> Bool in
            if a.startMin != b.startMin { return a.startMin < b.startMin }
            return a.endMin > b.endMin
        }
        var out: [KalLaid] = []
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
            for pair in assigned { out.append(KalLaid(ev: pair.0, lane: pair.1, lanes: n)) }
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

struct KalGridView: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    private var count: Int { s.view == "dag" ? 1 : (s.view == "3d" ? 3 : 7) }
    private var hourH: CGFloat { count == 7 ? 44 : (count == 3 ? 52 : 62) }
    private var startDay: Date {
        let A: Date = KalD.date(s.anchor)
        return s.view == "uke" ? KalWeek35.start(A) : A
    }

    var body: some View {
        let days: [Date] = (0..<count).map { (i: Int) -> Date in KalD.add(startDay, i) }
        let hasAll: Bool = days.contains { (d: Date) -> Bool in s.on(KalD.key(d)).contains { (e: KalEvent) -> Bool in e.allDay } }
        VStack(spacing: 0) {
            KalGridHead(days: days)
            if hasAll { KalGridAllDay(days: days) }
            KalGridBody(days: days, hourH: hourH, small: count == 7)
        }
    }
}

struct KalGridHead: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let days: [Date]

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            // Prompt 35: «U43» i mono 800, 12 pt, full tekstfarge.
            Text("U" + String(KalWeek35.weekNo(KalWeek35.start(days.first ?? Date())))).font(KalFont.monoHeavy(12)).foregroundStyle(t.ink)
                .lineLimit(1).minimumScaleFactor(0.8)
                .frame(width: 40).padding(.bottom, 4)
            ForEach(0..<days.count, id: \.self) { (i: Int) in
                KalGridHeadCell(day: days[i], origin: UnitPoint(x: (CGFloat(i) + 0.5) / CGFloat(days.count), y: 0.08))
            }
        }
        .padding(.trailing, 6)
        .padding(.bottom, 6)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line).frame(height: 1) }
    }
}

struct KalGridHeadCell: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let day: Date
    var origin: UnitPoint = .center

    var body: some View {
        let k: String = KalD.key(day)
        let today: Bool = k == KalD.todayKey()
        let sunday: Bool = KalD.wd(day) == 0
        let wx: KalWxDay? = s.weather(k)
        // Prompt 35: Uke → 3 dager fra dagen, 3 dager → Dag.
        Button(action: {
            if s.view == "uke" { s.zoomTo("3d", day: k, origin: origin, inward: true) }
            else if s.view == "3d" { s.zoomTo("dag", day: k, origin: origin, inward: true) }
        }) {
            VStack(spacing: 2) {
                Text(KalD.weekdaysShort[KalD.wd(day)].uppercased()).font(KalFont.mono(9.5)).tracking(0.6)
                    .foregroundStyle(today ? t.red : (sunday ? t.sunday : t.mut))
                Text(String(KalD.dayOfMonth(day))).font(KalFont.ui(15, .bold))
                    .foregroundStyle(today ? Color.white : t.ink)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(today ? t.red : Color.clear))
                if let wx {
                    HStack(spacing: 2) {
                        Image(systemName: KalWx.symbol(wx.kind)).font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(KalWx.color(wx.kind, mut: t.mut))
                        Text(String(wx.hi) + "°").font(KalFont.mono(10)).foregroundStyle(t.mut)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(KalD.fd(day))
    }
}

struct KalGridAllDay: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let days: [Date]

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Text("hele").font(KalFont.mono(9)).foregroundStyle(t.mut2).frame(width: 40).padding(.top, 3)
            ForEach(days, id: \.self) { (d: Date) in
                VStack(spacing: 2) {
                    ForEach(s.on(KalD.key(d)).filter { (e: KalEvent) -> Bool in e.allDay }) { (e: KalEvent) in
                        KalAllDayChip(e: e)
                    }
                }
                .padding(.horizontal, 1)
                .frame(maxWidth: .infinity, alignment: .top)
            }
        }
        .padding(.vertical, 4)
        .padding(.trailing, 6)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line).frame(height: 1) }
    }
}

struct KalAllDayChip: View {
    @Environment(\.kal) private var t
    let e: KalEvent

    var body: some View {
        let c: KalCal? = KalStore.shared.cal(e.cal)
        Button(action: { KalStore.shared.openDetail(e) }) {
            Text(e.title).font(KalFont.ui(10, .bold)).lineLimit(1)
                .foregroundStyle(t.calText(c))
                .padding(.horizontal, 5).padding(.vertical, 2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 5).fill(t.calTint(c, e.kind == "frist" ? 0.22 : 0.13)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(e.title + ", hele dagen")
    }
}

struct KalGridBody: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let days: [Date]
    let hourH: CGFloat
    let small: Bool

    var body: some View {
        let todayIn: Bool = days.contains { (d: Date) -> Bool in KalD.key(d) == KalD.todayKey() }
        // Prompt 35: Innstillinger → «Tidslinje starter» (Nå / 06 / 08).
        let target: Int = s.timelineHour(todayIn: todayIn)
        ScrollViewReader { (proxy: ScrollViewProxy) in
            ScrollView {
                ZStack(alignment: .topLeading) {
                    markers
                    HStack(alignment: .top, spacing: 0) {
                        hours
                        ForEach(days, id: \.self) { (d: Date) in
                            KalGridColumn(day: d, hourH: hourH, small: small, wide: days.count > 1)
                        }
                    }
                    .padding(.trailing, 6)
                }
                .frame(height: hourH * 24)
            }
            .scrollIndicators(.hidden)
            .onAppear { proxy.scrollTo("h" + String(target), anchor: .top) }
            .onChange(of: s.anchor) { (_: String, _: String) in proxy.scrollTo("h" + String(target), anchor: .top) }
            .onChange(of: s.view) { (_: String, _: String) in proxy.scrollTo("h" + String(target), anchor: .top) }
        }
    }

    /// Usynlige merker for hver time (scrollTo). Uten i dag i perioden starter visningen ved 07.
    private var markers: some View {
        VStack(spacing: 0) {
            ForEach(0..<24, id: \.self) { (h: Int) in
                Color.clear.frame(height: hourH).id("h" + String(h))
            }
        }
        .allowsHitTesting(false)
    }

    private var hours: some View {
        ZStack(alignment: .topTrailing) {
            ForEach(1..<24, id: \.self) { (h: Int) in
                Text(KalD.pad(h)).font(KalFont.mono(9.5)).foregroundStyle(t.mut2)
                    .padding(.trailing, 6)
                    .offset(y: CGFloat(h) * hourH - 6)
            }
        }
        .frame(width: 40, height: hourH * 24, alignment: .topTrailing)
    }
}

struct KalGridColumn: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let day: Date
    let hourH: CGFloat
    let small: Bool
    let wide: Bool

    var body: some View {
        let k: String = KalD.key(day)
        let today: Bool = k == KalD.todayKey()
        let laid: [KalLaid] = KalLayout.lanes(s.on(k))
        GeometryReader { (geo: GeometryProxy) in
            ZStack(alignment: .topLeading) {
                KalHourLines(hourH: hourH)
                ForEach(laid) { (l: KalLaid) in
                    KalGridBlock(l: l, width: geo.size.width, hourH: hourH, small: small)
                }
                if today { KalNowLine(hourH: hourH) }
            }
        }
        .frame(height: hourH * 24)
        .background(today && wide ? t.red.opacity(0.035) : Color.clear)
        .overlay(alignment: .leading) { Rectangle().fill(t.line2).frame(width: 1) }
    }
}

struct KalHourLines: View {
    @Environment(\.kal) private var t
    let hourH: CGFloat

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<24, id: \.self) { (_: Int) in
                VStack(spacing: 0) {
                    Rectangle().fill(t.line2).frame(height: 1)
                    Spacer(minLength: 0)
                }
                .frame(height: hourH)
            }
        }
    }
}

struct KalGridBlock: View {
    @Environment(\.kal) private var t
    let l: KalLaid
    let width: CGFloat
    let hourH: CGFloat
    let small: Bool

    var body: some View {
        let e: KalEvent = l.ev
        let c: KalCal? = KalStore.shared.cal(e.cal)
        let h: CGFloat = Swift.max(20, CGFloat(e.endMin - e.startMin) / 60 * hourH - 2)
        let laneW: CGFloat = width / CGFloat(l.lanes)
        let x: CGFloat = laneW * CGFloat(l.lane) + 2
        let y: CGFloat = CGFloat(e.startMin) / 60 * hourH + 1
        let showTime: Bool = h >= 36 && !small
        let fs: CGFloat = small ? 9.5 : (width > 200 ? 13 : 11)
        Button(action: { KalStore.shared.openDetail(e) }) {
            VStack(alignment: .leading, spacing: 1) {
                Text(e.title).font(KalFont.ui(fs, .bold)).foregroundStyle(t.calText(c)).lineLimit(nil)
                if showTime {
                    Text(KalD.hm(e.startMin) + "–" + KalD.hm(e.endMin)).font(KalFont.mono(9.5)).foregroundStyle(t.calText(c).opacity(0.85))
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 5).padding(.vertical, 3)
            .frame(width: Swift.max(10, laneW - 4), height: h, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 7).fill(t.calTint(c, 0.15)))
            .background(RoundedRectangle(cornerRadius: 8).fill(t.bg).padding(-1.5))
            .clipShape(RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
        .offset(x: x, y: y)
        .accessibilityLabel(e.title + ", " + KalD.hm(e.startMin) + " til " + KalD.hm(e.endMin))
    }
}

/// Rød nå-linje med prikk.
struct KalNowLine: View {
    let hourH: CGFloat

    var body: some View {
        TimelineView(.periodic(from: Date(), by: 30)) { (_: TimelineViewDefaultContext) in
            let y: CGFloat = CGFloat(KalD.minutesNow()) / 60 * hourH
            ZStack(alignment: .leading) {
                Rectangle().fill(Color(kalHex: "#b23a2a")).frame(height: 2)
                Circle().fill(Color(kalHex: "#b23a2a")).frame(width: 8, height: 8).offset(x: -4)
            }
            .offset(y: y - 1)
            .allowsHitTesting(false)
        }
        .zIndex(3)
    }
}
