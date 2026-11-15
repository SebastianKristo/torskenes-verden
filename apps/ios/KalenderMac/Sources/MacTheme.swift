import SwiftUI
import AppKit

/* ---------------- Prompt 34: Kalender for Mac – tema, fonter og knapper ---------------- */
// Samme tokens som Kalender-appen (THM.light / THM.dark i Kalender App.dc.html) og web-kalenderen (Kalender.dc.html, variant web).
// Mørke piller blir lyse i mørkt tema (bakgrunn ink, tekst bg). Ingen UIKit: dette er macOS-targeten.

struct MacTheme {
    let dark: Bool
    let bg: Color
    let ink: Color
    let card: Color
    let chip: Color
    let line: Color
    let line2: Color
    let mut: Color
    let mut2: Color
    let ink2: Color
    let acc: Color
    let glass: Color
    let dim: Color
    /// Tittellinjen (#ece6da i fasiten).
    let bar: Color

    /// Fast rød (lik i begge temaene, hvit tekst oppå). Tokensettet har ingen fast merkefarge; se MacTheme.brandRed.
    let red: Color = MacTheme.brandRed
    let green: Color = DS.category(.green)
    var sunday: Color { DS.color(DS.Farge.accent, stil: .papir) }

    /// Den faste røde i Kalender (Papir accent i lys modus). Eneste farge uten token.
    static let brandRed: Color = Color(kalHex: "#b23a2a")

    // Fase 4: verdiene kommer fra designtokens (DS, Papir-stilen) i stedet for egne hex-verdier. Fargesettene følger
    // lys/mørk og «Øk kontrast»; light/darkTheme velges fortsatt etter colorScheme (MacThemed).
    static let light: MacTheme = MacTheme.papir(dark: false, bar: DS.Farge.surfaceChip)
    static let darkTheme: MacTheme = MacTheme.papir(dark: true, bar: DS.Farge.surfaceSunken)

    static func papir(dark: Bool, bar: DS.Farge) -> MacTheme {
        let s: DS.Stil = DS.Stil.papir
        let ink: Color = DS.color(.textPrimary, stil: s)
        return MacTheme(dark: dark, bg: DS.color(.surface, stil: s), ink: ink, card: DS.color(.surfaceRaised, stil: s),
                        chip: DS.color(.surfaceChip, stil: s), line: DS.color(.line, stil: s), line2: DS.color(.lineSubtle, stil: s),
                        mut: DS.color(.textSecondary, stil: s), mut2: DS.color(.textTertiary, stil: s), ink2: ink.opacity(0.82),
                        acc: DS.color(DS.Farge.accent, stil: s), glass: DS.color(.surfaceRaised, stil: s).opacity(0.94),
                        dim: DS.color(.scrim, stil: s), bar: DS.color(bar, stil: s))
    }

    func calColor(_ c: KalCal?) -> Color { Color(kalHex: c?.hex ?? "#b23a2a") }

    func calText(_ c: KalCal?) -> Color {
        guard let c else { return ink }
        return Color(kalHex: dark ? c.lightHex : c.textHex)
    }

    func calTint(_ c: KalCal?, _ alpha: Double) -> Color { Color(kalHex: c?.hex ?? "#b23a2a", opacity: alpha) }
}

private struct MacThemeKey: EnvironmentKey {
    static let defaultValue: MacTheme = MacTheme.light
}

extension EnvironmentValues {
    var mk: MacTheme {
        get { self[MacThemeKey.self] }
        set { self[MacThemeKey.self] = newValue }
    }
}

/// Newsreader (titler), Manrope (tekst), IBM Plex Mono (etiketter). Fontene ligger i Resources (ATSApplicationFontsPath).
/// Fase 4: relativeTo som KalFont, så tekststørrelsen følger systemet der macOS skalerer (tilgjengelighet).
enum MacFont {
    static func serif(_ size: CGFloat, medium: Bool = true) -> Font {
        .custom(medium ? "Newsreader-Medium" : "Newsreader-Regular", size: size, relativeTo: .title)
    }

    static func ui(_ size: CGFloat, _ w: Font.Weight = .regular) -> Font {
        let name: String
        switch w {
        case .medium: name = "Manrope-Medium"
        case .semibold: name = "Manrope-SemiBold"
        case .bold: name = "Manrope-Bold"
        case .heavy, .black: name = "Manrope-ExtraBold"
        default: name = "Manrope-Regular"
        }
        return .custom(name, size: size, relativeTo: .body)
    }

    static func mono(_ size: CGFloat) -> Font { .custom("IBMPlexMono-SemiBold", size: size, relativeTo: .caption) }
    /// Prompt 35: ukenummer i mono 800.
    static func monoHeavy(_ size: CGFloat) -> Font { .system(size: size, weight: .heavy, design: .monospaced) }
}

/// Felles pille (I dag, Ferdig, Legg til …). filled = mørk pille (lys i mørkt tema).
struct MacPill: View {
    @Environment(\.mk) private var t
    let title: String
    var filled: Bool = true
    var enabled: Bool = true
    var height: CGFloat = 32
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(MacFont.ui(13, .bold))
                .foregroundColor(filled ? t.bg : t.ink)
                .padding(.horizontal, 15)
                .frame(height: height)
                .background(Capsule().fill(fillColor))
                .overlay(Capsule().strokeBorder(filled ? Color.clear : t.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(title)
    }

    private var fillColor: Color {
        if !filled { return Color.clear }
        return enabled ? t.ink : t.mut2
    }
}

/// Valgchip (Varsel, Kalender, filtre).
struct MacChip: View {
    @Environment(\.mk) private var t
    let title: String
    let on: Bool
    var dot: Color? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let dot { Circle().fill(dot).frame(width: 8, height: 8) }
                Text(title).font(MacFont.ui(12, .bold)).lineLimit(1)
            }
            .foregroundColor(on ? t.bg : t.ink)
            .padding(.horizontal, 12)
            .frame(height: 30)
            .background(Capsule().fill(on ? t.ink : Color.clear))
            .overlay(Capsule().strokeBorder(on ? t.ink : t.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}

/// Liten etikett i versaler (mono).
struct MacLabel: View {
    @Environment(\.mk) private var t
    let text: String
    var color: Color? = nil

    var body: some View {
        Text(text).font(MacFont.mono(10.5)).tracking(1.2).foregroundColor(color ?? t.mut2)
    }
}

/// Rund ikonknapp i verktøylinja (‹ › søk).
struct MacIconButton: View {
    @Environment(\.mk) private var t
    let symbol: String
    let label: String
    var bordered: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(t.ink)
                .frame(width: 32, height: 32)
                .overlay(Circle().strokeBorder(bordered ? t.line : Color.clear, lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .help(label)
        .accessibilityLabel(label)
    }
}

/// Appikonet tegnet i SwiftUI (krem, rød topp med ukedag og dagens dato). Brukes i Dock, innlogging og Om.
struct MacAppIcon: View {
    let size: CGFloat
    var date: Date = Date()

    var body: some View {
        let wd: String = KalD.weekdaysShort[KalD.wd(date)].uppercased()
        let n: String = String(KalD.dayOfMonth(date))
        VStack(spacing: 0) {
            Text(wd)
                .font(MacFont.mono(size * 0.15))
                .tracking(size * 0.012)
                .foregroundColor(Color.white)
                .frame(maxWidth: .infinity)
                .frame(height: size * 0.29)
                .background(Color(kalHex: "#b23a2a"))
            Text(n)
                .font(MacFont.serif(size * 0.52))
                .foregroundColor(Color(kalHex: "#1b1a17"))
                .frame(maxHeight: .infinity)
        }
        .frame(width: size, height: size)
        .background(Color(kalHex: "#fffdf8"))
        .clipShape(RoundedRectangle(cornerRadius: size * 0.225, style: .continuous))
        .accessibilityHidden(true)
    }
}
