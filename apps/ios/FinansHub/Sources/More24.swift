import SwiftUI
import UIKit

/* ---------------- Prompt 24: «Mer» lik på iOS og Android, Ruter fullskjerm og Hjem-oppsett ---------------- */
// Fasit: side «mer» i design/Mobil Papir App.dc.html og prompts/claude-code-mer-lik.md.
// Ett kort (radius 20, skygge), rader med Newsreader 19 og undertekst, «›», skillelinjer bare mellom rader,
// Prompt 25: ikon til venstre (40 × 40-boks, radius 12, bg, strekikon 21 i ikonpaletten). Faner som allerede står i fanelinjen tas ut.

extension Store {
    /// Ruter-visningen vises som fullskjerm (uten fanelinje og FAB) når Avganger er åpen i Papir.
    var ruter24Full: Bool {
        paperTab == "avg" && paperClassic == nil && paperFin == nil && !newsOpen && dishSel == nil
    }
}

/* ---------- Hjem: Pakker vises alltid, Bursdager (h9) legges til ---------- */

/// Pakker-kortet når ingen pakker er aktive (design: «SPORING · Ingen aktive pakker · Legg til et sporingsnummer»).
struct PaperNoPackagesCard24: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        Button { store.paperGo("sporing") } label: {
            HStack(spacing: 14) {
                Image(systemName: "shippingbox").font(.system(size: 22, weight: .semibold)).foregroundStyle(p.mut)
                    .frame(width: 52, height: 52)
                    .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    PLabel(text: "Sporing")
                    Text("Ingen aktive pakker").font(PF.serif(20, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    Text("Legg til et sporingsnummer").font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text("›").font(PF.ui(13)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

extension Store {
    /// Engangsretting (prompt 24): et tidligere oppsett kunne ha mistet Pakker (h2) på Hjem. Pakker hentes fram
    /// igjen og settes tilbake på plass 2 hvis den mangler. Nye kort (Bursdager h9) legges bakerst av pageCards
    /// uten å erstatte noe i lagret rekkefølge.
    func migrateHome24() {
        let flag: String = AcctScope.key("fh_home24_h2")
        if UserDefaults.standard.bool(forKey: flag) { return }
        UserDefaults.standard.set(true, forKey: flag)
        guard var l = paperPages["hjem"] else { return }
        let wasHidden: Bool = l.hidden.contains("h2")
        let missing: Bool = !l.order.isEmpty && !l.order.contains("h2")
        guard wasHidden || missing else { return }
        l.hidden.removeAll { $0 == "h2" }
        if missing {
            let at: Int = l.order.firstIndex(of: "h1").map { $0 + 1 } ?? 0
            l.order.insert("h2", at: Swift.min(at, l.order.count))
        }
        paperPages["hjem"] = l
        savePaperLayout(["pages": ["hjem": ["order": l.order, "hidden": l.hidden]]])
    }
}
