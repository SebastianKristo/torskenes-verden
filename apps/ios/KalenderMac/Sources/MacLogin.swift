import SwiftUI

/* ---------------- Prompt 34: Kalender for Mac – innloggingsskjermen ---------------- */
// Serveradresse + brukernavn + passord (+ 2FA-kode) → app-token via /finans/api/login. Tokenet lagres i Nøkkelringen.

struct MacLoginView: View {
    @Environment(\.mk) private var t
    @State private var server: String = UserDefaults.standard.string(forKey: "mac.lastServer") ?? ""
    @State private var user: String = UserDefaults.standard.string(forKey: "mac.lastUser") ?? ""
    @State private var pass: String = ""
    @State private var code: String = ""
    @State private var needsCode: Bool = false
    @State private var busy: Bool = false
    @State private var error: String = ""
    /// Prompt 38: «Logg inn med QR fra mobilen» (godkjennes med Face ID på telefonen, så 2FA-koden her).
    @State private var qrMode: Bool = false

    private var canSubmit: Bool { !server.trimmingCharacters(in: .whitespaces).isEmpty && !pass.isEmpty && !busy }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            MacAppIcon(size: 76).shadow(color: Color.black.opacity(0.15), radius: 6, y: 3)
            Text("Kalender").font(MacFont.serif(42)).foregroundColor(t.ink)
            Text("Logg inn med Homelab-kontoen din. Kalender for Mac deler kalendere, hendelser, bursdager og frister med Homelab på web og iPhone.")
                .font(MacFont.ui(14)).foregroundColor(t.mut).fixedSize(horizontal: false, vertical: true)
            MacLoginField(title: "Serveradresse (f.eks. homelab.kristo.no eller 192.168.1.10:3000)", text: $server, secure: false)
            if qrMode {
                MacQR38Panel(base: MacAuth.normalize(server), onPassword: { qrMode = false })
            } else {
                passwordForm
            }
        }
        .frame(width: 420)
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(t.bg)
    }

    private var hasServer: Bool { !server.trimmingCharacters(in: .whitespaces).isEmpty }

    @ViewBuilder private var passwordForm: some View {
        MacLoginField(title: "Brukernavn", text: $user, secure: false)
        MacLoginField(title: "Passord", text: $pass, secure: true, onSubmit: submit)
        if needsCode { MacLoginField(title: "Kode (6 sifre)", text: $code, secure: false, onSubmit: submit) }
        if !error.isEmpty {
            Text(error).font(MacFont.ui(13)).foregroundColor(t.acc).fixedSize(horizontal: false, vertical: true)
        }
        Button(action: submit) {
            HStack(spacing: 8) {
                if busy { ProgressView().controlSize(.small) }
                Text(busy ? "Logger inn …" : "Logg inn").font(MacFont.ui(15, .bold))
            }
            .foregroundColor(t.bg)
            .frame(maxWidth: .infinity).frame(height: 44)
            .background(Capsule().fill(canSubmit ? t.ink : t.mut2))
        }
        .buttonStyle(.plain)
        .keyboardShortcut(.defaultAction)
        .disabled(!canSubmit)
        Button(action: { qrMode = true }) {
            Text("Logg inn med QR fra mobilen").font(MacFont.ui(13, .semibold)).foregroundColor(hasServer ? t.acc : t.mut2)
        }
        .buttonStyle(.plain)
        .disabled(!hasServer)
        Text("Tokenet lagres i Nøkkelringen på denne Mac-en. Du kan trekke det tilbake i Homelab → Innstillinger → Enheter.")
            .font(MacFont.ui(11.5)).foregroundColor(t.mut2).fixedSize(horizontal: false, vertical: true)
    }

    private func submit() {
        if !canSubmit { return }
        let base: String = MacAuth.normalize(server)
        busy = true
        error = ""
        let u: String = user
        let p: String = pass
        let c: String = code
        Task { @MainActor in
            do {
                let r: MacAuth.Result = try await MacAuth.login(base: base, username: u, password: p, code: c)
                UserDefaults.standard.set(base, forKey: "mac.lastServer")
                UserDefaults.standard.set(u, forKey: "mac.lastUser")
                busy = false
                pass = ""
                MacStore.shared.didLogin(bases: [base], token: r.token, user: r.user)
            } catch let f as MacAuth.Failure {
                busy = false
                error = f.message
                if f.needsCode { needsCode = true }
            } catch {
                busy = false
                self.error = error.localizedDescription
            }
        }
    }
}

struct MacLoginField: View {
    @Environment(\.mk) private var t
    let title: String
    @Binding var text: String
    let secure: Bool
    var onSubmit: (() -> Void)? = nil

    var body: some View {
        Group {
            if secure {
                SecureField(title, text: $text).onSubmit { onSubmit?() }
            } else {
                TextField(title, text: $text).onSubmit { onSubmit?() }
            }
        }
        .textFieldStyle(.plain)
        .disableAutocorrection(true)
        .font(MacFont.ui(14, .medium))
        .foregroundColor(t.ink)
        .padding(.horizontal, 14)
        .frame(height: 42)
        .background(RoundedRectangle(cornerRadius: 12).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(t.line, lineWidth: 1))
    }
}
