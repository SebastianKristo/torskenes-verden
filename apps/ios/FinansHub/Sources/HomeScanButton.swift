import SwiftUI
import UIKit

/* ---------------- Prompt 41: slå av skanneknappen på Hjem (mobil) ---------------- */
// Spesifikasjon: prompts/prompt-41-pakke/claude-code-hjem-skanneknapp-av.md. Fasit: Mobil Papir App.dc.html → Tilpass → Fanelinje
// og «Rediger fanelinjen». Av = den røde flytende knappen (og «+» i linjen) skjules bare på Hjem; de andre fanene beholder sin.
// Skanning fra Hjem går fortsatt via søkefeltet («skann kvittering») og ved å holde inne Finans-fanen.
// Lagres per enhet (papir_scan_home), standard På. Samme verdi i Tilpass og i «Rediger fanelinjen».

@MainActor
@Observable
final class Scan41 {
    static let shared = Scan41()
    static let key: String = "papir_scan_home"

    var onHome: Bool = (UserDefaults.standard.object(forKey: Scan41.key) as? Bool) ?? true {
        didSet { UserDefaults.standard.set(onHome, forKey: Scan41.key) }
    }

    func toggle() {
        Haptics.shared.select()
        withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.24)) { onHome.toggle() }
    }

    static var sub: String {
        Scan41.shared.onHome ? "Vises på Hjem" : "Skjult på Hjem · vises i de andre fanene"
    }
}

extension Store {
    /// Prompt 41: Hjem-siden (ikke undersider) når skanneknappen er slått av der.
    var scanHiddenOnHome41: Bool {
        paperTab == "hjem" && paperClassic == nil && paperFin == nil && !Scan41.shared.onHome
    }
}

/// Raden med rødt skanne-ikon, «Skanneknapp på Hjem», undertekst og bryter (Tilpass → Fanelinje og «Rediger fanelinjen»).
struct Scan41Row: View {
    @Environment(\.paper) private var p
    @MainActor private var s: Scan41 { Scan41.shared }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "viewfinder").font(.dyn51(size: 15, weight: .semibold)).foregroundStyle(p.onLab)
                .frame(width: 32, height: 32)
                .background(p.lab, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text("Skanneknapp på Hjem").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(Scan41.sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Toggle("", isOn: Binding(get: { s.onHome }, set: { (v: Bool) in if v != s.onHome { s.toggle() } }))
                .labelsHidden()
                .tint(p.pos)
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
