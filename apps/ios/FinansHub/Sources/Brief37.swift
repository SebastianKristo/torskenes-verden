import SwiftUI

/* ---------------- Prompt 37: Now Brief – Vær-kortet åpner Vær ---------------- */
// prompts/prompt-37-pakke/claude-code-glimt-brief.md (2026-10-19). Hele Vær-kortet er trykkbart (scale 0,985 ved trykk og
// lett haptikk) og åpner Vær i fullskjerm OVER briefen (Brief35Page har sitt eget fullScreenCover). ✕ går tilbake til briefen
// på samme scroll-posisjon. Snakker Glimt, stoppes talen.

struct Brief37WeatherButton: View {
    @Environment(Store.self) private var store
    let b: Brief34

    var body: some View {
        Button {
            Glimt35Voice.shared.stop()
            Haptic34.light()
            store.weatherOpen = true
            Task { await store.loadWeatherFull() }
        } label: {
            Brief34Weather(b: b)
                .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(Press37Style())
        .accessibilityLabel("Åpne Vær")
        .accessibilityAddTraits(.isButton)
    }
}

/// Trykk-stil: krymper til 98,5 % mens fingeren er nede.
struct Press37Style: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/* ---------- Now Brief: Gjøremål-kortet (claude-code-gjoremal-glimt.md, punkt 9) ---------- */
// «Gjøremål · 3 gjøremål i dag» med de tre første (forfalt + i dag) og avkrysning rett i briefen, og «Åpne Gjøremål ›».
// Bygger på /api/tasks (tilgangen følger listemedlemskap på serveren). Vises bare når det er noe i dag.
