import SwiftUI
import UIKit

/* ---------------- Prompt 38: Kalender (iPhone/iPad) – logg inn med QR fra en mobil som allerede er innlogget ---------------- */
// Mest nyttig på iPad: koden skannes med Homelab på telefonen (Konto → Logg inn på ny enhet), godkjennes med Face ID,
// og 2FA-koden skrives her. Logikken ligger i SharedKal/Core/KalQR38.swift (delt med Kalender for Mac).

struct KalQRLogin38Panel: View {
    @Environment(\.kal) private var t
    @StateObject private var m: KalQR38Model = KalQR38Model()
    let base: String
    let onPassword: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if m.state == "twofa" {
                twofa
            } else {
                qrBlock
            }
            Button(action: onPassword) {
                Text("Logg inn med passord i stedet").font(KalFont.ui(14, .semibold)).foregroundStyle(t.acc)
            }
            .buttonStyle(.plain)
        }
        .onAppear {
            let b: String = base
            DispatchQueue.main.async {
                let model: String = UIDevice.current.model
                m.companionDevice = model
                m.onLogin = { (server: String, token: String, name: String) in
                    UserDefaults.standard.set(server, forKey: "kal.lastServer")
                    KalStore.shared.didLogin(bases: [server], token: token, user: name)
                }
                m.start(base: b, device: "Kalender (" + model + ")")
            }
        }
        .onDisappear { m.stop() }
    }

    private var qrBlock: some View {
        VStack(alignment: .center, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 18).fill(Color.white)
                if let img = m.image {
                    Image(decorative: img, scale: 1).resizable().interpolation(.none).frame(width: 200, height: 200)
                        .opacity(m.state == "scanned" ? 0.18 : 1)
                    ZStack {
                        Circle().fill(Color.white).frame(width: 46, height: 46)
                        Text("✦").font(KalFont.ui(22, .bold)).foregroundStyle(t.red)
                    }
                    .opacity(m.state == "scanned" ? 0 : 1)
                } else {
                    ProgressView()
                }
                if m.state == "scanned" {
                    VStack(spacing: 6) {
                        Circle().fill(t.red).frame(width: 48, height: 48)
                            .overlay(Text(String(m.scannedBy.prefix(1)).uppercased()).font(KalFont.ui(20, .bold)).foregroundStyle(Color.white))
                        Text(m.match).font(KalFont.mono(30)).foregroundStyle(Color.black)
                    }
                }
            }
            .frame(width: 224, height: 224)
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(t.line, lineWidth: 1))
            Text(headline).font(KalFont.ui(16, .bold)).foregroundStyle(t.ink).multilineTextAlignment(.center)
            Text(detail).font(KalFont.ui(13)).foregroundStyle(t.mut).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if m.state == "pending" {
                Text("Koden fornyes om " + String(m.secondsLeft) + " s").font(KalFont.mono(12)).foregroundStyle(t.mut2)
            }
            if m.state == "denied" || m.state == "error" {
                Text(m.error).font(KalFont.ui(13)).foregroundStyle(t.acc).multilineTextAlignment(.center)
                Button("Ny kode") { m.renew() }.font(KalFont.ui(14, .semibold))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var headline: String {
        switch m.state {
        case "scanned": return "Skannet av " + (m.scannedBy.isEmpty ? "mobilen" : m.scannedBy)
        case "denied": return "Innloggingen ble avvist"
        case "done": return "Logget inn"
        default: return "Logg inn med mobilen"
        }
    }

    private var detail: String {
        if m.state == "scanned" { return "Godkjenn på mobilen … Sjekk at tallet " + m.match + " også vises der." }
        // Prompt 46: Papir Finans (eller en innlogget Kalender) på mobilen skanner koden.
        return "Skann med Papir Finans på mobilen: Innstillinger → Logg inn på annen enhet. En innlogget Kalender kan også skanne."
    }

    private var twofa: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Totrinnsbekreftelse").font(KalFont.serif(28)).foregroundStyle(t.ink)
            Text("Skriv den 6-sifrede koden fra autentiseringsappen, eller en reservekode.")
                .font(KalFont.ui(14)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            TextField("Kode", text: $m.code)
                .font(KalFont.ui(16, .medium)).foregroundStyle(t.ink)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .padding(.horizontal, 14).frame(height: 50)
                .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(t.line, lineWidth: 1))
            if !m.error.isEmpty {
                Text(m.error).font(KalFont.ui(13)).foregroundStyle(t.acc)
            }
            Button(action: { m.submitCode() }) {
                HStack {
                    if m.busy { ProgressView().tint(t.bg) }
                    Text("Bekreft").font(KalFont.ui(15, .bold))
                }
                .foregroundStyle(t.bg)
                .frame(maxWidth: .infinity).frame(height: 50)
                .background(Capsule().fill(m.code.count >= 6 && !m.busy ? t.ink : t.mut2))
            }
            .buttonStyle(.plain)
            .disabled(m.code.count < 6 || m.busy)
        }
    }
}
