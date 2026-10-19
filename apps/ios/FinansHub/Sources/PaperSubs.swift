import SwiftUI

/* ---------------- Papir → Finans → Abonnementer: Subscription OS (Hjem · Innsikt · Historikk) ---------------- */

/// Prompt 23: nøyaktig etter Subscription OS.dc.html (variant mobile, theme papir/papirDark, hide-title, nav-external).
/// Tittelen står i toppbildet (ingen ekstra «Abonnementer»-tekst), og første kort overlapper toppbildet med 23 pt (PaperPage).
/// Hjem, Innsikt og Historikk ligger i fanelinja nederst, med «+ Legg til abonnement» i stedet for skanneknappen.
struct PaperSubs: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p

    var body: some View {
        VStack(spacing: 14) {
            if let x = store.subsX {
                switch store.subTab {
                case "ins": insights(x)
                case "hist": history(x)
                default:
                    // Prompt 37: prøveperiodene står nå i kortet «Gratis prøveperioder» øverst i SubHome23 (Subs37.swift),
                    // som kan flyttes og skjules i wiggle-modus. Trial31Strip brukes ikke her lenger.
                    SubHome23(x: x)
                }
            } else {
                ProgressView().padding(30)
            }
        }
        .task { if store.subsX == nil { try? await store.loadSubs() } }
        .sheet(isPresented: Binding(get: { store.subAdding }, set: { store.subAdding = $0 })) {
            // Prompt 28: nytt ark (Subs28Add.swift) med én grep-strek (systemets) og Papir-farger.
            SubAdd28Sheet().environment(\.paper, p)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(28)
                .presentationBackground(p.bg)
        }
        .sheet(isPresented: Binding(get: { store.subEdit != nil || store.subNew }, set: { if !$0 { store.subEdit = nil; store.subNew = false } })) {
            SubEdit23Sheet(item: store.subEdit).environment(\.paper, p)
                .presentationDetents([.large])
                .presentationDragIndicator(.hidden)
                .presentationBackground(SubTok23.of(p).bg)
        }
    }

    @ViewBuilder private func insights(_ x: SubsX) -> some View {
        SubMonthCard23(x: x)
        if x.score != nil { SubHealthCard23(x: x) }
        SubCatCard23(x: x)
    }

    @ViewBuilder private func history(_ x: SubsX) -> some View {
        SubAgentCard23(x: x)
        SubHistList23(x: x) { s in
            Haptics.shared.tap()
            store.subEdit = s
        }
    }
}
