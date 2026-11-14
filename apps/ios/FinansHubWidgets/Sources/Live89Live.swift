import SwiftUI
import WidgetKit
import AppIntents
#if canImport(ActivityKit)
import ActivityKit
#endif

/* ---------------- Prompt 89 (IOS89): visningene for de fem Live Activities (fasit Live Activities.dc.html) ----------------
 Brukes av Plat51LiveWidget (Plat51Live.swift) når kind er nedlasting | backup | spiller | avtale | pakke.
 – Låseskjerm / banner: bakgrunn Color(white: 0.11).opacity(0.86), padding 14×16. Rad: ikonflis 40 pt (aksent 18 %) · tittel 17
   semibold + undertittel 13 sekundær · verdi 22 semibold i aksent, monospacedDigit. Under: linje 6 pt (pakke: segmenter),
   meta-rad, knapper 40 pt høye.
 – Kompakt: SF Symbol i aksent til venstre, én verdi i aksent til høyre. Minimal: fremdriftsring i aksent med symbol.
 – Utvidet: leading ikonflis 44 pt, center tittel/undertittel, trailing stor verdi 26 pt, bottom linje + meta + knapper. Ingen faste
   bredder – systemet gir skjermbredde − 2×12 pt; høyden holdes under 160 pt.
 – StandBy / Alltid på (isLuminanceReduced): svart bakgrunn, tittel og stor verdi (64 pt), ingen knapper.
 – Tid tikker uten push: Text(timerInterval:) og ProgressView(timerInterval:) for spiller (posisjon) og avtale (tid igjen). */

#if canImport(ActivityKit)
enum Live89Look {
    static func accent(_ kind: String) -> Color { Plat51W.hex(Live89.accent(kind)) }
    static let background: Color = Color(white: 0.11).opacity(0.86)
    static let secondary: Color = Color.white.opacity(0.62)
    static let track: Color = Color.white.opacity(0.14)

    static func paused(_ st: Plat51Attributes.ContentState) -> Bool { st.state == "paused" }

    /// Tikker posisjonen / nedtellingen akkurat nå?
    static func ticking(_ kind: String, _ st: Plat51Attributes.ContentState) -> Bool {
        let now: Double = Date().timeIntervalSince1970
        if st.state != "active" || st.endAt <= now { return false }
        if kind == "spiller" { return st.startAt > 0 && st.startAt < st.endAt }
        return kind == "avtale"
    }

    /// Nå … slutt (aldri baklengs, så Text(timerInterval:) ikke får et tomt intervall).
    static func until(_ st: Plat51Attributes.ContentState) -> ClosedRange<Date> {
        let now: Date = Date()
        let end: Date = st.endDate > now ? st.endDate : now
        return now...end
    }

    /// Avtale: den siste timen før start (ringen og linja fylles mot starttiden).
    static func hourRange(_ st: Plat51Attributes.ContentState) -> ClosedRange<Date> {
        let end: Date = st.endDate
        return end.addingTimeInterval(-3600)...end
    }
}

/// Ikonflis: symbol i aksent på aksent med 18 % opasitet.
struct Live89Tile: View {
    let kind: String
    let st: Plat51Attributes.ContentState
    let size: CGFloat

    var body: some View {
        let ac: Color = Live89Look.accent(kind)
        Image(systemName: Live89.symbol(kind, paused: Live89Look.paused(st)))
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(ac)
            .frame(width: size, height: size)
            .background(ac.opacity(0.18), in: RoundedRectangle(cornerRadius: size * 0.3, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// Verdien: «62 %», posisjon «24:10» (tikker), «25 min», «4 stopp» / «Levert».
struct Live89Value: View {
    let kind: String
    let st: Plat51Attributes.ContentState

    var body: some View {
        if kind == "spiller" && Live89Look.ticking(kind, st) {
            Text(timerInterval: st.startDate...st.endDate, countsDown: false)
                .multilineTextAlignment(.trailing)
        } else {
            Text(st.value).lineLimit(1).minimumScaleFactor(0.6)
        }
    }
}

/// Stor verdi i StandBy: avtale teller ned (mm:ss), spiller teller opp, ellers verdien.
struct Live89BigValue: View {
    let kind: String
    let st: Plat51Attributes.ContentState

    var body: some View {
        if kind == "avtale" && Live89Look.ticking(kind, st) {
            Text(timerInterval: Live89Look.until(st), countsDown: true)
                .multilineTextAlignment(.center)
        } else {
            Live89Value(kind: kind, st: st)
        }
    }
}

/// Fremdriftslinje 6 pt (pakke: segmenter).
struct Live89Line: View {
    let kind: String
    let st: Plat51Attributes.ContentState

    var body: some View {
        let ac: Color = Live89Look.accent(kind)
        if st.segTotal > 0 {
            HStack(spacing: 4) {
                ForEach(0..<Swift.min(st.segTotal, 8), id: \.self) { (i: Int) in
                    Capsule().fill(i < st.segDone ? ac : Live89Look.track).frame(height: 6)
                }
            }
            .accessibilityHidden(true)
        } else if Live89Look.ticking(kind, st) {
            timed(ac)
        } else if st.progress >= 0 {
            Plat51LiveBar(progress: st.progress, tint: Live89Look.paused(st) ? ac.opacity(0.5) : ac)
        }
    }

    @ViewBuilder private func timed(_ ac: Color) -> some View {
        if kind == "spiller" {
            ProgressView(timerInterval: st.startDate...st.endDate, countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                .progressViewStyle(.linear).tint(ac).frame(height: 6)
                .accessibilityHidden(true)
        } else {
            ProgressView(timerInterval: Live89Look.hourRange(st), countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                .progressViewStyle(.linear).tint(ac).frame(height: 6)
                .accessibilityHidden(true)
        }
    }
}

/// Minimal: ring = fremdrift (spiller: posisjon, avtale: tid igjen av siste time, pakke: steg) med symbolet i midten.
struct Live89Ring: View {
    let kind: String
    let st: Plat51Attributes.ContentState

    var body: some View {
        let ac: Color = Live89Look.accent(kind)
        ZStack {
            ring(ac)
            Image(systemName: Live89.symbol(kind, paused: Live89Look.paused(st)))
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(ac)
        }
        .accessibilityLabel(Live89.name(kind) + ", " + st.value)
    }

    @ViewBuilder private func ring(_ ac: Color) -> some View {
        if Live89Look.ticking(kind, st) {
            if kind == "spiller" {
                ProgressView(timerInterval: st.startDate...st.endDate, countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                    .progressViewStyle(.circular).tint(ac)
            } else {
                ProgressView(timerInterval: Live89Look.hourRange(st), countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                    .progressViewStyle(.circular).tint(ac)
            }
        } else {
            ProgressView(value: fraction).progressViewStyle(.circular).tint(ac)
        }
    }

    private var fraction: Double {
        if st.segTotal > 0 { return Double(Swift.min(st.segDone, st.segTotal)) / Double(st.segTotal) }
        return st.progress >= 0 ? st.progress : 0
    }
}

/// Meta-rad: teksten under linja, og for spiller/avtale tiden som gjenstår (tikker).
struct Live89Meta: View {
    let kind: String
    let st: Plat51Attributes.ContentState

    var body: some View {
        HStack(spacing: 8) {
            Text(st.meta).lineLimit(1)
            Spacer(minLength: 6)
            if kind == "spiller" && Live89Look.ticking(kind, st) {
                Text(timerInterval: Live89Look.until(st), countsDown: true).multilineTextAlignment(.trailing).frame(maxWidth: 70, alignment: .trailing)
            }
        }
        .font(.system(size: 12.5))
        .monospacedDigit()
        .foregroundStyle(Live89Look.secondary)
    }
}

/// Knappene (40 pt høye): App Intents, «Vis rute» åpner appen.
struct Live89Buttons: View {
    let attr: Plat51Attributes
    let st: Plat51Attributes.ContentState

    var body: some View {
        HStack(spacing: 8) {
            ForEach(st.actions.prefix(2), id: \.id) { (b: Live89Btn) in
                button(b)
            }
        }
    }

    @ViewBuilder private func button(_ b: Live89Btn) -> some View {
        if b.id == "rute" {
            Link(destination: Live89.routeLink(attr.key)) { label(b) }
        } else {
            Button(intent: Live89ActionIntent(id: attr.key, handling: b.id)) { label(b) }
                .buttonStyle(.plain)
        }
    }

    private func label(_ b: Live89Btn) -> some View {
        Text(b.title)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Color.white)
            .lineLimit(1)
            .frame(maxWidth: .infinity)
            .frame(height: 40)
            .background(Color.white.opacity(0.16), in: Capsule())
            .contentShape(Capsule())
    }
}

/// Låseskjerm / banner (og StandBy).
struct Live89Lock: View {
    let attr: Plat51Attributes
    let st: Plat51Attributes.ContentState
    @Environment(\.isLuminanceReduced) private var dim

    var body: some View {
        if dim { standBy } else { full }
    }

    private var voice: String {
        var parts: [String] = [Live89.name(attr.kind), st.title]
        if !st.sub.isEmpty { parts.append(st.sub) }
        if !st.value.isEmpty { parts.append(st.value) }
        if !st.meta.isEmpty { parts.append(st.meta) }
        return parts.joined(separator: ", ")
    }

    private var full: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Live89Tile(kind: attr.kind, st: st, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(st.title).font(.system(size: 17, weight: .semibold)).lineLimit(1)
                    Text(st.sub).font(.system(size: 13)).foregroundStyle(Live89Look.secondary).lineLimit(1)
                }
                Spacer(minLength: 6)
                Live89Value(kind: attr.kind, st: st)
                    .font(.system(size: 22, weight: .semibold)).monospacedDigit()
                    .foregroundStyle(Live89Look.accent(attr.kind))
                    .frame(maxWidth: 96, alignment: .trailing)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(voice)
            Live89Line(kind: attr.kind, st: st)
            if !st.meta.isEmpty { Live89Meta(kind: attr.kind, st: st) }
            if !st.actions.isEmpty { Live89Buttons(attr: attr, st: st) }
        }
        .foregroundStyle(Color.white)
        .padding(.horizontal, 16).padding(.vertical, 14)
    }

    /// StandBy / Alltid på: svart, tittel og stor verdi.
    private var standBy: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Image(systemName: Live89.symbol(attr.kind, paused: Live89Look.paused(st)))
                    .font(.system(size: 15, weight: .semibold))
                Text(st.title).font(.system(size: 17, weight: .semibold)).lineLimit(1)
            }
            .foregroundStyle(Live89Look.accent(attr.kind).opacity(0.8))
            Live89BigValue(kind: attr.kind, st: st)
                .font(.system(size: 64, weight: .semibold)).monospacedDigit()
                .minimumScaleFactor(0.5).lineLimit(1)
                .foregroundStyle(Color.white.opacity(0.85))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(Color.black)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(voice)
    }
}

/// Utvidet: bunnen (linje, meta og knapper).
struct Live89ExpandedBottom: View {
    let attr: Plat51Attributes
    let st: Plat51Attributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Live89Line(kind: attr.kind, st: st)
            if !st.meta.isEmpty { Live89Meta(kind: attr.kind, st: st) }
            if !st.actions.isEmpty { Live89Buttons(attr: attr, st: st) }
        }
        .foregroundStyle(Color.white)
        .padding(.horizontal, 4)
        .frame(maxHeight: 96)
    }
}

struct Live89ExpandedCenter: View {
    let st: Plat51Attributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(st.title).font(.system(size: 16, weight: .semibold)).lineLimit(1)
            Text(st.sub).font(.system(size: 13)).foregroundStyle(Live89Look.secondary).lineLimit(1)
        }
        .foregroundStyle(Color.white)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
#endif
