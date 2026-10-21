import SwiftUI

/* ---------------- Prompt 33: Kalender – Måned og År ---------------- */
// Måned: ukenummer-kolonne (U), rød søndag, i dag med rød sirkel og svak rødtone, opptil 3 chips per dag og «+N»,
// lite vær-ikon for dagene med prognose. Trykk på en dag åpner Dag. År: 12 minimåneder (3×4), trykk åpner måneden.

struct KalMonthView: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    var body: some View {
        let A: Date = KalD.date(s.anchor)
        let first: Date = KalD.firstOfMonth(A)
        // Prompt 35: «Uken starter» (mandag/søndag).
        let start: Date = KalWeek35.start(first)
        let weeks: Int = KalWeek35.rows(first)
        let month: Int = KalD.month(first)
        VStack(spacing: 0) {
            letters
            ForEach(0..<weeks, id: \.self) { (w: Int) in
                KalMonthWeek(start: KalD.add(start, w * 7), month: month, showWeek: s.showWeeks, row: w, rows: weeks)
                    .frame(minHeight: 0, maxHeight: .infinity)
                    .clipped()
            }
        }
        .padding(.horizontal, 6)
        .padding(.bottom, 4)
    }

    private var letters: some View {
        HStack(spacing: 0) {
            if s.showWeeks {
                Text("U").font(KalFont.monoHeavy(10.5)).foregroundStyle(t.ink).frame(width: 26)
            }
            ForEach(0..<7, id: \.self) { (i: Int) in
                Text(KalWeek35.letters[i]).font(KalFont.ui(11, .bold))
                    .foregroundStyle(KalWeek35.isSunday(i) ? t.sunday : t.mut)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.bottom, 5)
    }
}

struct KalMonthWeek: View {
    @Environment(\.kal) private var t
    let start: Date
    let month: Int
    let showWeek: Bool
    var row: Int = 0
    var rows: Int = 5

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            if showWeek {
                // Prompt 35: ukenummeret i IBM Plex Mono 800, full tekstfarge, 12,5 pt, uten bakgrunn, kolonne 26 pt.
                Text(String(KalWeek35.weekNo(start))).font(KalFont.monoHeavy(12.5)).foregroundStyle(t.ink)
                    .frame(width: 26).padding(.top, 6)
                    .accessibilityLabel("Uke " + String(KalWeek35.weekNo(start)))
            }
            ForEach(0..<7, id: \.self) { (i: Int) in
                KalMonthDay(day: KalD.add(start, i), month: month, sunday: KalWeek35.isSunday(i),
                            origin: UnitPoint(x: (CGFloat(i) + 0.5) / 7, y: (CGFloat(row) + 0.5) / CGFloat(Swift.max(1, rows))))
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(t.line).frame(height: 1) }
    }
}

struct KalMonthDay: View {
    @Environment(\.kal) private var t
    /// Prompt 43: «Full skjerm» på iPad – trykk på en dag oppdaterer dagspanelet til høyre (ingen navigering).
    @Environment(\.kalFull43) private var full43
    @MainActor private var s: KalStore { KalStore.shared }
    let day: Date
    let month: Int
    let sunday: Bool
    var origin: UnitPoint = .center

    // Delt opp (Xcode 16 klarte ikke å typesjekke én stor body).
    private var key: String { KalD.key(day) }
    private var inMonth: Bool { KalD.month(day) == month }
    private var today: Bool { key == KalD.todayKey() }

    var body: some View {
        let k: String = key
        // Prompt 42: tre eller flere trekk samme dag blir én chip «3 trekk · 627 kr».
        let list: [KalEvent] = KalAb42.collapse(s.on(k))
        let label: String = KalD.fd(day) + ", " + String(list.count) + " hendelser"
        return Button(action: tap) { cell(list) }
            .buttonStyle(.plain)
            .clipped()
            // Prompt 42 (iPad): hover med pekeplate, og tekst/e-post/SMS sluppet på dagen tolkes av Glimt til en hendelse den dagen.
            .hoverEffect(.highlight)
            .dropDestination(for: String.self) { (items: [String], _: CGPoint) -> Bool in KalPad42Drop.drop(items, day: k) }
            .accessibilityLabel(label)
    }

    /// Prompt 35: trykk på en dag zoomer inn til Uke (uka med dagen), og den vokser fra dagen. Full skjerm (43): velg dagen.
    private func tap() {
        let k: String = key
        if full43 {
            KalHaptic.tap()
            if s.anchor != k { s.anchor = k }
        } else {
            s.zoomTo("uke", day: k, origin: origin, inward: true)
        }
    }

    private func cell(_ list: [KalEvent]) -> some View {
        let mx: Int = 3
        let cut: Int = list.count > mx ? mx - 1 : mx
        let bg: Color = today ? t.red.opacity(0.06) : Color.clear
        return VStack(alignment: .leading, spacing: 2) {
            topRow
            ForEach(list.prefix(cut)) { (e: KalEvent) in KalMonthChip(e: e) }
            if list.count > mx {
                Text("+" + String(list.count - cut)).font(KalFont.ui(9.5, .bold)).foregroundStyle(t.mut).padding(.horizontal, 4)
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 3).padding(.horizontal, 2).padding(.bottom, 2)
        .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity, alignment: .topLeading)
        .background(bg)
        .opacity(inMonth ? 1 : 0.38)
        .contentShape(Rectangle())
    }

    private var topRow: some View {
        let wx: KalWxDay? = inMonth ? s.weather(key) : nil
        return HStack(spacing: 2) {
            dayNumber
            Spacer(minLength: 0)
            if let wx {
                Image(systemName: KalWx.symbol(wx.kind)).font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(KalWx.color(wx.kind, mut: t.mut))
            }
        }
        .padding(.horizontal, 1)
    }

    private var dayNumber: some View {
        let picked: Bool = full43 && key == s.anchor && !today
        let fg: Color = today ? Color.white : (sunday ? t.sunday : t.ink)
        let fill: Color = today ? t.red : Color.clear
        let ring: Color = picked ? t.ink : Color.clear
        return Text(String(KalD.dayOfMonth(day))).font(KalFont.ui(12, .bold))
            .foregroundStyle(fg)
            .frame(width: 22, height: 22)
            .background(Circle().fill(fill))
            .overlay(Circle().strokeBorder(ring, lineWidth: 1.5))
    }
}

struct KalMonthChip: View {
    @Environment(\.kal) private var t
    let e: KalEvent

    var body: some View {
        let c: KalCal? = KalFag37.tint(KalStore.shared.cal(e.cal), e)
        HStack(spacing: 3) {
            // Prompt 42: trekk fra Abonnementer – logo (12 pt) + navn.
            if KalAb42.isSub(e) && (e.ab42?.sum ?? 0) == 0 {
                KalAbLogo42(e: e, size: 12)
                Text(KalAb42.short(e)).font(KalFont.ui(9.5, .bold)).lineLimit(1)
            } else {
                KalBdText41.title(e, calName: c?.name ?? "").font(KalFont.ui(9.5, .bold)).lineLimit(1)
            }
        }
            .foregroundStyle(t.calText(c))
            .padding(.horizontal, 4).padding(.vertical, 1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 4).fill(t.calTint(c, e.kind == "frist" ? 0.38 : 0.13)))
    }
}

/* ---------- År ---------- */

struct KalYearView: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }

    var body: some View {
        let y: Int = KalD.year(KalD.date(s.anchor))
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 16) {
                ForEach(1...12, id: \.self) { (m: Int) in
                    KalMiniMonth(year: y, month: m,
                                 origin: UnitPoint(x: (CGFloat((m - 1) % 3) + 0.5) / 3, y: (CGFloat((m - 1) / 3) + 0.5) / 4))
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 2)
            .padding(.bottom, 12)
        }
        .scrollIndicators(.hidden)
    }
}

struct KalMiniMonth: View {
    @Environment(\.kal) private var t
    let year: Int
    let month: Int
    var origin: UnitPoint = .center

    var body: some View {
        let first: Date = KalQuick.makeDate(year, month, 1) ?? Date()
        let off: Int = KalWeek35.col(first)
        let dim: Int = KalD.daysInMonth(first)
        let T: Date = KalD.today()
        let current: Bool = KalD.year(T) == year && KalD.month(T) == month
        Button(action: { KalStore.shared.zoomTo("mnd", day: KalD.key(first), origin: origin, inward: true) }) {
            VStack(alignment: .leading, spacing: 5) {
                Text(KalD.cap(KalD.months[month - 1])).font(KalFont.serif(17)).foregroundStyle(current ? t.red : t.ink)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 2) {
                    ForEach(0..<(off + dim), id: \.self) { (i: Int) in
                        KalMiniDay(n: i < off ? 0 : i - off + 1, year: year, month: month)
                    }
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(KalD.cap(KalD.months[month - 1]) + " " + String(year))
    }
}

struct KalMiniDay: View {
    @Environment(\.kal) private var t
    let n: Int
    let year: Int
    let month: Int

    var body: some View {
        if n == 0 {
            Color.clear.frame(height: 15)
        } else {
            let d: Date = KalQuick.makeDate(year, month, n) ?? Date()
            let today: Bool = KalD.key(d) == KalD.todayKey()
            let sunday: Bool = KalD.wd(d) == 0
            Text(String(n)).font(KalFont.ui(8.5, .semibold))
                .foregroundStyle(today ? Color.white : (sunday ? t.sunday : t.ink))
                .frame(maxWidth: .infinity)
                .frame(height: 15)
                .background(Capsule().fill(today ? t.red : Color.clear))
        }
    }
}
