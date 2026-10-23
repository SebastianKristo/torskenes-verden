import SwiftUI
import UIKit
import LocalAuthentication

/* ---------------- Prompt 38: «Logg inn på ny enhet» – mobilen godkjenner en QR-innlogging ----------------
   prompts/prompt-38-pakke/claude-code-qr-innlogging.md, fasit design/Logg inn QR.dc.html (mobilen til høyre).
   Flyt: Konto → «Logg inn på ny enhet» (eller systemkameraet: homelab://login?c=<sid>.<nonce> / https://<host>/l/<sid>.<nonce>)
   → skanneren (AVFoundation) → POST /api/auth/qr/scan {code} → arket «Logge inn på ny enhet?» med enhet, sted/IP, konto og
   2-sifret matchkode → «Godkjenn med Face ID» (LocalAuthentication) → POST /api/auth/qr/approve {sid, approve:true, biometric:true}.
   Svarer serveren needs2fa, viser mobilen «Godkjent · skriv koden på den nye enheten». QR-en inneholder aldri en token: appen sender
   bare koden (sid + engangs-nonce) til sin egen server, som sjekker levetid, engangsbruk og binding til nettleseren.
   Serveren mangler endepunktene (404): «Serveren støtter ikke QR-innlogging ennå. Oppdater Homelab.» */

struct Qr38Device: Equatable {
    var name: String = ""
    var os: String = ""
    var browser: String = ""
    var ip: String = ""
    var place: String = ""

    /// «MacBook · Safari»
    var title: String {
        let a: [String] = [name.isEmpty ? os : name, browser].filter { (s: String) -> Bool in !s.isEmpty }
        return a.isEmpty ? "Ukjent enhet" : a.joined(separator: " · ")
    }

    /// «Oslo · 84.211.x.x»
    var where38: String {
        let a: [String] = [place, ip].filter { (s: String) -> Bool in !s.isEmpty }
        return a.isEmpty ? "Ukjent" : a.joined(separator: " · ")
    }
}

@MainActor
@Observable
final class Qr38Model {
    static let shared = Qr38Model()

    /// Fullskjermen (skanner → ark → ferdig) er åpen.
    var open: Bool = false
    /// scan | busy | ask | approving | wait2fa | done | denied | error
    var phase: String = "scan"
    var sid: String = ""
    var device: Qr38Device = Qr38Device()
    var account: String = ""
    var match: String = ""
    var error: String = ""
    /// «Lim inn kode» (uten kamera, eller når kameraet er avslått).
    var pasteOpen: Bool = false
    var pasteText: String = ""

    /// Kode fra en dyplenke mens appen ikke var innlogget/klar.
    @ObservationIgnored var pendingCode: String? = nil
    @ObservationIgnored private var lastCode: String = ""
    @ObservationIgnored private var lastAt: Date = .distantPast

    /* ---------- Åpne og lukke ---------- */

    func show() {
        Haptics.shared.select()
        reset()
        open = true
    }

    func close() {
        open = false
        pasteOpen = false
        reset()
    }

    func reset() {
        phase = "scan"
        sid = ""
        device = Qr38Device()
        account = ""
        match = ""
        error = ""
        pasteText = ""
    }

    /* ---------- Dyplenker ---------- */

    /// homelab://login?c=… og https://<host>/l/<kode>. true = lenken var en QR-innlogging (håndtert her).
    func handle(_ url: URL, _ store: Store) -> Bool {
        guard let code = Qr38Model.code(fromURL: url) else { return false }
        if let other = Qr38Model.otherServer(url, store) {
            store.flash("QR-koden hører til " + other + ", ikke serveren du er logget inn på")
            return true
        }
        if !store.loggedIn {
            pendingCode = code
            store.flash("Logg inn på mobilen først, så kan du godkjenne den nye enheten")
            return true
        }
        reset()
        open = true
        submit(code, store)
        return true
    }

    /// Kalles når appen er innlogget (etter en dyplenke som kom for tidlig).
    func takePending(_ store: Store) {
        guard store.loggedIn, let c = pendingCode else { return }
        pendingCode = nil
        reset()
        open = true
        submit(c, store)
    }

    /// Plukker koden ut av en URL: homelab://login?c=<sid>.<nonce> eller https://<host>/l/<sid>.<nonce>.
    static func code(fromURL url: URL) -> String? {
        let scheme: String = (url.scheme ?? "").lowercased()
        // Prompt 46: papir://login?s=<sessionId>&c=<engangskode>&srv=<offentlig server> (Kalender/Finans viser denne QR-en).
        // Koden sendes til vår egen server som «s.c»; srv brukes bare til å sjekke at QR-en hører til samme server.
        if scheme == "papir" {
            let host: String = (url.host ?? "").lowercased()
            let first: String = url.pathComponents.dropFirst().first?.lowercased() ?? ""
            guard host == "login" || first == "login" else { return nil }
            let items: [URLQueryItem] = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            func q(_ k: String) -> String { items.first(where: { (i: URLQueryItem) -> Bool in i.name == k })?.value ?? "" }
            let c: String = q("s") + "." + q("c")
            return Qr38Model.valid(c) && !q("s").isEmpty && !q("c").isEmpty ? c : nil
        }
        if scheme == "homelab" || scheme == "finanshub" {
            let host: String = (url.host ?? "").lowercased()
            let first: String = url.pathComponents.dropFirst().first?.lowercased() ?? ""
            guard host == "login" || first == "login" else { return nil }
            let items: [URLQueryItem] = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let c: String = items.first(where: { (q: URLQueryItem) -> Bool in q.name == "c" || q.name == "code" })?.value ?? ""
            return Qr38Model.valid(c) ? c : nil
        }
        if scheme == "https" || scheme == "http" {
            let parts: [String] = url.pathComponents.filter { (s: String) -> Bool in s != "/" }
            guard parts.count >= 2, parts[parts.count - 2] == "l" else { return nil }
            let c: String = parts[parts.count - 1]
            return Qr38Model.valid(c) ? c : nil
        }
        return nil
    }

    /// Tekst fra kameraet eller utklippstavlen: en av lenkene over, eller selve koden.
    static func code(fromText raw: String) -> String? {
        let s: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return nil }
        if s.contains("://"), let u = URL(string: s) { return code(fromURL: u) }
        return valid(s) ? s : nil
    }

    /// <sid>.<nonce> – bare bokstaver, tall, - og _ (aldri en token).
    static func valid(_ c: String) -> Bool {
        if c.count < 8 || c.count > 200 { return false }
        let ok: CharacterSet = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
        if c.unicodeScalars.contains(where: { (u: Unicode.Scalar) -> Bool in !ok.contains(u) }) { return false }
        return c.contains(".")
    }

    /* ---------- Skann ---------- */

    /// Kameraet fant en QR-kode.
    func scanned(_ raw: String, _ store: Store) {
        guard phase == "scan" || phase == "error" else { return }
        guard let c = Qr38Model.code(fromText: raw) else {
            // Samme ugyldige kode leses mange ganger i sekundet: meld bare én gang.
            if raw != lastCode || Date().timeIntervalSince(lastAt) > 3 {
                lastCode = raw
                lastAt = Date()
                Haptics.shared.error()
                error = "Dette er ikke en innloggingskode fra Homelab."
            }
            return
        }
        if let u = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)), let other = Qr38Model.otherServer(u, store) {
            Haptics.shared.error()
            error = "QR-koden hører til " + other + ", ikke serveren du er logget inn på."
            return
        }
        Haptics.shared.tap()
        submit(c, store)
    }

    /// Prompt 46: srv i papir://login peker på en annen server enn kontoen (lokal, ekstern eller lagret adresse) → vertsnavnet.
    static func otherServer(_ url: URL, _ store: Store) -> String? {
        guard (url.scheme ?? "").lowercased() == "papir" else { return nil }
        let items: [URLQueryItem] = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let srv: String = items.first(where: { (i: URLQueryItem) -> Bool in i.name == "srv" })?.value ?? ""
        guard !srv.isEmpty, let h = URL(string: API.normalize(srv))?.host?.lowercased() else { return nil }
        let a: LoginAccount? = store.account
        let mine: [String] = [a?.server ?? "", a?.local ?? "", a?.external ?? "", store.base].compactMap { (s: String) -> String? in
            s.isEmpty ? nil : URL(string: API.normalize(s))?.host?.lowercased()
        }
        return mine.isEmpty || mine.contains(h) ? nil : h
    }

    func submitPaste(_ store: Store) {
        guard let c = Qr38Model.code(fromText: pasteText) else {
            Haptics.shared.error()
            error = "Fant ingen gyldig kode. Kopier lenken under QR-koden og prøv igjen."
            return
        }
        pasteOpen = false
        submit(c, store)
    }

    func submit(_ code: String, _ store: Store) {
        phase = "busy"
        error = ""
        Task { @MainActor in
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/auth/qr/scan", json: ["code": code], timeout: 15)
                let o: [String: Any] = JS.obj(d)
                self.sid = JS.str(o, "sid") ?? String(code.split(separator: ".").first ?? "")
                let dv: [String: Any] = JS.dict(o, "device") ?? [:]
                self.device = Qr38Device(name: JS.str(dv, "name") ?? "", os: JS.str(dv, "os") ?? "", browser: JS.str(dv, "browser") ?? "",
                                         ip: JS.str(dv, "ip") ?? "", place: JS.str(dv, "place") ?? "")
                let acc: [String: Any]? = JS.dict(o, "account")
                self.account = JS.str(acc, "name") ?? JS.str(acc, "username") ?? JS.str(o, "account") ?? store.displayName
                self.match = JS.str(o, "match") ?? ""
                Haptics.shared.success()
                withAnimation(.easeOut(duration: 0.25)) { self.phase = "ask" }
            } catch let e as APIError {
                self.fail(Qr38Model.message(e))
            } catch {
                self.fail(error.localizedDescription)
            }
        }
    }

    static func message(_ e: APIError) -> String {
        switch e.status {
        case 404: return e.message.lowercased().contains("utløpt") || e.message.lowercased().contains("finnes ikke")
            ? e.message : "Serveren støtter ikke QR-innlogging ennå. Oppdater Homelab."
        case 410: return "Koden er utløpt. Den nye enheten viser en ny kode – skann den."
        case 409: return "Koden er allerede brukt. Skann den nye koden på skjermen."
        case 429: return "For mange forsøk. Vent litt og prøv igjen."
        case 401: return "Mobilen er ikke innlogget. Logg inn på nytt først."
        default: return e.message
        }
    }

    private func fail(_ msg: String) {
        Haptics.shared.error()
        error = msg
        phase = "error"
    }

    /* ---------- Godkjenn / avvis ---------- */

    func approve(_ store: Store) {
        guard phase == "ask" else { return }
        let ctx: LAContext = LAContext()
        var err: NSError?
        let bio: Bool = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
        let policy: LAPolicy = bio ? .deviceOwnerAuthenticationWithBiometrics : .deviceOwnerAuthentication
        var err2: NSError?
        guard ctx.canEvaluatePolicy(policy, error: &err2) else {
            fail("Slå på Face ID eller kode på mobilen for å godkjenne innlogginger.")
            return
        }
        ctx.localizedFallbackTitle = "Bruk kode"
        let who: String = device.title
        ctx.evaluatePolicy(policy, localizedReason: "Godkjenn innlogging på " + who) { (ok: Bool, _: Error?) in
            Task { @MainActor in
                if ok { Qr38Model.shared.send(true, store) } else { Haptics.shared.error() }
            }
        }
    }

    func deny(_ store: Store) {
        guard phase == "ask" else { return }
        Haptics.shared.tap()
        send(false, store)
    }

    fileprivate func send(_ yes: Bool, _ store: Store) {
        phase = "approving"
        let s: String = sid
        var body: [String: Any] = ["sid": s, "approve": yes, "biometric": yes]
        // Serveren sjekker matchkoden igjen (samme tall som på den nye skjermen).
        if yes && !match.isEmpty { body["match"] = match }
        let payload: [String: Any] = body
        Task { @MainActor in
            do {
                let d: Data = try await store.api.callAt("/api", "POST", "/auth/qr/approve", json: payload, timeout: 15)
                let o: [String: Any] = JS.obj(d)
                if !yes {
                    withAnimation(.easeOut(duration: 0.25)) { self.phase = "denied" }
                    return
                }
                Haptics.shared.success()
                let two: Bool = JS.bool(o, "needs2fa") ?? JS.bool(o, "needsTotp") ?? false
                withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) { self.phase = two ? "wait2fa" : "done" }
            } catch let e as APIError {
                self.fail(Qr38Model.message(e))
            } catch {
                self.fail(error.localizedDescription)
            }
        }
    }
}

extension View {
    /// Prompt 38: fullskjermen for «Logg inn på ny enhet» (QrLogin38Views.swift). Legges på roten i App.swift.
    func qr38Host() -> some View { modifier(Qr38Host()) }
}
