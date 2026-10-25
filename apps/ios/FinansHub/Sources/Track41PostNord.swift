import SwiftUI

/* ---------------- Prompt 41: PostNord uten konto og uten API-nøkkel ---------------- */
// Spesifikasjon: prompts/prompt-41-pakke/claude-code-postnord-uten-nokkel.md. Fasit: Mobil Papir App.dc.html → Integrasjoner → PostNord.
// Serveren sporer via PostNords offentlige Track & Trace-endepunkt (som ha-postnord; udokumentert og kan endres), nøkkelen er valgfri.
// Kortet viser «Sporing uten konto og uten nøkkel» og teststatus fra GET /api/tracking/postnord/health («OK · offentlig endepunkt»).

struct Track41PostNordCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @State private var status: String = ""
    @State private var ok: Bool? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "shippingbox").font(.dyn51(size: 14, weight: .semibold)).foregroundStyle(p.ink)
                Text("Sporing uten konto og uten nøkkel").font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
            }
            Text("Lim inn sporingsnummeret i Sporing. Nummer som 00370…, …SE/DK/FI eller 2 bokstaver + 9 sifre + SE/DK/FI går automatisk til PostNord. Nøkkelen under er valgfri.")
                .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 6) {
                Circle().fill(ok == true ? p.pos : (ok == false ? p.lab : p.mut)).frame(width: 7, height: 7)
                Text(status.isEmpty ? "Sjekker PostNord …" : status).font(PF.mono(11.5)).foregroundStyle(p.ink)
            }
            .padding(.top, 2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .task { await load() }
    }

    private func load() async {
        guard let d = try? await store.api.callAt("/api", "GET", "/tracking/postnord/health", timeout: 15) else {
            ok = nil
            status = "Teststatus ikke tilgjengelig"
            return
        }
        let o: [String: Any] = JS.obj(d)
        let good: Bool = JS.bool(o, "ok") ?? ((JS.str(o, "status") ?? "").lowercased() == "ok")
        ok = good
        let mode: String = JS.str(o, "mode") ?? JS.str(o, "source") ?? ""
        let txt: String = JS.str(o, "text") ?? JS.str(o, "message") ?? JS.str(o, "label") ?? ""
        if !txt.isEmpty {
            status = txt
        } else if good {
            status = "OK · " + (mode == "key" || mode == "official" ? "eget API (nøkkel)" : "offentlig endepunkt")
        } else {
            status = "PostNord svarer ikke akkurat nå"
        }
    }
}
