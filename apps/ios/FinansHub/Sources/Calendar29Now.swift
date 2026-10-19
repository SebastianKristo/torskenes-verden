import SwiftUI
import UIKit

/* ---------------- Prompt 29: Kalender → «Nå / Neste»-kort og ukenummer ---------------- */
// Fasit: design/Kalender.dc.html (nx, mini.head/cells, mo.head) og prompts/prompt-29-pakke/claude-code-kalender-na-kort.md,
// claude-code-kalender-ukenummer.md. Kortet erstatter den svarte NESTE/NÅ-stripen: lyst kort med ikonflis, NÅ/NESTE,
// tid · dag, tittel + romchip og stort tall til høyre («30 min» / «igjen»). Pågår: 3 pt fremdriftslinje langs bunnen.
// Ukenummer (ISO 8601) i egen kolonne i Måned og minikalenderen; trykk åpner uken i Uke-visning.

struct Cal29Next {
    var kicker: String = ""
    /// «14:00–15:00»
    var tm: String = ""
    /// «i dag», «i morgen» eller «fredag 25. september»
    var day: String = ""
    var title: String = "Ingen kommende hendelser"
    var place: String = ""
    /// Stort tall til høyre («30 min», «Fre»).
    var big: String = ""
    /// Liten tekst under («igjen», «til start», «14:00»).
    var small: String = ""
    var hex: String = "#7a7468"
    /// Medgått andel (0–1) når hendelsen pågår.
    var progress: Double? = nil
    var event: CalEvent26? = nil
}

extension Cal27Model {
    /// Neste hendelse med klokkeslett (eller den som pågår) de neste 21 dagene, som `nx` i fasiten.
    func next29(_ now: Date) -> Cal29Next {
        let nm: Int = Cal26.minutes(now)
        for i in 0..<21 {
            let d: Date = Cal26.add(now, i)
            let list: [CalEvent26] = Cal29Now.timed(on(Cal26.key(d)))
            for e in list {
                let a: Int = e.startMin + i * 1440
                let b: Int = e.endMin + i * 1440
                if b <= nm { continue }
                return Cal29Now.make(e, d: d, i: i, a: a, b: b, nm: nm, hex: hex(e))
            }
        }
        return Cal29Next()
    }

    /// Ukenummeret i Måned eller minikalenderen: Uke-visning for den uken.
    func goWeek29(_ monday: Date, _ store: Store) {
        setView("uke", store)
        cur = Cal26.key(monday)
        miniOff = 0
        ensure(monday)
    }
}

enum Cal29Now {
    static func timed(_ l: [CalEvent26]) -> [CalEvent26] {
        let f: [CalEvent26] = l.filter { !Cal27Model.inAllRow($0) }
        return f.sorted { x, y in x.startMin != y.startMin ? x.startMin < y.startMin : (x.type == "time" && y.type != "time") }
    }

    static func make(_ e: CalEvent26, d: Date, i: Int, a: Int, b: Int, nm: Int, hex: String) -> Cal29Next {
        var n = Cal29Next()
        let isCur: Bool = a <= nm
        n.kicker = isCur ? "NÅ" : "NESTE"
        n.tm = e.startText + "–" + e.endText
        n.day = i == 0 ? "i dag" : i == 1 ? "i morgen" : Cal26.dLong(d)
        n.title = e.title
        n.place = e.room
        n.hex = hex
        n.event = e
        if isCur {
            n.big = Cal27Model.dur(b - nm)
            n.small = "igjen"
            let span: Double = Double(Swift.max(1, b - a))
            n.progress = Swift.min(1, Swift.max(0, Double(nm - a) / span))
        } else if a - nm < 1440 {
            n.big = Cal27Model.dur(a - nm)
            n.small = "til start"
        } else {
            n.big = String(Cal26.cap(Cal26.weekdays[Cal26.jsDay(d)]).prefix(3))
            n.small = e.startText
        }
        return n
    }
}

/// Kortet under verktøylinjen. Oppdateres hvert minutt (TimelineView i Cal27Page).
struct Cal29NowCard: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let now: Date

    var body: some View {
        let n: Cal29Next = m.next29(now)
        let c: Color = Color(hex: n.hex)
        Button { if let e = n.event { m.open(e) } } label: {
            HStack(spacing: 14) {
                Cal29NowIcon(color: c)
                Cal29NowMiddle(n: n)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if !n.big.isEmpty {
                    VStack(alignment: .trailing, spacing: 3) {
                        Text(n.big).font(PF.serif(24, medium: true)).foregroundStyle(p.ink).lineLimit(1).fixedSize()
                        Text(n.small).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1)
                    }
                }
            }
            .padding(.leading, 12).padding(.trailing, 18).padding(.top, 10).padding(.bottom, 12)
            .frame(minHeight: 60)
            .background(p.card)
            .overlay(alignment: .bottom) {
                if let pr = n.progress { Cal29Progress(value: pr, color: c) }
            }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(p.line, lineWidth: 1))
            .shadow(color: .black.opacity(0.12), radius: 11, y: 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12).padding(.bottom, 10)
        .accessibilityElement(children: .combine)
    }
}

struct Cal29NowIcon: View {
    let color: Color

    var body: some View {
        Image(systemName: "clock").font(.system(size: 18, weight: .semibold)).foregroundStyle(color)
            .frame(width: 40, height: 40)
            .background(color.opacity(0.16), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct Cal29NowMiddle: View {
    @Environment(\.paper) private var p
    let n: Cal29Next

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if !n.kicker.isEmpty {
                HStack(spacing: 8) {
                    Text(n.kicker).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                    Text(n.tm + " · " + n.day).font(PF.mono(10.5)).tracking(0.4).foregroundStyle(p.mut).lineLimit(1)
                }
            } else {
                Text("De neste tre ukene").font(PF.mono(10.5)).tracking(0.4).foregroundStyle(p.mut).lineLimit(1)
            }
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(n.title).font(PF.serif(20, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    .layoutPriority(1)
                if !n.place.isEmpty {
                    // Prompt 31: stedspillen kuttes med … (aldri fixedSize), så lange steder ikke gjør kortet bredere enn skjermen.
                    Text(n.place).font(PF.ui(12, .semibold)).foregroundStyle(p.ink).lineLimit(1).truncationMode(.tail)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(p.bg, in: Capsule())
                }
            }
        }
    }
}

struct Cal29Progress: View {
    @Environment(\.paper) private var p
    let value: Double
    let color: Color

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Rectangle().fill(p.line)
                Rectangle().fill(color).frame(width: g.size.width * CGFloat(value))
            }
        }
        .frame(height: 3)
    }
}

/* ---------- Ukenummer ---------- */

/// Ukenummeret for raden som starter med mandag `monday`.
struct Cal29WeekNo: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Cal27Model { Cal27Model.shared }
    let monday: Date
    var width: CGFloat = 24
    var size: CGFloat = 10
    /// nil = fyller høyden (Måned).
    var height: CGFloat? = nil

    var body: some View {
        let w: Int = Cal26.isoWeek(monday)
        let maxH: CGFloat? = height ?? CGFloat.infinity
        let top: Bool = height == nil
        Button { m.goWeek29(monday, store) } label: {
            Text("\(w)").font(PF.mono(size)).foregroundStyle(p.mut)
                .padding(.top, top ? 8 : 0)
                .frame(width: width, height: height)
                .frame(maxHeight: maxH, alignment: top ? .top : .center)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Uke \(w)")
    }
}

/// «U» over ukenummerkolonnen.
struct Cal29WeekHead: View {
    @Environment(\.paper) private var p
    var width: CGFloat = 24
    var size: CGFloat = 10

    var body: some View {
        Text("U").font(PF.mono(size)).foregroundStyle(p.mut).frame(width: width)
    }
}
