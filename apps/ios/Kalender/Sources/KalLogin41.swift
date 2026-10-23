import SwiftUI
import UIKit

/* ---------------- Prompt 41: Kalender – innloggingsskjermen uten serveradresse ---------------- */
// Fasit: Kalender App.dc.html → auVals. Start: «Fortsett som Sebastian» (enhets-token fra Homelab på samme enhet, ingen app-bytte),
// «Logg inn med Homelab-appen» (PKCE, se SharedKal/Core/KalAuth41Core.swift) og «Bruk brukernavn og passord» (+ 2FA).
// Venter: spinner og fire steg, «Åpne Homelab igjen» og «Avbryt». Feil: konkret tekst, «Prøv igjen» og passord-reserve.
// Ingen adresse spørres om; «Endre serveradresse» vises bare når ingen adresse svarer.

@MainActor
@Observable
final class KalLogin41Model {
    static let shared: KalLogin41Model = KalLogin41Model()

    /// start | wait | err | pw
    var phase: String = "start"
    var error: String = ""
    /// Vis «Endre serveradresse» (ingen adresse svarte).
    var offerServer: Bool = false
    var serverOpen: Bool = false
    var serverText: String = UserDefaults.standard.string(forKey: "kal41.manual") ?? ""
    /// 0 Åpner Homelab · 1 Godkjenn · 2 Sender tilbake · 3 Henter kalenderne
    var step: Int = 0
    var busy: Bool = false
    var user: String = UserDefaults.standard.string(forKey: "kal41.lastUser") ?? ""
    var pass: String = ""
    var code: String = ""
    var needsCode: Bool = false
    /// Tilbud om å godkjenne i nettleseren (Homelab-appen mangler).
    var webOffer: Bool = false
    @ObservationIgnored private var waitId: Int = 0
    /// Prompt 44: samme svar fra Homelab to ganger (onOpenURL + aktivering) skal ikke gi «koden er allerede brukt».
    @ObservationIgnored private var lastCode44: String = ""
    @ObservationIgnored private var returnId44: Int = 0

    /// «Fortsett som …»: enhets-token (delt Nøkkelring / App Group) eller det eldre companion-tokenet fra Homelab.
    var quickName: String? {
        if let d = KalShared41.device() { return d.display.isEmpty ? "Homelab-kontoen" : d.display }
        if KalGroup.homelabToken != nil, !KalGroup.homelabBases.isEmpty {
            let u: String = KalGroup.homelabUser
            return u.isEmpty ? "Homelab-kontoen" : u
        }
        return nil
    }

    /* ---------- Fortsett som ---------- */

    func quick() {
        KalHaptic.tap()
        phase = "wait"
        step = 3
        error = ""
        Task { @MainActor in
            if let d = KalShared41.device() {
                do {
                    let s: KalSession41 = try await KalAuth41.deviceExchange(d)
                    finish(s, via: "homelab")
                    return
                } catch let e as KalAuth41Error {
                    // Eldre server uten device-exchange: bruk companion-tokenet hvis det finnes.
                    if e.status == 404, KalStore.shared.adoptHomelab() { done(name: KalGroup.homelabUser); return }
                    fail(KalAuth41.message(e), server: e.status == 0)
                    return
                } catch {
                    fail(error.localizedDescription, server: false)
                    return
                }
            }
            if KalStore.shared.adoptHomelab() {
                done(name: KalGroup.homelabUser)
                return
            }
            fail("Fant ingen innlogging fra Homelab på denne enheten. Logg inn med Homelab-appen.", server: false)
        }
    }

    /* ---------- Logg inn med Homelab-appen (PKCE) ---------- */

    func viaApp() {
        KalHaptic.tap()
        error = ""
        webOffer = false
        step = 0
        phase = "wait"
        waitId += 1
        let id: Int = waitId
        Task { @MainActor in
            let cands: [String] = KalAuth41.candidates()
            let base: String = await KalAuth41.firstReachable(Array(cands.prefix(3))) ?? (cands.first ?? KalAuth41.defaultBase)
            let p: KalPending41 = KalAuth41.begin(base: base)
            KalLog44.send("auth.handoff.start", ["base": base])
            open(p, base: base, id: id)
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(KalAuth41.timeout * 1_000_000_000))
            if self.phase == "wait" && self.waitId == id && self.step < 2 {
                self.fail("Homelab svarte ikke. Sjekk at Homelab er innlogget, og prøv igjen.", server: false)
            }
        }
    }

    /// Universal link først (bare hvis Homelab fanger den), så homelab://, ellers feil med tilbud om web-godkjenning.
    private func open(_ p: KalPending41, base: String, id: Int) {
        guard let uni = KalAuth41.universalURL(p) else { return }
        UIApplication.shared.open(uni, options: [UIApplication.OpenExternalURLOptionsKey.universalLinksOnly: true]) { (ok: Bool) in
            Task { @MainActor in
                if self.waitId != id { return }
                if ok {
                    self.step = 1
                    return
                }
                guard let sch = KalAuth41.schemeURL(p) else { return }
                UIApplication.shared.open(sch, options: [:]) { (ok2: Bool) in
                    Task { @MainActor in
                        if self.waitId != id { return }
                        if ok2 {
                            self.step = 1
                        } else {
                            self.webOffer = true
                            self.fail("Fant ikke Homelab-appen. Logg inn med brukernavn og passord, eller installer Homelab.", server: false)
                        }
                    }
                }
            }
        }
    }

    /// Homelab ikke installert: godkjenn på web-siden (samme PKCE, svaret kommer til kalender://auth).
    func approveInBrowser() {
        KalHaptic.tap()
        waitId += 1
        let id: Int = waitId
        phase = "wait"
        step = 1
        error = ""
        Task { @MainActor in
            let cands: [String] = KalAuth41.candidates()
            let base: String = await KalAuth41.firstReachable(Array(cands.prefix(3))) ?? KalAuth41.defaultBase
            let p: KalPending41 = KalAuth41.begin(base: base)
            if let u = KalAuth41.webURL(p, base: base) { _ = await UIApplication.shared.open(u) }
            try? await Task.sleep(nanoseconds: 180_000_000_000)
            if self.phase == "wait" && self.waitId == id && self.step < 2 {
                self.fail("Fikk ikke svar fra godkjenningen. Prøv igjen.", server: false)
            }
        }
    }

    /// kalender://auth?code=…&state=…  ·  kalender://auth?error=denied&state=…
    func handleRedirect(_ url: URL) {
        let items: [URLQueryItem] = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func q(_ k: String) -> String? {
            let v: String? = items.first(where: { (i: URLQueryItem) -> Bool in i.name == k })?.value
            return (v ?? "").isEmpty ? nil : v
        }
        waitId += 1
        if let err = q("error") {
            KalAuth41.clearPending()
            let denied: Bool = err.contains("denied") || err.contains("avvist") || err.contains("cancel")
            fail(denied ? "Innloggingen ble avvist i Homelab." : "Homelab: " + err, server: false)
            return
        }
        guard let code = q("code"), let state = q("state") else { return }
        if code == lastCode44 { return }
        lastCode44 = code
        KalLog44.send("auth.handoff.return", [:])
        phase = "wait"
        step = 2
        error = ""
        Task { @MainActor in
            do {
                let s: KalSession41 = try await KalAuth41.exchange(code: code, state: state, server: q("server") ?? q("base"))
                self.step = 3
                finish(s, via: "homelab")
            } catch let e as KalAuth41Error {
                fail(KalAuth41.message(e), server: e.status == 0)
            } catch {
                fail(error.localizedDescription, server: false)
            }
        }
    }

    func cancel() {
        KalHaptic.tap()
        waitId += 1
        KalAuth41.clearPending()
        phase = "start"
    }

    /* ---------- Brukernavn og passord ---------- */

    func password() {
        KalHaptic.tap()
        error = ""
        phase = "pw"
    }

    func submitPassword() {
        let u: String = user.trimmingCharacters(in: .whitespaces)
        if u.isEmpty || pass.isEmpty {
            error = "Skriv inn brukernavn og passord."
            return
        }
        busy = true
        error = ""
        offerServer = false
        let p: String = pass
        let c: String = code
        Task { @MainActor in
            guard let base = await KalAuth41.firstReachable(KalAuth41.candidates()) else {
                busy = false
                error = "Får ikke kontakt med Homelab."
                offerServer = true
                return
            }
            do {
                let r: KalAuth.Result = try await KalAuth.login(base: base, username: u, password: p, code: c)
                UserDefaults.standard.set(u, forKey: "kal41.lastUser")
                UserDefaults.standard.set(base, forKey: "kal.lastServer")
                busy = false
                pass = ""
                code = ""
                finish(KalSession41(token: r.token, refresh: "", user: r.user, base: base), via: "login")
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

    /* ---------- Serveradresse (bare ved feil) ---------- */

    func saveServer() {
        let s: String = KalAuth.normalize(serverText)
        if !s.isEmpty && !(s.hasPrefix("http://") || s.hasPrefix("https://")) { return }
        UserDefaults.standard.set(s, forKey: "kal41.manual")
        serverOpen = false
        offerServer = false
        error = ""
    }

    /* ---------- Ferdig ---------- */

    private func finish(_ s: KalSession41, via: String) {
        if !s.refresh.isEmpty { KalKeychain41.write("refresh", Data(s.refresh.utf8)) }
        var bases: [String] = [s.base]
        for b in KalAuth41.candidates() where b != s.base && !bases.contains(b) && bases.count < 3 { bases.append(b) }
        let store: KalStore = KalStore.shared
        if via == "login" {
            store.didLogin(bases: bases, token: s.token, user: s.user)
        } else {
            KalGroup.saveSession(bases: bases, token: s.token, user: s.user, via: via)
            UserDefaults.standard.set(false, forKey: "kal.noAuto")
            store.loggedIn = true
            store.userName = s.user
            Task { await store.load(force: true) }
        }
        done(name: s.user)
        Task { await KalLogin41Model.syncServers() }
    }

    private func done(name: String) {
        KalLog44.send("auth.handoff.ok", [:])
        KalHaptic.done()
        phase = "start"
        step = 0
        error = ""
        let n: String = name.isEmpty ? "Homelab-kontoen" : name
        KalStore.shared.showToast("✓ Logget inn som " + n, undo: "")
    }

    private func fail(_ msg: String, server: Bool) {
        error = msg
        offerServer = server
        phase = "err"
        KalLog44.send("auth.handoff.fail", ["reason": msg])
    }

    /// Prompt 44: tilbake i Kalender (aktiv) mens den venter på Homelab: kommer det ikke svar innen 20 s, vis
    /// «Fikk ikke svar fra Homelab» med Prøv igjen og Logg inn med passord (i stedet for å vente i det uendelige).
    func returned44() {
        guard phase == "wait", step < 2 else { return }
        returnId44 += 1
        let id: Int = returnId44
        let w: Int = waitId
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 20_000_000_000)
            if self.returnId44 == id && self.waitId == w && self.phase == "wait" && self.step < 2 {
                self.fail("Fikk ikke svar fra Homelab. Prøv igjen, eller logg inn med passord.", server: false)
            }
        }
    }

    /// Lokal og ekstern adresse fra serveren; rekkefølgen velges automatisk (lokal når den svarer < 300 ms).
    static func syncServers() async {
        let ok: Bool = await KalServer41.refresh()
        if !ok { return }
        let ordered: [String] = await KalServer41.choose()
        guard let tok = KalGroup.token, !ordered.isEmpty else { return }
        var bases: [String] = ordered
        for b in KalGroup.bases where !bases.contains(b) { bases.append(b) }
        KalGroup.saveSession(bases: bases, token: tok, user: KalGroup.user, via: KalGroup.via)
    }
}

struct KalLogin41View: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLogin41Model { KalLogin41Model.shared }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Spacer(minLength: 40)
                KalAppIconView(size: 84)
                VStack(spacing: 6) {
                    Text(title).font(KalFont.serif(30)).foregroundStyle(t.ink).multilineTextAlignment(.center)
                    if !subtitle.isEmpty {
                        Text(subtitle).font(KalFont.ui(14.5)).foregroundStyle(t.mut).multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: 320)
                content.frame(maxWidth: 340)
                Spacer(minLength: 40)
            }
            .padding(.horizontal, 28)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(t.bg.ignoresSafeArea())
        .sheet(isPresented: Binding(get: { m.serverOpen }, set: { (v: Bool) in if m.serverOpen != v { m.serverOpen = v } })) {
            KalServer41Sheet().environment(\.kal, t)
        }
    }

    private var title: String {
        if m.phase == "wait" { return "Godkjenn i Homelab" }
        if m.phase == "err" { return "Fikk ikke logget inn" }
        if m.phase == "qr" { return "Logg inn med QR-kode" }
        return "Velkommen til Kalender"
    }

    private var subtitle: String {
        if m.phase == "wait" { return "Homelab åpnes og spør om Kalender får logge inn. Du kommer tilbake hit av deg selv." }
        if m.phase == "err" || m.phase == "qr" { return "" }
        return "Bruk samme konto som i Homelab. Kalendere, bursdager og frister synkes med en gang."
    }

    @ViewBuilder private var content: some View {
        switch m.phase {
        case "wait": KalLogin41Wait()
        case "err": KalLogin41Err()
        case "pw": KalLogin41Pw()
        // Prompt 46: QR-koden (skannes med Papir Finans eller en innlogget Kalender på mobilen).
        case "qr": KalLoginQR46()
        default: KalLogin41Start()
        }
    }
}

struct KalLogin41Start: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLogin41Model { KalLogin41Model.shared }

    var body: some View {
        VStack(spacing: 10) {
            if let n = m.quickName { quickButton(n) }
            Button(action: { m.viaApp() }) {
                Text("Logg inn med Homelab-appen").font(KalFont.ui(14.5, .bold)).foregroundStyle(t.ink)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(Capsule().fill(t.card))
                    .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            KalLoginQRButton46()
            Button(action: { m.password() }) {
                Text("Bruk brukernavn og passord").font(KalFont.ui(13.5, .bold)).foregroundStyle(t.mut)
                    .frame(maxWidth: .infinity).frame(height: 44)
            }
            .buttonStyle(.plain)
        }
    }

    private func quickButton(_ name: String) -> some View {
        let initial: String = String(name.prefix(1)).uppercased()
        return Button(action: { m.quick() }) {
            HStack(spacing: 12) {
                Text(initial).font(KalFont.ui(15, .heavy)).foregroundStyle(Color.white)
                    .frame(width: 42, height: 42)
                    .background(Circle().fill(t.red))
                VStack(alignment: .leading, spacing: 1) {
                    Text("Fortsett som " + name).font(KalFont.ui(15.5, .bold)).lineLimit(1)
                    Text("Innlogget i Homelab på denne enheten").font(KalFont.ui(12.5)).opacity(0.75).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text("›").font(KalFont.ui(18, .bold))
            }
            .foregroundStyle(t.bg)
            .padding(.leading, 10).padding(.trailing, 16)
            .frame(height: 62)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(t.ink))
            .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Fortsett som " + name)
    }
}

struct KalLogin41Wait: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLogin41Model { KalLogin41Model.shared }
    private let steps: [String] = ["Åpner Homelab", "Godkjenn i Homelab (Face ID)", "Sender deg tilbake til Kalender", "Henter kalenderne dine"]

    var body: some View {
        VStack(spacing: 14) {
            ProgressView().controlSize(.large).tint(t.red)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(0..<steps.count, id: \.self) { (i: Int) in
                    HStack(spacing: 10) {
                        Text(i < m.step ? "✓" : (i == m.step ? "•" : "·")).font(KalFont.ui(13.5, .bold)).frame(width: 16)
                        Text(steps[i]).font(KalFont.ui(13.5, i == m.step ? .bold : .medium))
                    }
                    .foregroundStyle(i <= m.step ? t.ink : t.mut)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
            HStack(spacing: 8) {
                Button(action: { m.viaApp() }) {
                    Text("Åpne Homelab igjen").font(KalFont.ui(13.5, .bold)).foregroundStyle(t.ink)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                Button(action: { m.cancel() }) {
                    Text("Avbryt").font(KalFont.ui(13.5, .bold)).foregroundStyle(t.mut)
                        .frame(maxWidth: .infinity).frame(height: 44)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct KalLogin41Err: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLogin41Model { KalLogin41Model.shared }

    var body: some View {
        VStack(spacing: 10) {
            Text(m.error.isEmpty ? "Homelab svarte ikke. Sjekk at Homelab-appen er installert og innlogget, og prøv igjen." : m.error)
                .font(KalFont.ui(13.5)).foregroundStyle(t.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 14).padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(t.red, lineWidth: 1.5))
            Button(action: { m.viaApp() }) {
                Text("Prøv igjen").font(KalFont.ui(14.5, .bold)).foregroundStyle(t.bg)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(Capsule().fill(t.ink))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            if m.webOffer {
                Button(action: { m.approveInBrowser() }) {
                    Text("Godkjenn i nettleseren").font(KalFont.ui(13.5, .bold)).foregroundStyle(t.ink)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .overlay(Capsule().strokeBorder(t.line, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            Button(action: { m.password() }) {
                Text("Bruk brukernavn og passord").font(KalFont.ui(13.5, .bold)).foregroundStyle(t.mut)
                    .frame(maxWidth: .infinity).frame(height: 44)
            }
            .buttonStyle(.plain)
            if m.offerServer { KalServer41Link() }
        }
    }
}

struct KalLogin41Pw: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLogin41Model { KalLogin41Model.shared }

    var body: some View {
        VStack(spacing: 10) {
            KalLogin41Field(title: "Brukernavn", text: Binding(get: { m.user }, set: { (v: String) in m.user = v }), secure: false, keyboard: .default)
            KalLogin41Field(title: "Passord", text: Binding(get: { m.pass }, set: { (v: String) in m.pass = v }), secure: true, keyboard: .default)
            if m.needsCode {
                KalLogin41Field(title: "Kode (6 sifre)", text: Binding(get: { m.code }, set: { (v: String) in m.code = v }), secure: false, keyboard: .numberPad)
            }
            if !m.error.isEmpty {
                Text(m.error).font(KalFont.ui(13)).foregroundStyle(t.acc)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button(action: { m.submitPassword() }) {
                HStack(spacing: 8) {
                    if m.busy { ProgressView().tint(t.bg) }
                    Text(m.busy ? "Logger inn …" : "Logg inn").font(KalFont.ui(14.5, .bold))
                }
                .foregroundStyle(t.bg)
                .frame(maxWidth: .infinity).frame(height: 52)
                .background(Capsule().fill(t.ink))
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(m.busy)
            if m.offerServer { KalServer41Link() }
            Button(action: {
                KalHaptic.tap()
                m.error = ""
                m.phase = "start"
            }) {
                Text("‹ Tilbake").font(KalFont.ui(13, .bold)).foregroundStyle(t.mut).frame(height: 40)
            }
            .buttonStyle(.plain)
        }
    }
}

struct KalLogin41Field: View {
    @Environment(\.kal) private var t
    let title: String
    @Binding var text: String
    let secure: Bool
    let keyboard: UIKeyboardType

    var body: some View {
        Group {
            if secure {
                SecureField(title, text: $text).textContentType(.password)
            } else {
                TextField(title, text: $text)
                    .keyboardType(keyboard)
                    .textContentType(keyboard == .numberPad ? UITextContentType.oneTimeCode : UITextContentType.username)
            }
        }
        .font(KalFont.ui(15, .medium)).foregroundStyle(t.ink)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled(true)
        .padding(.horizontal, 16).frame(height: 50)
        .background(RoundedRectangle(cornerRadius: 16).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(t.line, lineWidth: 1))
    }
}

/// «Endre serveradresse» – vises bare når ingen adresse svarer.
struct KalServer41Link: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLogin41Model { KalLogin41Model.shared }

    var body: some View {
        Button(action: {
            KalHaptic.tap()
            m.serverOpen = true
        }) {
            Text("Endre serveradresse").font(KalFont.ui(13, .semibold)).foregroundStyle(t.acc).frame(height: 36)
        }
        .buttonStyle(.plain)
    }
}

struct KalServer41Sheet: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLogin41Model { KalLogin41Model.shared }
    @State private var testText: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Serveradresse").font(KalFont.serif(24)).foregroundStyle(t.ink)
            Text("Vanligvis hentes adressen fra Homelab. Skriv inn adressen hvis Kalender ikke finner serveren.")
                .font(KalFont.ui(13)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            TextField("https://home.kristo.no", text: Binding(get: { m.serverText }, set: { (v: String) in m.serverText = v }))
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .font(KalFont.ui(15, .medium)).foregroundStyle(t.ink)
                .padding(.horizontal, 14).frame(height: 48)
                .background(RoundedRectangle(cornerRadius: 14).fill(t.card))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(t.line, lineWidth: 1))
            if !testText.isEmpty {
                Text(testText).font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                KalPill(title: "Test", filled: false) { test() }
                KalPill(title: "Lagre") { m.saveServer() }
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .background(t.bg.ignoresSafeArea())
        .presentationDetents([.medium])
    }

    private func test() {
        let s: String = KalAuth.normalize(m.serverText)
        if !(s.hasPrefix("http://") || s.hasPrefix("https://")) {
            testText = "Adressen må starte med http:// eller https://"
            return
        }
        testText = "Tester …"
        Task { @MainActor in
            let t0: Date = Date()
            let ok: Bool = await KalAuth41.reachable(s, timeout: 6)
            let ms: Int = Int(Date().timeIntervalSince(t0) * 1000)
            testText = ok ? "✓ Homelab svarer på " + s + " · " + String(ms) + " ms" : "Fikk ikke kontakt med " + s
        }
    }
}
