import SwiftUI
import AppKit

/* ---------------- Prompt 46: Kalender for Mac – «Logg inn med QR-kode» på innloggingsskjermen igjen ---------------- */
// Spesifikasjon: claude-code-qr-innlogging-finans-kalender.md. QR-panelet fra prompt 38 (MacQR38Panel) lå bare i den gamle
// innloggingsskjermen med serverfelt; skjermen fra prompt 41 (MacLogin41View) hadde ikke valget. Mac viser bare QR (skanner ikke).
// Adressen QR-økta lages på hentes utenfor hovedtråden (kandidatlista leser App Group/Nøkkelring), uten Docker-/loopback-adresser.

struct MacLoginQR46: View {
    @Environment(\.mk) private var t
    let back: () -> Void
    @State private var base: String = ""

    var body: some View {
        Group {
            if base.isEmpty {
                ProgressView().controlSize(.small).frame(height: 120)
            } else {
                MacQR38Panel(base: base, onPassword: back)
            }
        }
        .task {
            let b: String = await Task.detached(priority: .userInitiated) { () -> String in
                let last: String = UserDefaults.standard.string(forKey: "mac.lastServer") ?? ""
                let all: [String] = KalAuth41.candidates(extra: last.isEmpty ? [] : [last])
                return KalSrv46.clean(all).first ?? KalAuth41.defaultBase
            }.value
            base = b
        }
    }
}
