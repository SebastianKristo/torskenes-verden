import SwiftUI

/* ---------------- Prompt 20: Finans-flisene (Mer i Finans) – farger og egen rekkefølge ---------------- */

/// Egen ikonfarge per flis, på tonet bakgrunn.
enum FinTileColor20 {
    static func hex(_ id: String) -> String {
        // Prompt 21: fargene fra designet (fmtiles).
        switch id {
        case "budsjett": return "#c0562a"
        case "kvitt": return "#b23a2a"
        case "faste": return "#7a5ad6"
        case "kontoer": return "#2b5d8a"
        case "aksjer": return "#2f7d4f"
        case "rapp": return "#a8661a"
        case "abo": return "#c2417a"
        case "boliger": return "#3f7a6e"
        case "import": return "#4a5bbf"
        case "finn": return "#2b6cb0"
        case "fsok": return "#7a3b6b"
        case "innst": return "#6b6558"
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

/// «Ferdig» og «Tilbakestill» over flisene i redigeringsmodus. Prompt 21: en egen hvit Papir-pille med skygge
/// (kortbakgrunn), så den er lesbar over toppbildet i lyst og mørkt tema.
struct FinTileEditBar20: View {
    @Environment(\.paper) private var p
    let done: () -> Void
    let reset: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text("Dra for å flytte").font(PF.ui(13, .semibold)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.8)
                .padding(.leading, 6)
            Spacer(minLength: 4)
            Button(action: reset) {
                Text("Tilbakestill").font(PF.ui(13, .semibold)).foregroundStyle(p.ink)
                    .padding(.horizontal, 12).frame(height: 32)
                    .background(p.bg, in: Capsule())
            }
            .buttonStyle(.plain)
            Button(action: done) {
                Text("Ferdig").font(PF.ui(13, .bold)).foregroundStyle(p.bg)
                    .padding(.horizontal, 14).frame(height: 32)
                    .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 6).padding(.vertical, 6)
        .background(p.card, in: Capsule())
        .shadow(color: .black.opacity(0.18), radius: 12, y: 6)
    }
}
