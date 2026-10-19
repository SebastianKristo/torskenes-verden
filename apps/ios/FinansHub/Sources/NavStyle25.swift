import SwiftUI

/* ---------------- Prompt 25: fanelinje-stil, sidelinje på bred skjerm og rød Hjem-knapp ----------------
   Fasit: design/Mobil Papir App.dc.html (Innstillinger → HOMELAB → Fanelinje-stil, «Rediger fanelinjen» → STIL,
   bred modus) og prompts/claude-code-fold-navbar.md. Stilen lagres i layout.navStyle:
   text (navn på alle, ikon på valgt) · icons (bare ikoner, like brede felt) · icons_active_label (ikoner, valgt
   fane viser også navnet). Ingen ligatur-fonter: SF Symbols eller vanlige tegn (◎ ◌ ♡ ⋯). */

enum NavStyle25 {
    static let ids: [String] = ["text", "icons", "icons_active_label"]
    static let options: [(String, String, String)] = [
        ("text", "Tekst", "Navn på alle · ikon på valgt fane"),
        ("icons", "Bare ikoner", "Ikoner uten navn"),
        ("icons_active_label", "Ikoner + navn på valgt", "Ikoner · valgt fane viser også navn"),
    ]

    static func name(_ id: String) -> String { options.first { $0.0 == id }?.1 ?? "Tekst" }
    static func sub(_ id: String) -> String { options.first { $0.0 == id }?.2 ?? options[0].2 }
}

extension Store {
    func setNavStyle25(_ v: String) {
        guard NavStyle25.ids.contains(v) else { return }
        navStyle25 = v
        savePaperLayout(["navStyle": v])
        Haptics.shared.select()
    }

    /// Raden i Innstillinger: trykk bytter til neste stil.
    func cycleNavStyle25() {
        let i: Int = NavStyle25.ids.firstIndex(of: navStyle25) ?? 0
        setNavStyle25(NavStyle25.ids[(i + 1) % NavStyle25.ids.count])
    }

    /// Startsiden (Hjem) uten noe åpent oppå.
    var paperIsHome25: Bool {
        paperTab == "hjem" && paperClassic == nil && paperFin == nil && !newsOpen && dishSel == nil
    }

    /// Den røde Hjem-knappen: rett til Hjem, historikken nullstilles.
    func paperGoHome25() {
        Haptic34.back()
        dishSel = nil
        newsOpen = false
        paperGo("hjem")
    }
}

/// Ikon alene (20 pt i fanelinja, 22 pt i sidelinja).
struct NavIcon25: View {
    let icon: String
    let size: CGFloat

    var body: some View {
        if PaperTabIcon.isSymbol(icon) {
            Image(systemName: icon).font(.system(size: size - 2, weight: .semibold))
                .frame(width: size + 2, height: size + 2)
        } else {
            Text(icon).font(PF.serif(size, medium: true)).lineLimit(1).fixedSize()
                .frame(width: size + 2, height: size + 2)
        }
    }
}

/// Én fane i den flytende fanelinja nederst, etter valgt stil.
struct NavTabLabel25: View {
    @Environment(\.paper) private var p
    let name: String
    let icon: String
    let on: Bool
    let style: String

    var body: some View {
        let showIcon: Bool = style != "text" || on
        let showLabel: Bool = style == "text" || (style == "icons_active_label" && on)
        let alone: Bool = showIcon && !showLabel
        let expand: Bool = style == "icons" || !on
        HStack(spacing: 7) {
            if showIcon {
                if alone { NavIcon25(icon: icon, size: 20) } else { PaperTabIcon(icon: icon) }
            }
            if showLabel {
                Text(name).font(PF.ui(12.5, .semibold)).lineLimit(1).minimumScaleFactor(0.75)
            }
        }
        .foregroundStyle(on ? p.navActInk : p.navInk)
        .padding(.horizontal, expand ? 6 : 16)
        .frame(maxWidth: expand ? .infinity : nil)
        .frame(height: 46)
        .background(on ? p.navAct : Color.clear, in: Capsule())
        .contentShape(Capsule())
    }
}

/// Én fane i sidelinja (bred modus): ikon 22 på alle faner, etikett på én linje under (ikke i «Bare ikoner»).
struct RailTabLabel25: View {
    @Environment(\.paper) private var p
    let name: String
    let icon: String
    let on: Bool
    let style: String

    var body: some View {
        let clean: String = String(name.split(separator: "/").first ?? Substring(name))
        VStack(spacing: 3) {
            NavIcon25(icon: icon, size: 22)
            if style != "icons" {
                Text(clean).font(PF.ui(12.5, .semibold)).lineLimit(1).truncationMode(.tail).minimumScaleFactor(0.8)
            }
        }
        .foregroundStyle(on ? p.navActInk : p.navInk)
        .padding(.horizontal, 2)
        .frame(maxWidth: .infinity)
        .frame(height: style == "icons" ? 52 : 60)
        .background(on ? p.navAct : Color.clear, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .contentShape(Rectangle())
    }
}

/// Rund rød Hjem-knapp øverst i sidelinja (60 pt, lab-rød, hus 24 pt).
struct RailHomeButton25: View {
    @Environment(\.paper) private var p
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Image(systemName: "house").font(.system(size: 22, weight: .semibold))
                .foregroundStyle(p.onLab)
                .frame(width: 60, height: 60)
                .background(p.lab, in: Circle())
                .shadow(color: .black.opacity(0.5), radius: 10, y: 8)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Til Hjem")
    }
}

/* ---------- Stil-velgeren i «Rediger fanelinjen» ---------- */

/// En forhåndsvisning av fanelinja (første fane valgt) med valgt stil.
struct NavPreview25: View {
    @Environment(\.paper) private var p
    let tabs: [(String, String, String)]
    let style: String
    var plus: Bool = false

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(tabs.enumerated()), id: \.offset) { i, t in
                NavTabLabel25(name: t.1, icon: t.2, on: i == 0, style: style)
                    .layoutPriority(i == 0 && style != "icons" ? 1 : 0)
            }
            if plus {
                Text("+").font(.system(size: 24, weight: .regular)).foregroundStyle(p.onLab)
                    .frame(width: 46, height: 46)
                    .background(p.lab, in: Circle())
                    .padding(.leading, 4)
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 62)
        .background(p.nav, in: Capsule())
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// STIL · FORHÅNDSVISNING: stor forhåndsvisning av din egen fanelinje og tre kort.
struct NavStylePicker25: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let items: [PaperTabItem]
    /// Prompt 32: sidene med egen fanelinje (Domener, Abonnement, Familie) har ingen Mer-fane, og forhåndsvisningen ingen ⋯.
    var showMore: Bool = true

    private var tabs: [(String, String, String)] {
        var out: [(String, String, String)] = items.prefix(5).map { (it: PaperTabItem) -> (String, String, String) in (it.id, it.label, it.icon) }
        if showMore { out.append(("mer", "Mer", "ellipsis")) }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            PLabel(text: "Stil · forhåndsvisning")
            bigPreview
            HStack(spacing: 8) {
                ForEach(NavStyle25.options, id: \.0) { o in card(o.0, o.1) }
            }
        }
    }

    private var bigPreview: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: "#4a5a6a"), Color(hex: "#2a3440"), Color(hex: "#1d242c")], startPoint: .top, endPoint: .bottom)
            NavPreview25(tabs: tabs, style: store.navStyle25, plus: store.fabMode != "float")
                .padding(.horizontal, 10)
        }
        .frame(height: 110)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .animation(.easeOut(duration: 0.2), value: store.navStyle25)
    }

    private func card(_ id: String, _ name: String) -> some View {
        let on: Bool = store.navStyle25 == id
        let small: [(String, String, String)] = Array(tabs.prefix(3))
        return Button { store.setNavStyle25(id) } label: {
            VStack(alignment: .leading, spacing: 8) {
                NavPreview25(tabs: small, style: id)
                    .frame(width: 230, height: 62)
                    .scaleEffect(0.4)
                    .frame(width: 92, height: 26)
                    .frame(maxWidth: .infinity)
                Text(name).font(PF.ui(12.5, .semibold)).foregroundStyle(p.ink)
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
            }
            .padding(10)
            .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(on ? p.ink : Color.clear, lineWidth: 2))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(name)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
