import SwiftUI

/* ---------------- Papir overalt (prompt 16–17) ---------------- */

/// Når Papir er valgt, tegnes også de klassiske skjermene (innstillinger, kvitteringer, Finn …) med Papir-fargene.
/// PaperShell setter paletten før innholdet bygges, og det klassiske skallet nullstiller den.
enum PaperSkin {
    static var palette: PaperPalette?
    @discardableResult static func use(_ p: PaperPalette?) -> Bool { palette = p; return p != nil }
}

extension Color {
    /// Tekstfarge i de klassiske skjermene: hvit i Klassisk, blekk (eller lys blekk i mørk Papir) inne i Papir.
    static var skinFg: Color { PaperSkin.palette?.ink ?? .white }
}

extension View {
    /// Papir-flaten som erstatter glass når skjermen vises inne i Papir: hvitt kort (mørkt i mørk modus).
    func paperSurface(_ p: PaperPalette, _ radius: CGFloat, tint: Color?) -> some View {
        let r = Swift.min(radius, 22)
        return self.background(
            RoundedRectangle(cornerRadius: r, style: .continuous).fill(p.card)
                .overlay(RoundedRectangle(cornerRadius: r, style: .continuous).fill((tint ?? Color.clear).opacity(0.14)))
        )
    }
}

extension View {
    /// Fargeskjema for klassiske skjermer og ark: Papirets lys/mørk inne i Papir, ellers mørkt som før.
    func skinScheme() -> some View {
        preferredColorScheme(PaperSkin.palette.map { $0.dark ? ColorScheme.dark : ColorScheme.light } ?? ColorScheme.dark)
    }
    /// Bakgrunn for ark: papir inne i Papir, ellers glass (ultraThinMaterial).
    func skinSheetBackground() -> some View {
        presentationBackground(skinSheetStyle())
    }
}

/// Egen funksjon så uttrykket over holder seg enkelt for kompilatoren.
func skinSheetStyle() -> AnyShapeStyle {
    if let p = PaperSkin.palette { return AnyShapeStyle(p.bg) }
    return AnyShapeStyle(Material.ultraThinMaterial)
}
