import SwiftUI
import UIKit
import CoreMotion

/* ---------------- Prompt 28: ny væranimasjon (Vaer.dc.html → WxFx) ----------------
   Erstatter WxFx22/WxSky22. Én Canvas bak innholdet, tegnet med TimelineView(.animation). Lag i rekkefølge:
   stjerner (melkevei, glimt-kors, stjerneskudd) → sol (fra sunF = soloppgang/-nedgang) → skyer (forhåndstegnede
   sprites i dybdelag) → regn (3 lag, plask, dråper på glasset, torden med forgreinet lyn) → snø (3 lag + uskarpe
   nærflak) → tåke (grå bånd, aldri hvit flate). Parallakse fra gyroskopet (CoreMotion), «Reduser bevegelse» gir ett
   statisk bilde, og animasjonen står stille når appen ikke er aktiv. Simuleringen ligger i Weather28Sim.swift.
   Sprites tegnes én gang (Core Graphics) og gjenbrukes; partikler lages bare ved oppstart og ny størrelse. */

/// Hvilken animasjon som vises (samme valg som `fxK` i designet).
struct WxFxCfg28: Equatable {
    let kind: String
    let heavy: Bool
    let thunder: Bool
    let day: Bool

    static func from(code: Int, night: Bool) -> WxFxCfg28 {
        let k: String = wxFxKind22(code, night: night)
        let heavy: Bool = code == 65 || code == 82 || code >= 95
        return WxFxCfg28(kind: k, heavy: heavy, thunder: code >= 95, day: !night)
    }
}

/// Himmelen bak alt: gradientene fra `sky` i designet (prompt 28: klarere blå om dagen, grå tåke).
struct WxSky28: View {
    let code: Int
    let night: Bool

    var body: some View {
        LinearGradient(stops: stops, startPoint: .top, endPoint: .bottom)
    }

    private func s(_ hex: String, _ at: Double) -> Gradient.Stop {
        Gradient.Stop(color: Color(hex: hex), location: at)
    }

    private var stops: [Gradient.Stop] {
        if night { return [s("#0b1730", 0), s("#1c2d52", 0.55), s("#2a3f6a", 1)] }
        if code <= 2 { return [s("#1f5fc4", 0), s("#3a82d8", 0.42), s("#6aa8e8", 0.78), s("#9ccaf2", 1)] }
        if code == 3 { return [s("#4f6d8f", 0), s("#6a87a6", 0.55), s("#9bb0c5", 1)] }
        let rain: Bool = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95
        if rain { return [s("#3b4658", 0), s("#323d4e", 0.45), s("#2a3342", 1)] }
        let snow: Bool = (code >= 71 && code <= 77) || code >= 85
        if snow { return [s("#5e6b7c", 0), s("#7d8a9a", 0.55), s("#a3aebb", 1)] }
        return [s("#3f4d5e", 0), s("#556374", 0.55), s("#6f7d8d", 1)]
    }
}

/// Partikkellaget. `sunrise`/`sunset` gir solens plass (sunF 0–1 gjennom dagen).
struct WxFx28: View {
    let cfg: WxFxCfg28
    let sunrise: Date?
    let sunset: Date?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var phase
    @State private var sim: WxSim28 = WxSim28()

    var body: some View {
        let paused: Bool = reduceMotion || phase != .active
        TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: paused)) { tl in
            WxFxCanvas28(sim: sim, date: tl.date, cfg: cfg, still: reduceMotion, sunF: sunF(tl.date))
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear { WxMotion28.shared.set(on: !reduceMotion && phase == .active) }
        .onDisappear { WxMotion28.shared.set(on: false) }
        .onChange(of: phase) { _, p in WxMotion28.shared.set(on: !reduceMotion && p == .active) }
        .onChange(of: reduceMotion) { _, r in WxMotion28.shared.set(on: !r && phase == .active) }
    }

    private func sunF(_ now: Date) -> Double {
        guard let a = sunrise, let b = sunset, b > a else { return 0.5 }
        let f: Double = now.timeIntervalSince(a) / b.timeIntervalSince(a)
        if f.isNaN { return 0.5 }
        return Swift.min(1, Swift.max(0, f))
    }
}

/// Selve lerretet. Egen struct så Canvas tegnes på nytt for hver ny `date`.
struct WxFxCanvas28: View {
    let sim: WxSim28
    let date: Date
    let cfg: WxFxCfg28
    let still: Bool
    let sunF: Double

    var body: some View {
        let now: Double = date.timeIntervalSinceReferenceDate
        Canvas { (ctx: inout GraphicsContext, size: CGSize) in
            sim.render(&ctx, size: size, now: now, still: still, sunF: sunF, cfg: cfg)
        }
    }
}

/// Gyroskopet: leses (polles) i hver ramme, ingen tilbakekall og ingen allokering hos oss.
final class WxMotion28 {
    static let shared: WxMotion28 = WxMotion28()
    private let mgr: CMMotionManager = CMMotionManager()

    func set(on: Bool) {
        if on {
            guard mgr.isDeviceMotionAvailable, !mgr.isDeviceMotionActive else { return }
            mgr.deviceMotionUpdateInterval = 1.0 / 30.0
            mgr.startDeviceMotionUpdates()
        } else if mgr.isDeviceMotionActive {
            mgr.stopDeviceMotionUpdates()
        }
    }

    /// Helning som i designet (deviceorientation): x = gamma/25, y = (beta − 45)/25, begge −1…1.
    func tilt() -> CGPoint? {
        guard mgr.isDeviceMotionActive, let d = mgr.deviceMotion else { return nil }
        let gamma: Double = d.attitude.roll * 180.0 / Double.pi
        let beta: Double = d.attitude.pitch * 180.0 / Double.pi
        let x: Double = Swift.min(1, Swift.max(-1, gamma / 25.0))
        let y: Double = Swift.min(1, Swift.max(-1, (beta - 45.0) / 25.0))
        return CGPoint(x: x, y: y)
    }
}

/// RGB 0–255 som i designet.
struct WxRGB28: Equatable {
    let r: Double
    let g: Double
    let b: Double

    init(_ r: Double, _ g: Double, _ b: Double) {
        self.r = r
        self.g = g
        self.b = b
    }

    func color(_ a: Double) -> Color {
        Color(.sRGB, red: r / 255.0, green: g / 255.0, blue: b / 255.0, opacity: a)
    }

    func mix(_ o: WxRGB28, _ f: Double) -> WxRGB28 {
        let rr: Double = (r + (o.r - r) * f).rounded()
        let gg: Double = (g + (o.g - g) * f).rounded()
        let bb: Double = (b + (o.b - b) * f).rounded()
        return WxRGB28(rr, gg, bb)
    }

    static let white: WxRGB28 = WxRGB28(255, 255, 255)
}

/// Tilfeldig tall i [a, b) (tåler a ≥ b).
func wxR28(_ a: Double, _ b: Double) -> Double {
    a + Double.random(in: 0..<1) * (b - a)
}

/// Gradient fra (posisjon, farge, alfa).
func wxGrad28(_ stops: [(Double, WxRGB28, Double)]) -> Gradient {
    let list: [Gradient.Stop] = stops.map { s in Gradient.Stop(color: s.1.color(s.2), location: s.0) }
    return Gradient(stops: list)
}

/// Skyfargene per værtype (CF i designet).
struct WxCloudCfg28 {
    let n: Int
    let base: WxRGB28
    let lit: WxRGB28
    let sh: WxRGB28
    let y: (Double, Double)
    let w: (Double, Double)
    let a: (Double, Double)

    static func of(_ k: String) -> WxCloudCfg28? {
        switch k {
        case "part":
            return WxCloudCfg28(n: 4, base: WxRGB28(238, 244, 252), lit: WxRGB28(255, 255, 255), sh: WxRGB28(140, 165, 198), y: (0.1, 0.48), w: (0.55, 0.85), a: (0.75, 0.95))
        case "partn":
            return WxCloudCfg28(n: 5, base: WxRGB28(70, 85, 115), lit: WxRGB28(118, 134, 166), sh: WxRGB28(18, 26, 46), y: (0.04, 0.48), w: (0.6, 0.95), a: (0.5, 0.75))
        case "clouds":
            return WxCloudCfg28(n: 9, base: WxRGB28(198, 208, 221), lit: WxRGB28(238, 242, 248), sh: WxRGB28(86, 100, 122), y: (-0.1, 0.62), w: (0.7, 1.15), a: (0.45, 0.75))
        case "rain":
            return WxCloudCfg28(n: 9, base: WxRGB28(108, 118, 134), lit: WxRGB28(150, 160, 176), sh: WxRGB28(28, 34, 46), y: (-0.14, 0.32), w: (0.8, 1.25), a: (0.6, 0.85))
        case "snow":
            return WxCloudCfg28(n: 8, base: WxRGB28(188, 196, 209), lit: WxRGB28(232, 236, 243), sh: WxRGB28(108, 118, 136), y: (-0.12, 0.38), w: (0.75, 1.1), a: (0.5, 0.7))
        default:
            return nil
        }
    }
}

/// Forhåndstegnede sprites (Core Graphics, én gang per værtype).
enum WxSprites28 {
    private static var cloudCache: [String: [UIImage]] = [:]
    static let band: UIImage = makeBand()
    static let flake: UIImage = makeFlake()

    static func clouds(_ kind: String, _ cf: WxCloudCfg28) -> [UIImage] {
        if let c = cloudCache[kind] { return c }
        let list: [UIImage] = [makeCloud(cf), makeCloud(cf), makeCloud(cf)]
        cloudCache[kind] = list
        return list
    }

    private static func renderer(_ w: Double, _ h: Double) -> UIGraphicsImageRenderer {
        let fmt: UIGraphicsImageRendererFormat = UIGraphicsImageRendererFormat()
        fmt.scale = 1
        fmt.opaque = false
        return UIGraphicsImageRenderer(size: CGSize(width: w, height: h), format: fmt)
    }

    private static func cg(_ stops: [(Double, WxRGB28, Double)]) -> CGGradient? {
        var comps: [CGFloat] = []
        var locs: [CGFloat] = []
        for s in stops {
            comps.append(CGFloat(s.1.r / 255.0))
            comps.append(CGFloat(s.1.g / 255.0))
            comps.append(CGFloat(s.1.b / 255.0))
            comps.append(CGFloat(s.2))
            locs.append(CGFloat(s.0))
        }
        return CGGradient(colorSpace: CGColorSpaceCreateDeviceRGB(), colorComponents: comps, locations: locs, count: stops.count)
    }

    private static func radial(_ g: CGContext, _ x: Double, _ y: Double, _ r: Double, _ grad: CGGradient?) {
        guard let grad else { return }
        let c: CGPoint = CGPoint(x: x, y: y)
        g.drawRadialGradient(grad, startCenter: c, startRadius: 0, endCenter: c, endRadius: CGFloat(r), options: [])
    }

    /// Sky: 28 myke kuler langs en bue, lys topp oppe til venstre, skygge nederst (source-atop).
    private static func makeCloud(_ cf: WxCloudCfg28) -> UIImage {
        let w: Double = 768
        let h: Double = 320
        var pts: [(Double, Double, Double)] = []
        for _ in 0..<28 {
            let u: Double = wxR28(0.07, 0.93)
            let b: Double = sin(u * Double.pi)
            let r: Double = h * (0.09 + 0.22 * b) * wxR28(0.75, 1.25)
            let y: Double = h * 0.72 - b * h * 0.3 * wxR28(0.7, 1.1) + wxR28(-8, 8)
            pts.append((w * u, y, r))
        }
        let baseG: CGGradient? = cg([(0, cf.base, 0.9), (0.6, cf.base, 0.55), (1, cf.base, 0)])
        let litG: CGGradient? = cg([(0, cf.lit, 0.6), (1, cf.lit, 0)])
        let shG: CGGradient? = cg([(0, cf.sh, 0), (1, cf.sh, 0.7)])
        return renderer(w, h).image { rc in
            let g: CGContext = rc.cgContext
            for p in pts { radial(g, p.0, p.1, p.2, baseG) }
            for p in pts { radial(g, p.0 - p.2 * 0.18, p.1 - p.2 * 0.38, p.2 * 0.68, litG) }
            g.setBlendMode(.sourceAtop)
            if let shG {
                g.drawLinearGradient(shG, start: CGPoint(x: 0, y: h * 0.3), end: CGPoint(x: 0, y: h * 0.95),
                                     options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
            }
        }
    }

    /// Tåkebånd: grå (205, 211, 219) ellipse, aldri hvit.
    private static func makeBand() -> UIImage {
        let w: Double = 512
        let h: Double = 128
        let fog: WxRGB28 = WxRGB28(205, 211, 219)
        let grad: CGGradient? = cg([(0, fog, 0.9), (0.5, fog, 0.45), (1, fog, 0)])
        return renderer(w, h).image { rc in
            let g: CGContext = rc.cgContext
            g.scaleBy(x: 1, y: CGFloat(h / w))
            radial(g, w / 2, w / 2, w / 2, grad)
        }
    }

    private static func makeFlake() -> UIImage {
        let grad: CGGradient? = cg([(0, WxRGB28.white, 1), (0.35, WxRGB28.white, 0.75), (1, WxRGB28.white, 0)])
        return renderer(32, 32).image { rc in
            radial(rc.cgContext, 16, 16, 16, grad)
        }
    }
}
