import SwiftUI
import AppKit

/* ---------------- Prompt 38: Kalender for Mac – logg inn med QR fra mobilen ---------------- */
// Logikken (QR, SSE, 2FA, companion-token) ligger i SharedKal/Core/KalQR38.swift og deles med iPhone/iPad-appen.

/// QR-panelet på innloggingsskjermen.
struct MacQR38Panel: View {
    @Environment(\.mk) private var t
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
                Text("Logg inn med passord i stedet").font(MacFont.ui(13, .semibold)).foregroundColor(t.acc)
            }
            .buttonStyle(.plain)
        }
        .onAppear {
            let b: String = base
            DispatchQueue.main.async {
                m.companionDevice = "Mac"
                m.onLogin = { (server: String, token: String, name: String) in
                    UserDefaults.standard.set(server, forKey: "mac.lastServer")
                    MacStore.shared.didLogin(bases: [server], token: token, user: name)
                }
                m.start(base: b, device: MacAuth.deviceName())
            }
        }
        .onDisappear { m.stop() }
    }

    private var qrBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 18) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16).fill(Color.white)
                    if let img = m.image {
                        Image(decorative: img, scale: 1).interpolation(.none).resizable().frame(width: 168, height: 168)
                            .opacity(m.state == "scanned" ? 0.18 : 1)
                        ZStack {
                            Circle().fill(Color.white).frame(width: 40, height: 40)
                            Text("✦").font(MacFont.ui(20, .bold)).foregroundColor(t.red)
                        }
                        .opacity(m.state == "scanned" ? 0 : 1)
                    } else {
                        ProgressView().controlSize(.small)
                    }
                    if m.state == "scanned" {
                        VStack(spacing: 6) {
                            Circle().fill(t.red).frame(width: 44, height: 44)
                                .overlay(Text(String(m.scannedBy.prefix(1)).uppercased()).font(MacFont.ui(18, .bold)).foregroundColor(.white))
                            Text(m.match).font(MacFont.mono(26)).foregroundColor(Color.black)
                        }
                    }
                }
                .frame(width: 188, height: 188)
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(t.line, lineWidth: 1))
                VStack(alignment: .leading, spacing: 8) {
                    Text(headline).font(MacFont.ui(15, .bold)).foregroundColor(t.ink).fixedSize(horizontal: false, vertical: true)
                    Text(detail).font(MacFont.ui(12.5)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
                    if m.state == "pending" {
                        Text("Koden fornyes om " + String(m.secondsLeft) + " s").font(MacFont.mono(11)).foregroundColor(t.mut2)
                    }
                    if m.state == "denied" || m.state == "error" {
                        Text(m.error).font(MacFont.ui(12.5)).foregroundColor(t.acc).fixedSize(horizontal: false, vertical: true)
                        Button("Ny kode") { m.renew() }
                    }
                }
            }
        }
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
        return "Åpne Homelab på mobilen → Innstillinger → Konto → Logg inn på ny enhet, eller skann med kameraet."
    }

    private var twofa: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Totrinnsbekreftelse").font(MacFont.serif(26)).foregroundColor(t.ink)
            Text("Skriv den 6-sifrede koden fra autentiseringsappen, eller en reservekode.")
                .font(MacFont.ui(13)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
            MacLoginField(title: "Kode", text: $m.code, secure: false, onSubmit: { m.submitCode() })
            if !m.error.isEmpty {
                Text(m.error).font(MacFont.ui(12.5)).foregroundColor(t.acc)
            }
            Button(action: { m.submitCode() }) {
                HStack(spacing: 8) {
                    if m.busy { ProgressView().controlSize(.small) }
                    Text("Bekreft").font(MacFont.ui(15, .bold))
                }
                .foregroundColor(t.bg)
                .frame(maxWidth: .infinity).frame(height: 44)
                .background(Capsule().fill(m.code.count >= 6 && !m.busy ? t.ink : t.mut2))
            }
            .buttonStyle(.plain)
            .disabled(m.code.count < 6 || m.busy)
        }
    }
}
