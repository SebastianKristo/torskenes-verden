import SwiftUI
import UIKit

/* ---------------- Prompt 24: «Mer» lik på iOS og Android, Ruter fullskjerm og Hjem-oppsett ---------------- */
// Fasit: side «mer» i design/Mobil Papir App.dc.html og prompts/claude-code-mer-lik.md.
// Ett kort (radius 20, skygge), rader med Newsreader 19 og undertekst, «›», skillelinjer bare mellom rader,
// Prompt 25: ikon til venstre (40 × 40-boks, radius 12, bg, strekikon 21 i ikonpaletten). Faner som allerede står i fanelinjen tas ut.

struct More24Row: Identifiable {
    let id: String
    let name: String
    let sub: String
    var icon: String = "circle"
    let act: () -> Void
}

struct PaperMore24: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                if i > 0 { Rectangle().fill(p.line).frame(height: 1) }
                Button(action: r.act) { row(r, i) }
                    .buttonStyle(More24Press())
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.3), radius: 8, y: 10)
    }

    private func row(_ r: More24Row, _ i: Int) -> some View {
        HStack(spacing: 12) {
            Image(systemName: r.icon).font(.system(size: 19, weight: .medium))
                .foregroundStyle(PaperIconTheme.color(store.iconTheme, i))
                .frame(width: 40, height: 40)
                .background(p.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(r.name).font(PF.serif(19, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                Text(r.sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
            }
            Spacer(minLength: 6)
            Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
        }
        .padding(.horizontal, 14).padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var rows: [More24Row] {
        let inBar: Set<String> = Set(store.mainTabs(floating: store.fabMode == "float", onHome: true).map(\.0))
        var out: [More24Row] = []
        // Profiler uten Hjem i fanelinjen (f.eks. Finans + Boliger): Hjem står først her.
        if !inBar.contains("hjem") {
            out.append(More24Row(id: "hjem", name: "Hjem", sub: "Pakker, avganger og widgets", icon: "house") { store.paperGo("hjem") })
        }
        let n: Int = store.paperOnWay
        if !inBar.contains("sporing") {
            out.append(More24Row(id: "sporing", name: "Sporing", sub: n > 0 ? (n == 1 ? "1 pakke på vei" : "\(n) pakker på vei") : "Pakker og sendinger", icon: "shippingbox") { store.paperGo("sporing") })
        }
        if !inBar.contains("domener") {
            out.append(More24Row(id: "domener", name: "Domener", sub: "Trafikk, besøk og oppetid", icon: "globe") { store.paperOpenDomains(from: "mer") })
        }
        out.append(More24Row(id: "kalender", name: "Kalender", sub: "Timeplan, prøver og frister", icon: "calendar") { store.paperGo("kalender") })
        out.append(More24Row(id: "bursdag", name: "Bursdager", sub: "Hvem har bursdag snart", icon: "gift") { store.paperGo("bursdag") })
        if !inBar.contains("huske") {
            out.append(More24Row(id: "huske", name: "Huskeliste", sub: "Oppgaver og widgets", icon: "checklist") { store.paperGo("huske") })
        }
        if !inBar.contains("familie") {
            out.append(More24Row(id: "familie", name: "Familie og kart", sub: "Posisjon, soner og helse", icon: "mappin.and.ellipse") { store.paperGo("familie") })
        }
        out.append(More24Row(id: "finans", name: "Finans", sub: "Oversikt, liste, Finn og mer", icon: "creditcard") { store.paperMainTab("finans") })
        if !inBar.contains("nyheter") {
            out.append(More24Row(id: "nyheter", name: "Nyhetsleser", sub: "RSS med AI-sammendrag", icon: "dot.radiowaves.up.forward") { store.openNews() })
        }
        out.append(More24Row(id: "innst", name: "Innstillinger", sub: "Tema, bakgrunn og konto", icon: "gearshape") { store.paperGo("innst") })
        return out
    }
}

/// Kort trykk-opasitet (0,6) i stedet for grå rippel.
struct More24Press: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.6 : 1)
    }
}

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
