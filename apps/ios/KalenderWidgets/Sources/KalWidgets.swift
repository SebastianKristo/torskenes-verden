import SwiftUI
import WidgetKit

/* ---------------- Prompt 33: Kalender-widgets (WidgetKit) ---------------- */
// Fasit: Kalender App.dc.html mode="home"|"lock" (platform ios) og Kalender App Oversikt.dc.html → «WIDGETS OG LÅSESKJERM».
// Medium: dato, ukedag, vær og 3 neste. Stor: måned med ukenummer, prikker og 2 neste. Liten: dato og neste hendelse.
// Låseskjerm: rektangulær (neste med tid og sted), sirkulær (ukedag + dato) og inline (dato · neste).
// Trykk på en hendelse → kalender://hendelse?id=…, på dato/måned → kalender://dag/… . Data: App Group-bufferen (KalSnapshot)
// som Kalender-appen skriver, og ellers henter widgeten selv med Kalender-appens token (KalGroup.token) hvert 15. minutt.

@main
struct KalWidgetBundle: WidgetBundle {
    var body: some Widget {
        KalHomeWidget()
        KalLockWidget()
    }
}

struct KalWEntry: TimelineEntry {
    let date: Date
    let snap: KalSnapshot
    let linked: Bool
}

/* ---------- Data ---------- */

enum KalWData {
    /// Eksempeldata for galleriet (getSnapshot i forhåndsvisning) og placeholder.
    static func sample(_ now: Date) -> KalSnapshot {
        let T: String = KalD.key(now)
        var list: [KalEvent] = []
        func ev(_ id: String, _ t: String, _ c: String, _ d: Int, _ s: Int?, _ e: Int?, _ loc: String) {
            var x: KalEvent = KalEvent(id: id, title: t, cal: c, day: KalD.addKey(T, d), s: s, e: e)
            x.loc = loc
            list.append(x)
        }
        ev("1", "Tannlege", "h", 0, 915, 960, "Tannhelse Bislett")
        ev("2", "Hent pakke", "p", 0, 1020, 1035, "Coop Mega")
        ev("3", "Kino · Dune 3", "p", 1, 1200, 1350, "Colosseum")
        ev("4", "Nina frisør", "p", 2, 870, 930, "Frisør Nina, Grünerløkka")
        ev("5", "Sebastian 12 år", "b", 3, nil, nil, "")
        var snap: KalSnapshot = KalSnapshot()
        snap.events = list
        snap.cals = KalCals.defaults
        snap.wx = [KalWxDay(day: T, kind: "delvis", hi: 9, lo: 4)]
        return snap
    }

    static func load(force: Bool) async -> KalSnapshot {
        let cached: KalSnapshot? = KalNet.loadSnapshot()
        let age: Double = Date().timeIntervalSince1970 - (cached?.updated ?? 0)
        if let c = cached, age < 600, !force { return c }
        if let fresh = await KalNet.refreshSnapshot() { return fresh }
        return cached ?? KalSnapshot()
    }

    static func upcoming(_ s: KalSnapshot, now: Date) -> [KalEvent] {
        let tk: String = KalD.key(now)
        let nm: Int = KalD.minutes(now)
        // Prompt 35: også kalendere som er skjult fra menyen.
        let hidden: Set<String> = Set(s.cals.filter { (c: KalCal) -> Bool in !c.shown }.map { (c: KalCal) -> String in c.id })
        let list: [KalEvent] = s.events.filter { (e: KalEvent) -> Bool in
            if hidden.contains(e.cal) || e.cont { return false }
            if e.day > tk { return true }
            if e.day == tk { return e.allDay || e.endMin > nm }
            return false
        }
        return list.sorted { (a: KalEvent, b: KalEvent) -> Bool in
            if a.day != b.day { return a.day < b.day }
            if a.allDay != b.allDay { return a.allDay }
            return (a.s ?? 0) < (b.s ?? 0)
        }
    }

    static func nextTimed(_ s: KalSnapshot, now: Date) -> KalEvent? {
        upcoming(s, now: now).first { (e: KalEvent) -> Bool in !e.allDay }
    }

    static func cal(_ s: KalSnapshot, _ id: String) -> KalCal? {
        s.cals.first { (c: KalCal) -> Bool in c.id == id } ?? KalCals.defaults.first { (c: KalCal) -> Bool in c.id == id }
    }

    static func wx(_ s: KalSnapshot, _ key: String) -> KalWxDay? {
        s.wx.first { (w: KalWxDay) -> Bool in w.day == key }
    }

    /// «I morgen · », «Tor. 23. okt · » eller tomt for i dag.
    static func whenPrefix(_ day: String, now: Date) -> String {
        let tk: String = KalD.key(now)
        if day == tk { return "" }
        if day == KalD.addKey(tk, 1) { return "I morgen · " }
        return KalD.dl(KalD.date(day)) + " · "
    }

    static func timeText(_ e: KalEvent) -> String {
        e.allDay ? "Hele dagen" : KalD.hm(e.startMin) + "–" + KalD.hm(e.endMin)
    }

    /// «om 25 min», «om 2 t», «i dag».
    static func inText(_ e: KalEvent, now: Date) -> String {
        if e.allDay { return "i dag" }
        let mins: Int = Int(KalD.at(e.day, e.startMin).timeIntervalSince(now) / 60)
        if mins < 60 { return "om " + String(Swift.max(1, mins)) + " min" }
        if mins < 1440 { return "om " + String(Int((Double(mins) / 60).rounded())) + " t" }
        return whenPrefix(e.day, now: now).replacingOccurrences(of: " · ", with: "")
    }

    static func eventURL(_ e: KalEvent) -> URL {
        var s: String = "kalender://hendelse?id=" + KalNet.enc(e.id) + "&date=" + e.day + "&t=" + KalNet.enc(e.title)
        if let st = e.s { s += "&s=" + KalD.hm(st) + "&e=" + KalD.hm(e.endMin) }
        return URL(string: s) ?? URL(string: "kalender://")!
    }

    static func dayURL(_ key: String) -> URL { URL(string: "kalender://dag/" + key) ?? URL(string: "kalender://")! }
    static let monthURL: URL = URL(string: "kalender://mnd")!

    /// Neste tidspunkt widgeten bør tegnes på nytt (slutten på neste hendelse eller midnatt).
    static func refreshDates(_ s: KalSnapshot, now: Date) -> [Date] {
        var out: [Date] = []
        for e in upcoming(s, now: now).prefix(6) where !e.allDay {
            let end: Date = KalD.at(e.day, e.endMin)
            if end > now && end < now.addingTimeInterval(6 * 3600) { out.append(end) }
        }
        out.append(KalD.add(KalD.cal.startOfDay(for: now), 1).addingTimeInterval(30))
        return out.sorted()
    }
}

struct KalWProvider: TimelineProvider {
    func placeholder(in context: Context) -> KalWEntry {
        KalWEntry(date: Date(), snap: KalWData.sample(Date()), linked: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (KalWEntry) -> Void) {
        // Galleriet: alltid raskt og med eksempeldata.
        if context.isPreview || KalGroup.token == nil {
            completion(KalWEntry(date: Date(), snap: KalWData.sample(Date()), linked: true))
            return
        }
        let snap: KalSnapshot = KalNet.loadSnapshot() ?? KalWData.sample(Date())
        completion(KalWEntry(date: Date(), snap: snap, linked: true))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<KalWEntry>) -> Void) {
        Task {
            // Prompt 35: «Uken starter» kan være endret i appen siden sist.
            KalWeek35.reload()
            let linked: Bool = KalGroup.token != nil
            let snap: KalSnapshot = linked ? await KalWData.load(force: false) : KalSnapshot()
            let now: Date = Date()
            var entries: [KalWEntry] = [KalWEntry(date: now, snap: snap, linked: linked)]
            for d in KalWData.refreshDates(snap, now: now) {
                entries.append(KalWEntry(date: d, snap: snap, linked: linked))
            }
            let next: Date = now.addingTimeInterval(15 * 60)
            completion(Timeline(entries: entries, policy: .after(next)))
        }
    }
}

/* ---------- Farger ---------- */

struct KalWPal {
    let bg: Color
    let ink: Color
    let mut: Color
    let line: Color
    let acc: Color
    let sunday: Color
    let dark: Bool
    /// Prompt 35: ukenummer («UKE 43») i --ink2.
    var ink2: Color { dark ? Color(kalHex: "#d6cfc2") : Color(kalHex: "#3d3a33") }

    static let light: KalWPal = KalWPal(bg: Color(kalHex: "#fffdf8"), ink: Color(kalHex: "#1b1a17"), mut: Color(kalHex: "#6b665c"),
                                        line: Color(kalHex: "#e6dfd1"), acc: Color(kalHex: "#b23a2a"), sunday: Color(kalHex: "#b23a2a"), dark: false)
    static let darkPal: KalWPal = KalWPal(bg: Color(kalHex: "#211f1b"), ink: Color(kalHex: "#efe9de"), mut: Color(kalHex: "#a49d91"),
                                          line: Color(kalHex: "#2e2b26"), acc: Color(kalHex: "#ec7a64"), sunday: Color(kalHex: "#ec7a64"), dark: true)
}

/* ---------- Hjemskjerm: liten, medium, stor ---------- */

struct KalHomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "no.kristo.kalender.home", provider: KalWProvider()) { (e: KalWEntry) in
            KalHomeWidgetView(entry: e)
        }
        .configurationDisplayName("Kalender")
        .description("Dato, vær og de neste hendelsene. Stor viser måneden.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

struct KalHomeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    let entry: KalWEntry

    private var pal: KalWPal { scheme == .dark ? KalWPal.darkPal : KalWPal.light }

    var body: some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .containerBackground(for: .widget) { pal.bg }
    }

    @ViewBuilder private var content: some View {
        if !entry.linked {
            KalWNotLinked(pal: pal)
                .widgetURL(URL(string: "kalender://"))
        } else {
            switch family {
            case .systemLarge:
                KalWLarge(entry: entry, pal: pal).widgetURL(KalWData.monthURL)
            case .systemMedium:
                KalWMedium(entry: entry, pal: pal).widgetURL(KalWData.dayURL(KalD.key(entry.date)))
            default:
                KalWSmall(entry: entry, pal: pal).widgetURL(smallURL)
            }
        }
    }

    private var smallURL: URL {
        if let n = KalWData.nextTimed(entry.snap, now: entry.date) { return KalWData.eventURL(n) }
        return KalWData.dayURL(KalD.key(entry.date))
    }
}

struct KalWNotLinked: View {
    let pal: KalWPal

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("KALENDER").font(.system(size: 10, weight: .heavy)).tracking(1).foregroundStyle(pal.acc)
            Spacer(minLength: 0)
            Text(KalGroup.linked ? "Åpne Kalender og logg inn" : "Widgeten når ikke appen").font(.system(size: 13, weight: .semibold)).foregroundStyle(pal.ink)
            Text(KalGroup.linked ? "Så vises hendelsene dine her." : "App Group mangler i signeringen.").font(.system(size: 11)).foregroundStyle(pal.mut)
        }
    }
}

/// Ukedag og dato øverst (TIRSDAG / 19 / oktober 2026).
struct KalWDateBlock: View {
    let date: Date
    let pal: KalWPal
    var big: CGFloat = 58

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(KalD.weekdays[KalD.wd(date)].uppercased()).font(KalFont.monoW(10.5)).tracking(1.2).foregroundStyle(pal.acc).lineLimit(1)
            Text(String(KalD.dayOfMonth(date))).font(KalFont.serifW(big)).foregroundStyle(pal.ink).lineLimit(1)
        }
    }
}

struct KalWSmall: View {
    let entry: KalWEntry
    let pal: KalWPal

    var body: some View {
        let n: KalEvent? = KalWData.nextTimed(entry.snap, now: entry.date)
        let c: KalCal? = n.flatMap { (e: KalEvent) -> KalCal? in KalWData.cal(entry.snap, e.cal) }
        VStack(alignment: .leading, spacing: 2) {
            Text(KalD.weekdays[KalD.wd(entry.date)].uppercased()).font(KalFont.monoW(10)).tracking(1.2).foregroundStyle(pal.acc)
            // Prompt 35: «UKE 43» rett til høyre for datoen (baseline-justert), mono 800, 11,5 pt, --ink2.
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(String(KalD.dayOfMonth(entry.date))).font(KalFont.serifW(40)).foregroundStyle(pal.ink)
                Text("UKE " + String(KalWeek35.weekNo(KalWeek35.start(entry.date)))).font(KalFont.monoHeavyW(11.5)).tracking(0.7).foregroundStyle(pal.ink2)
                    .lineLimit(1).fixedSize()
            }
            Spacer(minLength: 0)
            HStack(alignment: .top, spacing: 7) {
                RoundedRectangle(cornerRadius: 2).fill(n == nil ? pal.line : Color(kalHex: c?.hex ?? "#b23a2a")).frame(width: 4)
                VStack(alignment: .leading, spacing: 1) {
                    Text(n?.title ?? "Ingenting planlagt").font(KalFont.uiW(13, .bold)).foregroundStyle(pal.ink).lineLimit(2)
                    if let n {
                        Text(KalWData.whenPrefix(n.day, now: entry.date).replacingOccurrences(of: " · ", with: " ") + KalD.hm(n.startMin))
                            .font(KalFont.monoW(11)).foregroundStyle(pal.mut).lineLimit(1)
                    }
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct KalWMedium: View {
    let entry: KalWEntry
    let pal: KalWPal

    var body: some View {
        let up: [KalEvent] = Array(KalWData.upcoming(entry.snap, now: entry.date).prefix(3))
        let w: KalWxDay? = KalWData.wx(entry.snap, KalD.key(entry.date))
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                KalWDateBlock(date: entry.date, pal: pal)
                Text(KalD.months[KalD.month(entry.date) - 1] + " " + String(KalD.year(entry.date))).font(KalFont.uiW(12)).foregroundStyle(pal.mut)
                // Prompt 35: «UKE 43» under måned og år.
                Text("UKE " + String(KalWeek35.weekNo(KalWeek35.start(entry.date)))).font(KalFont.monoHeavyW(11.5)).tracking(0.7).foregroundStyle(pal.ink2)
                    .lineLimit(1).padding(.top, 2)
                Spacer(minLength: 0)
                if let w {
                    HStack(spacing: 4) {
                        Image(systemName: KalWx.symbol(w.kind)).font(.system(size: 13, weight: .semibold)).foregroundStyle(KalWx.color(w.kind, mut: pal.mut))
                        Text(String(w.hi) + "°").font(KalFont.monoW(12)).foregroundStyle(pal.mut)
                    }
                }
            }
            .frame(width: 104, alignment: .leading)
            VStack(alignment: .leading, spacing: 8) {
                if up.isEmpty {
                    Text("Ingenting planlagt").font(KalFont.uiW(13, .bold)).foregroundStyle(pal.mut)
                }
                ForEach(up, id: \.self) { (e: KalEvent) in
                    Link(destination: KalWData.eventURL(e)) {
                        KalWRow(e: e, snap: entry.snap, now: entry.date, pal: pal)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.leading, 14)
            .overlay(alignment: .leading) { Rectangle().fill(pal.line).frame(width: 1) }
        }
    }
}

struct KalWRow: View {
    let e: KalEvent
    let snap: KalSnapshot
    let now: Date
    let pal: KalWPal

    var body: some View {
        let c: KalCal? = KalWData.cal(snap, e.cal)
        HStack(alignment: .top, spacing: 8) {
            RoundedRectangle(cornerRadius: 2).fill(Color(kalHex: c?.hex ?? "#b23a2a")).frame(width: 4)
            VStack(alignment: .leading, spacing: 0) {
                Text(e.title).font(KalFont.uiW(13, .bold)).foregroundStyle(pal.ink).lineLimit(1)
                Text(KalWData.whenPrefix(e.day, now: now) + KalWData.timeText(e)).font(KalFont.monoW(11)).foregroundStyle(pal.mut).lineLimit(1)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

struct KalWLarge: View {
    let entry: KalWEntry
    let pal: KalWPal

    var body: some View {
        let d: Date = entry.date
        let up: [KalEvent] = Array(KalWData.upcoming(entry.snap, now: d).prefix(2))
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(KalD.cap(KalD.months[KalD.month(d) - 1])).font(KalFont.serifW(22)).foregroundStyle(pal.ink)
                Spacer()
                Text("UKE " + String(KalWeek35.weekNo(KalWeek35.start(d)))).font(KalFont.monoHeavyW(11.5)).tracking(1).foregroundStyle(pal.acc)
            }
            KalWMonthGrid(entry: entry, pal: pal)
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(up, id: \.self) { (e: KalEvent) in
                    Link(destination: KalWData.eventURL(e)) {
                        HStack(spacing: 8) {
                            Circle().fill(Color(kalHex: KalWData.cal(entry.snap, e.cal)?.hex ?? "#b23a2a")).frame(width: 8, height: 8)
                            Text(e.title).font(KalFont.uiW(13, .bold)).foregroundStyle(pal.ink).lineLimit(1)
                            Spacer(minLength: 4)
                            Text(KalWData.whenPrefix(e.day, now: d).replacingOccurrences(of: " · ", with: " ") + (e.allDay ? "Hele dagen" : KalD.hm(e.startMin)))
                                .font(KalFont.monoW(11)).foregroundStyle(pal.mut).lineLimit(1)
                        }
                    }
                }
            }
            .padding(.top, 10)
            .overlay(alignment: .top) { Rectangle().fill(pal.line).frame(height: 1) }
        }
    }
}

struct KalWMonthGrid: View {
    let entry: KalWEntry
    let pal: KalWPal

    var body: some View {
        let first: Date = KalD.firstOfMonth(entry.date)
        // Prompt 35: «Uken starter» (mandag/søndag).
        let start: Date = KalWeek35.start(first)
        let weeks: Int = KalWeek35.rows(first)
        VStack(spacing: 3) {
            HStack(spacing: 0) {
                Color.clear.frame(width: 18, height: 12)
                ForEach(0..<7, id: \.self) { (i: Int) in
                    Text(KalWeek35.letters[i]).font(KalFont.uiW(10, .bold)).foregroundStyle(KalWeek35.isSunday(i) ? pal.sunday : pal.mut).frame(maxWidth: .infinity)
                }
            }
            ForEach(0..<weeks, id: \.self) { (w: Int) in
                KalWWeekRow(entry: entry, pal: pal, start: KalD.add(start, w * 7), month: KalD.month(first))
            }
        }
    }
}

struct KalWWeekRow: View {
    let entry: KalWEntry
    let pal: KalWPal
    let start: Date
    let month: Int

    var body: some View {
        HStack(spacing: 0) {
            Text(String(KalWeek35.weekNo(start))).font(KalFont.monoHeavyW(10)).foregroundStyle(pal.ink2).frame(width: 18)
            ForEach(0..<7, id: \.self) { (i: Int) in
                KalWDayCell(entry: entry, pal: pal, day: KalD.add(start, i), month: month, sunday: KalWeek35.isSunday(i))
            }
        }
    }
}

struct KalWDayCell: View {
    let entry: KalWEntry
    let pal: KalWPal
    let day: Date
    let month: Int
    let sunday: Bool

    var body: some View {
        let k: String = KalD.key(day)
        let inMonth: Bool = KalD.month(day) == month
        let today: Bool = k == KalD.key(entry.date)
        let first: KalEvent? = entry.snap.events.first { (e: KalEvent) -> Bool in e.day == k }
        let dot: Color = (inMonth && first != nil) ? Color(kalHex: KalWData.cal(entry.snap, first?.cal ?? "p")?.hex ?? "#b23a2a") : Color.clear
        VStack(spacing: 1) {
            Text(inMonth ? String(KalD.dayOfMonth(day)) : "").font(KalFont.uiW(11, .bold))
                .foregroundStyle(today ? Color.white : (sunday ? pal.sunday : pal.ink))
                .frame(width: 22, height: 20)
                .background(Capsule().fill(today ? Color(kalHex: "#b23a2a") : Color.clear))
            Circle().fill(dot).frame(width: 4, height: 4)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 26)
    }
}

/* ---------- Låseskjerm ---------- */

struct KalLockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "no.kristo.kalender.lock", provider: KalWProvider()) { (e: KalWEntry) in
            KalLockWidgetView(entry: e)
        }
        .configurationDisplayName("Kalender · låseskjerm")
        .description("Neste hendelse med tid og sted, ukedag og dato, eller dato · neste over klokken.")
        .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

struct KalLockWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: KalWEntry

    var body: some View {
        let n: KalEvent? = KalWData.nextTimed(entry.snap, now: entry.date)
        Group {
            switch family {
            case .accessoryCircular: circular
            case .accessoryInline: inline(n)
            default: rectangular(n)
            }
        }
        .widgetURL(n.map { (e: KalEvent) -> URL in KalWData.eventURL(e) } ?? KalWData.dayURL(KalD.key(entry.date)))
        .containerBackground(for: .widget) { Color.clear }
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Text(KalD.weekdaysShort[KalD.wd(entry.date)].uppercased()).font(.system(size: 10, weight: .bold)).tracking(0.8)
                Text(String(KalD.dayOfMonth(entry.date))).font(KalFont.serifW(26))
            }
        }
        .widgetAccentable()
    }

    private func inline(_ n: KalEvent?) -> some View {
        let date: String = KalD.cap(KalD.weekdaysShort[KalD.wd(entry.date)]) + " " + String(KalD.dayOfMonth(entry.date)) + "."
        let next: String = n.map { (e: KalEvent) -> String in e.title + " " + KalD.hm(e.startMin) } ?? "Ingen hendelser"
        return Label(date + " · " + next, systemImage: "calendar")
    }

    private func rectangular(_ n: KalEvent?) -> some View {
        // Prompt 35: «Man 19. okt · U43» i første linje.
        let d: Date = entry.date
        let wdName: String = KalD.cap(KalD.weekdaysShort[KalD.wd(d)])
        let dateText: String = String(KalD.dayOfMonth(d)) + ". " + KalD.monthsShort[KalD.month(d) - 1]
        let head: String = wdName + " " + dateText + " · U" + String(KalWeek35.weekNo(KalWeek35.start(d)))
        return VStack(alignment: .leading, spacing: 1) {
            Text(head).font(.system(size: 12, weight: .heavy)).opacity(0.8).lineLimit(1)
            if let n {
                Text(n.title).font(.system(size: 15, weight: .bold)).lineLimit(1).widgetAccentable()
                let place: String = n.loc.isEmpty ? (KalWData.cal(entry.snap, n.cal)?.name ?? "") : n.loc
                Text(KalWData.whenPrefix(n.day, now: d) + KalWData.timeText(n) + (place.isEmpty ? "" : " · " + place))
                    .font(.system(size: 12)).opacity(0.8).lineLimit(1)
            } else {
                Text("Ingenting planlagt").font(.system(size: 15, weight: .bold)).widgetAccentable()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/* ---------- Fonter (registrert via UIAppFonts i utvidelsen) ---------- */

enum KalFont {
    static func serifW(_ size: CGFloat) -> Font { .custom("Newsreader-Medium", size: size) }
    static func monoW(_ size: CGFloat) -> Font { .custom("IBMPlexMono-SemiBold", size: size) }
    /// Prompt 35: mono 800 for ukenummer.
    static func monoHeavyW(_ size: CGFloat) -> Font { .system(size: size, weight: .heavy, design: .monospaced) }

    static func uiW(_ size: CGFloat, _ w: Font.Weight = .regular) -> Font {
        switch w {
        case .bold: return .custom("Manrope-Bold", size: size)
        case .semibold: return .custom("Manrope-SemiBold", size: size)
        default: return .custom("Manrope-Medium", size: size)
        }
    }
}
