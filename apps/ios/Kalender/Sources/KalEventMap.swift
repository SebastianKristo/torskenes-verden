import SwiftUI
import UIKit

/* ---------------- Kalender på iPhone/iPad – kart under Glimt-kortet og i hendelsesarket (prompt 37) ---------------- */

/// Glimt la til hendelsen (eller den kom fra Glimt i Homelab).
enum KalGlimtEv37 {
    static func byGlimt(_ e: KalEvent) -> Bool { e.id.hasPrefix("u") || !e.src.isEmpty || e.lat != nil }
}

struct KalGlimtMap37: View {
    @Environment(\.kal) private var t
    @Environment(\.openURL) private var openURL
    @Bindable private var geo: KalGeo37 = KalGeo37.shared
    let e: KalEvent

    var body: some View {
        if KalGlimtEv37.byGlimt(e), let h = geo.hit(e), let la = h.la, let lo = h.lo {
            Button(action: {
                KalHaptic.tap()
                if let u = KalGeoCache37.directionsURL(h, apple: true) { openURL(u) }
            }) {
                ZStack(alignment: .bottomLeading) {
                    KalMap37View(la: la, lo: lo, height: 120, radius: 14)
                    Text(h.a ?? e.loc).font(KalFont.ui(12, .bold)).foregroundStyle(t.ink).lineLimit(1)
                        .padding(.horizontal, 10).frame(height: 26)
                        .background(Capsule().fill(t.glass))
                        .padding(8)
                }
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(t.line2, lineWidth: 1))
                .contentShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Veibeskrivelse til " + (h.a ?? e.loc))
        }
    }
}

struct KalDetailMap37: View {
    @Environment(\.kal) private var t
    @Environment(\.openURL) private var openURL
    @Bindable private var geo: KalGeo37 = KalGeo37.shared
    let e: KalEvent

    var body: some View {
        if let h = geo.hit(e), let la = h.la, let lo = h.lo {
            VStack(alignment: .leading, spacing: 8) {
                Button(action: { open(h, apple: true) }) {
                    KalMap37View(la: la, lo: lo, height: 170, radius: 16)
                        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(t.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Kart")
                Text(h.a ?? e.loc).font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    mapButton("Åpne i Kart", dark: false) { open(h, apple: true) }
                    mapButton("Veibeskrivelse ›", dark: true) {
                        if let u = KalGeoCache37.directionsURL(h, apple: true) { openURL(u) }
                    }
                }
            }
            .padding(.top, 10).padding(.bottom, 12)
            .overlay(alignment: .bottom) { Rectangle().fill(t.line2).frame(height: 1) }
        }
    }

    private func open(_ h: KalGeoHit37, apple: Bool) {
        KalHaptic.tap()
        if let u = KalGeoCache37.appleURL(KalGeo37.place(e), h) { openURL(u) }
    }

    private func mapButton(_ title: String, dark: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(KalFont.ui(13, .bold)).foregroundStyle(dark ? t.bg : t.ink)
                .frame(maxWidth: .infinity).frame(height: 38)
                .background(Capsule().fill(dark ? t.ink : t.chip))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .accessibilityLabel(title)
    }
}
