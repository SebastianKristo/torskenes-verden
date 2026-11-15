import SwiftUI
import UIKit

/* ---------------- Kalender på iPhone/iPad – fagfarger i hendelsesarket og Innstillinger → Studie → Fag (prompt 37) ---------------- */

/// «Farge for MEK1300» i hendelsesarket (bare Studie-hendelser med fag).
struct KalFagPick37: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let e: KalEvent
    @State private var open: Bool = false

    var body: some View {
        let k: String = KalFag37.key(e.title)
        if !k.isEmpty && KalFag37.isStudy(e, s.cal(e.cal)) {
            VStack(alignment: .leading, spacing: 8) {
                Button(action: {
                    KalHaptic.tap()
                    open.toggle()
                }) {
                    HStack(spacing: 8) {
                        Circle().fill(Color(kalHex: KalFag37.hex(k))).frame(width: 12, height: 12)
                        Text("Farge for " + KalFag37.label(k)).font(KalFont.ui(14, .bold)).foregroundStyle(t.ink)
                        Spacer()
                        Text(open ? "Lukk" : "Endre").font(KalFont.ui(13, .bold)).foregroundStyle(t.mut)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if open {
                    KalFagSwatches37(key: k)
                }
            }
        }
    }
}

/// Fagpaletten (8) + kalenderfargene (12). «Standard» går tilbake til fast fagfarge.
struct KalFagSwatches37: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    let key: String

    var body: some View {
        let cur: String = KalFag37.hex(key)
        VStack(alignment: .leading, spacing: 8) {
            KalSwatches35(selected: cur, size: 24) { (h: String) in
                KalHaptic.tap()
                KalFag37.set(key, h)
                s.rebuild()
            }
            if KalFag37.own(key) != nil {
                Button(action: {
                    KalHaptic.tap()
                    KalFag37.set(key, nil)
                    s.rebuild()
                }) {
                    Text("Standard fagfarge").font(KalFont.ui(12.5, .bold)).foregroundStyle(t.mut)
                        .padding(.horizontal, 12).frame(height: 30)
                        .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// Innstillinger → Studie → Fag: alle fag med fargeprikk. Trykk gir fargevelger.
struct KalFagSettings37: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @State private var picking: String = ""

    var body: some View {
        let rows: [KalFagRow37] = KalFag37.rows(s.all, cal: { (id: String) -> KalCal? in s.cal(id) })
        VStack(alignment: .leading, spacing: 0) {
            if rows.isEmpty {
                Text("Ingen fag i Studie-kalenderen ennå.").font(KalFont.ui(13)).foregroundStyle(t.mut).padding(.vertical, 12)
            }
            ForEach(rows) { (r: KalFagRow37) in
                row(r)
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(t.line2).frame(height: 1) }
    }

    private func row(_ r: KalFagRow37) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: {
                KalHaptic.tap()
                picking = picking == r.key ? "" : r.key
            }) {
                HStack(spacing: 12) {
                    Circle().fill(Color(kalHex: r.hex)).frame(width: 14, height: 14).frame(width: 26)
                    Text(r.label).font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                    Spacer()
                    Text(r.own ? "Eget valg" : "Fast").font(KalFont.ui(12)).foregroundStyle(t.mut)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Farge for " + r.label)
            if picking == r.key {
                KalFagSwatches37(key: r.key).padding(.leading, 38).padding(.bottom, 10)
            }
        }
        .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
    }
}
