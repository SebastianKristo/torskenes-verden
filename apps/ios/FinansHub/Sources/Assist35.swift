import SwiftUI

/* ---------------- Prompt 35: AI-søk på Hjem – været for hvilket som helst sted ----------------
   prompts/prompt-35-pakke/claude-code-ai-sok-vaer-sted.md. Serveren (SERVER35) finner stedet i teksten, geokoder og svarer
   /api/assist → {intent:'weather', text, place, open:{route:'vaer', name, lat, lon}}. Appen viser serverens svar i boblen;
   trykk (eller «Åpne Vær for … ›») åpner Vær for stedet, som legges midlertidig i bylista (ikke lagret på serveren). */

struct Assist35WxFoot: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Assist31 { Assist31.shared }
    let a: Assist31Answer

    var body: some View {
        HStack(spacing: 8) {
            Text("✦ " + (a.source.isEmpty ? "Vær" : a.source))
                .font(PF.ui(11.5, .semibold)).foregroundStyle(Color(hex: "#f6f2ea").opacity(0.55)).lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                Haptics.shared.tap()
                m.closeHome()
                store.openWeather35(name: a.wx35Name, lat: a.wx35Lat, lon: a.wx35Lon)
            } label: {
                Text("Åpne Vær for " + Assist35WxFoot.short(a.wx35Name) + " ›").font(PF.ui(12.5, .bold)).foregroundStyle(Color.white).lineLimit(1)
                    .padding(.horizontal, 14).frame(height: 32)
                    .background(Color.white.opacity(0.14), in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    /// «New York, USA» → «New York».
    static func short(_ n: String) -> String {
        n.components(separatedBy: ",").first?.trimmingCharacters(in: .whitespaces) ?? n
    }
}

extension Store {
    /// Åpner Vær for et sted fra AI-søket. Stedet legges midlertidig først i bylista (lagres ikke på serveren).
    func openWeather35(name: String, lat: Double, lon: Double) {
        let near: WxPlace? = weatherPlaces.first { (p: WxPlace) -> Bool in
            guard let la = p.lat, let lo = p.lon else { return false }
            return abs(la - lat) < 0.05 && abs(lo - lon) < 0.05
        }
        let id: String
        if let near {
            id = near.id
        } else {
            id = String(format: "tmp35:%.4f,%.4f", lat, lon)
            // Bare ett midlertidig sted om gangen.
            weatherPlaces.removeAll { (p: WxPlace) -> Bool in p.id.hasPrefix("tmp35:") }
            let short: String = Assist35WxFoot.short(name)
            let region: String = name.contains(",") ? (name.components(separatedBy: ",").last?.trimmingCharacters(in: .whitespaces) ?? "") : ""
            weatherPlaces.insert(WxPlace(id: id, name: short.isEmpty ? name : short, lat: lat, lon: lon, region: region), at: 0)
        }
        weatherPlace = id
        weatherOpen = true
        Task { await self.loadWeatherFull(force: true) }
    }
}
