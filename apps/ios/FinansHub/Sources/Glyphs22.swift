import SwiftUI

/* ---------------- Prompt 22: ikonene fra designet som Path ---------------- */
// Generert fra SVG-banene i design/Vaer.dc.html (viewBox 24 × 24) og den offisielle Google-«G»-en i
// design/Mobil Papir App.dc.html (viewBox 48 × 48). Buer (A/a) er gjort om til kubiske kurver, ellers er
// koordinatene de samme som i SVG-en. Ikke tegn dem på nytt for hånd.

enum Glyph22 {
    /// Tegner ikonet med navnet i 24 × 24-koordinater. Ukjent navn gir tom bane.
    static func draw(_ name: String, _ p: inout Path) {
        switch name {
        case "sun": sun(&p)
        case "moon": moon(&p)
        case "part": part(&p)
        case "cloud": cloud(&p)
        case "rain": rain(&p)
        case "snow": snow(&p)
        case "fog": fog(&p)
        case "storm": storm(&p)
        case "drop": drop(&p)
        case "wind": wind(&p)
        case "hMoonRing": hMoonRing(&p)
        case "hMoonFill": hMoonFill(&p)
        case "hSun": hSun(&p)
        case "hUv": hUv(&p)
        case "hFeel": hFeel(&p)
        case "hYd": hYd(&p)
        case "hVis": hVis(&p)
        case "hHum": hHum(&p)
        case "hPres": hPres(&p)
        case "map": map(&p)
        case "menu": menu(&p)
        case "search": search(&p)
        default: break
        }
    }

    static func sun(_ p: inout Path) {
        p.move(to: CGPoint(x: 12.0, y: 7.0))
        p.addCurve(to: CGPoint(x: 7.0, y: 12.0), control1: CGPoint(x: 9.239, y: 7.0), control2: CGPoint(x: 7.0, y: 9.239))
        p.addCurve(to: CGPoint(x: 12.0, y: 17.0), control1: CGPoint(x: 7.0, y: 14.761), control2: CGPoint(x: 9.239, y: 17.0))
        p.addCurve(to: CGPoint(x: 17.0, y: 12.0), control1: CGPoint(x: 14.761, y: 17.0), control2: CGPoint(x: 17.0, y: 14.761))
        p.addCurve(to: CGPoint(x: 12.0, y: 7.0), control1: CGPoint(x: 17.0, y: 9.239), control2: CGPoint(x: 14.761, y: 7.0))
        p.closeSubpath()
        p.move(to: CGPoint(x: 12.0, y: 1.0))
        p.addLine(to: CGPoint(x: 12.0, y: 3.0))
        p.move(to: CGPoint(x: 12.0, y: 21.0))
        p.addLine(to: CGPoint(x: 12.0, y: 23.0))
        p.move(to: CGPoint(x: 4.2, y: 4.2))
        p.addLine(to: CGPoint(x: 5.6, y: 5.6))
        p.move(to: CGPoint(x: 18.4, y: 18.4))
        p.addLine(to: CGPoint(x: 19.8, y: 19.8))
        p.move(to: CGPoint(x: 1.0, y: 12.0))
        p.addLine(to: CGPoint(x: 3.0, y: 12.0))
        p.move(to: CGPoint(x: 21.0, y: 12.0))
        p.addLine(to: CGPoint(x: 23.0, y: 12.0))
        p.move(to: CGPoint(x: 4.2, y: 19.8))
        p.addLine(to: CGPoint(x: 5.6, y: 18.4))
        p.move(to: CGPoint(x: 18.4, y: 5.6))
        p.addLine(to: CGPoint(x: 19.8, y: 4.2))
    }
    static func moon(_ p: inout Path) {
        p.move(to: CGPoint(x: 21.0, y: 12.8))
        p.addCurve(to: CGPoint(x: 11.759, y: 20.956), control1: CGPoint(x: 20.557, y: 17.532), control2: CGPoint(x: 16.51, y: 21.104))
        p.addCurve(to: CGPoint(x: 3.044, y: 12.241), control1: CGPoint(x: 7.008, y: 20.809), control2: CGPoint(x: 3.191, y: 16.992))
        p.addCurve(to: CGPoint(x: 11.2, y: 3.0), control1: CGPoint(x: 2.896, y: 7.49), control2: CGPoint(x: 6.468, y: 3.443))
        p.addCurve(to: CGPoint(x: 11.85, y: 12.15), control1: CGPoint(x: 9.11, y: 5.787), control2: CGPoint(x: 9.387, y: 9.687))
        p.addCurve(to: CGPoint(x: 21.0, y: 12.8), control1: CGPoint(x: 14.313, y: 14.613), control2: CGPoint(x: 18.213, y: 14.89))
        p.closeSubpath()
    }
    static func part(_ p: inout Path) {
        p.move(to: CGPoint(x: 8.0, y: 4.0))
        p.addLine(to: CGPoint(x: 8.0, y: 5.5))
        p.move(to: CGPoint(x: 3.5, y: 9.0))
        p.addLine(to: CGPoint(x: 5.0, y: 9.0))
        p.move(to: CGPoint(x: 4.8, y: 5.8))
        p.addLine(to: CGPoint(x: 5.8, y: 6.8))
        p.move(to: CGPoint(x: 11.2, y: 5.8))
        p.addLine(to: CGPoint(x: 10.2, y: 6.8))
        p.move(to: CGPoint(x: 8.0, y: 7.0))
        p.addCurve(to: CGPoint(x: 5.571, y: 8.279), control1: CGPoint(x: 7.031, y: 7.009), control2: CGPoint(x: 6.126, y: 7.486))
        p.addCurve(to: CGPoint(x: 5.2, y: 11.0), control1: CGPoint(x: 5.015, y: 9.073), control2: CGPoint(x: 4.877, y: 10.087))
        p.move(to: CGPoint(x: 7.0, y: 19.0))
        p.addLine(to: CGPoint(x: 17.0, y: 19.0))
        p.addCurve(to: CGPoint(x: 21.0, y: 15.0), control1: CGPoint(x: 19.209, y: 19.0), control2: CGPoint(x: 21.0, y: 17.209))
        p.addCurve(to: CGPoint(x: 17.0, y: 11.0), control1: CGPoint(x: 21.0, y: 12.791), control2: CGPoint(x: 19.209, y: 11.0))
        p.addCurve(to: CGPoint(x: 11.247, y: 7.917), control1: CGPoint(x: 15.965, y: 8.823), control2: CGPoint(x: 13.633, y: 7.573))
        p.addCurve(to: CGPoint(x: 6.6, y: 12.5), control1: CGPoint(x: 8.861, y: 8.261), control2: CGPoint(x: 6.977, y: 10.119))
        p.addCurve(to: CGPoint(x: 4.041, y: 15.92), control1: CGPoint(x: 5.025, y: 12.86), control2: CGPoint(x: 3.942, y: 14.307))
        p.addCurve(to: CGPoint(x: 7.0, y: 19.0), control1: CGPoint(x: 4.141, y: 17.532), control2: CGPoint(x: 5.393, y: 18.836))
        p.closeSubpath()
    }
    static func cloud(_ p: inout Path) {
        p.move(to: CGPoint(x: 7.0, y: 18.0))
        p.addLine(to: CGPoint(x: 17.0, y: 18.0))
        p.addCurve(to: CGPoint(x: 21.0, y: 14.0), control1: CGPoint(x: 19.209, y: 18.0), control2: CGPoint(x: 21.0, y: 16.209))
        p.addCurve(to: CGPoint(x: 17.0, y: 10.0), control1: CGPoint(x: 21.0, y: 11.791), control2: CGPoint(x: 19.209, y: 10.0))
        p.addCurve(to: CGPoint(x: 10.673, y: 6.329), control1: CGPoint(x: 15.967, y: 7.484), control2: CGPoint(x: 13.371, y: 5.977))
        p.addCurve(to: CGPoint(x: 5.5, y: 11.5), control1: CGPoint(x: 7.976, y: 6.68), control2: CGPoint(x: 5.853, y: 8.803))
        p.addCurve(to: CGPoint(x: 3.873, y: 15.299), control1: CGPoint(x: 4.188, y: 12.277), control2: CGPoint(x: 3.53, y: 13.813))
        p.addCurve(to: CGPoint(x: 7.0, y: 18.0), control1: CGPoint(x: 4.216, y: 16.784), control2: CGPoint(x: 5.481, y: 17.877))
        p.closeSubpath()
    }
    static func rain(_ p: inout Path) {
        p.move(to: CGPoint(x: 7.0, y: 14.0))
        p.addLine(to: CGPoint(x: 17.0, y: 14.0))
        p.addCurve(to: CGPoint(x: 21.0, y: 10.0), control1: CGPoint(x: 19.209, y: 14.0), control2: CGPoint(x: 21.0, y: 12.209))
        p.addCurve(to: CGPoint(x: 17.0, y: 6.0), control1: CGPoint(x: 21.0, y: 7.791), control2: CGPoint(x: 19.209, y: 6.0))
        p.addCurve(to: CGPoint(x: 10.673, y: 2.329), control1: CGPoint(x: 15.967, y: 3.484), control2: CGPoint(x: 13.371, y: 1.977))
        p.addCurve(to: CGPoint(x: 5.5, y: 7.5), control1: CGPoint(x: 7.976, y: 2.68), control2: CGPoint(x: 5.853, y: 4.803))
        p.addCurve(to: CGPoint(x: 3.873, y: 11.299), control1: CGPoint(x: 4.188, y: 8.277), control2: CGPoint(x: 3.53, y: 9.813))
        p.addCurve(to: CGPoint(x: 7.0, y: 14.0), control1: CGPoint(x: 4.216, y: 12.784), control2: CGPoint(x: 5.481, y: 13.877))
        p.closeSubpath()
        p.move(to: CGPoint(x: 8.0, y: 17.0))
        p.addLine(to: CGPoint(x: 7.0, y: 20.0))
        p.move(to: CGPoint(x: 12.0, y: 17.0))
        p.addLine(to: CGPoint(x: 11.0, y: 20.0))
        p.move(to: CGPoint(x: 16.0, y: 17.0))
        p.addLine(to: CGPoint(x: 15.0, y: 20.0))
    }
    static func snow(_ p: inout Path) {
        p.move(to: CGPoint(x: 7.0, y: 14.0))
        p.addLine(to: CGPoint(x: 17.0, y: 14.0))
        p.addCurve(to: CGPoint(x: 21.0, y: 10.0), control1: CGPoint(x: 19.209, y: 14.0), control2: CGPoint(x: 21.0, y: 12.209))
        p.addCurve(to: CGPoint(x: 17.0, y: 6.0), control1: CGPoint(x: 21.0, y: 7.791), control2: CGPoint(x: 19.209, y: 6.0))
        p.addCurve(to: CGPoint(x: 10.673, y: 2.329), control1: CGPoint(x: 15.967, y: 3.484), control2: CGPoint(x: 13.371, y: 1.977))
        p.addCurve(to: CGPoint(x: 5.5, y: 7.5), control1: CGPoint(x: 7.976, y: 2.68), control2: CGPoint(x: 5.853, y: 4.803))
        p.addCurve(to: CGPoint(x: 3.873, y: 11.299), control1: CGPoint(x: 4.188, y: 8.277), control2: CGPoint(x: 3.53, y: 9.813))
        p.addCurve(to: CGPoint(x: 7.0, y: 14.0), control1: CGPoint(x: 4.216, y: 12.784), control2: CGPoint(x: 5.481, y: 13.877))
        p.closeSubpath()
        p.move(to: CGPoint(x: 8.0, y: 18.0))
        p.addLine(to: CGPoint(x: 8.01, y: 18.0))
        p.move(to: CGPoint(x: 12.0, y: 20.0))
        p.addLine(to: CGPoint(x: 12.01, y: 20.0))
        p.move(to: CGPoint(x: 16.0, y: 18.0))
        p.addLine(to: CGPoint(x: 16.01, y: 18.0))
    }
    static func fog(_ p: inout Path) {
        p.move(to: CGPoint(x: 4.0, y: 10.0))
        p.addLine(to: CGPoint(x: 20.0, y: 10.0))
        p.move(to: CGPoint(x: 6.0, y: 14.0))
        p.addLine(to: CGPoint(x: 18.0, y: 14.0))
        p.move(to: CGPoint(x: 4.0, y: 18.0))
        p.addLine(to: CGPoint(x: 20.0, y: 18.0))
    }
    static func storm(_ p: inout Path) {
        p.move(to: CGPoint(x: 7.0, y: 13.0))
        p.addLine(to: CGPoint(x: 17.0, y: 13.0))
        p.addCurve(to: CGPoint(x: 21.0, y: 9.0), control1: CGPoint(x: 19.209, y: 13.0), control2: CGPoint(x: 21.0, y: 11.209))
        p.addCurve(to: CGPoint(x: 17.0, y: 5.0), control1: CGPoint(x: 21.0, y: 6.791), control2: CGPoint(x: 19.209, y: 5.0))
        p.addCurve(to: CGPoint(x: 10.673, y: 1.329), control1: CGPoint(x: 15.967, y: 2.484), control2: CGPoint(x: 13.371, y: 0.977))
        p.addCurve(to: CGPoint(x: 5.5, y: 6.5), control1: CGPoint(x: 7.976, y: 1.68), control2: CGPoint(x: 5.853, y: 3.803))
        p.addCurve(to: CGPoint(x: 3.873, y: 10.299), control1: CGPoint(x: 4.188, y: 7.277), control2: CGPoint(x: 3.53, y: 8.813))
        p.addCurve(to: CGPoint(x: 7.0, y: 13.0), control1: CGPoint(x: 4.216, y: 11.784), control2: CGPoint(x: 5.481, y: 12.877))
        p.closeSubpath()
        p.move(to: CGPoint(x: 12.0, y: 14.0))
        p.addLine(to: CGPoint(x: 10.0, y: 18.0))
        p.addLine(to: CGPoint(x: 13.0, y: 18.0))
        p.addLine(to: CGPoint(x: 11.0, y: 22.0))
    }
    static func drop(_ p: inout Path) {
        p.move(to: CGPoint(x: 12.0, y: 3.0))
        p.addCurve(to: CGPoint(x: 18.0, y: 14.0), control1: CGPoint(x: 15.0, y: 7.0), control2: CGPoint(x: 18.0, y: 10.5))
        p.addCurve(to: CGPoint(x: 12.0, y: 20.0), control1: CGPoint(x: 18.0, y: 17.314), control2: CGPoint(x: 15.314, y: 20.0))
        p.addCurve(to: CGPoint(x: 6.0, y: 14.0), control1: CGPoint(x: 8.686, y: 20.0), control2: CGPoint(x: 6.0, y: 17.314))
        p.addCurve(to: CGPoint(x: 12.0, y: 3.0), control1: CGPoint(x: 6.0, y: 10.5), control2: CGPoint(x: 9.0, y: 7.0))
        p.closeSubpath()
    }
    static func wind(_ p: inout Path) {
        p.move(to: CGPoint(x: 3.0, y: 8.0))
        p.addLine(to: CGPoint(x: 14.0, y: 8.0))
        p.addCurve(to: CGPoint(x: 17.0, y: 5.0), control1: CGPoint(x: 15.657, y: 8.0), control2: CGPoint(x: 17.0, y: 6.657))
        p.addCurve(to: CGPoint(x: 14.0, y: 2.0), control1: CGPoint(x: 17.0, y: 3.343), control2: CGPoint(x: 15.657, y: 2.0))
        p.addCurve(to: CGPoint(x: 11.0, y: 5.0), control1: CGPoint(x: 12.343, y: 2.0), control2: CGPoint(x: 11.0, y: 3.343))
        p.move(to: CGPoint(x: 3.0, y: 12.0))
        p.addLine(to: CGPoint(x: 19.0, y: 12.0))
        p.addCurve(to: CGPoint(x: 22.0, y: 15.0), control1: CGPoint(x: 20.657, y: 12.0), control2: CGPoint(x: 22.0, y: 13.343))
        p.addCurve(to: CGPoint(x: 19.0, y: 18.0), control1: CGPoint(x: 22.0, y: 16.657), control2: CGPoint(x: 20.657, y: 18.0))
        p.addCurve(to: CGPoint(x: 16.0, y: 15.0), control1: CGPoint(x: 17.343, y: 18.0), control2: CGPoint(x: 16.0, y: 16.657))
        p.move(to: CGPoint(x: 3.0, y: 16.0))
        p.addLine(to: CGPoint(x: 11.0, y: 16.0))
    }
    static func hMoonRing(_ p: inout Path) {
        p.addEllipse(in: CGRect(x: 3.0, y: 3.0, width: 18.0, height: 18.0))
    }
    static func hMoonFill(_ p: inout Path) {
        p.move(to: CGPoint(x: 12.0, y: 3.0))
        p.addCurve(to: CGPoint(x: 21.0, y: 12.0), control1: CGPoint(x: 16.971, y: 3.0), control2: CGPoint(x: 21.0, y: 7.029))
        p.addCurve(to: CGPoint(x: 12.0, y: 21.0), control1: CGPoint(x: 21.0, y: 16.971), control2: CGPoint(x: 16.971, y: 21.0))
        p.closeSubpath()
    }
    static func hSun(_ p: inout Path) {
        p.move(to: CGPoint(x: 3.0, y: 18.0))
        p.addLine(to: CGPoint(x: 21.0, y: 18.0))
        p.move(to: CGPoint(x: 7.0, y: 14.0))
        p.addCurve(to: CGPoint(x: 12.0, y: 9.0), control1: CGPoint(x: 7.0, y: 11.239), control2: CGPoint(x: 9.239, y: 9.0))
        p.addCurve(to: CGPoint(x: 17.0, y: 14.0), control1: CGPoint(x: 14.761, y: 9.0), control2: CGPoint(x: 17.0, y: 11.239))
        p.move(to: CGPoint(x: 12.0, y: 4.0))
        p.addLine(to: CGPoint(x: 12.0, y: 7.0))
        p.move(to: CGPoint(x: 5.0, y: 8.0))
        p.addLine(to: CGPoint(x: 6.5, y: 9.5))
        p.move(to: CGPoint(x: 19.0, y: 8.0))
        p.addLine(to: CGPoint(x: 17.5, y: 9.5))
    }
    static func hUv(_ p: inout Path) {
        p.addEllipse(in: CGRect(x: 8.0, y: 8.0, width: 8.0, height: 8.0))
        p.move(to: CGPoint(x: 12.0, y: 2.0))
        p.addLine(to: CGPoint(x: 12.0, y: 4.0))
        p.move(to: CGPoint(x: 12.0, y: 20.0))
        p.addLine(to: CGPoint(x: 12.0, y: 22.0))
        p.move(to: CGPoint(x: 2.0, y: 12.0))
        p.addLine(to: CGPoint(x: 4.0, y: 12.0))
        p.move(to: CGPoint(x: 20.0, y: 12.0))
        p.addLine(to: CGPoint(x: 22.0, y: 12.0))
        p.move(to: CGPoint(x: 5.0, y: 5.0))
        p.addLine(to: CGPoint(x: 6.5, y: 6.5))
        p.move(to: CGPoint(x: 17.5, y: 17.5))
        p.addLine(to: CGPoint(x: 19.0, y: 19.0))
        p.move(to: CGPoint(x: 5.0, y: 19.0))
        p.addLine(to: CGPoint(x: 6.5, y: 17.5))
        p.move(to: CGPoint(x: 17.5, y: 6.5))
        p.addLine(to: CGPoint(x: 19.0, y: 5.0))
    }
    static func hFeel(_ p: inout Path) {
        p.move(to: CGPoint(x: 10.0, y: 14.0))
        p.addLine(to: CGPoint(x: 10.0, y: 5.0))
        p.addCurve(to: CGPoint(x: 12.0, y: 3.0), control1: CGPoint(x: 10.0, y: 3.895), control2: CGPoint(x: 10.895, y: 3.0))
        p.addCurve(to: CGPoint(x: 14.0, y: 5.0), control1: CGPoint(x: 13.105, y: 3.0), control2: CGPoint(x: 14.0, y: 3.895))
        p.addLine(to: CGPoint(x: 14.0, y: 14.0))
        p.addCurve(to: CGPoint(x: 15.864, y: 18.499), control1: CGPoint(x: 15.568, y: 14.905), control2: CGPoint(x: 16.332, y: 16.751))
        p.addCurve(to: CGPoint(x: 12.0, y: 21.464), control1: CGPoint(x: 15.395, y: 20.248), control2: CGPoint(x: 13.81, y: 21.464))
        p.addCurve(to: CGPoint(x: 8.136, y: 18.499), control1: CGPoint(x: 10.19, y: 21.464), control2: CGPoint(x: 8.605, y: 20.248))
        p.addCurve(to: CGPoint(x: 10.0, y: 14.0), control1: CGPoint(x: 7.668, y: 16.751), control2: CGPoint(x: 8.432, y: 14.905))
        p.closeSubpath()
    }
    static func hYd(_ p: inout Path) {
        p.move(to: CGPoint(x: 3.0, y: 20.0))
        p.addLine(to: CGPoint(x: 21.0, y: 20.0))
        p.move(to: CGPoint(x: 5.0, y: 16.0))
        p.addLine(to: CGPoint(x: 9.0, y: 12.0))
        p.addLine(to: CGPoint(x: 12.0, y: 15.0))
        p.addLine(to: CGPoint(x: 19.0, y: 8.0))
    }
    static func hVis(_ p: inout Path) {
        p.move(to: CGPoint(x: 2.0, y: 12.0))
        p.addCurve(to: CGPoint(x: 12.0, y: 5.0), control1: CGPoint(x: 2.0, y: 12.0), control2: CGPoint(x: 6.0, y: 5.0))
        p.addCurve(to: CGPoint(x: 22.0, y: 12.0), control1: CGPoint(x: 18.0, y: 5.0), control2: CGPoint(x: 22.0, y: 12.0))
        p.addCurve(to: CGPoint(x: 12.0, y: 19.0), control1: CGPoint(x: 22.0, y: 12.0), control2: CGPoint(x: 18.0, y: 19.0))
        p.addCurve(to: CGPoint(x: 2.0, y: 12.0), control1: CGPoint(x: 6.0, y: 19.0), control2: CGPoint(x: 2.0, y: 12.0))
        p.closeSubpath()
        p.addEllipse(in: CGRect(x: 9.0, y: 9.0, width: 6.0, height: 6.0))
    }
    static func hHum(_ p: inout Path) {
        p.move(to: CGPoint(x: 3.0, y: 9.0))
        p.addLine(to: CGPoint(x: 14.0, y: 9.0))
        p.addCurve(to: CGPoint(x: 17.0, y: 6.0), control1: CGPoint(x: 15.657, y: 9.0), control2: CGPoint(x: 17.0, y: 7.657))
        p.addCurve(to: CGPoint(x: 14.0, y: 3.0), control1: CGPoint(x: 17.0, y: 4.343), control2: CGPoint(x: 15.657, y: 3.0))
        p.addCurve(to: CGPoint(x: 11.0, y: 6.0), control1: CGPoint(x: 12.343, y: 3.0), control2: CGPoint(x: 11.0, y: 4.343))
        p.move(to: CGPoint(x: 3.0, y: 14.0))
        p.addLine(to: CGPoint(x: 18.0, y: 14.0))
        p.move(to: CGPoint(x: 3.0, y: 19.0))
        p.addLine(to: CGPoint(x: 12.0, y: 19.0))
    }
    static func hPres(_ p: inout Path) {
        p.addEllipse(in: CGRect(x: 3.0, y: 3.0, width: 18.0, height: 18.0))
        p.move(to: CGPoint(x: 12.0, y: 12.0))
        p.addLine(to: CGPoint(x: 16.0, y: 8.0))
    }
    static func map(_ p: inout Path) {
        p.move(to: CGPoint(x: 9.0, y: 4.0))
        p.addLine(to: CGPoint(x: 3.0, y: 6.5))
        p.addLine(to: CGPoint(x: 3.0, y: 20.0))
        p.addLine(to: CGPoint(x: 9.0, y: 17.5))
        p.addLine(to: CGPoint(x: 15.0, y: 20.0))
        p.addLine(to: CGPoint(x: 21.0, y: 17.5))
        p.addLine(to: CGPoint(x: 21.0, y: 4.0))
        p.addLine(to: CGPoint(x: 15.0, y: 6.5))
        p.closeSubpath()
        p.move(to: CGPoint(x: 9.0, y: 4.0))
        p.addLine(to: CGPoint(x: 9.0, y: 17.5))
        p.move(to: CGPoint(x: 15.0, y: 6.5))
        p.addLine(to: CGPoint(x: 15.0, y: 20.0))
    }
    static func menu(_ p: inout Path) {
        p.move(to: CGPoint(x: 4.0, y: 7.0))
        p.addLine(to: CGPoint(x: 20.0, y: 7.0))
        p.move(to: CGPoint(x: 4.0, y: 12.0))
        p.addLine(to: CGPoint(x: 20.0, y: 12.0))
        p.move(to: CGPoint(x: 4.0, y: 17.0))
        p.addLine(to: CGPoint(x: 20.0, y: 17.0))
    }
    static func search(_ p: inout Path) {
        p.addEllipse(in: CGRect(x: 4.0, y: 4.0, width: 14.0, height: 14.0))
        p.move(to: CGPoint(x: 20.0, y: 20.0))
        p.addLine(to: CGPoint(x: 16.5, y: 16.5))
    }

}

/// Et ikon fra designet, skalert fra 24 × 24 til rammen.
struct Glyph22Shape: Shape {
    let name: String
    func path(in rect: CGRect) -> Path {
        var p: Path = Path()
        Glyph22.draw(name, &p)
        let t: CGAffineTransform = CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: rect.width / 24.0, y: rect.height / 24.0)
        return p.applying(t)
    }
}

/// Strektegnet ikon (stroke-width i 24-enheter, som i SVG-en). fill = true fyller banen i stedet.
struct Glyph22Icon: View {
    let name: String
    var size: CGFloat = 24
    var color: Color = .white
    var stroke: CGFloat = 1.8
    var fill: Bool = false

    var body: some View {
        let w: CGFloat = stroke * size / 24.0
        Group {
            if fill {
                Glyph22Shape(name: name).fill(color)
            } else {
                Glyph22Shape(name: name).stroke(color, style: StrokeStyle(lineWidth: w, lineCap: .round, lineJoin: .round))
            }
        }
        .frame(width: size, height: size)
    }
}

/* ---------- Google-«G» (offisiell, 48 × 48, fire baner) ---------- */

enum GoogleG22 {
    static func gRed(_ p: inout Path) {
        p.move(to: CGPoint(x: 24.0, y: 9.5))
        p.addCurve(to: CGPoint(x: 33.21, y: 13.1), control1: CGPoint(x: 27.54, y: 9.5), control2: CGPoint(x: 30.71, y: 10.72))
        p.addLine(to: CGPoint(x: 40.06, y: 6.25))
        p.addCurve(to: CGPoint(x: 24.0, y: 0.0), control1: CGPoint(x: 35.9, y: 2.38), control2: CGPoint(x: 30.47, y: 0.0))
        p.addCurve(to: CGPoint(x: 2.56, y: 13.22), control1: CGPoint(x: 14.62, y: 0.0), control2: CGPoint(x: 6.51, y: 5.38))
        p.addLine(to: CGPoint(x: 10.54, y: 19.41))
        p.addCurve(to: CGPoint(x: 24.0, y: 9.5), control1: CGPoint(x: 12.43, y: 13.72), control2: CGPoint(x: 17.74, y: 9.5))
        p.closeSubpath()
    }
    static func gBlue(_ p: inout Path) {
        p.move(to: CGPoint(x: 46.98, y: 24.55))
        p.addCurve(to: CGPoint(x: 46.6, y: 20.0), control1: CGPoint(x: 46.98, y: 22.98), control2: CGPoint(x: 46.83, y: 21.46))
        p.addLine(to: CGPoint(x: 24.0, y: 20.0))
        p.addLine(to: CGPoint(x: 24.0, y: 29.02))
        p.addLine(to: CGPoint(x: 36.94, y: 29.02))
        p.addCurve(to: CGPoint(x: 32.16, y: 36.2), control1: CGPoint(x: 36.36, y: 31.98), control2: CGPoint(x: 34.68, y: 34.5))
        p.addLine(to: CGPoint(x: 39.89, y: 42.2))
        p.addCurve(to: CGPoint(x: 46.98, y: 24.55), control1: CGPoint(x: 44.4, y: 38.02), control2: CGPoint(x: 46.98, y: 31.84))
        p.closeSubpath()
    }
    static func gYellow(_ p: inout Path) {
        p.move(to: CGPoint(x: 10.53, y: 28.59))
        p.addCurve(to: CGPoint(x: 9.77, y: 24.0), control1: CGPoint(x: 10.05, y: 27.14), control2: CGPoint(x: 9.77, y: 25.6))
        p.addCurve(to: CGPoint(x: 10.53, y: 19.41), control1: CGPoint(x: 9.77, y: 22.4), control2: CGPoint(x: 10.04, y: 20.86))
        p.addLine(to: CGPoint(x: 2.55, y: 13.22))
        p.addCurve(to: CGPoint(x: 0.0, y: 24.0), control1: CGPoint(x: 0.92, y: 16.46), control2: CGPoint(x: 0.0, y: 20.12))
        p.addCurve(to: CGPoint(x: 2.56, y: 34.78), control1: CGPoint(x: 0.0, y: 27.88), control2: CGPoint(x: 0.92, y: 31.54))
        p.addLine(to: CGPoint(x: 10.53, y: 28.59))
        p.closeSubpath()
    }
    static func gGreen(_ p: inout Path) {
        p.move(to: CGPoint(x: 24.0, y: 48.0))
        p.addCurve(to: CGPoint(x: 39.89, y: 42.19), control1: CGPoint(x: 30.48, y: 48.0), control2: CGPoint(x: 35.93, y: 45.87))
        p.addLine(to: CGPoint(x: 32.16, y: 36.19))
        p.addCurve(to: CGPoint(x: 24.0, y: 38.49), control1: CGPoint(x: 30.01, y: 37.64), control2: CGPoint(x: 27.24, y: 38.49))
        p.addCurve(to: CGPoint(x: 10.53, y: 28.58), control1: CGPoint(x: 17.74, y: 38.49), control2: CGPoint(x: 12.43, y: 34.27))
        p.addLine(to: CGPoint(x: 2.55, y: 34.77))
        p.addCurve(to: CGPoint(x: 24.0, y: 48.0), control1: CGPoint(x: 6.51, y: 42.62), control2: CGPoint(x: 14.62, y: 48.0))
        p.closeSubpath()
    }
}

/// Én av de fire fargede banene i G-en, skalert fra 48 × 48.
struct GoogleG22Part: Shape {
    let part: Int
    func path(in rect: CGRect) -> Path {
        var p: Path = Path()
        switch part {
        case 0: GoogleG22.gRed(&p)
        case 1: GoogleG22.gBlue(&p)
        case 2: GoogleG22.gYellow(&p)
        default: GoogleG22.gGreen(&p)
        }
        let t: CGAffineTransform = CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: rect.width / 48.0, y: rect.height / 48.0)
        return p.applying(t)
    }
}
