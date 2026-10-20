import SwiftUI
import AppKit

/* ---------------- Prompt 41: Kalender for Mac – innlogging uten serveradresse (samme PKCE-flyt som iPhone) ---------------- */
// «Fortsett som …» via delt Nøkkelring på Mac (krever Team ID + keychain-access-groups), «Logg inn med Homelab-appen»
// (homelab://app-auth når Homelab finnes på Mac-en, ellers godkjenning på web-siden <server>/app-auth i nettleseren; svaret
// kommer tilbake som kalender://auth?code=…&state=…) og «Bruk brukernavn og passord». Ingen adresse spørres om.
// ObservableObject (macOS 13). Ingen tilstand skrives under tegning – bare fra knapper og ferdige nettkall.

@MainActor
final class MacLogin41Model: ObservableObject {
    static let shared: MacLogin41Model = MacLogin41Model()

    /// start | wait | err | pw
    @Published var phase: String = "start"
    @Published var error: String = ""
    @Published var step: Int = 0
    @Published var busy: Bool = false
    @Published var needsCode: Bool = false
    @Published var offerServer: Bool = false
    @Published var serverOpen: Bool = false
    private var waitId: Int = 0

    var quickName: String? {
        guard let d = KalShared41.device() else { return nil }
        return d.display.isEmpty ? "Homelab-kontoen" : d.display
    }

    private func cands() -> [String] {
        let last: String = UserDefaults.standard.string(forKey: "mac.lastServer") ?? ""
        var extra: [String] = MacSession.bases
        if !last.isEmpty { extra.append(last) }
        return KalAuth41.candidates(extra: extra)
    }

    func quick() {
        guard let d = KalShared41.device() else { return }
        phase = "wait"
        step = 3
        error = ""
        Task {
            do {
                let s: KalSession41 = try await KalAuth41.deviceExchange(d)
                finish(s)
            } catch let e as KalAuth41Error {
                fail(KalAuth41.message(e), server: e.status == 0)
            } catch {
                fail(error.localizedDescription, server: false)
            }
        }
    }

    func viaApp() {
        error = ""
        step = 0
        phase = "wait"
        waitId += 1
        let id: Int = waitId
        let list: [String] = cands()
        Task {
            let base: String = await KalAuth41.firstReachable(Array(list.prefix(3))) ?? (list.first ?? KalAuth41.defaultBase)
            if self.waitId != id { return }
            let p: KalPending41 = KalAuth41.begin(base: base)
            var opened: Bool = false
            if let sch = KalAuth41.schemeURL(p), NSWorkspace.shared.urlForApplication(toOpen: sch) != nil {
                opened = NSWorkspace.shared.open(sch)
            }
            if !opened, let web = KalAuth41.webURL(p, base: base) { opened = NSWorkspace.shared.open(web) }
            if opened {
                self.step = 1
            } else {
                self.fail("Fant ikke Homelab. Logg inn med brukernavn og passord.", server: true)
            }
        }
        Task {
            try? await Task.sleep(nanoseconds: 180_000_000_000)
            if self.phase == "wait" && self.waitId == id && self.step < 2 {
                self.fail("Homelab svarte ikke. Sjekk at Homelab er innlogget, og prøv igjen.", server: false)
            }
        }
    }

    func handleRedirect(_ url: URL) {
        let items: [URLQueryItem] = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func q(_ k: String) -> String? {
            let v: String? = items.first(where: { (i: URLQueryItem) -> Bool in i.name == k })?.value
            return (v ?? "").isEmpty ? nil : v
        }
        waitId += 1
        if let err = q("error") {
            KalAuth41.clearPending()
            fail(err.contains("denied") || err.contains("avvist") ? "Innloggingen ble avvist i Homelab." : "Homelab: " + err, server: false)
            return
        }
        guard let code = q("code"), let state = q("state") else { return }
        phase = "wait"
        step = 2
        Task {
            do {
                let s: KalSession41 = try await KalAuth41.exchange(code: code, state: state, server: q("server") ?? q("base"))
                self.step = 3
                finish(s)
            } catch let e as KalAuth41Error {
                fail(KalAuth41.message(e), server: e.status == 0)
            } catch {
                fail(error.localizedDescription, server: false)
            }
        }
    }

    func cancel() {
        waitId += 1
        KalAuth41.clearPending()
        phase = "start"
    }

    func password(user: String, pass: String, code: String) {
        let u: String = user.trimmingCharacters(in: .whitespaces)
        if u.isEmpty || pass.isEmpty {
            error = "Skriv inn brukernavn og passord."
            return
        }
        busy = true
        error = ""
        offerServer = false
        let list: [String] = cands()
        Task {
            guard let base = await KalAuth41.firstReachable(list) else {
                busy = false
                error = "Får ikke kontakt med Homelab."
                offerServer = true
                return
            }
            do {
                let r: MacAuth.Result = try await MacAuth.login(base: base, username: u, password: pass, code: code)
                UserDefaults.standard.set(base, forKey: "mac.lastServer")
                UserDefaults.standard.set(u, forKey: "mac.lastUser")
                busy = false
                finish(KalSession41(token: r.token, refresh: "", user: r.user, base: base))
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

    private func finish(_ s: KalSession41) {
        var bases: [String] = [s.base]
        for b in cands() where b != s.base && !bases.contains(b) && bases.count < 3 { bases.append(b) }
        MacStore.shared.didLogin(bases: bases, token: s.token, user: s.user)
        phase = "start"
        step = 0
        error = ""
        MacStore.shared.showToast("✓ Logget inn som " + (s.user.isEmpty ? "Homelab-kontoen" : s.user), undo: "")
        Task { await MacLogin41Model.syncServers() }
    }

    private func fail(_ msg: String, server: Bool) {
        error = msg
        offerServer = server
        phase = "err"
    }

    /// Lokal/ekstern adresse fra serveren (Bytt automatisk: lokal når den svarer < 300 ms).
    static func syncServers() async {
        let ok: Bool = await KalServer41.refresh()
        if !ok { return }
        let ordered: [String] = await KalServer41.choose()
        guard let tok = MacSession.token, !ordered.isEmpty else { return }
        var bases: [String] = ordered
        for b in MacSession.bases where !bases.contains(b) { bases.append(b) }
        if bases != MacSession.bases { MacSession.save(bases: bases, token: tok, user: MacSession.user) }
    }
}

struct MacLogin41View: View {
    @Environment(\.mk) private var t
    @ObservedObject var m: MacLogin41Model = MacLogin41Model.shared
    @State private var user: String = UserDefaults.standard.string(forKey: "mac.lastUser") ?? ""
    @State private var pass: String = ""
    @State private var code: String = ""
    @State private var server: String = UserDefaults.standard.string(forKey: "kal41.manual") ?? ""

    var body: some View {
        VStack(spacing: 18) {
            MacAppIcon(size: 84).shadow(color: Color.black.opacity(0.18), radius: 8, y: 4)
            VStack(spacing: 6) {
                Text(title).font(MacFont.serif(30)).foregroundColor(t.ink)
                if !subtitle.isEmpty {
                    Text(subtitle).font(MacFont.ui(14)).foregroundColor(t.mut).multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: 340)
            content.frame(width: 340)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(t.bg)
    }

    private var title: String {
        if m.phase == "wait" { return "Godkjenn i Homelab" }
        if m.phase == "err" { return "Fikk ikke logget inn" }
        return "Velkommen til Kalender"
    }

    private var subtitle: String {
        if m.phase == "wait" { return "Godkjenn innloggingen i Homelab eller i nettleseren. Du kommer tilbake hit av deg selv." }
        if m.phase == "err" { return "" }
        return "Bruk samme konto som i Homelab. Kalendere, bursdager og frister synkes med en gang."
    }

    @ViewBuilder private var content: some View {
        switch m.phase {
        case "wait": waitView
        case "err": errView
        case "pw": pwView
        default: startView
        }
    }

    private func big(_ title: String, filled: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(MacFont.ui(14, .bold)).foregroundColor(filled ? t.bg : t.ink)
                .frame(maxWidth: .infinity).frame(height: 44)
                .background(Capsule().fill(filled ? t.ink : t.card))
                .overlay(Capsule().strokeBorder(filled ? Color.clear : t.line, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func quiet(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(MacFont.ui(13, .bold)).foregroundColor(t.mut).frame(height: 32)
        }
        .buttonStyle(.plain)
    }

    private var startView: some View {
        VStack(spacing: 10) {
            if let n = m.quickName {
                Button(action: { m.quick() }) {
                    HStack(spacing: 12) {
                        Text(String(n.prefix(1)).uppercased()).font(MacFont.ui(15, .bold)).foregroundColor(Color.white)
                            .frame(width: 38, height: 38).background(Circle().fill(Color(kalHex: "#b23a2a")))
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Fortsett som " + n).font(MacFont.ui(14.5, .bold))
                            Text("Innlogget i Homelab på denne Mac-en").font(MacFont.ui(12)).opacity(0.75)
                        }
                        Spacer()
                        Text("›").font(MacFont.ui(16, .bold))
                    }
                    .foregroundColor(t.bg)
                    .padding(.horizontal, 12).frame(height: 56)
                    .background(RoundedRectangle(cornerRadius: 18).fill(t.ink))
                    .contentShape(RoundedRectangle(cornerRadius: 18))
                }
                .buttonStyle(.plain)
            }
            big("Logg inn med Homelab-appen", filled: false) { m.viaApp() }
            quiet("Bruk brukernavn og passord") { m.phase = "pw" }
        }
    }

    private var waitView: some View {
        VStack(spacing: 14) {
            ProgressView().controlSize(.regular)
            VStack(alignment: .leading, spacing: 6) {
                stepRow(0, "Åpner Homelab")
                stepRow(1, "Godkjenn i Homelab")
                stepRow(2, "Sender deg tilbake til Kalender")
                stepRow(3, "Henter kalenderne dine")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 14).fill(t.card))
            HStack(spacing: 8) {
                big("Åpne Homelab igjen", filled: false) { m.viaApp() }
                quiet("Avbryt") { m.cancel() }
            }
        }
    }

    private func stepRow(_ i: Int, _ text: String) -> some View {
        HStack(spacing: 10) {
            Text(i < m.step ? "✓" : (i == m.step ? "•" : "·")).font(MacFont.ui(13, .bold)).frame(width: 16)
            Text(text).font(MacFont.ui(13, i == m.step ? .bold : .medium))
        }
        .foregroundColor(i <= m.step ? t.ink : t.mut)
    }

    private var errView: some View {
        VStack(spacing: 10) {
            Text(m.error).font(MacFont.ui(13)).foregroundColor(t.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 14).fill(t.card))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color(kalHex: "#b23a2a"), lineWidth: 1.5))
            big("Prøv igjen", filled: true) { m.viaApp() }
            quiet("Bruk brukernavn og passord") { m.phase = "pw" }
            if m.offerServer { serverLink }
        }
    }

    private var pwView: some View {
        VStack(spacing: 10) {
            MacLoginField(title: "Brukernavn", text: $user, secure: false)
            MacLoginField(title: "Passord", text: $pass, secure: true, onSubmit: submit)
            if m.needsCode { MacLoginField(title: "Kode (6 sifre)", text: $code, secure: false, onSubmit: submit) }
            if !m.error.isEmpty {
                Text(m.error).font(MacFont.ui(12.5)).foregroundColor(t.acc)
                    .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
            }
            big(m.busy ? "Logger inn …" : "Logg inn", filled: true) { submit() }
                .keyboardShortcut(.defaultAction)
                .disabled(m.busy)
            if m.offerServer { serverLink }
            quiet("‹ Tilbake") {
                m.error = ""
                m.phase = "start"
            }
        }
    }

    @ViewBuilder private var serverLink: some View {
        if m.serverOpen {
            VStack(alignment: .leading, spacing: 6) {
                MacLoginField(title: "https://home.kristo.no", text: $server, secure: false, onSubmit: saveServer)
                HStack {
                    Button("Lagre") { saveServer() }
                    Button("Avbryt") { m.serverOpen = false }
                }
            }
        } else {
            Button(action: { m.serverOpen = true }) {
                Text("Endre serveradresse").font(MacFont.ui(12.5, .semibold)).foregroundColor(t.acc)
            }
            .buttonStyle(.plain)
        }
    }

    private func saveServer() {
        let s: String = MacAuth.normalize(server)
        if !(s.hasPrefix("http://") || s.hasPrefix("https://")) { return }
        UserDefaults.standard.set(s, forKey: "kal41.manual")
        m.serverOpen = false
        m.offerServer = false
        m.error = ""
    }

    private func submit() {
        m.password(user: user, pass: pass, code: code)
    }
}
