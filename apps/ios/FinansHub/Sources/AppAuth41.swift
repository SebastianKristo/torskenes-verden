import SwiftUI
import UIKit
import LocalAuthentication

/* ---------------- Prompt 41: Homelab-siden av «Logg inn med Homelab-appen» (Kalender) ---------------- */
// Spesifikasjon: prompts/prompt-41-pakke/claude-code-kalender-logg-inn-homelab.md. Fasit: Kalender App.dc.html (auVals).
// Kalender-siden (KAL41) ligger i Kalender/ og SharedKal/. Denne fila:
// 1. Fanger homelab://app-auth?client=kalender&redirect=kalender://auth&state=…&cc=…(&cc_method=S256) og universal link
//    https://<server>/app-auth?… (Associated Domains applinks:home.kristo.no – krever Team ID; skjemaet virker uten).
// 2. Viser arket «Logge inn i Kalender?» med kontoen, godkjenning med Face ID / kode (LAContext), og kaller
//    POST /api/auth/app-code {client, redirect, state, code_challenge, code_challenge_method} → {code} (engangs, ≤ 60 s, bundet til PKCE).
// 3. Åpner kalender://auth?code=…&state=…&server=… – eller kalender://auth?error=denied&state=… ved «Avvis».
//    Redirect må stå i hvitelisten: kalender://auth eller https://<kjent server>/… (serveren sjekker også).
// 4. «Fortsett som»: når Homelab er innlogget hentes et kortlivet, engangs enhets-token (POST /api/auth/device-token, 15 min) som
//    legges i delt Nøkkelring + App Group (KalShared41.save, SharedKal/Group). Kalender bytter det mot eget token
//    (POST /api/auth/device-exchange). Fornyes når appen er aktiv. Utlogging fjerner det (KalShared41.clear).
// Er appen ikke innlogget når lenken kommer, huskes forespørselen og arket vises etter innlogging (innen 60 s).

struct AppAuth41Req: Identifiable, Equatable {
    var id: String { state }
    let client: String
    let redirect: String
    let state: String
    let challenge: String
    let method: String
    let at: Date
}

@MainActor
@Observable
final class AppAuth41 {
    static let shared = AppAuth41()

    var req: AppAuth41Req? = nil
    var busy: Bool = false
    var err: String = ""
    @ObservationIgnored private var waiting: AppAuth41Req? = nil

    /// Kalles fra onOpenURL og onContinueUserActivity. true = lenken var en app-innlogging.
    func handle(_ url: URL, _ store: Store) -> Bool {
        guard let r = AppAuth41.parse(url) else { return false }
        Haptics.shared.select()
        guard AppAuth41.allowed(r.redirect, store) else {
            store.flash("Ukjent app ba om innlogging – avvist")
            return true
        }
        err = ""
        if store.loggedIn {
            req = r
        } else {
            waiting = r
            store.flash("Logg inn i Homelab først, så kan du godkjenne Kalender")
        }
        return true
    }

    /// Etter innlogging: vis arket hvis forespørselen ikke er for gammel.
    func resume(_ store: Store) {
        guard store.loggedIn, let w = waiting else { return }
        waiting = nil
        if Date().timeIntervalSince(w.at) < 60 { req = w }
    }

    nonisolated static func parse(_ url: URL) -> AppAuth41Req? {
        let scheme: String = (url.scheme ?? "").lowercased()
        let host: String = (url.host ?? "").lowercased()
        let path: String = url.path.lowercased()
        let isScheme: Bool = scheme == "homelab" && (host == "app-auth" || path.hasPrefix("/app-auth"))
        let isWeb: Bool = (scheme == "https" || scheme == "http") && path.hasPrefix("/app-auth")
        guard isScheme || isWeb else { return nil }
        let items: [URLQueryItem] = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func q(_ k: String) -> String { items.first(where: { (i: URLQueryItem) -> Bool in i.name == k })?.value ?? "" }
        let state: String = q("state")
        let cc: String = q("cc").isEmpty ? q("code_challenge") : q("cc")
        guard !state.isEmpty, !cc.isEmpty else { return nil }
        let client: String = q("client").isEmpty ? "kalender" : q("client")
        let redirect: String = q("redirect").isEmpty ? "kalender://auth" : q("redirect")
        let m: String = q("cc_method").isEmpty ? (q("code_challenge_method").isEmpty ? "S256" : q("code_challenge_method")) : q("cc_method")
        return AppAuth41Req(client: client, redirect: redirect, state: state, challenge: cc, method: m, at: Date())
    }

    /// Hvitelisten: kalender://auth eller https://<kjent server>/….
    static func allowed(_ redirect: String, _ store: Store) -> Bool {
        if redirect == "kalender://auth" { return true }
        guard let u = URL(string: redirect), u.scheme == "https", let h = u.host?.lowercased() else { return false }
        var hosts: [String] = ["home.kristo.no"]
        for a in store.accounts {
            for s in [a.server, a.external] where !s.isEmpty {
                if let x = URL(string: s)?.host?.lowercased() { hosts.append(x) }
            }
        }
        return hosts.contains(h)
    }

    /// «Godkjenn»: Face ID / kode, så kode fra serveren og tilbake til appen.
    func approve(_ store: Store) {
        guard let r = req, !busy else { return }
        if Date().timeIntervalSince(r.at) > 120 {
            err = "Forespørselen er utløpt. Start innloggingen i Kalender på nytt."
            return
        }
        busy = true
        err = ""
        Task { @MainActor in
            defer { self.busy = false }
            let ok: Bool = await AppAuth41.verifyOwner()
            guard ok else {
                self.err = "Face ID ble ikke godkjent."
                return
            }
            let body: [String: Any] = ["client": r.client, "redirect": r.redirect, "state": r.state,
                                       "code_challenge": r.challenge, "code_challenge_method": r.method]
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/auth/app-code", json: body, timeout: 15)
                let code: String = JS.str(JS.obj(d), "code") ?? ""
                guard !code.isEmpty else { self.err = "Uventet svar fra serveren. Prøv igjen."; return }
                Haptics.shared.success()
                let server: String = store.account.map { $0.external.isEmpty ? $0.server : $0.external } ?? ""
                self.req = nil
                self.back(r, ["code": code, "state": r.state, "server": server])
            } catch let e as APIError {
                self.err = e.status == 404 ? "Serveren støtter ikke app-innlogging ennå (404). Oppdater Homelab." : "Feil fra serveren (HTTP \(e.status)): " + e.message
            } catch {
                self.err = error.localizedDescription
            }
        }
    }

    func deny() {
        guard let r = req else { return }
        Haptics.shared.tap()
        req = nil
        back(r, ["error": "access_denied", "state": r.state])
    }

    private func back(_ r: AppAuth41Req, _ params: [String: String]) {
        var allowedChars: CharacterSet = CharacterSet.alphanumerics
        allowedChars.insert(charactersIn: "-._~")
        let qs: String = params.keys.sorted().compactMap { (k: String) -> String? in
            guard let v = params[k], !v.isEmpty else { return nil }
            return k + "=" + (v.addingPercentEncoding(withAllowedCharacters: allowedChars) ?? v)
        }.joined(separator: "&")
        let sep: String = r.redirect.contains("?") ? "&" : "?"
        guard let u = URL(string: r.redirect + sep + qs) else { return }
        UIApplication.shared.open(u, options: [:], completionHandler: nil)
    }

    /// Face ID / Touch ID, med enhetskode som reserve. Uten biometri eller kode: godkjent med trykket alene.
    nonisolated static func verifyOwner() async -> Bool {
        let ctx: LAContext = LAContext()
        var e: NSError? = nil
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &e) else { return true }
        do {
            return try await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Logg inn i Kalender med Homelab-kontoen din")
        } catch {
            return false
        }
    }

    /* ---------- «Fortsett som» (delt enhets-token) ---------- */

    /// Legger et kortlivet enhets-token (POST /api/auth/device-token → {device_token, expiresAt}, 15 min, engangs) i delt Nøkkelring
    /// og App Group (KalShared41.save). Fornyes når appen blir aktiv (høyst hvert 2. min) og når widgetene synkes.
    static func shareDevice(_ store: Store) {
        guard let a = store.account else { KalShared41.clear(); return }
        let now: Date = Date()
        if now.timeIntervalSince(lastShare) < 120 { return }
        lastShare = now
        var bases: [String] = []
        for b in [store.base, a.server, a.external, a.local] where !b.isEmpty && !bases.contains(b) { bases.append(b) }
        let name: String = store.displayName.isEmpty ? a.label : store.displayName
        let user: String = a.username
        Task { @MainActor in
            guard let d = try? await store.api.callAt("/api", "POST", "/auth/device-token", json: ["app": "kalender"], timeout: 12) else { return }
            let o: [String: Any] = JS.obj(d)
            guard let tok = JS.str(o, "device_token"), !tok.isEmpty else { return }
            let exp: Double = JS.date(o["expiresAt"])?.timeIntervalSince1970 ?? (Date().timeIntervalSince1970 + (JS.num(o, "expiresIn") ?? 900))
            KalShared41.save(KalDevice41(token: tok, user: user, name: name, bases: bases, exp: exp))
        }
    }

    static var lastShare: Date = .distantPast
}

/* ---------- Arket «Logge inn i Kalender?» ---------- */

struct AppAuth41Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: AppAuth41 { AppAuth41.shared }
    let r: AppAuth41Req

    var body: some View {
        VStack(spacing: 16) {
            Capsule().fill(p.line).frame(width: 36, height: 5).padding(.top, 8)
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white)
                VStack(spacing: 0) {
                    Text(AppAuth41Sheet.weekday()).font(.system(size: 10, weight: .bold)).foregroundStyle(Color(hex: "#e0342a"))
                    Text(AppAuth41Sheet.day()).font(.system(size: 28, weight: .regular)).foregroundStyle(Color.black)
                }
            }
            .frame(width: 64, height: 64)
            .shadow(color: .black.opacity(0.18), radius: 8, y: 4)
            .accessibilityHidden(true)
            VStack(spacing: 6) {
                Text("Logge inn i " + name + "?").font(PF.serif(26, medium: true)).foregroundStyle(p.ink).multilineTextAlignment(.center)
                Text(name + " får tilgang til kalenderne dine og bruker samme konto som Homelab.")
                    .font(PF.ui(14)).foregroundStyle(p.mut).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(p.popSel)
                    if let img = store.avatarImage41 {
                        Image(uiImage: img).resizable().scaledToFill().clipShape(Circle())
                    } else {
                        Text(String(store.displayName.prefix(1)).uppercased()).font(PF.serif(18, medium: true)).foregroundStyle(p.ink)
                    }
                }
                .frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 1) {
                    Text(store.displayName.isEmpty ? (store.account?.label ?? "Konto") : store.displayName).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text("@" + (store.account?.username ?? "") + " · " + host).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .background(p.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            if !m.err.isEmpty {
                Text(m.err).font(PF.ui(13, .semibold)).foregroundStyle(p.lab).multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button { m.approve(store) } label: {
                HStack(spacing: 8) {
                    if m.busy { ProgressView().tint(p.bg) } else { Image(systemName: "faceid").font(.system(size: 17, weight: .semibold)) }
                    Text(m.busy ? "Godkjenner …" : "Godkjenn med Face ID").font(PF.ui(15, .bold))
                }
                .foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 52)
                .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(m.busy)
            Button { m.deny() } label: {
                Text("Avvis").font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 46)
                    .overlay(Capsule().stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(m.busy)
            Text("Du sendes tilbake til " + name + " etterpå. Koden virker bare én gang og i 60 sekunder.")
                .font(PF.ui(12)).foregroundStyle(p.mut).multilineTextAlignment(.center)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 22).padding(.bottom, 16)
        .background(p.bg.ignoresSafeArea())
        .interactiveDismissDisabled(m.busy)
    }

    private var name: String { r.client == "kalender" ? "Kalender" : r.client.capitalized }

    private var host: String {
        (store.base.isEmpty ? store.server : store.base).replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
    }

    static func weekday() -> String {
        let f: DateFormatter = DateFormatter()
        f.locale = Locale(identifier: "nb_NO")
        f.dateFormat = "EEE"
        return f.string(from: Date()).uppercased().replacingOccurrences(of: ".", with: "")
    }

    static func day() -> String {
        String(Calendar.current.component(.day, from: Date()))
    }
}

extension Store {
    /// Profilbildet (privat i Store) til arket.
    var avatarImage41: UIImage? { avatar }
}

/// Arket over hele appen (legges i RootView via App.swift).
struct AppAuth41Host: ViewModifier {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase
    @MainActor private var m: AppAuth41 { AppAuth41.shared }

    func body(content: Content) -> some View {
        let p: PaperPalette = PaperPalette.of(store.paperMode, system: paperSystemScheme(phase))
        content
            .sheet(item: Binding<AppAuth41Req?>(get: { m.req }, set: { (v: AppAuth41Req?) in if v == nil && !m.busy { m.deny41Silently() } })) { (r: AppAuth41Req) in
                AppAuth41Sheet(r: r).environment(\.paper, p).presentationDetents([.medium, .large])
            }
            .onChange(of: store.loggedIn) { _, on in
                if on { m.resume(store) }
                AppAuth41.shareDevice(store)
            }
            .onChange(of: phase) { _, ph in if ph == .active { AppAuth41.shareDevice(store) } }
    }
}

extension AppAuth41 {
    /// Arket dratt ned: regnes som avvist (Kalender får beskjed, så den ikke venter i 60 s).
    func deny41Silently() {
        if req != nil { deny() }
    }
}

extension View {
    func appAuth41Host() -> some View { modifier(AppAuth41Host()) }
}
