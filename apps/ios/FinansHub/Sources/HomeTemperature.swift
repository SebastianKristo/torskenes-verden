import SwiftUI

/* ---------------- Prompt 36: temperaturen på Hjem – trykk åpner Vær, hold inne åpner Yr ----------------
   prompts/prompt-36-pakke/claude-code-hjem-temperatur-trykk.md (fasit: Homelab Papir Web.dc.html → wxTap).
   Kort trykk → Vær-siden i appen. Hold inne ≥ 550 ms → yr.no for valgt sted (in-app-nettleser), lett haptikk når Yr åpnes,
   og trykket etterpå ignoreres. Mens man holder, krymper temperaturen til 0,94 (0,18 s). Ingen iOS-«callout». */

struct Temp36Press: View {
    @Environment(Store.self) private var store
    let temp: String
    let line: String
    @State private var pressing: Bool = false
    @State private var held: Bool = false

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(temp).font(PF.serif(52))
            Text(line).font(PF.ui(13)).opacity(0.9).lineLimit(1).minimumScaleFactor(0.8)
        }
        .scaleEffect(pressing ? 0.94 : 1, anchor: .trailing)
        .animation(.easeOut(duration: 0.18), value: pressing)
        .contentShape(Rectangle())
        .onTapGesture {
            if held { held = false; return }
            Haptics.shared.tap()
            store.openWeather()
        }
        .onLongPressGesture(minimumDuration: 0.55, maximumDistance: 20, perform: {
            held = true
            Haptics.shared.success()
            store.openURL(store.yrURL)
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 600_000_000)
                held = false
            }
        }, onPressingChanged: { (v: Bool) in
            pressing = v
        })
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("Været " + temp)
        .accessibilityHint("Trykk: Vær. Hold inne: åpne Yr.")
        .accessibilityAction(named: "Åpne Yr") { store.openURL(store.yrURL) }
        .accessibilityAction { store.openWeather() }
    }
}
