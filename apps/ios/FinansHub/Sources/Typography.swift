import SwiftUI

/* ---------------- Fontene i Homelab-appen (Papir) med Dynamic Type ---------------- */
// Fase 4 (C-ios §3.2, H7): PF.ui/serif/mono(size) ble brukt nesten 4 000 ganger med fast størrelse. Samme navn og API nå, men
// hver størrelse skalerer med Dynamic Type relativt til den nærmeste tekststilen (`relativeTo:`), så alle skjermene får det
// uten endringer. På standard tekststørrelse er alt som før.
// Nye skjermer: bruk tokenstilene (Font.ds(.body), Font.ds(.title3, custom: PF.uiName(.semibold)) i Shared/DesignTokens.swift)
// eller PF med en DS-størrelse (PF.ui(DS.Tekst.body.size)).

/// Fontene i Papir: Newsreader (serif), Manrope (tekst) og IBM Plex Mono (etiketter). Faller tilbake til systemfontene.
enum PF {
    static func serif(_ size: CGFloat, medium: Bool = false) -> Font {
        .custom(medium ? "Newsreader-Medium" : "Newsreader-Regular", size: size, relativeTo: style(size))
    }

    static func italic(_ size: CGFloat) -> Font { .custom("Newsreader-Italic", size: size, relativeTo: style(size)) }

    static func ui(_ size: CGFloat, _ w: Font.Weight = .regular) -> Font {
        .custom(uiName(w), size: size, relativeTo: style(size))
    }

    static func mono(_ size: CGFloat, bold: Bool = true) -> Font {
        .custom(bold ? "IBMPlexMono-SemiBold" : "IBMPlexMono-Medium", size: size, relativeTo: style(size))
    }

    /// Manrope-snittet for en vekt.
    static func uiName(_ w: Font.Weight) -> String {
        switch w {
        case .medium: return "Manrope-Medium"
        case .semibold: return "Manrope-SemiBold"
        case .bold: return "Manrope-Bold"
        case .heavy, .black: return "Manrope-ExtraBold"
        default: return "Manrope-Regular"
        }
    }

    /// Tekststilen en størrelse skalerer med: stilen med nærmeste standardstørrelse i iOS (caption2 11, caption 12, footnote 13,
    /// subheadline 15, callout 16, body 17, title3 20, title2 22, title 28, largeTitle 34).
    static func style(_ size: CGFloat) -> Font.TextStyle {
        if size < 11.5 { return .caption2 }
        if size < 12.5 { return .caption }
        if size < 14 { return .footnote }
        if size < 15.5 { return .subheadline }
        if size < 16.5 { return .callout }
        if size < 18.5 { return .body }
        if size < 21 { return .title3 }
        if size < 25 { return .title2 }
        if size < 31 { return .title }
        return .largeTitle
    }
}
