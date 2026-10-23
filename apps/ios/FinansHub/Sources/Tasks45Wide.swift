import SwiftUI
import UIKit

/* ---------------- Prompt 45: Gjøremål på iPad (claude-code-gjoremal-fold-navbar-glimt.md, -fold-nytt-design.md) ----------------
 – Samme sidelinje som Hjem til venstre (PaperShell: rail45 også i Gjøremål), ingen bakgrunnsbilde i toppen (PaperHero.plain45).
 – Storskjermvisningen fra 1a (Stor Skjerm Oppsett.dc.html): lister 250 · oppgaver · Glimt og valgt oppgave 320 (Tasks43Wide.swift).
 – «Ny oppgave …»-feltet + Glimt-knappen (60 × 60, radius 22, aksent, ✦) nederst i oppgavekolonnen – ikke en fast bunnlinje
   over hele skjermen og ikke over sidelinja. Feltet og knappen følger tastaturet sammen (keyboardLift32b). */

enum Tasks45 {
    /// Kolonnene i Tasks17 (split43): listekolonnen 250 + skillelinje 1 + 2 × 14 luft, høyre kolonne 320 + 29.
    static let listCol: CGFloat = 250 + 29
    static let rightCol: CGFloat = 320 + 29
    /// PaperPage: sidelinja 108 + 16 pt marg, innholdet maks 1500 pt bredt og midtstilt.
    static func insets(_ width: CGFloat) -> (CGFloat, CGFloat) {
        let avail: CGFloat = Swift.max(0, width - 108 - 32)
        let inner: CGFloat = Swift.min(1500, avail)
        let side: CGFloat = (avail - inner) / 2
        return (108 + 16 + side + listCol, 16 + side + rightCol)
    }
}

struct Tasks45WideDock: View {
    let width: CGFloat
    let kb: Bool
    let safeBottom: CGFloat

    var body: some View {
        let ins: (CGFloat, CGFloat) = Tasks45.insets(width)
        HStack(alignment: .center, spacing: 10) {
            TaskDockField22(ownButton: false)
            Tasks45GlimtButton()
        }
        .padding(.leading, ins.0)
        .padding(.trailing, ins.1)
        .padding(.bottom, kb ? 8 : (safeBottom < 10 ? 18 : 8))
        .keyboardLift32b(gap: 12)
        .ignoresSafeArea(.keyboard)
        .animation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.24), value: Kb32b.shared.frame)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .transition(.opacity)
    }
}

/// Glimt-knappen ved «Ny oppgave …» i brettet modus: 60 × 60, radius 22, aksentfarge, hvit ✦. Trykk = skriv eller spør Glimt
/// (deler opp i punkter, legger i riktig liste), samme som den runde knappen på telefon.
struct Tasks45GlimtButton: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        Button { Tasks37Glimt.shared.open(store) } label: {
            Image(systemName: "sparkle").font(.system(size: 24, weight: .bold)).foregroundStyle(p.onLab)
                .frame(width: 60, height: 60)
                .background(p.lab, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .shadow(color: Color.black.opacity(0.4), radius: 14, y: 10)
                .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(Press45Style())
        .accessibilityLabel("Glimt · skriv eller spør")
    }
}
