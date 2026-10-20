import SwiftUI

/* ---------------- Prompt 38: Glimt i prestedrakt (bibelvers i briefen og på Bibel-siden) ----------------
   Fasit: design/Bibelvers.dc.html → priest(S, mood) og prompts/prompt-38-pakke/claude-code-bibelvers.md.
   Lys kjortel/alb (#f6f1e7, kant #c9bfa9) med rød stola (to bånd med gullstripe) og brunt belte (viewBox 116×62, bredde S·1,16,
   høyde S·0,62, nederst −S·0,34), liten mørk bibel med gyllent ✝ (S·0,36 × S·0,28, rotert −10°) og pulserende gylden glorie
   (S·0,78 × S·0,22, kant S·0,05, glød, bvHalo 2,8 s). Figuren dupper rolig (bvBob 3 s). still = «Reduser bevegelse»/widget:
   ingen dupping og fast glorie. Samme mønster som Glimt36Outfits.swift (G36Svg/G36Part), delt mellom appen og widgetene. */

/// Kjortelen med stola og belte (viewBox 116×62).
struct G38Robe: View {
    let S: CGFloat

    var body: some View {
        let w: CGFloat = S * 1.16
        let k: CGFloat = w / 116
        let vb: CGSize = CGSize(width: 116, height: 62)
        let red: Color = G35.c(0xb23a2a)
        let gold: Color = G35.c(0xf2c14e)
        ZStack(alignment: .topLeading) {
            G36Part(shape: G36Svg(d: "M18 8 Q58 22 98 8 L110 58 Q58 66 6 58 Z", vb: vb), fill: G35.c(0xf6f1e7), stroke: G35.c(0xc9bfa9), lw: 1.6, k: k)
            G36Part(shape: G36Svg(d: "M44 12 L40 60 L50 60 L54 16 Z", vb: vb), fill: red, k: k)
            G36Part(shape: G36Svg(d: "M72 12 L76 60 L66 60 L62 16 Z", vb: vb), fill: red, k: k)
            G36Part(shape: G36Svg(d: "M42 34 h8", vb: vb), stroke: gold, lw: 2, k: k)
            G36Part(shape: G36Svg(d: "M66 34 h8", vb: vb), stroke: gold, lw: 2, k: k)
            G36Part(shape: G36Svg(d: "M24 40 Q58 48 92 40", vb: vb), stroke: G35.c(0xa8661a), lw: 3, k: k, cap: .round)
        }
        .frame(width: w, height: S * 0.62, alignment: .topLeading)
    }
}

/// Liten mørk bibel med gyllent ✝, rotert −10°.
struct G38Bible: View {
    let S: CGFloat

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 3, style: .continuous).fill(G35.c(0x3b2a1a))
            RoundedRectangle(cornerRadius: 3, style: .continuous).strokeBorder(G35.c(0x6b4a2a), lineWidth: 2)
            Text("✝").font(.system(size: S * 0.16, weight: .heavy)).foregroundStyle(G35.c(0xf2c14e))
        }
        .frame(width: S * 0.36, height: S * 0.28)
        .rotationEffect(.degrees(-10))
    }
}

/// Gylden glorie (ellipse med kant og glød). pulse 0…1 styrer gløden.
struct G38Halo: View {
    let S: CGFloat
    let pulse: Double

    var body: some View {
        let gold: Color = G35.c(0xf2c14e)
        Ellipse()
            .strokeBorder(gold, lineWidth: Swift.max(1.5, S * 0.05))
            .frame(width: S * 0.78, height: S * 0.22)
            .shadow(color: gold.opacity(0.45 + 0.35 * pulse), radius: S * (0.08 + 0.06 * CGFloat(pulse)))
            .opacity(0.8 + 0.2 * pulse)
    }
}

/// Figuren i prestedrakt. body0 = figuren (S × S). t = sekunder (TimelineView), still = ingen bevegelse.
struct G38Priest<Fig: View>: View {
    let S: CGFloat
    let t: Double
    var still: Bool = false
    @ViewBuilder let body0: () -> Fig

    var body: some View {
        let bobP: Double = still ? 0 : G36Anim.loop(t, 3)
        let bob: Double = G36Anim.kf(bobP, [(0, 0), (0.5, -1), (1, 0)])
        let haloP: Double = still ? 0.5 : G36Anim.loop(t, 2.8)
        let pulse: Double = G36Anim.kf(haloP, [(0, 0), (0.5, 1), (1, 0)])
        ZStack(alignment: .topLeading) {
            G38Halo(S: S, pulse: pulse).offset(x: S * 0.5 - S * 0.39, y: -S * 0.2)
            body0().frame(width: S, height: S, alignment: .topLeading).glimt40NoJul()
            G38Robe(S: S).offset(x: S * 0.5 - S * 0.58, y: S + S * 0.34 - S * 0.62)
            G38Bible(S: S).offset(x: S + S * 0.16 - S * 0.36, y: S + S * 0.2 - S * 0.28)
        }
        .frame(width: S, height: S, alignment: .topLeading)
        .padding(.top, S * 0.2)
        .padding(.bottom, S * 0.34)
        .offset(y: CGFloat(bob) * S * 0.04)
    }
}

/// Ferdig figur: Glimt (eller brukerens vert) i prestedrakt med egen klokke. Brukes i briefen (46) og på Bibel-siden (72).
struct Glimt38PriestFig: View {
    let id: String
    let size: CGFloat
    var mood: Glimt35Mood = .idle
    var still: Bool = false

    var body: some View {
        Group {
            if still {
                G38Priest(S: size, t: 0, still: true) { Glimt35Fig(id: id, size: size, mood: mood, still: true) }
            } else {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { (ctx: TimelineViewDefaultContext) in
                    let t: Double = ctx.date.timeIntervalSinceReferenceDate
                    G38Priest(S: size, t: t) { Glimt35Fig(id: id, size: size, mood: mood, t: t) }
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityLabel("Glimt i prestedrakt")
    }
}
