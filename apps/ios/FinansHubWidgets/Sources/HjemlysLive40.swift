import SwiftUI
import WidgetKit
import AppIntents
#if canImport(ActivityKit)
import ActivityKit
#endif

/* ---------------- Prompt 40: Hjemlys som Live Activity (iPhone 2a) ----------------
   Fasit: design/Hjemme trygt Varianter.dc.html → 2a. claude-code-hjemlys.md («iPhone · Live Activity»).
   – Kompakt: glødende prikk + «Hjem» til venstre, «8 min» (grønn) til høyre.
   – Minimal: ring med fremdrift rundt prikken.
   – Utvidet: «Hjemlys», mottakere, tid (stor), fremdriftslinje med start/etappe/hjem, «+ 10 min» og «Jeg er hjemme».
   – Låseskjerm/varselsenter: samme innhold i et kort (rgba(20,22,28,.72)); sen → rødt kort «15 min over · familien har fått beskjed»
     med «Alt OK» / «+ 15 min»; hjemme → grønt kort «Hjemme 23:36 ✓ · forsvinner om 5 min».
   – StandBy og Apple Watch Smart Stack: egen .small-variant (supplementalActivityFamilies, iOS 18).
   Knappene er App Intents (Hjemlys40Shared.swift) og virker uten å åpne appen. */

#if canImport(ActivityKit)
@available(iOS 16.2, *)
struct HjemlysLive40: Widget {
    var body: some WidgetConfiguration {
        Hjemlys40Config.make()
    }
}

@available(iOS 16.2, *)
enum Hjemlys40Config {
    static func base() -> ActivityConfiguration<Hjemlys40Attributes> {
        ActivityConfiguration(for: Hjemlys40Attributes.self) { (ctx: ActivityViewContext<Hjemlys40Attributes>) in
            Hjemlys40LockPick(attr: ctx.attributes, st: ctx.state)
                .activityBackgroundTint(Hjemlys40LockView.tint(ctx.state.state))
                .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { (ctx: ActivityViewContext<Hjemlys40Attributes>) in
            // Prompt 41: maks ca. 160 pt høyde. leading = lys + «Hjemlys»/mottakere, trailing = tid, bottom = fremdrift, etiketter
            // og knapper (34 pt, 10 pt mellom rader, 14 pt bunnmarg). Ingen fast høyde på innholdet (knappene ble kuttet).
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 4) {
                        Hjemlys41Glow(size: 26, state: ctx.state.state)
                        Hjemlys40IslandTitle(attr: ctx.attributes, st: ctx.state)
                    }
                    .padding(.leading, 2)
                    .dynamicIsland(verticalPlacement: .belowIfTooWide)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Hjemlys40IslandTime(st: ctx.state).padding(.trailing, 4).padding(.top, 6)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Hjemlys40IslandBottom(attr: ctx.attributes, st: ctx.state)
                }
            } compactLeading: {
                HStack(spacing: 2) {
                    Hjemlys41Glow(size: 14, state: ctx.state.state)
                    Text(Hjemlys40LockView.compactWord(ctx.state)).font(.system(size: 13, weight: .bold)).foregroundStyle(Color.white)
                }
            } compactTrailing: {
                Hjemlys40CompactTime(st: ctx.state)
            } minimal: {
                Hjemlys40Minimal(st: ctx.state)
            }
            .keylineTint(Hjemlys40LockView.accent(ctx.state.state))
            .widgetURL(URL(string: "finanshub://hjemlys"))
        }
    }

    /// iOS 18: egen liten variant for StandBy og Apple Watch Smart Stack.
    static func make() -> some WidgetConfiguration {
        if #available(iOS 18.0, *) {
            return Hjemlys40Config.base().supplementalActivityFamilies([.small])
        } else {
            return Hjemlys40Config.base()
        }
    }
}
#endif

/* ---------- Byggeklosser ---------- */

#if canImport(ActivityKit)
/// Gjenstående tid som teller ned av seg selv (Text med timer), eller «15 min over» / «Hjemme».
@available(iOS 16.2, *)
struct Hjemlys40CompactTime: View {
    let st: Hjemlys40Attributes.ContentState

    var body: some View {
        Group {
            if st.kind == "checkin" {
                Text(Hjemlys40Look.clock(st.homeDate ?? Date())).font(.system(size: 14, weight: .bold)).monospacedDigit()
                    .foregroundStyle(Hjemlys40Look.gold)
            } else if st.state == "home" {
                Text("✓").font(.system(size: 14, weight: .heavy)).foregroundStyle(Hjemlys40Look.gold)
            } else if st.eta <= 0 {
                Text("…").font(.system(size: 14, weight: .bold)).foregroundStyle(Hjemlys40Look.green)
            } else if st.state == "late" {
                Text("+\(st.lateMinutes)").font(.system(size: 14, weight: .heavy)).foregroundStyle(Hjemlys40Look.red)
            } else if st.etaDate > Date() {
                Text(timerInterval: Date()...st.etaDate, countsDown: true, showsHours: false)
                    .font(.system(size: 14, weight: .bold)).monospacedDigit()
                    .foregroundStyle(Hjemlys40Look.green)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 52)
            } else {
                Text("nå").font(.system(size: 14, weight: .bold)).foregroundStyle(Hjemlys40Look.green)
            }
        }
    }
}

/// Minimal: ring med fremdrift rundt prikken.
@available(iOS 16.2, *)
struct Hjemlys40Minimal: View {
    let st: Hjemlys40Attributes.ContentState

    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.2), lineWidth: 3)
            Circle().trim(from: 0, to: CGFloat(Swift.min(1, Swift.max(0.02, st.progress))))
                .stroke(Hjemlys40LockView.accent(st.state), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Circle().fill(st.state == "late" ? Hjemlys40Look.red : Hjemlys40Look.glowOut).frame(width: 8, height: 8)
        }
        .frame(width: 24, height: 24)
    }
}

@available(iOS 16.2, *)
struct Hjemlys40IslandTitle: View {
    let attr: Hjemlys40Attributes
    let st: Hjemlys40Attributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(Color.white).lineLimit(1)
            Text(st.state == "late" ? "Familien har fått beskjed" : attr.recipients)
                .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.7)).lineLimit(1).minimumScaleFactor(0.85)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var title: String {
        if st.kind == "checkin" { return "Inne" + (st.dest.isEmpty || st.dest == "Hjem" ? "" : " · " + st.dest) }
        if st.kind == "soon" { return "Drar snart" }
        if st.state == "late" { return "\(st.lateMinutes) min over" }
        if st.state == "home" { return st.dest == "Hjem" || st.dest.isEmpty ? "Hjemme ✓" : "Fremme ✓" }
        return "Vel fremme"
    }
}

@available(iOS 16.2, *)
struct Hjemlys40IslandTime: View {
    let st: Hjemlys40Attributes.ContentState

    var body: some View {
        // Prompt 41: tiden mangler aldri («•••», «om…»): fast bredde, monospacedDigit og nedtelling med Text(timerInterval:).
        // Uten ETA: «Beregner».
        VStack(alignment: .trailing, spacing: 1) {
            if st.eta <= 0 && st.kind != "checkin" {
                Text("Beregner").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.white.opacity(0.8))
            } else {
                Text(st.kind == "checkin" ? (st.homeDate ?? Date()) : (st.homeDate ?? st.etaDate), style: .time)
                    .font(.system(size: 22, weight: .bold)).monospacedDigit()
                    .foregroundStyle(st.kind == "checkin" ? Hjemlys40Look.gold : Hjemlys40LockView.accent(st.state))
                    .lineLimit(1).minimumScaleFactor(0.7)
                if st.state == "onTheWay" && st.kind != "checkin" && st.etaDate > Date() {
                    Text(timerInterval: Date()...st.etaDate, countsDown: true, showsHours: false)
                        .font(.system(size: 11, weight: .semibold)).monospacedDigit()
                        .foregroundStyle(Color.white.opacity(0.75))
                        .multilineTextAlignment(.trailing)
                } else {
                    Text(Hjemlys40LockView.subTime(st)).font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.7)).lineLimit(1)
                }
            }
        }
        .frame(minWidth: 64, alignment: .trailing)
    }
}

/// Fremdriftslinje med punkt for hvor du er.
@available(iOS 16.2, *)
struct Hjemlys40Bar: View {
    let st: Hjemlys40Attributes.ContentState
    var height: CGFloat = 6
    var knob: Bool = true

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            let w: CGFloat = g.size.width
            let p: CGFloat = CGFloat(Swift.min(1, Swift.max(0, st.progress)))
            ZStack(alignment: .leading) {
                Capsule().fill(Hjemlys40Look.track)
                Capsule().fill(Hjemlys40LockView.accent(st.state)).frame(width: Swift.max(height, w * p))
                if knob {
                    Circle().fill(Color.white).frame(width: 16, height: 16).offset(x: Swift.max(0, w * p - 8))
                }
            }
        }
        .frame(height: knob ? 16 : height)
    }
}

@available(iOS 16.2, *)
struct Hjemlys40IslandBottom: View {
    let attr: Hjemlys40Attributes
    let st: Hjemlys40Attributes.ContentState

    var body: some View {
        VStack(spacing: 10) {
            if st.state != "home" && st.kind == "trip" {
                VStack(spacing: 4) {
                    Hjemlys40Bar(st: st, height: 6, knob: true)
                    // Prompt 41: ekte etiketter (startsted, etappe, mål) – aldri «Start» / «Kollektiv + gå».
                    HStack(spacing: 4) {
                        if !st.from.isEmpty { Text(st.from).lineLimit(1) }
                        Spacer(minLength: 4)
                        if !Hjemlys40LockView.genericLeg(st.leg) { Text(st.leg).lineLimit(1) }
                        Spacer(minLength: 4)
                        Text(st.dest.isEmpty ? "Hjem" : st.dest).lineLimit(1)
                    }
                    .font(.system(size: 11.5)).foregroundStyle(Color.white.opacity(0.7))
                }
            }
            if st.kind == "soon" {
                Text("Drar om ca. " + Hjemlys40Look.mins(Hjemlys40Look.minutesLeft(st.eta)) + " · " + Hjemlys40Look.clock(st.etaDate))
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.white.opacity(0.85))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Hjemlys40Buttons(attr: attr, st: st, height: 34)
        }
        .padding(.horizontal, 4).padding(.top, 2).padding(.bottom, 14)
    }
}

/// «+ 10 min» / «Jeg er hjemme», eller «Alt OK» / «+ 15 min» når du er sen.
@available(iOS 16.2, *)
struct Hjemlys40Buttons: View {
    let attr: Hjemlys40Attributes
    let st: Hjemlys40Attributes.ContentState
    let height: CGFloat

    var body: some View {
        if st.kind == "checkin" {
            EmptyView()
        } else if st.kind == "soon" {
            HStack(spacing: 8) {
                Button(intent: Hjemlys41SoonPlusIntent(sessionId: attr.sessionId)) {
                    pill("+ 15 min", fg: Color.white, bg: Color.white.opacity(0.12), bold: false)
                }
                .buttonStyle(.plain)
                Button(intent: Hjemlys41LeaveNowIntent(sessionId: attr.sessionId)) {
                    pill("Drar nå", fg: Hjemlys40Look.c(0x0d1a12), bg: Hjemlys40Look.green, bold: true)
                }
                .buttonStyle(.plain)
            }
        } else if st.state == "late" {
            HStack(spacing: 8) {
                Button(intent: Hjemlys40OkIntent(sessionId: attr.sessionId)) {
                    pill("Alt OK", fg: Hjemlys40Look.c(0x2a0f0d), bg: Color.white, bold: true)
                }
                .buttonStyle(.plain)
                Button(intent: Hjemlys40PlusIntent(sessionId: attr.sessionId, minutes: 15)) {
                    pill("+ 15 min", fg: Color.white, bg: Color.white.opacity(0.14), bold: false)
                }
                .buttonStyle(.plain)
            }
        } else if st.state != "home" {
            HStack(spacing: 8) {
                Button(intent: Hjemlys40PlusIntent(sessionId: attr.sessionId, minutes: 10)) {
                    pill("+ 10 min", fg: Color.white, bg: Color.white.opacity(0.12), bold: false)
                }
                .buttonStyle(.plain)
                Button(intent: Hjemlys40HomeIntent(sessionId: attr.sessionId)) {
                    pill("Jeg er hjemme", fg: Hjemlys40Look.c(0x0d1a12), bg: Hjemlys40Look.green, bold: true)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func pill(_ t: String, fg: Color, bg: Color, bold: Bool) -> some View {
        Text(t).font(.system(size: 13, weight: bold ? .heavy : .bold)).foregroundStyle(fg)
            .frame(maxWidth: .infinity).frame(height: height)
            .background(bg, in: Capsule())
    }
}

/// Låseskjermen / varselsenteret (og .medium-varianten i StandBy).
/// iOS 18: .small (StandBy / Smart Stack) får egen visning; ellers låseskjermkortet.
@available(iOS 16.2, *)
struct Hjemlys40LockPick: View {
    let attr: Hjemlys40Attributes
    let st: Hjemlys40Attributes.ContentState

    var body: some View {
        if #available(iOS 18.0, *) {
            Hjemlys40FamilySwitch(attr: attr, st: st)
        } else {
            Hjemlys40LockView(attr: attr, st: st)
        }
    }
}

@available(iOS 18.0, *)
struct Hjemlys40FamilySwitch: View {
    @Environment(\.activityFamily) private var family
    let attr: Hjemlys40Attributes
    let st: Hjemlys40Attributes.ContentState

    var body: some View {
        if family == .small {
            Hjemlys40Small(attr: attr, st: st)
        } else {
            Hjemlys40LockView(attr: attr, st: st)
        }
    }
}

@available(iOS 16.2, *)
struct Hjemlys40LockView: View {
    let attr: Hjemlys40Attributes
    let st: Hjemlys40Attributes.ContentState

    static func accent(_ s: String) -> Color {
        switch s {
        case "late": return Hjemlys40Look.red
        case "home": return Hjemlys40Look.gold
        default: return Hjemlys40Look.green
        }
    }

    static func tint(_ s: String) -> Color {
        switch s {
        case "late": return Hjemlys40Look.c(0x2a0f0d)
        case "home": return Hjemlys40Look.c(0x10251a)
        default: return Hjemlys40Look.c(0x14161c, 0.72)
        }
    }

    /// Prompt 41: «Hjem» / «Sen» / «Inne» / «Drar» i kompakt Dynamic Island.
    static func compactWord(_ st: Hjemlys40Attributes.ContentState) -> String {
        if st.kind == "checkin" { return "Inne" }
        if st.kind == "soon" { return "Drar" }
        if st.state == "late" { return "Sen" }
        return st.dest.isEmpty || st.dest == "Hjem" ? "Hjem" : "Mål"
    }

    /// Prompt 41: generiske etappenavn vises ikke («Kollektiv + gå», «Gå», «Start»).
    static func genericLeg(_ leg: String) -> Bool {
        let l: String = leg.lowercased().trimmingCharacters(in: .whitespaces)
        return l.isEmpty || l == "kollektiv + gå" || l == "kollektiv" || l == "start" || l == "gå" || l == "taxi"
    }

    /// «om 8 min» / «15 min over» / «forsvinner om 5 min».
    static func subTime(_ st: Hjemlys40Attributes.ContentState) -> String {
        switch st.state {
        case "late": return "\(st.lateMinutes) min over"
        case "home": return "hjemme"
        default: return "om " + Hjemlys40Look.mins(Hjemlys40Look.minutesLeft(st.eta))
        }
    }

    var body: some View {
        full
    }

    private var full: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 4) {
                Hjemlys41Glow(size: 26, state: st.state)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 14, weight: .bold)).foregroundStyle(Color.white).lineLimit(1)
                    Text(sub).font(.system(size: 11.5)).foregroundStyle(Color.white.opacity(0.75)).lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if st.state == "onTheWay" && st.kind == "trip" {
                    VStack(alignment: .trailing, spacing: 1) {
                        Hjemlys40BigLeft(st: st)
                        Text(Hjemlys40Look.clock(st.etaDate)).font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.7))
                    }
                }
            }
            if st.state == "onTheWay" && st.kind == "trip" { Hjemlys40Bar(st: st, height: 5, knob: false) }
            Hjemlys40Buttons(attr: attr, st: st, height: 34)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
    }

    private var title: String {
        if st.kind == "checkin" { return "Inne · " + Hjemlys40Look.clock(st.homeDate ?? Date()) + (st.dest.isEmpty || st.dest == "Hjem" ? "" : " · " + st.dest) }
        if st.kind == "soon" { return "Drar om ca. " + Hjemlys40Look.mins(Hjemlys40Look.minutesLeft(st.eta)) + " · " + Hjemlys40Look.clock(st.etaDate) }
        switch st.state {
        case "late": return "Vel fremme · \(st.lateMinutes) min over"
        case "home": return (st.dest.isEmpty || st.dest == "Hjem" ? "Hjemme " : "Fremme ") + Hjemlys40Look.clock(st.homeDate ?? Date()) + " ✓"
        default: return st.dest.isEmpty || st.dest == "Hjem" ? "Vel fremme · på vei hjem" : "Vel fremme · på vei til " + st.dest
        }
    }

    private var sub: String {
        if st.kind == "checkin" || st.kind == "soon" { return attr.recipients.replacingOccurrences(of: " følger med", with: "") + " har fått beskjed" }
        switch st.state {
        case "late": return "Familien har fått beskjed med posisjonen din"
        case "home": return attr.recipients.replacingOccurrences(of: " følger med", with: "") + " har fått beskjed · forsvinner om 5 min"
        default: return Hjemlys40LockView.genericLeg(st.leg) ? attr.recipients : st.leg + " · " + attr.recipients
        }
    }
}

/// «8 min» som teller ned (stor, grønn).
@available(iOS 16.2, *)
struct Hjemlys40BigLeft: View {
    let st: Hjemlys40Attributes.ContentState

    var body: some View {
        if st.etaDate > Date() {
            Text(timerInterval: Date()...st.etaDate, countsDown: true, showsHours: true)
                .font(.system(size: 22, weight: .bold)).monospacedDigit()
                .foregroundStyle(Hjemlys40Look.green)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 90, alignment: .trailing)
        } else {
            Text("nå").font(.system(size: 22, weight: .bold)).foregroundStyle(Hjemlys40Look.green)
        }
    }
}

/// StandBy / Apple Watch Smart Stack (.small): prikk, navn, minutter og tid.
@available(iOS 16.2, *)
struct Hjemlys40Small: View {
    let attr: Hjemlys40Attributes
    let st: Hjemlys40Attributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 2) {
                Hjemlys41Glow(size: 10, state: st.state)
                Text("Vel fremme").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.white.opacity(0.75))
            }
            Group {
                if st.state == "late" {
                    Text("\(st.lateMinutes) min over").foregroundStyle(Hjemlys40Look.red)
                } else if st.state == "home" {
                    Text("Hjemme ✓").foregroundStyle(Hjemlys40Look.gold)
                } else {
                    Text(Hjemlys40Look.mins(Hjemlys40Look.minutesLeft(st.eta))).foregroundStyle(Hjemlys40Look.green)
                }
            }
            .font(.system(size: 24, weight: .bold))
            .lineLimit(1).minimumScaleFactor(0.6)
            Text(st.leg.isEmpty ? Hjemlys40Look.clock(st.etaDate) : st.leg + " · " + Hjemlys40Look.clock(st.etaDate))
                .font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.7)).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
    }
}
#endif
