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

    let red: Color = Color(kalHex: "#b23a2a")
    let green: Color = Color(kalHex: "#2f7a4f")
    var sunday: Color { dark ? Color(kalHex: "#ec7a64") : Color(kalHex: "#b23a2a") }

    static let light: MacTheme = MacTheme(
        dark: false, bg: Color(kalHex: "#f3efe6"), ink: Color(kalHex: "#1b1a17"), card: Color(kalHex: "#fffdf8"),
        chip: Color(kalHex: "#e9e2d3"), line: Color(kalHex: "#ddd5c5"), line2: Color(kalHex: "#e6dfd1"),
        mut: Color(kalHex: "#6b665c"), mut2: Color(kalHex: "#a39d90"), ink2: Color(kalHex: "#3d3a33"),
        acc: Color(kalHex: "#b23a2a"), glass: Color(kalHex: "#fffdf8", opacity: 0.94), dim: Color(kalHex: "#14120e", opacity: 0.46),
        bar: Color(kalHex: "#ece6da"))

    static let darkTheme: MacTheme = MacTheme(
        dark: true, bg: Color(kalHex: "#161513"), ink: Color(kalHex: "#efe9de"), card: Color(kalHex: "#211f1b"),
        chip: Color(kalHex: "#2b2824"), line: Color(kalHex: "#3b3731"), line2: Color(kalHex: "#2e2b26"),
        mut: Color(kalHex: "#a49d91"), mut2: Color(kalHex: "#7a746a"), ink2: Color(kalHex: "#d6cfc2"),
        acc: Color(kalHex: "#ec7a64"), glass: Color(kalHex: "#211f1b", opacity: 0.94), dim: Color(kalHex: "#000000", opacity: 0.55),
        bar: Color(kalHex: "#1d1b18"))

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
enum MacFont {
    static func serif(_ size: CGFloat, medium: Bool = true) -> Font {
        .custom(medium ? "Newsreader-Medium" : "Newsreader-Regular", size: size)
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
        return .custom(name, size: size)
    }

    static func mono(_ size: CGFloat) -> Font { .custom("IBMPlexMono-SemiBold", size: size) }
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
