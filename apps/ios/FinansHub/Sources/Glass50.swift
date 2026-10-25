import SwiftUI

/* ---------------- Prompt 50: Utseende → TEMA → «Liquid Glass» (claude-code-utseende-liquid-glass.md) ----------------
 Fasit: Mobil Papir App.dc.html → Innstillinger → Utseende → TEMA og fargesettet i _rv0() (s.mode==='Glass').
 – Valget lagres i paperMode = "glass" (lokalt, fh_paper_mode) og slår på Hjem som fliser (papir_home_tiles = 1).
   Serveren godtar bare auto/lys/mork for layout.paperMode, så Glass sendes ikke dit (og overskrives ikke av serveren).
 – Farger: bakgrunn #07070A, tekst hvit, dempet 66 %, linjer 16 %, kort 9 % hvitt, aksent #FF8A4C, positiv #5fd18b.
 – Tre fargeskyer bak alt innhold (Glass50Clouds), glass på kort, fliser og fanelinje (Glass50Bg):
   iOS 26 = ekte .glassEffect(); eldre = .ultraThinMaterial + tynn lys kant. Xcode 16 ser aldri iOS 26-symbolet
   (#if compiler(>=6.2) + if #available(iOS 26.0, *)). */

extension PaperPalette {
    /// Liquid Glass: mørkt glass med fargeskyer bak.
    static let glass50 = PaperPalette(dark: true, ink: .white, bg: Color(hex: "#07070A"), card: Color.white.opacity(0.09), line: Color.white.opacity(0.16),
                                      lab: Color(hex: "#FF8A4C"), mut: Color.white.opacity(0.66), pos: Color(hex: "#5fd18b"), nav: Color.white.opacity(0.10),
                                      navInk: Color.white.opacity(0.7), navAct: .white, navActInk: Color(hex: "#07070A"),
                                      onLab: Color(hex: "#07070A"), pop: Color(hex: "#1c1c22"), popSel: Color(hex: "#2c2c34"), glass: true)
}

enum Glass50 {
    static let mode: String = "glass"
    /// Kant og høylys på glassflatene.
    static let edge: Color = Color.white.opacity(0.18)
    static let highlight: Color = Color.white.opacity(0.25)
}

/// Bakgrunnsflate: vanlig farge, eller glass når Liquid Glass er valgt.
struct Glass50Bg<S: Shape>: ViewModifier {
    let on: Bool
    let fill: Color
    let shape: S

    @ViewBuilder func body(content: Content) -> some View {
        if on {
            glassed(content)
        } else {
            content.background(fill, in: shape)
        }
    }

    @ViewBuilder private func glassed(_ content: Content) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            content
                .background(fill.opacity(0.5), in: shape)
                .glassEffect(.regular, in: shape)
        } else {
            legacy(content)
        }
        #else
        legacy(content)
        #endif
    }

    private func legacy(_ content: Content) -> some View {
        content
            .background(fill, in: shape)
            .background(.ultraThinMaterial, in: shape)
            .overlay(shape.stroke(Glass50.edge, lineWidth: 1))
    }
}

extension View {
    /// Prompt 50: `.background(fill, in: shape)` – med glass i Liquid Glass.
    func glass50Bg<S: Shape>(_ p: PaperPalette, _ fill: Color, _ shape: S) -> some View {
        modifier(Glass50Bg(on: p.glass, fill: fill, shape: shape))
    }

    /// Kort med Papir-kortfargen (20 pt hjørner som standard).
    func glass50Card(_ p: PaperPalette, radius: CGFloat = 20) -> some View {
        modifier(Glass50Bg(on: p.glass, fill: p.card, shape: RoundedRectangle(cornerRadius: radius, style: .continuous)))
    }
}

/// De tre fargeskyene bak innholdet (oransje, blå og brent oransje). Tar ikke imot trykk.
struct Glass50Clouds: View {
    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            ZStack(alignment: .topLeading) {
                cloud("#FF7A3D", 300, blur: 90, opacity: 0.5)
                    .offset(x: -80, y: 260)
                cloud("#4D6BFF", 260, blur: 90, opacity: 0.42)
                    .offset(x: g.size.width - 260 + 90, y: 520)
                cloud("#C24E17", 220, blur: 80, opacity: 0.38)
                    .offset(x: 40, y: g.size.height - 220 + 40)
            }
            .frame(width: g.size.width, height: g.size.height, alignment: .topLeading)
        }
        .clipped()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .ignoresSafeArea()
    }

    private func cloud(_ hex: String, _ size: CGFloat, blur: CGFloat, opacity: Double) -> some View {
        Circle().fill(Color(hex: hex)).frame(width: size, height: size).blur(radius: blur).opacity(opacity)
    }
}

extension Store {
    /// Prompt 50: Liquid Glass er valgt.
    var glass50: Bool { paperMode == Glass50.mode }

    /// Velger Liquid Glass (lokalt) og slår på flisene på Hjem.
    func setGlass50() {
        paperMode = Glass50.mode
        Home50Tiles.shared.set(true)
        Haptics.shared.select()
    }

    /// Navnet på temaet til raden «Tema» i Innstillinger.
    var paperModeName50: String {
        switch paperMode {
        case "lys": return "Papir lys"
        case "mork": return "Papir mørk"
        case Glass50.mode: return "Liquid Glass"
        // Prompt 51 (IOSFEAT51): automatisk tema (Theme51.swift).
        case let m where m.hasPrefix(Theme51.autoPrefix): return "Automatisk"
        default: return "Følger systemet"
        }
    }
}
