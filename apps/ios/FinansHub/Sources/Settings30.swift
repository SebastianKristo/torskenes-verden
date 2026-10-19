import SwiftUI

/* ---------------- Prompt 30: Innstillinger-ikoner i samme farger som web ---------------- */
// Fasit: design/Innstillinger Web.dc.html og prompts/prompt-30-pakke/claude-code-innst-web-ai-ikoner-cloudflare.md.
// Hvert menypunkt får hvitt ikon i en farget, avrundet rute (som iOS-innstillinger). Profilkortet øverst åpner Konto.

enum Set30Colors {
    static let konto: Color = Color(hex: "#2b5d8a")
    static let utseende: Color = Color(hex: "#7a5ad6")
    static let startside: Color = Color(hex: "#3f7a6e")
    static let domener: Color = Color(hex: "#c0562a")
    static let notify: Color = Color(hex: "#b23a2a")
    static let app: Color = Color(hex: "#5b6470")
    static let integ: Color = Color(hex: "#4a5bbf")
    static let kalender: Color = Color(hex: "#2f7d4f")
    static let ai: Color = Color(hex: "#7a3b6b")
    static let brukere: Color = Color(hex: "#a8661a")
    static let innlogging: Color = Color(hex: "#1f6f78")
    static let system: Color = Color(hex: "#6b6558")
    static let backup: Color = Color(hex: "#2f6b45")

    /// Fargen til en rad i Innstillinger (etter navnet). nil = ikontemaet som før.
    static func tint(_ name: String) -> Color? {
        let n: String = name.lowercased()
        if n.hasPrefix("kontoer") || n == "konto" || n.hasPrefix("profil") { return konto }
        if n.hasPrefix("sikkerhet") || n.hasPrefix("innlogging") || n.hasPrefix("api-token") { return innlogging }
        if n.hasPrefix("backup") { return backup }
        if n.hasPrefix("utseende") || n.hasPrefix("fanelinje-stil") || n.hasPrefix("app-ikon") { return utseende }
        if n.hasPrefix("varsler") { return notify }
        if n.hasPrefix("kalender") { return kalender }
        if n.hasPrefix("integrasjon") { return integ }
        if n.hasPrefix("ai") { return ai }
        if n.hasPrefix("oppdatering") || n.hasPrefix("system") { return system }
        if n.hasPrefix("domene") { return domener }
        if n.hasPrefix("brukere") { return brukere }
        if n.hasPrefix("fanelinje i hjem") || n.hasPrefix("moduler") || n.hasPrefix("startside") { return startside }
        if n.hasPrefix("avansert") || n.hasPrefix("navn på appen") { return app }
        return nil
    }
}

/// Hvitt SF Symbol i en farget rute (34 pt, radius 10).
struct Set30Icon: View {
    let symbol: String
    let tint: Color

    var body: some View {
        Image(systemName: symbol).font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.white)
            .frame(width: 34, height: 34)
            .background(tint, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .accessibilityHidden(true)
    }
}
