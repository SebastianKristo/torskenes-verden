import SwiftUI
import AppKit

/* ---------------- Prompt 37: Kalender for Mac – kart og fagfarger ---------------- */
// • MacGlimtMap37: minikart (120 pt, radius 14) med adressen i en glass-etikett under Glimt-kortet. Klikk → veibeskrivelse.
// • MacDetailMap37: kart (170 pt, radius 16), full adresse, «Åpne i Kart» og «Veibeskrivelse ›» i hendelsesarket.
// • MacFagPick37: «Farge for MEK1300» i arket. MacFagSettings37: Innstillinger → Studie → Fag.

private enum MacOpen37 {
    @MainActor static func url(_ u: URL?) {
        guard let u else { return }
        _ = NSWorkspace.shared.open(u)
    }
}

struct MacGlimtMap37: View {
    @Environment(\.mk) private var t
    @ObservedObject private var geo: KalGeo37 = KalGeo37.shared
    let e: KalEvent

    var body: some View {
        if KalGlimtEvMac37.byGlimt(e), let h = geo.hit(e), let la = h.la, let lo = h.lo {
            Button(action: { MacOpen37.url(KalGeoCache37.directionsURL(h, apple: true)) }) {
                ZStack(alignment: .bottomLeading) {
                    KalMap37View(la: la, lo: lo, height: 120, radius: 14)
                    Text(h.a ?? e.loc).font(MacFont.ui(12, .bold)).foregroundColor(t.ink).lineLimit(1)
                        .padding(.horizontal, 10).frame(height: 24)
                        .background(Capsule().fill(t.glass))
                        .padding(8)
                }
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(t.line2, lineWidth: 1))
                .contentShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            .help("Veibeskrivelse")
        }
    }
}

enum KalGlimtEvMac37 {
    static func byGlimt(_ e: KalEvent) -> Bool { e.id.hasPrefix("u") || !e.src.isEmpty || e.lat != nil }
}

struct MacDetailMap37: View {
    @Environment(\.mk) private var t
    @ObservedObject private var geo: KalGeo37 = KalGeo37.shared
    let e: KalEvent

    var body: some View {
        if let h = geo.hit(e), let la = h.la, let lo = h.lo {
            VStack(alignment: .leading, spacing: 8) {
                Button(action: { MacOpen37.url(KalGeoCache37.appleURL(KalGeo37.place(e), h)) }) {
                    KalMap37View(la: la, lo: lo, height: 170, radius: 16)
                        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(t.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .help("Åpne i Kart")
                Text(h.a ?? e.loc).font(MacFont.ui(12.5)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                HStack(spacing: 8) {
                    button("Åpne i Kart", dark: false) { MacOpen37.url(KalGeoCache37.appleURL(KalGeo37.place(e), h)) }
                    button("Veibeskrivelse ›", dark: true) { MacOpen37.url(KalGeoCache37.directionsURL(h, apple: true)) }
                }
            }
        }
    }

    private func button(_ title: String, dark: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(MacFont.ui(13, .bold)).foregroundColor(dark ? t.bg : t.ink)
                .frame(maxWidth: .infinity).frame(height: 34)
                .background(Capsule().fill(dark ? t.ink : t.chip))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

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
