import SwiftUI

/* ---------------- Avganger: holdeplassene på turen (prompt 21) ---------------- */
// Serveren gir hver avgang `stops:[{name, platform, time, aimed, expected}]` fra valgt holdeplass til
// endestasjonen (Entur serviceJourney.estimatedCalls). Et trykk på raden viser dem under avgangen.

extension RuterDeparture {
    /// Stabil nøkkel for den utvidede raden (id-en endres når sanntiden oppdateres hvert 30. sekund).
    var openKey: String {
        let t: Int = Int(aimed?.timeIntervalSince1970 ?? 0)
        return line + "|" + to + "|" + String(t)
    }
}

/// Ett stopp på turen.
struct RuterCall21: Hashable {
    var name: String
    var platform: String
    var time: Date?
    var timeText: String

    init(_ o: [String: Any]) {
        name = JS.str(o, "name") ?? "–"
        platform = JS.str(o, "platform") ?? ""
        let raw: String = JS.str(o, "time") ?? ""
        let d: Date? = JS.date(o["expected"]) ?? JS.date(o["time"]) ?? JS.date(o["aimed"])
        time = d
        // «19:01» fra serveren brukes som det er; ellers formateres tidspunktet.
        if raw.count == 5 && raw.contains(":") {
            timeText = raw
        } else if let d {
            timeText = JS.fmt(d, "HH:mm")
        } else {
            timeText = raw
        }
    }

    /// Transportmåten på norsk (serveren sender «Trikk», eldre servere «tram»).
    static func modeName(_ mode: String) -> String {
        switch mode.lowercased() {
        case "tram", "trikk": return "Trikk"
        case "bus", "buss", "coach": return "Buss"
        case "metro", "t-bane": return "T-bane"
        case "rail", "tog": return "Tog"
        case "water", "båt", "ferry": return "Båt"
        default: return mode.isEmpty ? "" : mode.prefix(1).uppercased() + String(mode.dropFirst())
        }
    }
}

/// Stopplisten under en utvidet avgang: loddrett linje i linjefargen, fylt sirkel først, hule sirkler ellers,
/// første og siste stopp i fet skrift. Mer enn 6 stopp: de 2 første, «· · · N stopp» og de 2 siste.
struct RuterStopList21: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let dep: RuterDeparture
    let color: Color
    let stopName: String
    @State private var showAll: Bool = false

    private var rows: [RuterStopRow21] {
        let list: [RuterCall21] = dep.stops
        let n: Int = list.count
        var out: [RuterStopRow21] = []
        if n <= 6 || showAll {
            for (i, c) in list.enumerated() { out.append(RuterStopRow21(index: i, call: c, hidden: 0)) }
            return out
        }
        out.append(RuterStopRow21(index: 0, call: list[0], hidden: 0))
        out.append(RuterStopRow21(index: 1, call: list[1], hidden: 0))
        out.append(RuterStopRow21(index: -1, call: nil, hidden: n - 4))
        out.append(RuterStopRow21(index: n - 2, call: list[n - 2], hidden: 0))
        out.append(RuterStopRow21(index: n - 1, call: list[n - 1], hidden: 0))
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if dep.stops.isEmpty {
                Text("Holdeplassene vises når serveren er oppdatert.").font(PF.ui(12.5)).foregroundStyle(p.mut)
                    .padding(.vertical, 6)
            } else {
                ForEach(rows) { r in rowView(r) }
            }
            Button { store.openURL(link) } label: {
                Text("Åpne i Ruter ›").font(PF.ui(13, .semibold)).foregroundStyle(p.lab).underline()
            }
            .buttonStyle(.plain)
            .padding(.top, 8)
        }
        .padding(.leading, 68).padding(.trailing, 14).padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var link: URL? {
        if !dep.ruterUrl.isEmpty, let u = URL(string: dep.ruterUrl) { return u }
        let from: String = stopName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? stopName
        let to: String = dep.to.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? dep.to
        return URL(string: "https://ruter.no/reiseplanlegger/?from=\(from)&to=\(to)")
    }

    @ViewBuilder private func rowView(_ r: RuterStopRow21) -> some View {
        if let c = r.call {
            stopRow(c, first: r.index == 0, last: r.index == dep.stops.count - 1)
        } else {
            Button { withAnimation(.easeOut(duration: 0.2)) { showAll = true } } label: {
                HStack(spacing: 12) {
                    RuterRail21(color: color, kind: 3, first: false, last: false)
                    Text("· · · \(r.hidden) stopp").font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
                    Spacer()
                }
                .frame(height: 30)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private func stopRow(_ c: RuterCall21, first: Bool, last: Bool) -> some View {
        let bold: Bool = first || last
        let kind: Int = first ? 0 : (last ? 2 : 1)
        return HStack(spacing: 12) {
            RuterRail21(color: color, kind: kind, first: first, last: last)
            Text(c.name).font(PF.ui(14, bold ? .bold : .regular)).foregroundStyle(p.ink).lineLimit(1)
            Spacer(minLength: 6)
            Text(c.timeText).font(PF.mono(13)).foregroundStyle(p.mut)
        }
        .frame(height: 30)
    }
}

/// En rad i stopplisten (stopp eller «· · · N stopp»).
struct RuterStopRow21: Identifiable {
    let index: Int
    let call: RuterCall21?
    let hidden: Int
    var id: Int { index }
}

/// Linjen og sirkelen til venstre for et stopp. kind: 0 fylt (første), 1 hul (mellom), 2 hul (siste), 3 bare linje.
struct RuterRail21: View {
    @Environment(\.paper) private var p
    let color: Color
    let kind: Int
    let first: Bool
    let last: Bool

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                Rectangle().fill(first ? Color.clear : color).frame(width: 2)
                Rectangle().fill(last ? Color.clear : color).frame(width: 2)
            }
            if kind == 0 {
                Circle().fill(color).frame(width: 12, height: 12)
            } else if kind == 1 || kind == 2 {
                Circle().fill(p.card).frame(width: 12, height: 12)
                    .overlay(Circle().stroke(color, lineWidth: 2))
            }
        }
        .frame(width: 14)
        .frame(maxHeight: .infinity)
    }
}
