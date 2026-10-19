import SwiftUI

/* ---------------- Prompt 34: Kalender for Mac – sidemenyen (aside i Kalender.dc.html variant web) ---------------- */
// Minikalender med ukenummer, KALENDERE med hake og antall de neste 30 dagene, «Administrer kalendere ›», Glimt · dagen din
// og hurtigtastene nederst.

struct MacSidebar: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                MacMiniMonth(month: win.miniMonth, selected: win.anchor, compact: false,
                             onPick: { (k: String) in win.goTo(KalD.date(k)) },
                             onWeek: { (k: String) in win.go(view: "uke", day: k) },
                             onMove: { (n: Int) in win.miniMonth = KalD.addMonths(win.miniMonth, n) })
                calendars
                MacDayCard(win: win)
                Text("Hurtigtaster: ← → bla · T i dag · D dag · 3 tre dager · W uke · M måned · Y år · L liste · N ny · / søk · ⌘K Glimt")
                    .font(MacFont.ui(11)).foregroundColor(t.mut2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
        }
        .background(t.bg)
    }

    /// Prompt 35: kalenderne med farge, skjul fra menyen og «+ Legg til kalender».
    private var calendars: some View {
        MacCalendars35(win: win)
    }
}

struct MacCalRow: View {
    @Environment(\.mk) private var t
    let cal: KalCal
    let toggle: () -> Void
    @State private var hover: Bool = false

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 5).fill(cal.on ? t.calColor(cal) : Color.clear)
                    RoundedRectangle(cornerRadius: 5).strokeBorder(t.calColor(cal), lineWidth: 1.5)
                    if cal.on { Text("✓").font(.system(size: 10, weight: .heavy)).foregroundColor(Color.white) }
                }
                .frame(width: 18, height: 18)
                Text(cal.name).font(MacFont.ui(13.5, .semibold)).foregroundColor(t.ink).lineLimit(1)
                Spacer(minLength: 4)
                if cal.count > 0 { Text(String(cal.count)).font(MacFont.mono(10.5)).foregroundColor(t.mut2) }
            }
            .padding(.horizontal, 8)
            .frame(height: 32)
            .background(RoundedRectangle(cornerRadius: 10).fill(hover ? t.card : Color.clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { (h: Bool) in hover = h }
        .accessibilityLabel(cal.name + (cal.on ? ", vises" : ", skjult"))
    }
}

/// Minimåned (sidemenyen og menylinja). Ukenummer-kolonne, søndag i rødt, i dag med rød sirkel, prikk for dager med hendelser.
struct MacMiniMonth: View {
    @Environment(\.mk) private var t
    @ObservedObject var store: MacStore = MacStore.shared
    let month: Date
    let selected: String
    let compact: Bool
    let onPick: (String) -> Void
    let onWeek: (String) -> Void
    let onMove: (Int) -> Void

    private var first: Date { KalD.firstOfMonth(month) }

    var body: some View {
        VStack(spacing: 6) {
            if !compact { header }
            grid
        }
    }

    private var header: some View {
        HStack(spacing: 4) {
            Text(KalD.cap(KalD.months[KalD.month(first) - 1]) + " " + String(KalD.year(first)))
                .font(MacFont.serif(18)).foregroundColor(t.ink)
            Spacer()
            MacIconButton(symbol: "chevron.left", label: "Forrige måned", bordered: false) { onMove(-1) }
            MacIconButton(symbol: "chevron.right", label: "Neste måned", bordered: false) { onMove(1) }
        }
    }

    private var weeks: [Date] {
        // Prompt 35: «Uken starter».
        let start: Date = KalWeek35.start(first)
        let lead: Int = KalWeek35.col(first)
        let n: Int = Int(ceil(Double(lead + KalD.daysInMonth(first)) / 7.0))
        return (0..<n).map { (i: Int) -> Date in KalD.add(start, i * 7) }
    }

    private var grid: some View {
        VStack(spacing: 1) {
            HStack(spacing: 0) {
                if store.showWeeks { Text("U").font(MacFont.monoHeavy(9.5)).foregroundColor(t.ink).frame(width: 22) }
                ForEach(0..<7, id: \.self) { (i: Int) in
                    Text(KalWeek35.letters[i]).font(MacFont.ui(10, .bold))
                        .foregroundColor(KalWeek35.isSunday(i) ? t.sunday : t.mut)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 18)
            ForEach(weeks, id: \.self) { (w: Date) in
                weekRow(w)
            }
        }
    }

    private func weekRow(_ w: Date) -> some View {
        HStack(spacing: 0) {
            if store.showWeeks {
                Button(action: { onWeek(KalD.key(w)) }) {
                    Text(String(KalWeek35.weekNo(w))).font(MacFont.monoHeavy(10.5)).foregroundColor(t.ink).frame(width: 22, height: 26)
                }
                .buttonStyle(.plain)
                .help("Uke " + String(KalWeek35.weekNo(w)))
            }
            ForEach(0..<7, id: \.self) { (i: Int) in
                MacMiniDay(day: KalD.add(w, i), month: KalD.month(first), selected: selected, onPick: onPick)
                    .frame(maxWidth: .infinity)
            }
        }
    }
}

struct MacMiniDay: View {
    @Environment(\.mk) private var t
    @ObservedObject var store: MacStore = MacStore.shared
    let day: Date
    let month: Int
    let selected: String
    let onPick: (String) -> Void

    var body: some View {
        let k: String = KalD.key(day)
        let today: Bool = k == KalD.todayKey()
        let inMonth: Bool = KalD.month(day) == month
        let sel: Bool = k == selected && !today
        let has: Bool = !store.on(k).isEmpty
        Button(action: { onPick(k) }) {
            VStack(spacing: 1) {
                Text(String(KalD.dayOfMonth(day)))
                    .font(MacFont.ui(11.5, today ? .heavy : .semibold))
                    .foregroundColor(color(today: today, inMonth: inMonth))
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(today ? t.red : Color.clear))
                    .overlay(Circle().strokeBorder(sel ? t.ink : Color.clear, lineWidth: 1.2))
                Circle().fill(has && inMonth ? t.mut2 : Color.clear).frame(width: 3, height: 3)
            }
            .frame(height: 26)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func color(today: Bool, inMonth: Bool) -> Color {
        if today { return Color.white }
        if !inMonth { return t.mut2.opacity(0.6) }
        if KalD.wd(day) == 0 { return t.sunday }
        return t.ink
    }
}

/// «Glimt · dagen din» – trykk åpner Glimt.
struct MacDayCard: View {
    @Environment(\.mk) private var t
    @ObservedObject var win: MacWin
    @ObservedObject var store: MacStore = MacStore.shared

    var body: some View {
        Button(action: { win.glimtOpen = true }) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    MacSpark(size: 16)
                    MacLabel(text: "GLIMT · DAGEN DIN", color: t.acc)
                }
                Text(store.daySummary).font(MacFont.ui(12.5)).foregroundColor(t.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14).fill(t.card))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Ny kalender (navn + farge). POST /api/kalender/calendars, eller lokalt når serveren ikke har kalender-API-et.
struct MacNewCalendarSheet: View {
    @Environment(\.mk) private var t
    @Binding var open: Bool
    @State private var name: String = ""
    @State private var hex: String = KalCals.palette[0]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Ny kalender").font(MacFont.serif(24)).foregroundColor(t.ink)
            TextField("Navn", text: $name).textFieldStyle(.roundedBorder).font(MacFont.ui(14))
            HStack(spacing: 8) {
                ForEach(KalCals.palette, id: \.self) { (h: String) in
                    Button(action: { hex = h }) {
                        Circle().fill(Color(kalHex: h)).frame(width: 22, height: 22)
                            .overlay(Circle().strokeBorder(t.ink, lineWidth: hex == h ? 2 : 0).padding(-3))
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack {
                Spacer()
                Button("Avbryt") { open = false }.keyboardShortcut(.cancelAction)
                Button("Legg til") {
                    let n: String = name
                    let h: String = hex
                    open = false
                    Task { await MacStore.shared.addCalendar(name: n, hex: h) }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(22)
        .frame(width: 400)
        .background(t.bg)
    }
}
