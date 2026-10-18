import SwiftUI

/* ---------------- Prompt 20: Finans-flisene (Mer i Finans) – farger og egen rekkefølge ---------------- */

/// Egen ikonfarge per flis, på tonet bakgrunn.
enum FinTileColor20 {
    static func hex(_ id: String) -> String {
        switch id {
        case "budsjett": return "#d9822b"   // oransje
        case "kvitt": return "#b23a2a"      // rød
        case "faste": return "#7b4fa8"      // lilla
        case "kontoer": return "#2f6db5"    // blå
        case "aksjer": return "#2f7a4f"     // grønn
        case "rapp": return "#b8892a"       // oker
        case "abo": return "#c2477f"        // rosa
        case "boliger": return "#1f8585"    // grønnblå
        case "import": return "#4b4fb5"     // indigo
        case "finn": return "#0063fb"       // blå (Finn)
        case "fsok": return "#7a3b69"       // plomme
        case "innst": return "#6f6a5f"      // grå
        default: return "#5d7690"           // Liste og andre
        }
    }

    static func color(_ id: String) -> Color { Color(hex: hex(id)) }
}

/// Rekkefølgen lagres lokalt (papir_fm_order) og per bruker i /api/me/layout som fmOrder.
enum FinTileOrder20 {
    static let key: String = "papir_fm_order"

    static func load() -> [String] {
        (UserDefaults.standard.array(forKey: key) as? [String]) ?? []
    }

    @MainActor static func save(_ order: [String], _ store: Store) {
        UserDefaults.standard.set(order, forKey: key)
        // Eldre servere kjenner ikke fmOrder (400); da gjelder bare den lokale rekkefølgen.
        store.savePaperLayout(["fmOrder": order])
    }

    @MainActor static func reset(_ store: Store) {
        UserDefaults.standard.removeObject(forKey: key)
        store.savePaperLayout(["fmOrder": NSNull()])
    }

    /// fmOrder fra serveren (valgt på en annen enhet).
    static func apply(_ o: [String: Any]) {
        let list: [String] = JS.strings(o, "fmOrder")
        if !list.isEmpty { UserDefaults.standard.set(list, forKey: key) }
    }

    /// Ny plass for `src` når den slippes på `target`. Fremover havner den etter målet, bakover foran.
    static func moved(_ ids: [String], _ src: String, before target: String) -> [String] {
        guard src != target else { return ids }
        var out: [String] = ids
        guard let from = out.firstIndex(of: src), let orig = out.firstIndex(of: target) else { return ids }
        out.remove(at: from)
        let to: Int = out.firstIndex(of: target) ?? out.count
        let at: Int = from < orig ? to + 1 : to
        out.insert(src, at: Swift.min(at, out.count))
        return out
    }
}

/// «Ferdig» og «Tilbakestill» over flisene i redigeringsmodus.
struct FinTileEditBar20: View {
    @Environment(\.paper) private var p
    let done: () -> Void
    let reset: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text("Dra flisene for å flytte dem").font(PF.ui(13)).foregroundStyle(p.mut).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 4)
            Button(action: reset) {
                Text("Tilbakestill").font(PF.ui(13, .semibold)).foregroundStyle(p.ink)
                    .padding(.horizontal, 12).frame(height: 32)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            Button(action: done) {
                Text("Ferdig").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 14).frame(height: 32)
                    .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 4)
    }
}
