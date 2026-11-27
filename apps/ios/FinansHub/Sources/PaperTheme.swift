import SwiftUI
import UIKit

/* ---------------- Tema: Papir/Glass × lys/mørk, bygget på DS-tokens ---------------- */
// Fase 4 (C-ios §2.1 B1, §3.1, Q13–Q16):
// – Paletten er observerbar (PaperTheme.shared, @Observable) og settes av roten når valget endres (AppShell), aldri under `body`.
//   Visninger som leser Color.skinFg, skinScheme() eller PaperSkin.palette tegnes derfor på nytt ved temabytte (også ark).
// – I miljøet: \.paper (PaperPalette) og \.dsStil (DS.Stil, for DSFyll). Nye skjermer bruker DS-tokenene direkte:
//   `.foregroundStyle(DSFyll(.textPrimary))`, `.background(DSFyll(.surfaceRaised))`.
// – Fargene i PaperPalette kommer fra DesignTokens.xcassets (DS) i en fast modus (lys eller mørk, som valgt i appen), med systemets
//   økte kontrast. Ingen hex her.

@Observable
final class PaperTheme {
    static let shared: PaperTheme = PaperTheme()

    /// Paletten som gjelder nå (Papir lys/mørk eller Glass).
    private(set) var palette: PaperPalette
    /// Stilen for DS-tokenene.
    var stil: DS.Stil { palette.glass ? .glass : .papir }

    init() {
        let mode: String = UserDefaults.standard.string(forKey: "fh_paper_mode") ?? "auto"
        palette = PaperPalette.of(mode, system: paperSystemScheme(.active))
    }

    /// Kalles av roten når modus eller stil er endret (ikke fra `body`).
    func set(_ p: PaperPalette) {
        if p.themeKey != palette.themeKey { palette = p }
    }
}

/// Når Papir er valgt, tegnes også de klassiske skjermene (innstillinger, kvitteringer, Finn …) med Papir-fargene.
/// Fase 4: lest fra PaperTheme (observerbar). `use` beholdes for eksisterende kall.
enum PaperSkin {
    static var palette: PaperPalette? { PaperTheme.shared.palette }
    @discardableResult static func use(_ p: PaperPalette?) -> Bool {
        if let p { PaperTheme.shared.set(p) }
        return p != nil
    }
}

extension DS {
    /// En fargetoken i fast modus (lys eller mørk) for stilen, med systemets økte kontrast. PaperPalette har lys og mørk som
    /// to faste paletter, fordi appens modus kan være en annen enn systemets.
    static func fixed(_ farge: Farge, stil: Stil, dark: Bool) -> Color {
        let raw: String = farge.rawValue
        let name: String = (stil == .glass ? "DSGlass" : "DSPapir") + raw.prefix(1).uppercased() + String(raw.dropFirst())
        let style: UIUserInterfaceStyle = dark ? .dark : .light
        let ui: UIColor = UIColor { (tc: UITraitCollection) -> UIColor in
            let t: UITraitCollection = UITraitCollection(traitsFrom: [tc, UITraitCollection(userInterfaceStyle: style)])
            return UIColor(named: name, in: nil, compatibleWith: t) ?? UIColor.clear
        }
        return Color(uiColor: ui)
    }
}

extension PaperPalette {
    /// Lys/mørk + stil, for å se om paletten er byttet.
    var themeKey: String { (dark ? "mork" : "lys") + (glass ? "-glass" : "-papir") }

    /// Paletten for en stil og modus, fra DS-tokenene. Fanelinjefargene (nav*) brukes bare av eldre skjermer.
    static func tokens(_ stil: DS.Stil, dark: Bool) -> PaperPalette {
        func c(_ f: DS.Farge) -> Color { DS.fixed(f, stil: stil, dark: dark) }
        func light(_ f: DS.Farge) -> Color { DS.fixed(f, stil: stil, dark: false) }
        func darkC(_ f: DS.Farge) -> Color { DS.fixed(f, stil: stil, dark: true) }
        let nav: Color = dark ? c(.surfaceChip) : light(.textPrimary)
        // Prompt 57: inaktive faner er hvite i lyst og mørkt tema (token navInk, før textSecondary i mørk modus).
        let navInk: Color = c(.navInk)
        let navAct: Color = dark ? c(.textPrimary) : light(.surface)
        let navActInk: Color = dark ? c(.surface) : light(.textPrimary)
        let pop: Color = dark ? c(.surfaceChip) : c(.surface)
        let popSel: Color = dark ? c(.line) : c(.surfaceChip)
        return PaperPalette(dark: dark, ink: c(.textPrimary), bg: c(.surface), card: c(.surfaceRaised), line: c(.line),
                            lab: c(.accent), mut: c(.textSecondary), pos: c(.success), nav: nav,
                            navInk: navInk, navAct: navAct, navActInk: navActInk,
                            onLab: c(.onAccent), pop: pop, popSel: popSel, glass: stil == .glass)
    }
}

extension Color {
    /// Fase 4 (bølge 2): en DS-token i stilen som er valgt nå (Papir/Glass) der en `Color` trengs (ternærer, statiske farger,
    /// parametre). Lys/mørk og økt kontrast velges av miljøet (asset-katalogen). Ellers: `DSFyll(_:)`.
    static func ds(_ farge: DS.Farge) -> Color { DS.color(farge, stil: PaperTheme.shared.stil) }

    /// Tekstfarge i de klassiske skjermene: blekk (eller lys blekk i mørk Papir).
    static var skinFg: Color { PaperSkin.palette?.ink ?? DS.fixed(.textPrimary, stil: .papir, dark: false) }
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
    /// Fargeskjema for klassiske skjermer og ark: appens lys/mørk (Q16 – aldri tvunget mørk).
    func skinScheme() -> some View {
        preferredColorScheme(PaperSkin.palette.map { $0.dark ? ColorScheme.dark : ColorScheme.light } ?? ColorScheme.light)
    }
    /// Bakgrunn for ark: papiret.
    func skinSheetBackground() -> some View {
        presentationBackground(skinSheetStyle())
    }
}

/// Egen funksjon så uttrykket over holder seg enkelt for kompilatoren.
func skinSheetStyle() -> AnyShapeStyle {
    if let p = PaperSkin.palette { return AnyShapeStyle(p.bg) }
    return AnyShapeStyle(Material.ultraThinMaterial)
}
