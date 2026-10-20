import SwiftUI

/* ---------------- Prompt 34: Kalender for Mac – Måned, År og Liste (web-variantens visninger) ---------------- */

/* ---------- Måned ---------- */

struct MacMonthView: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared

    private var first: Date { KalD.firstOfMonth(KalD.date(win.anchor)) }

    /// Prompt 35: «Uken starter» (mandag/søndag).
    private var weeks: [Date] {
        let start: Date = KalWeek35.start(first)
        return (0..<6).map { (i: Int) -> Date in KalD.add(start, i * 7) }
    }

    var body: some View {
        VStack(spacing: 0) {
            head
            VStack(spacing: 0) {
                ForEach(0..<weeks.count, id: \.self) { (i: Int) in
                    MacMonthRow(win: win, week: weeks[i], month: KalD.month(first), row: i)
                }
            }
            .frame(maxHeight: .infinity)
        }
        .padding(.horizontal, 8)
        .padding(.bottom, 8)
    }

    private var head: some View {
        HStack(spacing: 0) {
            if store.showWeeks { Text("U").font(MacFont.monoHeavy(11)).foregroundColor(t.ink).frame(width: 28) }
            ForEach(0..<7, id: \.self) { (i: Int) in
                Text(KalWeek35.shortNames[i].uppercased())
                    .font(MacFont.mono(10)).tracking(1)
                    .foregroundColor(KalWeek35.isSunday(i) ? t.sunday : t.mut)
                    .frame(maxWidth: .infinity)
            }
        }
        .frame(height: 30)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line).frame(height: 1) }
    }
}

struct MacMonthRow: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared
    let week: Date
    let month: Int
    var row: Int = 0

    var body: some View {
        let wk: Int = KalWeek35.weekNo(week)
        HStack(spacing: 0) {
            if store.showWeeks {
                // Prompt 35: ukenummer i mono 800, 12,5 pt, full tekstfarge, uten bakgrunn.
                Button(action: { win.zoomTo("uke", day: KalD.key(week), origin: UnitPoint(x: 0.05, y: (CGFloat(row) + 0.5) / 6), inward: true) }) {
                    Text(String(wk)).font(MacFont.monoHeavy(12.5)).foregroundColor(t.ink)
                        .frame(width: 28).frame(maxHeight: .infinity, alignment: .top).padding(.top, 8)
                }
                .buttonStyle(.plain)
                .help("Uke " + String(wk))
            }
            ForEach(0..<7, id: \.self) { (i: Int) in
                MacMonthCell(win: win, day: KalD.add(week, i), month: month,
                             origin: UnitPoint(x: (CGFloat(i) + 0.5) / 7, y: (CGFloat(row) + 0.5) / 6))
            }
        }
        .frame(maxHeight: .infinity)
        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
    }
}

struct MacMonthCell: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared
    let day: Date
    let month: Int
    var origin: UnitPoint = .center
    @State private var hover: Bool = false

    var body: some View {
        let k: String = KalD.key(day)
        let list: [KalEvent] = store.on(k)
        let today: Bool = k == KalD.todayKey()
        let inMonth: Bool = KalD.month(day) == month
        GeometryReader { (g: GeometryProxy) in
            let maxChips: Int = MacMonthCellMath.chips(g.size.height)
            VStack(alignment: .leading, spacing: 2) {
                top(k, today: today, inMonth: inMonth)
                ForEach(Array(list.prefix(maxChips))) { (e: KalEvent) in
                    MacMonthChip(e: e) { win.openDetail(e) }
                }
                if list.count > maxChips {
                    Text("+" + String(list.count - maxChips)).font(MacFont.ui(10.5, .bold)).foregroundColor(t.mut).padding(.leading, 4)
                }
                Spacer(minLength: 0)
            }
            .padding(4)
            .frame(width: g.size.width, height: g.size.height, alignment: .topLeading)
        }
        .background(cellBg(today: today, inMonth: inMonth))
        .overlay(alignment: .leading) { Rectangle().fill(t.line2).frame(width: 1) }
        .contentShape(Rectangle())
        .onHover { (h: Bool) in hover = h }
        .onTapGesture(count: 2) { win.openNew(day: k) }
        // Prompt 35: klikk på en dag zoomer inn til Uke (uka med dagen), fra dagen.
        .onTapGesture { win.zoomTo("uke", day: k, origin: origin, inward: true) }
    }

    private func top(_ k: String, today: Bool, inMonth: Bool) -> some View {
        HStack(spacing: 4) {
            Text(String(KalD.dayOfMonth(day)))
                .font(MacFont.ui(12.5, today ? .heavy : .bold))
                .foregroundColor(numColor(today: today, inMonth: inMonth))
                .frame(minWidth: 22, minHeight: 22)
                .background(Circle().fill(today ? t.red : Color.clear))
            Spacer(minLength: 0)
            if let w = store.weather(k) {
                Image(systemName: KalWx.symbol(w.kind)).font(.system(size: 10, weight: .semibold)).foregroundColor(KalWx.color(w.kind, mut: t.mut))
                Text(String(w.hi) + "°").font(MacFont.mono(9.5)).foregroundColor(t.mut)
            }
        }
    }

    private func numColor(today: Bool, inMonth: Bool) -> Color {
        if today { return Color.white }
        if !inMonth { return t.mut2 }
        if KalD.wd(day) == 0 { return t.sunday }
        return t.ink
    }

    private func cellBg(today: Bool, inMonth: Bool) -> Color {
        if today { return t.red.opacity(0.06) }
        if hover { return t.card.opacity(0.7) }
        return inMonth ? Color.clear : t.chip.opacity(0.25)
    }
}

/// Hendelseschip i Måned.
struct MacMonthChip: View {
    @Environment(\.mk) private var t
    let e: KalEvent
    let action: () -> Void

    var body: some View {
        let c: KalCal? = KalFag37.tint(MacStore.shared.cal(e.cal), e)
        Button(action: action) {
            HStack(spacing: 4) {
                if e.allDay {
                    MacBdText41.title(e, calName: c?.name ?? "").font(MacFont.ui(11, .bold)).foregroundColor(t.calText(c)).lineLimit(1)
                } else {
                    Circle().fill(t.calColor(c)).frame(width: 6, height: 6)
                    Text(KalD.hm(e.startMin)).font(MacFont.mono(9.5)).foregroundColor(t.mut)
                    MacBdText41.title(e, calName: c?.name ?? "").font(MacFont.ui(11, .semibold)).foregroundColor(t.ink).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 5)
            .frame(height: 17)
            .background(RoundedRectangle(cornerRadius: 5).fill(e.allDay ? t.calTint(c, 0.18) : Color.clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(e.title)
    }
}

/* ---------- År ---------- */

struct MacYearView: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin

    private var year: Int { KalD.year(KalD.date(win.anchor)) }

    var body: some View {
        ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 22), count: 4), spacing: 22) {
                ForEach(1...12, id: \.self) { (m: Int) in
                    MacYearMonth(win: win, first: KalQuick.makeDate(year, m, 1) ?? Date(),
                                 origin: UnitPoint(x: (CGFloat((m - 1) % 4) + 0.5) / 4, y: (CGFloat((m - 1) / 4) + 0.5) / 3))
                }
            }
            .padding(22)
        }
    }
}

struct MacYearMonth: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    let first: Date
    var origin: UnitPoint = .center

    var body: some View {
        let isThis: Bool = KalD.year(first) == KalD.year(Date()) && KalD.month(first) == KalD.month(Date())
        VStack(alignment: .leading, spacing: 6) {
            Button(action: { win.zoomTo("mnd", day: KalD.key(first), origin: origin, inward: true) }) {
                Text(KalD.cap(KalD.months[KalD.month(first) - 1]))
                    .font(MacFont.serif(19)).foregroundColor(isThis ? t.acc : t.ink)
            }
            .buttonStyle(.plain)
            MacMiniMonth(month: first, selected: "", compact: true,
                         onPick: { (k: String) in win.go(view: "dag", day: k) },
                         onWeek: { (k: String) in win.go(view: "uke", day: k) },
                         onMove: { (_: Int) in })
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
    }
}

/* ---------- Liste (agenda, neste 6 uker) ---------- */

struct MacListView: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared

    private var days: [String] {
        let start: String = win.anchor < KalD.todayKey() ? win.anchor : KalD.todayKey()
        return (0..<42).map { (i: Int) -> String in KalD.addKey(start, i) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                MacDayCard(win: win).padding(.bottom, 12)
                ForEach(days, id: \.self) { (k: String) in
                    MacListDay(win: win, k: k)
                }
            }
            .frame(maxWidth: 820)
            .padding(.horizontal, 22)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
        }
    }
}

struct MacListDay: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared
    let k: String

    var body: some View {
        let d: Date = KalD.date(k)
        let list: [KalEvent] = store.on(k)
        let tk: String = KalD.todayKey()
        // Prompt 35: «Uken starter» og «UKE 43» i mono 800, 12 pt, full tekstfarge.
        let showWeek: Bool = KalWeek35.col(d) == 0 && k != tk
        VStack(alignment: .leading, spacing: 0) {
            if showWeek {
                Text("UKE " + String(KalWeek35.weekNo(d))).font(MacFont.monoHeavy(12)).tracking(1.2).foregroundColor(t.ink)
                    .padding(.top, 14).padding(.bottom, 4)
            }
            if !list.isEmpty || k == tk {
                HStack(alignment: .top, spacing: 16) {
                    head(d, k: k, tk: tk).frame(width: 120, alignment: .leading)
                    VStack(spacing: 2) {
                        if list.isEmpty {
                            Text("Ingen hendelser").font(MacFont.ui(13)).foregroundColor(t.mut2).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
                        }
                        ForEach(list) { (e: KalEvent) in MacListRow(e: e) { win.openDetail(e) } }
                    }
                }
                .padding(.vertical, 10)
                .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
            }
        }
    }

    private func head(_ d: Date, k: String, tk: String) -> some View {
        var name: String = KalD.cap(KalD.weekdays[KalD.wd(d)])
        if k == tk { name = "I dag" } else if k == KalD.addKey(tk, 1) { name = "I morgen" }
        let sub: String = String(KalD.dayOfMonth(d)) + ". " + KalD.months[KalD.month(d) - 1]
        return VStack(alignment: .leading, spacing: 2) {
            Text(name).font(MacFont.ui(13.5, .heavy)).foregroundColor(k == tk ? t.acc : t.ink)
            Text(sub).font(MacFont.ui(12)).foregroundColor(t.mut)
            if let w = store.weather(k) {
                HStack(spacing: 4) {
                    Image(systemName: KalWx.symbol(w.kind)).font(.system(size: 10, weight: .semibold)).foregroundColor(KalWx.color(w.kind, mut: t.mut))
                    Text(String(w.lo) + "–" + String(w.hi) + "°").font(MacFont.mono(10)).foregroundColor(t.mut)
                }
            }
        }
    }
}

struct MacListRow: View {
    @Environment(\.mk) private var t
    let e: KalEvent
    let action: () -> Void
    @State private var hover: Bool = false

    var body: some View {
        let c: KalCal? = KalFag37.tint(MacStore.shared.cal(e.cal), e)
        let time: String = e.allDay ? "Hele dagen" : KalD.hm(e.startMin) + "–" + KalD.hm(e.endMin)
        let sub: String = e.loc.isEmpty ? (c?.name ?? "") : e.loc + " · " + (c?.name ?? "")
        Button(action: action) {
            HStack(spacing: 12) {
                Text(time).font(MacFont.mono(11.5)).foregroundColor(t.mut).frame(width: 96, alignment: .leading)
                RoundedRectangle(cornerRadius: 2).fill(t.calColor(c)).frame(width: 4, height: 30)
                VStack(alignment: .leading, spacing: 1) {
                    MacBdText41.title(e, calName: c?.name ?? "").font(MacFont.ui(14, .bold)).foregroundColor(t.ink).lineLimit(1)
                    Text(sub).font(MacFont.ui(12)).foregroundColor(t.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                tag
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: 10).fill(hover ? t.card : Color.clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { (h: Bool) in hover = h }
    }

    private var tagText: String {
        if e.cont { return "FORTS." }
        if e.kind == "frist" { return "FRIST" }
        if e.kind == "bursdag" || e.cal == "b" { return "BURSDAG" }
        return ""
    }

    @ViewBuilder private var tag: some View {
        let label: String = tagText
        if !label.isEmpty {
            Text(label).font(MacFont.mono(9.5)).tracking(1).foregroundColor(label == "FRIST" ? Color.white : t.mut)
                .padding(.horizontal, 7).frame(height: 20)
                .background(Capsule().fill(label == "FRIST" ? t.red : t.chip))
        }
    }
}

/// Antall hendelser som får plass i en måneds-celle. Int(…) av et uendelig/ugyldig tall krasjer, så det sjekkes først.
enum MacMonthCellMath {
    static func chips(_ height: CGFloat) -> Int {
        let v: CGFloat = (height - 30) / 19
        if !v.isFinite { return 1 }
        return Swift.max(1, Swift.min(40, Int(v)))
    }
}
