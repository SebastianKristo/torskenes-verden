import SwiftUI
import WidgetKit
import AppIntents
#if canImport(ActivityKit)
import ActivityKit
#endif

/* ---------------- Prompt 51 (IOSPLAT51): Live Activities for buss, pakker og nedlastinger ----------------
 Én ActivityConfiguration for Plat51Attributes (Plat51Intents.swift). kind styrer innholdet:
 – bus: «19 Ljabru» + nedtelling (Text(timerInterval:) – teller selv uten oppdateringer), knapp «Slutt å følge».
 – package: pakkenavn, status og fremdrift (steg av 4).
 – download: «Laster ned 2», fremdrift i prosent og fart.
 Kompakt: ikon til venstre, tid/prosent til høyre. Minimal: ikonet. Låseskjerm: kort med tittel, undertekst og fremdrift.
 «På vei hjem» (Sjekk inn) er Vel fremme/Hjemlys sin egen Live Activity (HjemlysLive40.swift). */

#if canImport(ActivityKit)
struct Plat51LiveWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: Plat51Attributes.self) { (ctx: ActivityViewContext<Plat51Attributes>) in
            Plat51LiveLock(attr: ctx.attributes, st: ctx.state)
                .activityBackgroundTint(Color(red: 0.08, green: 0.09, blue: 0.11).opacity(0.85))
                .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { (ctx: ActivityViewContext<Plat51Attributes>) in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Plat51LiveIcon(attr: ctx.attributes, size: 34).padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Plat51LiveValue(attr: ctx.attributes, st: ctx.state).font(.system(size: 22, weight: .semibold)).monospacedDigit().padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(ctx.state.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                        Text(ctx.state.sub).font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.7)).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Plat51LiveBottom(attr: ctx.attributes, st: ctx.state)
                }
            } compactLeading: {
                Plat51LiveIcon(attr: ctx.attributes, size: 20)
            } compactTrailing: {
                Plat51LiveValue(attr: ctx.attributes, st: ctx.state).font(.system(size: 13, weight: .semibold)).monospacedDigit().frame(maxWidth: 56)
            } minimal: {
                Plat51LiveIcon(attr: ctx.attributes, size: 20)
            }
            .keylineTint(Plat51LiveLook.tint(ctx.attributes))
            .widgetURL(Plat51LiveLook.link(ctx.attributes))
        }
    }
}

enum Plat51LiveLook {
    static func symbol(_ kind: String) -> String {
        switch kind {
        case "bus": return "bus.fill"
        case "package": return "shippingbox.fill"
        default: return "arrow.down.circle.fill"
        }
    }

    static let carrierHex: [String: String] = ["posten": "#E32D22", "bring": "#7BC144", "postnord": "#00A0D6", "dhl": "#FFCC00", "ups": "#7B5B3A",
                                              "fedex": "#4D148C", "gls": "#3C5AA8", "helthjem": "#5A54B0", "budbee": "#2BCE96", "instabox": "#FF4E00"]

    static func tint(_ a: Plat51Attributes) -> Color {
        switch a.kind {
        case "bus": return Plat51W.hex(a.color.isEmpty ? "#E60000" : a.color)
        case "package": return Plat51W.hex(carrierHex[a.color] ?? "#FF7A3D")
        default: return Plat51W.positive
        }
    }

    static func link(_ a: Plat51Attributes) -> URL {
        switch a.kind {
        case "bus": return Plat51W.link("avganger")
        case "package": return Plat51W.link("tracking")
        default: return Plat51W.link("media")
        }
    }
}

struct Plat51LiveIcon: View {
    let attr: Plat51Attributes
    let size: CGFloat
    var body: some View {
        Image(systemName: Plat51LiveLook.symbol(attr.kind))
            .font(.system(size: size * 0.55, weight: .semibold))
            .foregroundStyle(Color.white)
            .frame(width: size, height: size)
            .background(Plat51LiveLook.tint(attr), in: Circle())
            .accessibilityHidden(true)
    }
}

/// Bus: nedtelling. Pakke/nedlasting: verdien («Klar», «64 %»).
struct Plat51LiveValue: View {
    let attr: Plat51Attributes
    let st: Plat51Attributes.ContentState
    var body: some View {
        if attr.kind == "bus" && st.endAt > 0 {
            let now: Date = Date()
            if st.endDate.timeIntervalSince(now) > 1 {
                Text(timerInterval: now...st.endDate, countsDown: true).multilineTextAlignment(.trailing)
            } else {
                Text("nå")
            }
        } else {
            Text(st.value).lineLimit(1).minimumScaleFactor(0.6)
        }
    }
}

struct Plat51LiveBar: View {
    let progress: Double
    let tint: Color
    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.18))
                Capsule().fill(tint).frame(width: Swift.max(6, g.size.width * CGFloat(Swift.min(1, Swift.max(0, progress)))))
            }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }
}

struct Plat51LiveBottom: View {
    let attr: Plat51Attributes
    let st: Plat51Attributes.ContentState
    var body: some View {
        if attr.kind == "bus" {
            HStack {
                Text(st.endAt > 0 ? "Går " + Plat51W.clock(st.endAt) : "").font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.7))
                Spacer()
                Button(intent: BusStop51Intent(key: attr.key)) {
                    Text("Slutt å følge").font(.system(size: 12, weight: .semibold)).padding(.horizontal, 12).frame(height: 30)
                        .background(Color.white.opacity(0.16), in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 4)
        } else if st.progress >= 0 {
            Plat51LiveBar(progress: st.progress, tint: st.state == "stalled" ? Plat51W.warn : Plat51LiveLook.tint(attr)).padding(.horizontal, 6).padding(.bottom, 4)
        }
    }
}

struct Plat51LiveLock: View {
    let attr: Plat51Attributes
    let st: Plat51Attributes.ContentState

    private var voice: String {
        if attr.kind == "bus" && st.endAt > 0 {
            let m: Int = Swift.max(0, Int((st.endAt - Date().timeIntervalSince1970) / 60))
            return st.title + " fra " + st.sub + ", går om \(m) minutter"
        }
        return st.title + ", " + st.sub + (st.value.isEmpty ? "" : ", " + st.value)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Plat51LiveIcon(attr: attr, size: 38)
                VStack(alignment: .leading, spacing: 2) {
                    Text(st.title).font(.system(size: 16, weight: .semibold)).lineLimit(1)
                    Text(st.sub).font(.system(size: 13)).foregroundStyle(Color.white.opacity(0.7)).lineLimit(1)
                }
                Spacer(minLength: 6)
                Plat51LiveValue(attr: attr, st: st).font(.system(size: 24, weight: .semibold)).monospacedDigit()
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(voice)
            Plat51LiveBottom(attr: attr, st: st)
        }
        .foregroundStyle(Color.white)
        .padding(16)
    }
}
#endif
