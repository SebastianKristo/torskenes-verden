import SwiftUI

/* ---------------- Innstillinger → Utseende → Fanelinje: systemets eller Papir (klassisk) ----------------
 Brukerønske etter Fase 4: «jeg vil at ios-appen skal kunne velge mellom liquid glass navbar som nå, og den forrige navbaren».
 – Systemets (Liquid Glass): systemets TabView (Liquid Glass på iOS 26). Standard.
 – Papir (klassisk): den flytende pillen nederst fra før Fase 4 (PapirFanelinje.swift), med Papir-/Glass-utseendet og
   stilen fra «Fanelinje-stil» (NavStyle.swift).
 Begge bruker samme faner (ShellTabs.all/compact), samme valg (ShellTabs.select), samme stakk per fane og samme merker.
 Valget gjelder kompakt bredde (iPhone, og iPad i Slide Over/delt skjerm). I regulær bredde beholdes sidekolonnen.
 Lagres per enhet (et visningsvalg, ingen hemmelighet). /api/me/layout har ikke noe felt for dette, så det synkes ikke. */

/// Hvilken fanelinje appen viser i kompakt bredde.
enum FanelinjeStil: String, CaseIterable, Identifiable, Sendable {
    case system
    case papir

    var id: String { rawValue }

    /// Navnet i Innstillinger.
    var navn: String {
        switch self {
        case .system: return "Systemets (Liquid Glass)"
        case .papir: return "Papir (klassisk)"
        }
    }

    /// Forklaringen under navnet.
    var forklaring: String {
        switch self {
        case .system: return "Systemets fanelinje nederst"
        case .papir: return "Den flytende pillen fra før · stilen velges under «Fanelinje-stil»"
        }
    }
}

/// Valget av fanelinje, lest av skallet (AppTabs) og Innstillinger. Bytter straks, uten omstart.
@MainActor
@Observable
final class FanelinjeValg {
    static let shared: FanelinjeValg = FanelinjeValg()
    /// Nøkkelen i UserDefaults (per enhet).
    nonisolated static let nokkel: String = "fh_fanelinje_stil"

    var stil: FanelinjeStil = FanelinjeValg.lagret() {
        didSet { UserDefaults.standard.set(stil.rawValue, forKey: FanelinjeValg.nokkel) }
    }

    /// Den lagrede verdien. Ukjent eller ingen verdi = systemets (standard).
    nonisolated static func lagret() -> FanelinjeStil {
        let raw: String = UserDefaults.standard.string(forKey: FanelinjeValg.nokkel) ?? ""
        return FanelinjeStil(rawValue: raw) ?? .system
    }

    func velg(_ ny: FanelinjeStil) {
        guard ny != stil else { return }
        Haptics.shared.select()
        stil = ny
    }

    /// Papir-pillen vises bare i kompakt bredde.
    func klassisk(regular: Bool) -> Bool {
        !regular && stil == .papir
    }
}

/* ---------- Skallet: er systemets fanelinje skjult for Papir-pillen? ---------- */

private struct ShellKlassiskKey: EnvironmentKey {
    static let defaultValue: Bool = false
}

private struct ShellKlassiskHoydeKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    /// true når Papir-pillen erstatter systemets fanelinje (ShellPageView skjuler da systemets linje).
    var shellKlassiskFanelinje: Bool {
        get { self[ShellKlassiskKey.self] }
        set { self[ShellKlassiskKey.self] = newValue }
    }

    /// Høyden Papir-pillen tar nederst (0 når den ikke vises), så sidene får luft under innholdet.
    var shellKlassiskHoyde: CGFloat {
        get { self[ShellKlassiskHoydeKey.self] }
        set { self[ShellKlassiskHoydeKey.self] = newValue }
    }
}

/* ---------- Innstillinger → Utseende → Fanelinje ---------- */

/// To valg med hake (som en systemliste). Brukes i Tilpass-siden (Innstillinger → Utseende).
struct FanelinjeValgRad: View {
    @Environment(\.paper) private var p
    @MainActor private var valg: FanelinjeValg { FanelinjeValg.shared }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(FanelinjeStil.allCases.enumerated()), id: \.element.id) { i, s in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1).padding(.leading, 14) }
                rad(s)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous))
    }

    private func rad(_ s: FanelinjeStil) -> some View {
        let on: Bool = valg.stil == s
        return Button { valg.velg(s) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.navn).font(.ds(.body, custom: PF.uiName(.semibold))).foregroundStyle(p.ink)
                    Text(s.forklaring).font(.ds(.footnote, custom: PF.uiName(.regular))).foregroundStyle(p.mut)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Image(systemName: "checkmark").font(.ds(.body)).foregroundStyle(p.lab)
                    .opacity(on ? 1 : 0)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}
