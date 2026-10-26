import SwiftUI
import WidgetKit
import os

/* ---------------- Prompt 33: Kalender-widgets (WidgetKit) ---------------- */
// Fasit: Kalender App.dc.html mode="home"|"lock" (platform ios) og Kalender App Oversikt.dc.html → «WIDGETS OG LÅSESKJERM».
// Medium: dato, ukedag, vær og 3 neste. Stor: måned med ukenummer, prikker og 2 neste. Liten: dato og neste hendelse.
// Låseskjerm: rektangulær (neste med tid og sted), sirkulær (ukedag + dato) og inline (dato · neste).
// Trykk på en hendelse → kalender://hendelse?id=…, på dato/måned → kalender://dag/… . Data: App Group-bufferen (KalSnapshot)
// som Kalender-appen skriver, og ellers henter widgeten selv med Kalender-appens token (KalGroup.token) hvert 15. minutt.

// Prompt 41: samme fil bygges også for macOS (KalenderMacWidgets, macOS 14+ skrivebord og Varslingssenter).
// #if os(macOS) bare for størrelser (ekstra stor), farger («apper foran» = accented/vibrant) og tekster; ingen låseskjerm på Mac.
#if os(iOS)
@main
struct KalWidgetBundle: WidgetBundle {
    var body: some Widget {
        KalHomeWidget()
        KalLockWidget()
    }
}
#else
@main
struct KalWidgetBundle: WidgetBundle {
    var body: some Widget {
        KalHomeWidget()
    }
}
#endif

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
        ev("1", "Tannlege", "p", 0, 915, 960, "Tannhelse Bislett")
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

    /// Prompt 43: widgeten hang / viste bare plassholder. Tidslinjen ventet på nettet (kalendere, hendelser, vær – opptil
    /// 15–25 s per kall og per adresse) hver gang bufferen var eldre enn 10 min, og WidgetKit gir opp lenge før det.
    /// Nå: appen skriver bufferen og ber om ny tidslinje ved endring, så widgeten bruker bufferen (opptil 6 t gammel).
    /// Bare når den mangler eller er eldre, hentes det selv – med tidsgrense 5 s, ellers forrige data.
    static let maxAge43: Double = 6 * 3600

    static func load(force: Bool) async -> KalSnapshot {
        let cached: KalSnapshot? = KalNet.loadSnapshot()
        let age: Double = Date().timeIntervalSince1970 - (cached?.updated ?? 0)
        if let c = cached, age < maxAge43, !force { return c }
        if let fresh = await fresh43(seconds: 5) { return fresh }
        return cached ?? KalSnapshot()
    }

    /// Henter selv, men gir opp etter `seconds` (nettkallene avbrytes).
    static func fresh43(seconds: Double) async -> KalSnapshot? {
        await withTaskGroup(of: KalSnapshot?.self) { g in
            g.addTask { await KalNet.refreshSnapshot() }
            g.addTask {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                return nil
            }
            let first: KalSnapshot? = await g.next() ?? nil
            g.cancelAll()
            return first
        }
    }

    static func upcoming(_ s: KalSnapshot, now: Date) -> [KalEvent] {
        let tk: String = KalD.key(now)
        let nm: Int = KalD.minutes(now)
        // Prompt 35: også kalendere som er skjult fra menyen.
        var hidden: Set<String> = Set(s.cals.filter { (c: KalCal) -> Bool in !c.shown }.map { (c: KalCal) -> String in c.id })
        // Prompt 70: Innstillinger → Widgets (kalendere som tas med, «Skjul fullførte i dag»).
        hidden.formUnion(KalWPrefs70.off)
        let hideDone: Bool = KalWPrefs70.hideDone
        let list: [KalEvent] = s.events.filter { (e: KalEvent) -> Bool in
            if hidden.contains(e.cal) || e.cont { return false }
            if e.day > tk { return true }
            if e.day == tk { return e.allDay || !hideDone || e.endMin > nm }
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

    /// Prompt 37: Studie-hendelser får fagfargen (samme som i appen, fra App Group).
    static func evCal(_ s: KalSnapshot, _ e: KalEvent) -> KalCal? {
        KalFag37.tint(cal(s, e.cal), e)
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
    /// Prompt 41: kalender://mnd/2026-10 (samme lenker på iOS og Mac).
    static func monthURL41(_ d: Date) -> URL {
        URL(string: "kalender://mnd/" + String(KalD.year(d)) + "-" + KalD.pad(KalD.month(d)) + "?date=" + KalD.key(KalD.firstOfMonth(d))) ?? monthURL
    }
    /// Prompt 41: «Ny hendelse» i stor og ekstra stor åpner skrivefeltet i appen.
    static let newURL: URL = URL(string: "kalender://ny")!

    /// Neste tidspunkter widgeten bør tegnes på nytt (start og slutt på de neste hendelsene og midnatt).
    static func refreshDates(_ s: KalSnapshot, now: Date) -> [Date] {
        // Prompt 70: også ved hver start (pågående → neste), ikke bare slutt.
        var out: [Date] = []
        let limit: Date = now.addingTimeInterval(8 * 3600)
        for e in upcoming(s, now: now).prefix(8) where !e.allDay {
            let start: Date = KalD.at(e.day, e.startMin)
            let end: Date = KalD.at(e.day, e.endMin)
            if start > now && start < limit { out.append(start) }
            if end > now && end < limit { out.append(end) }
        }
        out.append(KalD.add(KalD.cal.startOfDay(for: now), 1).addingTimeInterval(30))
        return Array(Set(out)).sorted()
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
        // Prompt 43: completion kalles alltid – også om noe henger (reserve etter 8 s med bufferen).
        let once: KalWOnce43 = KalWOnce43(completion)
        Logger(subsystem: "no.kristo.kalender.widgets", category: "timeline").debug("getTimeline")
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 8) {
            once.call(KalWProvider.timeline(KalNet.loadSnapshot() ?? KalSnapshot(), linked: KalGroup.token != nil))
        }
        Task {
            // Prompt 35: «Uken starter» kan være endret i appen siden sist.
            KalWeek35.reload()
            let linked: Bool = KalGroup.token != nil
            let snap: KalSnapshot = linked ? await KalWData.load(force: false) : KalSnapshot()
            once.call(KalWProvider.timeline(snap, linked: linked))
        }
    }

    static func timeline(_ snap: KalSnapshot, linked: Bool) -> Timeline<KalWEntry> {
        let now: Date = Date()
        var entries: [KalWEntry] = [KalWEntry(date: now, snap: snap, linked: linked)]
        for d in KalWData.refreshDates(snap, now: now) {
            entries.append(KalWEntry(date: d, snap: snap, linked: linked))
        }
        let next: Date = now.addingTimeInterval(15 * 60)
        return Timeline(entries: entries, policy: .after(next))
    }
}

/// Prompt 43: kaller completion nøyaktig én gang (WidgetKit krever svar; to svar er en feil).
final class KalWOnce43: @unchecked Sendable {
    private let lock: NSLock = NSLock()
    private var done: Bool = false
    private let completion: (Timeline<KalWEntry>) -> Void

    init(_ completion: @escaping (Timeline<KalWEntry>) -> Void) {
        self.completion = completion
    }

    func call(_ t: Timeline<KalWEntry>) {
        lock.lock()
        if done {
            lock.unlock()
            return
        }
        done = true
        lock.unlock()
        completion(t)
    }
}

/* ---------- Farger ---------- */

// Prompt 70: fasit Kalender Widgets.dc.html (iPhone): hvit flate, systemfont, grå sekundærtekst (#8a8a8e), rød ukedag og
// i dag-sirkel (#b23a2a), + i lys grå sirkel (#f2f2f7). Mørk modus: systemets mørke widgetflate.
struct KalWPal {
    let bg: Color
    let ink: Color
    let mut: Color
    let line: Color
    let acc: Color
    let sunday: Color
    let plus: Color
    let dark: Bool
    /// Ukenummer («UKE 44») – grått som i fasiten.
    var ink2: Color { mut }

    static let light: KalWPal = KalWPal(bg: Color(kalHex: "#ffffff"), ink: Color(kalHex: "#1b1a17"), mut: Color(kalHex: "#8a8a8e"),
                                        line: Color(kalHex: "#ececf0"), acc: Color(kalHex: "#b23a2a"), sunday: Color(kalHex: "#b23a2a"),
                                        plus: Color(kalHex: "#f2f2f7"), dark: false)
    static let darkPal: KalWPal = KalWPal(bg: Color(kalHex: "#1c1c1e"), ink: Color(kalHex: "#ffffff"), mut: Color(kalHex: "#8e8e93"),
                                          line: Color(kalHex: "#38383a"), acc: Color(kalHex: "#ff6a55"), sunday: Color(kalHex: "#ff6a55"),
                                          plus: Color(kalHex: "#2c2c2e"), dark: true)
}

/* ---------- Hjemskjerm: liten, medium, stor ---------- */

struct KalHomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "no.kristo.kalender.home", provider: KalWProvider()) { (e: KalWEntry) in
            KalHomeWidgetView(entry: e)
        }
        .configurationDisplayName("Kalender")
        .description("Dato, uke og de neste hendelsene i kalenderfargene. Stor viser måneden.")
        .supportedFamilies(KalHomeWidget.families)
        .contentMarginsDisabled()
    }
}

extension KalHomeWidget {
    /// Prompt 41: ekstra stor på Mac. Prompt 42: og på iPad-hjemskjermen (systemExtraLarge finnes bare på iPad, iPhone ignorerer den).
    static var families: [WidgetFamily] {
        return [.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge]
    }
}

struct KalHomeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    /// Prompt 41: «apper foran» på Mac og tonet Hjem-skjerm / StandBy på iOS = accented/vibrant → systemets bakgrunn.
    @Environment(\.widgetRenderingMode) private var mode
    let entry: KalWEntry

    private var tinted: Bool { mode != .fullColor }
    private var pal: KalWPal { scheme == .dark ? KalWPal.darkPal : KalWPal.light }

    /// Prompt 70: 14 pt i liten, 14/16 pt i de andre (fasiten).
    private var pad: EdgeInsets {
        if family == .systemSmall { return EdgeInsets(top: 14, leading: 14, bottom: 14, trailing: 14) }
        return EdgeInsets(top: 14, leading: 16, bottom: 16, trailing: 16)
    }

    @ViewBuilder var body: some View {
        if tinted {
            content
                .padding(pad)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .containerBackground(.fill.tertiary, for: .widget)
        } else {
            content
                .padding(pad)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .containerBackground(for: .widget) { pal.bg }
        }
    }

    @ViewBuilder private var content: some View {
        if !entry.linked {
            KalWNotLinked(pal: pal)
                .widgetURL(URL(string: "kalender://"))
        } else {
            switch family {
            case .systemExtraLarge:
                KalWExtraLarge41(entry: entry, pal: pal).widgetURL(KalWData.monthURL41(entry.date))
            case .systemLarge:
                KalWLarge(entry: entry, pal: pal).widgetURL(KalWData.dayURL(KalD.key(entry.date)))
            case .systemMedium:
                KalWMedium(entry: entry, pal: pal).widgetURL(KalWData.dayURL(KalD.key(entry.date)))
            default:
                KalWSmall(entry: entry, pal: pal).widgetURL(smallURL)
            }
        }
    }

    private var smallURL: URL {
        let tk: String = KalD.key(entry.date)
        if let n = KalWData.upcoming(entry.snap, now: entry.date).first, n.day == tk { return KalWData.eventURL(n) }
        return KalWData.dayURL(tk)
    }
}

struct KalWNotLinked: View {
    let pal: KalWPal

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("KALENDER").font(.system(size: 11, weight: .bold)).tracking(0.5).foregroundStyle(pal.acc)
            Spacer(minLength: 0)
            Text(KalGroup.linked ? "Åpne Kalender og logg inn" : "Widgeten når ikke appen").font(.system(size: 13, weight: .semibold)).foregroundStyle(pal.ink)
            #if os(macOS)
            Text(KalGroup.linked ? "Så vises hendelsene dine her." : "Krever signering med Team ID (App Group group.no.kristo.kalender).")
                .font(.system(size: 11)).foregroundStyle(pal.mut)
            #else
            Text(KalGroup.linked ? "Så vises hendelsene dine her." : "App Group mangler i signeringen.").font(.system(size: 11)).foregroundStyle(pal.mut)
            #endif
        }
    }
}

/// Ukedag (rød, store bokstaver) og stor dato i tynn systemfont («MANDAG / 26»).
struct KalWDateBlock: View {
    let date: Date
    let pal: KalWPal
    var big: CGFloat = 44

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(KalD.weekdays[KalD.wd(date)].uppercased()).font(.system(size: 11, weight: .bold)).tracking(0.44)
                .foregroundStyle(pal.acc).lineLimit(1)
            Text(String(KalD.dayOfMonth(date))).font(.system(size: big, weight: .light)).tracking(-0.02 * big)
                .foregroundStyle(pal.ink).lineLimit(1)
                .widgetAccentable()
        }
    }
}

/// Fargestreken foran en hendelse (3,5 pt, kalenderfargen).
struct KalWStripe70: View {
    let hex: String

    var body: some View {
        RoundedRectangle(cornerRadius: 2).fill(Color(kalHex: hex)).frame(width: 3.5).widgetAccentable()
    }
}

struct KalWSmall: View {
    let entry: KalWEntry
    let pal: KalWPal

    var body: some View {
        let today: [KalEvent] = KalWData.today70(entry.snap, now: entry.date)
        VStack(alignment: .leading, spacing: 0) {
            KalWDateBlock(date: entry.date, pal: pal, big: 40)
            Spacer(minLength: 4)
            if let n = today.first {
                KalWRow(e: n, snap: entry.snap, now: entry.date, pal: pal, lines: 2)
                if today.count > 1 {
                    Text("+" + String(today.count - 1) + " til").font(.system(size: 10, weight: .semibold)).foregroundStyle(pal.mut)
                        .padding(.top, 6)
                }
            } else {
                KalWEmpty70(entry: entry, pal: pal)
            }
        }
    }
}

/// «Ingen flere i dag» + neste dag med hendelser.
struct KalWEmpty70: View {
    let entry: KalWEntry
    let pal: KalWPal

    var body: some View {
        let n: KalEvent? = KalWData.upcoming(entry.snap, now: entry.date).first
        VStack(alignment: .leading, spacing: 1) {
            Text("Ingen flere i dag").font(.system(size: 13, weight: .semibold)).foregroundStyle(pal.ink).lineLimit(1)
            if let n {
                Text(KalWData.nextDayText70(n, now: entry.date)).font(.system(size: 11.5)).foregroundStyle(pal.mut).lineLimit(2)
            }
        }
    }
}

struct KalWMedium: View {
    let entry: KalWEntry
    let pal: KalWPal

    var body: some View {
        let d: Date = entry.date
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 0) {
                KalWDateBlock(date: d, pal: pal, big: 44)
                Text(KalD.months[KalD.month(d) - 1]).font(.system(size: 12, weight: .semibold)).foregroundStyle(pal.mut).lineLimit(1)
                Spacer(minLength: 0)
                Text(KalWData.weekText70(d)).font(.system(size: 10.5, weight: .bold)).tracking(0.63).foregroundStyle(pal.mut).lineLimit(1)
            }
            .frame(width: 96, alignment: .leading)
            KalWList70(entry: entry, pal: pal, max: 3, spacing: 9)
                .padding(.top, 2)
        }
    }
}

/// De neste hendelsene (fargestrek, tittel, når). Uten flere i dag: «Ingen flere i dag» over de neste dagene.
struct KalWList70: View {
    let entry: KalWEntry
    let pal: KalWPal
    let max: Int
    let spacing: CGFloat

    var body: some View {
        let up: [KalEvent] = KalWData.upcoming(entry.snap, now: entry.date)
        let none: Bool = KalWData.today70(entry.snap, now: entry.date).isEmpty
        let rows: [KalEvent] = Array(up.prefix(none ? Swift.max(1, max - 1) : max))
        VStack(alignment: .leading, spacing: spacing) {
            if none {
                Text("Ingen flere i dag").font(.system(size: 12, weight: .semibold)).foregroundStyle(pal.mut).lineLimit(1)
            }
            ForEach(rows, id: \.self) { (e: KalEvent) in
                Link(destination: KalWData.eventURL(e)) {
                    KalWRow(e: e, snap: entry.snap, now: entry.date, pal: pal)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct KalWRow: View {
    let e: KalEvent
    let snap: KalSnapshot
    let now: Date
    let pal: KalWPal
    var lines: Int = 1

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            KalWStripe70(hex: KalWData.hex70(snap, e))
            VStack(alignment: .leading, spacing: 1) {
                Text(KalWData.title70(snap, e)).font(.system(size: 13, weight: .semibold)).foregroundStyle(pal.ink).lineLimit(lines)
                Text(KalWData.wl70(e, now: now)).font(.system(size: 11.5)).foregroundStyle(pal.mut).lineLimit(1)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// + i en lys grå sirkel → kalender://ny (skrivefeltet med Glimt).
struct KalWPlus70: View {
    let pal: KalWPal

    var body: some View {
        Link(destination: KalWData.newURL) {
            Text("+").font(.system(size: 17, weight: .medium)).foregroundStyle(pal.ink)
                .frame(width: 26, height: 26)
                .background(Circle().fill(pal.plus))
        }
        .accessibilityLabel("Ny hendelse")
    }
}

struct KalWLarge: View {
    let entry: KalWEntry
    let pal: KalWPal

    var body: some View {
        let d: Date = entry.date
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 10) {
                Link(destination: KalWData.monthURL41(d)) {
                    Text(KalD.cap(KalD.months[KalD.month(d) - 1])).font(.system(size: 15, weight: .bold)).foregroundStyle(pal.acc)
                        .widgetAccentable()
                }
                Spacer(minLength: 4)
                Text(KalWData.weekText70(d)).font(.system(size: 11, weight: .bold)).tracking(0.66).foregroundStyle(pal.mut)
                KalWPlus70(pal: pal)
            }
            KalWMonthGrid(entry: entry, pal: pal)
            Rectangle().fill(pal.line).frame(height: 1)
            KalWList70(entry: entry, pal: pal, max: 2, spacing: 12)
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
        VStack(spacing: 4) {
            HStack(spacing: 0) {
                ForEach(0..<7, id: \.self) { (i: Int) in
                    Text(KalWeek35.letters[i]).font(.system(size: 10, weight: .bold)).foregroundStyle(pal.mut).frame(maxWidth: .infinity)
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
            ForEach(0..<7, id: \.self) { (i: Int) in
                KalWDayCell(entry: entry, pal: pal, day: KalD.add(start, i), month: month)
            }
        }
    }
}

struct KalWDayCell: View {
    let entry: KalWEntry
    let pal: KalWPal
    let day: Date
    let month: Int

    private var key: String { KalD.key(day) }
    private var isToday: Bool { key == KalD.key(entry.date) }
    private var inMonth: Bool { KalD.month(day) == month }

    private var dot: Color {
        if isToday { return Color.clear }
        guard let hex = KalWData.dotHex70(entry.snap, key) else { return Color.clear }
        return Color(kalHex: hex)
    }

    private var numColor: Color { isToday ? Color.white : pal.ink }
    private var weight: Font.Weight { isToday ? Font.Weight.bold : Font.Weight.medium }
    private var circle: Color { isToday ? pal.acc : Color.clear }

    var body: some View {
        VStack(spacing: 2) {
            Text(String(KalD.dayOfMonth(day))).font(.system(size: 12.5, weight: weight))
                .foregroundStyle(numColor)
                .frame(width: 24, height: 24)
                .background(Circle().fill(circle))
                .opacity(inMonth ? 1 : 0.3)
            Circle().fill(dot).frame(width: 4, height: 4)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 30)
    }
}

#if os(iOS)
/* ---------- Låseskjerm ---------- */

struct KalLockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "no.kristo.kalender.lock", provider: KalWProvider()) { (e: KalWEntry) in
            KalLockWidgetView(entry: e)
        }
        .configurationDisplayName("Kalender · låseskjerm")
        .description("Neste hendelse med tid og sted, ukedag og dato, eller dato og neste over klokken.")
        .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

struct KalLockWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: KalWEntry

    var body: some View {
        let n: KalEvent? = KalWData.upcoming(entry.snap, now: entry.date).first
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
        let wd: String = KalD.weekdaysShort[KalD.wd(entry.date)].uppercased()
        return ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 2) {
                Text(wd).font(.system(size: 10, weight: .bold)).opacity(0.85)
                Text(String(KalD.dayOfMonth(entry.date))).font(.system(size: 24, weight: .semibold))
            }
        }
        .widgetAccentable()
    }

    /// «Man 26.  ▦ 15:15 Tannlege»
    private func inline(_ n: KalEvent?) -> some View {
        let date: String = KalD.cap(KalD.weekdaysShort[KalD.wd(entry.date)]) + " " + String(KalD.dayOfMonth(entry.date)) + "."
        let next: String = n.map { (e: KalEvent) -> String in KalWData.inline70(e, now: entry.date) } ?? "Ingen flere i dag"
        return Text(date + "  ▦ " + next)
    }

    private func rectangular(_ n: KalEvent?) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            if let n {
                Text(KalWData.title70(entry.snap, n)).font(.system(size: 14, weight: .bold)).lineLimit(1).widgetAccentable()
                Text(KalWData.wl70(n, now: entry.date)).font(.system(size: 12)).opacity(0.9).lineLimit(1)
                let place: String = KalWData.place70(entry.snap, n)
                if !place.isEmpty {
                    Text(place).font(.system(size: 11)).opacity(0.75).lineLimit(1)
                }
            } else {
                Text("Ingen flere i dag").font(.system(size: 14, weight: .bold)).widgetAccentable()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#endif

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
