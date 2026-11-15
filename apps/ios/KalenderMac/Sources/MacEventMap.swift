import SwiftUI
import AppKit

/* ---------------- Prompt 37: Kalender for Mac – kart (fagfarger: MacSubjectColors.swift) ---------------- */
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
    @Bindable private var geo: KalGeo37 = KalGeo37.shared
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
    @Bindable private var geo: KalGeo37 = KalGeo37.shared
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
