import SwiftUI

/* ---------------- Prompt 39: sveip bort Brief og Bibelvers – mykt og elegant ---------------- */
// Spesifikasjon: claude-code-sveip-bort-smooth.md (fasit design/swipe-dismiss.js). Brukes av Brief36Swiper og Swipe37Card.
// Ingen sveipe-hint vises automatisk lenger (heller ikke ved første oppstart).

enum Swipe39 {
    /// Gummistrikk mot venstre: −(|dx|^0,7). Mot høyre følger kortet fingeren 1:1.
    static func rubber(_ tx: CGFloat) -> CGFloat {
        if tx >= 0 { return tx }
        return -CGFloat(pow(Double(abs(tx)), 0.7))
    }

    /// Terskel: 38 % av bredden, eller fart > 0,55 px/ms (550 pt/s) og dx > 36.
    static func passes(dx: CGFloat, width: CGFloat, velocity: CGFloat) -> Bool {
        if dx >= width * 0.38 { return true }
        return velocity > 550 && dx > 36
    }

    /// Slipp under terskel: fjær tilbake med liten overshoot.
    static let springBack: Animation = .spring(response: 0.38, dampingFraction: 0.72)

    /// Fly ut fra nåværende posisjon. Varigheten følger farten (0,17–0,32 s).
    static func flyDuration(dx: CGFloat, width: CGFloat, velocity: CGFloat) -> Double {
        let rest: Double = Double(Swift.max(0, width * 1.15 - dx))
        let v: Double = Double(Swift.max(600, velocity))
        return Swift.min(0.32, Swift.max(0.17, rest / v))
    }

    /// cubic-bezier(.2,.6,.3,1)
    static func flyCurve(_ d: Double) -> Animation { .timingCurve(0.2, 0.6, 0.3, 1, duration: d) }
}
