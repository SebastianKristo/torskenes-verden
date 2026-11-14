// GENERERT av scripts/design-tokens.mjs fra shared/design/tokens.json – ikke rediger.
// Designtokens for iOS. Fargene ligger i DesignTokens.xcassets (Any/Dark og økt kontrast); modus følger colorScheme,
// stilen (papir/glass) velges i kode. Se docs/designsystem.md.
//
// Bruk:
//   .foregroundStyle(DS.color(.textPrimary, stil: .papir))
//   .background(DSFyll(.surfaceRaised))          // stilen hentes fra miljøet (.environment(\.dsStil, .glass))
//   .font(.ds(.body))                             // systemfont, skalerer med Dynamic Type
//   .padding(DS.Space.lg)

import SwiftUI

enum DS {
    /// Visuell stil. Glass har bare mørk modus (Q13): i lys modus gir glass samme farger som papir.
    enum Stil: String, CaseIterable, Sendable {
        case papir
        case glass

        fileprivate var assetPrefix: String {
            switch self {
            case .papir: return "DSPapir"
            case .glass: return "DSGlass"
            }
        }
    }

    /// Semantiske farger.
    enum Farge: String, CaseIterable, Sendable {
        case surface
        case surfaceRaised
        case surfaceSunken
        case line
        case textPrimary
        case textSecondary
        case textTertiary
        case accent
        case onAccent
        case success
        case onSuccess
        case warning
        case onWarning
        case danger
        case onDanger
        case focus
        case scrim

        fileprivate var assetSuffix: String {
            switch self {
            case .surface: return "Surface"
            case .surfaceRaised: return "SurfaceRaised"
            case .surfaceSunken: return "SurfaceSunken"
            case .line: return "Line"
            case .textPrimary: return "TextPrimary"
            case .textSecondary: return "TextSecondary"
            case .textTertiary: return "TextTertiary"
            case .accent: return "Accent"
            case .onAccent: return "OnAccent"
            case .success: return "Success"
            case .onSuccess: return "OnSuccess"
            case .warning: return "Warning"
            case .onWarning: return "OnWarning"
            case .danger: return "Danger"
            case .onDanger: return "OnDanger"
            case .focus: return "Focus"
            case .scrim: return "Scrim"
            }
        }
    }

    /// Kategorifarger (fyll). Tekst og ikon oppå bruker DS.onCategory (≥ 4.5:1).
    enum Kategori: String, CaseIterable, Sendable {
        case blue
        case red
        case purple
        case green
        case teal
        case pink
        case amber
        case brown
        case neutral

        fileprivate var assetName: String {
            switch self {
            case .blue: return "DSCategoryBlue"
            case .red: return "DSCategoryRed"
            case .purple: return "DSCategoryPurple"
            case .green: return "DSCategoryGreen"
            case .teal: return "DSCategoryTeal"
            case .pink: return "DSCategoryPink"
            case .amber: return "DSCategoryAmber"
            case .brown: return "DSCategoryBrown"
            case .neutral: return "DSCategoryNeutral"
            }
        }
    }

    /// Fargen for en token i en stil. Lys/mørk og økt kontrast velges av systemet (asset-katalogen).
    static func color(_ farge: Farge, stil: Stil) -> Color {
        Color(stil.assetPrefix + farge.assetSuffix, bundle: nil)
    }

    static func category(_ kategori: Kategori) -> Color {
        Color(kategori.assetName, bundle: nil)
    }

    static var onCategory: Color { Color("DSOnCategory", bundle: nil) }

    /// Tekststiler. size/lineHeight er tokenverdiene i pt; textStyle er iOS-stilen som styrer Dynamic Type.
    enum Tekst: String, CaseIterable, Sendable {
        case caption
        case footnote
        case subheadline
        case callout
        case body
        case headline
        case title3
        case title2
        case largeTitle

        var size: CGFloat {
            switch self {
            case .caption: return 11
            case .footnote: return 12
            case .subheadline: return 13
            case .callout: return 14
            case .body: return 16
            case .headline: return 18
            case .title3: return 22
            case .title2: return 28
            case .largeTitle: return 44
            }
        }

        var lineHeight: CGFloat {
            switch self {
            case .caption: return 14
            case .footnote: return 16
            case .subheadline: return 18
            case .callout: return 20
            case .body: return 24
            case .headline: return 24
            case .title3: return 28
            case .title2: return 34
            case .largeTitle: return 52
            }
        }

        var weight: Font.Weight {
            switch self {
            case .caption: return .medium
            case .footnote: return .regular
            case .subheadline: return .regular
            case .callout: return .regular
            case .body: return .regular
            case .headline: return .semibold
            case .title3: return .semibold
            case .title2: return .bold
            case .largeTitle: return .bold
            }
        }

        var textStyle: Font.TextStyle {
            switch self {
            case .caption: return .caption2
            case .footnote: return .caption
            case .subheadline: return .footnote
            case .callout: return .subheadline
            case .body: return .body
            case .headline: return .headline
            case .title3: return .title3
            case .title2: return .title
            case .largeTitle: return .largeTitle
            }
        }

        /// Ekstra linjeavstand for å nå lineHeight (SwiftUI legger den mellom linjene).
        var lineSpacing: CGFloat { max(0, lineHeight - size * 1.2) }
    }

    enum Space {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
    }

    enum Radius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 20
        static let full: CGFloat = 999
    }

    struct Skygge: Sendable {
        let y: CGFloat
        let blur: CGFloat
        let alpha: Double

        static let low = Skygge(y: 1, blur: 3, alpha: 0.08)
        static let mid = Skygge(y: 4, blur: 12, alpha: 0.12)
        static let high = Skygge(y: 12, blur: 32, alpha: 0.2)
    }

    /// Lag (zIndex).
    enum Z {
        static let base: Double = 0
        static let raised: Double = 10
        static let sticky: Double = 100
        static let nav: Double = 200
        static let sheet: Double = 300
        static let toast: Double = 400
    }

    /// Bevegelse. Varigheter i sekunder. animation(…, reduce:) gir nil når «Reduser bevegelse» er på.
    enum Motion {
        static let fast: Double = 0.15
        static let normal: Double = 0.25
        static let slow: Double = 0.4
        static let reduced: Double = 0

        enum Easing: Sendable {
            case standard
            case enter
            case exit
        }

        static func animation(_ duration: Double, easing: Easing = .standard, reduce: Bool = false) -> Animation? {
            if reduce { return nil }
            switch easing {
            case .standard: return Animation.timingCurve(0.2, 0, 0, 1, duration: duration)
            case .enter: return Animation.timingCurve(0, 0, 0.2, 1, duration: duration)
            case .exit: return Animation.timingCurve(0.4, 0, 1, 1, duration: duration)
            }
        }
    }
}

extension Font {
    /// Systemfonten i en tokenstil (skalerer med Dynamic Type).
    static func ds(_ stil: DS.Tekst) -> Font {
        .system(stil.textStyle, design: .default, weight: stil.weight)
    }

    /// En egen font (f.eks. Papir-fontene) i tokenstørrelsen, skalert relativt til tekststilen.
    static func ds(_ stil: DS.Tekst, custom navn: String) -> Font {
        .custom(navn, size: stil.size, relativeTo: stil.textStyle).weight(stil.weight)
    }
}

private struct DSStilKey: EnvironmentKey {
    static let defaultValue: DS.Stil = .papir
}

extension EnvironmentValues {
    /// Valgt stil (papir/glass) for DSFyll. Modus følger colorScheme.
    var dsStil: DS.Stil {
        get { self[DSStilKey.self] }
        set { self[DSStilKey.self] = newValue }
    }
}

/// En fargetoken som ShapeStyle: stilen leses fra miljøet (\.dsStil).
struct DSFyll: ShapeStyle {
    let farge: DS.Farge

    init(_ farge: DS.Farge) {
        self.farge = farge
    }

    func resolve(in environment: EnvironmentValues) -> Color {
        DS.color(farge, stil: environment.dsStil)
    }
}

extension View {
    /// Skygge fra tokenene.
    func dsShadow(_ skygge: DS.Skygge) -> some View {
        shadow(color: Color.black.opacity(skygge.alpha), radius: skygge.blur / 2, x: 0, y: skygge.y)
    }
}
