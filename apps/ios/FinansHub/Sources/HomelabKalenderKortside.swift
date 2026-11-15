import SwiftUI
import UIKit

/* ---------------- Prompt 26: Kalender-siden (Mer → Kalender) ---------------- */
// Fasit: design/Kalender.dc.html (variant «mobile», hideTitle: tittelen står i toppbildet).
// Kortene: Nå-kort (A), Prøver og frister (B), Kalendere (C), Kalender med Uke/Måned/Agenda (D) og Widgets (E).
// Hold inne et kort i 0,5 s for rediger-modus: ▲ ▼ flytter, − skjuler, «SKJULT · + …» henter tilbake.

/// Trykk som kommer rett etter et langt trykk (eller i rediger-modus) skal ikke åpne noe.
@MainActor func cal26Tap(_ store: Store, _ act: () -> Void) {
    if store.paperTapBlocked || store.paperEditPage == Cal26Page.editKey { return }
    act()
}

struct Cal26Page: View {
    static let editKey: String = "kalender"
    @Environment(Store.self) private var store
    @MainActor private var m: Cal26Model { Cal26Model.shared }

    var body: some View {
        TimelineView(.everyMinute) { ctx in
            Cal26PageBody(now: ctx.date)
        }
        .task(id: store.account?.id ?? "") { await m.load(store) }
    }
}

struct Cal26PageBody: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let now: Date

    var body: some View {
        let editing: Bool = store.paperEditPage == Cal26Page.editKey
        let vis: [String] = m.visibleCards
        VStack(spacing: 14) {
            if editing {
                Cal26EditPill()
                if !m.hiddenCards.isEmpty { Cal26HiddenRow() }
            }
            if m.demo { notice("Demotimeplan · serveren har ikke kalender ennå") }
            if let e = m.error, !m.demo, m.events.isEmpty { notice(e) }
            ForEach(Array(vis.enumerated()), id: \.element) { i, k in
                Cal26EditableCard(key: k, index: i, count: vis.count) { card(k) }
            }
        }
        .padding(.top, 4)
        .padding(.bottom, 8)
    }

    private func notice(_ t: String) -> some View {
        Text(t).font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 4)
    }

    @ViewBuilder private func card(_ k: String) -> some View {
        switch k {
        case "A": Cal26NowCard(now: now)
        case "B": Cal26ExamsCard(now: now)
        case "C": Cal26SettingsLink()
        case "D": Cal26CalendarCard(now: now)
        default: Cal26WidgetsCard(now: now)
        }
    }
}

/* ---------- Rediger-modus ---------- */

/// «Flytt med ▲ ▼ · skjul med −», Tilbakestill og Ferdig.
struct Cal26EditPill: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }

    var body: some View {
        HStack(spacing: 6) {
            Text("Flytt med ▲ ▼ · skjul med −").font(PF.ui(13.5, .semibold)).foregroundStyle(p.bg)
                .lineLimit(1).minimumScaleFactor(0.75)
            Spacer(minLength: 4)
            Button { m.resetCards() } label: {
                Text("Tilbakestill").font(PF.ui(12.5, .semibold)).foregroundStyle(p.bg).padding(.horizontal, 12).frame(height: 34)
            }
            .buttonStyle(.plain)
            Button { store.exitPaperEdit() } label: {
                Text("Ferdig").font(PF.ui(13, .bold)).foregroundStyle(p.ink).padding(.horizontal, 16).frame(height: 34)
                    .background(p.bg, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 16).padding(.trailing, 6).padding(.vertical, 6)
        .background(p.ink, in: Capsule())
        .shadow(color: .black.opacity(0.4), radius: 12, y: 10)
    }
}

/// «SKJULT · + Nå-kort · + Widgets …»: et trykk tar kortet tilbake.
struct Cal26HiddenRow: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }

    var body: some View {
        let hid: [String] = Cal26Model.cardKeys.filter { m.hiddenCards.contains($0) }
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Text("SKJULT").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut)
                ForEach(hid, id: \.self) { k in
                    Button { m.showCard(k) } label: {
                        Text("+ " + (Cal26Model.cardNames[k] ?? k)).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                            .padding(.horizontal, 12).frame(height: 32)
                            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(p.line, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2).padding(.vertical, 4)
        }
    }
}

/// Ett kort: hold inne for rediger-modus. I rediger-modus: stiplet ramme, ▲ ▼ − øverst til høyre, og innholdet er sperret.
struct Cal26EditableCard<C: View>: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let key: String
    let index: Int
    let count: Int
    @ViewBuilder let content: () -> C

    var body: some View {
        let editing: Bool = store.paperEditPage == Cal26Page.editKey
        content()
            .frame(maxWidth: .infinity)
            .disabled(editing)
            .allowsHitTesting(!editing)
            .overlay {
                if editing {
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .strokeBorder(p.line, style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                        .padding(-5)
                        .allowsHitTesting(false)
                }
            }
            .scaleEffect(editing ? 0.985 : 1)
            .overlay(alignment: .topTrailing) {
                if editing { controls.offset(x: 4, y: -10) }
            }
            .simultaneousGesture(LongPressGesture(minimumDuration: 0.5, maximumDistance: 8).onEnded { _ in
                if !editing {
                    m.sel = nil
                    store.enterPaperEdit(Cal26Page.editKey)
                }
            })
            .animation(.easeOut(duration: 0.15), value: editing)
    }

    private var controls: some View {
        HStack(spacing: 4) {
            ctl("▲", "Flytt opp", bg: p.ink, fg: p.bg, dim: index == 0) { m.moveCard(key, -1) }
            ctl("▼", "Flytt ned", bg: p.ink, fg: p.bg, dim: index >= count - 1) { m.moveCard(key, 1) }
            ctl("−", "Skjul kortet", bg: Color(hex: "#b23a2a"), fg: Color.white, dim: false) { m.hideCard(key) }
        }
    }

    private func ctl(_ t: String, _ label: String, bg: Color, fg: Color, dim: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(t).font(PF.ui(t == "−" ? 16 : 11, .bold)).foregroundStyle(fg).frame(width: 32, height: 32)
                .background(bg, in: Circle())
                .shadow(color: .black.opacity(0.3), radius: 6, y: 4)
                .opacity(dim ? 0.35 : 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/* ---------- A: Nå-kort ---------- */

struct Cal26NowState {
    var kicker: String = "FRI"
    var when: String = ""
    var title: String = "Ingen timer"
    var sub: String = ""
    var hex: String = "#7a7468"
    var progress: Double? = nil
    var next: String = ""
    var event: CalEvent26? = nil

    /// NÅ (time, rom, lærer, min igjen og fremdrift), ellers NESTE TIME eller NESTE SKOLEDAG, og neste prøve.
    static func make(_ all: [CalEvent26], hidden: Set<String>, colors: [String: String], now: Date) -> Cal26NowState {
        let nm: Int = Cal26.minutes(now)
        let tl: [CalEvent26] = Cal26.on(all, Cal26.key(now), hidden: hidden).filter { $0.isLesson }
        let cur: CalEvent26? = tl.first(where: { nm >= $0.startMin && nm < $0.endMin })
        let nx: CalEvent26? = tl.first(where: { $0.startMin > nm })
        var s = Cal26NowState()
        if let c = cur {
            s.kicker = "NÅ"
            s.when = c.startText + "–" + c.endText
            s.title = c.title
            s.sub = [c.roomTeacher, "\(c.endMin - nm) min igjen"].filter { !$0.isEmpty }.joined(separator: " · ")
            s.hex = c.hex(colors)
            let len: Double = Double(Swift.max(1, c.endMin - c.startMin))
            s.progress = Swift.min(1, Swift.max(0, Double(nm - c.startMin) / len))
            s.event = c
            if let n = nx {
                s.next = "Deretter: " + n.title + " " + n.startText + (n.room.isEmpty ? "" : " · " + n.room)
            } else {
                s.next = "Siste time i dag"
            }
        } else if let n = nx {
            s.kicker = "NESTE TIME"
            s.when = "om " + Cal26.dur(n.startMin - nm)
            s.title = n.title
            s.sub = n.startText + "–" + n.endText + (n.room.isEmpty ? "" : " · " + n.room)
            s.hex = n.hex(colors)
            s.event = n
        } else {
            for i in 1..<15 {
                let d: Date = Cal26.add(now, i)
                if let f = Cal26.on(all, Cal26.key(d), hidden: hidden).first(where: { $0.isLesson }) {
                    s.kicker = "NESTE SKOLEDAG"
                    s.when = Cal26.dLong(d)
                    s.title = f.title
                    s.sub = f.startText + "–" + f.endText + (f.room.isEmpty ? "" : " · " + f.room) + " · første time"
                    s.hex = f.hex(colors)
                    s.event = f
                    break
                }
            }
        }
        if let x = Cal26.exams(all, now: now).first {
            let dd: Int = Cal26.daysUntil(x.dayKey, from: now)
            let w: String = dd == 0 ? "i dag" : dd == 1 ? "i morgen" : "om \(dd) dager"
            s.next = (s.next.isEmpty ? "" : s.next + " · ") + x.title + " " + w
        }
        return s
    }
}

struct Cal26NowCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let now: Date

    private let accent: Color = Color(hex: "#ff9c8c")

    var body: some View {
        let s: Cal26NowState = Cal26NowState.make(m.events, hidden: m.hiddenFilters, colors: m.subjectColors, now: now)
        Button {
            cal26Tap(store) { if let e = s.event { m.open(e) } }
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(s.kicker).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(accent).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(s.when).font(PF.mono(11)).foregroundStyle(p.bg).opacity(0.75).lineLimit(1)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.title).font(PF.serif(30, medium: true)).foregroundStyle(p.bg).lineLimit(2)
                    if !s.sub.isEmpty {
                        Text(s.sub).font(PF.ui(13.5)).foregroundStyle(p.bg).opacity(0.85).lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 18)
                .overlay(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3).fill(Color(hex: s.hex)).frame(width: 6)
                }
                if let pr = s.progress { bar(pr) }
                if !s.next.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Rectangle().fill(p.bg.opacity(0.16)).frame(height: 1)
                        Text(s.next).font(PF.ui(13)).foregroundStyle(p.bg).opacity(0.85).lineLimit(2)
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.ink, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .shadow(color: .black.opacity(0.4), radius: 15, y: 10)
        }
        .buttonStyle(.plain)
    }

    private func bar(_ v: Double) -> some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(p.bg.opacity(0.18))
                Capsule().fill(accent).frame(width: g.size.width * CGFloat(v))
            }
        }
        .frame(height: 4)
    }
}

/* ---------- B: Prøver og frister ---------- */

struct Cal26ExamsCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let now: Date

    var body: some View {
        let list: [CalEvent26] = Cal26.exams(m.events, now: now)
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("PRØVER OG FRISTER").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                Spacer()
                Text("\(list.count)").font(PF.mono(10.5)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 4).padding(.top, 4)
            VStack(spacing: 0) {
                if list.isEmpty {
                    Text(m.loaded ? "Ingen kommende prøver eller frister." : "Henter …").font(PF.ui(14)).foregroundStyle(p.mut)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 16)
                }
                ForEach(Array(list.prefix(8).enumerated()), id: \.element.id) { i, e in
                    if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                    Cal26ExamRow(e: e, now: now)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 2)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }
}

struct Cal26ExamRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal26Model { Cal26Model.shared }
    let e: CalEvent26
    let now: Date

    var body: some View {
        let x: CalWExam26 = Cal26.examRow(e, now: now)
        Button { cal26Tap(store) { m.openInAgenda(e) } } label: {
            HStack(spacing: 12) {
                VStack(spacing: 3) {
                    Text("\(x.day)").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                    Text(x.month).font(PF.mono(9.5)).tracking(0.8).foregroundStyle(p.mut)
                }
                .frame(width: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text(e.title).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                    Text(x.sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text(x.inText).font(PF.ui(11.5, .bold)).foregroundStyle(x.red ? Color.white : p.ink).lineLimit(1)
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .background(x.red ? Color(hex: "#b23a2a") : p.bg, in: Capsule())
            }
            .padding(.vertical, 8)
            .frame(minHeight: 58)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- C: Kalendere (lenke til Innstillinger) ---------- */

struct Cal26SettingsLink: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        Button { cal26Tap(store) { Int26Nav.openKal(from: "kalender", store) } } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Kalendere").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text("Skolens iCal · Google Kalender · Bursdager").font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text("Innstillinger ›").font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
