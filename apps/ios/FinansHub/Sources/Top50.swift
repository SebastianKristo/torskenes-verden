import SwiftUI

/* ---------------- Prompt 50: topplinje som i Nyheter (Media og Studie) ----------------
 claude-code-media-topp-som-nyheter.md og claude-code-studie-topp-som-nyheter.md. Fasit: Media.dc.html (mobil-topp) og
 Nyhetsleser.dc.html. Én rad (min. 44 pt, gap 10): pilleknapp «‹ Tilbake» (36 pt, kant, gjennomsiktig, Manrope 600 13),
 kicker i mono (10.5, sporing .12em, lab, ellipsis) med tittel Newsreader 34 rett under, og runde 40 pt-knapper med kant
 til høyre. Den separate store tittelen under raden er borte. */

/// «‹ Tilbake» som i Nyhetsleser.
struct Back50Pill: View {
    @Environment(\.paper) private var p
    var label: String = "Tilbake"
    let action: () -> Void

    var body: some View {
        Button {
            Haptic34.back()
            action()
        } label: {
            Text("‹ " + label).font(PF.ui(13, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                .padding(.leading, 10).padding(.trailing, 14).frame(height: 36)
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .contentShape(Capsule())
                .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .fixedSize()
        .accessibilityLabel(label)
    }
}

/// Rund 40 pt-flate med kort-bakgrunn og kant (✦, ⋯, tannhjul).
struct Round50: ViewModifier {
    @Environment(\.paper) private var p

    func body(content: Content) -> some View {
        content
            .frame(width: 40, height: 40)
            .background(p.card, in: Circle())
            .overlay(Circle().stroke(p.line, lineWidth: 1))
            .frame(width: 44, height: 44)
            .contentShape(Circle())
    }
}

extension View {
    func round50() -> some View { modifier(Round50()) }
}

/// ✦-knappen (Glimt) i lab-farge.
struct Glimt50Button: View {
    @Environment(\.paper) private var p
    var label: String = "Spør Glimt"
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.shared.tap()
            action()
        } label: {
            Text("✦").font(PF.ui(16, .heavy)).foregroundStyle(p.lab).round50()
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Raden: tilbake, kicker + tittel og knappene til høyre.
struct Top50Bar<Trailing: View>: View {
    @Environment(\.paper) private var p
    let kicker: String
    let title: String
    let back: () -> Void
    @ViewBuilder let trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Back50Pill(action: back)
            VStack(alignment: .leading, spacing: 0) {
                Text(kicker.uppercased()).font(PF.mono(10.5)).tracking(1.26).foregroundStyle(p.lab)
                    .lineLimit(1).truncationMode(.tail)
                Text(title).font(PF.serif(34, medium: true)).foregroundStyle(p.ink)
                    .lineLimit(1).minimumScaleFactor(0.6)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .layoutPriority(1)
            trailing()
        }
        .frame(minHeight: 44)
    }
}
