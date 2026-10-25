import SwiftUI
import UIKit
import CoreImage
import CoreImage.CIFilterBuiltins

/* ---------------- Prompt 40: sett opp totrinnsbekreftelse (2FA) i appen, ikke i Safari ----------------
   prompts/prompt-40-pakke/claude-code-2fa-i-appen.md, fasit design/Mobil Papir App.dc.html → Innstillinger → Sikkerhet →
   «Totrinnsbekreftelse» (tfVals, overlegget tf). Hele oppsettet skjer i appen via appens API-klient (innlogget økt), ingen lenke til web.
   Raden: Av → «Av · sett opp i appen på 1 minutt» / «Sett opp ›». På → «På · autentiseringsapp · N reservekoder igjen» / «Endre ›».
   Flyt (fullskjerm, 4 steg med fremdriftslinje, «‹ Tilbake»):
     0 Velg metode (Autentiseringsapp · Anbefalt / Passnøkkel med Face ID · Raskest)
     1 Koble til: «Åpne i autentiseringsappen» (otpauth:// på samme telefon), nøkkelen i grupper på 4 med Kopier, «Vis QR-kode …»
     2 Skriv koden: 6 sifre, textContentType .oneTimeCode (autofyll fra Passord), feil → «Koden stemmer ikke. Prøv den neste som vises.»
     3 Reservekoder: Kopier alle, Del (share sheet / Passord), «Jeg har lagret reservekodene» før «Slå på totrinnsbekreftelse»
     4 Ferdig: ✓ «Totrinnsbekreftelse er på», telefonen merkes som pålitelig enhet (POST /api/devices/current)
     9 Administrer: Nye reservekoder · Bytt autentiseringsapp · Legg til passnøkkel · Slå av (krever passord eller kode).
   API (SERVER40, kontrakten): GET /api/auth/2fa/status → {enabled, method, backupLeft, enabledAt};
   POST /api/auth/2fa/setup {password?} → {secret, otpauth, qrSvg|qrPng, issuer, account}; POST /api/auth/2fa/enable {code} →
   {ok, backupCodes}; POST /api/auth/2fa/disable {password|code}; POST /api/auth/2fa/backup/regenerate → {backupCodes}.
   Eldre server: /api/auth/totp/setup ({otpauthUrl, secret}), /api/auth/totp/verify ({recoveryCodes}), /api/auth/totp/disable.
   QR-koden lages lokalt (CoreImage) fra otpauth-adressen. */

@MainActor
@Observable
final class Tfa40Model {
    static let shared = Tfa40Model()

    /// nil = ukjent (ikke hentet ennå).
    var enabled: Bool? = nil
    var backupLeft: Int = 0
    var enabledAt: String = ""

    var open: Bool = false
    /// 0 metode · 1 koble til · 2 kode · 3 reservekoder · 4 ferdig · 9 administrer
    var step: Int = 0
    var secret: String = ""
    var otpauth: String = ""
    var codes: [String] = []
    var code: String = ""
    var err: String = ""
    var busy: Bool = false
    var showQr: Bool = false
    var copiedKey: Bool = false
    var copiedCodes: Bool = false
    var saved: Bool = false
    /// Serveren krever passord (fersk økt) før oppsett / for å slå av.
    var askPassword: Bool = false
    var askDisable: Bool = false
    var password: String = ""
    /// Reservekodene er nye (fra «Nye reservekoder»), ikke fra første oppsett.
    var regenerated: Bool = false

    private let titles: [String] = ["Velg metode", "Koble til autentiseringsappen", "Skriv inn koden", "Lagre reservekodene", "Totrinnsbekreftelse er på"]
    private let subs: [String] = ["Du setter det opp her i appen. Det tar et minutt.",
                                  "Trykk knappen, så legger autentiseringsappen på denne telefonen inn Homelab av seg selv.",
                                  "Skriv de 6 sifrene som vises i autentiseringsappen nå.",
                                  "Bruk en av disse hvis du mister telefonen. Hver kode virker én gang.",
                                  "Kontoen din er nå beskyttet med passord og kode."]

    var title: String { step == 9 ? "Totrinnsbekreftelse er på" : (step < titles.count ? titles[step] : "") }
    var sub: String {
        if step == 9 { return "Autentiseringsapp" + (enabledAt.isEmpty ? "" : " · lagt til " + enabledAt) + " · " + leftText }
        return step < subs.count ? subs[step] : ""
    }
    var stepLabel: String { step < 4 ? "STEG \(step + 1) AV 4" : "" }
    var leftText: String { backupLeft == 1 ? "1 reservekode igjen" : "\(backupLeft) reservekoder igjen" }

    /// Nøkkelen i grupper på 4 («JBSW Y3DP …»).
    var secretGroups: String {
        let raw: String = secret.replacingOccurrences(of: " ", with: "").uppercased()
        var out: String = ""
        for (i, ch) in raw.enumerated() {
            if i > 0 && i % 4 == 0 { out.append(" ") }
            out.append(ch)
        }
        return out
    }

    /* ---------- Status ---------- */

    func load(_ store: Store) async {
        do {
            let d: Data = try await store.api.callAt("/api", "GET", "/auth/2fa/status", timeout: 15)
            let o: [String: Any] = JS.obj(d)
            enabled = JS.bool(o, "enabled") ?? false
            backupLeft = JS.int(o, "backupLeft") ?? 0
            enabledAt = Tfa40Model.dateLabel(JS.str(o, "enabledAt") ?? "")
        } catch {
            // Eldre server uten statusendepunktet: bruk /me (totp).
            if enabled == nil, let t = store.me?.twoFactor { enabled = t }
        }
    }

    /// «20.10.2026» fra ISO-tid.
    static func dateLabel(_ iso: String) -> String {
        if iso.count < 10 { return "" }
        let p: [Substring] = iso.prefix(10).split(separator: "-")
        if p.count != 3 { return "" }
        return String(p[2]) + "." + String(p[1]) + "." + String(p[0])
    }

    /* ---------- Flyten ---------- */

    func begin(_ store: Store) {
        Haptic30.light()
        reset()
        step = enabled == true ? 9 : 0
        open = true
        Task { await self.load(store) }
    }

    func reset() {
        secret = ""
        otpauth = ""
        codes = []
        code = ""
        err = ""
        busy = false
        showQr = false
        copiedKey = false
        copiedCodes = false
        saved = false
        askPassword = false
        askDisable = false
        password = ""
        regenerated = false
    }

    func close() {
        Haptic30.light()
        open = false
        password = ""
    }

    func back() {
        Haptic30.light()
        err = ""
        if step == 0 || step >= 4 { close(); return }
        step -= 1
    }

    /// Steg 0 → 1: hent ny hemmelighet (lagres som «venter» på serveren til koden er bekreftet).
    func chooseApp(_ store: Store) {
        Haptic30.light()
        Task { await self.setup(store) }
    }

    func setup(_ store: Store) async {
        busy = true
        err = ""
        defer { busy = false }
        var body: [String: Any] = [:]
        if !password.isEmpty { body["password"] = password }
        do {
            let d: Data = try await post(store, "/auth/2fa/setup", "/auth/totp/setup", body)
            let o: [String: Any] = JS.obj(d)
            secret = JS.str(o, "secret") ?? ""
            otpauth = JS.str(o, "otpauth") ?? JS.str(o, "otpauthUrl") ?? JS.str(o, "otpauth_uri") ?? JS.str(o, "uri") ?? ""
            if otpauth.isEmpty && !secret.isEmpty {
                let acc: String = JS.str(o, "account") ?? store.account?.username ?? "bruker"
                let iss: String = JS.str(o, "issuer") ?? "Homelab"
                otpauth = Tfa40Model.otpauthURL(secret: secret, account: acc, issuer: iss)
            }
            if secret.isEmpty && otpauth.isEmpty { err = "Serveren svarte ikke med en nøkkel. Prøv igjen."; return }
            askPassword = false
            password = ""
            step = 1
        } catch let e as APIError {
            if e.status == 401 || e.status == 403 || e.code == "reauth" || e.code == "password_required" {
                askPassword = true
                err = password.isEmpty ? "" : "Feil passord. Prøv igjen."
            } else {
                err = e.message
            }
        } catch {
            err = error.localizedDescription
        }
    }

    nonisolated static func otpauthURL(secret: String, account: String, issuer: String) -> String {
        let s: String = secret.replacingOccurrences(of: " ", with: "")
        let iss: String = issuer.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? issuer
        let acc: String = account.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? account
        return "otpauth://totp/" + iss + ":" + acc + "?secret=" + s + "&issuer=" + iss + "&digits=6&period=30"
    }

    /// «Åpne i autentiseringsappen»: Passord (iOS 17+), Google Authenticator, 1Password … på samme telefon.
    func openAuthenticator() {
        guard let u = URL(string: otpauth) else { return }
        Haptic30.light()
        UIApplication.shared.open(u, options: [:]) { (ok: Bool) in
            Task { @MainActor in
                if ok {
                    try? await Task.sleep(nanoseconds: 600_000_000)
                    Tfa40Model.shared.step = 2
                } else {
                    Tfa40Model.shared.err = "Fant ingen autentiseringsapp. Kopier nøkkelen, eller vis QR-koden for en annen enhet."
                }
            }
        }
    }

    func copyKey() {
        UIPasteboard.general.string = secret.replacingOccurrences(of: " ", with: "")
        copiedKey = true
        Haptic30.light()
    }

    func copyCodes() {
        UIPasteboard.general.string = codes.joined(separator: "\n")
        copiedCodes = true
        Haptic30.light()
    }

    func setCode(_ v: String) {
        let digits: String = String(v.filter { $0.isNumber }.prefix(6))
        if digits != code { code = digits }
        if !err.isEmpty { err = "" }
    }

    /// Steg 2 → 3: bekreft koden. Serveren aktiverer og gir reservekodene (vises én gang).
    func verify(_ store: Store) {
        if code.count != 6 { err = "Skriv alle 6 sifrene."; return }
        let c: String = code
        busy = true
        err = ""
        Task {
            defer { self.busy = false }
            do {
                let d: Data = try await self.post(store, "/auth/2fa/enable", "/auth/totp/verify", ["code": c])
                let o: [String: Any] = JS.obj(d)
                self.codes = Tfa40Model.codesFrom(o)
                self.enabled = true
                self.backupLeft = self.codes.count
                self.regenerated = false
                self.saved = false
                self.step = 3
                Haptic30.double()
            } catch let e as APIError {
                self.err = e.status == 400 || e.status == 401 || e.status == 403 ? "Koden stemmer ikke. Prøv den neste som vises." : e.message
                self.code = ""
            } catch {
                self.err = error.localizedDescription
            }
        }
    }

    nonisolated static func codesFrom(_ o: [String: Any]) -> [String] {
        let raw: [Any] = (o["backupCodes"] as? [Any]) ?? (o["recoveryCodes"] as? [Any]) ?? (o["codes"] as? [Any]) ?? []
        return raw.compactMap { $0 as? String }
    }

    /// Steg 3 → 4 (eller tilbake til Administrer etter nye koder). Telefonen merkes som pålitelig enhet.
    func finish(_ store: Store) {
        if !saved { return }
        Haptic30.double()
        if regenerated {
            step = 9
            regenerated = false
            store.flash("Nye reservekoder er lagret")
            return
        }
        step = 4
        Task {
            _ = try? await store.api.callAt("/api", "POST", "/devices/current", json: [:], timeout: 10)
            await self.load(store)
        }
    }

    /// Administrer → «Nye reservekoder».
    func regenerate(_ store: Store) {
        busy = true
        err = ""
        Task {
            defer { self.busy = false }
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/auth/2fa/backup/regenerate", json: [:], timeout: 20)
                self.codes = Tfa40Model.codesFrom(JS.obj(d))
                self.backupLeft = self.codes.count
                self.regenerated = true
                self.saved = false
                self.copiedCodes = false
                self.step = 3
            } catch let e as APIError {
                self.err = e.status == 404 ? "Serveren kan ikke lage nye reservekoder ennå. Oppdater Homelab." : e.message
            } catch {
                self.err = error.localizedDescription
            }
        }
    }

    /// Administrer → «Bytt autentiseringsapp»: ny nøkkel, samme steg som oppsettet.
    func switchApp(_ store: Store) {
        Haptic30.light()
        code = ""
        Task { await self.setup(store) }
    }

    /// Administrer → «Slå av»: krever passord eller en kode fra appen.
    func disable(_ store: Store) {
        let v: String = password.trimmingCharacters(in: .whitespaces)
        if v.isEmpty { err = "Skriv passordet eller en kode."; return }
        let digits: Bool = v.allSatisfy({ (c: Character) -> Bool in c.isNumber })
        let isCode: Bool = (v.count == 6 && digits) || (v.count == 9 && v.contains("-"))
        let body: [String: Any] = isCode ? ["code": v] : ["password": v]
        busy = true
        err = ""
        Task {
            defer { self.busy = false }
            do {
                _ = try await self.post(store, "/auth/2fa/disable", "/auth/totp/disable", body)
                self.enabled = false
                self.backupLeft = 0
                self.askDisable = false
                self.password = ""
                self.open = false
                Haptic30.double()
                store.flash("Totrinnsbekreftelse er slått av")
                await self.load(store)
            } catch let e as APIError {
                self.err = e.status == 403 || e.status == 401 ? "Feil passord eller kode." : e.message
            } catch {
                self.err = error.localizedDescription
            }
        }
    }

    /// Passnøkkel: krever WebAuthn-endepunktene på serveren og «webcredentials»-domene i appen.
    func passkey(_ store: Store) {
        Haptic30.light()
        err = ""
        Task {
            do {
                _ = try await store.api.callAt("/api", "POST", "/auth/passkey/register/options", json: [:], timeout: 15)
                self.err = "Passnøkkel krever at appen er koblet til domenet ditt (Associated Domains). Bruk autentiseringsapp inntil videre."
            } catch {
                self.err = "Passnøkler støttes ikke av serveren ennå. Bruk autentiseringsapp."
            }
        }
    }

    /// POST til det nye endepunktet, med eldre navn som reserve når serveren svarer 404.
    private func post(_ store: Store, _ path: String, _ legacy: String, _ body: [String: Any]) async throws -> Data {
        do {
            return try await store.api.callAt("/api", "POST", path, json: body, timeout: 20)
        } catch let e as APIError where e.status == 404 {
            return try await store.api.callAt("/api", "POST", legacy, json: body, timeout: 20)
        }
    }

    /// QR-kode for en annen enhet (lages lokalt).
    static func qr(_ text: String) -> UIImage? {
        let f: CIFilter & CIQRCodeGenerator = CIFilter.qrCodeGenerator()
        f.message = Data(text.utf8)
        f.correctionLevel = "M"
        guard let img = f.outputImage else { return nil }
        let big: CIImage = img.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        let ctx: CIContext = CIContext()
        guard let cg = ctx.createCGImage(big, from: big.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/* ---------- Raden i Sikkerhet ---------- */

struct Tfa40Row: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Tfa40Model { Tfa40Model.shared }

    var body: some View {
        let on: Bool = m.enabled ?? (store.me?.twoFactor ?? false)
        Button { m.begin(store) } label: {
            HStack(spacing: 12) {
                Image(systemName: on ? "lock.shield.fill" : "lock.shield").font(.dyn51(size: 18, weight: .medium))
                    .foregroundStyle(on ? Color(hex: "#2f7a4f") : Color.secondary)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Totrinnsbekreftelse").font(.dyn51(size: 16, weight: .semibold)).foregroundStyle(Color.primary)
                    Text(on ? "På · autentiseringsapp · " + m.leftText : "Av · sett opp i appen på 1 minutt")
                        .font(.dyn51(size: 13)).foregroundStyle(Color.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(on ? "Endre ›" : "Sett opp ›").font(.dyn51(size: 14, weight: .semibold))
                    .foregroundStyle(on ? Color.secondary : Color(hex: "#b23a2a"))
            }
            .padding(.vertical, 12).padding(.horizontal, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .task { await m.load(store) }
    }
}

/// Fullskjerm-overlegget (legges på Sikkerhet-siden).
struct Tfa40Host: ViewModifier {
    @Environment(\.paper) private var p
    @MainActor private var m: Tfa40Model { Tfa40Model.shared }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding<Bool>(get: { m.open }, set: { (v: Bool) in if !v { m.open = false } })) {
                Tfa40Flow()
                    .environment(\.paper, p)
                    .edgeSwipeClose30 { m.back() }
            }
    }
}

extension View {
    func tfa40Host() -> some View { modifier(Tfa40Host()) }
}

/* ---------- Flyten ---------- */

struct Tfa40Flow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Tfa40Model { Tfa40Model.shared }

    var body: some View {
        VStack(spacing: 0) {
            Tfa40Top()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !m.stepLabel.isEmpty {
                        Text(m.stepLabel).font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.mut)
                    }
                    Text(m.title).font(PF.serif(30, medium: true)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                    Text(m.sub).font(PF.ui(14.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    stepBody.padding(.top, 6)
                    if !m.err.isEmpty {
                        Text(m.err).font(PF.ui(13.5, .semibold)).foregroundStyle(Color(hex: "#b23a2a"))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 20).padding(.top, 10).padding(.bottom, 40)
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(p.bg.ignoresSafeArea())
        .animation(.easeOut(duration: 0.22), value: m.step)
    }

    @ViewBuilder private var stepBody: some View {
        switch m.step {
        case 0: Tfa40Methods()
        case 1: Tfa40Connect()
        case 2: Tfa40CodeStep()
        case 3: Tfa40Codes()
        case 4: Tfa40Done()
        default: Tfa40Manage()
        }
    }
}

/// «‹ Tilbake» / «‹ Sikkerhet» og fremdriftslinja (4 streker).
struct Tfa40Top: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Tfa40Model { Tfa40Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { m.back() } label: {
                Text(m.step == 0 || m.step >= 4 ? "‹ Sikkerhet" : "‹ Tilbake").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    .frame(height: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if m.step != 9 {
                HStack(spacing: 6) {
                    ForEach(0..<4, id: \.self) { (i: Int) in
                        Capsule().fill(i <= Swift.min(m.step, 3) ? p.ink : p.line).frame(height: 4)
                    }
                }
            }
        }
        .padding(.horizontal, 20).padding(.top, 4).padding(.bottom, 8)
    }
}

/// Stor mørk knapp (full bredde).
struct Tfa40Primary: View {
    @Environment(\.paper) private var p
    let title: String
    var enabled: Bool = true
    var busy: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy { ProgressView().tint(p.bg) }
                Text(title).font(PF.ui(15.5, .bold))
            }
            .foregroundStyle(p.bg)
            .frame(maxWidth: .infinity).frame(height: 52)
            .background(p.ink, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .opacity(enabled ? 1 : 0.45)
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled || busy)
    }
}

/// Lys knapp med kant.
struct Tfa40Secondary: View {
    @Environment(\.paper) private var p
    let title: String
    var color: Color? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(PF.ui(14.5, .bold)).foregroundStyle(color ?? p.ink)
                .frame(maxWidth: .infinity).frame(height: 46)
                .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(p.line, lineWidth: 1))
                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// Steg 0: velg metode (eller passord først når serveren ber om det).
struct Tfa40Methods: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Tfa40Model { Tfa40Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Tfa40Method(name: "Autentiseringsapp", sub: "Passord, Google Authenticator, 1Password", letter: "A", color: Color(hex: "#2b5d8a"),
                        tag: "Anbefalt", tagBg: Color(hex: "#e1ebf5"), busy: m.busy) { m.chooseApp(store) }
            Tfa40Method(name: "Passnøkkel med Face ID", sub: "Ingen kode å skrive. Lagres i iCloud-nøkkelringen", letter: "F", color: Color(hex: "#2f7a4f"),
                        tag: "Raskest", tagBg: Color(hex: "#e3f1e8"), busy: false) { m.passkey(store) }
            if m.askPassword { Tfa40PasswordField(label: "Skriv passordet ditt for å fortsette") { m.chooseApp(store) } }
        }
    }
}

struct Tfa40Method: View {
    @Environment(\.paper) private var p
    let name: String
    let sub: String
    let letter: String
    let color: Color
    let tag: String
    let tagBg: Color
    let busy: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(letter).font(PF.ui(17, .heavy)).foregroundStyle(Color.white)
                    .frame(width: 42, height: 42)
                    .background(color, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(name).font(PF.ui(15.5, .bold)).foregroundStyle(p.ink)
                        Text(tag).font(PF.ui(11, .bold)).foregroundStyle(color)
                            .padding(.horizontal, 8).frame(height: 20)
                            .background(tagBg, in: Capsule())
                    }
                    Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if busy { ProgressView() } else { Text("›").font(PF.ui(18)).foregroundStyle(p.mut) }
            }
            .padding(14)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(p.line, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// Passord (eller kode) før et beskyttet steg.
struct Tfa40PasswordField: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Tfa40Model { Tfa40Model.shared }
    let label: String
    var button: String = "Fortsett"
    let submit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
            SecureField("Passord", text: Binding<String>(get: { m.password }, set: { (v: String) in m.password = v }))
                .textContentType(.password)
                .font(PF.ui(16))
                .padding(.horizontal, 14).frame(height: 48)
                .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(p.line, lineWidth: 1))
                .submitLabel(.continue)
                .onSubmit(submit)
            Tfa40Primary(title: button, enabled: !m.password.isEmpty, busy: m.busy, action: submit)
        }
        .padding(.top, 6)
    }
}

/// Steg 1: koble til autentiseringsappen på samme telefon.
struct Tfa40Connect: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Tfa40Model { Tfa40Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Tfa40Primary(title: "Åpne i autentiseringsappen") { m.openAuthenticator() }
            VStack(alignment: .leading, spacing: 8) {
                Text("ELLER SKRIV NØKKELEN SELV").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut)
                HStack(spacing: 10) {
                    Text(m.secretGroups).font(PF.mono(15)).foregroundStyle(p.ink)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button { m.copyKey() } label: {
                        Text(m.copiedKey ? "✓ Kopiert" : "Kopier").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                            .padding(.horizontal, 12).frame(height: 34)
                            .background(p.bg, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(14)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            Button { m.showQr.toggle() } label: {
                Text(m.showQr ? "Skjul QR-kode" : "Vis QR-kode for en annen enhet").font(PF.ui(14, .semibold)).foregroundStyle(p.lab)
                    .frame(height: 40)
            }
            .buttonStyle(.plain)
            if m.showQr, let img = Tfa40Model.qr(m.otpauth) {
                Image(uiImage: img).interpolation(.none).resizable().scaledToFit()
                    .frame(width: 200, height: 200)
                    .padding(12)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel("QR-kode for autentiseringsappen")
            }
            Tfa40Secondary(title: "Jeg har lagt den inn ›") { m.step = 2 }
        }
    }
}

/// Steg 2: skriv koden (autofyll fra Passord med .oneTimeCode).
struct Tfa40CodeStep: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Tfa40Model { Tfa40Model.shared }
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            TextField("000000", text: Binding<String>(get: { m.code }, set: { (v: String) in m.setCode(v) }))
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .font(PF.mono(30))
                .multilineTextAlignment(.center)
                .tracking(8)
                .frame(height: 64)
                .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(m.err.isEmpty ? p.line : Color(hex: "#b23a2a"), lineWidth: 1.5))
                .focused($focused)
                .accessibilityLabel("Sekssifret kode")
            Tfa40Primary(title: "Bekreft", enabled: m.code.count == 6, busy: m.busy) { m.verify(store) }
        }
        .onAppear { focused = true }
    }
}

/// Steg 3: reservekodene.
struct Tfa40Codes: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Tfa40Model { Tfa40Model.shared }

    var body: some View {
        let cols: [GridItem] = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
        VStack(alignment: .leading, spacing: 12) {
            LazyVGrid(columns: cols, spacing: 8) {
                ForEach(m.codes, id: \.self) { (c: String) in
                    Text(c).font(PF.mono(16)).foregroundStyle(p.ink)
                        .frame(maxWidth: .infinity).frame(height: 40)
                        .background(p.bg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
            .padding(12)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .textSelection(.enabled)
            HStack(spacing: 8) {
                Tfa40Secondary(title: m.copiedCodes ? "✓ Kopiert" : "Kopier alle") { m.copyCodes() }
                ShareLink(item: "Homelab reservekoder\n" + m.codes.joined(separator: "\n")) {
                    Text("Lagre i Passord / Del").font(PF.ui(14.5, .bold)).foregroundStyle(p.ink)
                        .frame(maxWidth: .infinity).frame(height: 46)
                        .background(p.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(p.line, lineWidth: 1))
                }
            }
            Button { m.saved.toggle(); Haptic30.light() } label: {
                HStack(spacing: 10) {
                    Text(m.saved ? "✓" : "").font(PF.ui(13, .heavy)).foregroundStyle(Color.white)
                        .frame(width: 24, height: 24)
                        .background(m.saved ? Color(hex: "#2f7a4f") : Color.clear, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(m.saved ? Color(hex: "#2f7a4f") : p.line, lineWidth: 1.5))
                    Text("Jeg har lagret reservekodene").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink)
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Tfa40Primary(title: m.regenerated ? "Ferdig" : "Slå på totrinnsbekreftelse", enabled: m.saved) { m.finish(store) }
        }
    }
}

/// Steg 4: ferdig.
struct Tfa40Done: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Tfa40Model { Tfa40Model.shared }

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark").font(.dyn51(size: 34, weight: .heavy)).foregroundStyle(Color.white)
                .frame(width: 84, height: 84)
                .background(Color(hex: "#2f7a4f"), in: Circle())
            Text("Denne telefonen er merket som pålitelig enhet.").font(PF.ui(14)).foregroundStyle(p.mut)
                .multilineTextAlignment(.center)
            Tfa40Primary(title: "Ferdig") { m.close() }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 20)
    }
}

/// Administrer (når 2FA er på).
struct Tfa40Manage: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Tfa40Model { Tfa40Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(spacing: 0) {
                row("Nye reservekoder", m.leftText, p.ink, first: true) { m.regenerate(store) }
                row("Bytt autentiseringsapp", "", p.ink) { m.switchApp(store) }
                row("Legg til passnøkkel (Face ID)", "", p.ink) { m.passkey(store) }
                row("Slå av totrinnsbekreftelse", "", Color(hex: "#b23a2a")) { m.askDisable = true; m.password = "" }
            }
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            if m.askPassword { Tfa40PasswordField(label: "Skriv passordet ditt for å bytte app") { m.switchApp(store) } }
            if m.askDisable {
                Tfa40PasswordField(label: "Skriv passordet eller en kode fra autentiseringsappen for å slå av", button: "Slå av") { m.disable(store) }
            }
        }
    }

    private func row(_ n: String, _ v: String, _ c: Color, first: Bool = false, _ go: @escaping () -> Void) -> some View {
        Button(action: go) {
            HStack {
                Text(n).font(PF.ui(15, .semibold)).foregroundStyle(c)
                Spacer()
                if !v.isEmpty { Text(v).font(PF.ui(13)).foregroundStyle(p.mut) }
                Text("›").font(PF.ui(16)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).frame(minHeight: 52)
            .overlay(alignment: .top) { if !first { Rectangle().fill(p.line).frame(height: 1) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
