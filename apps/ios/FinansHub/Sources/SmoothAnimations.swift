import SwiftUI

/* ---------------- Prompt 71 (ANIIOS71): jevne animasjoner ----------------
 Spesifikasjon: prompt-51b-pakke/claude-code-animasjoner-jevne.md. Utseendet (bevegelse, varighet, kurver) er det samme;
 bare måten animasjonene kjøres på er endret:
 – Evige animasjoner (orb, skimmer) går på TimelineView(.animation) i små egne View-structer, uten Timer.publish/@State per bilde.
 – repeatForever brukes bare avgrenset til én egenskap (`.animation(_:body:)`, iOS 17), så evig animasjon aldri «lekker»
   inn i layout (kort som flyttes, størrelse som byttes, tekst som strømmer inn).
 – Wiggle: fast fase per flis ut fra nøkkelen (ikke plassen i lista), og stabile id-er.
 – Ark: designets fjær (respons 0,35 s, demping 0,85). «Reduser bevegelse» gir kort fade. */

enum Anim71 {
    /// Ark som glir opp/ned.
    static let sheet: Animation = .spring(response: 0.35, dampingFraction: 0.85)
    /// Kort fade (180 ms ease-out), også i stedet for bevegelse med «Reduser bevegelse».
    static let fade: Animation = .easeOut(duration: 0.18)

    /// Fast fortegn (+1/−1) per flis ut fra nøkkelen, så vuggingen ikke snur når flisene bytter plass.
    nonisolated static func sign(_ key: String) -> Double {
        var n: Int = 0
        for u in key.unicodeScalars { n &+= Int(u.value) }
        return n % 2 == 0 ? 1 : -1
    }

    /// Vinkel (grader) for en jevn rotasjon med periode `per` sekunder, startet i vinkelen `deg0` ved tiden `t0`.
    nonisolated static func turn(_ t: Double, per: Double, t0: Double = 0, deg0: Double = 0) -> Double {
        let d: Double = deg0 + (t - t0) / per * 360
        return d.truncatingRemainder(dividingBy: 360)
    }
}

/// Vugging: bare rotasjonen animeres. `up` er sidens felles fase (siden setter false → true når redigering starter),
/// `angle` er utslaget med fortegn. Av (`on` false) går flisa rolig tilbake til 0°.
struct Wiggle71: ViewModifier {
    let on: Bool
    let up: Bool
    let angle: Double
    let half: Double

    func body(content: Content) -> some View {
        let a: Double = on ? angle : 0
        let deg: Double = up ? a : -a
        let anim: Animation = on && a != 0
            ? Animation.easeInOut(duration: half).repeatForever(autoreverses: true)
            : Animation.easeOut(duration: 0.15)
        content.animation(anim) { $0.rotationEffect(.degrees(deg)) }
    }
}

/// Blinking/puls: bare opasiteten animeres (egen liten tilstand, start etter første bilde). Stille med «Reduser bevegelse».
struct Pulse71: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let from: Double
    let to: Double
    let half: Double
    /// Opasitet når bevegelse er redusert.
    var still: Double = 1
    @State private var on: Bool = false

    func body(content: Content) -> some View {
        let o: Double = reduce ? still : (on ? to : from)
        let anim: Animation? = reduce ? nil : Animation.easeInOut(duration: half).repeatForever(autoreverses: true)
        content
            .animation(anim) { $0.opacity(o) }
            .onAppear { Task { @MainActor in on = true } }
    }
}

extension View {
    func wiggle71(_ on: Bool, up: Bool, angle: Double, half: Double) -> some View {
        modifier(Wiggle71(on: on, up: up, angle: angle, half: half))
    }

    /// Fra `from` til `to` og tilbake, `half` sekunder hver vei.
    func pulse71(from: Double, to: Double, half: Double, still: Double = 1) -> some View {
        modifier(Pulse71(from: from, to: to, half: half, still: still))
    }
}
