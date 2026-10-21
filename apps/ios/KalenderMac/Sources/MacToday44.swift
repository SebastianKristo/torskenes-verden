import SwiftUI

/* ---------------- Prompt 44: «I dag»-ikonet (Kalender for Mac) ---------------- */
// Feil (vedlegg 13.38.06): tallet «21» ble lagt over SF Symbol «calendar» og la seg over strekene i ikonet.
// Fasit: Kalender.dc.html (knappen «I dag»): 24 × 24, avrundet ramme (6 pt hjørner, 1,8 pt strek i tekstfarge),
// rød topp-stripe 6 pt (#b23a2a), dagens tall midtstilt i feltet under (Manrope 800, 10,5 pt). Ingen streker over tallet.
// Tallet følger dagen (TimelineView hvert minutt – ingen egen løkke).

struct MacTodayIcon44: View {
    @Environment(\.mk) private var t
    var size: CGFloat = 24

    var body: some View {
        TimelineView(.everyMinute) { (_: TimelineViewDefaultContext) in
            face(String(KalD.dayOfMonth(Date())))
        }
    }

    private func face(_ n: String) -> some View {
        let k: CGFloat = size / 24
        return VStack(spacing: 0) {
            Rectangle().fill(Color(kalHex: "#b23a2a")).frame(height: 6 * k)
            Text(n).font(MacFont.ui(10.5 * k, .heavy)).foregroundColor(t.ink)
                .lineLimit(1).minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.bottom, 1 * k)
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 6 * k, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 6 * k, style: .continuous).strokeBorder(t.ink, lineWidth: 1.8 * k))
        .accessibilityHidden(true)
    }
}
