import SwiftUI

/* ---------------- Prompt 47: Kalender (iPhone/iPad) – Innstillinger → Server ---------------- */
// Spesifikasjon: claude-code-standard-serveradresser.md. To felt (Ekstern adresse, Lokal adresse) forhåndsutfylt med
// standardverdiene, status under hvert felt («Svarer · 34 ms» / «Svarer ikke») med «Test», «Tilbakestill til standard» og Lagre.
// Logikken ligger i SharedKal/Core/KalSrv47Core.swift (felles med Mac).

struct KalSrv47Sheet: View {
    @Environment(\.kal) private var t
    @ObservedObject private var m: KalSrv47Model = KalSrv47Model.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header
                KalSrv47Field(title: "Ekstern adresse", placeholder: KalSrv47.standardExternal, text: $m.external, ms: m.extMs) {
                    m.test(external: true)
                }
                KalSrv47Field(title: "Lokal adresse", placeholder: KalSrv47.standardLocal, text: $m.local, ms: m.locMs) {
                    m.test(external: false)
                }
                Text("Hjemme (lokal adresse svarer innen 1,5 s) brukes lokal, ellers ekstern. Endringer synkes til dine andre enheter.")
                    .font(KalFont.ui(12)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                if !m.message.isEmpty {
                    Text(m.message).font(KalFont.ui(12.5, .semibold)).foregroundStyle(t.ink2).fixedSize(horizontal: false, vertical: true)
                }
                buttons
            }
            .padding(20)
        }
        .background(t.bg.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .onAppear { m.load() }
    }

    private var header: some View {
        HStack {
            Text("Server").font(KalFont.serif(24)).foregroundStyle(t.ink)
            Spacer()
            KalPill(title: "Ferdig", filled: false) { m.sheetOpen = false }
        }
    }

    private var buttons: some View {
        HStack(spacing: 8) {
            KalPill(title: "Tilbakestill til standard", filled: false) { m.reset(device: KalDev44.name) }
            Spacer()
            KalPill(title: m.busy ? "Lagrer …" : "Lagre", enabled: !m.busy) { m.save(device: KalDev44.name) }
        }
    }
}

struct KalSrv47Field: View {
    @Environment(\.kal) private var t
    let title: String
    let placeholder: String
    @Binding var text: String
    let ms: Int?
    let test: () -> Void

    private var color: Color {
        guard let ms else { return t.mut }
        if ms < 0 { return t.mut }
        return ms == 0 ? t.acc : t.green
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            KalLabel(text: title.uppercased())
            TextField(placeholder, text: $text)
                .keyboardType(.URL)
                .textContentType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .font(KalFont.ui(15, .medium)).foregroundStyle(t.ink)
                .padding(.horizontal, 14).frame(height: 48)
                .background(RoundedRectangle(cornerRadius: 14).fill(t.card))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(t.line, lineWidth: 1))
            HStack(spacing: 8) {
                Circle().fill(color).frame(width: 7, height: 7)
                Text(KalSrv47Model.status(ms)).font(KalFont.ui(12, .semibold)).foregroundStyle(color)
                Spacer()
                Button(action: {
                    KalHaptic.tap()
                    test()
                }) {
                    Text("Test").font(KalFont.ui(12.5, .bold)).foregroundStyle(t.acc).frame(minWidth: 44, minHeight: 32)
                }
                .buttonStyle(.plain)
            }
        }
    }
}
