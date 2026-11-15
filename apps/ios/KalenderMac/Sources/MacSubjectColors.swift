import SwiftUI
import AppKit

/* ---------------- Kalender for Mac – fagfarger i arket og Innstillinger → Studie → Fag (prompt 37) ---------------- */

/// «Farge for MEK1300» (bare Studie-hendelser med fag).
struct MacFagPick37: View {
    @Environment(\.mk) private var t
    @ObservedObject var store: MacStore = MacStore.shared
    let e: KalEvent
    @State private var picking: Bool = false

    var body: some View {
        let k: String = KalFag37.key(e.title)
        if !k.isEmpty && KalFag37.isStudy(e, store.cal(e.cal)) {
            HStack(spacing: 8) {
                Circle().fill(Color(kalHex: KalFag37.hex(k))).frame(width: 12, height: 12)
                Text("Farge for " + KalFag37.label(k)).font(MacFont.ui(13, .bold)).foregroundColor(t.ink)
                Spacer()
                MacPill(title: "Endre", filled: false, height: 28) { picking = true }
                    .popover(isPresented: $picking, arrowEdge: .bottom) {
                        MacThemed {
                            MacFagSwatches37(key: k) { picking = false }.padding(12)
                        }
                    }
            }
        }
    }
}

/// Kalenderfargene + «Standard fagfarge».
struct MacFagSwatches37: View {
    @Environment(\.mk) private var t
    let key: String
    let done: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            MacSwatches35(selected: KalFag37.hex(key)) { (h: String) in
                KalFag37.set(key, h)
                MacStore.shared.objectWillChange.send()
                done()
            }
            if KalFag37.own(key) != nil {
                MacPill(title: "Standard fagfarge", filled: false, height: 26) {
                    KalFag37.set(key, nil)
                    MacStore.shared.objectWillChange.send()
                    done()
                }
            }
        }
    }
}

/// Innstillinger → Studie → Fag: alle fag med fargeprikk. Klikk gir fargevelger.
struct MacFagSettings37: View {
    @Environment(\.mk) private var t
    @ObservedObject var store: MacStore = MacStore.shared

    var body: some View {
        let rows: [KalFagRow37] = KalFag37.rows(store.all, cal: { (id: String) -> KalCal? in store.cal(id) })
        VStack(alignment: .leading, spacing: 0) {
            if rows.isEmpty {
                Text("Ingen fag i Studie-kalenderen ennå.").font(MacFont.ui(12.5)).foregroundColor(t.mut).padding(.vertical, 8)
            }
            ForEach(rows) { (r: KalFagRow37) in
                MacFagSettingsRow37(row: r)
            }
        }
    }
}

struct MacFagSettingsRow37: View {
    @Environment(\.mk) private var t
    let row: KalFagRow37
    @State private var picking: Bool = false

    var body: some View {
        HStack(spacing: 10) {
            Button(action: { picking = true }) {
                Circle().fill(Color(kalHex: row.hex)).frame(width: 12, height: 12).frame(width: 20, height: 24).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .popover(isPresented: $picking, arrowEdge: .trailing) {
                MacThemed {
                    MacFagSwatches37(key: row.key) { picking = false }.padding(12)
                }
            }
            Text(row.label).font(MacFont.ui(13, .bold)).foregroundColor(t.ink)
            Spacer()
            Text(row.own ? "Eget valg" : "Fast").font(MacFont.ui(12)).foregroundColor(t.mut)
        }
        .padding(.vertical, 4)
    }
}
