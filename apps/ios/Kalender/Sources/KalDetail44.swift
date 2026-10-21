import SwiftUI
import UIKit

/* ---------------- Prompt 44: detaljarket – Media-utgivelse og deltakere ---------------- */
// Fasit: Kalender App.dc.html (MEDREL, detaljarket). Media: status fra Media (Lastet ned / Lastes ned 64 % / Mangler) og
// «Åpne i Media» (Homelab-appen). Skrivebeskyttet. Deltakere: navn og svar (Invitert / Ja / Kanskje / Nei).

struct KalMediaInfo44: View {
    @Environment(\.kal) private var t
    let e: KalEvent
    let m: KalMedia44

    private var status: String {
        if !m.statusText.isEmpty { return m.statusText }
        switch m.status {
        case "ok", "downloaded": return "Lastet ned"
        case "dl", "downloading": return "Lastes ned"
        case "missing": return "Mangler"
        default: return "Kommer"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            KalInfoRow(label: m.movie ? "Film" : "Episode", value: e.note.isEmpty ? "–" : e.note)
            KalInfoRow(label: "Status i Media", value: status)
            Button(action: open) {
                Text("Åpne i Media ›").font(KalFont.ui(14, .bold)).foregroundStyle(t.bg)
                    .frame(maxWidth: .infinity).frame(height: 44)
                    .background(Capsule().fill(t.ink))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            Text("Fra Sonarr og Radarr · endres i Media, ikke her.").font(KalFont.ui(12)).foregroundStyle(t.mut)
        }
    }

    /// papir://media/sonarr/12 → homelab://media/sonarr/12 (Homelab-appen), ellers Media-fanen.
    private func open() {
        KalHaptic.tap()
        var link: String = m.deepLink
        if link.hasPrefix("papir://") { link = "homelab://" + String(link.dropFirst("papir://".count)) }
        if link.isEmpty { link = "homelab://media" }
        guard let u = URL(string: link) else { return }
        UIApplication.shared.open(u, options: [:]) { (ok: Bool) in
            if !ok, let w = URL(string: "homelab://media") { UIApplication.shared.open(w) }
        }
    }
}

struct KalAttList44: View {
    @Environment(\.kal) private var t
    let att: [KalAtt44]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            KalLabel(text: "DELTAKERE")
            ForEach(att) { (a: KalAtt44) in
                KalAttRow44(a: a)
            }
        }
    }
}

struct KalAttRow44: View {
    @Environment(\.kal) private var t
    let a: KalAtt44

    private var label: String {
        if !a.name.isEmpty { return a.name }
        return a.email ?? ""
    }

    var body: some View {
        HStack(spacing: 10) {
            Text(String(label.prefix(1)).uppercased()).font(KalFont.ui(11, .heavy)).foregroundStyle(t.ink)
                .frame(width: 26, height: 26)
                .background(Circle().fill(t.line))
            Text(label).font(KalFont.ui(13.5)).foregroundStyle(t.ink).lineLimit(1)
            Spacer(minLength: 4)
            Text(a.statusLabel).font(KalFont.ui(12, .bold)).foregroundStyle(t.mut)
        }
        .frame(minHeight: 34)
    }
}
