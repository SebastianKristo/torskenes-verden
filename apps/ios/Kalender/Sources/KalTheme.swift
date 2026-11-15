import SwiftUI
import UIKit

/* ---------------- Prompt 33: Kalender – tema (THM.light / THM.dark i fasiten) og fonter ---------------- */
// Alle farger er tokens: bg ink card chip line line2 mut mut2 ink2 acc glass dim. Mørke piller blir lyse i mørkt tema
// (bakgrunn ink, tekst bg). Kalenderfargene har lyse tekstvarianter i mørkt tema.
// Fase 4: verdiene kommer fra designtokens (DS, Papir-stilen i shared/design/tokens.json) i stedet for egne hex-verdier.
// Fargesettene følger lys/mørk og «Øk kontrast» selv; light/darkTheme velges fortsatt etter colorScheme (KalSchemeReader).

struct KalTheme {
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

    /// Fast rød (rød +, i dag-sirkel, nå-linje) – lik i lyst og mørkt tema med hvit tekst oppå. Tokensettet har ingen fast
    /// merkefarge (accent er lys rød i mørk modus), så verdien er KalTheme.brandRed til en slik token finnes.
    let red: Color = KalTheme.brandRed
    /// Søndag og i dag-tekst.
    var sunday: Color { DS.color(DS.Farge.accent, stil: .papir) }
    let green: Color = DS.category(.green)

    /// Den faste røde i Kalender (Papir accent i lys modus). Eneste farge uten token; se red.
    static let brandRed: Color = Color(kalHex: "#b23a2a")

    static let light: KalTheme = KalTheme.papir(dark: false, glass: 0.82)
    static let darkTheme: KalTheme = KalTheme.papir(dark: true, glass: 0.84)

    /// Samme tokens i begge temaene; fargesettene gir lys/mørk verdi etter colorScheme.
    static func papir(dark: Bool, glass: Double) -> KalTheme {
        let s: DS.Stil = DS.Stil.papir
        let ink: Color = DS.color(.textPrimary, stil: s)
        return KalTheme(dark: dark, bg: DS.color(.surface, stil: s), ink: ink, card: DS.color(.surfaceRaised, stil: s),
                        chip: DS.color(.surfaceChip, stil: s), line: DS.color(.line, stil: s), line2: DS.color(.lineSubtle, stil: s),
                        mut: DS.color(.textSecondary, stil: s), mut2: DS.color(.textTertiary, stil: s), ink2: ink.opacity(0.82),
                        acc: DS.color(DS.Farge.accent, stil: s), glass: DS.color(.surfaceRaised, stil: s).opacity(glass),
                        dim: DS.color(.scrim, stil: s))
    }

    /// Kalenderfargen (prikker, striper).
    func calColor(_ c: KalCal?) -> Color { Color(kalHex: c?.hex ?? "#b23a2a") }

    /// Teksten i chips og blokker: mørk variant i lyst tema, lys variant i mørkt.
    func calText(_ c: KalCal?) -> Color {
        guard let c else { return ink }
        return Color(kalHex: dark ? c.lightHex : c.textHex)
    }

    /// Tonet bakgrunn (c.c + '22' / '26' / '38' i fasiten).
    func calTint(_ c: KalCal?, _ alpha: Double) -> Color { Color(kalHex: c?.hex ?? "#b23a2a", opacity: alpha) }
}

private struct KalThemeKey: EnvironmentKey {
    static let defaultValue: KalTheme = KalTheme.light
}

extension EnvironmentValues {
    var kal: KalTheme {
        get { self[KalThemeKey.self] }
        set { self[KalThemeKey.self] = newValue }
    }
}

/// Newsreader (titler), Manrope (tekst), IBM Plex Mono (etiketter). Skalerer med Dynamic Type via relativeTo.
enum KalFont {
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

    /// Prompt 35: ukenummer i mono 800 (IBM Plex Mono finnes bare i 600 i appen, så systemets mono heavy brukes).
    static func monoHeavy(_ size: CGFloat) -> Font { .system(size: size, weight: .heavy, design: .monospaced) }
}

/// Lett haptikk ved alle bytter (vibe() i fasiten).
enum KalHaptic {
    static func tap() {
        let g: UISelectionFeedbackGenerator = UISelectionFeedbackGenerator()
        g.selectionChanged()
    }

    static func soft() {
        let g: UIImpactFeedbackGenerator = UIImpactFeedbackGenerator(style: .light)
        g.impactOccurred()
    }

    static func done() {
        let g: UINotificationFeedbackGenerator = UINotificationFeedbackGenerator()
        g.notificationOccurred(.success)
    }
}

/// Felles pille (Ferdig, I dag, Legg til, Avbryt …). filled = mørk pille (lys i mørkt tema).
struct KalPill: View {
    @Environment(\.kal) private var t
    let title: String
    var filled: Bool = true
    var enabled: Bool = true
    var height: CGFloat = 36
    let action: () -> Void

    var body: some View {
        Button(action: {
            KalHaptic.tap()
            action()
        }) {
            Text(title)
                .font(KalFont.ui(13.5, .bold))
                .foregroundStyle(filled ? t.bg : t.ink)
                .padding(.horizontal, 17)
                .frame(minHeight: height)
                .background(background)
                .overlay(border)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .accessibilityLabel(title)
    }

    @ViewBuilder private var background: some View {
        if filled {
            Capsule().fill(enabled ? t.ink : t.mut2)
        } else {
            Capsule().fill(Color.clear)
        }
    }

    @ViewBuilder private var border: some View {
        if filled {
            EmptyView()
        } else {
            Capsule().strokeBorder(t.line, lineWidth: 1)
        }
    }
}

/// Valgchip (Varsel, Kalender, filtre).
struct KalChip: View {
    @Environment(\.kal) private var t
    let title: String
    let on: Bool
    var dot: Color? = nil
    let action: () -> Void

    var body: some View {
        Button(action: {
            KalHaptic.tap()
            action()
        }) {
            HStack(spacing: 6) {
                if let dot {
                    Circle().fill(dot).frame(width: 8, height: 8)
                }
                Text(title).font(KalFont.ui(12.5, .bold)).lineLimit(1)
            }
            .foregroundStyle(on ? t.bg : t.ink)
            .padding(.horizontal, 13)
            .frame(height: 34)
            .background(Capsule().fill(on ? t.ink : Color.clear))
            .overlay(Capsule().strokeBorder(on ? t.ink : t.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Bryter i fasitens stil (44 × 26, grønn når på).
struct KalToggle: View {
    @Environment(\.kal) private var t
    let on: Bool

    var body: some View {
        ZStack(alignment: on ? .trailing : .leading) {
            Capsule().fill(on ? t.green : t.line).frame(width: 44, height: 26)
            Circle().fill(Color.white).frame(width: 20, height: 20)
                .shadow(color: Color.black.opacity(0.2), radius: 1.5, y: 1)
                .padding(.horizontal, 3)
        }
        .frame(width: 44, height: 26)
        .animation(.easeOut(duration: 0.18), value: on)
    }
}

/// Liten etikett i versaler (mono).
struct KalLabel: View {
    @Environment(\.kal) private var t
    let text: String
    var color: Color? = nil

    var body: some View {
        Text(text).font(KalFont.mono(10.5)).tracking(1.2).foregroundStyle(color ?? t.mut2)
    }
}

/// Grep-linjen øverst på arkene.
struct KalGrabber: View {
    @Environment(\.kal) private var t

    var body: some View {
        Capsule().fill(t.line).frame(width: 36, height: 5).frame(maxWidth: .infinity)
    }
}
