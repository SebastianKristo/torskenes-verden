import SwiftUI

/* ---------------- Prompt 47: Kalender for Mac – Innstillinger → Kontoer → SERVER ---------------- */
// Spesifikasjon: claude-code-standard-serveradresser.md. Ekstern og lokal adresse (forhåndsutfylt med standardverdiene),
// status per adresse med «Test», «Tilbakestill til standard» og Lagre (synkes til kontoen). Logikk: SharedKal/Core/KalSrv47Core.swift.

struct MacSrv47Section: View {
    @Environment(\.mk) private var t
    @ObservedObject private var m: KalSrv47Model = KalSrv47Model.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            MacSrv47Row(title: "Ekstern adresse", placeholder: KalSrv47.standardExternal, text: $m.external, ms: m.extMs) { m.test(external: true) }
            MacSrv47Row(title: "Lokal adresse", placeholder: KalSrv47.standardLocal, text: $m.local, ms: m.locMs) { m.test(external: false) }
            Text("Hjemme (lokal adresse svarer innen 1,5 s) brukes lokal, ellers ekstern. Endringer synkes til dine andre enheter.")
                .font(MacFont.ui(11.5)).foregroundColor(t.mut2).fixedSize(horizontal: false, vertical: true)
            if !m.message.isEmpty {
                Text(m.message).font(MacFont.ui(12, .semibold)).foregroundColor(t.ink2).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                MacPill(title: "Tilbakestill til standard", filled: false) { m.reset(device: KalDev44.name) }
                Spacer()
                MacPill(title: m.busy ? "Lagrer …" : "Lagre", enabled: !m.busy) { m.save(device: KalDev44.name) }
            }
        }
        .onAppear { m.load() }
    }
}

struct MacSrv47Row: View {
    @Environment(\.mk) private var t
    let title: String
    let placeholder: String
    @Binding var text: String
    let ms: Int?
    let test: () -> Void

    private var color: Color {
        guard let ms, ms >= 0 else { return t.mut }
        return ms == 0 ? t.red : t.green
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(MacFont.ui(12.5, .bold)).foregroundColor(t.ink)
            HStack(spacing: 8) {
                MacLoginField(title: placeholder, text: $text, secure: false)
                MacPill(title: "Test", filled: false) { test() }
            }
            HStack(spacing: 6) {
                Circle().fill(color).frame(width: 7, height: 7)
                Text(KalSrv47Model.status(ms)).font(MacFont.ui(11.5, .semibold)).foregroundColor(color)
            }
        }
    }
}
