import SwiftUI
import UIKit

/* ---------------- Prompt 33: Kalender – innlogging ---------------- */
// Serveradresse + brukernavn + passord (+ 2FA-kode) → app-token via /finans/api/login (samme flyt som Homelab-appen),
// eller «Logg inn med Homelab-appen»: token fra App Group (kal.hl.*), eller finanshub://kalender-login som lager det.

enum KalAuth {
    static func isLocal(_ host: String) -> Bool {
        let p: [Int] = host.split(separator: ".").compactMap { (x: Substring) -> Int? in Int(x) }
        let ip: Bool = p.count == 4
        if host == "localhost" || host.hasSuffix(".local") || host.hasSuffix(".lan") || host.hasSuffix(".home.arpa") || !host.contains(".") { return true }
        if !ip { return false }
        if p[0] == 10 || p[0] == 127 { return true }
        if p[0] == 192 && p[1] == 168 { return true }
        if p[0] == 172 && p[1] >= 16 && p[1] <= 31 { return true }
        return p[0] == 100 && p[1] >= 64 && p[1] <= 127
    }

    /// Legger til http:// for lokale adresser og https:// ellers, og fjerner sti.
    static func normalize(_ raw: String) -> String {
        var s: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        let start: String.Index = s.range(of: "://")?.upperBound ?? s.startIndex
        if let slash = s[start...].firstIndex(of: "/") { s = String(s[..<slash]) }
        let lower: String = s.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") || s.isEmpty { return s }
        let hostPort: String = String(lower.split(separator: "/").first ?? "")
        let host: String = String(hostPort.split(separator: ":").first ?? "")
        return (isLocal(host) ? "http://" : "https://") + s
    }

    struct Result {
        let token: String
        let user: String
    }

    struct Failure: Error {
        let message: String
        let needsCode: Bool
    }

    static func login(base: String, username: String, password: String, code: String) async throws -> Result {
        // Prompt 44: eget navn per enhet (iPad het også «Kalender (iPhone)»).
        let dev: String = "Kalender (" + KalDev44.name + ")"
        var body: [String: Any] = ["password": password, "device": dev, "deviceName": dev]
        let u: String = username.trimmingCharacters(in: .whitespaces)
        if !u.isEmpty { body["username"] = u }
        let c: String = code.trimmingCharacters(in: .whitespaces)
        if !c.isEmpty { body["code"] = c }
        let data: Data
        do {
            data = try await KalNet.send("POST", "/finans/api/login", json: body, timeout: 20, bases: [base], token: nil)
        } catch let e as KalNetError {
            if e.status == 404 {
                do {
                    data = try await KalNet.send("POST", "/finans/api/auth/token", json: body, timeout: 20, bases: [base], token: nil)
                } catch let e2 as KalNetError {
                    throw Failure(message: e2.status == 404 ? "Fant ikke Homelab på " + base + " (404)." : e2.message, needsCode: false)
                }
            } else {
                let needs: Bool = e.needsTotp || e.message.lowercased().contains("kode")
                throw Failure(message: e.message, needsCode: needs)
            }
        }
        let obj: [String: Any] = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
        if (obj["needsTotp"] as? Bool) == true { throw Failure(message: "Skriv inn koden fra autentiseringsappen.", needsCode: true) }
        guard let token = obj["token"] as? String else { throw Failure(message: "Uventet svar fra serveren", needsCode: false) }
        let user: [String: Any] = (obj["user"] as? [String: Any]) ?? [:]
        let name: String = (user["name"] as? String) ?? (user["username"] as? String) ?? u
        return Result(token: token, user: name)
    }
}

struct KalLoginView: View {
    @Environment(\.kal) private var t
    @MainActor private var s: KalStore { KalStore.shared }
    @State private var server: String = UserDefaults.standard.string(forKey: "kal.lastServer") ?? ""
    @State private var user: String = ""
    @State private var pass: String = ""
    @State private var code: String = ""
    @State private var needsCode: Bool = false
    @State private var busy: Bool = false
    @State private var error: String = ""
    /// Prompt 38: «Logg inn med QR fra mobilen» (nyttig på iPad).
    @State private var qrMode: Bool = false

    private var homelabReady: Bool { KalGroup.homelabToken != nil }
    private var homelabInstalled: Bool {
        guard let u = URL(string: "finanshub://kalender-login") else { return false }
        return UIApplication.shared.canOpenURL(u)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                KalAppIconView(size: 72).padding(.top, 40)
                Text("Kalender").font(KalFont.serif(40)).foregroundStyle(t.ink)
                Text("Logg inn med Homelab-kontoen din. Kalender deler kalendere, hendelser, bursdager og frister med Homelab.")
                    .font(KalFont.ui(14)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                if homelabReady || homelabInstalled { homelabButton }
                field("Serveradresse", text: $server, keyboard: .URL)
                if qrMode {
                    KalQRLogin38Panel(base: KalAuth.normalize(server), onPassword: { qrMode = false })
                } else {
                    passwordForm
                }
                if !KalGroup.linked {
                    Text("App Group er ikke tilgjengelig i denne installasjonen (vanlig ved sideloading). Logg inn her, så virker appen – widgetene trenger App Group-en.")
                        .font(KalFont.ui(12)).foregroundStyle(t.mut2).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(t.bg.ignoresSafeArea())
    }

    private var hasServer: Bool { !server.trimmingCharacters(in: .whitespaces).isEmpty }

    @ViewBuilder private var passwordForm: some View {
        field("Brukernavn", text: $user, keyboard: .default)
        SecureField("Passord", text: $pass)
            .font(KalFont.ui(16, .medium)).foregroundStyle(t.ink)
            .padding(.horizontal, 14).frame(height: 50)
            .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(t.line, lineWidth: 1))
        if needsCode { field("Kode (6 sifre)", text: $code, keyboard: .numberPad) }
        if !error.isEmpty {
            Text(error).font(KalFont.ui(13)).foregroundStyle(t.acc).fixedSize(horizontal: false, vertical: true)
        }
        Button(action: { submit() }) {
            HStack {
                if busy { ProgressView().tint(t.bg) }
                Text(busy ? "Logger inn …" : "Logg inn").font(KalFont.ui(15, .bold))
            }
            .foregroundStyle(t.bg)
            .frame(maxWidth: .infinity).frame(height: 50)
            .background(Capsule().fill(canSubmit ? t.ink : t.mut2))
        }
        .buttonStyle(.plain)
        .disabled(!canSubmit || busy)
        Button(action: { qrMode = true }) {
            Text("Logg inn med QR fra mobilen").font(KalFont.ui(14, .semibold)).foregroundStyle(hasServer ? t.acc : t.mut2)
        }
        .buttonStyle(.plain)
        .disabled(!hasServer)
    }

    private var canSubmit: Bool { !server.trimmingCharacters(in: .whitespaces).isEmpty && !pass.isEmpty }

    private var homelabButton: some View {
        Button(action: {
            KalHaptic.tap()
            if !s.adoptHomelab(), let u = URL(string: "finanshub://kalender-login") {
                UIApplication.shared.open(u)
            }
        }) {
            HStack(spacing: 10) {
                Image(systemName: "house.fill").font(.system(size: 16, weight: .semibold))
                Text("Logg inn med Homelab-appen").font(KalFont.ui(15, .bold))
            }
            .foregroundStyle(t.ink)
            .frame(maxWidth: .infinity).frame(height: 50)
            .overlay(Capsule().strokeBorder(t.ink, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }

    private func field(_ title: String, text: Binding<String>, keyboard: UIKeyboardType) -> some View {
        TextField(title, text: text)
            .font(KalFont.ui(16, .medium)).foregroundStyle(t.ink)
            .keyboardType(keyboard)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled(true)
            .padding(.horizontal, 14).frame(height: 50)
            .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(t.line, lineWidth: 1))
    }

    private func submit() {
        let base: String = KalAuth.normalize(server)
        busy = true
        error = ""
        Task {
            do {
                let r: KalAuth.Result = try await KalAuth.login(base: base, username: user, password: pass, code: code)
                UserDefaults.standard.set(base, forKey: "kal.lastServer")
                busy = false
                pass = ""
                s.didLogin(bases: [base], token: r.token, user: r.user)
            } catch let f as KalAuth.Failure {
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

/// Appikonet tegnet i SwiftUI (krem, rød topp med ukedag og dagens dato i Newsreader).
struct KalAppIconView: View {
    let size: CGFloat

    var body: some View {
        let T: Date = Date()
        VStack(spacing: 0) {
            Text(KalD.weekdaysShort[KalD.wd(T)].uppercased()).font(KalFont.mono(size * 0.14)).tracking(1)
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity).frame(height: size * 0.28)
                .background(Color(kalHex: "#b23a2a"))
            Text(String(KalD.dayOfMonth(T))).font(KalFont.serif(size * 0.5)).foregroundStyle(Color(kalHex: "#1b1a17"))
                .frame(maxHeight: .infinity)
        }
        .frame(width: size, height: size)
        .background(Color(kalHex: "#fffdf8"))
        .clipShape(RoundedRectangle(cornerRadius: size * 0.23, style: .continuous))
        .shadow(color: Color.black.opacity(0.15), radius: 4, y: 2)
        .accessibilityHidden(true)
    }
}
