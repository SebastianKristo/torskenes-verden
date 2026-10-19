import SwiftUI

/* ---------------- Prompt 36: matplanen er alltid felles for alle brukere ----------------
   prompts/prompt-36-pakke/claude-code-matplan-delt.md. Ingen deleknapp eller privat-valg i appen. Under Ukeplan står
   «Felles for husstanden · Endret av Nina 18.42» (sharedNote fra /mat/api/week, ellers bygget av updatedBy/updatedAt).
   Sanntid: «meal:changed» på /api/ws laster uka på nytt, med toasten «Oppdatert av Nina» når en annen bruker endret. */

enum Mat36 {
    @MainActor static func changed(_ o: [String: Any], _ store: Store) {
        let by: String = JS.str(o, "updatedByName") ?? JS.str(JS.dict(o, "updatedBy"), "name") ?? JS.str(o, "updatedBy") ?? JS.str(o, "by") ?? ""
        Task { @MainActor in
            try? await store.loadWeek()
            let me: String = store.displayName.lowercased()
            if !by.isEmpty && by.lowercased() != me && !me.hasPrefix(by.lowercased()) {
                store.flash("Oppdatert av " + by)
            }
        }
    }
}

struct Mat36Shared: View {
    let note: String
    let pal: MatPal

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "person.2").font(.system(size: 11, weight: .semibold)).foregroundStyle(pal.muted)
            Text(note).font(pal.ui(12)).foregroundStyle(pal.muted).lineLimit(1).minimumScaleFactor(0.85)
        }
        .padding(.horizontal, 4)
        .accessibilityElement(children: .combine)
    }

    static func text(_ w: Week) -> String {
        if let s = w.sharedNote?.value, !s.isEmpty { return s }
        var out: String = "Felles for husstanden"
        let by: String = w.updatedBy?.value ?? ""
        if !by.isEmpty {
            out += " · Endret av " + by
            if let d = w.updatedAt?.date { out += " " + JS.fmt(d, "HH.mm") }
        }
        return out
    }
}
