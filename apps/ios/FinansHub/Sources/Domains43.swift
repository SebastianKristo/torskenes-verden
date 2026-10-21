import SwiftUI

/* ---------------- Prompt 43: Domener – Glimt-raden inne i domenekortet ----------------
 Fasit: prompts/prompt-43-pakke/claude-code-domener-glimt-i-kortet.md og Homelab Domener Papir.dc.html (mobil).
 Den frittstående Glimt-knappen er borte (Paper.swift viser ingen rund ✦-knapp i Domener lenger). Raden ligger nederst i
 domenekortet under periodevelgeren: mørk flate (#1b1a17, 16 pt hjørner, min. 54 pt), Glimt-orben (30 pt, ikke figuren),
 «GLIMT · SISTE DØGN» (følger perioden) og «Oppsummering av siste døgn ›». Oransje prikk når en ny oppsummering er klar.
 Trykk åpner oppsummeringen (Dom38GlimtCard); mens den er åpen skjules raden. */

enum Domains43 {
    static let seenKey: String = "dom43_seen_head"

    /// (etikett, tekst) for perioden: 1h → SISTE TIME, 24h → SISTE DØGN, 7d → SISTE 7 DAGER, 30d → SISTE 30 DAGER.
    static func period(_ r: String) -> (String, String) {
        switch r {
        case "1h": return ("SISTE TIME", "siste time")
        case "7d": return ("SISTE 7 DAGER", "siste 7 dager")
        case "30d": return ("SISTE 30 DAGER", "siste 30 dager")
        default: return ("SISTE DØGN", "siste døgn")
        }
    }
}

struct Domains43GlimtRow: View {
    @Environment(Store.self) private var store
    @MainActor private var g: Dom38Glimt { Dom38Glimt.shared }

    var body: some View {
        let per: (String, String) = Domains43.period(store.domRange)
        let seen: String = UserDefaults.standard.string(forKey: Domains43.seenKey) ?? ""
        let fresh: Bool = !g.head.isEmpty && g.head != seen
        if !(g.open && store.paperTab == "domener") {
            Button {
                UserDefaults.standard.set(g.head, forKey: Domains43.seenKey)
                g.tap(store)
            } label: {
                HStack(spacing: 12) {
                    Orb43(size: 30, busy: g.loading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("GLIMT · " + per.0).font(PF.mono(9.5)).tracking(1.3).foregroundStyle(Color(hex: "#e8a593")).lineLimit(1)
                        Text("Oppsummering av " + per.1).font(PF.ui(14.5, .bold)).foregroundStyle(Color(hex: "#f3efe6")).lineLimit(1)
                            .minimumScaleFactor(0.85)
                    }
                    Spacer(minLength: 6)
                    Text("›").font(PF.ui(18, .bold)).foregroundStyle(Color(hex: "#f3efe6").opacity(0.8))
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
                .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
                .background(Color(hex: "#1b1a17"), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(alignment: .topTrailing) {
                    if fresh {
                        Circle().fill(Color(hex: "#e8794a")).frame(width: 8, height: 8)
                            .overlay(Circle().stroke(Color(hex: "#1b1a17"), lineWidth: 2))
                            .padding(.top, 7).padding(.trailing, 9)
                    }
                }
                .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Glimt: oppsummering av " + per.1)
            .accessibilityHint(fresh ? "Ny oppsummering er klar" : "")
        }
    }
}
